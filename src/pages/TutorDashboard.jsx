import { useEffect, useState } from "react";
import {
  Bell,
  BadgeDollarSign,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  School,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  UserRound,
  Users,
  Video
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LiveClassCards from "../components/LiveClassCards";
import ProgramBanner from "../components/ProgramBanner";
import ProgramChatPanel from "../components/ProgramChatPanel";
import PortalIdCard from "../components/portal/PortalIdCard";
import PortalAvatarUpload from "../components/portal/PortalAvatarUpload";
import PortalBackButton from "../components/portal/PortalBackButton";
import PortalCommunityFeed from "../components/portal/PortalCommunityFeed";
import PortalNavigationPage from "../components/portal/PortalNavigationPage";
import PortalShell from "../components/portal/PortalShell";
import PortalSwitch from "../components/portal/PortalSwitch";
import { useAuth } from "../context/authHooks";
import { useTheme } from "../context/themeHooks";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  cancelTutorLiveClass,
  getTutorDashboardData,
  saveTutorAssignment,
  saveTutorLiveClass,
  saveTutorResource,
  searchTutorStudents
} from "../services/tutorService";
import {
  calculateProfileCompletion,
  createSupportTicket,
  markAllNotificationsRead,
  markNotificationRead,
  replyToSupportTicket
} from "../services/portal/portalRepository";
import { formatDateTime } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";
import { TutorAcademySection } from "./AcademyWorkspace";

const sections = [
  ["dashboard", "Home", LayoutDashboard],
  ["teaching", "Teaching", BookOpen],
  ["classrooms", "Classrooms", School],
  ["assessment", "Assessment", FileCheck2],
  ["performance", "Performance", CheckCircle2],
  ["more", "More", MoreHorizontal],
  ["profile", "My Profile", UserRound],
  ["programme", "My Programme", GraduationCap],
  ["students", "My Students", Users],
  ["classroom", "Classroom", MessageSquare],
  ["classroom-chat", "Chat", MessageSquare, "/tutor/classroom/chat"],
  ["timetable", "Timetable", CalendarDays],
  ["live-classes", "Live Classes", Video, "/tutor/classroom/live"],
  ["attendance", "Attendance", CheckCircle2, "/tutor/classroom/attendance"],
  ["announcements", "Announcements", Megaphone],
  ["assignments", "Assignments", FileCheck2],
  ["resources", "Learning Resources", BookOpen],
  ["availability", "Availability", CalendarDays],
  ["notifications", "Notifications", Bell],
  ["salary-bank", "Salary / Bank Details", BadgeDollarSign],
  ["support", "Support", LifeBuoy],
  ["security", "Security", ShieldCheck],
  ["settings", "Settings", Settings]
];

function firstName(value) {
  return String(value || "Tutor").trim().split(/\s+/)[0] || "Tutor";
}

function tutorDisplayName(profile) {
  const name = firstName(profile?.full_name);
  return `${profile?.title || ""} ${name}`.trim();
}

function getActiveSection(section) {
  return sections.some(([slug]) => slug === section) ? section : "dashboard";
}

function resolveTutorRoute(pathname, forcedSection = "") {
  if (forcedSection) return { section: forcedSection, classroomId: "" };
  const parts = pathname.replace(/^\/tutor\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { section: "dashboard", classroomId: "" };
  if (parts[0] === "messages") return { section: parts[1] === "classroom" ? "classroom-chat" : "messages", classroomId: "" };
  if (parts[0] === "classrooms") {
    if (!parts[1]) return { section: "classrooms", classroomId: "" };
    const classroomSections = { students: "academy-students", timetable: "academy-timetable", modules: "academy-modules", "live-classes": "live-classes", attendance: "attendance", announcements: "announcements", resources: "resources" };
    return { section: classroomSections[parts[2]] || "classroom-detail", classroomId: parts[1] };
  }
  if (parts[0] === "assessment") {
    const assessmentSections = { assignments: "assignments", quizzes: "academy-quizzes", submissions: "academy-submissions", gradebook: "academy-gradebook", performance: "academy-performance" };
    return { section: assessmentSections[parts[1]] || "assessment", classroomId: "" };
  }
  return { section: getActiveSection(parts[0]), classroomId: "" };
}

function PageHeading({ title, actions }) {
  const location = useLocation();
  const landingPaths = new Set(["/tutor", "/tutor/teaching", "/tutor/classrooms", "/tutor/assessment", "/tutor/performance"]);
  const showBack = !landingPaths.has(location.pathname.replace(/\/$/, ""));
  return (
    <div className="portal-page-heading">
      <div>
        <p className="eyebrow">Tutor Portal</p>
        <div className="portal-title-row">
          {showBack ? <PortalBackButton fallback="/tutor" label={`Back from ${title}`} /> : null}
          <h2>{title}</h2>
        </div>
      </div>
      {actions}
    </div>
  );
}

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function TutorLiveClassesSection({ data, onSaved }) {
  const emptyForm = { id: "", classroomId: data.classrooms?.[0]?.classroom_id || "", title: "", provider: "google_meet", meetingUrl: "", startsAt: "", endsAt: "", instructions: "" };
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setStatus({ type: "", message: "" });
    try {
      await saveTutorLiveClass(form);
      setForm({ ...emptyForm, classroomId: form.classroomId });
      setStatus({ type: "success", message: form.id ? "Live class updated." : "Live class scheduled." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "The live class could not be saved." });
    } finally { setBusy(false); }
  }

  function edit(session) {
    setForm({ id: session.id, classroomId: session.classroom_id || "", title: session.title || "", provider: session.provider || "google_meet", meetingUrl: session.provider_room_url || "", startsAt: toLocalInput(session.scheduled_start), endsAt: toLocalInput(session.scheduled_end), instructions: session.description || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function cancel(session) {
    if (!window.confirm(`Cancel ${session.title}? Students will no longer be able to join.`)) return;
    setBusy(true);
    try { await cancelTutorLiveClass(session.id); setStatus({ type: "success", message: "Live class cancelled." }); onSaved(); }
    catch (error) { setStatus({ type: "warning", message: error.message || "The live class could not be cancelled." }); }
    finally { setBusy(false); }
  }

  const meetingPlaceholder = form.provider === "zoom" ? "https://company.zoom.us/j/..." : form.provider === "youtube" ? "https://youtube.com/live/..." : "https://meet.google.com/...";
  return <div className="portal-page"><PageHeading title="Live classes" description="Schedule, start and end approved Google Meet, Zoom or YouTube classes for your assigned classrooms." />{status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}{data.classrooms?.length ? <form className="form-card management-form" onSubmit={submit}><div className="form-grid"><label><span>Assigned classroom</span><select value={form.classroomId} onChange={(event) => setForm({ ...form, classroomId: event.target.value })} required>{data.classrooms.map((item) => <option key={item.classroom_id} value={item.classroom_id}>{item.classroom_name} | {item.cohort_name}</option>)}</select></label><label><span>Class name</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength="180" required /></label><label><span>Platform</span><select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}><option value="google_meet">Google Meet</option><option value="zoom">Zoom</option><option value="youtube">YouTube</option></select></label><label><span>Meeting URL</span><input type="url" value={form.meetingUrl} onChange={(event) => setForm({ ...form, meetingUrl: event.target.value })} placeholder={meetingPlaceholder} required /></label><label><span>Date and start time</span><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} required /></label><label><span>End time</span><input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} required /></label></div><label><span>Instructions</span><textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} maxLength="2000" /></label><div className="button-row">{form.id ? <button className="button button-secondary" type="button" onClick={() => setForm(emptyForm)}>Cancel Edit</button> : null}<button className="button button-primary" disabled={busy}>{busy ? "Saving" : form.id ? "Update Class" : "Schedule Class"}</button></div></form> : <div className="notice-card"><p>Admin must assign your account to an active classroom before you can schedule a live class.</p></div>}<LiveClassCards audience="tutor" sessions={data.liveClasses} emptyMessage="No live classes have been scheduled yet." onChanged={onSaved} onEdit={edit} onCancel={cancel} /></div>;
}

