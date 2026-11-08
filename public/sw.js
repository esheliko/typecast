// Typecast service worker. Caches static assets and TMDB images; pages and data always come from the network
// (they are per-user), with a small offline page as the fallback.
const STATIC = "typecast-static-v3";
const IMAGES = "typecast-img-v3";
const PRECACHE = ["/offline", "/retry.html", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  // Navigation preload: the page request starts while the worker boots instead of after it, so the worker never adds delay.
  e.waitUntil(Promise.all([
    self.registration.navigationPreload ? self.registration.navigationPreload.enable() : null,
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== STATIC && k !== IMAGES).map((k) => caches.delete(k)))),
  ]).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    e.respondWith((e.preloadResponse || Promise.resolve(undefined)).then((pre) => pre || fetch(req))
      // A server error (deploy in progress, backend down) gets the self-retrying page instead of a bare error; no connection at all gets the offline page.
      .then((r) => (r.status >= 500 ? caches.match("/retry.html").then((c) => c || r) : r))
      .catch(() => caches.match("/offline")));
    return;
  }
  const same = url.origin === location.origin;
  const cacheable = (same && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) ||
    url.hostname === "image.tmdb.org" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!cacheable) return;
  const name = url.hostname === "image.tmdb.org" ? IMAGES : STATIC;
  e.respondWith(caches.open(name).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }))));
});
