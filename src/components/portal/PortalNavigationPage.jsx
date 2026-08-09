import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import PortalBackButton from "./PortalBackButton";

export default function PortalNavigationPage({ eyebrow, title, items, description = "" }) {
  return (
    <div className="portal-page portal-navigation-page">
      <header className="portal-compact-heading">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <div className="portal-title-row">
          <PortalBackButton label={`Back from ${title}`} />
          <h1>{title}</h1>
        </div>
        {description ? <p>{description}</p> : null}
      </header>
      <nav className="portal-destination-list" aria-label={`${title} pages`}>
        {items.map(({ to, label, description: itemDescription, Icon, badge, onSelect }) => {
          const content = <>
            <span className="portal-destination-icon"><Icon size={18} aria-hidden="true" /></span>
            <span className="portal-destination-copy">
              <strong>{label}</strong>
              {itemDescription ? <small>{itemDescription}</small> : null}
            </span>
            {Number(badge || 0) > 0 ? <span className="portal-nav-badge">{badge > 99 ? "99+" : badge}</span> : null}
            <ChevronRight size={17} aria-hidden="true" />
          </>;
          return onSelect
            ? <button type="button" onClick={onSelect} key={label}>{content}</button>
            : <Link to={to} key={to}>{content}</Link>;
        })}
      </nav>
    </div>
  );
}
