import { Link, useSearchParams } from "react-router-dom";
import { CircleX, RotateCcw, TriangleAlert } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { siteConfig } from "../data/site";
import { readTemporaryPayment } from "../services/paymentService";
import { formatCurrency, formatDateTime, isValidEmail } from "../utils/format";
import { normalizePaymentReference } from "../utils/paymentCalculations";
import { usePageMeta } from "../utils/usePageMeta";

const copyByReason = {
  cancelled: {
    title: "Payment was not completed",
    body: "You closed or cancelled the Paystack checkout. No enrolment has been activated.",
    icon: CircleX
  },
  declined: {
    title: "Payment was declined",
    body: "Your bank or Paystack declined the transaction. No enrolment has been activated.",
    icon: TriangleAlert
  },
  error: {
    title: "Payment could not be completed",
    body: "Paystack reported an error while processing the payment. No enrolment has been activated.",
    icon: TriangleAlert
  },
  failed: {
    title: "Payment could not be completed",
    body: "The payment was not completed. No enrolment has been activated.",
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

export default function PaymentState({ state = "failed" }) {
  const [searchParams] = useSearchParams();
  const { reference, record, reason } = getPaymentState(searchParams, state);
  const copy = reason === "unavailable"
    ? {
        title: "Payment details unavailable",
        body: "We could not find the payment details for this page.",
        icon: TriangleAlert
      }
    : copyByReason[reason] || copyByReason.failed;
  const Icon = copy.icon;

  usePageMeta({
    path: `/payment-${state}`,
    title: `${copy.title} | Zentel Insight`,
    description: copy.body,
    favicon: siteConfig.main.favicon,
    image: `${siteConfig.domain}${siteConfig.main.ogImage}`,
    robots: "noindex,nofollow"
  });

  return (
    <section className="page-section visual-section payment-visual-section">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container narrow visual-section__content">
        <div className="receipt-card">
          <BrandLogo brand="main" className="receipt-brand-logo" size="payment" />
          <div className="receipt-status warning">
            <Icon size={28} aria-hidden="true" />
            <div>
              <p className="eyebrow">{siteConfig.main.name}</p>
              <h1>{copy.title}</h1>
              <p>{copy.body}</p>
            </div>
          </div>

          {record ? (
            <dl className="receipt-details">
              <div><dt>Reference</dt><dd>{record.reference}</dd></div>
              <div><dt>Programme</dt><dd>{record.productTitle}</dd></div>
              {record.trackName ? <div><dt>Track</dt><dd>{record.trackName}</dd></div> : null}
              <div><dt>Amount</dt><dd>{formatCurrency(record.amountKobo / 100)}</dd></div>
              <div><dt>Customer</dt><dd>{record.customerName}</dd></div>
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
            <Link className="button button-primary" to="/programs">Try Again</Link>
            <Link className="button button-secondary" to="/programs">Return to Programs</Link>
            <Link className="button button-secondary" to="/contact">Contact Support</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
