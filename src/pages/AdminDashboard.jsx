import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  ShieldCheck,
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
import {
  assignStudentProgramme,
  assignTutorProgramme,
  createTutorAccount,
  getAdminDashboardData,
  respondToSupportTicket,
  saveAnnouncement,
  saveArticle,
  saveAssignment,
  saveProgram,
  saveProgramLevel,
  saveResource,
  saveTimetableEntry,
  scheduleLiveClass,
  searchAdminStudents,
  searchAdminTutors,
  setAccountStatus,
  updateProgramLevelPrice,
  updateStudentProfile,
  updateTutorProfile
} from "../services/adminService";
import { formatCurrency, formatDateTime } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";

const sections = [
  ["overview", "Dashboard", LayoutDashboard],
  ["people", "Students and Tutors", Users],
  ["programmes", "Programmes", GraduationCap],
  ["content", "Content", Megaphone],
  ["classrooms", "Classrooms", MessageSquare],
  ["live-classes", "Live Classes", Video],
  ["payments", "Payments", CreditCard],
  ["support", "Support", LifeBuoy],
  ["audit", "Audit Logs", ShieldCheck]
];

const emptyProgramForm = {
  slug: "",
  title: "",
  short_description: "",
  long_description: "",
  category: "digital-skills",
  icon_name: "book-open",
  active: true,
  featured: false,
  display_order: 100
};

function formatAmountKobo(value) {
  return formatCurrency(Number(value || 0) / 100);
}

function getTrackOptions(programs = [], programId) {
  return programs.find((program) => program.id === programId)?.program_levels || [];
}

