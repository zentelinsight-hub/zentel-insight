import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const lockedScrollRef = useRef(null);
  const previousBodyStylesRef = useRef(null);

  const closeMenu = () => setOpen(false);

  useEffect(() => {
    openRef.current = open;
    document.body.classList.toggle("menu-open", open);
    if (open && lockedScrollRef.current === null) {
      lockedScrollRef.current = window.scrollY;
      previousBodyStylesRef.current = {
        position: document.body.style.position,
        top: document.body.style.top,
        right: document.body.style.right,
        left: document.body.style.left,
        width: document.body.style.width,
        overflow: document.body.style.overflow,
        htmlOverflow: document.documentElement.style.overflow
      };
      document.body.style.position = "fixed";
      document.body.style.top = `-${lockedScrollRef.current}px`;
      document.body.style.right = "0";
      document.body.style.left = "0";
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else if (!open && lockedScrollRef.current !== null) {
      const scrollY = lockedScrollRef.current;
      const previous = previousBodyStylesRef.current || {};
      lockedScrollRef.current = null;
      previousBodyStylesRef.current = null;
      document.body.style.position = previous.position || "";
      document.body.style.top = previous.top || "";
      document.body.style.right = previous.right || "";
      document.body.style.left = previous.left || "";
      document.body.style.width = previous.width || "";
      document.body.style.overflow = previous.overflow || "";
      document.documentElement.style.overflow = previous.htmlOverflow || "";
      window.scrollTo(0, scrollY);
    }

    return () => {
      document.body.classList.remove("menu-open");
      if (lockedScrollRef.current !== null) {
        const scrollY = lockedScrollRef.current;
        const previous = previousBodyStylesRef.current || {};
        lockedScrollRef.current = null;
        previousBodyStylesRef.current = null;
        document.body.style.position = previous.position || "";
        document.body.style.top = previous.top || "";
        document.body.style.right = previous.right || "";
        document.body.style.left = previous.left || "";
        document.body.style.width = previous.width || "";
        document.body.style.overflow = previous.overflow || "";
        document.documentElement.style.overflow = previous.htmlOverflow || "";
        window.scrollTo(0, scrollY);
      }
    };
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
      if (event.target instanceof Node && (headerRef.current?.contains(event.target) || menuRef.current?.contains(event.target))) return;
      closeMenu();
    }

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleResize);
    desktopQuery.addEventListener("change", closeForDesktop);
    closeForDesktop(desktopQuery);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("pointerdown", handlePointerDown);
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
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label={isDark ? "Toggle light mode" : "Toggle dark mode"}>
            {isDark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
          </button>
          <button
            ref={menuButtonRef}
            className="icon-button menu-button"
            type="button"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-controls={drawerId}
            aria-expanded={open}
            aria-hidden={open}
            disabled={open}
            tabIndex={open ? -1 : 0}
            onClick={() => setOpen((current) => !current)}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {open ? createPortal(
        <div className="site-drawer-layer">
          <button className="site-menu-backdrop open" type="button" aria-label="Close navigation" onClick={closeMenu} />
          <aside id={drawerId} className="mobile-menu open" ref={menuRef} aria-label={`${ariaLabel} menu`}>
            <div className="mobile-menu-header">
              <Link className="mobile-drawer-brand" to={brandHref} onClick={closeMenu}><BrandLogo brand={brand} size={34} /><strong>{brandName}</strong></Link>
              <button className="icon-button" type="button" aria-label="Close navigation menu" onClick={closeMenu}><X size={20} /></button>
            </div>
            <nav className="mobile-menu-inner" aria-label={`${ariaLabel} mobile`}>
              {links.map((item) => renderNavItem(item, "mobile-nav-link", closeMenu))}
            </nav>
            {actions.length ? <div className="mobile-menu-actions">{actions.map((item) => renderNavItem(item, "mobile-nav-link", closeMenu))}</div> : null}
          </aside>
        </div>,
        document.body
      ) : null}
    </header>
  );
}
