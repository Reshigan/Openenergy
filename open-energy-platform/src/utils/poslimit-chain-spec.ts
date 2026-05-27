// ─────────────────────────────────────────────────────────────────────────
// Wave 29 — Trader Position Limit Compliance chain (P6) — FSCA Section 41
//
// 10-state lifecycle for trader position-limit utilisation breaches. Every
// trading member operates within an FSCA-licensed position cap per instrument
// per tenor. When utilisation crosses warning / breach thresholds, the
// compliance desk kicks off a cure cycle. Pattern is the operational mirror
// of W2 (VaR) + W9 (MM compliance) — those measure quality; this enforces
// quantity.
//
//   within_limit → warning → soft_breach → hard_breach →
//   margin_call_issued → reduction_required → reduction_executing → cured
//
// Terminals: cured (good — back inside limit; happy outcome),
//            escalated (bad — forced liquidation triggered),
//            false_alarm (telemetry-driven stale reading).
//
// Tiers (drive SLA + regulator reportability):
//   prop          — Cat IIA proprietary desk, R5bn cap
//   market_maker  — Cat IIA-MM designated MM, R500m cap
//   retail        — Cat I retail member, R50m cap
//
// SLA matrix is MIXED — warning/breach progression uses FSCA hard windows
// (same across tiers), but the cure window is INVERTED (bigger book gets
// more unwind time). FSCA Section 41 makes hard_breach and margin_call
// reportable for prop + market_maker only; retail is already caught by the
// JSE-SRL Daily Trade Aggregate. Forced liquidation is reportable across
// every tier.
// ─────────────────────────────────────────────────────────────────────────

export type PosLimitStatus =
  | 'within_limit'
  | 'warning'
  | 'soft_breach'
  | 'hard_breach'
  | 'margin_call_issued'
  | 'reduction_required'
  | 'reduction_executing'
  | 'cured'
  | 'escalated'
  | 'false_alarm';

export type PosLimitAction =
  | 'raise_warning'
  | 'escalate_intraday'
  | 'escalate_overnight'
  | 'issue_margin_call'
  | 'require_reduction'
  | 'begin_reduction'
  | 'accept_cure'
  | 'force_liquidate'
  | 'mark_false_alarm';

export type PosLimitTier = 'prop' | 'market_maker' | 'retail';

export type PosLimitEvent =
  | 'poslimit.warning'
  | 'poslimit.soft_breach'
  | 'poslimit.hard_breach'
  | 'poslimit.margin_call_issued'
  | 'poslimit.reduction_required'
  | 'poslimit.reduction_executing'
  | 'poslimit.cured'
  | 'poslimit.escalated'
  | 'poslimit.false_alarm'
  | 'poslimit.sla_breached';

const TERMINALS = new Set<PosLimitStatus>(['cured', 'escalated', 'false_alarm']);

export function isTerminal(s: PosLimitStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<PosLimitAction, { from: PosLimitStatus[]; to: PosLimitStatus }> = {
  raise_warning:       { from: ['within_limit'],         to: 'warning' },
  escalate_intraday:   { from: ['warning'],              to: 'soft_breach' },
  escalate_overnight:  { from: ['soft_breach'],          to: 'hard_breach' },
  issue_margin_call:   { from: ['hard_breach'],          to: 'margin_call_issued' },
  require_reduction:   { from: ['margin_call_issued'],   to: 'reduction_required' },
  begin_reduction:     { from: ['reduction_required'],   to: 'reduction_executing' },
  accept_cure: {
    from: [
      'warning', 'soft_breach', 'hard_breach',
      'margin_call_issued', 'reduction_required', 'reduction_executing',
    ],
    to: 'cured',
  },
  force_liquidate: {
    from: ['margin_call_issued', 'reduction_required', 'reduction_executing'],
    to: 'escalated',
  },
  mark_false_alarm: {
    from: ['warning', 'soft_breach'],
    to: 'false_alarm',
  },
};

export function nextStatus(current: PosLimitStatus, action: PosLimitAction): PosLimitStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: PosLimitStatus): PosLimitAction[] {
  const acts: PosLimitAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [PosLimitAction, typeof TRANSITIONS[PosLimitAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;

// FSCA hard windows (same across tiers) for breach escalation;
// INVERTED tier cure windows (bigger book gets more unwind time).
export const SLA_MINUTES: Record<PosLimitStatus, Record<PosLimitTier, number>> = {
  within_limit: { prop: 0, market_maker: 0, retail: 0 },
  warning: {
    prop:         8 * HOUR,    // intraday EOD
    market_maker: 8 * HOUR,
    retail:       4 * HOUR,
  },
  soft_breach: {
    prop:         24 * HOUR,   // FSCA T+1 hard rule
    market_maker: 24 * HOUR,
    retail:       24 * HOUR,
  },
  hard_breach: {
    prop:         4 * HOUR,    // immediate margin call window
    market_maker: 4 * HOUR,
    retail:       4 * HOUR,
  },
  margin_call_issued: {
    prop:         72 * HOUR,   // INVERTED — bigger book more time
    market_maker: 48 * HOUR,
    retail:       24 * HOUR,
  },
  reduction_required: {
    prop:         24 * HOUR,
    market_maker: 12 * HOUR,
    retail:        6 * HOUR,
  },
  reduction_executing: {
    prop:         72 * HOUR,   // INVERTED — orderly unwind
    market_maker: 48 * HOUR,
    retail:       24 * HOUR,
  },
  cured:        { prop: 0, market_maker: 0, retail: 0 },
  escalated:    { prop: 0, market_maker: 0, retail: 0 },
  false_alarm:  { prop: 0, market_maker: 0, retail: 0 },
};

export function slaDeadlineFor(status: PosLimitStatus, tier: PosLimitTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// FSCA Section 41 reportability matrix.
// Retail breaches are already aggregated daily by JSE-SRL so they don't
// individually flow into the regulator inbox. Forced liquidation is the
// hard line — every tier crosses on escalated.
const BREACH_REPORTABLE = new Set<PosLimitTier>(['prop', 'market_maker']);
const ESCALATION_REPORTABLE = new Set<PosLimitTier>(['prop', 'market_maker', 'retail']);

export function isReportable(tier: PosLimitTier): boolean {
  return BREACH_REPORTABLE.has(tier);
}

export function crossesIntoRegulator(action: PosLimitAction, tier: PosLimitTier): boolean {
  if (action === 'escalate_overnight') return BREACH_REPORTABLE.has(tier);
  if (action === 'issue_margin_call')  return BREACH_REPORTABLE.has(tier);
  if (action === 'force_liquidate')    return ESCALATION_REPORTABLE.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: PosLimitTier): boolean {
  return ESCALATION_REPORTABLE.has(tier);
}
