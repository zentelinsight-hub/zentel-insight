export const STUDYHUB_PRICES_KOBO = {
  JSS: 1500000,
  SSS: 2000000,
  SUMMER_LESSONS: 3000000
} as const;

export const STUDYHUB_SUMMER_LESSONS_KOBO = STUDYHUB_PRICES_KOBO.SUMMER_LESSONS;
export const SITE_URL = "https://zentelinsight.com.ng";

type PaystackMode = "test" | "live" | "";
type PaymentReferencePrefix = "ZI-COURSE" | "ZH-JSS" | "ZH-SSS" | "ZH-SUMMER" | "ZI-AI-PLAN" | "ZI-AI-TOPUP";

const paymentReferencePattern = /^(ZI-COURSE|ZH-JSS|ZH-SSS|ZH-SUMMER|ZI-AI-PLAN|ZI-AI-TOPUP)-\d{10,}-[A-Z0-9]{8,}$/;
const paystackSafeReferencePattern = /^[A-Za-z0-9.\-=]+$/;

export class PaystackInitializationError extends Error {
  fallbackEligible: boolean;

  constructor(message: string, fallbackEligible = true) {
    super(message);
    this.name = "PaystackInitializationError";
    this.fallbackEligible = fallbackEligible;
  }
}

export function normalizePaymentReference(...values: unknown[]) {
  const candidate = values.find((value) => typeof value === "string" && value.trim()) as string | undefined;
  if (!candidate) return "";
  const reference = candidate.trim();
  if (!paystackSafeReferencePattern.test(reference)) return "";
  return paymentReferencePattern.test(reference) ? reference : "";
}

export function normalizePaystackProviderReference(value: unknown) {
  const reference = typeof value === "string" ? value.trim() : "";
  if (!reference || reference.length > 120 || !paystackSafeReferencePattern.test(reference)) return "";
  return reference;
}

export function createReference(prefix: PaymentReferencePrefix) {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `${prefix}-${Date.now()}-${random}`;
}

export function calculateStudyHubAmountKobo(classGroup: string, subjectCount: number, months: number) {
  if (classGroup !== "JSS" && classGroup !== "SSS") {
    throw new Error("Select a valid StudyHub class group.");
  }
  if (!Number.isInteger(subjectCount) || subjectCount < 1) {
    throw new Error("Select at least one subject.");
  }
  if (!Number.isInteger(months) || months < 1) {
    throw new Error("Select at least one month.");
  }
  if (months > 12) {
    throw new Error("Select 12 months or fewer.");
  }
  return STUDYHUB_PRICES_KOBO[classGroup] * subjectCount * months;
}

export function isSafeEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

export function getPaystackModeFromKey(key: string): PaystackMode {
  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) return "live";
  return "";
}

export function assertPaystackModeCompatibility(secretKey: string, browserPublicKeyMode?: unknown) {
  const secretMode = getPaystackModeFromKey(secretKey);
  const publicMode = typeof browserPublicKeyMode === "string" ? browserPublicKeyMode : "";

  if (!secretMode) {
    throw new Error("Paystack secret key mode is invalid.");
  }

  if (publicMode && publicMode !== secretMode) {
    throw new Error("Paystack public and secret keys must use the same environment.");
  }

  return secretMode;
}

function sanitizeProviderText(value: unknown, fallback = "Paystack request failed.") {
  const text = String(value || fallback)
    .replace(/sk_(test|live)_[A-Za-z0-9]+/g, "sk_$1_[redacted]")
    .replace(/pk_(test|live)_[A-Za-z0-9]+/g, "pk_$1_[redacted]")
    .slice(0, 240);
  return text || fallback;
}

