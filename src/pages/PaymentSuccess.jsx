import { Download, Home, Mail, ShieldCheck } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { siteConfig } from "../data/site";
import { readTemporaryPayment } from "../services/paymentService";
import { formatCurrency, formatDateTime, isValidEmail } from "../utils/format";
import { normalizePaymentReference } from "../utils/paymentCalculations";
import { usePageMeta } from "../utils/usePageMeta";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPaymentDetails(searchParams) {
  const reference = normalizePaymentReference(searchParams.get("reference"), searchParams.get("trxref"));
  if (!reference) return null;
  const record = readTemporaryPayment(reference);
  if (!record || record.reference !== reference || record.temporaryStatus !== "success") return null;
  return record;
}

function downloadReceipt(data) {
  const brandConfig = data.brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const amount = formatCurrency(data.amountKobo / 100);
  const receiptHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Zentel Insight Payment ${escapeHtml(data.reference)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; color: #191512; padding: 40px; }
    .receipt { max-width: 720px; margin: 0 auto; border: 1px solid #eadfd8; border-radius: 12px; padding: 32px; }
    .brand { color: ${data.brand === "studyhub" ? "#04BF63" : "#FF914D"}; font-weight: 800; font-size: 24px; }
    dl { display: grid; grid-template-columns: 180px 1fr; gap: 12px; }
    dt { color: #665d57; }
    dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
    @media print { body { padding: 0; } .receipt { border: 0; } }
  </style>
</head>
<body>
  <main class="receipt">
    <p class="brand">${escapeHtml(brandConfig.name)}</p>
    <h1>Payment Completed</h1>
    <p>Paystack reported that this checkout was completed successfully. Keep this reference for confirmation and enrolment processing.</p>
    <dl>
      <dt>Reference</dt><dd>${escapeHtml(data.reference)}</dd>
      <dt>Product</dt><dd>${escapeHtml(data.productTitle || data.productType)}</dd>
      ${data.trackName ? `<dt>Track</dt><dd>${escapeHtml(data.trackName)}</dd>` : ""}
      ${data.classLevel ? `<dt>Class</dt><dd>${escapeHtml(data.classLevel)}</dd>` : ""}
      ${data.subjectNames?.length ? `<dt>Subjects</dt><dd>${escapeHtml(data.subjectNames.join(", "))}</dd>` : ""}
      ${data.months ? `<dt>Duration</dt><dd>${escapeHtml(data.months === 1 && data.productType === "studyhub_summer_lessons" ? "One month" : `${data.months} month(s)`)}</dd>` : ""}
      <dt>Amount</dt><dd>${escapeHtml(amount)}</dd>
      <dt>Customer</dt><dd>${escapeHtml(data.customerName)}</dd>
      ${data.studentName ? `<dt>Student</dt><dd>${escapeHtml(data.studentName)}</dd>` : ""}
      <dt>Email</dt><dd>${escapeHtml(data.customerEmail)}</dd>
      <dt>Phone</dt><dd>${escapeHtml(data.customerPhone)}</dd>
      <dt>Date</dt><dd>${escapeHtml(formatDateTime(data.updatedAt || data.createdAt))}</dd>
    </dl>
  </main>
</body>
</html>`;

  const blob = new Blob([receiptHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zentel-payment-${data.reference.replace(/[^a-z0-9-]/gi, "_")}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const data = getPaymentDetails(searchParams);
  const routeBrand = location.pathname.startsWith("/studyhub") ? "studyhub" : "main";
  const brand = data?.brand === "studyhub" ? "studyhub" : data ? "main" : routeBrand;
  const brandConfig = brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const homeHref = brand === "studyhub" ? "/studyhub" : "/programs";
  const contactHref = brand === "studyhub" ? "/studyhub/contact" : "/contact";

  usePageMeta({
    path: brand === "studyhub" ? "/studyhub/payment-success" : "/payment-success",
    title: `Payment Completed | ${brandConfig.name}`,
    description: "Paystack checkout completion page.",
    favicon: brandConfig.favicon,
    image: `${siteConfig.domain}${brandConfig.ogImage}`,
    robots: "noindex,nofollow"
  });

  if (!data) {
    return (
      <section className="page-section visual-section payment-visual-section">
        <div className="visual-section__background" aria-hidden="true" />
        <div className="visual-section__overlay" aria-hidden="true" />
        <div className="container narrow visual-section__content">
          <div className="receipt-card">
            <BrandLogo brand={brand} className="receipt-brand-logo" size="payment" />
            <div className="receipt-status warning">
              <ShieldCheck size={28} aria-hidden="true" />
              <div>
                <p className="eyebrow">{brandConfig.name}</p>
                <h1>Payment details unavailable</h1>
                <p>We could not find the payment details for this page.</p>
              </div>
            </div>
            <div className="receipt-actions">
              <Link className="button button-primary" to={homeHref}>{brand === "studyhub" ? "Return to StudyHub" : "Return to Programs"}</Link>
              <Link className="button button-secondary" to={contactHref}>Contact Support</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const isStudyHub = data.brand === "studyhub";
  const amount = data.amountKobo / 100;
  const duration = data.productType === "studyhub_summer_lessons" ? "One month" : data.months ? `${data.months} month(s)` : "";

  return (
    <section className={isStudyHub ? "page-section visual-section studyhub-payment-section" : "page-section visual-section payment-visual-section"}>
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container narrow visual-section__content">
        <div className="receipt-card">
          <BrandLogo brand={isStudyHub ? "studyhub" : "main"} className="receipt-brand-logo" size="payment" />
          <div className="receipt-status success">
            <ShieldCheck size={28} aria-hidden="true" />
            <div>
              <p className="eyebrow">{brandConfig.name}</p>
              <h1>Payment completed</h1>
              <p>Paystack reported that your payment was completed successfully. Keep your transaction reference for confirmation and enrolment processing.</p>
            </div>
          </div>

          <dl className="receipt-details">
            <div><dt>Paystack reference</dt><dd>{data.reference}</dd></div>
            <div><dt>{isStudyHub ? "Product" : "Programme"}</dt><dd>{data.productTitle || data.productType}</dd></div>
            {data.trackName ? <div><dt>Track</dt><dd>{data.trackName}</dd></div> : null}
            {data.classLevel ? <div><dt>Class</dt><dd>{data.classLevel}</dd></div> : null}
            {data.subjectNames?.length ? <div><dt>Selected subjects</dt><dd>{data.subjectNames.join(", ")}</dd></div> : null}
            {duration ? <div><dt>Duration</dt><dd>{duration}</dd></div> : null}
            {data.productType === "studyhub_summer_lessons" ? <div><dt>Payment type</dt><dd>One-time payment</dd></div> : null}
            <div><dt>Amount</dt><dd>{formatCurrency(amount)}</dd></div>
            <div><dt>{isStudyHub ? "Parent/customer name" : "Customer name"}</dt><dd>{data.customerName}</dd></div>
            {data.studentName ? <div><dt>Student</dt><dd>{data.studentName}</dd></div> : null}
            <div>
              <dt>Email</dt>
              <dd>{isValidEmail(data.customerEmail) ? <a href={`mailto:${data.customerEmail}`}>{data.customerEmail}</a> : data.customerEmail}</dd>
            </div>
            <div><dt>Phone</dt><dd>{data.customerPhone}</dd></div>
            <div><dt>Date</dt><dd>{formatDateTime(data.updatedAt || data.createdAt)}</dd></div>
          </dl>

          <div className="form-status warning">
            Secure backend verification is temporarily offline. This page does not activate course access by itself.
          </div>

          <div className="receipt-actions">
            <button className="button button-primary" type="button" onClick={() => downloadReceipt(data)}>
              Download Copy
              <Download size={18} aria-hidden="true" />
            </button>
            <Link className="button button-secondary" to={homeHref}>
              {isStudyHub ? "Return to StudyHub" : "Return to Programs"}
              <Home size={18} aria-hidden="true" />
            </Link>
            <Link className="button button-secondary" to={contactHref}>
              {isStudyHub ? "Contact StudyHub" : "Contact Support"}
              <Mail size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
