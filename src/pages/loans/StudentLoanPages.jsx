import { ArrowRight, Building2, CircleDollarSign, ClipboardCheck, FilePlus2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import PortalBackButton from "../../components/portal/PortalBackButton";
import PortalNavigationPage from "../../components/portal/PortalNavigationPage";
import { showToast } from "../../components/GlobalToastHost";
import { useAuth } from "../../context/authHooks";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getMyLoanSnapshot, saveLoanBankDetails, submitLoanApplication, submitLoanRepayment } from "../../services/loanService";
import { formatCurrency, formatDateTime } from "../../utils/format";

const statusLabels = {
  submitted: "Submitted",
  pending_review: "Pending review",
  approved: "Approved",
  declined: "Declined",
  active: "Active loan",
  overdue: "Overdue",
  repaid: "Repaid"
};

function PageTitle({ title }) {
  return <header className="portal-title-row"><PortalBackButton fallback="/portal/finance/loans" label={`Back from ${title}`} /><h1>{title}</h1></header>;
}

function LocalLoading() {
  return <div className="portal-local-loading" role="status"><LoaderCircle className="spin-icon" size={18} /><span>Loading loan information...</span></div>;
}

function LoanRows({ applications }) {
  if (!applications.length) return <p className="portal-empty-line">No loan application has been submitted.</p>;
  return <div className="loan-record-list">{applications.map((item) => <article key={item.id}><div><strong>{item.application_number}</strong><small>{formatDateTime(item.submitted_at)}</small></div><span className={`portal-tag ${item.status === "approved" || item.status === "active" || item.status === "repaid" ? "success" : item.status === "declined" || item.status === "overdue" ? "warning" : ""}`}>{statusLabels[item.status] || item.status}</span><div><span>Requested</span><strong>{formatCurrency(item.requested_amount)}</strong></div>{item.approved_amount ? <div><span>Approved</span><strong>{formatCurrency(item.approved_amount)}</strong></div> : null}{item.due_date ? <div><span>Due date</span><strong>{item.due_date}</strong></div> : null}{item.decline_reason ? <p>{item.decline_reason}</p> : null}{item.cooldown_until ? <small>Reapplication available after {formatDateTime(item.cooldown_until)}</small> : null}</article>)}</div>;
}

export function StudentLoansPage() {
  return <PortalNavigationPage eyebrow="Finance" title="Loans" description="Apply and manage one loan stage at a time." items={[
    { to: "/portal/finance/loans/apply", label: "Apply for Loan", description: "Submit personal details and protected KYC", Icon: FilePlus2 },
    { to: "/portal/finance/loans/status", label: "Application Status", description: "Track review and decision status", Icon: ClipboardCheck },
    { to: "/portal/finance/loans/approved", label: "Approved Loan", description: "Submit protected disbursement details", Icon: Building2 },
    { to: "/portal/finance/loans/repayment", label: "Repayment", description: "Submit and track repayments", Icon: CircleDollarSign }
  ]} />;
}

export function StudentLoanApplicationPage() {
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({ fullName: profile?.full_name || "", email: user?.email || "", phone: profile?.phone || "", dateOfBirth: "", nin: "", bvn: "", identificationType: "national_id", requestedAmount: "", purpose: "", supportingInformation: "", passportPhoto: null, identificationFile: null });
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await submitLoanApplication(values); showToast("Loan submitted"); event.currentTarget.reset(); }
    catch (submitError) { setError(submitError.message || "The loan application could not be submitted."); }
    finally { setBusy(false); }
  };
  return <div className="portal-page loan-page"><PageTitle title="Apply for Loan" /><form className="loan-form" onSubmit={submit}>
    <div className="loan-form-grid">
      <label><span>Full name</span><input required value={values.fullName} onChange={(event) => update("fullName", event.target.value)} /></label>
      <label><span>Email</span><input required type="email" value={values.email} onChange={(event) => update("email", event.target.value)} /></label>
      <label><span>Phone</span><input required value={values.phone} onChange={(event) => update("phone", event.target.value)} /></label>
      <label><span>Date of birth</span><input required type="date" value={values.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label>
      <label><span>NIN</span><input required inputMode="numeric" pattern="[0-9]{11}" maxLength="11" value={values.nin} onChange={(event) => update("nin", event.target.value.replace(/\D/g, ""))} /></label>
      <label><span>BVN</span><input required inputMode="numeric" pattern="[0-9]{11}" maxLength="11" value={values.bvn} onChange={(event) => update("bvn", event.target.value.replace(/\D/g, ""))} /></label>
      <label><span>Identification type</span><select value={values.identificationType} onChange={(event) => update("identificationType", event.target.value)}><option value="national_id">National ID</option><option value="drivers_licence">Driver&apos;s licence</option><option value="international_passport">International passport</option><option value="voters_card">Voter&apos;s card</option></select></label>
      <label><span>Requested amount</span><input required type="number" min="1" step="0.01" value={values.requestedAmount} onChange={(event) => update("requestedAmount", event.target.value)} /></label>
      <label><span>Passport photo</span><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => update("passportPhoto", event.target.files?.[0] || null)} /></label>
      <label><span>Identification file</span><input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => update("identificationFile", event.target.files?.[0] || null)} /></label>
    </div>
    <label><span>Loan purpose</span><textarea required rows="3" minLength="10" maxLength="1500" value={values.purpose} onChange={(event) => update("purpose", event.target.value)} /></label>
    <label><span>Supporting information</span><textarea rows="3" maxLength="3000" value={values.supportingInformation} onChange={(event) => update("supportingInformation", event.target.value)} /></label>
    <p className="loan-privacy-note">NIN, BVN and KYC files are encrypted or privately stored for review, then purged after the final decision.</p>
    {error ? <div className="form-status warning" role="alert">{error}</div> : null}
    <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Submitting" : "Submit Application"}<ArrowRight size={15} /></button>
  </form></div>;
}

