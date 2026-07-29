import { studyHubPricing } from "../data/programs";
import { getSupabaseClient } from "./supabaseClient";
import { invokeEdgeFunction } from "./edgeFunctionClient";
import { isValidEmail } from "../utils/format";
import {
  COURSE_PAYMENT_TYPE,
  STUDYHUB_PAYMENT_TYPE,
  STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE,
  calculateStudyHubPrice,
  nairaToKobo,
  normalizePaymentReference
} from "../utils/paymentCalculations";

export const PENDING_PAYMENT_STORAGE_KEY = "zentel_pending_payment";
export const PAYMENT_RETRY_STORAGE_KEY = "zentel_payment_retry_queue";
const ATTEMPT_WRITE_TIMEOUT_MS = 4500;

function readEnvValue(key) {
  return String(import.meta.env[key] || "").trim();
}

export function getPaystackPublicKey() {
  return readEnvValue("VITE_PAYSTACK_PUBLIC_KEY");
}

export function getPaystackPublicKeyMode(publicKey = getPaystackPublicKey()) {
  if (publicKey.startsWith("pk_test_")) return "test";
  if (publicKey.startsWith("pk_live_")) return "live";
  return "";
}

export function verifyPaymentReference(reference) {
  const safeReference = normalizePaymentReference(reference);
  if (!safeReference) return Promise.reject(new Error("A valid payment reference is required."));
  return invokeEdgeFunction("verify-payment", {
    body: { reference: safeReference },
    requireSession: false,
    timeoutMs: 30000,
    unavailableMessage: "Payment confirmation is temporarily unavailable. Keep your reference and try again shortly.",
    failureMessage: "Payment confirmation could not be completed. Keep your reference and try again shortly."
  });
}

function isPaymentDebugEnabled() {
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage?.getItem("zentel_payment_debug") === "true";
  } catch {
    return false;
  }
}

function logPaystackStatus(publicKey) {
  if (!isPaymentDebugEnabled()) return;
  console.info("[paystack]", {
    configured: Boolean(publicKey),
    mode: getPaystackPublicKeyMode(publicKey) || "invalid"
  });
}

export function getPaymentEnvironmentStatus(env = import.meta.env) {
  const publicKey = String(env.VITE_PAYSTACK_PUBLIC_KEY || "").trim();
  const mode = getPaystackPublicKeyMode(publicKey);

  return {
    paystackPublicKeyConfigured: Boolean(publicKey && mode),
    paystackMode: mode
  };
}

export function isPaymentConfigured() {
  return getPaymentEnvironmentStatus().paystackPublicKeyConfigured;
}

function getClassGroup(classLevel) {
  return String(classLevel || "").startsWith("SSS") ? "SSS" : "JSS";
}

function generateRandomReferencePart() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint32Array(2)))
      .map((value) => value.toString(36).toUpperCase().padStart(6, "0"))
      .join("")
      .slice(0, 10);
  }
  return Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(10, "0");
}

export function generatePaymentReference(prefix) {
  return `${prefix}-${Date.now()}-${generateRandomReferencePart()}`;
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function getTemporaryRecord(reference) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    return record?.reference === reference ? record : null;
  } catch {
    return null;
  }
}

export function readTemporaryPayment(reference) {
  const canonicalReference = normalizePaymentReference(reference);
  if (!canonicalReference) return null;
  return getTemporaryRecord(canonicalReference);
}

export function saveTemporaryPayment(record) {
  if (typeof window === "undefined") return record;
  const sanitizedRecord = {
    reference: record.reference,
    brand: record.brand,
    productType: record.productType,
    productTitle: record.productTitle || "",
    programSlug: record.programSlug || "",
    trackSlug: record.trackSlug || "",
    trackName: record.trackName || "",
    classLevel: record.classLevel || "",
    subjectNames: Array.isArray(record.subjectNames) ? record.subjectNames : [],
    months: record.months || null,
    customerName: record.customerName || "",
    studentName: record.studentName || "",
    customerEmail: record.customerEmail || "",
    customerPhone: record.customerPhone || "",
    amountKobo: record.amountKobo,
    currency: "NGN",
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    temporaryStatus: record.temporaryStatus || "pending",
    failureReason: record.failureReason || "",
    reportedStatus: record.reportedStatus || record.temporaryStatus || "initiated",
    verificationStatus: record.verificationStatus || "unverified",
    attemptPersisted: Boolean(record.attemptPersisted)
  };
  if (record.paymentId) sanitizedRecord.paymentId = record.paymentId;
  if (record.providerMode) sanitizedRecord.providerMode = record.providerMode;
  if (record.clientEventToken) sanitizedRecord.clientEventToken = record.clientEventToken;

  window.sessionStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, JSON.stringify(sanitizedRecord));
  return sanitizedRecord;
}

