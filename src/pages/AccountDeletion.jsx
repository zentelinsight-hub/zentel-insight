import { Link } from "react-router-dom";
import { Mail, ShieldAlert, Trash2 } from "lucide-react";
import { siteConfig } from "../data/site";
import { usePageMeta } from "../utils/usePageMeta";

export default function AccountDeletion() {
  usePageMeta({
    title: "Account Deletion | Zentel Insight",
    description:
      "Learn how to request deletion of a Zentel Insight account and what happens to account data after deletion.",
    path: "/account-deletion"
  });

  return (
    <section className="page-section">
      <div className="container narrow">
        <div className="notice-card">
          <p className="eyebrow">Account privacy</p>
          <h1>Delete your Zentel Insight account</h1>
          <p>
            Zentel Insight account deletion is permanent. It removes your Supabase Auth account and deletes or detaches
            account-owned records according to the production database policies and retention obligations.
          </p>
        </div>

        <div className="value-grid compact">
          <article className="value-card">
            <Trash2 size={24} aria-hidden="true" />
            <h2>In the mobile app</h2>
            <p>
              Open Profile, Settings, Account, Delete Account. You will be asked to reauthenticate and type DELETE
              before the secure deletion request is sent.
            </p>
          </article>
          <article className="value-card">
            <Mail size={24} aria-hidden="true" />
            <h2>By support request</h2>
            <p>
              Email <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a> from your account
              email address with the subject Account deletion request.
            </p>
          </article>
          <article className="value-card">
            <ShieldAlert size={24} aria-hidden="true" />
            <h2>Before deletion</h2>
            <p>
              Download any information you need to keep. After deletion, access to the student portal and mobile app
              cannot be restored from the deleted account.
            </p>
          </article>
        </div>

        <div className="notice-card">
          <h2>What may remain</h2>
          <p>
            Some payment, compliance, support, security, or legal records may be retained where required for fraud
            prevention, accounting, dispute handling, or legal obligations. These records are not used to recreate app
            access after deletion.
          </p>
          <Link className="button button-primary" to="/contact">Contact support</Link>
        </div>
      </div>
    </section>
  );
}
