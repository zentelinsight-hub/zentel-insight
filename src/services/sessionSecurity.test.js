import { describe, expect, it } from "vitest";
import {
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  PROTECTED_IDLE_TIMEOUT_MS,
  PROTECTED_IDLE_WARNING_MS
} from "./sessionSecurity";

describe("portal idle session policy", () => {
  it("warns after nine minutes and signs out after ten", () => {
    expect(IDLE_WARNING_MS).toBe(9 * 60 * 1000);
    expect(IDLE_TIMEOUT_MS).toBe(10 * 60 * 1000);
    expect(PROTECTED_IDLE_WARNING_MS).toBe(IDLE_WARNING_MS);
    expect(PROTECTED_IDLE_TIMEOUT_MS).toBe(IDLE_TIMEOUT_MS);
  });
});
