import { useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Bell,
  BrainCircuit,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  GraduationCap,
  ImageUp,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  Newspaper,
  Settings,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  Video
} from "lucide-react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import LiveClassCards from "../components/LiveClassCards";
import ProgramChatPanel from "../components/ProgramChatPanel";
import PortalDialog from "../components/portal/PortalDialog";
import PortalShell from "../components/portal/PortalShell";
import { AccountLookupSection, AccountManagementSection } from "./admin/AdminAccountSections";
import AdminAiSection from "./admin/AdminAiSection";
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
  updateAdminProfile,
  updateProgramLevelPrice,
  updateStudentProfile,
  updateTutorProfile
} from "../services/adminService";
import { formatCurrency, formatDateTime } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";

const sections = [
  ["overview", "Overview", LayoutDashboard],
  ["accounts", "Account Lookup", Search],
  ["programmes", "Programmes", GraduationCap],
  ["enrolments", "Enrolments", FileCheck2],
  ["classrooms", "Classrooms", MessageSquare],
  ["zentel-ai", "Zentel AI", BrainCircuit],
  ["live-classes", "Live Classes", Video],
  ["timetable", "Timetable", CalendarDays],
  ["announcements", "Announcements", Megaphone],
  ["assignments", "Assignments", FileCheck2],
  ["resources", "Resources", BookOpen],
  ["articles", "Articles", Newspaper],
  ["payments", "Payments", CreditCard],
  ["certificates", "Certificates", Award],
  ["notifications", "Notifications", Bell],
  ["support", "Support", LifeBuoy],
  ["audit", "Audit Log", ShieldCheck],
  ["profile", "Profile", UserRound],
  ["settings", "Settings", Settings]
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

function AdminAvatar({ profile, displayName, size = "md" }) {
  return (
    <span className={`portal-avatar ${size}`}>
      {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

function AdminFrame({ data, onRealtimeChange, children }) {
  const { profile } = useAuth();
  const displayName = "Admin";
  return (
    <PortalShell
      sidebar={{
        homeTo: "/admin",
        brandLabel: "Admin Dashboard",
        profileName: displayName,
        profileDetail: "Verified admin session",
        avatarUrl: profile?.avatar_url,
        navLabel: "Admin dashboard",
        menuLabel: "admin",
        shellClass: "management-shell admin-shell",
        items: sections.map(([slug, label, Icon]) => ({
          to: slug === "overview" ? "/admin" : `/admin/${slug}`,
          label,
          Icon,
          end: slug === "overview"
        }))
      }}
      header={{
        eyebrow: "Admin",
        title: "Zentel Insight Admin",
        status: <span className="portal-tag success"><ShieldCheck size={14} aria-hidden="true" />Verified</span>
      }}
      idleEnabled={Boolean(data)}
      realtimeTables={[
        "announcements",
        "assignments",
        "audit_logs",
        "certificates",
        "enrolments",
        "live_class_attendance",
        "live_class_sessions",
        "payments",
        "portal_articles",
        "portal_notifications",
        "profiles",
        "program_levels",
        "programs",
        "resources",
        "support_ticket_messages",
        "support_tickets",
        "timetable_entries",
        "tutor_profiles",
        "tutor_program_assignments",
        "user_roles"
      ]}
      onRealtimeChange={onRealtimeChange}
    >
      {children}
    </PortalShell>
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
  const suspended = status === "suspended";
  return (
    <span className={active ? "portal-tag success" : suspended ? "portal-tag danger" : "portal-tag warning"}>
      {active ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
      {active ? "Active" : suspended ? "Suspended" : "Inactive"}
    </span>
  );
}

function getStatusChangedBy(profile, profiles = []) {
  if (!profile?.status_changed_by) return "Not recorded";
  const actor = profiles.find((item) => item.id === profile.status_changed_by);
  return actor?.full_name || actor?.email || profile.status_changed_by;
}

function AccountStatusControls({ profile, profiles, onSaved }) {
  const currentStatus = ["active", "suspended"].includes(profile?.account_status) ? profile.account_status : "inactive";
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
                This changes Portal access for {profile.full_name || profile.email || "this account"} only after the secure update is confirmed.
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
  const tutorMetrics = data.peopleMetrics || {};
  return (
    <div className="portal-page">
      <PageHeading
        title="Platform management overview."
        description="Monitor live platform records and jump into the management area that needs attention."
      />
      <div className="dashboard-grid">
        {[
          [Users, "Total Students", tutorMetrics.totalStudents ?? data.students.length, "Registered learner profiles"],
          [CheckCircle2, "Active Students", tutorMetrics.activeStudents ?? 0, "Learners with Portal access"],
          [ShieldCheck, "Inactive Students", tutorMetrics.inactiveStudents ?? 0, "Learners awaiting activation"],
          [GraduationCap, "Total Tutors", tutorMetrics.totalTutors ?? data.tutors.length, "Canonical Tutor accounts"],
          [UserRound, "Assigned Tutors", tutorMetrics.assignedTutors ?? new Set(data.tutorAssignments.filter((item) => item.active !== false).map((item) => item.tutor_id)).size, "Distinct Tutors with current assignments"],
          [ShieldCheck, "Programmes Without Tutors", tutorMetrics.programmesWithoutTutors ?? 0, "Active programmes missing Tutor coverage"],
          [Video, "Upcoming Classes", data.liveClasses.filter((item) => ["scheduled", "live"].includes(item.status)).length, "Scheduled or live sessions"],
          [LifeBuoy, "Open Support Tickets", data.supportTickets.filter((item) => !["resolved", "closed"].includes(item.status)).length, "Requests awaiting resolution"]
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
  const navigate = useNavigate();
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
      const result = await createTutorAccount(values);
      setStatus({ type: "success", message: "Tutor account created as inactive. Activate it when the account is ready for portal access." });
      setValues({ title: "Mr", fullName: "", email: "", phone: "", temporaryPassword: "", programId: "", trackId: "", specialisation: "" });
      await onSaved();
      if (result.portalId) navigate(`/admin/accounts/${encodeURIComponent(result.portalId)}`);
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

function buildStudentEditForm(student) {
  const record = student || {};
  return {
    id: record.id || "",
    full_name: record.full_name || "",
    phone: record.phone || "",
    date_of_birth: record.date_of_birth || "",
    education_level: record.education_level || "",
    address: record.address || "",
    program_id: record.program_id || "",
    program_level_id: record.program_level_id || "",
    account_status: record.account_status || "inactive",
    status_reason: record.status_reason || ""
  };
}

function StudentEditPanel({ student, programs, onClose, onSaved }) {
  const [form, setForm] = useState(() => buildStudentEditForm(student));
  const [baseline, setBaseline] = useState(() => buildStudentEditForm(student));
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const tracks = getTrackOptions(programs, form.program_id);

  useEffect(() => {
    const nextForm = buildStudentEditForm(student);
    setForm(nextForm);
    setBaseline(nextForm);
    setStatus({ type: "", message: "" });
  }, [student]);

  if (!student) return null;

  async function submit(event) {
    event.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) {
      setStatus({ type: "warning", message: "Enter the Student's full name and phone number before saving." });
      return;
    }
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
        account_status: form.account_status === (student.account_status || "inactive") ? "" : form.account_status,
        program_id: programChanged ? form.program_id : "",
        program_level_id: programChanged ? form.program_level_id : ""
      });
      setBaseline(form);
      setStatus({ type: "success", message: "Student record saved." });
      await onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Student record could not be saved." });
    } finally {
      setLoading(false);
    }
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  return (
    <PortalDialog
      open={Boolean(student)}
      title="Edit Student Record"
      description={`Update the authorised account details for ${student.email}.`}
      dirty={dirty}
      busy={loading}
      onClose={onClose}
    >
      {({ requestClose }) => <form className="portal-dialog-form management-form student-edit-panel" onSubmit={submit}>
      <div className="portal-dialog-form-fields">
      <div className="form-grid">
        <label><span>Full name</span><input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
        <label><span>Phone number</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
        <label><span>Date of birth</span><input type="date" value={form.date_of_birth || ""} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} /></label>
        <label><span>Education level</span><input value={form.education_level} onChange={(event) => setForm({ ...form, education_level: event.target.value })} /></label>
        <label>
          <span>Programme</span>
          <select value={form.program_id} onChange={(event) => setForm({ ...form, program_id: event.target.value, program_level_id: "" })}>
            <option value="">Choose programme</option>
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
            {form.account_status === "suspended" ? <option value="suspended" disabled>Suspended</option> : null}
          </select>
        </label>
      </div>
      <label><span>Address</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
      <label><span>Status reason</span><textarea value={form.status_reason} onChange={(event) => setForm({ ...form, status_reason: event.target.value })} /></label>
      <StatusMessage status={status} />
      </div>
      <div className="portal-dialog-actions">
        <button className="button button-secondary" type="button" disabled={loading} onClick={requestClose}>Cancel</button>
        <button className="button button-primary" type="submit" disabled={loading || !dirty}>{loading ? "Saving Changes" : "Save Changes"}</button>
      </div>
    </form>}
    </PortalDialog>
  );
}

function buildTutorEditForm(tutor) {
  const record = tutor || {};
  return {
    user_id: record.user_id || "",
    title: record.title || "Mr",
    full_name: record.full_name || "",
    phone: record.phone || "",
    specialisation: record.specialisation || "",
    professional_bio: record.professional_bio || "",
    qualifications: record.qualifications || "",
    teaching_experience: record.teaching_experience || "",
    availability: record.availability || "",
    program_id: record.program_id || "",
    track_id: record.track_id || "",
    account_status: record.account_status || "inactive",
    status_reason: record.status_reason || ""
  };
}

function TutorEditPanel({ tutor, programs, onClose, onSaved }) {
  const [form, setForm] = useState(() => buildTutorEditForm(tutor));
  const [baseline, setBaseline] = useState(() => buildTutorEditForm(tutor));
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const tracks = getTrackOptions(programs, form.program_id);

  useEffect(() => {
    const nextForm = buildTutorEditForm(tutor);
    setForm(nextForm);
    setBaseline(nextForm);
    setStatus({ type: "", message: "" });
  }, [tutor]);

  if (!tutor) return null;

  async function submit(event) {
    event.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) {
      setStatus({ type: "warning", message: "Enter the Tutor's full name and phone number before saving." });
      return;
    }
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
        account_status: form.account_status === (tutor.account_status || "inactive") ? "" : form.account_status,
        program_id: assignmentChanged ? form.program_id : "",
        track_id: assignmentChanged ? form.track_id : ""
      });
      setBaseline(form);
      setStatus({ type: "success", message: "Tutor record saved." });
      await onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Tutor record could not be saved." });
    } finally {
      setLoading(false);
    }
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  return (
    <PortalDialog
      open={Boolean(tutor)}
      title="Edit Tutor Record"
      description={`Update the authorised account details for ${tutor.email}.`}
      dirty={dirty}
      busy={loading}
      onClose={onClose}
    >
      {({ requestClose }) => <form className="portal-dialog-form management-form tutor-edit-panel" onSubmit={submit}>
      <div className="portal-dialog-form-fields">
      <div className="form-grid">
        <label>
          <span>Title</span>
          <select value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}>
            <option value="Mr">Mr</option>
            <option value="Mrs">Mrs</option>
          </select>
        </label>
        <label><span>Full name</span><input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
        <label><span>Phone number</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
        <label><span>Specialisation</span><input value={form.specialisation} onChange={(event) => setForm({ ...form, specialisation: event.target.value })} /></label>
        <label>
          <span>Programme</span>
          <select value={form.program_id} onChange={(event) => setForm({ ...form, program_id: event.target.value, track_id: "" })}>
            <option value="">Choose programme</option>
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
            {form.account_status === "suspended" ? <option value="suspended" disabled>Suspended</option> : null}
          </select>
        </label>
      </div>
      <label><span>Professional bio</span><textarea value={form.professional_bio} onChange={(event) => setForm({ ...form, professional_bio: event.target.value })} /></label>
      <label><span>Qualifications</span><textarea value={form.qualifications} onChange={(event) => setForm({ ...form, qualifications: event.target.value })} /></label>
      <label><span>Teaching experience</span><textarea value={form.teaching_experience} onChange={(event) => setForm({ ...form, teaching_experience: event.target.value })} /></label>
      <label><span>Availability</span><textarea value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })} /></label>
      <label><span>Status reason</span><textarea value={form.status_reason} onChange={(event) => setForm({ ...form, status_reason: event.target.value })} /></label>
      <StatusMessage status={status} />
      </div>
      <div className="portal-dialog-actions">
        <button className="button button-secondary" type="button" disabled={loading} onClick={requestClose}>Cancel</button>
        <button className="button button-primary" type="submit" disabled={loading || !dirty}>{loading ? "Saving Changes" : "Save Changes"}</button>
      </div>
    </form>}
    </PortalDialog>
  );
}

