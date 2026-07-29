import { getAuthenticatedUser, getUserAccountStatus, getUserRole } from "./security.ts";
import { createReference, initializePaystackTransaction, SITE_URL } from "./payments.ts";
import { createServiceClient } from "./supabase.ts";

type AiProduct = {
  id: string;
  slug: string;
  name: string;
  amountKobo: number;
  productType: "zentel_ai_subscription" | "zentel_ai_topup";
  referencePrefix: "ZI-AI-PLAN" | "ZI-AI-TOPUP";
  planCode?: string | null;
};

export async function requireActiveStudent(request: Request) {
  const supabase = createServiceClient();
  const auth = await getAuthenticatedUser(request, supabase);
  if (!auth.user) throw new Error(auth.error || "Authentication is required.");

  const [role, accountStatus, profileResult] = await Promise.all([
    getUserRole(supabase, auth.user.id),
    getUserAccountStatus(supabase, auth.user.id),
    supabase.from("profiles").select("full_name, phone, ai_access_status").eq("id", auth.user.id).maybeSingle()
  ]);
  if (role !== "student") throw new Error("Student access is required.");
  if (accountStatus !== "active") throw new Error("Your account is not active. Contact Zentel Insight support.");
  if (profileResult.error) throw profileResult.error;
  if (profileResult.data?.ai_access_status === "suspended") {
    throw new Error("Zentel AI access is suspended. Contact Zentel Insight support.");
  }

  const email = String(auth.user.email || "").trim().toLowerCase();
  if (!email) throw new Error("Your account email is required for payment.");
  return { supabase, user: auth.user, profile: profileResult.data || {}, email };
}

export async function paystackApi(path: string, options: RequestInit = {}) {
  const secretKey = Deno.env.get("PAYSTACK_API_KEY");
  if (!secretKey) throw new Error("Paystack server configuration is unavailable.");
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.status !== true) {
    throw new Error(String(result?.message || "Paystack request failed.").slice(0, 240));
  }
  return result.data;
}

export async function ensurePaystackMonthlyPlan(supabase: any, plan: any) {
  if (plan.provider_plan_code) return String(plan.provider_plan_code);
  const providerPlan = await paystackApi("/plan", {
    method: "POST",
    body: JSON.stringify({
      name: plan.name,
      amount: plan.monthly_price_kobo,
      interval: "monthly",
      currency: "NGN",
      send_invoices: true,
      send_sms: false,
      invoice_limit: 0
    })
  });
  const code = String(providerPlan?.plan_code || "");
  if (!code) throw new Error("Paystack did not return a subscription plan code.");
  const { error } = await supabase.from("ai_plans").update({ provider_plan_code: code }).eq("id", plan.id);
  if (error) throw error;
  return code;
}

export async function createAiPaymentSession(request: Request, context: Awaited<ReturnType<typeof requireActiveStudent>>, product: AiProduct) {
  const { supabase, user, profile, email } = context;
  const reference = createReference(product.referencePrefix);
  const metadata = {
    brand: "zentel",
    product_type: product.productType,
    product_slug: product.slug,
    user_id: user.id
  };
  const { data: payment, error: paymentError } = await supabase.from("payments").insert({
    reference,
    user_id: user.id,
    brand: "zentel",
    product_type: product.productType,
    product_key: product.slug,
    product_name: product.name,
    customer_name: String(profile.full_name || email.split("@")[0] || "Zentel learner").slice(0, 160),
    customer_email: email,
    customer_phone: String(profile.phone || ""),
    expected_amount_kobo: product.amountKobo,
    amount_kobo: product.amountKobo,
    currency: "NGN",
    status: "pending",
    provider: "paystack",
    provider_status: "pending",
    verification_status: "unverified",
    reported_status: "pending",
    fulfilment_status: "awaiting_webhook",
    ai_plan_id: product.productType === "zentel_ai_subscription" ? product.id : null,
    ai_topup_product_id: product.productType === "zentel_ai_topup" ? product.id : null,
    metadata
  }).select("*").single();
  if (paymentError) throw paymentError;

  try {
    const providerMetadata = { ...metadata, payment_id: payment.id };
    const initialized = await initializePaystackTransaction({
      email,
      amountKobo: product.amountKobo,
      reference,
      callbackUrl: `${SITE_URL}/portal/zentel-ai/usage?reference=${encodeURIComponent(reference)}`,
      metadata: providerMetadata,
      planCode: product.planCode || null
    });
    const { error: updateError } = await supabase.from("payments").update({
      status: "initialized",
      provider_status: "initialized",
      initialization_mode: "backend",
      access_code: initialized.accessCode,
      authorization_url: initialized.authorizationUrl,
      metadata: providerMetadata
    }).eq("id", payment.id);
    if (updateError) throw updateError;
    return {
      ok: true,
      paymentId: payment.id,
      reference,
      accessCode: initialized.accessCode,
      authorizationUrl: initialized.authorizationUrl,
      amountKobo: product.amountKobo,
      paystackMode: initialized.paystackMode
    };
  } catch (error) {
    await supabase.from("payments").update({
      status: "pending",
      provider_status: "initialize_failed",
      initialization_mode: "backend_failed",
      failure_reason: String((error as Error).message || "Paystack initialization failed.").slice(0, 240)
    }).eq("id", payment.id);
    throw error;
  }
}
