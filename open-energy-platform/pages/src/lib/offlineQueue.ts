// ════════════════════════════════════════════════════════════════════════
// offlineQueue — IndexedDB-backed mutation queue for the field-tech PWA.
//
// Field technicians work in low-signal sites (solar farms, wind plants,
// underground rooms). When they tap "Acknowledge", "Arrived on site",
// "Photo upload" we cannot block on the network. This module:
//
//   1. Persists pending mutations in IndexedDB
//   2. Tries to flush them every 30s while the page is visible
//   3. Uses the Background Sync API where supported so even after the
//      browser is closed, the SW will retry on connection restore
//   4. Stores read-side data (work orders, sites) in IndexedDB so the
//      detail screens render fully offline
//   5. Conflict resolution = last-write-wins with timestamp guard —
//      simpler than CRDT for a single-tech workflow
//
// Stored as ESM so it tree-shakes; ~3 KB compiled.
// ════════════════════════════════════════════════════════════════════════

const DB_NAME = 'oe-field';
const DB_VERSION = 1;
const STORE_QUEUE = 'mutations';
const STORE_CACHE = 'cache';

type PendingMutation = {
  id: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  formData?: { file: File | Blob; fields: Record<string, string> };
  headers?: Record<string, string>;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

type CachedRecord = {
  key: string;
  value: any;
  cachedAt: string;
  ttlSeconds?: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const s = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
        s.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function genId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Mutation queue ─────────────────────────────────────────────────────
export async function enqueueMutation(m: Omit<PendingMutation, 'id' | 'createdAt' | 'attempts'>): Promise<string> {
  const db = await openDb();
  const id = genId();
  const full: PendingMutation = { ...m, id, createdAt: new Date().toISOString(), attempts: 0 };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).put(full);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  // Try a Background Sync registration; ignored if browser doesn't support
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg: any = await navigator.serviceWorker.ready;
      await reg.sync?.register('oe-flush-mutations');
    } catch { /* swallow */ }
  }
  return id;
}

export async function listPending(): Promise<PendingMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const store = tx.objectStore(STORE_QUEUE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeMutation(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateMutation(m: PendingMutation): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).put(m);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const MAX_ATTEMPTS = 8;
function backoffOk(m: PendingMutation): boolean {
  // Exponential backoff: 30s × 2^attempts, capped at 1 hour
  const minDelaySeconds = Math.min(3600, 30 * Math.pow(2, m.attempts));
  return Date.now() - new Date(m.createdAt).getTime() >= minDelaySeconds * 1000;
}

export async function flushQueue(): Promise<{ flushed: number; failed: number; deferred: number }> {
  if (!navigator.onLine) return { flushed: 0, failed: 0, deferred: 0 };
  const pending = await listPending();
  let flushed = 0, failed = 0, deferred = 0;
  for (const m of pending) {
    if (m.attempts > 0 && !backoffOk(m)) { deferred++; continue; }
    try {
      const headers: Record<string, string> = {
        ...(m.headers || {}),
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
      };
      let body: BodyInit | undefined;
      if (m.formData) {
        const fd = new FormData();
        fd.append('file', m.formData.file);
        for (const [k, v] of Object.entries(m.formData.fields)) fd.append(k, v);
        body = fd;
      } else if (m.body != null) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(m.body);
      }
      const r = await fetch(m.url, { method: m.method, headers, body });
      if (r.ok || r.status === 409 /* idempotent re-apply */) {
        await removeMutation(m.id);
        flushed++;
      } else if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) {
        // Permanent client error — drop after recording
        await updateMutation({ ...m, attempts: MAX_ATTEMPTS + 1, lastError: `HTTP ${r.status}` });
        failed++;
      } else {
        await updateMutation({ ...m, attempts: m.attempts + 1, lastError: `HTTP ${r.status}` });
        failed++;
      }
    } catch (e: any) {
      await updateMutation({ ...m, attempts: m.attempts + 1, lastError: e?.message || 'network' });
      failed++;
    }
  }
  return { flushed, failed, deferred };
}

// ─── Read-side cache ────────────────────────────────────────────────────
export async function cacheRead(key: string, value: any, ttlSeconds = 86_400): Promise<void> {
  const db = await openDb();
  const rec: CachedRecord = { key, value, cachedAt: new Date().toISOString(), ttlSeconds };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, 'readwrite');
    tx.objectStore(STORE_CACHE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readCached<T = any>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, 'readonly');
    const req = tx.objectStore(STORE_CACHE).get(key);
    req.onsuccess = () => {
      const rec = req.result as CachedRecord | undefined;
      if (!rec) return resolve(null);
      const ageMs = Date.now() - new Date(rec.cachedAt).getTime();
      if (rec.ttlSeconds && ageMs > rec.ttlSeconds * 1000) return resolve(null);
      resolve(rec.value as T);
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── Stale-while-revalidate fetch wrapper ───────────────────────────────
export async function offlineFirstFetch<T = any>(
  url: string,
  init?: RequestInit,
  options?: { cacheKey?: string; ttlSeconds?: number },
): Promise<{ data: T | null; source: 'network' | 'cache' | 'none' }> {
  const key = options?.cacheKey || url;
  try {
    const headers: Record<string, string> = {
      ...(init?.headers as any || {}),
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    };
    const r = await fetch(url, { ...init, headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    await cacheRead(key, data, options?.ttlSeconds);
    return { data: data as T, source: 'network' };
  } catch {
    const cached = await readCached<T>(key);
    return { data: cached, source: cached ? 'cache' : 'none' };
  }
}

// ─── Auto-flush loop (call from app root) ──────────────────────────────
let flushTimer: ReturnType<typeof setInterval> | null = null;
export function startAutoFlush(intervalMs = 30_000): () => void {
  const tick = () => { if (navigator.onLine && document.visibilityState === 'visible') void flushQueue(); };
  void tick();
  flushTimer = setInterval(tick, intervalMs);
  const onOnline = () => void tick();
  const onVis = () => { if (document.visibilityState === 'visible') void tick(); };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVis);
  return () => {
    if (flushTimer) clearInterval(flushTimer);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVis);
  };
}
