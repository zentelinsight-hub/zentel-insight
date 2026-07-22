import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  BookOpen,
  CalendarDays,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Megaphone,
  MessageSquare,
  Newspaper,
  Settings,
  UserRound,
  Users,
  Video,
  X
} from "lucide-react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import IdleSessionGuard from "../components/IdleSessionGuard";
import LiveClassCards from "../components/LiveClassCards";
import ProgramChatPanel from "../components/ProgramChatPanel";
import { useAuth } from "../context/authHooks";
import { useAsyncData } from "../hooks/useAsyncData";
import { getTutorDashboardData, updateTutorProfessionalProfile } from "../services/tutorService";
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

function TutorSidebarContent({ data, displayName, onNavigate, onSignOut }) {
  return (
    <>
      <NavLink className="brand" to="/tutor" onClick={onNavigate}>
        <BrandLogo brand="main" size="portal" />
        <span>
          <span className="brand-name">Tutor Dashboard</span>
          <span className="brand-motto">Zentel Insight</span>
        </span>
      </NavLink>
      <div className="portal-sidebar-profile">
        <span className="portal-avatar md"><span>{displayName.slice(0, 1).toUpperCase()}</span></span>
        <div>
          <strong>{displayName}</strong>
          <span>{data.assignments.length ? `${data.assignments.length} assigned programme${data.assignments.length === 1 ? "" : "s"}` : "Programme pending"}</span>
        </div>
      </div>
      <nav aria-label="Tutor dashboard">
        {sections.map(([slug, label, Icon]) => (
          <NavLink
            key={slug}
            to={slug === "dashboard" ? "/tutor" : `/tutor/${slug}`}
            end={slug === "dashboard"}
            onClick={onNavigate}
            className={({ isActive }) => isActive ? "portal-link active" : "portal-link"}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
      <button className="portal-link signout" type="button" onClick={onSignOut}>
        <LogOut size={18} aria-hidden="true" />
        Sign Out
      </button>
    </>
  );
}

function TutorFrame({ data, children }) {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const displayName = tutorDisplayName(data?.profile || profile) || user?.email || "Tutor";
  const drawerId = useId();
  const menuButtonRef = useRef(null);
  const scrollYRef = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [canUsePortal, setCanUsePortal] = useState(false);

  useEffect(() => {
    setCanUsePortal(true);
    return () => document.body.classList.remove("portal-menu-open");
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia("(min-width: 920.01px)");
    function handleResize(event) {
      if (event.matches) setMenuOpen(false);
    }
    handleResize(mediaQuery);
    mediaQuery.addEventListener("change", handleResize);
    return () => mediaQuery.removeEventListener("change", handleResize);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const restoreFocusTarget = menuButtonRef.current;
    function handleKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    scrollYRef.current = window.scrollY;
    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("portal-menu-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = "100%";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("portal-menu-open");
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollYRef.current);
      restoreFocusTarget?.focus();
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  async function handleSignOut() {
    closeMenu();
    await signOut({ scope: "local" });
    navigate("/login", { replace: true });
  }

  const desktopSidebar = (
    <aside className="portal-sidebar portal-sidebar-desktop">
      <TutorSidebarContent data={data} displayName={displayName} onNavigate={closeMenu} onSignOut={handleSignOut} />
    </aside>
  );

  const mobileDrawer = menuOpen && canUsePortal
    ? createPortal(
      <>
        <button
          className="portal-drawer-backdrop"
          type="button"
          aria-label="Close tutor menu"
          onClick={closeMenu}
        />
        <aside id={drawerId} className="portal-sidebar portal-mobile-drawer open" aria-label="Tutor dashboard menu">
          <TutorSidebarContent data={data} displayName={displayName} onNavigate={closeMenu} onSignOut={handleSignOut} />
        </aside>
      </>,
      document.body
    )
    : null;

  return (
    <section className="portal-shell management-shell tutor-shell">
      {desktopSidebar}
      {mobileDrawer}
      <main className="portal-main">
        <header className="portal-header">
          <button
            ref={menuButtonRef}
            className="icon-button portal-menu-button"
            type="button"
            aria-label={menuOpen ? "Close tutor menu" : "Open tutor menu"}
            aria-expanded={menuOpen}
            aria-controls={drawerId}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1>{displayName}</h1>
          </div>
          <span className="portal-tag success">Tutor</span>
        </header>
        {children}
      </main>
      <IdleSessionGuard enabled={Boolean(data)} />
    </section>
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
  const { user } = useAuth();
  const [form, setForm] = useState({
    professional_bio: "",
    qualifications: "",
    teaching_experience: "",
    availability: "",
    specialisation: ""
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      professional_bio: data.tutorProfile?.professional_bio || "",
      qualifications: data.tutorProfile?.qualifications || "",
      teaching_experience: data.tutorProfile?.teaching_experience || "",
      availability: data.tutorProfile?.availability || "",
      specialisation: data.tutorProfile?.specialisation || ""
    });
  }, [data.tutorProfile]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      await updateTutorProfessionalProfile(user.id, {
        ...form,
        title: data.tutorProfile?.title || data.profile?.title || "Mr"
      });
      setStatus({ type: "success", message: "Professional profile saved." });
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
        description="Update approved teaching information. Identity, title, phone, role and programme assignment remain Admin-managed."
      />
      <form className="form-card management-form" onSubmit={submit}>
        <div className="portal-grid">
          <article className="portal-record-card">
            <h3>{data.profile?.title} {data.profile?.full_name || "Tutor"}</h3>
            <p>{data.profile?.email}</p>
            <span className="portal-tag">Admin-managed identity</span>
          </article>
          <label>
            <span>Specialisation</span>
            <input value={form.specialisation} onChange={(event) => setForm({ ...form, specialisation: event.target.value })} />
          </label>
          <label>
            <span>Availability</span>
            <input value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })} />
          </label>
        </div>
        <label>
          <span>Professional bio</span>
          <textarea value={form.professional_bio} onChange={(event) => setForm({ ...form, professional_bio: event.target.value })} />
        </label>
        <label>
          <span>Qualifications</span>
          <textarea value={form.qualifications} onChange={(event) => setForm({ ...form, qualifications: event.target.value })} />
        </label>
        <label>
          <span>Teaching experience</span>
          <textarea value={form.teaching_experience} onChange={(event) => setForm({ ...form, teaching_experience: event.target.value })} />
        </label>
        {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving" : "Save Professional Profile"}</button>
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
      <button className="button button-primary" type="button" onClick={handleSignOut}>Sign Out</button>
    </div>
  );
}

function renderTutorRecord(kind, item) {
  return (
    <article className="portal-record-card" key={item.id}>
      <p className="eyebrow">{item.programs?.title || kind}</p>
      <h3>{item.title || item.subject || kind}</h3>
      <p>{item.summary || item.description || item.instructions || item.message || "Details pending."}</p>
      <small>{formatDateTime(item.published_at || item.scheduled_start || item.created_at)}</small>
    </article>
  );
}

export default function TutorDashboard() {
  const { user } = useAuth();
  const { section = "dashboard" } = useParams();
  const activeSection = getActiveSection(section);
  const dataQuery = useAsyncData(() => getTutorDashboardData(user?.id), [user?.id]);

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
    <TutorFrame data={data} activeSection={activeSection}>
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
        <RecordsSection title="Notifications." description="Tutor account notices and updates." records={data.notifications} render={(item) => renderTutorRecord("Notification", item)} emptyMessage="No notifications yet." />
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
