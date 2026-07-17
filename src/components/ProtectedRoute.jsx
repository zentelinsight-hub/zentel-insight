import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/authHooks";

export default function ProtectedRoute({ children }) {
  const { authReady, authLoading, session } = useAuth();
  const location = useLocation();

  if (!authReady || authLoading) {
    return <div className="route-loader">Checking account access</div>;
  }

  if (!session) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return children;
}
