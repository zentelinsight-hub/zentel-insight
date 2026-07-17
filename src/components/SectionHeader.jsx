export default function SectionHeader({ eyebrow, title, description, align = "left" }) {
  return (
    <div className={`section-header ${align === "center" ? "center" : ""}`}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
