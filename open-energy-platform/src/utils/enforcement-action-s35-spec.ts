// ═══════════════════════════════════════════════════════════════════════════
// Wave 106 — Regulator NERSA Section 35 Administrative Enforcement Action &
// Fine Imposition Chain — pure spec.
//
// 10th Regulator chain. The formal NERSA enforcement-action lifecycle:
// NOTICE -> RESPONSE -> ADJUDICATION -> SANCTION (fine / licence suspension /
// licence revocation) -> APPEAL -> settled / withdrawn / upheld. Sister of
// W40 (compliance inspection — finds the non-conformance) + W66 (complaints
// — receives the complaint) + W31 (disposition — exits). W106 is the formal
// ENFORCEMENT action between detection and exit. Coexists with the earlier
// W93 enforcement-actions chain (admin-penalty audi/PAJA layer) — W106 sits
// at a different surface: full s35 admin-enforcement state-machine including
// licence-suspension / licence-revocation sanctions + appeals + gazette.
//
// Beats FCA Enforcement & Decision Notice / ESMA Sanctions / FERC Enforcement
// / ACCC enforcement / European Commission DG-COMP / Eskom IPP non-compliance
// / DOJ Energy enforcement / OFCOM enforcement / FSCA Administrative
// Sanctions Committee — every one of these surfaces enforcement as a
// case-management spreadsheet with email reminders; W106 makes it a
// procedural state-machine with PAJA-fairness LIVE flag, gazette-required
// LIVE flag, appeal-window countdown, repeat-offender index, and a 4-step
// authority ladder culminating at the full NERSA Council for licence
// revocation.
//
// Standards / framing:
//   - ERA s35 — administrative enforcement (notice, response, adjudication,
//     sanction including licence suspension/revocation, appeal).
//   - PAJA s5 — judicial review of administrative action; procedural
//     fairness; written representations; reasons for decision.
//   - Companies Act s38 — gazette publication of licence revocations / cease
//     orders.
//   - Constitution s33 — right to just administrative action; reasonable
//     time + reasons.
//   - NERSA Rules of Procedure — adjudication panel, Council determination,
//     appeal tribunal.
//
// Forward path (clean settle):
//   triggered -> notice_drafted -> notice_issued -> respondent_acknowledged
//     -> response_received -> adjudication_in_progress -> adjudicated
//       -> sanction_imposed -> appeal_window_open -> enforcement_in_progress
//         -> settled (SOFT terminal) -> archived (HARD terminal)
//
// Branches:
//   appeal_window_open -> lodge_appeal -> appealed
//     -> decide_appeal -> re_adjudicated
//        -> impose_sanction (varied/upheld) -> sanction_imposed (re-enters)
//        OR commence_enforcement -> enforcement_in_progress (upheld w/ exec)
//   any non-terminal -> withdraw_action -> withdrawn (HARD terminal)
//   any non-terminal -> cancel_action -> cancelled (HARD terminal)
//
// settled is SOFT terminal — UI-terminal but accepts only archive_action
// forward. archived / withdrawn / cancelled are HARD terminals.
//
// Tier — RE-DERIVED on every transition from
// COALESCE(sanction_quantum_zar, sanction_quantum_zar_floor, 0) and 5
// FLOOR-AT-MATERIAL flags + signature licence_revocation_proposed /
// criminal_referral_recommended:
//   minor      base < R1m
//   standard   R1m – R10m
//   material   R10m – R100m  OR any 1 floor flag set
//   strategic  >= R100m OR 2+ floor flags OR licence_revocation_proposed
//              OR criminal_referral_recommended
//
// INVERTED SLA polarity (strategic = LONGEST runway — PAJA s5 procedural
// fairness review). Licence-revocation requires public hearings, counsel
// windows, appeal tribunal preparation; rushing strategic enforcement
// breaches procedural fairness review under Constitution s33 / PAJA s5.
//   strategic x triggered: 180 days
//   material  x triggered: 120 days
//   standard  x triggered:  60 days
//   minor     x triggered:  30 days
//
// Authority ladder (4-step):
//   minor      nersa_compliance_officer
//   standard   nersa_legal_advisor
//   material   nersa_executive_manager_compliance
//   strategic  nersa_full_council
//
// SIGNATURE regulator crossings (ERA s35 + PAJA s5 + Companies Act s38 +
// Constitution s33):
//   impose_sanction         crosses regulator EVERY tier when
//                            licence_revocation_proposed=TRUE (signature —
//                            licence revocation is always self-reported via
//                            SENS / Gazette; W106 hard line).
//   commence_enforcement    crosses regulator EVERY tier on strategic tier
//                            (Gazette publication required).
//   mark_settled            crosses regulator material+strategic when
//                            sanction_type in {licence_suspended,
//                            licence_revoked, criminal_referral} (final
//                            disposition of significant sanctions
//                            reportable).
//   sla_breached            crosses regulator material+strategic (PAJA
//                            fairness review exposure).
//   triggering criminal_intelligence + commence_enforcement always crosses
//   regulator EVERY tier (SAPS handoff trigger).
//
// Write {admin, regulator}. READ all 9 personas. actor_party derived from
// ACTION: NERSA writes (draft_notice / issue_notice / start_adjudication /
// adjudicate / impose_sanction / decide_appeal / commence_enforcement /
// withdraw_action / cancel_action / archive_action), respondent writes
// (acknowledge_notice / submit_response / lodge_appeal), either (mark_settled
// — bilateral).
// ═══════════════════════════════════════════════════════════════════════════

