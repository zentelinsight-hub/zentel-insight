import { useState } from "react";
import { CircleAlert, Send } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { siteConfig } from "../data/site";
import { resendSignupConfirmation } from "../services/authService";
import { isValidEmail } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";

export default function EmailVerificationFailed() {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const message = location.state?.message || "The verification link may be invalid or expired. Request a new verification email and try again.";

  usePageMeta({
    path: "/email-verification-failed",
    title: "Email Verification Failed",
    description: "Email verification could not be completed.",
    robots: "noindex,nofollow"
  });

  async function submit(event) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      setStatus({ type: "warning", message: "Enter the email address used for signup." });
      return;
    }
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      const result = await resendSignupConfirmation(normalized);
      setStatus({ type: result.ok ? "success" : "warning", message: result.message });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "A new verification email could not be requested." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-section visual-section auth-visual">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container auth-layout visual-section__content">
        <div>
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <CircleAlert size={44} aria-hidden="true" />
          <p className="eyebrow">Verification issue</p>
          <h1>Email verification could not be completed</h1>
          <p>{message}</p>
          <div className="button-row">
            <Link className="button button-primary" to="/login">Return to Login</Link>
            <Link className="button button-secondary" to="/contact">Contact Support</Link>
          </div>
        </div>
        <form className="form-card auth-card" onSubmit={submit} noValidate>
          <div>
            <p className="eyebrow">Resend link</p>
            <h2>Request a new verification email</h2>
            <p>We will send a new message when an unverified account exists for the email address.</p>
          </div>
          <label>
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Sending" : "Resend Verification Email"}
            <Send size={18} aria-hidden="true" />
          </button>
          <p className="muted-line">You can also contact {siteConfig.contact.email} or {siteConfig.contact.phone}.</p>
        </form>
      </div>
    </section>
  );
}
