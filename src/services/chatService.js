import { getSupabaseClient } from "./supabaseClient";

export const CHAT_IMAGE_BUCKET = "chat-images";
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

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
  if (!supabase) throw new Error("Programme chat could not be reached.");
  return supabase;
}

export async function getProgramChatRooms() {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("program_chat_rooms")
    .select("*, programs(id, slug, title)")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return normalizeList(data);
}

export async function getProgramChatMessages(roomId, limit = 40) {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("program_chat_messages")
    .select("*, profiles!program_chat_messages_sender_id_fkey(id, full_name, title, avatar_path)")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const messages = normalizeList(data).reverse();
  return Promise.all(messages.map(async (message) => {
    if (!message.image_path) return message;
    const { data: signed } = await supabase.storage.from(CHAT_IMAGE_BUCKET).createSignedUrl(message.image_path, 60 * 30);
    return { ...message, image_url: signed?.signedUrl || "" };
  }));
}

function validateChatImage(file) {
  if (!file) return "";
  const extension = chatImageTypes[file.type];
  if (!extension) throw new Error("Upload a JPEG, PNG or WebP image.");
  if (file.size > CHAT_IMAGE_MAX_BYTES) throw new Error("Chat images must be 5 MB or smaller.");
  return extension;
}

export async function sendProgramChatMessage({ roomId, senderId, body, imageFile, replyToId }) {
  const supabase = await getClient();
  const extension = validateChatImage(imageFile);
  let imagePath = "";

  if (imageFile) {
    imagePath = `${roomId}/${senderId}/chat-${Date.now()}.${extension}`;
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
      message_type: imagePath ? "image" : "text",
      body: String(body || "").trim(),
      image_path: imagePath || null,
      reply_to_id: replyToId || null
    })
    .select("*")
    .single();

  if (error) {
    if (imagePath) await supabase.storage.from(CHAT_IMAGE_BUCKET).remove([imagePath]);
    throw error;
  }

  return data;
}

export async function moderateProgramChatMessage(messageId, reason = "Moderated by administrator") {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("program_chat_messages")
    .update({
      deleted_for_moderation_at: new Date().toISOString(),
      moderation_reason: reason
    })
    .eq("id", messageId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function subscribeToProgramChat(roomId, onMessage) {
  const supabase = await getClient();
  const channel = supabase
    .channel(`program-chat:${roomId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "program_chat_messages", filter: `room_id=eq.${roomId}` },
      (payload) => onMessage?.(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
