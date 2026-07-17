import { Outlet, useLocation } from "react-router-dom";
import Footer from "./Footer";
import Navbar from "./Navbar";

function getActiveBrand(location) {
  const params = new URLSearchParams(location.search);
  const reference = params.get("reference") || "";
  const isStudyHubPayment =
    ["/payment-status", "/payment-success"].includes(location.pathname) &&
    (params.get("brand") === "studyhub" || reference.startsWith("ZISH-"));

  return isStudyHubPayment ? "studyhub" : "main";
}

export default function Layout() {
  const location = useLocation();
  const activeBrand = getActiveBrand(location);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navbar brand={activeBrand} />
      <main id="main-content" tabIndex="-1" className="site-main" key={location.pathname}>
        <Outlet />
      </main>
      <Footer brand={activeBrand} />
    </div>
  );
}
