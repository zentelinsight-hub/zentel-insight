import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/authHooks";
import { safeRedirectPath } from "../utils/paymentCalculations";

function isEmailVerified(user) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export default function GuestRoute({ children }) {
  const { authReady, authLoading, session, user } = useAuth();
  const [searchParams] = useSearchParams();

  if (!authReady || authLoading) {
    return <div className="route-loader">Checking account access</div>;
  }

  if (session && isEmailVerified(user || session.user)) {
    return <Navigate to={safeRedirectPath(searchParams.get("returnTo") || searchParams.get("redirect"))} replace />;
  }

  return children;
}
