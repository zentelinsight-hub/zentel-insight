import BrandLogo from "../components/BrandLogo";
import PaymentForm from "../components/payment/PaymentForm";
import { useCheckoutProgram } from "../hooks/usePublicCatalog";
import { usePageMeta } from "../utils/usePageMeta";
import { useParams } from "react-router-dom";
import { slugifyProgramValue } from "../data/programs";

export default function Checkout() {
  const { programSlug, trackSlug } = useParams();
  const programQuery = useCheckoutProgram(programSlug);
  const program = programQuery.data;
  const selectedLevel = program?.levels.find((level) => level.slug === slugifyProgramValue(trackSlug) || slugifyProgramValue(level.name) === slugifyProgramValue(trackSlug));
  const heading = programQuery.loading
    ? "Secure Checkout"
    : selectedLevel
      ? `Pay for ${program.title}.`
      : program
        ? "Track Not Found"
        : "Program Not Found";

  usePageMeta({
    path: `/checkout/${programSlug || ""}/${trackSlug || ""}`,
    title: selectedLevel ? `Checkout - ${program.title}` : "Checkout",
    description: "Public Zentel Insight course checkout with trusted catalogue pricing.",
    robots: "noindex,nofollow"
  });

  return (
    <section className="page-section checkout-section visual-section payment-visual-section">
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
        {programQuery.loading ? <div className="notice-card checkout-catalog-state">Loading current programme price</div> : null}
        {programQuery.error ? (
          <div className="notice-card checkout-catalog-state" role="alert">
            <h2>Checkout price could not be loaded</h2>
            <p>{programQuery.error}</p>
            <button className="button button-primary" type="button" onClick={programQuery.refetch}>Try Again</button>
          </div>
        ) : null}
        {!programQuery.loading && !programQuery.error ? (
          <PaymentForm
            initialProgramSlug={programSlug}
            initialLevelSlug={trackSlug}
            lockedSelection
            cataloguePrograms={program ? [program] : []}
          />
        ) : null}
      </div>
    </section>
  );
}
