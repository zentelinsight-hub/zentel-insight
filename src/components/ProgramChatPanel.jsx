import { ImageOff, MessageSquare, Paperclip, Reply, Send, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/authHooks";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  CHAT_IMAGE_MAX_BYTES,
  ensureProgramClassroom,
  getProgramChatMessages,
  getProgramChatRooms,
  getProgramChatUnreadCounts,
  markProgramChatRead,
  moderateProgramChatMessage,
  sendProgramChatMessage,
  subscribeToProgramChat
} from "../services/chatService";
import { formatDateTime } from "../utils/format";

const CHAT_MESSAGE_MAX_LENGTH = 2000;

function senderName(message) {
  const profile = message?.profiles;
  if (!profile) return "Zentel Insight";
  const firstName = String(profile.full_name || "").trim().split(/\s+/)[0] || "Member";
  return profile.title ? `${profile.title} ${firstName}` : profile.full_name || firstName;
}

function senderRole(message) {
  const role = String(message?.sender_role || "member").toLowerCase();
  if (role === "admin") return "Administration";
  if (role === "tutor") return "Tutor";
  if (role === "student") return "Student";
  return "Classroom member";
}

function MessageImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="chat-image-fallback"><ImageOff size={18} aria-hidden="true" /><span>Image unavailable</span></div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export default function ProgramChatPanel({ canModerate = false, programId = "", trackId = "", onRoomState }) {
  const { user, profile } = useAuth();
  const roomsQuery = useAsyncData(
    () => programId
      ? ensureProgramClassroom({ programId, trackId }).then((room) => room ? [room] : [])
      : getProgramChatRooms(),
    [programId, trackId],
    { errorMessage: "We could not load your classroom. Please try again." }
  );
  const rooms = useMemo(() => roomsQuery.data || [], [roomsQuery.data]);
  const unreadQuery = useAsyncData(() => getProgramChatUnreadCounts(), [], {
    enabled: Boolean(user?.id),
    errorMessage: "Unread messages could not be checked."
  });
  const [roomId, setRoomId] = useState("");
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === roomId) || rooms[0] || null, [roomId, rooms]);
  const messagesQuery = useAsyncData(
    () => getProgramChatMessages(selectedRoom.id),
    [selectedRoom?.id],
    { enabled: Boolean(selectedRoom?.id), errorMessage: "We could not load your classroom messages. Please try again." }
  );
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const imagePreviewUrl = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : "", [imageFile]);
  const messageListRef = useRef(null);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const onRoomStateRef = useRef(onRoomState);
  const messageById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const canSend = Boolean(!sending && (body.trim() || imageFile) && body.length <= CHAT_MESSAGE_MAX_LENGTH);
  const selectedUnreadCount = Number(unreadQuery.data?.[selectedRoom?.id] || 0);

  useEffect(() => {
    onRoomStateRef.current = onRoomState;
  }, [onRoomState]);

  useEffect(() => {
    onRoomStateRef.current?.({ roomId: selectedRoom?.id || "", unreadCount: selectedUnreadCount });
  }, [selectedRoom?.id, selectedUnreadCount]);

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  useEffect(() => {
    setMessages(messagesQuery.data || []);
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!selectedRoom?.id || !user?.id || messagesQuery.loading || messagesQuery.error) return undefined;
    let active = true;
    markProgramChatRead(selectedRoom.id, user.id).catch((error) => {
      if (active && import.meta.env.DEV) console.info("Chat read receipt update failed", error);
    });
    unreadQuery.refetch();
    return () => {
      active = false;
    };
  // unreadQuery.refetch is stable; message changes are the intended read boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoom?.id, user?.id, messages.length, messagesQuery.loading, messagesQuery.error]);

  useEffect(() => {
    if (!selectedRoom?.id) return undefined;
    let active = true;
    let unsubscribe = () => {};
    subscribeToProgramChat(selectedRoom.id, (message) => {
      if (!active) return;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    }).then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup();
    }).catch((error) => {
      if (import.meta.env.DEV) console.info("Live chat connection could not be started", error);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [selectedRoom?.id]);

  function selectImage(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus({ type: "warning", message: "Upload a JPEG, PNG or WebP image." });
      event.target.value = "";
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      setStatus({ type: "warning", message: "Chat images must be 5 MB or smaller." });
      event.target.value = "";
      return;
    }
    setImageFile(file);
    setStatus({ type: "", message: "" });
  }

  function removeImage() {
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    if (nextBody.length > CHAT_MESSAGE_MAX_LENGTH) {
      setStatus({ type: "warning", message: `Messages can use up to ${CHAT_MESSAGE_MAX_LENGTH} characters.` });
      return;
    }

    const optimisticId = retryMessageId || `pending-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      room_id: selectedRoom.id,
      sender_id: user.id,
      sender_role: profile?.role || "student",
      body: nextBody,
      reply_to_id: payload.replyToId || null,
      created_at: new Date().toISOString(),
      profiles: profile || { full_name: user?.email || "You" },
      client_status: "sending",
      retry_payload: { body: nextBody, imageFile: nextImageFile, replyToId: payload.replyToId || null },
      image_pending: Boolean(nextImageFile)
    };
    setMessages((current) => retryMessageId
      ? current.map((message) => message.id === retryMessageId ? optimisticMessage : message)
      : [...current, optimisticMessage]);
    setSending(true);
    setStatus({ type: "", message: "" });
    try {
      const message = await sendProgramChatMessage({
        roomId: selectedRoom.id,
        senderId: user.id,
        body: nextBody,
        imageFile: nextImageFile,
        replyToId: payload.replyToId || null
      });
      setMessages((current) => {
        const withoutPending = current.filter((item) => item.id !== optimisticId && item.id !== message.id);
        return [...withoutPending, message].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
      });
      setBody("");
      removeImage();
      setReplyTo(null);
    } catch (error) {
      if (import.meta.env.DEV) console.info("Chat message send failed", error);
      setMessages((current) => current.map((message) => message.id === optimisticId ? { ...message, client_status: "failed" } : message));
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
    setStatus({ type: "", message: "" });
    const listElement = messageListRef.current;
    const previousHeight = listElement?.scrollHeight || 0;
    try {
      const older = await getProgramChatMessages(selectedRoom.id, { before: firstPersisted.created_at, limit: 30 });
      setMessages((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...older.filter((item) => !seen.has(item.id)), ...current];
      });
      window.requestAnimationFrame(() => {
        if (listElement) listElement.scrollTop += listElement.scrollHeight - previousHeight;
      });
      if (!older.length) setStatus({ type: "success", message: "No older messages." });
    } catch (error) {
      if (import.meta.env.DEV) console.info("Older chat messages could not be loaded", error);
      setStatus({ type: "warning", message: "Older messages could not be loaded. Please try again." });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function moderate(message) {
    try {
      await moderateProgramChatMessage(message.id);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, deleted_for_moderation_at: new Date().toISOString(), moderation_reason: "Moderated by administrator" } : item));
    } catch (error) {
      if (import.meta.env.DEV) console.info("Chat moderation failed", error);
      setStatus({ type: "warning", message: "This message could not be moderated. Please try again." });
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (canSend) composerRef.current?.requestSubmit();
  }

  if (roomsQuery.loading) return <div className="route-loader">Loading classroom chat</div>;
  if (roomsQuery.error) {
    return (
      <div className="notice-card portal-state-card">
        <h2>We could not load your classroom</h2>
        <p>Please try again. If the issue continues, contact Zentel Insight support.</p>
        <button className="button button-secondary" type="button" onClick={roomsQuery.refetch}>Try Again</button>
      </div>
    );
  }
  if (!rooms.length) {
    return (
      <div className="notice-card portal-state-card">
        <MessageSquare size={24} aria-hidden="true" />
        <h2>Classroom chat is not available yet</h2>
        <p>Your programme classroom appears after an authorized programme is connected to your account.</p>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <aside className="chat-room-list" aria-label="Programme rooms">
        {rooms.map((room) => (
          <button key={room.id} type="button" className={selectedRoom?.id === room.id ? "active" : ""} onClick={() => setRoomId(room.id)}>
            <MessageSquare size={16} aria-hidden="true" />
            <span>{room.programs?.title || room.title}</span>
            {Number(unreadQuery.data?.[room.id] || 0) > 0 ? <span className="portal-nav-badge">{unreadQuery.data[room.id]}</span> : null}
          </button>
        ))}
      </aside>
      <section className="chat-thread" aria-label="Programme chat messages">
        <div className="chat-thread-header">
          <div><p className="eyebrow">Programme Classroom</p><h3>{selectedRoom?.programs?.title || selectedRoom?.title}</h3></div>
          <span className="portal-tag success">Live chat</span>
        </div>
        <div className="chat-message-list" ref={messageListRef} aria-live="polite">
          {!messagesQuery.error && messages.some((message) => !message.client_status) ? <button className="text-link chat-load-older" type="button" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? "Loading older messages" : "Load older messages"}</button> : null}
          {messagesQuery.loading ? <div className="route-loader">Loading messages</div> : null}
          {messagesQuery.error ? <div className="form-status warning" role="alert">We could not load your classroom messages. <button className="text-link" type="button" onClick={messagesQuery.refetch}>Try Again</button></div> : null}
          {!messagesQuery.loading && !messagesQuery.error && !messages.length ? <div className="chat-empty-state"><strong>No messages yet</strong><p>Start the conversation with your tutor and programme classmates.</p></div> : null}
          {!messagesQuery.error ? messages.map((message) => {
            const repliedMessage = message.reply_to_id ? messageById.get(message.reply_to_id) : null;
            return (
              <article className={message.sender_id === user?.id ? "chat-message own" : "chat-message"} key={message.id}>
                <div className="chat-message-meta"><div><strong>{senderName(message)}</strong><span>{senderRole(message)}</span></div><small>{formatDateTime(message.created_at)}</small></div>
                {message.reply_to_id ? <div className="chat-reply-context"><Reply size={14} aria-hidden="true" /><span>{repliedMessage ? `${senderName(repliedMessage)}: ${repliedMessage.body || "Image"}` : "Reply to an earlier message"}</span></div> : null}
                {message.deleted_for_moderation_at ? <p className="muted-line">This message was removed for moderation.</p> : <>{message.body ? <p>{message.body}</p> : null}{message.image_pending ? <span className="muted-line">Uploading image...</span> : null}{message.image_url ? <MessageImage src={message.image_url} alt={`Image shared by ${senderName(message)}`} /> : null}</>}
                <div className="chat-message-actions">
                  {!message.client_status && !message.deleted_for_moderation_at ? <button className="text-link" type="button" onClick={() => setReplyTo(message)}><Reply size={14} aria-hidden="true" />Reply</button> : null}
                  {message.client_status === "sending" ? <span className="muted-line">Sending...</span> : null}
                  {message.client_status === "failed" ? <button className="text-link danger" type="button" onClick={() => submitMessage(message.retry_payload, message.id)} disabled={sending}>Failed. Try again</button> : null}
                  {message.sender_id === user?.id && !message.client_status ? <span className="muted-line">Sent</span> : null}
                  {canModerate && !message.client_status && !message.deleted_for_moderation_at ? <button className="text-link danger" type="button" onClick={() => moderate(message)}><ShieldAlert size={14} aria-hidden="true" />Moderate</button> : null}
                </div>
              </article>
            );
          }) : null}
        </div>
        {!messagesQuery.error ? <form className="chat-composer" ref={composerRef} onSubmit={send}>
          {replyTo ? <div className="chat-composer-reply"><span>Replying to {senderName(replyTo)}</span><button className="icon-button" type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" title="Cancel reply"><X size={16} aria-hidden="true" /></button></div> : null}
          <button className="icon-button chat-attach-button" type="button" onClick={() => fileInputRef.current?.click()} aria-label="Attach image" title="Attach image"><Paperclip size={18} aria-hidden="true" /></button>
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} tabIndex="-1" />
          <label className="chat-composer-input"><span className="sr-only">Message</span><textarea value={body} maxLength={CHAT_MESSAGE_MAX_LENGTH} onChange={(event) => setBody(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Write a message" rows="2" /><small>{body.length}/{CHAT_MESSAGE_MAX_LENGTH}</small></label>
          <button className="button button-primary chat-send-button" type="submit" disabled={!canSend}>{sending ? "Sending" : "Send"}<Send size={18} aria-hidden="true" /></button>
        </form> : null}
        {imageFile ? <div className="chat-image-preview"><img src={imagePreviewUrl} alt="Selected chat attachment preview" /><small className="muted-line">{sending ? "Uploading image..." : imageFile.name}</small><button className="icon-button" type="button" onClick={removeImage} disabled={sending} aria-label="Remove selected image" title="Remove selected image"><X size={16} aria-hidden="true" /></button></div> : null}
        {status.message ? <div className={`form-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</div> : null}
      </section>
    </div>
  );
}
