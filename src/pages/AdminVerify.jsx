import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import AuthProgressOverlay from "../components/AuthProgressOverlay";
import BrandLogo from "../components/BrandLogo";
import { useAuth } from "../context/authHooks";
import { getHomePathForRole, USER_ROLES, verifyAdminAccessCode } from "../services/roleService";
import { createProgressState } from "../utils/authProgress";
import { safeRedirectPath } from "../utils/paymentCalculations";
import { usePageMeta } from "../utils/usePageMeta";

export default function AdminVerify() {
  const { adminVerified, refreshAdminVerification, role, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeRedirectPath(searchParams.get("returnTo"), "/admin");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);

  usePageMeta({
    path: "/admin/verify",
    title: "Admin Security Verification",
    description: "Secure Zentel Insight admin access-code verification.",
    robots: "noindex,nofollow"
  });

  if (role && role !== USER_ROLES.ADMIN) {
    return <Navigate to={getHomePathForRole(role)} replace />;
  }

  if (adminVerified) {
    return <Navigate to={returnTo} replace />;
  }

  async function submit(event) {
    event.preventDefault();
    if (!code.trim()) {
      setStatus({ type: "warning", message: "Enter the Admin access code to continue." });
      return;
    }
    setLoading(true);
    setProgress(createProgressState("adminCode", 0, []));
    setStatus({ type: "", message: "" });
    try {
      const result = await verifyAdminAccessCode(code);
      if (!result.ok) {
        setStatus({ type: "warning", message: result.message });
        return;
      }
      setProgress(createProgressState("adminCode", 1, [0]));
      await refreshAdminVerification(user);
      setProgress(createProgressState("adminCode", 2, [0, 1, 2]));
      navigate(returnTo, { replace: true });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Admin verification could not be completed." });
    } finally {
      setLoading(false);
      setProgress(null);
      setCode("");
    }
  }

  return (
    <section className="auth-section visual-section auth-visual">
      <AuthProgressOverlay progress={progress} />
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container auth-layout visual-section__content">
        <div>
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <p className="eyebrow">Admin Security Verification</p>
          <h1>Enter the Admin access code to continue.</h1>
          <p>The dashboard opens only after your signed-in admin session passes server-side verification.</p>
        </div>
        <form className="form-card auth-card" onSubmit={submit}>
          <ShieldCheck size={28} aria-hidden="true" />
          <label>
            <span>Admin access code</span>
            <span className="input-with-icon">
              <KeyRound size={18} aria-hidden="true" />
              <input
                type="password"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                required
              />
            </span>
          </label>
          {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Verifying" : "Continue to Admin Dashboard"}
          </button>
        </form>
      </div>
    </section>
  );
}
