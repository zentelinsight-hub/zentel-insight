import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import {
  PaystackInitializationError,
  SITE_URL,
  STUDYHUB_SUMMER_LESSONS_KOBO,
  calculateStudyHubAmountKobo,
  createReference,
  initializePaystackTransaction,
  isSafeEmail
} from "../_shared/payments.ts";
import { createServiceClient } from "../_shared/supabase.ts";

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function normalizeProgramSlug(value: unknown) {
  const slug = cleanText(value);
  if (slug === "cybersecurity") return "cybersecurity-basics";
  if (slug === "web-design-development") return "web-design-and-development";
  if (slug === "cv-professional-portfolio") return "cv-professional-portfolio-development";
  return slug;
}

function slugify(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const legacyTrackAliases: Record<string, string[]> = {
  "graphic-design": ["design-foundations", "brand-and-social-media-design", "visual-identity-and-professional-portfolio"],
  "web-design-and-development": ["web-foundations", "frontend-development", "full-stack-web-applications"],
  "software-development": ["programming-foundations", "application-development", "software-engineering-practice"],
  "video-editing": ["video-editing-essentials", "professional-editing-and-storytelling", "motion-graphics-and-commercial-production"],
  "python-programming": ["python-foundations", "automation-data-and-apis", "python-application-development"],
  "digital-marketing": ["digital-marketing-foundations", "campaigns-content-and-advertising", "analytics-and-growth-strategy"],
  "affiliate-marketing": ["affiliate-marketing-starter", "campaign-and-funnel-building", "optimization-and-ethical-scaling"],
  "business-management": ["business-essentials", "operations-finance-and-customer-management", "strategy-leadership-and-business-growth"],
  "data-analysis": ["excel-data-essentials", "sql-and-power-bi-analysis", "python-analytics-and-portfolio-projects"],
  "ui-ux-design": ["ux-and-interface-foundations", "product-design-and-interactive-prototyping", "design-systems-and-professional-portfolio"],
  "mobile-app-development": ["mobile-development-foundations", "cross-platform-application-development", "production-apps-apis-and-deployment"],
  "cybersecurity-basics": ["cybersecurity-foundations", "network-and-endpoint-security", "junior-security-analyst-track"],
  "virtual-assistance": ["virtual-assistant-essentials", "executive-and-digital-operations", "specialized-technical-virtual-assistance"],
  "content-creation": ["content-creation-foundations", "video-and-social-content-production", "content-strategy-and-brand-growth"],
  "cv-professional-portfolio-development": ["career-starter-package", "professional-branding-package", "technology-portfolio-package"]
};

function legacyLevelSlug(programSlug: string, requestedLevel: string) {
  const index = legacyTrackAliases[programSlug]?.indexOf(requestedLevel) ?? -1;
  return ["beginner", "intermediate", "advanced"][index] || requestedLevel;
}

function getCustomer(body: any) {
  const customer = body.customer || {};
  const customerName = cleanText(customer.fullName || body.customerName);
  const customerEmail = normalizeEmail(customer.email || body.customerEmail);
  const customerPhone = cleanText(customer.phone || body.customerPhone);
  const studentName = cleanText(customer.studentName || body.studentName);

  if (customerName.length < 2 || !isSafeEmail(customerEmail) || customerPhone.length < 7) {
    throw new Error("Please complete the required payment information.");
  }

  return { customerName, customerEmail, customerPhone, studentName };
}

function getClassGroup(classLevel: string, classGroup: string) {
  if (classGroup === "SSS" || classGroup === "JSS") return classGroup;
  return /^SSS?/i.test(classLevel) ? "SSS" : "JSS";
}

function createPaystackMetadata(payment: any, trusted: any) {
  const metadata = {
    payment_id: payment.id,
    brand: trusted.brand,
    product_type: trusted.productType,
    program_slug: trusted.programSlug || null,
    track_slug: trusted.trackSlug || null,
    class_level: trusted.classLevel || null,
    student_name: trusted.studentName || null,
    custom_fields: [
      { display_name: "Payment Reference", variable_name: "payment_reference", value: payment.reference },
      { display_name: "Payment ID", variable_name: "payment_id", value: payment.id },
      { display_name: "Product Type", variable_name: "product_type", value: trusted.productType }
    ]
  };

  return metadata;
}

function sanitizeError(error: unknown) {
  return String((error as Error)?.message || "Payment session could not be created.").slice(0, 240);
}

async function getOptionalUserId(supabase: any, request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function initializeStoredPayment({
  request,
  supabase,
  payment,
  trusted,
  browserPublicKeyMode,
  browserPublicKeyConfigured
}: {
  request: Request;
  supabase: any;
  payment: any;
  trusted: any;
  browserPublicKeyMode: unknown;
  browserPublicKeyConfigured: boolean;
}) {
  const metadata = createPaystackMetadata(payment, trusted);
  const callbackUrl = trusted.brand === "studyhub" ? `${SITE_URL}/studyhub/payment-status` : `${SITE_URL}/payment-status`;

  try {
    const initialized = await initializePaystackTransaction({
      email: trusted.customerEmail,
      amountKobo: trusted.amountKobo,
      reference: payment.reference,
      callbackUrl,
      metadata,
      browserPublicKeyMode
    });

    await supabase
      .from("payments")
      .update({
        status: "initialized",
        provider: "paystack",
        provider_status: "initialized",
        initialization_mode: "backend",
        access_code: initialized.accessCode,
        authorization_url: initialized.authorizationUrl,
        metadata
      })
      .eq("id", payment.id);

    return jsonResponse({
      ok: true,
      mode: "backend",
      paymentId: payment.id,
      reference: payment.reference,
      accessCode: initialized.accessCode,
      authorizationUrl: initialized.authorizationUrl,
      amountKobo: trusted.amountKobo,
      currency: "NGN",
      brand: trusted.brand,
      paystackMode: initialized.paystackMode
    }, 200, request);
  } catch (error) {
    const failureReason = sanitizeError(error);
    const fallbackEligible = !(error instanceof PaystackInitializationError) || error.fallbackEligible;
    const canUseFallback = Boolean(fallbackEligible && browserPublicKeyConfigured);

    await supabase
      .from("payments")
      .update({
        status: "pending",
        provider: "paystack",
        provider_status: "initialize_failed",
        initialization_mode: canUseFallback ? "frontend_fallback" : "backend_failed",
        failure_reason: failureReason,
        metadata
      })
      .eq("id", payment.id);

    if (!canUseFallback) {
      return jsonResponse({
        ok: false,
        error: browserPublicKeyConfigured
          ? "Paystack could not be opened. No payment has been charged. Please check your connection and try again."
          : "Online payment configuration is incomplete. Please contact support and provide the payment reference shown below.",
        reference: payment.reference
      }, 503, request);
    }

    return jsonResponse({
      ok: true,
      mode: "frontend_fallback",
      paymentId: payment.id,
      reference: payment.reference,
      email: trusted.customerEmail,
      amountKobo: trusted.amountKobo,
      currency: "NGN",
      brand: trusted.brand,
      metadata
    }, 200, request);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);

  try {
    const supabase = createServiceClient();
    const body = await request.json();
    const brand = body.brand === "studyhub" ? "studyhub" : "zentel_insight";
    const customer = getCustomer(body);
    const browserPublicKeyMode = body.paystackPublicKeyMode;
    const browserPublicKeyConfigured = body.paystackPublicKeyConfigured === true;

    if (brand === "studyhub") {
      const requestedProductType = cleanText(body.productType);
      const classLevel = cleanText(body.classLevel || body.classGroup);
      const classGroup = getClassGroup(classLevel, cleanText(body.classGroup));
      const isSummerLessons = requestedProductType === "studyhub_summer_lessons";
      const subjects = Array.isArray(body.subjectIds || body.subjects)
        ? (body.subjectIds || body.subjects).map(cleanText).filter(Boolean)
        : [];
      const months = isSummerLessons ? 1 : Number(body.months);
      const productType = isSummerLessons ? "studyhub_summer_lessons" : classGroup === "SSS" ? "studyhub_sss" : "studyhub_jss";
      const amountKobo = isSummerLessons
        ? STUDYHUB_SUMMER_LESSONS_KOBO
        : calculateStudyHubAmountKobo(classGroup, subjects.length, months);
      const reference = createReference(isSummerLessons ? "ZH-SUMMER" : classGroup === "SSS" ? "ZH-SSS" : "ZH-JSS");

      const { data: payment, error } = await supabase
        .from("payments")
        .insert({
          reference,
          brand,
          product_type: productType,
          product_key: isSummerLessons ? "studyhub-summer-lessons" : "studyhub-academic-support",
          product_name: isSummerLessons ? "Summer Lessons" : "Zentel Insight StudyHub",
          selected_subjects: subjects,
          selected_class: classLevel,
          number_of_months: months,
          customer_name: customer.customerName,
          student_name: customer.studentName || customer.customerName,
          customer_email: customer.customerEmail,
          customer_phone: customer.customerPhone,
          expected_amount_kobo: amountKobo,
          amount_kobo: amountKobo,
          currency: "NGN",
          status: "pending",
          provider: "paystack",
          provider_status: "pending",
          class_level: classLevel,
          subject_ids: subjects,
          months
        })
        .select()
        .single();

      if (error) throw error;

      const { error: registrationError } = await supabase.from("studyhub_registrations").insert({
        payment_id: payment.id,
        student_name: customer.studentName || customer.customerName,
        parent_name: cleanText(body.parentName) || customer.customerName,
        parent_email: customer.customerEmail,
        parent_phone: customer.customerPhone,
        class_group: classGroup,
        selected_subjects: subjects,
        number_of_months: months
      });

      if (registrationError) throw registrationError;

      return initializeStoredPayment({
        request,
        supabase,
        payment,
        trusted: {
          brand,
          productType,
          classLevel,
          studentName: customer.studentName || customer.customerName,
          customerEmail: customer.customerEmail,
          amountKobo
        },
        browserPublicKeyMode,
        browserPublicKeyConfigured
      });
    }

    const programSlug = normalizeProgramSlug(body.programSlug);
    const requestedLevel = cleanText(body.trackSlug || body.levelSlug || body.level).toLowerCase();
    const { data: program, error: programError } = await supabase
      .from("programs")
      .select("id, slug, title, active")
      .eq("slug", programSlug)
      .eq("active", true)
      .maybeSingle();

    if (programError) throw programError;
    if (!program) return jsonResponse({ error: "This programme or payment option is unavailable. Return to the programmes page and choose a valid option." }, 400, request);

    const { data: levels, error: levelError } = await supabase
      .from("program_levels")
      .select("id, level_name, price_kobo, active")
      .eq("program_id", program.id)
      .eq("active", true);

    if (levelError) throw levelError;
    const level = (levels || []).find((item: any) => {
      const name = String(item.level_name || "").toLowerCase();
      const levelSlug = slugify(item.level_name);
      return name === requestedLevel || levelSlug === requestedLevel || levelSlug === legacyLevelSlug(programSlug, requestedLevel);
    });

    if (!level) return jsonResponse({ error: "This programme or payment option is unavailable. Return to the programmes page and choose a valid option." }, 400, request);

    const userId = await getOptionalUserId(supabase, request);
    const reference = createReference("ZI-COURSE");
    const amountKobo = Number(level.price_kobo);
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        reference,
        user_id: userId,
        brand,
        product_type: "zentel_course",
        product_id: level.id,
        program_id: program.id,
        track_id: level.id,
        product_key: program.slug,
        product_name: program.title,
        selected_level: level.level_name,
        customer_name: customer.customerName,
        customer_email: customer.customerEmail,
        customer_phone: customer.customerPhone,
        expected_amount_kobo: amountKobo,
        amount_kobo: amountKobo,
        currency: "NGN",
        status: "pending",
        provider: "paystack",
        provider_status: "pending",
        program_slug: program.slug,
        track_slug: slugify(level.level_name)
      })
      .select()
      .single();

    if (error) throw error;

    return initializeStoredPayment({
      request,
      supabase,
      payment,
      trusted: {
        brand,
        productType: "zentel_course",
        programSlug: program.slug,
        trackSlug: slugify(level.level_name),
        customerEmail: customer.customerEmail,
        amountKobo
      },
      browserPublicKeyMode,
      browserPublicKeyConfigured
    });
  } catch (error) {
    console.error("create-payment-session", sanitizeError(error));
    return jsonResponse({ ok: false, error: sanitizeError(error) || "Payment session could not be created." }, 400, request);
  }
});
