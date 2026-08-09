/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountLookupSection, AccountManagementSection } from "./AdminAccountSections";

const serviceMocks = vi.hoisted(() => ({
  findAdminAccount: vi.fn(),
  searchAdminAccounts: vi.fn(),
  setAccountStatus: vi.fn(),
  updateAccountCredentials: vi.fn(),
  updateStudentProfile: vi.fn(),
  updateTutorProfile: vi.fn(),
  requestPasswordReset: vi.fn()
}));

vi.mock("../../services/adminService", () => ({
  findAdminAccount: serviceMocks.findAdminAccount,
  searchAdminAccounts: serviceMocks.searchAdminAccounts,
  setAccountStatus: serviceMocks.setAccountStatus,
  updateAccountCredentials: serviceMocks.updateAccountCredentials,
  updateStudentProfile: serviceMocks.updateStudentProfile,
  updateTutorProfile: serviceMocks.updateTutorProfile
}));

vi.mock("../../services/authService", () => ({
  requestPasswordReset: serviceMocks.requestPasswordReset
}));

const studentAccount = {
  profile: {
    id: "student-1",
    portal_id: "ZIS-ABCD-2345",
    full_name: "Ada Student",
    email: "ada@example.com",
    phone: "07000000000",
    account_status: "active",
    created_at: "2026-07-28T10:00:00Z"
  },
  role: "student",
  enrolment: null,
  preference: null,
  assignedTutor: null,
  supportHistory: [],
  activity: []
};

beforeEach(() => {
  serviceMocks.findAdminAccount.mockResolvedValue({ account: studentAccount, lookupAt: "2026-07-29T10:00:00Z" });
  serviceMocks.searchAdminAccounts.mockResolvedValue({
    records: [{
      id: "student-1",
      portal_id: "ZIS-ABCD-2345",
      full_name: "Ada Student",
      email: "ada@example.com",
      role: "student",
      account_status: "active"
    }],
    total: 1,
    page: 1,
    pageSize: 25,
    pageCount: 1
  });
  serviceMocks.updateStudentProfile.mockResolvedValue({ id: "student-1" });
  serviceMocks.updateTutorProfile.mockResolvedValue({ id: "tutor-1" });
  serviceMocks.updateAccountCredentials.mockResolvedValue({ ok: true, email: "ada@example.com" });
  serviceMocks.setAccountStatus.mockResolvedValue({ id: "student-1", account_status: "active" });
  serviceMocks.requestPasswordReset.mockResolvedValue({ ok: true, message: "Reset instructions sent." });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Admin exact account workflow", () => {
  it("shows a read-only directory and redirects an exact lookup to the editable account", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/accounts"]}>
        <Routes>
          <Route path="/admin/accounts" element={<AccountLookupSection />} />
          <Route path="/admin/accounts/:portalId" element={<p>Dedicated account page</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "All Accounts" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Portal ID" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(serviceMocks.searchAdminAccounts).toHaveBeenCalledWith({ page: 1, pageSize: 25 });
    expect(serviceMocks.findAdminAccount).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Portal ID"), { target: { value: "ZIS-ABCD-2345" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(serviceMocks.findAdminAccount).toHaveBeenCalledWith({
      searchType: "portal_id",
      value: "ZIS-ABCD-2345",
      accountType: "any"
    }));
    expect(await screen.findByText("Dedicated account page")).toBeInTheDocument();
  });

  it("loads a dedicated Student account by immutable Portal ID and saves by UUID", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/accounts/ZIS-ABCD-2345"]}>
        <AccountManagementSection portalId="ZIS-ABCD-2345" programs={[]} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Ada Student")).toBeInTheDocument();
    expect(screen.getByText("ZIS-ABCD-2345")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ada Updated" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "07000000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(serviceMocks.updateStudentProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: "student-1",
      full_name: "Ada Updated"
    })));
  });

  it("uses the protected credential service when the registered email changes", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/accounts/ZIS-ABCD-2345"]}>
        <AccountManagementSection portalId="ZIS-ABCD-2345" programs={[]} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Ada Student")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Registered email"), { target: { value: "ada.updated@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(serviceMocks.updateAccountCredentials).toHaveBeenCalledWith(expect.objectContaining({
      userId: "student-1",
      email: "ada.updated@example.com"
    })));
  });
});
