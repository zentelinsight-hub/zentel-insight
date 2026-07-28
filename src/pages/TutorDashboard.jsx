import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  Newspaper,
  Settings,
  Trash2,
  Upload,
  UserRound,
  Users,
  Video
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import LiveClassCards from "../components/LiveClassCards";
import ProgramChatPanel from "../components/ProgramChatPanel";
import PortalShell from "../components/portal/PortalShell";
import { useAuth } from "../context/authHooks";
import { useAsyncData } from "../hooks/useAsyncData";
import { getTutorDashboardData } from "../services/tutorService";
import {
  calculateProfileCompletion,
  markAllNotificationsRead,
  markNotificationRead,
  updateStudentProfile as updateOwnProfilePicture
} from "../services/portal/portalRepository";
import { formatDateTime } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";

const sections = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["profile", "My Profile", UserRound],
  ["programme", "My Programme", GraduationCap],
  ["students", "My Students", Users],
  ["classroom", "Classroom", MessageSquare],
  ["timetable", "Timetable", CalendarDays],
  ["live-classes", "Live Classes", Video],
  ["announcements", "Announcements", Megaphone],
  ["assignments", "Assignments", FileCheck2],
  ["resources", "Learning Resources", BookOpen],
  ["notifications", "Notifications", Bell],
  ["articles", "Learning Articles", Newspaper],
  ["support", "Support", LifeBuoy],
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

