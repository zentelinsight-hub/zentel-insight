import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Settings,
  Sun,
  UserRound,
  X
} from "lucide-react";
import { useAuth } from "../context/authHooks";
import { useTheme } from "../context/themeHooks";
import { siteConfig } from "../data/site";
import {
  usePortalPageContent,
  useStudentAnnouncements,
  useStudentAssignments,
  useStudentCertificates,
  useStudentDashboard,
  useStudentEnrolments,
  useStudentNotifications,
  useStudentPayments,
  useStudentProfile,
  useStudentResources,
  useStudentSupportTickets,
  useStudentTimetable
} from "../hooks/portal/usePortalData";
import {
  createSupportTicket,
  hasReliablePaymentStatus,
  markAllNotificationsRead,
  markNotificationRead,
  updateStudentProfile
} from "../services/portal/portalRepository";
import { claimMyEnrolments, requestPasswordReset } from "../services/authService";
import { formatCurrency, formatDateTime, isValidEmail } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";
import BrandLogo from "../components/BrandLogo";

const portalLinks = [
  ["/portal", "Dashboard", LayoutDashboard],
  ["/portal/my-courses", "My Courses", GraduationCap],
  ["/portal/timetable", "Timetable", CalendarDays],
  ["/portal/announcements", "Announcements", Megaphone],
  ["/portal/assignments", "Assignments", FileCheck2],
  ["/portal/resources", "Resources", BookOpen],
  ["/portal/payments", "Payments", CreditCard],
  ["/portal/certificates", "Certificates", Award],
  ["/portal/notifications", "Notifications", Bell],
  ["/portal/support", "Support", LifeBuoy],
  ["/portal/profile", "Profile", UserRound],
  ["/portal/settings", "Settings", Settings]
];

const pageMeta = {
  dashboard: "/portal",
  profile: "/portal/profile",
  "my-courses": "/portal/my-courses",
  timetable: "/portal/timetable",
  announcements: "/portal/announcements",
  assignments: "/portal/assignments",
  resources: "/portal/resources",
  payments: "/portal/payments",
  certificates: "/portal/certificates",
  notifications: "/portal/notifications",
  support: "/portal/support",
  settings: "/portal/settings"
};

function getProfileCompletion(profile) {
  if (Number.isFinite(Number(profile?.profile_completion))) return Number(profile.profile_completion);
  if (profile?.profile_completed) return 100;
  const fields = ["full_name", "email", "phone", "date_of_birth", "education_level", "address"];
  return Math.round((fields.filter((field) => String(profile?.[field] || "").trim()).length / fields.length) * 100);
}

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

function getCourseName(item) {
  return item?.programs?.title || item?.program_title || item?.product_name || "Zentel Insight programme";
}

function getTrackName(item) {
  return item?.program_levels?.level_name || item?.selected_level || item?.track_name || "Selected track";
}

function PortalLoading({ label = "Loading information" }) {
  return (
    <div className="portal-skeleton" role="status" aria-live="polite">
      <span>{label}</span>
      <div />
      <div />
      <div />
    </div>
  );
}

function PortalError({ message, onRetry }) {
  return (
    <div className="notice-card portal-state-card">
      <p className="eyebrow">Student Portal</p>
      <h2>We could not load this information</h2>
      <p>{message || "Refresh this section and try again."}</p>
      <button className="button button-primary" type="button" onClick={onRetry}>Try Again</button>
    </div>
  );
}

function PortalEmpty({ content, action }) {
  return (
    <div className="notice-card portal-state-card">
      <p className="eyebrow">Nothing to show yet</p>
      <h2>{content?.empty_title || "No records yet"}</h2>
      <p>{content?.empty_message || "This section updates after approved student records are published."}</p>
      {action}
    </div>
  );
}

function PortalPage({ slug, children, actions }) {
  const contentQuery = usePortalPageContent(slug);
  const content = contentQuery.data;

  usePageMeta({
    path: pageMeta[slug] || "/portal",
    title: content?.title || "Student Portal",
    description: content?.description || "Zentel Insight Student Portal.",
    robots: "noindex,nofollow"
  });

  return (
    <div className="portal-page">
      <div className="portal-page-heading">
        <div>
          <p className="eyebrow">Student Portal</p>
          <h2>{content?.title || "Student Portal"}</h2>
          <p>{content?.description || "Your private Zentel Insight account information is loaded securely from Supabase."}</p>
        </div>
        {actions}
      </div>
      {contentQuery.error ? <PortalError message={contentQuery.error} onRetry={contentQuery.refetch} /> : children(content)}
    </div>
  );
}

