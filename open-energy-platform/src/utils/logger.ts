// ═══════════════════════════════════════════════════════════════════════════
// Structured Logger — JSON lines on stdout, consumable by Cloudflare Logpush.
// ═══════════════════════════════════════════════════════════════════════════
// Every entry is a single-line JSON object with a stable schema so log
// aggregators (Logpush → R2 / Datadog / BigQuery) can index without parsing.
// Log levels are printed via the corresponding console.* so Cloudflare's
// Workers log tail filters (info/warn/error) still apply.
// ═══════════════════════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  req_id?: string;
  route?: string;
  method?: string;
  status?: number;
  latency_ms?: number;
  participant_id?: string;
  tenant_id?: string;
  event?: string;
  error_name?: string;
  error_message?: string;
  error_stack?: string;
  // Free-form extras (never leak secrets here — the object is serialised raw).
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  };
  const line = (() => {
    try {
      return JSON.stringify(entry);
    } catch {
      // Circular or un-serialisable — fall back to a plain string so the
      // original log is never lost.
      return JSON.stringify({ ts: entry.ts, level, msg: message, _err: 'serialise_failed' });
    }
  })();

  switch (level) {
    case 'debug':
    case 'info':
      // eslint-disable-next-line no-console
      console.log(line);
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(line);
      break;
    case 'error':
      // eslint-disable-next-line no-console
      console.error(line);
      break;
  }
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
};

// Helper: floor an ISO timestamp down to a 15-minute bucket boundary.
export function bucketStart(now = new Date()): string {
  const ms = now.getTime();
  const bucketMs = 15 * 60 * 1000;
  const floored = new Date(Math.floor(ms / bucketMs) * bucketMs);
  return floored.toISOString();
}

export function statusClass(status: number): '2xx' | '3xx' | '4xx' | '5xx' | 'other' {
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'other';
}

/**
 * Best-effort upsert of a request_stats bucket row. Never throws — logging
 * must not break the request.
 */
export async function recordRequestStat(
  db: any,
  route: string,
  method: string,
  status: number,
  latencyMs: number,
): Promise<void> {
  try {
    const bucket = bucketStart();
    const cls = statusClass(status);
    const slow = latencyMs > 1000 ? 1 : 0;
    const id = `rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // Single-statement UPSERT: the unique index
    // idx_request_stats_bucket(bucket_start, route, method, status_class) makes
    // ON CONFLICT atomic, so two concurrent writes to the same bucket can't
    // both hit the "insert" branch and lose one of them to a UNIQUE violation.
    await db
      .prepare(
        `INSERT INTO request_stats
           (id, bucket_start, route, method, status_class,
            count, latency_ms_sum, latency_ms_max, slow_count)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(bucket_start, route, method, status_class) DO UPDATE SET
           count          = count + 1,
           latency_ms_sum = latency_ms_sum + excluded.latency_ms_sum,
           latency_ms_max = MAX(latency_ms_max, excluded.latency_ms_max),
           slow_count     = slow_count + excluded.slow_count`,
      )
      .bind(id, bucket, route, method, cls, latencyMs, latencyMs, slow)
      .run();
  } catch {
    /* swallow — stats are best-effort */
  }
}

/**
 * Normalise a request path to its route template so per-route stats aren't
 * fragmented across every UUID. Matches hex IDs, numeric IDs, and Open Energy
 * short IDs (ct_…, ppa_…, ord_…, etc.).
 */
export function normaliseRoute(path: string): string {
  return path
    .replace(/\/[a-z]+_[a-z0-9]{6,}/gi, '/:id')
    .replace(/\/[0-9a-f]{8,}(?=\/|$)/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}
