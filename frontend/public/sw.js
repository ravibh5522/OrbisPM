/// OrbisPM Service Worker — static asset & API response caching
/// Provides offline support and instant page loads for returning users.

// Bump these on every deploy that ships new frontend code — the activate
// handler deletes any cache whose name doesn't match, clearing stale chunks so
// the new build is served without a manual "clear site data".
const STATIC_CACHE = "orbispm-static-v5";
const API_CACHE = "orbispm-api-v5";

// ── Install: pre-cache the offline shell ────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(["/", "/offline"]))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate: clean old caches ──────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch strategies ────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, WebSocket, and chrome-extension requests
  if (
    request.method !== "GET" ||
    url.protocol === "ws:" ||
    url.protocol === "wss:" ||
    url.protocol === "chrome-extension:"
  ) {
    return;
  }

  // 1. Next.js static chunks (_next/static) — cache-first (immutable hashes)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 2. Static assets in /public (icons, images, fonts)
  if (
    url.pathname.match(
      /\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|css|js)$/,
    )
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // 3. API GET requests — network-first with cache fallback (offline reads)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // 4. Navigation (HTML pages) — network-first, fall back to cached /
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/")
          .then((r) => r || new Response("Offline", { status: 503 })),
      ),
    );
    return;
  }
});

// ── Cache-first: try cache, then network (for immutable assets) ─
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 503 });
  }
}

// ── Network-first: try network, fall back to cache ──────────────
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return (
      cached ||
      new Response(JSON.stringify({ error: "offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

// ── Stale-while-revalidate: serve cache, update in background ───
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
}
