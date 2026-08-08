import {
  Archive,
  CheckCircle2,
  Clock3,
  FileText,
  Image as ImageIcon,
  MessageSquarePlus,
  Paperclip,
  Search,
  Send,
  Sparkles,
  Square,
  WalletCards,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AiMessage from "../components/ai/AiMessage";
import PortalBackButton from "../components/portal/PortalBackButton";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  archiveAiConversation,
  buyAiCredits,
  cancelAiSubscription,
  createAiConversation,
  createAiSubscription,
  executeAiRequest,
  getAiSnapshot,
  listAiConversations,
  listAiMessages,
  removeAiAttachment,
  renameAiConversation,
  uploadAiAttachment
} from "../services/aiService";
import { formatCurrency, formatDateTime } from "../utils/format";
import { verifyPaymentReference } from "../services/paymentService";
import { normalizePaymentReference } from "../utils/paymentCalculations";
import { usePageMeta } from "../utils/usePageMeta";

function formatNaira(kobo) {
  return formatCurrency(Number(kobo || 0) / 100);
}

function PlanCards({ snapshot, busy, onSelect }) {
  const currentPlanId = snapshot.subscription?.plan_id;
  return (
    <section className="ai-pricing" aria-labelledby="ai-plans-title">
      <div className="ai-section-heading">
        <div><p className="eyebrow">Choose your access</p><h2 id="ai-plans-title">Zentel AI plans</h2></div>
      </div>
      <div className="ai-plan-grid">
        {(snapshot.plans || []).map((plan) => (
          <article className={`ai-plan-card ${plan.badge === "Most Popular" ? "featured" : ""}`} key={plan.id}>
            <div><span className="portal-tag">{plan.badge}</span>{currentPlanId === plan.id ? <span className="portal-tag success"><CheckCircle2 size={14} />Current plan</span> : null}</div>
            <h3>{plan.name}</h3>
            <p className="ai-plan-price"><strong>{formatNaira(plan.monthly_price_kobo)}</strong><span>/month</span></p>
            <p>{Number(plan.monthly_credits).toLocaleString()} monthly credits</p>
            <p>{plan.description}</p>
            <ul>{(plan.features || []).map((feature) => <li key={feature}><CheckCircle2 size={16} />{feature}</li>)}</ul>
            <button className={plan.badge === "Most Popular" ? "button button-primary" : "button button-secondary"} type="button" disabled={busy || currentPlanId === plan.id} onClick={() => onSelect(plan.slug)}>{currentPlanId === plan.id ? "Current Plan" : currentPlanId ? "Change Plan" : "Choose Plan"}</button>
          </article>
        ))}
      </div>
      <p className="ai-final-payment">All Zentel AI subscription and credit purchases are final and non-refundable. Cancellation stops future renewal but does not refund the current billing period.</p>
    </section>
  );
}

