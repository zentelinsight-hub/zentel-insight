import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { paystackApi, requireActiveStudent } from "../_shared/aiPayments.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);
  try {
    const context = await requireActiveStudent(request);
    const { data: subscription, error } = await context.supabase
      .from("ai_subscriptions")
      .select("id, provider_subscription_code, provider_email_token, current_period_end, status")
      .eq("user_id", context.user.id)
      .in("status", ["active", "past_due", "suspended"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!subscription) return jsonResponse({ error: "No active Zentel AI subscription was found." }, 404, request);
    if (!subscription.provider_subscription_code || !subscription.provider_email_token) {
      return jsonResponse({ error: "Subscription cancellation is not ready yet. Contact Zentel Insight support with your payment reference." }, 409, request);
    }
    await paystackApi("/subscription/disable", {
      method: "POST",
      body: JSON.stringify({ code: subscription.provider_subscription_code, token: subscription.provider_email_token })
    });
    const { error: updateError } = await context.supabase.from("ai_subscriptions").update({
      cancel_at_period_end: true,
      next_payment_date: null
    }).eq("id", subscription.id);
    if (updateError) throw updateError;
    await context.supabase.from("portal_notifications").insert({
      user_id: context.user.id,
      title: "Zentel AI renewal cancelled",
      message: "Your current access remains available until the end of the paid period.",
      notification_type: "zentel_ai_subscription",
      link_path: "/portal/zentel-ai/usage"
    });
    return jsonResponse({ ok: true, accessEndsAt: subscription.current_period_end }, 200, request);
  } catch (error) {
    console.error("cancel-ai-subscription", (error as Error).message);
    return jsonResponse({ error: String((error as Error).message || "Subscription could not be cancelled.").slice(0, 240) }, 400, request);
  }
});
