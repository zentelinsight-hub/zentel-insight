import { createClient } from "@supabase/supabase-js";

export const EXPECTED_SUPABASE_URL = "https://auzbmfwdxprtvjsvcxcj.supabase.co";

const authOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
};

function readEnvValue(env, key) {
  return typeof env?.[key] === "string" ? env[key] : "";
}

function hasWrappingQuotes(value) {
  return /^["'].*["']$/.test(value);
}

export function getSupabaseConfigDiagnostics(env = import.meta.env) {
  const rawUrl = readEnvValue(env, "VITE_SUPABASE_URL");
  const rawPublishableKey = readEnvValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
  const url = rawUrl.trim();
  const publishableKey = rawPublishableKey.trim();
  const issues = [];

  if (!url) issues.push("VITE_SUPABASE_URL is missing.");
  if (!publishableKey) issues.push("VITE_SUPABASE_PUBLISHABLE_KEY is missing.");
  if (rawUrl && rawUrl !== url) issues.push("VITE_SUPABASE_URL has leading or trailing whitespace.");
  if (rawPublishableKey && rawPublishableKey !== publishableKey) {
    issues.push("VITE_SUPABASE_PUBLISHABLE_KEY has leading or trailing whitespace.");
  }
  if (hasWrappingQuotes(url)) issues.push("VITE_SUPABASE_URL includes wrapping quotes.");
  if (hasWrappingQuotes(publishableKey)) issues.push("VITE_SUPABASE_PUBLISHABLE_KEY includes wrapping quotes.");
  if (url && !url.startsWith("https://")) issues.push("VITE_SUPABASE_URL must use https://.");

  try {
    if (url) new URL(url);
  } catch {
    issues.push("VITE_SUPABASE_URL is not a valid URL.");
  }

  if (url && url !== EXPECTED_SUPABASE_URL) {
    issues.push("VITE_SUPABASE_URL does not match the intended Supabase project.");
  }

  if (readEnvValue(env, "VITE_SUPABASE_ANON_KEY")) {
    issues.push("VITE_SUPABASE_ANON_KEY is no longer used by the browser client.");
  }

  return {
    ready: issues.length === 0,
    url,
    publishableKey,
    expectedUrl: EXPECTED_SUPABASE_URL,
    urlConfigured: Boolean(url),
    publishableKeyConfigured: Boolean(publishableKey),
    urlUsesHttps: url.startsWith("https://"),
    urlMatchesExpected: url === EXPECTED_SUPABASE_URL,
    legacyAnonKeyPresent: Boolean(readEnvValue(env, "VITE_SUPABASE_ANON_KEY")),
    issues
  };
}

const configDiagnostics = getSupabaseConfigDiagnostics();

export const supabase = configDiagnostics.ready
  ? createClient(configDiagnostics.url, configDiagnostics.publishableKey, authOptions)
  : null;

export function hasSupabaseConfig() {
  return Boolean(supabase);
}

export async function getSupabaseClient() {
  return supabase;
}

export function getSupabaseSafeStatus(env = import.meta.env) {
  const diagnostics = getSupabaseConfigDiagnostics(env);
  return {
    ready: diagnostics.ready,
    urlConfigured: diagnostics.urlConfigured,
    publishableKeyConfigured: diagnostics.publishableKeyConfigured,
    urlUsesHttps: diagnostics.urlUsesHttps,
    urlMatchesExpected: diagnostics.urlMatchesExpected,
    legacyAnonKeyPresent: diagnostics.legacyAnonKeyPresent,
    issues: diagnostics.issues
  };
}

export async function checkSupabaseAuthReachability(fetchImpl = fetch) {
  const diagnostics = getSupabaseConfigDiagnostics();
  if (!diagnostics.ready) {
    return {
      ok: false,
      status: null,
      url: "",
      errorType: "configuration",
      message: "Supabase configuration is incomplete."
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  const url = `${diagnostics.url}/auth/v1/settings`;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        apikey: diagnostics.publishableKey
      },
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      url,
      errorType: response.ok ? "" : "http",
      message: response.ok ? "Supabase Auth is reachable." : "Supabase Auth returned a non-success response."
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      errorType: error.name === "AbortError" ? "timeout" : "network",
      message:
        error.name === "AbortError"
          ? "Supabase Auth reachability check timed out."
          : "Supabase Auth could not be reached from this browser."
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