export default function ZentelAI() {
  const { conversationId = "" } = useParams();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(conversationId);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [webResearch, setWebResearch] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("zentel-ai-web-research") === "true");
  const [streaming, setStreaming] = useState(false);
  const [streamMessage, setStreamMessage] = useState(null);
  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const snapshotQuery = useAsyncData(getAiSnapshot, [], { errorMessage: "Zentel AI plan information could not be loaded." });
  const conversationsQuery = useAsyncData(() => listAiConversations(), [], { errorMessage: "Conversation history could not be loaded." });
  const messagesQuery = useAsyncData(() => listAiMessages(selectedId), [selectedId], { enabled: Boolean(selectedId), errorMessage: "This conversation could not be loaded." });
  const snapshot = snapshotQuery.data || {};
  const conversations = conversationsQuery.data || [];
  const messages = useMemo(() => [...(messagesQuery.data || []), ...(pendingUserMessage ? [pendingUserMessage] : []), ...(streamMessage ? [streamMessage] : [])], [messagesQuery.data, pendingUserMessage, streamMessage]);
  const canAccess = Boolean(snapshot.access?.account_active && snapshot.access?.ai_access_status !== "suspended" && snapshot.access?.system_available);
  const hasCredits = Number(snapshot.wallet?.total_available || 0) > 0;

  usePageMeta({ path: "/portal/zentel-ai", title: "Zentel AI", description: "Your personal Zentel Insight learning assistant.", robots: "noindex,nofollow" });
  useEffect(() => {
    setSelectedId(conversationId);
    setStreamMessage(null);
  }, [conversationId]);
  useEffect(() => {
    document.body.classList.add("portal-dedicated-workspace");
    return () => document.body.classList.remove("portal-dedicated-workspace");
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const newConversation = async () => {
    const created = await createAiConversation();
    setSelectedId(created.id);
    navigate(`/portal/zentel-ai/chat/${created.id}`);
    conversationsQuery.refetch();
  };
  const attach = async (file) => {
    try {
      let conversationId = selectedId;
      if (!conversationId) { const created = await createAiConversation(); conversationId = created.id; setSelectedId(created.id); navigate(`/portal/zentel-ai/chat/${created.id}`); conversationsQuery.refetch(); }
      setUploading(true);
      const uploaded = await uploadAiAttachment(conversationId, file);
      setAttachments((current) => [...current, uploaded]);
      setStatus({ type: "", message: "" });
    } catch (error) { setStatus({ type: "warning", message: error.message }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const removeAttachment = async (attachment) => {
    await removeAiAttachment(attachment);
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
  };
  const send = async (override) => {
    const prompt = String(override ?? message).trim();
    if ((!prompt && !attachments.length) || streaming) return;
    if (!hasCredits) {
      setStatus({ type: "warning", message: "You have no Zentel AI credits. Choose a paid plan or buy credits to continue. Free trials are not available." });
      return;
    }
    let conversationId = selectedId;
    try {
      if (!conversationId) { const created = await createAiConversation(); conversationId = created.id; setSelectedId(created.id); navigate(`/portal/zentel-ai/chat/${created.id}`); }
      const controller = new AbortController(); abortRef.current = controller;
      setStreaming(true); setStatus({ type: "", message: "" }); setMessage("");
      setPendingUserMessage({ id: `pending-user-${Date.now()}`, role: "user", content: { text: prompt }, status: "completed" });
      setStreamMessage({ id: `stream-${Date.now()}`, role: "assistant", content: { text: "" }, status: "streaming" });
      await executeAiRequest({
        conversationId, message: prompt, attachmentIds: attachments.map((item) => item.id), webResearch, signal: controller.signal,
        onEvent: (event, payload) => {
          if (event === "delta") { setStatus({ type: "", message: "" }); setStreamMessage((current) => ({ ...current, content: { ...current.content, text: `${current.content.text}${payload.delta}` } })); }
          if (event === "status" && payload.state === "reviewing_sources") setStreamMessage((current) => current ? { ...current, content: { ...current.content, state: "reviewing_sources" } } : current);
          if (event === "done") setStreamMessage((current) => ({ ...current, status: "completed", content: { ...current.content, sources: payload.sources || [] } }));
        }
      });
      setAttachments([]); setWebResearch(false);
      await messagesQuery.refetch();
      setPendingUserMessage(null);
      setStreamMessage(null);
      snapshotQuery.refetch(); conversationsQuery.refetch();
    } catch (error) {
      if (error.name !== "AbortError") setStatus({ type: "warning", message: error.message });
      setStreamMessage((current) => current ? { ...current, status: "failed" } : null);
      messagesQuery.refetch(); snapshotQuery.refetch();
    } finally { setStreaming(false); abortRef.current = null; }
  };
  const lastStudentMessage = [...messages].reverse().find((item) => item.role === "user")?.content?.text;

  if (snapshotQuery.loading) return <div className="portal-page"><PortalBackButton fallback="/portal/zentel-ai" label="Back to Zentel AI" /><div className="portal-local-loading"><Clock3 className="spin-icon" size={18} /><span>Loading Zentel AI...</span></div></div>;
  if (snapshotQuery.error) return <div className="portal-page"><PortalBackButton fallback="/portal/zentel-ai" label="Back to Zentel AI" /><div className="form-status warning"><span>Zentel AI could not be loaded.</span><button className="text-link" onClick={snapshotQuery.refetch}>Try Again</button></div></div>;

  return (
    <div className="portal-page ai-page ai-chat-page">
      {canAccess ? (
        <section className="ai-workspace">
          <div className="ai-chat">
            <div className="ai-chat-topbar">
              <PortalBackButton fallback="/portal/zentel-ai" label="Back to Zentel AI" />
              <strong>{conversations.find((item) => item.id === selectedId)?.title || "New learning conversation"}</strong>
              <div className="ai-chat-actions"><Link to="/portal/zentel-ai/usage">{Number(snapshot.wallet?.total_available || 0).toLocaleString()} credits</Link><button className="icon-button" type="button" title="Start a new conversation" onClick={newConversation}><MessageSquarePlus size={17} /></button></div>
            </div>
            <div className="ai-message-list" aria-live="polite">
              {messagesQuery.loading ? <div className="portal-local-loading"><Clock3 className="spin-icon" size={18} /><span>Loading conversation...</span></div> : null}
              {messages.map((item, index) => <AiMessage key={item.id || index} message={item} onRegenerate={item.role === "assistant" && lastStudentMessage ? () => send(lastStudentMessage) : null} />)}
              <div ref={bottomRef} />
            </div>
            <div className="ai-composer-wrap">
              {!canAccess ? <div className="ai-inline-status">Zentel AI is not available for this account.</div> : null}
              {canAccess && !hasCredits ? <div className="ai-inline-status">No AI credits available <span aria-hidden="true">&middot;</span> <Link to="/portal/zentel-ai/plans">View plans</Link></div> : null}
              {status.message ? <div className={`ai-inline-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</div> : null}
              {attachments.length || uploading ? <div className="ai-attachments">{uploading ? <span><Clock3 size={15} />Uploading file</span> : null}{attachments.map((item) => <span key={item.id}>{item.mime_type.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}{item.file_name}<button type="button" title="Remove attachment" onClick={() => removeAttachment(item)}><X size={14} /></button></span>)}</div> : null}
              <div className="ai-composer">
                <input ref={fileRef} hidden type="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp" onChange={(event) => event.target.files?.[0] && attach(event.target.files[0])} />
                <button type="button" title="Attach a document or image" disabled={!hasCredits || streaming || uploading} onClick={() => fileRef.current?.click()}><Paperclip size={19} /><span className="sr-only">Attach a document or image</span></button>
                <textarea value={message} disabled={!hasCredits} maxLength={30000} rows={1} placeholder="Ask Zentel AI..." onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
                {streaming ? <button className="ai-send" type="button" title="Stop generation" onClick={() => abortRef.current?.abort()}><Square size={18} /><span className="sr-only">Stop generation</span></button> : <button className="ai-send" type="button" title="Send message" disabled={!hasCredits || (!message.trim() && !attachments.length)} onClick={() => send()}><Send size={18} /><span className="sr-only">Send message</span></button>}
              </div>
            </div>
          </div>
        </section>
      ) : <div className="ai-inline-status warning">Zentel AI is not available for this account.</div>}
    </div>
  );
}

export function ZentelAIUsage() {
  const [searchParams] = useSearchParams();
  const paymentReference = normalizePaymentReference(searchParams.get("reference"), searchParams.get("trxref"));
  const query = useAsyncData(getAiSnapshot, [], { errorMessage: "Zentel AI usage could not be loaded." });
  const paymentVerification = useAsyncData(
    () => verifyPaymentReference(paymentReference),
    [paymentReference],
    { enabled: Boolean(paymentReference), timeoutMs: 30000, errorMessage: "Payment confirmation is still pending. Keep your reference and check again shortly." }
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  usePageMeta({ path: "/portal/zentel-ai/usage", title: "Zentel AI Usage", description: "Review your Zentel AI plan and credit activity.", robots: "noindex,nofollow" });
  useEffect(() => {
    if (!paymentVerification.data?.verified) return undefined;
    const timeout = window.setTimeout(query.refetch, 1500);
    return () => window.clearTimeout(timeout);
  }, [paymentVerification.data?.verified, query.refetch]);
  if (query.loading) return <div className="portal-page"><div className="route-loader">Loading usage</div></div>;
  if (query.error) return <div className="portal-page"><div className="notice-card"><h2>Usage could not be loaded</h2><p>{query.error}</p><button className="button button-primary" onClick={query.refetch}>Try Again</button></div></div>;
  const snapshot = query.data || {};
  const wallet = snapshot.wallet || {};
  const subscription = snapshot.subscription;
  const allocation = Number(subscription?.monthly_credits || 0);
  const used = Math.max(0, allocation - Number(wallet.monthly_credits || 0));
  const purchase = async (slug) => { setBusy(true); try { const result = await buyAiCredits(slug); window.location.assign(result.authorizationUrl); } catch (error) { setStatus(error.message); } finally { setBusy(false); } };
  const cancel = async () => { setBusy(true); try { const result = await cancelAiSubscription(); setStatus(`Renewal cancelled. Access continues until ${formatDateTime(result.accessEndsAt)}.`); query.refetch(); } catch (error) { setStatus(error.message); } finally { setBusy(false); } };
  return (
    <div className="portal-page ai-usage-page">
      <div className="portal-page-heading"><div><p className="eyebrow">Zentel AI</p><h2>Plan and usage</h2><p>Review your available credits, renewal and recent activity.</p></div><Link className="button button-primary" to="/portal/zentel-ai">Open Zentel AI</Link></div>
      {status ? <div className="form-status info" role="status">{status}</div> : null}
      {paymentReference ? <div className={`form-status ${paymentVerification.data?.verified ? "success" : "warning"}`} role="status">{paymentVerification.loading ? "Confirming your purchase securely..." : paymentVerification.data?.verified ? "Payment verified. Your plan or credits will appear after the signed payment notification is processed." : paymentVerification.error || paymentVerification.data?.message || "Payment confirmation is pending."}{!paymentVerification.loading && !paymentVerification.data?.verified ? <button className="button button-secondary" onClick={paymentVerification.refetch}>Check Again</button> : null}</div> : null}
      <div className="ai-usage-grid">
        <article><WalletCards size={22} /><span>Available credits</span><strong>{Number(wallet.total_available || 0).toLocaleString()}</strong></article>
        <article><Sparkles size={22} /><span>Monthly remaining</span><strong>{Number(wallet.monthly_credits || 0).toLocaleString()}</strong></article>
        <article><CheckCircle2 size={22} /><span>Promotional credits</span><strong>{Number(wallet.promotional_credits || 0).toLocaleString()}</strong></article>
        <article><Clock3 size={22} /><span>Top-up credits</span><strong>{Number(wallet.topup_credits || 0).toLocaleString()}</strong></article>
      </div>
      <section className="notice-card ai-usage-summary"><div><h3>{subscription?.plan_name || "No monthly plan"}</h3><p>{allocation ? `${used.toLocaleString()} of ${allocation.toLocaleString()} monthly credits used` : "Choose a plan for a monthly credit allocation."}</p></div><div className="ai-progress" role="progressbar" aria-valuemin="0" aria-valuemax={allocation || 1} aria-valuenow={used}><span style={{ width: `${allocation ? Math.min(100, (used / allocation) * 100) : 0}%` }} /></div><p>Renewal: {subscription?.next_payment_date ? formatDateTime(subscription.next_payment_date) : "Not scheduled"}</p>{subscription && !subscription.cancel_at_period_end ? <button className="button button-secondary" type="button" disabled={busy} onClick={cancel}>Cancel future renewal</button> : null}</section>
      {Number(wallet.total_available || 0) < 20 ? <div className="form-status warning">Your credit balance is low. Add credits to avoid an interruption.</div> : null}
      <section className="ai-topups" id="credits"><div className="ai-section-heading"><div><p className="eyebrow">Top up</p><h2>Buy Zentel AI credits</h2></div></div><div>{(snapshot.topups || []).map((item) => <article key={item.id}><h3>{item.name}</h3><strong>{formatNaira(item.price_kobo)}</strong><p>{item.validity_days} days validity</p><button className="button button-primary" disabled={busy} onClick={() => purchase(item.slug)}>Buy Credits</button></article>)}</div><p className="ai-final-payment">All Zentel AI subscription and credit purchases are final and non-refundable.</p></section>
      <section className="ai-ledger"><div className="ai-section-heading"><div><p className="eyebrow">Recent activity</p><h2>Credit history</h2></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Activity</th><th>Source</th><th>Credits</th><th>Balance</th></tr></thead><tbody>{(snapshot.ledger || []).map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at)}</td><td>{item.description}</td><td>{item.credit_source}</td><td className={item.credits >= 0 ? "positive" : "negative"}>{item.credits > 0 ? "+" : ""}{item.credits}</td><td>{item.balance_after}</td></tr>)}</tbody></table></div>{!(snapshot.ledger || []).length ? <p>No credit activity yet.</p> : null}</section>
    </div>
  );
}

export function ZentelAIHistory() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const query = useAsyncData(() => listAiConversations({ search }), [search], { errorMessage: "Conversation history could not be loaded." });
  usePageMeta({ path: "/portal/zentel-ai/history", title: "Zentel AI History", description: "Search and manage your Zentel AI conversations.", robots: "noindex,nofollow" });
  const rename = async (item) => {
    const title = window.prompt("Conversation name", item.title);
    if (!title || title === item.title) return;
    try { await renameAiConversation(item.id, title); query.refetch(); }
    catch (error) { setStatus(error.message); }
  };
  const archive = async (id) => {
    try { await archiveAiConversation(id); query.refetch(); }
    catch (error) { setStatus(error.message); }
  };
  return (
    <div className="portal-page ai-library-page">
      <div className="portal-page-heading"><div><p className="eyebrow">Zentel AI</p><h2>Conversation history</h2><p>Open, rename or archive your learning conversations.</p></div><Link className="button button-primary" to="/portal/zentel-ai/new"><MessageSquarePlus size={17} />New conversation</Link></div>
      <label className="ai-search ai-library-search"><Search size={16} /><span className="sr-only">Search conversations</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by conversation name" /></label>
      {status ? <div className="form-status warning" role="status">{status}</div> : null}
      {query.loading ? <div className="route-loader">Loading conversations</div> : null}
      {query.error ? <div className="notice-card"><h3>History could not be loaded</h3><p>{query.error}</p><button className="button button-primary" onClick={query.refetch}>Try Again</button></div> : null}
      {!query.loading && !query.error ? <div className="ai-library-list">{(query.data || []).map((item) => <article key={item.id}><button className="ai-library-open" type="button" onClick={() => navigate(`/portal/zentel-ai/chat/${item.id}`)}><MessageSquarePlus size={18} /><span><strong>{item.title}</strong><small>{formatDateTime(item.last_message_at)}</small></span></button><button className="icon-button" type="button" title="Rename conversation" onClick={() => rename(item)}><FileText size={17} /></button><button className="icon-button" type="button" title="Archive conversation" onClick={() => archive(item.id)}><Archive size={17} /></button></article>)}</div> : null}
      {!query.loading && !query.error && !(query.data || []).length ? <div className="notice-card"><h3>No conversations found</h3><p>Start a new conversation and type what you want Zentel AI to help with.</p></div> : null}
    </div>
  );
}

export function ZentelAIPlans() {
  const query = useAsyncData(getAiSnapshot, [], { errorMessage: "Zentel AI plans could not be loaded." });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  usePageMeta({ path: "/portal/zentel-ai/plans", title: "Zentel AI Plans", description: "Choose a paid Zentel AI plan.", robots: "noindex,nofollow" });
  const selectPlan = async (slug) => {
    setBusy(true); setStatus("");
    try { const result = await createAiSubscription(slug); window.location.assign(result.authorizationUrl); }
    catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };
  if (query.loading) return <div className="portal-page"><div className="route-loader">Loading plans</div></div>;
  if (query.error) return <div className="portal-page"><div className="notice-card"><h2>Plans could not be loaded</h2><p>{query.error}</p><button className="button button-primary" onClick={query.refetch}>Try Again</button></div></div>;
  return <div className="portal-page ai-plans-page"><div className="portal-page-heading"><div><p className="eyebrow">Zentel AI</p><h2>Plans</h2><p>Choose the monthly access that fits your learning workload.</p></div><Link className="button button-secondary" to="/portal/zentel-ai">Open Zentel AI</Link></div>{status ? <div className="form-status warning" role="status">{status}</div> : null}<PlanCards snapshot={query.data || {}} busy={busy} onSelect={selectPlan} /></div>;
}

export function ZentelAIBilling() {
  const query = useAsyncData(getAiSnapshot, [], { errorMessage: "Zentel AI billing status could not be loaded." });
  usePageMeta({ path: "/portal/zentel-ai/billing", title: "Zentel AI Billing", description: "Review active Zentel AI access.", robots: "noindex,nofollow" });
  if (query.loading) return <div className="portal-page"><div className="route-loader">Loading billing status</div></div>;
  if (query.error) return <div className="portal-page"><div className="notice-card"><h2>Billing status could not be loaded</h2><p>{query.error}</p><button className="button button-primary" onClick={query.refetch}>Try Again</button></div></div>;
  const subscription = query.data?.subscription;
  return <div className="portal-page ai-billing-page"><div className="portal-page-heading"><div><p className="eyebrow">Zentel AI</p><h2>Billing</h2><p>Your current Zentel AI access status.</p></div><Link className="button button-primary" to="/portal/zentel-ai/plans">Manage Plan</Link></div><section className="notice-card ai-billing-summary"><span className="portal-tag success">Active payment</span><h3>{subscription?.plan_name || "Credit access"}</h3><p>{subscription?.next_payment_date ? `Next renewal: ${formatDateTime(subscription.next_payment_date)}` : "No automatic renewal is scheduled."}</p><p>{Number(query.data?.wallet?.total_available || 0).toLocaleString()} credits available</p></section><p className="ai-final-payment">All payments made to Zentel Insight are final and non-refundable.</p></div>;
}

export function ZentelAISettings() {
  const [webResearch, setWebResearch] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("zentel-ai-web-research") === "true");
  const [status, setStatus] = useState("");
  usePageMeta({ path: "/portal/zentel-ai/settings", title: "Zentel AI Settings", description: "Set your Zentel AI workspace preferences.", robots: "noindex,nofollow" });
  const save = (event) => {
    event.preventDefault();
    window.localStorage.setItem("zentel-ai-web-research", String(webResearch));
    setStatus("Workspace preferences saved.");
  };
  return <div className="portal-page ai-settings-page"><div className="portal-page-heading"><div><p className="eyebrow">Zentel AI</p><h2>Settings</h2><p>Control how new conversations begin on this device.</p></div><Link className="button button-primary" to="/portal/zentel-ai">Open Zentel AI</Link></div><form className="notice-card ai-settings-form" onSubmit={save}><label><span><strong>Web research by default</strong><small>Enable current-source research when a new Zentel AI workspace opens.</small></span><input type="checkbox" checked={webResearch} onChange={(event) => setWebResearch(event.target.checked)} /></label>{status ? <div className="form-status success" role="status">{status}</div> : null}<button className="button button-primary" type="submit">Save Settings</button></form></div>;
}