function updateTemporaryPayment(reference, updates) {
  const current = readTemporaryPayment(reference);
  if (!current) return null;
  return saveTemporaryPayment({ ...current, ...updates });
}

function resolveStudyHubCheckout(item, customer) {
  const studyHub = item.studyHub || {};
  const productType =
    studyHub.productType === STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE
      ? STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE
      : getClassGroup(studyHub.classLevel) === "SSS"
        ? "studyhub_sss"
        : "studyhub_jss";
  const isSummerLessons = productType === STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE;
  const classLevel = sanitizeText(studyHub.classLevel);
  const classGroup = getClassGroup(classLevel || studyHub.classGroup);
  const subjectNames = isSummerLessons ? [] : (Array.isArray(studyHub.subjects) ? studyHub.subjects.map(sanitizeText).filter(Boolean) : []);
  const months = isSummerLessons ? 1 : Number(studyHub.months);

  if (!classLevel) throw new Error("Select a class.");
  if (!isSummerLessons && !subjectNames.length) throw new Error("Select at least one subject.");
  if (!isSummerLessons && (!Number.isInteger(months) || months < 1 || months > 12)) {
    throw new Error("Select between 1 and 12 months.");
  }

  const amountKobo = isSummerLessons
    ? studyHubPricing.summerLessons.priceKobo
    : nairaToKobo(calculateStudyHubPrice(classGroup, subjectNames.length, months));

  const referencePrefix = isSummerLessons ? "ZH-SUMMER" : classGroup === "SSS" ? "ZH-SSS" : "ZH-JSS";
  return {
    brand: "studyhub",
    productType,
    productTitle: isSummerLessons ? "Summer Lessons" : `StudyHub ${classGroup}`,
    classLevel,
    subjectNames,
    months,
    amountKobo,
    referencePrefix,
    customerName: customer.name.trim(),
    studentName: customer.studentName?.trim() || "",
    customerEmail: customer.email.trim().toLowerCase(),
    customerPhone: customer.phone.trim()
  };
}

function resolveMainCheckout(item, customer) {
  const selected = {
    programId: sanitizeText(item?.programId),
    trackId: sanitizeText(item?.trackId),
    programSlug: sanitizeText(item?.programSlug),
    levelSlug: sanitizeText(item?.levelSlug),
    programTitle: sanitizeText(item?.programTitle || item?.productTitle),
    level: sanitizeText(item?.level || item?.trackName),
    priceKobo: Number(item?.priceKobo || 0),
    price: Number(item?.price || 0)
  };
  const amountKobo = selected.priceKobo || nairaToKobo(selected.price || 0);

  return {
    brand: "zentel_insight",
    productType: COURSE_PAYMENT_TYPE,
    productTitle: selected.programTitle || "Zentel Insight programme",
    programId: selected.programId,
    trackId: selected.trackId,
    programSlug: selected.programSlug,
    trackSlug: selected.levelSlug,
    trackName: selected.level || "Selected track",
    amountKobo,
    referencePrefix: "ZI-COURSE",
    customerName: customer.name.trim(),
    customerEmail: customer.email.trim().toLowerCase(),
    customerPhone: customer.phone.trim()
  };
}

function resolveTrustedCheckout(item, customer) {
  const paymentType = item?.paymentType || COURSE_PAYMENT_TYPE;
  return paymentType === STUDYHUB_PAYMENT_TYPE
    ? resolveStudyHubCheckout(item, customer)
    : resolveMainCheckout(item, customer);
}

