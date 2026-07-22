import { useEffect, useMemo, useState } from "react";
import { ImageUp, MessageSquare, Send, ShieldAlert } from "lucide-react";
import { useAuth } from "../context/authHooks";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  CHAT_IMAGE_MAX_BYTES,
  getProgramChatMessages,
  getProgramChatRooms,
  moderateProgramChatMessage,
  sendProgramChatMessage,
  subscribeToProgramChat
} from "../services/chatService";
import { formatDateTime } from "../utils/format";

function senderName(message) {
  const profile = message?.profiles;
  if (!profile) return "Zentel Insight";
  const firstName = String(profile.full_name || "").trim().split(/\s+/)[0] || "Member";
  return profile.title ? `${profile.title} ${firstName}` : profile.full_name || firstName;
}

export default function ProgramChatPanel({ canModerate = false }) {
  const { user } = useAuth();
  const roomsQuery = useAsyncData(() => getProgramChatRooms(), []);
  const rooms = useMemo(() => roomsQuery.data || [], [roomsQuery.data]);
  const [roomId, setRoomId] = useState("");
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === roomId) || rooms[0] || null, [roomId, rooms]);
  const messagesQuery = useAsyncData(
    () => selectedRoom ? getProgramChatMessages(selectedRoom.id) : Promise.resolve([]),
    [selectedRoom?.id]
  );
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setMessages(messagesQuery.data || []);
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!selectedRoom?.id) return undefined;
    let unsubscribe = () => {};
    subscribeToProgramChat(selectedRoom.id, (message) => {
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    }).then((cleanup) => {
      unsubscribe = cleanup;
    });
    return () => unsubscribe();
  }, [selectedRoom?.id]);

  function selectImage(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus({ type: "warning", message: "Upload a JPEG, PNG or WebP image." });
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      setStatus({ type: "warning", message: "Chat images must be 5 MB or smaller." });
      return;
    }
    setImageFile(file);
    setStatus({ type: "", message: "" });
  }

  async function send(event) {
    event.preventDefault();
    if (!selectedRoom || sending) return;
    if (!body.trim() && !imageFile) {
      setStatus({ type: "warning", message: "Write a message or attach an image before sending." });
      return;
    }
    setSending(true);
    setStatus({ type: "", message: "" });
    try {
      const message = await sendProgramChatMessage({
        roomId: selectedRoom.id,
        senderId: user.id,
        body,
        imageFile
      });
      setMessages((current) => [...current, message]);
      setBody("");
      setImageFile(null);
      setStatus({ type: "success", message: "Message sent." });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Message could not be sent." });
    } finally {
      setSending(false);
    }
  }

  async function moderate(message) {
    try {
      await moderateProgramChatMessage(message.id);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, deleted_for_moderation_at: new Date().toISOString(), moderation_reason: "Moderated by administrator" } : item));
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Message could not be moderated." });
    }
  }

  if (roomsQuery.loading) return <div className="route-loader">Loading programme chat</div>;
  if (roomsQuery.error) {
    return (
      <div className="notice-card portal-state-card">
        <h2>Programme chat could not be loaded</h2>
        <p>{roomsQuery.error}</p>
        <button className="button button-secondary" type="button" onClick={roomsQuery.refetch}>Try Again</button>
      </div>
    );
  }
  if (!rooms.length) {
    return (
      <div className="notice-card portal-state-card">
        <MessageSquare size={24} aria-hidden="true" />
        <h2>No programme chat yet</h2>
        <p>A programme room appears after your account is connected to an authorized programme.</p>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <aside className="chat-room-list" aria-label="Programme rooms">
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            className={selectedRoom?.id === room.id ? "active" : ""}
            onClick={() => setRoomId(room.id)}
          >
            <MessageSquare size={16} aria-hidden="true" />
            <span>{room.programs?.title || room.title}</span>
          </button>
        ))}
      </aside>
      <section className="chat-thread" aria-label="Programme chat messages">
        <div className="chat-thread-header">
          <div>
            <p className="eyebrow">Programme Chat</p>
            <h3>{selectedRoom?.programs?.title || selectedRoom?.title}</h3>
          </div>
          <span className="portal-tag">Realtime</span>
        </div>
        <div className="chat-message-list">
          {messagesQuery.loading ? <div className="route-loader">Loading messages</div> : null}
          {!messagesQuery.loading && !messages.length ? <p>No messages yet.</p> : null}
          {messages.map((message) => (
            <article className={message.sender_id === user?.id ? "chat-message own" : "chat-message"} key={message.id}>
              <div>
                <strong>{senderName(message)}</strong>
                <small>{formatDateTime(message.created_at)}</small>
              </div>
              {message.deleted_for_moderation_at ? (
                <p className="muted-line">This message was removed for moderation.</p>
              ) : (
                <>
                  {message.body ? <p>{message.body}</p> : null}
                  {message.image_url ? <img src={message.image_url} alt="" /> : null}
                </>
              )}
              {canModerate && !message.deleted_for_moderation_at ? (
                <button className="text-link danger" type="button" onClick={() => moderate(message)}>
                  <ShieldAlert size={14} aria-hidden="true" />
                  Moderate
                </button>
              ) : null}
            </article>
          ))}
        </div>
        <form className="chat-composer" onSubmit={send}>
          <label>
            <span className="sr-only">Message</span>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message" rows="2" />
          </label>
          <label className="icon-button" aria-label="Attach image">
            <ImageUp size={18} aria-hidden="true" />
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} />
          </label>
          <button className="button button-primary" type="submit" disabled={sending}>
            {sending ? "Sending" : "Send"}
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
        {imageFile ? <small className="muted-line">Attached: {imageFile.name}</small> : null}
        {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
      </section>
    </div>
  );
}
