import { Download, Home, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { siteConfig } from "../data/site";
import { formatCurrency, formatDateTime, isValidEmail, sanitizeText } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getReceiptData(searchParams) {
  const amount = Number(searchParams.get("amount"));
  const program = sanitizeText(searchParams.get("program"), "Selected programme");
  const reference = sanitizeText(searchParams.get("reference"), "Missing reference");
  const brand =
    reference.startsWith("ZH-") || program.toLowerCase().includes("studyhub")
      ? "studyhub"
      : "main";
  return {
    reference,
    program,
    brand,
    amount: Number.isFinite(amount) ? amount : null,
    name: sanitizeText(searchParams.get("name"), "Payer"),
    email: sanitizeText(searchParams.get("email"), "Email unavailable"),
    phone: sanitizeText(searchParams.get("phone"), ""),
    student: sanitizeText(searchParams.get("student"), ""),
    classLevel: sanitizeText(searchParams.get("class"), ""),
    productType: sanitizeText(searchParams.get("productType"), ""),
    subjects: sanitizeText(searchParams.get("subjects"), ""),
    months: sanitizeText(searchParams.get("months"), ""),
    date: sanitizeText(searchParams.get("date"), new Date().toISOString()),
    verified: searchParams.get("verified") === "true",
    verificationConfigured: searchParams.get("verificationConfigured") === "true",
    verificationMessage: sanitizeText(searchParams.get("verificationMessage"), "")
  };
}

function downloadReceipt(data) {
  const brandConfig = data.brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const logoUrl = `${siteConfig.domain}${brandConfig.logo}`;
  const receiptHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Zentel Insight Receipt ${escapeHtml(data.reference)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; color: #191512; padding: 40px; }
    .receipt { max-width: 720px; margin: 0 auto; border: 1px solid #eadfd8; border-radius: 12px; padding: 32px; }
    .brand-logo-frame { width: 64px; height: 64px; padding: 4px; background: #fff; border-radius: 8px; display: grid; place-items: center; margin-bottom: 20px; }
    .brand-logo { width: 100%; height: 100%; object-fit: contain; object-position: center; display: block; }
    .brand { color: #FF914D; font-weight: 800; font-size: 24px; }
    dl { display: grid; grid-template-columns: 180px 1fr; gap: 12px; }
    dt { color: #665d57; }
    dd { margin: 0; font-weight: 700; }
    .watermark { color: rgba(255, 145, 77, 0.12); font-size: 72px; font-weight: 800; text-align: right; }
    @media print { body { padding: 0; } .receipt { border: 0; } }
  </style>
</head>
<body>
  <main class="receipt">
    <span class="brand-logo-frame"><img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandConfig.name)}"></span>
    <p class="brand">${escapeHtml(brandConfig.name)}</p>
    <p>${escapeHtml(data.brand === "studyhub" ? siteConfig.studyHub.description : siteConfig.motto)}</p>
    <p>${escapeHtml(siteConfig.domain)}</p>
    <h1>Payment Receipt</h1>
    <dl>
      <dt>Reference</dt><dd>${escapeHtml(data.reference)}</dd>
      <dt>Programme</dt><dd>${escapeHtml(data.program)}</dd>
      <dt>Amount</dt><dd>${escapeHtml(formatCurrency(data.amount))}</dd>
      <dt>Payer</dt><dd>${escapeHtml(data.name)}</dd>
      <dt>Email</dt><dd>${escapeHtml(data.email)}</dd>
      ${data.phone ? `<dt>Phone</dt><dd>${escapeHtml(data.phone)}</dd>` : ""}
      ${data.student ? `<dt>Student</dt><dd>${escapeHtml(data.student)}</dd>` : ""}
      ${data.classLevel ? `<dt>Class</dt><dd>${escapeHtml(data.classLevel)}</dd>` : ""}
      ${data.productType ? `<dt>Product type</dt><dd>${escapeHtml(data.productType === "studyhub_summer_lessons" ? "Summer Lessons" : data.productType)}</dd>` : ""}
      ${data.subjects ? `<dt>Subjects</dt><dd>${escapeHtml(data.subjects)}</dd>` : ""}
      ${data.months ? `<dt>Months</dt><dd>${escapeHtml(data.months)}</dd>` : ""}
      <dt>Date</dt><dd>${escapeHtml(formatDateTime(data.date))}</dd>
      <dt>Status</dt><dd>Paystack callback received</dd>
      <dt>Verification</dt><dd>${escapeHtml(data.verified ? "Verified" : data.verificationConfigured ? "Not verified" : "Confirmation pending")}</dd>
    </dl>
    <p class="watermark">ZI</p>
  </main>
</body>
</html>`;

  const blob = new Blob([receiptHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zentel-insight-receipt-${data.reference.replace(/[^a-z0-9-]/gi, "_")}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const data = getReceiptData(searchParams);
  const hasReference = data.reference !== "Missing reference";
  const brandConfig = data.brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const homeHref = data.brand === "studyhub" ? "/studyhub" : "/";
  const contactHref = data.brand === "studyhub" ? "/studyhub/contact" : "/contact";

  usePageMeta({
    path: "/payment-success",
    title: "Payment Status",
    description: "Payment status page for Zentel Insight transactions.",
    favicon: brandConfig.favicon,
    image: `${siteConfig.domain}${brandConfig.ogImage}`,
    robots: "noindex,nofollow"
  });

  return (
    <section className="page-section">
      <div className="container narrow">
        <div className="receipt-card">
          <BrandLogo brand={data.brand} className="receipt-brand-logo" size="payment" />
          <div className={hasReference && data.verified ? "receipt-status success" : "receipt-status warning"}>
            {data.verified ? <ShieldCheck size={28} aria-hidden="true" /> : <TriangleAlert size={28} aria-hidden="true" />}
            <div>
              <p className="eyebrow">{brandConfig.name}</p>
              <h1>{data.verified ? "Payment verified" : hasReference ? "Payment confirmation pending" : "Payment reference unavailable"}</h1>
              <p>
                {data.verified
                  ? "This transaction has been verified."
                  : data.verificationConfigured
                    ? data.verificationMessage || "The verification server did not confirm this transaction."
                    : "Payment confirmation is pending."}
              </p>
            </div>
          </div>

          <dl className="receipt-details">
            <div>
              <dt>Transaction reference</dt>
              <dd>{data.reference}</dd>
            </div>
            <div>
              <dt>Programme</dt>
              <dd>{data.program}</dd>
            </div>
            <div>
              <dt>Amount paid</dt>
              <dd>{formatCurrency(data.amount)}</dd>
            </div>
            <div>
              <dt>Customer name</dt>
              <dd>{data.name}</dd>
            </div>
            <div>
              <dt>Customer email</dt>
              <dd>{isValidEmail(data.email) ? <a href={`mailto:${data.email}`}>{data.email}</a> : data.email}</dd>
            </div>
            {data.phone ? (
              <div>
                <dt>Customer phone</dt>
                <dd>{data.phone}</dd>
              </div>
            ) : null}
            {data.student ? <div><dt>Student</dt><dd>{data.student}</dd></div> : null}
            {data.classLevel ? <div><dt>Class</dt><dd>{data.classLevel}</dd></div> : null}
            {data.productType ? <div><dt>Product type</dt><dd>{data.productType === "studyhub_summer_lessons" ? "Summer Lessons" : data.productType}</dd></div> : null}
            {data.subjects ? <div><dt>Subjects</dt><dd>{data.subjects}</dd></div> : null}
            {data.months ? <div><dt>Months</dt><dd>{data.months}</dd></div> : null}
            <div>
              <dt>Date</dt>
              <dd>{formatDateTime(data.date)}</dd>
            </div>
            <div>
              <dt>Verification state</dt>
              <dd>{data.verified ? "Verified" : data.verificationConfigured ? "Not verified" : "Confirmation pending"}</dd>
            </div>
          </dl>

          <div className="receipt-actions">
            <button className="button button-primary" type="button" onClick={() => downloadReceipt(data)} disabled={!data.verified}>
              Download Receipt
              <Download size={18} aria-hidden="true" />
            </button>
            <Link className="button button-secondary" to={homeHref}>
              {data.brand === "studyhub" ? "Return to StudyHub" : "Return Home"}
              <Home size={18} aria-hidden="true" />
            </Link>
            <Link className="button button-secondary" to={contactHref}>
              Contact Support
              <Mail size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
