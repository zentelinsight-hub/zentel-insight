import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

export default function AuthProgressOverlay({ progress }) {
  if (!progress) return null;
  const steps = getProgressSteps(progress.variant);
  const completed = new Set(progress.completed || []);

  return (
    <div className="auth-progress-overlay" role="status" aria-live="polite" aria-label="Secure sign-in progress">
      <div className="auth-progress-panel">
        <ShieldCheck size={32} aria-hidden="true" />
        <div>
          <p className="eyebrow">Secure access</p>
          <h2>Preparing your workspace</h2>
        </div>
        <ol className="auth-progress-steps">
          {steps.map((step, index) => {
            const isComplete = completed.has(index);
            const isActive = !isComplete && index === progress.activeIndex;
            return (
              <li key={step} className={isComplete ? "complete" : isActive ? "active" : ""}>
                <span className="auth-progress-icon" aria-hidden="true">
                  {isComplete ? <CheckCircle2 size={20} /> : <Loader2 size={20} />}
                </span>
                <span>{step}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function getProgressSteps(variant = "initial") {
  const stepSets = {
  initial: ["Signing you in"],
  standard: ["Signing you in", "Checking account status", "Running security checks"],
  adminPassword: ["Securing administrator session", "Verifying administrator privileges", "Preparing Admin access verification"],
  adminCode: ["Verifying security code", "Securing Admin access", "Opening Admin Dashboard"]
  };
  return stepSets[variant] || stepSets.initial;
}
