import { useEffect, useState } from "react";
import BrandLogo from "./BrandLogo";
import { siteConfig } from "../data/site";
import {
  resolveWelcomeStartupMode,
  returningLoaderDurationMs,
  welcomeDurationMs
} from "./welcomeConfig";

export default function WelcomeExperience({ brand = "main", children, initialStartupMode }) {
  const [startupMode] = useState(() => initialStartupMode || resolveWelcomeStartupMode());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setReady(true);
    }, reducedMotion ? 250 : startupMode === "welcome" ? welcomeDurationMs : returningLoaderDurationMs);

    return () => window.clearTimeout(timer);
  }, [ready, startupMode]);

  if (ready) return children;

  const brandConfig = brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const title = brand === "studyhub" ? "Welcome to Zentel Insight StudyHub" : "Welcome to Zentel Insight";
  const body =
    brand === "studyhub"
      ? "Supporting secondary-school students through structured online learning."
      : siteConfig.motto;

  if (startupMode === "loading") {
    const loadingLabel = `Loading ${brandConfig.name}`;
    return (
      <section className="welcome-experience welcome-experience--loading" role="status" aria-live="polite" aria-label={loadingLabel}>
        <div className="welcome-experience__content">
          <BrandLogo brand={brand} size="large" className="welcome-experience__logo" />
          <p className="startup-loading-label">{loadingLabel}</p>
          <span className="welcome-progress" aria-hidden="true" />
        </div>
      </section>
    );
  }

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
