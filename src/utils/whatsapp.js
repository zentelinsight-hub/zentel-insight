export const ZENTEL_WHATSAPP_NUMBER = "2347060833927";

export function buildWhatsAppUrl(message, number = ZENTEL_WHATSAPP_NUMBER) {
  return `https://wa.me/${number}?text=${encodeURIComponent(String(message || "").trim())}`;
}

export function formatMainContactMessage({ name, email, phone, subject, message }) {
  return [
    "Hello Zentel Insight,",
    "",
    `My name is ${name.trim()}.`,
    "",
    `Email: ${email.trim()}`,
    `Phone: ${phone.trim()}`,
    `Subject: ${subject.trim()}`,
    "",
    "Message:",
    message.trim()
  ].join("\n");
}

export function formatStudyHubContactMessage({ name, email, phone, studentClass, subject, message }) {
  return [
    "Hello Zentel Insight StudyHub,",
    "",
    `My name is ${name.trim()}.`,
    "",
    `Email: ${email.trim()}`,
    `Phone: ${phone.trim()}`,
    studentClass?.trim() ? `Student class, if supplied: ${studentClass.trim()}` : "Student class, if supplied: Not supplied",
    `Subject: ${subject.trim()}`,
    "",
    "Message:",
    message.trim()
  ].join("\n");
}
