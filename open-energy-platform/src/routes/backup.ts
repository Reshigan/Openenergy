// ═══════════════════════════════════════════════════════════════════════════
// Backup & DR Routes — D1 → R2 scheduled export, listing, and signed download.
// ═══════════════════════════════════════════════════════════════════════════
// Admin-only surface used by GitHub Actions cron (POST /run) and the
// operator restore workflow (GET /list, GET /:key). Actual restore is
// performed manually via `wrangler d1 execute --file=<dump>.sql` per the
// runbook in docs/runbooks/restore.md — we never replay a backup from an
// HTTP endpoint because that is a foot-gun (ambient admin credentials
// could wipe prod).
//
// The cron endpoint can authenticate two ways:
//   1. Bearer token from admin login (dev / on-demand usage).
//   2. Header `X-Backup-Token` matching env.BACKUP_TOKEN (GitHub Actions).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { dumpDatabase, gzipString } from '../utils/d1-export';
import { logger } from '../utils/logger';

const backup = new Hono<HonoEnv>();

// Constant-time comparison of two strings. We sign each value with the same
// ephemeral HMAC-SHA256 key and then byte-compare the 32-byte digests. The
// Workers runtime does not expose crypto.subtle.timingSafeEqual, so this is
// the standard portable pattern. Unequal-length inputs are rejected early.
async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || b.length === 0) return false;
  const enc = new TextEncoder();
  const keyBytes = new Uint8Array(32);
  crypto.getRandomValues(keyBytes);
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const [da, db] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const av = new Uint8Array(da);
  const bv = new Uint8Array(db);
  if (av.length !== bv.length) return false;
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

// Accept either an admin JWT or a shared BACKUP_TOKEN header. The shared
// token is set via `wrangler secret put BACKUP_TOKEN` and is used by the
// scheduled GitHub Actions job so it doesn't need a real user session.
backup.use('*', async (c, next) => {
  const tokenHeader = c.req.header('X-Backup-Token') || '';
  const expected = (c.env as { BACKUP_TOKEN?: string }).BACKUP_TOKEN;
  if (expected && tokenHeader && (await timingSafeEqualStr(tokenHeader, expected))) {
    await next();
    return;
  }
  // Fall back to admin JWT.
  return authMiddleware(c, async () => {
    const user = getCurrentUser(c);
    if (user.role !== 'admin') {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }
    await next();
  });
});

function keyFor(now: Date = new Date()): string {
  const iso = now.toISOString();
  const date = iso.slice(0, 10); // YYYY-MM-DD
  const stamp = iso.replace(/[:.]/g, '-');
  return `backups/${date}/d1-${stamp}.sql.gz`;
}

// Trigger a backup — dumps D1, gzips, writes to R2 with customMetadata that
// records row counts + table list so operators can eyeball the R2 console.
backup.post('/run', async (c) => {
  const started = Date.now();
  const reqId = c.get('requestId') as string | undefined;
  try {
    const dump = await dumpDatabase(c.env.DB, { pageSize: 500 });
    const gz = await gzipString(dump.sql);
    const key = keyFor(new Date(dump.generated_at));
    await c.env.R2.put(key, gz, {
      httpMetadata: {
        contentType: 'application/gzip',
        contentDisposition: `attachment; filename="${key.split('/').pop()}"`,
      },
      customMetadata: {
        generated_at: dump.generated_at,
        total_rows: String(dump.total_rows),
        table_count: String(dump.tables.length),
      },
    });
    // Persist a row in a small catalog table for quick listing (R2 list is
    // eventually-consistent and paginated). Catalog rows are tiny.
    await c.env.DB.prepare(
      `INSERT INTO backup_log (id, key, size_bytes, total_rows, table_count, generated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `bkp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        key,
        gz.length,
        dump.total_rows,
        dump.tables.length,
        dump.generated_at,
      )
      .run();

    const duration = Date.now() - started;
    logger.info('backup_completed', {
      req_id: reqId,
      key,
      size_bytes: gz.length,
      total_rows: dump.total_rows,
      table_count: dump.tables.length,
      latency_ms: duration,
    });

    return c.json({
      success: true,
      key,
      size_bytes: gz.length,
      total_rows: dump.total_rows,
      tables: dump.tables,
      generated_at: dump.generated_at,
      duration_ms: duration,
    });
  } catch (err) {
    logger.error('backup_failed', {
      req_id: reqId,
      error_name: (err as Error).name,
      error_message: (err as Error).message,
      error_stack: (err as Error).stack,
    });
    return c.json(
      { success: false, error: 'Backup failed', detail: (err as Error).message },
      500,
    );
  }
});

// List backups from the catalog (newest first). Falls back to R2 listing
// if the catalog table is empty (e.g. first deploy after migration).
backup.get('/list', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10) || 30, 200);
  const rows = await c.env.DB.prepare(
    `SELECT id, key, size_bytes, total_rows, table_count, generated_at
       FROM backup_log
      ORDER BY generated_at DESC
      LIMIT ?`,
  )
    .bind(limit)
    .all();
  if ((rows.results || []).length > 0) {
    return c.json({ success: true, source: 'catalog', items: rows.results });
  }
  // Fallback to R2 listing.
  const list = await c.env.R2.list({ prefix: 'backups/', limit });
  const items = (list.objects || []).map((o) => ({
    key: o.key,
    size_bytes: o.size,
    uploaded: o.uploaded,
    custom: o.customMetadata || {},
  }));
  return c.json({ success: true, source: 'r2', items });
});

// Download a backup — streams the gzipped SQL back to the caller.
backup.get('/download', async (c) => {
  const key = c.req.query('key');
  if (!key || !key.startsWith('backups/')) {
    return c.json({ success: false, error: "'key' must start with 'backups/'" }, 400);
  }
  const obj = await c.env.R2.get(key);
  if (!obj) return c.json({ success: false, error: 'Not found' }, 404);
  const headers = new Headers();
  headers.set('Content-Type', 'application/gzip');
  headers.set(
    'Content-Disposition',
    `attachment; filename="${key.split('/').pop()}"`,
  );
  headers.set('Cache-Control', 'private, no-store');
  return new Response(obj.body, { headers });
});

export default backup;
