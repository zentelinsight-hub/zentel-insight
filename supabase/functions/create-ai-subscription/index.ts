import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { createAiPaymentSession, ensurePaystackMonthlyPlan, requireActiveStudent } from "../_shared/aiPayments.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);
  try {
    const context = await requireActiveStudent(request);
    const body = await request.json().catch(() => ({}));
    const slug = String(body.planSlug || "").trim().toLowerCase();
    const { data: plan, error } = await context.supabase
      .from("ai_plans")
      .select("id, slug, name, monthly_price_kobo, provider_plan_code, active")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!plan) return jsonResponse({ error: "Select an available Zentel AI plan." }, 400, request);
    const planCode = await ensurePaystackMonthlyPlan(context.supabase, plan);
    const result = await createAiPaymentSession(request, context, {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      amountKobo: plan.monthly_price_kobo,
      productType: "zentel_ai_subscription",
      referencePrefix: "ZI-AI-PLAN",
      planCode
    });
    return jsonResponse(result, 200, request);
  } catch (error) {
    console.error("create-ai-subscription", (error as Error).message);
    return jsonResponse({ error: String((error as Error).message || "Subscription checkout could not be opened.").slice(0, 240) }, 400, request);
  }
});
