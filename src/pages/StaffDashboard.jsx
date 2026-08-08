import { useMemo, useState } from "react";
import { BriefcaseBusiness, FileUp, Home, Search, Send, ShieldCheck, UserRound } from "lucide-react";
import { useParams } from "react-router-dom";
import PortalShell from "../components/portal/PortalShell";
import { useAuth } from "../context/authHooks";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  addStaffCaseNote,
  claimStaffCase,
  closeStaffCase,
  createStaffEscalation,
  getStaffWorkspace,
  searchStaffAccounts,
  updateStaffAvatar
} from "../services/staffService";
import { formatDateTime } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";

const sectionNames = new Set(["home", "search", "cases", "requests", "profile", "security"]);

function Heading({ title, description }) {
  return <div className="portal-page-heading"><div><p className="eyebrow">Staff Portal</p><h2>{title}</h2><p>{description}</p></div></div>;
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

function StaffCase({ data, onChanged }) {
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const canResolve = data.capabilities.some((item) => item.capability === "resolve_support_case" && item.enabled);
  const activeCase = data.activeCase;
  if (!activeCase) return <div className="portal-page"><Heading title="Cases" description="Your active support case appears here." /><div className="notice-card portal-state-card"><BriefcaseBusiness size={24} /><h3>No active case</h3><p>Search for a permitted Student or Tutor account to begin a support case.</p></div></div>;

  async function addNote() {
    try { await addStaffCaseNote(activeCase.case_id, note); setNote(""); setStatus({ type: "success", message: "Internal note added." }); onChanged(); }
    catch { setStatus({ type: "warning", message: "The note could not be added." }); }
  }
  async function resolve() {
    try { await closeStaffCase(activeCase.case_id, resolution); setStatus({ type: "success", message: "Case resolved." }); onChanged(); }
    catch { setStatus({ type: "warning", message: "The case could not be resolved." }); }
  }

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
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  async function upload(event) {
    event.preventDefault();
    try { await updateStaffAvatar({ userId: user.id, file, previousPath: data.profile.avatar_path }); setStatus({ type: "success", message: "Profile picture updated." }); setFile(null); onChanged(); }
    catch { setStatus({ type: "warning", message: "Profile picture could not be updated." }); }
  }
  return <div className="portal-page"><Heading title="Profile" description="Review your Staff identity and update only your profile picture." /><Status value={status} /><section className="staff-profile-record"><span className="portal-avatar lg">{data.profile.avatar_url ? <img src={data.profile.avatar_url} alt="" /> : <UserRound size={30} />}</span><div><h3>{data.profile.full_name}</h3><p>{data.staffProfile.job_title} · {data.staffProfile.department}</p><p>{data.profile.email}</p><span className="portal-tag">{data.profile.portal_id}</span></div></section><form className="staff-avatar-form" onSubmit={upload}><label><FileUp size={18} /><span>Profile picture</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button className="button button-primary" disabled={!file}>Upload Picture</button></form></div>;
}

export default function StaffDashboard() {
  const { section = "home" } = useParams();
  const activeSection = sectionNames.has(section) ? section : "home";
  const { user, profile } = useAuth();
  const workspaceQuery = useAsyncData(() => getStaffWorkspace(user?.id), [user?.id], { enabled: Boolean(user?.id), errorMessage: "Staff workspace could not be loaded." });
  usePageMeta({ path: activeSection === "home" ? "/staff" : `/staff/${activeSection}`, title: "Staff Portal", description: "Protected Zentel Insight Staff workspace.", robots: "noindex,nofollow" });
  const data = workspaceQuery.data;
  const nav = useMemo(() => [
    { to: "/staff", label: "Home", Icon: Home, end: true },
    { to: "/staff/search", label: "Search", Icon: Search },
    { to: "/staff/cases", label: "Cases", Icon: BriefcaseBusiness },
    { to: "/staff/requests", label: "Requests", Icon: Send }
  ], []);
  if (workspaceQuery.loading) return <div className="route-loader">Loading Staff workspace</div>;
  if (workspaceQuery.error || !data) return <section className="restricted-account-screen"><div className="restricted-account-card"><h1>Staff workspace could not be loaded</h1><p>Please retry. If the issue continues, contact Admin.</p><button className="button button-primary" onClick={workspaceQuery.refetch}>Try Again</button></div></section>;
  const displayName = data.profile?.full_name || profile?.full_name || user?.email || "Staff";
  return <PortalShell sidebar={{ homeTo: "/staff", brandLabel: "Staff Portal", profileName: displayName, profileDetail: data.staffProfile?.job_title || "Support Staff", avatarUrl: data.profile?.avatar_url, profileInitial: displayName.slice(0, 1), profileTo: "/staff/profile", navLabel: "Staff portal", shellClass: "management-shell staff-shell", primaryItems: nav, moreItems: [{ to: "/staff/profile", label: "Profile", Icon: UserRound }, { to: "/staff/security", label: "Security", Icon: ShieldCheck }] }} header={{ title: displayName }} realtimeTables={["staff_support_cases", "staff_case_notes", "staff_requests", "staff_capabilities", "security_events"]} onRealtimeChange={workspaceQuery.refetch}>
    {activeSection === "home" ? <StaffHome data={data} /> : null}
    {activeSection === "search" ? <StaffSearch onChanged={workspaceQuery.refetch} /> : null}
    {activeSection === "cases" ? <StaffCase data={data} onChanged={workspaceQuery.refetch} /> : null}
    {activeSection === "requests" ? <StaffRequests data={data} onChanged={workspaceQuery.refetch} /> : null}
    {activeSection === "profile" ? <StaffProfile data={data} onChanged={workspaceQuery.refetch} /> : null}
    {activeSection === "security" ? <div className="portal-page"><Heading title="Security" description="Review the access capabilities currently granted to your Staff account." /><div className="staff-capability-list">{data.capabilities.map((item) => <div key={item.capability}><span>{item.capability.replace(/_/g, " ")}</span><span className={`portal-tag ${item.enabled ? "success" : "warning"}`}>{item.enabled ? "Enabled" : "Disabled"}</span></div>)}</div></div> : null}
  </PortalShell>;
}
