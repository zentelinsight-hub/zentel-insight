import { useLocation } from "react-router-dom";
import AuthForm from "../components/forms/AuthForm";
import BrandLogo from "../components/BrandLogo";
import { usePageMeta } from "../utils/usePageMeta";

export default function Login() {
  const location = useLocation();
  const reason = new URLSearchParams(location.search).get("reason");

  usePageMeta({
    path: "/login",
    title: "Log In",
    description: "Sign in to continue to your Zentel Insight student portal.",
    robots: "noindex,nofollow"
  });

  return (
    <section className="auth-section visual-section auth-visual">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container auth-layout visual-section__content">
        <div>
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <p className="eyebrow">Account access</p>
          <h1>Log in to continue.</h1>
          <p>Sign in to continue to your Zentel Insight account workspace.</p>
          <div className="auth-security-copy">
            <h2>Secure sign-in</h2>
            <p>
              Your account is protected through secure authentication. Never share your password, verification code or
              Student Portal credentials with another person.
            </p>
          </div>
        </div>
        <div className="auth-form-stack">
          {reason === "idle" ? (
            <div className="form-status warning" role="status">
              You were signed out because your Student Portal was inactive for a while. Sign in again to continue.
            </div>
          ) : null}
          <AuthForm mode="login" />
        </div>
      </div>
    </section>
  );
}
