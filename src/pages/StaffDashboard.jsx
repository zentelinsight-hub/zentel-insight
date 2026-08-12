import { useState } from "react";
import { Activity, BookOpenCheck, BriefcaseBusiness, FileText, Home, LifeBuoy, LogOut, MessageSquare, MoreHorizontal, Search, Send, Settings, ShieldCheck, Sun, Moon, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PortalBackButton from "../components/portal/PortalBackButton";
import PortalAvatarUpload from "../components/portal/PortalAvatarUpload";
import PortalNavigationPage from "../components/portal/PortalNavigationPage";
import PortalShell from "../components/portal/PortalShell";
import { useAuth } from "../context/authHooks";
import { useTheme } from "../context/themeHooks";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  addStaffCaseNote,
  claimStaffCase,
  closeStaffCase,
  createStaffEscalation,
  getStaffWorkspace,
  searchStaffAccounts
} from "../services/staffService";
import { formatDateTime } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";
import { markAllNotificationsRead, markNotificationRead } from "../services/portal/portalRepository";

function Heading({ title }) {
  const location = useLocation();
  const showBack = !["/staff", "/staff/more"].includes(location.pathname.replace(/\/$/, ""));
  return <div className="portal-page-heading"><div><p className="eyebrow">Staff Portal</p><div className="portal-title-row">{showBack ? <PortalBackButton fallback="/staff" label={`Back from ${title}`} /> : null}<h2>{title}</h2></div></div></div>;
}

function resolveStaffRoute(pathname) {
  const parts = String(pathname || "").replace(/^\/staff\/?/, "").split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (!parts.length) return { section: "home", caseId: "" };
  if (parts[0] === "cases" && parts[1]) return { section: parts[2] ? `case-${parts[2]}` : "case-detail", caseId: parts[1] };
  const allowed = new Set(["search", "cases", "requests", "more", "profile", "security", "notifications", "activity", "guidance", "settings", "support"]);
  return { section: allowed.has(parts[0]) ? parts[0] : "home", caseId: "" };
}

function Status({ value }) {
  return value.message ? <div className={`form-status ${value.type}`} role={value.type === "warning" ? "alert" : "status"}>{value.message}</div> : null;
}

function StaffHome({ data }) {
  const enabled = data.capabilities.filter((item) => item.enabled).length;
  return <div className="portal-page"><Heading title="Support workspace" description="Handle one authorised Student or Tutor case at a time." /><section className="staff-summary-strip"><div><span>Active case</span><strong>{data.activeCase?.case_reference || "None"}</strong></div><div><span>Capabilities</span><strong>{enabled}</strong></div><div><span>Requests</span><strong>{data.requests.filter((item) => item.status === "pending").length}</strong></div></section><section className="notice-card"><h3>Access boundary</h3><p>Your access is limited to capabilities granted by Admin and the active case assigned to you. Classroom messages, AI conversations, KYC documents and unrestricted directories are not available here.</p></section></div>;
}

