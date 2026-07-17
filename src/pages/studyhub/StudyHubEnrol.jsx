import { useMemo, useRef, useState } from "react";
import { CreditCard, Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo";
import { siteConfig } from "../../data/site";
import { studyHubPricing } from "../../data/programs";
import { startPaystackPayment } from "../../services/paymentService";
import { calculateStudyHubPrice, nairaToKobo, STUDYHUB_PAYMENT_TYPE } from "../../utils/paymentCalculations";
import { formatCurrency, isValidEmail } from "../../utils/format";
import { usePageMeta } from "../../utils/usePageMeta";
import { StudyHubHero } from "./StudyHubShared";

const classOptions = [...studyHubPricing.JSS.classes, ...studyHubPricing.SSS.classes];

function getClassGroup(classLevel) {
  return classLevel?.startsWith("SSS") ? "SSS" : "JSS";
}

export default function StudyHubEnrol({ programme = "" }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSummerLessons = programme === "summer-lessons" || searchParams.get("programme") === "summer-lessons";
  const [classLevel, setClassLevel] = useState("JSS1");
  const [selectedSubjects, setSelectedSubjects] = useState(["Mathematics"]);
  const [months, setMonths] = useState(1);
  const [form, setForm] = useState({ studentName: "", parentName: "", email: "", phone: "", learningPriority: "" });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const paymentOpeningRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  const classGroup = getClassGroup(classLevel);
  const pricing = studyHubPricing[classGroup];
  const total = useMemo(() => {
    if (isSummerLessons) return studyHubPricing.summerLessons.price;
    return calculateStudyHubPrice(classGroup, selectedSubjects.length, months);
  }, [classGroup, isSummerLessons, selectedSubjects.length, months]);

  usePageMeta({
    path: isSummerLessons ? "/studyhub/enrol/summer-lessons" : "/studyhub/enrol",
    title: isSummerLessons ? "Enrol in Summer Lessons | Zentel Insight StudyHub" : "Enrol in StudyHub | Zentel Insight StudyHub",
    description: isSummerLessons
      ? "Complete Summer Lessons enrolment with a one-time 30000 naira StudyHub payment."
      : "Complete the public StudyHub enrolment form and calculate payment.",
    favicon: siteConfig.studyHub.favicon,
    image: `${siteConfig.domain}${siteConfig.studyHub.ogImage}`,
    robots: "noindex,nofollow"
  });

  function updateClass(nextClass) {
    const nextGroup = getClassGroup(nextClass);
    setClassLevel(nextClass);
    setSelectedSubjects([studyHubPricing[nextGroup].subjects[0]]);
  }

  function toggleSubject(subject) {
    setSelectedSubjects((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject]
    );
  }

  function validate() {
    if (!classLevel) return "Select a class.";
    if (!isSummerLessons && !selectedSubjects.length) return "Select at least one subject.";
    if (!isSummerLessons && (!Number.isInteger(months) || months < 1 || months > 12)) return "Select between 1 and 12 months.";
    if (form.studentName.trim().length < 2) return "Enter the student's name.";
    if (form.parentName.trim().length < 2) return "Enter the parent or guardian name.";
    if (!isValidEmail(form.email)) return "Enter a valid email address.";
    if (form.phone.trim().length < 7) return "Enter a valid phone number.";
    return "";
  }

  async function handlePayment(event) {
    event.preventDefault();
    if (paymentOpeningRef.current) return;
    setStatus("");
    const error = validate();
    if (error) {
      setStatus(error);
      return;
    }

    setLoading(true);
    paymentOpeningRef.current = true;
    hasNavigatedRef.current = false;
    const productTitle = isSummerLessons ? "Summer Lessons" : `${siteConfig.studyHub.name} - ${classLevel}`;
    const item = {
      paymentType: STUDYHUB_PAYMENT_TYPE,
      slug: isSummerLessons ? "studyhub-summer-lessons" : "studyhub-registration",
      title: productTitle,
      price: total,
      priceKobo: isSummerLessons ? studyHubPricing.summerLessons.priceKobo : nairaToKobo(total),
      studyHub: {
        productType: isSummerLessons ? "studyhub_summer_lessons" : "studyhub_registration",
        classLevel,
        classGroup,
        subjects: isSummerLessons ? [] : selectedSubjects,
        months: isSummerLessons ? 1 : months,
        learningPriority: form.learningPriority
      }
    };

    try {
      await startPaystackPayment({
        item,
        customer: {
          name: form.parentName,
          email: form.email,
          phone: form.phone,
          parentName: form.parentName,
          studentName: form.studentName
        },
        onCancel: (message, transaction) => {
          paymentOpeningRef.current = false;
          setStatus(message);
          setLoading(false);
          if (transaction && !hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            const params = new URLSearchParams({
              reference: transaction.reference
            });
            navigate(`/studyhub/payment-cancelled?${params.toString()}`);
          }
        },
        onError: (paymentError, transaction) => {
          paymentOpeningRef.current = false;
          setLoading(false);
          setStatus(
            transaction?.reference
              ? `${paymentError.message} Reference: ${transaction.reference}`
              : paymentError.message
          );
        },
        onSuccess: (transaction) => {
          if (hasNavigatedRef.current) return;
          hasNavigatedRef.current = true;
          const params = new URLSearchParams({
            reference: transaction.reference
          });
          navigate(`/studyhub/payment-status?${params.toString()}`);
        }
      });
      setStatus("Paystack checkout opened. Complete or cancel the popup to continue.");
    } catch (paymentError) {
      paymentOpeningRef.current = false;
      setStatus(
        paymentError.paymentReference
          ? `${paymentError.message} Reference: ${paymentError.paymentReference}`
          : paymentError.message
      );
      setLoading(false);
    }
  }

  return (
    <>
      <StudyHubHero
        eyebrow="Enrol Now"
        title={isSummerLessons ? "Enrol for Summer Lessons." : "Calculate StudyHub payment and continue securely."}
        body={
          isSummerLessons
            ? "Complete learner and guardian details for one month of Summer Lessons at a flat one-time price."
            : "Complete the learner and parent details, select class, subjects and months, then review the total before Paystack opens."
        }
        background="studyhub-enrol"
      />

      <section className="page-section alt visual-section studyhub-payment-section">
        <div className="visual-section__background" aria-hidden="true" />
        <div className="visual-section__overlay" aria-hidden="true" />
        <div className="container payment-layout visual-section__content">
          <div>
            <p className="eyebrow">StudyHub checkout</p>
            <h2>Public enrolment form.</h2>
            <p>
              {isSummerLessons
                ? "Summer Lessons uses a fixed one-time price for one complete month. It is not multiplied by subjects or months."
                : "StudyHub enrolment is public. The displayed total is calculated from class, subjects and months; the payment service still verifies successful payments before activation."}
            </p>
          </div>
          <form className="form-card" onSubmit={handlePayment}>
            <BrandLogo brand="studyhub" className="form-brand-logo" size="footer" />
            <div className="form-grid">
              <label>
                <span>Student name</span>
                <input value={form.studentName} onChange={(event) => setForm({ ...form, studentName: event.target.value })} required />
              </label>
              <label>
                <span>Parent or guardian name</span>
                <input value={form.parentName} onChange={(event) => setForm({ ...form, parentName: event.target.value })} required />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              </label>
              <label>
                <span>Phone number</span>
                <input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
              </label>
              <label>
                <span>Class</span>
                <select value={classLevel} onChange={(event) => updateClass(event.target.value)}>
                  {classOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              {isSummerLessons ? (
                <label>
                  <span>Learning priority, optional</span>
                  <input value={form.learningPriority} onChange={(event) => setForm({ ...form, learningPriority: event.target.value })} />
                </label>
              ) : (
                <label>
                  <span>Number of months</span>
                  <input type="number" min="1" max="12" value={months} onChange={(event) => setMonths(Math.min(12, Math.max(1, Number(event.target.value) || 1)))} />
                </label>
              )}
            </div>

            {isSummerLessons ? null : (
              <fieldset className="subject-selector">
                <legend>Subjects</legend>
                {pricing.subjects.map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    className={selectedSubjects.includes(subject) ? "subject-toggle active" : "subject-toggle"}
                    aria-pressed={selectedSubjects.includes(subject)}
                    onClick={() => toggleSubject(subject)}
                  >
                    <Check size={16} aria-hidden="true" />
                    <span>{subject}</span>
                  </button>
                ))}
              </fieldset>
            )}

            <div className="calculation-card" aria-live="polite">
              <div><span>Programme</span><strong>{isSummerLessons ? "Summer Lessons" : "Subject support"}</strong></div>
              <div><span>Class</span><strong>{classLevel}</strong></div>
              {isSummerLessons ? (
                <>
                  <div><span>Duration</span><strong>One month</strong></div>
                  <div><span>Payment type</span><strong>One-time payment</strong></div>
                </>
              ) : (
                <>
                  <div><span>Selected subjects</span><strong>{selectedSubjects.join(", ") || "None selected"}</strong></div>
                  <div><span>Price per subject</span><strong>{formatCurrency(pricing.pricePerSubjectPerMonth)}</strong></div>
                  <div><span>Months</span><strong>{months}</strong></div>
                </>
              )}
              <div className="total"><span>Total</span><strong>{formatCurrency(total)}</strong></div>
            </div>

            {status ? <div className="form-status warning">{status}</div> : null}
            <button className="button button-primary" type="submit" disabled={loading}>
              {loading ? "Opening Paystack" : "Pay with Paystack"}
              <CreditCard size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
