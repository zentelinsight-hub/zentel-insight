import { describe, expect, it } from "vitest";
import { sortLevelsByNumericPrice } from "./programCatalogService";

describe("programme catalogue ordering", () => {
  it("sorts track prices numerically instead of lexicographically", () => {
    const levels = sortLevelsByNumericPrice([
      { id: "c", price_kobo: 10000000 },
      { id: "a", price_kobo: 900000 },
      { id: "b", price_kobo: 2500000 }
    ]);

    expect(levels.map((level) => level.id)).toEqual(["a", "b", "c"]);
  });

  it("uses creation time and a stable identifier for equal prices", () => {
    const levels = sortLevelsByNumericPrice([
      { id: "b", priceKobo: 1500000, createdAt: "2026-02-01T00:00:00Z" },
      { id: "c", priceKobo: 1500000, createdAt: "2026-01-01T00:00:00Z" },
      { id: "a", priceKobo: 1500000, createdAt: "2026-02-01T00:00:00Z" }
    ]);

    expect(levels.map((level) => level.id)).toEqual(["c", "a", "b"]);
  });
});
