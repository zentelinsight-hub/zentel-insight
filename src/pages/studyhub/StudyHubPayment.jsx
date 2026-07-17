import { Link } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";
import { siteConfig } from "../../data/site";
import { usePageMeta } from "../../utils/usePageMeta";

export default function StudyHubPayment() {
  usePageMeta({
    path: "/studyhub/payment",
    title: "StudyHub Payment | Zentel Insight StudyHub",
    description: "StudyHub payment starts from the enrolment form after learner details are reviewed.",
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
        <div className="notice-card">
          <BrandLogo brand="studyhub" className="page-brand-logo" size="payment" />
          <p className="eyebrow">StudyHub payment</p>
          <h1>Start from enrolment.</h1>
          <p>Review the learner, guardian, class and payment summary first. Paystack opens from the enrolment form.</p>
          <div className="button-row">
            <Link className="button button-primary" to="/studyhub/enrol">Go to StudyHub Enrolment</Link>
            <Link className="button button-secondary" to="/studyhub/enrol/summer-lessons">Summer Lessons Enrolment</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