function PageHeading({ title, description, actions }) {
  return (
    <div className="portal-page-heading">
      <div>
        <p className="eyebrow">Tutor Dashboard</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions}
    </div>
  );
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
  return (
    <PortalShell
      sidebar={{
        homeTo: "/tutor",
        brandLabel: "Tutor Dashboard",
        profileName: displayName,
        profileDetail: data.assignments.length
          ? `${data.assignments.length} assigned programme${data.assignments.length === 1 ? "" : "s"}`
          : "Programme pending",
        avatarUrl: data?.profile?.avatar_url || profile?.avatar_url,
        navLabel: "Tutor dashboard",
        menuLabel: "tutor",
        shellClass: "management-shell tutor-shell",
        items: sections.map(([slug, label, Icon]) => ({
          to: slug === "dashboard" ? "/tutor" : `/tutor/${slug}`,
          label,
          Icon,
          end: slug === "dashboard",
          badge: slug === "notifications" ? data.notifications.filter((item) => !item.read_at).length : 0
        }))
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
        "program_levels",
        "resources",
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

function DashboardSection({ data, onSaved }) {
  return (
    <div className="portal-page">
      <PageHeading
        title="Tutor workspace."
        description="Review assigned programmes, connected students, upcoming classes and programme communication."
      />
      <div className="dashboard-grid">
        <article className="dashboard-card">
          <GraduationCap size={22} aria-hidden="true" />
          <span>Programmes</span>
          <strong>{data.assignments.length}</strong>
          <small>Assigned programme records</small>
        </article>
        <article className="dashboard-card">
          <Users size={22} aria-hidden="true" />
          <span>Students</span>
          <strong>{data.officialStudents.length + data.preferenceStudents.length}</strong>
          <small>Official and preference-based connections</small>
        </article>
        <article className="dashboard-card">
          <Video size={22} aria-hidden="true" />
          <span>Live Classes</span>
          <strong>{data.liveClasses.length}</strong>
          <small>Scheduled class sessions</small>
        </article>
        <article className="dashboard-card">
          <Bell size={22} aria-hidden="true" />
          <span>Notifications</span>
          <strong>{data.notifications.filter((item) => !item.read_at).length}</strong>
          <small>Unread notices</small>
        </article>
      </div>
      <LiveClassCards audience="tutor" sessions={data.liveClasses.slice(0, 3)} emptyMessage="No upcoming tutor classes have been assigned yet." onChanged={onSaved} />
    </div>
  );
}

function ProfileSection({ data, onSaved }) {
  const { profile, refreshProfile, user } = useAuth();
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || "");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);
  const avatarObjectUrlRef = useRef("");

  useEffect(() => {
    setAvatarPreview(profile?.avatar_url || "");
    setAvatarFile(null);
    setRemoveAvatar(false);
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    avatarObjectUrlRef.current = "";
  }, [profile]);

  useEffect(() => () => {
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
  }, []);

  function selectAvatar(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setStatus({ type: "warning", message: "Upload a JPEG, PNG or WebP image no larger than 3 MB." });
      return;
    }
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    avatarObjectUrlRef.current = URL.createObjectURL(file);
    setAvatarPreview(avatarObjectUrlRef.current);
    setAvatarFile(file);
    setRemoveAvatar(false);
    setStatus({ type: "", message: "" });
  }

  async function submit(event) {
    event.preventDefault();
    if (!avatarFile && !removeAvatar) return;
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      await updateOwnProfilePicture(user.id, {
        ...data.profile,
        avatarFile,
        removeAvatar,
        avatar_path: profile?.avatar_path || data.profile?.avatar_path || "",
        previous_avatar_path: profile?.avatar_path || data.profile?.avatar_path || ""
      });
      await refreshProfile();
      setStatus({ type: "success", message: "Profile picture updated." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Professional profile could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="portal-page">
      <PageHeading
        title="My professional profile."
        description="Review approved teaching information and manage your profile picture. Professional credentials and programme assignments are Admin-managed."
      />
      <form className="form-card management-form" onSubmit={submit}>
        <div className="portal-profile-summary">
          <div className="portal-avatar-uploader">
            <span className="portal-avatar xl">
              {avatarPreview ? <img src={avatarPreview} alt="" /> : <span>{tutorDisplayName(data.profile).slice(0, 1).toUpperCase()}</span>}
            </span>
            <div>
              <label className="button button-secondary">
                <Upload size={16} aria-hidden="true" />Change Photo
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} />
              </label>
              {avatarPreview ? (
                <button className="button button-secondary" type="button" onClick={() => { setAvatarFile(null); setAvatarPreview(""); setRemoveAvatar(Boolean(profile?.avatar_path)); }}>
                  <Trash2 size={16} aria-hidden="true" />Remove Photo
                </button>
              ) : null}
            </div>
          </div>
          <div className="portal-metric-card">
            <span>Profile completion</span>
            <strong>{Number(data.profile?.profile_completion || calculateProfileCompletion(data.profile))}%</strong>
            <small>Admin-managed credentials and your profile picture contribute to completion.</small>
          </div>
        </div>
        <dl className="portal-mini-details">
          <div><dt>Name</dt><dd>{data.profile?.title} {data.profile?.full_name || "Tutor"}</dd></div>
          <div><dt>Email</dt><dd>{data.profile?.email || user?.email}</dd></div>
          <div><dt>Phone</dt><dd>{data.profile?.phone || "Not recorded"}</dd></div>
          <div><dt>Specialisation</dt><dd>{data.tutorProfile?.specialisation || "Not recorded"}</dd></div>
          <div><dt>Qualifications</dt><dd>{data.tutorProfile?.qualifications || "Not recorded"}</dd></div>
          <div><dt>Availability</dt><dd>{data.tutorProfile?.availability || "Not recorded"}</dd></div>
        </dl>
        <span className="portal-tag">Professional details are Admin-managed</span>
        {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
        <button className="button button-primary" type="submit" disabled={saving || (!avatarFile && !removeAvatar)}>{saving ? "Saving" : "Save Photo"}</button>
      </form>
    </div>
  );
}

function ProgrammeSection({ data }) {
  return (
    <div className="portal-page">
      <PageHeading title="My assigned programme." description="Tutors can view only programmes assigned by Zentel Insight administration." />
      <div className="portal-list">
        {data.assignments.map((assignment) => (
          <article className="portal-record-card" key={assignment.id}>
            <p className="eyebrow">{assignment.active ? "Active assignment" : "Inactive assignment"}</p>
            <h3>{assignment.programs?.title || "Programme"}</h3>
            <p>{assignment.program_levels?.level_name || "All tracks"}</p>
          </article>
        ))}
        {!data.assignments.length ? <EmptyState message="A programme has not yet been assigned to your tutor account." /> : null}
      </div>
    </div>
  );
}

function StudentsSection({ data }) {
  return (
    <div className="portal-page">
      <PageHeading title="My students." description="Official enrolments are separated from self-selected programme preferences." />
      <div className="portal-list">
        {data.officialStudents.map((student) => (
          <article className="portal-record-card" key={`official-${student.id}`}>
            <p className="eyebrow">Official enrolment</p>
            <h3>{student.profiles?.full_name || "Student"}</h3>
            <p>{student.programs?.title || "Programme"} {student.program_levels?.level_name ? `| ${student.program_levels.level_name}` : ""}</p>
          </article>
        ))}
        {data.preferenceStudents.map((student) => (
          <article className="portal-record-card" key={`preference-${student.id}`}>
            <p className="eyebrow">Programme preference - enrolment not verified</p>
            <h3>{student.profiles?.full_name || "Student"}</h3>
            <p>{student.programs?.title || "Programme"} {student.program_levels?.level_name ? `| ${student.program_levels.level_name}` : ""}</p>
          </article>
        ))}
        {!data.officialStudents.length && !data.preferenceStudents.length ? <EmptyState message="No students are connected to your assigned programme yet." /> : null}
      </div>
    </div>
  );
}

function TutorClassroomSection({ data, onSaved }) {
  const officialCount = data.officialStudents.length;
  const preferenceCount = data.preferenceStudents.length;
  const primaryAssignment = data.assignments[0] || null;

  return (
    <div className="portal-page">
      <PageHeading
        title="Classroom."
        description="Manage assigned programme students, live sessions and programme chat from one workspace."
      />
      <div className="dashboard-grid">
        <article className="dashboard-card">
          <GraduationCap size={22} aria-hidden="true" />
          <span>Programme</span>
          <strong>{primaryAssignment?.programs?.title || "Not assigned"}</strong>
          <small>{primaryAssignment?.program_levels?.level_name || "All assigned tracks"}</small>
        </article>
        <article className="dashboard-card">
          <Users size={22} aria-hidden="true" />
          <span>Students</span>
          <strong>{officialCount + preferenceCount}</strong>
          <small>{officialCount} official, {preferenceCount} self-selected</small>
        </article>
        <article className="dashboard-card">
          <Video size={22} aria-hidden="true" />
          <span>Live Classes</span>
          <strong>{data.liveClasses.length}</strong>
          <small>Scheduled or live sessions</small>
        </article>
        <article className="dashboard-card">
          <MessageSquare size={22} aria-hidden="true" />
          <span>Group Chat</span>
          <strong>Realtime</strong>
          <small>Messages persist in Supabase</small>
        </article>
      </div>
      <div className="portal-grid">
        <article className="notice-card">
          <h3>Connected Students</h3>
          <div className="portal-list compact-list">
            {data.officialStudents.slice(0, 6).map((student) => (
              <div className="portal-record-card" key={student.id}>
                <h3>{student.profiles?.full_name || "Student"}</h3>
                <p>{student.programs?.title || "Programme"} {student.program_levels?.level_name ? `/ ${student.program_levels.level_name}` : ""}</p>
                <span className="portal-tag success">Official</span>
              </div>
            ))}
            {data.preferenceStudents.slice(0, 4).map((student) => (
              <div className="portal-record-card" key={student.id}>
                <h3>{student.profiles?.full_name || "Student"}</h3>
                <p>{student.programs?.title || "Programme"} {student.program_levels?.level_name ? `/ ${student.program_levels.level_name}` : ""}</p>
                <span className="portal-tag warning">Self-selected</span>
              </div>
            ))}
            {!officialCount && !preferenceCount ? <EmptyState message="No students are connected to your assigned programme yet." /> : null}
          </div>
        </article>
        <article className="notice-card">
          <h3>Upcoming live classes</h3>
          <LiveClassCards audience="tutor" sessions={data.liveClasses.slice(0, 3)} emptyMessage="No classroom live classes have been scheduled yet." onChanged={onSaved} />
        </article>
      </div>
      {primaryAssignment?.program_id ? (
        <ProgramChatPanel programId={primaryAssignment.program_id} trackId={primaryAssignment.track_id} />
      ) : (
        <EmptyState message="A programme must be assigned before a Tutor classroom can open." />
      )}
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

function SettingsSection() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut({ scope: "local" });
    navigate("/login", { replace: true });
  }

  return (
    <div className="portal-page">
      <PageHeading title="Settings." description="Manage this tutor session." />
      <article className="portal-record-card">
        <h3>Account email</h3>
        <p>{user?.email}</p>
      </article>
      <article className="portal-record-card">
        <h3>Session security</h3>
        <p>For your security, your Portal session will automatically sign out after 10 minutes without activity. You will receive a warning shortly before logout.</p>
      </article>
      <button className="button button-primary" type="button" onClick={handleSignOut}>Sign Out</button>
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

export default function TutorDashboard() {
  const { user } = useAuth();
  const { section = "dashboard" } = useParams();
  const activeSection = getActiveSection(section);
  const dataQuery = useAsyncData(() => getTutorDashboardData(user.id), [user?.id], { enabled: Boolean(user?.id) });

  usePageMeta({
    path: activeSection === "dashboard" ? "/tutor" : `/tutor/${activeSection}`,
    title: "Tutor Dashboard",
    description: "Protected Zentel Insight tutor dashboard.",
    robots: "noindex,nofollow"
  });

  if (dataQuery.loading) return <div className="route-loader">Loading tutor dashboard</div>;
  if (dataQuery.error) {
    return (
      <section className="page-section">
        <div className="container narrow">
          <div className="notice-card">
            <h1>Tutor dashboard could not be loaded</h1>
            <p>{dataQuery.error}</p>
            <button className="button button-primary" type="button" onClick={dataQuery.refetch}>Try Again</button>
          </div>
        </div>
      </section>
    );
  }

  const data = {
    profile: null,
    tutorProfile: null,
    assignments: [],
    officialStudents: [],
    preferenceStudents: [],
    timetable: [],
    announcements: [],
    learningAssignments: [],
    resources: [],
    articles: [],
    liveClasses: [],
    notifications: [],
    supportTickets: [],
    ...(dataQuery.data || {})
  };
  return (
    <TutorFrame data={data} onRealtimeChange={dataQuery.refetch}>
      {activeSection === "dashboard" ? <DashboardSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "profile" ? <ProfileSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "programme" ? <ProgrammeSection data={data} /> : null}
      {activeSection === "students" ? <StudentsSection data={data} /> : null}
      {activeSection === "classroom" ? <TutorClassroomSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "timetable" ? (
        <RecordsSection
          title="Timetable."
          description="Published class schedule for assigned programmes."
          records={data.timetable}
          render={(item) => renderTutorRecord("Timetable", item)}
          emptyMessage="No timetable entries have been assigned yet."
        />
      ) : null}
      {activeSection === "live-classes" ? (
        <div className="portal-page">
          <PageHeading title="Live classes." description="Host only approved sessions for assigned programmes." />
          <LiveClassCards audience="tutor" sessions={data.liveClasses} emptyMessage="No live classes have been scheduled yet." onChanged={dataQuery.refetch} />
        </div>
      ) : null}
      {activeSection === "announcements" ? (
        <RecordsSection title="Announcements." description="Programme notices visible to assigned tutors." records={data.announcements} render={(item) => renderTutorRecord("Announcement", item)} emptyMessage="No announcements have been published yet." />
      ) : null}
      {activeSection === "assignments" ? (
        <RecordsSection title="Assignments." description="Assignments for assigned programmes." records={data.learningAssignments} render={(item) => renderTutorRecord("Assignment", item)} emptyMessage="No assignments are available yet." />
      ) : null}
      {activeSection === "resources" ? (
        <RecordsSection title="Learning resources." description="Resources for assigned programmes." records={data.resources} render={(item) => renderTutorRecord("Resource", item)} emptyMessage="No resources have been published yet." />
      ) : null}
      {activeSection === "notifications" ? (
        <TutorNotificationsSection records={data.notifications} onSaved={dataQuery.refetch} />
      ) : null}
      {activeSection === "articles" ? (
        <RecordsSection title="Learning articles." description="Published articles for assigned programmes." records={data.articles} render={(item) => renderTutorRecord("Article", item)} emptyMessage="No articles have been published yet." />
      ) : null}
      {activeSection === "support" ? (
        <RecordsSection title="Support." description="Support tickets available to your tutor role." records={data.supportTickets} render={(item) => renderTutorRecord("Support", item)} emptyMessage="No support tickets are available." />
      ) : null}
      {activeSection === "settings" ? <SettingsSection /> : null}
    </TutorFrame>
  );
}
