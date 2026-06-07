import type { CascadeContext } from './cascade';

// Shared accessors for cascade-rule payloads. These were duplicated verbatim in
// offtaker-procurement.ts, underserved-inboxes.ts and lifecycle-sequencing.ts;
// single-sourced here so the null/empty/finite guards stay consistent.

/** Read a non-empty string field from a cascade context's data payload. */
export function dstr(ctx: CascadeContext, key: string): string | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Read a finite number field from a cascade context's data payload. */
export function dnum(ctx: CascadeContext, key: string): number | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
