// ─────────────────────────────────────────────────────────────────────────
// Wave 68 — Counterparty Margin Call & Default Management chain (P6)
//
// A best-in-class trading venue runs a clearing/risk function that manages the
// COUNTERPARTY CREDIT and COLLATERAL relationship for every participant with an
// open position. The Financial Markets Act 19/2012 (clearing houses / CCPs), the
// FSCA Conduct Standards and the CPMI-IOSCO Principles for Financial Market
// Infrastructures (PFMI Principle 4 credit risk, 5 collateral, 6 margin, 13
// participant-default rules) require a documented, time-bound default-management
// process: mark exposure to market daily, call variation margin when utilisation
// breaches thresholds, give the member a cure window, and — if it cannot or will
// not post — declare a default, close out and net the positions, liquidate the
// pledged collateral, and (only if collateral is insufficient) draw on the
// mutualised DEFAULT FUND. This is the operational expression of the same
// Cover-1 default-resource standard the settlement layer discloses.
//
// W68 is the COUNTERPARTY-CREDIT / COLLATERAL lifecycle — distinct from the rest
// of the trading desk:
//   - [[project-wave2-trading-risk]] measures the venue's own MARKET risk (VaR)
//   - [[project-wave29-poslimit-chain]] caps regulatory POSITION SIZE (FSCA s41)
//   - [[project-wave3-settlement-p6]] settles matched trades (atomic DvP, margin gate)
//   - [[project-wave44-trade-reporting-chain]] reports trades to the repository
//   - [[project-wave52-market-abuse-chain]] surveils for abuse
//   - [[project-wave60-algo-cert-chain]] certifies the trading SYSTEMS
//   - kyc-deep admits the counterparty (FICA CDD + sanctions screening)
// W68 governs whether an admitted, trading counterparty keeps MEETING its
// collateral obligations, and what happens when it fails — the missing core of a
// clearing operation.
//
// Forward path (healthy → breach → cure → back to healthy):
//   limit_active → exposure_warning → margin_call_issued → collateral_received
//     → (cure_breach) → limit_active
//
// Restriction / escalation branch (member slow or unable to post):
//   {exposure_warning, margin_call_issued} → position_restriction
//   {margin_call_issued, position_restriction} → cure_period (final grace)
//
// Default waterfall (PFMI Principle 13):
//   {cure_period, position_restriction} → default_declared → close_out
//     → default_fund_draw (collateral shortfall) → recovered | written_off
//   close_out → recovered | written_off (collateral sufficient — no fund draw)
//
// Withdrawal (false alarm / exposure resolved on its own):
//   {exposure_warning, margin_call_issued} → withdrawn
//
// Tiers (5) by EXPOSURE AT RISK (ZAR mark-to-market), with a floor escalation for
// a systemically-important counterparty (a SIFI default threatens the whole venue
// regardless of the day's exposure number):
//   minor <R5m / moderate <R50m / material <R250m / major <R1bn / systemic >=R1bn
//
// SLA matrix is URGENT — the LARGER the exposure, the TIGHTER every window. A
// systemic counterparty in cure_period has hours; a minor exposure warning has
// days. Same flavour as [[project-wave34-load-curtailment-chain]] /
// [[project-wave50-reserve-activation-chain]] / [[project-wave67-grid-code-compliance-chain]].
//
// Reportability — the W68 SIGNATURE is DEFAULT-DRIVEN. Declaring a participant
// default is always a notifiable event to the FSCA / Prudential Authority:
//   declare_default crosses for EVERY tier — the distinctive
//        "the terminal escalation is always reportable" crossing (cf. W67
//        escalate_disconnection, W60 invoke_kill_switch).
//   draw_default_fund crosses for the high tiers (major + systemic) — mutualising
//        a loss onto the default fund is notifiable for material counterparties.
//   write_off crosses for the high tiers (major + systemic).
//   sla_breached crosses for the high tiers (major + systemic).
//
// Single write — the clearing house / risk desk drives every step; the member
// posts collateral out-of-band. actor_party tags whether a step represents the
// clearing house or the member (record_collateral), for the audit trail.
// ─────────────────────────────────────────────────────────────────────────

