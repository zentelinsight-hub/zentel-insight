import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { createAiPaymentSession, requireActiveStudent } from "../_shared/aiPayments.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);
  try {
    const context = await requireActiveStudent(request);
    const body = await request.json().catch(() => ({}));
    const slug = String(body.productSlug || "").trim().toLowerCase();
    const { data: product, error } = await context.supabase
      .from("ai_topup_products")
      .select("id, slug, name, credits, price_kobo, active")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!product) return jsonResponse({ error: "Select an available Zentel AI credit pack." }, 400, request);
    const result = await createAiPaymentSession(request, context, {
      id: product.id,
      slug: product.slug,
      name: product.name,
      amountKobo: product.price_kobo,
      productType: "zentel_ai_topup",
      referencePrefix: "ZI-AI-TOPUP"
    });
    return jsonResponse(result, 200, request);
  } catch (error) {
    console.error("buy-ai-credits", (error as Error).message);
    return jsonResponse({ error: String((error as Error).message || "Credit checkout could not be opened.").slice(0, 240) }, 400, request);
  }
});
