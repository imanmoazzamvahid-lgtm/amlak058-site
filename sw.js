const CACHE_NAME = "amlak058-shell-v21";
const APP_SHELL = ["/", "/manifest.webmanifest?v=20", "/icon.svg?v=20", "/logo-mark.svg?v=18"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      // Do not cache private account/chat pages. Cache each public page under its own URL,
      // rather than overwriting the home page cache with every navigation.
      const isPrivate = url.pathname === "/chat.html" || url.pathname.startsWith("/my-divar/my-posts");
      if (response.ok && !isPrivate) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())).catch(() => {});
      }
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("/"))));
    return;
  }
  if (url.pathname === "/manifest.webmanifest" || url.pathname === "/icon.svg") {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});