export function PeopleSection({ data, onSaved, activeSection = "people" }) {
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState("all");
  const [studentProgramFilter, setStudentProgramFilter] = useState("");
  const [studentAssignmentFilter, setStudentAssignmentFilter] = useState("all");
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
      assignment: studentAssignmentFilter,
      programId: studentProgramFilter,
      page: studentPage,
      pageSize: 25
    }),
    [studentSearch, studentStatusFilter, studentAssignmentFilter, studentProgramFilter, studentPage],
    { enabled: activeSection !== "tutors" }
  );
  const tutorsQuery = useAsyncData(
    () => searchAdminTutors({
      query: tutorSearch,
      filter: tutorFilter,
      page: tutorPage,
      pageSize: 25
    }),
    [tutorSearch, tutorFilter, tutorPage],
    { enabled: activeSection !== "students" }
  );
  const localStudents = useMemo(() => {
    const search = studentSearch.trim().toLowerCase();
    return (data.students || []).filter((student) => {
      const assignmentCount = Number(student.assignment_count || 0);
      const haystack = [student.full_name, student.email, student.phone, student.account_status, student.program_title, student.level_name]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return (!search || haystack.includes(search))
        && (studentStatusFilter === "all" || student.account_status === studentStatusFilter)
        && (!studentProgramFilter || student.program_id === studentProgramFilter)
        && (studentAssignmentFilter === "all"
          || (studentAssignmentFilter === "assigned" ? assignmentCount > 0 : assignmentCount === 0));
    });
  }, [data.students, studentAssignmentFilter, studentProgramFilter, studentSearch, studentStatusFilter]);
  const localTutors = useMemo(() => {
    const search = tutorSearch.trim().toLowerCase();
    return (data.tutors || []).map((tutor) => {
      const assignment = (data.tutorAssignments || []).find((item) => item.tutor_id === tutor.user_id && item.active !== false);
      return {
        ...(tutor.profiles || {}),
        ...tutor,
        id: tutor.user_id,
        user_id: tutor.user_id,
        program_id: assignment?.program_id || null,
        track_id: assignment?.track_id || null,
        program_title: assignment?.programs?.title || "",
        track_name: assignment?.program_levels?.level_name || "",
        assignment_count: (data.tutorAssignments || []).filter((item) => item.tutor_id === tutor.user_id && item.active !== false).length,
        role: "tutor"
      };
    }).filter((tutor) => {
      const assignmentCount = Number(tutor.assignment_count || 0);
      const haystack = [tutor.full_name, tutor.email, tutor.phone, tutor.account_status, tutor.program_title, tutor.track_name, tutor.specialisation]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return (!search || haystack.includes(search))
        && (tutorFilter === "all"
          || (tutorFilter === "assigned" ? assignmentCount > 0
            : tutorFilter === "unassigned" ? assignmentCount === 0
              : tutor.account_status === tutorFilter));
    });
  }, [data.tutorAssignments, data.tutors, tutorFilter, tutorSearch]);
  const studentFallbackRecords = localStudents.slice((studentPage - 1) * 25, studentPage * 25);
  const tutorFallbackRecords = localTutors.slice((tutorPage - 1) * 25, tutorPage * 25);
  const remoteStudentRecords = studentsQuery.data?.records || [];
  const remoteTutorRecords = tutorsQuery.data?.records || [];
  const useLocalStudents = Boolean(studentsQuery.error)
    || (studentsQuery.loading && localStudents.length > 0)
    || (!studentsQuery.loading && remoteStudentRecords.length === 0 && localStudents.length > 0);
  const useLocalTutors = Boolean(tutorsQuery.error)
    || (tutorsQuery.loading && localTutors.length > 0)
    || (!tutorsQuery.loading && remoteTutorRecords.length === 0 && localTutors.length > 0);
  const studentRecords = useLocalStudents ? studentFallbackRecords : remoteStudentRecords;
  const studentTotal = useLocalStudents ? localStudents.length : Number(studentsQuery.data?.total || 0);
  const studentPageCount = Math.max(1, useLocalStudents ? Math.ceil(localStudents.length / 25) : Number(studentsQuery.data?.pageCount || 1));
  const tutorRecords = useLocalTutors ? tutorFallbackRecords : remoteTutorRecords;
  const tutorTotal = useLocalTutors ? localTutors.length : Number(tutorsQuery.data?.total || 0);
  const tutorPageCount = Math.max(1, useLocalTutors ? Math.ceil(localTutors.length / 25) : Number(tutorsQuery.data?.pageCount || 1));

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
  }, [studentStatusFilter, studentAssignmentFilter, studentProgramFilter]);

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

  const showStudents = activeSection !== "tutors";
  const showTutors = activeSection !== "students";

  return (
    <div className="portal-page">
      <PageHeading title="Students and tutors." description="Review account records, create tutors securely, and assign official programme access." />
      <nav className="management-section-tabs" aria-label="People records">
        <NavLink to="/admin/people">All People</NavLink>
        <NavLink to="/admin/students">Students</NavLink>
        <NavLink to="/admin/tutors">Tutors</NavLink>
      </nav>
      {activeSection === "people" ? <TutorCreationForm programs={data.programs} onSaved={handleTutorsChanged} /> : null}
      {activeSection === "people" ? <AssignmentForms data={data} onSaved={() => { handleStudentsChanged(); handleTutorsChanged(); }} /> : null}
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
      <div className="portal-grid admin-people-directory-grid">
        {showStudents ? <article className="notice-card">
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
              {["all", "active", "inactive", "suspended"].map((status) => (
                <button key={status} type="button" className={studentStatusFilter === status ? "active" : ""} onClick={() => setStudentStatusFilter(status)}>
                  {status === "all" ? "All" : status[0].toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
            <div className="segmented-control compact" role="group" aria-label="Student assignment filter">
              {["all", "assigned", "unassigned"].map((value) => (
                <button key={value} type="button" className={studentAssignmentFilter === value ? "active" : ""} onClick={() => setStudentAssignmentFilter(value)}>
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {studentsQuery.error ? (
            <div className="form-status warning" role="alert">
              Live Student search is unavailable. Showing the securely loaded directory records.
              <button className="text-link" type="button" onClick={studentsQuery.refetch}>Try again</button>
            </div>
          ) : null}
          <div className="responsive-table-wrap">
            <table className="management-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Programme</th><th>Status</th><th>Profile</th><th>Created</th><th>Status audit</th><th>Action</th></tr></thead>
              <tbody>
                {studentRecords.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Name">{student.full_name || "Unnamed"}</td>
                    <td data-label="Email">{student.email}</td>
                    <td data-label="Phone">{student.phone}</td>
                    <td data-label="Programme">{student.program_title ? `${student.program_title}${student.level_name ? ` / ${student.level_name}` : ""}` : "Not assigned"}</td>
                    <td data-label="Status">
                      <AccountStatusBadge status={student.account_status} />
                    </td>
                    <td data-label="Profile">{Number(student.profile_completion || 0)}%</td>
                    <td data-label="Created">{formatDateTime(student.created_at)}</td>
                    <td data-label="Status audit">
                      <dl className="status-audit-details compact">
                        <div><dt>Changed</dt><dd>{student.status_changed_at ? formatDateTime(student.status_changed_at) : "Not recorded"}</dd></div>
                        <div><dt>By</dt><dd>{getStatusChangedBy(student, data.profiles)}</dd></div>
                        <div><dt>Reason</dt><dd>{student.status_reason || "Not recorded"}</dd></div>
                      </dl>
                    </td>
                    <td data-label="Action">
                      <div className="table-action-stack">
                        <button className="button button-secondary" type="button" onClick={() => setSelectedStudent(student)}>Edit</button>
                        <AccountStatusControls profile={student} profiles={data.profiles} onSaved={handleStudentsChanged} />
                      </div>
                    </td>
                  </tr>
                ))}
                {studentsQuery.loading && !studentRecords.length ? <tr><td colSpan="9">Loading students...</td></tr> : null}
                {!studentsQuery.loading && !studentRecords.length ? <tr><td colSpan="9">No students match this search.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="pagination-controls" aria-label="Student search pagination">
            <button className="button button-secondary" type="button" disabled={studentPage <= 1 || studentsQuery.loading} onClick={() => setStudentPage((page) => Math.max(1, page - 1))}>Previous</button>
            <span>Page {studentPage} of {studentPageCount}</span>
            <button className="button button-secondary" type="button" disabled={studentPage >= studentPageCount || studentsQuery.loading} onClick={() => setStudentPage((page) => page + 1)}>Next</button>
          </div>
        </article> : null}
        {showTutors ? <article className="notice-card">
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
                ["suspended", "Suspended"],
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
              Live Tutor search is unavailable. Showing the securely loaded directory records.
              <button className="text-link" type="button" onClick={tutorsQuery.refetch}>Try again</button>
            </div>
          ) : null}
          <div className="responsive-table-wrap">
            <table className="management-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Specialisation</th><th>Programme</th><th>Status</th><th>Profile</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>
                {tutorRecords.map((tutor) => (
                  <tr key={tutor.user_id}>
                    <td data-label="Name">{tutor.title} {tutor.full_name || "Tutor"}</td>
                    <td data-label="Email">{tutor.email}</td>
                    <td data-label="Phone">{tutor.phone || "Not recorded"}</td>
                    <td data-label="Specialisation">{tutor.specialisation || "Not recorded"}</td>
                    <td data-label="Programme">{tutor.program_title ? `${tutor.program_title}${tutor.track_name ? ` / ${tutor.track_name}` : ""}` : "Unassigned"}</td>
                    <td data-label="Status">
                      <AccountStatusBadge status={tutor.account_status} />
                    </td>
                    <td data-label="Profile">{Number(tutor.profile_completion || 0)}%</td>
                    <td data-label="Created">{formatDateTime(tutor.created_at)}</td>
                    <td data-label="Action">
                      <div className="table-action-stack">
                        <button className="button button-secondary" type="button" onClick={() => setSelectedTutor(tutor)}>Edit</button>
                        <AccountStatusControls profile={tutor} profiles={data.profiles} onSaved={handleTutorsChanged} />
                      </div>
                    </td>
                  </tr>
                ))}
                {tutorsQuery.loading && !tutorRecords.length ? <tr><td colSpan="9">Loading tutors...</td></tr> : null}
                {!tutorsQuery.loading && !tutorRecords.length ? <tr><td colSpan="9">No Tutors match this search.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="pagination-controls" aria-label="Tutor search pagination">
            <button className="button button-secondary" type="button" disabled={tutorPage <= 1 || tutorsQuery.loading} onClick={() => setTutorPage((page) => Math.max(1, page - 1))}>Previous</button>
            <span>Page {tutorPage} of {tutorPageCount}</span>
            <button className="button button-secondary" type="button" disabled={tutorPage >= tutorPageCount || tutorsQuery.loading} onClick={() => setTutorPage((page) => page + 1)}>Next</button>
          </div>
        </article> : null}
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
      <PageHeading title="Programmes, tracks and prices." description="Manage published programme information and official track prices." />
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

function ContentSection({ data, onSaved, activeSection = "announcements" }) {
  const [status, setStatus] = useState({ type: "", message: "" });
  const [announcement, setAnnouncement] = useState({
    program_id: "",
    program_level_id: "",
    audience_type: "all_students",
    audience_user_id: "",
    title: "",
    summary: "",
    body: "",
    priority: "normal",
    category: "General",
    published: true
  });
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

  const sectionTitles = {
    announcements: ["Announcements.", "Create targeted notices for active students, tutors, programmes, tracks, or an individual account."],
    timetable: ["Timetable.", "Create and publish programme timetable entries."],
    assignments: ["Assignments.", "Create learning assignments for a programme and track."],
    resources: ["Learning resources.", "Publish approved programme resources and external learning links."],
    articles: ["Learning articles.", "Publish articles for the Portal learning library."]
  };
  const [sectionTitle, sectionDescription] = sectionTitles[activeSection] || sectionTitles.announcements;

  return (
    <div className="portal-page">
      <PageHeading title={sectionTitle} description={sectionDescription} />
      <div className="portal-grid">
        {activeSection === "announcements" ? <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveAnnouncement, announcement, "Announcement saved."); }}>
          <h3>Announcement</h3>
          <label>
            <span>Audience</span>
            <select
              value={announcement.audience_type}
              onChange={(event) => setAnnouncement({
                ...announcement,
                audience_type: event.target.value,
                audience_user_id: "",
                program_id: "",
                program_level_id: ""
              })}
            >
              <option value="all_students">All active students</option>
              <option value="all_tutors">All active tutors</option>
              <option value="all">All active learners and tutors</option>
              <option value="specific_program">Specific programme</option>
              <option value="specific_track">Specific track</option>
              <option value="specific_user">Specific person</option>
            </select>
          </label>
          {["specific_program", "specific_track"].includes(announcement.audience_type) ? (
            <ContentProgramSelect
              data={data}
              values={announcement}
              setValues={setAnnouncement}
              required
              includeTrack={announcement.audience_type === "specific_track"}
            />
          ) : null}
          {announcement.audience_type === "specific_user" ? (
            <label>
              <span>Person</span>
              <select value={announcement.audience_user_id} onChange={(event) => setAnnouncement({ ...announcement, audience_user_id: event.target.value })} required>
                <option value="">Choose an active student or tutor</option>
                {data.students.filter((person) => person.account_status === "active").map((person) => (
                  <option key={person.id} value={person.id}>Student | {person.full_name || person.email}</option>
                ))}
                {data.tutors.filter((person) => person.profiles?.account_status === "active").map((person) => (
                  <option key={person.user_id} value={person.user_id}>Tutor | {person.profiles?.full_name || person.profiles?.email}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label><span>Title</span><input value={announcement.title} onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })} required /></label>
          <label><span>Summary</span><input value={announcement.summary} onChange={(event) => setAnnouncement({ ...announcement, summary: event.target.value })} /></label>
          <label><span>Body</span><textarea value={announcement.body} onChange={(event) => setAnnouncement({ ...announcement, body: event.target.value })} required /></label>
          <button className="button button-secondary" type="submit">Save Announcement</button>
        </form> : null}
        {activeSection === "timetable" ? <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveTimetableEntry, timetable, "Timetable entry saved."); }}>
          <h3>Timetable Entry</h3>
          <ContentProgramSelect data={data} values={timetable} setValues={setTimetable} required />
          <label><span>Title</span><input value={timetable.title} onChange={(event) => setTimetable({ ...timetable, title: event.target.value })} required /></label>
          <div className="form-grid">
            <label><span>Day</span><input type="number" min="0" max="6" value={timetable.day_of_week} onChange={(event) => setTimetable({ ...timetable, day_of_week: event.target.value })} /></label>
            <label><span>Start</span><input type="time" value={timetable.start_time} onChange={(event) => setTimetable({ ...timetable, start_time: event.target.value })} /></label>
            <label><span>End</span><input type="time" value={timetable.end_time} onChange={(event) => setTimetable({ ...timetable, end_time: event.target.value })} /></label>
          </div>
          <button className="button button-secondary" type="submit">Save Timetable</button>
        </form> : null}
        {activeSection === "assignments" ? <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveAssignment, assignment, "Assignment saved."); }}>
          <h3>Assignment</h3>
          <ContentProgramSelect data={data} values={assignment} setValues={setAssignment} required />
          <label><span>Title</span><input value={assignment.title} onChange={(event) => setAssignment({ ...assignment, title: event.target.value })} required /></label>
          <label><span>Instructions</span><textarea value={assignment.instructions} onChange={(event) => setAssignment({ ...assignment, instructions: event.target.value })} required /></label>
          <button className="button button-secondary" type="submit">Save Assignment</button>
        </form> : null}
        {activeSection === "resources" ? <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveResource, resource, "Resource saved."); }}>
          <h3>Learning Resource</h3>
          <ContentProgramSelect data={data} values={resource} setValues={setResource} required />
          <label><span>Title</span><input value={resource.title} onChange={(event) => setResource({ ...resource, title: event.target.value })} required /></label>
          <label><span>External URL</span><input value={resource.external_url} onChange={(event) => setResource({ ...resource, external_url: event.target.value })} /></label>
          <label><span>Description</span><textarea value={resource.description} onChange={(event) => setResource({ ...resource, description: event.target.value })} /></label>
          <button className="button button-secondary" type="submit">Save Resource</button>
        </form> : null}
        {activeSection === "articles" ? <form className="form-card management-form" onSubmit={(event) => { event.preventDefault(); void submit(saveArticle, article, "Article saved."); }}>
          <h3>Learning Article</h3>
          <ContentProgramSelect data={data} values={article} setValues={setArticle} />
          <label><span>Title</span><input value={article.title} onChange={(event) => setArticle({ ...article, title: event.target.value })} required /></label>
          <label><span>Summary</span><input value={article.summary} onChange={(event) => setArticle({ ...article, summary: event.target.value })} /></label>
          <label><span>Body</span><textarea value={article.body} onChange={(event) => setArticle({ ...article, body: event.target.value })} /></label>
          <button className="button button-secondary" type="submit">Save Article</button>
        </form> : null}
      </div>
      <StatusMessage status={status} />
    </div>
  );
}

