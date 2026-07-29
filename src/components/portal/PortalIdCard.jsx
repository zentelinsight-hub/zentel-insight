import { Check, Copy } from "lucide-react";
import { useState } from "react";

export default function PortalIdCard({ portalId = "", role = "account" }) {
  const [copied, setCopied] = useState(false);

  async function copyPortalId() {
    if (!portalId) return;
    await navigator.clipboard.writeText(portalId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="portal-id-card">
      <div>
        <span>{role === "tutor" ? "Tutor" : role === "student" ? "Student" : "Account"} Portal ID</span>
        <strong>{portalId || "Pending assignment"}</strong>
        <small>Use this permanent ID when contacting Zentel Insight administration.</small>
      </div>
      {portalId ? (
        <button className="icon-button" type="button" onClick={copyPortalId} aria-label="Copy Portal ID" title="Copy Portal ID">
          {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}
