import { Facebook, Mail, MapPin, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { siteConfig, studyHubNavItems } from "../data/site";
import { programs } from "../data/programs";
import BrandLogo from "./BrandLogo";

export default function Footer({ brand = "main" }) {
  const year = new Date().getFullYear();
  const brandConfig = brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const brandHref = brand === "studyhub" ? "/studyhub" : "/";
  const brandMotto = brand === "studyhub" ? `Academic support by ${siteConfig.studyHub.parentName}` : siteConfig.motto;
  const brandDescription = brand === "studyhub" ? siteConfig.studyHub.description : siteConfig.description;
  const contactEmail = brand === "studyhub" ? siteConfig.studyHub.email : siteConfig.contact.email;
  const contactPhone = brand === "studyhub" ? siteConfig.studyHub.phoneInternational : siteConfig.contact.phoneInternational;
  const visiblePhone = brand === "studyhub" ? siteConfig.studyHub.phone : siteConfig.contact.phone;

  const companyLinks = [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Community", href: "/community" },
    { label: "Contact", href: "/contact" }
  ];
  const studentLinks = [
    { label: "Login", href: "/login" },
    { label: "Sign Up", href: "/signup" },
    { label: "Student Portal", href: "/portal" }
  ];
  const legalLinks = [
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms and Conditions", href: "/terms-and-conditions" }
  ];
  const studyHubLinks = [
    ...studyHubNavItems.map((item) => ({ label: item.label === "Home" ? "StudyHub Home" : item.label, href: item.href })),
    { label: "Enrol", href: "/studyhub/enrol" }
  ];
  const studyHubFooterLinks = [
    ...studyHubNavItems,
    { label: "Enrol", href: "/studyhub/enrol" },
    { label: "Back to Zentel Insight", href: "/" },
    ...legalLinks
  ];

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Link className="brand footer-logo" to={brandHref}>
            <BrandLogo brand={brand} size="footer" />
            <span>
              <span className="brand-name">{brandConfig.name}</span>
              <span className="brand-motto">{brandMotto}</span>
            </span>
          </Link>
          <p>{brandDescription}</p>
          <p className="footer-domain">zentelinsight.com.ng</p>
        </div>

        {brand === "studyhub" ? (
          <div>
            <h2 className="footer-heading">StudyHub</h2>
            <ul className="footer-list">
              {studyHubFooterLinks.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <Link to={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div>
              <h2 className="footer-heading">Company</h2>
              <ul className="footer-list">
                {companyLinks.map((item) => (
                  <li key={item.href}>
                    <Link to={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="footer-heading">Programs</h2>
              <ul className="footer-list">
                {programs.map((program) => (
                  <li key={program.slug}>
                    <Link to={`/programs/${program.slug}`}>{program.title}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="footer-heading">Student</h2>
              <ul className="footer-list">
                {studentLinks.map((item) => (
                  <li key={item.href}>
                    <Link to={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="footer-heading">StudyHub</h2>
              <ul className="footer-list">
                {studyHubLinks.map((item) => (
                  <li key={item.href}>
                    <Link to={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="footer-heading">Legal</h2>
              <ul className="footer-list">
                {legalLinks.map((item) => (
                  <li key={item.href}>
                    <Link to={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div>
          <h2 className="footer-heading">Contact</h2>
          <ul className="footer-list contact-list">
            {contactEmail ? (
              <li>
                <Mail size={16} aria-hidden="true" />
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              </li>
            ) : null}
            {contactPhone ? (
              <li>
                <Phone size={16} aria-hidden="true" />
                <a href={`tel:${contactPhone}`}>{visiblePhone}</a>
              </li>
            ) : null}
            {brand === "main" && siteConfig.studyHub.email ? (
              <li>
                <Mail size={16} aria-hidden="true" />
                <a href={`mailto:${siteConfig.studyHub.email}`}>{siteConfig.studyHub.email}</a>
              </li>
            ) : null}
            {siteConfig.contact.location ? (
              <li>
                <MapPin size={16} aria-hidden="true" />
                <span>{siteConfig.contact.location}</span>
              </li>
            ) : null}
            <li>
              <Facebook size={16} aria-hidden="true" />
              <a href="https://www.facebook.com/share/18rQhw57y2/" target="_blank" rel="noopener noreferrer">
                Facebook community
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="container footer-bottom">
        <p>&copy; {year} {brandConfig.name}. All rights reserved.</p>
      </div>
    </footer>
  );
}
