import { Outlet, useLocation } from "react-router-dom";
import Footer from "./Footer";
import Navbar from "./Navbar";

function getActiveBrand(location) {
  const params = new URLSearchParams(location.search);
  const reference = params.get("reference") || "";
  const isStudyHubPayment =
    ["/payment-status", "/payment-success", "/payment-failed", "/payment-cancelled"].includes(location.pathname) &&
    reference.startsWith("ZH-");

  return isStudyHubPayment ? "studyhub" : "main";
}

function isProtectedPortalPath(pathname) {
  return /^\/(portal|tutor|admin)(\/|$)/.test(pathname);
}

export default function Layout() {
  const location = useLocation();
  const activeBrand = getActiveBrand(location);
  const protectedPortal = isProtectedPortalPath(location.pathname);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {!protectedPortal ? <Navbar brand={activeBrand} /> : null}
      <main id="main-content" tabIndex="-1" className="site-main" key={location.pathname}>
        <Outlet />
      </main>
      {!protectedPortal ? <Footer brand={activeBrand} /> : null}
    </div>
  );
}
