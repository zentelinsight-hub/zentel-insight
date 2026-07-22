import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { assertVerifiedAdmin } from "../_shared/security.ts";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeRole(value: unknown) {
  const role = clean(value).toLowerCase();
  return ["all", "student", "tutor", "admin"].includes(role) ? role : "all";
}

function normalizeStatus(value: unknown) {
  const status = clean(value).toLowerCase();
  return ["all", "active", "inactive"].includes(status) ? status : "all";
}

function normalizeAssignment(value: unknown) {
  const assignment = clean(value).toLowerCase();
  return ["all", "assigned", "unassigned"].includes(assignment) ? assignment : "all";
}

function normalizePage(value: unknown) {
  return Math.max(1, Number(value) || 1);
}

function normalizePageSize(value: unknown) {
  return Math.min(50, Math.max(1, Number(value) || 25));
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function sortPeople(left: any, right: any) {
  const leftName = lower(left.full_name || left.email);
  const rightName = lower(right.full_name || right.email);
  if (leftName !== rightName) return leftName.localeCompare(rightName);
  return String(right.created_at || "").localeCompare(String(left.created_at || ""));
}

async function listAuthUsers(supabase: any) {
  const users: any[] = [];
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }

  return users;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  const admin = await assertVerifiedAdmin(request);
  if (!admin.ok) return jsonResponse({ ok: false, error: admin.error }, admin.status, request);

  try {
    const body = await request.json().catch(() => ({}));
    const roleFilter = normalizeRole(body.role);
    const statusFilter = normalizeStatus(body.status || body.statusFilter);
    const assignmentFilter = normalizeAssignment(body.assignment || body.assignmentFilter);
    const programFilter = clean(body.programId || body.program_id);
    const search = lower(body.query || body.search || body.searchText);
    const page = normalizePage(body.page);
    const pageSize = normalizePageSize(body.pageSize || body.page_limit);

    const [
      profilesResult,
      rolesResult,
      tutorProfilesResult,
      assignmentsResult,
      enrolmentsResult,
      programsResult,
      levelsResult,
      authUsers
    ] = await Promise.all([
      admin.supabase.from("profiles").select("id, full_name, email, phone, title, avatar_path, account_status, status_changed_at, status_changed_by, status_reason, profile_completion, created_at, updated_at"),
      admin.supabase.from("user_roles").select("user_id, role"),
      admin.supabase.from("tutor_profiles").select("user_id, title, specialisation, professional_bio, qualifications, teaching_experience, availability"),
      admin.supabase.from("tutor_program_assignments").select("id, tutor_id, program_id, track_id, active, created_at, updated_at").eq("active", true),
      admin.supabase.from("enrolments").select("id, user_id, program_id, program_level_id, status, created_at, updated_at").eq("status", "active"),
      admin.supabase.from("programs").select("id, title, active"),
      admin.supabase.from("program_levels").select("id, program_id, level_name, active"),
      listAuthUsers(admin.supabase)
    ]);

    for (const result of [profilesResult, rolesResult, tutorProfilesResult, assignmentsResult, enrolmentsResult, programsResult, levelsResult]) {
      if (result.error) throw result.error;
    }

    const profiles = profilesResult.data || [];
    const roles = new Map((rolesResult.data || []).map((item: any) => [item.user_id, item.role]));
    const tutorProfiles = new Map((tutorProfilesResult.data || []).map((item: any) => [item.user_id, item]));
    const programs = new Map((programsResult.data || []).map((item: any) => [item.id, item]));
    const levels = new Map((levelsResult.data || []).map((item: any) => [item.id, item]));
    const authById = new Map((authUsers || []).map((item: any) => [item.id, item]));

    const activeAssignmentsByTutor = new Map<string, any[]>();
    for (const assignment of assignmentsResult.data || []) {
      const current = activeAssignmentsByTutor.get(assignment.tutor_id) || [];
      current.push(assignment);
      activeAssignmentsByTutor.set(assignment.tutor_id, current);
    }

    const activeEnrolmentsByStudent = new Map<string, any[]>();
    for (const enrolment of enrolmentsResult.data || []) {
      const current = activeEnrolmentsByStudent.get(enrolment.user_id) || [];
      current.push(enrolment);
      activeEnrolmentsByStudent.set(enrolment.user_id, current);
    }

    const people = profiles.map((profile: any) => {
      const role = roles.get(profile.id) || "student";
      const authUser = authById.get(profile.id) || {};
      const tutorProfile = tutorProfiles.get(profile.id) || {};
      const tutorAssignments = activeAssignmentsByTutor.get(profile.id) || [];
      const studentEnrolments = activeEnrolmentsByStudent.get(profile.id) || [];
      const primaryTutorAssignment = [...tutorAssignments].sort((left, right) => String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")))[0] || null;
      const primaryStudentEnrolment = [...studentEnrolments].sort((left, right) => String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")))[0] || null;
      const primaryAssignment = role === "tutor" ? primaryTutorAssignment : primaryStudentEnrolment;
      const program = primaryAssignment ? programs.get(primaryAssignment.program_id) : null;
      const trackId = primaryAssignment?.track_id || primaryAssignment?.program_level_id || null;
      const track = trackId ? levels.get(trackId) : null;
      const assignmentCount = role === "tutor" ? tutorAssignments.length : studentEnrolments.length;

      return {
        id: profile.id,
        user_id: profile.id,
        role,
        title: tutorProfile.title || profile.title || (role === "tutor" ? "Mr" : ""),
        full_name: profile.full_name || "",
        email: profile.email || authUser.email || "",
        phone: profile.phone || "",
        avatar_path: profile.avatar_path || "",
        account_status: profile.account_status || "inactive",
        status_changed_at: profile.status_changed_at || null,
        status_changed_by: profile.status_changed_by || null,
        status_reason: profile.status_reason || "",
        profile_completion: Number(profile.profile_completion || 0),
        created_at: authUser.created_at || profile.created_at,
        last_sign_in_at: authUser.last_sign_in_at || null,
        program_id: primaryAssignment?.program_id || null,
        program_level_id: primaryStudentEnrolment?.program_level_id || null,
        track_id: primaryTutorAssignment?.track_id || primaryStudentEnrolment?.program_level_id || null,
        assignment_id: primaryTutorAssignment?.id || primaryStudentEnrolment?.id || null,
        program_title: program?.title || "",
        level_name: track?.level_name || "",
        track_name: track?.level_name || "",
        assignment_count: assignmentCount,
        assignment_status: assignmentCount > 0 ? "assigned" : "unassigned",
        specialisation: tutorProfile.specialisation || "",
        professional_bio: tutorProfile.professional_bio || "",
        qualifications: tutorProfile.qualifications || "",
        teaching_experience: tutorProfile.teaching_experience || "",
        availability: tutorProfile.availability || ""
      };
    });

    const assignedTutorIds = new Set(
      people
        .filter((person: any) => person.role === "tutor")
        .flatMap((person: any) => (activeAssignmentsByTutor.get(person.id) || []).map((assignment: any) => assignment.tutor_id))
    );
    const programmesWithActiveTutors = new Set(
      people
        .filter((person: any) => person.role === "tutor" && person.account_status === "active")
        .flatMap((person: any) => (activeAssignmentsByTutor.get(person.id) || []).map((assignment: any) => assignment.program_id))
    );
    const activeProgrammes = (programsResult.data || []).filter((program: any) => program.active !== false);

    const metrics = {
      totalStudents: people.filter((person: any) => person.role === "student").length,
      totalTutors: people.filter((person: any) => person.role === "tutor").length,
      activeTutors: people.filter((person: any) => person.role === "tutor" && person.account_status === "active").length,
      inactiveTutors: people.filter((person: any) => person.role === "tutor" && person.account_status !== "active").length,
      assignedTutors: assignedTutorIds.size,
      unassignedTutors: people.filter((person: any) => person.role === "tutor" && !assignedTutorIds.has(person.id)).length,
      programmesWithoutTutors: activeProgrammes.filter((program: any) => !programmesWithActiveTutors.has(program.id)).length
    };

    const filtered = people
      .filter((person: any) => roleFilter === "all" || person.role === roleFilter)
      .filter((person: any) => statusFilter === "all" || person.account_status === statusFilter)
      .filter((person: any) => {
        if (assignmentFilter === "all") return true;
        return assignmentFilter === "assigned" ? person.assignment_count > 0 : person.assignment_count === 0;
      })
      .filter((person: any) => !programFilter || person.program_id === programFilter)
      .filter((person: any) => {
        if (!search) return true;
        const haystack = [
          person.full_name,
          person.email,
          person.phone,
          person.role,
          person.account_status,
          person.program_title,
          person.level_name,
          person.track_name,
          person.specialisation
        ].map(lower).join(" ");
        return haystack.includes(search);
      })
      .sort(sortPeople);

    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const records = filtered.slice(offset, offset + pageSize);

    return jsonResponse({
      ok: true,
      records,
      metrics,
      total,
      page,
      pageSize,
      pageCount
    }, 200, request);
  } catch (error) {
    console.error("admin-list-people", (error as Error).message);
    return jsonResponse({ ok: false, error: "People records could not be loaded." }, 400, request);
  }
});
