import { getSupabaseClient } from "../supabaseClient";
import { invokeEdgeFunction } from "../edgeFunctionClient";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const PROFILE_AVATAR_MAX_BYTES = 3 * 1024 * 1024;
export const STUDENT_FEED_MEDIA_BUCKET = "student-feed-media";
export const STUDENT_FEED_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

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
    title: "Active Payment",
    description: "Review the active payment status connected to your assigned Zentel Insight programme.",
    empty_title: "No active payment",
    empty_message: "An Active Payment status appears after Admin assigns and activates your programme."
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

const timetableDayOrder = [0, 1, 2, 3, 4, 5, 6];

function logPortalDataIssue(label, error) {
  if (import.meta.env.DEV) console.info(`Portal ${label} query failed`, error);
}

function getDefaultPortalPageContent(pageSlug) {
  return { page_slug: pageSlug, ...(defaultPageContent[pageSlug] || defaultPageContent.dashboard) };
}

function getEmptyTimetableResult(scope = {}) {
  return {
    records: [],
    resolvedProgramme: scope.resolvedProgramme || null,
    resolvedTrack: scope.resolvedTrack || null,
    source: scope.source || "none",
    needsProgrammeSelection: scope.needsProgrammeSelection !== false,
    todayClass: null,
    nextClass: null
  };
}

async function withPortalFallback(label, queryFn, fallback) {
  try {
    return await queryFn();
  } catch (error) {
    logPortalDataIssue(label, error);
    return typeof fallback === "function" ? fallback(error) : fallback;
  }
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
  if (error) {
    logPortalDataIssue(`page content:${pageSlug}`, error);
    return getDefaultPortalPageContent(pageSlug);
  }
  return data || getDefaultPortalPageContent(pageSlug);
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

export async function getProgramCatalog() {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("programs")
    .select("id, slug, title, short_description, category, display_order")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return normalizeList(data);
}

async function getActiveEnrolmentScope(userId) {
  const enrolments = await withPortalFallback("active enrolment scope", () => getStudentEnrolments(userId), []);
  const active = enrolments.filter((item) => ["active", "completed"].includes(item.status));
  return {
    enrolments,
    active,
    programIds: [...new Set(active.map((item) => item.program_id).filter(Boolean))],
    trackIds: [...new Set(active.map((item) => item.program_level_id).filter(Boolean))]
  };
}

function getOfficialActiveEnrolmentScope(enrolments) {
  const active = normalizeList(enrolments).filter((item) => item.status === "active");
  return {
    active,
    programIds: [...new Set(active.map((item) => item.program_id).filter(Boolean))],
    trackIds: [...new Set(active.map((item) => item.program_level_id).filter(Boolean))]
  };
}

async function getResolvedProgrammeScope(userId) {
  const enrolments = await withPortalFallback("programme enrolments", () => getStudentEnrolments(userId), []);
  const officialScope = getOfficialActiveEnrolmentScope(enrolments);
  if (officialScope.programIds.length) {
    const primary = officialScope.active[0];
    return {
      source: "official",
      needsProgrammeSelection: false,
      enrolments,
      activeEnrolments: officialScope.active,
      programIds: officialScope.programIds,
      trackIds: officialScope.trackIds,
      resolvedProgramme: primary?.programs || null,
      resolvedTrack: primary?.program_levels || null,
      preference: null
    };
  }

  return {
    source: "none",
    needsProgrammeSelection: true,
    enrolments,
    activeEnrolments: [],
    programIds: [],
    trackIds: [],
    resolvedProgramme: null,
    resolvedTrack: null,
    preference: null
  };
}

function parseTimeMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return (hours * 60) + minutes;
}

function getLagosClockParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === "weekday")?.value || "Sunday";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const dayIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(weekday);
  return {
    day: dayIndex >= 0 ? dayIndex : 0,
    minutes: (hour * 60) + minute
  };
}

function getNextWeeklyClass(records) {
  const publishedRecords = normalizeList(records).filter((item) => isPublished(item));
  if (!publishedRecords.length) return null;
  const now = getLagosClockParts();
  return [...publishedRecords]
    .map((item) => {
      const day = Number(item.day_of_week);
      const startMinutes = parseTimeMinutes(item.start_time);
      const dayDelta = ((day - now.day) + 7) % 7;
      const minuteDelta = (dayDelta * 1440) + startMinutes - now.minutes;
      return {
        item,
        delta: minuteDelta >= 0 ? minuteDelta : minuteDelta + (7 * 1440)
      };
    })
    .sort((a, b) => a.delta - b.delta || parseTimeMinutes(a.item.start_time) - parseTimeMinutes(b.item.start_time))[0]?.item || null;
}

function getTodayWeeklyClass(records) {
  const now = getLagosClockParts();
  return normalizeList(records)
    .filter((item) => isPublished(item) && Number(item.day_of_week) === now.day)
    .sort((a, b) => parseTimeMinutes(a.start_time) - parseTimeMinutes(b.start_time))[0] || null;
}

