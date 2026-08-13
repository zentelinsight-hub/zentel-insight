export const welcomeDurationMs = 900;
export const returningLoaderDurationMs = 450;
export const welcomeVisitorStorageKey = "zentel:welcome-seen:v1";
export const welcomeSessionStorageKey = "zentel:welcome-session:v1";

let documentStartupMode = "";

function navigationIsReload() {
  try {
    const navigationEntry = window.performance?.getEntriesByType?.("navigation")?.[0];
    if (navigationEntry?.type === "reload") return true;
    const legacyNavigation = window.performance?.navigation;
    return legacyNavigation?.type === (legacyNavigation?.TYPE_RELOAD ?? 1);
  } catch {
    return false;
  }
}

export function resolveWelcomeStartupMode() {
  if (documentStartupMode) return documentStartupMode;
  if (typeof window === "undefined") return "loading";

  let storageAvailable = false;
  let visitorSeen = false;
  try {
    visitorSeen = window.localStorage.getItem(welcomeVisitorStorageKey) === "1";
    storageAvailable = true;
  } catch {
    // Session storage and navigation timing remain available as fallbacks.
  }
  try {
    visitorSeen = visitorSeen || window.sessionStorage.getItem(welcomeSessionStorageKey) === "1";
    storageAvailable = true;
  } catch {
    // If both storage APIs are blocked, default to the non-welcome loading state.
  }

  documentStartupMode = navigationIsReload() || visitorSeen || !storageAvailable ? "loading" : "welcome";

  try {
    window.localStorage.setItem(welcomeVisitorStorageKey, "1");
  } catch {
    // Storage restrictions must never block startup.
  }
  try {
    window.sessionStorage.setItem(welcomeSessionStorageKey, "1");
  } catch {
    // Storage restrictions must never block startup.
  }

  return documentStartupMode;
}

export function resetWelcomeStartupModeForTests() {
  documentStartupMode = "";
}