function EmptyState({ title = "Nothing to show yet", message }) {
  return (
    <div className="notice-card portal-state-card">
      <h2>{title}</h2>
      <p>{message || "Approved tutor information will appear here when it is connected to your account."}</p>
    </div>
  );
}

function TutorFrame({ data, onRealtimeChange, children }) {
  const { profile, user } = useAuth();
  const displayName = tutorDisplayName(data?.profile || profile) || user?.email || "Tutor";
  const navigationItem = (slug, labelOverride = "") => {
    const [, label, Icon, route] = sections.find(([itemSlug]) => itemSlug === slug);
    return {
      to: route || (slug === "dashboard" ? "/tutor" : `/tutor/${slug}`),
      label: labelOverride || label,
      Icon,
      end: slug === "dashboard",
      badge: slug === "notifications" ? data.notifications.filter((item) => !item.read_at).length : slug === "classroom-chat" ? data.unreadMessages : 0
    };
  };
  return (
    <PortalShell
      sidebar={{
        homeTo: "/tutor",
        brandLabel: "Tutor Portal",
        profileName: displayName,
        profileDetail: data.assignments.length
          ? `${data.assignments.length} assigned programme${data.assignments.length === 1 ? "" : "s"}`
          : "Programme pending",
        avatarUrl: data?.profile?.avatar_url || profile?.avatar_url,
        profileTo: "/tutor/profile",
        navLabel: "Tutor portal",
        shellClass: "management-shell tutor-shell",
        primaryItems: [
          navigationItem("dashboard"),
          navigationItem("classrooms"),
          { to: "/tutor/messages", label: "Messages", Icon: MessageSquare, badge: data.unreadMessages },
          navigationItem("assessment"),
          { to: "/tutor/more", label: "More", Icon: MoreHorizontal, badge: data.notifications.filter((item) => !item.read_at).length }
        ]
      }}
      header={{ eyebrow: "Welcome back", title: displayName, status: <span className="portal-tag success">Tutor</span> }}
      idleEnabled={Boolean(data)}
      realtimeTables={[
        "announcements",
        "assignments",
        "enrolments",
        "live_class_sessions",
        "portal_articles",
        "portal_notifications",
        "profiles",
        "program_chat_messages",
        "program_chat_reactions",
        "program_levels",
        "resources",
        "student_feed_posts",
        "student_feed_refresh_events",
        "support_tickets",
        "timetable_entries",
        "tutor_profiles",
        "tutor_program_assignments"
      ]}
      onRealtimeChange={onRealtimeChange}
    >
      {children}
    </PortalShell>
  );
}

function TutorClassroomsPage({ data }) {
  return (
    <div className="portal-page">
      <header className="portal-compact-heading"><p className="eyebrow">Tutor Portal</p><h1>Classrooms</h1></header>
      <div className="portal-destination-list">
        {data.classrooms.map((room) => <Link to={`/tutor/classrooms/${room.classroom_id}`} key={room.classroom_id}><span className="portal-destination-icon"><School size={18} /></span><span className="portal-destination-copy"><strong>{room.classroom_name}</strong><small>{room.program_title} | {room.track_title} | {room.cohort_name}</small></span><span aria-hidden="true">›</span></Link>)}
      </div>
      {!data.classrooms.length ? <EmptyState title="No assigned classrooms" message="Admin-assigned classrooms will appear here." /> : null}
    </div>
  );
}

function TutorClassroomPage({ data, classroomId }) {
  const room = data.classrooms.find((item) => item.classroom_id === classroomId);
  if (!room) return <EmptyState title="Classroom not found" message="This classroom is not assigned to your Tutor account." />;
  const base = `/tutor/classrooms/${room.classroom_id}`;
  return <PortalNavigationPage eyebrow="Classroom" title={room.classroom_name} description={`${room.program_title} | ${room.track_title} | ${room.cohort_name}`} items={[
    { to: `${base}/students`, label: "Students", description: "Assigned Student list", Icon: Users },
    { to: `${base}/timetable`, label: "Timetable", description: "Class schedule", Icon: CalendarDays },
    { to: `${base}/modules`, label: "Modules & Lessons", description: "Published learning structure", Icon: BookOpen },
    { to: `${base}/live-classes`, label: "Live Classes", description: "Schedule and manage sessions", Icon: Video },
    { to: `${base}/attendance`, label: "Attendance", description: "Class participation", Icon: CheckCircle2 },
    { to: `${base}/announcements`, label: "Announcements", description: "Class notices", Icon: Megaphone },
    { to: `${base}/resources`, label: "Resources", description: "Learning materials", Icon: BookOpen }
  ]} />;
}

