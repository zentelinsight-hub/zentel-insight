/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STUDYHUB_PAYMENT_TYPE,
  STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE,
  isValidPaymentReference
} from "../utils/paymentCalculations";

const paymentMocks = vi.hoisted(() => ({
  newTransaction: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@paystack/inline-js", () => ({
  default: vi.fn(function PaystackInlineMock() {
    this.newTransaction = paymentMocks.newTransaction;
  })
}));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => ({ rpc: paymentMocks.rpc }))
}));

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

function makeStudyHubItem(overrides = {}) {
  return {
    paymentType: STUDYHUB_PAYMENT_TYPE,
    studyHub: {
      productType: "studyhub_registration",
      classLevel: "JSS2",
      classGroup: "JSS",
      subjects: ["Mathematics", "English Language"],
      months: 2,
      ...overrides.studyHub
    }
  };
}

async function loadPaymentService(publicKey = "pk_test_public") {
  vi.resetModules();
  vi.stubEnv("VITE_PAYSTACK_PUBLIC_KEY", publicKey);
  return import("./paymentService.js");
}

function getPaystackConfig() {
  expect(paymentMocks.newTransaction).toHaveBeenCalledOnce();
  return paymentMocks.newTransaction.mock.calls[0][0];
}

beforeEach(() => {
  paymentMocks.newTransaction.mockReset();
  paymentMocks.rpc.mockReset();
  paymentMocks.rpc.mockImplementation(async (name, payload) => {
    if (name === "record_frontend_payment_event") {
      return { data: [{ reported_status: payload.input_event_type, verification_status: "unverified" }], error: null };
    }
    const productType = payload.input_product_type;
    const amountKobo = productType === STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE
      ? 3000000
      : productType === "studyhub_sss"
        ? 6000000
        : productType === "studyhub_jss"
          ? 6000000
          : 2000000;
    return {
      data: [{
        payment_id: "payment-1",
        reference: payload.input_reference,
        amount_kobo: amountKobo,
        verification_status: "unverified"
      }],
      error: null
    };
  });
  window.sessionStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(1790000000000);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("frontend-first Paystack checkout", () => {
  it("reports public-key mode and blocks checkout only when the public key is missing", async () => {
    const { getPaymentEnvironmentStatus, startPaystackPayment } = await loadPaymentService("");
    expect(getPaymentEnvironmentStatus({ VITE_PAYSTACK_PUBLIC_KEY: "pk_live_public" })).toEqual({
      paystackPublicKeyConfigured: true,
      paystackMode: "live"
    });
    await expect(startPaystackPayment({ item: courseItem, customer })).rejects.toThrow("Online payment is unavailable");
    expect(paymentMocks.newTransaction).not.toHaveBeenCalled();
  });

  it("records a main-programme attempt and opens Paystack with the authoritative amount", async () => {
    const onSuccess = vi.fn();
    const { readTemporaryPayment, startPaystackPayment } = await loadPaymentService();
    const pending = await startPaystackPayment({ item: courseItem, customer, onSuccess });
    const config = getPaystackConfig();

    expect(isValidPaymentReference(pending.reference)).toBe(true);
    expect(paymentMocks.rpc).toHaveBeenCalledWith("create_frontend_payment_attempt", expect.objectContaining({
      input_program_id: courseItem.programId,
      input_track_id: courseItem.trackId,
      input_program_slug: "graphic-design",
      input_track_slug: "brand-and-social-media-design"
    }));
    expect(config).toMatchObject({
      key: "pk_test_public",
      email: "student@example.com",
      amount: 2000000,
      currency: "NGN",
      reference: pending.reference
    });
    expect(pending).toMatchObject({
      providerMode: "frontend_direct",
      attemptPersisted: true,
      verificationStatus: "unverified"
    });

    config.onSuccess({ reference: pending.reference, id: "provider-1" });
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
      status: "client_success",
      verificationStatus: "unverified",
      path: `/payment-success?reference=${pending.reference}`
    }));
    expect(readTemporaryPayment(pending.reference)).toMatchObject({
      temporaryStatus: "client_success",
      verificationStatus: "unverified"
    });
    await vi.waitFor(() => expect(paymentMocks.rpc).toHaveBeenCalledWith(
      "record_frontend_payment_event",
      expect.objectContaining({ input_event_type: "client_success" })
    ));
  });

  it("still opens Paystack and queues a retry when the attempt write fails", async () => {
    paymentMocks.rpc.mockRejectedValueOnce(new Error("temporary database outage"));
    const { PAYMENT_RETRY_STORAGE_KEY, startPaystackPayment } = await loadPaymentService();
    const pending = await startPaystackPayment({ item: courseItem, customer });

    expect(getPaystackConfig()).toMatchObject({ amount: 2000000, reference: pending.reference });
    expect(pending.attemptPersisted).toBe(false);
    expect(JSON.parse(window.sessionStorage.getItem(PAYMENT_RETRY_STORAGE_KEY))).toEqual([
      expect.objectContaining({ reference: pending.reference, attemptPersisted: false })
    ]);
  });

  it("records a closed checkout and a declined checkout without marking either verified", async () => {
    const onCancel = vi.fn();
    const onError = vi.fn();
    const { readTemporaryPayment, startPaystackPayment } = await loadPaymentService();

    const cancelled = await startPaystackPayment({ item: courseItem, customer, onCancel });
    getPaystackConfig().onCancel();
    expect(onCancel).toHaveBeenCalledWith(
      "The payment window was closed before completion.",
      expect.objectContaining({ path: `/payment-failed?reference=${cancelled.reference}&reason=closed` })
    );
    expect(readTemporaryPayment(cancelled.reference)).toMatchObject({ temporaryStatus: "closed", verificationStatus: "unverified" });

    paymentMocks.newTransaction.mockReset();
    const declined = await startPaystackPayment({ item: courseItem, customer, onError });
    getPaystackConfig().onError(new Error("Bank declined the transaction"));
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Payment was declined." }),
      expect.objectContaining({ path: `/payment-failed?reference=${declined.reference}&reason=declined` })
    );
    expect(readTemporaryPayment(declined.reference)).toMatchObject({ temporaryStatus: "failed", failureReason: "declined" });
  });

  it("opens StudyHub JSS and SSS with calculated prices", async () => {
    const { startPaystackPayment } = await loadPaymentService();
    const payer = { ...customer, name: "Parent Name", studentName: "Student Name" };
    const jss = await startPaystackPayment({ item: makeStudyHubItem(), customer: payer });
    expect(getPaystackConfig()).toMatchObject({ amount: 6000000, reference: jss.reference });

    paymentMocks.newTransaction.mockReset();
    const sss = await startPaystackPayment({
      item: makeStudyHubItem({ studyHub: { classLevel: "SSS1", classGroup: "SSS", subjects: ["Physics"], months: 3 } }),
      customer: payer
    });
    expect(getPaystackConfig()).toMatchObject({ amount: 6000000, reference: sss.reference });
  });

  it("opens StudyHub Summer Lessons as a one-time frontend payment", async () => {
    const onSuccess = vi.fn();
    const { startPaystackPayment } = await loadPaymentService();
    const pending = await startPaystackPayment({
      item: makeStudyHubItem({
        studyHub: {
          productType: STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE,
          classLevel: "SSS2",
          classGroup: "SSS",
          subjects: [],
          months: 1
        }
      }),
      customer: { ...customer, name: "Parent Name", studentName: "Student Name" },
      onSuccess
    });
    const config = getPaystackConfig();
    expect(config).toMatchObject({ amount: 3000000, reference: pending.reference });
    config.onSuccess({ reference: pending.reference });
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
      status: "client_success",
      verificationStatus: "unverified",
      path: `/studyhub/payment-success?reference=${pending.reference}`
    }));
  });
});
