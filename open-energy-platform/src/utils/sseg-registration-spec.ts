// ─────────────────────────────────────────────────────────────────────────
// Wave 57 — Regulator Embedded-Generation Registration & Schedule 2 Exemption
// chain (P6)
//
// NERSA registration of small-scale / embedded generation under the Electricity
// Regulation Act 4 of 2006 Schedule 2 (as amended 2021/2023). Schedule 2 lists
// generation activities that are EXEMPT from the requirement to hold a licence;
// the 2023 amendment removed the upper capacity limit for own-use generation.
// Exempt facilities above the de-minimis threshold must still REGISTER with
// NERSA. A facility owner files a registration application claiming the
// Schedule 2 exemption; NERSA logs it, screens eligibility, may request
// additional information (distributor connection approval, metering, single-line
// diagram), runs a light technical verification (capacity / point-of-connection /
// own-use-vs-wheeling), and a registration committee DETERMINES whether the
// facility qualifies for exemption — then either registers it (issues a
// registration certificate / NERSA registration number), refuses it, or REFERS
// it to full licensing where it does not qualify (e.g. generation for sale /
// trading / export, or a configuration that falls outside Schedule 2).
//
// This is the LIGHT-TOUCH front-end sibling of the full licensing chain. It
// pairs with the regulator's existing chains:
//   - [[project-wave49-licence-application-chain]] grants a FULL licence (the
//     heavy §10 public-participation + Council adjudication path). W57 REFERS an
//     ineligible registration UP to that pipeline — its distinctive terminal.
//   - [[project-wave33-licence-renewal-chain]] renews an EXISTING licence
//   - [[project-wave31-disposition-chain]] triages compliance-notice intake
//   - [[project-wave40-compliance-inspection-chain]] enforces conditions
//   - [[project-wave43-tariff-determination-chain]] sets WHAT a holder charges
// Registration decides WHETHER a small generator may operate exempt; licensing
// decides WHO may enter the regulated market proper. Unlike W49 there is NO
// mandatory public-participation step — that lightness is the W57 distinction.
//
// Forward path (happy):
//   registration_received → eligibility_screening → technical_verification
//     → exemption_determination → registration_approved → registered
//
// Conditional-approval loop (e.g. must fit a bidirectional meter first):
//   exemption_determination → conditions_pending → registration_approved
// Information-gap loop:
//   eligibility_screening → information_requested → eligibility_screening
// Referral to full licensing (W57 SIGNATURE — hands off to W49):
//   exemption_determination → referred_to_licensing
// Refusal:
//   exemption_determination → refused
// Early withdraw (applicant):
//   registration_received|eligibility_screening|information_requested
//     |technical_verification|exemption_determination|conditions_pending → withdrawn
// Lapse (non-responsive to an info request):
//   information_requested → lapsed
//
// Tiers (by installed capacity — drive SLA windows + reportability):
//   micro   — < 100 kW   (residential / small rooftop)
//   small   — < 1 MW     (small commercial)
//   medium  — < 10 MW    (large commercial / industrial)
//   large   — < 100 MW   (utility-scale embedded — deeper grid-impact study)
//   utility — ≥ 100 MW   (national-scale embedded generation)
//
// SLA matrix is INVERTED — the bigger the embedded generator, the MORE time
// every window allows (a utility-scale embedded connection warrants more
// grid-impact verification; a rooftop registration is quick). Same flavour as
// the INVERTED W49 licensing / W33 renewal / W43 tariff-determination SLAs; the
// opposite of the URGENT compliance-inspection / load-curtailment SLAs. Overall
// the windows are SHORTER than W49 licensing — registration is light-touch.
//
// Reportability (a regulator-native chain that still surfaces its material
// determinations onto the NERSA Council oversight queue / public register — same
// mechanism as W31/W33/W40/W43/W49):
//   - refer_to_licensing crosses for EVERY tier (kicking a facility into the full
//     licensing pipeline is always a material regulatory event — the W57
//     signature, mirroring how W49's refuse is universal)
//   - refuse_registration crosses for the large + utility tiers only (refusing a
//     rooftop registration is administrative; refusing a utility-scale embedded
//     generator is material)
//   - SLA breaches cross for the large + utility tiers (material capacity)
//
// actor_party (applicant / registry / verifier / committee) is derived from the
// ACTION, not the JWT role — same audit-attribution model as W33/W43/W49. The
// determination is made by a registration COMMITTEE administratively, NOT the
// full Energy Regulator (Council) — another point of lightness vs W49. The write
// split is two-party: the applicant files / supplies info / satisfies conditions
// / withdraws; the regulator drives everything else. isApplicantAction guards the
// applicant-write set server-side.
// ─────────────────────────────────────────────────────────────────────────