function sortTimetableRecords(records) {
  return normalizeList(records).sort((a, b) => {
    const dayA = Number.isInteger(Number(a.day_of_week)) ? Number(a.day_of_week) : timetableDayOrder.length;
    const dayB = Number.isInteger(Number(b.day_of_week)) ? Number(b.day_of_week) : timetableDayOrder.length;
    return dayA - dayB || parseTimeMinutes(a.start_time) - parseTimeMinutes(b.start_time);
  });
}

export async function getStudentTimetable(userId) {
  const supabase = await getClient();
  const scope = await getResolvedProgrammeScope(userId);
  if (!scope.programIds.length) {
    return getEmptyTimetableResult(scope);
  }
  const { data, error } = await supabase
    .from("timetable_entries")
    .select("*, programs(id, slug, title)")
    .in("program_id", scope.programIds)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) {
    logPortalDataIssue("student timetable", error);
    return getEmptyTimetableResult(scope);
  }
  const records = sortTimetableRecords(normalizeList(data).filter((item) => {
    if (!isPublished(item)) return false;
    const entryTrackId = item.track_id || item.program_level_id;
    return !entryTrackId || !scope.trackIds.length || scope.trackIds.includes(entryTrackId);
  }));
  return {
    records,
    resolvedProgramme: scope.resolvedProgramme,
    resolvedTrack: scope.resolvedTrack,
    source: scope.source,
    needsProgrammeSelection: false,
    todayClass: getTodayWeeklyClass(records),
    nextClass: getNextWeeklyClass(records)
  };
}

