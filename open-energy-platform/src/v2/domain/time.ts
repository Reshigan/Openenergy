import type { Duration, Instant } from './types';

export function isoUtc(i: Instant): string {
  return new Date(i.epoch_ms).toISOString();
}

export function addDuration(i: Instant, d: Duration): Instant {
  const ms = ((d.days ?? 0) * 86400 + (d.hours ?? 0) * 3600 + (d.minutes ?? 0) * 60) * 1000;
  return { epoch_ms: i.epoch_ms + ms, zone: 'UTC' };
}
