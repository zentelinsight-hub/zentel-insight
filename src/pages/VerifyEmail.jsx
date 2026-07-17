import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { usePageMeta } from "../utils/usePageMeta";

export default function VerifyEmail() {
  usePageMeta({
    path: "/verify-email",
    title: "Check Your Email",
    description: "Open your Zentel Insight verification email and use the confirmation link.",
    robots: "noindex,nofollow"
  });

  return (
    <section className="auth-section visual-section auth-visual">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container narrow visual-section__content">
        <div className="notice-card auth-result-card">
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <p className="eyebrow">Email verification</p>
          <h1>Check your email</h1>
          <p>Open the verification email from Zentel Insight and click Verify Email before signing in.</p>
          <div className="button-row">
            <Link className="button button-primary" to="/login?notice=verify-email">Proceed to Login</Link>
            <Link className="button button-secondary" to="/">Return Home</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
