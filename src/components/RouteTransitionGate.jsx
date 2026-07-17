import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { siteConfig } from "../data/site";
import BrandLogo from "./BrandLogo";
import { routeDelayMs } from "./transitionConfig";

function getRouteBrand(location) {
  const params = new URLSearchParams(location.search);
  const reference = params.get("reference") || "";
  if (location.pathname.startsWith("/studyhub")) return "studyhub";
  if (
    ["/payment-status", "/payment-success"].includes(location.pathname) &&
    (params.get("brand") === "studyhub" || reference.startsWith("ZISH-"))
  ) {
    return "studyhub";
  }
  return "main";
}

function getRouteKey(location) {
  return `${location.pathname}${location.search}${location.hash}`;
}

export default function RouteTransitionGate({ children }) {
  const location = useLocation();
  const currentRoute = getRouteKey(location);
  const timerRef = useRef(null);
  const [displayLocation, setDisplayLocation] = useState(location);
  const [loading, setLoading] = useState(false);
  const brand = getRouteBrand(location);
  const brandConfig = brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const renderedChildren = typeof children === "function" ? children(displayLocation) : children;

  useLayoutEffect(() => {
    if (getRouteKey(displayLocation) === currentRoute) return undefined;

    window.clearTimeout(timerRef.current);
    setLoading(true);
    timerRef.current = window.setTimeout(() => {
      setDisplayLocation(location);
      setLoading(false);
    }, routeDelayMs);

    return () => window.clearTimeout(timerRef.current);
  }, [currentRoute, displayLocation, location]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return (
    <>
      {loading ? (
        <div className="route-transition-loader" role="status" aria-live="polite" aria-label="Loading page">
          <div className="route-transition-panel">
            <BrandLogo brand={brand} size="auth" />
            <strong>{brandConfig.name}</strong>
            <span className="route-transition-bar" aria-hidden="true" />
          </div>
        </div>
      ) : null}
      <div
        className={loading ? "route-content route-content-loading" : "route-content page-enter"}
        aria-hidden={loading || undefined}
        inert={loading || undefined}
      >
        {renderedChildren}
      </div>
    </>
  );
}
