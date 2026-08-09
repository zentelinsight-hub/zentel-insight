import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { assertVerifiedAdmin } from "../_shared/security.ts";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  const admin = await assertVerifiedAdmin(request);
  if (!admin.ok) return jsonResponse({ ok: false, error: admin.error }, admin.status, request);

  try {
    const body = await request.json();
    const fullName = clean(body.fullName);
    const email = normalizeEmail(body.email);
    const phone = clean(body.phone);
    const temporaryPassword = String(body.temporaryPassword || "");
    const jobTitle = clean(body.jobTitle) || "Support Staff";
    const department = clean(body.department) || "Learner Support";

    if (fullName.length < 2) return jsonResponse({ ok: false, error: "Enter the Staff member's full name." }, 400, request);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ ok: false, error: "Enter a valid Staff email address." }, 400, request);
    if (phone.length < 7) return jsonResponse({ ok: false, error: "Enter a valid Staff phone number." }, 400, request);
    if (temporaryPassword.length < 8 || !/[A-Za-z]/.test(temporaryPassword) || !/\d/.test(temporaryPassword)) {
      return jsonResponse({ ok: false, error: "Temporary password must use at least 8 characters with letters and numbers." }, 400, request);
    }

    const { data: existingProfile, error: profileLookupError } = await admin.supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (profileLookupError) throw profileLookupError;
    if (existingProfile?.id) return jsonResponse({ ok: false, error: "An account already uses this email address." }, 409, request);

    const { data: created, error: createError } = await admin.supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { zentel_role: "staff", zentel_provisioned_by: "admin" },
      user_metadata: { full_name: fullName, phone, zentel_role_label: "staff", must_change_password: true }
    });
    if (createError || !created.user?.id) {
      const safeMessage = /already|registered|exists/i.test(createError?.message || "")
        ? "An account already uses this email address."
        : "Staff account access could not be created.";
      return jsonResponse({ ok: false, error: safeMessage }, createError ? 409 : 400, request);
    }

    const staffUserId = created.user.id;
    try {
      const { data: provisioned, error: provisionError } = await admin.supabase.rpc("provision_staff_account", {
        staff_user_id: staffUserId,
        admin_user_id: admin.user.id,
        staff_full_name: fullName,
        staff_email: email,
        staff_phone: phone,
        staff_job_title: jobTitle,
        staff_department: department
      });
      if (provisionError) throw provisionError;
      const profile = Array.isArray(provisioned) ? provisioned[0] : provisioned;
      const verifyError = !profile;
      if (verifyError || !/^ZIF-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(profile?.portal_id || "") || profile.account_status !== "inactive") {
        throw new Error("Staff account verification did not pass.");
      }

      return jsonResponse({ ok: true, staffUserId, portalId: profile.portal_id, message: "Staff account created as inactive." }, 200, request);
    } catch (error) {
      const cleanup = await admin.supabase.auth.admin.deleteUser(staffUserId);
      if (cleanup.error) console.error("create-staff-account cleanup", cleanup.error.message);
      throw error;
    }
  } catch (error) {
    console.error("create-staff-account", {
      message: error instanceof Error ? error.message : "Unknown Staff creation failure"
    });
    return jsonResponse({ ok: false, error: "Staff account could not be created. No active access was granted." }, 400, request);
  }
});
