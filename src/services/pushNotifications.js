import { getSupabaseClient } from "./supabaseClient";

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from([...decoded].map((character) => character.charCodeAt(0)));
}

function supportsPush() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

async function getRegistration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getDeviceNotificationState() {
  if (!supportsPush()) return { supported: false, enabled: false, permission: "unsupported" };
  if (Notification.permission !== "granted") return { supported: true, enabled: false, permission: Notification.permission };
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return { supported: true, enabled: Boolean(subscription), permission: Notification.permission };
}

export async function enableDeviceNotifications() {
  if (!supportsPush()) throw new Error("Device notifications are not supported in this browser.");
  const permission = await Notification.requestPermission();
  if (permission === "denied") throw new Error("Notifications are blocked in your browser or device settings.");
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const publicKey = String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || "").trim();
  if (!publicKey) throw new Error("Device notifications are not configured for this website yet.");
  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(publicKey) });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("The device push subscription was incomplete.");

  const supabase = await getSupabaseClient();
  const { error } = await supabase.rpc("save_my_push_subscription", {
    endpoint_value: json.endpoint,
    p256dh_value: json.keys.p256dh,
    auth_value: json.keys.auth
  });
  if (error) {
    if (!existing) await subscription.unsubscribe().catch(() => undefined);
    throw error;
  }
  return { supported: true, enabled: true, permission };
}

export async function disableDeviceNotifications() {
  if (!supportsPush()) return { supported: false, enabled: false, permission: "unsupported" };
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc("disable_my_push_subscription", { endpoint_value: subscription.endpoint });
    if (error) throw error;
    await subscription.unsubscribe();
  }
  return { supported: true, enabled: false, permission: Notification.permission };
}
