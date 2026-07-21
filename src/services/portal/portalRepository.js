import { getSupabaseClient } from "../supabaseClient";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const PROFILE_AVATAR_MAX_BYTES = 3 * 1024 * 1024;

const avatarContentTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const defaultPageContent = {
  dashboard: {
    title: "Student Dashboard",
    description: "View your Zentel Insight learning activity, upcoming classes, current programmes, announcements, assignments and account information in one place.",
    empty_title: "Your learning space is ready",
    empty_message: "Your enrolled programmes, class schedule and learning activities will appear here as they are assigned to your account."
  },
  profile: {
    title: "My Profile",
    description: "Review and update the personal information connected to your Zentel Insight student account.",
    empty_title: "Complete your learner profile",
    empty_message: "Add your current contact and education information so Zentel Insight can provide accurate class and account support."
  },
  "my-courses": {
    title: "My Courses",
    description: "View the programmes and learning tracks currently connected to your Zentel Insight account.",
    empty_title: "No active programme yet",
    empty_message: "When an enrolment has been confirmed and linked to your account, it will appear here."
  },
  timetable: {
    title: "Class Timetable",
    description: "View your published weekly class schedule, class times, programme details and available meeting information.",
    empty_title: "No class has been assigned yet",
    empty_message: "Your timetable will appear here after a programme enrolment and class schedule have been assigned to your account."
  },
  announcements: {
    title: "Announcements",
    description: "Read important academic information, class notices, platform updates and messages from Zentel Insight.",
    empty_title: "No announcements available",
    empty_message: "New information from Zentel Insight will appear here when it is published."
  },
  assignments: {
    title: "Assignments",
    description: "View learning tasks, instructions, submission deadlines and feedback connected to your active programme.",
    empty_title: "No assignments available",
    empty_message: "Published assignments for your programme will appear here."
  },
  resources: {
    title: "Learning Resources",
    description: "Access approved documents, templates, class links and learning materials connected to your programme.",
    empty_title: "No resources available",
    empty_message: "Learning materials will appear here when they are published for your programme."
  },
  payments: {
    title: "Payment Records",
    description: "View trusted payment records and enrolment transactions connected to your Zentel Insight student account.",
    empty_title: "No payment records available",
    empty_message: "Verified payment records linked to your student account will appear here."
  },
  certificates: {
    title: "Certificates",
    description: "View certificates issued after eligible Zentel Insight programmes have been completed and approved.",
    empty_title: "No certificates issued yet",
    empty_message: "Eligible certificates will appear here after programme completion and approval."
  },
  notifications: {
    title: "Notifications",
    description: "View account updates, class reminders, assignment notices and other information intended for you.",
    empty_title: "You have no notifications",
    empty_message: "New account and learning notifications will appear here."
  },
  articles: {
    title: "Learning Articles",
    description: "Read practical articles designed to improve your digital skills, study habits and professional development.",
    empty_title: "No articles published yet",
    empty_message: "New learning articles from Zentel Insight will appear here."
  },
  support: {
    title: "Student Support",
    description: "Ask for help with your account, classes, timetable, learning materials or other Zentel Insight services.",
    empty_title: "No support tickets",
    empty_message: "Support requests you create from the portal are listed with their current status."
  },
  settings: {
    title: "Account Settings",
    description: "Manage your Portal preferences, security options, notifications and active session.",
    empty_title: "Settings are ready",
    empty_message: "Use the available controls to manage your Portal experience."
  }
};

function isPublished(row) {
  return row?.published !== false && row?.active !== false && row?.status !== "draft";
}

function normalizeList(data) {
  return Array.isArray(data) ? data : [];
}

async function getClient() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Student Portal data could not be reached.");
  return supabase;
}

export async function getPortalPageContent(pageSlug) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("portal_page_content")
    .select("*")
    .eq("page_slug", pageSlug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  return data || { page_slug: pageSlug, ...defaultPageContent[pageSlug] };
}

async function withProfileAvatarUrl(profile, supabase) {
  if (!profile?.avatar_path) return profile;
  const { data, error } = await supabase
    .storage
    .from(PROFILE_AVATAR_BUCKET)
    .createSignedUrl(profile.avatar_path, 60 * 60);
  if (error) return { ...profile, avatar_url: "" };
  return { ...profile, avatar_url: data?.signedUrl || "" };
}

