// ─────────────────────────────────────────────────────────────────────────
// Wave 39 — Offtaker PPA Tariff Indexation / CPI Escalation chain (P6)
//
// NERSA ERA 2006 §4 tariff oversight + IFRS 16 lease re-measurement +
// PPA indexation clauses. Every long-term PPA fixes a base tariff (R/MWh) at
// financial close and escalates it on each contract anniversary by a published
// index (Stats SA CPI, PPI, or a CPI+forex blend). The annual escalation is a
// formal, calendar-driven event: the seller publishes the reference index,
// calculates the escalation factor, issues an indexation notice, the offtaker
// reviews it, and the parties agree the new tariff before it is applied to
// invoicing. A disagreement on the index basis or arithmetic routes through the
// dispute / recalculation / arbitration branches (NERSA tariff oversight).
//
// This is the ANNUAL repricing backbone that sits alongside the one-off
// [[project-wave22-ppa-contract-chain]] (contract execution) and the
// year-end [[project-wave32-take-or-pay-chain]] (shortfall reconciliation)
// offtaker chains. PPA execution sets the base tariff; this chain reprices it
// every anniversary; take-or-pay reconciles the volume against it.
//
//   indexation_due → index_published → escalation_calculated → notice_issued
//     → under_review → tariff_agreed → applied
//
// Dispute branch:
//   notice_issued|under_review → disputed
//     → recalculated → notice_issued        (reissue with corrected basis)
//     → arbitrated                           (referred to NERSA / arbitration)
//   recalculated → arbitrated                (recalc still disputed)
//
// Tiers (PPA scale — drive SLA dispute windows + reportability):
//   utility_scale  — grid-scale IPP PPA; closest oversight
//   commercial     — C&I wheeling PPA; mid
//   embedded       — embedded / SSEG PPA; lightest oversight
//
// SLA matrix is MIXED — the machinery windows (publish → calculate → notice →
// review → agree) are UNIFORM across tiers (the indexation calendar is the same
// regardless of scale); only the dispute / recalculation windows are
// materiality-graded, and there utility_scale is TIGHTEST (a grid-scale tariff
// dispute must resolve fastest). Same flavour as
// [[project-wave36-best-execution-chain]].
//
// Reportability: refer_arbitration crosses to the regulator for EVERY tier
// (referring a tariff dispute to NERSA / arbitration is always notifiable —
// ERA §4 tariff oversight hard line); dispute declarations + SLA breaches cross
// for utility_scale + commercial only (embedded disputes sit between two private
// parties, less systemic).
//
// actor_party (seller / offtaker) is derived from the ACTION, not the JWT role
// — same model as [[project-wave38-covenant-certificate-chain]]. The seller
// publishes the index, calculates, issues / reissues notices, applies the
// tariff, and recalculates; the offtaker reviews, agrees, disputes, and refers
// to arbitration. Two-party split write guards the offtaker-write set
// server-side.
// ─────────────────────────────────────────────────────────────────────────

export type TariffIdxStatus =
  | 'indexation_due'
  | 'index_published'
  | 'escalation_calculated'
  | 'notice_issued'
  | 'under_review'
  | 'tariff_agreed'
  | 'applied'
  | 'disputed'
  | 'recalculated'
  | 'arbitrated'
  | 'withdrawn';

export type TariffIdxAction =
  | 'publish_index'
  | 'calculate_escalation'
  | 'issue_notice'
  | 'begin_review'
  | 'agree_tariff'
  | 'apply_tariff'
  | 'raise_dispute'
  | 'recalculate'
  | 'reissue_notice'
  | 'refer_arbitration'
  | 'withdraw';

export type TariffIdxTier = 'utility_scale' | 'commercial' | 'embedded';

export type TariffIdxEvent =
  | 'tariff_indexation.index_published'
  | 'tariff_indexation.escalation_calculated'
  | 'tariff_indexation.notice_issued'
  | 'tariff_indexation.under_review'
  | 'tariff_indexation.tariff_agreed'
  | 'tariff_indexation.applied'
  | 'tariff_indexation.disputed'
  | 'tariff_indexation.recalculated'
  | 'tariff_indexation.arbitrated'
  | 'tariff_indexation.withdrawn'
  | 'tariff_indexation.sla_breached';

const TERMINALS = new Set<TariffIdxStatus>(['applied', 'arbitrated', 'withdrawn']);

