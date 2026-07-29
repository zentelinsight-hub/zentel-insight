import { afterEach, describe, expect, it, vi } from "vitest";
import { assertVerifiedPaymentMatchesStoredPayment, fulfilSuccessfulPayment, hmacSha512Hex, initializePaystackTransaction, normalizePaymentReference, timingSafeEqualHex } from "./payments.ts";

const payment = {
  id: "11111111-1111-4111-8111-111111111111",
  reference: "ZI-AI-TOPUP-1720000000000-ABCDEF1234",
  amount_kobo: 300000,
  currency: "NGN",
  customer_email: "student@example.com",
  brand: "zentel",
  product_type: "zentel_ai_topup",
  status: "pending",
  fulfilment_status: "awaiting_webhook"
};

const providerData = {
  id: 1234,
  reference: payment.reference,
  amount: payment.amount_kobo,
  currency: "NGN",
  customer: { email: payment.customer_email },
  metadata: { payment_id: payment.id, brand: payment.brand, product_type: payment.product_type }
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).Deno;
});

describe("Paystack server policy", () => {
  it("accepts Zentel AI references and rejects unsafe references", () => {
    expect(normalizePaymentReference(payment.reference)).toBe(payment.reference);
    expect(normalizePaymentReference("ZI-AI-TOPUP-../../secret")).toBe("");
  });

  it("fails safely when PAYSTACK_API_KEY is missing", async () => {
    (globalThis as any).Deno = { env: { get: vi.fn((name) => { expect(name).toBe("PAYSTACK_API_KEY"); return undefined; }) } };
    await expect(initializePaystackTransaction({ email: payment.customer_email, amountKobo: payment.amount_kobo, reference: payment.reference, callbackUrl: "https://zentelinsight.com.ng/portal/zentel-ai/usage", metadata: {} })).rejects.toThrow(/unavailable/);
  });

  it("verifies webhook signatures without timing-sensitive equality", async () => {
    const signature = await hmacSha512Hex("sk_test_example", "raw-body");
    expect(timingSafeEqualHex(signature, signature)).toBe(true);
    const altered = `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`;
    expect(timingSafeEqualHex(signature, altered)).toBe(false);
  });

  it("rejects incorrect amount, currency, customer and product metadata", () => {
    expect(() => assertVerifiedPaymentMatchesStoredPayment(payment, { ...providerData, amount: 1 })).toThrow(/mismatch/);
    expect(() => assertVerifiedPaymentMatchesStoredPayment(payment, { ...providerData, currency: "USD" })).toThrow(/mismatch/);
    expect(() => assertVerifiedPaymentMatchesStoredPayment(payment, { ...providerData, customer: { email: "other@example.com" } })).toThrow(/mismatch/);
    expect(() => assertVerifiedPaymentMatchesStoredPayment(payment, { ...providerData, metadata: { ...providerData.metadata, product_type: "other" } })).toThrow(/mismatch/);
  });

  it("does not grant AI value from browser verification", async () => {
    const rpc = vi.fn();
    const single = vi.fn().mockResolvedValue({ data: { ...payment, status: "success" }, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update })), rpc };
    const result = await fulfilSuccessfulPayment(supabase, payment, providerData, "browser_verify");
    expect(result.status).toBe("success");
    expect(rpc).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ fulfilment_status: "awaiting_webhook" }));
  });
});