export type SsegRegistrationStatus =
  | 'registration_received'
  | 'eligibility_screening'
  | 'information_requested'
  | 'technical_verification'
  | 'exemption_determination'
  | 'conditions_pending'
  | 'registration_approved'
  | 'registered'
  | 'referred_to_licensing'
  | 'refused'
  | 'withdrawn'
  | 'lapsed';

export type SsegRegistrationAction =
  | 'begin_screening'
  | 'request_info'
  | 'submit_info'
  | 'begin_verification'
  | 'determine_exemption'
  | 'approve_registration'
  | 'approve_with_conditions'
  | 'satisfy_conditions'
  | 'issue_certificate'
  | 'refer_to_licensing'
  | 'refuse_registration'
  | 'withdraw'
  | 'lapse';

export type SsegRegistrationTier = 'micro' | 'small' | 'medium' | 'large' | 'utility';

export type SsegRegistrationEvent =
  | 'sseg_registration.eligibility_screening'
  | 'sseg_registration.information_requested'
  | 'sseg_registration.technical_verification'
  | 'sseg_registration.exemption_determination'
  | 'sseg_registration.conditions_pending'
  | 'sseg_registration.registration_approved'
  | 'sseg_registration.registered'
  | 'sseg_registration.referred_to_licensing'
  | 'sseg_registration.refused'
  | 'sseg_registration.withdrawn'
  | 'sseg_registration.lapsed'
  | 'sseg_registration.sla_breached';

const TERMINALS = new Set<SsegRegistrationStatus>([
  'registered', 'referred_to_licensing', 'refused', 'withdrawn', 'lapsed',
]);

export function isTerminal(s: SsegRegistrationStatus): boolean {
  return TERMINALS.has(s);
}

export const TRANSITIONS: Record<SsegRegistrationAction, { from: SsegRegistrationStatus[]; to: SsegRegistrationStatus }> = {
  begin_screening:         { from: ['registration_received'],                          to: 'eligibility_screening' },
  request_info:            { from: ['eligibility_screening'],                           to: 'information_requested' },
  submit_info:             { from: ['information_requested'],                           to: 'eligibility_screening' },
  begin_verification:      { from: ['eligibility_screening'],                           to: 'technical_verification' },
  determine_exemption:     { from: ['technical_verification'],                          to: 'exemption_determination' },
  approve_registration:    { from: ['exemption_determination', 'conditions_pending'],   to: 'registration_approved' },
  approve_with_conditions: { from: ['exemption_determination'],                         to: 'conditions_pending' },
  satisfy_conditions:      { from: ['conditions_pending'],                              to: 'registration_approved' },
  issue_certificate:       { from: ['registration_approved'],                           to: 'registered' },
  refer_to_licensing:      { from: ['exemption_determination'],                         to: 'referred_to_licensing' },
  refuse_registration:     { from: ['exemption_determination'],                         to: 'refused' },
  withdraw:                { from: ['registration_received', 'eligibility_screening', 'information_requested', 'technical_verification', 'exemption_determination', 'conditions_pending'], to: 'withdrawn' },
  lapse:                   { from: ['information_requested'],                           to: 'lapsed' },
};

