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
  let tutorUserId = "";
  let createdNewAuthUser = false;
  let failureStep = "validate_input";

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

    failureStep = "find_existing_profile";
    const { data: existingProfile, error: existingError } = await admin.supabase
      .from("profiles")
      .select("id, email, full_name")
      .ilike("email", email)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existingProfile?.id) {
      failureStep = "verify_existing_tutor_role";
      const { data: existingRole, error: existingRoleError } = await admin.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", existingProfile.id)
        .maybeSingle();
      if (existingRoleError) throw existingRoleError;
      if (existingRole?.role !== "tutor") {
        return jsonResponse({ ok: false, error: "A non-Tutor account already uses this email address." }, 409, request);
      }
      tutorUserId = existingProfile.id;
    }

    if (!tutorUserId) {
      failureStep = "create_auth_user";
      const { data: created, error: createError } = await admin.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          zentel_role: "tutor",
          zentel_provisioned_by: "admin"
        },
        user_metadata: {
          full_name: fullName,
          phone,
          title,
          zentel_role_label: "tutor",
          must_change_password: true
        }
      });

      if (createError) {
        if (/already|registered|exists/i.test(createError.message || "")) {
          failureStep = "repair_existing_auth_user";
          const { data: listedUsers, error: listUsersError } = await admin.supabase.auth.admin.listUsers({
            page: 1,
            perPage: 1000
          });
          if (listUsersError) throw listUsersError;
          const existingAuthUser = listedUsers?.users?.find((item: { email?: string; id?: string }) => normalizeEmail(item.email) === email);
          if (!existingAuthUser?.id) {
            return jsonResponse({ ok: false, error: "A user with this email already exists." }, 409, request);
          }
          tutorUserId = existingAuthUser.id;
        } else {
          throw createError;
        }
      }

      if (!tutorUserId) {
        tutorUserId = created.user?.id || "";
        createdNewAuthUser = true;
        if (!tutorUserId) throw new Error("Tutor account was not created.");
      }
    }

    failureStep = "mark_auth_user_tutor";
    const { error: markerError } = await admin.supabase.auth.admin.updateUserById(tutorUserId, {
      app_metadata: {
        zentel_role: "tutor",
        zentel_provisioned_by: "admin"
      },
      user_metadata: {
        full_name: fullName,
        phone,
        title,
        zentel_role_label: "tutor",
        must_change_password: true
      }
    });
    if (markerError) throw markerError;

    failureStep = "upsert_profile";
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

    failureStep = "upsert_role";
    const { error: roleError } = await admin.supabase.from("user_roles").upsert({
      user_id: tutorUserId,
      role: "tutor"
    }, { onConflict: "user_id" });
    if (roleError) throw roleError;

    failureStep = "upsert_tutor_profile";
    const { error: tutorProfileError } = await admin.supabase.from("tutor_profiles").upsert({
      user_id: tutorUserId,
      title,
      specialisation
    }, { onConflict: "user_id" });
    if (tutorProfileError) throw tutorProfileError;

    failureStep = "assign_programme";
    let assignmentQuery = admin.supabase
      .from("tutor_program_assignments")
      .select("id")
      .eq("tutor_id", tutorUserId)
      .eq("program_id", programId);
    assignmentQuery = trackId ? assignmentQuery.eq("track_id", trackId) : assignmentQuery.is("track_id", null);
    const { data: existingAssignment, error: existingAssignmentError } = await assignmentQuery.maybeSingle();
    if (existingAssignmentError) throw existingAssignmentError;

    const { data: assignment, error: assignmentError } = existingAssignment?.id
      ? await admin.supabase
        .from("tutor_program_assignments")
        .update({
          assigned_by: admin.user.id,
          active: true
        })
        .eq("id", existingAssignment.id)
        .select("id")
        .maybeSingle()
      : await admin.supabase
        .from("tutor_program_assignments")
        .insert({
          tutor_id: tutorUserId,
          program_id: programId,
          track_id: trackId,
          assigned_by: admin.user.id,
          active: true
        })
        .select("id")
        .maybeSingle();
    if (assignmentError) throw assignmentError;

    failureStep = "write_audit_log";
    await writeAuditLog(admin.supabase, {
      actorUserId: admin.user.id,
      action: "tutor_account_created",
      targetTable: "profiles",
      targetId: tutorUserId,
      metadata: { assignmentId: assignment?.id || null, programId, trackId, email, createdNewAuthUser }
    });

    return jsonResponse({
      ok: true,
      tutorUserId,
      message: "Tutor account created successfully."
    }, 200, request);
  } catch (error) {
    const message = (error as Error).message || "Tutor account could not be created.";
    console.error("create-tutor-account", failureStep, message);
    if (createdNewAuthUser && tutorUserId) {
      const { error: deleteError } = await admin.supabase.auth.admin.deleteUser(tutorUserId);
      if (deleteError) console.error("create-tutor-account cleanup", deleteError.message);
    }
    await writeAuditLog(admin.supabase, {
      actorUserId: admin.user?.id,
      action: "tutor_account_create_failed",
      targetTable: "profiles",
      targetId: tutorUserId || null,
      metadata: { failureStep, message, cleanedUpAuthUser: createdNewAuthUser && Boolean(tutorUserId) }
    });
    return jsonResponse({ ok: false, error: `${message} Failed step: ${failureStep}.` }, 400, request);
  }
});
