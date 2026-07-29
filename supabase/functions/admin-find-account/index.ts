import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { assertVerifiedAdmin, hashRequestValue, writeAuditLog } from "../_shared/security.ts";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

const notFoundResponse = (request: Request) => jsonResponse({
  ok: false,
  code: "not_found",
  error: "No matching Student or Tutor account was found. Check the details and try again."
}, 404, request);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  const admin = await assertVerifiedAdmin(request);
  if (!admin.ok) return jsonResponse({ ok: false, error: admin.error }, admin.status, request);

  try {
    const body = await request.json().catch(() => ({}));
    const searchType = clean(body.searchType).toLowerCase();
    const accountType = clean(body.accountType || "any").toLowerCase();
    const lookupValue = searchType === "email"
      ? normalizeEmail(body.value)
      : clean(body.value).toUpperCase();

    if (!["portal_id", "email"].includes(searchType)) {
      return jsonResponse({ ok: false, error: "Choose Portal ID or email before searching." }, 400, request);
    }
    if (!["any", "student", "tutor"].includes(accountType)) {
      return jsonResponse({ ok: false, error: "Choose Student, Tutor or Any account type." }, 400, request);
    }
    if (searchType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lookupValue)) {
      return jsonResponse({ ok: false, error: "Enter the complete registered email address." }, 400, request);
    }
    if (searchType === "portal_id" && !/^ZI[ST]-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(lookupValue)) {
      return jsonResponse({ ok: false, error: "Enter a complete Student or Tutor Portal ID." }, 400, request);
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rateError } = await admin.supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("actor_user_id", admin.user.id)
      .eq("action", "admin_account_lookup")
      .gte("created_at", oneMinuteAgo);
    if (rateError) throw rateError;
    if (Number(recentCount || 0) >= 30) {
      return jsonResponse({ ok: false, code: "rate_limited", error: "Too many account lookups. Please wait a moment and try again." }, 429, request);
    }

    let profileQuery = admin.supabase
      .from("profiles")
      .select("id, portal_id, full_name, email, phone, title, avatar_path, date_of_birth, education_level, address, account_status, status_changed_at, status_changed_by, status_reason, profile_completion, created_at, updated_at")
      .limit(1);
    profileQuery = searchType === "email"
      ? profileQuery.eq("email", lookupValue)
      : profileQuery.eq("portal_id", lookupValue);
    const { data: profile, error: profileError } = await profileQuery.maybeSingle();
    if (profileError) throw profileError;

    const lookupHash = await hashRequestValue(`${searchType}:${lookupValue}`);
    if (!profile?.id) {
      await writeAuditLog(admin.supabase, {
        actorUserId: admin.user.id,
        action: "admin_account_lookup",
        targetTable: "profiles",
        metadata: { searchType, accountType, found: false, lookupHash }
      });
      return notFoundResponse(request);
    }

    const { data: roleRecord, error: roleError } = await admin.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id)
      .maybeSingle();
    if (roleError) throw roleError;
    const role = roleRecord?.role || "student";
    if (!["student", "tutor"].includes(role) || (accountType !== "any" && role !== accountType)) {
      await writeAuditLog(admin.supabase, {
        actorUserId: admin.user.id,
        action: "admin_account_lookup",
        targetTable: "profiles",
        metadata: { searchType, accountType, found: false, lookupHash }
      });
      return notFoundResponse(request);
    }

    const [tutorResult, tutorAssignmentResult, enrolmentResult, preferenceResult, supportResult, activityResult] = await Promise.all([
      role === "tutor"
        ? admin.supabase.from("tutor_profiles").select("*").eq("user_id", profile.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      role === "tutor"
        ? admin.supabase.from("tutor_program_assignments").select("*, programs(id, slug, title), program_levels(id, level_name)").eq("tutor_id", profile.id).eq("active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      role === "student"
        ? admin.supabase.from("enrolments").select("*, programs(id, slug, title), program_levels(id, level_name)").eq("user_id", profile.id).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      role === "student"
        ? admin.supabase.from("student_program_preferences").select("*, programs(id, slug, title), program_levels(id, level_name)").eq("user_id", profile.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin.supabase.from("support_tickets").select("id, subject, category, status, created_at, updated_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(10),
      admin.supabase.from("audit_logs").select("id, action, target_table, metadata, created_at").eq("target_id", profile.id).order("created_at", { ascending: false }).limit(20)
    ]);

    const relatedError = [tutorResult, tutorAssignmentResult, enrolmentResult, preferenceResult, supportResult, activityResult]
      .find((result) => result.error)?.error;
    if (relatedError) throw relatedError;

    let assignedTutor = null;
    if (role === "student" && enrolmentResult.data?.program_id) {
      let tutorAssignmentQuery = admin.supabase
        .from("tutor_program_assignments")
        .select("id, tutor_id, program_id, track_id, active, updated_at")
        .eq("program_id", enrolmentResult.data.program_id)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (enrolmentResult.data.program_level_id) {
        tutorAssignmentQuery = tutorAssignmentQuery.or(`track_id.is.null,track_id.eq.${enrolmentResult.data.program_level_id}`);
      }
      const { data: tutorAssignment, error: tutorAssignmentError } = await tutorAssignmentQuery.maybeSingle();
      if (tutorAssignmentError) throw tutorAssignmentError;
      if (tutorAssignment?.tutor_id) {
        const { data: tutorProfile, error: tutorProfileError } = await admin.supabase
          .from("profiles")
          .select("id, title, full_name, email, account_status")
          .eq("id", tutorAssignment.tutor_id)
          .maybeSingle();
        if (tutorProfileError) throw tutorProfileError;
        assignedTutor = tutorProfile ? { ...tutorProfile, assignmentId: tutorAssignment.id } : null;
      }
    }

    let avatarUrl = "";
    if (profile.avatar_path) {
      const { data: signedAvatar } = await admin.supabase.storage
        .from("profile-avatars")
        .createSignedUrl(profile.avatar_path, 60 * 30);
      avatarUrl = signedAvatar?.signedUrl || "";
    }

    await writeAuditLog(admin.supabase, {
      actorUserId: admin.user.id,
      action: "admin_account_lookup",
      targetTable: "profiles",
      targetId: profile.id,
      metadata: { searchType, accountType, found: true, role, lookupHash }
    });

    return jsonResponse({
      ok: true,
      account: {
        profile: { ...profile, avatar_url: avatarUrl },
        role,
        tutorProfile: tutorResult.data || null,
        tutorAssignment: tutorAssignmentResult.data || null,
        enrolment: enrolmentResult.data || null,
        preference: preferenceResult.data || null,
        assignedTutor,
        supportHistory: supportResult.data || [],
        activity: activityResult.data || []
      },
      lookupAt: new Date().toISOString()
    }, 200, request);
  } catch (error) {
    console.error("admin-find-account", (error as Error).message);
    return jsonResponse({
      ok: false,
      code: "lookup_unavailable",
      error: "We could not complete this account lookup. Please try again."
    }, 500, request);
  }
});
