export function showToast(message, type = "success") {
  if (!message || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("zentel:toast", { detail: { message, type } }));
}
