import { Link, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileQuestion,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Moon,
  ReceiptText,
  School,
  Sparkles,
  ShieldCheck,
  Sun,
  Settings,
  UserRound,
  Video,
  WalletCards
} from "lucide-react";
import LiveClassCards from "../components/LiveClassCards";
import ProgramChatPanel from "../components/ProgramChatPanel";
import PortalIdCard from "../components/portal/PortalIdCard";
import PortalAvatarUpload from "../components/portal/PortalAvatarUpload";
import PortalBackButton from "../components/portal/PortalBackButton";
import PortalNavigationPage from "../components/portal/PortalNavigationPage";
import PortalShell from "../components/portal/PortalShell";
import PortalSwitch from "../components/portal/PortalSwitch";
import PortalCommunityFeed from "../components/portal/PortalCommunityFeed";
import { useAuth } from "../context/authHooks";
import { useTheme } from "../context/themeHooks";
import { siteConfig } from "../data/site";
import {
  usePortalPageContent,
  usePortalArticles,
  useStudentAnnouncements,
  useStudentAssignments,
  useStudentAttendance,
  useStudentCertificates,
  useStudentClassroom,
  useStudentEnrolments,
  useStudentLiveClasses,
  useStudentNotifications,
  useStudentActivePayments,
  useStudentPreferences,
  useStudentProfile,
  useStudentResources,
  useStudentSupportTickets,
  useStudentTimetable
} from "../hooks/portal/usePortalData";
import {
  createSupportTicket,
  calculateProfileCompletion,
  markAllNotificationsRead,
  markNotificationRead,
  replyToSupportTicket,
  updateStudentPreferences,
} from "../services/portal/portalRepository";
import { claimMyEnrolments } from "../services/authService";
import { getProgramChatUnreadCounts } from "../services/chatService";
import { disableDeviceNotifications, enableDeviceNotifications, getDeviceNotificationState } from "../services/pushNotifications";
import { formatDateTime } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";
import { useAsyncData } from "../hooks/useAsyncData";

const pageMeta = {
  dashboard: "/portal",
  profile: "/portal/profile",
  "my-courses": "/portal/my-courses",
  classroom: "/portal/classroom",
  timetable: "/portal/timetable",
  announcements: "/portal/announcements",
  assignments: "/portal/assignments",
  resources: "/portal/resources",
  "zentel-ai": "/portal/zentel-ai",
  payments: "/portal/payments",
  certificates: "/portal/certificates",
  notifications: "/portal/notifications",
  articles: "/portal/articles",
  support: "/portal/support",
  settings: "/portal/settings"
};

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
}

function formatTime(value) {
  if (!value) return "Time pending";
  return String(value).slice(0, 5);
}

function formatScheduleDay(item) {
  if (item?.class_date) return formatDate(item.class_date);
  const day = Number(item?.day_of_week);
  return Number.isInteger(day) && day >= 0 && day < dayNames.length ? dayNames[day] : "Schedule pending";
}

function getCourseName(item) {
  return item?.programs?.title || item?.program_title || item?.product_name || "Zentel Insight programme";
}

function getTrackName(item) {
  return item?.program_levels?.level_name || item?.selected_level || item?.track_name || "Track not specified";
}

function getInitials(profile, user) {
  const source = profile?.full_name || user?.email || "Learner";
  const words = String(source).replace(/@.*/, "").trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "L").concat(words[1]?.[0] || "").toUpperCase();
}

function getProgrammeSummary(enrolments = []) {
  const active = enrolments.filter((item) => item.status === "active");
  if (active.length) return `${active.length} active programme${active.length === 1 ? "" : "s"}`;
  if (enrolments.length) return "Programme records pending activation";
  return "Programme assignment pending";
}

function getProgrammeSourceLabel(source) {
  if (source === "official") return "Official enrolment";
  return "Admin assignment pending";
}

function formatClassSummary(item) {
  if (!item) return "No class";
  return `${formatScheduleDay(item)} ${formatTime(item.start_time)} - ${formatTime(item.end_time)}`;
}

function dispatchPortalDataRefresh() {
  window.dispatchEvent(new Event("zentel:portal-data-refresh"));
}

function PortalAvatar({ profile, user, size = "md" }) {
  const initials = getInitials(profile, user);
  return (
    <span className={`portal-avatar ${size}`}>
      {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{initials}</span>}
    </span>
  );
}

function PortalLoading({ label = "Loading information" }) {
  return (
    <div className="portal-local-loading" role="status" aria-live="polite">
      <LoaderCircle className="spin-icon" size={20} aria-hidden="true" />
      <span>{label}...</span>
    </div>
  );
}

function PortalError({ message, onRetry }) {
  if (import.meta.env.DEV && message) console.info("Portal visible error state", message);
  return (
    <div className="notice-card portal-state-card">
      <p className="eyebrow">Student Portal</p>
      <h2>We could not load this information</h2>
      <p>Refresh this section and try again. If the issue continues, contact Zentel Insight support.</p>
      <button className="button button-primary" type="button" onClick={onRetry}>Try Again</button>
    </div>
  );
}

function PortalEmpty({ content, action }) {
  return (
    <div className="notice-card portal-state-card">
      <p className="eyebrow">Nothing to show yet</p>
      <h2>{content?.empty_title || "Your portal section is ready"}</h2>
      <p>{content?.empty_message || "Approved student information will appear here when it is connected to your account."}</p>
      {action}
    </div>
  );
}