export type EnfStatus =
  | 'triggered'
  | 'notice_drafted'
  | 'notice_issued'
  | 'respondent_acknowledged'
  | 'response_received'
  | 'adjudication_in_progress'
  | 'adjudicated'
  | 'sanction_imposed'
  | 'appeal_window_open'
  | 'enforcement_in_progress'
  | 'settled'
  | 'archived'
  | 'appealed'
  | 're_adjudicated'
  | 'withdrawn'
  | 'cancelled';

export type EnfAction =
  | 'trigger'
  | 'draft_notice'
  | 'issue_notice'
  | 'acknowledge_notice'
  | 'submit_response'
  | 'start_adjudication'
  | 'adjudicate'
  | 'impose_sanction'
  | 'open_appeal_window'
  | 'lodge_appeal'
  | 'decide_appeal'
  | 're_adjudicate'
  | 'commence_enforcement'
  | 'mark_settled'
  | 'archive_action'
  | 'withdraw_action'
  | 'cancel_action';

export type EnfTier = 'minor' | 'standard' | 'material' | 'strategic';

export type EnfParty =
  | 'nersa'
  | 'respondent'
  | 'panel'
  | 'council'
  | 'archiver'
  | 'system';

export type EnfEvent =
  | 'enforcement_action.triggered'
  | 'enforcement_action.notice_drafted'
  | 'enforcement_action.notice_issued'
  | 'enforcement_action.respondent_acknowledged'
  | 'enforcement_action.response_received'
  | 'enforcement_action.adjudication_in_progress'
  | 'enforcement_action.adjudicated'
  | 'enforcement_action.sanction_imposed'
  | 'enforcement_action.appeal_window_open'
  | 'enforcement_action.appealed'
  | 'enforcement_action.re_adjudicated'
  | 'enforcement_action.enforcement_in_progress'
  | 'enforcement_action.settled'
  | 'enforcement_action.archived'
  | 'enforcement_action.withdrawn'
  | 'enforcement_action.cancelled'
  | 'enforcement_action.sla_breached';

// Hard terminals reject every action. settled is SOFT terminal — UI-terminal
// but accepts only archive_action forward to reach archived.
const HARD_TERMINALS = new Set<EnfStatus>([
  'archived',
  'withdrawn',
  'cancelled',
]);

