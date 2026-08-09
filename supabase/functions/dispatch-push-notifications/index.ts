import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = request.headers.get("authorization") || "";
  if (!serviceKey || authorization !== `Bearer ${serviceKey}`) return jsonResponse({ ok: false, error: "Service access is required." }, 403, request);

  const publicKey = Deno.env.get("WEB_PUSH_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("WEB_PUSH_PRIVATE_KEY") || "";
  const subject = Deno.env.get("WEB_PUSH_SUBJECT") || "mailto:zentelinsight@gmail.com";
  if (!publicKey || !privateKey) return jsonResponse({ ok: false, error: "Web Push is not configured." }, 503, request);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", serviceKey, { auth: { persistSession: false } });
  const body = await request.json().catch(() => ({}));
  let claim = supabase.from("push_notification_outbox").update({ status: "processing" }).eq("status", "pending").lte("available_at", new Date().toISOString()).select("id, notification_id, user_id, attempt_count").limit(25);
  if (body.outboxId) claim = claim.eq("id", String(body.outboxId));
  const { data: jobs, error: claimError } = await claim;
  if (claimError) return jsonResponse({ ok: false, error: "Push delivery could not be claimed." }, 500, request);

  webpush.setVapidDetails(subject, publicKey, privateKey);
  let sent = 0;
  for (const job of jobs || []) {
    const [{ data: notification }, { data: subscriptions }] = await Promise.all([
      supabase.from("portal_notifications").select("id, title, message, link_path").eq("id", job.notification_id).eq("user_id", job.user_id).maybeSingle(),
      supabase.from("web_push_subscriptions").select("id, endpoint, p256dh, auth_secret").eq("user_id", job.user_id).eq("enabled", true)
    ]);
    if (!notification || !(subscriptions || []).length) {
      await supabase.from("push_notification_outbox").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", job.id);
      continue;
    }

    let delivered = false;
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } }, JSON.stringify({ title: notification.title, body: notification.message, url: notification.link_path || "/portal/notifications", tag: `zentel-${notification.id}` }));
        delivered = true;
        await supabase.from("web_push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", subscription.id);
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
        await supabase.from("web_push_subscriptions").update({ enabled: ![404, 410].includes(statusCode), last_failure_at: new Date().toISOString(), failure_count: 1 }).eq("id", subscription.id);
      }
    }
    await supabase.from("push_notification_outbox").update({ status: delivered ? "sent" : "failed", attempt_count: Number(job.attempt_count || 0) + 1, processed_at: new Date().toISOString(), last_error: delivered ? null : "No subscribed device accepted the notification." }).eq("id", job.id);
    if (delivered) sent += 1;
  }
  return jsonResponse({ ok: true, claimed: jobs?.length || 0, sent }, 200, request);
});
