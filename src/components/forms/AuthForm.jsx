import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Lock, Mail, Send } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginWithEmail, resendSignupConfirmation, signupWithEmail } from "../../services/authService";
import { isValidEmail } from "../../utils/format";
import { safeRedirectPath } from "../../utils/paymentCalculations";

const checkEmailMessage =
  "Your Zentel Insight account has been created. Open the verification email we sent to you and click Verify Email before signing in.";

function hasStrongPassword(value) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export default function AuthForm({ mode }) {
  const isSignup = mode === "signup";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [showCheckEmailModal, setShowCheckEmailModal] = useState(false);
  const [resendEmail, setResendEmail] = useState(searchParams.get("email") || "");
  const [resendStatus, setResendStatus] = useState({ type: "", message: "" });
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [values, setValues] = useState({
    fullName: "",
    dateOfBirth: "",
    educationLevel: "",
    email: searchParams.get("email") || "",
    phone: "",
    address: "",
    password: "",
    confirmPassword: "",
    agree: false
  });
  const [errors, setErrors] = useState({});
  const submittingRef = useRef(false);
  const resendRef = useRef(false);
  const modalTimerRef = useRef(null);
  const cooldownTimerRef = useRef(null);
  const modalRef = useRef(null);
  const primaryModalButtonRef = useRef(null);
  const returnTo = safeRedirectPath(searchParams.get("returnTo") || searchParams.get("redirect"));
  const notice = searchParams.get("notice");

  useEffect(() => {
    if (!showCheckEmailModal) return undefined;
    primaryModalButtonRef.current?.focus();
    modalTimerRef.current = window.setTimeout(() => {
      navigate("/login?notice=verify-email", { replace: true });
    }, 3000);

    function handleKeyDown(event) {
      if (event.key !== "Tab") return;
      const focusable = modalRef.current?.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(modalTimerRef.current);
    };
  }, [navigate, showCheckEmailModal]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    cooldownTimerRef.current = window.setTimeout(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(cooldownTimerRef.current);
  }, [cooldown]);

  useEffect(() => () => {
    window.clearTimeout(modalTimerRef.current);
    window.clearTimeout(cooldownTimerRef.current);
  }, []);

  function updateField(event) {
    const { name, value, checked, type } = event.target;
    setValues((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  }

  function validate() {
    const nextErrors = {};
    const birthDate = values.dateOfBirth ? new Date(values.dateOfBirth) : null;
    if (isSignup && values.fullName.trim().length < 2) nextErrors.fullName = "Enter your full name.";
    if (isSignup && (!birthDate || Number.isNaN(birthDate.getTime()) || birthDate > new Date())) {
      nextErrors.dateOfBirth = "Enter a valid date of birth.";
    }
    if (isSignup && !values.educationLevel.trim()) nextErrors.educationLevel = "Select your level of education.";
    if (!isValidEmail(values.email)) nextErrors.email = "Enter a valid email address.";
    if (isSignup && !/^[+\d][\d\s-]{6,}$/.test(values.phone.trim())) nextErrors.phone = "Enter a valid phone number.";
    if (isSignup && values.address.trim().length < 8) nextErrors.address = "Enter a clear residential address.";
    if (!hasStrongPassword(values.password)) nextErrors.password = "Use at least 8 characters with letters and numbers.";
    if (isSignup && values.password !== values.confirmPassword) {
      nextErrors.confirmPassword = "Passwords must match.";
    }
    if (isSignup && !values.agree) {
      nextErrors.agree = "Accept the privacy policy and terms to continue.";
    }
    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    setStatus({ type: "", message: "" });
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    submittingRef.current = true;
    setLoading(true);
    let navigated = false;
    try {
      const payload = { ...values, email: normalizeEmail(values.email) };
      const result = isSignup ? await signupWithEmail(payload) : await loginWithEmail(payload);
      setStatus({ type: result.ok ? "success" : "warning", message: result.message });
      if (result.ok && isSignup) {
        setShowCheckEmailModal(true);
        return;
      }
      if (result.ok && !isSignup) {
        navigated = true;
        navigate(returnTo, { replace: true });
      }
      if (!result.ok && result.unverified) {
        setResendEmail(payload.email);
      }
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Account request failed. Please try again." });
    } finally {
      submittingRef.current = false;
      if (!navigated && !showCheckEmailModal) {
        setLoading(false);
      }
    }
  }

  async function handleResend(event) {
    event.preventDefault();
    if (resendRef.current || cooldown > 0) return;
    const email = normalizeEmail(resendEmail || values.email);
    if (!isValidEmail(email)) {
      setResendStatus({ type: "warning", message: "Enter the email address used for your account." });
      return;
    }
    resendRef.current = true;
    setResendLoading(true);
    setResendStatus({ type: "", message: "" });
    try {
      const result = await resendSignupConfirmation(email);
      setResendStatus({ type: result.ok ? "success" : "warning", message: result.message });
      if (result.ok) setCooldown(60);
    } catch (error) {
      setResendStatus({ type: "warning", message: error.message || "A new verification email could not be requested." });
    } finally {
      resendRef.current = false;
      setResendLoading(false);
    }
  }

  return (
    <>
      <form className="form-card auth-card" onSubmit={handleSubmit} noValidate>
        {!isSignup && notice === "verify-email" ? (
          <div className="form-status warning" role="status">
            Check your email and click the verification link before signing in.
          </div>
        ) : null}
        {!isSignup && searchParams.get("verified") === "1" ? (
          <div className="form-status success" role="status">
            Email verified. Sign in with your email and password to open your student portal.
          </div>
        ) : null}

        {isSignup ? (
          <>
            <div className="form-grid">
              <label>
                <span>Full name</span>
                <input type="text" name="fullName" autoComplete="name" value={values.fullName} onChange={updateField} required />
                {errors.fullName ? <small>{errors.fullName}</small> : null}
              </label>
              <label>
                <span>Date of birth</span>
                <input type="date" name="dateOfBirth" autoComplete="bday" value={values.dateOfBirth} onChange={updateField} required />
                {errors.dateOfBirth ? <small>{errors.dateOfBirth}</small> : null}
              </label>
            </div>
            <label>
              <span>Level of education</span>
              <select name="educationLevel" value={values.educationLevel} onChange={updateField} required>
                <option value="">Select level</option>
                <option value="Junior Secondary School">Junior Secondary School</option>
                <option value="Senior Secondary School">Senior Secondary School</option>
                <option value="Undergraduate">Undergraduate</option>
                <option value="Graduate">Graduate</option>
                <option value="Working Professional">Working Professional</option>
                <option value="Other">Other</option>
              </select>
              {errors.educationLevel ? <small>{errors.educationLevel}</small> : null}
            </label>
          </>
        ) : null}

        <label>
          <span>Email address</span>
          <span className="input-with-icon">
            <Mail size={18} aria-hidden="true" />
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={values.email}
              onChange={updateField}
              required
              aria-describedby={errors.email ? "auth-email-error" : undefined}
            />
          </span>
          {errors.email ? <small id="auth-email-error">{errors.email}</small> : null}
        </label>

        {isSignup ? (
          <div className="form-grid">
            <label>
              <span>Phone number</span>
              <input type="tel" name="phone" autoComplete="tel" value={values.phone} onChange={updateField} required />
              {errors.phone ? <small>{errors.phone}</small> : null}
            </label>
            <label>
              <span>Residential address</span>
              <input type="text" name="address" autoComplete="street-address" value={values.address} onChange={updateField} required />
              {errors.address ? <small>{errors.address}</small> : null}
            </label>
          </div>
        ) : null}

        <label>
          <span>Password</span>
          <span className="input-with-icon">
            <Lock size={18} aria-hidden="true" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={values.password}
              onChange={updateField}
              required
              aria-describedby={errors.password ? "auth-password-error" : undefined}
            />
            <button className="inline-icon-button" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </span>
          {errors.password ? <small id="auth-password-error">{errors.password}</small> : null}
        </label>

        {isSignup ? (
          <>
            <label>
              <span>Confirm password</span>
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={updateField}
                required
                aria-describedby={errors.confirmPassword ? "auth-confirm-error" : undefined}
              />
              {errors.confirmPassword ? <small id="auth-confirm-error">{errors.confirmPassword}</small> : null}
            </label>
            <label className="checkbox-row">
              <input type="checkbox" name="agree" checked={values.agree} onChange={updateField} required />
              <span>
                I agree to the <Link to="/privacy-policy">Privacy Policy</Link> and{" "}
                <Link to="/terms-and-conditions">Terms and Conditions</Link>.
              </span>
            </label>
            {errors.agree ? <small>{errors.agree}</small> : null}
          </>
        ) : null}

        {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
        <button className="button button-primary" type="submit" disabled={loading}>
          {loading ? (isSignup ? "Creating Account" : "Signing In") : isSignup ? "Create Account" : "Log In"}
        </button>
        <p className="auth-switch">
          {isSignup ? "Already have an account?" : "New to Zentel Insight?"}{" "}
          <Link to={isSignup ? "/login" : "/signup"}>{isSignup ? "Log in" : "Create an account"}</Link>
        </p>
      </form>

      {!isSignup ? (
        <form className="form-card auth-card verification-resend-card" onSubmit={handleResend} noValidate>
          <div>
            <p className="eyebrow">Verification email</p>
            <h2>Need a new verification link?</h2>
            <p>Enter the email address used for signup and we will send a fresh confirmation link when an unverified account exists.</p>
          </div>
          <label>
            <span>Email address</span>
            <input type="email" value={resendEmail} onChange={(event) => setResendEmail(event.target.value)} autoComplete="email" />
          </label>
          {resendStatus.message ? <div className={`form-status ${resendStatus.type}`} role="status">{resendStatus.message}</div> : null}
          <button className="button button-secondary" type="submit" disabled={resendLoading || cooldown > 0}>
            {cooldown > 0 ? `Try again in ${cooldown}s` : resendLoading ? "Sending" : "Resend verification email"}
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      ) : null}

      {showCheckEmailModal ? (
        <div className="modal-backdrop" role="presentation">
          <div className="auth-success-modal" role="dialog" aria-modal="true" aria-labelledby="check-email-title" aria-describedby="check-email-copy" ref={modalRef}>
            <CheckCircle2 size={42} aria-hidden="true" />
            <div>
              <h2 id="check-email-title">Check your email</h2>
              <p id="check-email-copy">{checkEmailMessage}</p>
              <p>Check your Inbox, Spam or Promotions folder if you do not see the message.</p>
            </div>
            <button ref={primaryModalButtonRef} className="button button-primary" type="button" onClick={() => navigate("/login?notice=verify-email", { replace: true })}>
              Continue to Login
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
