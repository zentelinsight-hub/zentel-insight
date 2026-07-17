import BrandLogo from "../components/BrandLogo";
import { Link } from "react-router-dom";
import { usePageMeta } from "../utils/usePageMeta";

export default function Payment() {
  usePageMeta({
    path: "/payment",
    title: "Payment",
    description: "Choose a Zentel Insight programme before starting checkout.",
    robots: "noindex,nofollow"
  });

  return (
    <section className="page-section">
      <div className="container payment-layout">
        <div>
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <p className="eyebrow">Payment</p>
          <h1>Choose a programme before checkout.</h1>
          <p>
            Programme checkout starts on the dedicated programme page. Select a track there so the trusted catalogue
            price can be carried into Paystack.
          </p>
          <Link className="button button-primary" to="/programs">
            View Programs
          </Link>
        </div>
      </div>
    </section>
  );
}
