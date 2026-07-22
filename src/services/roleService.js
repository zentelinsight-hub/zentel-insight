import { getSupabaseClient } from "./supabaseClient";
import { EdgeFunctionError, invokeEdgeFunction } from "./edgeFunctionClient";

export const USER_ROLES = {
  ADMIN: "admin",
  TUTOR: "tutor",
  STUDENT: "student"
};

export const ACCOUNT_STATUSES = {
  ACTIVE: "active",
  INACTIVE: "inactive"
};

export function normalizeRole(role) {
  return [USER_ROLES.ADMIN, USER_ROLES.TUTOR, USER_ROLES.STUDENT].includes(role) ? role : USER_ROLES.STUDENT;
}

export function normalizeAccountStatus(status) {
  return status === ACCOUNT_STATUSES.ACTIVE ? ACCOUNT_STATUSES.ACTIVE : ACCOUNT_STATUSES.INACTIVE;
}

export function getHomePathForRole(role, adminVerified = false) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === USER_ROLES.ADMIN) return adminVerified ? "/admin" : "/admin/verify";
  if (normalizedRole === USER_ROLES.TUTOR) return "/tutor";
  return "/portal";
}

export async function getCurrentUserRole(userId) {
  if (!userId) return USER_ROLES.STUDENT;
  const supabase = await getSupabaseClient();
  if (!supabase) return USER_ROLES.STUDENT;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) console.info("Role lookup failed", error);
    return USER_ROLES.STUDENT;
  }

  return normalizeRole(data?.role);
}

export async function getCurrentUserAccountStatus(userId) {
  if (!userId) return ACCOUNT_STATUSES.INACTIVE;
  const supabase = await getSupabaseClient();
  if (!supabase) return ACCOUNT_STATUSES.INACTIVE;

  const { data, error } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) console.info("Account status lookup failed", error);
    return ACCOUNT_STATUSES.INACTIVE;
  }

  return normalizeAccountStatus(data?.account_status);
}

export async function getAdminVerificationStatus(userId) {
  if (!userId) return false;
  const supabase = await getSupabaseClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("admin_session_verifications")
    .select("expires_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    if (import.meta.env.DEV) console.info("Admin verification lookup failed", error);
    return false;
  }

  return Boolean(data);
}

export async function clearCurrentAdminVerification() {
  const supabase = await getSupabaseClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("clear_current_admin_verification");
  if (error) {
    if (import.meta.env.DEV) console.info("Admin verification cleanup failed", { code: error.code || "" });
    return false;
  }
  return Boolean(data);
}

export async function verifyAdminAccessCode(code) {
  try {
    const data = await invokeEdgeFunction("verify-admin-access-code", {
      body: { code },
      unavailableMessage: "Admin security verification is temporarily unavailable. Please try again.",
      failureMessage: "Admin verification could not be completed. Please try again."
    });

    if (!data?.ok) {
      return { ok: false, message: data?.error || "Admin verification could not be completed. Please try again." };
    }

    return { ok: true, expiresAt: data.expiresAt };
  } catch (error) {
    if (error instanceof EdgeFunctionError && error.unavailable) {
      return { ok: false, message: "Admin security verification is temporarily unavailable. Please try again." };
    }
    return { ok: false, message: error.message || "Admin verification could not be completed. Please try again." };
  }
}
