import { Link } from "react-router-dom";
import { usePageMeta } from "../utils/usePageMeta";

export default function AuthCallback() {
  usePageMeta({
    path: "/auth/callback",
    title: "Authentication Callback",
    description: "Completing Zentel Insight authentication.",
    robots: "noindex,nofollow"
  });

  return (
    <section className="page-section">
      <div className="container narrow">
        <div className="notice-card">
          <p className="eyebrow">Account access</p>
          <h1>Authentication is being completed.</h1>
          <p>If you are not redirected automatically, continue to your portal.</p>
          <Link className="button button-primary" to="/portal">Go to Portal</Link>
        </div>
      </div>
    </section>
  );
}