export function nextStatus(current: SsegRegistrationStatus, action: SsegRegistrationAction): SsegRegistrationStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: SsegRegistrationStatus): SsegRegistrationAction[] {
  const acts: SsegRegistrationAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [SsegRegistrationAction, typeof TRANSITIONS[SsegRegistrationAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const WITHDRAWABLE = new Set<SsegRegistrationStatus>([
  'registration_received', 'eligibility_screening', 'information_requested',
  'technical_verification', 'exemption_determination', 'conditions_pending',
]);

export function isWithdrawable(s: SsegRegistrationStatus): boolean {
  return WITHDRAWABLE.has(s);
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED matrix — the bigger the embedded generator, the MORE time every
// window allows. Windows are shorter overall than W49 licensing (registration
// is light-touch and has no public-participation step).
export const SLA_MINUTES: Record<SsegRegistrationStatus, Record<SsegRegistrationTier, number>> = {
  registration_received: {
    micro:    2 * DAY,    // begin the eligibility screening
    small:    3 * DAY,
    medium:   5 * DAY,
    large:    7 * DAY,
    utility: 10 * DAY,
  },
  eligibility_screening: {
    micro:    5 * DAY,    // screen / request info / proceed to verification
    small:    7 * DAY,
    medium:  10 * DAY,
    large:   14 * DAY,
    utility: 21 * DAY,
  },
  information_requested: {
    micro:   14 * DAY,    // applicant response window (else lapse)
    small:   21 * DAY,
    medium:  30 * DAY,
    large:   45 * DAY,
    utility: 60 * DAY,
  },
  technical_verification: {
    micro:    7 * DAY,    // capacity / point-of-connection / grid-impact check
    small:   10 * DAY,
    medium:  14 * DAY,
    large:   21 * DAY,
    utility: 30 * DAY,
  },
  exemption_determination: {
    micro:    5 * DAY,    // committee determination
    small:    7 * DAY,
    medium:  10 * DAY,
    large:   14 * DAY,
    utility: 21 * DAY,
  },
  conditions_pending: {
    micro:   14 * DAY,    // applicant satisfies registration conditions
    small:   21 * DAY,
    medium:  30 * DAY,
    large:   45 * DAY,
    utility: 60 * DAY,
  },
  registration_approved: {
    micro:    3 * DAY,    // issue the registration certificate + register entry
    small:    5 * DAY,
    medium:   7 * DAY,
    large:   10 * DAY,
    utility: 14 * DAY,
  },
  registered:            { micro: 0, small: 0, medium: 0, large: 0, utility: 0 },
  referred_to_licensing: { micro: 0, small: 0, medium: 0, large: 0, utility: 0 },
  refused:               { micro: 0, small: 0, medium: 0, large: 0, utility: 0 },
  withdrawn:             { micro: 0, small: 0, medium: 0, large: 0, utility: 0 },
  lapsed:                { micro: 0, small: 0, medium: 0, large: 0, utility: 0 },
};

export function slaDeadlineFor(status: SsegRegistrationStatus, tier: SsegRegistrationTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

export function slaWindowMinutes(status: SsegRegistrationStatus, tier: SsegRegistrationTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

// Capacity-based tier. kW thresholds: <100 micro / <1000 small / <10000 medium /
// <100000 large / ≥100000 utility.
export function tierForCapacityKw(kw: number): SsegRegistrationTier {
  if (kw < 100) return 'micro';
  if (kw < 1000) return 'small';
  if (kw < 10000) return 'medium';
  if (kw < 100000) return 'large';
  return 'utility';
}

// Material tiers for Council-oversight reportability + deeper grid-impact study.
const LARGE_TIERS = new Set<SsegRegistrationTier>(['large', 'utility']);

export function isLargeTier(tier: SsegRegistrationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Large + utility embedded connections require a formal grid-impact study at the
// technical-verification step; micro/small/medium follow a light check.
export function mandatoryGridStudy(tier: SsegRegistrationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix:
//   - refer_to_licensing crosses for EVERY tier (kicking a facility into full
//     licensing — universal, the W57 signature)
//   - refuse_registration crosses for the large + utility tiers only
export function crossesIntoRegulator(action: SsegRegistrationAction, tier: SsegRegistrationTier): boolean {
  if (action === 'refer_to_licensing') return true;
  if (action === 'refuse_registration') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: SsegRegistrationTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party that each action represents (regulatory function), not the login role.
// The applicant files / supplies additional information / satisfies conditions /
// withdraws; NERSA's registry handles screening logistics + info requests +
// certificate issuance + lapse; verifiers run the technical verification; the
// registration committee makes the exemption determination (approve / refuse /
// refer) — administratively, NOT the full Energy Regulator (Council).
const ACTION_PARTY: Record<SsegRegistrationAction, 'applicant' | 'registry' | 'verifier' | 'committee'> = {
  begin_screening:         'registry',
  request_info:            'registry',
  submit_info:             'applicant',
  begin_verification:      'verifier',
  determine_exemption:     'verifier',
  approve_registration:    'committee',
  approve_with_conditions: 'committee',
  satisfy_conditions:      'applicant',
  issue_certificate:       'registry',
  refer_to_licensing:      'committee',
  refuse_registration:     'committee',
  withdraw:                'applicant',
  lapse:                   'registry',
};

export function partyForAction(action: SsegRegistrationAction): 'applicant' | 'registry' | 'verifier' | 'committee' {
  return ACTION_PARTY[action];
}

// Applicant-side write set (guarded server-side via the applicant-write split).
const APPLICANT_ACTIONS = new Set<SsegRegistrationAction>(['submit_info', 'satisfy_conditions', 'withdraw']);

export function isApplicantAction(action: SsegRegistrationAction): boolean {
  return APPLICANT_ACTIONS.has(action);
}
