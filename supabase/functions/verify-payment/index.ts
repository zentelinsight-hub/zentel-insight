import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { fulfilSuccessfulPayment, verifyPaystackReference } from "../_shared/payments.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const { reference } = await request.json();
    if (!reference || typeof reference !== "string") {
      return jsonResponse({ error: "A valid payment reference is required." }, 400);
    }

    const supabase = createServiceClient();
    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (error) throw error;
    if (!payment) return jsonResponse({ status: "invalid_reference", verified: false }, 404);

    const paystackResult = await verifyPaystackReference(reference);
    const paystackData = paystackResult.data;

    if (paystackData?.status !== "success") {
      await supabase.from("payments").update({ status: paystackData?.status || "pending" }).eq("id", payment.id);
      return jsonResponse({ status: paystackData?.status || "pending", verified: false, payment });
    }

    const updatedPayment = await fulfilSuccessfulPayment(supabase, payment, paystackData, "browser_verify");
    return jsonResponse({ status: "success", verified: true, payment: updatedPayment });
  } catch (error) {
    console.error("verify-payment", error.message);
    return jsonResponse({ error: "Payment verification is unavailable.", verified: false }, 503);
  }
});