export async function getStudentProfile(user) {
  if (!user?.id) throw new Error("A signed-in learner is required.");
  const supabase = await getClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data ? withProfileAvatarUrl(data, supabase) : null;
}

export async function attachProfileAvatarUrl(profile) {
  if (!profile) return null;
  const supabase = await getClient();
  return withProfileAvatarUrl(profile, supabase);
}

function getAvatarExtension(file) {
  return avatarContentTypes[file?.type] || "";
}

function validateAvatarFile(file) {
  if (!file) return;
  if (!getAvatarExtension(file)) {
    throw new Error("Upload a JPEG, PNG or WebP image for your profile picture.");
  }
  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error("Profile picture must be 3 MB or smaller.");
  }
}

async function uploadAvatarFile(supabase, userId, file) {
  validateAvatarFile(file);
  const extension = getAvatarExtension(file);
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return path;
}

export async function updateStudentProfile(userId, values) {
  const supabase = await getClient();
  let uploadedAvatarPath = "";
  try {
    const nextAvatarPath = values.avatarFile
      ? await uploadAvatarFile(supabase, userId, values.avatarFile)
      : values.removeAvatar
        ? null
        : values.avatar_path || null;

    uploadedAvatarPath = values.avatarFile ? nextAvatarPath : "";

    const payload = {
      full_name: values.full_name.trim(),
      phone: values.phone.trim(),
      date_of_birth: values.date_of_birth || null,
      education_level: values.education_level.trim(),
      address: values.address.trim(),
      avatar_path: nextAvatarPath,
      profile_completed: true,
      profile_completion: calculateProfileCompletion({ ...values, avatar_path: nextAvatarPath })
    };
    const { data, error } = await supabase.from("profiles").update(payload).eq("id", userId).select("*").maybeSingle();
    if (error) throw error;

    const previousAvatarPath = values.previous_avatar_path || "";
    if (previousAvatarPath && previousAvatarPath !== nextAvatarPath) {
      await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([previousAvatarPath]);
    }

    return data ? withProfileAvatarUrl(data, supabase) : data;
  } catch (error) {
    if (uploadedAvatarPath) {
      await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([uploadedAvatarPath]);
    }
    throw error;
  }
}

export function calculateProfileCompletion(profile = {}) {
  const fields = ["full_name", "phone", "date_of_birth", "education_level", "address", "avatar_path"];
  const completed = fields.filter((field) => String(profile[field] || "").trim()).length;
  return Math.round((completed / fields.length) * 100);
}