export function validatePaymentRequest({ item, customer }) {
  if (!item) {
    throw new Error("This programme or payment option is unavailable. Return to the programmes page and choose a valid option.");
  }

  if (!customer?.name?.trim() || !isValidEmail(customer?.email) || !customer?.phone?.trim() || customer.phone.trim().length < 7) {
    throw new Error("Please complete the required payment information.");
  }

  if ((item.paymentType || COURSE_PAYMENT_TYPE) === STUDYHUB_PAYMENT_TYPE && !customer?.studentName?.trim()) {
    throw new Error("Enter the student's name.");
  }

  const trustedCheckout = resolveTrustedCheckout(item, customer);
  if (
    (item.paymentType || COURSE_PAYMENT_TYPE) !== STUDYHUB_PAYMENT_TYPE
    && (!trustedCheckout.programId || !trustedCheckout.trackId || !trustedCheckout.programSlug || !trustedCheckout.trackSlug)
  ) {
    throw new Error("This programme or track is invalid. Return to the Programme page and choose a published track.");
  }
  if (!Number.isInteger(trustedCheckout.amountKobo) || trustedCheckout.amountKobo <= 0) {
    throw new Error("This programme or payment option is unavailable. Return to the programmes page and choose a valid option.");
  }

  const publicKey = getPaystackPublicKey();
  logPaystackStatus(publicKey);
  if (!publicKey || !getPaystackPublicKeyMode(publicKey)) {
    throw new Error("Online payment is unavailable. Please contact support.");
  }

  return trustedCheckout;
}

function createMetadata(record) {
  return {
    custom_fields: [
      { display_name: "Customer Name", variable_name: "customer_name", value: record.customerName },
      { display_name: "Phone Number", variable_name: "phone", value: record.customerPhone },
      { display_name: "Brand", variable_name: "brand", value: record.brand },
      { display_name: "Product", variable_name: "product", value: record.productTitle || record.productType }
    ],
    brand: record.brand,
    product_type: record.productType,
    program_slug: record.programSlug || null,
    track_slug: record.trackSlug || null,
    class_level: record.classLevel || null,
    student_name: record.studentName || null
  };
}

function createClientEventToken() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }
  return `${generateRandomReferencePart()}${generateRandomReferencePart()}${generateRandomReferencePart()}${generateRandomReferencePart()}`;
}

function withBoundedAttemptWrite(promise) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("attempt_write_timeout")), ATTEMPT_WRITE_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function buildAttemptPayload(trustedCheckout, reference, clientEventToken) {
  return {
    input_reference: reference,
    input_client_event_token: clientEventToken,
    input_brand: trustedCheckout.brand,
    input_product_type: trustedCheckout.productType,
    input_program_id: trustedCheckout.programId || null,
    input_track_id: trustedCheckout.trackId || null,
    input_program_slug: trustedCheckout.programSlug || "",
    input_track_slug: trustedCheckout.trackSlug || "",
    input_class_level: trustedCheckout.classLevel || "",
    input_subject_names: trustedCheckout.subjectNames || [],
    input_months: trustedCheckout.months || null,
    input_customer_name: trustedCheckout.customerName,
    input_customer_email: trustedCheckout.customerEmail,
    input_customer_phone: trustedCheckout.customerPhone,
    input_student_name: trustedCheckout.studentName || ""
  };
}

async function createFrontendPaymentAttempt(payload) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("attempt_write_unavailable");
  const { data, error } = await supabase.rpc("create_frontend_payment_attempt", payload);
  if (error) throw error;
  const record = Array.isArray(data) ? data[0] : data;
  if (!record?.payment_id || !record?.amount_kobo) throw new Error("attempt_write_invalid_response");
  return record;
}

async function writeFrontendPaymentEvent(reference, clientEventToken, event) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("attempt_event_unavailable");
  const { error } = await supabase.rpc("record_frontend_payment_event", {
    input_reference: reference,
    input_client_event_token: clientEventToken,
    input_event_type: event.type,
    input_provider_transaction_id: event.providerTransactionId || null,
    input_event_message: event.message || null
  });
  if (error) throw error;
}

