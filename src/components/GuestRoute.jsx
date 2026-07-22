import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/authHooks";
import { getHomePathForRole } from "../services/roleService";
import { safeRedirectPath } from "../utils/paymentCalculations";

function isEmailVerified(user) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export default function GuestRoute({ children }) {
  const { adminVerified, authReady, authLoading, role, roleLoading, session, user } = useAuth();
  const [searchParams] = useSearchParams();

  if (!authReady || authLoading) {
    return <div className="route-loader">Preparing secure access</div>;
  }

  if (session && isEmailVerified(user || session.user)) {
    if (roleLoading) return <div className="route-loader">Preparing secure workspace</div>;
    const requestedPath = safeRedirectPath(searchParams.get("returnTo") || searchParams.get("redirect"));
    const roleHome = getHomePathForRole(role, adminVerified);
    return <Navigate to={requestedPath === "/portal" ? roleHome : requestedPath} replace />;
  }

  return children;
}
