import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CircleCheck, CircleX, Clock, Receipt, TriangleAlert } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { siteConfig } from "../data/site";
import { readTemporaryPayment } from "../services/paymentService";
import { formatCurrency, formatDateTime, isValidEmail } from "../utils/format";
import { normalizePaymentReference } from "../utils/paymentCalculations";
import { usePageMeta } from "../utils/usePageMeta";

const statusCopy = {
  success: {
    title: "Payment completed",
    body: "Paystack reported this checkout as completed in this browser session.",
    className: "success",
    icon: CircleCheck
  },
  cancelled: {
    title: "Payment was not completed",
    body: "The Paystack checkout was closed or cancelled.",
    className: "warning",
    icon: CircleX
  },
  declined: {
    title: "Payment was declined",
    body: "Your bank or Paystack declined the transaction.",
    className: "warning",
    icon: TriangleAlert
  },
  error: {
    title: "Payment could not be completed",
    body: "Paystack reported an error while processing this transaction.",
    className: "warning",
    icon: TriangleAlert
  },
  pending: {
    title: "Payment confirmation pending",
    body: "This checkout has not been marked complete in this browser session.",
    className: "warning",
    icon: Clock
  },
  unavailable: {
    title: "Payment details unavailable",
    body: "We could not find the payment details for this page.",
    className: "warning",
    icon: TriangleAlert
  }
};

function getStatus(record) {
  if (!record) return "unavailable";
  if (record.temporaryStatus === "success") return "success";
  if (["cancelled", "declined", "error"].includes(record.temporaryStatus)) return record.temporaryStatus;
  if (["cancelled", "declined", "error"].includes(record.failureReason)) return record.failureReason;
  return "pending";
}

function getFailureReason(status) {
  return ["cancelled", "declined", "error"].includes(status) ? status : "failed";
}

export default function PaymentStatus() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const reference = useMemo(
    () => normalizePaymentReference(searchParams.get("reference"), searchParams.get("trxref")),
    [searchParams]
  );
  const record = useMemo(() => readTemporaryPayment(reference), [reference]);
  const routeBrand = location.pathname.startsWith("/studyhub") || reference.startsWith("ZH-") ? "studyhub" : "main";
  const brand = record?.brand === "studyhub" ? "studyhub" : record ? "main" : routeBrand;
  const brandConfig = brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const status = getStatus(record);
  const copy = statusCopy[status];
  const StatusIcon = copy.icon;
  const retryHref = brand === "studyhub"
    ? record?.productType === "studyhub_summer_lessons" || reference.startsWith("ZH-SUMMER")
      ? "/studyhub/enrol/summer-lessons"
      : "/studyhub/enrol"
    : "/programs";
  const supportHref = brand === "studyhub" ? "/studyhub/contact" : "/contact";
  const successHref = `${brand === "studyhub" ? "/studyhub/payment-success" : "/payment-success"}?reference=${encodeURIComponent(reference)}`;
  const failedHref = `${brand === "studyhub" ? "/studyhub/payment-failed" : "/payment-failed"}?reference=${encodeURIComponent(reference)}&reason=${getFailureReason(status)}`;

  usePageMeta({
    path: brand === "studyhub" ? "/studyhub/payment-status" : "/payment-status",
    title: `${copy.title} | ${brandConfig.name}`,
    description: copy.body,
    favicon: brandConfig.favicon,
    faviconType: brandConfig.faviconType,
    themeColor: brandConfig.primaryColor,
    image: `${siteConfig.domain}${brandConfig.ogImage}`,
    robots: "noindex,nofollow",
    siteName: brandConfig.name
  });

  return (
    <section className={brand === "studyhub" ? "page-section visual-section studyhub-payment-section" : "page-section visual-section payment-visual-section"}>
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container narrow visual-section__content">
        <div className="receipt-card">
          <BrandLogo brand={brand === "studyhub" ? "studyhub" : "main"} className="receipt-brand-logo" size="payment" />
          <div className={`receipt-status ${copy.className}`}>
            <StatusIcon size={28} aria-hidden="true" />
            <div>
              <p className="eyebrow">Payment status</p>
              <h1>{copy.title}</h1>
              <p>{copy.body}</p>
            </div>
          </div>

          {record ? (
            <dl className="receipt-details">
              <div><dt>Reference</dt><dd>{record.reference}</dd></div>
              <div><dt>{brand === "studyhub" ? "Product" : "Programme"}</dt><dd>{record.productTitle}</dd></div>
              {record.trackName ? <div><dt>Track</dt><dd>{record.trackName}</dd></div> : null}
              {record.classLevel ? <div><dt>Class</dt><dd>{record.classLevel}</dd></div> : null}
              {record.subjectNames?.length ? <div><dt>Selected subjects</dt><dd>{record.subjectNames.join(", ")}</dd></div> : null}
              {record.months ? <div><dt>Duration</dt><dd>{record.productType === "studyhub_summer_lessons" ? "One month" : `${record.months} month(s)`}</dd></div> : null}
              <div><dt>Amount</dt><dd>{formatCurrency(record.amountKobo / 100)}</dd></div>
              <div><dt>{brand === "studyhub" ? "Parent/customer" : "Customer"}</dt><dd>{record.customerName}</dd></div>
              {record.studentName ? <div><dt>Student</dt><dd>{record.studentName}</dd></div> : null}
              <div>
                <dt>Email</dt>
                <dd>{isValidEmail(record.customerEmail) ? <a href={`mailto:${record.customerEmail}`}>{record.customerEmail}</a> : record.customerEmail}</dd>
              </div>
              <div><dt>Phone</dt><dd>{record.customerPhone}</dd></div>
              <div><dt>Date</dt><dd>{formatDateTime(record.updatedAt || record.createdAt)}</dd></div>
            </dl>
          ) : reference ? (
            <dl className="receipt-details">
              <div><dt>Reference</dt><dd>{reference}</dd></div>
            </dl>
          ) : null}

          <div className="form-status warning">
            Secure backend verification is temporarily offline. This status page only reflects the Paystack callback stored in this browser session.
          </div>

          <div className="receipt-actions">
            {record && status === "success" ? (
              <Link className="button button-primary" to={successHref}>
                View Receipt
                <Receipt size={18} aria-hidden="true" />
              </Link>
            ) : null}
            {record && status !== "success" ? (
              <Link className="button button-primary" to={failedHref}>
                View Details
              </Link>
            ) : null}
            <Link className="button button-secondary" to={retryHref}>
              {brand === "studyhub" ? "Return to Enrolment" : "Return to Programs"}
            </Link>
            <Link className="button button-secondary" to={supportHref}>
              {brand === "studyhub" ? "Contact StudyHub" : "Contact Support"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
