/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginWithEmail, signupWithEmail, verifyEmailOtp } from "./authService";

const mockState = vi.hoisted(() => ({ supabase: null }));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => mockState.supabase)
}));

beforeEach(() => {
  mockState.supabase = {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: vi.fn()
    },
    functions: {
      invoke: vi.fn(async () => ({ data: { linked: 0 }, error: null }))
    }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it("signs up through Supabase once with profile metadata", async () => {
    mockState.supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: "user-2", email: "new@example.com" } },
      error: null
    });

    const result = await signupWithEmail({
      email: " New@Example.COM ",
      password: "password123",
      fullName: "New Student",
      dateOfBirth: "2006-01-01",
      phone: "07000000000",
      address: "Lagos"
    });

    expect(result.ok).toBe(true);
    expect(mockState.supabase.auth.signUp).toHaveBeenCalledOnce();
    expect(mockState.supabase.auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "password123",
      options: {
        data: {
          full_name: "New Student",
          date_of_birth: "2006-01-01",
          phone: "07000000000",
          address: "Lagos"
        }
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
      phone: "07000000000",
      address: "Lagos"
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("We could not connect to the authentication service. Check your internet connection and try again.");
    expect(mockState.supabase.auth.signUp).toHaveBeenCalledOnce();
  });

  it("confirms signup OTP through Supabase verifyOtp", async () => {
    mockState.supabase.auth.verifyOtp.mockResolvedValue({
      data: {
        session: { access_token: "token" },
        user: { id: "user-3", email: "otp@example.com" }
      },
      error: null
    });

    const result = await verifyEmailOtp({ email: " OTP@Example.COM ", token: "123456" });

    expect(result.ok).toBe(true);
    expect(mockState.supabase.auth.verifyOtp).toHaveBeenCalledOnce();
    expect(mockState.supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: "otp@example.com",
      token: "123456",
      type: "email"
    });
    expect(mockState.supabase.functions.invoke).toHaveBeenCalledWith("claim-my-enrolments", { body: {} });
  });
});
