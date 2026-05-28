// ─────────────────────────────────────────────────────────────────────────
// Wave 33 — Regulator Licence Renewal / Amendment chain (P6)
//
// 11-state lifecycle for NERSA-issued energy licence renewals (Electricity
// Regulation Act 2006 sections 14-16):
//   s14 — Generation licences
//   s15 — Distribution licences
//   s16 — Trading + Import/Export licences
//
// Licences are issued for a defined period (typically 25 years for gen,
// 5-15 years for distribution and trading). Renewal must be lodged 6-12
// months before expiry per s14(2)(b). NERSA processes via completeness
// check → public consultation (s10) → technical+financial evaluation →
// Council vote → Record of Decision (RoD).
//
// Forward path:
//   renewal_initiated → application_filed → completeness_check →
//   public_consultation → evaluation → decision_drafted → council_voted →
//   granted / amended / refused
//
// Branch terminal:
//   withdrawn — applicant withdrew before Council vote
//
// Licence class tiers (drive INVERTED SLA — utility-scale gets MOST time):
//   generation_utility   — ≥100MW or transmission-connected (longest review)
//   generation_embedded  — 1-100MW distribution-connected
//   generation_sseg      — <1MW Small-Scale Embedded Generation
//   distribution         — REDs / municipal distribution licences
//   trading              — trading + import/export (fastest — most fungible)
//
// SLA is INVERTED — utility-scale gets the LONGEST evaluation windows
// (most complex network impact + financial diligence), trading gets the
// SHORTEST (most fungible, low network-impact). The s14(2)(b) 6-month
// statutory pre-expiry window anchors at generation_utility evaluation.
//
// Reportability (NERSA Council briefings + Tribunal appeal pipeline):
//   - refused crosses for ALL tiers (always reportable to Council)
//   - granted + amended cross for generation_utility (utility-scale only)
//   - sla_breached crosses for ALL tiers (s14(2)(b) statutory hard line)
//   - withdrawn handled via internal log (no Council crossing)
// ─────────────────────────────────────────────────────────────────────────

export type LicenceRenewalStatus =
  | 'renewal_initiated'
  | 'application_filed'
  | 'completeness_check'
  | 'public_consultation'
  | 'evaluation'
  | 'decision_drafted'
  | 'council_voted'
  | 'granted'
  | 'amended'
  | 'refused'
  | 'withdrawn';

export type LicenceRenewalAction =
  | 'initiate'
  | 'file_application'
  | 'check_completeness'
  | 'open_consultation'
  | 'start_evaluation'
  | 'draft_decision'
  | 'council_vote'
  | 'grant'
  | 'amend'
  | 'refuse'
  | 'withdraw';

export type LicenceClass =
  | 'generation_utility'
  | 'generation_embedded'
  | 'generation_sseg'
  | 'distribution'
  | 'trading';

export type LicenceRenewalEvent =
  | 'licence_renewal.initiated'
  | 'licence_renewal.application_filed'
  | 'licence_renewal.completeness_checked'
  | 'licence_renewal.consultation_opened'
  | 'licence_renewal.evaluation_started'
  | 'licence_renewal.decision_drafted'
  | 'licence_renewal.council_voted'
  | 'licence_renewal.granted'
  | 'licence_renewal.amended'
  | 'licence_renewal.refused'
  | 'licence_renewal.withdrawn'
  | 'licence_renewal.sla_breached';

const TERMINALS = new Set<LicenceRenewalStatus>(['granted', 'amended', 'refused', 'withdrawn']);

export function isTerminal(s: LicenceRenewalStatus): boolean {
  return TERMINALS.has(s);
}

const TRANSITIONS: Record<LicenceRenewalAction, { from: LicenceRenewalStatus[]; to: LicenceRenewalStatus }> = {
  initiate:           { from: [] as LicenceRenewalStatus[], to: 'renewal_initiated' },
  file_application:   { from: ['renewal_initiated'],        to: 'application_filed' },
  check_completeness: { from: ['application_filed'],        to: 'completeness_check' },
  open_consultation:  { from: ['completeness_check'],       to: 'public_consultation' },
  start_evaluation:   { from: ['public_consultation'],      to: 'evaluation' },
  draft_decision:     { from: ['evaluation'],               to: 'decision_drafted' },
  council_vote:       { from: ['decision_drafted'],         to: 'council_voted' },
  grant:              { from: ['council_voted'],            to: 'granted' },
  amend:              { from: ['council_voted'],            to: 'amended' },
  refuse:             { from: ['council_voted'],            to: 'refused' },
  withdraw: {
    from: ['renewal_initiated', 'application_filed', 'completeness_check', 'public_consultation', 'evaluation', 'decision_drafted'],
    to: 'withdrawn',
  },
};

