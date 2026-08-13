import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import {
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
  const statusPath = trusted.brand === "studyhub" ? "/studyhub/payment-status" : "/payment-status";
  const metadata = {
    payment_id: payment.id,
    brand: trusted.brand,
    product_type: trusted.productType,
    program_slug: trusted.programSlug || null,
    track_slug: trusted.trackSlug || null,
    class_level: trusted.classLevel || null,
    student_name: trusted.studentName || null,
    cancel_action: `${SITE_URL}${statusPath}?reference=${encodeURIComponent(payment.reference)}&reason=cancelled`,
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

async function getOptionalUser(supabase: any, request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  if (!data.user.email_confirmed_at || !data.user.email) {
    throw new Error("Verify your account email before starting a payment.");
  }
  return { id: data.user.id, email: normalizeEmail(data.user.email) };
}

function normalizeIdempotencyKey(value: unknown) {
  const key = cleanText(value).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) {
    throw new Error("A valid payment request identifier is required.");
  }
  return key;
}

async function findExistingRequest(supabase: any, request: Request, idempotencyKey: string, userId: string | null, email: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, reference, user_id, customer_email, expected_amount_kobo, currency, status, authorization_url, initialization_mode")
    .eq("initialization_request_id", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.user_id !== userId || normalizeEmail(data.customer_email) !== email) {
    return jsonResponse({ ok: false, error: "This payment request cannot be reused." }, 409, request);
  }
  if (data.initialization_mode === "backend" && /^https:\/\/checkout\.paystack\.com\//i.test(data.authorization_url || "")) {
    return jsonResponse({
      ok: true,
      mode: "backend",
      paymentId: data.id,
      reference: data.reference,
      authorizationUrl: data.authorization_url,
      amountKobo: data.expected_amount_kobo,
      currency: data.currency || "NGN"
    }, 200, request);
  }
  return jsonResponse({ ok: false, error: "Payments are temporarily unavailable. Please try again shortly." }, 503, request);
}

async function initializeStoredPayment({
  request,
  supabase,
  payment,
  trusted
}: {
  request: Request;
  supabase: any;
  payment: any;
  trusted: any;
}) {
  const metadata = createPaystackMetadata(payment, trusted);
  const callbackUrl = trusted.brand === "studyhub" ? `${SITE_URL}/studyhub/payment-status` : `${SITE_URL}/payment-status`;

  try {
    const initialized = await initializePaystackTransaction({
      email: trusted.customerEmail,
      amountKobo: trusted.amountKobo,
      reference: payment.reference,
      callbackUrl,
      metadata
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

    await supabase
      .from("payments")
      .update({
        status: "failed",
        provider: "paystack",
        provider_status: "initialize_failed",
        initialization_mode: "backend_failed",
        failure_reason: failureReason,
        metadata
      })
      .eq("id", payment.id);

    return jsonResponse({
      ok: false,
      error: "Payments are temporarily unavailable. Please try again shortly.",
      reference: payment.reference,
    }, 503, request);
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
    const requestUser = await getOptionalUser(supabase, request);
    const submittedCustomer = getCustomer(body);
    const customer = requestUser
      ? { ...submittedCustomer, customerEmail: requestUser.email }
      : submittedCustomer;
    const userId = requestUser?.id || null;
    const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey);
    const existingRequest = await findExistingRequest(supabase, request, idempotencyKey, userId, customer.customerEmail);
    if (existingRequest) return existingRequest;

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
          initialization_request_id: idempotencyKey,
          user_id: userId,
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
          normalized_email: customer.customerEmail,
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
        }
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

    const reference = createReference("ZI-COURSE");
    const amountKobo = Number(level.price_kobo);
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        reference,
        initialization_request_id: idempotencyKey,
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
        normalized_email: customer.customerEmail,
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
      }
    });
  } catch (error) {
    console.error("create-payment-session", sanitizeError(error));
    return jsonResponse({ ok: false, error: sanitizeError(error) || "Payment session could not be created." }, 400, request);
  }
});