function TutorAssessmentPage() {
  return <PortalNavigationPage eyebrow="Tutor Portal" title="Assessment" description="Open one assessment workspace." items={[
    { to: "/tutor/assessment/assignments", label: "Assignments", description: "Create and publish assignments", Icon: FileCheck2 },
    { to: "/tutor/assessment/quizzes", label: "Quizzes & Tests", description: "Build objective assessments", Icon: CheckCircle2 },
    { to: "/tutor/assessment/submissions", label: "Submissions", description: "Review submitted work", Icon: BookOpen },
    { to: "/tutor/assessment/gradebook", label: "Gradebook", description: "Grade and publish results", Icon: GraduationCap },
    { to: "/tutor/assessment/performance", label: "Student Performance", description: "Classroom performance records", Icon: Users }
  ]} />;
}

function TutorMessagesPage() {
  return <PortalNavigationPage eyebrow="Tutor Portal" title="Messages" description="Choose a conversation." items={[
    { to: "/tutor/messages/classroom", label: "Classroom Chat", description: "Programme classroom conversations", Icon: MessageSquare }
  ]} />;
}

function TutorMorePage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut({ scope: "local" });
    navigate("/login", { replace: true });
  }

  return <PortalNavigationPage eyebrow="Tutor Portal" title="More" items={[
    { to: "/tutor/availability", label: "Availability", description: "Approved teaching availability", Icon: CalendarDays },
    { to: "/tutor/notifications", label: "Notifications", description: "Account and class updates", Icon: Bell },
    { to: "/tutor/profile", label: "Profile", description: "Professional account information", Icon: UserRound },
    { to: "/tutor/salary-bank", label: "Salary / Bank Details", description: "Read-only payment setup status", Icon: BadgeDollarSign },
    { to: "/tutor/support", label: "Support", description: "Support tickets", Icon: LifeBuoy },
    { to: "/tutor/security", label: "Security", description: "Password and session protection", Icon: ShieldCheck },
    { to: "/tutor/settings", label: "Settings", description: "Portal appearance", Icon: Settings },
    { label: "Sign Out", description: "End this Tutor session", Icon: LogOut, onSelect: handleSignOut }
  ]} />;
}

function TutorAvailabilitySection({ data }) {
  return (
    <div className="portal-page">
      <PageHeading title="Availability" />
      <dl className="portal-detail-rows">
        <div><dt>Teaching availability</dt><dd>{data.tutorProfile?.availability || "Not recorded"}</dd></div>
        <div><dt>Management</dt><dd>Contact Support when this schedule needs to change.</dd></div>
      </dl>
      <Link className="button button-secondary" to="/tutor/support">Contact Support</Link>
    </div>
  );
}

function TutorSalaryBankSection() {
  return (
    <div className="portal-page">
      <PageHeading title="Salary / Bank Details" />
      <dl className="portal-detail-rows">
        <div><dt>Payment profile</dt><dd>Managed securely by Zentel Insight Administration</dd></div>
        <div><dt>Self-service changes</dt><dd>Disabled</dd></div>
      </dl>
      <p className="portal-help-text">Bank information is not displayed in the Tutor Portal. Contact Support for a verified update.</p>
      <Link className="button button-secondary" to="/tutor/support">Contact Support</Link>
    </div>
  );
}

function ProfileSection({ data, onChanged }) {
  const { profile, user } = useAuth();
  const assignment = data.assignments[0] || null;

  return (
    <div className="portal-page">
      <PageHeading
        title="My professional profile."
        description="Review official account information and maintain your professional teaching profile."
      />
      <article className="form-card management-form">
        <div className="portal-profile-summary">
          <PortalAvatarUpload profile={{ ...data.profile, avatar_url: profile?.avatar_url || data.profile?.avatar_url }} name={tutorDisplayName(data.profile)} onChanged={onChanged} />
          <div className="portal-metric-card">
            <span>Profile completion</span>
            <strong>{Number(data.profile?.profile_completion || calculateProfileCompletion(data.profile))}%</strong>
            <small>Admin-managed profile and credential completion.</small>
          </div>
        </div>
        <PortalIdCard portalId={data.profile?.portal_id} role="tutor" />
        <dl className="portal-mini-details">
          <div><dt>Name</dt><dd>{data.profile?.title} {data.profile?.full_name || "Tutor"}</dd></div>
          <div><dt>Email</dt><dd>{data.profile?.email || user?.email}</dd></div>
          <div><dt>Phone</dt><dd>{data.profile?.phone || "Not recorded"}</dd></div>
          <div><dt>Assigned programme</dt><dd>{assignment?.programs?.title || "Not assigned"}</dd></div>
          <div><dt>Assigned track</dt><dd>{assignment?.program_levels?.level_name || "All tracks"}</dd></div>
          <div><dt>Role</dt><dd>Tutor</dd></div>
          <div><dt>Account status</dt><dd>{data.profile?.account_status === "active" ? "Active" : "Restricted"}</dd></div>
        </dl>
        <span className="portal-tag">Official details, professional information and programme assignment are Administration managed</span>
      </article>
      <article className="form-card management-form portal-profile-form">
        <h3>Professional information</h3>
        <dl className="portal-mini-details">
          <div><dt>Professional biography</dt><dd>{data.tutorProfile?.professional_bio || "Not recorded"}</dd></div>
          <div><dt>Qualifications</dt><dd>{data.tutorProfile?.qualifications || "Not recorded"}</dd></div>
          <div><dt>Teaching experience</dt><dd>{data.tutorProfile?.teaching_experience || "Not recorded"}</dd></div>
          <div><dt>Specialisation</dt><dd>{data.tutorProfile?.specialisation || "Not recorded"}</dd></div>
          <div><dt>Availability</dt><dd>{data.tutorProfile?.availability || "Not recorded"}</dd></div>
        </dl>
        <Link className="button button-secondary" to="/tutor/support">Request a Change</Link>
      </article>
    </div>
  );
}

