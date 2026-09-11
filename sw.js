/* Offline cache for the expense tracker. Bump CACHE when you upload a new build. */
const CACHE = "finix-v16";
const CORE = ["./", "./index.html", "./manifest.json"];
const ICONS = ["./apple-touch-icon.png", "./icon-192.png", "./icon-512.png", "./logo.png"];
const NAV_TIMEOUT = 3000;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Icons are added one by one: a missing icon should not fail the whole install
      // and leave the app with no offline support at all.
      .then((c) => c.addAll(CORE).then(() => Promise.all(ICONS.map((u) => c.add(u).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Newest version when online, cached copy when not. Only a good response is
    // cached, so a 404/500 from a half-finished deploy can never become the
    // offline fallback.
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy));
      }
      return res;
    });
    // A hanging request never rejects, so race it: the cached shell beats
    // staring at a blank screen. The fetch above still refreshes the cache
    // if it eventually lands.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("slow network")), NAV_TIMEOUT)
    );
    e.respondWith(
      Promise.race([network, timeout])
        .catch(() => caches.match("./index.html"))
        .then((r) => r || caches.match("./"))
        .then((r) => r || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } }))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
