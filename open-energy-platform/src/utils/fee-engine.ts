// ═══════════════════════════════════════════════════════════════════════════
// Layer B — Commercial Intercept.
// computeAndRecordFee(ctx) looks up oe_fee_schedule by trigger_event = ctx.event,
// computes the fee against the transition's ZAR value, resolves the payer per
// payer_resolution, and writes an oe_platform_revenue row (+ oe_revenue_splits
// when the fee is split). ALL FREE at launch: no row OR a disabled row records a
// R0 'waived' row so the pipeline + reporting are proven end-to-end with zero
// billing risk. Error-isolated by the caller (a throw lands in cascade_dlq).
//
// Value source: ctx.commercial.entity_value when the chain passes it; otherwise
// derived from ctx.data (chains spread their row into data) so a seeded event
// records even without explicit commercial context — without editing any chain.
// A non-billable event (no commercial AND no schedule row) stays silent.
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
  split_config: string | null;
}

interface SplitPart { party_role?: string; party_id?: string | null; share_pct?: number }

// Prioritised list of unambiguous ZAR value fields chains place in ctx.data.
// First positive number wins. Unmatched → 0 (records R0 'waived', which is the
// correct leakage signal until the chain is enriched to pass ctx.commercial).
const VALUE_KEYS = ['entity_value', 'value_zar', 'amount_zar', 'notional_zar', 'principal_zar', 'quantum_zar'] as const;
const PARTICIPANT_KEYS = ['participant_id', 'party_id', 'counterparty_id', 'borrower_id'] as const;

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function deriveValueFromData(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  for (const k of VALUE_KEYS) {
    const v = data[k];
    if (typeof v === 'number' && isFinite(v) && v > 0) return v;
  }
  return 0;
}

function deriveParticipantFromData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  for (const k of PARTICIPANT_KEYS) {
    const v = data[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
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

// Which role the revenue row records as payer. payer_resolution is config, not
// persisted on the revenue row — only the resolved payer_role is. 'platform'
// means the platform bears it (admin); 'split' detail lives in oe_revenue_splits.
function resolvePayer(row: FeeScheduleRow): string | null {
  if (row.payer_resolution === 'platform') return 'admin';
  return row.payer_role ?? null; // initiator | beneficiary | split → configured payer
}

async function writeSplits(
  db: CascadeContext['env']['DB'],
  revenueId: string,
  fee: number,
  splitConfig: string | null,
): Promise<void> {
  if (fee <= 0 || !splitConfig) return;
  let parts: SplitPart[];
  try { parts = JSON.parse(splitConfig); } catch { return; }
  if (!Array.isArray(parts) || parts.length === 0) return;
  for (const p of parts) {
    const share = Number(p.share_pct) || 0; // 0..1 fraction
    if (share <= 0) continue;
    const amount = Math.round(fee * share * 100) / 100;
    await db.prepare(
      `INSERT INTO oe_revenue_splits (id, revenue_id, party_role, party_id, share_pct, amount_zar)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(`rsp_${crypto.randomUUID()}`, revenueId, p.party_role ?? 'unknown', p.party_id ?? null, share, amount).run();
  }
}

export async function computeAndRecordFee(ctx: CascadeContext): Promise<void> {
  const db = ctx.env.DB;
  const commercial = ctx.commercial;

  const row = (await db
    .prepare(`SELECT * FROM oe_fee_schedule WHERE trigger_event = ?`)
    .bind(ctx.event)
    .first()) as FeeScheduleRow | null;

  // Not a value-bearing transition and not on the rate card → nothing to record.
  if (!commercial && !row) return;

  const value = commercial?.entity_value ?? deriveValueFromData(ctx.data);
  const participant = commercial?.participant_id ?? deriveParticipantFromData(ctx.data);
  const period = commercial?.billing_period ?? currentPeriod();

  let fee = 0;
  let status: 'pending' | 'waived' = 'waived';
  let scheduleId: string | null = null;
  let payerRole: string | null = null;

  if (row && row.is_enabled === 1) {
    fee = Math.round(clamp(computeRawFee(row, value), row) * 100) / 100;
    status = 'pending';
    scheduleId = row.id;
    payerRole = resolvePayer(row);
  }

  const revenueId = `rev_${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO oe_platform_revenue
       (id, trigger_event, entity_id, entity_type, participant_id, payer_role,
        entity_value, fee_zar, fee_schedule_id, billing_period, status, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    revenueId, ctx.event, ctx.entity_id, ctx.entity_type,
    participant ?? null, payerRole,
    value, fee, scheduleId, period, status, new Date().toISOString(),
  ).run();

  if (row && row.is_enabled === 1 && row.payer_resolution === 'split') {
    await writeSplits(db, revenueId, fee, row.split_config);
  }
}
