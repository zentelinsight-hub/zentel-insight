import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { fulfilSuccessfulPayment, mapProviderStatus, normalizePaymentReference, verifyPaystackReference } from "../_shared/payments.ts";
import { createServiceClient } from "../_shared/supabase.ts";

function safePayment(payment: any) {
  if (!payment) return null;
  return {
    id: payment.id,
    reference: payment.reference,
    brand: payment.brand,
    product_type: payment.product_type,
    product_name: payment.product_name,
    selected_level: payment.selected_level,
    selected_subjects: payment.selected_subjects,
    selected_class: payment.selected_class,
    class_level: payment.class_level,
    subject_ids: payment.subject_ids,
    months: payment.months || payment.number_of_months,
    customer_name: payment.customer_name,
    customer_email: payment.customer_email,
    customer_phone: payment.customer_phone,
    expected_amount_kobo: payment.expected_amount_kobo,
    amount_kobo: payment.amount_kobo || payment.expected_amount_kobo,
    paid_amount_kobo: payment.paid_amount_kobo,
    currency: payment.currency,
    status: payment.status,
    provider_status: payment.provider_status,
    paid_at: payment.paid_at,
    verified_at: payment.verified_at,
    created_at: payment.created_at
  };
}

async function readReference(request: Request) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    return normalizePaymentReference(url.searchParams.get("reference"), url.searchParams.get("trxref"));
  }
  const body = await request.json().catch(() => ({}));
  return normalizePaymentReference(body.reference, body.trxref, url.searchParams.get("reference"), url.searchParams.get("trxref"));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (!["POST", "GET"].includes(request.method)) return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);

  try {
    const reference = await readReference(request);
    if (!reference) {
      return jsonResponse({ status: "invalid_reference", verified: false, error: "A valid payment reference is required." }, 400, request);
    }

    const supabase = createServiceClient();
    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (error) throw error;
    if (!payment) return jsonResponse({ status: "invalid_reference", verified: false, reference }, 404, request);

    if (payment.status === "success") {
      return jsonResponse({
        status: "success",
        verified: true,
        reference,
        payment: safePayment(payment),
        message: "Payment already verified."
      }, 200, request);
    }

    const paystackResult = await verifyPaystackReference(reference);
    const paystackData = paystackResult.data;
    const providerStatus = mapProviderStatus(paystackData?.status);

    if (providerStatus !== "success") {
      const { data: updatedPayment } = await supabase
        .from("payments")
        .update({
          status: providerStatus,
          provider_status: paystackData?.status || providerStatus,
          provider_transaction_id: paystackData?.id ? String(paystackData.id) : null,
          failure_reason: providerStatus === "failed" ? paystackData?.gateway_response || "Payment was not successful." : null
        })
        .eq("id", payment.id)
        .select()
        .single();

      return jsonResponse({
        status: providerStatus,
        verified: false,
        reference,
        payment: safePayment(updatedPayment || payment),
        message: providerStatus === "pending"
          ? "Your payment confirmation is still being checked. Keep your reference and use Check Again shortly."
          : "Paystack has not confirmed this payment as successful."
      }, 200, request);
    }

    const updatedPayment = await fulfilSuccessfulPayment(supabase, payment, paystackData, "browser_verify");
    return jsonResponse({
      status: "success",
      verified: true,
      reference,
      payment: safePayment(updatedPayment),
      message: "Payment verified successfully."
    }, 200, request);
  } catch (error) {
    console.error("verify-payment", (error as Error).message);
    return jsonResponse({
      error: "Payment verification is temporarily unavailable.",
      status: "pending",
      verified: false,
      message: "Your payment confirmation is still being checked. Keep your reference and use Check Again shortly."
    }, 503, request);
  }
});
