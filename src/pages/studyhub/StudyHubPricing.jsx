import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator, Check } from "lucide-react";
import { studyHubPricing } from "../../data/programs";
import { siteConfig } from "../../data/site";
import { calculateStudyHubPrice } from "../../utils/paymentCalculations";
import { formatCurrency } from "../../utils/format";
import { usePageMeta } from "../../utils/usePageMeta";
import { StudyHubFaq, StudyHubHero } from "./StudyHubShared";

export default function StudyHubPricing() {
  const [classGroup, setClassGroup] = useState("JSS");
  const [subjectCount, setSubjectCount] = useState(1);
  const [months, setMonths] = useState(1);
  const pricing = studyHubPricing[classGroup];
  const total = useMemo(() => calculateStudyHubPrice(classGroup, subjectCount, months), [classGroup, subjectCount, months]);

  usePageMeta({
    path: "/studyhub/pricing",
    title: "StudyHub Pricing | Zentel Insight StudyHub",
    description: "Calculate StudyHub monthly subject support pricing for JSS and SSS learners.",
    favicon: siteConfig.studyHub.favicon,
    image: `${siteConfig.domain}${siteConfig.studyHub.ogImage}`
  });

  return (
    <>
      <StudyHubHero
        eyebrow="Pricing"
        title="Simple monthly pricing by class and subject."
        body="The visible calculator explains the estimate. The backend remains authoritative for payment fulfilment."
        background="studyhub-pricing"
      />

      <section className="page-section">
        <div className="container payment-layout">
          <div>
            <p className="eyebrow">Price list</p>
            <h2>What the payment covers.</h2>
            <div className="studyhub-price-summary">
              <article>
                <h3>JSS pricing</h3>
                <strong>{formatCurrency(studyHubPricing.JSS.pricePerSubjectPerMonth)}</strong>
                <p>per subject per month for JSS1, JSS2 and JSS3.</p>
              </article>
              <article>
                <h3>SSS pricing</h3>
                <strong>{formatCurrency(studyHubPricing.SSS.pricePerSubjectPerMonth)}</strong>
                <p>per subject per month for SSS1, SSS2 and SSS3.</p>
              </article>
              <article>
                <h3>Summer Lessons</h3>
                <strong>{formatCurrency(studyHubPricing.summerLessons.price)}</strong>
                <p>one-time payment for one complete month. It is not charged per subject.</p>
              </article>
            </div>
            <div className="feature-list">
              {["Online academic support", "Subject-focused revision", "Parent or guardian contact capture"].map((item) => (
                <article className="feature-row" key={item}>
                  <Check size={22} aria-hidden="true" />
                  <div>
                    <h3>{item}</h3>
                    <p>Included as part of the monthly support structure.</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="form-card">
            <Calculator size={24} aria-hidden="true" />
            <h2>Interactive calculator</h2>
            <p>total = class price x selected subjects x number of months</p>
            <div className="form-grid">
              <label>
                <span>Class group</span>
                <select value={classGroup} onChange={(event) => setClassGroup(event.target.value)}>
                  <option value="JSS">JSS</option>
                  <option value="SSS">SSS</option>
                </select>
              </label>
              <label>
                <span>Subjects</span>
                <input min="1" max={pricing.subjects.length} type="number" value={subjectCount} onChange={(event) => setSubjectCount(Math.min(pricing.subjects.length, Math.max(1, Number(event.target.value) || 1)))} />
              </label>
              <label>
                <span>Months</span>
                <input min="1" max="12" type="number" value={months} onChange={(event) => setMonths(Math.min(12, Math.max(1, Number(event.target.value) || 1)))} />
              </label>
            </div>
            <div className="calculation-card">
              <div><span>Class price</span><strong>{formatCurrency(pricing.pricePerSubjectPerMonth)}</strong></div>
              <div><span>Subjects</span><strong>{subjectCount}</strong></div>
              <div><span>Months</span><strong>{months}</strong></div>
              <div className="total"><span>Total</span><strong>{formatCurrency(total)}</strong></div>
            </div>
            <p>Example: {classGroup} with {subjectCount} subject(s) for {months} month(s) costs {formatCurrency(total)}.</p>
            <Link className="button button-primary" to="/studyhub/enrol">Enrol Now</Link>
            <Link className="button button-secondary" to="/studyhub/enrol/summer-lessons">Enrol in Summer Lessons</Link>
          </aside>
        </div>
      </section>

      <section className="page-section alt">
        <div className="container">
          <p className="eyebrow">FAQ</p>
          <h2>Pricing questions.</h2>
          <StudyHubFaq />
        </div>
      </section>
    </>
  );
}
