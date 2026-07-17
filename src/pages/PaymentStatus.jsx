import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleCheck, CircleX, Clock, RefreshCw, Receipt, TriangleAlert } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { siteConfig } from "../data/site";
import { verifyPayment } from "../services/paymentService";
import { formatCurrency, formatDateTime, isValidEmail, sanitizeText } from "../utils/format";
import { mapPaymentStatus } from "../utils/paymentCalculations";
import { usePageMeta } from "../utils/usePageMeta";

const maxVerificationAttempts = 6;
const verificationIntervalMs = 5000;

const statusCopy = {
  verifying: {
    title: "Verifying Payment",
    body: "The server is checking this payment reference with Paystack.",
    className: "warning",
    icon: RefreshCw
  },
  successful: {
    title: "Payment Verified",
    body: "This payment has been confirmed by server-side verification.",
    className: "success",
    icon: CircleCheck
  },
  cancelled: {
    title: "Payment Cancelled",
    body: "No enrolment was activated because the payment was cancelled or abandoned.",
    className: "warning",
    icon: CircleX
  },
  failed: {
    title: "Payment Could Not Be Verified",
    body: "The transaction could not be verified. You can retry payment or contact support.",
    className: "warning",
    icon: TriangleAlert
  },
  pending: {
    title: "Payment Confirmation Pending",
    body: "Automatic verification has stopped for now. No enrolment is active until verification succeeds.",
    className: "warning",
    icon: Clock
  },
  "invalid reference": {
    title: "Invalid Payment Reference",
    body: "A valid payment reference is required before this status can be checked.",
    className: "warning",
    icon: TriangleAlert
  }
};

function getInitialStatus(searchParams) {
  const reference = searchParams.get("reference") || "";
  const browserStatus = mapPaymentStatus(searchParams.get("status") || (reference ? "pending" : ""));
  if (!reference) return "invalid reference";
  if (["cancelled", "failed"].includes(browserStatus)) return browserStatus;
  if (searchParams.get("verified") === "true") return "successful";
  if (browserStatus === "successful" || browserStatus === "pending") return "verifying";
  return browserStatus;
}

function readDetails(searchParams) {
  return {
    reference: sanitizeText(searchParams.get("reference"), ""),
    program: sanitizeText(searchParams.get("program"), "Selected programme"),
    level: sanitizeText(searchParams.get("level"), ""),
    amount: Number(searchParams.get("amount")),
    name: sanitizeText(searchParams.get("name"), "Payer"),
    email: sanitizeText(searchParams.get("email"), "Email unavailable"),
    phone: sanitizeText(searchParams.get("phone"), ""),
    student: sanitizeText(searchParams.get("student"), ""),
    classLevel: sanitizeText(searchParams.get("class"), ""),
    productType: sanitizeText(searchParams.get("productType"), ""),
    subjects: sanitizeText(searchParams.get("subjects"), ""),
    months: sanitizeText(searchParams.get("months"), ""),
    date: sanitizeText(searchParams.get("date"), new Date().toISOString())
  };
}

