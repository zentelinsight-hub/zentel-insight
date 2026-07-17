import AuthForm from "../components/forms/AuthForm";
import BrandLogo from "../components/BrandLogo";
import { usePageMeta } from "../utils/usePageMeta";

export default function Signup() {
  usePageMeta({
    path: "/signup",
    title: "Create Account",
    description: "Create your Zentel Insight student account and verify your email to continue.",
    robots: "noindex,nofollow"
  });

  return (
    <section className="auth-section visual-section auth-visual">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container auth-layout visual-section__content">
        <div>
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <p className="eyebrow">Create account</p>
          <h1>Create your student account.</h1>
          <p>Create your Zentel Insight student account and verify your email to continue.</p>
        </div>
        <AuthForm mode="signup" />
      </div>
    </section>
  );
}
