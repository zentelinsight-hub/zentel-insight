import {
  Activity,
  Ban,
  CheckCircle2,
  Coins,
  CreditCard,
  DollarSign,
  Gauge,
  ListChecks,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  ShieldOff,
  Sparkles,
  Users,
  WalletCards
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import PortalBackButton from "../../components/portal/PortalBackButton";
import PortalNavigationPage from "../../components/portal/PortalNavigationPage";
import PortalSwitch from "../../components/portal/PortalSwitch";
import { useAsyncData } from "../../hooks/useAsyncData";
import { manageAdminAi } from "../../services/adminService";
import { formatCurrency, formatDateTime } from "../../utils/format";

const aiPages = [
  ["plans", "Plans", "Manage subscription plan availability and pricing.", CreditCard],
  ["subscriptions", "Subscriptions", "Find a Student and manage the assigned plan.", Users],
  ["credit-management", "Credit Management", "Adjust balances with an audited reason.", Coins],
  ["usage", "Usage & Costs", "Review usage, revenue and provider expense.", Gauge],
  ["requests", "Requests & Errors", "Inspect recent AI request outcomes.", ListChecks],
  ["model-configuration", "Model Configuration", "Configure internal model routing and limits.", Sparkles],
  ["access-restrictions", "Access Restrictions", "Suspend or restore individual Student access.", Ban],
  ["budgets", "Budgets", "Set daily and monthly expense controls.", DollarSign],
  ["billing-events", "Billing Events", "Review recent subscription and top-up payments.", ReceiptText],
  ["service-health", "Service Health", "Review failures and emergency service control.", Activity],
  ["settings", "Settings", "Manage research, uploads and request limits.", Settings2]
];

function PageHeading({ title, onRefresh }) {
  return (
    <div className="portal-page-heading">
      <div>
        <p className="eyebrow">Zentel AI</p>
        <div className="portal-title-row">
          <PortalBackButton fallback="/admin/zentel-ai" label={`Back from ${title}`} />
          <h2>{title}</h2>
        </div>
      </div>
      <button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCw size={16} />Refresh</button>
    </div>
  );
}

function Metric({ Icon, label, value, detail }) {
  return <article className="ai-admin-metric"><Icon size={21} /><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function StudentControl({ mode, plans, onChanged }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  async function loadStudent() {
    const result = await manageAdminAi("find_student", { query: searchQuery });
    setRecord(result);
    if (!result) setStatus({ type: "warning", message: "No Student matched that exact Portal ID or email." });
    return result;
  }

  async function search(event) {
    event.preventDefault();
    setBusy(true);
    setStatus({ type: "", message: "" });
    try { await loadStudent(); } catch (error) { setStatus({ type: "warning", message: error.message }); } finally { setBusy(false); }
  }

  async function action(name, values, message) {
    setBusy(true);
    setStatus({ type: "", message: "" });
    try {
      await manageAdminAi(name, values);
      setStatus({ type: "success", message });
      await loadStudent();
      onChanged();
    } catch (error) {
      setStatus({ type: "warning", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-ai-section-block ai-subscriptions-section">
      <form className="admin-ai-search" onSubmit={search}>
        <label><span className="sr-only">Portal ID or email</span><Search size={17} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Portal ID or exact email" required /></label>
        <button className="button button-primary" disabled={busy}>Find Student</button>
      </form>
      {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
      {record ? (
        <div className="admin-ai-student">
          <div><h3>{record.profile.full_name || record.profile.email}</h3><p>{record.profile.portal_id} · {record.profile.email}</p></div>
          {mode === "subscriptions" ? (
            <div className="admin-ai-actions">
              <span className="portal-tag">{record.subscription?.status || "No subscription"}</span>
              <label>Assigned plan<select value={record.subscription?.plan_id || ""} disabled={!record.subscription || busy} onChange={(event) => action("change_plan", { userId: record.profile.id, planId: event.target.value }, "Zentel AI plan updated.")}><option value="">No active subscription</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            </div>
          ) : null}
          {mode === "access" ? (
            <div className="admin-ai-actions">
              <span className={`portal-tag ${record.profile.ai_access_status === "active" ? "success" : "danger"}`}>{record.profile.ai_access_status}</span>
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => action("set_access", { userId: record.profile.id, status: record.profile.ai_access_status === "active" ? "suspended" : "active" }, "Zentel AI access updated.")}>{record.profile.ai_access_status === "active" ? <ShieldOff size={16} /> : <CheckCircle2 size={16} />}{record.profile.ai_access_status === "active" ? "Suspend AI" : "Restore AI"}</button>
            </div>
          ) : null}
          {mode === "credits" ? (
            <>
              <div className="admin-ai-student-stats"><span>Available<strong>{Number(record.wallet?.total_available || 0).toLocaleString()}</strong></span><span>Reserved<strong>{Number(record.wallet?.reserved_credits || 0).toLocaleString()}</strong></span></div>
              <form className="admin-ai-adjust" onSubmit={(event) => { event.preventDefault(); void action("adjust_credits", { userId: record.profile.id, delta: Number(delta), reason }, "Credit balance updated."); setDelta(""); setReason(""); }}><label>Credit adjustment<input type="number" min="-10000" max="10000" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="Negative removes credits" /></label><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required audit reason" /></label><button className="button button-primary" disabled={busy || !delta || reason.trim().length < 4}>Apply Adjustment</button></form>
              <div className="table-scroll"><table><thead><tr><th>Date</th><th>Credit event</th><th>Change</th><th>Balance</th></tr></thead><tbody>{record.ledger.slice(0, 20).map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at)}</td><td>{item.description}</td><td>{item.credits > 0 ? "+" : ""}{item.credits}</td><td>{item.balance_after}</td></tr>)}</tbody></table></div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CatalogForm({ type, item, onChanged }) {
  const [values, setValues] = useState(item);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      await manageAdminAi(type === "plan" ? "update_plan" : "update_topup", type === "plan" ? { planId: item.id, values } : { productId: item.id, values });
      setStatus("Saved.");
      onChanged();
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  return (
    <form className="admin-ai-catalog-form" onSubmit={submit}>
      <div><h3>{item.name}</h3><PortalSwitch label="Available" checked={values.active} onChange={(active) => set("active", active)} /></div>
      <label>Name<input value={values.name || ""} onChange={(event) => set("name", event.target.value)} /></label>
      {type === "plan" ? <><label>Badge<input value={values.badge || ""} onChange={(event) => set("badge", event.target.value)} /></label><label>Description<textarea rows="3" value={values.description || ""} onChange={(event) => set("description", event.target.value)} /></label><label>Monthly price (kobo)<input type="number" min="10000" value={values.monthly_price_kobo || ""} onChange={(event) => set("monthly_price_kobo", Number(event.target.value))} /></label><label>Monthly credits<input type="number" min="1" value={values.monthly_credits || ""} onChange={(event) => set("monthly_credits", Number(event.target.value))} /></label><label>Request credit limit<input type="number" min="1" value={values.maximum_request_credits || ""} onChange={(event) => set("maximum_request_credits", Number(event.target.value))} /></label></> : <><label>Credits<input type="number" min="1" value={values.credits || ""} onChange={(event) => set("credits", Number(event.target.value))} /></label><label>Price (kobo)<input type="number" min="10000" value={values.price_kobo || ""} onChange={(event) => set("price_kobo", Number(event.target.value))} /></label><label>Validity days<input type="number" min="1" max="365" value={values.validity_days || ""} onChange={(event) => set("validity_days", Number(event.target.value))} /></label></>}
      {status ? <div className="form-status info">{status}</div> : null}
      <button className="button button-secondary" disabled={busy}>Save</button>
    </form>
  );
}

function SettingsEditor({ data, mode, onChanged }) {
  const [values, setValues] = useState(data.settings || {});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => setValues(data.settings || {}), [data.settings]);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const fields = {
    model: [["maximum_output_tokens", "Maximum output tokens"], ["maximum_input_characters", "Maximum input characters"], ["maximum_concurrent_requests", "Concurrent requests per Student"], ["request_timeout_seconds", "Request timeout seconds"]],
    budgets: [["credit_cost_unit_ngn", "Credit-cost unit (NGN)"], ["internal_exchange_rate", "Internal exchange rate"], ["risk_multiplier", "Risk multiplier"], ["per_student_daily_credits", "Student daily credits"], ["per_student_daily_cost_usd", "Student daily expense (USD)"], ["global_daily_cost_usd", "Global daily expense (USD)"], ["global_monthly_cost_usd", "Global monthly expense (USD)"]],
    settings: [["maximum_files_per_request", "Files per request"], ["maximum_file_bytes", "Maximum file bytes"], ["maximum_web_searches_per_request", "Web searches per request"], ["requests_per_minute", "Requests per minute"]]
  }[mode] || [];
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try { await manageAdminAi("update_settings", { values }); setStatus("Zentel AI settings saved."); onChanged(); } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  return (
    <form className="admin-ai-settings" onSubmit={submit}>
      {mode === "health" ? <PortalSwitch label="Emergency disable" checked={values.emergency_disabled} onChange={(value) => set("emergency_disabled", value)} /> : null}
      {mode === "settings" ? <div className="admin-ai-toggles"><PortalSwitch label="Web research enabled" checked={values.web_search_enabled} onChange={(value) => set("web_search_enabled", value)} /><PortalSwitch label="File uploads enabled" checked={values.file_uploads_enabled} onChange={(value) => set("file_uploads_enabled", value)} /></div> : null}
      <div className="admin-ai-field-grid">{fields.map(([key, label]) => <label key={key}>{label}<input type="number" step="any" value={values[key] ?? ""} onChange={(event) => set(key, Number(event.target.value))} /></label>)}</div>
      {mode === "model" ? <fieldset><legend>Internal model routing</legend>{["standard", "advanced", "expert"].map((route) => <label key={route}>{route}<input value={values.model_mappings?.[route] || ""} onChange={(event) => set("model_mappings", { ...values.model_mappings, [route]: event.target.value })} /></label>)}</fieldset> : null}
      {status ? <div className="form-status info">{status}</div> : null}
      <button className="button button-primary" disabled={busy}>Save</button>
    </form>
  );
}

function RequestTable({ requests }) {
  return <div className="table-scroll"><table><thead><tr><th>Date</th><th>Status</th><th>Activity</th><th>Route</th><th>Credits</th><th>Expense</th><th>Error</th></tr></thead><tbody>{requests.map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at)}</td><td>{item.status}</td><td>{item.request_type}</td><td>{item.model_route}</td><td>{item.credits_charged}</td><td>${Number(item.provider_cost_usd || 0).toFixed(4)}</td><td>{item.error_code || "—"}</td></tr>)}</tbody></table></div>;
}

function BillingTable({ events }) {
  return <div className="table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Amount</th><th>Fulfilment</th></tr></thead><tbody>{events.length ? events.map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at)}</td><td>{String(item.product_type || "").replaceAll("_", " ")}</td><td>{item.status}</td><td>{formatCurrency(Number(item.paid_amount_kobo || item.amount_kobo || 0) / 100)}</td><td>{item.fulfilment_status}</td></tr>) : <tr><td colSpan="5">No AI billing events are available.</td></tr>}</tbody></table></div>;
}

export default function AdminAiSection() {
  const location = useLocation();
  const requestedView = location.pathname.split("/zentel-ai/")[1] || "overview";
  const view = aiPages.some(([slug]) => slug === requestedView) ? requestedView : "overview";
  const query = useAsyncData(() => manageAdminAi("dashboard"), [view], { timeoutMs: 30000, errorMessage: "Zentel AI Admin data could not be loaded." });

  if (view === "overview") {
    return <PortalNavigationPage eyebrow="Admin" title="Zentel AI" items={aiPages.map(([slug, label, description, Icon]) => ({ to: `/admin/zentel-ai/${slug}`, label, description, Icon }))} />;
  }
  if (query.loading) return <div className="portal-page"><div className="route-loader">Loading Zentel AI management</div></div>;
  if (query.error) return <div className="portal-page"><div className="notice-card portal-state-card"><h2>Zentel AI management could not be loaded</h2><p>{query.error}</p><button className="button button-primary" onClick={query.refetch}>Try Again</button></div></div>;

  const data = query.data || {};
  const metrics = data.metrics || {};
  const title = aiPages.find(([slug]) => slug === view)?.[1] || "Zentel AI";
  const exchange = Number(data.settings?.internal_exchange_rate || 0);
  const revenueNaira = (Number(metrics.subscriptionRevenueKobo || 0) + Number(metrics.topupRevenueKobo || 0)) / 100;
  const contribution = revenueNaira - Number(metrics.providerCostUsd || 0) * exchange;

  return (
    <div className={`portal-page admin-ai-page view-${view}`}>
      <PageHeading title={title} onRefresh={query.refetch} />
      {view === "plans" ? <div className="admin-ai-catalog-grid">{(data.plans || []).map((item) => <CatalogForm key={item.id} type="plan" item={item} onChanged={query.refetch} />)}</div> : null}
      {view === "subscriptions" ? <StudentControl mode="subscriptions" plans={data.plans || []} onChanged={query.refetch} /> : null}
      {view === "credit-management" ? <><div className="admin-ai-catalog-grid">{(data.topups || []).map((item) => <CatalogForm key={item.id} type="topup" item={item} onChanged={query.refetch} />)}</div><StudentControl mode="credits" plans={data.plans || []} onChanged={query.refetch} /></> : null}
      {view === "access-restrictions" ? <StudentControl mode="access" plans={data.plans || []} onChanged={query.refetch} /> : null}
      {view === "usage" ? <div className="admin-ai-metrics"><Metric Icon={Users} label="Active subscriptions" value={metrics.activeSubscriptions || 0} detail={`${metrics.upcomingRenewals || 0} renewals in 30 days`} /><Metric Icon={DollarSign} label="AI revenue" value={formatCurrency(revenueNaira)} detail={`Contribution ${formatCurrency(contribution)}`} /><Metric Icon={Sparkles} label="Provider expense" value={`$${Number(metrics.providerCostUsd || 0).toFixed(2)}`} detail={`${Number(metrics.averageCreditsUsed || 0).toFixed(1)} average credits`} /><Metric Icon={WalletCards} label="Route usage" value={Object.values(metrics.routeUsage || {}).reduce((total, value) => total + value, 0)} detail={Object.entries(metrics.routeUsage || {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "No requests"} /></div> : null}
      {view === "requests" ? <RequestTable requests={data.recentRequests || []} /> : null}
      {view === "model-configuration" ? <SettingsEditor data={data} mode="model" onChanged={query.refetch} /> : null}
      {view === "budgets" ? <SettingsEditor data={data} mode="budgets" onChanged={query.refetch} /> : null}
      {view === "settings" ? <SettingsEditor data={data} mode="settings" onChanged={query.refetch} /> : null}
      {view === "billing-events" ? <BillingTable events={data.billingEvents || []} /> : null}
      {view === "service-health" ? <><div className="admin-ai-metrics"><Metric Icon={Activity} label="Failed requests" value={metrics.failedRequests || 0} detail={`${metrics.releasedRequests || 0} released requests`} /><Metric Icon={Sparkles} label="Web research" value={metrics.webResearchRequests || 0} detail="Recent request window" /></div><SettingsEditor data={data} mode="health" onChanged={query.refetch} /></> : null}
    </div>
  );
}
