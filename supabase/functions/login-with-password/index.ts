import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const suspendedMessage =
  "Account access is temporarily restricted. Please contact Zentel Insight Support for assistance. Only an authorised administrator can restore access.";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createPasswordClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) throw new Error("Authentication service configuration is missing.");
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function getProfileByEmail(supabase: any, email: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, account_status, failed_login_attempts")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getRole(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role || "student";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    if (!isEmail(email) || !password) {
      return jsonResponse({ ok: false, code: "invalid_credentials", error: "The email or password is incorrect." }, 400, request);
    }

    const service = createServiceClient();
    const profile = await getProfileByEmail(service, email);
    const profileRole = profile?.id ? await getRole(service, profile.id) : "student";

    if (profileRole === "admin" && profile?.id) {
      const { error: adminStatusError } = await service
        .from("profiles")
        .update({
          account_status: "active",
          failed_login_attempts: 0,
          last_failed_login_at: null,
          suspended_at: null,
          status_reason: null
        })
        .eq("id", profile.id);
      if (adminStatusError) throw adminStatusError;
      profile.account_status = "active";
      profile.failed_login_attempts = 0;
    }

    if (profileRole !== "admin" && profile?.account_status === "suspended") {
      return jsonResponse({ ok: false, code: "account_suspended", error: suspendedMessage }, 423, request);
    }

    const passwordClient = createPasswordClient();
    const { data, error } = await passwordClient.auth.signInWithPassword({ email, password });

    if (error || !data?.session || !data?.user) {
      const message = String(error?.message || "");
      const invalidCredentials = /invalid login credentials|invalid credentials/i.test(message);

      if (invalidCredentials && profile?.id && profileRole !== "admin") {
        const { data: attemptRows, error: attemptError } = await service.rpc("record_failed_login_attempt", {
          target_user_id: profile.id
        });
        if (attemptError) throw attemptError;
        const attempt = Array.isArray(attemptRows) ? attemptRows[0] : attemptRows;
        if (attempt?.account_status === "suspended") {
          return jsonResponse({ ok: false, code: "account_suspended", error: suspendedMessage }, 423, request);
        }
      }

      if (/email not confirmed|not confirmed|not verified/i.test(message)) {
        return jsonResponse({
          ok: false,
          code: "email_unverified",
          error: "Your email address has not been verified. Open your verification email or request a new one."
        }, 400, request);
      }

      if (/rate|too many/i.test(message)) {
        return jsonResponse({ ok: false, code: "rate_limited", error: "Too many attempts. Please wait a moment and try again." }, 429, request);
      }

      return jsonResponse({
        ok: false,
        code: "invalid_credentials",
        error: "The email or password is incorrect."
      }, 400, request);
    }

    let authenticatedProfile = profile?.id === data.user.id ? profile : null;
    if (!authenticatedProfile) {
      const { data: resolvedProfile, error: resolvedProfileError } = await service
        .from("profiles")
        .select("id, account_status")
        .eq("id", data.user.id)
        .maybeSingle();
      if (resolvedProfileError) throw resolvedProfileError;
      authenticatedProfile = resolvedProfile || null;
    }
    const authenticatedRole = await getRole(service, data.user.id);

    if (authenticatedRole !== "admin" && authenticatedProfile?.account_status === "suspended") {
      await passwordClient.auth.signOut();
      return jsonResponse({ ok: false, code: "account_suspended", error: suspendedMessage }, 423, request);
    }

    if (authenticatedRole !== "admin") {
      const { error: clearError } = await service.rpc("clear_failed_login_attempts", { target_user_id: data.user.id });
      if (clearError) throw clearError;
    }

    return jsonResponse({
      ok: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      role: authenticatedRole,
      accountStatus: authenticatedProfile?.account_status || "inactive"
    }, 200, request);
  } catch (error) {
    console.error("login-with-password", (error as Error).message);
    return jsonResponse({
      ok: false,
      code: "login_unavailable",
      error: "Account access is temporarily unavailable. Please try again."
    }, 500, request);
  }
});
