import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Check, CreditCard, HelpCircle, Wrench } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import SectionHeader from "../components/SectionHeader";
import { getProgramBySlug } from "../data/programs";
import { siteConfig } from "../data/site";
import { formatCurrency } from "../utils/format";
import { getProgramIcon } from "../utils/programIcons.jsx";
import { usePageMeta } from "../utils/usePageMeta";

function InfoList({ icon: Icon = Check, items }) {
  return (
    <div className="feature-list">
      {items.map((item) => (
        <article className="feature-row" key={item}>
          <Icon size={22} aria-hidden="true" />
          <div>
            <h3>{item}</h3>
            <p>Included in the programme structure.</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function ProgramDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const program = getProgramBySlug(slug);
  const [selectedLevelSlug, setSelectedLevelSlug] = useState("");
  const selectedLevel = useMemo(
    () => program?.levels.find((level) => level.slug === selectedLevelSlug) || null,
    [program, selectedLevelSlug]
  );

  useEffect(() => {
    setSelectedLevelSlug("");
  }, [program?.slug]);

  usePageMeta({
    path: `/programs/${slug || ""}`,
    title: program ? `${program.title} | Zentel Insight Program` : "Program Not Found",
    description: program?.shortDescription || "Explore Zentel Insight programmes.",
    image: `${siteConfig.domain}${siteConfig.main.ogImage}`,
    robots: program ? "index,follow" : "noindex,follow",
    structuredData: program
      ? {
          "@context": "https://schema.org",
          "@type": "Course",
          name: program.title,
          description: program.shortDescription,
          provider: {
            "@type": "EducationalOrganization",
            name: siteConfig.name,
            url: siteConfig.domain
          }
        }
      : undefined
  });

  if (!program) {
    return (
      <section className="page-section">
        <div className="container narrow">
          <div className="notice-card">
            <p className="eyebrow">Program unavailable</p>
            <h1>We could not find that programme.</h1>
            <p>Return to the Programs page and choose from the current catalogue.</p>
            <Link className="button button-primary" to="/programs">
              <ArrowLeft size={18} aria-hidden="true" />
              Back to Programs
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const ProgramIcon = getProgramIcon(program.icon);

  function handleEnrol() {
    if (!selectedLevel) return;
    navigate(`/checkout/${program.slug}/${selectedLevel.slug}`);
  }

  return (
    <>
      <section className="page-hero visual-section program-detail-hero">
        <div className="visual-section__background" aria-hidden="true" />
        <div className="visual-section__overlay" aria-hidden="true" />
        <div className="container split-section visual-section__content">
          <div>
            <BrandLogo brand="main" size="auth" className="hero-brand-logo" />
            <p className="eyebrow">Program details</p>
            <h1>{program.title}</h1>
            <p>{program.fullDescription}</p>
            <div className="hero-actions">
              <Link className="button button-secondary" to="/programs">
                Back to Programs
              </Link>
            </div>
          </div>
          <aside className="form-card level-selector-card">
            <span className="program-icon" aria-hidden="true">
              <ProgramIcon size={26} />
            </span>
            <h2>Select Track</h2>
            <p className="selection-empty">No track selected. Choose one track to enable enrolment.</p>
            <div className="level-options" role="radiogroup" aria-label="Program track">
              {program.levels.map((level) => (
                <button
                  type="button"
                  key={level.slug}
                  role="radio"
                  aria-checked={selectedLevel?.slug === level.slug}
                  className={selectedLevel?.slug === level.slug ? "level-option active" : "level-option"}
                  onClick={() => setSelectedLevelSlug(level.slug)}
                >
                  <span>{level.name}</span>
                  <strong>{formatCurrency(level.price)}</strong>
                </button>
              ))}
            </div>
            <div className="selected-track-summary" aria-live="polite">
              <div>
                <span>Selected programme</span>
                <strong>{program.title}</strong>
              </div>
              <div>
                <span>Selected track</span>
                <strong>{selectedLevel?.name || "No track selected"}</strong>
              </div>
              <div>
                <span>Price</span>
                <strong>{selectedLevel ? formatCurrency(selectedLevel.price) : "Select a track"}</strong>
              </div>
              {selectedLevel ? <p>{selectedLevel.summary}</p> : null}
            </div>
            <button className="button button-primary" type="button" disabled={!selectedLevel} onClick={handleEnrol}>
              {selectedLevel ? `Enrol in ${selectedLevel.name}` : "Select a Track to Enrol"}
              <CreditCard size={18} aria-hidden="true" />
            </button>
          </aside>
        </div>
      </section>

      <section className="page-section">
        <div className="container split-section">
          <div>
            <SectionHeader
              eyebrow="Who it is for"
              title="A practical pathway with clear track choices."
              description={program.targetLearners}
            />
            <InfoList items={program.outcomes} />
          </div>
          <div className="form-card">
            <h2>Prerequisites</h2>
            <InfoList items={program.prerequisites} />
          </div>
        </div>
      </section>

      <section className="page-section alt">
        <div className="container">
          <SectionHeader
            eyebrow="Learning tracks"
            title="Choose the track that matches the learner's current goal."
            description="Each track has its own trusted price. Select a track in the enrolment panel before checkout opens."
            align="center"
          />
          <div className="program-grid">
            {program.levels.map((level) => (
              <article className="program-card" key={level.slug}>
                <h3>{level.name}</h3>
                <p>{level.summary}</p>
                <strong>{formatCurrency(level.price)}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container split-section">
          <div>
            <SectionHeader eyebrow="Curriculum" title="What the programme covers." />
            <InfoList icon={BookOpen} items={program.curriculum} />
          </div>
          <div>
            <SectionHeader eyebrow="Tools and platforms" title="Tools used where appropriate." />
            <InfoList icon={Wrench} items={program.tools} />
          </div>
        </div>
      </section>

      <section className="page-section alt">
        <div className="container split-section">
          <div>
            <SectionHeader eyebrow="Practical projects" title="Portfolio-minded learning activities." />
            <InfoList items={program.projects} />
          </div>
          <div className="notice-card">
            <h2>Delivery information</h2>
            <p>{program.duration}</p>
            <p>{program.deliveryMode}</p>
            <h2>Software and licensing notice</h2>
            <p>{program.licensingNotice}</p>
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container">
          <SectionHeader eyebrow="FAQ" title="Questions before enrolment." align="center" />
          <div className="value-grid compact">
            {program.faq.map(([question, answer]) => (
              <article className="value-card" key={question}>
                <HelpCircle size={24} aria-hidden="true" />
                <h3>{question}</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
