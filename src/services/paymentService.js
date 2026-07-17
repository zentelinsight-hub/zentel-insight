import PaystackPop from "@paystack/inline-js";
import { isValidEmail } from "../utils/format";
import {
  COURSE_PAYMENT_TYPE,
  STUDYHUB_PAYMENT_TYPE,
  normalizePaymentReference
} from "../utils/paymentCalculations";
import { getSupabaseClient } from "./supabaseClient";

const requestTimeoutMs = 15000;
const paymentAttemptTimeoutMessage = "We could not create a secure payment attempt. No payment has been charged. Please try again.";

function readEnvValue(key) {
  return String(import.meta.env[key] || "").trim();
}

export function getPaystackPublicKey() {
  return readEnvValue("VITE_PAYSTACK_PUBLIC_KEY");
}

function getSupabasePublicKey() {
  return readEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY");
}

function getSupabaseFunctionUrl(functionName, explicitEndpoint) {
  if (explicitEndpoint) return explicitEndpoint;
  const supabaseUrl = readEnvValue("VITE_SUPABASE_URL");
  if (!supabaseUrl) return "";
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`;
}

export function getPaystackPublicKeyMode(publicKey = getPaystackPublicKey()) {
  if (publicKey.startsWith("pk_test_")) return "test";
  if (publicKey.startsWith("pk_live_")) return "live";
  return "";
}

function isPlaceholderPublicKey(publicKey) {
  return !publicKey || publicKey === "pk_test_replace_me" || publicKey === "pk_live_replace_me";
}

export function getPaymentEnvironmentStatus(env = import.meta.env) {
  const supabaseUrl = String(env.VITE_SUPABASE_URL || "").trim();
  const supabaseKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const publicKey = String(env.VITE_PAYSTACK_PUBLIC_KEY || "").trim();
  const siteUrl = String(env.VITE_SITE_URL || "").trim();
  const paystackMode = getPaystackPublicKeyMode(publicKey);

  return {
    supabaseConfigured: Boolean(supabaseUrl && supabaseKey),
    siteUrlConfigured: Boolean(siteUrl),
    paystackPublicKeyConfigured: Boolean(!isPlaceholderPublicKey(publicKey) && paystackMode),
    paystackMode
  };
}

export function isPaymentConfigured() {
  return getPaymentEnvironmentStatus().supabaseConfigured;
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

function getErrorMessageFromResponse(result, fallback = paymentAttemptTimeoutMessage) {
  if (result?.error && typeof result.error === "string") return result.error;
  if (result?.message && typeof result.message === "string") return result.message;
  return fallback;
}

async function getAuthorizationToken() {
  const publicKey = getSupabasePublicKey();
  let token = publicKey;

  try {
    const supabase = await getSupabaseClient();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    token = data?.session?.access_token || publicKey;
  } catch {
    token = publicKey;
  }

  return token;
}

function getStudyHubProductType(studyHub = {}) {
  if (studyHub.productType === "studyhub_summer_lessons") return "studyhub_summer_lessons";
  if (studyHub.classGroup === "SSS" || String(studyHub.classLevel || "").startsWith("SSS")) return "studyhub_sss";
  return "studyhub_jss";
}

function buildPaymentPayload({ item, customer }) {
  const customerName = customer.name.trim();
  const customerEmail = customer.email.trim().toLowerCase();
  const customerPhone = customer.phone.trim();
  const paymentType = item.paymentType || COURSE_PAYMENT_TYPE;
  const publicKey = getPaystackPublicKey();

  const shared = {
    customer: {
      fullName: customerName,
      email: customerEmail,
      phone: customerPhone
    },
    customerName,
    customerEmail,
    customerPhone,
    paystackPublicKeyConfigured: Boolean(!isPlaceholderPublicKey(publicKey) && getPaystackPublicKeyMode(publicKey)),
    paystackPublicKeyMode: getPaystackPublicKeyMode(publicKey) || null
  };

  if (paymentType === STUDYHUB_PAYMENT_TYPE) {
    const studyHub = item.studyHub || {};
    const subjects = Array.isArray(studyHub.subjects) ? studyHub.subjects : [];
    const productType = getStudyHubProductType(studyHub);

    return {
      ...shared,
      brand: "studyhub",
      productType,
      customer: {
        ...shared.customer,
        studentName: customer.studentName?.trim() || customerName
      },
      studentName: customer.studentName?.trim() || customerName,
      parentName: customer.parentName?.trim() || customerName,
      classGroup: studyHub.classGroup,
      classLevel: studyHub.classLevel,
      subjectIds: subjects,
      subjects,
      months: productType === "studyhub_summer_lessons" ? 1 : studyHub.months,
      learningPriority: studyHub.learningPriority || ""
    };
  }

  return {
    ...shared,
    brand: "zentel_insight",
    productType: COURSE_PAYMENT_TYPE,
    programSlug: item.programSlug,
    trackSlug: item.levelSlug,
    levelSlug: item.levelSlug,
    level: item.level
  };
}

export function validatePaymentRequest({ item, customer }) {
  const paymentType = item?.paymentType || COURSE_PAYMENT_TYPE;
  const hasStudyHubProduct = paymentType === STUDYHUB_PAYMENT_TYPE && item?.studyHub?.productType;
  const hasCourseProduct = paymentType !== STUDYHUB_PAYMENT_TYPE && item?.programSlug && item?.levelSlug;

  if (!item || (!hasStudyHubProduct && !hasCourseProduct)) {
    throw new Error("This programme or payment option is unavailable. Return to the programmes page and choose a valid option.");
  }

  if (!customer?.name?.trim() || !isValidEmail(customer?.email) || !customer?.phone?.trim() || customer.phone.trim().length < 7) {
    throw new Error("Please complete the required payment information.");
  }

  return true;
}

function normalizeSession(result) {
  const reference = normalizePaymentReference(result?.reference, result?.trxref);
  const amountKobo = Number(result?.amountKobo);
  const mode = result?.mode || (result?.accessCode ? "backend" : "");

  if (!reference || !Number.isFinite(amountKobo) || amountKobo <= 0) {
    throw new Error("The payment server returned an incomplete payment session. No payment has been charged. Please try again.");
  }

  if (mode === "backend" && !result.accessCode) {
    throw new Error("Paystack could not be opened. No payment has been charged. Please check your connection and try again.");
  }

  if (mode === "frontend_fallback" && !result.email) {
    throw new Error("The payment fallback response was incomplete. No payment has been charged. Please try again.");
  }

  if (!["backend", "frontend_fallback"].includes(mode)) {
    throw new Error("The payment server did not return a supported Paystack session. No payment has been charged.");
  }

  return {
    ok: Boolean(result.ok),
    mode,
    paymentId: result.paymentId || "",
    reference,
    accessCode: result.accessCode || "",
    authorizationUrl: result.authorizationUrl || "",
    email: String(result.email || "").trim().toLowerCase(),
    amountKobo,
    currency: result.currency || "NGN",
    brand: result.brand === "studyhub" ? "studyhub" : "zentel_insight",
    metadata: result.metadata || {}
  };
}

export async function verifyPayment(reference) {
  const canonicalReference = normalizePaymentReference(reference);
  if (!canonicalReference) {
    return {
      verified: false,
      configured: true,
      status: "invalid_reference",
      message: "A valid payment reference is required."
    };
  }

  const endpoint = getSupabaseFunctionUrl("verify-payment", readEnvValue("VITE_PAYMENT_VERIFICATION_ENDPOINT"));

  if (!endpoint) {
    return {
      verified: false,
      configured: false,
      status: "pending",
      reference: canonicalReference,
      message: "Your payment confirmation is still being checked. Keep your reference and use Check Again shortly."
    };
  }

  const publicKey = getSupabasePublicKey();
  const response = await withTimeout(fetch(endpoint, {
    method: "POST",
    headers: {
      ...(publicKey ? { apikey: publicKey, Authorization: `Bearer ${publicKey}` } : {}),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reference: canonicalReference })
  }), "Payment verification timed out. Please check again.");

  const result = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 404) {
    throw new Error(getErrorMessageFromResponse(result, "Payment verification is temporarily unavailable."));
  }

  return {
    verified: Boolean(result.verified || result.status === "success"),
    configured: true,
    status: result.status || (response.status === 404 ? "invalid_reference" : "pending"),
    message: result.message || "The transaction was checked successfully.",
    reference: normalizePaymentReference(result.reference, canonicalReference),
    payment: result.payment || null,
    brand: result.payment?.brand || result.brand || "",
    amountKobo: result.payment?.amount_kobo || result.payment?.expected_amount_kobo || null
  };
}

export async function createPaymentSession({ item, customer }) {
  const endpoint = getSupabaseFunctionUrl("create-payment-session", readEnvValue("VITE_PAYMENT_SESSION_ENDPOINT"));
  if (!endpoint) {
    throw new Error(paymentAttemptTimeoutMessage);
  }

  validatePaymentRequest({ item, customer });

  const publicKey = getSupabasePublicKey();
  const token = await getAuthorizationToken();
  const payload = buildPaymentPayload({ item, customer });

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
    if (!response.ok || result?.ok === false) {
      const error = new Error(getErrorMessageFromResponse(result));
      const reference = normalizePaymentReference(result?.reference);
      if (reference) error.paymentReference = reference;
      throw error;
    }

    return normalizeSession(result);
  } catch (error) {
    if (error?.message && error.message !== "Failed to fetch") throw error;
    throw new Error(paymentAttemptTimeoutMessage);
  }
}

function createPopupCallbacks({ session, item, customer, onSuccess, onCancel, onError }) {
  let completed = false;
  const transactionSnapshot = {
    reference: session.reference,
    item,
    customer,
    amount: session.amountKobo / 100,
    amountKobo: session.amountKobo,
    date: new Date().toISOString(),
    brand: session.brand,
    mode: session.mode
  };

  return {
    onSuccess(transaction) {
      completed = true;
      const callbackReference = normalizePaymentReference(transaction?.reference, transaction?.trxref, session.reference);
      if (callbackReference !== session.reference) {
        onError?.(
          new Error("Paystack returned an unexpected reference. Keep your payment reference and contact support."),
          transactionSnapshot
        );
        return;
      }
      onSuccess?.({
        ...transactionSnapshot,
        reference: session.reference,
        status: "pending",
        paystackTransactionId: transaction?.id || null
      });
    },
    onCancel() {
      if (!completed) {
        onCancel?.("The payment window was closed before completion.", transactionSnapshot);
      }
    },
    onError(error) {
      onError?.(
        new Error(error?.message || "Paystack could not be opened. No payment has been charged. Please check your connection and try again."),
        transactionSnapshot
      );
    }
  };
}

export async function startPaystackPayment({ item, customer, onSuccess, onCancel, onError }) {
  validatePaymentRequest({ item, customer });

  const session = await createPaymentSession({ item, customer });
  const callbacks = createPopupCallbacks({ session, item, customer, onSuccess, onCancel, onError });

  if (session.mode === "backend") {
    const popup = new PaystackPop();
    popup.resumeTransaction(session.accessCode, callbacks);
    return session;
  }

  const publicKey = getPaystackPublicKey();
  if (isPlaceholderPublicKey(publicKey) || !getPaystackPublicKeyMode(publicKey)) {
    const error = new Error("Online payment configuration is incomplete. Please contact support and provide the payment reference shown below.");
    error.paymentReference = session.reference;
    throw error;
  }

  const popup = new PaystackPop();
  popup.newTransaction({
    key: publicKey,
    email: session.email,
    amount: session.amountKobo,
    currency: session.currency,
    reference: session.reference,
    metadata: session.metadata,
    ...callbacks
  });

  return session;
}