function AdminSidebarContent({ displayName, onNavigate, onSignOut }) {
  return (
    <>
      <NavLink className="brand" to="/admin" onClick={onNavigate}>
        <BrandLogo brand="main" size="portal" />
        <span>
          <span className="brand-name">Admin Dashboard</span>
          <span className="brand-motto">Zentel Insight</span>
        </span>
      </NavLink>
      <div className="portal-sidebar-profile">
        <span className="portal-avatar md"><span>{displayName.slice(0, 1).toUpperCase()}</span></span>
        <div>
          <strong>{displayName}</strong>
          <span>Verified admin session</span>
        </div>
      </div>
      <nav aria-label="Admin dashboard">
        {sections.map(([slug, label, Icon]) => (
          <NavLink
            key={slug}
            to={slug === "overview" ? "/admin" : `/admin/${slug}`}
            end={slug === "overview"}
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

function AdminFrame({ data, children }) {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const displayName = profile?.full_name || user?.email || "Admin";
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
    await signOut();
    navigate("/login", { replace: true });
  }

  const desktopSidebar = (
    <aside className="portal-sidebar portal-sidebar-desktop">
      <AdminSidebarContent displayName={displayName} onNavigate={closeMenu} onSignOut={handleSignOut} />
    </aside>
  );

  const mobileDrawer = menuOpen && canUsePortal
    ? createPortal(
      <>
        <button
          className="portal-drawer-backdrop"
          type="button"
          aria-label="Close admin menu"
          onClick={closeMenu}
        />
        <aside id={drawerId} className="portal-sidebar portal-mobile-drawer open" aria-label="Admin dashboard menu">
          <AdminSidebarContent displayName={displayName} onNavigate={closeMenu} onSignOut={handleSignOut} />
        </aside>
      </>,
      document.body
    )
    : null;

  return (
    <section className="portal-shell management-shell admin-shell">
      {desktopSidebar}
      {mobileDrawer}
      <main className="portal-main">
        <header className="portal-header">
          <button
            ref={menuButtonRef}
            className="icon-button portal-menu-button"
            type="button"
            aria-label={menuOpen ? "Close admin menu" : "Open admin menu"}
            aria-expanded={menuOpen}
            aria-controls={drawerId}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
          <div>
            <p className="eyebrow">Admin</p>
            <h1>{displayName}</h1>
          </div>
          <span className="portal-tag success">
            <ShieldCheck size={14} aria-hidden="true" />
            Verified
          </span>
        </header>
        {children}
      </main>
      <IdleSessionGuard enabled={Boolean(data)} />
    </section>
  );
}

function PageHeading({ eyebrow = "Admin", title, description, actions }) {
  return (
    <div className="portal-page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions}
    </div>
  );
}

function StatusMessage({ status }) {
  return status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null;
}

function AccountStatusBadge({ status }) {
  const active = status === "active";
  return (
    <span className={active ? "portal-tag success" : "portal-tag warning"}>
      {active ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function getStatusChangedBy(profile, profiles = []) {
  if (!profile?.status_changed_by) return "Not recorded";
  const actor = profiles.find((item) => item.id === profile.status_changed_by);
  return actor?.full_name || actor?.email || profile.status_changed_by;
}

function AccountStatusControls({ profile, profiles, onSaved }) {
  const currentStatus = profile?.account_status === "active" ? "active" : "inactive";
  const nextStatus = currentStatus === "active" ? "inactive" : "active";
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await setAccountStatus({ userId: profile.id || profile.user_id, status: nextStatus, reason });
      setStatus({ type: "success", message: `Account ${nextStatus === "active" ? "activated" : "deactivated"}.` });
      setConfirming(false);
      setReason("");
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Account status could not be changed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="account-status-controls">
      <AccountStatusBadge status={currentStatus} />
      <dl className="status-audit-details">
        <div><dt>Last status change</dt><dd>{profile?.status_changed_at ? formatDateTime(profile.status_changed_at) : "Not recorded"}</dd></div>
        <div><dt>Changed by</dt><dd>{getStatusChangedBy(profile, profiles)}</dd></div>
        <div><dt>Reason</dt><dd>{profile?.status_reason || "Not recorded"}</dd></div>
      </dl>
      <button className="button button-secondary button-small" type="button" onClick={() => setConfirming(true)}>
        {nextStatus === "active" ? "Activate Account" : "Deactivate Account"}
      </button>
      <StatusMessage status={status} />
      {confirming ? (
        <div className="modal-backdrop" role="presentation">
          <form className="auth-success-modal account-status-modal" role="dialog" aria-modal="true" aria-labelledby={`status-modal-${profile.id || profile.user_id}`} onSubmit={submit}>
            <div>
              <p className="eyebrow">Confirm account status</p>
              <h2 id={`status-modal-${profile.id || profile.user_id}`}>
                {nextStatus === "active" ? "Activate this account?" : "Deactivate this account?"}
              </h2>
              <p>
                This changes Portal access for {profile.full_name || profile.email || "this account"} only after Supabase confirms the update.
              </p>
            </div>
            <label>
              <span>Optional reason</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className="button-row">
              <button className="button button-primary" type="submit" disabled={loading}>
                {loading ? "Saving" : nextStatus === "active" ? "Activate Account" : "Deactivate Account"}
              </button>
              <button className="button button-secondary" type="button" disabled={loading} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function OverviewSection({ data }) {
  const verifiedPayments = data.payments.filter((payment) => payment.verified_at || ["success", "successful", "paid"].includes(String(payment.status || "").toLowerCase()));
  return (
    <div className="portal-page">
      <PageHeading
        title="Platform management overview."
        description="Monitor live platform records and jump into the management area that needs attention."
      />
      <div className="dashboard-grid">
        {[
          [Users, "Students", data.students.length, "Registered learner profiles"],
          [GraduationCap, "Tutors", data.tutors.length, "Tutor profiles"],
          [BookOpen, "Programmes", data.programs.length, "Programme records"],
          [CreditCard, "Verified payments", verifiedPayments.length, "Server-confirmed payments"],
          [Video, "Live classes", data.liveClasses.length, "Scheduled or completed sessions"],
          [LifeBuoy, "Support tickets", data.supportTickets.length, "Student support records"]
        ].map(([Icon, label, value, detail]) => (
          <article className="dashboard-card" key={label}>
            <Icon size={22} aria-hidden="true" />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
      <div className="portal-grid">
        <article className="notice-card">
          <h3>Recent payments</h3>
          {data.payments.slice(0, 5).map((payment) => (
            <p key={payment.id}>{payment.reference}: {payment.status} | {formatAmountKobo(payment.amount_kobo || payment.expected_amount_kobo)}</p>
          ))}
          {!data.payments.length ? <p>No payment attempts have been recorded yet.</p> : null}
        </article>
        <article className="notice-card">
          <h3>Recent support</h3>
          {data.supportTickets.slice(0, 5).map((ticket) => (
            <p key={ticket.id}>{ticket.subject}: {ticket.status}</p>
          ))}
          {!data.supportTickets.length ? <p>No support tickets yet.</p> : null}
        </article>
      </div>
    </div>
  );
}

function TutorCreationForm({ programs, onSaved }) {
  const [values, setValues] = useState({
    title: "Mr",
    fullName: "",
    email: "",
    phone: "",
    temporaryPassword: "",
    programId: "",
    trackId: "",
    specialisation: ""
  });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const tracks = getTrackOptions(programs, values.programId);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await createTutorAccount(values);
      setStatus({ type: "success", message: "Tutor account created as inactive. Activate it when the account is ready for portal access." });
      setValues({ title: "Mr", fullName: "", email: "", phone: "", temporaryPassword: "", programId: "", trackId: "", specialisation: "" });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Tutor account could not be created." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-card management-form" onSubmit={submit}>
      <h3>Create Tutor Account</h3>
      <div className="form-grid">
        <label>
          <span>Title</span>
          <select value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })}>
            <option value="Mr">Mr</option>
            <option value="Mrs">Mrs</option>
          </select>
        </label>
        <label>
          <span>Full name</span>
          <input value={values.fullName} onChange={(event) => setValues({ ...values, fullName: event.target.value })} required />
        </label>
        <label>
          <span>Email</span>
          <input type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} required />
        </label>
        <label>
          <span>Phone</span>
          <input value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} required />
        </label>
        <label>
          <span>Temporary password</span>
          <input type="password" value={values.temporaryPassword} onChange={(event) => setValues({ ...values, temporaryPassword: event.target.value })} required />
        </label>
        <label>
          <span>Assigned programme</span>
          <select value={values.programId} onChange={(event) => setValues({ ...values, programId: event.target.value, trackId: "" })} required>
            <option value="">Choose programme</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
          </select>
        </label>
        <label>
          <span>Assigned track</span>
          <select value={values.trackId} onChange={(event) => setValues({ ...values, trackId: event.target.value })}>
            <option value="">All tracks</option>
            {tracks.map((track) => <option key={track.id} value={track.id}>{track.level_name}</option>)}
          </select>
        </label>
        <label>
          <span>Professional specialisation</span>
          <input value={values.specialisation} onChange={(event) => setValues({ ...values, specialisation: event.target.value })} />
        </label>
      </div>
      <StatusMessage status={status} />
      <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Creating Tutor" : "Create Tutor"}</button>
    </form>
  );
}

function AssignmentForms({ data, onSaved }) {
  const [studentAssignment, setStudentAssignment] = useState({ user_id: "", program_id: "", program_level_id: "", status: "active" });
  const [tutorAssignment, setTutorAssignment] = useState({ tutor_id: "", program_id: "", track_id: "" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const students = data.students;
  const tutors = data.tutors.map((item) => item.profiles).filter(Boolean);
  const studentTracks = getTrackOptions(data.programs, studentAssignment.program_id);
  const tutorTracks = getTrackOptions(data.programs, tutorAssignment.program_id);

  async function saveStudent(event) {
    event.preventDefault();
    try {
      await assignStudentProgramme(studentAssignment);
      setStatus({ type: "success", message: "Student programme assigned." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Student programme could not be assigned." });
    }
  }

  async function saveTutor(event) {
    event.preventDefault();
    try {
      await assignTutorProgramme(tutorAssignment);
      setStatus({ type: "success", message: "Tutor programme assignment saved." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Tutor programme assignment could not be saved." });
    }
  }

  return (
    <div className="portal-grid">
      <form className="form-card management-form" onSubmit={saveStudent}>
        <h3>Assign Programme to Student</h3>
        <label>
          <span>Student</span>
          <select value={studentAssignment.user_id} onChange={(event) => setStudentAssignment({ ...studentAssignment, user_id: event.target.value })} required>
            <option value="">Choose student</option>
            {students.map((student) => <option key={student.id} value={student.id}>{student.full_name || student.email}</option>)}
          </select>
        </label>
        <label>
          <span>Programme</span>
          <select value={studentAssignment.program_id} onChange={(event) => setStudentAssignment({ ...studentAssignment, program_id: event.target.value, program_level_id: "" })} required>
            <option value="">Choose programme</option>
            {data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
          </select>
        </label>
        <label>
          <span>Track</span>
          <select value={studentAssignment.program_level_id} onChange={(event) => setStudentAssignment({ ...studentAssignment, program_level_id: event.target.value })} required>
            <option value="">Choose track</option>
            {studentTracks.map((track) => <option key={track.id} value={track.id}>{track.level_name}</option>)}
          </select>
        </label>
        <button className="button button-secondary" type="submit">Assign Student</button>
      </form>
      <form className="form-card management-form" onSubmit={saveTutor}>
        <h3>Assign Programme to Tutor</h3>
        <label>
          <span>Tutor</span>
          <select value={tutorAssignment.tutor_id} onChange={(event) => setTutorAssignment({ ...tutorAssignment, tutor_id: event.target.value })} required>
            <option value="">Choose tutor</option>
            {tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.title ? `${tutor.title} ` : ""}{tutor.full_name || tutor.email}</option>)}
          </select>
        </label>
        <label>
          <span>Programme</span>
          <select value={tutorAssignment.program_id} onChange={(event) => setTutorAssignment({ ...tutorAssignment, program_id: event.target.value, track_id: "" })} required>
            <option value="">Choose programme</option>
            {data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
          </select>
        </label>
        <label>
          <span>Track</span>
          <select value={tutorAssignment.track_id} onChange={(event) => setTutorAssignment({ ...tutorAssignment, track_id: event.target.value })}>
            <option value="">All tracks</option>
            {tutorTracks.map((track) => <option key={track.id} value={track.id}>{track.level_name}</option>)}
          </select>
        </label>
        <button className="button button-secondary" type="submit">Assign Tutor</button>
      </form>
      <StatusMessage status={status} />
    </div>
  );
}

function buildStudentEditForm(student = {}) {
  return {
    id: student.id || "",
    full_name: student.full_name || "",
    phone: student.phone || "",
    date_of_birth: student.date_of_birth || "",
    education_level: student.education_level || "",
    address: student.address || "",
    program_id: student.program_id || "",
    program_level_id: student.program_level_id || "",
    account_status: student.account_status || "inactive",
    status_reason: student.status_reason || ""
  };
}

function StudentEditPanel({ student, programs, onClose, onSaved }) {
  const [form, setForm] = useState(() => buildStudentEditForm(student));
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const tracks = getTrackOptions(programs, form.program_id);

  useEffect(() => {
    setForm(buildStudentEditForm(student));
    setStatus({ type: "", message: "" });
  }, [student]);

  if (!student) return null;

  async function submit(event) {
    event.preventDefault();
    const programChanged = form.program_id !== (student.program_id || "") || form.program_level_id !== (student.program_level_id || "");
    if (programChanged && (!form.program_id || !form.program_level_id)) {
      setStatus({ type: "warning", message: "Choose both programme and track before saving a programme change." });
      return;
    }

    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await updateStudentProfile({
        ...form,
        program_id: programChanged ? form.program_id : "",
        program_level_id: programChanged ? form.program_level_id : ""
      });
      setStatus({ type: "success", message: "Student record saved." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Student record could not be saved." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-card management-form student-edit-panel" onSubmit={submit}>
      <div className="management-card-heading">
        <div>
          <h3>Edit Student Record</h3>
          <p>{student.email}</p>
        </div>
        <button className="button button-secondary" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="form-grid">
        <label><span>Full name</span><input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
        <label><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label><span>Date of birth</span><input type="date" value={form.date_of_birth || ""} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} /></label>
        <label><span>Education level</span><input value={form.education_level} onChange={(event) => setForm({ ...form, education_level: event.target.value })} /></label>
        <label>
          <span>Programme</span>
          <select value={form.program_id} onChange={(event) => setForm({ ...form, program_id: event.target.value, program_level_id: "" })}>
            <option value="">No programme change</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
          </select>
        </label>
        <label>
          <span>Track</span>
          <select value={form.program_level_id} onChange={(event) => setForm({ ...form, program_level_id: event.target.value })} required={Boolean(form.program_id)}>
            <option value="">Choose track</option>
            {tracks.map((track) => <option key={track.id} value={track.id}>{track.level_name}</option>)}
          </select>
        </label>
        <label>
          <span>Account status</span>
          <select value={form.account_status} onChange={(event) => setForm({ ...form, account_status: event.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>
      <label><span>Address</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
      <label><span>Status reason</span><textarea value={form.status_reason} onChange={(event) => setForm({ ...form, status_reason: event.target.value })} /></label>
      <StatusMessage status={status} />
      <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Saving Student" : "Save Student"}</button>
    </form>
  );
}

function buildTutorEditForm(tutor = {}) {
  return {
    user_id: tutor.user_id || "",
    title: tutor.title || "Mr",
    full_name: tutor.full_name || "",
    phone: tutor.phone || "",
    specialisation: tutor.specialisation || "",
    professional_bio: tutor.professional_bio || "",
    qualifications: tutor.qualifications || "",
    teaching_experience: tutor.teaching_experience || "",
    availability: tutor.availability || "",
    program_id: tutor.program_id || "",
    track_id: tutor.track_id || "",
    account_status: tutor.account_status || "inactive",
    status_reason: tutor.status_reason || ""
  };
}

function TutorEditPanel({ tutor, programs, onClose, onSaved }) {
  const [form, setForm] = useState(() => buildTutorEditForm(tutor));
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const tracks = getTrackOptions(programs, form.program_id);

  useEffect(() => {
    setForm(buildTutorEditForm(tutor));
    setStatus({ type: "", message: "" });
  }, [tutor]);

  if (!tutor) return null;

  async function submit(event) {
    event.preventDefault();
    const assignmentChanged = form.program_id !== (tutor.program_id || "") || form.track_id !== (tutor.track_id || "");
    if (assignmentChanged && !form.program_id) {
      setStatus({ type: "warning", message: "Choose a programme before saving a Tutor assignment change." });
      return;
    }

    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await updateTutorProfile({
        ...form,
        program_id: assignmentChanged ? form.program_id : "",
        track_id: assignmentChanged ? form.track_id : ""
      });
      setStatus({ type: "success", message: "Tutor record saved." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Tutor record could not be saved." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-card management-form tutor-edit-panel" onSubmit={submit}>
      <div className="management-card-heading">
        <div>
          <h3>Edit Tutor Record</h3>
          <p>{tutor.email}</p>
        </div>
        <button className="button button-secondary" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="form-grid">
        <label>
          <span>Title</span>
          <select value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}>
            <option value="Mr">Mr</option>
            <option value="Mrs">Mrs</option>
          </select>
        </label>
        <label><span>Full name</span><input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
        <label><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label><span>Specialisation</span><input value={form.specialisation} onChange={(event) => setForm({ ...form, specialisation: event.target.value })} /></label>
        <label>
          <span>Programme</span>
          <select value={form.program_id} onChange={(event) => setForm({ ...form, program_id: event.target.value, track_id: "" })}>
            <option value="">No assignment change</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
          </select>
        </label>
        <label>
          <span>Track</span>
          <select value={form.track_id} onChange={(event) => setForm({ ...form, track_id: event.target.value })}>
            <option value="">All tracks</option>
            {tracks.map((track) => <option key={track.id} value={track.id}>{track.level_name}</option>)}
          </select>
        </label>
        <label>
          <span>Account status</span>
          <select value={form.account_status} onChange={(event) => setForm({ ...form, account_status: event.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>
      <label><span>Professional bio</span><textarea value={form.professional_bio} onChange={(event) => setForm({ ...form, professional_bio: event.target.value })} /></label>
      <label><span>Qualifications</span><textarea value={form.qualifications} onChange={(event) => setForm({ ...form, qualifications: event.target.value })} /></label>
      <label><span>Teaching experience</span><textarea value={form.teaching_experience} onChange={(event) => setForm({ ...form, teaching_experience: event.target.value })} /></label>
      <label><span>Availability</span><textarea value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })} /></label>
      <label><span>Status reason</span><textarea value={form.status_reason} onChange={(event) => setForm({ ...form, status_reason: event.target.value })} /></label>
      <StatusMessage status={status} />
      <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Saving Tutor" : "Save Tutor"}</button>
    </form>
  );
}

function PeopleSection({ data, onSaved }) {
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState("all");
  const [studentProgramFilter, setStudentProgramFilter] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [tutorSearchInput, setTutorSearchInput] = useState("");
  const [tutorSearch, setTutorSearch] = useState("");
  const [tutorFilter, setTutorFilter] = useState("all");
  const [tutorPage, setTutorPage] = useState(1);
  const [selectedTutor, setSelectedTutor] = useState(null);
  const studentsQuery = useAsyncData(
    () => searchAdminStudents({
      query: studentSearch,
      status: studentStatusFilter,
      programId: studentProgramFilter,
      page: studentPage,
      pageSize: 25
    }),
    [studentSearch, studentStatusFilter, studentProgramFilter, studentPage]
  );
  const tutorsQuery = useAsyncData(
    () => searchAdminTutors({
      query: tutorSearch,
      filter: tutorFilter,
      page: tutorPage,
      pageSize: 25
    }),
    [tutorSearch, tutorFilter, tutorPage]
  );
  const studentRecords = studentsQuery.data?.records || [];
  const studentTotal = studentsQuery.data?.total || 0;
  const studentPageCount = studentsQuery.data?.pageCount || 1;
  const tutorRecords = tutorsQuery.data?.records || [];
  const tutorTotal = tutorsQuery.data?.total || 0;
  const tutorPageCount = tutorsQuery.data?.pageCount || 1;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStudentSearch(studentSearchInput);
      setStudentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [studentSearchInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTutorSearch(tutorSearchInput);
      setTutorPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [tutorSearchInput]);

  useEffect(() => {
    setStudentPage(1);
  }, [studentStatusFilter, studentProgramFilter]);

  useEffect(() => {
    setTutorPage(1);
  }, [tutorFilter]);

  function handleStudentsChanged() {
    studentsQuery.refetch();
    onSaved();
  }

  function handleTutorsChanged() {
    tutorsQuery.refetch();
    onSaved();
  }

  return (
    <div className="portal-page">
      <PageHeading title="Students and tutors." description="Review account records, create tutors securely, and assign official programme access." />
      <TutorCreationForm programs={data.programs} onSaved={handleTutorsChanged} />
      <AssignmentForms data={data} onSaved={() => { handleStudentsChanged(); handleTutorsChanged(); }} />
      <StudentEditPanel
        student={selectedStudent}
        programs={data.programs}
        onClose={() => setSelectedStudent(null)}
        onSaved={handleStudentsChanged}
      />
      <TutorEditPanel
        tutor={selectedTutor}
        programs={data.programs}
        onClose={() => setSelectedTutor(null)}
        onSaved={handleTutorsChanged}
      />
      <div className="portal-grid">
        <article className="notice-card">
          <div className="management-card-heading">
            <div>
              <h3>Registered students</h3>
              <p>{studentTotal ? `${studentTotal} matching student${studentTotal === 1 ? "" : "s"}` : "Search and filter student records"}</p>
            </div>
          </div>
          <div className="admin-student-toolbar">
            <label>
              <span>Search students</span>
              <input
                value={studentSearchInput}
                onChange={(event) => setStudentSearchInput(event.target.value)}
                placeholder="Name, email, phone, programme or status"
              />
            </label>
            <label>
              <span>Programme</span>
              <select value={studentProgramFilter} onChange={(event) => setStudentProgramFilter(event.target.value)}>
                <option value="">All programmes</option>
                {data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
              </select>
            </label>
            <div className="segmented-control compact" role="group" aria-label="Student account status filter">
              {["all", "active", "inactive"].map((status) => (
                <button key={status} type="button" className={studentStatusFilter === status ? "active" : ""} onClick={() => setStudentStatusFilter(status)}>
                  {status === "all" ? "All" : status[0].toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {studentsQuery.error ? (
            <div className="form-status warning" role="alert">
              Student records could not be loaded.
              <button className="text-link" type="button" onClick={studentsQuery.refetch}>Try again</button>
            </div>
          ) : null}
          <div className="responsive-table-wrap">
            <table className="management-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Programme</th><th>Status</th><th>Status audit</th><th>Action</th></tr></thead>
              <tbody>
                {studentRecords.map((student) => (
                  <tr key={student.id}>
                    <td>{student.full_name || "Unnamed"}</td>
                    <td>{student.email}</td>
                    <td>{student.phone}</td>
                    <td>{student.program_title ? `${student.program_title}${student.level_name ? ` / ${student.level_name}` : ""}` : "Not assigned"}</td>
                    <td><AccountStatusBadge status={student.account_status} /></td>
                    <td>
                      <dl className="status-audit-details compact">
                        <div><dt>Changed</dt><dd>{student.status_changed_at ? formatDateTime(student.status_changed_at) : "Not recorded"}</dd></div>
                        <div><dt>By</dt><dd>{getStatusChangedBy(student, data.profiles)}</dd></div>
                        <div><dt>Reason</dt><dd>{student.status_reason || "Not recorded"}</dd></div>
                      </dl>
                    </td>
                    <td>
                      <div className="table-action-stack">
                        <button className="button button-secondary" type="button" onClick={() => setSelectedStudent(student)}>Edit</button>
                        <AccountStatusControls profile={student} profiles={data.profiles} onSaved={handleStudentsChanged} />
                      </div>
                    </td>
                  </tr>
                ))}
                {studentsQuery.loading ? <tr><td colSpan="7">Loading students...</td></tr> : null}
                {!studentsQuery.loading && !studentsQuery.error && !studentRecords.length ? <tr><td colSpan="7">No students match this search.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="pagination-controls" aria-label="Student search pagination">
            <button className="button button-secondary" type="button" disabled={studentPage <= 1 || studentsQuery.loading} onClick={() => setStudentPage((page) => Math.max(1, page - 1))}>Previous</button>
            <span>Page {studentPage} of {studentPageCount}</span>
            <button className="button button-secondary" type="button" disabled={studentPage >= studentPageCount || studentsQuery.loading} onClick={() => setStudentPage((page) => page + 1)}>Next</button>
          </div>
        </article>
        <article className="notice-card">
          <div className="management-card-heading">
            <div>
              <h3>Tutor directory</h3>
              <p>{tutorTotal ? `${tutorTotal} matching tutor${tutorTotal === 1 ? "" : "s"}` : "Search and filter Tutor records"}</p>
            </div>
          </div>
          <div className="admin-student-toolbar">
            <label>
              <span>Search tutors</span>
              <input
                value={tutorSearchInput}
                onChange={(event) => setTutorSearchInput(event.target.value)}
                placeholder="Name, email, phone, programme or specialisation"
              />
            </label>
            <div className="segmented-control compact multi-row" role="group" aria-label="Tutor directory filter">
              {[
                ["all", "All"],
                ["active", "Active"],
                ["inactive", "Inactive"],
                ["assigned", "Assigned"],
                ["unassigned", "Unassigned"]
              ].map(([value, label]) => (
                <button key={value} type="button" className={tutorFilter === value ? "active" : ""} onClick={() => setTutorFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {tutorsQuery.error ? (
            <div className="form-status warning" role="alert">
              Tutor records could not be loaded.
              <button className="text-link" type="button" onClick={tutorsQuery.refetch}>Try again</button>
            </div>
          ) : null}
          <div className="responsive-table-wrap">
            <table className="management-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Programme</th><th>Status</th><th>Profile</th><th>Action</th></tr></thead>
              <tbody>
                {tutorRecords.map((tutor) => (
                  <tr key={tutor.user_id}>
                    <td>{tutor.title} {tutor.full_name || "Tutor"}</td>
                    <td>{tutor.email}</td>
                    <td>{tutor.phone || "Not recorded"}</td>
                    <td>{tutor.program_title ? `${tutor.program_title}${tutor.track_name ? ` / ${tutor.track_name}` : ""}` : "Unassigned"}</td>
                    <td><AccountStatusBadge status={tutor.account_status} /></td>
                    <td>{Number(tutor.profile_completion || 0)}%</td>
                    <td>
                      <div className="table-action-stack">
                        <button className="button button-secondary" type="button" onClick={() => setSelectedTutor(tutor)}>Edit</button>
                        <AccountStatusControls profile={tutor} profiles={data.profiles} onSaved={handleTutorsChanged} />
                      </div>
                    </td>
                  </tr>
                ))}
                {tutorsQuery.loading ? <tr><td colSpan="7">Loading tutors...</td></tr> : null}
                {!tutorsQuery.loading && !tutorsQuery.error && !tutorRecords.length ? <tr><td colSpan="7">No Tutors match this search.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="pagination-controls" aria-label="Tutor search pagination">
            <button className="button button-secondary" type="button" disabled={tutorPage <= 1 || tutorsQuery.loading} onClick={() => setTutorPage((page) => Math.max(1, page - 1))}>Previous</button>
            <span>Page {tutorPage} of {tutorPageCount}</span>
            <button className="button button-secondary" type="button" disabled={tutorPage >= tutorPageCount || tutorsQuery.loading} onClick={() => setTutorPage((page) => page + 1)}>Next</button>
          </div>
        </article>
      </div>
    </div>
  );
}

function ProgramLevelPriceEditor({ level, onSaved }) {
  const [price, setPrice] = useState(String(Number(level.price_kobo || 0) / 100));
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPrice(String(Number(level.price_kobo || 0) / 100));
    setReason("");
    setStatus({ type: "", message: "" });
  }, [level.id, level.price_kobo]);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await updateProgramLevelPrice({ levelId: level.id, price, reason });
      setStatus({ type: "success", message: "Price saved." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Price could not be saved." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="program-price-editor" onSubmit={submit}>
      <div>
        <strong>{level.level_name}</strong>
        <span>{formatAmountKobo(level.price_kobo)}</span>
      </div>
      <label>
        <span>Price in naira</span>
        <input type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} />
      </label>
      <label>
        <span>Reason</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <button className="button button-secondary" type="submit" disabled={loading}>{loading ? "Saving" : "Save Price"}</button>
      <StatusMessage status={status} />
    </form>
  );
}

function ProgrammesSection({ data, onSaved }) {
  const [programForm, setProgramForm] = useState(emptyProgramForm);
  const [trackForm, setTrackForm] = useState({ program_id: "", level_name: "", level_description: "", duration_text: "", price: "", active: true });
  const [status, setStatus] = useState({ type: "", message: "" });

  async function submitProgram(event) {
    event.preventDefault();
    try {
      await saveProgram(programForm);
      setProgramForm(emptyProgramForm);
      setStatus({ type: "success", message: "Programme saved." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Programme could not be saved." });
    }
  }

  async function submitTrack(event) {
    event.preventDefault();
    try {
      await saveProgramLevel(trackForm);
      setTrackForm({ program_id: "", level_name: "", level_description: "", duration_text: "", price: "", active: true });
      setStatus({ type: "success", message: "Track and price saved." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Track could not be saved." });
    }
  }

  return (
    <div className="portal-page">
      <PageHeading title="Programmes, tracks and prices." description="Programme display records and track prices are managed from Supabase." />
      <div className="portal-grid">
        <form className="form-card management-form" onSubmit={submitProgram}>
          <h3>Add Programme</h3>
          <div className="form-grid">
            <label><span>Slug</span><input value={programForm.slug} onChange={(event) => setProgramForm({ ...programForm, slug: event.target.value })} required /></label>
            <label><span>Title</span><input value={programForm.title} onChange={(event) => setProgramForm({ ...programForm, title: event.target.value })} required /></label>
            <label><span>Category</span><input value={programForm.category} onChange={(event) => setProgramForm({ ...programForm, category: event.target.value })} /></label>
            <label><span>Display order</span><input type="number" value={programForm.display_order} onChange={(event) => setProgramForm({ ...programForm, display_order: event.target.value })} /></label>
          </div>
          <label><span>Short description</span><textarea value={programForm.short_description} onChange={(event) => setProgramForm({ ...programForm, short_description: event.target.value })} required /></label>
          <label><span>Long description</span><textarea value={programForm.long_description} onChange={(event) => setProgramForm({ ...programForm, long_description: event.target.value })} /></label>
          <div className="portal-toggle-list">
            <label><input type="checkbox" checked={programForm.active} onChange={(event) => setProgramForm({ ...programForm, active: event.target.checked })} /><span>Published</span></label>
            <label><input type="checkbox" checked={programForm.featured} onChange={(event) => setProgramForm({ ...programForm, featured: event.target.checked })} /><span>Featured</span></label>
          </div>
          <button className="button button-primary" type="submit">Save Programme</button>
        </form>
        <form className="form-card management-form" onSubmit={submitTrack}>
          <h3>Add Track or Price</h3>
          <label>
            <span>Programme</span>
            <select value={trackForm.program_id} onChange={(event) => setTrackForm({ ...trackForm, program_id: event.target.value })} required>
              <option value="">Choose programme</option>
              {data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
            </select>
          </label>
          <div className="form-grid">
            <label><span>Track name</span><input value={trackForm.level_name} onChange={(event) => setTrackForm({ ...trackForm, level_name: event.target.value })} required /></label>
            <label><span>Price in naira</span><input type="number" min="0" value={trackForm.price} onChange={(event) => setTrackForm({ ...trackForm, price: event.target.value })} required /></label>
          </div>
          <label><span>Duration</span><input value={trackForm.duration_text} onChange={(event) => setTrackForm({ ...trackForm, duration_text: event.target.value })} /></label>
          <label><span>Description</span><textarea value={trackForm.level_description} onChange={(event) => setTrackForm({ ...trackForm, level_description: event.target.value })} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={trackForm.active} onChange={(event) => setTrackForm({ ...trackForm, active: event.target.checked })} /><span>Published</span></label>
          <button className="button button-primary" type="submit">Save Track</button>
        </form>
      </div>
      <StatusMessage status={status} />
      <div className="portal-list">
        {data.programs.map((program) => (
          <article className="portal-record-card" key={program.id}>
            <div>
              <p className="eyebrow">{program.active ? "Published" : "Unpublished"}</p>
              <h3>{program.title}</h3>
              <p>{program.short_description}</p>
            </div>
            <div className="program-price-list">
              {(program.program_levels || []).map((level) => (
                <ProgramLevelPriceEditor key={level.id} level={level} onSaved={onSaved} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ContentSection({ data, onSaved }) {
  const [status, setStatus] = useState({ type: "", message: "" });
  const [announcement, setAnnouncement] = useState({ program_id: "", title: "", summary: "", body: "", priority: "normal", category: "General", published: true });
  const [timetable, setTimetable] = useState({ program_id: "", title: "", day_of_week: 1, start_time: "17:00", end_time: "18:30", delivery_mode: "online", published: true });
  const [assignment, setAssignment] = useState({ program_id: "", title: "", instructions: "", maximum_score: 100, published: true });
  const [resource, setResource] = useState({ program_id: "", title: "", module_title: "", description: "", external_url: "", resource_type: "link", published: true });
  const [article, setArticle] = useState({ program_id: "", title: "", summary: "", body: "", category: "Learning", external_url: "", published: true });

  async function submit(handler, values, successMessage) {
    try {
      await handler(values);
      setStatus({ type: "success", message: successMessage });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Content could not be saved." });
    }
  }

  return (
    <div className="portal-page">
      <PageHeading title="Portal content management." description="Create, publish and update learning content that appears in student and tutor workspaces." />
      <div className="portal-grid">
        <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveAnnouncement, announcement, "Announcement saved."); }}>
          <h3>Announcement</h3>
          <ContentProgramSelect data={data} values={announcement} setValues={setAnnouncement} />
          <label><span>Title</span><input value={announcement.title} onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })} required /></label>
          <label><span>Summary</span><input value={announcement.summary} onChange={(event) => setAnnouncement({ ...announcement, summary: event.target.value })} /></label>
          <label><span>Body</span><textarea value={announcement.body} onChange={(event) => setAnnouncement({ ...announcement, body: event.target.value })} required /></label>
          <button className="button button-secondary" type="submit">Save Announcement</button>
        </form>
        <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveTimetableEntry, timetable, "Timetable entry saved."); }}>
          <h3>Timetable Entry</h3>
          <ContentProgramSelect data={data} values={timetable} setValues={setTimetable} required />
          <label><span>Title</span><input value={timetable.title} onChange={(event) => setTimetable({ ...timetable, title: event.target.value })} required /></label>
          <div className="form-grid">
            <label><span>Day</span><input type="number" min="0" max="6" value={timetable.day_of_week} onChange={(event) => setTimetable({ ...timetable, day_of_week: event.target.value })} /></label>
            <label><span>Start</span><input type="time" value={timetable.start_time} onChange={(event) => setTimetable({ ...timetable, start_time: event.target.value })} /></label>
            <label><span>End</span><input type="time" value={timetable.end_time} onChange={(event) => setTimetable({ ...timetable, end_time: event.target.value })} /></label>
          </div>
          <button className="button button-secondary" type="submit">Save Timetable</button>
        </form>
        <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveAssignment, assignment, "Assignment saved."); }}>
          <h3>Assignment</h3>
          <ContentProgramSelect data={data} values={assignment} setValues={setAssignment} required />
          <label><span>Title</span><input value={assignment.title} onChange={(event) => setAssignment({ ...assignment, title: event.target.value })} required /></label>
          <label><span>Instructions</span><textarea value={assignment.instructions} onChange={(event) => setAssignment({ ...assignment, instructions: event.target.value })} required /></label>
          <button className="button button-secondary" type="submit">Save Assignment</button>
        </form>
        <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveResource, resource, "Resource saved."); }}>
          <h3>Learning Resource</h3>
          <ContentProgramSelect data={data} values={resource} setValues={setResource} required />
          <label><span>Title</span><input value={resource.title} onChange={(event) => setResource({ ...resource, title: event.target.value })} required /></label>
          <label><span>External URL</span><input value={resource.external_url} onChange={(event) => setResource({ ...resource, external_url: event.target.value })} /></label>
          <label><span>Description</span><textarea value={resource.description} onChange={(event) => setResource({ ...resource, description: event.target.value })} /></label>
          <button className="button button-secondary" type="submit">Save Resource</button>
        </form>
        <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveArticle, article, "Article saved."); }}>
          <h3>Learning Article</h3>
          <ContentProgramSelect data={data} values={article} setValues={setArticle} />
          <label><span>Title</span><input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} required /></label>
          <label><span>Summary</span><input value={article.summary} onChange={(event) => setArticle({ ...article, summary: event.target.value })} /></label>
          <label><span>Body</span><textarea value={article.body} onChange={(event) => setArticle({ ...article, body: event.target.value })} /></label>
          <button className="button button-secondary" type="submit">Save Article</button>
        </form>
      </div>
      <StatusMessage status={status} />
    </div>
  );
}

function ContentProgramSelect({ data, values, setValues, required = false }) {
  return (
    <label>
      <span>Programme</span>
      <select value={values.program_id || ""} onChange={(event) => setValues({ ...values, program_id: event.target.value })} required={required}>
        <option value="">General or choose programme</option>
        {data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
      </select>
    </label>
  );
}

function LiveClassesSection({ data, onSaved }) {
  const [form, setForm] = useState({ program_id: "", track_id: "", tutor_id: "", title: "", description: "", scheduled_start: "", scheduled_end: "", provider: "daily", provider_room_id: "", provider_room_url: "", status: "scheduled" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const tutors = data.tutors.map((item) => item.profiles).filter(Boolean);

  async function submit(event) {
    event.preventDefault();
    try {
      await scheduleLiveClass(form);
      setStatus({ type: "success", message: "Live class saved." });
      setForm({ program_id: "", track_id: "", tutor_id: "", title: "", description: "", scheduled_start: "", scheduled_end: "", provider: "daily", provider_room_id: "", provider_room_url: "", status: "scheduled" });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Live class could not be saved." });
    }
  }

  return (
    <div className="portal-page">
      <PageHeading title="Live classes." description="Schedule provider-backed sessions. Join links open only through server-generated access tokens." />
      <form className="form-card management-form" onSubmit={submit}>
        <div className="form-grid">
          <label><span>Programme</span><select value={form.program_id} onChange={(event) => setForm({ ...form, program_id: event.target.value })} required><option value="">Choose programme</option>{data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}</select></label>
          <label><span>Tutor</span><select value={form.tutor_id} onChange={(event) => setForm({ ...form, tutor_id: event.target.value })}><option value="">No tutor assigned</option>{tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.title ? `${tutor.title} ` : ""}{tutor.full_name}</option>)}</select></label>
          <label><span>Title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
          <label><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="scheduled">scheduled</option><option value="live">live</option><option value="completed">completed</option><option value="cancelled">cancelled</option></select></label>
          <label><span>Start</span><input type="datetime-local" value={form.scheduled_start} onChange={(event) => setForm({ ...form, scheduled_start: event.target.value })} required /></label>
          <label><span>End</span><input type="datetime-local" value={form.scheduled_end} onChange={(event) => setForm({ ...form, scheduled_end: event.target.value })} required /></label>
          <label><span>Provider room ID</span><input value={form.provider_room_id} onChange={(event) => setForm({ ...form, provider_room_id: event.target.value })} /></label>
          <label><span>Provider room URL</span><input value={form.provider_room_url} onChange={(event) => setForm({ ...form, provider_room_url: event.target.value })} /></label>
        </div>
        <label><span>Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <button className="button button-primary" type="submit">Save Live Class</button>
      </form>
      <StatusMessage status={status} />
      <LiveClassCards sessions={data.liveClasses} />
    </div>
  );
}

function PaymentsSection({ data }) {
  const [filters, setFilters] = useState({ status: "", email: "", programme: "", reference: "" });
  const payments = useMemo(() => data.payments.filter((payment) => {
    const haystack = `${payment.reference || ""} ${payment.customer_email || ""} ${payment.product_name || ""} ${payment.product_key || ""}`.toLowerCase();
    if (filters.status && String(payment.status || "").toLowerCase() !== filters.status) return false;
    if (filters.email && !String(payment.customer_email || "").toLowerCase().includes(filters.email.toLowerCase())) return false;
    if (filters.programme && !haystack.includes(filters.programme.toLowerCase())) return false;
    if (filters.reference && !String(payment.reference || "").toLowerCase().includes(filters.reference.toLowerCase())) return false;
    return true;
  }), [data.payments, filters]);

  return (
    <div className="portal-page">
      <PageHeading title="Paystack payment attempts." description="Review initiated, pending, successful, failed, declined, cancelled and abandoned payment records." />
      <div className="filter-bar">
        <input placeholder="Reference" value={filters.reference} onChange={(event) => setFilters({ ...filters, reference: event.target.value })} />
        <input placeholder="Email" value={filters.email} onChange={(event) => setFilters({ ...filters, email: event.target.value })} />
        <input placeholder="Programme" value={filters.programme} onChange={(event) => setFilters({ ...filters, programme: event.target.value })} />
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">All statuses</option>
          {["initiated", "pending", "initialized", "success", "failed", "declined", "cancelled", "abandoned"].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>
      <div className="responsive-table-wrap">
        <table className="management-table">
          <thead><tr><th>Reference</th><th>Email</th><th>Programme</th><th>Amount</th><th>Status</th><th>Verification</th><th>Date</th></tr></thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.reference}</td>
                <td>{payment.customer_email}</td>
                <td>{payment.product_name || payment.product_key}</td>
                <td>{formatAmountKobo(payment.amount_kobo || payment.expected_amount_kobo)}</td>
                <td>{payment.status}</td>
                <td>{payment.verified_at ? "server_verified" : "client_reported_or_unverified"}</td>
                <td>{formatDateTime(payment.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupportSection({ data, onSaved }) {
  const [responses, setResponses] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });

  async function respond(ticket) {
    try {
      await respondToSupportTicket({ id: ticket.id, response: responses[ticket.id] || "", status: "in_progress" });
      setStatus({ type: "success", message: "Support response saved." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Support response could not be saved." });
    }
  }

  return (
    <div className="portal-page">
      <PageHeading title="Support tickets." description="Read and respond to student support requests." />
      <StatusMessage status={status} />
      <div className="portal-list">
        {data.supportTickets.map((ticket) => (
          <article className="portal-record-card" key={ticket.id}>
            <div>
              <p className="eyebrow">{ticket.status} | {formatDateTime(ticket.created_at)}</p>
              <h3>{ticket.subject}</h3>
              <p>{ticket.message}</p>
              {ticket.response ? <p><strong>Current response:</strong> {ticket.response}</p> : null}
            </div>
            <label>
              <span>Response</span>
              <textarea value={responses[ticket.id] || ""} onChange={(event) => setResponses({ ...responses, [ticket.id]: event.target.value })} />
            </label>
            <button className="button button-secondary" type="button" onClick={() => respond(ticket)}>Save Response</button>
          </article>
        ))}
      </div>
    </div>
  );
}

function AuditSection({ data }) {
  return (
    <div className="portal-page">
      <PageHeading title="Audit logs." description="Review safe records of important admin and security actions." />
      <div className="portal-list">
        {data.auditLogs.map((log) => (
          <article className="portal-record-card" key={log.id}>
            <p className="eyebrow">{formatDateTime(log.created_at)}</p>
            <h3>{log.action}</h3>
            <p>{log.target_table || "platform"} {log.target_id || ""}</p>
          </article>
        ))}
        {!data.auditLogs.length ? <div className="notice-card"><p>No audit events have been recorded yet.</p></div> : null}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { section = "overview" } = useParams();
  const dataQuery = useAsyncData(() => getAdminDashboardData(), []);
  const activeSection = sections.some(([slug]) => slug === section) ? section : "overview";

  usePageMeta({
    path: activeSection === "overview" ? "/admin" : `/admin/${activeSection}`,
    title: "Admin Dashboard",
    description: "Protected Zentel Insight admin dashboard.",
    robots: "noindex,nofollow"
  });

  if (dataQuery.loading) return <div className="route-loader">Loading admin dashboard</div>;
  if (dataQuery.error) {
    return (
      <section className="page-section">
        <div className="container narrow">
          <div className="notice-card">
            <h1>Admin dashboard could not be loaded</h1>
            <p>{dataQuery.error}</p>
            <button className="button button-primary" type="button" onClick={dataQuery.refetch}>Try Again</button>
          </div>
        </div>
      </section>
    );
  }

  const data = dataQuery.data;
  return (
    <AdminFrame data={data}>
      {activeSection === "overview" ? <OverviewSection data={data} /> : null}
      {activeSection === "people" ? <PeopleSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "programmes" ? <ProgrammesSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "content" ? <ContentSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "live-classes" ? <LiveClassesSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "classrooms" ? (
        <div className="portal-page">
          <PageHeading title="Classroom moderation." description="Inspect programme classroom chat rooms and moderate inappropriate messages." />
          <ProgramChatPanel canModerate />
        </div>
      ) : null}
      {activeSection === "payments" ? <PaymentsSection data={data} /> : null}
      {activeSection === "support" ? <SupportSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "audit" ? <AuditSection data={data} /> : null}
    </AdminFrame>
  );
}
