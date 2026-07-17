import { ArrowRight, BookOpen, Lightbulb, Target, UserRound, Users } from "lucide-react";
import { Link } from "react-router-dom";
import SectionHeader from "../components/SectionHeader";
import { siteConfig } from "../data/site";
import { usePageMeta } from "../utils/usePageMeta";

const values = [
  {
    icon: Lightbulb,
    title: "Creativity with purpose",
    body: "Learners are encouraged to explore ideas while producing work that communicates clearly and solves real problems."
  },
  {
    icon: BookOpen,
    title: "Practical education",
    body: "Training is organized around applied learning, guided practice, and useful outcomes rather than empty theory."
  },
  {
    icon: Users,
    title: "Supportive growth",
    body: "Zentel Insight creates room for peer learning, mentoring, feedback, and steady confidence-building."
  }
];

export default function About() {
  usePageMeta({
    path: "/about",
    title: "About",
    description:
      "Learn about Zentel Insight, its mission, values, and practical approach to digital education and learner support."
  });

  return (
    <>
      <section className="page-hero">
        <div className="container narrow">
          <p className="eyebrow">About Zentel Insight</p>
          <h1>{siteConfig.motto}</h1>
          <p>
            Zentel Insight is an educational technology platform focused on helping learners build practical digital
            skills, creative confidence, and stronger pathways into modern opportunities.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="container split-section">
          <SectionHeader
            eyebrow="Our purpose"
            title="We help learners turn potential into practical capability."
            description="Zentel Insight serves students, early-career learners, creatives, and aspiring digital professionals who want structured support and hands-on skill development."
          />
          <div className="mission-card">
            <div>
              <Target size={26} aria-hidden="true" />
              <h2>Mission</h2>
              <p>
                To provide accessible, practical digital education that helps learners create, communicate, solve
                problems, and participate confidently in the modern world.
              </p>
            </div>
            <div>
              <Target size={26} aria-hidden="true" />
              <h2>Vision</h2>
              <p>
                To become a trusted learning community where creativity, technology, and personal growth work together
                to empower the next generation of builders and problem solvers.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section alt">
        <div className="container">
          <SectionHeader
            eyebrow="Values"
            title="The principles behind the learning experience."
            align="center"
          />
          <div className="value-grid">
            {values.map(({ icon: Icon, title, body }) => (
              <article className="value-card" key={title}>
                <Icon size={26} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container founder-section">
          <div className="founder-card">
            <div className="founder-mark" aria-hidden="true">
              <UserRound size={34} />
            </div>
            <div>
              <p className="eyebrow">Leadership</p>
              <h2>{siteConfig.founder.name}</h2>
              <p className="founder-title">{siteConfig.founder.title}</p>
              <p>{siteConfig.founder.bio}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="container split-section">
          <SectionHeader
            eyebrow="Our approach"
            title="Learning is strongest when it is clear, practical, and connected."
            description="Zentel Insight keeps programmes understandable for beginners while still respecting the standards of real digital work."
          />
          <div className="feature-list">
            <article className="feature-row">
              <BookOpen size={22} aria-hidden="true" />
              <div>
                <h3>Structured foundations</h3>
                <p>Each pathway starts with the core concepts learners need before moving into applied work.</p>
              </div>
            </article>
            <article className="feature-row">
              <Lightbulb size={22} aria-hidden="true" />
              <div>
                <h3>Creative application</h3>
                <p>Learners practise with projects, examples, and scenarios that build confidence beyond the classroom.</p>
              </div>
            </article>
            <article className="feature-row">
              <Users size={22} aria-hidden="true" />
              <div>
                <h3>Community support</h3>
                <p>The learning experience extends through peer discussion, announcements, and knowledge sharing.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta-panel">
          <div>
            <p className="eyebrow">Next step</p>
            <h2>Find a programme that fits your current learning goal.</h2>
          </div>
          <Link className="button button-primary" to="/programs">
            Explore Programs
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
