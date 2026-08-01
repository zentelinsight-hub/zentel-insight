import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { assertVerifiedAdmin, writeAuditLog } from "../_shared/security.ts";

const allowedSettings = new Set([
  "emergency_disabled", "web_search_enabled", "file_uploads_enabled",
  "model_mappings", "credit_cost_unit_ngn",
  "internal_exchange_rate", "risk_multiplier", "maximum_output_tokens",
  "maximum_input_characters", "maximum_files_per_request", "maximum_file_bytes",
  "maximum_web_searches_per_request", "per_student_daily_credits",
  "per_student_daily_cost_usd", "global_daily_cost_usd", "global_monthly_cost_usd",
  "maximum_concurrent_requests", "requests_per_minute", "request_timeout_seconds"
]);

function validateSettings(updates: Record<string, unknown>) {
  const mappings = updates.model_mappings as Record<string, unknown> | undefined;
  if (mappings) {
    for (const route of ["standard", "advanced", "expert"]) {
      if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(String(mappings[route] || ""))) throw new Error("Each internal model route requires a valid model identifier.");
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`A valid value is required for ${key}.`);
  }
}

function cleanText(value: unknown, maximum = 240) {
  return String(value || "").trim().slice(0, maximum);
}

function sum(items: any[], key: string) {
  return (items || []).reduce((total, item) => total + Number(item?.[key] || 0), 0);
}

async function dashboard(supabase: any) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const inThirtyDays = new Date(Date.now() + 30 * 86400000).toISOString();
  const [plans, topups, settings, pricing, subscriptions, wallets, requests, payments] = await Promise.all([
    supabase.from("ai_plans").select("*").order("display_order"),
    supabase.from("ai_topup_products").select("*").order("display_order"),
    supabase.from("ai_system_settings").select("*").eq("id", 1).single(),
    supabase.from("ai_pricing_configuration").select("*").eq("active", true).order("model_route"),
    supabase.from("ai_subscriptions").select("*, ai_plans(id, slug, name, monthly_price_kobo, monthly_credits)").order("created_at", { ascending: false }).limit(500),
    supabase.from("ai_credit_wallets").select("*").order("total_available", { ascending: true }).limit(500),
    supabase.from("ai_requests").select("id, user_id, status, request_type, model_route, provider_cost_usd, credits_charged, error_code, created_at, completed_at").order("created_at", { ascending: false }).limit(1000),
    supabase.from("payments").select("id, user_id, product_type, amount_kobo, paid_amount_kobo, status, fulfilment_status, created_at").in("product_type", ["zentel_ai_subscription", "zentel_ai_topup"]).gte("created_at", monthStart).limit(1000)
  ]);
  const firstError = [plans, topups, settings, pricing, subscriptions, wallets, requests, payments].find((item) => item.error)?.error;
  if (firstError) throw firstError;
  const subscriptionRows = subscriptions.data || [];
  const requestRows = requests.data || [];
  const paymentRows = payments.data || [];
  const successfulPayments = paymentRows.filter((item: any) => item.status === "success" && item.fulfilment_status === "fulfilled");
  const subscriptionRevenueKobo = sum(successfulPayments.filter((item: any) => item.product_type === "zentel_ai_subscription"), "paid_amount_kobo");
  const topupRevenueKobo = sum(successfulPayments.filter((item: any) => item.product_type === "zentel_ai_topup"), "paid_amount_kobo");
  const providerCostUsd = sum(requestRows.filter((item: any) => item.status === "completed"), "provider_cost_usd");
  const active = subscriptionRows.filter((item: any) => item.status === "active");
  const routeUsage = requestRows.reduce((result: Record<string, number>, item: any) => {
    result[item.model_route] = (result[item.model_route] || 0) + 1;
    return result;
  }, {});
  return {
    plans: plans.data || [],
    topups: topups.data || [],
    settings: settings.data,
    pricing: pricing.data || [],
    subscriptions: subscriptionRows,
    wallets: wallets.data || [],
    recentRequests: requestRows.slice(0, 100),
    metrics: {
      activeSubscriptions: active.length,
      starterSubscriptions: active.filter((item: any) => item.ai_plans?.slug === "starter").length,
      plusSubscriptions: active.filter((item: any) => item.ai_plans?.slug === "plus").length,
      proSubscriptions: active.filter((item: any) => item.ai_plans?.slug === "pro").length,
      pastDueSubscriptions: subscriptionRows.filter((item: any) => item.status === "past_due").length,
      cancelledSubscriptions: subscriptionRows.filter((item: any) => item.status === "cancelled").length,
      subscriptionRevenueKobo,
      topupRevenueKobo,
      providerCostUsd,
      averageCreditsUsed: requestRows.length ? sum(requestRows, "credits_charged") / requestRows.length : 0,
      averageProviderCostPerCredit: sum(requestRows, "credits_charged") ? providerCostUsd / sum(requestRows, "credits_charged") : 0,
      failedRequests: requestRows.filter((item: any) => item.status === "failed").length,
      releasedRequests: requestRows.filter((item: any) => item.status === "refunded").length,
      webResearchRequests: requestRows.filter((item: any) => item.request_type === "web_research" || item.request_type === "advanced_research").length,
      routeUsage,
      upcomingRenewals: subscriptionRows.filter((item: any) => item.status === "active" && item.next_payment_date && item.next_payment_date <= inThirtyDays).length,
      monthlyRevenueForecastKobo: sum(active.filter((item: any) => !item.cancel_at_period_end).map((item: any) => ({ value: item.ai_plans?.monthly_price_kobo })), "value")
    }
  };
}