export async function initializePaystackTransaction({
  email,
  amountKobo,
  reference,
  callbackUrl,
  metadata,
  browserPublicKeyMode,
  planCode
}: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  browserPublicKeyMode?: unknown;
  planCode?: string | null;
}) {
  const paystackSecretKey = Deno.env.get("PAYSTACK_API_KEY");
  if (!paystackSecretKey) {
    throw new PaystackInitializationError("Paystack secret key is unavailable.", false);
  }

  let paystackMode: PaystackMode;
  try {
    paystackMode = assertPaystackModeCompatibility(paystackSecretKey, browserPublicKeyMode);
  } catch (error) {
    throw new PaystackInitializationError((error as Error).message || "Paystack key configuration is invalid.", false);
  }
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      amount: amountKobo,
      currency: "NGN",
      reference,
      callback_url: callbackUrl,
      metadata,
      ...(planCode ? { plan: planCode } : {})
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.status !== true || !result?.data?.access_code) {
    const message = sanitizeProviderText(result?.message, "Paystack initialization failed.");
    throw new PaystackInitializationError(message, !/invalid\s+key|secret\s+key|public\s+key/i.test(message));
  }

  return {
    accessCode: String(result.data.access_code),
    authorizationUrl: String(result.data.authorization_url || ""),
    paystackMode
  };
}

