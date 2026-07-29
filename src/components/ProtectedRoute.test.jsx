/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute";
import { AuthContext } from "../context/authContextCore";
import { ACCOUNT_STATUSES, USER_ROLES } from "../services/roleService";

function renderProtected(authValue) {
  const defaults = {
    adminVerified: false,
    adminVerificationLoading: false,
    authReady: true,
    authLoading: false,
    loading: false,
    session: { user: { id: "user-1", email_confirmed_at: "2026-07-16T00:00:00Z" } },
    user: { id: "user-1", email: "student@example.com", email_confirmed_at: "2026-07-16T00:00:00Z" },
    profile: { id: "user-1", account_status: ACCOUNT_STATUSES.ACTIVE },
    profileLoading: false,
    profileError: "",
    refreshProfile: vi.fn(),
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
    accountStatusLoading: false,
    role: USER_ROLES.STUDENT,
    roleLoading: false,
    signOut: vi.fn(async () => {})
  };

  return {
    auth: { ...defaults, ...authValue },
    ...render(
      <AuthContext.Provider value={{ ...defaults, ...authValue }}>
        <MemoryRouter initialEntries={["/portal"]}>
          <Routes>
            <Route path="/portal" element={<ProtectedRoute><div>Private Portal Data</div></ProtectedRoute>} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("ProtectedRoute account status", () => {
  it("renders protected content for active students", () => {
    renderProtected();

    expect(screen.getByText("Private Portal Data")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Account access currently inactive" })).not.toBeInTheDocument();
  });

  it("blocks inactive students before private portal content mounts", () => {
    const signOut = vi.fn(async () => {});
    renderProtected({
      accountStatus: ACCOUNT_STATUSES.INACTIVE,
      profile: { id: "user-1", account_status: ACCOUNT_STATUSES.INACTIVE },
      signOut
    });

    expect(screen.getByRole("heading", { name: "Account access currently inactive" })).toBeInTheDocument();
    expect(screen.queryByText("Private Portal Data")).not.toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "zentelinsight@gmail.com" })).toHaveAttribute("href", "mailto:zentelinsight@gmail.com");

    fireEvent.click(screen.getByRole("button", { name: "Return to Sign In" }));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("shows professional security wording without exposing attempt counters", () => {
    renderProtected({
      accountStatus: ACCOUNT_STATUSES.SUSPENDED,
      profile: { id: "user-1", account_status: ACCOUNT_STATUSES.SUSPENDED }
    });

    expect(screen.getByRole("heading", { name: "Account access temporarily restricted" })).toBeInTheDocument();
    expect(screen.getByText("We have restricted access to this account following several unsuccessful sign-in attempts. This security measure helps protect your information from unauthorised access.")).toBeInTheDocument();
    expect(screen.getByText("Please contact Zentel Insight Support for assistance. Only an authorised administrator can restore access.")).toBeInTheDocument();
    expect(screen.queryByText(/five incorrect/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Private Portal Data")).not.toBeInTheDocument();
  });
});
