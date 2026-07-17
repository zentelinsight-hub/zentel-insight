import { isValidEmail } from "../utils/format";
import { COURSE_PAYMENT_TYPE, STUDYHUB_PAYMENT_TYPE, nairaToKobo } from "../utils/paymentCalculations";
import { getSupabaseClient } from "./supabaseClient";

const paystackScriptUrl = "https://js.paystack.co/v1/inline.js";
let paystackScriptPromise;
const requestTimeoutMs = 15000;

function getPaystackPublicKey() {
  return import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";
}

function getSupabaseFunctionUrl(functionName, explicitEndpoint) {
  if (explicitEndpoint) return explicitEndpoint;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return "";
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`;
}

function getSupabasePublicKey() {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
}

function getPaymentReferencePrefix(item) {
  return (item.paymentType || COURSE_PAYMENT_TYPE) === STUDYHUB_PAYMENT_TYPE ? "ZISH" : "ZI";
}

function getClientAmountKobo(item) {
  const amountKobo = item.priceKobo || nairaToKobo(item.price);
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
    throw new Error("Select a valid programme with an approved payment amount.");
  }
  return amountKobo;
}

function getErrorSummary(error) {
  if (!error) return "unknown payment-session error";
  return error.message || String(error);
}

function logPaymentFallback(reason) {
  if (!import.meta.env.DEV) return;
  console.warn("Payment session service unavailable; using frontend Paystack fallback.", {
    reason: getErrorSummary(reason)
  });
}

export function createFrontendPaymentSession({ item, reason }) {
  logPaymentFallback(reason);
  return {
    reference: createTransactionReference(getPaymentReferencePrefix(item)),
    amountKobo: getClientAmountKobo(item),
    currency: "NGN",
    frontendOnly: true
  };
}

async function withTimeout(promise, message, timeoutMs = requestTimeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function loadPaystackScript() {
  if (window.PaystackPop) return Promise.resolve();

  if (!paystackScriptPromise) {
    paystackScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${paystackScriptUrl}"]`);
      if (existingScript) {
        existingScript.addEventListener("load", resolve, { once: true });
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = paystackScriptUrl;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Payment service could not be loaded. Please check your connection."));
      document.head.appendChild(script);
    });
  }

  return paystackScriptPromise;
}

export function isPaymentConfigured() {
  const publicKey = getPaystackPublicKey();
  return Boolean(publicKey && publicKey !== "pk_test_replace_me");
}

export function createTransactionReference(prefix = "ZI") {
  const randomPart = Math.random().toString(36).slice(2, 9).toUpperCase();
  return `${prefix}-${Date.now()}-${randomPart}`;
}

export function validatePaymentRequest({ item, customer }) {
  if (!item || !Number.isFinite(item.price)) {
    throw new Error("Select a valid programme with an approved payment amount.");
  }

  if (!customer?.name?.trim()) {
    throw new Error("Enter the payer's full name.");
  }

  if (!isValidEmail(customer?.email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!customer?.phone?.trim() || customer.phone.trim().length < 7) {
    throw new Error("Enter a valid phone number.");
  }

  return true;
}

export async function verifyPayment(reference) {
  const endpoint = getSupabaseFunctionUrl("verify-payment", import.meta.env.VITE_PAYMENT_VERIFICATION_ENDPOINT);

  if (!endpoint) {
    return {
      verified: false,
      configured: false,
      message: "Payment confirmation is pending."
    };
  }

  const publicKey = getSupabasePublicKey();
  const response = await withTimeout(fetch(endpoint, {
    method: "POST",
    headers: {
      ...(publicKey ? { apikey: publicKey, Authorization: `Bearer ${publicKey}` } : {}),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reference })
  }), "Payment verification timed out. Please check again.");

  if (!response.ok) {
    throw new Error("The server could not verify this transaction yet.");
  }

  const result = await response.json();
  return {
    verified: Boolean(result.verified || result.status === "success"),
    configured: true,
    message: result.message || "The transaction was checked successfully."
  };
}

