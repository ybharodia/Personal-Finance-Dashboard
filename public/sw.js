const CACHE_NAME = "financeos-v1";

// Static Next.js shell assets to precache on install
const PRECACHE_PATHS = ["/"];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_PATHS))
  );
});

// ── Activate: purge old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

// ── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from the same origin
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Never intercept Supabase or API calls — always go to network
  if (url.pathname.startsWith("/api/")) return;

  // Next.js static chunks: cache-first (they're content-hashed, never stale)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            return res;
          })
      )
    );
    return;
  }

  // App icons & public assets: cache-first
  if (
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon" ||
    url.pathname === "/apple-icon"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            return res;
          })
      )
    );
    return;
  }

  // Page navigations: network-first, fall back to cached / for offline shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () => caches.match("/") || new Response("Offline — please reconnect.", { status: 503 })
      )
    );
  }
});
