/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STUDYHUB_PAYMENT_TYPE,
  STUDYHUB_SUMMER_LESSONS_PAYMENT_TYPE,
  isValidPaymentReference
} from "../utils/paymentCalculations";

const paystackMocks = vi.hoisted(() => ({
  newTransaction: vi.fn(),
  resumeTransaction: vi.fn(),
  invokeEdgeFunction: vi.fn()
}));

vi.mock("@paystack/inline-js", () => ({
  default: vi.fn(function PaystackInlineMock() {
    this.newTransaction = paystackMocks.newTransaction;
    this.resumeTransaction = paystackMocks.resumeTransaction;
  })
}));

vi.mock("./edgeFunctionClient", () => ({
  EdgeFunctionError: class EdgeFunctionError extends Error {},
  invokeEdgeFunction: vi.fn((...args) => paystackMocks.invokeEdgeFunction(...args))
}));

const customer = {
  name: "Test Student",
  email: "Student@Example.com",
  phone: "08000000000"
};

const courseItem = {
  title: "Untrusted UI title",
  price: 1,
  priceKobo: 100,
  programSlug: "graphic-design",
  levelSlug: "brand-and-social-media-design",
  level: "Brand and Social Media Design"
};

function makeStudyHubItem(overrides = {}) {
  const studyHub = {
    productType: "studyhub_registration",
    classLevel: "JSS2",
    classGroup: "JSS",
    subjects: ["Mathematics", "English Language"],
    months: 2,
    ...overrides.studyHub
  };

  return {
    paymentType: STUDYHUB_PAYMENT_TYPE,
    title: "StudyHub checkout",
    price: 1,
    priceKobo: 100,
    studyHub,
    ...overrides
  };
}

async function loadPaymentService(overrides = {}) {
  vi.resetModules();
  vi.stubEnv("VITE_PAYSTACK_PUBLIC_KEY", overrides.paystackPublicKey ?? "pk_test_public");
  return import("./paymentService.js");
}

function getPaystackConfig() {
  expect(paystackMocks.newTransaction).toHaveBeenCalledOnce();
  return paystackMocks.newTransaction.mock.calls[0][0];
}

