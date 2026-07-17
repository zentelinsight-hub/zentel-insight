import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { fulfilSuccessfulPayment, hmacSha512Hex } from "../_shared/payments.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secretKey) return jsonResponse({ error: "Webhook secret is unavailable." }, 500);

  const rawBody = await request.text();
  const receivedSignature = request.headers.get("x-paystack-signature") || "";
  const expectedSignature = await hmacSha512Hex(secretKey, rawBody);

  if (receivedSignature !== expectedSignature) {
    return jsonResponse({ error: "Invalid signature." }, 401);
  }

  try {
    const event = JSON.parse(rawBody);
    if (event.event !== "charge.success") {
      return jsonResponse({ ignored: true });
    }

    const reference = event.data?.reference;
    if (!reference) return jsonResponse({ ignored: true });

    const supabase = createServiceClient();
    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (error) throw error;
    if (!payment) return jsonResponse({ ignored: true });

    await fulfilSuccessfulPayment(supabase, payment, event.data, "paystack_webhook");
    return jsonResponse({ handled: true });
  } catch (error) {
    console.error("paystack-webhook", error.message);
    return jsonResponse({ error: "Webhook could not be handled." }, 400);
  }
});
