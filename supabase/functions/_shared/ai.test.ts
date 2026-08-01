import { describe, expect, it } from "vitest";
import { calculateAiCreditCharge, classifyAiRequest, extractResponseSources, validateAiAttachment } from "./ai.ts";

describe("Zentel AI server policy", () => {
  it("routes ordinary and complex work without accepting a client model", () => {
    expect(classifyAiRequest({ text: "What is photosynthesis?" }).route).toBe("standard");
    expect(classifyAiRequest({ text: "Review this distributed system architecture" }).route).toBe("expert");
    expect(classifyAiRequest({ text: "What is the latest React release?" })).toMatchObject({ route: "advanced", webResearch: true });
  });

  it("routes deep research through the expert path", () => {
    expect(classifyAiRequest({ text: "Create a deep research synthesis with current sources" })).toMatchObject({ route: "expert", webResearch: true });
  });

  it("rejects executable and oversized attachments", () => {
    expect(validateAiAttachment({ mimeType: "image/svg+xml", fileName: "diagram.svg", fileSize: 100 })).toMatch(/not supported|Upload/);
    expect(validateAiAttachment({ mimeType: "text/plain", fileName: "lesson.js", fileSize: 100 })).toMatch(/not supported/);
    expect(validateAiAttachment({ mimeType: "application/pdf", fileName: "lesson.pdf", fileSize: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(validateAiAttachment({ mimeType: "application/pdf", fileName: "lesson.pdf", fileSize: 1024 })).toBe("");
    expect(validateAiAttachment({ mimeType: "application/pdf", fileName: "lesson.png", fileSize: 1024 })).toMatch(/do not match/);
  });

  it("calculates protected credits and respects the request maximum", () => {
    const pricing = { input_rate_usd: 5, cached_input_rate_usd: 0.5, output_rate_usd: 30, web_search_rate_usd: 0.01, file_search_rate_usd: 0.0025, internal_exchange_rate: 1650, risk_multiplier: 1.25, credit_cost_unit_ngn: 7 };
    const result = calculateAiCreditCharge({ inputTokens: 100000, cachedTokens: 20000, outputTokens: 50000, webSearchCalls: 2, fileSearchCalls: 1, pricing, maximumCredits: 12 });
    expect(result.providerCostUsd).toBeGreaterThan(0);
    expect(result.protectedCostNgn).toBeGreaterThan(0);
    expect(result.credits).toBe(12);
  });

  it("returns only secure cited sources and removes duplicates", () => {
    const sources = extractResponseSources({ output: [{ content: [{ annotations: [{ url: "https://example.com/a", title: "A" }, { url: "https://example.com/a", title: "A again" }, { url: "http://unsafe.test", title: "Unsafe" }] }] }] });
    expect(sources).toEqual([{ url: "https://example.com/a", title: "A again" }]);
  });
});
