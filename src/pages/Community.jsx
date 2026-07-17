import { ArrowRight, Facebook, Megaphone, MessageSquareText, Users } from "lucide-react";
import { Link } from "react-router-dom";
import SectionHeader from "../components/SectionHeader";
import { usePageMeta } from "../utils/usePageMeta";

const benefits = [
  {
    icon: MessageSquareText,
    title: "Learning discussions",
    body: "Ask questions, share ideas, and learn from practical conversations around digital skills and study support."
  },
  {
    icon: Users,
    title: "Peer support",
    body: "Stay connected with learners who are also building confidence, consistency, and creative output."
  },
  {
    icon: Megaphone,
    title: "Announcements",
    body: "Follow useful updates about programmes, learning opportunities, and community activities."
  }
];

export default function Community() {
  usePageMeta({
    path: "/community",
    title: "Community",
    description:
      "Join the Zentel Insight community for learning discussions, peer support, announcements, and collaboration."
  });

  return (
    <>
      <section className="page-hero">
        <div className="container narrow">
          <p className="eyebrow">Community</p>
          <h1>A focused space for learners to stay connected and keep growing.</h1>
          <p>
            The Zentel Insight community supports learning discussions, knowledge sharing, peer encouragement, and
            announcements around practical education.
          </p>
          <a
            className="button button-primary"
            href="https://www.facebook.com/share/18rQhw57y2/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Facebook size={18} aria-hidden="true" />
            Open Facebook Community
          </a>
        </div>
      </section>

      <section className="page-section">
        <div className="container">
          <SectionHeader
            eyebrow="Why join"
            title="Community support helps learning stay alive between sessions."
            align="center"
          />
          <div className="value-grid">
            {benefits.map(({ icon: Icon, title, body }) => (
              <article className="value-card" key={title}>
                <Icon size={26} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section alt">
        <div className="container split-section">
          <SectionHeader
            eyebrow="Who it is for"
            title="Learners, students, creatives, and aspiring digital professionals."
            description="The community is useful for anyone connected to Zentel Insight programmes or StudyHub support who wants announcements, collaboration, and a shared learning rhythm."
          />
          <div className="notice-card">
            <h2>Community expectations</h2>
            <p>
              Members should keep discussions respectful, relevant, and useful. Avoid spam, misleading claims, and
              sharing private information in public threads.
            </p>
            <Link className="text-link" to="/terms-and-conditions">
              Read community terms
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
