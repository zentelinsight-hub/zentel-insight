import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  GraduationCap,
  MonitorPlay,
  ShieldCheck,
  Users
} from "lucide-react";
import { Link } from "react-router-dom";
import ProgramCard from "../components/ProgramCard";
import SectionHeader from "../components/SectionHeader";
import { announcements } from "../data/announcements";
import { programs } from "../data/programs";
import { siteConfig, stats } from "../data/site";
import { usePageMeta } from "../utils/usePageMeta";

export default function Home() {
  const featuredPrograms = programs.filter((program) => program.featured).slice(0, 4);

  usePageMeta({
    path: "/",
    title: "Zentel Insight | Practical Digital Skills",
    description:
      "Build practical digital skills for today's world with Zentel Insight, an education and technology platform focused on creativity, confidence, and applied learning.",
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "EducationalOrganization",
        name: siteConfig.name,
        url: siteConfig.domain,
        logo: `${siteConfig.domain}${siteConfig.main.logo}`,
        image: `${siteConfig.domain}${siteConfig.main.ogImage}`,
        slogan: siteConfig.motto,
        sameAs: siteConfig.socialLinks.map((link) => link.href)
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: siteConfig.name,
        url: siteConfig.domain,
        logo: `${siteConfig.domain}${siteConfig.main.logo}`,
        image: `${siteConfig.domain}${siteConfig.main.ogImage}`,
        sameAs: siteConfig.socialLinks.map((link) => link.href)
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteConfig.name,
        url: siteConfig.domain
      }
    ]
  });

  return (
    <>
      <section className="hero-section visual-section home-visual">
        <div className="visual-section__background" aria-hidden="true" />
        <div className="visual-section__overlay" aria-hidden="true" />
        <div className="container hero-grid visual-section__content">
          <div className="hero-copy">
            <p className="eyebrow">Inspiring Creativity, Empowering Minds.</p>
            <h1>Build practical digital skills for today&apos;s world.</h1>
            <p>
              Zentel Insight helps learners grow creative confidence, technical ability, and structured learning habits
              through practical programmes and community support.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/programs">
                Explore Programs
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="button button-secondary" to="/community">
                Join the Community
              </Link>
              <Link className="text-link" to="/studyhub">
                Visit StudyHub
              </Link>
            </div>
          </div>
          <div className="hero-visual" aria-label="Zentel Insight learning focus">
            <div className="hero-panel">
              <div className="panel-topline">
                <span className="live-dot" aria-hidden="true" />
                Practical learning dashboard
              </div>
              <div className="skill-bars" aria-hidden="true">
                <span style={{ "--width": "82%" }} />
                <span style={{ "--width": "64%" }} />
                <span style={{ "--width": "74%" }} />
              </div>
              <div className="hero-metrics">
                <div>
                  <BookOpen size={20} aria-hidden="true" />
                  <strong>Project-based</strong>
                  <span>Learn by doing</span>
                </div>
                <div>
                  <Users size={20} aria-hidden="true" />
                  <strong>Community</strong>
                  <span>Grow with peers</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="container trust-grid">
          {stats.map((stat) => (
            <div key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="page-section portal-preview-section">
        <div className="container portal-preview-grid">
          <div className="portal-preview-copy">
            <p className="eyebrow">Student Portal</p>
            <h2>Your Learning, Organised in One Place</h2>
            <p>
              Access your programme information, class timetable, announcements, assignments, learning resources and
              account updates through the Zentel Insight Student Portal.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/portal">
                Open Student Portal
                <MonitorPlay size={18} aria-hidden="true" />
              </Link>
              <Link className="button button-secondary" to="/programs">
                Explore Programmes
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="portal-preview-frame" aria-label="Student Portal dashboard preview">
            <div className="portal-preview-browser-bar" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <img
              src="/images/student-portal-preview.webp"
              alt="Sanitized Zentel Insight Student Portal dashboard showing programme, timetable, announcement and learning-resource cards."
              width="1440"
              height="900"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container split-section">
          <SectionHeader
            eyebrow="What we do"
            title="Education that turns interest into usable skill."
            description="Zentel Insight sits at the intersection of creativity, technology, and structured support. The focus is not just exposure to digital tools, but practical confidence with them."
          />
          <div className="feature-list">
            {[
              ["Practical projects", "Learners practise with tasks that feel close to real work."],
              ["Clear progression", "Programmes are organized around foundations, practice, and application."],
              ["Community support", "Discussions and announcements help learners stay connected beyond class time."]
            ].map(([title, body]) => (
              <article key={title} className="feature-row">
                <BadgeCheck size={22} aria-hidden="true" />
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
          <SectionHeader
            eyebrow="Featured programs"
            title="Start with a pathway that matches your goals."
            description="Each featured course shows meaningful track prices from the same catalogue used at checkout."
            align="center"
          />
          <div className="program-grid">
            {featuredPrograms.map((program) => (
              <ProgramCard key={program.slug} program={program} />
            ))}
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container process-grid">
          <SectionHeader
            eyebrow="Learning experience"
            title="A focused path from curiosity to confident output."
            description="The learning journey is designed to make each step understandable, practical, and useful."
          />
          <div className="steps">
            {[
              [GraduationCap, "Choose your pathway", "Start with the programme that fits your current goal."],
              [CalendarDays, "Follow the timetable", "Use scheduled sessions and guided practice to stay consistent."],
              [ShieldCheck, "Build and review", "Create practical work, receive feedback, and keep improving."]
            ].map(([Icon, title, body], index) => (
              <article className="step-card" key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Icon size={24} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section alt">
        <div className="container">
          <SectionHeader
            eyebrow="Current highlights"
            title="Useful updates for learners and visitors."
            align="center"
          />
          <div className="announcement-grid">
            {announcements.map((announcement) => (
              <article className="announcement-card" key={announcement.title}>
                <h3>{announcement.title}</h3>
                <p>{announcement.body}</p>
                <Link className="text-link" to={announcement.href}>
                  Learn more
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta-panel">
          <div>
            <p className="eyebrow">Ready to begin?</p>
            <h2>Explore the programmes and choose your next learning step.</h2>
          </div>
          <Link className="button button-primary" to="/programs">
            View Programs
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
