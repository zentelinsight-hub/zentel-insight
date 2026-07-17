import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { updatePassword } from "../services/authService";
import { usePageMeta } from "../utils/usePageMeta";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  usePageMeta({
    path: "/reset-password",
    title: "Reset Password",
    description: "Set a new Zentel Insight account password.",
    robots: "noindex,nofollow"
  });

  async function submit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (password.length < 8 || password !== confirmPassword) {
      setStatus({ type: "warning", message: "Use at least 8 characters and make sure both passwords match." });
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    try {
      const result = await updatePassword(password);
      setStatus({ type: result.ok ? "success" : "warning", message: result.message });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Password could not be updated." });
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
          <p className="eyebrow">New password</p>
          <h1>Choose a secure password.</h1>
          <p>Open this page from your Supabase password recovery email so the reset session can be detected in the URL.</p>
        </div>
        <form className="form-card auth-card" onSubmit={submit}>
          <label>
            <span>New password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
          </label>
          <label>
            <span>Confirm password</span>
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
          </label>
          {status.message ? <div className={`form-status ${status.type}`} aria-live="polite">{status.message}</div> : null}
          <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Updating" : "Update Password"}</button>
          {status.type === "success" ? <Link className="text-link" to="/login">Return to login</Link> : null}
        </form>
      </div>
    </section>
  );
}
