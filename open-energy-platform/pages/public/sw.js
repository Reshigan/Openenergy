/* ════════════════════════════════════════════════════════════════════════
 * CEC — Service Worker
 *
 * Strategy:
 *  - Precache the app shell on install (small set of static assets).
 *  - Runtime: network-first for /api/* (always try live, fall back to cache
 *    only as last resort with a "stale data" header), cache-first for hashed
 *    /assets/* bundles (immutable thanks to Vite's content hashing).
 *  - Background sync skipped — Workers cron + the live HTTP path handle the
 *    eventual-consistency story.
 *  - Push notifications scaffold included but registration is opt-in.
 * ═══════════════════════════════════════════════════════════════════════ */

// Bump this version on every release that ships new HTML / asset hashes.
// `activate` deletes caches whose key doesn't start with SW_VERSION, so any
// stale `/` HTML pointing at old /assets/* hashes gets evicted on next load.
const SW_VERSION = 'oe-sw-v1.3.2';
const STATIC_CACHE = `${SW_VERSION}-static`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

// `/` is intentionally NOT precached. The fetch handler always tries the
// network for HTML so a fresh deploy is visible without waiting for a SW
// update cycle. Offline users still get a cached HTML via the runtime cache
// (populated on each successful fetch), see fetch() handler below.
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/logos/oe-mark.svg',
  '/logos/oe-banner.svg',
  '/logos/oe-icon-192.png',
  '/logos/oe-icon-512.png',
  '/ltm-energy-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(SW_VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Auth endpoints — always go to network, never cache.
  if (url.pathname.startsWith('/api/auth')) {
    return;
  }

  // /api/* — network-first with a 30s timeout, cached fallback labelled stale.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Hashed Vite assets — cache-first (Vite content-hash makes these immutable).
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/logos/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // SPA shell — network-first. On success, store a copy in the runtime
  // cache so an offline reload still has something to show. On failure,
  // fall back to whatever the runtime cache has for `/`.
  event.respondWith(
    fetch(req)
      .then(async (resp) => {
        if (resp.ok && resp.headers.get('content-type')?.includes('text/html')) {
          try {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put('/', resp.clone());
          } catch { /* cache full / quota */ }
        }
        return resp;
      })
      .catch(async () => (await caches.match('/')) || new Response('Offline', { status: 503 })),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const resp = await fetch(req);
    // Only cache successful auth-protected GETs (avoid caching 401/403/5xx).
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(req);
    if (cached) {
      // Mark the response as stale so the UI can show a banner if it wants.
      const headers = new Headers(cached.headers);
      headers.set('x-oe-stale', '1');
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
    return new Response(JSON.stringify({ success: false, error: 'offline' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    // A hashed asset that 404s falls through to the SPA shell (200 text/html).
    // Never cache or serve that as a .js/.css — it triggers the browser's
    // "'text/html' is not a valid JavaScript MIME type" and poisons the cache.
    // Return 504 so the dynamic import rejects cleanly and the page can reload.
    const ct = resp.headers.get('content-type') || '';
    if (resp.ok && !ct.includes('text/html')) {
      cache.put(req, resp.clone());
      return resp;
    }
    if (ct.includes('text/html')) return new Response('', { status: 504 });
    return resp;
  } catch {
    return new Response('', { status: 504 });
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Push notifications scaffold — registration requires user opt-in + a server
// VAPID key. Wired up so the worker has the listener; activation happens
// when the user enables notifications from the settings page.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'Consolidated Energy Cockpit', body: 'You have a new notification.' };
  try { payload = event.data.json(); } catch { /* ignore */ }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/logos/oe-icon-192.png',
      badge: '/logos/oe-mark.svg',
      data: payload.data || {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/cockpit';
  event.waitUntil(self.clients.openWindow(target));
});

// ─── Background Sync — flushes the IndexedDB mutation queue on
// connectivity restore, even with the SPA closed. The SPA's
// pages/src/lib/offlineQueue.ts registers `oe-flush-mutations` on every
// enqueue; the browser fires `sync` when it sees the network return.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'oe-flush-mutations') return;
  event.waitUntil((async () => {
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'oe:flush-mutations' });
      }
      if (!clients.length) await drainQueueFromSw();
    } catch (e) { /* swallow — page will retry */ }
  })());
});

async function drainQueueFromSw() {
  return new Promise((resolve) => {
    const req = indexedDB.open('oe-field', 1);
    req.onerror = () => resolve(null);
    req.onsuccess = async () => {
      const db = req.result;
      try {
        const tx = db.transaction('mutations', 'readonly');
        const store = tx.objectStore('mutations');
        const all = await new Promise((res, rej) => {
          const r = store.getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => rej(r.error);
        });
        for (const m of (all || [])) {
          try {
            const headers = { ...(m.headers || {}) };
            let body;
            if (m.body != null) {
              headers['content-type'] = 'application/json';
              body = JSON.stringify(m.body);
            }
            const r = await fetch(m.url, { method: m.method, headers, body });
            if (r.ok) {
              const tx2 = db.transaction('mutations', 'readwrite');
              tx2.objectStore('mutations').delete(m.id);
            }
          } catch { /* SPA will retry on next visibility */ }
        }
      } catch { /* ignore */ }
      resolve(null);
    };
  });
}
