import { describe, expect, it } from "vitest";
import { EXPECTED_SUPABASE_URL, getSupabaseConfigDiagnostics } from "./supabaseClient";

describe("Supabase client configuration", () => {
  it("accepts the intended Vite Supabase configuration without exposing the key", () => {
    const diagnostics = getSupabaseConfigDiagnostics({
      VITE_SUPABASE_URL: EXPECTED_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test"
    });

    expect(diagnostics.ready).toBe(true);
    expect(diagnostics.urlConfigured).toBe(true);
    expect(diagnostics.publishableKeyConfigured).toBe(true);
    expect(diagnostics.urlMatchesExpected).toBe(true);
    expect(diagnostics.issues).toEqual([]);
  });

  it("rejects missing, legacy, or malformed Supabase configuration", () => {
    const diagnostics = getSupabaseConfigDiagnostics({
      VITE_SUPABASE_URL: " http://old-project.supabase.co ",
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
      VITE_SUPABASE_ANON_KEY: "legacy"
    });

    expect(diagnostics.ready).toBe(false);
    expect(diagnostics.publishableKeyConfigured).toBe(false);
    expect(diagnostics.urlUsesHttps).toBe(false);
    expect(diagnostics.legacyAnonKeyPresent).toBe(true);
    expect(diagnostics.issues).toContain("VITE_SUPABASE_PUBLISHABLE_KEY is missing.");
    expect(diagnostics.issues).toContain("VITE_SUPABASE_URL has leading or trailing whitespace.");
    expect(diagnostics.issues).toContain("VITE_SUPABASE_URL must use https://.");
    expect(diagnostics.issues).toContain("VITE_SUPABASE_ANON_KEY is no longer used by the browser client.");
  });
});
