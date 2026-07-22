import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/authHooks";
import {
  PROTECTED_ACTIVITY_THROTTLE_MS,
  PROTECTED_IDLE_TIMEOUT_MS,
  PROTECTED_IDLE_WARNING_MS,
  clearStoredSessionSecurity,
  formatIdleCountdown,
  getSessionSecurityChannelName,
  readStoredLastActivity,
  writeStoredLastActivity
} from "../services/sessionSecurity";

function IdleModal({ remainingMs, onStaySignedIn, onSignOutNow }) {
  const stayButtonRef = useRef(null);
  const signOutButtonRef = useRef(null);

  useEffect(() => {
    stayButtonRef.current?.focus();
  }, []);

  function handleKeyDown(event) {
    if (event.key !== "Tab") return;
    const focusable = [stayButtonRef.current, signOutButtonRef.current].filter(Boolean);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="idle-modal-backdrop" role="presentation">
      <section className="idle-modal" role="dialog" aria-modal="true" aria-labelledby="idle-warning-title" onKeyDown={handleKeyDown}>
        <ShieldCheck size={28} aria-hidden="true" />
        <div>
          <p className="eyebrow">Session security</p>
          <h2 id="idle-warning-title">Are you still there?</h2>
          <p>
            For your security, you will be signed out soon because there has been no activity.
            {" "}
            Time remaining: {formatIdleCountdown(remainingMs)}.
          </p>
        </div>
        <div className="button-row">
          <button ref={stayButtonRef} className="button button-primary" type="button" onClick={onStaySignedIn}>
            Stay Signed In
          </button>
          <button ref={signOutButtonRef} className="button button-secondary" type="button" onClick={onSignOutNow}>
            Sign Out Now
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

export default function IdleSessionGuard({ enabled = true }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(PROTECTED_IDLE_TIMEOUT_MS - PROTECTED_IDLE_WARNING_MS);
  const channelRef = useRef(null);
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const logoutAtRef = useRef(Date.now() + PROTECTED_IDLE_TIMEOUT_MS);
  const lastBroadcastRef = useRef(0);
  const signingOutRef = useRef(false);

  const clearTimers = useCallback(() => {
    window.clearTimeout(warningTimerRef.current);
    window.clearTimeout(logoutTimerRef.current);
    window.clearInterval(countdownRef.current);
  }, []);

  const broadcast = useCallback((type) => {
    const message = { type, sentAt: Date.now() };
    channelRef.current?.postMessage(message);
    try {
      localStorage.setItem(`${getSessionSecurityChannelName()}:event`, JSON.stringify(message));
    } catch {
      // Storage may be disabled.
    }
  }, []);

  const runLocalSignOut = useCallback(async (shouldBroadcast = true) => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    clearTimers();
    setWarningOpen(false);
    clearStoredSessionSecurity();
    if (shouldBroadcast) broadcast("signed_out");
    await signOut({ scope: "local" });
    navigate("/login?reason=idle", { replace: true });
  }, [broadcast, clearTimers, navigate, signOut]);

  const showWarning = useCallback((shouldBroadcast = true) => {
    logoutAtRef.current = lastActivityRef.current + PROTECTED_IDLE_TIMEOUT_MS;
    setRemainingMs(Math.max(0, logoutAtRef.current - Date.now()));
    setWarningOpen(true);
    window.clearInterval(countdownRef.current);
    countdownRef.current = window.setInterval(() => {
      const nextRemaining = Math.max(0, logoutAtRef.current - Date.now());
      setRemainingMs(nextRemaining);
      if (nextRemaining <= 0) void runLocalSignOut(true);
    }, 1000);
    if (shouldBroadcast) broadcast("warning");
  }, [broadcast, runLocalSignOut]);

  const resetTimers = useCallback((shouldBroadcast = true, timestamp = Date.now()) => {
    if (!enabled || signingOutRef.current) return;
    clearTimers();
    lastActivityRef.current = timestamp;
    writeStoredLastActivity(timestamp);
    logoutAtRef.current = timestamp + PROTECTED_IDLE_TIMEOUT_MS;
    setWarningOpen(false);
    setRemainingMs(PROTECTED_IDLE_TIMEOUT_MS - PROTECTED_IDLE_WARNING_MS);
    const warningDelay = Math.max(0, PROTECTED_IDLE_WARNING_MS - (Date.now() - timestamp));
    const logoutDelay = Math.max(0, PROTECTED_IDLE_TIMEOUT_MS - (Date.now() - timestamp));
    warningTimerRef.current = window.setTimeout(() => showWarning(true), warningDelay);
    logoutTimerRef.current = window.setTimeout(() => void runLocalSignOut(true), logoutDelay);
    if (shouldBroadcast) broadcast("activity");
  }, [broadcast, clearTimers, enabled, runLocalSignOut, showWarning]);

  const recordActivity = useCallback(() => {
    if (!enabled || signingOutRef.current) return;
    const now = Date.now();
    if (now - lastBroadcastRef.current < PROTECTED_ACTIVITY_THROTTLE_MS) return;
    lastBroadcastRef.current = now;
    resetTimers(true, now);
  }, [enabled, resetTimers]);

  useEffect(() => {
    if (!enabled) return undefined;
    signingOutRef.current = false;
    const stored = readStoredLastActivity();
    if (stored && Date.now() - stored >= PROTECTED_IDLE_TIMEOUT_MS) {
      void runLocalSignOut(true);
      return undefined;
    }
    resetTimers(false, stored || Date.now());

    const events = ["pointerdown", "keydown", "touchstart", "scroll", "wheel", "focus", "visibilitychange"];
    events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));

    if ("BroadcastChannel" in window) {
      channelRef.current = new BroadcastChannel(getSessionSecurityChannelName());
      channelRef.current.onmessage = (event) => {
        if (event.data?.type === "activity" || event.data?.type === "stay_signed_in") resetTimers(false, event.data.sentAt || Date.now());
        if (event.data?.type === "warning") showWarning(false);
        if (event.data?.type === "signed_out") void runLocalSignOut(false);
      };
    }

    function handleStorage(event) {
      if (event.key !== `${getSessionSecurityChannelName()}:event` || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue);
        if (data.type === "activity" || data.type === "stay_signed_in") resetTimers(false, data.sentAt || Date.now());
        if (data.type === "warning") showWarning(false);
        if (data.type === "signed_out") void runLocalSignOut(false);
      } catch {
        // Ignore malformed cross-tab events.
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      clearTimers();
      events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      window.removeEventListener("storage", handleStorage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [clearTimers, enabled, recordActivity, resetTimers, runLocalSignOut, showWarning]);

  function staySignedIn() {
    const now = Date.now();
    resetTimers(true, now);
    broadcast("stay_signed_in");
  }

  function signOutNow() {
    void runLocalSignOut(true);
  }

  return warningOpen ? <IdleModal remainingMs={remainingMs} onStaySignedIn={staySignedIn} onSignOutNow={signOutNow} /> : null;
}
