import { AlertTriangle, BrainCircuit, CheckCircle2, DollarSign, Gauge, RefreshCw, Search, ShieldOff, Sparkles, Users, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { manageAdminAi } from "../../services/adminService";
import { formatCurrency, formatDateTime } from "../../utils/format";

function Metric({ Icon, label, value, detail }) {
  return <article className="ai-admin-metric"><Icon size={21} /><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Toggle({ label, checked, onChange }) {
  return <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function StudentManager({ plans, onChanged }) {
  const [query, setQuery] = useState("");
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const search = async (event) => {
    event.preventDefault(); setBusy(true); setStatus({ type: "", message: "" });
    try { const result = await manageAdminAi("find_student", { query }); setRecord(result); if (!result) setStatus({ type: "warning", message: "No Student matched that exact Portal ID or email." }); }
    catch (error) { setStatus({ type: "warning", message: error.message }); }
    finally { setBusy(false); }
  };
  const action = async (name, values, success) => {
    setBusy(true); setStatus({ type: "", message: "" });
    try { await manageAdminAi(name, values); setStatus({ type: "success", message: success }); const result = await manageAdminAi("find_student", { query }); setRecord(result); onChanged(); }
    catch (error) { setStatus({ type: "warning", message: error.message }); }
    finally { setBusy(false); }
  };
  return (
    <section className="admin-ai-section-block">
      <div className="ai-section-heading"><div><p className="eyebrow">Student controls</p><h2>Find and manage a Student</h2></div></div>
      <form className="admin-ai-search" onSubmit={search}><label><span className="sr-only">Portal ID or email</span><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Portal ID or exact email" /></label><button className="button button-primary" disabled={busy}>Find Student</button></form>
      {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
      {record ? (
        <div className="admin-ai-student">
          <div><h3>{record.profile.full_name || record.profile.email}</h3><p>{record.profile.portal_id} · {record.profile.email}</p><span className={`portal-tag ${record.profile.ai_access_status === "active" ? "success" : "danger"}`}>{record.profile.ai_access_status}</span></div>
          <div className="admin-ai-student-stats"><span>Plan<strong>{record.subscription?.ai_plans?.name || "None"}</strong></span><span>Available<strong>{Number(record.wallet?.total_available || 0).toLocaleString()}</strong></span><span>Reserved<strong>{Number(record.wallet?.reserved_credits || 0).toLocaleString()}</strong></span><span>Recent requests<strong>{record.requests.length}</strong></span></div>
          <div className="admin-ai-actions">
            <button className="button button-secondary" disabled={busy} onClick={() => action("set_access", { userId: record.profile.id, status: record.profile.ai_access_status === "active" ? "suspended" : "active" }, "Zentel AI access updated.")}>{record.profile.ai_access_status === "active" ? <ShieldOff size={16} /> : <CheckCircle2 size={16} />}{record.profile.ai_access_status === "active" ? "Suspend AI" : "Restore AI"}</button>
            <label>Assigned plan<select value={record.subscription?.plan_id || ""} disabled={!record.subscription || busy} onChange={(event) => action("change_plan", { userId: record.profile.id, planId: event.target.value }, "Zentel AI plan updated.")}><option value="">No active subscription</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
          </div>
          <form className="admin-ai-adjust" onSubmit={(event) => { event.preventDefault(); action("adjust_credits", { userId: record.profile.id, delta: Number(delta), reason }, "Credit balance updated."); setDelta(""); setReason(""); }}><label>Credit adjustment<input type="number" min="-10000" max="10000" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="Use a negative value to remove" /></label><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required audit reason" /></label><button className="button button-primary" disabled={busy || !delta || reason.trim().length < 4}>Apply Adjustment</button></form>
          <div className="table-scroll"><table><thead><tr><th>Date</th><th>Credit event</th><th>Change</th><th>Balance</th></tr></thead><tbody>{record.ledger.slice(0, 10).map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at)}</td><td>{item.description}</td><td>{item.credits > 0 ? "+" : ""}{item.credits}</td><td>{item.balance_after}</td></tr>)}</tbody></table></div>
        </div>
      ) : null}
    </section>
  );
}

function SettingsManager({ data, onChanged }) {
  const [values, setValues] = useState(data.settings || {});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => setValues(data.settings || {}), [data.settings]);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setStatus("");
    try { await manageAdminAi("update_settings", { values }); setStatus("Zentel AI settings saved."); onChanged(); }
    catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };
  const numeric = [
    ["credit_cost_unit_ngn", "Credit-cost unit (NGN)"], ["internal_exchange_rate", "Internal exchange rate"], ["risk_multiplier", "Risk multiplier"],
    ["maximum_output_tokens", "Maximum output tokens"], ["maximum_input_characters", "Maximum input characters"], ["maximum_files_per_request", "Files per request"],
    ["maximum_file_bytes", "Maximum file bytes"], ["maximum_web_searches_per_request", "Web searches per request"], ["per_student_daily_credits", "Student daily credits"],
    ["per_student_daily_cost_usd", "Student daily expense (USD)"], ["global_daily_cost_usd", "Global daily expense (USD)"], ["global_monthly_cost_usd", "Global monthly expense (USD)"],
    ["maximum_concurrent_requests", "Concurrent requests per Student"], ["requests_per_minute", "Requests per minute"], ["request_timeout_seconds", "Request timeout seconds"],
    ["trial_credits", "Trial credits"], ["trial_days", "Trial days"]
  ];
  return (
    <section className="admin-ai-section-block">
      <div className="ai-section-heading"><div><p className="eyebrow">Protection and routing</p><h2>AI configuration</h2></div></div>
      <form className="admin-ai-settings" onSubmit={submit}>
        <div className="admin-ai-toggles"><Toggle label="Emergency disable" checked={values.emergency_disabled} onChange={(value) => set("emergency_disabled", value)} /><Toggle label="Web research enabled" checked={values.web_search_enabled} onChange={(value) => set("web_search_enabled", value)} /><Toggle label="File uploads enabled" checked={values.file_uploads_enabled} onChange={(value) => set("file_uploads_enabled", value)} /><Toggle label="Trial enabled" checked={values.trial_enabled} onChange={(value) => set("trial_enabled", value)} /></div>
        <div className="admin-ai-field-grid">{numeric.map(([key, label]) => <label key={key}>{label}<input type="number" step="any" value={values[key] ?? ""} onChange={(event) => set(key, Number(event.target.value))} /></label>)}</div>
        <fieldset><legend>Internal model routing</legend>{["standard", "advanced", "expert"].map((route) => <label key={route}>{route}<input value={values.model_mappings?.[route] || ""} onChange={(event) => set("model_mappings", { ...values.model_mappings, [route]: event.target.value })} /></label>)}</fieldset>
        {status ? <div className="form-status info">{status}</div> : null}<button className="button button-primary" disabled={busy}>Save AI Configuration</button>
      </form>
    </section>
  );
}

