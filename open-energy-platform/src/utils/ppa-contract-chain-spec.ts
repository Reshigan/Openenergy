// ═══════════════════════════════════════════════════════════════════════════
// Wave 22 — Offtaker PPA contract execution lifecycle.
//
// Pure state-machine helpers — no I/O. Slots between Wave 19 (procurement
// award) and Wave 7 (monthly PPA delivery). Strategic-tier (≥100MW, NERSA
// Section 34 determination) crossings into regulator inbox on execute,
// terminate, and persistent-dispute (14d in dispute).
//
// 9 states · 3 terminals · 1 dispute branch:
//   draft → in_negotiation → terms_locked → legal_signed → executed → in_force
//   in_force ↔ in_dispute   (dispute / resolve)
//   any non-terminal → cancelled        (pre-executed only)
//   any non-terminal → terminated       (post-executed)
//   in_force → expired                  (cron on natural end)
//
// Per-tier SLAs (strategic gets MORE time — more due diligence):
//   draft → in_negotiation:        strategic 90d / medium 60d / small 30d
//   in_negotiation → terms_locked: strategic 180d / medium 90d / small 45d
//   terms_locked → legal_signed:   strategic 60d / medium 30d / small 14d
//   legal_signed → executed:       strategic 30d / medium 14d / small 7d
//   executed → in_force:           strategic 18mo / medium 12mo / small 6mo (waits for COD)
//   in_force → expired/disputed:   no SLA (continuous monitoring)
//   in_dispute → resolved:         strategic 30d / medium 14d / small 7d
// ═══════════════════════════════════════════════════════════════════════════

export type PpaStatus =
  | 'draft' | 'in_negotiation' | 'terms_locked' | 'legal_signed'
  | 'executed' | 'in_force' | 'in_dispute'
  | 'terminated' | 'expired' | 'cancelled';

export type PpaAction =
  | 'begin_negotiation' | 'lock_terms' | 'legal_sign' | 'execute'
  | 'commence' | 'dispute' | 'resolve'
  | 'terminate' | 'expire' | 'cancel';

export type PpaTier = 'strategic' | 'medium' | 'small';

const TERMINALS: ReadonlySet<PpaStatus> = new Set(['terminated', 'expired', 'cancelled']);

export function isTerminal(s: PpaStatus): boolean {
  return TERMINALS.has(s);
}

export function isTier(s: string): s is PpaTier {
  return s === 'strategic' || s === 'medium' || s === 'small';
}

const TRANSITIONS: Record<PpaAction, { from: PpaStatus[]; to: PpaStatus }> = {
  begin_negotiation: { from: ['draft'],                              to: 'in_negotiation' },
  lock_terms:        { from: ['in_negotiation'],                     to: 'terms_locked' },
  legal_sign:        { from: ['terms_locked'],                       to: 'legal_signed' },
  execute:           { from: ['legal_signed'],                       to: 'executed' },
  commence:          { from: ['executed'],                           to: 'in_force' },
  dispute:           { from: ['in_force'],                           to: 'in_dispute' },
  resolve:           { from: ['in_dispute'],                         to: 'in_force' },
  terminate:         { from: ['executed','in_force','in_dispute'],   to: 'terminated' },
  expire:            { from: ['in_force'],                           to: 'expired' },
  cancel:            { from: ['draft','in_negotiation','terms_locked','legal_signed'], to: 'cancelled' },
};

export function advance(current: PpaStatus, action: PpaAction): PpaStatus {
  const t = TRANSITIONS[action];
  if (!t) throw new Error(`Unknown action: ${action}`);
  if (!t.from.includes(current)) {
    throw new Error(`Cannot ${action} from state ${current}`);
  }
  return t.to;
}

// ─── SLA matrix (minutes) ──────────────────────────────────────────────────
type SlaRow = { strategic: number; medium: number; small: number };

export const SLA_MINUTES: Record<PpaStatus, SlaRow> = {
  draft:           { strategic: 90 * 1440,  medium: 60 * 1440, small: 30 * 1440 },
  in_negotiation:  { strategic: 180 * 1440, medium: 90 * 1440, small: 45 * 1440 },
  terms_locked:    { strategic: 60 * 1440,  medium: 30 * 1440, small: 14 * 1440 },
  legal_signed:    { strategic: 30 * 1440,  medium: 14 * 1440, small:  7 * 1440 },
  executed:        { strategic: 540 * 1440, medium: 365 * 1440, small: 180 * 1440 }, // 18/12/6mo
  in_force:        { strategic: 0, medium: 0, small: 0 },
  in_dispute:      { strategic: 30 * 1440,  medium: 14 * 1440, small:  7 * 1440 },
  terminated:      { strategic: 0, medium: 0, small: 0 },
  expired:         { strategic: 0, medium: 0, small: 0 },
  cancelled:       { strategic: 0, medium: 0, small: 0 },
};

export function slaDueAt(from: Date, status: PpaStatus, tier: PpaTier): string | null {
  const m = SLA_MINUTES[status][tier];
  if (m <= 0) return null;
  return new Date(from.getTime() + m * 60_000).toISOString();
}

// ─── Tier classification ───────────────────────────────────────────────────
export function tierFromMw(mw: number | null | undefined): PpaTier {
  if (mw === null || mw === undefined) return 'small';
  if (mw >= 100) return 'strategic';
  if (mw >= 10)  return 'medium';
  return 'small';
}

// ─── Regulator inbox crossings ─────────────────────────────────────────────
// Strategic-tier execute/terminate cross immediately. In-dispute is auto-
// crossed by the cron sweep after 14d (handled in the route, not here).
export function crossesIntoRegulator(action: PpaAction, tier: PpaTier): boolean {
  if (tier !== 'strategic') return false;
  return action === 'execute' || action === 'terminate';
}

export function slaBreachCrossesIntoRegulator(tier: PpaTier): boolean {
  return tier === 'strategic';
}
