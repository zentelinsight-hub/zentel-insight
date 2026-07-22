import { getSupabaseClient, getSupabaseConfigDiagnostics } from "./supabaseClient";

const defaultTimeoutMs = 20000;
const defaultUnavailableMessage = "This secure service is temporarily unavailable. Please try again.";
const defaultFailureMessage = "The secure request could not be completed. Please try again.";

export class EdgeFunctionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = details.status || 0;
    this.code = details.code || "";
    this.data = details.data || null;
    this.sessionExpired = Boolean(details.sessionExpired);
    this.unavailable = Boolean(details.unavailable);
  }
}

function getSafeMessage(error, options = {}) {
  const message = String(error?.message || error || "");
  const unavailableMessage = options.unavailableMessage || defaultUnavailableMessage;
  const failureMessage = options.failureMessage || defaultFailureMessage;

  if (/abort|timeout|timed out/i.test(message)) {
    return options.timeoutMessage || "The secure request timed out. Please try again.";
  }
  if (/failed to fetch|networkerror|load failed|functionsfetcherror|can't connect/i.test(message)) {
    return unavailableMessage;
  }
  if (/functionshttperror|edge function returned/i.test(message)) {
    return failureMessage;
  }
  return message || failureMessage;
}

function logDevelopmentDetails(functionName, details) {
  if (!import.meta.env.DEV) return;
  console.info("Edge Function request failed", {
    functionName,
    status: details.status || null,
    code: details.code || "",
    errorType: details.errorType || "",
    hasJsonBody: Boolean(details.hasJsonBody)
  });
}

async function getAccessToken(supabase, requireSession) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new EdgeFunctionError("Your session could not be confirmed. Please log in again.", { sessionExpired: true });
  const token = data?.session?.access_token || "";
  if (requireSession && !token) {
    throw new EdgeFunctionError("Your session has expired. Please log in again.", { status: 401, sessionExpired: true });
  }
  return token;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function invokeEdgeFunction(functionName, {
  body = {},
  requireSession = true,
  timeoutMs = defaultTimeoutMs,
  unavailableMessage = defaultUnavailableMessage,
  failureMessage = defaultFailureMessage,
  timeoutMessage
} = {}) {
  const diagnostics = getSupabaseConfigDiagnostics();
  if (!diagnostics.ready) {
    throw new EdgeFunctionError(unavailableMessage, { unavailable: true, code: "configuration" });
  }

  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new EdgeFunctionError(unavailableMessage, { unavailable: true, code: "configuration" });
  }

  const token = await getAccessToken(supabase, requireSession);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const url = `${diagnostics.url.replace(/\/+$/, "")}/functions/v1/${functionName}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: diagnostics.publishableKey,
        Authorization: token ? `Bearer ${token}` : `Bearer ${diagnostics.publishableKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      const sessionExpired = response.status === 401;
      const message = sessionExpired
        ? "Your session has expired. Please log in again."
        : data?.error || data?.message || failureMessage;
      logDevelopmentDetails(functionName, {
        status: response.status,
        code: data?.code || "",
        hasJsonBody: Boolean(data)
      });
      throw new EdgeFunctionError(message, {
        status: response.status,
        code: data?.code || "",
        data,
        sessionExpired
      });
    }

    if (!data) {
      throw new EdgeFunctionError(failureMessage, { status: response.status, code: "invalid_json" });
    }

    return data;
  } catch (error) {
    if (error instanceof EdgeFunctionError) throw error;
    const safeMessage = getSafeMessage(error, { unavailableMessage, failureMessage, timeoutMessage });
    logDevelopmentDetails(functionName, {
      status: 0,
      code: "",
      errorType: error?.name || "network",
      hasJsonBody: false
    });
    throw new EdgeFunctionError(safeMessage, {
      unavailable: /temporarily unavailable|connect|network|fetch/i.test(safeMessage),
      code: error?.name || "network"
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}