const UI_TERMINALS = new Set<EnfStatus>([
  'settled',
  'archived',
  'withdrawn',
  'cancelled',
]);

export function isTerminal(s: EnfStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: EnfStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// Cancellable / withdrawable from every non-terminal state.
const NON_TERMINAL_STATES: EnfStatus[] = [
  'triggered',
  'notice_drafted',
  'notice_issued',
  'respondent_acknowledged',
  'response_received',
  'adjudication_in_progress',
  'adjudicated',
  'sanction_imposed',
  'appeal_window_open',
  'appealed',
  're_adjudicated',
  'enforcement_in_progress',
];

export const TRANSITIONS: Record<EnfAction, { from: EnfStatus[]; to: EnfStatus }> = {
  trigger:              { from: [],                                         to: 'triggered' },
  draft_notice:         { from: ['triggered'],                              to: 'notice_drafted' },
  issue_notice:         { from: ['notice_drafted'],                         to: 'notice_issued' },
  acknowledge_notice:   { from: ['notice_issued'],                          to: 'respondent_acknowledged' },
  submit_response:      { from: ['respondent_acknowledged', 'notice_issued'], to: 'response_received' },
  start_adjudication:   { from: ['response_received', 'respondent_acknowledged'], to: 'adjudication_in_progress' },
  adjudicate:           { from: ['adjudication_in_progress'],               to: 'adjudicated' },
  impose_sanction:      { from: ['adjudicated', 're_adjudicated'],          to: 'sanction_imposed' },
  open_appeal_window:   { from: ['sanction_imposed'],                       to: 'appeal_window_open' },
  lodge_appeal:         { from: ['appeal_window_open'],                     to: 'appealed' },
  decide_appeal:        { from: ['appealed'],                               to: 're_adjudicated' },
  re_adjudicate:        { from: ['re_adjudicated'],                         to: 'sanction_imposed' },
  commence_enforcement: { from: ['appeal_window_open', 're_adjudicated', 'sanction_imposed'], to: 'enforcement_in_progress' },
  mark_settled:         { from: ['enforcement_in_progress', 'sanction_imposed', 'appeal_window_open'], to: 'settled' },
  archive_action:       { from: ['settled'],                                to: 'archived' },
  withdraw_action:      { from: NON_TERMINAL_STATES,                        to: 'withdrawn' },
  cancel_action:        { from: NON_TERMINAL_STATES,                        to: 'cancelled' },
};

export function nextStatus(current: EnfStatus, action: EnfAction): EnfStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (current === 'settled' && action !== 'archive_action') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: EnfStatus): EnfAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  if (current === 'settled') return ['archive_action'];
  const acts: EnfAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [EnfAction, typeof TRANSITIONS[EnfAction]][]) {
    if (a === 'trigger') continue;
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// ─── Tier derivation (RE-DERIVED on every transition) ────────────────────
//
// Base value = COALESCE(sanction_quantum_zar, sanction_quantum_zar_floor, 0)
//
//   minor      base < 1,000,000
//   standard   1,000,000 – 10,000,000
//   material   10,000,000 – 100,000,000   OR any 1 floor flag
//   strategic  >= 100,000,000             OR 2+ floor flags
//                                          OR licence_revocation_proposed
//                                          OR criminal_referral_recommended

export interface EnfFloorFlags {
  enforcement_floor_flag_licence_revocation_proposed?: boolean | number | null;
  enforcement_floor_flag_repeat_offender_within_36mo?: boolean | number | null;
  enforcement_floor_flag_public_safety_impact_strict?: boolean | number | null;
  enforcement_floor_flag_financial_quantum_over_50m?: boolean | number | null;
  enforcement_floor_flag_criminal_referral_recommended?: boolean | number | null;
}

export function countFloorFlags(args: EnfFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.enforcement_floor_flag_licence_revocation_proposed) +
    t(args.enforcement_floor_flag_repeat_offender_within_36mo) +
    t(args.enforcement_floor_flag_public_safety_impact_strict) +
    t(args.enforcement_floor_flag_financial_quantum_over_50m) +
    t(args.enforcement_floor_flag_criminal_referral_recommended)
  );
}

