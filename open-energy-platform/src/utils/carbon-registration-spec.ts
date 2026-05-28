// ─────────────────────────────────────────────────────────────────────────
// Wave 37 — Carbon Project Registration / PDD Validation chain (P6)
//
// Gold Standard for the Global Goals + Verra VCS + CDM (legacy) + Paris
// Agreement Article 6.4 mechanism, with South Africa's DFFE Designated National
// Authority (DNA) Letter of Approval / host-country authorization. This is the
// FRONT END of the carbon credit lifecycle: a mitigation project goes from idea
// (PIN) → full Project Design Document (PDD) → independent validation by a VVB
// (Validation & Verification Body) → public stakeholder consultation → DNA
// authorization → registry registration → active crediting period, at which
// point it hands off to W11 (MRV verification chain) and ultimately W17
// (retirement) and W4 (Article 6 ITMO corresponding adjustment).
//
//   pin_submitted → pdd_drafted → validation_underway → public_consultation →
//   dna_authorization → registration_requested → registered → crediting_active
//
// Branches:
//   corrections_required — VVB raised Corrective Action Requests (CARs); the
//                          developer must resubmit to re-enter validation
//   rejected             — validation failed or registry refused (terminal)
//   withdrawn            — developer withdrew the project (terminal)
//
// Tiers (project type / scale — drive validation rigor + reportability):
//   afolu_redd   — land-use (REDD+/afforestation): permanence + leakage risk,
//                  longest validation, highest integrity scrutiny
//   large_scale  — large-scale industrial / grid-connected renewable energy
//   small_scale  — small-scale / programmatic (PoA), cookstoves: fastest
//
// SLA matrix is INVERTED — the higher-integrity-risk tier gets MORE time in
// every state (more diligence, like W19 procurement / W20 COD). Reportability:
// a rejection crosses to the regulator for EVERY tier (stopping a non-additional
// or fraudulent project is always a market-integrity event); registrations and
// SLA breaches cross only for the high-integrity tiers (afolu_redd + large_scale).
// ─────────────────────────────────────────────────────────────────────────

export type RegStatus =
  | 'pin_submitted'
  | 'pdd_drafted'
  | 'validation_underway'
  | 'corrections_required'
  | 'public_consultation'
  | 'dna_authorization'
  | 'registration_requested'
  | 'registered'
  | 'crediting_active'
  | 'rejected'
  | 'withdrawn';

export type RegAction =
  | 'draft_pdd'
  | 'submit_validation'
  | 'request_corrections'
  | 'resubmit'
  | 'open_consultation'
  | 'authorize_dna'
  | 'request_registration'
  | 'register'
  | 'activate_crediting'
  | 'reject'
  | 'withdraw';

export type RegTier = 'afolu_redd' | 'large_scale' | 'small_scale';

export type RegEvent =
  | 'carbon_registration.pdd_drafted'
  | 'carbon_registration.validation_underway'
  | 'carbon_registration.corrections_required'
  | 'carbon_registration.public_consultation'
  | 'carbon_registration.dna_authorization'
  | 'carbon_registration.registration_requested'
  | 'carbon_registration.registered'
  | 'carbon_registration.crediting_active'
  | 'carbon_registration.rejected'
  | 'carbon_registration.withdrawn'
  | 'carbon_registration.sla_breached';

const TERMINALS = new Set<RegStatus>(['crediting_active', 'rejected', 'withdrawn']);

