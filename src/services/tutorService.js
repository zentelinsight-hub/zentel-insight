import { getSupabaseClient } from "./supabaseClient";

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
    requiredSelect("assignments", supabase.from("tutor_program_assignments").select("*, programs(id, slug, title), program_levels(id, level_name)").eq("tutor_id", tutorId).eq("active", true))
  ]);

  const programIds = normalizeList(assignments).map((item) => item.program_id).filter(Boolean);
  const [
    officialStudents,
    preferenceStudents,
    timetable,
    announcements,
    learningAssignments,
    resources,
    articles,
    liveClasses,
    notifications,
    supportTickets
  ] = programIds.length
    ? await Promise.all([
        requiredSelect("students", supabase.from("enrolments").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).eq("status", "active").order("created_at", { ascending: false })),
        requiredSelect("student preferences", supabase.from("student_program_preferences").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        requiredSelect("timetable", supabase.from("timetable_entries").select("*, programs(id, title), program_level:program_levels!timetable_entries_program_level_id_fkey(id, level_name), track_level:program_levels!timetable_entries_track_id_fkey(id, level_name)").in("program_id", programIds).order("day_of_week", { ascending: true })),
        requiredSelect("announcements", supabase.from("announcements").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        requiredSelect("assignments", supabase.from("assignments").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        requiredSelect("resources", supabase.from("resources").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        requiredSelect("articles", supabase.from("portal_articles").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        requiredSelect("live classes", supabase.from("live_class_sessions").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("scheduled_start", { ascending: true })),
        requiredSelect("notifications", supabase.from("portal_notifications").select("*").eq("user_id", tutorId).order("created_at", { ascending: false }).limit(100)),
        requiredSelect("support tickets", supabase.from("support_tickets").select("*").eq("user_id", tutorId).order("created_at", { ascending: false }).limit(100))
      ])
    : [[], [], [], [], [], [], [], [], [], []];

  const studentIds = [...new Set([...normalizeList(officialStudents), ...normalizeList(preferenceStudents)].map((item) => item.user_id).filter(Boolean))];
  const studentProfiles = studentIds.length
    ? await requiredSelect("student profiles", supabase.from("profiles").select("id, full_name, email, phone, avatar_path, account_status").in("id", studentIds))
    : [];
  const profileById = new Map(normalizeList(studentProfiles).map((item) => [item.id, item]));
  const hydratedOfficialStudents = normalizeList(officialStudents).map((item) => ({ ...item, profiles: profileById.get(item.user_id) || null }));
  const hydratedPreferenceStudents = normalizeList(preferenceStudents).map((item) => ({ ...item, profiles: profileById.get(item.user_id) || null }));
  const officialStudentIds = new Set(hydratedOfficialStudents.map((item) => item.user_id).filter(Boolean));
  const hydratedTimetable = normalizeList(timetable).map((item) => ({
    ...item,
    program_levels: item.track_level || item.program_level || null
  }));

  return {
    profile,
    tutorProfile,
    assignments: normalizeList(assignments),
    officialStudents: hydratedOfficialStudents,
    preferenceStudents: hydratedPreferenceStudents.filter((item) => !officialStudentIds.has(item.user_id)),
    timetable: hydratedTimetable,
    announcements: normalizeList(announcements),
    learningAssignments: normalizeList(learningAssignments),
    resources: normalizeList(resources),
    articles: normalizeList(articles),
    liveClasses: normalizeList(liveClasses),
    notifications: normalizeList(notifications),
    supportTickets: normalizeList(supportTickets)
  };
}

export async function updateTutorProfessionalProfile(tutorId, values) {
  const supabase = await getClient();
  const payload = {
    professional_bio: String(values.professional_bio || "").trim(),
    qualifications: String(values.qualifications || "").trim(),
    teaching_experience: String(values.teaching_experience || "").trim(),
    availability: String(values.availability || "").trim(),
    specialisation: String(values.specialisation || "").trim()
  };

  const { data: updated, error: updateError } = await supabase
    .from("tutor_profiles")
    .update(payload)
    .eq("user_id", tutorId)
    .select("*")
    .maybeSingle();

  if (updateError) throw updateError;
  if (updated) return updated;

  const { data, error } = await supabase
    .from("tutor_profiles")
    .insert({
      user_id: tutorId,
      title: values.title || "Mr",
      ...payload
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}
