/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STUDYHUB_PAYMENT_TYPE } from "../utils/paymentCalculations";

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => null)
}));

const customer = {
  name: "Test Student",
  email: "student@example.com",
  phone: "08000000000"
};

const courseItem = {
  title: "Graphic Design - Brand and Social Media Design",
  price: 20000,
  priceKobo: 2000000,
  programSlug: "graphic-design",
  levelSlug: "brand-and-social-media-design",
  level: "Brand and Social Media Design"
};

async function loadPaymentService() {
  vi.resetModules();
  vi.stubEnv("VITE_PAYSTACK_PUBLIC_KEY", "pk_test_public");
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon_public");
  return import("./paymentService.js");
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete window.PaystackPop;
});

describe("payment session fallback", () => {
  it("creates a frontend Paystack session when the Supabase function fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const { createPaymentSession } = await loadPaymentService();

    const session = await createPaymentSession({ item: courseItem, customer });

    expect(fetch).toHaveBeenCalledOnce();
    expect(session).toMatchObject({
      amountKobo: 2000000,
      currency: "NGN",
      frontendOnly: true
    });
    expect(session.reference).toMatch(/^ZI-\d+-[A-Z0-9]+$/);
  });

  it("uses the StudyHub reference prefix for frontend fallback sessions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Function unavailable." })
    })));
    const { createPaymentSession } = await loadPaymentService();

    const session = await createPaymentSession({
      item: {
        paymentType: STUDYHUB_PAYMENT_TYPE,
        title: "Zentel Insight StudyHub - JSS1",
        price: 15000,
        priceKobo: 1500000
      },
      customer
    });

    expect(session.frontendOnly).toBe(true);
    expect(session.reference).toMatch(/^ZISH-\d+-[A-Z0-9]+$/);
  });

  it("opens Paystack with the public key after falling back from a failed session fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const openIframe = vi.fn();
    const setup = vi.fn(() => ({ openIframe }));
    window.PaystackPop = { setup };
    const { startPaystackPayment } = await loadPaymentService();

    await startPaystackPayment({
      item: courseItem,
      customer,
      onSuccess: vi.fn(),
      onCancel: vi.fn()
    });

    expect(setup).toHaveBeenCalledOnce();
    expect(openIframe).toHaveBeenCalledOnce();
    expect(setup.mock.calls[0][0]).toMatchObject({
      key: "pk_test_public",
      email: customer.email,
      amount: 2000000,
      currency: "NGN"
    });
    expect(setup.mock.calls[0][0].ref).toMatch(/^ZI-\d+-[A-Z0-9]+$/);
  });
});