export function isTerminal(s: RegStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<RegAction, { from: RegStatus[]; to: RegStatus }> = {
  draft_pdd:            { from: ['pin_submitted'],                          to: 'pdd_drafted' },
  submit_validation:    { from: ['pdd_drafted'],                            to: 'validation_underway' },
  request_corrections:  { from: ['validation_underway'],                    to: 'corrections_required' },
  resubmit:             { from: ['corrections_required'],                   to: 'validation_underway' },
  open_consultation:    { from: ['validation_underway'],                    to: 'public_consultation' },
  authorize_dna:        { from: ['public_consultation'],                    to: 'dna_authorization' },
  request_registration: { from: ['dna_authorization'],                      to: 'registration_requested' },
  register:             { from: ['registration_requested'],                 to: 'registered' },
  activate_crediting:   { from: ['registered'],                             to: 'crediting_active' },
  reject:               { from: ['validation_underway', 'corrections_required', 'registration_requested'], to: 'rejected' },
  withdraw:             { from: ['pin_submitted', 'pdd_drafted', 'validation_underway', 'corrections_required', 'public_consultation', 'dna_authorization', 'registration_requested'], to: 'withdrawn' },
};

export function nextStatus(current: RegStatus, action: RegAction): RegStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: RegStatus): RegAction[] {
  const acts: RegAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [RegAction, typeof TRANSITIONS[RegAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const DAY = 24 * 60 * MIN;

// INVERTED matrix — higher-integrity-risk tier gets MORE time in every state.
export const SLA_MINUTES: Record<RegStatus, Record<RegTier, number>> = {
  pin_submitted: {
    afolu_redd:  90 * DAY,
    large_scale: 60 * DAY,
    small_scale: 30 * DAY,
  },
  pdd_drafted: {
    afolu_redd:  60 * DAY,
    large_scale: 45 * DAY,
    small_scale: 30 * DAY,
  },
  validation_underway: {
    afolu_redd:  180 * DAY,   // validation is the long pole; permanence review
    large_scale: 120 * DAY,
    small_scale: 90 * DAY,
  },
  corrections_required: {
    afolu_redd:  90 * DAY,
    large_scale: 60 * DAY,
    small_scale: 45 * DAY,
  },
  public_consultation: {
    afolu_redd:  60 * DAY,    // GS local stakeholder consultation minimum
    large_scale: 45 * DAY,
    small_scale: 30 * DAY,
  },
  dna_authorization: {
    afolu_redd:  45 * DAY,
    large_scale: 30 * DAY,
    small_scale: 21 * DAY,
  },
  registration_requested: {
    afolu_redd:  90 * DAY,
    large_scale: 60 * DAY,
    small_scale: 30 * DAY,
  },
  registered: {
    afolu_redd:  30 * DAY,
    large_scale: 21 * DAY,
    small_scale: 14 * DAY,
  },
  crediting_active: { afolu_redd: 0, large_scale: 0, small_scale: 0 },
  rejected:         { afolu_redd: 0, large_scale: 0, small_scale: 0 },
  withdrawn:        { afolu_redd: 0, large_scale: 0, small_scale: 0 },
};

export function slaDeadlineFor(status: RegStatus, tier: RegTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Enhanced integrity due-diligence applies to land-use + large-scale projects
// (permanence, leakage, additionality risk); small-scale / PoA is streamlined.
const HIGH_INTEGRITY_TIERS = new Set<RegTier>(['afolu_redd', 'large_scale']);

export function enhancedDueDiligenceApplies(tier: RegTier): boolean {
  return HIGH_INTEGRITY_TIERS.has(tier);
}

export function isReportable(tier: RegTier): boolean {
  return HIGH_INTEGRITY_TIERS.has(tier);
}

// Reportability matrix:
//   - reject crosses for EVERY tier (stopping a non-additional or fraudulent
//     project is always a market-integrity event, even for a small-scale PoA)
//   - register crosses for the high-integrity tiers (afolu_redd + large_scale);
//     a high-integrity issuance entering the market is notifiable
export function crossesIntoRegulator(action: RegAction, tier: RegTier): boolean {
  if (action === 'reject')   return true;
  if (action === 'register') return HIGH_INTEGRITY_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: RegTier): boolean {
  return HIGH_INTEGRITY_TIERS.has(tier);
}

// Party that each action represents (developer vs VVB vs registry vs host-
// country authority). One carbon-fund desk records the workflow; this tags the
// contractual function performing each step.
const ACTION_PARTY: Record<RegAction, 'developer' | 'vvb' | 'registry' | 'authority'> = {
  draft_pdd:            'developer',
  submit_validation:    'developer',
  request_corrections:  'vvb',
  resubmit:             'developer',
  open_consultation:    'developer',
  authorize_dna:        'authority',
  request_registration: 'developer',
  register:             'registry',
  activate_crediting:   'registry',
  reject:               'vvb',
  withdraw:             'developer',
};

export function partyForAction(action: RegAction): 'developer' | 'vvb' | 'registry' | 'authority' {
  return ACTION_PARTY[action];
}