function StaffSearch({ onChanged }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [claiming, setClaiming] = useState("");
  const [issue, setIssue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  async function search(event) {
    event.preventDefault();
    setBusy(true); setStatus({ type: "", message: "" });
    try {
      const records = await searchStaffAccounts(query);
      if (records.some((item) => item.security_restricted)) {
        setResults([]); setStatus({ type: "warning", message: "Search access has been restricted for security review. Contact Admin." });
      } else {
        setResults(records); setStatus(records.length ? { type: "", message: "" } : { type: "warning", message: "No permitted Student or Tutor account matched this search." });
      }
    } catch {
      setResults([]); setStatus({ type: "warning", message: "Search could not be completed. Check your access or try again." });
    } finally { setBusy(false); }
  }

  async function claim(record) {
    setBusy(true); setStatus({ type: "", message: "" });
    try {
      const saved = await claimStaffCase({ candidateToken: record.candidate_token, issue, reason });
      setStatus({ type: "success", message: `Case ${saved.case_reference} opened.` });
      setResults([]); setClaiming(""); setIssue(""); setReason(""); onChanged();
    } catch {
      setStatus({ type: "warning", message: "This case could not be opened. Finish your current case or ask Admin for help." });
    } finally { setBusy(false); }
  }

  return <div className="portal-page"><Heading title="Search accounts" description="Search permitted Student and Tutor accounts by name, exact email or phone." /><form className="staff-search-bar" onSubmit={search}><label><span className="sr-only">Search Student or Tutor</span><input value={query} onChange={(event) => setQuery(event.target.value)} minLength="3" placeholder="Name, exact email or phone" required /></label><button className="button button-primary" disabled={busy}><Search size={17} />{busy ? "Searching" : "Search"}</button></form><Status value={status} /><div className="staff-search-results">{results.map((record) => <article key={record.candidate_token}><div><strong>{record.display_name}</strong><span>{record.role_name} · {record.account_status}</span><small>{record.masked_email}{record.masked_phone ? ` · ${record.masked_phone}` : ""}</small>{record.programme_name ? <small>{record.programme_name}</small> : null}</div>{claiming === record.candidate_token ? <div className="staff-claim-form"><label>Issue<input value={issue} onChange={(event) => setIssue(event.target.value)} maxLength="500" /></label><label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength="1000" /></label><div className="button-row"><button className="button button-secondary" type="button" onClick={() => setClaiming("")}>Cancel</button><button className="button button-primary" type="button" disabled={busy || issue.trim().length < 4 || reason.trim().length < 4} onClick={() => claim(record)}>Open Case</button></div></div> : <button className="button button-secondary" type="button" onClick={() => setClaiming(record.candidate_token)}>Start Case</button>}</article>)}</div></div>;
}

function StaffCases({ data }) {
  const activeCase = data.activeCase;
  return <div className="portal-page"><Heading title="Cases" />{activeCase ? <div className="portal-destination-list"><Link to={`/staff/cases/${activeCase.case_id}`}><span className="portal-destination-icon"><BriefcaseBusiness size={18} /></span><span className="portal-destination-copy"><strong>{activeCase.case_reference}</strong><small>{activeCase.display_name} | {activeCase.case_status}</small></span><span aria-hidden="true">&gt;</span></Link></div> : <p className="portal-empty-line">No active case. Search a permitted account to begin.</p>}<section className="portal-flat-section"><h2>Case history</h2><div className="portal-structured-list">{data.caseHistory.map((item) => <div key={item.id}><span><strong>{item.case_reference}</strong><small>{item.issue} | {item.status} | {formatDateTime(item.updated_at)}</small></span></div>)}{!data.caseHistory.length ? <p>No case history is available.</p> : null}</div></section></div>;
}

function StaffCaseNavigation({ data, caseId }) {
  const activeCase = data.activeCase;
  if (!activeCase || String(activeCase.case_id) !== String(caseId)) return <div className="portal-page"><Heading title="Case unavailable" description="Only your currently assigned case can be opened." /></div>;
  const base = `/staff/cases/${activeCase.case_id}`;
  return <PortalNavigationPage eyebrow="Staff Case" title={activeCase.case_reference} description={activeCase.display_name} items={[
    { to: `${base}/account`, label: "Account", description: "Permitted account details", Icon: UserRound },
    { to: `${base}/conversation`, label: "Conversation", description: "Case issue and reason", Icon: MessageSquare },
    { to: `${base}/notes`, label: "Notes", description: "Internal case notes", Icon: FileText },
    { to: `${base}/activity`, label: "Activity", description: "Case activity timeline", Icon: Activity },
    { to: `${base}/status`, label: "Status", description: "Resolve the active case", Icon: ShieldCheck }
  ]} />;
}

function StaffCase({ data, onChanged, mode = "notes", caseId = "" }) {
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const canResolve = data.capabilities.some((item) => item.capability === "resolve_support_case" && item.enabled);
  const activeCase = data.activeCase;
  if (!activeCase || (caseId && String(activeCase.case_id) !== String(caseId))) return <div className="portal-page"><Heading title="Case unavailable" description="Only your currently assigned case can be opened." /></div>;

  async function addNote() {
    try { await addStaffCaseNote(activeCase.case_id, note); setNote(""); setStatus({ type: "success", message: "Internal note added." }); onChanged(); }
    catch { setStatus({ type: "warning", message: "The note could not be added." }); }
  }
  async function resolve() {
    try { await closeStaffCase(activeCase.case_id, resolution); setStatus({ type: "success", message: "Case resolved." }); onChanged(); }
    catch { setStatus({ type: "warning", message: "The case could not be resolved." }); }
  }

  if (mode === "account") return <div className="portal-page"><Heading title={activeCase.case_reference} description="Permitted account details." /><section className="staff-case-record"><header><div><strong>{activeCase.display_name}</strong><span>{activeCase.role_name} | {activeCase.account_status}</span></div><span className="portal-tag success">{activeCase.case_status}</span></header><dl><div><dt>Contact</dt><dd>{activeCase.masked_email}{activeCase.masked_phone ? ` | ${activeCase.masked_phone}` : ""}</dd></div>{activeCase.programme_name ? <div><dt>Programme</dt><dd>{activeCase.programme_name}</dd></div> : null}</dl></section></div>;
  if (mode === "conversation") return <div className="portal-page"><Heading title={activeCase.case_reference} description="Case issue and reason." /><section className="staff-case-record"><dl><div><dt>Issue</dt><dd>{activeCase.issue}</dd></div><div><dt>Reason</dt><dd>{activeCase.reason}</dd></div></dl></section></div>;
  if (mode === "activity") return <div className="portal-page"><Heading title={activeCase.case_reference} description="Case activity timeline." /><div className="staff-timeline">{data.notes.map((item) => <article key={item.id}><p>{item.note}</p><small>{formatDateTime(item.created_at)}</small></article>)}</div></div>;
  if (mode === "status") return <div className="portal-page"><Heading title={activeCase.case_reference} description="Resolve the active case." /><Status value={status} />{canResolve ? <section className="staff-case-work"><div><label>Resolution<textarea value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength="4000" /></label><button className="button button-primary" type="button" disabled={resolution.trim().length < 2} onClick={resolve}>Resolve Case</button></div></section> : <div className="notice-card"><p>Your account does not have permission to resolve cases.</p></div>}</div>;
  if (mode === "notes") return <div className="portal-page"><Heading title={activeCase.case_reference} description="Internal case notes." /><Status value={status} /><section className="staff-case-work"><div><div className="staff-timeline">{data.notes.map((item) => <article key={item.id}><p>{item.note}</p><small>{formatDateTime(item.created_at)}</small></article>)}</div><label>Add note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength="4000" /></label><button className="button button-secondary" type="button" disabled={note.trim().length < 2} onClick={addNote}>Add Note</button></div></section></div>;

  return <div className="portal-page"><Heading title={activeCase.case_reference} description="Active case details and internal activity." /><Status value={status} /><section className="staff-case-record"><header><div><strong>{activeCase.display_name}</strong><span>{activeCase.role_name} · {activeCase.account_status}</span></div><span className="portal-tag success">{activeCase.case_status}</span></header><dl><div><dt>Contact</dt><dd>{activeCase.masked_email}{activeCase.masked_phone ? ` · ${activeCase.masked_phone}` : ""}</dd></div>{activeCase.programme_name ? <div><dt>Programme</dt><dd>{activeCase.programme_name}</dd></div> : null}<div><dt>Issue</dt><dd>{activeCase.issue}</dd></div><div><dt>Reason</dt><dd>{activeCase.reason}</dd></div></dl></section><section className="staff-case-work"><div><h3>Internal notes</h3><div className="staff-timeline">{data.notes.map((item) => <article key={item.id}><p>{item.note}</p><small>{formatDateTime(item.created_at)}</small></article>)}</div><label>Add note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength="4000" /></label><button className="button button-secondary" type="button" disabled={note.trim().length < 2} onClick={addNote}>Add Note</button></div>{canResolve ? <div><h3>Resolve case</h3><label>Resolution<textarea value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength="4000" /></label><button className="button button-primary" type="button" disabled={resolution.trim().length < 2} onClick={resolve}>Resolve Case</button></div> : null}</section></div>;
}

function StaffRequests({ data, onChanged }) {
  const [form, setForm] = useState({ issue: "", requestedAction: "", reason: "" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const canEscalate = data.capabilities.some((item) => item.capability === "create_admin_escalation" && item.enabled);
  async function submit(event) {
    event.preventDefault();
    try { await createStaffEscalation({ caseId: data.activeCase.case_id, ...form }); setForm({ issue: "", requestedAction: "", reason: "" }); setStatus({ type: "success", message: "Request sent to Admin." }); onChanged(); }
    catch { setStatus({ type: "warning", message: "The request could not be sent." }); }
  }
  return <div className="portal-page"><Heading title="Requests" description="Escalate case-specific decisions to Admin and review responses." /><Status value={status} />{canEscalate && data.activeCase ? <form className="form-card management-form" onSubmit={submit}><label>Issue<input value={form.issue} onChange={(event) => setForm({ ...form, issue: event.target.value })} required /></label><label>Requested action<input value={form.requestedAction} onChange={(event) => setForm({ ...form, requestedAction: event.target.value })} required /></label><label>Reason<textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required /></label><button className="button button-primary"><Send size={17} />Send Request</button></form> : <div className="notice-card"><p>An active case and the Admin escalation capability are required to create a request.</p></div>}<div className="staff-request-list">{data.requests.map((item) => <article key={item.id}><header><strong>{item.issue}</strong><span className="portal-tag">{item.status}</span></header><p>{item.requested_action}</p>{item.admin_response ? <p><strong>Admin response:</strong> {item.admin_response}</p> : null}<small>{formatDateTime(item.created_at)}</small></article>)}</div></div>;
}

function StaffProfile({ data, onChanged }) {
  return <div className="portal-page"><Heading title="Profile" /><PortalAvatarUpload profile={data.profile} name={data.profile.full_name} onChanged={onChanged} size="lg" /><section className="staff-profile-record"><span className="portal-avatar lg">{data.profile.avatar_url ? <img src={data.profile.avatar_url} alt={`${data.profile.full_name} profile`} /> : <UserRound size={30} />}</span><div><h3>{data.profile.full_name}</h3><p>{data.staffProfile.job_title} · {data.staffProfile.department}</p><p>{data.profile.email}</p><span className="portal-tag">{data.profile.portal_id}</span></div></section><p className="portal-help-text">Staff credentials remain Admin-managed.</p></div>;
}

function StaffNotifications({ data, onChanged }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState("");
  async function markOne(id) { setBusy(id); try { await markNotificationRead(user.id, id); onChanged(); } finally { setBusy(""); } }
  async function markAll() { setBusy("all"); try { await markAllNotificationsRead(user.id); onChanged(); } finally { setBusy(""); } }
  return <div className="portal-page"><Heading title="Notifications" /><div className="button-row"><button className="button button-secondary" type="button" disabled={busy === "all" || !data.notifications.some((item) => !item.read_at)} onClick={markAll}>Mark all read</button></div><div className="portal-structured-list">{data.notifications.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small>{item.message} | {formatDateTime(item.created_at)}</small></span>{!item.read_at ? <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => markOne(item.id)}>Mark read</button> : <span className="portal-tag success">Read</span>}</div>)}{!data.notifications.length ? <p>No Staff notifications.</p> : null}</div></div>;
}

function StaffActivity({ data }) {
  return <div className="portal-page"><Heading title="Activity" /><section className="portal-flat-section"><h2>Case activity</h2><div className="portal-structured-list">{data.events.map((item) => <div key={item.id}><span><strong>{item.event_type.replace(/_/g, " ")}</strong><small>{item.permitted_area || "Case workspace"} | {formatDateTime(item.created_at)}</small></span></div>)}{!data.events.length ? <p>No active-case activity.</p> : null}</div></section><section className="portal-flat-section"><h2>Account searches</h2><div className="portal-structured-list">{data.searchEvents.map((item) => <div key={item.id}><span><strong>{item.blocked ? "Blocked search" : "Permitted search"}</strong><small>{item.result_count} result(s) | {formatDateTime(item.created_at)}</small></span></div>)}{!data.searchEvents.length ? <p>No search activity.</p> : null}</div></section></div>;
}

function StaffSettings() {
  const { theme, setTheme } = useTheme();
  return <div className="portal-page"><Heading title="Settings" /><section className="portal-flat-section"><h2>Appearance</h2><div className="segmented-control compact" role="group" aria-label="Portal theme"><button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><Sun size={16} />Light</button><button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><Moon size={16} />Dark</button></div></section></div>;
}

function StaffMore() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  async function handleSignOut() { await signOut({ scope: "local" }); navigate("/login", { replace: true }); }
  return <PortalNavigationPage eyebrow="Staff Portal" title="More" items={[
    { to: "/staff/cases", label: "Case History", description: "Assigned case records", Icon: BriefcaseBusiness },
    { to: "/staff/requests", label: "Requests & Admin Decisions", description: "Escalations and responses", Icon: Send },
    { to: "/staff/activity", label: "Activity", description: "Permitted case and search events", Icon: Activity },
    { to: "/staff/profile", label: "Profile", description: "View identity and profile picture", Icon: UserRound },
    { to: "/staff/guidance", label: "Guidance", description: "Case handling boundaries", Icon: BookOpenCheck },
    { to: "/staff/security", label: "Security", description: "Review granted capabilities", Icon: ShieldCheck },
    { to: "/staff/settings", label: "Settings", description: "Portal appearance", Icon: Settings },
    { to: "/staff/support", label: "Support", description: "Escalate operational issues", Icon: LifeBuoy },
    { label: "Sign Out", description: "End this Staff session", Icon: LogOut, onSelect: handleSignOut }
  ]} />;
}

