import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CircleCheck, CircleX, Clock, RefreshCw, Receipt, TriangleAlert } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { siteConfig } from "../data/site";
import { verifyPayment } from "../services/paymentService";
import { formatCurrency, formatDateTime, isValidEmail, sanitizeText } from "../utils/format";
import { mapPaymentStatus, normalizePaymentReference } from "../utils/paymentCalculations";
import { usePageMeta } from "../utils/usePageMeta";

const maxVerificationAttempts = 3;
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
  const reference = normalizePaymentReference(searchParams.get("reference"), searchParams.get("trxref"));
  if (!reference) return "invalid reference";
  return "verifying";
}

function readDetails(searchParams) {
  return {
    reference: normalizePaymentReference(searchParams.get("reference"), searchParams.get("trxref")),
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
  const location = useLocation();
  const details = useMemo(() => readDetails(searchParams), [searchParams]);
  const [verifiedPayment, setVerifiedPayment] = useState(null);
  const routeBrand = location.pathname.startsWith("/studyhub") || details.reference.startsWith("ZH-") ? "studyhub" : "main";
  const brand = verifiedPayment?.brand === "studyhub" ? "studyhub" : verifiedPayment?.brand ? "main" : routeBrand;
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
  const display = {
    reference: verifiedPayment?.reference || details.reference,
    program: verifiedPayment?.product_name || details.program,
    level: verifiedPayment?.selected_level || details.level,
    amount: Number.isFinite(Number(verifiedPayment?.amount_kobo || verifiedPayment?.expected_amount_kobo))
      ? Number(verifiedPayment?.amount_kobo || verifiedPayment?.expected_amount_kobo) / 100
      : details.amount,
    name: verifiedPayment?.customer_name || details.name,
    email: verifiedPayment?.customer_email || details.email,
    phone: verifiedPayment?.customer_phone || details.phone,
    student: verifiedPayment?.student_name || details.student,
    classLevel: verifiedPayment?.class_level || verifiedPayment?.selected_class || details.classLevel,
    productType: verifiedPayment?.product_type || details.productType,
    subjects: Array.isArray(verifiedPayment?.selected_subjects)
      ? verifiedPayment.selected_subjects.join(", ")
      : details.subjects,
    months: verifiedPayment?.months ? String(verifiedPayment.months) : details.months,
    date: verifiedPayment?.paid_at || verifiedPayment?.created_at || details.date
  };

  const receiptParams = new URLSearchParams({
    brand,
    reference: display.reference,
    program: display.program,
    level: display.level,
    amount: Number.isFinite(display.amount) ? String(display.amount) : "",
    name: display.name,
    email: display.email,
    phone: display.phone,
    student: display.student,
    class: display.classLevel,
    productType: display.productType,
    subjects: display.subjects,
    months: display.months,
    date: display.date,
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
    setVerifiedPayment(null);
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
        if (result.payment) setVerifiedPayment(result.payment);
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
    }, attempts === 0 ? 0 : verificationIntervalMs * attempts);

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
              <div><dt>Reference</dt><dd>{display.reference}</dd></div>
              <div><dt>Programme</dt><dd>{display.level ? `${display.program} - ${display.level}` : display.program}</dd></div>
              <div><dt>Amount</dt><dd>{formatCurrency(display.amount)}</dd></div>
              <div><dt>Payer</dt><dd>{display.name}</dd></div>
              {display.student ? <div><dt>Student</dt><dd>{display.student}</dd></div> : null}
              {display.classLevel ? <div><dt>Class</dt><dd>{display.classLevel}</dd></div> : null}
              {display.productType ? <div><dt>Product type</dt><dd>{display.productType === "studyhub_summer_lessons" ? "Summer Lessons" : display.productType}</dd></div> : null}
              {display.subjects ? <div><dt>Selected subjects</dt><dd>{display.subjects}</dd></div> : null}
              {display.months ? <div><dt>Months</dt><dd>{display.months}</dd></div> : null}
              <div>
                <dt>Email</dt>
                <dd>
                  {isValidEmail(display.email) ? <a href={`mailto:${display.email}`}>{display.email}</a> : display.email}
                </dd>
              </div>
              {display.phone ? <div><dt>Phone</dt><dd>{display.phone}</dd></div> : null}
              <div><dt>Date</dt><dd>{formatDateTime(display.date)}</dd></div>
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
                <Link className="button button-primary" to={`/signup?email=${encodeURIComponent(display.email)}`}>
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