function ProgrammeSection({ data }) {
  const assignment = data.assignments[0] || null;
  const nextClass = data.liveClasses.find((item) => !item.scheduled_start || new Date(item.scheduled_start).getTime() >= Date.now());
  return (
    <div className="portal-page">
      <PageHeading title="My assigned programme." description="Tutors can view only programmes assigned by Zentel Insight administration." />
      {assignment ? (
        <>
          <ProgramBanner program={assignment.programs} placement="detail" />
          <article className="notice-card tutor-programme-summary">
            <p className="eyebrow">Active assignment</p>
            <h3>{assignment.programs?.title || "Programme"}</h3>
            <p>{assignment.programs?.long_description || assignment.programs?.short_description || "Programme information is managed by Zentel Insight administration."}</p>
            <dl className="portal-mini-details">
              <div><dt>Track</dt><dd>{assignment.program_levels?.level_name || "All tracks"}</dd></div>
              <div><dt>Tutor</dt><dd>{data.profile?.title} {data.profile?.full_name}</dd></div>
              <div><dt>Assigned</dt><dd>{formatDateTime(assignment.created_at)}</dd></div>
              <div><dt>Connected students</dt><dd>{data.studentTotal}</dd></div>
              <div><dt>Timetable entries</dt><dd>{data.timetable.length}</dd></div>
              <div><dt>Upcoming class</dt><dd>{nextClass ? formatDateTime(nextClass.scheduled_start) : "Not scheduled"}</dd></div>
              <div><dt>Available resources</dt><dd>{data.resources.length}</dd></div>
              <div><dt>Classroom</dt><dd>Active programme room</dd></div>
            </dl>
          </article>
        </>
      ) : <EmptyState message="No programme has been assigned to your Tutor account yet. Please contact Zentel Insight administration." />}
    </div>
  );
}