export function PortalLayout() {
  const { profile, user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = profile?.full_name || user?.email || "Learner";

  useEffect(() => {
    void claimMyEnrolments();
  }, []);

  usePageMeta({
    path: "/portal",
    title: "Student Portal",
    description: "Protected Zentel Insight student portal.",
    robots: "noindex,nofollow"
  });

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <section className="portal-shell">
      <aside className={`portal-sidebar ${menuOpen ? "open" : ""}`}>
        <Link className="brand" to="/portal" onClick={closeMenu}>
          <BrandLogo brand="main" size="portal" />
          <span>
            <span className="brand-name">Student Portal</span>
            <span className="brand-motto">Zentel Insight</span>
          </span>
        </Link>
        <nav aria-label="Student portal">
          {portalLinks.map(([href, label, Icon]) => (
            <NavLink key={href} to={href} end={href === "/portal"} onClick={closeMenu} className={({ isActive }) => isActive ? "portal-link active" : "portal-link"}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <button className="portal-link signout" type="button" onClick={signOut}>
          <LogOut size={18} aria-hidden="true" />
          Sign Out
        </button>
      </aside>
      <main className="portal-main">
        <header className="portal-header">
          <button className="icon-button portal-menu-button" type="button" aria-label={menuOpen ? "Close portal menu" : "Open portal menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}>
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
          <div>
            <p className="eyebrow">Welcome</p>
            <h1>{displayName}</h1>
          </div>
          <Bell size={22} aria-hidden="true" />
        </header>
        <Outlet />
      </main>
    </section>
  );
}

export function PortalOverview() {
  const { user, profile } = useAuth();
  const dashboard = useStudentDashboard(user?.id);
  const completion = getProfileCompletion(profile);

  return (
    <PortalPage slug="dashboard">
      {(content) => {
        if (dashboard.loading) return <PortalLoading label="Loading dashboard" />;
        if (dashboard.error) return <PortalError message={dashboard.error} onRetry={dashboard.refetch} />;
        const data = dashboard.data;
        if (!data) return <PortalEmpty content={content} />;
        return (
          <>
            <div className="portal-metric-grid">
              <article className="portal-metric-card">
                <span>Profile completion</span>
                <strong>{completion}%</strong>
                <Link to="/portal/profile">Review profile</Link>
              </article>
              <article className="portal-metric-card">
                <span>Active courses</span>
                <strong>{data.activeEnrolments.length}</strong>
                <Link to="/portal/my-courses">Open courses</Link>
              </article>
              <article className="portal-metric-card">
                <span>Pending assignments</span>
                <strong>{data.pendingAssignments.length}</strong>
                <Link to="/portal/assignments">View assignments</Link>
              </article>
              <article className="portal-metric-card">
                <span>Certificates</span>
                <strong>{data.certificates.length}</strong>
                <Link to="/portal/certificates">View certificates</Link>
              </article>
            </div>
            <div className="portal-grid">
              <article className="notice-card">
                <h3>Next class</h3>
                {data.upcomingClass ? (
                  <p>{data.upcomingClass.title} - {formatDate(data.upcomingClass.class_date)} at {formatTime(data.upcomingClass.start_time)}</p>
                ) : (
                  <p>Your class schedule is shown after an approved timetable entry is published.</p>
                )}
                <Link className="text-link" to="/portal/timetable">Open timetable</Link>
              </article>
              <article className="notice-card">
                <h3>Recent announcements</h3>
                {data.announcements.length ? (
                  <ul className="portal-clean-list">
                    {data.announcements.map((item) => <li key={item.id}>{item.title}</li>)}
                  </ul>
                ) : (
                  <p>Official notices for your account are listed after publication.</p>
                )}
                <Link className="text-link" to="/portal/announcements">Read notices</Link>
              </article>
              <article className="notice-card">
                <h3>Notifications</h3>
                {data.unreadNotifications.length ? (
                  <p>{data.unreadNotifications.length} unread update{data.unreadNotifications.length === 1 ? "" : "s"} need attention.</p>
                ) : (
                  <p>Your private portal notifications are all caught up.</p>
                )}
                <Link className="text-link" to="/portal/notifications">Open notifications</Link>
              </article>
            </div>
          </>
        );
      }}
    </PortalPage>
  );
}

function MyCoursesPage() {
  const { user } = useAuth();
  const query = useStudentEnrolments(user?.id);
  return (
    <PortalPage slug="my-courses">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading courses" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} action={<Link className="button button-primary" to="/programs">Browse Programs</Link>} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className="portal-record-card" key={item.id}>
                <div>
                  <p className="eyebrow">{item.status}</p>
                  <h3>{getCourseName(item)}</h3>
                  <p>{getTrackName(item)}</p>
                </div>
                <dl className="portal-mini-details">
                  <div><dt>Enrolled</dt><dd>{formatDate(item.enrolled_date || item.created_at)}</dd></div>
                  <div><dt>Progress</dt><dd>{item.progress_percentage || 0}%</dd></div>
                </dl>
                {item.status === "active" ? <Link className="button button-secondary" to="/portal/resources">Continue Learning</Link> : null}
              </article>
            ))}
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
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className="portal-record-card" key={item.id}>
                <div>
                  <p className="eyebrow">{formatDate(item.class_date)} | {item.timezone || "Africa/Lagos"}</p>
                  <h3>{item.title}</h3>
                  <p>{getCourseName(item)} - {getTrackName(item)}</p>
                  {item.description ? <p>{item.description}</p> : null}
                </div>
                <dl className="portal-mini-details">
                  <div><dt>Time</dt><dd>{formatTime(item.start_time)} - {formatTime(item.end_time)}</dd></div>
                  <div><dt>Instructor</dt><dd>{item.instructor_name || "To be assigned"}</dd></div>
                  <div><dt>Platform</dt><dd>{item.meeting_provider || item.delivery_method || "Online"}</dd></div>
                </dl>
                {item.meeting_url ? <a className="button button-primary" href={item.meeting_url} target="_blank" rel="noreferrer">Join Class</a> : null}
              </article>
            ))}
          </div>
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

