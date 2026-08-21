import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn()
}));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.remove, upload: mocks.upload }) }
  }))
}));

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "student-1" } }, error: null });
  mocks.remove.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: { id: "loan-1" }, error: null });
  mocks.upload.mockReset().mockResolvedValue({ data: { path: "uploaded" }, error: null });
});

describe("loan KYC service", () => {
  it("replaces a pending file through private Storage without upsert", async () => {
    const { uploadLoanKycFile } = await import("./loanService.js");
    const file = { name: "passport.png", type: "image/png", size: 100 };

    const result = await uploadLoanKycFile({
      applicationId: "application-1",
      kind: "passport",
      file,
      previousPath: "student-1/application-1/passport-old.png"
    });

    expect(mocks.remove).toHaveBeenCalledWith(["student-1/application-1/passport-old.png"]);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^student-1\/application-1\/passport-[a-f0-9-]+\.png$/i),
      file,
      { contentType: "image/png", upsert: false }
    );
    expect(result.path).toMatch(/^student-1\/application-1\/passport-/);
  });

  it("submits only already-uploaded paths owned by the current Student application", async () => {
    const { submitLoanApplication } = await import("./loanService.js");
    await submitLoanApplication({
      applicationId: "application-1",
      fullName: "Ada Student",
      email: "ada@example.com",
      phone: "08010000000",
      dateOfBirth: "2000-01-01",
      nin: "12345678901",
      bvn: "10987654321",
      identificationType: "national_id",
      requestedAmount: "100000",
      purpose: "Education expenses",
      supportingInformation: "",
      passportPhotoPath: "student-1/application-1/passport-file.png",
      identificationPath: "student-1/application-1/identification-file.pdf"
    });

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("student_submit_loan_application", expect.objectContaining({
      application_id: "application-1",
      passport_photo_path: "student-1/application-1/passport-file.png",
      identification_path: "student-1/application-1/identification-file.pdf"
    }));
  });
});