function ContentProgramSelect({ data, values, setValues, required = false, includeTrack = false }) {
  const tracks = getTrackOptions(data.programs, values.program_id);
  return (
    <>
      <label>
        <span>Programme</span>
        <select value={values.program_id || ""} onChange={(event) => setValues({ ...values, program_id: event.target.value, program_level_id: "" })} required={required}>
          <option value="">General or choose programme</option>
          {data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}
        </select>
      </label>
      {includeTrack ? (
        <label>
          <span>Track</span>
          <select value={values.program_level_id || ""} onChange={(event) => setValues({ ...values, program_level_id: event.target.value })} required>
            <option value="">Choose track</option>
            {tracks.map((track) => <option key={track.id} value={track.id}>{track.level_name}</option>)}
          </select>
        </label>
      ) : null}
    </>
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
      <LiveClassCards audience="admin" sessions={data.liveClasses} onChanged={onSaved} />
    </div>
  );
}

function PaymentsSection({ data }) {
  const [filters, setFilters] = useState({ status: "", email: "", programme: "", reference: "", from: "", to: "" });
  const payments = useMemo(() => data.payments.filter((payment) => {
    const haystack = `${payment.reference || ""} ${payment.customer_name || ""} ${payment.customer_email || ""} ${payment.customer_phone || ""} ${payment.product_name || ""} ${payment.product_key || ""} ${payment.selected_level || ""}`.toLowerCase();
    const reportedStatus = String(payment.reported_status || payment.status || "initiated").toLowerCase();
    const createdDate = String(payment.created_at || "").slice(0, 10);
    if (filters.status && reportedStatus !== filters.status) return false;
    if (filters.email && !String(payment.customer_email || "").toLowerCase().includes(filters.email.toLowerCase())) return false;
    if (filters.programme && !haystack.includes(filters.programme.toLowerCase())) return false;
    if (filters.reference && !String(payment.reference || "").toLowerCase().includes(filters.reference.toLowerCase())) return false;
    if (filters.from && createdDate < filters.from) return false;
    if (filters.to && createdDate > filters.to) return false;
    return true;
  }), [data.payments, filters]);

  return (
    <div className="portal-page">
      <PageHeading title="Paystack payment attempts." description="Review initiated, pending, successful, failed, declined, cancelled and abandoned payment records." />
      <div className="filter-bar">
        <input placeholder="Reference" value={filters.reference} onChange={(event) => setFilters({ ...filters, reference: event.target.value })} />
        <input placeholder="Email" value={filters.email} onChange={(event) => setFilters({ ...filters, email: event.target.value })} />
        <input placeholder="Programme" value={filters.programme} onChange={(event) => setFilters({ ...filters, programme: event.target.value })} />
        <label><span>From</span><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label><span>To</span><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">All statuses</option>
          {["initiated", "opened", "client_success", "pending", "success", "failed", "declined", "cancelled", "closed", "abandoned"].map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      <div className="responsive-table-wrap">
        <table className="management-table">
          <thead><tr><th>Reference</th><th>Customer</th><th>Contact</th><th>Programme / Track</th><th>Amount</th><th>Reported</th><th>Verification</th><th>Updated</th></tr></thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td data-label="Reference">{payment.reference}</td>
                <td data-label="Customer">{payment.customer_name || payment.student_name || "Not recorded"}</td>
                <td data-label="Contact">{payment.customer_email}<br />{payment.customer_phone || ""}</td>
                <td data-label="Programme / Track">{payment.product_name || payment.product_key}<br />{payment.selected_level || payment.track_slug || ""}</td>
                <td data-label="Amount">{formatAmountKobo(payment.amount_kobo || payment.expected_amount_kobo)}</td>
                <td data-label="Reported">{payment.reported_status || payment.status || "initiated"}</td>
                <td data-label="Verification">{payment.verified_at ? "verified" : payment.verification_status || "unverified"}</td>
                <td data-label="Updated">{formatDateTime(payment.updated_at || payment.created_at)}</td>
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
  const [savingTicketId, setSavingTicketId] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });

  async function updateTicket(ticket, nextStatus) {
    const response = String(responses[ticket.id] || "").trim();
    if (!response && nextStatus === ticket.status) {
      setStatus({ type: "warning", message: "Add a response or change the ticket status." });
      return;
    }
    setSavingTicketId(ticket.id);
    try {
      await respondToSupportTicket({ id: ticket.id, response, status: nextStatus });
      setResponses((current) => ({ ...current, [ticket.id]: "" }));
      setStatus({ type: "success", message: nextStatus === "resolved" ? "Ticket marked resolved and the Student was notified." : "Support response sent and marked unread for the Student." });
      onSaved();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Support response could not be saved." });
    } finally {
      setSavingTicketId("");
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
              <div className="support-thread" aria-label={`Messages for ${ticket.subject}`}>
                {(ticket.support_ticket_messages || []).slice().sort((left, right) => String(left.created_at).localeCompare(String(right.created_at))).map((message) => (
                  <div className={`support-message ${message.sender_role}`} key={message.id}>
                    <strong>{message.sender_role === "admin" ? "Admin" : "Student"}</strong>
                    <p>{message.message}</p>
                    <small>{formatDateTime(message.created_at)}</small>
                  </div>
                ))}
                {!(ticket.support_ticket_messages || []).length && ticket.response ? <div className="support-message admin"><strong>Admin</strong><p>{ticket.response}</p></div> : null}
              </div>
            </div>
            {!["resolved", "closed"].includes(ticket.status) ? (
              <>
                <label>
                  <span>Response</span>
                  <textarea value={responses[ticket.id] || ""} onChange={(event) => setResponses({ ...responses, [ticket.id]: event.target.value })} />
                </label>
                <div className="button-row">
                  <button className="button button-secondary" type="button" disabled={savingTicketId === ticket.id} onClick={() => updateTicket(ticket, "in_progress")}>Send Reply</button>
                  <button className="button button-primary" type="button" disabled={savingTicketId === ticket.id} onClick={() => updateTicket(ticket, "resolved")}>Mark Resolved</button>
                </div>
              </>
            ) : <p className="form-status success">Resolved. This ticket no longer accepts Student replies.</p>}
          </article>
        ))}
        {!data.supportTickets.length ? <div className="notice-card"><p>No support tickets have been submitted.</p></div> : null}
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

