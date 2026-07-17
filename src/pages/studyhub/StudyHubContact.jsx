import { Mail, Phone } from "lucide-react";
import ContactForm from "../../components/forms/ContactForm";
import { siteConfig } from "../../data/site";
import { usePageMeta } from "../../utils/usePageMeta";
import { ContactCards, StudyHubHero } from "./StudyHubShared";

export default function StudyHubContact() {
  usePageMeta({
    path: "/studyhub/contact",
    title: "Contact StudyHub | Zentel Insight StudyHub",
    description: "Contact Zentel Insight StudyHub for JSS and SSS academic support enquiries.",
    favicon: siteConfig.studyHub.favicon,
    image: `${siteConfig.domain}${siteConfig.studyHub.ogImage}`
  });

  return (
    <>
      <StudyHubHero
        eyebrow="Contact"
        title="Talk to StudyHub support."
        body="Use the official phone and email details for class placement, subject support, pricing or payment questions."
        background="studyhub-contact"
      >
        <ContactCards />
      </StudyHubHero>

      <section className="page-section">
        <div className="container payment-layout">
          <div>
            <p className="eyebrow">Official contact</p>
            <h2>StudyHub support details.</h2>
            <div className="feature-list">
              <article className="feature-row">
                <Phone size={22} aria-hidden="true" />
                <div>
                  <h3>Phone</h3>
                  <p>
                    <a href={`tel:${siteConfig.studyHub.phoneInternational}`}>{siteConfig.studyHub.phone}</a>
                  </p>
                </div>
              </article>
              <article className="feature-row">
                <Mail size={22} aria-hidden="true" />
                <div>
                  <h3>Email</h3>
                  <p>
                    <a href={`mailto:${siteConfig.studyHub.email}`}>{siteConfig.studyHub.email}</a>
                  </p>
                </div>
              </article>
            </div>
          </div>
          <ContactForm brand="studyhub" />
        </div>
      </section>
    </>
  );
}