function PortalPage({ slug, children, actions, title, backTo }) {
  const contentQuery = usePortalPageContent(slug);
  const content = contentQuery.data;
  const pageTitle = title || content?.title || "Student Portal";

  usePageMeta({
    path: pageMeta[slug] || "/portal",
    title: pageTitle,
    description: content?.description || "Zentel Insight Student Portal.",
    robots: "noindex,nofollow"
  });

  return (
    <div className="portal-page">
      <div className="portal-page-heading">
        <div>
          <div className="portal-title-row"><PortalBackButton fallback={backTo || (slug === "payments" ? "/portal/finance" : ["my-courses", "classroom", "timetable", "assignments", "resources", "certificates"].includes(slug) ? "/portal/learning" : "/portal/more")} label={`Back from ${pageTitle}`} /><h2>{pageTitle}</h2></div>
        </div>
        {actions}
      </div>
      {contentQuery.error ? <PortalError message={contentQuery.error} onRetry={contentQuery.refetch} /> : children(content)}
    </div>
  );
}

export function PortalLayout() {
  const { profile, user } = useAuth();
  const enrolmentsQuery = useStudentEnrolments(user?.id);
  const notificationsQuery = useStudentNotifications(user?.id);
  const chatUnreadQuery = useAsyncData(getProgramChatUnreadCounts, [], { enabled: Boolean(user?.id), errorMessage: "Classroom unread count could not be loaded." });
  const enrolments = enrolmentsQuery.data || [];
  const refetchEnrolments = enrolmentsQuery.refetch;
  const displayName = profile?.full_name || user?.email || "Learner";
  const unreadNotificationCount = (notificationsQuery.data || []).filter((item) => !item.read_at).length;
  const unreadChatCount = Object.values(chatUnreadQuery.data || {}).reduce((total, value) => total + Number(value || 0), 0);
  const refetchChatUnread = chatUnreadQuery.refetch;

  useEffect(() => {
    const refreshUnread = (event) => {
      const table = event.detail?.table;
      if (["program_chat_messages", "program_chat_members", "message_read_receipts"].includes(table)) refetchChatUnread();
    };
    window.addEventListener("zentel:portal-realtime", refreshUnread);
    return () => window.removeEventListener("zentel:portal-realtime", refreshUnread);
  }, [refetchChatUnread]);

  useEffect(() => {
    claimMyEnrolments()
      .then(() => {
        refetchEnrolments();
        dispatchPortalDataRefresh();
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.info("Portal enrolment claim failed", error);
      });
  // Refetch functions are stable in the real hook; user id is the intended claim boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  usePageMeta({
    path: "/portal",
    title: "Student Portal",
    description: "Protected Zentel Insight student portal.",
    robots: "noindex,nofollow"
  });

  return (
    <PortalShell
      sidebar={{
        homeTo: "/portal",
        brandLabel: "Student Portal",
        profileName: displayName,
        profileDetail: getProgrammeSummary(enrolments),
        avatarUrl: profile?.avatar_url,
        profileInitial: getInitials(profile, user),
        profileTo: "/portal/profile",
        notificationItem: { to: "/portal/notifications", label: "Notifications", badge: unreadNotificationCount },
        navLabel: "Student portal",
        primaryItems: [
          { to: "/portal", label: "Home", Icon: LayoutDashboard, end: true },
          { to: "/portal/learning", label: "Learning", Icon: GraduationCap },
          { to: "/portal/messages", label: "Messages", Icon: MessageSquare, badge: unreadChatCount },
          { to: "/portal/zentel-ai", label: "Zentel AI", Icon: Sparkles },
          { to: "/portal/more", label: "More", Icon: MoreHorizontal }
        ]
      }}
      header={{
        eyebrow: "Welcome back",
        title: displayName,
        status: <PortalAvatar profile={profile} user={user} size="sm" />
      }}
      idleEnabled={Boolean(user?.id)}
      realtimeTables={[
        "announcements",
        "assignments",
        "ai_conversations",
        "ai_credit_wallets",
        "ai_messages",
        "ai_subscriptions",
        "certificates",
        "enrolments",
        "live_class_sessions",
        "message_read_receipts",
        "portal_articles",
        "portal_notifications",
        "program_chat_members",
        "program_chat_messages",
        "program_chat_reactions",
        "program_levels",
        "resources",
        "profiles",
        "student_feed_posts",
        "student_feed_refresh_events",
        "support_ticket_messages",
        "support_tickets",
        "timetable_entries",
        "tutor_program_assignments"
      ]}
    >
        <Outlet />
    </PortalShell>
  );
}

export function StudentLearningPage() {
  return <PortalNavigationPage eyebrow="Student Portal" title="Learning" items={[
    { to: "/portal/learning/programme", label: "My Programme", description: "Programme and assigned track", Icon: GraduationCap },
    { to: "/portal/learning/classroom", label: "My Classroom", description: "Classroom and Tutor information", Icon: School },
    { to: "/portal/learning/modules", label: "Modules & Lessons", description: "Published learning modules", Icon: BookOpen },
    { to: "/portal/learning/timetable", label: "Timetable", description: "Weekly class schedule", Icon: CalendarDays },
    { to: "/portal/learning/assignments", label: "Assignments", description: "Tasks, submissions and feedback", Icon: FileText },
    { to: "/portal/learning/quizzes", label: "Quizzes & Tests", description: "Online knowledge checks", Icon: FileQuestion },
    { to: "/portal/learning/resources", label: "Learning Resources", description: "Approved learning materials", Icon: BookOpen },
    { to: "/portal/learning/certificates", label: "Certificates", description: "Issued certificates", Icon: Award }
  ]} />;
}

