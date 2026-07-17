import { ArrowRight, BookOpen, Calculator, Check, GraduationCap, Mail, Phone, School, Users } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";
import { siteConfig } from "../../data/site";
import { studyHubPricing } from "../../data/programs";
import { formatCurrency } from "../../utils/format";

export function StudyHubHero({ eyebrow, title, body, background = "studyhub-home", children }) {
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.55, ease: "easeOut" }
      };

  return (
    <motion.section className={`page-hero visual-section studyhub-visual ${background}`} {...entrance}>
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container split-section visual-section__content">
        <div>
          <BrandLogo brand="studyhub" className="hero-brand-logo" size="auth" />
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{body}</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/studyhub/enrol">
              Enrol Now
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="button button-secondary" to="/studyhub/contact">
              Contact Support
            </Link>
          </div>
        </div>
        {children || <StudyHubPriceCards />}
      </div>
    </motion.section>
  );
}

export function StudyHubPriceCards() {
  const reduceMotion = useReducedMotion();
  const cardMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 }
      };

  return (
    <div className="studyhub-price-summary" aria-label="StudyHub pricing summary">
      <motion.article {...cardMotion} transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}>
        <School size={24} aria-hidden="true" />
        <h2>JSS1, JSS2 and JSS3</h2>
        <strong>{formatCurrency(studyHubPricing.JSS.pricePerSubjectPerMonth)}</strong>
        <p>per subject per month</p>
      </motion.article>
      <motion.article {...cardMotion} transition={{ duration: 0.45, ease: "easeOut", delay: 0.16 }}>
        <BookOpen size={24} aria-hidden="true" />
        <h2>SSS1, SSS2 and SSS3</h2>
        <strong>{formatCurrency(studyHubPricing.SSS.pricePerSubjectPerMonth)}</strong>
        <p>per subject per month</p>
      </motion.article>
      <motion.article {...cardMotion} transition={{ duration: 0.45, ease: "easeOut", delay: 0.24 }}>
        <CalendarIcon />
        <h2>Summer Lessons</h2>
        <strong>{formatCurrency(studyHubPricing.summerLessons.price)}</strong>
        <p>one-time price for one month</p>
      </motion.article>
    </div>
  );
}

function CalendarIcon() {
  return <GraduationCap size={24} aria-hidden="true" />;
}

export function HowItWorksCards() {
  return (
    <div className="value-grid">
      {[
        [Users, "Select class", "Choose the learner's JSS or SSS class."],
        [BookOpen, "Pick subjects", "Select one or more subjects for monthly support."],
        [Calculator, "Review total", "The total is class price times subjects times months."],
        [Check, "Continue to Paystack", "Card details are handled by Paystack after the summary is reviewed."]
      ].map(([Icon, title, body]) => (
        <article className="value-card" key={title}>
          <Icon size={24} aria-hidden="true" />
          <h3>{title}</h3>
          <p>{body}</p>
        </article>
      ))}
    </div>
  );
}

export function StudyHubFaq() {
  return (
    <div className="value-grid compact">
      {[
        ["Is an account required?", "No account is needed for StudyHub enrolment. Parents can pay directly from the enrolment page."],
        ["How is the total calculated?", "Class price per subject per month multiplied by selected subjects and months."],
        ["Are results guaranteed?", "No. StudyHub provides academic support and revision structure, but school results depend on many factors."]
      ].map(([title, body]) => (
        <article className="value-card" key={title}>
          <GraduationCap size={24} aria-hidden="true" />
          <h3>{title}</h3>
          <p>{body}</p>
        </article>
      ))}
    </div>
  );
}

export function ContactCards() {
  return (
    <div className="value-grid compact">
      <article className="value-card">
        <Phone size={24} aria-hidden="true" />
        <h3>Phone</h3>
        <p>
          <a href={`tel:${siteConfig.studyHub.phoneInternational}`}>{siteConfig.studyHub.phone}</a>
        </p>
      </article>
      <article className="value-card">
        <Mail size={24} aria-hidden="true" />
        <h3>Email</h3>
        <p>
          <a href={`mailto:${siteConfig.studyHub.email}`}>{siteConfig.studyHub.email}</a>
        </p>
      </article>
      <article className="value-card">
        <Users size={24} aria-hidden="true" />
        <h3>Support</h3>
        <p>Ask about class placement, subject selection, pricing or payment support.</p>
      </article>
    </div>
  );
}
