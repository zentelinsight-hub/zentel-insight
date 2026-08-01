import { invokeEdgeFunction } from "./edgeFunctionClient";
import { getSupabaseClient, getSupabaseConfigDiagnostics } from "./supabaseClient";

export const AI_FILE_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "image/jpeg", "image/png", "image/webp"];
export const AI_FILE_MAX_BYTES = 10 * 1024 * 1024;

async function client() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Zentel AI could not be reached.");
  return supabase;
}

export async function getAiSnapshot() {
  const supabase = await client();
  const { data, error } = await supabase.rpc("ai_get_student_snapshot");
  if (error) throw error;
  return data || {};
}

export async function listAiConversations({ page = 0, pageSize = 30, search = "", archived = false } = {}) {
  const supabase = await client();
  let query = supabase.from("ai_conversations").select("*").eq("archived", archived).order("last_message_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  if (String(search).trim()) query = query.ilike("title", `%${String(search).trim().slice(0, 80)}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createAiConversation() {
  const supabase = await client();
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("Please sign in again.");
  const { data, error } = await supabase.from("ai_conversations").insert({ user_id: userId, title: "New learning conversation" }).select("*").single();
  if (error) throw error;
  return data;
}

export async function renameAiConversation(id, title) {
  const supabase = await client();
  const safeTitle = String(title || "").trim().slice(0, 120);
  if (!safeTitle) throw new Error("Enter a conversation name.");
  const { data, error } = await supabase.from("ai_conversations").update({ title: safeTitle }).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function archiveAiConversation(id) {
  const supabase = await client();
  const { error } = await supabase.from("ai_conversations").update({ archived: true }).eq("id", id);
  if (error) throw error;
}

export async function listAiMessages(conversationId, { page = 0, pageSize = 40 } = {}) {
  const supabase = await client();
  const from = page * pageSize;
  const { data, error } = await supabase.from("ai_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error;
  return [...(data || [])].reverse();
}

export function validateAiFile(file) {
  if (!file) throw new Error("Choose a file to attach.");
  if (!AI_FILE_TYPES.includes(file.type)) throw new Error("Attach a PDF, DOCX, TXT, JPEG, PNG or WebP file.");
  const expectedExtensions = {
    "application/pdf": ["pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
    "text/plain": ["txt"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"]
  };
  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  if (!expectedExtensions[file.type]?.includes(extension)) throw new Error("The file name and file type do not match.");
  if (file.size <= 0 || file.size > AI_FILE_MAX_BYTES) throw new Error("Attachments must be 10 MB or smaller.");
}

export async function uploadAiAttachment(conversationId, file) {
  validateAiFile(file);
  const supabase = await client();
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("Please sign in again.");
  const extension = String(file.name).split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "file";
  const path = `${userId}/${conversationId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("zentel-ai-files").upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("ai_attachments").insert({
    user_id: userId,
    conversation_id: conversationId,
    storage_path: path,
    file_name: String(file.name).slice(0, 180),
    mime_type: file.type,
    file_size: file.size,
    status: "uploaded"
  }).select("*").single();
  if (error) {
    await supabase.storage.from("zentel-ai-files").remove([path]);
    throw error;
  }
  return data;
}

export async function removeAiAttachment(attachment) {
  const supabase = await client();
  const { error: storageError } = await supabase.storage.from("zentel-ai-files").remove([attachment.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("ai_attachments").update({ status: "removed" }).eq("id", attachment.id);
  if (error) throw error;
}

export function createAiSubscription(planSlug) {
  return invokeEdgeFunction("create-ai-subscription", { body: { planSlug }, timeoutMs: 30000, failureMessage: "Subscription checkout could not be opened." });
}

export function buyAiCredits(productSlug) {
  return invokeEdgeFunction("buy-ai-credits", { body: { productSlug }, timeoutMs: 30000, failureMessage: "Credit checkout could not be opened." });
}

export function cancelAiSubscription() {
  return invokeEdgeFunction("cancel-ai-subscription", { body: {}, timeoutMs: 30000, failureMessage: "Subscription cancellation could not be confirmed." });
}

export async function setAiMessageFeedback(messageId, feedback) {
  const supabase = await client();
  const { error } = await supabase.from("ai_messages").update({ feedback }).eq("id", messageId).eq("role", "assistant");
  if (error) throw error;
}

export async function executeAiRequest({ conversationId, message, attachmentIds = [], webResearch = false, idempotencyKey = crypto.randomUUID(), signal, onEvent }) {
  const diagnostics = getSupabaseConfigDiagnostics();
  const supabase = await client();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const response = await fetch(`${diagnostics.url}/functions/v1/zentel-ai-execute`, {
    method: "POST",
    headers: { apikey: diagnostics.publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message, attachmentIds, webResearch, idempotencyKey }),
    signal
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || "Zentel AI could not complete this request.");
    error.code = body.code || "request_failed";
    throw error;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
      const raw = block.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (!raw) continue;
      const payload = JSON.parse(raw);
      onEvent?.(event, payload);
      if (event === "error") {
        const error = new Error(payload.message || "Zentel AI could not complete this request.");
        error.code = payload.code || "generation_failed";
        throw error;
      }
    }
  }
  return { idempotencyKey };
}

export function estimateAiCredits(text, attachments = [], webResearch = false) {
  const length = String(text || "").length;
  let minimum = length > 5000 ? 4 : length > 1000 ? 2 : 1;
  let maximum = length > 5000 ? 14 : length > 1000 ? 9 : 6;
  if (attachments.length) { minimum += 2; maximum += attachments.length * 4; }
  if (webResearch) { minimum += 3; maximum += 8; }
  return { minimum, maximum: Math.min(50, maximum) };
}

export function adminAiRequest(action, values = {}) {
  return invokeEdgeFunction("admin-manage-ai", { body: { action, ...values }, timeoutMs: 30000, failureMessage: "Zentel AI Admin data could not be loaded." });
}
