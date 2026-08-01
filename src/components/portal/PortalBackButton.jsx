import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

function rolePrefix(pathname) {
  if (pathname.startsWith("/admin")) return "/admin";
  if (pathname.startsWith("/tutor")) return "/tutor";
  return "/portal";
}

export default function PortalBackButton({ fallback, label = "Back" }) {
  const navigate = useNavigate();
  const location = useLocation();

  function goBack() {
    const prefix = rolePrefix(location.pathname);
    const previous = typeof window === "undefined" ? "" : window.sessionStorage.getItem("zentel:previous-route") || "";
    const canUseHistory = Number(window.history.state?.idx || 0) > 0 && previous.startsWith(prefix);
    navigate(canUseHistory ? -1 : (fallback || prefix));
  }

  return (
    <button className="button button-secondary portal-back-button" type="button" onClick={goBack}>
      <ArrowLeft size={17} aria-hidden="true" />
      {label}
    </button>
  );
}