export function StudentLoanStatusPage() {
  const query = useAsyncData(getMyLoanSnapshot, [], { errorMessage: "Loan status could not be loaded." });
  return <div className="portal-page loan-page"><PageTitle title="Application Status" />{query.loading ? <LocalLoading /> : null}{query.error ? <div className="form-status warning">{query.error}<button className="text-link" onClick={query.refetch}>Try Again</button></div> : null}{query.data ? <LoanRows applications={query.data.applications} /> : null}</div>;
}

export function StudentApprovedLoanPage() {
  const query = useAsyncData(getMyLoanSnapshot, [], { errorMessage: "Approved loan information could not be loaded." });
  const [values, setValues] = useState({ bankName: "", accountName: "", accountNumber: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const application = (query.data?.applications || []).find((item) => ["approved", "active", "overdue"].includes(item.status));
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await saveLoanBankDetails({ applicationId: application.id, ...values }); showToast("Bank details saved"); query.refetch(); } catch (saveError) { setError(saveError.message); } finally { setBusy(false); } };
  return <div className="portal-page loan-page"><PageTitle title="Approved Loan" />{query.loading ? <LocalLoading /> : null}{!query.loading && !application ? <p className="portal-empty-line">No approved loan is available.</p> : null}{application ? <><LoanRows applications={[application]} /><form className="loan-form compact" onSubmit={submit}><h2>Disbursement bank details</h2><label><span>Bank name</span><input required value={values.bankName} onChange={(event) => setValues((current) => ({ ...current, bankName: event.target.value }))} /></label><label><span>Account name</span><input required value={values.accountName} onChange={(event) => setValues((current) => ({ ...current, accountName: event.target.value }))} /></label><label><span>Account number</span><input required inputMode="numeric" pattern="[0-9]{10}" maxLength="10" value={values.accountNumber} onChange={(event) => setValues((current) => ({ ...current, accountNumber: event.target.value.replace(/\D/g, "") }))} /></label>{error ? <div className="form-status warning">{error}</div> : null}<button className="button button-primary" disabled={busy}>{busy ? "Saving" : "Save Bank Details"}</button></form></> : null}</div>;
}

export function StudentLoanRepaymentPage() {
  const query = useAsyncData(getMyLoanSnapshot, [], { errorMessage: "Loan repayment information could not be loaded." });
  const [values, setValues] = useState({ amount: "", reference: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const application = (query.data?.applications || []).find((item) => ["active", "overdue"].includes(item.status));
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await submitLoanRepayment({ applicationId: application.id, ...values }); showToast("Repayment submitted"); setValues({ amount: "", reference: "", note: "" }); query.refetch(); } catch (submitError) { setError(submitError.message); } finally { setBusy(false); } };
  return <div className="portal-page loan-page"><PageTitle title="Repayment" />{query.loading ? <LocalLoading /> : null}{!query.loading && !application ? <p className="portal-empty-line">No active loan requires repayment.</p> : null}{application ? <form className="loan-form compact" onSubmit={submit}><div><span>Loan</span><strong>{application.application_number}</strong></div><label><span>Amount paid</span><input required type="number" min="1" step="0.01" value={values.amount} onChange={(event) => setValues((current) => ({ ...current, amount: event.target.value }))} /></label><label><span>Payment reference</span><input required value={values.reference} onChange={(event) => setValues((current) => ({ ...current, reference: event.target.value }))} /></label><label><span>Note</span><textarea rows="2" value={values.note} onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))} /></label>{error ? <div className="form-status warning">{error}</div> : null}<button className="button button-primary" disabled={busy}>{busy ? "Submitting" : "Submit Repayment"}</button></form> : null}<div className="loan-repayment-list">{(query.data?.repayments || []).map((item) => <div key={item.id}><span>{formatCurrency(item.amount)} <small>{item.payment_reference}</small></span><strong>{item.status}</strong></div>)}</div></div>;
}
