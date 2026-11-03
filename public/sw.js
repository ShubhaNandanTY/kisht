// Kisht service worker: keeps the officer app shell available with no signal.
// Data (the day's list and queued outcomes) lives in IndexedDB, not here; API calls are never cached.
const CACHE = "kisht-shell-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Built JS/CSS/fonts are content-hashed: cache first.
  if (url.pathname.startsWith("/_next/static/") || /\.(svg|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // The officer page: network first, fall back to the last good copy when offline.
  if (req.mode === "navigate" && url.pathname.startsWith("/officer")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) caches.open(CACHE).then((c) => c.put("/officer", res.clone()));
          return res;
        })
        .catch(() => caches.match("/officer").then((hit) => hit || Response.error())),
    );
  }
});

// The page tells us which files it was built from on first load (before this worker controlled it),
// so the app works offline even if the signal drops straight after sign-in.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((u) => typeof u === "string" && u.startsWith("/"));
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        urls.map((u) =>
          fetch(u, { credentials: "same-origin" })
            .then((res) => (res.ok && !res.redirected ? c.put(u, res) : undefined))
            .catch(() => undefined),
        ),
      ),
    ),
  );
});
