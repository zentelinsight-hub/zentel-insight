import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { resendSignupOtp, verifyEmailOtp } from "../services/authService";
import { usePageMeta } from "../utils/usePageMeta";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const verifyingRef = useRef(false);
  const resendRef = useRef(false);
  const cooldownTimerRef = useRef(null);

  usePageMeta({
    path: "/verify-email",
    title: "Verify Email",
    description: "Verify a Zentel Insight account with a six-digit email OTP.",
    robots: "noindex,nofollow"
  });

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    cooldownTimerRef.current = window.setTimeout(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(cooldownTimerRef.current);
  }, [cooldown]);

  useEffect(() => {
    return () => window.clearTimeout(cooldownTimerRef.current);
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (verifyingRef.current) return;
    if (!email || token.replace(/\D/g, "").length !== 6) {
      setStatus({ type: "warning", message: "Enter your email and six-digit verification code." });
      return;
    }
    verifyingRef.current = true;
    setLoading(true);
    let navigated = false;
    try {
      const result = await verifyEmailOtp({ email, token: token.replace(/\D/g, "") });
      setStatus({ type: result.ok ? "success" : "warning", message: result.message });
      if (result.ok) {
        navigated = true;
        navigate("/portal");
      }
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Email verification failed." });
    } finally {
      verifyingRef.current = false;
      if (!navigated) setLoading(false);
    }
  }

  async function resend() {
    if (resendRef.current || cooldown > 0) return;
    if (!email) {
      setStatus({ type: "warning", message: "Enter your email before requesting a new code." });
      return;
    }
    resendRef.current = true;
    try {
      const result = await resendSignupOtp(email);
      setStatus({ type: result.ok ? "success" : "warning", message: result.message });
      if (result.ok) setCooldown(60);
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "A new code could not be requested." });
    } finally {
      resendRef.current = false;
    }
  }

  return (
    <section className="auth-section">
      <div className="container auth-layout">
        <div>
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <p className="eyebrow">Email verification</p>
          <h1>Enter your six-digit code.</h1>
          <p>Use the OTP from your Zentel Insight confirmation email to complete your account setup.</p>
        </div>
        <form className="form-card auth-card" onSubmit={submit}>
          <label>
            <span>Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <label>
            <span>Verification code</span>
            <input
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
            />
          </label>
          {status.message ? <div className={`form-status ${status.type}`} aria-live="polite">{status.message}</div> : null}
          <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Verifying" : "Verify Email"}</button>
          <button className="button button-secondary" type="button" onClick={resend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Request New Code (${cooldown}s)` : "Request New Code"}
          </button>
        </form>
      </div>
    </section>
  );
}
