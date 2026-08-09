import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Search } from "lucide-react";
import { Link } from "react-router-dom";
import PortalBackButton from "../../components/portal/PortalBackButton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getAdminPaymentDetails, searchAdminPayments } from "../../services/adminService";
import { formatCurrency, formatDateTime } from "../../utils/format";

const paymentStatuses = ["all", "initiated", "pending", "success", "failed", "declined", "cancelled", "abandoned", "verified", "unverified", "fulfilled"];

function amount(value) {
  return formatCurrency(Number(value || 0) / 100);
}

function PaymentStatus({ value }) {
  const normalized = String(value || "pending").toLowerCase();
  const tone = ["success", "verified", "fulfilled"].includes(normalized) ? "success" : ["failed", "declined", "rejected"].includes(normalized) ? "danger" : "warning";
  return <span className={`portal-tag ${tone}`}>{normalized.replace(/_/g, " ")}</span>;
}

export function AdminPaymentSearch() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useAsyncData(
    () => searchAdminPayments({ query: debouncedSearch, status, page, pageSize: 25 }),
    [debouncedSearch, status, page],
    { errorMessage: "Payment records could not be searched." }
  );
  const data = query.data || { records: [], total: 0, pageCount: 1 };

  return (
    <div className="portal-page admin-payment-search-page">
      <div className="portal-page-heading"><div><p className="eyebrow">Admin | Finance</p><h2>Payment Search</h2><p>Search authoritative transactions by reference, customer, contact, status or programme.</p></div></div>
      <div className="payment-search-controls">
        <label className="payment-search-input"><Search size={18} aria-hidden="true" /><span className="sr-only">Search payments</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, email, name, phone or programme" /></label>
        <label><span className="sr-only">Payment status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>{paymentStatuses.map((item) => <option value={item} key={item}>{item === "all" ? "All statuses" : item.replace(/_/g, " ")}</option>)}</select></label>
      </div>
      <section className="payment-search-results" aria-live="polite" aria-busy={query.loading}>
        {query.loading ? <div className="portal-local-loading"><CreditCard size={18} /><span>Searching payments...</span></div> : null}
        {query.error ? <div className="notice-card portal-state-card"><h3>Payment search is unavailable</h3><p>{query.error}</p><button className="button button-secondary" type="button" onClick={query.refetch}>Try Again</button></div> : null}
        {!query.loading && !query.error && data.records.length ? <div className="responsive-table-wrap"><table className="management-table payment-search-table"><thead><tr><th>Reference</th><th>Customer</th><th>Email</th><th>Amount</th><th>Product</th><th>Status</th><th>Date</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{data.records.map((payment) => <tr key={payment.id}><td data-label="Reference"><strong>{payment.reference}</strong>{payment.exact_reference_match ? <small>Exact match</small> : null}</td><td data-label="Customer">{payment.customer_name || "Not recorded"}</td><td data-label="Email">{payment.customer_email}</td><td data-label="Amount">{amount(payment.amount_kobo)}</td><td data-label="Product">{payment.programme_name || payment.product_name}{payment.selected_level ? <small>{payment.selected_level}</small> : null}</td><td data-label="Status"><PaymentStatus value={payment.payment_status} /></td><td data-label="Date">{formatDateTime(payment.paid_at || payment.created_at)}</td><td data-label="Open"><Link className="text-link" to={`/admin/payments/${payment.id}`}>View details</Link></td></tr>)}</tbody></table></div> : null}
        {!query.loading && !query.error && !data.records.length ? <div className="notice-card portal-state-card"><h3>No matching payment</h3><p>Check the reference or customer details and try again.</p></div> : null}
      </section>
      {!query.error && data.total > 0 ? <nav className="payment-search-pagination" aria-label="Payment result pages"><span>{data.total.toLocaleString()} result{data.total === 1 ? "" : "s"}</span><div><button className="portal-icon-button" type="button" title="Previous page" aria-label="Previous page" disabled={page <= 1 || query.loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={18} /></button><span>Page {page} of {data.pageCount}</span><button className="portal-icon-button" type="button" title="Next page" aria-label="Next page" disabled={page >= data.pageCount || query.loading} onClick={() => setPage((current) => current + 1)}><ChevronRight size={18} /></button></div></nav> : null}
    </div>
  );
}

