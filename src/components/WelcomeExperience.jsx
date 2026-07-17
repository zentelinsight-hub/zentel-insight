import { useEffect, useState } from "react";
import BrandLogo from "./BrandLogo";
import { siteConfig } from "../data/site";
import { welcomeDurationMs } from "./welcomeConfig";

export default function WelcomeExperience({ brand = "main", children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setReady(true);
    }, reducedMotion ? 800 : welcomeDurationMs);

    return () => window.clearTimeout(timer);
  }, [ready]);

  if (ready) return children;

  const brandConfig = brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const title = brand === "studyhub" ? "Welcome to Zentel Insight StudyHub" : "Welcome to Zentel Insight";
  const body =
    brand === "studyhub"
      ? "Supporting secondary-school students through structured online learning."
      : siteConfig.motto;

  return (
    <section className="welcome-experience" role="status" aria-live="polite" aria-label={title}>
      <div className="welcome-experience__content">
        <BrandLogo brand={brand} size="large" className="welcome-experience__logo" />
        <h1>{title}</h1>
        <p>{body || brandConfig.description}</p>
        <span className="welcome-progress" aria-hidden="true" />
      </div>
    </section>
  );
}
