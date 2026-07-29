import { describe, expect, it } from "vitest";
import { estimateAiCredits, validateAiFile } from "./aiService";

describe("Zentel AI browser helpers", () => {
  it("shows a larger estimate for research and files", () => {
    const basic = estimateAiCredits("Explain fractions");
    const research = estimateAiCredits("Research current learning policy", [{ id: "file" }], true);
    expect(research.minimum).toBeGreaterThan(basic.minimum);
    expect(research.maximum).toBeGreaterThan(basic.maximum);
  });

  it("accepts approved learning files and blocks executable content", () => {
    expect(() => validateAiFile({ name: "notes.pdf", type: "application/pdf", size: 1024 })).not.toThrow();
    expect(() => validateAiFile({ name: "script.svg", type: "image/svg+xml", size: 1024 })).toThrow(/PDF, DOCX/);
    expect(() => validateAiFile({ name: "large.pdf", type: "application/pdf", size: 11 * 1024 * 1024 })).toThrow(/10 MB/);
    expect(() => validateAiFile({ name: "renamed.png", type: "application/pdf", size: 1024 })).toThrow(/do not match/);
  });
});
