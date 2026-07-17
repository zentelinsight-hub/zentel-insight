import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { calculateStudyHubAmountKobo, createReference, isSafeEmail, STUDYHUB_SUMMER_LESSONS_KOBO } from "../_shared/payments.ts";
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

async function getOptionalUserId(supabase: any, request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabase = createServiceClient();
    const body = await request.json();
    const brand = body.brand === "studyhub" ? "studyhub" : "zentel_insight";
    const reference = createReference(brand === "studyhub" ? "ZISH" : "ZI");
    const customerName = cleanText(body.customerName);
    const customerEmail = normalizeEmail(body.customerEmail);
    const customerPhone = cleanText(body.customerPhone);

    if (customerName.length < 2 || !isSafeEmail(customerEmail) || customerPhone.length < 7) {
      return jsonResponse({ error: "Enter a valid customer name, email and phone number." }, 400);
    }

    if (brand === "studyhub") {
      const productType = cleanText(body.productType) === "studyhub_summer_lessons"
        ? "studyhub_summer_lessons"
        : "studyhub_registration";
      const subjects = Array.isArray(body.subjects) ? body.subjects.map(cleanText).filter(Boolean) : [];
      const amountKobo = productType === "studyhub_summer_lessons"
        ? STUDYHUB_SUMMER_LESSONS_KOBO
        : calculateStudyHubAmountKobo(body.classGroup, subjects.length, Number(body.months));
      const months = productType === "studyhub_summer_lessons" ? 1 : Number(body.months);

      const { data: payment, error } = await supabase
        .from("payments")
        .insert({
          reference,
          brand,
          product_type: productType,
          product_key: productType === "studyhub_summer_lessons" ? "studyhub-summer-lessons" : "studyhub-academic-support",
          product_name: productType === "studyhub_summer_lessons" ? "Summer Lessons" : "Zentel Insight StudyHub",
          selected_subjects: subjects,
          selected_class: cleanText(body.classLevel || body.classGroup),
          number_of_months: months,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          expected_amount_kobo: amountKobo,
          status: "pending"
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("studyhub_registrations").insert({
        payment_id: payment.id,
        student_name: cleanText(body.studentName) || customerName,
        parent_name: cleanText(body.parentName) || customerName,
        parent_email: customerEmail,
        parent_phone: customerPhone,
        class_group: cleanText(body.classLevel || body.classGroup),
        selected_subjects: subjects,
        number_of_months: months
      });

      return jsonResponse({ reference, amountKobo, currency: "NGN" });
    }

    const programSlug = normalizeProgramSlug(body.programSlug);
    const requestedLevel = cleanText(body.levelSlug || body.level).toLowerCase();
    const { data: program, error: programError } = await supabase
      .from("programs")
      .select("id, slug, title, active")
      .eq("slug", programSlug)
      .eq("active", true)
      .maybeSingle();

    if (programError) throw programError;
    if (!program) return jsonResponse({ error: "Selected programme is unavailable." }, 400);

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

    if (!level) return jsonResponse({ error: "Selected programme level is unavailable." }, 400);

    const userId = await getOptionalUserId(supabase, request);
    const { error } = await supabase.from("payments").insert({
      reference,
      user_id: userId,
      brand,
      product_type: "zentel_course",
      product_id: level.id,
      product_key: program.slug,
      product_name: program.title,
      selected_level: level.level_name,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      expected_amount_kobo: level.price_kobo,
      status: "pending"
    });

    if (error) throw error;
    return jsonResponse({
      reference,
      amountKobo: level.price_kobo,
      currency: "NGN",
      productName: program.title,
      selectedLevel: level.level_name
    });
  } catch (error) {
    console.error("create-payment-session", error.message);
    return jsonResponse({ error: error.message || "Payment session could not be created." }, 400);
  }
});