export function isTerminal(s: TariffIdxStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<TariffIdxAction, { from: TariffIdxStatus[]; to: TariffIdxStatus }> = {
  publish_index:        { from: ['indexation_due'],                                  to: 'index_published' },
  calculate_escalation: { from: ['index_published'],                                 to: 'escalation_calculated' },
  issue_notice:         { from: ['escalation_calculated'],                            to: 'notice_issued' },
  begin_review:         { from: ['notice_issued'],                                    to: 'under_review' },
  agree_tariff:         { from: ['under_review'],                                     to: 'tariff_agreed' },
  apply_tariff:         { from: ['tariff_agreed'],                                    to: 'applied' },
  raise_dispute:        { from: ['notice_issued', 'under_review'],                    to: 'disputed' },
  recalculate:          { from: ['disputed'],                                         to: 'recalculated' },
  reissue_notice:       { from: ['recalculated'],                                     to: 'notice_issued' },
  refer_arbitration:    { from: ['disputed', 'recalculated'],                         to: 'arbitrated' },
  withdraw:             { from: ['indexation_due', 'index_published', 'escalation_calculated', 'notice_issued', 'under_review', 'disputed', 'recalculated'], to: 'withdrawn' },
};

export function nextStatus(current: TariffIdxStatus, action: TariffIdxAction): TariffIdxStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: TariffIdxStatus): TariffIdxAction[] {
  const acts: TariffIdxAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [TariffIdxAction, typeof TRANSITIONS[TariffIdxAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// MIXED matrix — machinery windows uniform across tiers (the indexation
// calendar is the same regardless of PPA scale); dispute / recalculation
// windows materiality-graded with utility_scale TIGHTEST.
export const SLA_MINUTES: Record<TariffIdxStatus, Record<TariffIdxTier, number>> = {
  indexation_due: {
    utility_scale: 45 * DAY,   // seller publishes the reference index (uniform)
    commercial:    45 * DAY,
    embedded:      45 * DAY,
  },
  index_published: {
    utility_scale: 10 * DAY,   // calculate the escalation factor (uniform)
    commercial:    10 * DAY,
    embedded:      10 * DAY,
  },
  escalation_calculated: {
    utility_scale: 5 * DAY,    // issue the indexation notice (uniform)
    commercial:    5 * DAY,
    embedded:      5 * DAY,
  },
  notice_issued: {
    utility_scale: 10 * DAY,   // offtaker begins review (uniform)
    commercial:    10 * DAY,
    embedded:      10 * DAY,
  },
  under_review: {
    utility_scale: 15 * DAY,   // agree the new tariff (uniform)
    commercial:    15 * DAY,
    embedded:      15 * DAY,
  },
  tariff_agreed: {
    utility_scale: 5 * DAY,    // apply to invoicing (uniform)
    commercial:    5 * DAY,
    embedded:      5 * DAY,
  },
  disputed: {
    utility_scale: 10 * DAY,   // resolve the dispute — grid-scale TIGHTEST
    commercial:    20 * DAY,
    embedded:      30 * DAY,
  },
  recalculated: {
    utility_scale: 10 * DAY,   // reissue or refer — grid-scale TIGHTEST
    commercial:    15 * DAY,
    embedded:      20 * DAY,
  },
  applied:    { utility_scale: 0, commercial: 0, embedded: 0 },
  arbitrated: { utility_scale: 0, commercial: 0, embedded: 0 },
  withdrawn:  { utility_scale: 0, commercial: 0, embedded: 0 },
};

export function slaDeadlineFor(status: TariffIdxStatus, tier: TariffIdxTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// ERA §4 tariff-oversight reportability applies to utility-scale + commercial
// PPAs; embedded disputes sit between two private parties (less systemic).
const REPORTABLE_TIERS = new Set<TariffIdxTier>(['utility_scale', 'commercial']);

export function isReportableTier(tier: TariffIdxTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// A dispute declaration is the offtaker formally contesting the indexation.
export function isDisputeDeclaration(action: TariffIdxAction): boolean {
  return action === 'raise_dispute';
}

// Reportability matrix:
//   - refer_arbitration crosses for EVERY tier (referring a tariff dispute to
//     NERSA / arbitration is always notifiable — ERA §4 hard line)
//   - dispute declarations cross for utility_scale + commercial only
export function crossesIntoRegulator(action: TariffIdxAction, tier: TariffIdxTier): boolean {
  if (action === 'refer_arbitration') return true;
  if (isDisputeDeclaration(action)) return REPORTABLE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: TariffIdxTier): boolean {
  return REPORTABLE_TIERS.has(tier);
}

// Party that each action represents (contractual function), not the login role.
// The seller drives the indexation machinery; the offtaker reviews, agrees,
// disputes, and refers to arbitration.
const ACTION_PARTY: Record<TariffIdxAction, 'seller' | 'offtaker'> = {
  publish_index:        'seller',
  calculate_escalation: 'seller',
  issue_notice:         'seller',
  apply_tariff:         'seller',
  recalculate:          'seller',
  reissue_notice:       'seller',
  withdraw:             'seller',
  begin_review:         'offtaker',
  agree_tariff:         'offtaker',
  raise_dispute:        'offtaker',
  refer_arbitration:    'offtaker',
};

export function partyForAction(action: TariffIdxAction): 'seller' | 'offtaker' {
  return ACTION_PARTY[action];
}

// Offtaker-side write set (guarded server-side via the offtaker-write split).
const OFFTAKER_ACTIONS = new Set<TariffIdxAction>(['begin_review', 'agree_tariff', 'raise_dispute', 'refer_arbitration']);

export function isOfftakerAction(action: TariffIdxAction): boolean {
  return OFFTAKER_ACTIONS.has(action);
}
