import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/authHooks";
import { getProgramBySlug, getProgramLevel, programs } from "../../data/programs";
import { formatCurrency, isValidEmail } from "../../utils/format";
import { resolveCourseCheckout } from "../../utils/paymentCalculations";
import { startPaystackPayment } from "../../services/paymentService";

function buildReferenceParams(transaction) {
  return new URLSearchParams({
    reference: transaction.reference || ""
  });
}

export default function PaymentForm({ initialProgramSlug, initialLevelSlug, lockedSelection = false }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const startingProgramSlug = initialProgramSlug || searchParams.get("program") || (lockedSelection ? "" : programs[0]?.slug || "");
  const defaultProgram = getProgramBySlug(startingProgramSlug);
  const startingLevelSlug = initialLevelSlug || searchParams.get("level") || defaultProgram?.levels?.[0]?.slug || "";
  const [programSlug, setProgramSlug] = useState(startingProgramSlug);
  const [levelSlug, setLevelSlug] = useState(startingLevelSlug);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });
  const [paymentState, setPaymentState] = useState("idle");
  const paymentOpeningRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  const selectedProgram = useMemo(() => getProgramBySlug(programSlug), [programSlug]);
  const selected = useMemo(() => getProgramLevel(programSlug, levelSlug), [programSlug, levelSlug]);
  const loading = ["creating_session", "opening", "verifying"].includes(paymentState);

  useEffect(() => {
    setCustomer((current) => ({
      name: current.name || profile?.full_name || "",
      email: current.email || user?.email || profile?.email || "",
      phone: current.phone || profile?.phone || ""
    }));
  }, [profile?.email, profile?.full_name, profile?.phone, user?.email]);

  useEffect(() => {
    return () => {
      paymentOpeningRef.current = false;
      hasNavigatedRef.current = false;
    };
  }, []);

  function updateProgram(nextSlug) {
    const nextProgram = getProgramBySlug(nextSlug);
    setProgramSlug(nextSlug);
    setLevelSlug(nextProgram?.levels?.[0]?.slug || "");
  }

  function updateCustomer(field, value) {
    setCustomer((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function validate() {
    const nextErrors = {};
    if (!selectedProgram) nextErrors.program = "Select a valid programme.";
    if (!selected) nextErrors.level = "Select a valid programme level.";
    if (customer.name.trim().length < 2) nextErrors.name = "Enter the payer's full name.";
    if (!isValidEmail(customer.email)) nextErrors.email = "Enter a valid email address.";
    if (customer.phone.trim().length < 7) nextErrors.phone = "Enter a valid phone number.";
    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading || paymentOpeningRef.current) return;

    setStatus({ type: "", message: "" });
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !selected) return;

    paymentOpeningRef.current = true;
    hasNavigatedRef.current = false;
    setPaymentState("creating_session");
    const item = resolveCourseCheckout(selected.program.slug, selected.level.slug);

    try {
      await startPaystackPayment({
        item,
        customer,
        onCancel: (message, transaction) => {
          paymentOpeningRef.current = false;
          setPaymentState("cancelled");
          setStatus({ type: "warning", message });
          if (transaction && !hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            navigate(`/payment-cancelled?${buildReferenceParams(transaction).toString()}`);
          }
        },
        onError: (paymentError, transaction) => {
          paymentOpeningRef.current = false;
          setPaymentState("failed");
          setStatus({
            type: "error",
            message: transaction?.reference
              ? `${paymentError.message} Reference: ${transaction.reference}`
              : paymentError.message
          });
        },
        onSuccess: (transaction) => {
          if (hasNavigatedRef.current) return;
          hasNavigatedRef.current = true;
          setPaymentState("verifying");
          navigate(`/payment-status?${buildReferenceParams(transaction).toString()}`);
        }
      });
      setPaymentState((current) => (current === "creating_session" ? "opening" : current));
      setStatus({ type: "success", message: "Paystack checkout opened. Complete or cancel the popup to continue." });
    } catch (error) {
      paymentOpeningRef.current = false;
      setPaymentState("failed");
      setStatus({
        type: "error",
        message: error.paymentReference
          ? `${error.message} Reference: ${error.paymentReference}`
          : error.message || "Payment could not be started."
      });
    }
  }

  if (!selectedProgram) {
    return (
      <div className="notice-card">
        <h2>Program Not Found</h2>
        <p>The selected programme could not be found. Choose a valid course before payment.</p>
        <Link className="button button-primary" to="/programs">
          Return to Programs
        </Link>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="notice-card">
        <h2>Track Not Found</h2>
        <p>The selected track is not available for this course. Choose a valid track before payment.</p>
        <Link className="button button-primary" to={`/programs/${selectedProgram.slug}`}>
          Return to Programme
        </Link>
      </div>
    );
  }

  return (
    <form className="form-card payment-form" onSubmit={handleSubmit} noValidate>
      <div className="payment-summary">
        <span className="program-icon" aria-hidden="true">
          <ShieldCheck size={24} />
        </span>
        <div>
          <h2>{selected.program.title}</h2>
          <p>{selected.program.shortDescription}</p>
        </div>
      </div>

      {lockedSelection ? (
        <div className="checkout-selection-summary">
          <div>
            <span>Selected track</span>
            <strong>{selected.level.name}</strong>
          </div>
          <div>
            <span>Trusted course price</span>
            <strong>{formatCurrency(selected.level.price)}</strong>
          </div>
          <div>
            <span>Track description</span>
            <strong>{selected.level.summary}</strong>
          </div>
        </div>
      ) : (
        <div className="form-grid">
          <label>
            <span>Programme</span>
            <select value={programSlug} onChange={(event) => updateProgram(event.target.value)} required>
              {programs.map((program) => (
                <option key={program.slug} value={program.slug}>
                  {program.title}
                </option>
              ))}
            </select>
            {errors.program ? <small>{errors.program}</small> : null}
          </label>
          <label>
            <span>Track</span>
            <select value={levelSlug} onChange={(event) => setLevelSlug(event.target.value)} required>
              {selectedProgram.levels.map((level) => (
                <option key={level.slug} value={level.slug}>
                  {level.name} - {formatCurrency(level.price)}
                </option>
              ))}
            </select>
            {errors.level ? <small>{errors.level}</small> : null}
          </label>
        </div>
      )}

      <div className="form-grid">
        <label>
          <span>Full name</span>
          <input
            type="text"
            autoComplete="name"
            value={customer.name}
            onChange={(event) => updateCustomer("name", event.target.value)}
            required
          />
          {errors.name ? <small>{errors.name}</small> : null}
        </label>
        <label>
          <span>Email address</span>
          <input
            type="email"
            autoComplete="email"
            value={customer.email}
            onChange={(event) => updateCustomer("email", event.target.value)}
            required
          />
          {errors.email ? <small>{errors.email}</small> : null}
        </label>
      </div>

      <label>
        <span>Phone number</span>
        <input
          type="tel"
          autoComplete="tel"
          value={customer.phone}
          onChange={(event) => updateCustomer("phone", event.target.value)}
          required
        />
        {errors.phone ? <small>{errors.phone}</small> : null}
      </label>

      <div className="calculation-card" aria-live="polite">
        <div><span>Course</span><strong>{selected.program.title}</strong></div>
        <div><span>Track</span><strong>{selected.level.name}</strong></div>
        <div><span>Payment type</span><strong>Zentel Insight course</strong></div>
        <div className="total"><span>Total payable</span><strong>{formatCurrency(selected.level.price)}</strong></div>
      </div>

      <p className="payment-notice">
        Card details are handled by Paystack. Your course access is activated only after server-side payment
        verification confirms a successful transaction.
      </p>

      {status.message ? <div className={`form-status ${status.type}`} aria-live="polite">{status.message}</div> : null}

      <div className="button-row">
        <Link className="button button-secondary" to={`/programs/${selectedProgram.slug}`}>
          Back to Programme
        </Link>
        <button className="button button-primary" type="submit" disabled={loading || !selected}>
          {loading ? "Opening Paystack" : "Pay with Paystack"}
          <CreditCard size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
