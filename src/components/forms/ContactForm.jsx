import { useState } from "react";
import { Send } from "lucide-react";
import { isValidEmail } from "../../utils/format";
import { buildWhatsAppUrl, formatMainContactMessage, formatStudyHubContactMessage } from "../../utils/whatsapp";

const initialState = {
  name: "",
  email: "",
  phone: "",
  studentClass: "",
  subject: "",
  message: ""
};

export default function ContactForm({ brand = "main" }) {
  const isStudyHub = brand === "studyhub";
  const [values, setValues] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  }

  function validate() {
    const nextErrors = {};
    if (!values.name.trim()) nextErrors.name = "Enter your full name.";
    if (!isValidEmail(values.email)) nextErrors.email = "Enter a valid email address.";
    if (values.phone.trim().length < 7) nextErrors.phone = "Enter a valid phone number.";
    if (!values.subject.trim()) nextErrors.subject = "Enter a message subject.";
    if (values.message.trim().length < 10) nextErrors.message = "Enter at least 10 characters.";
    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus({ type: "", message: "" });
    setFallbackUrl("");
    if (loading) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    try {
      const message = isStudyHub ? formatStudyHubContactMessage(values) : formatMainContactMessage(values);
      const whatsappUrl = buildWhatsAppUrl(message);
      const opened = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      if (opened) {
        opened.opener = null;
        setStatus({
          type: "success",
          message: "WhatsApp has been opened with your message. Review it and tap Send to complete your request."
        });
      } else {
        setFallbackUrl(whatsappUrl);
        setStatus({
          type: "warning",
          message: "Your browser blocked the WhatsApp tab. Use the Open WhatsApp button to continue."
        });
      }
    } catch (error) {
      setStatus({ type: "error", message: error.message || "WhatsApp could not be opened. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-card" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label>
          <span>Full name</span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            value={values.name}
            onChange={updateField}
            required
            aria-describedby={errors.name ? "contact-name-error" : undefined}
          />
          {errors.name ? <small id="contact-name-error">{errors.name}</small> : null}
        </label>
        <label>
          <span>Email address</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={values.email}
            onChange={updateField}
            required
            aria-describedby={errors.email ? "contact-email-error" : undefined}
          />
          {errors.email ? <small id="contact-email-error">{errors.email}</small> : null}
        </label>
      </div>
      <label>
        <span>Phone number</span>
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          value={values.phone}
          onChange={updateField}
          required
          aria-describedby={errors.phone ? "contact-phone-error" : undefined}
        />
        {errors.phone ? <small id="contact-phone-error">{errors.phone}</small> : null}
      </label>
      {isStudyHub ? (
        <label>
          <span>Student class, if supplied</span>
          <input
            type="text"
            name="studentClass"
            value={values.studentClass}
            onChange={updateField}
            placeholder="Example: JSS2 or SSS1"
          />
        </label>
      ) : null}
      <label>
        <span>Subject</span>
        <input
          type="text"
          name="subject"
          value={values.subject}
          onChange={updateField}
          required
          aria-describedby={errors.subject ? "contact-subject-error" : undefined}
        />
        {errors.subject ? <small id="contact-subject-error">{errors.subject}</small> : null}
      </label>
      <label>
        <span>Message</span>
        <textarea
          name="message"
          rows="6"
          value={values.message}
          onChange={updateField}
          required
          aria-describedby={errors.message ? "contact-message-error" : undefined}
        />
        {errors.message ? <small id="contact-message-error">{errors.message}</small> : null}
      </label>
      {status.message ? <div className={`form-status ${status.type}`}>{status.message}</div> : null}
      {fallbackUrl ? (
        <a className="button button-secondary" href={fallbackUrl} target="_blank" rel="noopener noreferrer">
          Open WhatsApp
        </a>
      ) : null}
      <button className="button button-primary" type="submit" disabled={loading}>
        {loading ? "Opening WhatsApp" : "Submit Message"}
        <Send size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
