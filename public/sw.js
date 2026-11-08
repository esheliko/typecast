// Typecast service worker. Caches static assets and TMDB images; pages and data always come from the network
// (they are per-user), with a small offline page as the fallback.
const STATIC = "typecast-static-v4";
const IMAGES = "typecast-img-v4";
// Image cache cap. Only CORS (non-opaque) responses are stored: opaque ones are padded to several MB each in the origin quota.
const MAX_IMAGES = 300;
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
  if (url.hostname === "image.tmdb.org") { e.respondWith(image(e, req)); return; }
  e.respondWith(caches.open(STATIC).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }))));
});

// Posters: cache hit, else refetch with CORS (image.tmdb.org sends CORS headers) so the stored response is small and not opaque.
// The page's <img> is unchanged (still no-cors), so currentSrc and failure behaviour are as before; if CORS fails the image is
// fetched as the page asked and simply not cached.
function image(e, req) {
  const key = req.url;
  return caches.open(IMAGES).then((c) => c.match(key).then((hit) => {
    if (hit) return hit;
    return fetch(new Request(key, { mode: "cors", credentials: "omit" })).then((r) => {
      if (!r.ok) return r;
      e.waitUntil(c.put(key, r.clone()).then(() => trim(c)).catch(() => {}));
      return r;
    }).catch(() => fetch(req));
  }));
}
// Oldest first (cache.keys() is insertion order).
function trim(c) {
  return c.keys().then((ks) => Promise.all(ks.slice(0, Math.max(0, ks.length - MAX_IMAGES)).map((k) => c.delete(k))));
}
