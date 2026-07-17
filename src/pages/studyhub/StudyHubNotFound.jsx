import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { siteConfig } from "../../data/site";
import { usePageMeta } from "../../utils/usePageMeta";

export default function StudyHubNotFound() {
  usePageMeta({
    path: "/studyhub/404",
    title: "StudyHub Page Not Found",
    description: "The requested StudyHub page could not be found.",
    favicon: siteConfig.studyHub.favicon,
    robots: "noindex,follow"
  });

  return (
    <section className="page-section">
      <div className="container narrow">
        <div className="notice-card">
          <p className="eyebrow">StudyHub page unavailable</p>
          <h1>We could not find that StudyHub page.</h1>
          <p>Return to the StudyHub homepage or choose one of the academic support pages.</p>
          <Link className="button button-primary" to="/studyhub">
            <ArrowLeft size={18} aria-hidden="true" />
            Back to StudyHub
          </Link>
        </div>
      </div>
    </section>
  );
}
