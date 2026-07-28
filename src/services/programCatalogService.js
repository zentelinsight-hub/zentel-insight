import { getSupabaseClient } from "./supabaseClient";
import { getProgramBySlug, getProgramLevel, programs as fallbackPrograms, slugifyProgramValue } from "../data/programs";

function normalizeSlug(slug) {
  const aliases = {
    "web-design-development": "web-design-and-development",
    "cybersecurity-basics": "cybersecurity",
    "cv-professional-portfolio": "cv-professional-portfolio-development"
  };
  return aliases[slug] || slug;
}

function toPrice(priceKobo) {
  return Math.round(Number(priceKobo || 0) / 100);
}

export function sortLevelsByNumericPrice(levels = []) {
  return [...levels].sort((left, right) => {
    const amountDifference = Number(left.priceKobo ?? left.price_kobo ?? 0) - Number(right.priceKobo ?? right.price_kobo ?? 0);
    if (amountDifference) return amountDifference;
    const createdDifference = String(left.createdAt || left.created_at || "").localeCompare(String(right.createdAt || right.created_at || ""));
    if (createdDifference) return createdDifference;
    return String(left.id || left.slug || left.name || "").localeCompare(String(right.id || right.slug || right.name || ""));
  });
}

function mergeProgramRow(row) {
  const fallback = getProgramBySlug(row.slug) || {};
  const dbLevels = Array.isArray(row.program_levels) ? row.program_levels : [];
  const levels = sortLevelsByNumericPrice(dbLevels
    .filter((level) => level.active !== false)
    .map((level) => {
      const slug = slugifyProgramValue(level.level_name);
      const fallbackLevel = fallback.levels?.find((item) => item.slug === slug || item.name === level.level_name) || {};
      return {
        ...fallbackLevel,
        id: level.id,
        name: level.level_name,
        slug,
        price: toPrice(level.price_kobo),
        priceKobo: Number(level.price_kobo || 0),
        createdAt: level.created_at || "",
        summary: level.level_description || fallbackLevel.summary || "",
        duration: level.duration_text || fallbackLevel.duration || ""
      };
    }));

  return {
    ...fallback,
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description || fallback.shortDescription || "",
    fullDescription: row.long_description || fallback.fullDescription || row.short_description || "",
    icon: row.icon_name || fallback.icon || "book-open",
    featured: row.featured ?? fallback.featured ?? false,
    display_order: Number(row.display_order ?? 100),
    enrolmentOpen: row.active !== false,
    duration: fallback.duration || "Flexible instructor-led online schedule. Final timetable is provided after enrolment.",
    deliveryMode: fallback.deliveryMode || "Guided practical training",
    outcomes: fallback.outcomes || ["Build practical skills", "Complete guided projects", "Prepare portfolio evidence"],
    tools: fallback.tools || ["Online learning tools"],
    curriculum: fallback.curriculum || ["Guided learning", "Practical exercises", "Project review"],
    projects: fallback.projects || ["Programme project"],
    prerequisites: fallback.prerequisites || ["A willingness to practise consistently"],
    licensingNotice: fallback.licensingNotice || "Third-party software subscriptions, device costs and internet data are not included unless explicitly stated.",
    faq: fallback.faq || [],
    features: fallback.features || fallback.outcomes?.slice(0, 3) || ["Guided practical training"],
    levels
  };
}

function sortPrograms(items) {
  return [...items].sort((left, right) => {
    const leftOrder = Number(left.display_order ?? 100);
    const rightOrder = Number(right.display_order ?? 100);
    return leftOrder - rightOrder || String(left.title).localeCompare(String(right.title));
  });
}

function sortFallbackPrograms() {
  return sortPrograms(fallbackPrograms.map((program) => ({
    ...program,
    levels: sortLevelsByNumericPrice(program.levels)
  })));
}

async function fetchProgramsFromSupabase({ required = false } = {}) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    if (required) throw new Error("Current programme prices could not be reached. Refresh the page and try again.");
    return null;
  }

  const { data, error } = await supabase
    .from("programs")
    .select("id, slug, title, short_description, long_description, category, icon_name, active, featured, display_order, program_levels(id, level_name, price_kobo, duration_text, level_description, active, created_at)")
    .eq("active", true)
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    if (import.meta.env.DEV) console.info("Public catalogue Supabase lookup failed", error);
    if (required) throw new Error("Current programme prices could not be loaded. Refresh the page and try again.");
    return null;
  }

  const mapped = sortPrograms((data || []).map(mergeProgramRow).filter((program) => program.levels.length));
  if (required && !mapped.length) throw new Error("No published programme prices are available for checkout.");
  return mapped.length ? mapped : null;
}

export async function getPublishedPrograms() {
  return (await fetchProgramsFromSupabase()) || sortFallbackPrograms();
}

export async function getPublishedProgramBySlug(slug) {
  const normalizedSlug = normalizeSlug(slug);
  const programs = await getPublishedPrograms();
  return programs.find((program) => normalizeSlug(program.slug) === normalizedSlug) || null;
}

export async function getPublishedProgramLevel(programSlug, levelSlugOrName) {
  const program = await getPublishedProgramBySlug(programSlug);
  if (!program) return null;
  const normalized = slugifyProgramValue(levelSlugOrName || program.levels[0]?.slug || "");
  const level = program.levels.find((item) => item.slug === normalized || slugifyProgramValue(item.name) === normalized);
  if (!level) return null;
  return { program, level };
}

export async function getCheckoutProgramBySlug(slug) {
  const normalizedSlug = normalizeSlug(slug);
  const programs = await fetchProgramsFromSupabase({ required: true });
  return programs.find((program) => normalizeSlug(program.slug) === normalizedSlug) || null;
}

export function getFallbackProgramLevel(programSlug, levelSlugOrName) {
  return getProgramLevel(programSlug, levelSlugOrName);
}
