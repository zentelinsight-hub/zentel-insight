import { getSupabaseClient } from "./supabaseClient";
import { getProgramChatUnreadCounts } from "./chatService";

function normalizeList(data) {
  return Array.isArray(data) ? data : [];
}

async function getClient() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Tutor data could not be reached.");
  return supabase;
}

async function requiredSelect(label, query, fallback = []) {
  const { data, error } = await query;
  if (error) {
    if (import.meta.env.DEV) console.info(`Tutor ${label} query failed`, error);
    throw new Error(`Tutor ${label} could not be loaded. Please try again.`);
  }
  return data ?? fallback;
}

export async function getTutorDashboardData(tutorId) {
  if (!tutorId) return null;
  const supabase = await getClient();
  const [profile, tutorProfile, assignments] = await Promise.all([
    requiredSelect("profile", supabase.from("profiles").select("*").eq("id", tutorId).maybeSingle(), null),
    requiredSelect("tutor profile", supabase.from("tutor_profiles").select("*").eq("user_id", tutorId).maybeSingle(), null),
    requiredSelect(
      "assignments",
      supabase
        .from("tutor_program_assignments")
        .select("*, programs(id, slug, title, short_description, long_description), program_levels(id, level_name)")
        .eq("tutor_id", tutorId)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
    )
  ]);

  const primaryAssignment = normalizeList(assignments)[0] || null;
  const programId = primaryAssignment?.program_id || "";
  const trackId = primaryAssignment?.track_id || "";
  const [
    studentsPage,
    timetable,
    announcements,
    learningAssignments,
    resources,
    articles,
    liveClasses,
    attendance,
    unreadMessageCounts
  ] = programId
    ? await Promise.all([
        searchTutorStudents({ page: 1, pageSize: 25 }),
        requiredSelect("timetable", supabase.from("timetable_entries").select("*, programs(id, title), program_level:program_levels!timetable_entries_program_level_id_fkey(id, level_name), track_level:program_levels!timetable_entries_track_id_fkey(id, level_name)").eq("program_id", programId).order("day_of_week", { ascending: true })),
        requiredSelect("announcements", supabase.from("announcements").select("*, programs(id, title), program_levels(id, level_name)").eq("program_id", programId).order("created_at", { ascending: false })),
        requiredSelect("assignments", supabase.from("assignments").select("*, programs(id, title), program_levels(id, level_name)").eq("program_id", programId).order("created_at", { ascending: false })),
        requiredSelect("resources", supabase.from("resources").select("*, programs(id, title), program_levels(id, level_name)").eq("program_id", programId).order("created_at", { ascending: false })),
        requiredSelect("articles", supabase.from("portal_articles").select("*, programs(id, title), program_levels(id, level_name)").eq("program_id", programId).order("created_at", { ascending: false })),
        requiredSelect("live classes", supabase.from("live_class_sessions").select("*, programs(id, title), program_levels(id, level_name)").eq("program_id", programId).order("scheduled_start", { ascending: true })),
        requiredSelect("attendance", supabase.from("live_class_attendance").select("*, live_class_sessions!inner(id, title, program_id, scheduled_start, scheduled_end, programs(id, title))").eq("live_class_sessions.program_id", programId).order("joined_at", { ascending: false }).limit(200)),
        getProgramChatUnreadCounts()
      ])
    : [{ records: [], total: 0, page: 1, pageCount: 1 }, [], [], [], [], [], [], [], {}];
  const [notifications, supportTickets] = await Promise.all([
    requiredSelect("notifications", supabase.from("portal_notifications").select("*").eq("user_id", tutorId).order("created_at", { ascending: false }).limit(100)),
    requiredSelect("support tickets", supabase.from("support_tickets").select("*, support_ticket_messages(*)").eq("user_id", tutorId).order("created_at", { ascending: false }).limit(100))
  ]);
  const studentRecords = normalizeList(studentsPage.records);
  const scopedToTrack = (records, key = "program_level_id") => normalizeList(records).filter((item) => !trackId || !item[key] || item[key] === trackId);
  const hydratedTimetable = scopedToTrack(timetable, "track_id").map((item) => ({
    ...item,
    program_levels: item.track_level || item.program_level || null
  }));

  return {
    profile,
    tutorProfile,
    assignments: normalizeList(assignments),
    officialStudents: studentRecords.filter((item) => item.assignment_type === "official"),
    preferenceStudents: studentRecords.filter((item) => item.assignment_type === "preference"),
    studentTotal: Number(studentsPage.total || 0),
    timetable: hydratedTimetable,
    announcements: normalizeList(announcements),
    learningAssignments: scopedToTrack(learningAssignments),
    resources: scopedToTrack(resources),
    articles: scopedToTrack(articles),
    liveClasses: scopedToTrack(liveClasses, "track_id"),
    attendance: normalizeList(attendance),
    unreadMessages: Object.values(unreadMessageCounts || {}).reduce((total, count) => total + Number(count || 0), 0),
    notifications: normalizeList(notifications),
    supportTickets: normalizeList(supportTickets)
  };
}