export async function getStudentLiveClasses(userId) {
  const supabase = await getClient();
  const scope = await getResolvedProgrammeScope(userId);
  if (!scope.programIds.length) return [];

  let query = supabase
    .from("live_class_sessions")
    .select("*, programs(id, title), program_levels(id, level_name)")
    .in("program_id", scope.programIds)
    .in("status", ["scheduled", "live"])
    .order("scheduled_start", { ascending: true })
    .limit(20);

  if (scope.trackIds.length) {
    query = query.or(`track_id.is.null,track_id.in.(${scope.trackIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  const sessions = normalizeList(data);
  const tutorIds = [...new Set(sessions.map((item) => item.tutor_id).filter(Boolean))];
  if (!tutorIds.length) return sessions;
  const { data: tutorProfiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, title, avatar_path")
    .in("id", tutorIds);
  if (profileError) throw profileError;
  const profileById = new Map(normalizeList(tutorProfiles).map((item) => [item.id, item]));
  return sessions.map((item) => ({ ...item, profiles: profileById.get(item.tutor_id) || null }));
}

export async function getStudentAttendance(userId) {
  if (!userId) return [];
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("live_class_attendance")
    .select("*, live_class_sessions(id, title, scheduled_start, scheduled_end, status, programs(id, title))")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return normalizeList(data);
}

export async function getStudentClassroom(userId) {
  if (!userId) return null;
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("get_resolved_student_classroom");
  if (error) throw error;
  return normalizeList(data)[0] || null;
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

function getArticleFeedType(article) {
  const category = String(article?.category || "Technology").toLowerCase();
  const url = String(article?.external_url || "").toLowerCase();
  if (url.includes("youtube.com") || url.includes("youtu.be") || category.includes("video")) return "Video";
  if (category.includes("event")) return "Event";
  if (category.includes("news")) return "Technology News";
  if (category.includes("trend")) return "Trending";
  return category.includes("blog") ? "Technology Blog" : article?.category || "Technology";
}

export async function getStudentFeed(userId) {
  const supabase = await getClient();
  const [articles, postsResult, externalFeed] = await Promise.all([
    withPortalFallback("feed articles", () => getPortalArticles(userId), []),
    supabase
      .from("student_feed_posts")
      .select("id, user_id, body, image_path, created_at, updated_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
    withPortalFallback("technology feed", async () => {
      const payload = await invokeEdgeFunction("student-tech-feed", {
        body: {},
        timeoutMs: 12000,
        failureMessage: "Technology feed is temporarily unavailable."
      });
      return normalizeList(payload?.items);
    }, [])
  ]);

  if (postsResult.error) logPortalDataIssue("student feed posts", postsResult.error);
  const posts = postsResult.error ? [] : normalizeList(postsResult.data);
  const authorIds = [...new Set(posts.map((item) => item.user_id).filter(Boolean))];
  let profiles = [];
  if (authorIds.length) {
    const profileResult = await supabase.from("profiles").select("id, full_name, avatar_path").in("id", authorIds);
    if (!profileResult.error) profiles = normalizeList(profileResult.data);
  }
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const studentItems = await Promise.all(posts.map(async (post) => {
    let imageUrl = "";
    if (post.image_path) {
      const { data } = await supabase.storage.from(STUDENT_FEED_MEDIA_BUCKET).createSignedUrl(post.image_path, 60 * 60);
      imageUrl = data?.signedUrl || "";
    }
    const author = profileById.get(post.user_id);
    return {
      id: `student-${post.id}`,
      kind: "student",
      author: author?.full_name || "Zentel Insight Student",
      body: post.body,
      imageUrl,
      createdAt: post.created_at
    };
  }));

  const articleItems = articles.map((article) => ({
    id: `article-${article.id}`,
    kind: "technology",
    author: "Zentel Insight",
    title: article.title,
    body: article.summary || article.body,
    category: getArticleFeedType(article),
    externalUrl: article.external_url || "",
    createdAt: article.published_at || article.created_at
  }));

  return [...studentItems, ...articleItems, ...normalizeList(externalFeed)]
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
}

export async function createStudentFeedPost({ userId, body, image }) {
  const text = String(body || "").trim();
  if (!text) throw new Error("Write something before publishing.");
  const supabase = await getClient();
  let imagePath = null;

  if (image) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) throw new Error("Choose a JPEG, PNG or WebP image.");
    if (image.size > STUDENT_FEED_MEDIA_MAX_BYTES) throw new Error("The image must be 5 MB or smaller.");
    const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
    imagePath = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(STUDENT_FEED_MEDIA_BUCKET).upload(imagePath, image, { contentType: image.type, upsert: false });
    if (uploadError) throw uploadError;
  }

  const { data, error } = await supabase
    .from("student_feed_posts")
    .insert({ user_id: userId, body: text, image_path: imagePath })
    .select("id")
    .single();
  if (error) {
    if (imagePath) await supabase.storage.from(STUDENT_FEED_MEDIA_BUCKET).remove([imagePath]);
    throw error;
  }
  return data;
}

export async function getStudentActivePayments(userId) {
  const enrolments = await getStudentEnrolments(userId);
  return enrolments
    .filter((item) => item.status === "active")
    .map((item) => ({
      id: item.id,
      status: "active_payment",
      programs: item.programs || null,
      program_levels: item.program_levels || null,
      activated_at: item.updated_at || item.created_at || null
    }));
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
  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ticketRecords = normalizeList(tickets);
  if (!ticketRecords.length) return [];
  const ticketIds = ticketRecords.map((ticket) => ticket.id);
  const [{ data: messages, error: messagesError }, { data: notifications, error: notificationsError }] = await Promise.all([
    supabase.from("support_ticket_messages").select("*").in("ticket_id", ticketIds).order("created_at", { ascending: true }),
    supabase.from("portal_notifications").select("id, support_ticket_id, read_at").eq("user_id", userId).in("support_ticket_id", ticketIds)
  ]);
  if (messagesError) throw messagesError;
  if (notificationsError) throw notificationsError;
  return ticketRecords.map((ticket) => ({
    ...ticket,
    support_ticket_messages: normalizeList(messages).filter((message) => message.ticket_id === ticket.id),
    unread_reply_count: normalizeList(notifications).filter((notification) => notification.support_ticket_id === ticket.id && !notification.read_at).length
  }));
}

export async function replyToSupportTicket(ticketId, message) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("student_reply_to_support_ticket", {
    target_ticket_id: ticketId,
    reply_message: String(message || "").trim()
  });
  if (error) throw error;
  return data;
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
  const [enrolments, timetableResult, liveClasses, announcements, assignments, resources, activePayments, certificates, notifications] = await Promise.all([
    withPortalFallback("dashboard enrolments", () => getStudentEnrolments(userId), []),
    withPortalFallback("dashboard timetable", () => getStudentTimetable(userId), getEmptyTimetableResult()),
    withPortalFallback("dashboard live classes", () => getStudentLiveClasses(userId), []),
    withPortalFallback("dashboard announcements", () => getStudentAnnouncements(userId), []),
    withPortalFallback("dashboard assignments", () => getStudentAssignments(userId), []),
    withPortalFallback("dashboard resources", () => getStudentResources(userId), []),
    withPortalFallback("dashboard active payments", () => getStudentActivePayments(userId), []),
    withPortalFallback("dashboard certificates", () => getStudentCertificates(userId), []),
    withPortalFallback("dashboard notifications", () => getStudentNotifications(userId), [])
  ]);

  const activeEnrolments = enrolments.filter((item) => item.status === "active");
  const timetable = timetableResult.records || [];

  return {
    enrolments,
    activeEnrolments,
    timetable,
    resolvedProgramme: timetableResult.resolvedProgramme,
    resolvedTrack: timetableResult.resolvedTrack,
    programmeSource: timetableResult.source,
    needsProgrammeSelection: timetableResult.needsProgrammeSelection,
    upcomingClass: timetableResult.nextClass,
    todayClass: timetableResult.todayClass,
    liveClasses,
    announcements: announcements.slice(0, 3),
    resources: resources.slice(0, 4),
    pendingAssignments: assignments.filter((item) => {
      const submission = normalizeList(item.assignment_submissions).find((entry) => entry.user_id === userId);
      return !submission || !["submitted", "graded"].includes(submission.status);
    }),
    activePayments,
    certificates,
    notifications: notifications.slice(0, 5),
    unreadNotifications: notifications.filter((item) => !item.read_at)
  };
}