export type MarginStatus =
  | 'limit_active'
  | 'exposure_warning'
  | 'margin_call_issued'
  | 'collateral_received'
  | 'position_restriction'
  | 'cure_period'
  | 'default_declared'
  | 'close_out'
  | 'default_fund_draw'
  | 'recovered'
  | 'written_off'
  | 'withdrawn';

export type MarginAction =
  | 'issue_warning'
  | 'issue_margin_call'
  | 'record_collateral'
  | 'cure_breach'
  | 'restrict_positions'
  | 'open_cure_period'
  | 'declare_default'
  | 'begin_close_out'
  | 'draw_default_fund'
  | 'record_recovery'
  | 'write_off'
  | 'withdraw';

export type MarginTier = 'minor' | 'moderate' | 'material' | 'major' | 'systemic';

export type MarginParty = 'clearing_house' | 'member';

export type MarginEvent =
  | 'counterparty_margin.exposure_warning'
  | 'counterparty_margin.margin_call_issued'
  | 'counterparty_margin.collateral_received'
  | 'counterparty_margin.limit_active'
  | 'counterparty_margin.position_restriction'
  | 'counterparty_margin.cure_period'
  | 'counterparty_margin.default_declared'
  | 'counterparty_margin.close_out'
  | 'counterparty_margin.default_fund_draw'
  | 'counterparty_margin.recovered'
  | 'counterparty_margin.written_off'
  | 'counterparty_margin.withdrawn'
  | 'counterparty_margin.sla_breached';

const TERMINALS = new Set<MarginStatus>(['recovered', 'written_off', 'withdrawn']);

const WITHDRAWABLE = new Set<MarginStatus>(['exposure_warning', 'margin_call_issued']);