export default function PaymentStatus() {
  const [searchParams] = useSearchParams();
  const details = useMemo(() => readDetails(searchParams), [searchParams]);
  const brand = searchParams.get("brand") === "studyhub" || details.reference.startsWith("ZISH-") ? "studyhub" : "main";
  const brandConfig = brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const [status, setStatus] = useState(() => getInitialStatus(searchParams));
  const [attempts, setAttempts] = useState(0);
  const [message, setMessage] = useState("");
  const timeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const copy = statusCopy[status] || statusCopy.pending;
  const StatusIcon = copy.icon;
  const canVerify = details.reference && ["verifying", "pending"].includes(status);
  const retryHref = brand === "studyhub" ? "/studyhub/enrol" : "/programs";
  const supportHref = brand === "studyhub" ? "/studyhub/contact" : "/contact";

  const receiptParams = new URLSearchParams({
    brand,
    reference: details.reference,
    program: details.program,
    level: details.level,
    amount: Number.isFinite(details.amount) ? String(details.amount) : "",
    name: details.name,
    email: details.email,
    phone: details.phone,
    student: details.student,
    class: details.classLevel,
    productType: details.productType,
    subjects: details.subjects,
    months: details.months,
    date: details.date,
    verified: "true",
    verificationConfigured: "true"
  });

  usePageMeta({
    path: "/payment-status",
    title: "Payment Status",
    description: "Check Zentel Insight payment status.",
    favicon: brandConfig.favicon,
    image: `${siteConfig.domain}${brandConfig.ogImage}`,
    robots: "noindex,nofollow"
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setStatus(getInitialStatus(searchParams));
    setAttempts(0);
    setMessage("");
    window.clearTimeout(timeoutRef.current);
  }, [searchParams]);

  useEffect(() => {
    if (!canVerify || attempts >= maxVerificationAttempts) {
      if (status === "verifying" && attempts >= maxVerificationAttempts) {
        setStatus("pending");
      }
      return undefined;
    }

    timeoutRef.current = window.setTimeout(async () => {
      try {
        const result = await verifyPayment(details.reference);
        if (!mountedRef.current) return;
        if (result.verified || result.status === "success") {
          setStatus("successful");
          setMessage(result.message || "Payment verified.");
          return;
        }
        const nextStatus = mapPaymentStatus(result.status);
        if (["cancelled", "failed"].includes(nextStatus)) {
          setStatus(nextStatus);
          setMessage(result.message || "");
          return;
        }
        setAttempts((current) => current + 1);
      } catch (error) {
        if (!mountedRef.current) return;
        setMessage(error.message || "Payment verification is unavailable.");
        setAttempts((current) => current + 1);
      }
    }, attempts === 0 ? 0 : verificationIntervalMs);

    return () => window.clearTimeout(timeoutRef.current);
  }, [attempts, canVerify, details.reference, status]);

  async function checkAgain() {
    if (!details.reference) return;
    window.clearTimeout(timeoutRef.current);
    setStatus("verifying");
    setAttempts(0);
    setMessage("");
  }

  return (
    <section className="page-section visual-section payment-visual-section">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container narrow visual-section__content">
        <div className="receipt-card">
          <BrandLogo brand={brand} className="receipt-brand-logo" size="payment" />
          <div className={`receipt-status ${copy.className}`}>
            <StatusIcon size={28} aria-hidden="true" />
            <div>
              <p className="eyebrow">Payment status</p>
              <h1>{copy.title}</h1>
              <p>{message || copy.body}</p>
            </div>
          </div>

          {details.reference ? (
            <dl className="receipt-details">
              <div><dt>Reference</dt><dd>{details.reference}</dd></div>
              <div><dt>Programme</dt><dd>{details.level ? `${details.program} - ${details.level}` : details.program}</dd></div>
              <div><dt>Amount</dt><dd>{formatCurrency(details.amount)}</dd></div>
              <div><dt>Payer</dt><dd>{details.name}</dd></div>
              {details.student ? <div><dt>Student</dt><dd>{details.student}</dd></div> : null}
              {details.classLevel ? <div><dt>Class</dt><dd>{details.classLevel}</dd></div> : null}
              {details.productType ? <div><dt>Product type</dt><dd>{details.productType === "studyhub_summer_lessons" ? "Summer Lessons" : details.productType}</dd></div> : null}
              {details.subjects ? <div><dt>Selected subjects</dt><dd>{details.subjects}</dd></div> : null}
              {details.months ? <div><dt>Months</dt><dd>{details.months}</dd></div> : null}
              <div>
                <dt>Email</dt>
                <dd>
                  {isValidEmail(details.email) ? <a href={`mailto:${details.email}`}>{details.email}</a> : details.email}
                </dd>
              </div>
              {details.phone ? <div><dt>Phone</dt><dd>{details.phone}</dd></div> : null}
              <div><dt>Date</dt><dd>{formatDateTime(details.date)}</dd></div>
              <div><dt>Verification attempts</dt><dd>{Math.min(attempts, maxVerificationAttempts)} of {maxVerificationAttempts}</dd></div>
            </dl>
          ) : null}

          {brand === "main" && status === "successful" ? (
            <div className="form-status success">
              Create your student account using the same email address used for payment to access your course, timetable,
              resources and announcements.
            </div>
          ) : null}

          <div className="receipt-actions">
            {status === "successful" ? (
              <Link className="button button-primary" to={`${brand === "studyhub" ? "/studyhub/payment-success" : "/payment-success"}?${receiptParams.toString()}`}>
                Printable Receipt
                <Receipt size={18} aria-hidden="true" />
              </Link>
            ) : null}
            {["pending", "verifying"].includes(status) ? (
              <button className="button button-secondary" type="button" onClick={checkAgain} disabled={!details.reference || status === "verifying"}>
                Check Again
                <RefreshCw size={18} aria-hidden="true" />
              </button>
            ) : null}
            {status === "successful" && brand === "main" ? (
              <>
                <Link className="button button-primary" to={`/signup?email=${encodeURIComponent(details.email)}`}>
                  Create Student Account
                </Link>
                <Link className="button button-secondary" to={`/login?redirect=${encodeURIComponent("/portal")}`}>
                  Login
                </Link>
              </>
            ) : null}
            {["cancelled", "failed", "pending", "invalid reference"].includes(status) ? (
              <Link className="button button-primary" to={retryHref}>
                {brand === "studyhub" ? "Return to Enrolment" : "Return to Programs"}
              </Link>
            ) : null}
            <Link className="button button-secondary" to={supportHref}>
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
