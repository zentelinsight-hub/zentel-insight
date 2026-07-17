import { useRef, useState } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginWithEmail, signupWithEmail } from "../../services/authService";
import { isValidEmail } from "../../utils/format";
import { safeRedirectPath } from "../../utils/paymentCalculations";

export default function AuthForm({ mode }) {
  const isSignup = mode === "signup";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [values, setValues] = useState({
    fullName: "",
    dateOfBirth: "",
    email: searchParams.get("email") || "",
    phone: "",
    address: "",
    password: "",
    confirmPassword: "",
    agree: false
  });
  const [errors, setErrors] = useState({});
  const submittingRef = useRef(false);

  function updateField(event) {
    const { name, value, checked, type } = event.target;
    setValues((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  }

  function validate() {
    const nextErrors = {};
    if (isSignup && values.fullName.trim().length < 2) nextErrors.fullName = "Enter your full name.";
    if (isSignup && !values.dateOfBirth) nextErrors.dateOfBirth = "Enter your date of birth.";
    if (!isValidEmail(values.email)) nextErrors.email = "Enter a valid email address.";
    if (isSignup && values.phone.trim().length < 7) nextErrors.phone = "Enter a valid phone number.";
    if (isSignup && values.address.trim().length < 8) nextErrors.address = "Enter a clear residential address.";
    if (values.password.length < 8) nextErrors.password = "Use at least 8 characters.";
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
      const result = isSignup ? await signupWithEmail(values) : await loginWithEmail(values);
      setStatus({ type: result.ok ? "success" : "warning", message: result.message });
      if (result.ok && isSignup) {
        navigated = true;
        navigate(`/verify-email?email=${encodeURIComponent(values.email.trim().toLowerCase())}`);
      }
      if (result.ok && !isSignup) {
        navigated = true;
        navigate(safeRedirectPath(searchParams.get("redirect")));
      }
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Account request failed. Please try again." });
    } finally {
      submittingRef.current = false;
      if (!navigated) {
        setLoading(false);
      }
    }
  }

  return (
    <form className="form-card auth-card" onSubmit={handleSubmit} noValidate>
      {isSignup ? (
        <div className="form-grid">
          <label>
            <span>Full name</span>
            <input
              type="text"
              name="fullName"
              autoComplete="name"
              value={values.fullName}
              onChange={updateField}
              required
            />
            {errors.fullName ? <small>{errors.fullName}</small> : null}
          </label>
          <label>
            <span>Date of birth</span>
            <input
              type="date"
              name="dateOfBirth"
              autoComplete="bday"
              value={values.dateOfBirth}
              onChange={updateField}
              required
            />
            {errors.dateOfBirth ? <small>{errors.dateOfBirth}</small> : null}
          </label>
        </div>
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
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              value={values.phone}
              onChange={updateField}
              required
            />
            {errors.phone ? <small>{errors.phone}</small> : null}
          </label>
          <label>
            <span>Residential address</span>
            <input
              type="text"
              name="address"
              autoComplete="street-address"
              value={values.address}
              onChange={updateField}
              required
            />
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
          <button
            className="inline-icon-button"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((current) => !current)}
          >
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
      {status.message ? <div className={`form-status ${status.type}`}>{status.message}</div> : null}
      <button className="button button-primary" type="submit" disabled={loading}>
        {loading ? (isSignup ? "Creating Account" : "Signing In") : isSignup ? "Create Account" : "Log In"}
      </button>
      <p className="auth-switch">
        {isSignup ? "Already have an account?" : "New to Zentel Insight?"}{" "}
        <Link to={isSignup ? "/login" : "/signup"}>{isSignup ? "Log in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
