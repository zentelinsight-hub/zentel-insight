import { ArrowRight, BookOpen, Check, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { siteConfig } from "../../data/site";
import { studyHubPricing } from "../../data/programs";
import { usePageMeta } from "../../utils/usePageMeta";
import { formatCurrency } from "../../utils/format";
import { ContactCards, HowItWorksCards, StudyHubFaq, StudyHubHero } from "./StudyHubShared";

export default function StudyHubHome() {
  usePageMeta({
    path: "/studyhub",
    title: "Zentel Insight StudyHub",
    description: siteConfig.studyHub.description,
    favicon: siteConfig.studyHub.favicon,
    image: `${siteConfig.domain}${siteConfig.studyHub.ogImage}`
  });

  return (
    <>
      <StudyHubHero
        eyebrow="Zentel Insight StudyHub"
        title="Online academic support for JSS and SSS students."
        body="Student-friendly subject support for junior and senior secondary learners, with clear pricing and parent-ready communication."
      />

      <section className="page-section">
        <div className="container value-grid">
          {[
            ["JSS pathway", "JSS1, JSS2 and JSS3 learners receive guided support in core junior secondary subjects.", "/studyhub/jss"],
            ["SSS pathway", "SSS1, SSS2 and SSS3 learners get structured revision and subject-based support.", "/studyhub/sss"],
            ["Subjects", "Choose one or more subjects and calculate the total before continuing to payment.", "/studyhub/subjects"],
            ["Summer Lessons", "One complete holiday month at a flat one-time price, not charged per subject.", "/studyhub/summer-lessons"]
          ].map(([title, body, href]) => (
            <article className="value-card pathway-card" key={title}>
              <BookOpen size={24} aria-hidden="true" />
              <h2>{title}</h2>
              <p>{body}</p>
              <Link className="text-link" to={href}>
                Explore
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section alt">
        <div className="container split-section">
          <div>
            <p className="eyebrow">Learning experience</p>
            <h2>Clear online support that keeps schoolwork organized.</h2>
            <p>
              StudyHub is designed around subject clarity, guided practice, parent awareness and a calm payment flow.
            </p>
          </div>
          <div className="feature-list">
            {[
              ["Student-friendly sessions", "Lessons are structured so learners can revise, ask questions and practise."],
              ["Parent and guardian clarity", "The enrolment flow captures parent contact details for support communication."],
              ["Summer Lessons", `${formatCurrency(studyHubPricing.summerLessons.price)} covers one complete month and does not renew automatically.`],
              ["Practical pricing", `${formatCurrency(studyHubPricing.JSS.pricePerSubjectPerMonth)} for JSS and ${formatCurrency(studyHubPricing.SSS.pricePerSubjectPerMonth)} for SSS per subject per month.`]
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

      <section className="page-section visual-section studyhub-learning-section">
        <div className="visual-section__background" aria-hidden="true" />
        <div className="visual-section__overlay" aria-hidden="true" />
        <div className="container visual-section__content">
          <p className="eyebrow">How online learning works</p>
          <h2>Choose, calculate and enrol with a clear monthly structure.</h2>
          <HowItWorksCards />
        </div>
      </section>

      <section className="page-section alt">
        <div className="container">
          <p className="eyebrow">Popular subjects</p>
          <h2>Core academic support across JSS and SSS.</h2>
          <div className="studyhub-subject-grid">
            {[...new Set([...studyHubPricing.JSS.subjects, ...studyHubPricing.SSS.subjects])].map((subject) => (
              <span className="subject-chip" key={subject}>{subject}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container">
          <p className="eyebrow">FAQ</p>
          <h2>Helpful answers before enrolment.</h2>
          <StudyHubFaq />
        </div>
      </section>

      <section className="page-section alt">
        <div className="container split-section">
          <div>
            <p className="eyebrow">Enrol Now</p>
            <h2>Ready to calculate the learner&apos;s StudyHub plan?</h2>
            <p>Select class, subjects and months, then continue to Paystack from the enrolment page.</p>
            <Link className="button button-primary" to="/studyhub/enrol">
              Enrol Now
              <Users size={18} aria-hidden="true" />
            </Link>
            <Link className="button button-secondary" to="/studyhub/summer-lessons">
              View Summer Lessons
            </Link>
          </div>
          <ContactCards />
        </div>
      </section>
    </>
  );
}
