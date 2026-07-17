import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/authHooks";

function isEmailVerified(user) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export default function ProtectedRoute({ children }) {
  const { authReady, authLoading, session, user, profileLoading, profileError, refreshProfile } = useAuth();
  const location = useLocation();
  const returnTo = encodeURIComponent(location.pathname + location.search);

  if (!authReady || authLoading) {
    return <div className="route-loader">Checking account access</div>;
  }

  if (!session) {
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  if (!isEmailVerified(user || session.user)) {
    return <Navigate to={`/login?notice=verify-email&returnTo=${returnTo}`} replace />;
  }

  if (profileLoading) {
    return <div className="route-loader">Loading student profile</div>;
  }

  if (profileError) {
    return (
      <section className="page-section">
        <div className="container narrow">
          <div className="notice-card">
            <p className="eyebrow">Student Portal</p>
            <h1>We could not load your profile</h1>
            <p>{profileError}</p>
            <button className="button button-primary" type="button" onClick={refreshProfile}>Try Again</button>
          </div>
        </div>
      </section>
    );
  }

  return children;
}
