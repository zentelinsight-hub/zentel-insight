import { getProgramLevel, studyHubPricing } from "../data/programs";
import { isValidEmail } from "../utils/format";
import {
  COURSE_PAYMENT_TYPE,
  STUDYHUB_PAYMENT_TYPE,
  STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE,
  calculateStudyHubPrice,
  nairaToKobo,
  normalizePaymentReference,
  resolveCourseCheckout
} from "../utils/paymentCalculations";

export const PENDING_PAYMENT_STORAGE_KEY = "zentel_pending_payment";

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
    failureReason: record.failureReason || ""
  };

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
  const selected = resolveCourseCheckout(item.programSlug, item.levelSlug);
  const match = getProgramLevel(selected.programSlug, selected.levelSlug);
  if (!match) throw new Error("This programme or payment option is unavailable. Return to the programmes page and choose a valid option.");

  return {
    brand: "zentel_insight",
    productType: COURSE_PAYMENT_TYPE,
    productTitle: match.program.title,
    programSlug: match.program.slug,
    trackSlug: match.level.slug,
    trackName: match.level.name,
    amountKobo: match.level.priceKobo || nairaToKobo(match.level.price),
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
  const pendingRecord = saveTemporaryPayment({
    ...trustedCheckout,
    reference,
    currency: "NGN",
    createdAt: new Date().toISOString(),
    temporaryStatus: "pending"
  });
  const popup = await createPaystackPopup();
  const publicKey = getPaystackPublicKey();
  const metadata = createMetadata(pendingRecord);

  popup.newTransaction({
    key: publicKey,
    email: pendingRecord.customerEmail,
    amount: pendingRecord.amountKobo,
    currency: "NGN",
    reference,
    metadata,
    onSuccess(transaction) {
      const callbackReference = normalizePaystackReference(transaction, reference);
      const updated = updateTemporaryPayment(reference, {
        reference: callbackReference,
        temporaryStatus: "success",
        updatedAt: new Date().toISOString()
      }) || { ...pendingRecord, reference: callbackReference, temporaryStatus: "success" };
      if (callbackReference !== reference) saveTemporaryPayment(updated);
      onSuccess?.({
        ...updated,
        reference: callbackReference,
        status: "success",
        path: makeResultPath(updated, "success")
      });
    },
    onCancel() {
      const updated = updateTemporaryPayment(reference, {
        temporaryStatus: "cancelled",
        failureReason: "cancelled"
      }) || { ...pendingRecord, temporaryStatus: "cancelled", failureReason: "cancelled" };
      onCancel?.("The payment window was closed before completion.", {
        ...updated,
        path: makeResultPath(updated, "failed", "cancelled")
      });
    },
    onError(error) {
      const reason = isDeclinedError(error) ? "declined" : "error";
      const updated = updateTemporaryPayment(reference, {
        temporaryStatus: reason,
        failureReason: reason
      }) || { ...pendingRecord, temporaryStatus: reason, failureReason: reason };
      onError?.(
        new Error(reason === "declined" ? "Payment was declined." : "Paystack reported an error while processing the payment."),
        {
          ...updated,
          path: makeResultPath(updated, "failed", reason)
        }
      );
    }
  });

  return pendingRecord;
}