async function findStudent(supabase: any, query: string) {
  const normalized = cleanText(query, 254);
  if (!normalized) throw new Error("Enter a Student Portal ID or email address.");
  let profileQuery = supabase.from("profiles").select("id, portal_id, full_name, email, phone, account_status, ai_access_status, created_at");
  profileQuery = normalized.includes("@")
    ? profileQuery.ilike("email", normalized)
    : profileQuery.ilike("portal_id", normalized);
  const { data: profile, error } = await profileQuery.limit(1).maybeSingle();
  if (error) throw error;
  if (!profile) return null;
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", profile.id).maybeSingle();
  if (role?.role !== "student") return null;
  const [subscription, wallet, requests, ledger] = await Promise.all([
    supabase.from("ai_subscriptions").select("*, ai_plans(*)").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_credit_wallets").select("*").eq("user_id", profile.id).maybeSingle(),
    supabase.from("ai_requests").select("id, status, request_type, model_route, credits_charged, provider_cost_usd, error_code, created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_credit_ledger").select("id, transaction_type, credit_source, credits, balance_before, balance_after, description, created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(50)
  ]);
  const firstError = [subscription, wallet, requests, ledger].find((item) => item.error)?.error;
  if (firstError) throw firstError;
  return { profile, subscription: subscription.data, wallet: wallet.data, requests: requests.data || [], ledger: ledger.data || [] };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);
  const admin = await assertVerifiedAdmin(request);
  if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status, request);
  try {
    const body = await request.json().catch(() => ({}));
    const action = cleanText(body.action || "dashboard", 60);
    if (action === "dashboard") return jsonResponse({ ok: true, data: await dashboard(admin.supabase) }, 200, request);
    if (action === "find_student") return jsonResponse({ ok: true, data: await findStudent(admin.supabase, body.query) }, 200, request);

    if (action === "adjust_credits") {
      const targetUserId = cleanText(body.userId, 64);
      const delta = Number(body.delta);
      const reason = cleanText(body.reason);
      if (!targetUserId || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000 || reason.length < 4) throw new Error("Enter a valid credit adjustment and reason.");
      const sourceKey = crypto.randomUUID();
      const { data, error } = await admin.supabase.rpc("ai_admin_adjust_credits", {
        target_user_id: targetUserId,
        credit_delta: delta,
        source_key_value: sourceKey,
        description_value: reason
      });
      if (error) throw error;
      await writeAuditLog(admin.supabase, { actorUserId: admin.user.id, action: "ai_credit_adjusted", targetTable: "ai_credit_wallets", targetId: targetUserId, metadata: { delta, reason, sourceKey } });
      return jsonResponse({ ok: true, data }, 200, request);
    }

    if (action === "set_access") {
      const targetUserId = cleanText(body.userId, 64);
      const status = body.status === "suspended" ? "suspended" : body.status === "active" ? "active" : "";
      if (!targetUserId || !status) throw new Error("Select a valid Zentel AI access state.");
      const { data, error } = await admin.supabase.from("profiles").update({ ai_access_status: status }).eq("id", targetUserId).select("id, ai_access_status").single();
      if (error) throw error;
      await admin.supabase.from("portal_notifications").insert({ user_id: targetUserId, title: `Zentel AI access ${status}`, message: status === "active" ? "Your Zentel AI access has been restored." : "Your Zentel AI access has been suspended. Contact Zentel Insight support for help.", notification_type: "zentel_ai_access", link_path: "/portal/zentel-ai" });
      await writeAuditLog(admin.supabase, { actorUserId: admin.user.id, action: `ai_access_${status}`, targetTable: "profiles", targetId: targetUserId });
      return jsonResponse({ ok: true, data }, 200, request);
    }

    if (action === "change_plan") {
      const targetUserId = cleanText(body.userId, 64);
      const planId = cleanText(body.planId, 64);
      const { data: plan, error: planError } = await admin.supabase.from("ai_plans").select("id, name").eq("id", planId).eq("active", true).single();
      if (planError) throw planError;
      const { data, error } = await admin.supabase.from("ai_subscriptions").update({ plan_id: plan.id }).eq("user_id", targetUserId).in("status", ["active", "past_due", "suspended"]).select("*").single();
      if (error) throw error;
      await admin.supabase.from("portal_notifications").insert({ user_id: targetUserId, title: "Zentel AI plan updated", message: `Your Zentel AI plan is now ${plan.name}.`, notification_type: "zentel_ai_subscription", link_path: "/portal/zentel-ai/usage" });
      await writeAuditLog(admin.supabase, { actorUserId: admin.user.id, action: "ai_plan_changed", targetTable: "ai_subscriptions", targetId: data.id, metadata: { targetUserId, planId } });
      return jsonResponse({ ok: true, data }, 200, request);
    }

    if (action === "update_settings") {
      const updates = Object.fromEntries(Object.entries(body.values || {}).filter(([key]) => allowedSettings.has(key)));
      if (!Object.keys(updates).length) throw new Error("No valid Zentel AI settings were supplied.");
      validateSettings(updates);
      const { data, error } = await admin.supabase.from("ai_system_settings").update({ ...updates, trial_enabled: false, trial_credits: 0, updated_by: admin.user.id }).eq("id", 1).select("*").single();
      if (error) throw error;
      await writeAuditLog(admin.supabase, { actorUserId: admin.user.id, action: "ai_settings_updated", targetTable: "ai_system_settings", targetId: "1", metadata: { fields: Object.keys(updates) } });
      return jsonResponse({ ok: true, data }, 200, request);
    }

    if (action === "update_plan") {
      const planId = cleanText(body.planId, 64);
      const values = body.values || {};
      const updates = {
        name: cleanText(values.name, 100),
        description: cleanText(values.description, 500),
        badge: cleanText(values.badge, 100),
        monthly_price_kobo: Number(values.monthly_price_kobo),
        monthly_credits: Number(values.monthly_credits),
        maximum_request_credits: Number(values.maximum_request_credits),
        active: values.active !== false
      };
      if (!planId || !updates.name || !Number.isInteger(updates.monthly_price_kobo) || updates.monthly_price_kobo < 10000 || !Number.isInteger(updates.monthly_credits) || updates.monthly_credits < 1 || !Number.isInteger(updates.maximum_request_credits) || updates.maximum_request_credits < 1) throw new Error("Enter valid plan details.");
      const { data, error } = await admin.supabase.from("ai_plans").update({ ...updates, provider_plan_code: null }).eq("id", planId).select("*").single();
      if (error) throw error;
      await writeAuditLog(admin.supabase, { actorUserId: admin.user.id, action: "ai_plan_updated", targetTable: "ai_plans", targetId: planId, metadata: { fields: Object.keys(updates) } });
      return jsonResponse({ ok: true, data }, 200, request);
    }

    if (action === "update_topup") {
      const productId = cleanText(body.productId, 64);
      const values = body.values || {};
      const updates = { name: cleanText(values.name, 100), credits: Number(values.credits), price_kobo: Number(values.price_kobo), validity_days: Number(values.validity_days), active: values.active !== false };
      if (!productId || !updates.name || !Number.isInteger(updates.credits) || updates.credits < 1 || !Number.isInteger(updates.price_kobo) || updates.price_kobo < 10000 || !Number.isInteger(updates.validity_days) || updates.validity_days < 1 || updates.validity_days > 365) throw new Error("Enter valid credit-pack details.");
      const { data, error } = await admin.supabase.from("ai_topup_products").update(updates).eq("id", productId).select("*").single();
      if (error) throw error;
      await writeAuditLog(admin.supabase, { actorUserId: admin.user.id, action: "ai_topup_updated", targetTable: "ai_topup_products", targetId: productId, metadata: { fields: Object.keys(updates) } });
      return jsonResponse({ ok: true, data }, 200, request);
    }

    return jsonResponse({ error: "Unknown Zentel AI admin action." }, 400, request);
  } catch (error) {
    console.error("admin-manage-ai", (error as Error).message);
    return jsonResponse({ error: String((error as Error).message || "Zentel AI admin action failed.").slice(0, 240) }, 400, request);
  }
});
