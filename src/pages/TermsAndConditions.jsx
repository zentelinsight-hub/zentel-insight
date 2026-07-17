import { siteConfig } from "../data/site";
import { usePageMeta } from "../utils/usePageMeta";

export default function TermsAndConditions() {
  usePageMeta({
    path: "/terms-and-conditions",
    title: "Terms and Conditions",
    description:
      "Terms and Conditions for Zentel Insight learners, visitors, payments, enrolment, acceptable use, and third-party services."
  });

  return (
    <section className="legal-page">
      <div className="container narrow">
        <p className="eyebrow">Legal</p>
        <h1>Terms and Conditions</h1>
        <p>
          These Terms and Conditions govern use of {siteConfig.name} and {siteConfig.domain}. They are intended for an
          educational technology platform and should be reviewed by a qualified legal professional before formal
          publication.
        </p>

        <h2>Use of the Website</h2>
        <p>
          Visitors may use the website to learn about programmes, StudyHub support, community links, timetable details,
          policies, and payment options.
        </p>

        <h2>Acceptable Use</h2>
        <p>
          You must not misuse the website, interfere with its operation, submit misleading information, attempt
          unauthorized access, or use community spaces for harassment, spam, or unlawful activity.
        </p>

        <h2>Programme Information</h2>
        <p>
          Programme details are provided for guidance and may be updated. Visitors should confirm current enrolment
          conditions before relying on programme availability.
        </p>

        <h2>Payments and Enrolment</h2>
        <p>
          Payments are handled through Paystack. A successful browser callback does not automatically mean payment
          confirmation has been completed. Course access is activated only after the transaction is confirmed.
        </p>

        <h2>Refunds and Changes</h2>
        <p>
          Refunds, rescheduling, and enrolment changes should follow the officially published Zentel Insight policy when
          available. Until then, learners should confirm the current conditions before payment by contacting{" "}
          <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>.
        </p>

        <h2>Intellectual Property</h2>
        <p>
          Website content, programme materials, brand elements, and learning resources belong to Zentel Insight or their
          respective owners. You may not copy, resell, or redistribute materials without permission.
        </p>

        <h2>Third-Party Services</h2>
        <p>
          The website may use Paystack for payment processing and may link to an approved Facebook community. External
          services have their own terms, privacy policies, and availability.
        </p>

        <h2>Limitation of Liability</h2>
        <p>
          Zentel Insight provides the website and information in good faith, but does not guarantee uninterrupted
          availability, error-free content, or specific career, income, or academic outcomes.
        </p>

        <h2>Updates</h2>
        <p>
          These terms may be updated as the platform, programme structure, payment verification, and account services
          evolve.
        </p>
      </div>
    </section>
  );
}
