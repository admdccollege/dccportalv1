// DCC Portal service worker. Bump VERSION to replace all caches.
const VERSION = "v1";
const STATIC_CACHE = `dcc-static-${VERSION}`;
const PAGE_CACHE = `dcc-pages-${VERSION}`;
const SHELL = ["/offline", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];
// Pages kept for offline attendance. Other pages hold private records and are never cached.
const OFFLINE_PAGES = ["/attendance"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = [STATIC_CACHE, PAGE_CACHE];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")
    || /\.(?:woff2?|ttf|otf|css)$/.test(url.pathname);
  if (isStatic) { event.respondWith(cacheFirst(request)); return; }
  if (request.mode === "navigate") event.respondWith(networkFirstPage(request, url));
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstPage(request, url) {
  const cacheable = OFFLINE_PAGES.includes(url.pathname);
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (cacheable && response.ok && !response.redirected) cache.put(url.pathname, response.clone());
    return response;
  } catch {
    if (cacheable) { const hit = await cache.match(url.pathname); if (hit) return hit; }
    return (await caches.match("/offline")) || Response.error();
  }
}

// Clears saved pages on sign-out so the next person on a shared device can't open them.
self.addEventListener("message", (event) => {
  if (event.data === "clear-private-cache") event.waitUntil(caches.delete(PAGE_CACHE));
});

function openQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("dcc-offline", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("queue", { keyPath: "clientId" });
      req.result.createObjectStore("rosters", { keyPath: "sectionId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const idbDo = (db, mode, fn) => new Promise((resolve, reject) => {
  const tx = db.transaction("queue", mode);
  const req = fn(tx.objectStore("queue"));
  tx.oncomplete = () => resolve(req.result);
  tx.onerror = () => reject(tx.error);
});

self.addEventListener("sync", (event) => {
  if (event.tag === "attendance-sync") event.waitUntil(syncAttendance());
});

async function syncAttendance() {
  const db = await openQueue();
  const items = await idbDo(db, "readonly", (s) => s.getAll());
  for (const item of items) {
    // A network failure throws, so the browser retries this sync later.
    const res = await fetch("/api/attendance/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify(item),
    });
    if (res.ok) {
      await idbDo(db, "readwrite", (s) => s.delete(item.clientId));
    } else if ([400, 403, 409, 422].includes(res.status)) {
      const body = await res.json().catch(() => ({}));
      await idbDo(db, "readwrite", (s) => s.put({ ...item, lastError: body.error || "Rejected by the server" }));
    } else if (res.status === 401) {
      return; // Signed out. The queue is sent after the next sign-in.
    } else {
      throw new Error(`Sync failed with status ${res.status}`);
    }
  }
  for (const client of await self.clients.matchAll()) client.postMessage("attendance-synced");
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "DCC Portal", body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "DCC Portal", {
    body: data.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    tag: data.tag, data: { url: data.url || "/dashboard" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin);
  // Only ever opens pages on this site.
  if (url.origin === self.location.origin) event.waitUntil(self.clients.openWindow(url.href));
});
