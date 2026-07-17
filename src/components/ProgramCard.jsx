import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { getProgramIcon } from "../utils/programIcons.jsx";
import { formatCurrency } from "../utils/format";

export default function ProgramCard({ program }) {
  const ProgramIcon = getProgramIcon(program.icon);
  const startingPrice = Math.min(...program.levels.map((level) => level.price));

  return (
    <article className="program-card" id={program.slug}>
      <div className="program-card-top">
        <span className="program-icon" aria-hidden="true">
          <ProgramIcon size={24} />
        </span>
        <span className={program.enrolmentOpen ? "status-pill open" : "status-pill"}>{program.enrolmentOpen ? "Open" : "Closed"}</span>
      </div>
      <h3>{program.title}</h3>
      <p>{program.shortDescription}</p>
      <dl className="program-meta">
        <div>
          <dt>Tracks</dt>
          <dd>{program.levels.length} options</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{program.duration}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{program.deliveryMode}</dd>
        </div>
      </dl>
      <ul className="check-list">
        {program.features.map((feature) => (
          <li key={feature}>
            <Check size={16} aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>
      <div className="price-table" aria-label={`${program.title} starting price`}>
        <div>
          <span>Starting from</span>
          <strong>{formatCurrency(startingPrice)}</strong>
        </div>
      </div>
      <div className="program-card-footer">
        <Link className="button button-primary button-small" to={`/programs/${program.slug}`}>
          View Program
        </Link>
      </div>
    </article>
  );
}
