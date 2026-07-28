import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { assertVerifiedAdmin, writeAuditLog } from "../_shared/security.ts";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  const admin = await assertVerifiedAdmin(request);
  if (!admin.ok) return jsonResponse({ ok: false, error: admin.error }, admin.status, request);

  try {
    const body = await request.json().catch(() => ({}));
    const userId = clean(body.userId || body.user_id);
    const email = normalizeEmail(body.email);
    const newPassword = String(body.newPassword || body.new_password || "");
    const dateOfBirth = clean(body.dateOfBirth || body.date_of_birth) || null;
    const educationLevel = clean(body.educationLevel || body.education_level);
    const address = clean(body.address);

    if (!userId) throw new Error("Select a Student or Tutor account before saving.");
    if (!isEmail(email)) throw new Error("Enter a valid account email address.");
    if (newPassword && (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword))) {
      throw new Error("New password must use at least 8 characters with letters and numbers.");
    }

    const { data: roleRecord, error: roleError } = await admin.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (roleError) throw roleError;
    const targetRole = roleRecord?.role || "student";
    if (!['student', 'tutor'].includes(targetRole)) {
      throw new Error("Only Student and Tutor credentials can be changed here.");
    }

    const { data: authRecord, error: authLookupError } = await admin.supabase.auth.admin.getUserById(userId);
    if (authLookupError) throw authLookupError;
    if (!authRecord?.user) throw new Error("The account authentication record was not found.");

    const previousEmail = normalizeEmail(authRecord.user.email);
    const authChanges: { email?: string; email_confirm?: boolean; password?: string } = {};
    if (email !== previousEmail) {
      authChanges.email = email;
      authChanges.email_confirm = true;
    }
    if (newPassword) authChanges.password = newPassword;

    if (Object.keys(authChanges).length) {
      const { error: updateAuthError } = await admin.supabase.auth.admin.updateUserById(userId, authChanges);
      if (updateAuthError) throw updateAuthError;
    }

    const { error: profileError } = await admin.supabase
      .from("profiles")
      .update({
        email,
        date_of_birth: dateOfBirth,
        education_level: educationLevel,
        address
      })
      .eq("id", userId);
    if (profileError) {
      if (email !== previousEmail) {
        await admin.supabase.auth.admin.updateUserById(userId, { email: previousEmail, email_confirm: true });
      }
      throw profileError;
    }

    await writeAuditLog(admin.supabase, {
      actorUserId: admin.user.id,
      action: "account_credentials_updated",
      targetTable: "profiles",
      targetId: userId,
      metadata: {
        role: targetRole,
        emailChanged: email !== previousEmail,
        passwordChanged: Boolean(newPassword),
        profileFieldsChanged: true
      }
    });

    return jsonResponse({ ok: true, email, passwordChanged: Boolean(newPassword) }, 200, request);
  } catch (error) {
    const message = (error as Error).message || "Account credentials could not be updated.";
    console.error("admin-update-account-credentials", message);
    return jsonResponse({ ok: false, error: message }, 400, request);
  }
});
