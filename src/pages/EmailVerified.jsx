import { CheckCircle2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { getSupabaseClient } from "../services/supabaseClient";
import { usePageMeta } from "../utils/usePageMeta";

function maskEmail(email) {
  if (!email || !email.includes("@")) return "";
  const [name, domain] = email.split("@");
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

export default function EmailVerified() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || "";

  usePageMeta({
    path: "/email-verified",
    title: "Email Verified",
    description: "Your Zentel Insight email address has been verified.",
    robots: "noindex,nofollow"
  });

  async function proceedToLogin() {
    const supabase = await getSupabaseClient();
    await supabase?.auth.signOut({ scope: "local" });
    navigate("/login?verified=1", { replace: true });
  }

  return (
    <section className="auth-section visual-section auth-visual">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container narrow visual-section__content">
        <div className="notice-card auth-result-card" role="status">
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <CheckCircle2 size={44} aria-hidden="true" />
          <p className="eyebrow">Account confirmed</p>
          <h1>Email verified</h1>
          <p>Your email address has been verified successfully. You can now sign in to your Zentel Insight student account.</p>
          {email ? <p className="muted-line">Verified email: {maskEmail(email)}</p> : null}
          <div className="button-row">
            <button className="button button-primary" type="button" onClick={proceedToLogin}>Proceed to Login</button>
            <Link className="button button-secondary" to="/">Return Home</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
