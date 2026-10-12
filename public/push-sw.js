/* Imported into VitePWA's generated service worker; never register this file separately. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text?.() || "You have new activity on Campus Connect." };
  }

  const nested = payload.notification || {};
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const title = payload.title || nested.title || "Campus Connect";
  const body = payload.body || nested.body || "You have new activity on campus.";
  const requestedUrl = data.url || data.link || "/notifications";
  let target;
  try {
    target = new URL(requestedUrl, self.location.origin);
    if (target.origin !== self.location.origin) target = new URL("/notifications", self.location.origin);
  } catch {
    target = new URL("/notifications", self.location.origin);
  }

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: payload.icon || nested.icon || "/campus-connect-logo.png",
    badge: payload.badge || nested.badge || "/icons/icon-192.png",
    tag: payload.tag || undefined,
    data: { ...data, url: `${target.pathname}${target.search}${target.hash}` },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const requested = event.notification?.data?.url
    || event.notification?.data?.link
    || "/notifications";

  let target;
  try {
    target = new URL(requested, self.location.origin);
    if (target.origin !== self.location.origin) target = new URL("/notifications", self.location.origin);
  } catch {
    target = new URL("/notifications", self.location.origin);
  }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      try {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ("navigate" in client) await client.navigate(target.href);
        return await client.focus();
      } catch {
        // Try another same-origin tab or open a new one.
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
