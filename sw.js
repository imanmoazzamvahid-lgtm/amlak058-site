// PWA installation has been disabled for amlak058.ir.
self.addEventListener("install", function(event) {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", function(event) {
  event.waitUntil((async function() {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(function(key) { return caches.delete(key); }));
    } catch (error) {
      console.warn("PWA cache cleanup:", error);
    }
    try {
      await self.registration.unregister();
    } catch (error) {
      console.warn("PWA unregister:", error);
    }
    try {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clients.forEach(function(client) {
        if (client.url.startsWith(self.location.origin) && "navigate" in client) {
          client.navigate(client.url);
        }
      });
    } catch (error) {
      console.warn("PWA client refresh:", error);
    }
  })());
});
