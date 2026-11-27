// Typecast service worker. Caches static assets (not images); pages and data always come from the network
// (they are per-user), with a small offline page as the fallback.
const STATIC = "typecast-static-v8";
// Posters are NOT handled here (v4 refetched them with CORS, which this worker's own CSP connect-src 'self' blocks, leaving blank posters
// on phones until the worker was replaced). The browser HTTP cache serves image.tmdb.org; old image caches are deleted on activate.
const PRECACHE = ["/offline", "/retry.html", "/launch.html", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  // Navigation preload: the page request starts while the worker boots instead of after it, so the worker never adds delay.
  e.waitUntil(Promise.all([
    self.registration.navigationPreload ? self.registration.navigationPreload.enable() : null,
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== STATIC).map((k) => caches.delete(k)))),
  ]).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // The installed app opens on /launch.html (manifest start_url): answer from the cache so the skeleton paints at once, whatever the server is doing.
  if (req.mode === "navigate" && url.pathname === "/launch.html") {
    if (e.preloadResponse) e.waitUntil(e.preloadResponse.catch(() => undefined)); // the preload is not needed here; settle it quietly
    e.respondWith(caches.match("/launch.html").then((c) => c || fetch(req)).catch(() => caches.match("/offline")));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith((e.preloadResponse || Promise.resolve(undefined)).then((pre) => pre || fetch(req))
      // A gateway error (deploy in progress, backend down: 502/503/504) gets the self-retrying page; no connection at all gets the offline page.
      // A plain 500 is the app's own error screen with its Reference code: show it, do not reload over it for ever.
      .then((r) => (r.status >= 502 && r.status <= 504 ? caches.match("/retry.html").then((c) => c || r) : r))
      .catch(() => caches.match("/offline")));
    return;
  }
  const same = url.origin === location.origin;
  const cacheable = (same && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) ||
    url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!cacheable) return;
  e.respondWith(caches.open(STATIC).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }))));
});

