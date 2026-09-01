// RealEVR Estates — minimal service worker.
//
// Deliberately conservative: this exists to satisfy PWA installability
// ("Add to Home Screen" / desktop install) and give the landlord mini app
// an offline-ish fallback, not to aggressively cache a data-driven site.
// Property data, availability, messages, and reviews must always be fresh —
// so this never caches API responses (anything under /api/). It only
// caches a small shell of static assets, network-first, so a stale asset
// never blocks a real update.
const CACHE_NAME = "realevr-shell-v1";
const SHELL_ASSETS = ["/", "/favicon.ico", "/site.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// --- Web Push (GENE v1.8 admin broadcast) ---
// Additive: does not touch the shell-caching logic above. Payload shape is
// { title, body, url } — see server/gene/web-push.ts's sendPushToAllSubscribers.
self.addEventListener("push", (event) => {
  let data = { title: "RealEVR Estates", body: "You have a new update.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // Non-JSON payload — fall back to the default text above rather than failing.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.ico",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls — always go straight to the network so data
  // is never stale.
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => {
        // Only fall back to the cached app shell ("/") for page navigations.
        // Falling back to it for a failed JS/CSS/asset request would hand
        // the browser an HTML document where it expected a script — that's
        // a real bug we caught in preview: it breaks the app with
        // "Unexpected token '<'" instead of degrading gracefully. For
        // anything that isn't a navigation, only serve that exact request's
        // own cached copy (if any) — never substitute a different file.
        if (event.request.mode === "navigate") {
          return caches.match(event.request).then((cached) => cached || caches.match("/"));
        }
        return caches.match(event.request);
      })
  );
});
