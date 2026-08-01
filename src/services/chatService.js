import { invokeEdgeFunction } from "./edgeFunctionClient";
import { getSupabaseClient } from "./supabaseClient";

export const CHAT_IMAGE_BUCKET = "classroom-media";
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_MESSAGE_MAX_LENGTH = 2000;
export const CHAT_REACTIONS = ["like", "helpful", "celebrate"];

const chatImageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function normalizeList(data) {
  return Array.isArray(data) ? data : [];
}

async function getClient() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Classroom chat could not be reached.");
  return supabase;
}

export async function getProgramChatRooms({ programId = "", trackId = "", roomId = "" } = {}) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("get_programme_chat_access", {
    target_program_id: programId || null,
    target_track_id: trackId || null,
    target_room_id: roomId || null
  });
  if (error) throw error;
  return normalizeList(data).map((room) => ({
    ...room,
    programs: { id: room.program_id, title: room.program_title }
  }));
}

export async function ensureProgramClassroom({ programId, trackId, roomId = "" }) {
  const rooms = await getProgramChatRooms({ programId, trackId, roomId });
  return rooms[0] || null;
}

export async function joinProgramChat(roomId) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("join_programme_chat", { target_room_id: roomId });
  if (error) throw error;
  return normalizeList(data)[0] || null;
}

async function withMessageImageUrl(message, supabase) {
  if (!message?.image_path) return message;
  const { data: signed, error } = await supabase.storage.from(CHAT_IMAGE_BUCKET).createSignedUrl(message.image_path, 60 * 30);
  return { ...message, image_url: error ? "" : signed?.signedUrl || "" };
}

export async function getProgramChatMessages(roomId, { limit = 40, before } = {}) {
  const supabase = await getClient();
  let query = supabase
    .from("program_chat_messages")
    .select("*, program_chat_reactions(id, reaction, user_id)")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(Math.min(60, Math.max(1, Number(limit) || 40)));
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw error;
  return Promise.all(normalizeList(data).reverse().map((message) => withMessageImageUrl(message, supabase)));
}

export function validateChatImage(file) {
  if (!file) return "";
  const extension = chatImageTypes[file.type];
  if (!extension) throw new Error("Upload a JPEG, PNG or WebP image.");
  if (file.size <= 0 || file.size > CHAT_IMAGE_MAX_BYTES) throw new Error("Chat images must be 5 MB or smaller.");
  return extension;
}

