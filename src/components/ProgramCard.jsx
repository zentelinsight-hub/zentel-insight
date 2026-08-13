import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import ProgramBanner from "./ProgramBanner";
import { formatCurrency } from "../utils/format";

export default function ProgramCard({ program, index = 0 }) {
  const startingPrice = Math.min(...program.levels.map((level) => level.price));

  return (
    <article className="program-card" id={program.slug}>
      <ProgramBanner program={program} />
      <div className="program-card-body">
        <div className="program-card-top">
          <span>{String(index + 1).padStart(2, "0")} / DIGITAL SKILLS</span>
          <span className={program.enrolmentOpen ? "status-pill open" : "status-pill"}>{program.enrolmentOpen ? "Open" : "Closed"}</span>
        </div>
        <h3>{program.title}</h3>
        <p>{program.shortDescription}</p>
        <div className="program-card-footer">
          <span className="program-price">From {formatCurrency(startingPrice)}</span>
          <Link className="text-link" to={`/programs/${program.slug}`} aria-label={`View ${program.title}`}>
            View programme
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
