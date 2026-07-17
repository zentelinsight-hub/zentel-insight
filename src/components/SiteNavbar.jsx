import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, Moon, Sun, X } from "lucide-react";
import BrandLogo from "./BrandLogo";
import { useTheme } from "../context/themeHooks";
import { NAVBAR_DESKTOP_MEDIA } from "./navbarConfig";

function linkClass({ isActive }, baseClass, variant) {
  return [baseClass, variant || "", isActive ? "active" : ""].filter(Boolean).join(" ");
}

function renderNavItem(item, baseClass, closeMenu) {
  if (item.type === "button") {
    const Icon = item.icon;
    return (
      <button
        className={linkClass({ isActive: false }, baseClass, item.variant)}
        type="button"
        onClick={() => {
          closeMenu();
          item.onClick?.();
        }}
        key={item.label}
      >
        {item.label}
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      </button>
    );
  }

  const isRoot = item.href === "/" || item.href === "/studyhub";
  const end = item.end ?? isRoot;

  return (
    <NavLink
      key={item.href}
      to={item.href}
      end={end}
      className={(state) => linkClass(state, baseClass, item.variant)}
      onClick={closeMenu}
    >
      {item.label}
    </NavLink>
  );
}

export default function SiteNavbar({
  brand = "main",
  brandName,
  brandMotto,
  brandHref,
  links = [],
  actions = [],
  ariaLabel = "Primary navigation"
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const drawerId = useId().replace(/:/g, "");
  const headerRef = useRef(null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const openRef = useRef(open);

  const closeMenu = () => setOpen(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    closeMenu();
  }, [location.pathname, location.search]);

  useEffect(() => {
    const desktopQuery = window.matchMedia(NAVBAR_DESKTOP_MEDIA);

    function closeForDesktop(event) {
      if (event.matches || desktopQuery.matches) closeMenu();
    }

    function handleResize() {
      if (window.matchMedia(NAVBAR_DESKTOP_MEDIA).matches) closeMenu();
    }

    function handleKeydown(event) {
      if (openRef.current && event.key === "Escape") {
        closeMenu();
        menuButtonRef.current?.focus();
      }
    }

    function handlePointerDown(event) {
      if (!openRef.current) return;
      if (event.target instanceof Node && headerRef.current?.contains(event.target)) return;
      closeMenu();
    }

    function handleScroll(event) {
      if (!openRef.current) return;
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      closeMenu();
    }

    function handleWheel(event) {
      if (!openRef.current) return;
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      closeMenu();
    }

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("resize", handleResize);
    desktopQuery.addEventListener("change", closeForDesktop);
    closeForDesktop(desktopQuery);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", handleResize);
      desktopQuery.removeEventListener("change", closeForDesktop);
    };
  }, []);

  return (
    <header className="site-header" data-brand={brand} data-navbar-shell="site-navbar" ref={headerRef}>
      <nav className="nav container" aria-label={ariaLabel}>
        <Link className="brand" to={brandHref} onClick={closeMenu}>
          <BrandLogo brand={brand} size="medium" />
          <span>
            <span className="brand-name">{brandName}</span>
            <span className="brand-motto">{brandMotto}</span>
          </span>
        </Link>

        <div className="nav-links desktop-nav">{links.map((item) => renderNavItem(item, "nav-link", closeMenu))}</div>

        {actions.length ? (
          <div className="nav-action-links desktop-nav">
            {actions.map((item) => renderNavItem(item, "nav-link nav-link-button", closeMenu))}
          </div>
        ) : null}

        <div className="nav-controls">
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label="Toggle dark mode">
            {isDark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
          </button>
          <button
            ref={menuButtonRef}
            className="icon-button menu-button"
            type="button"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-controls={drawerId}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </nav>

      <button
        className={open ? "site-menu-backdrop open" : "site-menu-backdrop"}
        type="button"
        aria-label="Close navigation"
        onClick={closeMenu}
      />
      <div id={drawerId} className={open ? "mobile-menu open" : "mobile-menu"} ref={menuRef}>
        <div className="container mobile-menu-inner">
          {links.map((item) => renderNavItem(item, "mobile-nav-link", closeMenu))}
          {actions.length ? (
            <div className="mobile-menu-actions">
              {actions.map((item) => renderNavItem(item, "mobile-nav-link", closeMenu))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
