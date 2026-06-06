// ═══════════════════════════════════════════════════════════════════════════
// Layer B — Commercial Intercept.
// computeAndRecordFee(ctx) looks up oe_fee_schedule by trigger_event = ctx.event,
// computes the fee against ctx.commercial.entity_value, and writes an
// oe_platform_revenue row. ALL FREE at launch: if no schedule row OR the row is
// disabled, it records a R0 'waived' row (so the pipeline + reporting are proven
// end-to-end with zero billing risk). Error-isolated by the caller.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from './cascade';

interface FeeScheduleRow {
  id: string;
  trigger_event: string;
  fee_type: 'bps' | 'flat_zar' | 'pct';
  rate: number;
  min_fee_zar: number | null;
  max_fee_zar: number | null;
  payer_role: string | null;
  payer_resolution: string;
  is_enabled: number;
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function computeRawFee(row: FeeScheduleRow, value: number): number {
  switch (row.fee_type) {
    case 'bps': return value * (row.rate / 10_000);
    case 'pct': return value * row.rate;
    case 'flat_zar': return row.rate;
    default: return 0;
  }
}

function clamp(fee: number, row: FeeScheduleRow): number {
  const lo = row.min_fee_zar;
  const hi = row.max_fee_zar;
  // Misconfigured schedule (min > max) would silently collapse every fee to a
  // single bound. Skip clamping rather than emit a wrong amount; the row is
  // auditable via oe_platform_revenue.fee_schedule_id.
  if (lo != null && hi != null && lo > hi) return fee;
  let f = fee;
  if (lo != null && f < lo) f = lo;
  if (hi != null && f > hi) f = hi;
  return f;
}

export async function computeAndRecordFee(ctx: CascadeContext): Promise<void> {
  const commercial = ctx.commercial;
  if (!commercial) return; // not a value-bearing transition

  const db = ctx.env.DB;
  const value = commercial.entity_value ?? 0; // undefined → treat as R0 (events not value-tagged)
  const period = commercial.billing_period ?? currentPeriod();

  const row = (await db
    .prepare(`SELECT * FROM oe_fee_schedule WHERE trigger_event = ?`)
    .bind(ctx.event)
    .first()) as FeeScheduleRow | null;

  let fee = 0;
  let status: 'pending' | 'waived' = 'waived';
  let scheduleId: string | null = null;
  let payerRole: string | null = null;

  if (row && row.is_enabled === 1) {
    fee = Math.round(clamp(computeRawFee(row, value), row) * 100) / 100;
    status = 'pending';
    scheduleId = row.id;
    payerRole = row.payer_role ?? null;
  }

  await db.prepare(
    `INSERT INTO oe_platform_revenue
       (id, trigger_event, entity_id, entity_type, participant_id, payer_role,
        entity_value, fee_zar, fee_schedule_id, billing_period, status, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `rev_${crypto.randomUUID()}`, ctx.event, ctx.entity_id, ctx.entity_type,
    commercial.participant_id ?? null, payerRole,
    value, fee, scheduleId, period, status, new Date().toISOString(),
  ).run();
}
