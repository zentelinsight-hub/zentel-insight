import { useRef, useState } from "react";
import BrandLogo from "../components/BrandLogo";
import { requestPasswordReset } from "../services/authService";
import { usePageMeta } from "../utils/usePageMeta";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  usePageMeta({
    path: "/forgot-password",
    title: "Forgot Password",
    description: "Request Zentel Insight password reset instructions.",
    robots: "noindex,nofollow"
  });

  async function submit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      setStatus({ type: result.ok ? "success" : "warning", message: result.message });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Password reset could not be requested." });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <section className="auth-section">
      <div className="container auth-layout">
        <div>
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <p className="eyebrow">Password recovery</p>
          <h1>Reset your password securely.</h1>
          <p>Enter your account email. For privacy, the response does not reveal whether an unrelated email exists.</p>
        </div>
        <form className="form-card auth-card" onSubmit={submit}>
          <label>
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          {status.message ? <div className={`form-status ${status.type}`} aria-live="polite">{status.message}</div> : null}
          <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Sending" : "Send Reset Instructions"}</button>
        </form>
      </div>
    </section>
  );
}