export function nextStatus(current: LicenceRenewalStatus, action: LicenceRenewalAction): LicenceRenewalStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (action === 'initiate') return null; // initiate is creation-only, never a transition
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: LicenceRenewalStatus): LicenceRenewalAction[] {
  if (TERMINALS.has(current)) return [];
  const acts: LicenceRenewalAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [LicenceRenewalAction, typeof TRANSITIONS[LicenceRenewalAction]][]) {
    if (a === 'initiate') continue;
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED tier SLAs — utility-scale generation gets the LONGEST evaluation
// windows (network impact + financial diligence), trading gets the SHORTEST
// (low network-impact, most fungible). s14(2)(b) 6-month pre-expiry anchors
// at generation_utility evaluation.
export const SLA_MINUTES: Record<LicenceRenewalStatus, Record<LicenceClass, number>> = {
  renewal_initiated: {
    generation_utility:  180 * DAY,
    generation_embedded: 90 * DAY,
    generation_sseg:     45 * DAY,
    distribution:        120 * DAY,
    trading:             30 * DAY,
  },
  application_filed: {
    generation_utility:  30 * DAY,
    generation_embedded: 21 * DAY,
    generation_sseg:     14 * DAY,
    distribution:        30 * DAY,
    trading:             14 * DAY,
  },
  completeness_check: {
    generation_utility:  21 * DAY,
    generation_embedded: 14 * DAY,
    generation_sseg:     10 * DAY,
    distribution:        21 * DAY,
    trading:             10 * DAY,
  },
  public_consultation: {
    // s10 statutory minimum is 30 days
    generation_utility:  90 * DAY,
    generation_embedded: 60 * DAY,
    generation_sseg:     30 * DAY,
    distribution:        60 * DAY,
    trading:             30 * DAY,
  },
  evaluation: {
    // s14(2)(b) statutory window anchors here at generation_utility
    generation_utility:  180 * DAY,
    generation_embedded: 90 * DAY,
    generation_sseg:     45 * DAY,
    distribution:        120 * DAY,
    trading:             30 * DAY,
  },
  decision_drafted: {
    generation_utility:  30 * DAY,
    generation_embedded: 21 * DAY,
    generation_sseg:     14 * DAY,
    distribution:        30 * DAY,
    trading:             14 * DAY,
  },
  council_voted: {
    generation_utility:  14 * DAY,
    generation_embedded: 14 * DAY,
    generation_sseg:     14 * DAY,
    distribution:        14 * DAY,
    trading:             14 * DAY,
  },
  granted:   { generation_utility: 0, generation_embedded: 0, generation_sseg: 0, distribution: 0, trading: 0 },
  amended:   { generation_utility: 0, generation_embedded: 0, generation_sseg: 0, distribution: 0, trading: 0 },
  refused:   { generation_utility: 0, generation_embedded: 0, generation_sseg: 0, distribution: 0, trading: 0 },
  withdrawn: { generation_utility: 0, generation_embedded: 0, generation_sseg: 0, distribution: 0, trading: 0 },
};

export function slaDeadlineFor(status: LicenceRenewalStatus, klass: LicenceClass, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[klass];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// NERSA Council briefing reportability:
//   refused crosses for ALL tiers (Council disclosure mandatory)
//   granted + amended cross for generation_utility (utility-scale only)
//   sla_breached crosses for ALL tiers (s14(2)(b) statutory hard line)
//   withdrawn handled via internal log only
const UTILITY_TIER = new Set<LicenceClass>(['generation_utility']);

export function isReportable(klass: LicenceClass): boolean {
  return UTILITY_TIER.has(klass);
}

export function crossesIntoRegulator(action: LicenceRenewalAction, klass: LicenceClass): boolean {
  if (action === 'refuse') return true; // ALL tiers
  if (action === 'grant' || action === 'amend') return UTILITY_TIER.has(klass);
  return false;
}

export function slaBreachCrossesIntoRegulator(_klass: LicenceClass): boolean {
  return true; // ALL tiers — s14(2)(b) statutory hard line
}

export function classForCapacityMw(licenceType: 'generation' | 'distribution' | 'trading', mw: number): LicenceClass {
  if (licenceType === 'distribution') return 'distribution';
  if (licenceType === 'trading') return 'trading';
  // generation
  if (mw >= 100) return 'generation_utility';
  if (mw >= 1) return 'generation_embedded';
  return 'generation_sseg';
}