export async function sendProgramChatMessage({ roomId, senderId, body, imageFile, replyToId, clientMessageId = crypto.randomUUID() }) {
  const supabase = await getClient();
  const extension = validateChatImage(imageFile);
  let imagePath = "";

  if (imageFile) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    imagePath = `${roomId}/${senderId}/${year}/${month}/${clientMessageId}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(CHAT_IMAGE_BUCKET).upload(imagePath, imageFile, {
      cacheControl: "3600",
      contentType: imageFile.type,
      upsert: false
    });
    if (uploadError) throw uploadError;
  }

  const { data, error } = await supabase
    .from("program_chat_messages")
    .insert({
      room_id: roomId,
      sender_id: senderId,
      client_message_id: clientMessageId,
      message_type: imagePath ? "image" : "text",
      body: String(body || "").trim(),
      image_path: imagePath || null,
      reply_to_id: replyToId || null
    })
    .select("*, program_chat_reactions(id, reaction, user_id)")
    .single();

  if (error) {
    if (imagePath) await supabase.storage.from(CHAT_IMAGE_BUCKET).remove([imagePath]);
    throw error;
  }

  if (imagePath) {
    const { error: attachmentError } = await supabase.from("message_attachments").insert({
      message_id: data.id,
      bucket_id: CHAT_IMAGE_BUCKET,
      storage_path: imagePath,
      mime_type: imageFile.type,
      size_bytes: imageFile.size,
      uploaded_by: senderId
    });
    if (attachmentError) {
      await Promise.allSettled([
        supabase.from("program_chat_messages").delete().eq("id", data.id).eq("sender_id", senderId),
        supabase.storage.from(CHAT_IMAGE_BUCKET).remove([imagePath])
      ]);
      throw new Error("The selected image could not be sent. Please try again.");
    }
  }

  return withMessageImageUrl(data, supabase);
}

export async function getProgramChatUnreadCounts() {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("get_program_chat_unread_counts");
  if (error) throw error;
  return normalizeList(data).reduce((counts, item) => {
    counts[item.room_id] = Number(item.unread_count || 0);
    return counts;
  }, {});
}

export async function markProgramChatRead(roomId) {
  if (!roomId || (typeof document !== "undefined" && document.visibilityState !== "visible")) return false;
  const supabase = await getClient();
  const { error } = await supabase.rpc("mark_program_chat_read", { target_room_id: roomId });
  if (error) throw error;
  return true;
}

export async function toggleProgramChatReaction(messageId, reaction) {
  if (!CHAT_REACTIONS.includes(reaction)) throw new Error("Select an approved reaction.");
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("toggle_program_chat_reaction", {
    target_message_id: messageId,
    reaction_value: reaction
  });
  if (error) throw error;
  return Boolean(data);
}

export async function getActiveProgramChatCall(roomId) {
  if (!roomId) return null;
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("chat_calls")
    .select("id, room_id, status, started_at, started_by")
    .eq("room_id", roomId)
    .in("status", ["ringing", "live"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export function manageProgramChatCall(action, { roomId, callId = "" }) {
  return invokeEdgeFunction("create-chat-voice-call", {
    body: { action, roomId, callId },
    timeoutMs: 30000,
    unavailableMessage: "Voice calling is temporarily unavailable.",
    failureMessage: "Voice-call access could not be prepared. Please try again."
  });
}

export async function moderateProgramChatMessage(messageId, reason = "Moderated by administrator") {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("program_chat_messages")
    .update({ deleted_for_moderation_at: new Date().toISOString(), moderation_reason: reason })
    .eq("id", messageId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

function extractBroadcastRecord(payload) {
  return payload?.record || payload?.new || payload?.payload?.record || payload?.payload?.new || null;
}

export async function subscribeToProgramChat(roomId, userId, handlers = {}) {
  const supabase = await getClient();
  const channel = supabase.channel(`chat-room:${roomId}`, {
    config: {
      private: true,
      broadcast: { self: false, ack: true },
      presence: { key: userId }
    }
  });

  const handleCommittedChange = async (payload) => {
    const table = payload?.table || payload?.payload?.table || "";
    const record = extractBroadcastRecord(payload);
    if (table === "program_chat_messages" && record) {
      const hydrated = await withMessageImageUrl(record, supabase);
      handlers.onMessage?.(hydrated);
      return;
    }
    if (table === "program_chat_reactions") handlers.onReaction?.(record);
    if (table === "chat_calls") handlers.onCall?.(record);
  };

  channel
    .on("broadcast", { event: "INSERT" }, handleCommittedChange)
    .on("broadcast", { event: "UPDATE" }, handleCommittedChange)
    .on("broadcast", { event: "DELETE" }, handleCommittedChange)
    .on("broadcast", { event: "typing" }, ({ payload }) => handlers.onTyping?.(payload || {}))
    .on("presence", { event: "sync" }, () => handlers.onPresence?.(channel.presenceState()))
    .on("presence", { event: "leave" }, ({ key }) => handlers.onPresenceLeave?.(key));

  channel.subscribe(async (state) => {
    handlers.onConnection?.(state);
    if (state === "SUBSCRIBED") {
      await channel.track({ userId, viewingRoom: true, onlineAt: new Date().toISOString() });
      handlers.onReconnect?.();
    }
  });

  return {
    sendTyping(active, name = "") {
      return channel.send({ type: "broadcast", event: "typing", payload: { userId, name, active, sentAt: Date.now() } });
    },
    async unsubscribe() {
      await channel.untrack().catch(() => undefined);
      await supabase.removeChannel(channel);
    }
  };
}
