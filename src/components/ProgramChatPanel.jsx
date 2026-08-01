import {
  ArrowLeft,
  BadgeCheck,
  ImageOff,
  Info,
  Lightbulb,
  MessageSquare,
  Paperclip,
  Phone,
  PhoneOff,
  Reply,
  Send,
  ShieldAlert,
  ThumbsUp,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/authHooks";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  ensureProgramClassroom,
  getActiveProgramChatCall,
  getProgramChatMessages,
  getProgramChatRooms,
  getProgramChatUnreadCounts,
  joinProgramChat,
  manageProgramChatCall,
  markProgramChatRead,
  moderateProgramChatMessage,
  sendProgramChatMessage,
  subscribeToProgramChat,
  toggleProgramChatReaction,
  validateChatImage
} from "../services/chatService";
import { formatDateTime } from "../utils/format";

const REACTION_META = {
  like: { label: "Like", Icon: ThumbsUp },
  helpful: { label: "Helpful", Icon: Lightbulb },
  celebrate: { label: "Celebrate", Icon: BadgeCheck }
};

const LINK_PATTERN = /(https?:\/\/[^\s]+|mailto:[^\s]+|tel:\+?[0-9][0-9()\-\s]{5,})/gi;

function displayName(message) {
  if (message?.message_type === "system") return "System";
  if (message?.sender_display_name) return message.sender_display_name;
  if (message?.sender_role === "admin") return "Admin";
  if (message?.sender_role === "tutor") return "Tutor";
  return "Student";
}

function roleLabel(message) {
  const role = String(message?.sender_role || "student").toLowerCase();
  if (role === "admin") return "Administration";
  if (role === "tutor") return "Tutor";
  if (role === "system") return "System";
  return "Student";
}

function SafeMessageText({ text }) {
  const parts = String(text || "").split(LINK_PATTERN);
  return (
    <p>
      {parts.map((part, index) => {
        if (!part || !/^(https?:\/\/|mailto:|tel:)/i.test(part)) return part;
        let href = part;
        let suffix = "";
        if (/^https?:\/\//i.test(part)) {
          const match = part.match(/([.,!?;:)]+)$/);
          if (match) {
            suffix = match[1];
            href = part.slice(0, -suffix.length);
          }
        }
        return <span key={`${href}-${index}`}><a href={href} target={/^https?:/i.test(href) ? "_blank" : undefined} rel={/^https?:/i.test(href) ? "noopener noreferrer" : undefined}>{href}</a>{suffix}</span>;
      })}
    </p>
  );
}

function MessageImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) return <div className="chat-image-fallback"><ImageOff size={18} aria-hidden="true" /><span>Image unavailable</span></div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function reactionCounts(message) {
  return (message.program_chat_reactions || []).reduce((result, item) => {
    result[item.reaction] = (result[item.reaction] || 0) + 1;
    return result;
  }, {});
}

function ParticipantState({ onlineCount, typingNames, connection }) {
  if (connection === "reconnecting") return <span className="chat-presence-state">Reconnecting</span>;
  if (typingNames.length) return <span className="chat-presence-state active">{typingNames.slice(0, 2).join(" and ")} {typingNames.length === 1 ? "is" : "are"} typing...</span>;
  return <span className="chat-presence-state"><Users size={14} aria-hidden="true" />{onlineCount ? `${onlineCount} online` : "Live chat"}</span>;
}

