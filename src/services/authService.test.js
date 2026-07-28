/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailRedirectTo, loginWithEmail, resendSignupConfirmation, signupWithEmail } from "./authService";

const mockState = vi.hoisted(() => ({ supabase: null, role: "student", accountStatus: "active", invokeEdgeFunction: null }));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => mockState.supabase)
}));

vi.mock("./edgeFunctionClient", () => ({
  EdgeFunctionError: class EdgeFunctionError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.code = details.code || "";
      this.unavailable = Boolean(details.unavailable);
    }
  },
  invokeEdgeFunction: vi.fn((...args) => mockState.invokeEdgeFunction(...args))
}));

beforeEach(() => {
  vi.stubEnv("VITE_SITE_URL", "https://zentelinsight.com.ng");
  mockState.role = "student";
  mockState.accountStatus = "active";
  mockState.invokeEdgeFunction = vi.fn(async (functionName) => functionName === "login-with-password"
    ? { ok: true, accessToken: "access-token", refreshToken: "refresh-token" }
    : { linked: 0 });
  mockState.supabase = {
    auth: {
      setSession: vi.fn(async () => ({
        data: {
          session: { access_token: "access-token", refresh_token: "refresh-token" },
          user: { id: "user-1", email: "student@example.com", email_confirmed_at: "2026-07-16T00:00:00Z" }
        },
        error: null
      })),
      signUp: vi.fn(),
      resend: vi.fn(),
      signOut: vi.fn()
    },
    from: vi.fn((table) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: table === "user_roles" ? { role: mockState.role } : { account_status: mockState.accountStatus },
            error: null
          }))
        }))
      }))
    }))
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("auth service", () => {
  it("logs in through the guarded server endpoint and establishes the returned session", async () => {
    const result = await loginWithEmail({ email: " Student@Example.COM ", password: "password123" });

    expect(result.ok).toBe(true);
    expect(mockState.invokeEdgeFunction).toHaveBeenCalledWith("login-with-password", expect.objectContaining({
      body: { email: "student@example.com", password: "password123" },
      requireSession: false
    }));
    expect(mockState.supabase.auth.setSession).toHaveBeenCalledWith({ access_token: "access-token", refresh_token: "refresh-token" });
    expect(mockState.invokeEdgeFunction).toHaveBeenCalledWith("claim-my-enrolments", expect.objectContaining({ body: {} }));
  });

  it("allows inactive students to authenticate without claiming portal enrolments", async () => {
    mockState.accountStatus = "inactive";
    const result = await loginWithEmail({ email: "student@example.com", password: "password123" });

    expect(result.ok).toBe(true);
    expect(result.accountStatus).toBe("inactive");
    expect(mockState.invokeEdgeFunction).toHaveBeenCalledTimes(1);
    expect(mockState.invokeEdgeFunction).toHaveBeenCalledWith("login-with-password", expect.any(Object));
  });

  it("blocks unverified login before the portal and signs out locally", async () => {
    mockState.supabase.auth.setSession.mockResolvedValue({
      data: {
        session: { access_token: "token", refresh_token: "refresh" },
        user: { id: "user-1", email: "student@example.com" }
      },
      error: null
    });

    const result = await loginWithEmail({ email: "student@example.com", password: "password123" });

    expect(result.ok).toBe(false);
    expect(result.unverified).toBe(true);
    expect(result.message).toBe("Your email address has not been verified. Open your verification email or request a new one.");
    expect(mockState.supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockState.invokeEdgeFunction).toHaveBeenCalledTimes(1);
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
    mockState.invokeEdgeFunction.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await loginWithEmail({ email: "student@example.com", password: "password123" });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("We could not connect to the authentication service. Check your internet connection and try again.");
    expect(mockState.supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it("maps invalid login credentials to a readable message", async () => {
    mockState.invokeEdgeFunction.mockRejectedValue(new Error("The email or password is incorrect."));

    const result = await loginWithEmail({ email: "student@example.com", password: "wrong-password" });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("The email or password is incorrect.");
  });

  it("returns the server suspension message without creating a browser session", async () => {
    const { EdgeFunctionError } = await import("./edgeFunctionClient");
    mockState.invokeEdgeFunction.mockRejectedValue(new EdgeFunctionError(
      "Your account has been suspended after five incorrect password attempts. Please contact Zentel Insight customer service. Only an Admin can reactivate this account.",
      { code: "account_suspended" }
    ));

    const result = await loginWithEmail({ email: "student@example.com", password: "wrong-password" });

    expect(result.ok).toBe(false);
    expect(result.suspended).toBe(true);
    expect(result.message).toContain("Only an Admin can reactivate this account");
    expect(mockState.supabase.auth.setSession).not.toHaveBeenCalled();
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