export async function getStudentEnrolments(userId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select("*, programs(id, slug, title), program_levels(id, level_name, duration_text, level_description, price_kobo)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return normalizeList(data);
}

async function getActiveEnrolmentScope(userId) {
  const enrolments = await getStudentEnrolments(userId);
  const active = enrolments.filter((item) => ["active", "completed"].includes(item.status));
  return {
    enrolments,
    active,
    programIds: [...new Set(active.map((item) => item.program_id).filter(Boolean))],
    trackIds: [...new Set(active.map((item) => item.program_level_id).filter(Boolean))]
  };
}

export async function getStudentTimetable(userId) {
  const supabase = await getClient();
  const scope = await getActiveEnrolmentScope(userId);
  if (!scope.programIds.length) return [];
  const { data, error } = await supabase
    .from("timetable_entries")
    .select("*, programs(id, slug, title), program_levels(id, level_name)")
    .in("program_id", scope.programIds)
    .order("class_date", { ascending: true, nullsFirst: false })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return normalizeList(data).filter((item) => isPublished(item));
}

export async function getStudentAnnouncements(userId) {
  const supabase = await getClient();
  const scope = await getActiveEnrolmentScope(userId);
  const { data, error } = await supabase
    .from("announcements")
    .select("*, programs(id, slug, title)")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return normalizeList(data).filter((item) => isPublished(item) && (!item.program_id || scope.programIds.includes(item.program_id)));
}

export async function getStudentAssignments(userId) {
  const supabase = await getClient();
  const scope = await getActiveEnrolmentScope(userId);
  if (!scope.programIds.length) return [];
  const { data, error } = await supabase
    .from("assignments")
    .select("*, programs(id, slug, title), program_levels(id, level_name), assignment_submissions(*)")
    .in("program_id", scope.programIds)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return normalizeList(data).filter((item) => isPublished(item));
}

export async function getStudentResources(userId) {
  const supabase = await getClient();
  const scope = await getActiveEnrolmentScope(userId);
  if (!scope.programIds.length) return [];
  const { data, error } = await supabase
    .from("resources")
    .select("*, programs(id, slug, title), program_levels(id, level_name)")
    .in("program_id", scope.programIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return normalizeList(data).filter((item) => isPublished(item));
}

export async function getPortalArticles(userId) {
  const supabase = await getClient();
  const scope = await getActiveEnrolmentScope(userId);
  const { data, error } = await supabase
    .from("portal_articles")
    .select("*, programs(id, slug, title), program_levels(id, level_name)")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return normalizeList(data).filter((item) => {
    if (!isPublished(item)) return false;
    if (item.expires_at && new Date(item.expires_at) < new Date()) return false;
    if (!item.program_id) return true;
    if (!scope.programIds.includes(item.program_id)) return false;
    return !item.program_level_id || scope.trackIds.includes(item.program_level_id);
  });
}

export async function getStudentPayments(userId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return normalizeList(data);
}

export async function getStudentCertificates(userId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("certificates")
    .select("*, enrolments(id, programs(title), program_levels(level_name))")
    .eq("user_id", userId)
    .order("issued_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return normalizeList(data);
}

export async function getStudentNotifications(userId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("portal_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return normalizeList(data);
}

export async function markNotificationRead(userId, notificationId) {
  const supabase = await getClient();
  const { error } = await supabase
    .from("portal_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId) {
  const supabase = await getClient();
  const { error } = await supabase
    .from("portal_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

export async function getStudentSupportTickets(userId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return normalizeList(data);
}

export async function getStudentPreferences(userId) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("student_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || {
    user_id: userId,
    email_notifications: true,
    portal_reminders: true,
    session_security_warnings: true
  };
}

export async function updateStudentPreferences(userId, values) {
  const supabase = await getClient();
  const payload = {
    user_id: userId,
    email_notifications: Boolean(values.email_notifications),
    portal_reminders: Boolean(values.portal_reminders),
    session_security_warnings: Boolean(values.session_security_warnings)
  };
  const { data, error } = await supabase
    .from("student_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSupportTicket(userId, values) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      user_id: userId,
      subject: values.subject.trim(),
      category: values.category,
      message: values.message.trim(),
      status: "open"
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getStudentDashboard(userId) {
  const [enrolments, timetable, announcements, assignments, resources, payments, certificates, notifications] = await Promise.all([
    getStudentEnrolments(userId),
    getStudentTimetable(userId),
    getStudentAnnouncements(userId),
    getStudentAssignments(userId),
    getStudentResources(userId),
    getStudentPayments(userId),
    getStudentCertificates(userId),
    getStudentNotifications(userId)
  ]);

  const activeEnrolments = enrolments.filter((item) => item.status === "active");
  const upcomingClass = timetable.find((item) => {
    if (!item.class_date) return true;
    return new Date(`${item.class_date}T${item.start_time || "00:00"}`) >= new Date();
  }) || null;

  return {
    enrolments,
    activeEnrolments,
    timetable,
    upcomingClass,
    announcements: announcements.slice(0, 3),
    resources: resources.slice(0, 4),
    pendingAssignments: assignments.filter((item) => {
      const submission = normalizeList(item.assignment_submissions).find((entry) => entry.user_id === userId);
      return !submission || !["submitted", "graded"].includes(submission.status);
    }),
    payments,
    certificates,
    notifications: notifications.slice(0, 5),
    unreadNotifications: notifications.filter((item) => !item.read_at)
  };
}

export function hasReliablePaymentStatus(payment) {
  return ["success", "verified", "paid"].includes(String(payment?.status || payment?.provider_status || "").toLowerCase())
    || Boolean(payment?.verified_at);
}
