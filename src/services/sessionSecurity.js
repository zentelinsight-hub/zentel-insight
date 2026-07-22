export const PROTECTED_IDLE_WARNING_MS = 18 * 60 * 1000;
export const PROTECTED_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
export const PROTECTED_ACTIVITY_THROTTLE_MS = 1000;

const lastActivityKey = "zentel:protected:last-activity";
const channelName = "zentel-protected-session";

export function readStoredLastActivity() {
  try {
    const value = Number(localStorage.getItem(lastActivityKey) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeStoredLastActivity(timestamp = Date.now()) {
  try {
    localStorage.setItem(lastActivityKey, String(timestamp));
  } catch {
    // Storage may be disabled in private browsing contexts.
  }
}

export function clearStoredSessionSecurity() {
  try {
    localStorage.removeItem(lastActivityKey);
    localStorage.removeItem(`${channelName}:event`);
  } catch {
    // Storage may be disabled in private browsing contexts.
  }
}

export function hasStoredSessionExpired(now = Date.now()) {
  const lastActivity = readStoredLastActivity();
  return Boolean(lastActivity && now - lastActivity >= PROTECTED_IDLE_TIMEOUT_MS);
}

export function getSessionSecurityChannelName() {
  return channelName;
}

export function formatIdleCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
