import AuthForm from "../components/forms/AuthForm";
import BrandLogo from "../components/BrandLogo";
import { usePageMeta } from "../utils/usePageMeta";

export default function Login() {
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
          <p>Sign in to continue to your Zentel Insight student portal.</p>
        </div>
        <AuthForm mode="login" />
      </div>
    </section>
  );
}
