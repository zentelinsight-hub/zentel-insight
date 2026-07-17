/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthForm from "./AuthForm";

const authMocks = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  resendSignupConfirmation: vi.fn(),
  signupWithEmail: vi.fn()
}));

vi.mock("../../services/authService", () => authMocks);

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}{location.search}</span>;
}

function renderAuth(mode, initialEntries = [mode === "signup" ? "/signup" : "/login"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/signup" element={<><AuthForm mode="signup" /><LocationProbe /></>} />
        <Route path="/login" element={<><AuthForm mode="login" /><LocationProbe /></>} />
        <Route path="/portal" element={<div>Portal reached</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  authMocks.loginWithEmail.mockReset();
  authMocks.resendSignupConfirmation.mockReset();
  authMocks.signupWithEmail.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AuthForm", () => {
  it("shows the three-second check-email modal after signup and redirects to login", async () => {
    vi.useFakeTimers();
    authMocks.signupWithEmail.mockResolvedValue({ ok: true, message: "created" });
    renderAuth("signup");

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New Student" } });
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2006-01-01" } });
    fireEvent.change(screen.getByLabelText("Level of education"), { target: { value: "Senior Secondary School" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "07000000000" } });
    fireEvent.change(screen.getByLabelText("Residential address"), { target: { value: "123 Lagos Street" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByLabelText(/I agree/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("dialog", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText(/Open the verification email we sent to you/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Code")).not.toBeInTheDocument();
    expect(authMocks.signupWithEmail).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/login?notice=verify-email");
  });

  it("uses password login and preserves the requested return path", async () => {
    authMocks.loginWithEmail.mockResolvedValue({ ok: true, message: "ok" });
    renderAuth("login", ["/login?returnTo=/portal"]);

    fireEvent.change(screen.getAllByLabelText("Email address")[0], { target: { value: "learner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByText("Portal reached")).toBeInTheDocument();
    expect(authMocks.loginWithEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: "learner@example.com",
      password: "password123"
    }));
  });

  it("resends a confirmation link from the login page", async () => {
    authMocks.resendSignupConfirmation.mockResolvedValue({
      ok: true,
      message: "If an unverified account exists for this email address, a new verification message has been sent."
    });
    renderAuth("login", ["/login?notice=verify-email"]);

    expect(screen.getByText("Check your email and click the verification link before signing in.")).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("Email address")[1], {
      target: { value: "new@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Resend verification email/i }));

    expect(await screen.findByText(/a new verification message has been sent/)).toBeInTheDocument();
    expect(authMocks.resendSignupConfirmation).toHaveBeenCalledWith("new@example.com");
  });
});
