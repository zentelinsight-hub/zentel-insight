/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STUDYHUB_PAYMENT_TYPE } from "../utils/paymentCalculations";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("./edgeFunctionClient", () => ({ invokeEdgeFunction: mocks.invoke }));

const customer = {
  name: "Test Student",
  email: "Student@Example.com",
  phone: "08000000000"
};

const courseItem = {
  paymentType: "zentel_course",
  programId: "11111111-1111-4111-8111-111111111111",
  trackId: "22222222-2222-4222-8222-222222222222",
  programTitle: "Graphic Design",
  programSlug: "graphic-design",
  levelSlug: "brand-and-social-media-design",
  level: "Brand and Social Media Design",
  price: 20000,
  priceKobo: 2000000
};

beforeEach(() => {
  mocks.invoke.mockReset();
  window.sessionStorage.clear();
  vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("backend-only Paystack checkout", () => {
  it("sends identifiers and customer details without a browser amount or public key", async () => {
    const redirect = vi.fn();
    mocks.invoke.mockResolvedValue({
      ok: true,
      mode: "backend",
      paymentId: "payment-1",
      reference: "ZI-COURSE-1790000000000-ABCDEF1234",
      authorizationUrl: "https://checkout.paystack.com/secure-token",
      amountKobo: 2000000
    });
    const { readTemporaryPayment, startPaystackPayment } = await import("./paymentService.js");

    const pending = await startPaystackPayment({ item: courseItem, customer, redirect });

    expect(mocks.invoke).toHaveBeenCalledWith("create-payment-session", expect.objectContaining({
      body: {
        brand: "zentel_insight",
        productType: "zentel_course",
        programSlug: "graphic-design",
        trackSlug: "brand-and-social-media-design",
        customer: {
          fullName: "Test Student",
          email: "student@example.com",
          phone: "08000000000",
          studentName: ""
        },
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000"
      }
    }));
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty("amount");
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty("amountKobo");
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty("publicKey");
    expect(redirect).toHaveBeenCalledWith("https://checkout.paystack.com/secure-token");
    expect(readTemporaryPayment(pending.reference)).toMatchObject({
      reference: pending.reference,
      temporaryStatus: "redirected",
      verificationStatus: "unverified"
    });
  });

  it("does not redirect when the backend fails", async () => {
    const redirect = vi.fn();
    mocks.invoke.mockRejectedValue(new Error("Payments are temporarily unavailable. Please try again shortly."));
    const { startPaystackPayment } = await import("./paymentService.js");

    await expect(startPaystackPayment({ item: courseItem, customer, redirect })).rejects.toThrow(
      "Payments are temporarily unavailable. Please try again shortly."
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects a non-Paystack authorization URL", async () => {
    const redirect = vi.fn();
    mocks.invoke.mockResolvedValue({
      ok: true,
      mode: "backend",
      reference: "ZI-COURSE-1790000000000-ABCDEF1234",
      authorizationUrl: "https://example.com/not-paystack",
      amountKobo: 2000000
    });
    const { startPaystackPayment } = await import("./paymentService.js");

    await expect(startPaystackPayment({ item: courseItem, customer, redirect })).rejects.toThrow(
      "Payments are temporarily unavailable. Please try again shortly."
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends StudyHub selections for server-side pricing", async () => {
    const redirect = vi.fn();
    mocks.invoke.mockResolvedValue({
      ok: true,
      mode: "backend",
      paymentId: "payment-2",
      reference: "ZH-JSS-1790000000000-ABCDEF1234",
      authorizationUrl: "https://checkout.paystack.com/studyhub-token",
      amountKobo: 6000000
    });
    const { startPaystackPayment } = await import("./paymentService.js");
    const item = {
      paymentType: STUDYHUB_PAYMENT_TYPE,
      studyHub: {
        productType: "studyhub_registration",
        classLevel: "JSS2",
        classGroup: "JSS",
        subjects: ["Mathematics", "English Language"],
        months: 2
      }
    };

    await startPaystackPayment({
      item,
      customer: { ...customer, name: "Parent Name", studentName: "Student Name" },
      redirect
    });

    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({
      brand: "studyhub",
      classLevel: "JSS2",
      classGroup: "JSS",
      subjects: ["Mathematics", "English Language"],
      months: 2
    });
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty("amountKobo");
  });
});
