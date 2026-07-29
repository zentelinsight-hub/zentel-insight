import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  fulfilSuccessfulPayment,
  hmacSha512Hex,
  normalizePaymentReference,
  normalizePaystackProviderReference,
  timingSafeEqualHex,
  verifyPaystackReference
} from "../_shared/payments.ts";
import { createServiceClient } from "../_shared/supabase.ts";

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function beginWebhookEvent(supabase: any, eventKey: string, eventType: string, reference: string, payloadHash: string) {
  const { error } = await supabase.from("paystack_webhook_events").insert({
    event_key: eventKey,
    event_type: eventType,
    reference: reference || null,
    payload_hash: payloadHash,
    status: "processing"
  });
  if (!error) return { process: true };
  if (error.code !== "23505") throw error;
  const { data: existing, error: readError } = await supabase.from("paystack_webhook_events").select("status, payload_hash").eq("event_key", eventKey).single();
  if (readError) throw readError;
  if (existing.payload_hash !== payloadHash) throw new Error("Paystack event identity mismatch.");
  if (existing.status !== "failed") return { process: false };
  const { error: retryError } = await supabase.from("paystack_webhook_events").update({ status: "processing", error_code: null, processed_at: null }).eq("event_key", eventKey);
  if (retryError) throw retryError;
  return { process: true };
}