const STRATEGIC_FLOOR = 100000000; // 100m
const MATERIAL_FLOOR = 10000000;   // 10m
const STANDARD_FLOOR = 1000000;    // 1m

export function quantumBase(
  sanctionQuantumZar: number | null | undefined,
  sanctionQuantumZarFloor: number | null | undefined,
): number {
  const a = Number(sanctionQuantumZar ?? 0);
  const b = Number(sanctionQuantumZarFloor ?? 0);
  if (a > 0) return a;
  if (b > 0) return b;
  return 0;
}

export function tierForQuantum(quantumZar: number | null | undefined): EnfTier {
  const v = Number(quantumZar ?? 0);
  if (!isFinite(v) || v < 0) return 'minor';
  if (v >= STRATEGIC_FLOOR) return 'strategic';
  if (v >= MATERIAL_FLOOR) return 'material';
  if (v >= STANDARD_FLOOR) return 'standard';
  return 'minor';
}

export function effectiveTier(rawTier: EnfTier, flags: EnfFloorFlags): EnfTier {
  const lr = !!flags.enforcement_floor_flag_licence_revocation_proposed;
  const crim = !!flags.enforcement_floor_flag_criminal_referral_recommended;
  if (lr || crim) return 'strategic';
  const count = countFloorFlags(flags);
  if (count >= 2) return 'strategic';
  if (count === 1) {
    if (rawTier === 'minor' || rawTier === 'standard') return 'material';
    return rawTier;
  }
  return rawTier;
}

export function deriveTier(
  sanctionQuantumZar: number | null | undefined,
  sanctionQuantumZarFloor: number | null | undefined,
  flags: EnfFloorFlags,
): EnfTier {
  const base = quantumBase(sanctionQuantumZar, sanctionQuantumZarFloor);
  const raw = tierForQuantum(base);
  return effectiveTier(raw, flags);
}

const HEAVY_TIERS = new Set<EnfTier>(['material', 'strategic']);

