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
      <div className="container auth-layout visual-section__content">
        <div className="auth-intro">
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <p className="eyebrow">Student account</p>
          <h1>Welcome back.</h1>
          <p>Sign in to continue to your Zentel Insight portal.</p>
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
