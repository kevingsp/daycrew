const OFFLINE_CACHE = "daycrew-offline-v2";
const OFFLINE_URL = "/offline.html";
const RETRY_URL = "/offline-retry.js";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(async (cache) => {
      await cache.addAll([OFFLINE_URL, RETRY_URL]);
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith("daycrew-offline-") && key !== OFFLINE_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname === RETRY_URL) {
    event.respondWith(
      caches
        .match(RETRY_URL, { cacheName: OFFLINE_CACHE })
        .then((cached) => cached ?? fetch(request)),
    );
    return;
  }
  if (request.mode !== "navigate") return;
  if (url.origin !== self.location.origin || /^\/(api|oauth|\.well-known)(\/|$)/.test(url.pathname))
    return;
  event.respondWith(
    fetch(request).catch(async () => {
      const fallback = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
      return fallback ?? Response.error();
    }),
  );
});
