import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/authHooks";
import { safeRedirectPath } from "../utils/paymentCalculations";

export default function GuestRoute({ children }) {
  const { authReady, authLoading, session } = useAuth();
  const [searchParams] = useSearchParams();

  if (!authReady || authLoading) {
    return <div className="route-loader">Checking account access</div>;
  }

  if (session) {
    return <Navigate to={safeRedirectPath(searchParams.get("redirect"))} replace />;
  }

  return children;
}