beforeEach(() => {
  paystackMocks.newTransaction.mockReset();
  paystackMocks.resumeTransaction.mockReset();
  paystackMocks.invokeEdgeFunction.mockReset();
  let sequence = 0;
  paystackMocks.invokeEdgeFunction.mockImplementation((_functionName, options = {}) => {
    sequence += 1;
    const body = options.body || {};
    const isStudyHub = body.brand === "studyhub";
    const subjectCount = Array.isArray(body.subjects) ? body.subjects.length : 0;
    const amountKobo = isStudyHub
      ? body.productType === "studyhub_summer_lessons"
        ? 3000000
        : (body.classGroup === "SSS" ? 2000000 : 1500000) * Math.max(1, subjectCount) * Math.max(1, Number(body.months || 1))
      : 2000000;
    const prefix = isStudyHub
      ? body.productType === "studyhub_summer_lessons" ? "ZH-SUMMER" : body.classGroup === "SSS" ? "ZH-SSS" : "ZH-JSS"
      : "ZI-COURSE";
    return Promise.resolve({
      ok: true,
      mode: "frontend_fallback",
      paymentId: `payment-${sequence}`,
      reference: `${prefix}-1790000000000-SERVER${String(sequence).padStart(2, "0")}`,
      amountKobo,
      currency: "NGN",
      brand: body.brand
    });
  });
  window.sessionStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(1790000000000);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("trusted Paystack checkout", () => {
  it("reports Paystack public-key status and blocks checkout when the key is missing", async () => {
    const { getPaymentEnvironmentStatus, startPaystackPayment, PENDING_PAYMENT_STORAGE_KEY } = await loadPaymentService({
      paystackPublicKey: ""
    });

    expect(getPaymentEnvironmentStatus({ VITE_PAYSTACK_PUBLIC_KEY: "pk_live_public" })).toEqual({
      paystackPublicKeyConfigured: true,
      paystackMode: "live"
    });
    await expect(startPaystackPayment({ item: courseItem, customer })).rejects.toThrow(
      "Online payment is unavailable"
    );
    expect(paystackMocks.newTransaction).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_PAYMENT_STORAGE_KEY)).toBeNull();
  });

  it("opens Paystack for a main course from a trusted Edge Function session", async () => {
    const onSuccess = vi.fn();
    const { PENDING_PAYMENT_STORAGE_KEY, readTemporaryPayment, startPaystackPayment } = await loadPaymentService();

    const pending = await startPaystackPayment({
      item: courseItem,
      customer,
      onSuccess
    });
    const config = getPaystackConfig();
    const stored = JSON.parse(window.sessionStorage.getItem(PENDING_PAYMENT_STORAGE_KEY));

    expect(isValidPaymentReference(pending.reference)).toBe(true);
    expect(paystackMocks.invokeEdgeFunction).toHaveBeenCalledWith("create-payment-session", expect.objectContaining({
      body: expect.objectContaining({
        brand: "zentel_insight",
        programSlug: "graphic-design",
        trackSlug: "brand-and-social-media-design"
      })
    }));
    expect(pending.reference).toMatch(/^ZI-COURSE-1790000000000-SERVER[0-9]{2}$/);
    expect(config).toMatchObject({
      key: "pk_test_public",
      email: "student@example.com",
      amount: 2000000,
      currency: "NGN",
      reference: pending.reference,
      metadata: {
        brand: "zentel_insight",
        product_type: "zentel_course",
        program_slug: "graphic-design",
        track_slug: "brand-and-social-media-design"
      }
    });
    expect(stored).toMatchObject({
      reference: pending.reference,
      productTitle: "Graphic Design",
      trackName: "Brand and Social Media Design",
      amountKobo: 2000000,
      customerEmail: "student@example.com",
      temporaryStatus: "pending",
      providerMode: "frontend_fallback",
      paymentId: "payment-1"
    });

    config.onSuccess({ reference: pending.reference });

    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
      reference: pending.reference,
      status: "success",
      path: `/payment-success?reference=${pending.reference}`
    }));
    expect(readTemporaryPayment(pending.reference)).toMatchObject({
      reference: pending.reference,
      temporaryStatus: "success"
    });
  });

  it("resumes backend-initialized Paystack transactions with the server access code", async () => {
    paystackMocks.invokeEdgeFunction.mockResolvedValueOnce({
      ok: true,
      mode: "backend",
      paymentId: "payment-backend",
      reference: "ZI-COURSE-1790000000000-BACKEND1",
      amountKobo: 2000000,
      accessCode: "access-code-123",
      brand: "zentel_insight"
    });

    const { startPaystackPayment } = await loadPaymentService();
    const pending = await startPaystackPayment({ item: courseItem, customer });

    expect(pending).toMatchObject({
      reference: "ZI-COURSE-1790000000000-BACKEND1",
      amountKobo: 2000000,
      providerMode: "backend",
      paymentId: "payment-backend"
    });
    expect(paystackMocks.resumeTransaction).toHaveBeenCalledWith("access-code-123");
    expect(paystackMocks.newTransaction).not.toHaveBeenCalled();
  });

  it("blocks checkout when the trusted payment Edge Function is unavailable", async () => {
    paystackMocks.invokeEdgeFunction.mockRejectedValueOnce(new Error("Payment setup is temporarily unavailable."));
    const { startPaystackPayment } = await loadPaymentService();

    await expect(startPaystackPayment({ item: courseItem, customer })).rejects.toThrow(
      "Payment setup is temporarily unavailable"
    );
    expect(paystackMocks.newTransaction).not.toHaveBeenCalled();
  });

  it("records cancelled and errored main-course checkouts from trusted Edge records", async () => {
    const onCancel = vi.fn();
    const onError = vi.fn();
    const { readTemporaryPayment, startPaystackPayment } = await loadPaymentService();

    const cancelled = await startPaystackPayment({
      item: courseItem,
      customer,
      onCancel
    });
    getPaystackConfig().onCancel();

    expect(onCancel).toHaveBeenCalledWith(
      "The payment window was closed before completion.",
      expect.objectContaining({
        reference: cancelled.reference,
        path: `/payment-failed?reference=${cancelled.reference}&reason=cancelled`
      })
    );
    expect(readTemporaryPayment(cancelled.reference)).toMatchObject({
      temporaryStatus: "cancelled",
      failureReason: "cancelled"
    });

    paystackMocks.newTransaction.mockReset();
    const errored = await startPaystackPayment({
      item: courseItem,
      customer,
      onError
    });
    getPaystackConfig().onError(new Error("Bank declined the transaction"));

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Payment was declined." }),
      expect.objectContaining({
        reference: errored.reference,
        path: `/payment-failed?reference=${errored.reference}&reason=declined`
      })
    );
    expect(readTemporaryPayment(errored.reference)).toMatchObject({
      temporaryStatus: "declined",
      failureReason: "declined"
    });
  });

  it("opens StudyHub JSS and SSS checkout with calculated subject pricing", async () => {
    const { startPaystackPayment } = await loadPaymentService();

    const jss = await startPaystackPayment({
      item: makeStudyHubItem(),
      customer: { ...customer, name: "Parent Name", studentName: "Student Name" }
    });
    let config = getPaystackConfig();
    expect(jss.reference).toMatch(/^ZH-JSS-1790000000000-[A-Z0-9]{8,}$/);
    expect(config).toMatchObject({
      email: "student@example.com",
      amount: 6000000,
      reference: jss.reference,
      metadata: {
        brand: "studyhub",
        product_type: "studyhub_jss",
        class_level: "JSS2",
        student_name: "Student Name"
      }
    });

    paystackMocks.newTransaction.mockReset();
    const sss = await startPaystackPayment({
      item: makeStudyHubItem({
        studyHub: {
          classLevel: "SSS1",
          classGroup: "SSS",
          subjects: ["Physics"],
          months: 3
        }
      }),
      customer: { ...customer, name: "Parent Name", studentName: "Student Name" }
    });
    config = getPaystackConfig();
    expect(sss.reference).toMatch(/^ZH-SSS-1790000000000-[A-Z0-9]{8,}$/);
    expect(config).toMatchObject({
      amount: 6000000,
      reference: sss.reference,
      metadata: {
        brand: "studyhub",
        product_type: "studyhub_sss",
        class_level: "SSS1"
      }
    });
  });

  it("opens StudyHub Summer Lessons checkout as a fixed one-time payment", async () => {
    const onSuccess = vi.fn();
    const { readTemporaryPayment, startPaystackPayment } = await loadPaymentService();

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

    expect(pending.reference).toMatch(/^ZH-SUMMER-1790000000000-[A-Z0-9]{8,}$/);
    expect(config).toMatchObject({
      amount: 3000000,
      reference: pending.reference,
      metadata: {
        brand: "studyhub",
        product_type: "studyhub_summer_lessons",
        class_level: "SSS2"
      }
    });

    config.onSuccess({ reference: pending.reference });

    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
      path: `/studyhub/payment-success?reference=${pending.reference}`,
      status: "success"
    }));
    expect(readTemporaryPayment(pending.reference)).toMatchObject({
      productType: "studyhub_summer_lessons",
      productTitle: "Summer Lessons",
      amountKobo: 3000000,
      temporaryStatus: "success"
    });
  });
});