export function isHeavyTier(tier: EnfTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: EnfTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── INVERTED SLA polarity ───────────────────────────────────────────────
//
// strategic gets LONGEST runway, minor TIGHTEST. PAJA s5 procedural-
// fairness review requires more time for higher-stakes sanctions.
// Strictly INCREASING minor -> strategic at every graded state.

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const SLA_MINUTES: Record<EnfStatus, Record<EnfTier, number>> = {
  triggered:                { minor: 30 * DAY, standard: 60 * DAY,  material: 120 * DAY, strategic: 180 * DAY },
  notice_drafted:           { minor: 14 * DAY, standard: 30 * DAY,  material: 60 * DAY,  strategic: 90 * DAY },
  notice_issued:            { minor: 21 * DAY, standard: 30 * DAY,  material: 45 * DAY,  strategic: 60 * DAY },
  respondent_acknowledged:  { minor: 14 * DAY, standard: 21 * DAY,  material: 30 * DAY,  strategic: 45 * DAY },
  response_received:        { minor: 14 * DAY, standard: 30 * DAY,  material: 60 * DAY,  strategic: 90 * DAY },
  adjudication_in_progress: { minor: 30 * DAY, standard: 60 * DAY,  material: 120 * DAY, strategic: 180 * DAY },
  adjudicated:              { minor: 7 * DAY,  standard: 14 * DAY,  material: 30 * DAY,  strategic: 45 * DAY },
  sanction_imposed:         { minor: 14 * DAY, standard: 21 * DAY,  material: 30 * DAY,  strategic: 45 * DAY },
  appeal_window_open:       { minor: 21 * DAY, standard: 30 * DAY,  material: 45 * DAY,  strategic: 60 * DAY },
  appealed:                 { minor: 30 * DAY, standard: 60 * DAY,  material: 120 * DAY, strategic: 180 * DAY },
  re_adjudicated:           { minor: 14 * DAY, standard: 30 * DAY,  material: 60 * DAY,  strategic: 90 * DAY },
  enforcement_in_progress:  { minor: 60 * DAY, standard: 90 * DAY,  material: 120 * DAY, strategic: 180 * DAY },
  settled:                  { minor: 0,        standard: 0,         material: 0,         strategic: 0 },
  archived:                 { minor: 0,        standard: 0,         material: 0,         strategic: 0 },
  withdrawn:                { minor: 0,        standard: 0,         material: 0,         strategic: 0 },
  cancelled:                { minor: 0,        standard: 0,         material: 0,         strategic: 0 },
};

export function slaWindowMinutes(status: EnfStatus, tier: EnfTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function deriveSlaDeadline(
  state: EnfStatus,
  tier: EnfTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

export function slaDaysRemaining(
  status: EnfStatus,
  tier: EnfTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = deriveSlaDeadline(status, tier, enteredAt);
  if (!deadline) return 0;
  return Math.round(((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) * 10) / 10;
}

// ─── Authority ladder ────────────────────────────────────────────────────
export type EnfAuthority =
  | 'nersa_compliance_officer'
  | 'nersa_legal_advisor'
  | 'nersa_executive_manager_compliance'
  | 'nersa_full_council';

export function authorityRequired(tier: EnfTier): EnfAuthority {
  switch (tier) {
    case 'minor':     return 'nersa_compliance_officer';
    case 'standard':  return 'nersa_legal_advisor';
    case 'material':  return 'nersa_executive_manager_compliance';
    case 'strategic': return 'nersa_full_council';
  }
}

// ─── Urgency band ────────────────────────────────────────────────────────
export type EnfUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(tier: EnfTier, slaDaysLeft: number): EnfUrgency {
  if (slaDaysLeft < 0) return 'critical';
  if (tier === 'strategic' && slaDaysLeft < 5) return 'critical';
  if (tier === 'strategic') return 'high';
  if (tier === 'material' && slaDaysLeft < 3) return 'critical';
  if (tier === 'material') return 'high';
  if (tier === 'standard' && slaDaysLeft < 2) return 'high';
  if (tier === 'standard') return 'medium';
  if (slaDaysLeft < 1) return 'high';
  return 'low';
}

// ─── Appeal status band ──────────────────────────────────────────────────
export type EnfAppealStatusBand =
  | 'none'
  | 'window_open'
  | 'appealed'
  | 'decided'
  | 'past_window';

export function appealStatusBand(
  status: EnfStatus,
  appealLodgedAt: string | null | undefined,
  appealOutcome: string | null | undefined,
  appealWindowCloseAt: string | null | undefined,
  now: Date,
): EnfAppealStatusBand {
  if (appealOutcome) return 'decided';
  if (appealLodgedAt) return 'appealed';
  if (status === 'appeal_window_open') return 'window_open';
  if (appealWindowCloseAt) {
    const t = new Date(appealWindowCloseAt);
    if (!isNaN(t.getTime()) && t.getTime() < now.getTime()) return 'past_window';
  }
  return 'none';
}

export function daysToAppealWindowClose(
  appealWindowCloseAt: string | null | undefined,
  now: Date,
): number | null {
  if (!appealWindowCloseAt) return null;
  const t = new Date(appealWindowCloseAt);
  if (isNaN(t.getTime())) return null;
  return Math.round(((t.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) * 10) / 10;
}

// ─── Adjudication progress (0/25/50/75/100) ──────────────────────────────
export function adjudicationProgressPct(status: EnfStatus): number {
  switch (status) {
    case 'triggered':
    case 'notice_drafted':
      return 0;
    case 'notice_issued':
    case 'respondent_acknowledged':
      return 25;
    case 'response_received':
    case 'adjudication_in_progress':
      return 50;
    case 'adjudicated':
    case 'sanction_imposed':
      return 75;
    case 'appeal_window_open':
    case 'appealed':
    case 're_adjudicated':
    case 'enforcement_in_progress':
    case 'settled':
      return 100;
    case 'archived':
    case 'withdrawn':
    case 'cancelled':
      return 100;
  }
}

// ─── Enforcement compliance index 0-130 ──────────────────────────────────
//
// Composite score: notice + response + adjudication + appeal_handled +
// enforcement + settled bonus + no_withdrawal bonus.
//   notice_issued            15
//   response_received        10
//   adjudication_completed   20
//   sanction_imposed         15
//   appeal_handled_or_skip   10
//   enforcement_started      15
//   settled                  20
//   no_withdrawal_bonus      15
//   first_pass_clean_bonus   10
// Capped at 130.
export function enforcementComplianceIndex(args: {
  notice_issued?: boolean | number | null;
  response_received?: boolean | number | null;
  adjudication_completed?: boolean | number | null;
  sanction_imposed?: boolean | number | null;
  appeal_handled_or_skip?: boolean | number | null;
  enforcement_started?: boolean | number | null;
  settled?: boolean | number | null;
  no_withdrawal_bonus?: boolean | number | null;
  first_pass_clean_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.notice_issued)            * 15;
  score += t(args.response_received)        * 10;
  score += t(args.adjudication_completed)   * 20;
  score += t(args.sanction_imposed)         * 15;
  score += t(args.appeal_handled_or_skip)   * 10;
  score += t(args.enforcement_started)      * 15;
  score += t(args.settled)                  * 20;
  score += t(args.no_withdrawal_bonus)      * 15;
  score += t(args.first_pass_clean_bonus)   * 10;
  if (score > 130) score = 130;
  return score;
}

// ─── PAJA fairness exposure ──────────────────────────────────────────────
//
// True when SLA breached AND tier in {material, strategic}. Flags PAJA s5
// procedural-fairness review exposure.
export function pajaFairnessAtRiskFlag(
  slaBreached: boolean | number | null | undefined,
  tier: EnfTier,
): boolean {
  return !!slaBreached && HEAVY_TIERS.has(tier);
}

// ─── Gazette publication required ────────────────────────────────────────
//
// True on strategic tier OR sanction_type in significant set.
const GAZETTE_REQUIRED_SANCTIONS = new Set([
  'licence_suspended', 'licence_revoked', 'order_to_cease', 'criminal_referral',
]);

export function gazettePublicationRequired(
  tier: EnfTier,
  sanctionType: string | null | undefined,
): boolean {
  if (tier === 'strategic') return true;
  if (sanctionType && GAZETTE_REQUIRED_SANCTIONS.has(sanctionType)) return true;
  return false;
}

// ─── Bridge flags ────────────────────────────────────────────────────────
export function bridgesToInspectionChain(triggeringInspectionId: string | null | undefined): boolean {
  return !!triggeringInspectionId;
}

export function bridgesToComplaintChain(triggeringComplaintId: string | null | undefined): boolean {
  return !!triggeringComplaintId;
}

export function bridgesToLicenceRenewalChain(openLicenceRenewalRef: string | null | undefined): boolean {
  return !!openLicenceRenewalRef;
}

// ─── SIGNATURE regulator crossings ───────────────────────────────────────
//
//   impose_sanction        crosses regulator EVERY tier when
//                           licence_revocation_proposed=TRUE (W106 hard line)
//   commence_enforcement   crosses regulator EVERY tier on strategic (Gazette)
//   mark_settled           crosses regulator material+strategic when
//                           sanction_type in significant set
//   sla_breached           crosses regulator material+strategic
//   criminal_intelligence trigger + commence_enforcement always crosses
//                          regulator EVERY tier (SAPS handoff)

const SIGNIFICANT_SETTLEMENT_TYPES = new Set([
  'licence_suspended', 'licence_revoked', 'criminal_referral',
]);

export function crossesIntoRegulator(
  action: EnfAction,
  tier: EnfTier,
  args: {
    licence_revocation_proposed?: boolean | number | null;
    criminal_referral_recommended?: boolean | number | null;
    triggering_event_type?: string | null;
    sanction_type?: string | null;
  },
): boolean {
  const lr = !!args.licence_revocation_proposed;
  const crim = !!args.criminal_referral_recommended;
  const sig = args.sanction_type && SIGNIFICANT_SETTLEMENT_TYPES.has(args.sanction_type);
  if (action === 'impose_sanction') {
    return lr;
  }
  if (action === 'commence_enforcement') {
    if (tier === 'strategic') return true;
    if (args.triggering_event_type === 'criminal_intelligence') return true;
    return false;
  }
  if (action === 'mark_settled') {
    return HEAVY_TIERS.has(tier) && !!sig;
  }
  if (action === 'withdraw_action' || action === 'cancel_action') {
    return HEAVY_TIERS.has(tier) || lr || crim;
  }
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: EnfTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── actor_party derivation ──────────────────────────────────────────────
//
// NERSA writes (draft / issue / start_adjudication / adjudicate /
// impose_sanction / decide_appeal / commence_enforcement / withdraw /
// cancel / archive). Respondent writes (acknowledge / submit_response /
// lodge_appeal). Either (mark_settled — bilateral).
const ACTION_PARTY: Record<EnfAction, EnfParty> = {
  trigger:              'nersa',
  draft_notice:         'nersa',
  issue_notice:         'nersa',
  acknowledge_notice:   'respondent',
  submit_response:      'respondent',
  start_adjudication:   'panel',
  adjudicate:           'council',
  impose_sanction:      'council',
  open_appeal_window:   'nersa',
  lodge_appeal:         'respondent',
  decide_appeal:        'council',
  re_adjudicate:        'council',
  commence_enforcement: 'nersa',
  mark_settled:         'nersa',
  archive_action:       'archiver',
  withdraw_action:      'nersa',
  cancel_action:        'nersa',
};

export function partyForAction(action: EnfAction): EnfParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: EnfAction): EnfEvent | null {
  switch (action) {
    case 'trigger':              return 'enforcement_action.triggered';
    case 'draft_notice':         return 'enforcement_action.notice_drafted';
    case 'issue_notice':         return 'enforcement_action.notice_issued';
    case 'acknowledge_notice':   return 'enforcement_action.respondent_acknowledged';
    case 'submit_response':      return 'enforcement_action.response_received';
    case 'start_adjudication':   return 'enforcement_action.adjudication_in_progress';
    case 'adjudicate':           return 'enforcement_action.adjudicated';
    case 'impose_sanction':      return 'enforcement_action.sanction_imposed';
    case 'open_appeal_window':   return 'enforcement_action.appeal_window_open';
    case 'lodge_appeal':         return 'enforcement_action.appealed';
    case 'decide_appeal':        return 'enforcement_action.re_adjudicated';
    case 're_adjudicate':        return 'enforcement_action.sanction_imposed';
    case 'commence_enforcement': return 'enforcement_action.enforcement_in_progress';
    case 'mark_settled':         return 'enforcement_action.settled';
    case 'archive_action':       return 'enforcement_action.archived';
    case 'withdraw_action':      return 'enforcement_action.withdrawn';
    case 'cancel_action':        return 'enforcement_action.cancelled';
  }
}

// ─── runLiveBattery — composes all LIVE fields used by decorate() ────────
export interface EnfLiveBatteryInput {
  status: EnfStatus;
  tier: EnfTier;
  sanction_quantum_zar?: number | null;
  sanction_quantum_zar_floor?: number | null;
  appeal_lodged_at?: string | null;
  appeal_outcome?: string | null;
  appeal_window_close_at?: string | null;
  sanction_type?: string | null;
  sla_breached?: boolean | number | null;
  triggering_inspection_id?: string | null;
  triggering_complaint_id?: string | null;
  open_licence_renewal_ref?: string | null;
  notice_issued_at?: string | null;
  response_received_at?: string | null;
  adjudication_completed_at?: string | null;
  sanction_imposed_at?: string | null;
  appeal_decided_at?: string | null;
  enforcement_started_at?: string | null;
  settled_at?: string | null;
  withdrawn_at?: string | null;
  repeat_offender_count_36mo?: number | null;
  cumulative_sanctions_history_zar?: number | null;
  sla_days_remaining?: number;
  now: Date;
}

export interface EnfLiveBatteryOutput {
  sanction_quantum_zar_live: number;
  appeal_status_band_live: EnfAppealStatusBand;
  days_to_appeal_window_close_live: number | null;
  adjudication_progress_pct_live: number;
  repeat_offence_count_live: number;
  cumulative_sanctions_history_zar_live: number;
  enforcement_compliance_index_live: number;
  urgency_band_live: EnfUrgency;
  authority_required_live: EnfAuthority;
  bridges_to_inspection_chain_live: boolean;
  bridges_to_complaint_chain_live: boolean;
  bridges_to_licence_renewal_chain_live: boolean;
  paja_fairness_at_risk_flag_live: boolean;
  gazette_publication_required_live: boolean;
}

export function runLiveBattery(input: EnfLiveBatteryInput): EnfLiveBatteryOutput {
  const quantumLive = quantumBase(input.sanction_quantum_zar, input.sanction_quantum_zar_floor);
  const appealBand = appealStatusBand(
    input.status,
    input.appeal_lodged_at,
    input.appeal_outcome,
    input.appeal_window_close_at,
    input.now,
  );
  const daysClose = daysToAppealWindowClose(input.appeal_window_close_at, input.now);
  const progress = adjudicationProgressPct(input.status);

  const adjudicationCompleted = !!input.adjudication_completed_at;
  const appealHandledOrSkip = !!input.appeal_decided_at || (!input.appeal_lodged_at && progress >= 75);
  const compliance = enforcementComplianceIndex({
    notice_issued:           !!input.notice_issued_at,
    response_received:       !!input.response_received_at,
    adjudication_completed:  adjudicationCompleted,
    sanction_imposed:        !!input.sanction_imposed_at,
    appeal_handled_or_skip:  appealHandledOrSkip,
    enforcement_started:     !!input.enforcement_started_at,
    settled:                 !!input.settled_at,
    no_withdrawal_bonus:     !input.withdrawn_at,
    first_pass_clean_bonus:  !!input.settled_at && !input.appeal_lodged_at && !input.withdrawn_at,
  });

  const urgency = urgencyBand(input.tier, input.sla_days_remaining ?? 0);
  const authority = authorityRequired(input.tier);
  const paja = pajaFairnessAtRiskFlag(input.sla_breached, input.tier);
  const gazette = gazettePublicationRequired(input.tier, input.sanction_type);

  return {
    sanction_quantum_zar_live: quantumLive,
    appeal_status_band_live: appealBand,
    days_to_appeal_window_close_live: daysClose,
    adjudication_progress_pct_live: progress,
    repeat_offence_count_live: Number(input.repeat_offender_count_36mo ?? 0),
    cumulative_sanctions_history_zar_live: Number(input.cumulative_sanctions_history_zar ?? 0),
    enforcement_compliance_index_live: compliance,
    urgency_band_live: urgency,
    authority_required_live: authority,
    bridges_to_inspection_chain_live: bridgesToInspectionChain(input.triggering_inspection_id),
    bridges_to_complaint_chain_live: bridgesToComplaintChain(input.triggering_complaint_id),
    bridges_to_licence_renewal_chain_live: bridgesToLicenceRenewalChain(input.open_licence_renewal_ref),
    paja_fairness_at_risk_flag_live: paja,
    gazette_publication_required_live: gazette,
  };
}
