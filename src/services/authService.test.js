/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailRedirectTo, loginWithEmail, resendSignupConfirmation, signupWithEmail } from "./authService";

const mockState = vi.hoisted(() => ({ supabase: null }));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => mockState.supabase)
}));

beforeEach(() => {
  vi.stubEnv("VITE_SITE_URL", "https://zentelinsight.com.ng");
  mockState.supabase = {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resend: vi.fn(),
      signOut: vi.fn()
    },
    functions: {
      invoke: vi.fn(async () => ({ data: { linked: 0 }, error: null }))
    }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("auth service", () => {
  it("logs in through Supabase once with a normalized email", async () => {
    mockState.supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: "token" },
        user: { id: "user-1", email: "student@example.com", email_confirmed_at: "2026-07-16T00:00:00Z" }
      },
      error: null
    });

    const result = await loginWithEmail({ email: " Student@Example.COM ", password: "password123" });

    expect(result.ok).toBe(true);
    expect(mockState.supabase.auth.signInWithPassword).toHaveBeenCalledOnce();
    expect(mockState.supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "password123"
    });
    expect(mockState.supabase.functions.invoke).toHaveBeenCalledWith("claim-my-enrolments", { body: {} });
  });

  it("blocks unverified login before the portal and signs out locally", async () => {
    mockState.supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: "token" },
        user: { id: "user-1", email: "student@example.com" }
      },
      error: null
    });

    const result = await loginWithEmail({ email: "student@example.com", password: "password123" });

    expect(result.ok).toBe(false);
    expect(result.unverified).toBe(true);
    expect(result.message).toBe("Your email address has not been verified. Open your verification email or request a new one.");
    expect(mockState.supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockState.supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("signs up through Supabase once with profile metadata and a confirmation-link redirect", async () => {
    mockState.supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: "user-2", email: "new@example.com" } },
      error: null
    });

    const result = await signupWithEmail({
      email: " New@Example.COM ",
      password: "password123",
      fullName: "New Student",
      dateOfBirth: "2006-01-01",
      educationLevel: "Senior Secondary School",
      phone: "07000000000",
      address: "Lagos address"
    });

    expect(result.ok).toBe(true);
    expect(mockState.supabase.auth.signUp).toHaveBeenCalledOnce();
    expect(mockState.supabase.auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "password123",
      options: {
        emailRedirectTo: "https://zentelinsight.com.ng/auth/callback?next=/email-verified",
        data: {
          full_name: "New Student",
          date_of_birth: "2006-01-01",
          education_level: "Senior Secondary School",
          phone: "07000000000",
          address: "Lagos address"
        }
      }
    });
    expect(mockState.supabase.auth.signUp).toHaveBeenCalledOnce();
  });

  it("resends a signup confirmation link without revealing account existence", async () => {
    mockState.supabase.auth.resend.mockResolvedValue({ data: {}, error: null });

    const result = await resendSignupConfirmation(" New@Example.COM ");

    expect(result.ok).toBe(true);
    expect(result.message).toBe("If an unverified account exists for this email address, a new verification message has been sent.");
    expect(mockState.supabase.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.com",
      options: {
        emailRedirectTo: "https://zentelinsight.com.ng/auth/callback?next=/email-verified"
      }
    });
  });

  it("maps login network failures without exposing raw Failed to fetch", async () => {
    mockState.supabase.auth.signInWithPassword.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await loginWithEmail({ email: "student@example.com", password: "password123" });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("We could not connect to the authentication service. Check your internet connection and try again.");
    expect(mockState.supabase.auth.signInWithPassword).toHaveBeenCalledOnce();
  });

  it("maps invalid login credentials to a readable message", async () => {
    mockState.supabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "Invalid login credentials" }
    });

    const result = await loginWithEmail({ email: "student@example.com", password: "wrong-password" });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("The email or password is incorrect.");
  });

  it("maps signup network failures without exposing raw Failed to fetch", async () => {
    mockState.supabase.auth.signUp.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await signupWithEmail({
      email: "new@example.com",
      password: "password123",
      fullName: "New Student",
      dateOfBirth: "2006-01-01",
      educationLevel: "Graduate",
      phone: "07000000000",
      address: "Lagos address"
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("We could not connect to the authentication service. Check your internet connection and try again.");
    expect(mockState.supabase.auth.signUp).toHaveBeenCalledOnce();
  });

  it("builds the email redirect URL for the shared callback route", () => {
    expect(getEmailRedirectTo()).toBe("https://zentelinsight.com.ng/auth/callback?next=/email-verified");
  });
});