function CatalogForm({ type, item, onChanged }) {
  const [values, setValues] = useState(item);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      if (type === "plan") await manageAdminAi("update_plan", { planId: item.id, values });
      else await manageAdminAi("update_topup", { productId: item.id, values });
      setStatus("Saved."); onChanged();
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };
  return (
    <form className="admin-ai-catalog-form" onSubmit={submit}>
      <div><h3>{item.name}</h3><Toggle label="Available" checked={values.active} onChange={(value) => set("active", value)} /></div>
      <label>Name<input value={values.name || ""} onChange={(event) => set("name", event.target.value)} /></label>
      {type === "plan" ? <><label>Badge<input value={values.badge || ""} onChange={(event) => set("badge", event.target.value)} /></label><label>Description<textarea rows="3" value={values.description || ""} onChange={(event) => set("description", event.target.value)} /></label><label>Monthly price (kobo)<input type="number" min="10000" value={values.monthly_price_kobo || ""} onChange={(event) => set("monthly_price_kobo", Number(event.target.value))} /></label><label>Monthly credits<input type="number" min="1" value={values.monthly_credits || ""} onChange={(event) => set("monthly_credits", Number(event.target.value))} /></label><label>Request credit limit<input type="number" min="1" value={values.maximum_request_credits || ""} onChange={(event) => set("maximum_request_credits", Number(event.target.value))} /></label></> : <><label>Credits<input type="number" min="1" value={values.credits || ""} onChange={(event) => set("credits", Number(event.target.value))} /></label><label>Price (kobo)<input type="number" min="10000" value={values.price_kobo || ""} onChange={(event) => set("price_kobo", Number(event.target.value))} /></label><label>Validity days<input type="number" min="1" max="365" value={values.validity_days || ""} onChange={(event) => set("validity_days", Number(event.target.value))} /></label></>}
      {status ? <div className="form-status info">{status}</div> : null}<button className="button button-secondary" disabled={busy}>Save</button>
    </form>
  );
}

