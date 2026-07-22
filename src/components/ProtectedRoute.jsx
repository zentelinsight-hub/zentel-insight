import { Mail, ShieldAlert } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/authHooks";
import { ACCOUNT_STATUSES, getHomePathForRole, USER_ROLES } from "../services/roleService";
import { hasStoredSessionExpired } from "../services/sessionSecurity";
import { siteConfig } from "../data/site";

function isEmailVerified(user) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

function AccountRestrictedScreen({ email, phone, onSignOut }) {
  return (
    <section className="restricted-account-screen">
      <div className="restricted-account-card">
        <ShieldAlert size={34} aria-hidden="true" />
        <div>
          <p className="eyebrow">Account Access Restricted</p>
          <h1>Account Access Restricted</h1>
          <p>
            Your Zentel Insight account is currently inactive. Access to classes and learning information has been
            temporarily restricted.
          </p>
          <p>Please contact the Zentel Insight support team so your account can be reviewed and activated.</p>
        </div>
        <dl className="restricted-contact-list">
          <div>
            <dt>Email</dt>
            <dd><a href={`mailto:${email}`}>{email}</a></dd>
          </div>
          <div>
            <dt>Phone/WhatsApp</dt>
            <dd><a href={`https://wa.me/${siteConfig.contact.whatsappNumber}`}>{phone}</a></dd>
          </div>
        </dl>
        <div className="button-row">
          <a className="button button-primary" href={`mailto:${email}`}>
            <Mail size={18} aria-hidden="true" />
            Contact Support
          </a>
          <button className="button button-secondary" type="button" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </div>
    </section>
  );
}

export default function ProtectedRoute({
  children,
  allowedRoles = [USER_ROLES.STUDENT],
  requireAdminVerification = false
}) {
  const {
    adminVerificationLoading,
    adminVerified,
    authReady,
    authLoading,
    session,
    user,
    profileLoading,
    profileError,
    refreshProfile,
    accountStatus,
    accountStatusLoading,
    role,
    roleLoading,
    signOut
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = encodeURIComponent(location.pathname + location.search);

  if (!authReady || authLoading) {
    return <div className="route-loader">Preparing secure access</div>;
  }

  if (!session) {
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  if (hasStoredSessionExpired()) {
    void signOut({ scope: "local" });
    return <Navigate to="/login?reason=idle" replace />;
  }

  if (!isEmailVerified(user || session.user)) {
    return <Navigate to={`/login?notice=verify-email&returnTo=${returnTo}`} replace />;
  }

  if (roleLoading) {
    return <div className="route-loader">Preparing secure workspace</div>;
  }

  if (allowedRoles.length && !allowedRoles.includes(role)) {
    return <Navigate to={getHomePathForRole(role, adminVerified)} replace />;
  }

  if (role !== USER_ROLES.ADMIN) {
    if (profileLoading || accountStatusLoading) {
      return <div className="route-loader">Preparing secure workspace</div>;
    }
    if (accountStatus !== ACCOUNT_STATUSES.ACTIVE) {
      return (
        <AccountRestrictedScreen
          email={siteConfig.contact.email}
          phone={siteConfig.contact.phone}
          onSignOut={async () => {
            await signOut({ scope: "local" });
            navigate("/login", { replace: true });
          }}
        />
      );
    }
  }

  if (requireAdminVerification && role === USER_ROLES.ADMIN) {
    if (adminVerificationLoading) {
      return <div className="route-loader">Securing administrator session</div>;
    }
    if (!adminVerified) {
      return <Navigate to={`/admin/verify?returnTo=${returnTo}`} replace />;
    }
  }

  if (profileLoading) {
    return <div className="route-loader">Preparing secure workspace</div>;
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
