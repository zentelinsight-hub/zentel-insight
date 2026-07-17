import { getProgramLevel, studyHubPricing } from "../data/programs";

export const COURSE_PAYMENT_TYPE = "zentel_course";
export const STUDYHUB_PAYMENT_TYPE = "studyhub_registration";
export const STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE = "studyhub_summer_lessons";

export function nairaToKobo(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  return Math.round(amount * 100);
}

export function getProgramLevelPrice(programSlug, level) {
  const match = getProgramLevel(programSlug, level);
  if (!match) {
    throw new Error("Program track price is unavailable.");
  }
  return match.level.price;
}

export function resolveCourseCheckout(programSlug, levelSlugOrName) {
  const match = getProgramLevel(programSlug, levelSlugOrName);
  if (!match) {
    throw new Error("Selected programme track is unavailable.");
  }

  return {
    paymentType: COURSE_PAYMENT_TYPE,
    slug: `${match.program.slug}:${match.level.slug}`,
    title: `${match.program.title} - ${match.level.name}`,
    programSlug: match.program.slug,
    programTitle: match.program.title,
    levelSlug: match.level.slug,
    level: match.level.name,
    price: match.level.price,
    priceKobo: match.level.priceKobo || nairaToKobo(match.level.price)
  };
}

export function calculateStudyHubPrice(classGroup, subjectCount, months) {
  const unitPrice = studyHubPricing[classGroup]?.pricePerSubjectPerMonth;
  if (!unitPrice) throw new Error("Select a valid class group.");
  if (!Number.isInteger(subjectCount) || subjectCount < 1) throw new Error("Select at least one subject.");
  if (!Number.isInteger(months) || months < 1) throw new Error("Select at least one month.");
  if (months > 12) throw new Error("Select 12 months or fewer.");
  return unitPrice * subjectCount * months;
}

export function calculateSummerLessonsPrice() {
  return studyHubPricing.summerLessons.price;
}

export function resolveSummerLessonsCheckout() {
  return {
    paymentType: STUDYHUB_PAYMENT_TYPE,
    productType: STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE,
    slug: "studyhub-summer-lessons",
    title: "Summer Lessons",
    price: studyHubPricing.summerLessons.price,
    priceKobo: studyHubPricing.summerLessons.priceKobo,
    duration: studyHubPricing.summerLessons.duration,
    billingType: studyHubPricing.summerLessons.billingType
  };
}

const paymentReferencePattern = /^(ZI-COURSE|ZH-JSS|ZH-SSS|ZH-SUMMER)-\d{10,}-[A-Z0-9]{8,}$/;
const paystackSafeReferencePattern = /^[A-Za-z0-9.\-=]+$/;

export function normalizePaymentReference(...values) {
  const candidate = values.find((value) => typeof value === "string" && value.trim());
  if (!candidate) return "";
  const reference = candidate.trim();
  if (!paystackSafeReferencePattern.test(reference)) return "";
  return reference;
}

export function isValidPaymentReference(reference) {
  return paymentReferencePattern.test(String(reference));
}

export function mapPaymentStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (["success", "successful"].includes(normalized)) return "successful";
  if (["cancelled", "canceled", "abandoned"].includes(normalized)) return "cancelled";
  if (["failed", "reversed"].includes(normalized)) return "failed";
  if (["pending", "initiated", "initialized", "ongoing", "processing"].includes(normalized)) return "pending";
  return "invalid reference";
}

export function canActivateEnrolment({ browserStatus, serverVerified }) {
  return mapPaymentStatus(browserStatus) === "successful" && serverVerified === true;
}

export function safeRedirectPath(value, fallback = "/portal") {
  if (!value || typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}
