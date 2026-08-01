import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import BrandLogo from "../BrandLogo";
import IdleSessionGuard from "../IdleSessionGuard";
import { useAuth } from "../../context/authHooks";
import { getSupabaseClient } from "../../services/supabaseClient";

function SidebarProfile({ name, detail, avatarUrl, initial }) {
  return (
    <div className="portal-sidebar-profile">
      <span className="portal-avatar md">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initial || String(name || "P").slice(0, 1).toUpperCase()}</span>}
      </span>
      <div>
        <strong>{name}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function SidebarGroup({ group, pathname, onNavigate }) {
  const isItemActive = (item) => item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
  const active = group.items.some(isItemActive);
  const [open, setOpen] = useState(Boolean(group.defaultOpen || active));

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (group.major && group.items.length === 1) {
    const item = group.items[0];
    return (
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) => isActive ? "portal-link portal-major-link active" : "portal-link portal-major-link"}
      >
        <item.Icon size={19} aria-hidden="true" />
        <span>{item.label}</span>
        {Number(item.badge || 0) > 0 ? <span className="portal-nav-badge">{item.badge}</span> : null}
      </NavLink>
    );
  }

  return (
    <details className="portal-nav-group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><span>{group.label}</span><ChevronDown size={15} aria-hidden="true" /></summary>
      <div>
        {group.items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => isActive ? "portal-link active" : "portal-link"}
          >
            <item.Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
            {Number(item.badge || 0) > 0 ? <span className="portal-nav-badge">{item.badge}</span> : null}
          </NavLink>
        ))}
      </div>
    </details>
  );
}

function SidebarContent({ sidebar, onNavigate, onSignOut }) {
  const location = useLocation();
  const groups = sidebar.groups || [{ label: "Navigation", items: sidebar.items || [], defaultOpen: true }];
  return (
    <>
      <div className="portal-sidebar-header">
        <NavLink className="brand" to={sidebar.homeTo} onClick={onNavigate}>
          <BrandLogo brand="main" size="portal" />
          <span>
            <span className="brand-name">{sidebar.brandLabel}</span>
            <span className="brand-motto">{sidebar.brandMotto || "Zentel Insight"}</span>
          </span>
        </NavLink>
      </div>
      <nav className="portal-sidebar-navigation" aria-label={sidebar.navLabel}>
        {groups.map((group) => <SidebarGroup key={group.label} group={group} pathname={location.pathname} onNavigate={onNavigate} />)}
      </nav>
      <div className="portal-sidebar-footer">
        <SidebarProfile
          name={sidebar.profileName}
          detail={sidebar.profileDetail}
          avatarUrl={sidebar.avatarUrl}
          initial={sidebar.profileInitial}
        />
        <button className="portal-link signout" type="button" onClick={onSignOut}>
          <LogOut size={18} aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </>
  );
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
  const drawerId = useId().replace(/:/g, "");
  const menuButtonRef = useRef(null);
  const scrollYRef = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const menuLabel = sidebar.menuLabel || "portal";
  const realtimeKey = [...new Set(realtimeTables)].sort().join(",");

  useEffect(() => {
    setPortalReady(true);
    document.body.classList.add("portal-route-active");
    return () => {
      document.body.classList.remove("portal-route-active", "portal-menu-open");
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia("(min-width: 920.01px)");
    const handleResize = (event) => {
      if (event.matches) setMenuOpen(false);
    };
    handleResize(mediaQuery);
    mediaQuery.addEventListener("change", handleResize);
    return () => mediaQuery.removeEventListener("change", handleResize);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const restoreFocusTarget = menuButtonRef.current;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    scrollYRef.current = window.scrollY;
    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("portal-menu-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = "100%";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("portal-menu-open");
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollYRef.current);
      restoreFocusTarget?.focus();
    };
  }, [menuOpen]);

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
        channel = client.channel(`portal-shell-${drawerId}-${Date.now()}`);
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
  }, [drawerId, onRealtimeChange, realtimeKey]);

  async function handleSignOut() {
    setMenuOpen(false);
    onBeforeSignOut?.();
    await signOut({ scope: "local" });
    navigate("/login", { replace: true });
  }

  const desktopSidebar = (
    <aside className="portal-sidebar portal-desktop-sidebar portal-sidebar-desktop">
      <SidebarContent sidebar={sidebar} onNavigate={() => setMenuOpen(false)} onSignOut={handleSignOut} />
    </aside>
  );

  const mobileDrawer = menuOpen && portalReady
    ? createPortal(
      <>
        <button className="portal-drawer-backdrop portal-mobile-backdrop" type="button" aria-label={`Close ${menuLabel} menu`} onClick={() => setMenuOpen(false)} />
        <aside id={drawerId} className="portal-sidebar portal-mobile-drawer open" aria-label={sidebar.navLabel}>
          <SidebarContent sidebar={sidebar} onNavigate={() => setMenuOpen(false)} onSignOut={handleSignOut} />
        </aside>
      </>,
      document.body
    )
    : null;

  return (
    <section className={`portal-shell ${sidebar.shellClass || ""}`.trim()}>
      {desktopSidebar}
      {mobileDrawer}
      <main className="portal-main">
        <header className="portal-header">
          <button
            ref={menuButtonRef}
            className="icon-button portal-menu-button"
            type="button"
            aria-label={menuOpen ? `Close ${menuLabel} menu` : `Open ${menuLabel} menu`}
            aria-expanded={menuOpen}
            aria-controls={drawerId}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
          <div>
            <p className="eyebrow">{header.eyebrow}</p>
            <h1>{header.title}</h1>
          </div>
          {header.status || null}
        </header>
        {children}
      </main>
      <IdleSessionGuard enabled={idleEnabled} onBeforeSignOut={onBeforeSignOut} />
    </section>
  );
}
