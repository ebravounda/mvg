// MVG Computación · Service Worker (PWA minimal)
// Estrategias:
//  - Estáticos (mismo origen, GET): Stale-While-Revalidate
//  - API (/api/*): Network-only (sin cache para que no se desincronice)
//  - Navegación (SPA): Network-first con fallback al cache del shell

const VERSION = "mvg-v1";
const STATIC_CACHE = `${VERSION}-static`;
const SHELL = ["/", "/manifest.webmanifest", "/favicon.png", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca cachear API
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Navegación SPA (HTML) → network-first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put("/", copy)).catch(() => null);
          return res;
        })
        .catch(async () => (await caches.match("/")) || Response.error())
    );
    return;
  }

  // Otros assets mismo origen → stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone()).catch(() => null);
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