export default function ProgramChatPanel({
  canModerate = false,
  programId = "",
  trackId = "",
  roomId: requestedRoomId = "",
  audience = "student",
  standalone = false,
  backTo = "",
  onRoomState
}) {
  const { user, profile } = useAuth();
  const roomsQuery = useAsyncData(
    () => programId || requestedRoomId
      ? ensureProgramClassroom({ programId, trackId, roomId: requestedRoomId }).then((room) => room ? [room] : [])
      : getProgramChatRooms(),
    [programId, trackId, requestedRoomId],
    { errorMessage: "We could not load your classroom. Please try again." }
  );
  const rooms = useMemo(() => roomsQuery.data || [], [roomsQuery.data]);
  const unreadQuery = useAsyncData(() => getProgramChatUnreadCounts(), [], {
    enabled: Boolean(user?.id),
    errorMessage: "Unread messages could not be checked."
  });
  const [selectedRoomId, setSelectedRoomId] = useState(requestedRoomId);
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId) || rooms[0] || null, [selectedRoomId, rooms]);
  const joined = Boolean(selectedRoom?.joined || canModerate || audience === "admin");
  const messagesQuery = useAsyncData(
    () => getProgramChatMessages(selectedRoom.id),
    [selectedRoom?.id, joined],
    { enabled: Boolean(selectedRoom?.id && joined), errorMessage: "We could not load your classroom messages. Please try again." }
  );
  const callQuery = useAsyncData(() => getActiveProgramChatCall(selectedRoom?.id), [selectedRoom?.id], {
    enabled: Boolean(selectedRoom?.id && joined),
    errorMessage: "Voice-call status could not be checked."
  });
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [connection, setConnection] = useState("connecting");
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const imagePreviewUrl = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : "", [imageFile]);
  const messageListRef = useRef(null);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const textareaRef = useRef(null);
  const channelRef = useRef(null);
  const typingTimerRef = useRef(null);
  const onRoomStateRef = useRef(onRoomState);
  const messageById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const canSend = Boolean(joined && !sending && (body.trim() || imageFile) && body.length <= CHAT_MESSAGE_MAX_LENGTH);
  const selectedUnreadCount = Number(unreadQuery.data?.[selectedRoom?.id] || 0);
  const currentDisplayName = useMemo(() => {
    if (audience === "admin") return "Admin";
    const firstName = String(profile?.full_name || "").trim().split(/\s+/)[0] || (audience === "tutor" ? "Tutor" : "Student");
    return audience === "tutor" ? `${profile?.title || "Tutor"} ${firstName}`.trim() : firstName;
  }, [audience, profile?.full_name, profile?.title]);
  const typingNames = Object.values(typingUsers).map((item) => item.name).filter(Boolean);
  const canHostCall = audience === "tutor" || audience === "admin";

  useEffect(() => { onRoomStateRef.current = onRoomState; }, [onRoomState]);
  useEffect(() => { onRoomStateRef.current?.({ roomId: selectedRoom?.id || "", unreadCount: selectedUnreadCount, joined }); }, [joined, selectedRoom?.id, selectedUnreadCount]);
  useEffect(() => () => { if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); }, [imagePreviewUrl]);
  useEffect(() => { setMessages(messagesQuery.data || []); }, [messagesQuery.data]);

  useEffect(() => {
    if (!standalone) return undefined;
    document.body.classList.add("portal-dedicated-workspace");
    return () => document.body.classList.remove("portal-dedicated-workspace");
  }, [standalone]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.min(112, Math.max(40, textareaRef.current.scrollHeight))}px`;
  }, [body]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages.length, selectedRoom?.id]);

  useEffect(() => {
    if (!selectedRoom?.id || !user?.id || !joined || messagesQuery.loading || messagesQuery.error) return undefined;
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      markProgramChatRead(selectedRoom.id).then(unreadQuery.refetch).catch(() => undefined);
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  // Message count is the committed read boundary; refetch is stable in the data hook.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoom?.id, user?.id, joined, messages.length, messagesQuery.loading, messagesQuery.error]);

  useEffect(() => {
    if (!selectedRoom?.id || !user?.id || !joined) return undefined;
    let active = true;
    let subscription = null;
    setConnection("connecting");
    subscribeToProgramChat(selectedRoom.id, user.id, {
      onMessage: (message) => {
        if (!active) return;
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        if (document.visibilityState === "visible") markProgramChatRead(selectedRoom.id).then(unreadQuery.refetch).catch(() => undefined);
      },
      onReaction: () => messagesQuery.refetch(),
      onCall: () => callQuery.refetch(),
      onTyping: (payload) => {
        if (!payload.userId || payload.userId === user.id) return;
        if (!payload.active) {
          setTypingUsers((current) => { const next = { ...current }; delete next[payload.userId]; return next; });
          return;
        }
        setTypingUsers((current) => ({ ...current, [payload.userId]: { name: payload.name || "A classmate", expiresAt: Date.now() + 3500 } }));
      },
      onPresence: (presence) => setOnlineCount(Object.keys(presence || {}).length),
      onPresenceLeave: (key) => setTypingUsers((current) => { const next = { ...current }; delete next[key]; return next; }),
      onConnection: (next) => setConnection(next === "SUBSCRIBED" ? "online" : next === "CHANNEL_ERROR" || next === "TIMED_OUT" ? "reconnecting" : "connecting"),
      onReconnect: () => { messagesQuery.refetch(); unreadQuery.refetch(); callQuery.refetch(); }
    }).then((connected) => {
      if (active) { subscription = connected; channelRef.current = connected; }
      else connected.unsubscribe?.();
    }).catch(() => setConnection("reconnecting"));

    const typingExpiry = window.setInterval(() => {
      setTypingUsers((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => value.expiresAt > Date.now())));
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(typingExpiry);
      window.clearTimeout(typingTimerRef.current);
      subscription?.sendTyping?.(false, currentDisplayName);
      subscription?.unsubscribe?.();
      if (channelRef.current === subscription) channelRef.current = null;
    };
  // Query refetch callbacks are stable; room, user, membership and display identity are the subscription boundaries.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoom?.id, user?.id, joined, currentDisplayName]);

  function selectImage(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    try {
      validateChatImage(file);
      setImageFile(file);
      setStatus({ type: "", message: "" });
    } catch (error) {
      setStatus({ type: "warning", message: error.message });
      event.target.value = "";
    }
  }

  function removeImage() {
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateBody(value) {
    setBody(value);
    channelRef.current?.sendTyping?.(Boolean(value.trim()), currentDisplayName);
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => channelRef.current?.sendTyping?.(false, currentDisplayName), 1800);
  }

  async function joinChat() {
    if (!selectedRoom?.id || joining) return;
    setJoining(true);
    setStatus({ type: "", message: "" });
    try {
      await joinProgramChat(selectedRoom.id);
      await roomsQuery.refetch();
      setStatus({ type: "success", message: "You joined the programme chat." });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Chat could not be joined." });
    } finally {
      setJoining(false);
    }
  }

  async function send(event) {
    event.preventDefault();
    if (!canSend) return;
    await submitMessage({ body, imageFile, replyToId: replyTo?.id || null });
  }

  async function submitMessage(payload, retryMessageId = "") {
    if (!selectedRoom || sending) return;
    const nextBody = String(payload.body || "").trim();
    const nextImageFile = payload.imageFile || null;
    if (!nextBody && !nextImageFile) return;
    const clientMessageId = payload.clientMessageId || crypto.randomUUID();
    const optimisticId = retryMessageId || `pending-${clientMessageId}`;
    const optimisticMessage = {
      id: optimisticId,
      room_id: selectedRoom.id,
      sender_id: user.id,
      sender_role: audience,
      sender_display_name: currentDisplayName,
      body: nextBody,
      reply_to_id: payload.replyToId || null,
      created_at: new Date().toISOString(),
      client_status: "sending",
      retry_payload: { body: nextBody, imageFile: nextImageFile, replyToId: payload.replyToId || null, clientMessageId },
      image_pending: Boolean(nextImageFile),
      program_chat_reactions: []
    };
    setMessages((current) => retryMessageId ? current.map((item) => item.id === retryMessageId ? optimisticMessage : item) : [...current, optimisticMessage]);
    setSending(true);
    setStatus({ type: "", message: "" });
    channelRef.current?.sendTyping?.(false, currentDisplayName);
    try {
      const message = await sendProgramChatMessage({
        roomId: selectedRoom.id,
        senderId: user.id,
        body: nextBody,
        imageFile: nextImageFile,
        replyToId: payload.replyToId || null,
        clientMessageId
      });
      setMessages((current) => [...current.filter((item) => item.id !== optimisticId && item.id !== message.id), message].sort((left, right) => new Date(left.created_at) - new Date(right.created_at)));
      setBody("");
      removeImage();
      setReplyTo(null);
      await markProgramChatRead(selectedRoom.id);
    } catch {
      setMessages((current) => current.map((item) => item.id === optimisticId ? { ...item, client_status: "failed" } : item));
      setStatus({ type: "warning", message: "We could not send your message. Try again." });
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!selectedRoom?.id || !messages.length || loadingOlder) return;
    const firstPersisted = messages.find((message) => !message.client_status);
    if (!firstPersisted) return;
    setLoadingOlder(true);
    const listElement = messageListRef.current;
    const previousHeight = listElement?.scrollHeight || 0;
    try {
      const older = await getProgramChatMessages(selectedRoom.id, { before: firstPersisted.created_at, limit: 30 });
      setMessages((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...older.filter((item) => !seen.has(item.id)), ...current];
      });
      window.requestAnimationFrame(() => { if (listElement) listElement.scrollTop += listElement.scrollHeight - previousHeight; });
      if (!older.length) setStatus({ type: "info", message: "No older messages are available." });
    } catch {
      setStatus({ type: "warning", message: "Older messages could not be loaded. Please try again." });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function react(messageId, reaction) {
    try {
      await toggleProgramChatReaction(messageId, reaction);
      messagesQuery.refetch();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Reaction could not be saved." });
    }
  }

  async function moderate(message) {
    try {
      await moderateProgramChatMessage(message.id);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, deleted_for_moderation_at: new Date().toISOString() } : item));
    } catch {
      setStatus({ type: "warning", message: "This message could not be moderated. Please try again." });
    }
  }

  async function openCall(action) {
    if (!selectedRoom?.id || callBusy) return;
    setCallBusy(true);
    setStatus({ type: "", message: "" });
    try {
      const result = await manageProgramChatCall(action, { roomId: selectedRoom.id, callId: callQuery.data?.id || "" });
      if (result.roomUrl && result.token) {
        const separator = result.roomUrl.includes("?") ? "&" : "?";
        const callWindow = window.open(`${result.roomUrl}${separator}t=${encodeURIComponent(result.token)}`, "_blank", "noopener,noreferrer");
        if (!callWindow) setStatus({ type: "warning", message: "Allow pop-ups for Zentel Insight, then try again." });
      }
      callQuery.refetch();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Voice-call access could not be prepared." });
    } finally {
      setCallBusy(false);
    }
  }

  async function endCall() {
    await openCall("end");
  }

  function handleComposerKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (canSend) composerRef.current?.requestSubmit();
  }

  if (roomsQuery.loading) return <div className="route-loader">Loading classroom chat</div>;
  if (roomsQuery.error) return <div className="notice-card portal-state-card"><h2>We could not load your classroom</h2><p>Please try again. If the issue continues, contact Zentel Insight support.</p><button className="button button-secondary" type="button" onClick={roomsQuery.refetch}>Try Again</button></div>;
  if (!rooms.length) return <div className="notice-card portal-state-card"><MessageSquare size={24} aria-hidden="true" /><h2>Classroom chat is not available yet</h2><p>Your classroom appears after an authorised programme is connected to your active account.</p></div>;

  if (!joined) {
    return (
      <section className={`chat-join-state ${standalone ? "standalone" : ""}`}>
        <MessageSquare size={28} aria-hidden="true" />
        <p className="eyebrow">{selectedRoom?.program_title || selectedRoom?.title}</p>
        <h2>Join Programme Chat</h2>
        <p>Join the conversation for your programme. You will receive new messages sent after you join.</p>
        <button className="button button-primary" type="button" disabled={joining} onClick={joinChat}>{joining ? "Joining Chat" : "Join Chat"}</button>
        {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
      </section>
    );
  }

  const activeCall = callQuery.data;
  return (
    <div className={`chat-panel ${standalone ? "chat-standalone" : ""} ${rooms.length <= 1 ? "single-room" : ""}`.trim()}>
      {rooms.length > 1 ? <aside className="chat-room-list" aria-label="Programme rooms">{rooms.map((room) => <button key={room.id} type="button" className={selectedRoom?.id === room.id ? "active" : ""} onClick={() => setSelectedRoomId(room.id)}><MessageSquare size={16} aria-hidden="true" /><span>{room.program_title || room.title}</span>{Number(unreadQuery.data?.[room.id] || 0) > 0 ? <span className="portal-nav-badge">{Math.min(99, unreadQuery.data[room.id])}{unreadQuery.data[room.id] > 99 ? "+" : ""}</span> : null}</button>)}</aside> : null}
      <section className="chat-thread" aria-label="Programme chat messages">
        <header className="chat-thread-header">
          <div className="chat-thread-identity">
            {standalone && backTo ? <Link className="chat-header-action" to={backTo} aria-label="Back to classroom"><ArrowLeft size={19} /></Link> : null}
            <div><strong>{selectedRoom?.program_title || selectedRoom?.title}</strong><ParticipantState onlineCount={onlineCount} typingNames={typingNames} connection={connection} /></div>
          </div>
          <div className="chat-header-actions">
            {activeCall ? <button className="chat-header-action call-live" type="button" disabled={callBusy} onClick={() => openCall("join")} title="Join voice call"><Phone size={18} /><span>Join</span></button> : canHostCall ? <button className="chat-header-action" type="button" disabled={callBusy} onClick={() => openCall("start")} title="Start voice call"><Phone size={18} /><span>Call</span></button> : <button className="chat-header-action" type="button" disabled title="No active voice call"><Phone size={18} /><span>Call</span></button>}
            {activeCall && canHostCall ? <button className="chat-header-action danger" type="button" disabled={callBusy} onClick={endCall} title="End voice call"><PhoneOff size={18} /><span>End</span></button> : null}
            <button className="chat-header-action" type="button" aria-pressed={detailsOpen} onClick={() => setDetailsOpen((current) => !current)} title="Classroom information"><Info size={18} /><span className="sr-only">Classroom information</span></button>
          </div>
        </header>
        {detailsOpen ? <div className="chat-room-notice"><Info size={15} aria-hidden="true" /><span>Messages in this classroom are retained for seven days.</span></div> : null}
        <div className="chat-message-list" ref={messageListRef} aria-live="polite">
          {!messagesQuery.error && messages.some((message) => !message.client_status) ? <button className="chat-load-older" type="button" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? "Loading" : "Load older messages"}</button> : null}
          {messagesQuery.loading ? <div className="route-loader">Loading messages</div> : null}
          {messagesQuery.error ? <div className="form-status warning" role="alert">We could not load your classroom messages. <button className="text-link" type="button" onClick={messagesQuery.refetch}>Try Again</button></div> : null}
          {!messagesQuery.loading && !messagesQuery.error && !messages.length ? <div className="chat-empty-state"><strong>No messages yet</strong><p>Start the conversation with your tutor and programme classmates.</p></div> : null}
          {!messagesQuery.error ? messages.map((message, index) => {
            const previous = messages[index - 1];
            const grouped = previous && previous.sender_id === message.sender_id && message.message_type !== "system" && new Date(message.created_at) - new Date(previous.created_at) < 5 * 60 * 1000;
            const repliedMessage = message.reply_to_id ? messageById.get(message.reply_to_id) : null;
            const counts = reactionCounts(message);
            if (message.message_type === "system") return <div className="chat-system-message" key={message.id}>{message.body}</div>;
            return (
              <article id={`chat-message-${message.id}`} className={`${message.sender_id === user?.id ? "chat-message own" : "chat-message"} ${grouped ? "grouped" : ""}`} key={message.id}>
                {!grouped ? <div className="chat-message-meta"><div><strong>{displayName(message)}</strong><span>{roleLabel(message)}</span></div><small>{formatDateTime(message.created_at)}</small></div> : null}
                {message.reply_to_id ? <button className="chat-reply-context" type="button" onClick={() => repliedMessage && document.getElementById(`chat-message-${repliedMessage.id}`)?.scrollIntoView({ block: "center" })}><Reply size={14} aria-hidden="true" /><span>{repliedMessage ? `${displayName(repliedMessage)}: ${repliedMessage.body || "Image"}` : "Original message is no longer available"}</span></button> : null}
                {message.deleted_for_moderation_at ? <p className="chat-moderated-placeholder">Message removed by moderation</p> : <>{message.body ? <SafeMessageText text={message.body} /> : null}{message.image_pending ? <span className="muted-line">Uploading image...</span> : null}{message.image_path ? <MessageImage src={message.image_url} alt={`Image shared by ${displayName(message)}`} /> : null}</>}
                {!message.deleted_for_moderation_at && !message.client_status ? <div className="chat-reactions" aria-label="Message reactions">{Object.entries(REACTION_META).map(([reaction, meta]) => { const Icon = meta.Icon; const active = (message.program_chat_reactions || []).some((item) => item.reaction === reaction && item.user_id === user?.id); return <button className={active ? "active" : ""} key={reaction} type="button" onClick={() => react(message.id, reaction)} title={meta.label}><Icon size={14} /><span>{counts[reaction] || ""}</span><span className="sr-only">{meta.label}</span></button>; })}</div> : null}
                <div className="chat-message-actions">
                  {!message.client_status && !message.deleted_for_moderation_at ? <button type="button" onClick={() => setReplyTo(message)}><Reply size={14} aria-hidden="true" /><span>Reply</span></button> : null}
                  {message.client_status === "sending" ? <span className="muted-line">Sending...</span> : null}
                  {message.client_status === "failed" ? <button className="danger" type="button" onClick={() => submitMessage(message.retry_payload, message.id)} disabled={sending}>Try again</button> : null}
                  {canModerate && !message.client_status && !message.deleted_for_moderation_at ? <button className="danger" type="button" onClick={() => moderate(message)}><ShieldAlert size={14} aria-hidden="true" /><span>Moderate</span></button> : null}
                </div>
              </article>
            );
          }) : null}
        </div>
        {imageFile ? <div className="chat-image-preview"><img src={imagePreviewUrl} alt="Selected chat attachment preview" /><small>{sending ? "Uploading image" : imageFile.name}</small><button type="button" onClick={removeImage} disabled={sending} aria-label="Remove selected image" title="Remove selected image"><X size={16} /></button></div> : null}
        {status.message ? <div className={`form-status chat-inline-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</div> : null}
        {!messagesQuery.error ? <form className="chat-composer" ref={composerRef} onSubmit={send}>
          {replyTo ? <div className="chat-composer-reply"><span>Replying to {displayName(replyTo)}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" title="Cancel reply"><X size={16} /></button></div> : null}
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} tabIndex="-1" />
          <button className="chat-composer-icon" type="button" onClick={() => fileInputRef.current?.click()} disabled={sending} aria-label="Attach image" title="Attach image"><Paperclip size={19} /></button>
          <label className="chat-composer-input"><span className="sr-only">Message</span><textarea ref={textareaRef} value={body} maxLength={CHAT_MESSAGE_MAX_LENGTH} onChange={(event) => updateBody(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Message your classroom" rows="1" />{body.length >= CHAT_MESSAGE_MAX_LENGTH - 200 ? <small>{body.length}/{CHAT_MESSAGE_MAX_LENGTH}</small> : null}</label>
          <button className="chat-composer-icon send" type="submit" disabled={!canSend} aria-label={sending ? "Sending message" : "Send message"} title="Send message"><Send size={19} /></button>
        </form> : null}
      </section>
    </div>
  );
}
