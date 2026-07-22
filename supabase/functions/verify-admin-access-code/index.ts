import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  getAuthenticatedUser,
  getJwtExpiry,
  getUserAccountStatus,
  getUserRole,
  hashRequestValue,
  sha256Hex,
  timingSafeEqual,
  writeAuditLog
} from "../_shared/security.ts";

const maxFailedAttempts = 5;
const attemptWindowMinutes = 15;

function cleanCode(value: unknown) {
  return String(value || "").trim();
}

function getClientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
}

async function recordAttempt(supabase: any, request: Request, userId: string, sessionId: string, success: boolean) {
  await supabase.from("admin_access_attempts").insert({
    user_id: userId,
    session_id: sessionId || null,
    success,
    ip_hash: await hashRequestValue(getClientIp(request)),
    user_agent_hash: await hashRequestValue(request.headers.get("user-agent") || "")
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);

  try {
    const supabase = createServiceClient();
    const auth = await getAuthenticatedUser(request, supabase);
    if (!auth.user) return jsonResponse({ ok: false, error: auth.error }, 401, request);

    const role = await getUserRole(supabase, auth.user.id);
    if (role !== "admin") {
      await recordAttempt(supabase, request, auth.user.id, auth.sessionId, false);
      return jsonResponse({ ok: false, error: "Admin access is required." }, 403, request);
    }

    const accountStatus = await getUserAccountStatus(supabase, auth.user.id);
    if (accountStatus !== "active") {
      await recordAttempt(supabase, request, auth.user.id, auth.sessionId, false);
      return jsonResponse({ ok: false, error: "Admin account is not active." }, 403, request);
    }

    const since = new Date(Date.now() - attemptWindowMinutes * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("admin_access_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.user.id)
      .eq("success", false)
      .gte("created_at", since);

    if (countError) throw countError;
    if ((count || 0) >= maxFailedAttempts) {
      await writeAuditLog(supabase, {
        actorUserId: auth.user.id,
        action: "admin_access_rate_limited",
        metadata: { windowMinutes: attemptWindowMinutes }
      });
      return jsonResponse({ ok: false, error: "Too many attempts. Please wait before trying again." }, 429, request);
    }

    const body = await request.json().catch(() => ({}));
    const code = cleanCode(body.code);
    const storedHash = String(Deno.env.get("ADMIN_ACCESS_CODE_SHA256") || "").trim().toLowerCase();
    const salt = String(Deno.env.get("ADMIN_ACCESS_CODE_SALT") || "");

    if (!storedHash) {
      return jsonResponse({ ok: false, error: "Admin verification is not configured." }, 503, request);
    }

    const candidateHash = await sha256Hex(salt ? `${salt}:${code}` : code);
    const success = timingSafeEqual(candidateHash, storedHash);
    await recordAttempt(supabase, request, auth.user.id, auth.sessionId, success);

    if (!success) {
      await writeAuditLog(supabase, {
        actorUserId: auth.user.id,
        action: "admin_access_code_rejected"
      });
      return jsonResponse({ ok: false, error: "The access code is incorrect." }, 403, request);
    }

    const jwtExpiry = getJwtExpiry(auth.token);
    const maxExpiry = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const expiresAt = jwtExpiry && jwtExpiry < maxExpiry ? jwtExpiry : maxExpiry;

    const { error } = await supabase.from("admin_session_verifications").upsert({
      user_id: auth.user.id,
      session_id: auth.sessionId,
      verified_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      last_seen_at: new Date().toISOString()
    });

    if (error) throw error;

    await writeAuditLog(supabase, {
      actorUserId: auth.user.id,
      action: "admin_access_code_verified"
    });

    return jsonResponse({ ok: true, expiresAt: expiresAt.toISOString() }, 200, request);
  } catch (error) {
    console.error("verify-admin-access-code", (error as Error).message);
    return jsonResponse({ ok: false, error: "Admin verification could not be completed." }, 400, request);
  }
});
