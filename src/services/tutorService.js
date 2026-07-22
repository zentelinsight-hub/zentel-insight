import { getSupabaseClient } from "./supabaseClient";

function normalizeList(data) {
  return Array.isArray(data) ? data : [];
}

async function getClient() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Tutor data could not be reached.");
  return supabase;
}

async function safeSelect(label, query, fallback = []) {
  const { data, error } = await query;
  if (error) {
    if (import.meta.env.DEV) console.info(`Tutor ${label} query failed`, error);
    return fallback;
  }
  return data ?? fallback;
}

export async function getTutorDashboardData(tutorId) {
  if (!tutorId) return null;
  const supabase = await getClient();
  const [profile, tutorProfile, assignments] = await Promise.all([
    safeSelect("profile", supabase.from("profiles").select("*").eq("id", tutorId).maybeSingle(), null),
    safeSelect("tutor profile", supabase.from("tutor_profiles").select("*").eq("user_id", tutorId).maybeSingle(), null),
    safeSelect("assignments", supabase.from("tutor_program_assignments").select("*, programs(id, slug, title), program_levels(id, level_name)").eq("tutor_id", tutorId).eq("active", true))
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
        safeSelect("students", supabase.from("enrolments").select("*, profiles(id, full_name, email, phone), programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        safeSelect("student preferences", supabase.from("student_program_preferences").select("*, profiles(id, full_name, email, phone), programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        safeSelect("timetable", supabase.from("timetable_entries").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("day_of_week", { ascending: true })),
        safeSelect("announcements", supabase.from("announcements").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        safeSelect("assignments", supabase.from("assignments").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        safeSelect("resources", supabase.from("resources").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        safeSelect("articles", supabase.from("portal_articles").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("created_at", { ascending: false })),
        safeSelect("live classes", supabase.from("live_class_sessions").select("*, programs(id, title), program_levels(id, level_name)").in("program_id", programIds).order("scheduled_start", { ascending: true })),
        safeSelect("notifications", supabase.from("portal_notifications").select("*").eq("user_id", tutorId).order("created_at", { ascending: false }).limit(100)),
        safeSelect("support tickets", supabase.from("support_tickets").select("*, profiles(id, full_name, email)").order("created_at", { ascending: false }).limit(100))
      ])
    : [[], [], [], [], [], [], [], [], [], []];

  return {
    profile,
    tutorProfile,
    assignments: normalizeList(assignments),
    officialStudents: normalizeList(officialStudents),
    preferenceStudents: normalizeList(preferenceStudents),
    timetable: normalizeList(timetable),
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