export function isTerminal(s: MarginStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: MarginStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export const TRANSITIONS: Record<MarginAction, { from: MarginStatus[]; to: MarginStatus }> = {
  issue_warning:      { from: ['limit_active'],                                        to: 'exposure_warning' },
  issue_margin_call:  { from: ['exposure_warning', 'position_restriction'],            to: 'margin_call_issued' },
  record_collateral:  { from: ['margin_call_issued', 'cure_period'],                   to: 'collateral_received' },
  cure_breach:        { from: ['collateral_received', 'exposure_warning'],             to: 'limit_active' },
  restrict_positions: { from: ['exposure_warning', 'margin_call_issued'],              to: 'position_restriction' },
  open_cure_period:   { from: ['margin_call_issued', 'position_restriction'],          to: 'cure_period' },
  declare_default:    { from: ['cure_period', 'position_restriction'],                 to: 'default_declared' },
  begin_close_out:    { from: ['default_declared'],                                    to: 'close_out' },
  draw_default_fund:  { from: ['close_out'],                                           to: 'default_fund_draw' },
  record_recovery:    { from: ['close_out', 'default_fund_draw'],                       to: 'recovered' },
  write_off:          { from: ['close_out', 'default_fund_draw'],                       to: 'written_off' },
  withdraw:           { from: ['exposure_warning', 'margin_call_issued'],              to: 'withdrawn' },
};

export function nextStatus(current: MarginStatus, action: MarginAction): MarginStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: MarginStatus): MarginAction[] {
  const acts: MarginAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [MarginAction, typeof TRANSITIONS[MarginAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER the exposure, the TIGHTER every window. Strictly
// decreasing minor → systemic per graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<MarginStatus, Record<MarginTier, number>> = {
  limit_active: {
    minor: 90 * DAY, moderate: 60 * DAY, material: 30 * DAY, major: 14 * DAY, systemic: 7 * DAY,
  },
  exposure_warning: {
    minor: 7 * DAY, moderate: 3 * DAY, material: 24 * HOUR, major: 8 * HOUR, systemic: 4 * HOUR,
  },
  margin_call_issued: {
    minor: 3 * DAY, moderate: 48 * HOUR, material: 24 * HOUR, major: 4 * HOUR, systemic: 2 * HOUR,
  },
  collateral_received: {
    minor: 2 * DAY, moderate: 24 * HOUR, material: 8 * HOUR, major: 4 * HOUR, systemic: 2 * HOUR,
  },
  position_restriction: {
    minor: 5 * DAY, moderate: 3 * DAY, material: 24 * HOUR, major: 8 * HOUR, systemic: 4 * HOUR,
  },
  cure_period: {
    minor: 48 * HOUR, moderate: 24 * HOUR, material: 8 * HOUR, major: 2 * HOUR, systemic: 1 * HOUR,
  },
  default_declared: {
    minor: 24 * HOUR, moderate: 12 * HOUR, material: 4 * HOUR, major: 2 * HOUR, systemic: 1 * HOUR,
  },
  close_out: {
    minor: 5 * DAY, moderate: 3 * DAY, material: 24 * HOUR, major: 12 * HOUR, systemic: 6 * HOUR,
  },
  default_fund_draw: {
    minor: 3 * DAY, moderate: 2 * DAY, material: 24 * HOUR, major: 8 * HOUR, systemic: 4 * HOUR,
  },
  recovered:   { minor: 0, moderate: 0, material: 0, major: 0, systemic: 0 },
  written_off: { minor: 0, moderate: 0, material: 0, major: 0, systemic: 0 },
  withdrawn:   { minor: 0, moderate: 0, material: 0, major: 0, systemic: 0 },
};

export function slaWindowMinutes(status: MarginStatus, tier: MarginTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: MarginStatus, tier: MarginTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const TIER_RANK: Record<MarginTier, number> = {
  minor: 0, moderate: 1, material: 2, major: 3, systemic: 4,
};

const RANK_TIER: MarginTier[] = ['minor', 'moderate', 'material', 'major', 'systemic'];

// Base tier from the exposure-at-risk (ZAR mark-to-market net of held collateral).
export function tierForExposureZar(zar: number): MarginTier {
  if (zar < 5000000) return 'minor';
  if (zar < 50000000) return 'moderate';
  if (zar < 250000000) return 'material';
  if (zar < 1000000000) return 'major';
  return 'systemic';
}

// A systemically-important counterparty threatens the whole venue regardless of
// the day's exposure number — floor its tier at 'major'.
export function systemicFloor(systemicallyImportant: boolean): MarginTier {
  return systemicallyImportant ? 'major' : 'minor';
}

// Effective tier = the higher of the exposure-based tier and the SIFI floor.
export function tierForExposure(zar: number, systemicallyImportant: boolean): MarginTier {
  const base = tierForExposureZar(zar);
  const floor = systemicFloor(systemicallyImportant);
  const rank = Math.max(TIER_RANK[base], TIER_RANK[floor]);
  return RANK_TIER[rank];
}

// The high tiers — reportability for fund draws, write-offs and SLA breaches
// attaches here.
const HIGH_TIERS = new Set<MarginTier>(['major', 'systemic']);

export function isHighTier(tier: MarginTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Reportability matrix (the W68 signature):
//   - declare_default crosses for EVERY tier — declaring a participant default is
//     always a notifiable event to the FSCA / Prudential Authority.
//   - draw_default_fund crosses for the high tiers (major + systemic).
//   - write_off crosses for the high tiers (major + systemic).
export function crossesIntoRegulator(action: MarginAction, tier: MarginTier): boolean {
  if (action === 'declare_default')   return true;
  if (action === 'draw_default_fund') return HIGH_TIERS.has(tier);
  if (action === 'write_off')         return HIGH_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: MarginTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for the
// high tiers (major + systemic).
export function isReportable(tier: MarginTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Party each action represents. The clearing house / risk desk drives the
// machinery; record_collateral represents the member posting collateral. Audit
// attribution only — the route gates every action to the clearing-desk write set.
const ACTION_PARTY: Record<MarginAction, MarginParty> = {
  issue_warning:      'clearing_house',
  issue_margin_call:  'clearing_house',
  record_collateral:  'member',
  cure_breach:        'clearing_house',
  restrict_positions: 'clearing_house',
  open_cure_period:   'clearing_house',
  declare_default:    'clearing_house',
  begin_close_out:    'clearing_house',
  draw_default_fund:  'clearing_house',
  record_recovery:    'clearing_house',
  write_off:          'clearing_house',
  withdraw:           'clearing_house',
};

export function partyForAction(action: MarginAction): MarginParty {
  return ACTION_PARTY[action];
}
