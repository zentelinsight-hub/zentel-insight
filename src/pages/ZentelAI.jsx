import {
  Archive,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileText,
  Image as ImageIcon,
  Menu,
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
import { Link, useSearchParams } from "react-router-dom";
import AiMessage from "../components/ai/AiMessage";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  archiveAiConversation,
  buyAiCredits,
  cancelAiSubscription,
  claimAiTrial,
  createAiConversation,
  createAiSubscription,
  estimateAiCredits,
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

const suggestions = [
  "Explain a difficult topic",
  "Help me practise coding",
  "Create a study plan",
  "Generate a quiz",
  "Review an assignment idea",
  "Research a current topic",
  "Analyse a document",
  "Analyse a screenshot"
];

function formatNaira(kobo) {
  return formatCurrency(Number(kobo || 0) / 100);
}

function PlanCards({ snapshot, busy, onSelect, onTrial }) {
  const currentPlanId = snapshot.subscription?.plan_id;
  return (
    <section className="ai-pricing" aria-labelledby="ai-plans-title">
      <div className="ai-section-heading">
        <div><p className="eyebrow">Choose your access</p><h2 id="ai-plans-title">Zentel AI plans</h2></div>
        {snapshot.access?.trial_available ? <button className="button button-secondary" type="button" disabled={busy} onClick={onTrial}>Activate 20-credit trial</button> : null}
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

function PlanSummary({ snapshot, onPlans }) {
  const wallet = snapshot.wallet || {};
  const subscription = snapshot.subscription;
  const allocation = Number(subscription?.monthly_credits || 0);
  const remaining = Number(wallet.total_available || 0);
  const monthlyRemaining = Number(wallet.monthly_credits || 0);
  const used = Math.max(0, allocation - monthlyRemaining);
  return (
    <section className="ai-plan-summary" aria-label="Zentel AI plan and credits">
      <div><span>Current plan</span><strong>{subscription?.plan_name || "No monthly plan"}</strong></div>
      <div><span>Credits remaining</span><strong>{remaining.toLocaleString()}</strong></div>
      <div><span>Credits used</span><strong>{used.toLocaleString()}{allocation ? ` of ${allocation.toLocaleString()}` : ""}</strong></div>
      <div><span>Renewal date</span><strong>{subscription?.next_payment_date ? formatDateTime(subscription.next_payment_date) : "Not scheduled"}</strong></div>
      <button className="button button-secondary" type="button" onClick={onPlans}>Upgrade Plan</button>
      <Link className="button button-secondary" to="/portal/zentel-ai/usage#credits">Buy Credits</Link>
      <Link className="button button-primary" to="/portal/zentel-ai/usage">View Usage</Link>
    </section>
  );
}

function Welcome({ onSuggestion }) {
  return (
    <div className="ai-welcome">
      <span className="ai-welcome-icon"><Sparkles size={28} /></span>
      <h2>Welcome to Zentel AI</h2>
      <p>Learn, practise, research and build with an AI assistant designed to support your Zentel Insight learning journey.</p>
      <div className="ai-suggestion-grid">{suggestions.map((item) => <button type="button" key={item} onClick={() => onSuggestion(item)}>{item}</button>)}</div>
      <p className="ai-caution">Zentel AI can make mistakes. Review important academic, technical and professional information before relying on it.</p>
    </div>
  );
}

function ConversationSidebar({ open, records, selectedId, search, setSearch, onSelect, onNew, onRename, onArchive, onClose }) {
  return (
    <aside className={`ai-conversations ${open ? "open" : ""}`} aria-label="Conversation history">
      <div className="ai-conversation-header"><strong>Conversations</strong><button type="button" title="Close conversation history" onClick={onClose}><X size={19} /></button></div>
      <button className="button button-primary ai-new-chat" type="button" onClick={onNew}><MessageSquarePlus size={17} />New conversation</button>
      <label className="ai-search"><Search size={16} /><span className="sr-only">Search conversations</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" /></label>
      <div className="ai-conversation-list">
        {records.map((item) => (
          <div className={selectedId === item.id ? "active" : ""} key={item.id}>
            <button className="ai-conversation-title" type="button" onClick={() => onSelect(item.id)}><span>{item.title}</span><small>{formatDateTime(item.last_message_at)}</small></button>
            <button type="button" title="Rename conversation" onClick={() => onRename(item)}>Edit</button>
            <button type="button" title="Archive conversation" onClick={() => onArchive(item.id)}><Archive size={15} /></button>
          </div>
        ))}
        {!records.length ? <p>No conversations found.</p> : null}
      </div>
    </aside>
  );
}

export default function ZentelAI() {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [webResearch, setWebResearch] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamMessage, setStreamMessage] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const snapshotQuery = useAsyncData(getAiSnapshot, [], { errorMessage: "Zentel AI plan information could not be loaded." });
  const conversationsQuery = useAsyncData(() => listAiConversations({ search }), [search], { errorMessage: "Conversation history could not be loaded." });
  const messagesQuery = useAsyncData(() => listAiMessages(selectedId), [selectedId], { enabled: Boolean(selectedId), errorMessage: "This conversation could not be loaded." });
  const snapshot = snapshotQuery.data || {};
  const conversations = conversationsQuery.data || [];
  const messages = useMemo(() => [...(messagesQuery.data || []), ...(streamMessage ? [streamMessage] : [])], [messagesQuery.data, streamMessage]);
  const canUse = Boolean(snapshot.access?.account_active && snapshot.access?.ai_access_status !== "suspended" && snapshot.access?.system_available && (Number(snapshot.wallet?.total_available || 0) > 0 || snapshot.subscription));
  const estimate = estimateAiCredits(message, attachments, webResearch);

  usePageMeta({ path: "/portal/zentel-ai", title: "Zentel AI", description: "Your personal Zentel Insight learning assistant.", robots: "noindex,nofollow" });
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const refresh = () => { snapshotQuery.refetch(); conversationsQuery.refetch(); if (selectedId) messagesQuery.refetch(); };
  const newConversation = async () => {
    const created = await createAiConversation();
    setSelectedId(created.id);
    setDrawerOpen(false);
    conversationsQuery.refetch();
  };
  const selectPlan = async (slug) => {
    setPaymentBusy(true); setStatus({ type: "", message: "" });
    try { const result = await createAiSubscription(slug); window.location.assign(result.authorizationUrl); }
    catch (error) { setStatus({ type: "warning", message: error.message }); }
    finally { setPaymentBusy(false); }
  };
  const activateTrial = async () => {
    setPaymentBusy(true);
    try { await claimAiTrial(); setStatus({ type: "success", message: "Your Zentel AI trial is ready." }); setShowPlans(false); snapshotQuery.refetch(); }
    catch (error) { setStatus({ type: "warning", message: error.message }); }
    finally { setPaymentBusy(false); }
  };
  const attach = async (file) => {
    try {
      let conversationId = selectedId;
      if (!conversationId) { const created = await createAiConversation(); conversationId = created.id; setSelectedId(created.id); conversationsQuery.refetch(); }
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
    let conversationId = selectedId;
    try {
      if (!conversationId) { const created = await createAiConversation(); conversationId = created.id; setSelectedId(created.id); }
      const controller = new AbortController(); abortRef.current = controller;
      setStreaming(true); setStatus({ type: "", message: "" }); setMessage("");
      setStreamMessage({ id: `stream-${Date.now()}`, role: "assistant", content: { text: "" }, status: "streaming" });
      await executeAiRequest({
        conversationId, message: prompt, attachmentIds: attachments.map((item) => item.id), webResearch, signal: controller.signal,
        onEvent: (event, payload) => {
          if (event === "delta") setStreamMessage((current) => ({ ...current, content: { ...current.content, text: `${current.content.text}${payload.delta}` } }));
          if (event === "status") setStatus({ type: "info", message: payload.state === "reviewing_sources" ? "Reviewing current sources" : "Working on your response" });
          if (event === "done") setStreamMessage((current) => ({ ...current, status: "completed", content: { ...current.content, sources: payload.sources || [] } }));
        }
      });
      setAttachments([]); setWebResearch(false); refresh();
    } catch (error) {
      if (error.name !== "AbortError") setStatus({ type: "warning", message: error.message });
      setStreamMessage((current) => current ? { ...current, status: "failed" } : null);
      messagesQuery.refetch(); snapshotQuery.refetch();
    } finally { setStreaming(false); abortRef.current = null; }
  };
  const rename = async (item) => {
    const title = window.prompt("Conversation name", item.title);
    if (!title || title === item.title) return;
    await renameAiConversation(item.id, title); conversationsQuery.refetch();
  };
  const archive = async (id) => { await archiveAiConversation(id); if (selectedId === id) setSelectedId(""); conversationsQuery.refetch(); };
  const lastStudentMessage = [...messages].reverse().find((item) => item.role === "user")?.content?.text;

  if (snapshotQuery.loading) return <div className="portal-page"><div className="route-loader">Loading Zentel AI</div></div>;
  if (snapshotQuery.error) return <div className="portal-page"><div className="notice-card portal-state-card"><h2>Zentel AI could not be loaded</h2><p>{snapshotQuery.error}</p><button className="button button-primary" onClick={snapshotQuery.refetch}>Try Again</button></div></div>;

  return (
    <div className="portal-page ai-page">
      <header className="ai-page-heading"><div><p className="eyebrow">Student Portal</p><h1><BrainCircuit size={30} />Zentel AI</h1><p>Your personal learning assistant</p></div><button className="ai-history-toggle" type="button" onClick={() => setDrawerOpen(true)}><Menu size={19} />History</button></header>
      <PlanSummary snapshot={snapshot} onPlans={() => setShowPlans((current) => !current)} />
      {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
      {showPlans || !canUse ? <PlanCards snapshot={snapshot} busy={paymentBusy} onSelect={selectPlan} onTrial={activateTrial} /> : null}
      {canUse && !showPlans ? (
        <section className="ai-workspace">
          {drawerOpen ? <button className="ai-drawer-scrim" aria-label="Close conversation history" onClick={() => setDrawerOpen(false)} /> : null}
          <ConversationSidebar open={drawerOpen} records={conversations} selectedId={selectedId} search={search} setSearch={setSearch} onSelect={(id) => { setSelectedId(id); setStreamMessage(null); setDrawerOpen(false); }} onNew={newConversation} onRename={rename} onArchive={archive} onClose={() => setDrawerOpen(false)} />
          <div className="ai-chat">
            <div className="ai-chat-topbar"><button type="button" title="Open conversation history" onClick={() => setDrawerOpen(true)}><Menu size={18} /></button><strong>{conversations.find((item) => item.id === selectedId)?.title || "New learning conversation"}</strong><button type="button" title="Start a new conversation" onClick={newConversation}><MessageSquarePlus size={18} /></button></div>
            <div className="ai-message-list" aria-live="polite">
              {messagesQuery.loading ? <div className="route-loader">Loading conversation</div> : null}
              {!messagesQuery.loading && !messages.length ? <Welcome onSuggestion={setMessage} /> : null}
              {messages.map((item, index) => <AiMessage key={item.id || index} message={item} onRegenerate={item.role === "assistant" && lastStudentMessage ? () => send(lastStudentMessage) : null} />)}
              <div ref={bottomRef} />
            </div>
            <div className="ai-composer-wrap">
              {attachments.length || uploading ? <div className="ai-attachments">{uploading ? <span><Clock3 size={15} />Uploading file</span> : null}{attachments.map((item) => <span key={item.id}>{item.mime_type.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}{item.file_name}<button type="button" title="Remove attachment" onClick={() => removeAttachment(item)}><X size={14} /></button></span>)}</div> : null}
              <div className="ai-composer">
                <input ref={fileRef} hidden type="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp" onChange={(event) => event.target.files?.[0] && attach(event.target.files[0])} />
                <button type="button" title="Attach a document or image" disabled={streaming || uploading} onClick={() => fileRef.current?.click()}><Paperclip size={19} /><span className="sr-only">Attach a document or image</span></button>
                <textarea value={message} maxLength={30000} rows={2} placeholder="Ask Zentel AI to explain, teach, research or review..." onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
                {streaming ? <button className="ai-send" type="button" title="Stop generation" onClick={() => abortRef.current?.abort()}><Square size={18} /><span className="sr-only">Stop generation</span></button> : <button className="ai-send" type="button" title="Send message" disabled={!message.trim() && !attachments.length} onClick={() => send()}><Send size={18} /><span className="sr-only">Send message</span></button>}
              </div>
              <div className="ai-composer-meta"><label><input type="checkbox" checked={webResearch} onChange={(event) => setWebResearch(event.target.checked)} />Web research</label><span>Estimated {estimate.minimum}-{estimate.maximum} credits</span></div>
            </div>
          </div>
        </section>
      ) : null}
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
