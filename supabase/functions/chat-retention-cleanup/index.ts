import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { assertVerifiedAdmin, timingSafeEqual, writeAuditLog } from "../_shared/security.ts";

function boundedBatchSize(value: unknown) {
  const parsed = Number(value || 100);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(250, parsed)) : 100;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  const configuredSecret = Deno.env.get("CHAT_RETENTION_SECRET") || "";
  const suppliedSecret = request.headers.get("x-retention-secret") || "";
  const scheduled = Boolean(configuredSecret && suppliedSecret && timingSafeEqual(configuredSecret, suppliedSecret));
  const admin = scheduled ? null : await assertVerifiedAdmin(request);
  if (!scheduled && !admin?.ok) return jsonResponse({ ok: false, error: admin?.error || "Admin access is required." }, admin?.status || 403, request);

  try {
    const supabase = scheduled ? createServiceClient() : admin!.supabase;
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const batchSize = boundedBatchSize(body.batchSize);
    const now = new Date().toISOString();

    const { data: attachments, error: attachmentError } = await supabase
      .from("message_attachments")
      .select("id, message_id, bucket_id, storage_path, expires_at")
      .lte("expires_at", now)
      .order("expires_at", { ascending: true })
      .limit(batchSize);
    if (attachmentError) throw attachmentError;

    const { data: messages, error: messageError } = await supabase
      .from("program_chat_messages")
      .select("id, expires_at")
      .lte("expires_at", now)
      .order("expires_at", { ascending: true })
      .limit(batchSize);
    if (messageError) throw messageError;

    if (dryRun) {
      return jsonResponse({ ok: true, dryRun: true, affected: { attachments: attachments?.length || 0, messages: messages?.length || 0 } }, 200, request);
    }

    let removedFiles = 0;
    let removedAttachmentRows = 0;
    const failedFiles: Array<{ id: string; messageId: string }> = [];
    for (const attachment of attachments || []) {
      const { error: storageError } = await supabase.storage.from(attachment.bucket_id).remove([attachment.storage_path]);
      if (storageError) {
        failedFiles.push({ id: attachment.id, messageId: attachment.message_id });
        continue;
      }
      removedFiles += 1;
      const { error: deleteError } = await supabase.from("message_attachments").delete().eq("id", attachment.id);
      if (!deleteError) removedAttachmentRows += 1;
      else failedFiles.push({ id: attachment.id, messageId: attachment.message_id });
    }

    const blockedMessageIds = new Set(failedFiles.map((item) => item.messageId));
    const removableMessageIds = (messages || []).map((item) => item.id).filter((id) => !blockedMessageIds.has(id));
    let removedMessages = 0;
    if (removableMessageIds.length) {
      const { data: deleted, error } = await supabase.from("program_chat_messages").delete().in("id", removableMessageIds).select("id");
      if (error) throw error;
      removedMessages = deleted?.length || 0;
    }

    await writeAuditLog(supabase, {
      actorUserId: admin?.user?.id || null,
      action: "classroom_retention_cleanup",
      targetTable: "program_chat_messages",
      metadata: { removedFiles, removedAttachmentRows, removedMessages, failedFiles: failedFiles.length, batchSize, scheduled }
    });

    return jsonResponse({ ok: true, dryRun: false, removed: { files: removedFiles, attachments: removedAttachmentRows, messages: removedMessages }, failedFiles: failedFiles.length }, 200, request);
  } catch (error) {
    console.error("chat-retention-cleanup", (error as Error).message);
    return jsonResponse({ ok: false, error: "Classroom retention cleanup could not be completed." }, 500, request);
  }
});
