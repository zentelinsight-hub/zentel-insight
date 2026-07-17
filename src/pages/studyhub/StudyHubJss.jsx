import { Link } from "react-router-dom";
import { Check, School } from "lucide-react";
import { studyHubPricing } from "../../data/programs";
import { siteConfig } from "../../data/site";
import { formatCurrency } from "../../utils/format";
import { usePageMeta } from "../../utils/usePageMeta";
import { StudyHubHero } from "./StudyHubShared";
import { subjectDescriptions } from "./subjectDescriptions";

export default function StudyHubJss() {
  usePageMeta({
    path: "/studyhub/jss",
    title: "JSS Academic Support | Zentel Insight StudyHub",
    description: "Online subject support for JSS1, JSS2 and JSS3 learners.",
    favicon: siteConfig.studyHub.favicon,
    image: `${siteConfig.domain}${siteConfig.studyHub.ogImage}`
  });

  return (
    <>
      <StudyHubHero
        eyebrow="Junior Secondary School"
        title="Structured support for JSS1, JSS2 and JSS3."
        body="JSS learners receive focused help with core subjects, classwork, revision and practical study habits."
        background="studyhub-jss"
      />

      <section className="page-section">
        <div className="container split-section">
          <div>
            <p className="eyebrow">Programme explanation</p>
            <h2>Who the JSS pathway is for.</h2>
            <p>
              This pathway supports junior secondary learners who need clearer explanations, guided practice and steady
              subject revision across JSS1, JSS2 and JSS3.
            </p>
            <p className="price-callout">{formatCurrency(studyHubPricing.JSS.pricePerSubjectPerMonth)} per subject per month.</p>
          </div>
          <div className="feature-list">
            {[
              ["Online lesson format", "Subject-focused online sessions with practice activities and recap support."],
              ["Learning activities", "Exercises, examples, revision prompts and classwork support."],
              ["Parent communication", "Parent or guardian contact details are collected during enrolment for support coordination."]
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
          <p className="eyebrow">JSS classes and subjects</p>
          <h2>Select one or more subjects during enrolment.</h2>
          <div className="value-grid">
            {studyHubPricing.JSS.classes.map((className) => (
              <article className="value-card" key={className}>
                <School size={24} aria-hidden="true" />
                <h3>{className}</h3>
                <p>{studyHubPricing.JSS.subjects.join(", ")}</p>
              </article>
            ))}
          </div>
          <div className="studyhub-subject-grid">
            {studyHubPricing.JSS.subjects.map((subject) => (
              <Link className="subject-chip" to="/studyhub/enrol" key={subject}>
                {subject}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container value-grid compact">
          {studyHubPricing.JSS.subjects.slice(0, 3).map((subject) => (
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