export async function verifyPaystackReference(reference: string) {
  const canonicalReference = normalizePaymentReference(reference) || normalizePaystackProviderReference(reference);
  if (!canonicalReference) {
    throw new Error("A valid payment reference is required.");
  }

  const secretKey = Deno.env.get("PAYSTACK_API_KEY");
  if (!secretKey) {
    throw new Error("Paystack secret key is unavailable.");
  }

  assertPaystackModeCompatibility(secretKey);
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(canonicalReference)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`
    }
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.status !== true) {
    throw new Error(sanitizeProviderText(result?.message, "Paystack verification request failed."));
  }

  return result;
}

export function mapProviderStatus(status: unknown) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "success") return "success";
  if (normalized === "failed") return "failed";
  if (normalized === "reversed") return "reversed";
  if (normalized === "abandoned" || normalized === "cancelled" || normalized === "canceled") return "abandoned";
  if (normalized === "ongoing" || normalized === "processing") return "processing";
  return "pending";
}

export async function hmacSha512Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqualHex(left: string, right: string) {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function getStoredAmountKobo(payment: any) {
  return Number(payment.amount_kobo || payment.expected_amount_kobo);
}

export function assertVerifiedPaymentMatchesStoredPayment(payment: any, paystackData: any) {
  const paidAmount = Number(paystackData.amount);
  const expectedAmount = getStoredAmountKobo(payment);
  const currency = String(paystackData.currency || "NGN").toUpperCase();
  const email = String(paystackData.customer?.email || "").trim().toLowerCase();
  const storedEmail = String(payment.customer_email || "").trim().toLowerCase();
  const reference = normalizePaymentReference(paystackData.reference);
  const metadata = paystackData.metadata || {};

  if (reference !== payment.reference) {
    throw new Error("Payment verification mismatch.");
  }
  if (paidAmount !== expectedAmount) {
    throw new Error("Payment verification mismatch.");
  }
  if (currency !== "NGN" || currency !== payment.currency) {
    throw new Error("Payment verification mismatch.");
  }
  if (email !== storedEmail) {
    throw new Error("Payment verification mismatch.");
  }
  if (metadata.payment_id && metadata.payment_id !== payment.id) {
    throw new Error("Payment verification mismatch.");
  }
  if (metadata.brand && metadata.brand !== payment.brand) {
    throw new Error("Payment verification mismatch.");
  }
  if (metadata.product_type && metadata.product_type !== payment.product_type) {
    throw new Error("Payment verification mismatch.");
  }
}

export async function fulfilSuccessfulPayment(supabase: any, payment: any, paystackData: any, source: string) {
  assertVerifiedPaymentMatchesStoredPayment(payment, paystackData);

  const isAiPurchase = payment.product_type === "zentel_ai_subscription" || payment.product_type === "zentel_ai_topup";
  if (payment.status === "success" && payment.fulfilment_status === "fulfilled") {
    return payment;
  }

  const paidAmount = Number(paystackData.amount);
  const providerTransactionId = String(paystackData.id || "");
  const verifiedAt = new Date().toISOString();

  const { data: updatedPayment, error: updateError } = await supabase
    .from("payments")
    .update({
      status: "success",
      provider_status: "success",
      provider_transaction_id: providerTransactionId,
      paid_amount_kobo: paidAmount,
      paystack_transaction_id: providerTransactionId,
      payment_channel: paystackData.channel || null,
      gateway_response: paystackData.gateway_response || null,
      verification_source: source,
      verification_status: "verified",
      reported_status: "success",
      verified_at: verifiedAt,
      paid_at: paystackData.paid_at || verifiedAt,
      failure_reason: null,
      fulfilment_status: "awaiting_webhook"
    })
    .eq("id", payment.id)
    .select()
    .single();

  if (updateError) throw updateError;

  if ((payment.brand === "zentel" || payment.brand === "zentel_insight") && payment.product_id) {
    const { data: level, error: levelError } = await supabase
      .from("program_levels")
      .select("id, program_id")
      .eq("id", payment.product_id)
      .maybeSingle();
    if (levelError || !level) {
      await supabase.from("payments").update({ fulfilment_status: "failed" }).eq("id", payment.id);
      throw levelError || new Error("The paid programme track could not be resolved.");
    }

    const { error: enrolmentError } = await supabase.from("enrolments").upsert(
      {
        user_id: payment.user_id || null,
        program_id: level.program_id,
        program_level_id: level.id,
        payment_id: payment.id,
        status: payment.user_id ? "active" : "paid_unlinked",
        enrolled_date: new Date().toISOString().slice(0, 10)
      },
      { onConflict: "payment_id" }
    );
    if (enrolmentError) {
      await supabase.from("payments").update({ fulfilment_status: "failed" }).eq("id", payment.id);
      throw enrolmentError;
    }
  }

  if (payment.brand === "studyhub") {
    const { error: registrationError } = await supabase
      .from("studyhub_registrations")
      .update({ status: "active" })
      .eq("payment_id", payment.id);
    if (registrationError) {
      await supabase.from("payments").update({ fulfilment_status: "failed" }).eq("id", payment.id);
      throw registrationError;
    }
  }

  if (isAiPurchase && source === "paystack_webhook") {
    const providerDetails = {
      customer_code: paystackData.customer?.customer_code || null,
      subscription_code: paystackData.subscription?.subscription_code || paystackData.subscription_code || null,
      email_token: paystackData.subscription?.email_token || paystackData.email_token || null,
      next_payment_date: paystackData.subscription?.next_payment_date || paystackData.next_payment_date || null
    };
    const { error: fulfilmentError } = await supabase.rpc("ai_apply_verified_payment", {
      target_payment_id: payment.id,
      webhook_event_key: String(paystackData.__webhook_event_key || payment.reference),
      provider_details: providerDetails
    });
    if (fulfilmentError) {
      await supabase.from("payments").update({ fulfilment_status: "failed" }).eq("id", payment.id);
      throw fulfilmentError;
    }

    const { data: fulfilledPayment, error: fulfilledPaymentError } = await supabase
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .single();
    if (fulfilledPaymentError) throw fulfilledPaymentError;
    return fulfilledPayment;
  }

  const { data: fulfilledPayment, error: fulfilmentError } = await supabase
    .from("payments")
    .update({ fulfilment_status: "fulfilled" })
    .eq("id", payment.id)
    .select()
    .single();
  if (fulfilmentError) {
    await supabase.from("payments").update({ fulfilment_status: "failed" }).eq("id", payment.id);
    throw fulfilmentError;
  }
  return fulfilledPayment || updatedPayment;
}
