import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

export default function GlobalToastHost() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let timer;
    const show = (event) => {
      window.clearTimeout(timer);
      setToast({ id: Date.now(), type: event.detail?.type || "success", message: event.detail?.message || "Saved" });
      timer = window.setTimeout(() => setToast(null), 2600);
    };
    window.addEventListener("zentel:toast", show);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("zentel:toast", show);
    };
  }, []);

  if (!toast) return null;
  const Icon = toast.type === "warning" ? CircleAlert : toast.type === "info" ? Info : CheckCircle2;
  return (
    <div className={`global-toast ${toast.type}`} role="status" aria-live="polite">
      <Icon size={16} aria-hidden="true" />
      <span>{toast.message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button>
    </div>
  );
}