export function StudentMessagesPage() {
  return <PortalNavigationPage eyebrow="Student Portal" title="Messages" description="Choose a conversation." items={[
    { to: "/portal/messages/classroom", label: "Classroom Chat", description: "Message your Tutor and classmates", Icon: MessageSquare }
  ]} />;
}

export function StudentAiPage() {
  return <PortalNavigationPage eyebrow="Student Portal" title="Zentel AI" description="Choose an AI workspace." items={[
    { to: "/portal/zentel-ai/new", label: "New Chat", description: "Start a conversation", Icon: Sparkles },
    { to: "/portal/zentel-ai/history", label: "History", description: "Find previous conversations", Icon: Clock3 },
    { to: "/portal/zentel-ai/usage", label: "Credits & Usage", description: "Review available credits and usage", Icon: ListChecks },
    { to: "/portal/zentel-ai/plans", label: "Plans", description: "Compare available AI plans", Icon: WalletCards },
    { to: "/portal/zentel-ai/billing", label: "Billing", description: "AI billing information", Icon: ReceiptText },
    { to: "/portal/zentel-ai/settings", label: "Settings", description: "Conversation preferences", Icon: Settings }
  ]} />;
}

export function StudentFinancePage() {
  return <PortalNavigationPage eyebrow="Student Portal" title="Finance" items={[
    { to: "/portal/finance/payments", label: "Active Payment", description: "Current programme payment status", Icon: CreditCard },
    { to: "/portal/finance/loans", label: "Loans", description: "Loan status when available", Icon: WalletCards }
  ]} />;
}

export function StudentProgressPage() {
  return <PortalNavigationPage eyebrow="Student Portal" title="Progress" items={[
    { to: "/portal/progress/grades", label: "Grades", description: "Published assessment results", Icon: Award },
    { to: "/portal/progress/performance", label: "Performance", description: "Overall learning performance", Icon: ListChecks },
    { to: "/portal/attendance", label: "Attendance", description: "Class participation history", Icon: CheckCircle2 }
  ]} />;
}

export function StudentMorePage() {
  return <PortalNavigationPage eyebrow="Student Portal" title="More" items={[
    { to: "/portal/progress", label: "Progress", description: "Grades and learning performance", Icon: Award },
    { to: "/portal/live-classes", label: "Live Classes", description: "Scheduled and active sessions", Icon: Video },
    { to: "/portal/attendance", label: "Attendance", description: "Class participation records", Icon: CheckCircle2 },
    { to: "/portal/announcements", label: "Announcements", description: "Academic and platform notices", Icon: Bell },
    { to: "/portal/finance", label: "Finance", description: "Active payment and loan status", Icon: CreditCard },
    { to: "/portal/profile", label: "Profile", description: "Your read-only account credentials", Icon: UserRound },
    { to: "/portal/support", label: "Support", description: "Tickets and support replies", Icon: LifeBuoy },
    { to: "/portal/settings", label: "Security & Settings", description: "Theme, preferences and session security", Icon: ShieldCheck }
  ]} />;
}

export function PortalOverview() {
  usePageMeta({ path: "/portal", title: "Home", description: "Student and technology feed.", robots: "noindex,nofollow" });
  return <PortalCommunityFeed eyebrow="Student Portal" />;
}

function StudentClassroomPage() {
  const { user } = useAuth();
  const classroom = useStudentClassroom(user?.id);

  return (
    <PortalPage slug="classroom">
      {(content) => {
        if (classroom.loading) return <PortalLoading label="Loading classroom" />;
        if (classroom.error) return <PortalError message={classroom.error} onRetry={classroom.refetch} />;
        if (!classroom.data) {
          return (
            <PortalEmpty
              content={{
                ...content,
                empty_title: "Programme assignment pending",
                empty_message: "Your Classroom appears after Admin assigns and activates your official programme enrolment."
              }}
            />
          );
        }

        const tutorName = classroom.data.tutor_id
          ? `${classroom.data.tutor_title || ""} ${classroom.data.tutor_first_name || "Tutor"}`.trim()
          : "Pending assignment";
        return (
          <div className="portal-page">
            <div className="portal-compact-heading">
              <div>
                <p className="eyebrow">Classroom</p>
                <h1>{classroom.data.classroom_name || classroom.data.program_title}</h1>
              </div>
            </div>
            <dl className="portal-detail-rows">
              <div><dt>Programme</dt><dd>{classroom.data.program_title}</dd></div>
              <div><dt>Track</dt><dd>{classroom.data.track_name || "All tracks"}</dd></div>
              <div><dt>Tutor</dt><dd>{classroom.data.tutor_id ? tutorName : "Pending assignment"}</dd></div>
              <div><dt>Specialisation</dt><dd>{classroom.data.tutor_specialisation || "Not recorded"}</dd></div>
            </dl>
            <nav className="portal-destination-list compact" aria-label="Classroom pages">
              <Link to="/portal/messages/classroom"><span className="portal-destination-icon"><MessageSquare size={18} /></span><span className="portal-destination-copy"><strong>Chat</strong><small>Open your programme conversation</small></span><span aria-hidden="true">›</span></Link>
              <Link to="/portal/live-classes"><span className="portal-destination-icon"><Video size={18} /></span><span className="portal-destination-copy"><strong>Live Classes</strong><small>View and join scheduled sessions</small></span><span aria-hidden="true">›</span></Link>
              <Link to="/portal/attendance"><span className="portal-destination-icon"><CheckCircle2 size={18} /></span><span className="portal-destination-copy"><strong>Attendance</strong><small>Review your participation history</small></span><span aria-hidden="true">›</span></Link>
            </nav>
          </div>
        );
      }}
    </PortalPage>
  );
}

