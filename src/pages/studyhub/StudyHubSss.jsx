import { Link } from "react-router-dom";
import { BookOpen, Check } from "lucide-react";
import { studyHubPricing } from "../../data/programs";
import { siteConfig } from "../../data/site";
import { formatCurrency } from "../../utils/format";
import { usePageMeta } from "../../utils/usePageMeta";
import { StudyHubHero } from "./StudyHubShared";
import { subjectDescriptions } from "./subjectDescriptions";

export default function StudyHubSss() {
  usePageMeta({
    path: "/studyhub/sss",
    title: "SSS Academic Support | Zentel Insight StudyHub",
    description: "Online subject support and structured revision for SSS1, SSS2 and SSS3 learners.",
    favicon: siteConfig.studyHub.favicon,
    image: `${siteConfig.domain}${siteConfig.studyHub.ogImage}`
  });

  return (
    <>
      <StudyHubHero
        eyebrow="Senior Secondary School"
        title="Subject-based support for SSS1, SSS2 and SSS3."
        body="SSS learners get structured revision, classwork guidance and exam preparation support without any guaranteed result claims."
        background="studyhub-sss"
      />

      <section className="page-section">
        <div className="container split-section">
          <div>
            <p className="eyebrow">Programme explanation</p>
            <h2>Support for senior secondary learning.</h2>
            <p>
              The SSS pathway helps learners organize difficult subject areas, practise questions and revise more
              consistently for schoolwork and examinations.
            </p>
            <p className="price-callout">{formatCurrency(studyHubPricing.SSS.pricePerSubjectPerMonth)} per subject per month.</p>
          </div>
          <div className="feature-list">
            {[
              ["Subject-based academic support", "Focused sessions around the learner's selected subjects."],
              ["Structured revision", "Revision prompts, examples and question practice for stronger preparation."],
              ["Exam preparation", "Guidance helps learners prepare responsibly without promising specific results."]
            ].map(([title, body]) => (
              <article className="feature-row" key={title}>
                <Check size={22} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section alt">
        <div className="container">
          <p className="eyebrow">SSS classes and subjects</p>
          <h2>Choose the right class and subjects during enrolment.</h2>
          <div className="value-grid">
            {studyHubPricing.SSS.classes.map((className) => (
              <article className="value-card" key={className}>
                <BookOpen size={24} aria-hidden="true" />
                <h3>{className}</h3>
                <p>{studyHubPricing.SSS.subjects.join(", ")}</p>
              </article>
            ))}
          </div>
          <div className="studyhub-subject-grid">
            {studyHubPricing.SSS.subjects.map((subject) => (
              <Link className="subject-chip" to="/studyhub/enrol" key={subject}>
                {subject}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container value-grid compact">
          {studyHubPricing.SSS.subjects.slice(0, 3).map((subject) => (
            <article className="value-card" key={subject}>
              <h3>{subject}</h3>
              <p>{subjectDescriptions[subject]}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