async function findSubscriptionForEvent(supabase: any, data: any) {
  const subscriptionCode = String(data?.subscription?.subscription_code || data?.subscription_code || "");
  const customerCode = String(data?.customer?.customer_code || data?.customer_code || "");
  if (subscriptionCode) {
    const { data: bySubscription } = await supabase.from("ai_subscriptions").select("*, ai_plans(*)").eq("provider_subscription_code", subscriptionCode).maybeSingle();
    if (bySubscription) return bySubscription;
  }
  if (customerCode) {
    const { data: byCustomer } = await supabase.from("ai_subscriptions").select("*, ai_plans(*)").eq("provider_customer_code", customerCode).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (byCustomer) return byCustomer;
  }
  const email = String(data?.customer?.email || "").trim().toLowerCase();
  const planCode = String(data?.plan?.plan_code || data?.plan_code || "");
  if (!email || !planCode) return null;
  const { data: profile } = await supabase.from("profiles").select("id").ilike("email", email).limit(1).maybeSingle();
  const { data: plan } = await supabase.from("ai_plans").select("*").eq("provider_plan_code", planCode).maybeSingle();
  if (!profile || !plan) return null;
  const { data: subscription } = await supabase.from("ai_subscriptions").select("*, ai_plans(*)").eq("user_id", profile.id).eq("plan_id", plan.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return subscription || null;
}

async function handleSubscriptionCreated(supabase: any, data: any) {
  const subscription = await findSubscriptionForEvent(supabase, data);
  if (!subscription) return false;
  const { error } = await supabase.from("ai_subscriptions").update({
    provider_customer_code: data?.customer?.customer_code || subscription.provider_customer_code,
    provider_subscription_code: data?.subscription_code || data?.subscription?.subscription_code || subscription.provider_subscription_code,
    provider_email_token: data?.email_token || data?.subscription?.email_token || subscription.provider_email_token,
    next_payment_date: data?.next_payment_date || subscription.next_payment_date,
    status: "active"
  }).eq("id", subscription.id);
  if (error) throw error;
  return true;
}

async function handleSubscriptionState(supabase: any, data: any, status: "past_due" | "cancelled") {
  const subscription = await findSubscriptionForEvent(supabase, data);
  if (!subscription) return false;
  const { error } = await supabase.from("ai_subscriptions").update({
    status,
    cancel_at_period_end: status === "cancelled" ? true : subscription.cancel_at_period_end,
    next_payment_date: status === "cancelled" ? null : subscription.next_payment_date
  }).eq("id", subscription.id);
  if (error) throw error;
  await supabase.from("portal_notifications").insert({
    user_id: subscription.user_id,
    title: status === "past_due" ? "Zentel AI renewal needs attention" : "Zentel AI renewal cancelled",
    message: status === "past_due"
      ? "We could not renew your Zentel AI plan. Your valid credits and conversation history remain available."
      : "Future renewal has stopped. Your paid access remains available until the current period ends.",
    notification_type: "zentel_ai_subscription",
    link_path: "/portal/zentel-ai/usage"
  });
  return true;
}

async function createRenewalPayment(supabase: any, subscription: any, data: any, reference: string) {
  const email = String(data?.customer?.email || "").trim().toLowerCase();
  const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", subscription.user_id).maybeSingle();
  const { data: payment, error } = await supabase.from("payments").insert({
    reference,
    user_id: subscription.user_id,
    brand: "zentel",
    product_type: "zentel_ai_subscription",
    product_key: subscription.ai_plans.slug,
    product_name: subscription.ai_plans.name,
    customer_name: profile?.full_name || email.split("@")[0] || "Zentel learner",
    customer_email: email,
    customer_phone: profile?.phone || "",
    expected_amount_kobo: subscription.ai_plans.monthly_price_kobo,
    amount_kobo: subscription.ai_plans.monthly_price_kobo,
    currency: "NGN",
    status: "pending",
    provider: "paystack",
    provider_status: "pending",
    verification_status: "unverified",
    reported_status: "pending",
    fulfilment_status: "awaiting_webhook",
    ai_plan_id: subscription.plan_id,
    metadata: { brand: "zentel", product_type: "zentel_ai_subscription", renewal: true }
  }).select("*").single();
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await supabase.from("payments").select("*").eq("reference", reference).single();
    if (existingError) throw existingError;
    return existing;
  }
  if (error) throw error;
  return payment;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  const secretKey = Deno.env.get("PAYSTACK_API_KEY");
  if (!secretKey) return jsonResponse({ error: "Webhook configuration is unavailable." }, 500, request);

  const rawBody = await request.text();
  const receivedSignature = request.headers.get("x-paystack-signature") || "";
  const expectedSignature = await hmacSha512Hex(secretKey, rawBody);
  if (!timingSafeEqualHex(receivedSignature, expectedSignature)) return jsonResponse({ error: "Invalid signature." }, 401, request);

  const supabase = createServiceClient();
  let eventKey = "";
  try {
    const event = JSON.parse(rawBody);
    const eventType = String(event.event || "unknown");
    const reference = normalizePaymentReference(event.data?.reference) || normalizePaystackProviderReference(event.data?.reference);
    const payloadHash = await sha256Hex(rawBody);
    eventKey = `${eventType}:${String(event.id || event.data?.id || payloadHash)}`;
    const registration = await beginWebhookEvent(supabase, eventKey, eventType, reference, payloadHash);
    if (!registration.process) return jsonResponse({ handled: true, duplicate: true }, 200, request);

    let handled = false;
    if (eventType === "subscription.create") handled = await handleSubscriptionCreated(supabase, event.data);
    else if (["subscription.disable", "subscription.not_renew"].includes(eventType)) handled = await handleSubscriptionState(supabase, event.data, "cancelled");
    else if (["charge.failed", "invoice.payment_failed"].includes(eventType)) {
      handled = await handleSubscriptionState(supabase, event.data, "past_due");
      if (reference) await supabase.from("payments").update({ status: "failed", provider_status: "failed", verification_status: "rejected", fulfilment_status: "failed", failure_reason: "Paystack renewal was not successful." }).eq("reference", reference);
    } else if (eventType === "charge.success" && reference) {
      const verified = await verifyPaystackReference(reference);
      if (String(verified.data?.status || "").toLowerCase() !== "success") throw new Error("Paystack did not independently verify this charge as successful.");
      let { data: payment, error: paymentError } = await supabase.from("payments").select("*").eq("reference", reference).maybeSingle();
      if (paymentError) throw paymentError;
      if (!payment) {
        const subscription = await findSubscriptionForEvent(supabase, event.data);
        if (subscription) payment = await createRenewalPayment(supabase, subscription, verified.data, reference);
      }
      if (payment) {
        await fulfilSuccessfulPayment(supabase, payment, { ...verified.data, __webhook_event_key: eventKey }, "paystack_webhook");
        handled = true;
      }
    }

    await supabase.from("paystack_webhook_events").update({ status: handled ? "completed" : "ignored", processed_at: new Date().toISOString() }).eq("event_key", eventKey);
    return jsonResponse({ handled }, 200, request);
  } catch (error) {
    console.error("paystack-webhook", (error as Error).message);
    if (eventKey) await supabase.from("paystack_webhook_events").update({ status: "failed", error_code: "processing_failed", processed_at: new Date().toISOString() }).eq("event_key", eventKey);
    return jsonResponse({ error: "Webhook could not be handled." }, 400, request);
  }
});