export function StudentClassroomChatPage() {
  usePageMeta({ path: "/portal/messages/classroom", title: "Classroom Chat", description: "Your private programme classroom conversation.", robots: "noindex,nofollow" });
  return <div className="portal-page chat-route-page"><ProgramChatPanel audience="student" standalone backTo="/portal/messages" /></div>;
}

export function StudentLiveClassesPage() {
  const { user } = useAuth();
  const liveClasses = useStudentLiveClasses(user?.id);
  return <PortalPage slug="classroom">{() => <div className="portal-page"><div className="portal-compact-heading"><div><p className="eyebrow">Classroom</p><h1>Live Classes</h1></div></div>{liveClasses.loading ? <PortalLoading label="Loading live classes" /> : liveClasses.error ? <PortalError message={liveClasses.error} onRetry={liveClasses.refetch} /> : <LiveClassCards sessions={liveClasses.data || []} emptyMessage="No live class is scheduled. Your Tutor will notify you when a session is available." />}</div>}</PortalPage>;
}

export function StudentAttendancePage() {
  const { user } = useAuth();
  const attendance = useStudentAttendance(user?.id);
  return <PortalPage slug="classroom">{() => <div className="portal-page"><div className="portal-compact-heading"><div><p className="eyebrow">Classroom</p><h1>Attendance</h1></div></div>{attendance.loading ? <PortalLoading label="Loading attendance" /> : attendance.error ? <PortalError message={attendance.error} onRetry={attendance.refetch} /> : (attendance.data || []).length ? <div className="portal-list">{attendance.data.map((record) => <article className="portal-record-card" key={record.id}><div><p className="eyebrow">{record.attendance_status}</p><h3>{record.live_class_sessions?.title || "Live class"}</h3><p>{record.live_class_sessions?.programs?.title || "Programme"}</p></div><dl className="portal-mini-details"><div><dt>Joined</dt><dd>{formatDateTime(record.joined_at)}</dd></div><div><dt>Left</dt><dd>{record.left_at ? formatDateTime(record.left_at) : "Session active"}</dd></div></dl></article>)}</div> : <PortalEmpty content={{ empty_title: "No attendance records yet", empty_message: "Your attendance appears after you join a live class." }} />}</div>}</PortalPage>;
}

function MyCoursesPage() {
  const { user } = useAuth();
  const query = useStudentEnrolments(user?.id);
  const timetable = useStudentTimetable(user?.id);
  const assignments = useStudentAssignments(user?.id);
  const resources = useStudentResources(user?.id);
  return (
    <PortalPage slug="my-courses">
      {(content) => {
        if (query.loading || timetable.loading || assignments.loading || resources.loading) return <PortalLoading label="Loading courses" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} action={<Link className="button button-primary" to="/programs">Browse Programs</Link>} />;
        return (
          <div className="portal-list">
            {records.map((item) => {
              const programId = item.program_id || item.programs?.id;
              const nextClass = (timetable.data?.records || []).find((entry) => entry.program_id === programId);
              const assignmentCount = (assignments.data || []).filter((entry) => entry.program_id === programId).length;
              const resourceCount = (resources.data || []).filter((entry) => entry.program_id === programId).length;
              return (
                <article className="portal-record-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{String(item.status || "pending").replace(/_/g, " ")}</p>
                    <h3>{getCourseName(item)}</h3>
                    <p>{getTrackName(item)}</p>
                  </div>
                  <dl className="portal-mini-details">
                    <div><dt>Enrolled</dt><dd>{formatDate(item.enrolled_date || item.created_at)}</dd></div>
                    <div><dt>Progress</dt><dd>{item.progress_percentage || 0}%</dd></div>
                    <div><dt>Next class</dt><dd>{nextClass ? `${formatScheduleDay(nextClass)} at ${formatTime(nextClass.start_time)}` : "Schedule pending"}</dd></div>
                    <div><dt>Assignments</dt><dd>{assignmentCount}</dd></div>
                    <div><dt>Resources</dt><dd>{resourceCount}</dd></div>
                  </dl>
                  {item.status === "active" && resourceCount > 0 ? <Link className="button button-secondary" to="/portal/resources">Continue Learning</Link> : null}
                </article>
              );
            })}
          </div>
        );
      }}
    </PortalPage>
  );
}

