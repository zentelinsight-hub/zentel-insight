/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentLoanApplicationPage } from "./StudentLoanPages";

const loanMocks = vi.hoisted(() => ({
  submitLoanApplication: vi.fn(),
  uploadLoanKycFile: vi.fn()
}));

vi.mock("../../context/authHooks", () => ({
  useAuth: () => ({
    user: { id: "student-1", email: "ada@example.com" },
    profile: { id: "student-1", full_name: "Ada Student", phone: "08010000000" }
  })
}));

vi.mock("../../services/loanService", () => ({
  getMyLoanSnapshot: vi.fn(),
  saveLoanBankDetails: vi.fn(),
  submitLoanApplication: loanMocks.submitLoanApplication,
  submitLoanRepayment: vi.fn(),
  uploadLoanKycFile: loanMocks.uploadLoanKycFile
}));

beforeEach(() => {
  let sequence = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `application-${++sequence}` });
  loanMocks.submitLoanApplication.mockReset();
  loanMocks.uploadLoanKycFile.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Student Loan KYC uploads", () => {
  it("uploads locally without submitting, refreshing, or clearing entered values", async () => {
    let finishUpload;
    loanMocks.uploadLoanKycFile.mockImplementation(() => new Promise((resolve) => { finishUpload = resolve; }));
    render(<MemoryRouter><StudentLoanApplicationPage /></MemoryRouter>);

    const nin = screen.getByLabelText("NIN");
    const bvn = screen.getByLabelText("BVN");
    fireEvent.change(nin, { target: { value: "12345678901" } });
    fireEvent.change(bvn, { target: { value: "10987654321" } });
    fireEvent.change(screen.getByLabelText("Passport photo"), {
      target: { files: [new File(["image"], "passport.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("Uploading...")).toBeInTheDocument();
    expect(nin).toHaveValue("12345678901");
    expect(bvn).toHaveValue("10987654321");
    expect(loanMocks.submitLoanApplication).not.toHaveBeenCalled();

    await act(async () => finishUpload({ path: "student-1/application-1/passport.png" }));
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(nin).toHaveValue("12345678901");
    expect(bvn).toHaveValue("10987654321");
  });
});

