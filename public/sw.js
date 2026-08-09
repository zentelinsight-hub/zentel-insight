self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || "You have a new Zentel Insight update." }; }
  event.waitUntil(self.registration.showNotification(data.title || "Zentel Insight", {
    body: data.body || "You have a new portal update.",
    icon: "/favicon-192.png",
    badge: "/favicon-192.png",
    tag: data.tag || "zentel-update",
    data: { url: data.url || "/portal/notifications" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/portal/notifications", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const client = clients.find((item) => item.url.startsWith(self.location.origin));
    if (client) { await client.navigate(target); return client.focus(); }
    return self.clients.openWindow(target);
  }));
});
