import { getProgramLevel, studyHubPricing } from "../data/programs";
import { EdgeFunctionError, invokeEdgeFunction } from "./edgeFunctionClient";
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
  const selected = item?.programSlug && item?.levelSlug
    ? {
        programSlug: sanitizeText(item.programSlug),
        levelSlug: sanitizeText(item.levelSlug),
        programTitle: sanitizeText(item.programTitle || item.productTitle),
        level: sanitizeText(item.level || item.trackName),
        priceKobo: Number(item.priceKobo || 0),
        price: Number(item.price || 0)
      }
    : resolveCourseCheckout(item.programSlug, item.levelSlug);
  const fallbackMatch = getProgramLevel(selected.programSlug, selected.levelSlug);
  const amountKobo = fallbackMatch?.level?.priceKobo || selected.priceKobo || nairaToKobo(fallbackMatch?.level?.price || selected.price || 0);
  const programTitle = fallbackMatch?.program?.title || selected.programTitle || "Zentel Insight programme";
  const trackName = fallbackMatch?.level?.name || selected.level || "Selected track";

  return {
    brand: "zentel_insight",
    productType: COURSE_PAYMENT_TYPE,
    productTitle: programTitle,
    programSlug: selected.programSlug,
    trackSlug: selected.levelSlug,
    trackName,
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

async function createServerPaymentSession(trustedCheckout, item, customer) {
  const environment = getPaymentEnvironmentStatus();
  try {
    const data = await invokeEdgeFunction("create-payment-session", {
      requireSession: false,
      unavailableMessage: "Payment setup is temporarily unavailable.",
      failureMessage: "Payment setup could not be completed.",
      body: {
      brand: trustedCheckout.brand === "studyhub" ? "studyhub" : "zentel_insight",
      productType: trustedCheckout.productType,
      programSlug: trustedCheckout.programSlug || item.programSlug,
      trackSlug: trustedCheckout.trackSlug || item.levelSlug,
      levelSlug: trustedCheckout.trackSlug || item.levelSlug,
      classLevel: trustedCheckout.classLevel || item.studyHub?.classLevel,
      classGroup: item.studyHub?.classGroup,
      subjectIds: trustedCheckout.subjectNames || item.studyHub?.subjects || [],
      subjects: trustedCheckout.subjectNames || item.studyHub?.subjects || [],
      months: trustedCheckout.months || item.studyHub?.months,
      parentName: customer.parentName || customer.name,
      studentName: customer.studentName || trustedCheckout.studentName || customer.name,
      customer: {
        fullName: customer.name,
        email: customer.email,
        phone: customer.phone,
        studentName: customer.studentName || "",
        parentName: customer.parentName || customer.name
      },
      paystackPublicKeyMode: environment.paystackMode,
      paystackPublicKeyConfigured: environment.paystackPublicKeyConfigured
      }
    });

    if (!data?.ok) {
      if (import.meta.env.DEV) console.info("Payment session fallback activated", { ok: data?.ok, code: data?.code || "" });
      return null;
    }

    return data;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.info("Payment session fallback activated", {
        status: error instanceof EdgeFunctionError ? error.status : 0,
        code: error instanceof EdgeFunctionError ? error.code : ""
      });
    }
    return null;
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

function openPaystackWithAccessCode(popup, session) {
  if (session.accessCode && typeof popup.resumeTransaction === "function") {
    popup.resumeTransaction(session.accessCode);
    return true;
  }
  if (session.authorizationUrl) {
    window.location.assign(session.authorizationUrl);
    return true;
  }
  return false;
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
  const serverSession = await createServerPaymentSession(trustedCheckout, item, customer);
  const reference = serverSession?.reference || generatePaymentReference(trustedCheckout.referencePrefix);
  const pendingRecord = saveTemporaryPayment({
    ...trustedCheckout,
    reference,
    paymentId: serverSession?.paymentId || "",
    currency: "NGN",
    createdAt: new Date().toISOString(),
    temporaryStatus: "pending",
    providerMode: serverSession?.mode || "frontend_only"
  });
  const popup = await createPaystackPopup();
  const publicKey = getPaystackPublicKey();
  const metadata = createMetadata(pendingRecord);

  if (serverSession?.mode === "backend" && openPaystackWithAccessCode(popup, serverSession)) {
    return pendingRecord;
  }

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