function PaymentsPage() {
  const { user } = useAuth();
  const query = useStudentPayments(user?.id);
  return (
    <PortalPage slug="payments">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading payments" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => {
              const reliable = hasReliablePaymentStatus(item);
              const amount = Number(item.amount_kobo || item.paid_amount_kobo || item.expected_amount_kobo || 0) / 100;
              return (
                <article className="portal-record-card" key={item.id}>
                  <div>
                    <p className="eyebrow">{item.reference}</p>
                    <h3>{item.product_name || item.product_type}</h3>
                    <p>{formatCurrency(amount)} {item.currency || "NGN"}</p>
                  </div>
                  <dl className="portal-mini-details">
                    <div><dt>Status</dt><dd>{item.status}</dd></div>
                    <div><dt>Date</dt><dd>{formatDateTime(item.paid_at || item.created_at)}</dd></div>
                    <div><dt>Method</dt><dd>{item.payment_channel || item.payment_method || item.provider || "Paystack"}</dd></div>
                  </dl>
                  {reliable ? <span className="portal-tag success">Reliable record</span> : <span className="portal-tag">Awaiting confirmation</span>}
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
    <PortalPage slug="notifications" actions={<button className="button button-secondary" type="button" onClick={markAll} disabled={busy}>Mark all as read</button>}>
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading notifications" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        const records = query.data || [];
        if (!records.length) return <PortalEmpty content={content} />;
        return (
          <div className="portal-list">
            {records.map((item) => (
              <article className={`portal-record-card ${item.read_at ? "" : "unread"}`} key={item.id}>
                <div>
                  <p className="eyebrow">{item.notification_type || "Portal update"}</p>
                  <h3>{item.title}</h3>
                  <p>{item.message}</p>
                  <small>{formatDateTime(item.created_at)}</small>
                </div>
                {item.read_at ? <span className="portal-tag">Read</span> : <button className="button button-secondary" type="button" onClick={() => markOne(item.id)} disabled={busy}>Mark as read</button>}
              </article>
            ))}
          </div>
        );
      }}
    </PortalPage>
  );
}

