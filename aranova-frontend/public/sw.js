const CACHE_NAME = "aranova-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/logo_1.png",
  "/manifest.json"
];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network-first fallback to Cache)
self.addEventListener("fetch", (e) => {
  // Only handle GET requests and ignore chrome-extension URLs
  if (e.request.method !== "GET" || e.request.url.startsWith("chrome-extension://")) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache new successful requests
        if (res.status === 200) {
          const resCopy = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resCopy);
          });
        }
        return res;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(e.request).then((cachedRes) => {
          if (cachedRes) return cachedRes;
          // Return offline fallback if not cached
          if (e.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      })
  );
});
