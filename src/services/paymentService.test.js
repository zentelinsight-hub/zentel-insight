/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STUDYHUB_PAYMENT_TYPE } from "../utils/paymentCalculations";

const paystackMocks = vi.hoisted(() => ({
  newTransaction: vi.fn(),
  resumeTransaction: vi.fn()
}));

const supabaseMocks = vi.hoisted(() => ({
  invoke: vi.fn()
}));

vi.mock("@paystack/inline-js", () => ({
  default: vi.fn(function PaystackPopMock() {
    this.newTransaction = paystackMocks.newTransaction;
    this.resumeTransaction = paystackMocks.resumeTransaction;
  })
}));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => ({
    functions: {
      invoke: supabaseMocks.invoke
    }
  })),
  getSupabaseSafeStatus: vi.fn(() => ({
    ready: true,
    urlConfigured: true,
    publishableKeyConfigured: true,
    issues: []
  }))
}));

const customer = {
  name: "Test Student",
  email: "student@example.com",
  phone: "08000000000"
};

const courseItem = {
  title: "Graphic Design - Brand and Social Media Design",
  price: 1,
  priceKobo: 100,
  programSlug: "graphic-design",
  levelSlug: "brand-and-social-media-design",
  level: "Brand and Social Media Design"
};

async function loadPaymentService(overrides = {}) {
  vi.resetModules();
  vi.stubEnv("VITE_PAYSTACK_PUBLIC_KEY", overrides.paystackPublicKey ?? "pk_test_public");
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon_public");
  return import("./paymentService.js");
}

beforeEach(() => {
  paystackMocks.newTransaction.mockReset();
  paystackMocks.resumeTransaction.mockReset();
  supabaseMocks.invoke.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("secure payment sessions", () => {
  it("does not create a frontend-only session when Supabase is unreachable", async () => {
    supabaseMocks.invoke.mockRejectedValue(new TypeError("Failed to fetch"));
    const { createPaymentSession } = await loadPaymentService();

    await expect(createPaymentSession({ item: courseItem, customer })).rejects.toThrow(
      "The payment server could not be reached"
    );

    expect(supabaseMocks.invoke).toHaveBeenCalledOnce();
    expect(supabaseMocks.invoke.mock.calls[0][0]).toBe("create-payment-session");
  });

  it("sends product identifiers only and accepts a backend-initialized session", async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        mode: "backend",
        reference: "ZI-COURSE-1790000000000-ABCDEF1234",
        accessCode: "access_code_test",
        amountKobo: 2000000,
        currency: "NGN",
        brand: "zentel_insight"
      },
      error: null
    });
    const { createPaymentSession } = await loadPaymentService();

    const session = await createPaymentSession({ item: courseItem, customer });
    const payload = supabaseMocks.invoke.mock.calls[0][1].body;

    expect(session).toMatchObject({
      mode: "backend",
      reference: "ZI-COURSE-1790000000000-ABCDEF1234",
      amountKobo: 2000000,
      accessCode: "access_code_test"
    });
    expect(supabaseMocks.invoke.mock.calls[0][0]).toBe("create-payment-session");
    expect(payload).toMatchObject({
      brand: "zentel_insight",
      productType: "zentel_course",
      programSlug: "graphic-design",
      trackSlug: "brand-and-social-media-design"
    });
    expect(payload).not.toHaveProperty("amount");
    expect(payload).not.toHaveProperty("amountKobo");
    expect(payload).not.toHaveProperty("price");
  });

  it("opens backend-initialized Paystack with the access code", async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        mode: "backend",
        reference: "ZI-COURSE-1790000000000-ABCDEF1234",
        accessCode: "access_code_test",
        amountKobo: 2000000,
        currency: "NGN",
        brand: "zentel_insight"
      },
      error: null
    });
    const { startPaystackPayment } = await loadPaymentService();

    await startPaystackPayment({
      item: courseItem,
      customer,
      onSuccess: vi.fn(),
      onCancel: vi.fn()
    });

    expect(paystackMocks.resumeTransaction).toHaveBeenCalledOnce();
    expect(paystackMocks.resumeTransaction.mock.calls[0][0]).toBe("access_code_test");
    expect(paystackMocks.newTransaction).not.toHaveBeenCalled();
  });

  it("uses only the server reference and trusted amount for safe frontend fallback", async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        mode: "frontend_fallback",
        paymentId: "payment-id",
        reference: "ZH-JSS-1790000000000-FEDCBA9876",
        email: "parent@example.com",
        amountKobo: 1500000,
        currency: "NGN",
        brand: "studyhub",
        metadata: {
          payment_id: "payment-id",
          brand: "studyhub",
          product_type: "studyhub_jss"
        }
      },
      error: null
    });
    const { startPaystackPayment } = await loadPaymentService();

    await startPaystackPayment({
      item: {
        paymentType: STUDYHUB_PAYMENT_TYPE,
        title: "Zentel Insight StudyHub - JSS1",
        price: 1,
        priceKobo: 100,
        studyHub: {
          productType: "studyhub_registration",
          classGroup: "JSS",
          classLevel: "JSS1",
          subjects: ["Mathematics"],
          months: 1
        }
      },
      customer: {
        name: "Parent Name",
        email: "parent@example.com",
        phone: "08000000000",
        studentName: "Student Name"
      },
      onSuccess: vi.fn(),
      onCancel: vi.fn()
    });

    expect(paystackMocks.newTransaction).toHaveBeenCalledOnce();
    expect(paystackMocks.newTransaction.mock.calls[0][0]).toMatchObject({
      key: "pk_test_public",
      email: "parent@example.com",
      amount: 1500000,
      currency: "NGN",
      reference: "ZH-JSS-1790000000000-FEDCBA9876",
      metadata: {
        payment_id: "payment-id",
        brand: "studyhub",
        product_type: "studyhub_jss"
      }
    });
  });

  it("blocks frontend fallback safely when the public key is missing", async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        mode: "frontend_fallback",
        paymentId: "payment-id",
        reference: "ZI-COURSE-1790000000000-ABCDEF1234",
        email: "student@example.com",
        amountKobo: 2000000,
        currency: "NGN",
        brand: "zentel_insight",
        metadata: { payment_id: "payment-id" }
      },
      error: null
    });
    const { startPaystackPayment } = await loadPaymentService({ paystackPublicKey: "" });

    await expect(startPaystackPayment({
      item: courseItem,
      customer,
      onSuccess: vi.fn(),
      onCancel: vi.fn()
    })).rejects.toMatchObject({
      paymentReference: "ZI-COURSE-1790000000000-ABCDEF1234"
    });

    expect(paystackMocks.newTransaction).not.toHaveBeenCalled();
    expect(paystackMocks.resumeTransaction).not.toHaveBeenCalled();
  });
});
