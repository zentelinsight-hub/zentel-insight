import { Link, useSearchParams } from "react-router-dom";
import { CircleX, Clock, TriangleAlert } from "lucide-react";
import BrandLogo from "../../components/BrandLogo";
import { siteConfig } from "../../data/site";
import { formatCurrency, sanitizeText } from "../../utils/format";
import { usePageMeta } from "../../utils/usePageMeta";

const copyByState = {
  failed: {
    title: "Payment Failed",
    body: "The StudyHub payment could not be completed. No registration was activated.",
    icon: TriangleAlert
  },
  cancelled: {
    title: "Payment Cancelled",
    body: "The payment window was closed before completion. No registration was activated.",
    icon: CircleX
  },
  pending: {
    title: "Payment Confirmation Pending",
    body: "Payment confirmation is still pending. You can check again or contact StudyHub support.",
    icon: Clock
  }
};

export default function StudyHubPaymentState({ state = "pending" }) {
  const [searchParams] = useSearchParams();
  const copy = copyByState[state] || copyByState.pending;
  const Icon = copy.icon;
  const amount = Number(searchParams.get("amount"));
  const reference = sanitizeText(searchParams.get("reference"), "");
  const retryHref = searchParams.get("productType") === "studyhub_summer_lessons" ? "/studyhub/enrol/summer-lessons" : "/studyhub/enrol";

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
          <dl className="receipt-details">
            {reference ? <div><dt>Reference</dt><dd>{reference}</dd></div> : null}
            {Number.isFinite(amount) ? <div><dt>Amount</dt><dd>{formatCurrency(amount)}</dd></div> : null}
          </dl>
          <div className="receipt-actions">
            <Link className="button button-primary" to={retryHref}>Retry Payment</Link>
            <Link className="button button-secondary" to="/studyhub/contact">Contact StudyHub</Link>
            <Link className="button button-secondary" to="/studyhub">Return to StudyHub</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
