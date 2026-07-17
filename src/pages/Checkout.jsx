import BrandLogo from "../components/BrandLogo";
import PaymentForm from "../components/payment/PaymentForm";
import { getProgramBySlug, getProgramLevel } from "../data/programs";
import { usePageMeta } from "../utils/usePageMeta";
import { useParams } from "react-router-dom";

export default function Checkout() {
  const { programSlug, trackSlug } = useParams();
  const program = getProgramBySlug(programSlug);
  const selected = getProgramLevel(programSlug, trackSlug);
  const heading = selected ? `Pay for ${selected.program.title}.` : program ? "Track Not Found" : "Program Not Found";

  usePageMeta({
    path: `/checkout/${programSlug || ""}/${trackSlug || ""}`,
    title: selected ? `Checkout - ${selected.program.title}` : "Checkout",
    description: "Public Zentel Insight course checkout with trusted catalogue pricing.",
    robots: "noindex,nofollow"
  });

  return (
    <section className="page-section checkout-section visual-section payment-visual-section">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container payment-layout visual-section__content">
        <div>
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <p className="eyebrow">Course checkout</p>
          <h1>{heading}</h1>
          <p>
            Course checkout is public. You can pay without creating an account, then create a student account later
            with the same email address to claim verified course access.
          </p>
        </div>
        <PaymentForm initialProgramSlug={programSlug} initialLevelSlug={trackSlug} lockedSelection />
      </div>
    </section>
  );
}
