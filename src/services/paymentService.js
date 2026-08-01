import { invokeEdgeFunction } from "./edgeFunctionClient";
import { isValidEmail } from "../utils/format";
import {
  COURSE_PAYMENT_TYPE,
  STUDYHUB_PAYMENT_TYPE,
  STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE,
  normalizePaymentReference
} from "../utils/paymentCalculations";

export const PENDING_PAYMENT_STORAGE_KEY = "zentel_pending_payment";

function cleanText(value) {
  return String(value || "").trim();
}

function makeRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  throw new Error("Payments are temporarily unavailable. Please try again shortly.");
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

export function readTemporaryPayment(reference) {
  const safeReference = normalizePaymentReference(reference);
  if (!safeReference || typeof window === "undefined") return null;
  try {
    const record = JSON.parse(window.sessionStorage.getItem(PENDING_PAYMENT_STORAGE_KEY) || "null");
    return record?.reference === safeReference ? record : null;
  } catch {
    return null;
  }
}

export function saveTemporaryPayment(record) {
  const reference = normalizePaymentReference(record?.reference);
  if (!reference) return null;
  const safeRecord = {
    reference,
    paymentId: cleanText(record.paymentId),
    brand: record.brand === "studyhub" ? "studyhub" : "zentel_insight",
    productType: cleanText(record.productType),
    productTitle: cleanText(record.productTitle),
    programSlug: cleanText(record.programSlug),
    trackSlug: cleanText(record.trackSlug),
    trackName: cleanText(record.trackName),
    classLevel: cleanText(record.classLevel),
    subjectNames: Array.isArray(record.subjectNames) ? record.subjectNames.map(cleanText).filter(Boolean) : [],
    months: Number(record.months) || null,
    amountKobo: Number(record.amountKobo) || 0,
    currency: "NGN",
    createdAt: record.createdAt || new Date().toISOString(),
    temporaryStatus: "redirected",
    verificationStatus: "unverified"
  };
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, JSON.stringify(safeRecord));
  }
  return safeRecord;
}

function validateCustomer(customer, requiresStudentName) {
  const normalized = {
    fullName: cleanText(customer?.name),
    email: cleanText(customer?.email).toLowerCase(),
    phone: cleanText(customer?.phone),
    studentName: cleanText(customer?.studentName)
  };
  if (normalized.fullName.length < 2 || !isValidEmail(normalized.email) || normalized.phone.length < 7) {
    throw new Error("Please complete the required payment information.");
  }
  if (requiresStudentName && normalized.studentName.length < 2) throw new Error("Enter the student's name.");
  return normalized;
}

export function validatePaymentRequest({ item, customer }) {
  if (!item) throw new Error("This programme or payment option is unavailable. Return to the programmes page and choose a valid option.");
  const isStudyHub = item.paymentType === STUDYHUB_PAYMENT_TYPE;
  const normalizedCustomer = validateCustomer(customer, isStudyHub);

  if (isStudyHub) {
    const studyHub = item.studyHub || {};
    const productType = studyHub.productType === STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE
      ? STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE
      : cleanText(studyHub.productType);
    const classLevel = cleanText(studyHub.classLevel || studyHub.classGroup);
    const subjects = Array.isArray(studyHub.subjects) ? studyHub.subjects.map(cleanText).filter(Boolean) : [];
    const months = productType === STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE ? 1 : Number(studyHub.months);
    if (!classLevel) throw new Error("Select a class.");
    if (productType !== STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE && !subjects.length) throw new Error("Select at least one subject.");
    if (!Number.isInteger(months) || months < 1 || months > 12) throw new Error("Select between 1 and 12 months.");
    return {
      brand: "studyhub",
      productType,
      classLevel,
      classGroup: cleanText(studyHub.classGroup),
      subjects,
      months,
      customer: normalizedCustomer
    };
  }

  const programSlug = cleanText(item.programSlug);
  const trackSlug = cleanText(item.levelSlug || item.trackSlug);
  if (!programSlug || !trackSlug) {
    throw new Error("This programme or track is invalid. Return to the Programme page and choose a published track.");
  }
  return {
    brand: "zentel_insight",
    productType: COURSE_PAYMENT_TYPE,
    programSlug,
    trackSlug,
    customer: normalizedCustomer
  };
}

export async function startPaystackPayment({ item, customer, redirect = (url) => window.location.assign(url) }) {
  const request = validatePaymentRequest({ item, customer });
  const result = await invokeEdgeFunction("create-payment-session", {
    body: { ...request, idempotencyKey: makeRequestId() },
    requireSession: false,
    timeoutMs: 30000,
    unavailableMessage: "Payments are temporarily unavailable. Please try again shortly.",
    failureMessage: "Payments are temporarily unavailable. Please try again shortly."
  });

  const reference = normalizePaymentReference(result?.reference);
  const authorizationUrl = cleanText(result?.authorizationUrl);
  if (!result?.ok || result?.mode !== "backend" || !reference || !/^https:\/\/checkout\.paystack\.com\//i.test(authorizationUrl)) {
    throw new Error("Payments are temporarily unavailable. Please try again shortly.");
  }

  const pending = saveTemporaryPayment({
    reference,
    paymentId: result.paymentId,
    brand: request.brand,
    productType: request.productType,
    productTitle: cleanText(item?.programTitle || item?.title),
    programSlug: request.programSlug,
    trackSlug: request.trackSlug,
    trackName: cleanText(item?.level || item?.trackName),
    classLevel: request.classLevel,
    subjectNames: request.subjects,
    months: request.months,
    amountKobo: result.amountKobo,
    createdAt: new Date().toISOString()
  });

  redirect(authorizationUrl);
  return pending;
}

export async function flushQueuedPaymentAttempts() {
  return true;
}