export async function updateTutorProfessionalProfile(tutorId, values) {
  const supabase = await getClient();
  if (!tutorId) throw new Error("Tutor profile could not be identified.");
  const { data, error } = await supabase.rpc("tutor_update_professional_profile", {
    next_professional_bio: String(values.professional_bio || "").trim(),
    next_qualifications: String(values.qualifications || "").trim(),
    next_teaching_experience: String(values.teaching_experience || "").trim(),
    next_specialisation: String(values.specialisation || "").trim(),
    next_availability: String(values.availability || "").trim()
  });
  if (error) throw error;
  return data;
}

export async function searchTutorStudents({ query = "", status = "all", assignment = "all", trackId = "", page = 1, pageSize = 20 } = {}) {
  const supabase = await getClient();
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
  const { data, error } = await supabase.rpc("tutor_search_assigned_students", {
    search_text: String(query || "").trim(),
    status_filter: ["active", "inactive", "suspended"].includes(status) ? status : "all",
    assignment_filter: ["official", "preference"].includes(assignment) ? assignment : "all",
    track_filter: trackId || null,
    page_limit: safePageSize,
    page_offset: (safePage - 1) * safePageSize
  });
  if (error) throw error;
  const rows = normalizeList(data).map((item) => ({
    ...item,
    profiles: {
      id: item.user_id,
      full_name: item.full_name,
      avatar_path: item.avatar_path,
      account_status: item.account_status,
      profile_completion: item.profile_completion
    },
    programs: { id: item.program_id, title: item.program_title },
    program_levels: item.track_id ? { id: item.track_id, level_name: item.track_name } : null
  }));
  const total = Number(rows[0]?.total_count || 0);
  return {
    records: rows,
    total,
    page: safePage,
    pageSize: safePageSize,
    pageCount: Math.max(1, Math.ceil(total / safePageSize))
  };
}

export async function saveTutorAssignment(values) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("tutor_save_assignment", {
    target_assignment_id: values.id || null,
    next_title: String(values.title || "").trim(),
    next_instructions: String(values.instructions || "").trim(),
    next_due_at: values.due_at ? new Date(values.due_at).toISOString() : null,
    next_maximum_score: Math.max(1, Number(values.maximum_score || 100)),
    next_published: Boolean(values.published)
  });
  if (error) throw error;
  return data;
}

export async function saveTutorResource(values) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("tutor_save_resource", {
    target_resource_id: values.id || null,
    next_title: String(values.title || "").trim(),
    next_description: String(values.description || "").trim(),
    next_resource_type: values.resource_type || "link",
    next_external_url: String(values.external_url || "").trim(),
    next_published: Boolean(values.published)
  });
  if (error) throw error;
  return data;
}
