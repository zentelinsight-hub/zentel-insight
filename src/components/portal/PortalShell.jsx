import { useEffect, useId, useRef } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import BrandLogo from "../BrandLogo";
import IdleSessionGuard from "../IdleSessionGuard";
import { useAuth } from "../../context/authHooks";
import { getSupabaseClient } from "../../services/supabaseClient";

function ProfileAvatar({ name, avatarUrl, initial }) {
  return (
    <span className="portal-avatar sm">
      {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initial || String(name || "P").slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

function PortalNavLink({ item, onNavigate }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => isActive ? "portal-top-link active" : "portal-top-link"}
      aria-label={item.label}
      title={item.label}
    >
      <item.Icon size={18} aria-hidden="true" />
      <span>{item.label}</span>
      {Number(item.badge || 0) > 0 ? <span className="portal-nav-badge">{Number(item.badge) > 99 ? "99+" : item.badge}</span> : null}
    </NavLink>
  );
}

function closeDetails(ref) {
  if (ref.current) ref.current.open = false;
}

export default function PortalShell({
  sidebar,
  header,
  children,
  idleEnabled = true,
  onBeforeSignOut,
  realtimeTables = [],
  onRealtimeChange
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const shellId = useId().replace(/:/g, "");
  const accountMenuRef = useRef(null);
  const realtimeKey = [...new Set(realtimeTables)].sort().join(",");
  const fallbackItems = (sidebar.groups || []).flatMap((group) => group.items || []);
  const primaryItems = sidebar.primaryItems || fallbackItems.slice(0, 5);

  useEffect(() => {
    document.body.classList.add("portal-route-active");
    return () => document.body.classList.remove("portal-route-active", "portal-dedicated-workspace");
  }, []);

  useEffect(() => {
    closeDetails(accountMenuRef);
  }, [location.pathname]);

  useEffect(() => {
    if (!realtimeKey || typeof onRealtimeChange !== "function") return undefined;
    let cancelled = false;
    let channel = null;
    let client = null;
    let refreshTimer = null;

    async function subscribe() {
      try {
        client = await getSupabaseClient();
        if (!client || cancelled) return;
        channel = client.channel(`portal-shell-${shellId}-${Date.now()}`);
        realtimeKey.split(",").forEach((table) => {
          channel = channel.on(
            "postgres_changes",
            { event: "*", schema: "public", table },
            () => {
              window.clearTimeout(refreshTimer);
              refreshTimer = window.setTimeout(() => onRealtimeChange(), 250);
            }
          );
        });
        channel.subscribe();
      } catch (error) {
        if (import.meta.env.DEV) console.info("Portal Realtime subscription could not be started", error);
      }
    }

    void subscribe();
    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [onRealtimeChange, realtimeKey, shellId]);

  async function handleSignOut() {
    closeDetails(accountMenuRef);
    onBeforeSignOut?.();
    await signOut({ scope: "local" });
    navigate("/login", { replace: true });
  }

  const closeMenus = () => {
    closeDetails(accountMenuRef);
  };

  return (
    <section className={`portal-shell ${sidebar.shellClass || ""}`.trim()}>
      <header className="portal-header portal-topbar" aria-label={header?.title || sidebar.navLabel}>
        <NavLink className="portal-top-brand" to={sidebar.homeTo} onClick={closeMenus} aria-label={sidebar.brandLabel}>
          <BrandLogo brand="main" size={36} />
          <span>Zentel Insight</span>
        </NavLink>

        <nav className="portal-top-navigation" aria-label={sidebar.navLabel}>
          {primaryItems.map((item) => <PortalNavLink key={item.to} item={item} onNavigate={closeMenus} />)}
        </nav>

        <details ref={accountMenuRef} className="portal-top-menu portal-account-menu">
          <summary className="portal-account-trigger" aria-label="Account menu" title="Account menu">
            <ProfileAvatar name={sidebar.profileName} avatarUrl={sidebar.avatarUrl} initial={sidebar.profileInitial} />
            <span className="portal-account-copy"><strong>{sidebar.profileName}</strong><small>{sidebar.profileDetail}</small></span>
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <div className="portal-top-menu-panel account-panel">
            <div className="portal-account-summary">
              <ProfileAvatar name={sidebar.profileName} avatarUrl={sidebar.avatarUrl} initial={sidebar.profileInitial} />
              <span><strong>{sidebar.profileName}</strong><small>{sidebar.profileDetail}</small></span>
            </div>
            {sidebar.profileTo ? (
              <NavLink className="portal-top-link" to={sidebar.profileTo} onClick={closeMenus}>
                <UserRound size={18} aria-hidden="true" /><span>Profile</span>
              </NavLink>
            ) : null}
            <button className="portal-top-link signout" type="button" onClick={handleSignOut}>
              <LogOut size={18} aria-hidden="true" /><span>Sign Out</span>
            </button>
          </div>
        </details>
      </header>
      <main className="portal-main">{children}</main>
      <IdleSessionGuard enabled={idleEnabled} onBeforeSignOut={onBeforeSignOut} />
    </section>
  );
}
