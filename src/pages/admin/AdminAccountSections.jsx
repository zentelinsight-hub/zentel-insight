import { ArrowLeft, ChevronLeft, ChevronRight, KeyRound, Search, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalDialog from "../../components/portal/PortalDialog";
import PortalIdCard from "../../components/portal/PortalIdCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import { findAdminAccount, searchAdminAccounts, updateStudentProfile, updateTutorProfile } from "../../services/adminService";
import { requestPasswordReset } from "../../services/authService";
import { formatDateTime } from "../../utils/format";

const emptyStatus = { type: "", message: "" };

function roleLabel(role) {
  return role === "tutor" ? "Tutor" : "Student";
}

function readableAction(value) {
  return String(value || "Account update")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getTrackOptions(programs, programId) {
  return programs.find((program) => program.id === programId)?.program_levels || [];
}

function buildAccountForm(account) {
  const profile = account?.profile || {};
  const tutor = account?.tutorProfile || {};
  const assignment = account?.role === "tutor" ? account?.tutorAssignment : account?.enrolment;
  return {
    full_name: profile.full_name || "",
    phone: profile.phone || "",
    date_of_birth: profile.date_of_birth || "",
    education_level: profile.education_level || "",
    address: profile.address || "",
    account_status: profile.account_status || "inactive",
    status_reason: profile.status_reason || "",
    title: tutor.title || profile.title || "Mr",
    program_id: assignment?.program_id || "",
    track_id: assignment?.track_id || assignment?.program_level_id || "",
    specialisation: tutor.specialisation || "",
    professional_bio: tutor.professional_bio || "",
    qualifications: tutor.qualifications || "",
    teaching_experience: tutor.teaching_experience || "",
    availability: tutor.availability || ""
  };
}

export function AccountLookupSection() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ searchType: "portal_id", accountType: "any", value: "" });
  const [status, setStatus] = useState(emptyStatus);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const directoryQuery = useAsyncData(
    () => searchAdminAccounts({ page, pageSize: 25 }),
    [page],
    { errorMessage: "We could not load the account directory. Please try again." }
  );

  async function submit(event) {
    event.preventDefault();
    const value = form.value.trim();
    if (!value) {
      setStatus({ type: "warning", message: form.searchType === "email" ? "Enter the complete registered email address." : "Enter the complete Portal ID." });
      return;
    }
    setLoading(true);
    setStatus(emptyStatus);
    try {
      const result = await findAdminAccount({ ...form, value });
      navigate(`/admin/accounts/${encodeURIComponent(result.account.profile.portal_id)}`);
    } catch (error) {
      if (import.meta.env.DEV) console.info("Admin account lookup failed", error);
      setStatus({
        type: "warning",
        message: error?.code === "not_found"
          ? "No matching Student or Tutor account was found. Check the details and try again."
          : error?.message || "We could not complete this account lookup. Please try again."
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="account-lookup-section" aria-labelledby="account-lookup-title">
      <div className="portal-page-heading">
        <div>
          <p className="eyebrow">Secure administration</p>
          <h2 id="account-lookup-title">Account Lookup</h2>
          <p>Enter a Student or Tutor Portal ID or registered email address to securely locate and manage the account.</p>
        </div>
        <ShieldCheck size={28} aria-hidden="true" />
      </div>
      <div className="account-lookup-search-panel">
        <div>
          <h3>Find an account to manage</h3>
          <p>Use an exact Portal ID or registered email to open the matching Student or Tutor account for editing.</p>
        </div>
      <form className="account-lookup-form" onSubmit={submit}>
        <label>
          <span>Search by</span>
          <select value={form.searchType} onChange={(event) => setForm({ ...form, searchType: event.target.value, value: "" })}>
            <option value="portal_id">Portal ID</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label>
          <span>Account type</span>
          <select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value })}>
            <option value="any">Any</option>
            <option value="student">Student</option>
            <option value="tutor">Tutor</option>
          </select>
        </label>
        <label className="account-lookup-value">
          <span>{form.searchType === "email" ? "Registered email address" : "Portal ID"}</span>
          <input
            type={form.searchType === "email" ? "email" : "text"}
            autoComplete="off"
            value={form.value}
            onChange={(event) => setForm({ ...form, value: event.target.value })}
            placeholder={form.searchType === "email" ? "name@example.com" : "ZIS-XXXX-XXXX or ZIT-XXXX-XXXX"}
            aria-describedby="account-lookup-privacy"
          />
        </label>
        <button className="button button-primary account-lookup-submit" type="submit" disabled={loading}>
          <Search size={18} aria-hidden="true" />
          {loading ? "Searching" : "Search"}
        </button>
      </form>
      <p id="account-lookup-privacy" className="muted-line">Only an exact match can open the account editor.</p>
      {status.message ? <div className={`form-status ${status.type}`} role="alert">{status.message}</div> : null}
      </div>

      <section className="account-directory" aria-labelledby="account-directory-title">
        <div className="account-directory-heading">
          <div>
            <h3 id="account-directory-title">Student and Tutor Directory</h3>
            <p>Read-only account information. Use the exact lookup above to open and edit an account.</p>
          </div>
          <span className="portal-tag">{directoryQuery.data?.total || 0} accounts</span>
        </div>
        {directoryQuery.loading ? <div className="route-loader">Loading accounts</div> : null}
        {directoryQuery.error ? (
          <div className="notice-card portal-state-card">
            <p>{directoryQuery.error}</p>
            <button className="button button-secondary" type="button" onClick={directoryQuery.refetch}>Try Again</button>
          </div>
        ) : null}
        {!directoryQuery.loading && !directoryQuery.error ? (
          <>
            <div className="account-directory-table-wrap">
              <table className="account-directory-table">
                <thead><tr><th scope="col">Name</th><th scope="col">Account type</th><th scope="col">Student / Tutor ID</th><th scope="col">Email</th><th scope="col">Account status</th></tr></thead>
                <tbody>
                  {(directoryQuery.data?.records || []).map((person) => (
                    <tr key={person.id}>
                      <td data-label="Name"><strong>{person.full_name || "Name not recorded"}</strong></td>
                      <td data-label="Account type"><span className="portal-tag">{roleLabel(person.role)}</span></td>
                      <td data-label={`${roleLabel(person.role)} ID`}><span className="account-directory-id">{person.portal_id || "Not assigned"}</span></td>
                      <td data-label="Email"><span className="account-directory-email">{person.email || "Not recorded"}</span></td>
                      <td data-label="Account status"><span className={`portal-tag ${person.account_status === "active" ? "success" : "warning"}`}>{person.account_status || "inactive"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!(directoryQuery.data?.records || []).length ? <p className="muted-line">No Student or Tutor accounts are available.</p> : null}
            {directoryQuery.data?.pageCount > 1 ? (
              <nav className="account-directory-pagination" aria-label="Account directory pages">
                <button className="button button-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={18} aria-hidden="true" />Previous</button>
                <span>Page {page} of {directoryQuery.data.pageCount}</span>
                <button className="button button-secondary" type="button" disabled={page >= directoryQuery.data.pageCount} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight size={18} aria-hidden="true" /></button>
              </nav>
            ) : null}
          </>
        ) : null}
      </section>
    </section>
  );
}

export function AccountManagementSection({ portalId, programs = [] }) {
  const navigate = useNavigate();
  const accountQuery = useAsyncData(
    () => findAdminAccount({ searchType: "portal_id", value: portalId, accountType: "any" }),
    [portalId],
    { errorMessage: "We could not load this account. Please try again." }
  );
  const account = accountQuery.data?.account || null;
  const [form, setForm] = useState(() => buildAccountForm(account));
  const [baseline, setBaseline] = useState(() => buildAccountForm(account));
  const [syncedAccount, setSyncedAccount] = useState(null);
  const [status, setStatus] = useState(emptyStatus);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!account) return;
    const next = buildAccountForm(account);
    setForm(next);
    setBaseline(next);
    setSyncedAccount(account);
    setStatus(emptyStatus);
  }, [account]);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const tracks = useMemo(() => getTrackOptions(programs, form.program_id), [form.program_id, programs]);
  const programmeChanged = form.program_id !== baseline.program_id || form.track_id !== baseline.track_id;
  const statusChanged = form.account_status !== baseline.account_status;

  useEffect(() => {
    function warnBeforeLeave(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);

  async function persistChanges() {
    if (!account || saving) return;
    setSaving(true);
    setStatus(emptyStatus);
    try {
      const statusValue = statusChanged ? form.account_status : "";
      const programmeId = programmeChanged ? form.program_id : "";
      const trackId = programmeChanged ? form.track_id : "";
      if (account.role === "student") {
        await updateStudentProfile({
          id: account.profile.id,
          ...form,
          account_status: statusValue,
          program_id: programmeId,
          program_level_id: trackId
        });
      } else {
        await updateTutorProfile({
          user_id: account.profile.id,
          ...form,
          account_status: statusValue,
          program_id: programmeId,
          track_id: trackId
        });
      }
      setStatus({ type: "success", message: `${roleLabel(account.role)} account changes were saved.` });
      setConfirmation("");
      accountQuery.refetch();
    } catch (error) {
      if (import.meta.env.DEV) console.info("Admin account update failed", error);
      setStatus({ type: "warning", message: "We could not save these account changes. No success was recorded. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (form.full_name.trim().length < 2 || form.phone.trim().length < 7) {
      setStatus({ type: "warning", message: "Enter a valid full name and phone number before saving." });
      return;
    }
    if (programmeChanged && (!form.program_id || !form.track_id)) {
      setStatus({ type: "warning", message: "Choose both programme and track before saving an assignment change." });
      return;
    }
    if (statusChanged && !form.status_reason.trim()) {
      setStatus({ type: "warning", message: "Enter a reason for the account status change." });
      return;
    }
    if (programmeChanged || statusChanged) setConfirmation("save");
    else void persistChanges();
  }

  function cancel() {
    if (dirty) setConfirmation("cancel");
    else navigate("/admin/accounts");
  }

  async function sendReset() {
    setStatus(emptyStatus);
    const result = await requestPasswordReset(account.profile.email);
    setStatus({ type: result.ok ? "success" : "warning", message: result.message });
  }

  if (accountQuery.loading || (account && syncedAccount !== account)) return <div className="route-loader">Loading account</div>;
  if (accountQuery.error || !account) {
    return (
      <section className="notice-card portal-state-card">
        <h2>We could not load this account</h2>
        <p>Check the Portal ID and try again.</p>
        <div className="button-row">
          <button className="button button-secondary" type="button" onClick={() => navigate("/admin/accounts")}><ArrowLeft size={18} aria-hidden="true" />Account Lookup</button>
          <button className="button button-primary" type="button" onClick={accountQuery.refetch}>Try Again</button>
        </div>
      </section>
    );
  }

  const profile = account.profile;
  const role = roleLabel(account.role);
  const assignment = account.role === "tutor" ? account.tutorAssignment : account.enrolment;

  return (
    <div className="account-management-page">
      <div className="portal-page-heading">
        <div>
          <button className="text-link" type="button" onClick={cancel}><ArrowLeft size={16} aria-hidden="true" />Account Lookup</button>
          <p className="eyebrow">{role} account</p>
          <h2>{profile.full_name || role}</h2>
          <p>Manage the exact account identified by its permanent Portal ID.</p>
        </div>
        <span className={`portal-tag ${profile.account_status === "active" ? "success" : "warning"}`}>{profile.account_status}</span>
      </div>

      <section className="account-summary" aria-labelledby="account-summary-title">
        <div className="account-summary-person">
          <span className="portal-avatar xl">
            {profile.avatar_url ? <img src={profile.avatar_url} alt={`${profile.full_name || role} profile`} /> : <UserRound size={30} aria-hidden="true" />}
          </span>
          <div><h3 id="account-summary-title">Account Summary</h3><p>{profile.email}</p></div>
        </div>
        <PortalIdCard portalId={profile.portal_id} role={account.role} />
        <dl className="portal-mini-details">
          <div><dt>Account type</dt><dd>{role}</dd></div>
          <div><dt>Account status</dt><dd>{profile.account_status}</dd></div>
          <div><dt>Date created</dt><dd>{formatDateTime(profile.created_at)}</dd></div>
          <div><dt>Last status update</dt><dd>{formatDateTime(profile.status_changed_at || profile.updated_at)}</dd></div>
        </dl>
      </section>

      <form className="account-management-form" onSubmit={submit}>
        <section className="account-management-block" aria-labelledby="personal-information-title">
          <h3 id="personal-information-title">Personal Information</h3>
          <div className="form-grid">
            <label><span>Full name</span><input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
            <label><span>Registered email</span><input type="email" value={profile.email || ""} readOnly /></label>
            <label><span>Phone number</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
            <label><span>Date of birth</span><input type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} /></label>
            <label><span>Education level</span><input value={form.education_level} onChange={(event) => setForm({ ...form, education_level: event.target.value })} /></label>
            <label><span>Address</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
          </div>
        </section>

        <section className="account-management-block" aria-labelledby="academic-information-title">
          <h3 id="academic-information-title">{account.role === "tutor" ? "Tutor Information" : "Academic Information"}</h3>
          {account.role === "tutor" ? (
            <>
              <div className="form-grid">
                <label><span>Title</span><select value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}><option value="Mr">Mr</option><option value="Mrs">Mrs</option></select></label>
                <label><span>Specialisation</span><input value={form.specialisation} onChange={(event) => setForm({ ...form, specialisation: event.target.value })} /></label>
                <label><span>Qualification</span><input value={form.qualifications} onChange={(event) => setForm({ ...form, qualifications: event.target.value })} /></label>
                <label><span>Teaching availability</span><input value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })} /></label>
              </div>
              <label><span>Professional bio</span><textarea value={form.professional_bio} onChange={(event) => setForm({ ...form, professional_bio: event.target.value })} /></label>
              <label><span>Teaching experience</span><textarea value={form.teaching_experience} onChange={(event) => setForm({ ...form, teaching_experience: event.target.value })} /></label>
            </>
          ) : (
            <dl className="portal-mini-details account-academic-details">
              <div><dt>Programme preference</dt><dd>{account.preference?.programs?.title || "Not recorded"}</dd></div>
              <div><dt>Preferred track</dt><dd>{account.preference?.program_levels?.level_name || "Not recorded"}</dd></div>
              <div><dt>Enrolment type</dt><dd>{assignment ? "Official enrolment" : "Not enrolled"}</dd></div>
              <div><dt>Tutor assignment</dt><dd>{account.assignedTutor ? `${account.assignedTutor.title || ""} ${account.assignedTutor.full_name}`.trim() : "Not assigned"}</dd></div>
            </dl>
          )}
          <div className="form-grid account-assignment-fields">
            <label><span>Official programme</span><select value={form.program_id} onChange={(event) => setForm({ ...form, program_id: event.target.value, track_id: "" })}><option value="">Choose programme</option>{programs.map((program) => <option value={program.id} key={program.id}>{program.title}</option>)}</select></label>
            <label><span>Track</span><select value={form.track_id} onChange={(event) => setForm({ ...form, track_id: event.target.value })}><option value="">Choose track</option>{tracks.map((track) => <option value={track.id} key={track.id}>{track.level_name}</option>)}</select></label>
          </div>
        </section>

        <section className="account-management-block" aria-labelledby="account-control-title">
          <h3 id="account-control-title">Account Control</h3>
          <div className="form-grid">
            <label><span>Account status</span><select value={form.account_status} onChange={(event) => setForm({ ...form, account_status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option>{form.account_status === "suspended" ? <option value="suspended" disabled>Suspended</option> : null}</select></label>
            <label><span>Status reason</span><input value={form.status_reason} onChange={(event) => setForm({ ...form, status_reason: event.target.value })} placeholder="Required when changing account status" /></label>
          </div>
          <button className="button button-secondary" type="button" onClick={sendReset}><KeyRound size={18} aria-hidden="true" />Send Password Reset</button>
        </section>

        {status.message ? <div className={`form-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</div> : null}
        <div className="account-management-actions">
          <button className="button button-secondary" type="button" disabled={saving} onClick={cancel}>Cancel Changes</button>
          <button className="button button-primary" type="submit" disabled={saving || !dirty}>{saving ? "Saving Changes" : "Save Changes"}</button>
        </div>
      </form>

      <section className="account-management-block" aria-labelledby="account-activity-title">
        <h3 id="account-activity-title">Activity</h3>
        <div className="account-activity-list">
          {(account.activity || []).map((item) => <div key={item.id}><strong>{readableAction(item.action)}</strong><small>{formatDateTime(item.created_at)}</small></div>)}
          {!(account.activity || []).length ? <p className="muted-line">No recent Admin modifications are recorded for this account.</p> : null}
        </div>
        <div className="account-support-history">
          <h4>Support history</h4>
          {(account.supportHistory || []).map((ticket) => <div key={ticket.id}><strong>{ticket.subject}</strong><span className="portal-tag">{ticket.status}</span><small>{formatDateTime(ticket.updated_at || ticket.created_at)}</small></div>)}
          {!(account.supportHistory || []).length ? <p className="muted-line">No support requests are linked to this account.</p> : null}
        </div>
      </section>

      <PortalDialog
        open={Boolean(confirmation)}
        title={confirmation === "save" ? "Confirm sensitive account changes" : "Discard unsaved changes?"}
        description={confirmation === "save" ? "Programme and account-status changes affect Portal access immediately after saving." : "Your unsaved account changes will be lost."}
        busy={saving}
        onClose={() => setConfirmation("")}
      >
        {({ requestClose }) => <div className="portal-dialog-form"><div className="portal-dialog-actions"><button className="button button-secondary" type="button" onClick={requestClose}>{confirmation === "save" ? "Review Changes" : "Keep Editing"}</button><button className={`button ${confirmation === "save" ? "button-primary" : "button-danger"}`} type="button" disabled={saving} onClick={() => confirmation === "save" ? void persistChanges() : navigate("/admin/accounts")}>{confirmation === "save" ? "Confirm and Save" : "Discard Changes"}</button></div></div>}
      </PortalDialog>
    </div>
  );
}
