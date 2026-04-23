import { describe, it, expect } from 'vitest';
import {
  auditArchiveKey,
  dayBucket,
  meteringArchiveKey,
  monthBucket,
  shouldArchive,
  tokenBucketCheck,
} from '../src/utils/data-tier';

describe('bucket helpers', () => {
  it('derives the month bucket from an ISO datetime', () => {
    expect(monthBucket('2026-04-23T14:30:00Z')).toBe('2026-04');
  });
  it('derives the day bucket from an ISO datetime', () => {
    expect(dayBucket('2026-04-23T14:30:00Z')).toBe('2026-04-23');
  });
});

describe('archive key generation', () => {
  it('builds a metering archive key partitioned by year/month/connection', () => {
    expect(meteringArchiveKey('conn_abc', '2026-04')).toBe('archive/metering/2026/04/conn_abc.json.gz');
  });
  it('sanitises path-traversal characters out of connection ids', () => {
    const key = meteringArchiveKey('conn/../../etc/passwd', '2026-04');
    // The result must stay inside the archive/metering/YYYY/MM/ prefix and
    // contain no `..` path components that could escape the bucket.
    expect(key.startsWith('archive/metering/2026/04/')).toBe(true);
    expect(key.endsWith('.json.gz')).toBe(true);
    const file = key.slice('archive/metering/2026/04/'.length);
    expect(file).not.toContain('/');
    expect(file).not.toContain('..');
  });
  it('builds an audit archive key per day', () => {
    expect(auditArchiveKey('2026-04-23')).toBe('archive/audit/2026/04/2026-04-23.json.gz');
  });
});

describe('shouldArchive', () => {
  it('returns true for a row older than the retention window', () => {
    expect(shouldArchive('2024-01-01T00:00:00Z', '2026-04-23T00:00:00Z', 90)).toBe(true);
  });
  it('returns false for a row still inside the retention window', () => {
    expect(shouldArchive('2026-04-01T00:00:00Z', '2026-04-23T00:00:00Z', 90)).toBe(false);
  });
  it('guards against invalid timestamps', () => {
    expect(shouldArchive('not-a-date', '2026-04-23T00:00:00Z')).toBe(false);
  });
});

describe('tokenBucketCheck', () => {
  const baseArgs = {
    stored_tokens: 10,
    last_refill_at_ms: 1_700_000_000_000,
    now_ms: 1_700_000_000_000,
    window_seconds: 60,
    max_requests: 10,
    burst_capacity: 0,
    request_cost: 1,
  };

  it('allows a request when tokens are available', () => {
    const r = tokenBucketCheck(baseArgs);
    expect(r.allowed).toBe(true);
    expect(r.new_tokens).toBe(9);
  });

  it('denies when not enough tokens, reports retry_after > 0', () => {
    const r = tokenBucketCheck({ ...baseArgs, stored_tokens: 0 });
    expect(r.allowed).toBe(false);
    expect(r.retry_after_seconds).toBeGreaterThanOrEqual(1);
  });

  it('refills tokens over time', () => {
    const r = tokenBucketCheck({
      ...baseArgs,
      stored_tokens: 0,
      last_refill_at_ms: 1_700_000_000_000,
      now_ms: 1_700_000_030_000, // 30s later
    });
    // 30s worth at 10 req / 60s = 5 tokens refilled
    expect(r.allowed).toBe(true);
    expect(r.new_tokens).toBeCloseTo(4, 1);
  });

  it('respects burst capacity without exceeding it', () => {
    const r = tokenBucketCheck({
      ...baseArgs,
      stored_tokens: 999, // well above capacity
      now_ms: 1_700_000_000_000,
      burst_capacity: 5,
    });
    // Should cap new_tokens at max_requests + burst = 15, then minus 1 cost = 14.
    expect(r.allowed).toBe(true);
    expect(r.new_tokens).toBeLessThanOrEqual(14);
  });

  it('allows an arbitrary request cost (e.g. expensive endpoints)', () => {
    const r = tokenBucketCheck({ ...baseArgs, stored_tokens: 10, request_cost: 5 });
    expect(r.allowed).toBe(true);
    expect(r.new_tokens).toBe(5);
  });
});
