import { Check, Eye, LoaderCircle, ShieldX, X } from "lucide-react";
import { useMemo, useState } from "react";
import { showToast } from "../../components/GlobalToastHost";
import PortalBackButton from "../../components/portal/PortalBackButton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getAdminLoanSnapshot, manageLoanApplication, reviewLoanApplication } from "../../services/loanService";
import { formatCurrency, formatDateTime } from "../../utils/format";

const titles = {
  applications: "Loan Applications",
  pending: "Pending Review",
  approved: "Approved and Active Loans",
  overdue: "Overdue Loans",
  repayments: "Repayments"
};

export default function AdminLoanManagement({ view = "applications" }) {
  const query = useAsyncData(getAdminLoanSnapshot, [], { errorMessage: "Loan records could not be loaded." });
  const [selected, setSelected] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const applications = useMemo(() => {
    const records = query.data?.applications || [];
    if (view === "pending") return records.filter((item) => ["submitted", "pending_review"].includes(item.status));
    if (view === "approved") return records.filter((item) => ["approved", "active"].includes(item.status));
    if (view === "overdue") return records.filter((item) => item.status === "overdue");
    return records;
  }, [query.data?.applications, view]);

  const openReview = async (application) => {
    setBusy(true); setError(""); setSelected(application);
    try { const result = await reviewLoanApplication(application.id); setReview(result); }
    catch (reviewError) { setError(reviewError.message); setSelected(null); }
    finally { setBusy(false); }
  };
  const decide = async (action) => {
    setBusy(true); setError("");
    try {
      await manageLoanApplication(action, { applicationId: selected.id, approvedAmount, dueDate, reason: declineReason });
      showToast(action === "approve" ? "Loan approved" : "Loan declined");
      setSelected(null); setReview(null); setApprovedAmount(""); setDueDate(""); setDeclineReason(""); query.refetch();
    } catch (actionError) { setError(actionError.message); }
    finally { setBusy(false); }
  };
  const updateState = async (action, applicationId, repaymentId) => {
    setBusy(true); setError("");
    try { const result = await manageLoanApplication(action, { applicationId, repaymentId }); showToast(result.message || "Loan status updated"); query.refetch(); }
    catch (actionError) { setError(actionError.message); }
    finally { setBusy(false); }
  };

  return <div className="portal-page admin-loan-page">
    <header className="portal-title-row"><PortalBackButton fallback="/admin/finance/loans" label={`Back from ${titles[view] || titles.applications}`} /><h1>{titles[view] || titles.applications}</h1></header>
    {query.loading ? <div className="portal-local-loading"><LoaderCircle className="spin-icon" size={18} /><span>Loading loan records...</span></div> : null}
    {query.error || error ? <div className="form-status warning" role="alert">{query.error || error}</div> : null}
    {view === "repayments" ? <div className="loan-admin-list">{(query.data?.repayments || []).map((item) => <article key={item.id}><div><strong>{formatCurrency(item.amount)}</strong><small>{item.payment_reference} · {formatDateTime(item.created_at)}</small></div><span className="portal-tag">{item.status}</span>{item.status === "submitted" ? <div className="compact-actions"><button className="button button-primary" disabled={busy} onClick={() => updateState("confirm-repayment", item.application_id, item.id)}><Check size={14} />Confirm</button><button className="button button-secondary" disabled={busy} onClick={() => updateState("reject-repayment", item.application_id, item.id)}><X size={14} />Reject</button></div> : null}</article>)}</div> : <div className="loan-admin-list">{applications.map((item) => <article key={item.id}><div><strong>{item.application_number}</strong><small>{item.full_name} · {item.email}</small></div><div><span>{formatCurrency(item.requested_amount)}</span><small>{formatDateTime(item.submitted_at)}</small></div><span className="portal-tag">{item.status}</span><div className="compact-actions">{["submitted", "pending_review"].includes(item.status) ? <button className="button button-secondary" disabled={busy} onClick={() => openReview(item)}><Eye size={14} />Review</button> : null}{item.status === "approved" && item.disbursement_status === "bank_details_submitted" ? <button className="button button-primary" disabled={busy} onClick={() => updateState("disburse", item.id)}>Mark disbursed</button> : null}{item.status === "active" ? <button className="button button-secondary" disabled={busy} onClick={() => updateState("overdue", item.id)}>Mark overdue</button> : null}</div></article>)}</div>}
    {!query.loading && view !== "repayments" && !applications.length ? <p className="portal-empty-line">No matching loan records.</p> : null}
    {selected && review ? <div className="modal-backdrop"><section className="loan-review-modal" role="dialog" aria-modal="true" aria-labelledby="loan-review-title"><header><div><h2 id="loan-review-title">{selected.application_number}</h2><p>{selected.full_name}</p></div><button className="icon-button" onClick={() => { setSelected(null); setReview(null); }} aria-label="Close loan review"><X size={17} /></button></header><div className="loan-kyc-grid"><div><span>NIN</span><strong>{review.kyc.nin}</strong></div><div><span>BVN</span><strong>{review.kyc.bvn}</strong></div><a href={review.kyc.passportPhotoUrl} target="_blank" rel="noreferrer">Open passport photo</a><a href={review.kyc.identificationUrl} target="_blank" rel="noreferrer">Open identification</a></div><p className="loan-privacy-note">Final approval or decline permanently purges these values and files.</p><div className="loan-decision-grid"><label><span>Approved amount</span><input type="number" min="1" value={approvedAmount} onChange={(event) => setApprovedAmount(event.target.value)} /></label><label><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><button className="button button-primary" disabled={busy || !approvedAmount || !dueDate} onClick={() => decide("approve")}><Check size={14} />Approve</button></div><div className="loan-decision-grid"><label><span>Decline reason</span><textarea rows="2" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} /></label><button className="button button-secondary" disabled={busy || !declineReason.trim()} onClick={() => decide("decline")}><ShieldX size={14} />Decline</button></div>{error ? <div className="form-status warning">{error}</div> : null}</section></div> : null}
  </div>;
}
