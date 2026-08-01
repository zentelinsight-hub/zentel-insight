export type AiRoute = "standard" | "advanced" | "expert";

export type AiRequestClassification = {
  requestType: string;
  route: AiRoute;
  minimumCredits: number;
  maximumCredits: number;
  webResearch: boolean;
  fileAnalysis: boolean;
};

const currentInformationPattern = /\b(latest|current|today|recent|news|price|regulation|law|version|release|search (?:the )?web|look (?:it )?up|research online|sources?)\b/i;
const advancedResearchPattern = /\b(deep research|research synthesis|literature review|systematic review|final[- ]year|dissertation|thesis|multi[- ]document)\b/i;
const complexTechnicalPattern = /\b(architecture|distributed system|security audit|complex debugging|code review|performance profiling|data pipeline|machine learning|advanced calculation)\b/i;
const quizPattern = /\b(quiz|practice questions?|flashcards?|test me)\b/i;
const planPattern = /\b(study plan|learning plan|roadmap|curriculum|schedule)\b/i;
const codingPattern = /\b(code|coding|programming|python|javascript|react|sql|debug|function|algorithm)\b/i;

export function classifyAiRequest(input: {
  text?: string;
  attachmentTypes?: string[];
  webResearchRequested?: boolean;
}): AiRequestClassification {
  const text = String(input.text || "").trim();
  const attachmentTypes = Array.isArray(input.attachmentTypes) ? input.attachmentTypes : [];
  const hasDocument = attachmentTypes.some((type) => [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain"
  ].includes(type));
  const hasImage = attachmentTypes.some((type) => ["image/jpeg", "image/png", "image/webp"].includes(type));
  const needsCurrentInformation = Boolean(input.webResearchRequested || currentInformationPattern.test(text));

  if (advancedResearchPattern.test(text)) {
    return {
      requestType: "advanced_research",
      route: "expert",
      minimumCredits: 15,
      maximumCredits: 40,
      webResearch: needsCurrentInformation,
      fileAnalysis: hasDocument || hasImage
    };
  }
  if (hasDocument) {
    return { requestType: "document_analysis", route: "advanced", minimumCredits: 5, maximumCredits: 20, webResearch: needsCurrentInformation, fileAnalysis: true };
  }
  if (hasImage) {
    return { requestType: "image_analysis", route: "advanced", minimumCredits: 4, maximumCredits: 15, webResearch: needsCurrentInformation, fileAnalysis: true };
  }
  if (complexTechnicalPattern.test(text)) {
    return { requestType: "complex_project", route: "expert", minimumCredits: 10, maximumCredits: 50, webResearch: needsCurrentInformation, fileAnalysis: false };
  }
  if (needsCurrentInformation) {
    return { requestType: "web_research", route: "advanced", minimumCredits: 5, maximumCredits: 15, webResearch: true, fileAnalysis: false };
  }
  if (planPattern.test(text)) {
    return { requestType: "learning_plan", route: "advanced", minimumCredits: 3, maximumCredits: 8, webResearch: false, fileAnalysis: false };
  }
  if (quizPattern.test(text)) {
    return { requestType: "quiz", route: "standard", minimumCredits: 2, maximumCredits: 5, webResearch: false, fileAnalysis: false };
  }
  if (codingPattern.test(text)) {
    return { requestType: "coding_help", route: "advanced", minimumCredits: 2, maximumCredits: 8, webResearch: false, fileAnalysis: false };
  }
  if (text.length > 1200) {
    return { requestType: "detailed_lesson", route: "advanced", minimumCredits: 4, maximumCredits: 8, webResearch: false, fileAnalysis: false };
  }
  if (text.length < 180) {
    return { requestType: "short_question", route: "standard", minimumCredits: 1, maximumCredits: 2, webResearch: false, fileAnalysis: false };
  }
  return { requestType: "explanation", route: "standard", minimumCredits: 2, maximumCredits: 4, webResearch: false, fileAnalysis: false };
}

export const allowedAiMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export function validateAiAttachment(input: { mimeType?: string; fileSize?: number; fileName?: string }, maximumBytes = 10 * 1024 * 1024) {
  const mimeType = String(input.mimeType || "").toLowerCase();
  const fileSize = Number(input.fileSize || 0);
  const fileName = String(input.fileName || "").trim();
  if (!allowedAiMimeTypes.has(mimeType)) return "Upload a PDF, DOCX, TXT, JPEG, PNG or WebP file.";
  if (!fileName || /\.(?:exe|com|bat|cmd|ps1|js|mjs|cjs|html?|svg)$/i.test(fileName)) return "This file type is not supported.";
  const expectedExtensions: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
    "text/plain": ["txt"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"]
  };
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (!expectedExtensions[mimeType]?.includes(extension)) return "The file name and file type do not match.";
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maximumBytes) return `Files must be ${Math.floor(maximumBytes / 1048576)} MB or smaller.`;
  return "";
}

export function calculateAiCreditCharge(input: {
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  webSearchCalls?: number;
  fileSearchCalls?: number;
  pricing: {
    input_rate_usd: number;
    cached_input_rate_usd: number;
    output_rate_usd: number;
    web_search_rate_usd: number;
    file_search_rate_usd: number;
    internal_exchange_rate: number;
    risk_multiplier: number;
    credit_cost_unit_ngn: number;
  };
  maximumCredits: number;
}) {
  const inputTokens = Math.max(0, Number(input.inputTokens || 0));
  const cachedTokens = Math.min(inputTokens, Math.max(0, Number(input.cachedTokens || 0)));
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
  const outputTokens = Math.max(0, Number(input.outputTokens || 0));
  const webSearchCalls = Math.max(0, Number(input.webSearchCalls || 0));
  const fileSearchCalls = Math.max(0, Number(input.fileSearchCalls || 0));
  const pricing = input.pricing;
  const providerCostUsd =
    (uncachedTokens / 1_000_000) * Number(pricing.input_rate_usd || 0) +
    (cachedTokens / 1_000_000) * Number(pricing.cached_input_rate_usd || 0) +
    (outputTokens / 1_000_000) * Number(pricing.output_rate_usd || 0) +
    webSearchCalls * Number(pricing.web_search_rate_usd || 0) +
    fileSearchCalls * Number(pricing.file_search_rate_usd || 0);
  const protectedCostNgn = providerCostUsd * Number(pricing.internal_exchange_rate || 0) * Number(pricing.risk_multiplier || 1);
  const rawCredits = Math.max(1, Math.ceil(protectedCostNgn / Math.max(0.0001, Number(pricing.credit_cost_unit_ngn || 7))));
  return {
    providerCostUsd: Number(providerCostUsd.toFixed(8)),
    protectedCostNgn: Number(protectedCostNgn.toFixed(4)),
    credits: Math.min(Math.max(1, Number(input.maximumCredits || 1)), rawCredits)
  };
}

export function extractResponseText(response: any) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

export function extractResponseSources(response: any) {
  const sourceMap = new Map<string, { title: string; url: string }>();
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        const url = String(annotation?.url || annotation?.url_citation?.url || "").trim();
        if (!/^https:\/\//i.test(url)) continue;
        sourceMap.set(url, {
          title: String(annotation?.title || annotation?.url_citation?.title || "Source").slice(0, 180),
          url
        });
      }
    }
  }
  return [...sourceMap.values()].slice(0, 12);
}