function DetailRow({ label, value }) {
  return <div><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>;
}

export function AdminPaymentDetails({ paymentId }) {
  const query = useAsyncData(() => getAdminPaymentDetails(paymentId), [paymentId], { enabled: Boolean(paymentId), errorMessage: "Payment details could not be loaded." });
  if (query.loading) return <div className="portal-local-loading"><CreditCard size={18} /><span>Loading payment details...</span></div>;
  if (query.error) return <div className="portal-page"><PortalBackButton fallback="/admin/payments" label="Back to Payment Search" /><div className="notice-card portal-state-card"><h2>Payment details are unavailable</h2><p>{query.error}</p><button className="button button-secondary" onClick={query.refetch}>Try Again</button></div></div>;
  const payment = query.data || {};
  return <div className="portal-page admin-payment-detail-page"><div className="portal-page-heading"><div><div className="portal-title-row"><PortalBackButton fallback="/admin/payments" label="Back to Payment Search" /><h2>Payment Details</h2></div><p>{payment.reference}</p></div><PaymentStatus value={payment.status} /></div><dl className="portal-detail-rows"><DetailRow label="Reference" value={payment.reference} /><DetailRow label="Amount" value={`${amount(payment.amount_kobo)} ${payment.currency || "NGN"}`} /><DetailRow label="Customer" value={payment.customer_name} /><DetailRow label="Email" value={payment.customer_email} /><DetailRow label="Phone" value={payment.customer_phone} /><DetailRow label="Product" value={payment.programme_name || payment.product_name} /><DetailRow label="Track" value={payment.track_name} /><DetailRow label="Verification" value={payment.verification_status} /><DetailRow label="Fulfilment" value={payment.fulfilment_status} /><DetailRow label="Payment channel" value={payment.payment_channel} /><DetailRow label="Provider transaction" value={payment.provider_transaction_id} /><DetailRow label="Created" value={formatDateTime(payment.created_at)} /><DetailRow label="Paid" value={payment.paid_at ? formatDateTime(payment.paid_at) : "Not paid"} /><DetailRow label="Verified" value={payment.verified_at ? formatDateTime(payment.verified_at) : "Not verified"} /></dl>{payment.account ? <section className="payment-detail-section"><h3>Related account</h3><dl className="portal-detail-rows"><DetailRow label="Name" value={payment.account.full_name} /><DetailRow label="Portal ID" value={payment.account.portal_id} /><DetailRow label="Email" value={payment.account.email} /><DetailRow label="Account status" value={payment.account.account_status} /></dl></section> : null}<section className="payment-detail-section"><h3>Transaction history</h3>{payment.transactions?.length ? <div className="responsive-table-wrap"><table className="management-table"><thead><tr><th>Status</th><th>Verification</th><th>Amount</th><th>Date</th></tr></thead><tbody>{payment.transactions.map((item) => <tr key={item.id}><td>{item.transaction_status}</td><td>{item.verification_status}</td><td>{amount(item.amount_kobo)}</td><td>{formatDateTime(item.paid_at || item.created_at)}</td></tr>)}</tbody></table></div> : <p>No transaction audit rows are linked.</p>}</section><section className="payment-detail-section"><h3>Fulfilment history</h3>{payment.fulfilments?.length ? <div className="responsive-table-wrap"><table className="management-table"><thead><tr><th>Type</th><th>Status</th><th>Attempts</th><th>Completed</th></tr></thead><tbody>{payment.fulfilments.map((item) => <tr key={item.id}><td>{item.fulfilment_type.replace(/_/g, " ")}</td><td>{item.status}</td><td>{item.attempt_count}</td><td>{item.fulfilled_at ? formatDateTime(item.fulfilled_at) : "Pending"}</td></tr>)}</tbody></table></div> : <p>No fulfilment audit rows are linked.</p>}</section></div>;
}