export async function createPaymentSession({ item, customer }) {
  const endpoint = getSupabaseFunctionUrl("create-payment-session", import.meta.env.VITE_PAYMENT_SESSION_ENDPOINT);
  if (!endpoint) {
    return createFrontendPaymentSession({
      item,
      reason: new Error("Payment session service is unavailable.")
    });
  }

  const publicKey = getSupabasePublicKey();
  let token = publicKey;

  try {
    const supabase = await getSupabaseClient();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    token = data?.session?.access_token || publicKey;
  } catch (error) {
    logPaymentFallback(error);
  }

  const paymentType = item.paymentType || COURSE_PAYMENT_TYPE;
  const payload =
    paymentType === STUDYHUB_PAYMENT_TYPE
      ? {
          brand: "studyhub",
          customerName: customer.name.trim(),
          customerEmail: customer.email.trim().toLowerCase(),
          customerPhone: customer.phone.trim(),
          studentName: customer.studentName?.trim() || customer.name.trim(),
          parentName: customer.parentName?.trim() || customer.name.trim(),
          productType: item.studyHub?.productType || STUDYHUB_PAYMENT_TYPE,
          classGroup: item.studyHub?.classGroup,
          classLevel: item.studyHub?.classLevel,
          subjects: item.studyHub?.subjects || [],
          months: item.studyHub?.months,
          learningPriority: item.studyHub?.learningPriority || ""
        }
      : {
          brand: "zentel_insight",
          productType: COURSE_PAYMENT_TYPE,
          customerName: customer.name.trim(),
          customerEmail: customer.email.trim().toLowerCase(),
          customerPhone: customer.phone.trim(),
          programSlug: item.programSlug,
          levelSlug: item.levelSlug,
          level: item.level
        };

  try {
    const response = await withTimeout(fetch(endpoint, {
      method: "POST",
      headers: {
        ...(publicKey ? { apikey: publicKey } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }), "Payment session creation timed out. Please try again.");

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return createFrontendPaymentSession({
        item,
        reason: new Error(result.error || "Payment session could not be created.")
      });
    }

    if (!result.reference || !Number.isFinite(result.amountKobo)) {
      return createFrontendPaymentSession({
        item,
        reason: new Error("Payment session response was incomplete.")
      });
    }

    return result;
  } catch (error) {
    return createFrontendPaymentSession({ item, reason: error });
  }
}

export async function startPaystackPayment({ item, customer, onSuccess, onCancel }) {
  validatePaymentRequest({ item, customer });

  const publicKey = getPaystackPublicKey();
  if (!isPaymentConfigured()) {
    throw new Error("Live payment is not available yet.");
  }

  await loadPaystackScript();
  const session = await createPaymentSession({ item, customer });
  const paymentType = item.paymentType || COURSE_PAYMENT_TYPE;
  const reference = session.reference;
  const amountKobo = session.amountKobo || item.priceKobo || nairaToKobo(item.price);
  let completed = false;

  const handler = window.PaystackPop.setup({
    key: publicKey,
    email: customer.email.trim(),
    firstname: customer.name.trim().split(" ")[0],
    amount: amountKobo,
    currency: session.currency || "NGN",
    ref: reference,
    metadata: {
      custom_fields: [
        {
          display_name: "Programme",
          variable_name: "program",
          value: item.title
        },
        {
          display_name: "Payment Type",
          variable_name: "payment_type",
          value: paymentType
        }
      ]
    },
    callback: (response) => {
      completed = true;
      onSuccess?.({
        reference: response.reference || reference,
        status: response.status || "success",
        item,
        customer,
        amount: amountKobo / 100,
        date: new Date().toISOString()
      });
    },
    onClose: () => {
      if (!completed) {
        onCancel?.("The payment window was closed before completion.", {
          reference,
          item,
          customer,
          amount: amountKobo / 100,
          date: new Date().toISOString()
        });
      }
    }
  });

  handler.openIframe();
  return { reference, amountKobo, currency: session.currency || "NGN" };
}