function StudentsSection({ data }) {
  const assignment = data.assignments[0] || null;
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [page, setPage] = useState(1);
  const studentsQuery = useAsyncData(
    () => searchTutorStudents({
      query: search,
      status: statusFilter,
      assignment: assignmentFilter,
      trackId: assignment?.track_id || "",
      page,
      pageSize: 20
    }),
    [search, statusFilter, assignmentFilter, assignment?.track_id, page],
    {
      enabled: Boolean(assignment?.program_id),
      errorMessage: "We could not load your student information. Please try again."
    }
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => setPage(1), [statusFilter, assignmentFilter]);

  if (!assignment) {
    return (
      <div className="portal-page">
        <PageHeading title="My students." description="Connected Students are resolved from your active programme assignment." />
        <EmptyState message="No programme has been assigned to your Tutor account yet. Please contact Zentel Insight administration." />
      </div>
    );
  }

  const records = studentsQuery.data?.records || [];
  const total = Number(studentsQuery.data?.total || 0);
  const pageCount = Number(studentsQuery.data?.pageCount || 1);

  return (
    <div className="portal-page">
      <PageHeading title="My students." description="View only Students connected to your active programme. Official enrolments and saved preferences are clearly separated." />
      <div className="admin-student-toolbar tutor-student-toolbar">
        <label><span>Search Students</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name, programme, track or status" /></label>
        <div className="segmented-control compact" role="group" aria-label="Student status filter">
          {["all", "active", "inactive"].map((value) => <button key={value} type="button" className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{value === "all" ? "All statuses" : value[0].toUpperCase() + value.slice(1)}</button>)}
        </div>
        <div className="segmented-control compact" role="group" aria-label="Student assignment type filter">
          {["all", "official", "preference"].map((value) => <button key={value} type="button" className={assignmentFilter === value ? "active" : ""} onClick={() => setAssignmentFilter(value)}>{value === "all" ? "All connections" : value[0].toUpperCase() + value.slice(1)}</button>)}
        </div>
      </div>
      {studentsQuery.loading ? <div className="portal-skeleton" aria-label="Loading connected Students"><div /><div /><div /><div /></div> : null}
      {studentsQuery.error && !studentsQuery.loading ? (
        <div className="notice-card portal-state-card" role="alert">
          <h3>Connected Students could not be loaded</h3>
          <p>Please refresh this section. If the issue continues, contact Zentel Insight Support.</p>
          <button className="button button-primary" type="button" onClick={studentsQuery.refetch}>Try Again</button>
        </div>
      ) : null}
      {!studentsQuery.loading && !studentsQuery.error ? (
        records.length ? (
          <>
            <div className="responsive-table-wrap tutor-student-table">
              <table className="management-table">
                <thead><tr><th>Student</th><th>Status</th><th>Programme</th><th>Track</th><th>Connection</th><th>Profile</th><th>Connected</th></tr></thead>
                <tbody>{records.map((student) => (
                  <tr key={`${student.assignment_type}-${student.id}`}>
                    <td data-label="Student"><span className="student-name-cell"><span className="portal-avatar sm">{firstName(student.full_name).slice(0, 1).toUpperCase()}</span>{student.full_name || "Student"}</span></td>
                    <td data-label="Status"><span className={`portal-tag ${student.account_status === "active" ? "success" : "warning"}`}>{student.account_status === "active" ? "Active" : "Inactive"}</span></td>
                    <td data-label="Programme">{student.program_title}</td>
                    <td data-label="Track">{student.track_name || "All tracks"}</td>
                    <td data-label="Connection">{student.assignment_type === "official" ? "Official enrolment" : "Programme preference - enrolment not verified"}</td>
                    <td data-label="Profile">{Number(student.profile_completion || 0)}%</td>
                    <td data-label="Connected">{formatDateTime(student.connected_at)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="tutor-student-mobile-list">
              {records.map((student) => (
                <article className="portal-record-card" key={`mobile-${student.assignment_type}-${student.id}`}>
                  <p className="eyebrow">{student.assignment_type === "official" ? "Official enrolment" : "Programme preference - enrolment not verified"}</p>
                  <h3>{student.full_name || "Student"}</h3>
                  <p>{student.program_title} {student.track_name ? `/ ${student.track_name}` : ""}</p>
                  <div className="portal-tag-row"><span className="portal-tag">{student.account_status === "active" ? "Active" : "Inactive"}</span><span className="portal-tag">Profile {Number(student.profile_completion || 0)}%</span></div>
                  <small>Connected {formatDateTime(student.connected_at)}</small>
                </article>
              ))}
            </div>
            <div className="pagination-controls" aria-label="Connected Student pagination">
              <button className="button button-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
              <span>Page {page} of {pageCount} | {total} Student{total === 1 ? "" : "s"}</span>
              <button className="button button-secondary" type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button>
            </div>
          </>
        ) : <EmptyState message="No Students match these filters for your assigned programme." />
      ) : null}
    </div>
  );
}

const timetableDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function TutorTimetableSection({ data }) {
  return (
    <div className="portal-page">
      <PageHeading title="Timetable." description="Read-only class schedule for your active programme in Africa/Lagos time." />
      {data.timetable.length ? (
        <div className="tutor-timetable-grid">
          {data.timetable.map((item) => {
            const liveSession = data.liveClasses.find((session) => session.program_id === item.program_id && (!item.track_id || !session.track_id || session.track_id === item.track_id));
            return (
              <article className="portal-record-card tutor-timetable-card" key={item.id}>
                <div><p className="eyebrow">{timetableDays[Number(item.day_of_week)] || "Scheduled day"}</p><h3>{item.title || item.programs?.title || "Class"}</h3></div>
                <dl className="portal-mini-details">
                  <div><dt>Time</dt><dd>{String(item.start_time || "").slice(0, 5)} - {String(item.end_time || "").slice(0, 5)}</dd></div>
                  <div><dt>Programme</dt><dd>{item.programs?.title || "Assigned programme"}</dd></div>
                  <div><dt>Track</dt><dd>{item.program_levels?.level_name || "All tracks"}</dd></div>
                  <div><dt>Timezone</dt><dd>{item.timezone || "Africa/Lagos"}</dd></div>
                  <div><dt>Delivery</dt><dd>{item.delivery_mode === "online" ? "Online" : item.delivery_mode || "Online"}</dd></div>
                  <div><dt>Live class</dt><dd>{liveSession?.status ? liveSession.status[0].toUpperCase() + liveSession.status.slice(1) : "Not scheduled"}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      ) : <EmptyState message="No timetable has been published for your assigned programme yet." />}
    </div>
  );
}

function TutorClassroomSection({ data, onSaved }) {
  const connectedStudents = [...data.officialStudents, ...data.preferenceStudents];
  const connectedCount = data.studentTotal;
  const primaryAssignment = data.assignments[0] || null;
  const nextClass = data.liveClasses.find((session) => new Date(session.scheduled_end || session.scheduled_start || 0).getTime() >= Date.now()) || null;
  const liveNow = data.liveClasses.some((session) => ["live", "in_progress"].includes(session.status));

  return (
    <div className="portal-page">
      <PageHeading
        title="Classroom."
        description="Review your assigned programme and open each classroom workspace."
      />
      <div className="classroom-summary-grid">
        <article className="dashboard-card">
          <GraduationCap size={22} aria-hidden="true" />
          <span>Programme</span>
          <strong>{primaryAssignment?.programs?.title || "Not assigned"}</strong>
          <small>{primaryAssignment?.program_levels?.level_name || "All assigned tracks"}</small>
        </article>
        <article className="dashboard-card">
          <Users size={22} aria-hidden="true" />
          <span>Students</span>
          <strong>{connectedCount}</strong>
          <small>Official enrolments and programme preferences</small>
        </article>
        <article className="dashboard-card">
          <CalendarDays size={22} aria-hidden="true" />
          <span>Next class</span>
          <strong>{nextClass ? formatDateTime(nextClass.scheduled_start) : "Not scheduled"}</strong>
          <small>{nextClass?.title || "No upcoming session"}</small>
        </article>
        <article className="dashboard-card">
          <Video size={22} aria-hidden="true" />
          <span>Live status</span>
          <strong>{liveNow ? "Live now" : "Offline"}</strong>
          <small>{liveNow ? "A classroom session is open" : "No session is live"}</small>
        </article>
        <article className="dashboard-card">
          <MessageSquare size={22} aria-hidden="true" />
          <span>Unread messages</span>
          <strong>{data.unreadMessages || 0}</strong>
          <small>Programme classroom chat</small>
        </article>
        <article className="dashboard-card">
          <CheckCircle2 size={22} aria-hidden="true" />
          <span>Attendance</span>
          <strong>After class</strong>
          <small>Attendance appears when sessions end</small>
        </article>
      </div>
      <div className="classroom-workspace">
        <aside className="classroom-info-panel">
          <div>
          <h3>Connected Students</h3>
          <div className="portal-list compact-list">
            {connectedStudents.slice(0, 6).map((student) => (
              <div className="portal-record-card" key={student.id}>
                <h3>{student.profiles?.full_name || "Student"}</h3>
                <p>{student.programs?.title || "Programme"} {student.program_levels?.level_name ? `/ ${student.program_levels.level_name}` : ""}</p>
                <span className={`portal-tag ${student.assignment_type === "official" ? "success" : "warning"}`}>{student.assignment_type === "official" ? "Official enrolment" : "Preference - not verified"}</span>
              </div>
            ))}
            {!connectedCount ? <EmptyState message="No Students are connected to your assigned programme yet." /> : null}
          </div>
          </div>
          <div>
          <h3>Upcoming live classes</h3>
          <LiveClassCards audience="tutor" sessions={data.liveClasses.slice(0, 3)} emptyMessage="No live class is scheduled. Create or schedule a session when you are ready to meet your students." onChanged={onSaved} />
          </div>
        </aside>
        <div className="classroom-section-links">
          <Link className="classroom-section-link" to="/tutor/classroom/chat"><MessageSquare size={20} /><span><strong>Chat</strong><small>Open the programme conversation</small></span></Link>
          <Link className="classroom-section-link" to="/tutor/classroom/live"><Video size={20} /><span><strong>Live Classes</strong><small>Schedule, start and manage sessions</small></span></Link>
          <Link className="classroom-section-link" to="/tutor/classroom/attendance"><CheckCircle2 size={20} /><span><strong>Attendance</strong><small>Review class participation</small></span></Link>
        </div>
      </div>
    </div>
  );
}

function RecordsSection({ title, description, records, render, emptyMessage }) {
  return (
    <div className="portal-page">
      <PageHeading title={title} description={description} />
      <div className="portal-list">
        {records.map(render)}
        {!records.length ? <EmptyState message={emptyMessage} /> : null}
      </div>
    </div>
  );
}

const emptyTutorAssignment = {
  id: "",
  title: "",
  instructions: "",
  due_at: "",
  maximum_score: 100,
  published: false
};

function TutorAssignmentsSection({ data, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyTutorAssignment);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);
  const assignment = data.assignments[0] || null;

  async function save(event) {
    event.preventDefault();
    if (form.title.trim().length < 3 || form.instructions.trim().length < 5) {
      setStatus({ type: "warning", message: "Add a clear title and instructions before saving." });
      return;
    }
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      await saveTutorAssignment(form);
      setForm(emptyTutorAssignment);
      setStatus({ type: "success", message: form.published ? "Assignment published and connected Students notified." : "Assignment saved as a draft." });
      await onSaved();
    } catch {
      setStatus({ type: "warning", message: "We could not save this assignment. No information was changed. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  function edit(item) {
    setForm({
      id: item.id,
      title: item.title || "",
      instructions: item.instructions || "",
      due_at: item.due_at ? String(item.due_at).slice(0, 16) : "",
      maximum_score: Number(item.maximum_score || 100),
      published: Boolean(item.published)
    });
    setStatus({ type: "", message: "" });
  }

  if (!assignment) return <RecordsSection title="Assignments." description="Create programme-scoped assignments." records={[]} render={() => null} emptyMessage="A programme must be assigned before you can create assignments." />;

  return (
    <div className="portal-page">
      <PageHeading title="Assignments." description={`Create and publish assignments only for ${assignment.programs?.title || "your assigned programme"}.`} />
      <div className="portal-two-column">
        <form className="form-card management-form" onSubmit={save}>
          <h3>{form.id ? "Edit assignment" : "Create assignment"}</h3>
          <label><span>Programme</span><input value={assignment.programs?.title || "Assigned programme"} readOnly /></label>
          <label><span>Track</span><input value={assignment.program_levels?.level_name || "All tracks"} readOnly /></label>
          <label><span>Title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
          <label><span>Instructions</span><textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} required /></label>
          <div className="form-grid">
            <label><span>Due date</span><input type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} /></label>
            <label><span>Maximum score</span><input type="number" min="1" value={form.maximum_score} onChange={(event) => setForm({ ...form, maximum_score: event.target.value })} /></label>
          </div>
          <PortalSwitch label="Publish to connected Students" checked={form.published} onChange={(published) => setForm({ ...form, published })} />
          {status.message ? <div className={`form-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</div> : null}
          <div className="button-row">
            {form.id ? <button className="button button-secondary" type="button" onClick={() => setForm(emptyTutorAssignment)}>Cancel Edit</button> : null}
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving Assignment" : "Save Assignment"}</button>
          </div>
        </form>
        <div className="portal-list">
          {data.learningAssignments.map((item) => (
            <article className="portal-record-card" key={item.id}>
              <p className="eyebrow">{item.published ? "Published" : "Draft"}</p>
              <h3>{item.title}</h3>
              <p>{item.instructions}</p>
              <small>Due {item.due_at ? formatDateTime(item.due_at) : "date not set"} | Maximum score {item.maximum_score}</small>
              {item.created_by === user.id ? <button className="button button-secondary" type="button" onClick={() => edit(item)}>Edit</button> : <span className="portal-tag">Administration managed</span>}
            </article>
          ))}
          {!data.learningAssignments.length ? <EmptyState message="No assignments have been created for this programme yet." /> : null}
        </div>
      </div>
    </div>
  );
}

const emptyTutorResource = { id: "", title: "", description: "", resource_type: "link", external_url: "", published: false };

function TutorResourcesSection({ data, onSaved }) {
  const { user } = useAuth();
  const assignment = data.assignments[0] || null;
  const [form, setForm] = useState(emptyTutorResource);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    if (form.title.trim().length < 3 || !/^https:\/\//i.test(form.external_url.trim())) {
      setStatus({ type: "warning", message: "Add a clear title and a complete HTTPS resource link." });
      return;
    }
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      await saveTutorResource(form);
      setForm(emptyTutorResource);
      setStatus({ type: "success", message: form.published ? "Resource published and connected Students notified." : "Resource saved as a draft." });
      await onSaved();
    } catch {
      setStatus({ type: "warning", message: "We could not save this resource. No information was changed. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  function edit(item) {
    setForm({
      id: item.id,
      title: item.title || "",
      description: item.description || "",
      resource_type: item.resource_type || "link",
      external_url: item.external_url || item.url || "",
      published: Boolean(item.published)
    });
  }

  if (!assignment) return <RecordsSection title="Learning resources." description="Publish programme-scoped learning resources." records={[]} render={() => null} emptyMessage="A programme must be assigned before you can publish resources." />;

  return (
    <div className="portal-page">
      <PageHeading title="Learning resources." description={`Publish approved resources only for ${assignment.programs?.title || "your assigned programme"}.`} />
      <div className="portal-two-column">
        <form className="form-card management-form" onSubmit={save}>
          <h3>{form.id ? "Edit resource" : "Publish a resource"}</h3>
          <label><span>Title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
          <label><span>Resource type</span><select value={form.resource_type} onChange={(event) => setForm({ ...form, resource_type: event.target.value })}>{["document", "video", "link", "template", "download", "guide"].map((type) => <option value={type} key={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
          <label><span>HTTPS resource link</span><input type="url" value={form.external_url} onChange={(event) => setForm({ ...form, external_url: event.target.value })} required /></label>
          <label><span>Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <PortalSwitch label="Publish to connected Students" checked={form.published} onChange={(published) => setForm({ ...form, published })} />
          {status.message ? <div className={`form-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</div> : null}
          <div className="button-row">
            {form.id ? <button className="button button-secondary" type="button" onClick={() => setForm(emptyTutorResource)}>Cancel Edit</button> : null}
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving Resource" : "Save Resource"}</button>
          </div>
        </form>
        <div className="portal-list">
          {data.resources.map((item) => (
            <article className="portal-record-card" key={item.id}>
              <p className="eyebrow">{item.resource_type} | {item.published ? "Published" : "Draft"}</p>
              <h3>{item.title}</h3>
              <p>{item.description || "No description provided."}</p>
              <a href={item.external_url || item.url} target="_blank" rel="noreferrer">Open resource</a>
              {item.created_by === user.id ? <button className="button button-secondary" type="button" onClick={() => edit(item)}>Edit</button> : <span className="portal-tag">Administration managed</span>}
            </article>
          ))}
          {!data.resources.length ? <EmptyState message="No learning resources have been published for this programme yet." /> : null}
        </div>
      </div>
    </div>
  );
}

function TutorSupportSection({ records, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ subject: "", category: "general", message: "" });
  const [replies, setReplies] = useState({});
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });

  async function submit(event) {
    event.preventDefault();
    if (form.subject.trim().length < 3 || form.message.trim().length < 10) {
      setStatus({ type: "warning", message: "Add a clear subject and message so Support can respond properly." });
      return;
    }
    setBusy("new");
    try {
      await createSupportTicket(user.id, form);
      setForm({ subject: "", category: "general", message: "" });
      setStatus({ type: "success", message: "Support ticket created." });
      await onSaved();
    } catch {
      setStatus({ type: "warning", message: "Your support ticket could not be created. Please try again." });
    } finally {
      setBusy("");
    }
  }

  async function reply(ticket) {
    const message = String(replies[ticket.id] || "").trim();
    if (message.length < 2) return;
    setBusy(ticket.id);
    try {
      await replyToSupportTicket(ticket.id, message);
      setReplies((current) => ({ ...current, [ticket.id]: "" }));
      setStatus({ type: "success", message: "Your reply was sent to Support." });
      await onSaved();
    } catch {
      setStatus({ type: "warning", message: "Your reply could not be sent. Please try again." });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="portal-page">
      <PageHeading title="Support." description="Create and follow your Tutor support requests." />
      {status.message ? <div className={`form-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</div> : null}
      <div className="portal-two-column">
        <form className="form-card management-form" onSubmit={submit}>
          <h3>New support request</h3>
          <label><span>Subject</span><input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
          <label><span>Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="general">General Support</option><option value="classroom">Classroom</option><option value="programme">Programme</option><option value="profile">Profile</option></select></label>
          <label><span>Message</span><textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
          <button className="button button-primary" type="submit" disabled={Boolean(busy)}>{busy === "new" ? "Sending Request" : "Create Ticket"}</button>
        </form>
        <div className="portal-list">
          {records.map((ticket) => (
            <article className={`portal-record-card ${ticket.unread_reply_count ? "unread" : ""}`} key={ticket.id}>
              <p className="eyebrow">{ticket.status === "in_progress" ? "In progress" : ticket.status}</p>
              <h3>{ticket.subject}</h3><p>{ticket.message}</p>
              <div className="support-thread">{(ticket.support_ticket_messages || []).map((message) => <div className={`support-message ${message.sender_role}`} key={message.id}><strong>{message.sender_role === "admin" ? "Zentel Insight Support" : "You"}</strong><p>{message.message}</p><small>{formatDateTime(message.created_at)}</small></div>)}</div>
              {["open", "in_progress"].includes(ticket.status) ? <div className="support-reply-form"><label><span>Reply to this ticket</span><textarea value={replies[ticket.id] || ""} onChange={(event) => setReplies({ ...replies, [ticket.id]: event.target.value })} /></label><button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => reply(ticket)}>{busy === ticket.id ? "Sending Reply" : "Send Reply"}</button></div> : <p className="form-status success">This ticket is resolved. Create a new ticket if you need more help.</p>}
            </article>
          ))}
          {!records.length ? <EmptyState message="No Tutor support tickets have been created yet." /> : null}
        </div>
      </div>
    </div>
  );
}

function TutorSecuritySection() {
  const { user } = useAuth();
  return (
    <div className="portal-page">
      <PageHeading title="Security" />
      <dl className="portal-detail-rows">
        <div><dt>Account email</dt><dd>{user?.email}</dd></div>
        <div><dt>Idle protection</dt><dd>Automatic sign-out after 10 minutes without activity</dd></div>
      </dl>
      <Link className="button button-secondary" to="/forgot-password">Request Password Reset</Link>
    </div>
  );
}

function SettingsSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="portal-page">
      <PageHeading title="Settings" />
      <section className="portal-flat-section">
        <h2>Appearance</h2>
        <div className="segmented-control compact" role="group" aria-label="Portal theme">
          <button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><Sun size={16} aria-hidden="true" /> Light</button>
          <button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><Moon size={16} aria-hidden="true" /> Dark</button>
        </div>
      </section>
    </div>
  );
}

function renderTutorRecord(kind, item) {
  return (
    <article className="portal-record-card" key={item.id}>
      <p className="eyebrow">{item.programs?.title || kind}</p>
      <h3>{item.title || item.subject || kind}</h3>
      <p>{item.summary || item.description || item.instructions || item.message || "No additional details were provided."}</p>
      <small>{formatDateTime(item.published_at || item.scheduled_start || item.created_at)}</small>
    </article>
  );
}

function TutorNotificationsSection({ records, onSaved }) {
  const { user } = useAuth();
  const [busyId, setBusyId] = useState("");
  const unreadCount = records.filter((item) => !item.read_at).length;

  async function markOne(id) {
    setBusyId(id);
    try {
      await markNotificationRead(user.id, id);
      onSaved();
    } finally {
      setBusyId("");
    }
  }

  async function markAll() {
    setBusyId("all");
    try {
      await markAllNotificationsRead(user.id);
      onSaved();
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="portal-page">
      <PageHeading
        title="Notifications."
        description="Tutor account notices and programme updates."
        actions={unreadCount ? <button className="button button-secondary" type="button" onClick={markAll} disabled={Boolean(busyId)}>Mark all as read</button> : null}
      />
      <div className="portal-list">
        {records.map((item) => (
          <article className={`portal-record-card ${item.read_at ? "" : "unread"}`} key={item.id}>
            <div>
              <p className="eyebrow">{item.notification_type || "Tutor update"}</p>
              <h3>{item.title || "Notification"}</h3>
              <p>{item.message || "Open the related Tutor section for details."}</p>
              <small>{formatDateTime(item.created_at)}</small>
            </div>
            {item.read_at
              ? <span className="portal-tag">Read</span>
              : <button className="button button-secondary" type="button" onClick={() => markOne(item.id)} disabled={Boolean(busyId)}>{busyId === item.id ? "Saving" : "Mark as read"}</button>}
          </article>
        ))}
        {!records.length ? <EmptyState message="No notifications yet." /> : null}
      </div>
    </div>
  );
}

export default function TutorDashboard({ forcedSection = "" }) {
  const { user } = useAuth();
  const location = useLocation();
  const { section: activeSection, classroomId } = resolveTutorRoute(location.pathname, forcedSection);
  const dataQuery = useAsyncData(() => getTutorDashboardData(user.id), [user?.id], {
    enabled: Boolean(user?.id),
    errorMessage: "We could not load your Tutor dashboard. Please try again."
  });

  usePageMeta({
    path: location.pathname,
    title: activeSection === "dashboard" ? "Tutor Home" : "Tutor Portal",
    description: "Protected Zentel Insight tutor portal.",
    robots: "noindex,nofollow"
  });

  const data = {
    profile: null,
    tutorProfile: null,
    assignments: [],
    classrooms: [],
    officialStudents: [],
    preferenceStudents: [],
    studentTotal: 0,
    timetable: [],
    announcements: [],
    learningAssignments: [],
    resources: [],
    articles: [],
    liveClasses: [],
    attendance: [],
    unreadMessages: 0,
    notifications: [],
    supportTickets: [],
    ...(dataQuery.data || {})
  };

  if (dataQuery.loading) {
    return <TutorFrame data={data}><div className="route-loader">Loading tutor dashboard</div></TutorFrame>;
  }
  if (dataQuery.error) {
    return (
      <TutorFrame data={data} onRealtimeChange={dataQuery.refetch}>
        <div className="portal-page">
          <div className="notice-card portal-state-card">
            <h1>Tutor portal could not be loaded</h1>
            <p>We could not load your Tutor portal. Please try again. If the issue continues, contact Zentel Insight Support.</p>
            <button className="button button-primary" type="button" onClick={dataQuery.refetch}>Try Again</button>
          </div>
        </div>
      </TutorFrame>
    );
  }
  return (
    <TutorFrame data={data} onRealtimeChange={dataQuery.refetch}>
      {activeSection === "dashboard" ? <PortalCommunityFeed eyebrow="Tutor Portal" /> : null}
      {activeSection === "teaching" ? <TutorAcademySection view="teaching" /> : null}
      {activeSection === "classrooms" ? <TutorClassroomsPage data={data} /> : null}
      {activeSection === "classroom-detail" ? <TutorClassroomPage data={data} classroomId={classroomId} /> : null}
      {activeSection === "academy-students" ? <TutorAcademySection view="students" classroomIdOverride={classroomId} /> : null}
      {activeSection === "academy-timetable" ? <TutorAcademySection view="timetable" classroomIdOverride={classroomId} /> : null}
      {activeSection === "academy-modules" ? <TutorAcademySection view="modules" classroomIdOverride={classroomId} /> : null}
      {activeSection === "academy-quizzes" ? <TutorAcademySection view="quizzes" /> : null}
      {activeSection === "academy-submissions" ? <TutorAcademySection view="submissions" /> : null}
      {activeSection === "academy-gradebook" ? <TutorAcademySection view="gradebook" /> : null}
      {activeSection === "academy-performance" ? <TutorAcademySection view="performance" /> : null}
      {activeSection === "assessment" ? <TutorAssessmentPage /> : null}
      {activeSection === "performance" ? <TutorAcademySection view="performance" /> : null}
      {activeSection === "messages" ? <TutorMessagesPage /> : null}
      {activeSection === "more" ? <TutorMorePage /> : null}
      {activeSection === "profile" ? <ProfileSection data={data} onChanged={dataQuery.refetch} /> : null}
      {activeSection === "programme" ? <ProgrammeSection data={data} /> : null}
      {activeSection === "students" ? <StudentsSection data={data} /> : null}
      {activeSection === "classroom" ? <TutorClassroomSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "classroom-chat" ? <div className="portal-page chat-route-page"><ProgramChatPanel audience="tutor" standalone backTo="/tutor/messages" /></div> : null}
      {activeSection === "timetable" ? <TutorTimetableSection data={data} /> : null}
      {activeSection === "live-classes" ? <TutorLiveClassesSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "attendance" ? (
        <RecordsSection title="Attendance." description="Review participation in your authorised live classes." records={data.attendance} emptyMessage="No attendance has been recorded yet." render={(item) => <article className="portal-record-card" key={item.id}><div><p className="eyebrow">{item.attendance_status}</p><h3>{item.live_class_sessions?.title || "Live class"}</h3><p>{item.live_class_sessions?.programs?.title || "Programme"}</p></div><dl className="portal-mini-details"><div><dt>Joined</dt><dd>{formatDateTime(item.joined_at)}</dd></div><div><dt>Left</dt><dd>{item.left_at ? formatDateTime(item.left_at) : "Session active"}</dd></div></dl></article>} />
      ) : null}
      {activeSection === "announcements" ? (
        <RecordsSection title="Announcements." description="Programme notices visible to assigned tutors." records={data.announcements} render={(item) => renderTutorRecord("Announcement", item)} emptyMessage="No announcements have been published yet." />
      ) : null}
      {activeSection === "assignments" ? (
        <TutorAssignmentsSection data={data} onSaved={dataQuery.refetch} />
      ) : null}
      {activeSection === "resources" ? (
        <TutorResourcesSection data={data} onSaved={dataQuery.refetch} />
      ) : null}
      {activeSection === "availability" ? <TutorAvailabilitySection data={data} /> : null}
      {activeSection === "salary-bank" ? <TutorSalaryBankSection /> : null}
      {activeSection === "notifications" ? (
        <TutorNotificationsSection records={data.notifications} onSaved={dataQuery.refetch} />
      ) : null}
      {activeSection === "support" ? (
        <TutorSupportSection records={data.supportTickets} onSaved={dataQuery.refetch} />
      ) : null}
      {activeSection === "security" ? <TutorSecuritySection /> : null}
      {activeSection === "settings" ? <SettingsSection /> : null}
    </TutorFrame>
  );
}