function AdminRecordsSection({ title, description, records, emptyMessage, render }) {
  return (
    <div className="portal-page">
      <PageHeading title={title} description={description} />
      <div className="portal-list">
        {records.map(render)}
        {!records.length ? <div className="notice-card portal-state-card"><p>{emptyMessage}</p></div> : null}
      </div>
    </div>
  );
}

function renderAdminRecord(kind, item) {
  return (
    <article className="portal-record-card" key={item.id}>
      <div>
        <p className="eyebrow">{kind} | {formatDateTime(item.created_at || item.published_at || item.scheduled_start)}</p>
        <h3>{item.title || item.subject || item.reference || item.name || "Record"}</h3>
        <p>{item.summary || item.description || item.message || item.status || item.category || "Record details are available in this management section."}</p>
      </div>
      <dl className="portal-mini-details">
        {item.programs?.title ? <div><dt>Programme</dt><dd>{item.programs.title}</dd></div> : null}
        {item.program_levels?.level_name ? <div><dt>Track</dt><dd>{item.program_levels.level_name}</dd></div> : null}
        {item.status ? <div><dt>Status</dt><dd>{item.status}</dd></div> : null}
      </dl>
    </article>
  );
}

function AdminProfileSection() {
  const { profile, user, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
    address: profile?.address || "",
    education_level: profile?.education_level || "",
    title: profile?.title || ""
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || "");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const avatarObjectUrlRef = useRef("");

  useEffect(() => {
    setForm({
      full_name: profile?.full_name || "",
      phone: profile?.phone || "",
      address: profile?.address || "",
      education_level: profile?.education_level || "",
      title: profile?.title || ""
    });
    setAvatarPreview(profile?.avatar_url || "");
    setRemoveAvatar(false);
    setAvatarFile(null);
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    avatarObjectUrlRef.current = "";
  }, [profile]);

  useEffect(() => () => {
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
  }, []);

  function selectAvatar(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus({ type: "warning", message: "Upload a JPEG, PNG or WebP image." });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setStatus({ type: "warning", message: "Profile picture must be 3 MB or smaller." });
      return;
    }
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    avatarObjectUrlRef.current = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreview(avatarObjectUrlRef.current);
    setRemoveAvatar(false);
    setStatus({ type: "", message: "" });
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      await updateAdminProfile(user.id, {
        ...form,
        avatarFile,
        removeAvatar,
        avatar_path: profile?.avatar_path || "",
        previous_avatar_path: profile?.avatar_path || ""
      });
      await refreshProfile();
      setStatus({ type: "success", message: "Admin profile saved." });
      setAvatarFile(null);
      setRemoveAvatar(false);
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Admin profile could not be saved." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="portal-page">
      <PageHeading title="Admin profile." description="Manage the Admin account picture and account details shown inside protected settings." />
      <form className="form-card management-form admin-profile-form" onSubmit={submit}>
        <div className="portal-avatar-uploader">
          <AdminAvatar profile={{ ...profile, avatar_url: removeAvatar ? "" : avatarPreview }} displayName="Admin" size="xl" />
          <div>
            <strong>Zentel Insight Admin</strong>
            <small>{user?.email}</small>
            <label className="button button-secondary">
              <ImageUp size={18} aria-hidden="true" />
              Upload profile picture
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} />
            </label>
            {avatarPreview && !removeAvatar ? (
              <button className="text-link danger" type="button" onClick={() => { setRemoveAvatar(true); setAvatarPreview(""); setAvatarFile(null); }}>
                Remove picture
              </button>
            ) : null}
          </div>
        </div>
        <div className="form-grid">
          <label><span>Display name</span><input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
          <label><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label><span>Education level</span><input value={form.education_level} onChange={(event) => setForm({ ...form, education_level: event.target.value })} /></label>
          <label><span>Title</span><select value={form.title || ""} onChange={(event) => setForm({ ...form, title: event.target.value })}><option value="">No title</option><option value="Mr">Mr</option><option value="Mrs">Mrs</option></select></label>
        </div>
        <label><span>Address</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
        <StatusMessage status={status} />
        <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Saving Profile" : "Save Profile"}</button>
      </form>
    </div>
  );
}