function SupportPage() {
  const { user } = useAuth();
  const query = useStudentSupportTickets(user?.id);
  const [form, setForm] = useState({ subject: "", category: "general", message: "" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

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
                <article className="portal-record-card" key={item.id}>
                  <p className="eyebrow">{item.status}</p>
                  <h3>{item.subject}</h3>
                  <p>{item.message}</p>
                  {item.response ? <p><strong>Response:</strong> {item.response}</p> : null}
                  <small>{formatDateTime(item.created_at)}</small>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </PortalPage>
  );
}

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);

  async function sendPasswordReset() {
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      const result = await requestPasswordReset(user.email);
      setStatus({ type: result.ok ? "success" : "warning", message: result.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalPage slug="settings">
      {() => (
        <div className="portal-list">
          <article className="portal-record-card">
            <h3>Account email</h3>
            <p>{user?.email}</p>
            <span className="portal-tag success"><CheckCircle2 size={14} aria-hidden="true" /> Verified</span>
          </article>
          <article className="portal-record-card">
            <h3>Password recovery</h3>
            <p>Send a secure password reset link to your verified email address.</p>
            <button className="button button-secondary" type="button" onClick={sendPasswordReset} disabled={loading}>{loading ? "Sending" : "Send password reset link"}</button>
          </article>
          <article className="portal-record-card">
            <h3>Theme preference</h3>
            <p>Choose how the portal appears on this device.</p>
            <div className="segmented-control" role="group" aria-label="Theme preference">
              <button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><Sun size={16} aria-hidden="true" /> Light</button>
              <button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><Moon size={16} aria-hidden="true" /> Dark</button>
            </div>
          </article>
          {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
          <button className="button button-primary" type="button" onClick={signOut}>Sign Out</button>
        </div>
      )}
    </PortalPage>
  );
}

export function PortalSection({ page }) {
  if (page === "my-courses") return <MyCoursesPage />;
  if (page === "timetable") return <TimetablePage />;
  if (page === "announcements") return <AnnouncementsPage />;
  if (page === "assignments") return <AssignmentsPage />;
  if (page === "resources") return <ResourcesPage />;
  if (page === "payments") return <PaymentsPage />;
  if (page === "certificates") return <CertificatesPage />;
  if (page === "notifications") return <NotificationsPage />;
  if (page === "support") return <SupportPage />;
  if (page === "settings") return <SettingsPage />;
  return <MyCoursesPage />;
}

export function PortalProfile() {
  const { user, refreshProfile } = useAuth();
  const query = useStudentProfile(user);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", date_of_birth: "", education_level: "", address: "" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const profile = query.data;
    if (!profile && !user) return;
    setForm({
      full_name: profile?.full_name || "",
      email: user?.email || profile?.email || "",
      phone: profile?.phone || "",
      date_of_birth: profile?.date_of_birth || "",
      education_level: profile?.education_level || "",
      address: profile?.address || ""
    });
  }, [query.data, user]);

  async function submit(event) {
    event.preventDefault();
    if (form.full_name.trim().length < 2 || !isValidEmail(form.email) || form.phone.trim().length < 7) {
      setStatus({ type: "warning", message: "Review your name, email and phone number before saving." });
      return;
    }
    setSaving(true);
    setStatus({ type: "", message: "" });
    try {
      await updateStudentProfile(user.id, form);
      await refreshProfile();
      query.refetch();
      setStatus({ type: "success", message: "Profile updated successfully." });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Profile could not be updated." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalPage slug="profile">
      {(content) => {
        if (query.loading) return <PortalLoading label="Loading profile" />;
        if (query.error) return <PortalError message={query.error} onRetry={query.refetch} />;
        if (!query.data) return <PortalEmpty content={content} />;
        return (
          <form className="form-card portal-profile-form" onSubmit={submit}>
            <div className="portal-metric-card">
              <span>Email verification</span>
              <strong>{user?.email_confirmed_at || user?.confirmed_at ? "Verified" : "Pending"}</strong>
              <small>Account created {formatDateTime(user?.created_at || query.data.created_at)}</small>
            </div>
            <div className="form-grid">
              <label>
                <span>Full name</span>
                <input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
              </label>
              <label>
                <span>Email address</span>
                <input value={form.email} readOnly />
              </label>
              <label>
                <span>Phone</span>
                <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </label>
              <label>
                <span>Date of birth</span>
                <input type="date" value={form.date_of_birth || ""} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} />
              </label>
              <label>
                <span>Level of education</span>
                <input value={form.education_level || ""} onChange={(event) => setForm({ ...form, education_level: event.target.value })} />
              </label>
              <label>
                <span>Residential address</span>
                <input value={form.address || ""} onChange={(event) => setForm({ ...form, address: event.target.value })} />
              </label>
            </div>
            {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving" : "Save Profile"}</button>
          </form>
        );
      }}
    </PortalPage>
  );
}