function CatalogManager({ data, onChanged }) {
  return (
    <section className="admin-ai-section-block">
      <div className="ai-section-heading"><div><p className="eyebrow">Commercial settings</p><h2>Plans and credit packs</h2></div></div>
      <h3>Subscription plans</h3><div className="admin-ai-catalog-grid">{(data.plans || []).map((item) => <CatalogForm key={item.id} type="plan" item={item} onChanged={onChanged} />)}</div>
      <h3>Top-up products</h3><div className="admin-ai-catalog-grid">{(data.topups || []).map((item) => <CatalogForm key={item.id} type="topup" item={item} onChanged={onChanged} />)}</div>
    </section>
  );
}

export default function AdminAiSection() {
  const query = useAsyncData(() => manageAdminAi("dashboard"), [], { timeoutMs: 30000, errorMessage: "Zentel AI Admin data could not be loaded." });
  if (query.loading) return <div className="portal-page"><div className="route-loader">Loading Zentel AI management</div></div>;
  if (query.error) return <div className="portal-page"><div className="notice-card portal-state-card"><h2>Zentel AI management could not be loaded</h2><p>{query.error}</p><button className="button button-primary" onClick={query.refetch}>Try Again</button></div></div>;
  const data = query.data;
  const metrics = data.metrics || {};
  const exchange = Number(data.settings?.internal_exchange_rate || 0);
  const revenueNaira = (Number(metrics.subscriptionRevenueKobo || 0) + Number(metrics.topupRevenueKobo || 0)) / 100;
  const contribution = revenueNaira - Number(metrics.providerCostUsd || 0) * exchange;
  return (
    <div className="portal-page admin-ai-page">
      <div className="portal-page-heading"><div><p className="eyebrow">Admin</p><h2>Zentel AI</h2><p>Manage access, plans, credits, routing, budgets and live usage.</p></div><button className="button button-secondary" onClick={query.refetch}><RefreshCw size={16} />Refresh</button></div>
      {data.settings?.emergency_disabled ? <div className="form-status warning"><AlertTriangle size={17} />All Zentel AI execution is currently disabled.</div> : null}
      <div className="admin-ai-metrics">
        <Metric Icon={Users} label="Active subscriptions" value={metrics.activeSubscriptions || 0} detail={`${metrics.starterSubscriptions || 0} Starter · ${metrics.plusSubscriptions || 0} Plus · ${metrics.proSubscriptions || 0} Pro`} />
        <Metric Icon={DollarSign} label="Subscription revenue" value={formatCurrency(Number(metrics.subscriptionRevenueKobo || 0) / 100)} detail={`Top-ups ${formatCurrency(Number(metrics.topupRevenueKobo || 0) / 100)}`} />
        <Metric Icon={Sparkles} label="Estimated AI expense" value={`$${Number(metrics.providerCostUsd || 0).toFixed(2)}`} detail={`Gross contribution ${formatCurrency(contribution)}`} />
        <Metric Icon={Gauge} label="Failed requests" value={metrics.failedRequests || 0} detail={`${metrics.webResearchRequests || 0} web-research requests`} />
        <Metric Icon={WalletCards} label="Average credits used" value={Number(metrics.averageCreditsUsed || 0).toFixed(1)} detail={`${metrics.upcomingRenewals || 0} renewals in 30 days`} />
        <Metric Icon={BrainCircuit} label="Route usage" value={Object.values(metrics.routeUsage || {}).reduce((total, value) => total + value, 0)} detail={Object.entries(metrics.routeUsage || {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "No requests yet"} />
      </div>
      <StudentManager plans={data.plans || []} onChanged={query.refetch} />
      <SettingsManager data={data} onChanged={query.refetch} />
      <CatalogManager data={data} onChanged={query.refetch} />
      <section className="admin-ai-section-block"><div className="ai-section-heading"><div><p className="eyebrow">Operations</p><h2>Recent AI requests</h2></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Status</th><th>Activity</th><th>Route</th><th>Credits</th><th>Expense</th></tr></thead><tbody>{(data.recentRequests || []).slice(0, 50).map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at)}</td><td>{item.status}</td><td>{item.request_type}</td><td>{item.model_route}</td><td>{item.credits_charged}</td><td>${Number(item.provider_cost_usd || 0).toFixed(4)}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}
