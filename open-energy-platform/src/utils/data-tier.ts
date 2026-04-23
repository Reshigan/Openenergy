// ═══════════════════════════════════════════════════════════════════════════
// Data tier partitioning helpers — pure. Used by archival cron + summary
// maintenance cron. The heavy-lifting DB ops are in the routes; this module
// contains the deterministic helpers (bucket keys, retention windows).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return the YYYY-MM month bucket for a given ISO datetime/date.
 */
export function monthBucket(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Return the YYYY-MM-DD day bucket for a given ISO datetime/date.
 */
export function dayBucket(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Build an R2 key for a metering-readings archive.
 * Format: archive/metering/<YYYY>/<MM>/<connection_id>.json.gz
 */
export function meteringArchiveKey(connectionId: string, monthBucketStr: string): string {
  const [y, m] = monthBucketStr.split('-');
  return `archive/metering/${y}/${m}/${sanitiseKey(connectionId)}.json.gz`;
}

/**
 * Build an R2 key for an audit-log archive.
 * Format: archive/audit/<YYYY>/<MM>/<YYYY-MM-DD>.json.gz
 */
export function auditArchiveKey(dayBucketStr: string): string {
  const [y, m] = dayBucketStr.split('-');
  return `archive/audit/${y}/${m}/${dayBucketStr}.json.gz`;
}

/**
 * Decide whether a row with `createdAt` should be archived now, given the
 * retention window (default 90 days) and a comparison date.
 */
export function shouldArchive(createdAt: string, nowIso: string, retentionDays: number = 90): boolean {
  const created = Date.parse(createdAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(created) || Number.isNaN(now)) return false;
  const ageDays = (now - created) / (1000 * 60 * 60 * 24);
  return ageDays >= retentionDays;
}

/**
 * Token-bucket rate limit check — deterministic calculation only (caller
 * persists state). Given existing (stored_tokens, last_refill_at) and the
 * limit configuration, compute the new token count and whether the request
 * is allowed.
 */
export function tokenBucketCheck(params: {
  stored_tokens: number;
  last_refill_at_ms: number;
  now_ms: number;
  window_seconds: number;
  max_requests: number;
  burst_capacity: number;
  request_cost: number;
}): { allowed: boolean; new_tokens: number; new_refill_at_ms: number; retry_after_seconds: number } {
  const { stored_tokens, last_refill_at_ms, now_ms, window_seconds, max_requests, burst_capacity, request_cost } = params;
  const capacity = Math.max(max_requests, max_requests + burst_capacity);
  const refillPerMs = max_requests / (window_seconds * 1000);
  const elapsed = Math.max(0, now_ms - last_refill_at_ms);
  const refilled = Math.min(capacity, stored_tokens + elapsed * refillPerMs);

  if (refilled >= request_cost) {
    return {
      allowed: true,
      new_tokens: refilled - request_cost,
      new_refill_at_ms: now_ms,
      retry_after_seconds: 0,
    };
  }
  // Not enough tokens — compute how long the caller should wait.
  const missing = request_cost - refilled;
  const waitMs = refillPerMs > 0 ? missing / refillPerMs : window_seconds * 1000;
  return {
    allowed: false,
    new_tokens: refilled,
    new_refill_at_ms: now_ms,
    retry_after_seconds: Math.ceil(waitMs / 1000),
  };
}

function sanitiseKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}
