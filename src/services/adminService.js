import { getSupabaseClient } from "./supabaseClient";
import { invokeEdgeFunction } from "./edgeFunctionClient";
import { attachProfileAvatarUrl, PROFILE_AVATAR_BUCKET, PROFILE_AVATAR_MAX_BYTES } from "./portal/portalRepository";

function normalizeList(data) {
  return Array.isArray(data) ? data : [];
}

async function getClient() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Admin data could not be reached.");
  return supabase;
}

const adminAvatarTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function validateAdminAvatar(file) {
  if (!file) return "";
  const extension = adminAvatarTypes[file.type];
  if (!extension) throw new Error("Upload a JPEG, PNG or WebP image for the Admin profile picture.");
  if (file.size > PROFILE_AVATAR_MAX_BYTES) throw new Error("Profile picture must be 3 MB or smaller.");
  return extension;
}

async function uploadAdminAvatar(supabase, userId, file) {
  const extension = validateAdminAvatar(file);
  const path = `${userId}/admin-avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return path;
}

async function safeSelect(label, query, fallback = []) {
  const { data, error } = await query;
  if (error) {
    if (import.meta.env.DEV) console.info(`Admin ${label} query failed`, error);
    return fallback;
  }
  return data ?? fallback;
}

function normalizePeopleRecords(data) {
  return normalizeList(data?.records);
}

function toTutorProfileShape(record) {
  return {
    ...record,
    profiles: {
      id: record.user_id || record.id,
      full_name: record.full_name,
      email: record.email,
      phone: record.phone,
      title: record.title,
      avatar_path: record.avatar_path,
      account_status: record.account_status,
      status_changed_at: record.status_changed_at,
      status_changed_by: record.status_changed_by,
      status_reason: record.status_reason
    }
  };
}

async function listAdminPeople({ role = "all", query = "", status = "all", assignment = "all", programId = "", page = 1, pageSize = 25 } = {}) {
  const data = await invokeEdgeFunction("admin-list-people", {
    body: { role, query, status, assignment, programId, page, pageSize },
    unavailableMessage: "People records are temporarily unavailable. Please try again.",
    failureMessage: "People records could not be loaded. Please try again."
  });
  if (!data?.ok) throw new Error(data?.error || "People records could not be loaded.");
  return data;
}

export async function getAdminDashboardData() {
  const supabase = await getClient();
  const [
    profiles,
    roles,
    tutors,
    tutorAssignments,
    programs,
    enrolments,
    announcements,
    timetable,
    assignments,
    resources,
    notifications,
    articles,
    liveClasses,
    supportTickets,
    payments,
    certificates,
    auditLogs
  ] = await Promise.all([
    safeSelect("profiles", supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200)),
    safeSelect("roles", supabase.from("user_roles").select("*").order("created_at", { ascending: false }).limit(300)),
    safeSelect("tutor profiles", supabase.from("tutor_profiles").select("*, profiles(id, full_name, email, phone, title, account_status, status_changed_at, status_changed_by, status_reason)").order("created_at", { ascending: false }).limit(200)),
    safeSelect("tutor assignments", supabase.from("tutor_program_assignments").select("*, programs(id, slug, title), program_levels(id, level_name), profiles!tutor_program_assignments_tutor_id_fkey(id, full_name, email, title)").order("created_at", { ascending: false }).limit(300)),
    safeSelect("programs", supabase.from("programs").select("*, program_levels(*)").order("display_order", { ascending: true }).order("title", { ascending: true })),
    safeSelect("enrolments", supabase.from("enrolments").select("*, profiles(id, full_name, email, phone), programs(id, slug, title), program_levels(id, level_name)").order("created_at", { ascending: false }).limit(300)),
    safeSelect("announcements", supabase.from("announcements").select("*, programs(id, title), program_levels(id, level_name)").order("created_at", { ascending: false }).limit(100)),
    safeSelect("timetable", supabase.from("timetable_entries").select("*, programs(id, title), program_levels(id, level_name)").order("day_of_week", { ascending: true }).order("start_time", { ascending: true }).limit(150)),
    safeSelect("assignments", supabase.from("assignments").select("*, programs(id, title), program_levels(id, level_name)").order("created_at", { ascending: false }).limit(150)),
    safeSelect("resources", supabase.from("resources").select("*, programs(id, title), program_levels(id, level_name)").order("created_at", { ascending: false }).limit(150)),
    safeSelect("notifications", supabase.from("portal_notifications").select("*").order("created_at", { ascending: false }).limit(100)),
    safeSelect("articles", supabase.from("portal_articles").select("*, programs(id, title), program_levels(id, level_name)").order("created_at", { ascending: false }).limit(100)),
    safeSelect("live classes", supabase.from("live_class_sessions").select("*, programs(id, title), program_levels(id, level_name), profiles!live_class_sessions_tutor_id_fkey(id, full_name, title)").order("scheduled_start", { ascending: false }).limit(150)),
    safeSelect("support tickets", supabase.from("support_tickets").select("*, profiles(id, full_name, email)").order("created_at", { ascending: false }).limit(200)),
    safeSelect("payments", supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(300)),
    safeSelect("certificates", supabase.from("certificates").select("*, profiles(id, full_name, email), programs(id, title), program_levels(id, level_name)").order("created_at", { ascending: false }).limit(200)),
    safeSelect("audit logs", supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100))
  ]);

  const [peopleSummary, studentDirectory, tutorDirectory] = await Promise.all([
    listAdminPeople({ role: "all", pageSize: 1 }).catch((error) => ({ records: [], metrics: null, error })),
    listAdminPeople({ role: "student", pageSize: 200 }).catch((error) => ({ records: [], error })),
    listAdminPeople({ role: "tutor", pageSize: 200 }).catch((error) => ({ records: [], error }))
  ]);

  const roleByUserId = new Map(normalizeList(roles).map((item) => [item.user_id, item.role]));
  const fallbackStudents = normalizeList(profiles).filter((profile) => roleByUserId.get(profile.id) !== "tutor" && roleByUserId.get(profile.id) !== "admin");
  const canonicalStudents = normalizePeopleRecords(studentDirectory);
  const canonicalTutors = normalizePeopleRecords(tutorDirectory).map(toTutorProfileShape);

  return {
    profiles: normalizeList(profiles),
    roles: normalizeList(roles),
    students: canonicalStudents.length ? canonicalStudents : fallbackStudents,
    tutors: canonicalTutors.length ? canonicalTutors : normalizeList(tutors),
    peopleMetrics: peopleSummary.metrics || null,
    tutorAssignments: normalizeList(tutorAssignments),
    programs: normalizeList(programs),
    enrolments: normalizeList(enrolments),
    announcements: normalizeList(announcements),
    timetable: normalizeList(timetable),
    assignments: normalizeList(assignments),
    resources: normalizeList(resources),
    notifications: normalizeList(notifications),
    articles: normalizeList(articles),
    liveClasses: normalizeList(liveClasses),
    supportTickets: normalizeList(supportTickets),
    payments: normalizeList(payments),
    certificates: normalizeList(certificates),
    auditLogs: normalizeList(auditLogs)
  };
}

export async function createTutorAccount(values) {
  const data = await invokeEdgeFunction("create-tutor-account", {
    body: values,
    unavailableMessage: "Tutor account creation is temporarily unavailable. Please try again.",
    failureMessage: "Tutor account could not be created. Please review the details and try again."
  });
  if (!data?.ok) throw new Error(data?.error || "Tutor account could not be created.");
  return data;
}

export async function updateAdminProfile(userId, values) {
  const supabase = await getClient();
  let uploadedAvatarPath = "";
  const avatarFile = values.avatarFile || null;
  const previousAvatarPath = values.previous_avatar_path || "";
  const nextAvatarPath = avatarFile
    ? await uploadAdminAvatar(supabase, userId, avatarFile)
    : values.removeAvatar
      ? null
      : values.avatar_path || null;
  uploadedAvatarPath = avatarFile ? nextAvatarPath : "";

  const payload = {
    full_name: String(values.full_name || "").trim(),
    phone: String(values.phone || "").trim(),
    address: String(values.address || "").trim(),
    education_level: String(values.education_level || "").trim(),
    title: values.title || null,
    avatar_path: nextAvatarPath
  };
  try {
    const { data, error } = await supabase.from("profiles").update(payload).eq("id", userId).select("*").maybeSingle();
    if (error) throw error;
    if (previousAvatarPath && previousAvatarPath !== nextAvatarPath) {
      await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([previousAvatarPath]);
    }
    return data ? attachProfileAvatarUrl(data) : data;
  } catch (error) {
    if (uploadedAvatarPath) await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([uploadedAvatarPath]);
    throw error;
  }
}

export async function searchAdminStudents({ query = "", status = "all", programId = "", page = 1, pageSize = 25 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 25));
  const data = await listAdminPeople({
    role: "student",
    query,
    status,
    programId,
    page: safePage,
    pageSize: safePageSize
  });
  const rows = normalizeList(data.records);
  const total = Number(data.total || 0);
  return {
    records: rows,
    total,
    page: safePage,
    pageSize: safePageSize,
    pageCount: Number(data.pageCount || Math.max(1, Math.ceil(total / safePageSize)))
  };
}

export async function searchAdminTutors({ query = "", filter = "all", page = 1, pageSize = 25 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 25));
  const status = ["active", "inactive"].includes(filter) ? filter : "all";
  const assignment = ["assigned", "unassigned"].includes(filter) ? filter : "all";
  const data = await listAdminPeople({
    role: "tutor",
    query,
    status,
    assignment,
    page: safePage,
    pageSize: safePageSize
  });
  const rows = normalizeList(data.records);
  const total = Number(data.total || 0);
  return {
    records: rows,
    total,
    page: safePage,
    pageSize: safePageSize,
    pageCount: Number(data.pageCount || Math.max(1, Math.ceil(total / safePageSize)))
  };
}

export async function updateStudentProfile(values) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("admin_update_student_profile", {
    target_user_id: values.id,
    next_full_name: String(values.full_name || "").trim(),
    next_phone: String(values.phone || "").trim(),
    next_date_of_birth: values.date_of_birth || null,
    next_education_level: String(values.education_level || "").trim(),
    next_address: String(values.address || "").trim(),
    next_program_id: values.program_id || null,
    next_program_level_id: values.program_level_id || null,
    next_account_status: values.account_status || null,
    next_status_reason: values.status_reason || null
  });
  if (error) throw error;
  return data;
}

export async function updateTutorProfile(values) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("admin_update_tutor_profile", {
    target_tutor_id: values.user_id || values.id,
    next_title: values.title || "Mr",
    next_full_name: String(values.full_name || "").trim(),
    next_phone: String(values.phone || "").trim(),
    next_specialisation: String(values.specialisation || "").trim(),
    next_professional_bio: String(values.professional_bio || "").trim(),
    next_qualifications: String(values.qualifications || "").trim(),
    next_teaching_experience: String(values.teaching_experience || "").trim(),
    next_availability: String(values.availability || "").trim(),
    next_account_status: values.account_status || null,
    next_status_reason: values.status_reason || null,
    next_program_id: values.program_id || null,
    next_track_id: values.track_id || null
  });
  if (error) throw error;
  return data;
}

export async function setAccountStatus({ userId, status, reason }) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("admin_set_account_status", {
    target_user_id: userId,
    next_status: status,
    status_reason: reason || null
  });
  if (error) throw error;
  return data;
}

export async function saveProgram(values) {
  const supabase = await getClient();
  const payload = {
    slug: String(values.slug || "").trim(),
    title: String(values.title || "").trim(),
    short_description: String(values.short_description || "").trim(),
    long_description: String(values.long_description || "").trim(),
    category: String(values.category || "digital-skills").trim(),
    icon_name: String(values.icon_name || "book-open").trim(),
    active: values.active !== false,
    featured: Boolean(values.featured),
    display_order: Number(values.display_order || 100)
  };
  const { data, error } = values.id
    ? await supabase.from("programs").update(payload).eq("id", values.id).select("*").maybeSingle()
    : await supabase.from("programs").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function saveProgramLevel(values) {
  const supabase = await getClient();
  const payload = {
    program_id: values.program_id,
    level_name: String(values.level_name || "").trim(),
    level_description: String(values.level_description || "").trim(),
    duration_text: String(values.duration_text || "").trim(),
    price_kobo: Math.max(0, Math.round(Number(values.price || 0) * 100)),
    active: values.active !== false
  };
  const { data, error } = values.id
    ? await supabase.from("program_levels").update(payload).eq("id", values.id).select("*").maybeSingle()
    : await supabase.from("program_levels").insert(payload).select("*").single();
  if (error) throw error;
  await supabase.from("program_prices").insert({
    program_id: payload.program_id,
    track_id: data.id,
    price_kobo: payload.price_kobo,
    active: payload.active
  });
  return data;
}

export async function updateProgramLevelPrice({ levelId, price, reason }) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("admin_update_program_level_price", {
    target_program_level_id: levelId,
    next_price_naira: Number(price || 0),
    change_reason: reason || null
  });
  if (error) throw error;
  return data;
}

export async function assignStudentProgramme(values) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("admin_assign_student_programme", {
    target_user_id: values.user_id,
    target_program_id: values.program_id,
    target_program_level_id: values.program_level_id,
    assignment_status: values.status || "active"
  });
  if (error) throw error;
  return data;
}

export async function assignTutorProgramme(values) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("admin_assign_tutor_programme", {
    target_tutor_id: values.tutor_id,
    target_program_id: values.program_id,
    target_track_id: values.track_id || null,
    assignment_active: values.active !== false
  });
  if (error) throw error;
  return data;
}

export async function saveAnnouncement(values) {
  const supabase = await getClient();
  const payload = {
    program_id: values.program_id || null,
    program_level_id: values.program_level_id || null,
    title: String(values.title || "").trim(),
    summary: String(values.summary || "").trim(),
    body: String(values.body || "").trim(),
    category: String(values.category || "General").trim(),
    audience_type: String(values.audience_type || "all_students").trim(),
    priority: values.priority || "normal",
    active: values.active !== false,
    published: values.published !== false,
    published_at: values.published_at || new Date().toISOString()
  };
  const { data, error } = values.id
    ? await supabase.from("announcements").update(payload).eq("id", values.id).select("*").maybeSingle()
    : await supabase.from("announcements").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function saveTimetableEntry(values) {
  const supabase = await getClient();
  const payload = {
    program_id: values.program_id,
    program_level_id: values.program_level_id || null,
    track_id: values.track_id || values.program_level_id || null,
    title: String(values.title || "").trim(),
    description: String(values.description || "").trim(),
    day_of_week: Number(values.day_of_week || 0),
    start_time: values.start_time,
    end_time: values.end_time,
    timezone: "Africa/Lagos",
    delivery_method: values.delivery_method || "online",
    delivery_mode: values.delivery_mode || "online",
    meeting_provider: values.meeting_provider || null,
    meeting_url: values.meeting_url || null,
    tutor_name: values.tutor_name || null,
    active: values.active !== false,
    published: values.published !== false
  };
  const { data, error } = values.id
    ? await supabase.from("timetable_entries").update(payload).eq("id", values.id).select("*").maybeSingle()
    : await supabase.from("timetable_entries").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function saveAssignment(values) {
  const supabase = await getClient();
  const payload = {
    program_id: values.program_id,
    program_level_id: values.program_level_id || null,
    title: String(values.title || "").trim(),
    instructions: String(values.instructions || "").trim(),
    due_at: values.due_at || null,
    maximum_score: Number(values.maximum_score || 100),
    published: Boolean(values.published)
  };
  const { data, error } = values.id
    ? await supabase.from("assignments").update(payload).eq("id", values.id).select("*").maybeSingle()
    : await supabase.from("assignments").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function saveResource(values) {
  const supabase = await getClient();
  const payload = {
    program_id: values.program_id,
    program_level_id: values.program_level_id || null,
    title: String(values.title || "").trim(),
    module_title: String(values.module_title || "").trim(),
    description: String(values.description || "").trim(),
    resource_type: values.resource_type || "link",
    url: values.external_url || values.url || "",
    external_url: values.external_url || values.url || "",
    active: values.active !== false,
    published: values.published !== false,
    sort_order: Number(values.sort_order || 100)
  };
  const { data, error } = values.id
    ? await supabase.from("resources").update(payload).eq("id", values.id).select("*").maybeSingle()
    : await supabase.from("resources").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function saveArticle(values) {
  const supabase = await getClient();
  const payload = {
    program_id: values.program_id || null,
    program_level_id: values.program_level_id || null,
    title: String(values.title || "").trim(),
    summary: String(values.summary || "").trim(),
    body: String(values.body || "").trim(),
    category: String(values.category || "Learning").trim(),
    external_url: values.external_url || null,
    active: values.active !== false,
    published: values.published !== false,
    published_at: values.published_at || new Date().toISOString()
  };
  const { data, error } = values.id
    ? await supabase.from("portal_articles").update(payload).eq("id", values.id).select("*").maybeSingle()
    : await supabase.from("portal_articles").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function scheduleLiveClass(values) {
  const supabase = await getClient();
  const scheduledStart = new Date(values.scheduled_start);
  const scheduledEnd = new Date(values.scheduled_end);
  const payload = {
    program_id: values.program_id,
    track_id: values.track_id || null,
    tutor_id: values.tutor_id || null,
    title: String(values.title || "").trim(),
    description: String(values.description || "").trim(),
    scheduled_start: scheduledStart.toISOString(),
    scheduled_end: scheduledEnd.toISOString(),
    timezone: "Africa/Lagos",
    provider: values.provider || "daily",
    provider_room_id: values.provider_room_id || null,
    provider_room_url: values.provider_room_url || null,
    status: values.status || "scheduled",
    join_opens_at: new Date(scheduledStart.getTime() - 10 * 60 * 1000).toISOString(),
    join_closes_at: scheduledEnd.toISOString()
  };
  const { data, error } = values.id
    ? await supabase.from("live_class_sessions").update(payload).eq("id", values.id).select("*").maybeSingle()
    : await supabase.from("live_class_sessions").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function respondToSupportTicket(values) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .update({
      response: String(values.response || "").trim(),
      status: values.status || "in_progress"
    })
    .eq("id", values.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}
