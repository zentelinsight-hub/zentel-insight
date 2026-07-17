import { siteConfig } from "../data/site";
import { usePageMeta } from "../utils/usePageMeta";

export default function PrivacyPolicy() {
  usePageMeta({
    path: "/privacy-policy",
    title: "Privacy Policy",
    description:
      "Privacy Policy for Zentel Insight, covering contact information, account data, payments, local storage, and third-party services."
  });

  return (
    <section className="legal-page">
      <div className="container narrow">
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <p>
          This Privacy Policy explains how Zentel Insight handles information for visitors, learners, and community
          members using {siteConfig.domain}. It is written for an educational technology platform and should be reviewed
          by a qualified legal professional before formal publication.
        </p>

        <h2>Information We Collect</h2>
        <p>
          We may collect information you provide through contact forms, programme enquiries, account forms, payment
          flows, and other website interactions. This can include your name, email address, message content, selected
          programme, and payment reference details.
        </p>

        <h2>Contact Forms</h2>
        <p>
          Contact forms open WhatsApp with your completed message so you can review it before sending. The website does
          not claim that a message was delivered until you send it in WhatsApp.
        </p>

        <h2>Accounts</h2>
        <p>
          Login, signup, and email verification are handled through the authentication service. Service-role keys must
          never be exposed in frontend code.
        </p>

        <h2>Payments</h2>
        <p>
          Payments are processed through Paystack. Card data is entered into Paystack checkout and is not stored by this
          website. Zentel Insight may store non-sensitive payment details such as transaction reference, selected
          programme, amount, payer name, payer email, date, and verification state.
        </p>

        <h2>Cookies and Local Storage</h2>
        <p>
          The website may use local storage for preferences such as light or dark mode. Browser storage may also be used
          for safe payment callback display data where necessary.
        </p>

        <h2>Third-Party Services</h2>
        <p>
          The website may link to external services such as Paystack and the approved Facebook community. Third-party
          services are governed by their own terms and privacy practices.
        </p>

        <h2>Security</h2>
        <p>
          We use reasonable safeguards appropriate for a frontend website. No website can guarantee absolute security,
          and visitors should avoid sharing sensitive information through general enquiry fields.
        </p>

        <h2>Your Rights</h2>
        <p>
          Depending on applicable law, you may request access, correction, or deletion of personal information held by
          Zentel Insight. Contact <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a> for main
          programme enquiries or <a href={`mailto:${siteConfig.studyHub.email}`}>{siteConfig.studyHub.email}</a> for
          StudyHub enquiries.
        </p>

        <h2>Policy Updates</h2>
        <p>
          This policy may be updated as services, payment verification, authentication, or contact channels are
          updated. The latest version should be published on this page.
        </p>
      </div>
    </section>
  );
}
