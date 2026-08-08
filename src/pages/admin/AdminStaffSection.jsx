import { useState } from "react";
import { ShieldCheck, UserPlus, Users } from "lucide-react";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  createStaffAccount,
  decideStaffRequest,
  getAdminStaffData,
  setAccountStatus,
  setStaffCapability,
  transferStaffCase
} from "../../services/adminService";

const capabilityLabels = {
  account_search: "Account search",
  view_basic_profile: "View basic profile",
  view_programme_assignment: "View programme assignment",
  view_payment_status: "View payment status",
  view_loan_status: "View loan status",
  correct_contact_information: "Correct contact information",
  send_support_notification: "Send support notification",
  resolve_support_case: "Resolve support case",
  create_admin_escalation: "Create Admin escalation"
};

const emptyForm = { fullName: "", email: "", phone: "", temporaryPassword: "", jobTitle: "Support Staff", department: "Learner Support" };

function StaffStatus({ value }) {
  const tone = value === "active" ? "success" : value === "restricted" || value === "suspended" ? "danger" : "warning";
  return <span className={`portal-tag ${tone}`}>{value || "inactive"}</span>;
}

export default function AdminStaffSection() {
  const query = useAsyncData(getAdminStaffData, [], { errorMessage: "Staff accounts could not be loaded." });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [responses, setResponses] = useState({});
  const [transfers, setTransfers] = useState({});
  const data = query.data || { staff: [], capabilities: [], cases: [], requests: [] };

  async function run(key, action, success, failure) {
    setBusy(key); setStatus({ type: "", message: "" });
    try { await action(); setStatus({ type: "success", message: success }); await query.refetch(); }
    catch { setStatus({ type: "warning", message: failure }); }
    finally { setBusy(""); }
  }

  async function create(event) {
    event.preventDefault();
    await run("create", async () => {
      const result = await createStaffAccount(form);
      setForm(emptyForm);
      setStatus({ type: "success", message: `Staff account ${result.portalId} created as inactive.` });
    }, "Staff account created as inactive.", "Staff account could not be created. Review the details and try again.");
  }

  if (query.loading) return <div className="portal-skeleton"><span>Loading Staff accounts</span><div /><div /></div>;
  if (query.error) return <div className="notice-card portal-state-card"><h2>Staff accounts could not be loaded</h2><p>Retry this section. No account changes were made.</p><button className="button button-primary" onClick={query.refetch}>Try Again</button></div>;

  const activeCases = data.cases.filter((item) => ["open", "in_progress", "escalated"].includes(item.status));
  return (
    <div className="portal-page admin-staff-page">
      <div className="portal-page-heading"><div><p className="eyebrow">Admin | Accounts</p><h2>Staff</h2><p>Create inactive Staff accounts, grant explicit capabilities and supervise case ownership.</p></div></div>
      {status.message ? <div className={`form-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</div> : null}

      <form className="form-card staff-create-form" onSubmit={create}>
        <header><UserPlus size={20} /><div><h3>Create Staff account</h3><p>New Staff accounts remain inactive with every capability disabled.</p></div></header>
        <div className="form-grid">
          <label>Full name<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></label>
          <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
          <label>Temporary password<input type="password" minLength="8" value={form.temporaryPassword} onChange={(event) => setForm({ ...form, temporaryPassword: event.target.value })} required /></label>
          <label>Job title<input value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} required /></label>
          <label>Department<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} required /></label>
        </div>
        <button className="button button-primary" disabled={busy === "create"}>{busy === "create" ? "Creating Staff" : "Create Inactive Staff"}</button>
      </form>

      <section className="staff-admin-directory">
        <header><Users size={20} /><div><h3>Staff directory</h3><p>{data.staff.length} Staff account{data.staff.length === 1 ? "" : "s"}</p></div></header>
        {!data.staff.length ? <div className="portal-state-card"><p>No Staff accounts have been created.</p></div> : data.staff.map((person) => {
          const capabilities = data.capabilities.filter((item) => item.staff_user_id === person.id);
          const activeCase = activeCases.find((item) => item.owner_staff_id === person.id);
          return <article className="staff-admin-record" key={person.id}>
            <header><div><strong>{person.full_name || person.email}</strong><span>{person.job_title || "Support Staff"} | {person.department || "Learner Support"}</span><small>{person.portal_id} | {person.email}</small></div><StaffStatus value={person.account_status} /></header>
            <div className="staff-admin-actions"><button className="button button-secondary" type="button" disabled={busy === `status-${person.id}`} onClick={() => run(`status-${person.id}`, () => setAccountStatus({ userId: person.id, status: person.account_status === "active" ? "inactive" : "active", reason: "Admin Staff account review" }), "Staff account status updated.", "Staff account status could not be changed.")}>{person.account_status === "active" ? "Deactivate" : "Activate"}</button>{activeCase ? <span className="portal-tag"><ShieldCheck size={14} />{activeCase.case_reference}</span> : <span className="portal-tag">No active case</span>}</div>
            <div className="staff-capability-switches">{Object.entries(capabilityLabels).map(([capability, label]) => { const enabled = capabilities.some((item) => item.capability === capability && item.enabled); return <button key={capability} className="switch-row" type="button" role="switch" aria-checked={enabled} disabled={Boolean(busy)} onClick={() => run(`${person.id}-${capability}`, () => setStaffCapability({ staffUserId: person.id, capability, enabled: !enabled }), "Staff capability updated.", "Staff capability could not be changed.")}><span>{label}</span><span className="switch-control" aria-hidden="true"><span /></span></button>; })}</div>
          </article>;
        })}
      </section>

      <section className="staff-admin-directory">
        <header><ShieldCheck size={20} /><div><h3>Active cases</h3><p>Transfer ownership or release a case for reassignment.</p></div></header>
        {activeCases.map((item) => { const transfer = transfers[item.id] || { staffUserId: item.owner_staff_id || "", reason: "Admin case reassignment" }; return <article className="staff-admin-record" key={item.id}><header><div><strong>{item.case_reference}</strong><span>{item.issue}</span></div><span className="portal-tag">{item.status}</span></header><div className="form-grid"><label>Owner<select value={transfer.staffUserId} onChange={(event) => setTransfers({ ...transfers, [item.id]: { ...transfer, staffUserId: event.target.value } })}><option value="">Release case</option>{data.staff.filter((person) => person.account_status === "active").map((person) => <option value={person.id} key={person.id}>{person.full_name || person.email}</option>)}</select></label><label>Reason<input value={transfer.reason} onChange={(event) => setTransfers({ ...transfers, [item.id]: { ...transfer, reason: event.target.value } })} /></label></div><button className="button button-secondary" type="button" disabled={busy === `case-${item.id}` || transfer.reason.trim().length < 3} onClick={() => run(`case-${item.id}`, () => transferStaffCase({ caseId: item.id, ...transfer }), "Case ownership updated.", "Case ownership could not be updated.")}>Save Ownership</button></article>; })}
      </section>

      <section className="staff-admin-directory">
        <header><ShieldCheck size={20} /><div><h3>Staff requests</h3><p>Review case-scoped escalations and return an auditable decision.</p></div></header>
        {data.requests.map((item) => <article className="staff-admin-record" key={item.id}><header><div><strong>{item.issue}</strong><span>{item.requested_action}</span></div><span className="portal-tag">{item.status}</span></header><p>{item.reason}</p>{item.status === "pending" ? <><label>Admin response<textarea value={responses[item.id] || ""} onChange={(event) => setResponses({ ...responses, [item.id]: event.target.value })} /></label><div className="button-row">{["approved", "rejected", "answered"].map((decision) => <button className={decision === "approved" ? "button button-primary" : "button button-secondary"} type="button" key={decision} disabled={busy === `request-${item.id}` || (responses[item.id] || "").trim().length < 3} onClick={() => run(`request-${item.id}`, () => decideStaffRequest({ requestId: item.id, status: decision, response: responses[item.id] }), "Staff request updated.", "Staff request could not be updated.")}>{decision}</button>)}</div></> : item.admin_response ? <p><strong>Admin response:</strong> {item.admin_response}</p> : null}</article>)}
      </section>
    </div>
  );
}