function AdminSettingsSection() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut({ scope: "local" });
    navigate("/login", { replace: true });
  }

  return (
    <div className="portal-page">
      <PageHeading title="Admin settings." description="Review protected session controls for the current browser." />
      <div className="portal-grid">
        <article className="notice-card">
          <h3>Session</h3>
          <p>For your security, your Portal session will automatically sign out after 10 minutes without activity. You will receive a warning shortly before logout.</p>
          <span className="portal-tag success">Verified session required</span>
        </article>
        <article className="notice-card">
          <h3>Sign out</h3>
          <p>Clear this browser session and remove the current Admin verification token.</p>
          <button className="button button-secondary" type="button" onClick={handleSignOut}>Sign Out</button>
        </article>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { section = "overview", portalId = "" } = useParams();
  const requestedSection = ["people", "students", "tutors"].includes(section) ? "accounts" : section;
  const activeSection = sections.some(([slug]) => slug === requestedSection) ? requestedSection : "overview";
  const activeSectionLabel = sections.find(([slug]) => slug === activeSection)?.[1] || "Overview";
  const dataQuery = useAsyncData(
    () => getAdminDashboardData(activeSection),
    [activeSection],
    { errorMessage: `${activeSectionLabel} could not be loaded. Please try again.` }
  );

  usePageMeta({
    path: portalId ? `/admin/accounts/${portalId}` : activeSection === "overview" ? "/admin" : `/admin/${activeSection}`,
    title: "Admin Dashboard",
    description: "Protected Zentel Insight admin dashboard.",
    robots: "noindex,nofollow"
  });

  if (dataQuery.loading) {
    return (
      <AdminFrame data={null}>
        <div className="route-loader">Loading {activeSectionLabel.toLowerCase()}</div>
      </AdminFrame>
    );
  }
  if (dataQuery.error) {
    return (
      <AdminFrame data={null}>
        <div className="portal-page">
          <PageHeading
            title={`${activeSectionLabel} could not be loaded.`}
            description="The rest of the Admin Portal remains available while this section is retried."
          />
          <div className="notice-card portal-state-card">
            <p>{dataQuery.error}</p>
            <button className="button button-primary" type="button" onClick={dataQuery.refetch}>Try Again</button>
          </div>
        </div>
      </AdminFrame>
    );
  }

  const data = dataQuery.data;
  return (
    <AdminFrame data={data} onRealtimeChange={dataQuery.refetch}>
      {activeSection === "overview" ? <OverviewSection data={data} /> : null}
      {activeSection === "accounts" && portalId ? <AccountManagementSection portalId={portalId} programs={data.programs} /> : null}
      {activeSection === "accounts" && !portalId ? (
        <div className="portal-page admin-account-lookup-page">
          <AccountLookupSection />
          <TutorCreationForm programs={data.programs} onSaved={dataQuery.refetch} />
        </div>
      ) : null}
      {activeSection === "programmes" ? <ProgrammesSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "enrolments" ? (
        <AdminRecordsSection
          title="Enrolments."
          description="Review official Student programme and track assignments."
          records={data.enrolments}
          emptyMessage="No official enrolments have been recorded yet."
          render={(item) => renderAdminRecord("Enrolment", item)}
        />
      ) : null}
      {activeSection === "live-classes" ? <LiveClassesSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "classrooms" ? (
        <div className="portal-page">
          <PageHeading title="Classroom moderation." description="Inspect programme classroom chat rooms and moderate inappropriate messages." />
          <ProgramChatPanel canModerate />
        </div>
      ) : null}
      {activeSection === "zentel-ai" ? <AdminAiSection /> : null}
      {["timetable", "announcements", "assignments", "resources", "articles"].includes(activeSection)
        ? <ContentSection data={data} onSaved={dataQuery.refetch} activeSection={activeSection} />
        : null}
      {activeSection === "payments" ? <PaymentsSection data={data} /> : null}
      {activeSection === "certificates" ? (
        <AdminRecordsSection
          title="Certificates."
          description="Review issued certificate records linked to learner profiles and programmes."
          records={data.certificates}
          emptyMessage="No certificates have been issued yet."
          render={(item) => renderAdminRecord("Certificate", item)}
        />
      ) : null}
      {activeSection === "notifications" ? (
        <AdminRecordsSection
          title="Notifications."
          description="Review account and learning notifications."
          records={data.notifications}
          emptyMessage="No notifications have been created yet."
          render={(item) => renderAdminRecord("Notification", item)}
        />
      ) : null}
      {activeSection === "support" ? <SupportSection data={data} onSaved={dataQuery.refetch} /> : null}
      {activeSection === "audit" ? <AuditSection data={data} /> : null}
      {activeSection === "profile" ? <AdminProfileSection /> : null}
      {activeSection === "settings" ? <AdminSettingsSection /> : null}
    </AdminFrame>
  );
}
