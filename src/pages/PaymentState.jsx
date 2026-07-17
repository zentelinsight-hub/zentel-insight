import { Link, useSearchParams } from "react-router-dom";
import { CircleX, Clock, TriangleAlert } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { siteConfig } from "../data/site";
import { normalizePaymentReference } from "../utils/paymentCalculations";
import { usePageMeta } from "../utils/usePageMeta";

const copyByState = {
  failed: {
    title: "Payment Failed",
    body: "The payment could not be completed. No enrolment was activated.",
    icon: TriangleAlert
  },
  cancelled: {
    title: "Payment Cancelled",
    body: "The payment window was closed before completion. No enrolment was activated.",
    icon: CircleX
  },
  pending: {
    title: "Payment Confirmation Pending",
    body: "Payment confirmation is still pending. Keep your reference and check again shortly.",
    icon: Clock
  }
};

export default function PaymentState({ state = "pending" }) {
  const [searchParams] = useSearchParams();
  const copy = copyByState[state] || copyByState.pending;
  const Icon = copy.icon;
  const reference = normalizePaymentReference(searchParams.get("reference"), searchParams.get("trxref"));

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
          {reference ? (
            <dl className="receipt-details">
              <div><dt>Reference</dt><dd>{reference}</dd></div>
            </dl>
          ) : null}
          <div className="receipt-actions">
            {reference ? <Link className="button button-secondary" to={`/payment-status?reference=${encodeURIComponent(reference)}`}>Check Status</Link> : null}
            <Link className="button button-primary" to="/programs">Retry Payment</Link>
            <Link className="button button-secondary" to="/contact">Contact Support</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
