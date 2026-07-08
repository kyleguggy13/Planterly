const APP_URL = "https://kyleguggy13.github.io/Planterly/";
const DEFAULT_ICON = `${APP_URL}assets/icons/icon-192.png`;

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

function getPushPayload(event) {
  if (!event.data) return {};

  try {
    return event.data.json();
  } catch (_) {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", event => {
  const payload = getPushPayload(event);
  const title = payload.title || "Planterly";
  const options = {
    body: payload.body || "Remember to log today's plants.",
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_ICON,
    tag: payload.tag || "plant-log-reminder",
    renotify: false,
    data: {
      url: payload.url || payload.data?.url || APP_URL
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || APP_URL;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingClient = windowClients.find(client => client.url.startsWith(APP_URL));

    if (existingClient) {
      await existingClient.focus();
      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});