function TimetablePage() {
  const { user } = useAuth();
  const query = useStudentTimetable(user?.id);
  return (
    <PortalPage slug="timetable">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading timetable" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const timetableData = Array.isArray(query.data) ? { records: query.data } : query.data || {};
        const records = timetableData.records || [];
        const programmeName = timetableData.resolvedProgramme?.title || "Programme not selected";
        if (timetableData.needsProgrammeSelection) {
          return (
            <PortalEmpty
              content={{
                ...content,
                empty_title: "Programme assignment pending",
                empty_message: "Admin must assign and activate your programme before a timetable can be shown."
              }}
              action={<Link className="button button-primary" to="/portal/support">Contact Support</Link>}
            />
          );
        }
        if (!records.length) {
          return (
            <div className="notice-card portal-state-card">
              <p className="eyebrow">{programmeName}</p>
              <h2>No timetable has been published for your programme yet.</h2>
              <p>Published online class times will appear here as soon as they are available.</p>
            </div>
          );
        }
        return (
          <>
            <article className="notice-card timetable-summary-card">
              <div>
                <p className="eyebrow">{getProgrammeSourceLabel(timetableData.source)}</p>
                <h3>{programmeName}</h3>
                <p>{records.length} published weekly class {records.length === 1 ? "entry" : "entries"} in Africa/Lagos time.</p>
              </div>
              {timetableData.nextClass ? (
                <span className="portal-tag success"><Clock3 size={14} aria-hidden="true" /> Next: {formatClassSummary(timetableData.nextClass)}</span>
              ) : null}
            </article>
            <div className="portal-list timetable-card-list">
              {records.map((item) => (
                <article className="portal-record-card timetable-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{formatScheduleDay(item)} | {item.timezone || "Africa/Lagos"}</p>
                    <h3>{item.title}</h3>
                    <p>{getCourseName(item)}{(item.program_levels?.level_name || timetableData.resolvedTrack?.level_name) ? ` - ${item.program_levels?.level_name || timetableData.resolvedTrack.level_name}` : ""}</p>
                    {item.description ? <p>{item.description}</p> : null}
                  </div>
                  <dl className="portal-mini-details">
                    <div><dt>Start</dt><dd>{formatTime(item.start_time)}</dd></div>
                    <div><dt>End</dt><dd>{formatTime(item.end_time)}</dd></div>
                    <div><dt>Delivery</dt><dd>{item.delivery_mode || item.delivery_method || "online"}</dd></div>
                    {item.tutor_name || item.instructor_name ? <div><dt>Tutor</dt><dd>{item.tutor_name || item.instructor_name}</dd></div> : null}
                    {item.meeting_provider ? <div><dt>Provider</dt><dd>{item.meeting_provider}</dd></div> : null}
                  </dl>
                </article>
              ))}
            </div>
          </>
        );
      }}
    </PortalPage>
  );
}

function AnnouncementsPage() {
  const { user } = useAuth();
  const query = useStudentAnnouncements(user?.id);
  return (
    <PortalPage slug="announcements">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading announcements" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className="portal-record-card" key={item.id}>
                <p className="eyebrow">{formatDateTime(item.published_at || item.created_at)}</p>
                <h3>{item.title}</h3>
                <p>{item.body || item.summary}</p>
                {item.programs?.title ? <span className="portal-tag">{item.programs.title}</span> : <span className="portal-tag">General</span>}
              </article>
            ))}
          </div>
        );
      }}
    </PortalPage>
  );
}

function AssignmentsPage() {
  const { user } = useAuth();
  const query = useStudentAssignments(user?.id);
  return (
    <PortalPage slug="assignments">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading assignments" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => {
              const submission = (item.assignment_submissions || []).find((entry) => entry.user_id === user?.id);
              return (
                <article className="portal-record-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{getCourseName(item)}</p>
                    <h3>{item.title}</h3>
                    <p>{item.instructions}</p>
                  </div>
                  <dl className="portal-mini-details">
                    <div><dt>Due</dt><dd>{formatDateTime(item.due_at)}</dd></div>
                    <div><dt>Status</dt><dd>{submission?.status || "Not submitted"}</dd></div>
                    {submission?.score != null ? <div><dt>Score</dt><dd>{submission.score}/{item.maximum_score || 100}</dd></div> : null}
                    {submission?.feedback ? <div><dt>Feedback</dt><dd>{submission.feedback}</dd></div> : null}
                  </dl>
                </article>
              );
            })}
          </div>
        );
      }}
    </PortalPage>
  );
}

function ResourcesPage() {
  const { user } = useAuth();
  const query = useStudentResources(user?.id);
  return (
    <PortalPage slug="resources">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading resources" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => {
              const href = item.external_url || item.url || "";
              return (
                <article className="portal-record-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{item.module_title || getCourseName(item)}</p>
                    <h3>{item.title}</h3>
                    <p>{item.description || `${item.resource_type} resource`}</p>
                  </div>
                  <span className="portal-tag">{item.resource_type}</span>
                  {href ? <a className="button button-secondary" href={href} target="_blank" rel="noreferrer">Open Resource</a> : null}
                </article>
              );
            })}
          </div>
        );
      }}
    </PortalPage>
  );
}