function readRetryQueue() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PAYMENT_RETRY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRetryQueue(queue) {
  if (typeof window === "undefined") return;
  if (!queue.length) {
    window.sessionStorage.removeItem(PAYMENT_RETRY_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(PAYMENT_RETRY_STORAGE_KEY, JSON.stringify(queue.slice(-10)));
}

function queuePaymentRetry({ reference, payload, attemptPersisted = false, event }) {
  const queue = readRetryQueue();
  const existing = queue.find((item) => item.reference === reference);
  const nextEvent = event ? {
    type: event.type,
    providerTransactionId: String(event.providerTransactionId || "").slice(0, 120),
    message: String(event.message || "").slice(0, 500)
  } : null;
  if (existing) {
    existing.payload = existing.payload || payload;
    existing.attemptPersisted = existing.attemptPersisted || attemptPersisted;
    if (nextEvent) existing.events.push(nextEvent);
    existing.updatedAt = new Date().toISOString();
  } else {
    queue.push({
      reference,
      payload,
      attemptPersisted,
      events: nextEvent ? [nextEvent] : [],
      updatedAt: new Date().toISOString()
    });
  }
  writeRetryQueue(queue);
  window.addEventListener("online", () => void flushQueuedPaymentAttempts(), { once: true });
  window.setTimeout(() => void flushQueuedPaymentAttempts(), 5000);
}

let retryFlushPromise = null;

export async function flushQueuedPaymentAttempts() {
  if (retryFlushPromise) return retryFlushPromise;
  retryFlushPromise = (async () => {
    const queue = readRetryQueue();
    const remaining = [];
    for (const item of queue) {
      try {
        if (!item.attemptPersisted) await withBoundedAttemptWrite(createFrontendPaymentAttempt(item.payload));
        for (const event of item.events || []) {
          await withBoundedAttemptWrite(writeFrontendPaymentEvent(item.reference, item.payload.input_client_event_token, event));
        }
      } catch {
        remaining.push(item);
      }
    }
    writeRetryQueue(remaining);
    return remaining.length === 0;
  })().finally(() => {
    retryFlushPromise = null;
  });
  return retryFlushPromise;
}

async function recordFrontendEvent(attempt, event) {
  try {
    if (!attempt.attemptPersisted) throw new Error("attempt_not_persisted");
    await withBoundedAttemptWrite(writeFrontendPaymentEvent(attempt.reference, attempt.clientEventToken, event));
    return true;
  } catch {
    queuePaymentRetry({
      reference: attempt.reference,
      payload: attempt.payload,
      attemptPersisted: attempt.attemptPersisted,
      event
    });
    return false;
  }
}

async function createPaystackPopup() {
  try {
    const { default: Paystack } = await import("@paystack/inline-js");
    return new Paystack();
  } catch {
    throw new Error("Paystack could not be opened. No payment has been charged. Please check your connection and try again.");
  }
}

function makeResultPath(record, status, reason = "") {
  const reference = encodeURIComponent(record.reference);
  const basePath = record.brand === "studyhub"
    ? status === "success" ? "/studyhub/payment-success" : "/studyhub/payment-failed"
    : status === "success" ? "/payment-success" : "/payment-failed";
  const params = new URLSearchParams({ reference: record.reference });
  if (reason) params.set("reason", reason);
  return `${basePath}?${params.toString() || `reference=${reference}`}`;
}

function normalizePaystackReference(transaction, fallback) {
  return normalizePaymentReference(transaction?.reference, transaction?.trxref, fallback) || fallback;
}

function isDeclinedError(error) {
  return /declin|insufficient|bank|not approved/i.test(String(error?.message || error || ""));
}

export async function startPaystackPayment({ item, customer, onSuccess, onCancel, onError }) {
  const trustedCheckout = validatePaymentRequest({ item, customer });
  const reference = generatePaymentReference(trustedCheckout.referencePrefix);
  const clientEventToken = createClientEventToken();
  const payload = buildAttemptPayload(trustedCheckout, reference, clientEventToken);
  let attemptResult = null;
  try {
    attemptResult = await withBoundedAttemptWrite(createFrontendPaymentAttempt(payload));
  } catch {
    queuePaymentRetry({ reference, payload });
  }

  const recordedAmountKobo = Number(attemptResult?.amount_kobo || 0);
  const amountKobo = Number.isInteger(recordedAmountKobo) && recordedAmountKobo > 0
    ? recordedAmountKobo
    : trustedCheckout.amountKobo;
  const pendingRecord = saveTemporaryPayment({
    ...trustedCheckout,
    reference,
    amountKobo,
    paymentId: attemptResult?.payment_id || "",
    clientEventToken,
    currency: "NGN",
    createdAt: new Date().toISOString(),
    temporaryStatus: "initiated",
    reportedStatus: "initiated",
    verificationStatus: "unverified",
    attemptPersisted: Boolean(attemptResult?.payment_id),
    providerMode: "frontend_direct"
  });
  const publicKey = getPaystackPublicKey();
  const metadata = createMetadata(pendingRecord);

  const attempt = {
    reference,
    clientEventToken,
    payload,
    attemptPersisted: Boolean(attemptResult?.payment_id)
  };

  let popup;
  try {
    popup = await createPaystackPopup();
  } catch (error) {
    updateTemporaryPayment(reference, {
      temporaryStatus: "failed",
      reportedStatus: "failed",
      failureReason: "paystack_load_failed"
    });
    void recordFrontendEvent(attempt, { type: "failed", message: "paystack_load_failed" });
    throw error;
  }

  try {
    popup.newTransaction({
      key: publicKey,
      email: pendingRecord.customerEmail,
      amount: pendingRecord.amountKobo,
      currency: "NGN",
      reference,
      metadata,
      onLoad(transaction) {
        const updated = updateTemporaryPayment(reference, {
          temporaryStatus: "opened",
          reportedStatus: "opened"
        }) || { ...pendingRecord, temporaryStatus: "opened", reportedStatus: "opened" };
        void recordFrontendEvent(attempt, {
          type: "opened",
          providerTransactionId: transaction?.id || ""
        });
        return updated;
      },
      onSuccess(transaction) {
        const callbackReference = normalizePaystackReference(transaction, reference);
        const updated = updateTemporaryPayment(reference, {
          temporaryStatus: "client_success",
          reportedStatus: "client_success",
          verificationStatus: "unverified",
          updatedAt: new Date().toISOString()
        }) || { ...pendingRecord, temporaryStatus: "client_success", reportedStatus: "client_success" };
        void recordFrontendEvent(attempt, {
          type: "client_success",
          providerTransactionId: transaction?.id || "",
          message: transaction?.message || ""
        });
        onSuccess?.({
          ...updated,
          reference: callbackReference,
          status: "client_success",
          verificationStatus: "unverified",
          path: makeResultPath(updated, "success")
        });
      },
      onCancel() {
        const updated = updateTemporaryPayment(reference, {
          temporaryStatus: "closed",
          reportedStatus: "closed",
          failureReason: "closed"
        }) || { ...pendingRecord, temporaryStatus: "closed", reportedStatus: "closed", failureReason: "closed" };
        void recordFrontendEvent(attempt, { type: "closed", message: "Paystack checkout closed by customer" });
        onCancel?.("The payment window was closed before completion.", {
          ...updated,
          path: makeResultPath(updated, "failed", "closed")
        });
      },
      onError(error) {
        const declined = isDeclinedError(error);
        const updated = updateTemporaryPayment(reference, {
          temporaryStatus: "failed",
          reportedStatus: "failed",
          failureReason: declined ? "declined" : "failed"
        }) || { ...pendingRecord, temporaryStatus: "failed", reportedStatus: "failed", failureReason: declined ? "declined" : "failed" };
        void recordFrontendEvent(attempt, { type: "failed", message: declined ? "declined" : "paystack_error" });
        onError?.(
          new Error(declined ? "Payment was declined." : "Paystack could not complete this payment. Please try again."),
          {
            ...updated,
            path: makeResultPath(updated, "failed", declined ? "declined" : "failed")
          }
        );
      }
    });
  } catch {
    const updated = updateTemporaryPayment(reference, {
      temporaryStatus: "failed",
      reportedStatus: "failed",
      failureReason: "paystack_open_failed"
    });
    void recordFrontendEvent(attempt, { type: "failed", message: "paystack_open_failed" });
    const error = new Error("Paystack could not be opened. No payment has been charged. Please check your connection and try again.");
    onError?.(error, updated ? { ...updated, path: makeResultPath(updated, "failed", "failed") } : null);
    throw error;
  }

  return pendingRecord;
}
