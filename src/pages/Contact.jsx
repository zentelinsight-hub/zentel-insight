import { Mail, MapPin, Phone } from "lucide-react";
import ContactForm from "../components/forms/ContactForm";
import SectionHeader from "../components/SectionHeader";
import { siteConfig } from "../data/site";
import { usePageMeta } from "../utils/usePageMeta";

export default function Contact() {
  usePageMeta({
    path: "/contact",
    title: "Contact",
    description:
      "Contact Zentel Insight for programme enquiries, StudyHub information, community support, and learning guidance."
  });

  const contactItems = [
    siteConfig.contact.email
      ? { icon: Mail, label: "Email", value: siteConfig.contact.email, href: `mailto:${siteConfig.contact.email}` }
      : null,
    siteConfig.contact.phone
      ? { icon: Phone, label: "Phone", value: siteConfig.contact.phone, href: `tel:${siteConfig.contact.phoneInternational}` }
      : null,
    siteConfig.contact.location ? { icon: MapPin, label: "Location", value: siteConfig.contact.location } : null
  ].filter(Boolean);

  return (
    <>
      <section className="page-hero">
        <div className="container narrow">
          <p className="eyebrow">Contact</p>
          <h1>Reach out about programmes, StudyHub, or community support.</h1>
          <p>
            Use the form below for enquiries. It opens WhatsApp with your completed message so you can review and send it.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="container contact-grid">
          <div>
            <SectionHeader
              eyebrow="Get in touch"
              title="Send a clear enquiry and the team can follow up through WhatsApp or official contact details."
              description="Official email and phone details are listed here, and the form opens WhatsApp with your message."
            />
            {contactItems.length ? (
              <div className="contact-methods">
                {contactItems.map(({ icon: Icon, label, value, href }) => (
                  <article className="contact-method" key={label}>
                    <Icon size={22} aria-hidden="true" />
                    <div>
                      <h2>{label}</h2>
                      {href ? <a href={href}>{value}</a> : <p>{value}</p>}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="notice-card">
                <h2>Contact details pending</h2>
                <p>{siteConfig.contact.responseNote}</p>
              </div>
            )}
          </div>
          <ContactForm />
        </div>
      </section>
    </>
  );
}