function ArticlesPage() {
  const { user } = useAuth();
  const query = usePortalArticles(user?.id);
  return (
    <PortalPage slug="articles">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading learning articles" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className="portal-record-card" key={item.id}>
                <div>
                  <p className="eyebrow">{formatDateTime(item.published_at || item.created_at)}</p>
                  <h3>{item.title}</h3>
                  <p>{item.summary || item.body}</p>
                </div>
                <div className="portal-tag-row">
                  <span className="portal-tag">{item.category || "Learning"}</span>
                  {item.programs?.title ? <span className="portal-tag">{item.programs.title}</span> : null}
                </div>
                {item.external_url ? <a className="button button-secondary" href={item.external_url} target="_blank" rel="noreferrer">Read Article</a> : null}
              </article>
            ))}
          </div>
        );
      }}
    </PortalPage>
  );
}

function PaymentsPage() {
  const { user } = useAuth();
  const query = useStudentActivePayments(user?.id);
  return (
    <PortalPage slug="payments">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading Active Payment" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => {
              return (
                <article className="portal-record-card" key={item.id}>
                  <div>
                    <p className="eyebrow">Active Payment</p>
                    <h3>{item.programs?.title || "Assigned programme"}</h3>
                    <p>{item.program_levels?.level_name || "Programme track"}</p>
                  </div>
                  <dl className="portal-mini-details">
                    <div><dt>Status</dt><dd>Active Payment</dd></div>
                    <div><dt>Programme activated</dt><dd>{formatDateTime(item.activated_at)}</dd></div>
                  </dl>
                  <span className="portal-tag success">Active</span>
                </article>
              );
            })}
          </div>
        );
      }}
    </PortalPage>
  );
}

function CertificatesPage() {
  const { user } = useAuth();
  const query = useStudentCertificates(user?.id);
  return (
    <PortalPage slug="certificates">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading certificates" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className="portal-record-card" key={item.id}>
                <p className="eyebrow">{item.certificate_number || item.status}</p>
                <h3>{item.title}</h3>
                <p>Issued: {formatDate(item.issued_at)}</p>
                {item.file_path ? <a className="button button-secondary" href={item.file_path} target="_blank" rel="noreferrer">Open Certificate</a> : null}
              </article>
            ))}
          </div>
        );
      }}
    </PortalPage>
  );
}