export default function StaffDashboard() {
  const location = useLocation();
  const { section: activeSection, caseId } = resolveStaffRoute(location.pathname);
  const { user, profile } = useAuth();
  const workspaceQuery = useAsyncData(() => getStaffWorkspace(user?.id), [user?.id], { enabled: Boolean(user?.id), errorMessage: "Staff workspace could not be loaded." });
  usePageMeta({ path: location.pathname, title: "Staff Portal", description: "Protected Zentel Insight Staff workspace.", robots: "noindex,nofollow" });
  const data = workspaceQuery.data;
  const nav = [
    { to: "/staff", label: "Home", Icon: Home, end: true },
    { to: "/staff/search", label: "Search", Icon: Search },
    { to: "/staff/cases", label: "Cases", Icon: BriefcaseBusiness },
    { to: "/staff/requests", label: "Requests", Icon: Send },
    { to: "/staff/more", label: "More", Icon: MoreHorizontal }
  ];
  if (workspaceQuery.loading) return <div className="route-loader">Loading Staff workspace</div>;
  if (workspaceQuery.error || !data) return <section className="restricted-account-screen"><div className="restricted-account-card"><h1>Staff workspace could not be loaded</h1><p>Please retry. If the issue continues, contact Admin.</p><button className="button button-primary" onClick={workspaceQuery.refetch}>Try Again</button></div></section>;
  const displayName = data.profile?.full_name || profile?.full_name || user?.email || "Staff";
  return <PortalShell sidebar={{ homeTo: "/staff", brandLabel: "Staff Portal", profileName: displayName, profileDetail: data.staffProfile?.job_title || "Support Staff", avatarUrl: data.profile?.avatar_url, profileInitial: displayName.slice(0, 1), profileTo: "/staff/profile", notificationItem: { to: "/staff/notifications", label: "Notifications", badge: data.notifications.filter((item) => !item.read_at).length }, navLabel: "Staff portal", shellClass: "management-shell staff-shell", primaryItems: nav }} header={{ title: displayName }} realtimeTables={["staff_support_cases", "staff_case_notes", "staff_requests", "staff_capabilities", "staff_search_events", "portal_notifications"]} onRealtimeChange={workspaceQuery.refetch}>
    {activeSection === "home" ? <StaffHome data={data} /> : null}
    {activeSection === "search" ? <StaffSearch onChanged={workspaceQuery.refetch} /> : null}
    {activeSection === "cases" ? <StaffCases data={data} /> : null}
    {activeSection === "case-detail" ? <StaffCaseNavigation data={data} caseId={caseId} /> : null}
    {["case-account", "case-conversation", "case-notes", "case-activity", "case-status"].includes(activeSection) ? <StaffCase data={data} caseId={caseId} mode={activeSection.replace("case-", "")} onChanged={workspaceQuery.refetch} /> : null}
    {activeSection === "requests" ? <StaffRequests data={data} onChanged={workspaceQuery.refetch} /> : null}
    {activeSection === "profile" ? <StaffProfile data={data} onChanged={workspaceQuery.refetch} /> : null}
    {activeSection === "more" ? <StaffMore /> : null}
    {activeSection === "notifications" ? <StaffNotifications data={data} onChanged={workspaceQuery.refetch} /> : null}
    {activeSection === "activity" ? <StaffActivity data={data} /> : null}
    {activeSection === "guidance" ? <div className="portal-page"><Heading title="Guidance" /><dl className="portal-detail-rows"><div><dt>Account access</dt><dd>Only the active assigned case</dd></div><div><dt>Sensitive systems</dt><dd>Classroom chat, AI, KYC and unrestricted directories remain unavailable</dd></div><div><dt>Admin decisions</dt><dd>Use Requests for approval or escalation</dd></div></dl></div> : null}
    {activeSection === "security" ? <div className="portal-page"><Heading title="Security" description="Review the access capabilities currently granted to your Staff account." /><div className="staff-capability-list">{data.capabilities.map((item) => <div key={item.capability}><span>{item.capability.replace(/_/g, " ")}</span><span className={`portal-tag ${item.enabled ? "success" : "warning"}`}>{item.enabled ? "Enabled" : "Disabled"}</span></div>)}</div></div> : null}
    {activeSection === "settings" ? <StaffSettings /> : null}
    {activeSection === "support" ? <div className="portal-page"><Heading title="Support" /><p className="portal-help-text">Send case-specific requests to Admin from the Requests workspace.</p><Link className="button button-secondary" to="/staff/requests">Open Requests</Link></div> : null}
  </PortalShell>;
}
