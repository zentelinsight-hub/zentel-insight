import { Link, useSearchParams } from "react-router-dom";
import { CircleX, RotateCcw, TriangleAlert } from "lucide-react";
import BrandLogo from "../../components/BrandLogo";
import { siteConfig } from "../../data/site";
import { readTemporaryPayment } from "../../services/paymentService";
import { formatCurrency, formatDateTime, isValidEmail } from "../../utils/format";
import { normalizePaymentReference } from "../../utils/paymentCalculations";
import { usePageMeta } from "../../utils/usePageMeta";

const copyByReason = {
  cancelled: {
    title: "Payment was not completed",
    body: "You closed or cancelled the Paystack checkout. No StudyHub registration has been activated.",
    icon: CircleX
  },
  declined: {
    title: "Payment was declined",
    body: "Your bank or Paystack declined the transaction. No StudyHub registration has been activated.",
    icon: TriangleAlert
  },
  error: {
    title: "Payment could not be completed",
    body: "Paystack reported an error while processing the payment. No StudyHub registration has been activated.",
    icon: TriangleAlert
  },
  failed: {
    title: "Payment could not be completed",
    body: "The StudyHub payment was not completed.",
    icon: TriangleAlert
  },
  pending: {
    title: "Payment confirmation pending",
    body: "The checkout has not been marked complete in this browser session.",
    icon: RotateCcw
  }
};

function getPaymentState(searchParams, routeState) {
  const reference = normalizePaymentReference(searchParams.get("reference"), searchParams.get("trxref"));
  const reason = String(searchParams.get("reason") || routeState || "failed").toLowerCase();
  const record = readTemporaryPayment(reference);
  if (!reference || !record) return { reference, record: null, reason: "unavailable" };
  const statusReason = record.failureReason || record.temporaryStatus || reason;
  return { reference, record, reason: statusReason === "success" ? "pending" : statusReason };
}

export default function StudyHubPaymentState({ state = "failed" }) {
  const [searchParams] = useSearchParams();
  const { reference, record, reason } = getPaymentState(searchParams, state);
  const isSummerLessons = record?.productType === "studyhub_summer_lessons" || reference.startsWith("ZH-SUMMER");
  const retryHref = isSummerLessons ? "/studyhub/enrol/summer-lessons" : "/studyhub/enrol";
  const copy = reason === "unavailable"
    ? {
        title: "Payment details unavailable",
        body: "We could not find the payment details for this page.",
        icon: TriangleAlert
      }
    : copyByReason[reason] || copyByReason.failed;
  const Icon = copy.icon;

  usePageMeta({
    path: `/studyhub/payment-${state}`,
    title: `${copy.title} | Zentel Insight StudyHub`,
    description: copy.body,
    favicon: siteConfig.studyHub.favicon,
    faviconType: siteConfig.studyHub.faviconType,
    themeColor: siteConfig.studyHub.primaryColor,
    image: `${siteConfig.domain}${siteConfig.studyHub.ogImage}`,
    robots: "noindex,nofollow",
    siteName: siteConfig.studyHub.name
  });

  return (
    <section className="page-section visual-section studyhub-payment-section">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container narrow visual-section__content">
        <div className="receipt-card">
          <BrandLogo brand="studyhub" className="receipt-brand-logo" size="payment" />
          <div className="receipt-status warning">
            <Icon size={28} aria-hidden="true" />
            <div>
              <p className="eyebrow">{siteConfig.studyHub.name}</p>
              <h1>{copy.title}</h1>
              <p>{copy.body}</p>
            </div>
          </div>

          {record ? (
            <dl className="receipt-details">
              <div><dt>Reference</dt><dd>{record.reference}</dd></div>
              <div><dt>Product</dt><dd>{record.productTitle}</dd></div>
              {record.classLevel ? <div><dt>Class</dt><dd>{record.classLevel}</dd></div> : null}
              {record.subjectNames?.length ? <div><dt>Selected subjects</dt><dd>{record.subjectNames.join(", ")}</dd></div> : null}
              {record.months ? <div><dt>Duration</dt><dd>{record.productType === "studyhub_summer_lessons" ? "One month" : `${record.months} month(s)`}</dd></div> : null}
              <div><dt>Amount</dt><dd>{formatCurrency(record.amountKobo / 100)}</dd></div>
              <div><dt>Parent/customer</dt><dd>{record.customerName}</dd></div>
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

          <div className="receipt-actions">
            <Link className="button button-primary" to={retryHref}>Try Again</Link>
            <Link className="button button-secondary" to="/studyhub">Return to StudyHub</Link>
            <Link className="button button-secondary" to="/studyhub/contact">Contact StudyHub</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