function NotificationsPage() {
  const { user } = useAuth();
  const query = useStudentNotifications(user?.id);
  const [busy, setBusy] = useState(false);

  async function markOne(id) {
    setBusy(true);
    try {
      await markNotificationRead(user.id, id);
      query.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function markAll() {
    setBusy(true);
    try {
      await markAllNotificationsRead(user.id);
      query.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-page notification-page">
      <header className="portal-compact-heading notification-heading">
        <div><p className="eyebrow">Student Portal</p><div className="portal-title-row"><PortalBackButton fallback="/portal/more" label="Back from Notifications" /><h1>Notifications</h1></div></div>
        <button className="compact-text-action" type="button" onClick={markAll} disabled={busy}>Mark all read</button>
      </header>
      {query.loading ? <PortalLoading label="Loading notifications" /> : null}
      {query.error ? <PortalError message={query.error} onRetry={query.refetch} /> : null}
      {!query.loading && !query.error && !(query.data || []).length ? <PortalEmpty content={{ empty_title: "You have no notifications", empty_message: "New account and classroom updates will appear here." }} /> : null}
      {!query.loading && !query.error ? (
        <div className="notification-list">
          {(query.data || []).map((item) => (
            <button className={`notification-row ${item.read_at ? "" : "unread"}`} type="button" key={item.id} onClick={() => !item.read_at && markOne(item.id)} disabled={busy}>
              <span className="notification-icon"><Bell size={17} aria-hidden="true" /></span>
              <span className="notification-copy"><strong>{item.title || "Portal update"}</strong><span>{item.message}</span><small>{formatDateTime(item.created_at)}</small></span>
              {!item.read_at ? <span className="notification-unread" aria-label="Unread" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SupportPage() {
  const { user } = useAuth();
  const query = useStudentSupportTickets(user?.id);
  const [form, setForm] = useState({ subject: "", category: "general", message: "" });
  const [replies, setReplies] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [replyingTicketId, setReplyingTicketId] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (form.subject.trim().length < 3 || form.message.trim().length < 10) {
      setStatus({ type: "warning", message: "Add a clear subject and message so support can respond properly." });
      return;
    }
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await createSupportTicket(user.id, form);
      setForm({ subject: "", category: "general", message: "" });
      setStatus({ type: "success", message: "Support ticket created." });
      query.refetch();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Support ticket could not be created." });
    } finally {
      setLoading(false);
    }
  }

  async function submitReply(ticket) {
    const message = String(replies[ticket.id] || "").trim();
    if (message.length < 2) {
      setStatus({ type: "warning", message: "Enter a reply before sending." });
      return;
    }
    setReplyingTicketId(ticket.id);
    setStatus({ type: "", message: "" });
    try {
      await replyToSupportTicket(ticket.id, message);
      setReplies((current) => ({ ...current, [ticket.id]: "" }));
      setStatus({ type: "success", message: "Your reply was sent to support." });
      query.refetch();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Your reply could not be sent." });
    } finally {
      setReplyingTicketId("");
    }
  }

  return (
    <PortalPage slug="support">
      {(content) => (
        <div className="portal-two-column">
          <form className="form-card" onSubmit={submit}>
            <div>
              <p className="eyebrow">New request</p>
              <h3>Contact student support</h3>
              <p>You can also use {siteConfig.contact.email} or {siteConfig.contact.phone}.</p>
            </div>
            <label>
              <span>Subject</span>
              <input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
            </label>
            <label>
              <span>Category</span>
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                <option value="general">General support</option>
                <option value="payment">Payment</option>
                <option value="course">Course access</option>
                <option value="profile">Profile</option>
              </select>
            </label>
            <label>
              <span>Message</span>
              <textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </label>
            {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
            <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Sending" : "Create Ticket"}</button>
          </form>
          <div>
            {query.loading ? <PortalLoading label="Loading support tickets" /> : null}
            {query.error ? <PortalError message={query.error} onRetry={query.refetch} /> : null}
            {!query.loading && !query.error && !(query.data || []).length ? <PortalEmpty content={content} /> : null}
            <div className="portal-list">
              {(query.data || []).map((item) => (
                <article className={`portal-record-card ${item.unread_reply_count ? "unread" : ""}`} key={item.id}>
                  <p className="eyebrow">{item.status}{item.unread_reply_count ? ` | ${item.unread_reply_count} unread` : ""}</p>
                  <h3>{item.subject}</h3>
                  <p>{item.message}</p>
                  <div className="support-thread" aria-label={`Messages for ${item.subject}`}>
                    {(item.support_ticket_messages || []).map((message) => (
                      <div className={`support-message ${message.sender_role}`} key={message.id}>
                        <strong>{message.sender_role === "admin" ? "Zentel Insight Support" : "You"}</strong>
                        <p>{message.message}</p>
                        <small>{formatDateTime(message.created_at)}</small>
                      </div>
                    ))}
                    {!(item.support_ticket_messages || []).length && item.response ? <div className="support-message admin"><strong>Zentel Insight Support</strong><p>{item.response}</p></div> : null}
                  </div>
                  <small>{formatDateTime(item.created_at)}</small>
                  {["open", "in_progress"].includes(item.status) ? (
                    <div className="support-reply-form">
                      <label><span>Reply to this ticket</span><textarea value={replies[item.id] || ""} onChange={(event) => setReplies({ ...replies, [item.id]: event.target.value })} /></label>
                      <button className="button button-secondary" type="button" disabled={replyingTicketId === item.id} onClick={() => submitReply(item)}>{replyingTicketId === item.id ? "Sending" : "Send Reply"}</button>
                    </div>
                  ) : <p className="form-status success">This ticket is resolved. Contact support with a new ticket if you need more help.</p>}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </PortalPage>
  );
}

export function StudentSettingsPage() {
  return <PortalNavigationPage eyebrow="Student Portal" title="Settings" items={[
    { to: "/portal/settings/appearance", label: "Appearance", description: "Light or dark theme", Icon: Sun },
    { to: "/portal/settings/preferences", label: "Preferences", description: "Notices and reminders", Icon: Settings },
    { to: "/portal/settings/notifications", label: "Device Notifications", description: "Browser and system notifications", Icon: Bell },
    { to: "/portal/settings/security", label: "Security", description: "Account and credential information", Icon: ShieldCheck },
    { to: "/portal/settings/sessions", label: "Sessions", description: "Current session controls", Icon: Clock3 }
  ]} />;
}

export function StudentAppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();
  return <PortalPage slug="settings" title="Appearance" backTo="/portal/settings">{() => (
    <div className="portal-list"><article className="portal-record-card"><h3>Theme</h3><div className="segmented-control" role="group" aria-label="Theme preference"><button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><Sun size={16} aria-hidden="true" /> Light</button><button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><Moon size={16} aria-hidden="true" /> Dark</button></div></article></div>
  )}</PortalPage>;
}

export function StudentPreferencesSettingsPage() {
  const { user } = useAuth();
  const preferencesQuery = useStudentPreferences(user?.id);
  const [preferences, setPreferences] = useState({
    email_notifications: true,
    portal_reminders: true,
    session_security_warnings: true
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!preferencesQuery.data) return;
    setPreferences({
      email_notifications: preferencesQuery.data.email_notifications !== false,
      portal_reminders: preferencesQuery.data.portal_reminders !== false,
      session_security_warnings: preferencesQuery.data.session_security_warnings !== false
    });
  }, [preferencesQuery.data]);

  async function savePreferences() {
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await updateStudentPreferences(user.id, preferences);
      preferencesQuery.refetch();
      setStatus({ type: "success", message: "Portal preferences saved." });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Portal preferences could not be saved." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalPage slug="settings" title="Preferences" backTo="/portal/settings">
      {() => (
        <div className="portal-list">
          <article className="portal-record-card">
            <h3>Portal preferences</h3>
            {preferencesQuery.loading ? <PortalLoading label="Loading preferences" /> : null}
            {preferencesQuery.error ? <PortalError message={preferencesQuery.error} onRetry={preferencesQuery.refetch} /> : null}
            {!preferencesQuery.loading && !preferencesQuery.error ? (
              <div className="portal-toggle-list">
                <PortalSwitch label="Email notifications" checked={preferences.email_notifications} onChange={(email_notifications) => setPreferences({ ...preferences, email_notifications })} />
                <PortalSwitch label="Portal reminders" checked={preferences.portal_reminders} onChange={(portal_reminders) => setPreferences({ ...preferences, portal_reminders })} />
                <PortalSwitch label="Session security warnings" checked={preferences.session_security_warnings} onChange={(session_security_warnings) => setPreferences({ ...preferences, session_security_warnings })} />
                <button className="button button-secondary" type="button" onClick={savePreferences} disabled={loading}>
                  {loading ? "Saving" : "Save Preferences"}
                </button>
              </div>
            ) : null}
          </article>
          {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
        </div>
      )}
    </PortalPage>
  );
}

export function StudentNotificationSettingsPage() {
  const [state, setState] = useState({ supported: true, enabled: false, permission: "default" });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: "", message: "" });

  useEffect(() => {
    let active = true;
    getDeviceNotificationState()
      .then((result) => { if (active) setState(result); })
      .catch(() => { if (active) setState({ supported: false, enabled: false, permission: "unsupported" }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function toggle(enabled) {
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      const result = enabled ? await enableDeviceNotifications() : await disableDeviceNotifications();
      setState(result);
      setStatus({ type: "success", message: enabled ? "Device notifications enabled." : "Device notifications disabled." });
    } catch (error) {
      setState((current) => ({ ...current, enabled: false, permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission }));
      setStatus({ type: "warning", message: error.message || "Device notifications could not be updated." });
    } finally {
      setLoading(false);
    }
  }

  return <PortalPage slug="settings" title="Notification Settings" backTo="/portal/settings">{() => (
    <div className="portal-list">
      <article className="portal-record-card">
        <PortalSwitch label="Device Notifications" description="Receive important Zentel updates when the portal is in the background." checked={state.enabled} disabled={loading || !state.supported} onChange={toggle} />
        {!state.supported ? <p className="form-status warning">This browser does not support device notifications.</p> : null}
        {state.permission === "denied" ? <p className="form-status warning">Notifications are blocked in your browser or device settings.</p> : null}
      </article>
      {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
    </div>
  )}</PortalPage>;
}

export function StudentSecuritySettingsPage() {
  const { user } = useAuth();
  return <PortalPage slug="settings" title="Security" backTo="/portal/settings">{() => <div className="portal-list"><article className="portal-record-card"><h3>Account email</h3><p>{user?.email}</p><span className="portal-tag success"><CheckCircle2 size={14} aria-hidden="true" /> Verified</span></article><article className="portal-record-card"><h3>Credential management</h3><p>Your credentials are managed by Zentel Insight Admin.</p><Link className="button button-secondary" to="/portal/support">Contact Support</Link></article></div>}</PortalPage>;
}

export function StudentSessionsSettingsPage() {
  const { signOut } = useAuth();
  return <PortalPage slug="settings" title="Sessions" backTo="/portal/settings">{() => <div className="portal-list"><article className="portal-record-card"><h3>Current session</h3><span className="portal-tag success">Active</span><div className="button-row"><button className="button button-primary" type="button" onClick={signOut}>Sign Out</button></div></article></div>}</PortalPage>;
}

export function PortalSection({ page }) {
  if (page === "my-courses") return <MyCoursesPage />;
  if (page === "classroom") return <StudentClassroomPage />;
  if (page === "timetable") return <TimetablePage />;
  if (page === "announcements") return <AnnouncementsPage />;
  if (page === "assignments") return <AssignmentsPage />;
  if (page === "resources") return <ResourcesPage />;
  if (page === "payments") return <PaymentsPage />;
  if (page === "certificates") return <CertificatesPage />;
  if (page === "notifications") return <NotificationsPage />;
  if (page === "articles") return <ArticlesPage />;
  if (page === "support") return <SupportPage />;
  if (page === "settings") return <StudentSettingsPage />;
  return <MyCoursesPage />;
}

export function PortalProfile() {
  const { user } = useAuth();
  const query = useStudentProfile(user);

  return (
    <PortalPage slug="profile">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading profile" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        if (!query.data) return <PortalEmpty content={content} />;
        const profile = query.data;
        return (
          <article className="form-card portal-profile-form">
            <div className="portal-profile-summary">
              <PortalAvatarUpload profile={profile} name={profile.full_name || user?.email} onChanged={query.refetch} />
              <div className="portal-metric-card">
                <span>Profile completion</span>
                <strong>{calculateProfileCompletion(profile)}%</strong>
                <small>All profile and credential changes are managed by Admin.</small>
              </div>
              <div className="portal-metric-card">
                <span>Email verification</span>
                <strong>{user?.email_confirmed_at || user?.confirmed_at ? "Verified" : "Pending"}</strong>
                <small>Account created {formatDateTime(user?.created_at || profile.created_at)}</small>
              </div>
            </div>
            <PortalIdCard portalId={profile.portal_id} role="student" />
            <div className="form-grid">
              <label>
                <span>Full name</span>
                <input value={profile.full_name || ""} readOnly />
              </label>
              <label>
                <span>Email address</span>
                <input value={user?.email || profile.email || ""} readOnly />
              </label>
              <label>
                <span>Phone</span>
                <input value={profile.phone || ""} readOnly />
              </label>
              <label>
                <span>Date of birth</span>
                <input type="date" value={profile.date_of_birth || ""} readOnly />
              </label>
              <label>
                <span>Level of education</span>
                <input value={profile.education_level || ""} readOnly />
              </label>
              <label>
                <span>Residential address</span>
                <input value={profile.address || ""} readOnly />
              </label>
            </div>
            <span className="portal-tag">Account details are Admin-managed</span>
            <Link className="button button-secondary" to="/portal/support">Request a Change</Link>
          </article>
        );
      }}
    </PortalPage>
  );
}
