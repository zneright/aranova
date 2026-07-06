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
  const url = new URL(e.request.url);

  // Ignore non-GET requests, Chrome extensions, Firestore, Stellar APIs, and Vite dev server requests
  if (
    e.request.method !== "GET" ||
    url.protocol.startsWith("chrome-extension") ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("stellar.org") ||
    url.pathname.includes("@vite") ||
    url.pathname.includes("@react-refresh") ||
    url.pathname.includes("node_modules")
  ) {
    return; // Let the browser handle it normally
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache new successful requests (only valid, non-opaque HTTP responses)
        if (res && res.status === 200 && res.type === "basic") {
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
          
          // Return offline fallback for navigation requests
          if (e.request.mode === "navigate") {
            return caches.match("/index.html");
          }
          
          // CRITICAL: Always return a valid Response to prevent "Failed to convert value to 'Response'" errors
          return new Response("", { status: 503, statusText: "Service Unavailable Offline" });
        });
      })
  );
});
