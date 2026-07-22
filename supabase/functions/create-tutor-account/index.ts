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
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);

  const admin = await assertVerifiedAdmin(request);
  if (!admin.ok) return jsonResponse({ ok: false, error: admin.error }, admin.status, request);

  try {
    const body = await request.json();
    const title = clean(body.title);
    const fullName = clean(body.fullName);
    const email = normalizeEmail(body.email);
    const phone = clean(body.phone);
    const password = String(body.temporaryPassword || "");
    const programId = clean(body.programId);
    const trackId = clean(body.trackId) || null;
    const specialisation = clean(body.specialisation);

    if (!["Mr", "Mrs"].includes(title)) throw new Error("Choose Mr or Mrs for the tutor title.");
    if (fullName.length < 2) throw new Error("Enter the tutor's full name.");
    if (!isEmail(email)) throw new Error("Enter a valid tutor email address.");
    if (phone.length < 7) throw new Error("Enter a valid tutor phone number.");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new Error("Temporary password must use at least 8 characters with letters and numbers.");
    }
    if (!programId) throw new Error("Assign a programme to this tutor.");

    const { data: existingProfiles, error: existingError } = await admin.supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .limit(1);

    if (existingError) throw existingError;
    if (existingProfiles?.length) {
      return jsonResponse({ ok: false, error: "A user with this email already exists." }, 409, request);
    }

    const { data: created, error: createError } = await admin.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        title,
        role: "tutor",
        must_change_password: true
      }
    });

    if (createError) {
      if (/already|registered|exists/i.test(createError.message || "")) {
        return jsonResponse({ ok: false, error: "A user with this email already exists." }, 409, request);
      }
      throw createError;
    }

    const tutorUserId = created.user?.id;
    if (!tutorUserId) throw new Error("Tutor account was not created.");

    const { error: profileError } = await admin.supabase.from("profiles").upsert({
      id: tutorUserId,
      full_name: fullName,
      email,
      phone,
      title,
      account_status: "inactive",
      status_changed_at: new Date().toISOString(),
      status_reason: "New tutor account pending Admin activation",
      must_change_password: true,
      profile_completed: true
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const { error: roleError } = await admin.supabase.from("user_roles").upsert({
      user_id: tutorUserId,
      role: "tutor"
    }, { onConflict: "user_id" });
    if (roleError) throw roleError;

    const { error: tutorProfileError } = await admin.supabase.from("tutor_profiles").upsert({
      user_id: tutorUserId,
      title,
      specialisation
    }, { onConflict: "user_id" });
    if (tutorProfileError) throw tutorProfileError;

    const { data: assignment, error: assignmentError } = await admin.supabase
      .from("tutor_program_assignments")
      .upsert({
        tutor_id: tutorUserId,
        program_id: programId,
        track_id: trackId,
        assigned_by: admin.user.id,
        active: true
      }, { onConflict: "tutor_id,program_id,track_id" })
      .select("id")
      .maybeSingle();
    if (assignmentError) throw assignmentError;

    await writeAuditLog(admin.supabase, {
      actorUserId: admin.user.id,
      action: "tutor_account_created",
      targetTable: "profiles",
      targetId: tutorUserId,
      metadata: { assignmentId: assignment?.id || null, programId, trackId, email }
    });

    return jsonResponse({
      ok: true,
      tutorUserId,
      message: "Tutor account created successfully."
    }, 200, request);
  } catch (error) {
    console.error("create-tutor-account", (error as Error).message);
    return jsonResponse({ ok: false, error: (error as Error).message || "Tutor account could not be created." }, 400, request);
  }
});
