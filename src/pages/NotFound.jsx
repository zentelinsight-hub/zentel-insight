import { ArrowLeft, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { usePageMeta } from "../utils/usePageMeta";

export default function NotFound() {
  usePageMeta({
    path: "/404",
    title: "Page Not Found",
    description: "The requested Zentel Insight page could not be found.",
    robots: "noindex,follow"
  });

  return (
    <section className="page-section">
      <div className="container narrow">
        <div className="notice-card not-found">
          <Search size={34} aria-hidden="true" />
          <p className="eyebrow">404</p>
          <h1>We could not find that page.</h1>
          <p>The page may have moved, or the link may be incomplete. Start from the homepage or explore programmes.</p>
          <div className="button-row">
            <Link className="button button-primary" to="/">
              <ArrowLeft size={18} aria-hidden="true" />
              Home
            </Link>
            <Link className="button button-secondary" to="/programs">
              Explore Programs
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
