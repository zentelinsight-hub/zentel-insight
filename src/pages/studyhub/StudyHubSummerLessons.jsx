import { CalendarDays, Check, GraduationCap, SunMedium } from "lucide-react";
import { Link } from "react-router-dom";
import { studyHubPricing } from "../../data/programs";
import { siteConfig } from "../../data/site";
import { formatCurrency } from "../../utils/format";
import { usePageMeta } from "../../utils/usePageMeta";
import { StudyHubHero } from "./StudyHubShared";

const summer = studyHubPricing.summerLessons;

export default function StudyHubSummerLessons() {
  usePageMeta({
    path: "/studyhub/summer-lessons",
    title: "Summer Lessons | Zentel Insight StudyHub",
    description:
      "One-month online Summer Lessons for secondary-school learners with a one-time 30000 naira StudyHub price.",
    favicon: siteConfig.studyHub.favicon,
    faviconType: siteConfig.studyHub.faviconType,
    themeColor: siteConfig.studyHub.primaryColor,
    image: `${siteConfig.domain}${siteConfig.studyHub.ogImage}`,
    siteName: siteConfig.studyHub.name,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "EducationalOccupationalProgram",
      name: "Summer Lessons",
      provider: {
        "@type": "EducationalOrganization",
        name: siteConfig.studyHub.name,
        parentOrganization: {
          "@type": "Organization",
          name: siteConfig.main.name
        }
      },
      url: `${siteConfig.domain}/studyhub/summer-lessons`,
      description: summer.description
    }
  });

  return (
    <>
      <StudyHubHero
        eyebrow="Summer Lessons"
        title="One month of structured holiday learning."
        body="Summer Lessons gives secondary-school learners a focused one-month learning rhythm without per-subject billing or automatic renewal."
        background="studyhub-summer"
      />

      <section className="page-section">
        <div className="container split-section">
          <div>
            <p className="eyebrow">Programme details</p>
            <h2>What Summer Lessons covers.</h2>
            <p>
              The programme supports JSS and SSS learners through a focused one-month online lesson plan. Activities
              may include revision, guided practice, classwork support, topic refreshers and study planning.
            </p>
            <p>
              It does not guarantee examination results, promotion, unlimited private tutoring or automatic access to
              every subject.
            </p>
          </div>
          <aside className="form-card">
            <SunMedium size={26} aria-hidden="true" />
            <h2>Summer Lessons - {formatCurrency(summer.price)}</h2>
            <p>{summer.description}</p>
            <div className="calculation-card">
              <div><span>Duration</span><strong>{summer.duration}</strong></div>
              <div><span>Billing</span><strong>One-time payment</strong></div>
              <div><span>Per subject?</span><strong>No</strong></div>
              <div className="total"><span>Total</span><strong>{formatCurrency(summer.price)}</strong></div>
            </div>
            <Link className="button button-primary" to="/studyhub/enrol/summer-lessons">
              Enrol in Summer Lessons
            </Link>
          </aside>
        </div>
      </section>

      <section className="page-section alt">
        <div className="container">
          <p className="eyebrow">Learning focus</p>
          <h2>Built for a complete holiday month.</h2>
          <div className="value-grid">
            {[
              ["Who can participate", `Secondary-school learners from ${summer.classes.join(", ")}.`],
              ["Delivery format", "Online learning support with scheduled activities and parent contact details."],
              ["Example activities", "Topic revision, practice exercises, guided explanations and study planning."],
              ["What it covers", "One Summer Lessons programme for one complete month."],
              ["What it does not cover", "It is not per-subject tutoring, a recurring subscription or a result guarantee."],
              ["Parent support", "Guardian details are collected so the team can coordinate learning support."]
            ].map(([title, body]) => (
              <article className="value-card" key={title}>
                <Check size={24} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container value-grid compact">
          {[
            ["Is the price per subject?", "No. Summer Lessons is a flat one-time price for one complete month."],
            ["Does it renew automatically?", "No. Payment does not renew automatically."],
            ["Can all subjects be guaranteed?", "No. Available learning focus areas are confirmed during enrolment."]
          ].map(([question, answer]) => (
            <article className="value-card" key={question}>
              <GraduationCap size={24} aria-hidden="true" />
              <h3>{question}</h3>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta-panel">
          <div>
            <p className="eyebrow">Ready for summer learning?</p>
            <h2>Enrol for one complete month at {formatCurrency(summer.price)}.</h2>
          </div>
          <Link className="button button-primary" to="/studyhub/enrol/summer-lessons">
            Continue to Summer Lessons Enrolment
            <CalendarDays size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
