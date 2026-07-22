import { createServiceClient } from "./supabase.ts";

const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function timingSafeEqual(a: string, b: string) {
  const left = textEncoder.encode(a);
  const right = textEncoder.encode(b);
  const max = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < max; index += 1) {
    diff |= (left[index] || 0) ^ (right[index] || 0);
  }

  return diff === 0;
}

export function getBearerToken(request: Request) {
  return (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

export function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1] || "";
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    return JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

export function getSessionId(token: string) {
  const payload = decodeJwtPayload(token);
  return String(payload.session_id || payload.sid || "");
}

export function getJwtExpiry(token: string) {
  const payload = decodeJwtPayload(token);
  const seconds = Number(payload.exp || 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

export async function hashRequestValue(value: string) {
  const salt = Deno.env.get("ADMIN_AUDIT_HASH_SALT") || Deno.env.get("ADMIN_ACCESS_CODE_SALT") || "";
  return sha256Hex(`${salt}:${value || ""}`);
}

export async function getAuthenticatedUser(request: Request, supabase = createServiceClient()) {
  const token = getBearerToken(request);
  if (!token) return { token, user: null, sessionId: "", error: "Authentication is required." };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { token, user: null, sessionId: "", error: "Invalid session." };
  }

  return { token, user: data.user, sessionId: getSessionId(token), error: "" };
}

export async function getUserRole(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role || "student";
}

export async function getUserAccountStatus(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.account_status || "inactive";
}

export async function isVerifiedAdminSession(supabase: any, userId: string, sessionId: string) {
  if (!userId || !sessionId) return false;
  const { data, error } = await supabase
    .from("admin_session_verifications")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function assertVerifiedAdmin(request: Request) {
  const supabase = createServiceClient();
  const auth = await getAuthenticatedUser(request, supabase);
  if (!auth.user) {
    return { ok: false as const, status: 401, error: auth.error, supabase, user: null, sessionId: "" };
  }

  const role = await getUserRole(supabase, auth.user.id);
  if (role !== "admin") {
    return { ok: false as const, status: 403, error: "Admin access is required.", supabase, user: auth.user, sessionId: auth.sessionId };
  }

  const accountStatus = await getUserAccountStatus(supabase, auth.user.id);
  if (accountStatus !== "active") {
    return { ok: false as const, status: 403, error: "Admin account is not active.", supabase, user: auth.user, sessionId: auth.sessionId };
  }

  const verified = await isVerifiedAdminSession(supabase, auth.user.id, auth.sessionId);
  if (!verified) {
    return { ok: false as const, status: 403, error: "Admin security verification is required.", supabase, user: auth.user, sessionId: auth.sessionId };
  }

  return { ok: true as const, supabase, user: auth.user, sessionId: auth.sessionId };
}

export async function writeAuditLog(supabase: any, input: {
  actorUserId?: string | null;
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("audit_logs").insert({
    actor_user_id: input.actorUserId || null,
    action: input.action,
    target_table: input.targetTable || null,
    target_id: input.targetId || null,
    metadata: input.metadata || {}
  });
}
