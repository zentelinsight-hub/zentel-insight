import { getSupabaseClient } from "../supabaseClient";

const defaultPageContent = {
  dashboard: {
    title: "Student Dashboard",
    description: "Review your Zentel Insight learning activity, account status, and recent updates.",
    empty_title: "Your learning activity will be shown here",
    empty_message: "After enrolment and publication, your classes, resources, announcements, and account records will be listed here."
  },
  profile: {
    title: "Student Profile",
    description: "Manage the personal details connected to your Zentel Insight student account.",
    empty_title: "Profile information is unavailable",
    empty_message: "Refresh the page or contact support if your profile details do not load."
  },
  "my-courses": {
    title: "My Courses",
    description: "View the programmes and tracks linked to your verified student account.",
    empty_title: "No active courses yet",
    empty_message: "Your enrolled Zentel Insight courses are listed after a verified enrolment record is linked to your account."
  },
  timetable: {
    title: "Class Timetable",
    description: "View your scheduled Zentel Insight classes, dates, times and approved meeting information.",
    empty_title: "No classes have been scheduled yet",
    empty_message: "Your published timetable is shown after your course schedule is available."
  },
  announcements: {
    title: "Announcements",
    description: "Read official Zentel Insight notices published for your student account and courses.",
    empty_title: "No announcements yet",
    empty_message: "Official student notices are listed after they are published."
  },
  assignments: {
    title: "Assignments",
    description: "Track published assignments for the programmes attached to your account.",
    empty_title: "No assignments have been published",
    empty_message: "Assignments for your active courses are shown after your instructor publishes them."
  },
  resources: {
    title: "Learning Resources",
    description: "Access approved resources for your enrolled Zentel Insight programmes.",
    empty_title: "No resources are available yet",
    empty_message: "Course resources linked to your active enrolments are shown after they are published."
  },
  payments: {
    title: "Payments",
    description: "Review trusted payment records linked to your student account.",
    empty_title: "No payment records are available yet",
    empty_message: "Verified payment and enrolment records linked to your account are shown after they are available."
  },
  certificates: {
    title: "Certificates",
    description: "View certificates issued to your Zentel Insight student account.",
    empty_title: "No certificates have been issued",
    empty_message: "Certificates are shown only after they are officially issued for completed learning."
  },
  notifications: {
    title: "Notifications",
    description: "See private account notifications and student portal updates.",
    empty_title: "No notifications",
    empty_message: "Personal portal notifications are listed when there are updates for your account."
  },
  support: {
    title: "Support Tickets",
    description: "Contact Zentel Insight support and track your student support requests.",
    empty_title: "No support tickets",
    empty_message: "Support requests you create from the portal are listed with their current status."
  },
  settings: {
    title: "Account Settings",
    description: "Manage account access, password recovery, theme preference and session options.",
    empty_title: "Settings are ready",
    empty_message: "Use the available account actions to manage your student portal access."
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

export async function getStudentProfile(user) {
  if (!user?.id) throw new Error("A signed-in learner is required.");
  const supabase = await getClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function updateStudentProfile(userId, values) {
  const supabase = await getClient();
  const payload = {
    full_name: values.full_name.trim(),
    phone: values.phone.trim(),
    date_of_birth: values.date_of_birth || null,
    education_level: values.education_level.trim(),
    address: values.address.trim(),
    profile_completed: true,
    profile_completion: calculateProfileCompletion(values)
  };
  const { data, error } = await supabase.from("profiles").update(payload).eq("id", userId).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export function calculateProfileCompletion(profile = {}) {
  const fields = ["full_name", "email", "phone", "date_of_birth", "education_level", "address"];
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
  const [enrolments, timetable, announcements, assignments, payments, certificates, notifications] = await Promise.all([
    getStudentEnrolments(userId),
    getStudentTimetable(userId),
    getStudentAnnouncements(userId),
    getStudentAssignments(userId),
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
