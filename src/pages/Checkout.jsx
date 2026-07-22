import BrandLogo from "../components/BrandLogo";
import PaymentForm from "../components/payment/PaymentForm";
import { usePublicProgram } from "../hooks/usePublicCatalog";
import { usePageMeta } from "../utils/usePageMeta";
import { useParams } from "react-router-dom";
import { getProgramBySlug, slugifyProgramValue } from "../data/programs";

export default function Checkout() {
  const { programSlug, trackSlug } = useParams();
  const programQuery = usePublicProgram(programSlug);
  const program = programQuery.data || getProgramBySlug(programSlug);
  const selectedLevel = program?.levels.find((level) => level.slug === slugifyProgramValue(trackSlug) || slugifyProgramValue(level.name) === slugifyProgramValue(trackSlug));
  const heading = selectedLevel ? `Pay for ${program.title}.` : program ? "Track Not Found" : "Program Not Found";

  usePageMeta({
    path: `/checkout/${programSlug || ""}/${trackSlug || ""}`,
    title: selectedLevel ? `Checkout - ${program.title}` : "Checkout",
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
