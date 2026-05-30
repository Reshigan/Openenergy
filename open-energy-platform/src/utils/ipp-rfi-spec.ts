// ─────────────────────────────────────────────────────────────────────────
// Wave 116 — IPP RFI (Request For Information) Management chain.
//
// 11th IPP-pure chain. FIFTH Phase-A IPP wave (sibling of W112 WBS &
// Gantt schedule, W113 Cost & EVM, W114 Document Control, W115
// Submittals). W112 owns the SCHEDULE; W113 owns the COST BOOK;
// W114 owns the DRAWING REGISTER; W115 owns the SUBMITTAL workflow;
// W116 owns the RFI LIFECYCLE — the rolling contractor → engineer →
// owner_rep question/answer loop where every information request can
// escalate through the AIA G716 / FIDIC §1.3 notice channels and feed
// W117 change orders downstream.
//
// Beats Procore RFIs / Aconex RFIs / Newforma RFIs / Autodesk
// Construction Cloud RFIs / e-Builder RFIs / Asite RFIs / SmartUse
// RFIs / Bluebeam Studio / Fieldwire RFIs / Bentley AssetWise RFIs.
// Each surfaces RFIs as a list with a status + ball-in-court; W116
// turns it into a 12-state P6 RFI chain with URGENT SLA polarity in
// HOURS, FLOOR-AT-EMERGENCY-SAFETY on 5 contextual flags
// (safety_hazard_identified / construction_stoppage_in_effect /
// contractor_claim_basis / dispute_basis_referenced /
// regulatory_inquiry_triggered), 3-step authority ladder (contractor_PM
// → engineer → owner_rep), 20-field LIVE RFI battery (age + cost &
// schedule impact + escalation + authority + completeness + hash chain
// pre-stage + merkle root pre-stage + 6 bridges to W114 / W115 / W112 /
// W113 / W19 / W20), and the SIGNATURE SAFETY-RFI-ESCALATE EVERY-tier
// hard line.
//
// Standards: CSI 01 31 19 (Project Meetings & RFI flow) + ISO 19650-2
// §5.7 (information delivery) + FIDIC Silver §1.3 (notices) + AIA G716
// (RFI standard form) + NEC4 §61 (compensation events from
// instructions) + REIPPPP technical-coordination protocol.
//
// Forward path (clean RFI):
//   question_drafted → submitted → triage → assigned_to_responder
//     → research_in_progress → response_drafted → cross_discipline_review
//     → answer_returned → clarification_requested → closed_out
//     → archived (HARD terminal)
//
// Branches:
//   any non-terminal → rejected   (TERMINAL — invalid scope / out-of-
//                                  contract)
//   pre-triage       → void       (TERMINAL — pulled before triage)
//   review-touch     → escalated  (SOFT — multi-discipline / dispute
//                                  basis; can resume to
//                                  research_in_progress or close_out)
//
// Tier RE-DERIVED on every transition from rfi_class with FLOOR-AT-
// EMERGENCY-SAFETY on 5 contextual flags:
//   - safety_hazard_identified        (immediate safety hazard surfaced
//                                      by RFI - PtW / LOTO / HV)
//   - construction_stoppage_in_effect (RFI is blocking active work)
//   - contractor_claim_basis          (RFI is anchor for future claim)
//   - dispute_basis_referenced        (RFI feeds dispute machinery)
//   - regulatory_inquiry_triggered    (RFI raised by/feeds regulator
//                                      inquiry — NERSA/DMRE/IPPO)
//
// 4 tiers (URGENT polarity — higher RFI-criticality = TIGHTER):
//   clarification         : narrative clarification, low risk
//   coordination          : multi-discipline coordination question
//   construction_blocking : RFI gating active construction
//   emergency_safety      : safety hazard / regulatory inquiry / any
//                            flag-triggered floor
//
// URGENT SLA polarity stored as HOURS. Anchor on submitted (the moment
// the RFI lands on the responder's desk):
//   emergency_safety      × submitted = 4   hrs
//   construction_blocking × submitted = 24  hrs
//   coordination          × submitted = 72  hrs
//   clarification         × submitted = 168 hrs (7d)
//
// SIGNATURE Phase-A IPP regulator crossings (AIA G716 + FIDIC §1.3 +
// NEC4 §61 + REIPPPP technical-coord protocol):
//   escalate → EVERY tier when safety_hazard_identified ||
//              regulatory_inquiry_triggered
//              (W116 SIGNATURE SAFETY-RFI-ESCALATE hard line —
//               safety/regulatory RFI escalation = IE/IPPO notice;
//               sister of W104-W115 critical-action lines)
//   reject   → EVERY tier when contractor_claim_basis AND
//              cost_impact_zar >= 10_000_000
//              (claim-basis rejection >= R10m = dispute referral)
//   convert_to_change_order → construction_blocking + emergency_safety
//                             only (auto-link to future W117)
//   close_out → no regulator
//   sla_breached → emergency_safety + construction_blocking only
//
// Write {admin, ipp_developer}. READ all 9 personas. actor_party split:
//   contractor_PM: draft_question, submit, void, link_to_dispute
//   doc_controller: triage, assign_responder
//   engineer:      commence_research, draft_response, coordinate_review,
//                   return_answer, request_clarification,
//                   convert_to_change_order
//   owner_rep:     close_out, archive, reject, escalate
//
// Event prefix: `ipp_rfi_evt_`. AUDIT_PREFIX_MAP entry:
//   ipp_rfi: 'ipp'
//
// Two crons:
//   - */15 * * * *   SLA sweep
//   - 35 0 * * *     nightly RFI-aging recompute (refresh rfi_age_days
//                     without auto-transitioning - RFI decisions never
//                     auto-moved by cron)
// ─────────────────────────────────────────────────────────────────────────

export type IprStatus =
  | 'question_drafted'
  | 'submitted'
  | 'triage'
  | 'assigned_to_responder'
  | 'research_in_progress'
  | 'response_drafted'
  | 'cross_discipline_review'
  | 'answer_returned'
  | 'clarification_requested'
  | 'closed_out'
  | 'archived'
  | 'rejected'
  | 'void'
  | 'escalated';

export type IprAction =
  | 'draft_question'
  | 'submit'
  | 'triage'
  | 'assign_responder'
  | 'commence_research'
  | 'draft_response'
  | 'coordinate_review'
  | 'return_answer'
  | 'request_clarification'
  | 'close_out'
  | 'archive'
  | 'reject'
  | 'void'
  | 'escalate'
  | 'convert_to_change_order'
  | 'link_to_dispute';

export type IprTier =
  | 'clarification'
  | 'coordination'
  | 'construction_blocking'
  | 'emergency_safety';

export type IprParty =
  | 'contractor_PM'
  | 'doc_controller'
  | 'engineer'
  | 'owner_rep';

export type IprEvent =
  | 'ipp_rfi_drafted'
  | 'ipp_rfi_submitted'
  | 'ipp_rfi_triaged'
  | 'ipp_rfi_responder_assigned'
  | 'ipp_rfi_research_started'
  | 'ipp_rfi_response_drafted'
  | 'ipp_rfi_coordinated'
  | 'ipp_rfi_answered'
  | 'ipp_rfi_clarification_requested'
  | 'ipp_rfi_closed_out'
  | 'ipp_rfi_archived'
  | 'ipp_rfi_rejected'
  | 'ipp_rfi_voided'
  | 'ipp_rfi_escalated'
  | 'ipp_rfi_converted_to_change_order'
  | 'ipp_rfi_linked_to_dispute'
  | 'ipp_rfi_sla_breached';

// archived is HARD terminal. rejected + void are soft-terminals.
// escalated is a soft pause; can resume to research_in_progress or
// close_out.
const HARD_TERMINALS = new Set<IprStatus>([
  'archived',
]);

const UI_TERMINALS = new Set<IprStatus>([
  'archived',
  'rejected',
  'void',
]);

export function isTerminal(s: IprStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: IprStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// All non-terminal states (used by reject / void / escalate fan-outs).
const ALL_NON_TERMINAL: IprStatus[] = [
  'question_drafted',
  'submitted',
  'triage',
  'assigned_to_responder',
  'research_in_progress',
  'response_drafted',
  'cross_discipline_review',
  'answer_returned',
  'clarification_requested',
  'closed_out',
  'escalated',
];

// States from which escalate can be entered — research/review-touch
// states only.
const ESCALATE_FROM: IprStatus[] = [
  'research_in_progress',
  'response_drafted',
  'cross_discipline_review',
  'answer_returned',
  'clarification_requested',
];

// States from which void can be entered — only before triage.
const VOID_FROM: IprStatus[] = [
  'question_drafted',
  'submitted',
];

// Convert-to-change-order: only from research/review-touch states
// once we have enough context to spec the change.
const CONVERT_TO_CO_FROM: IprStatus[] = [
  'research_in_progress',
  'response_drafted',
  'cross_discipline_review',
  'answer_returned',
];

// link-to-dispute: only from review/escalated states where the
// dispute basis has crystallised.
const LINK_DISPUTE_FROM: IprStatus[] = [
  'cross_discipline_review',
  'answer_returned',
  'clarification_requested',
  'escalated',
];

export const TRANSITIONS: Record<IprAction, { from: IprStatus[]; to: IprStatus }> = {
  draft_question:          { from: ['question_drafted'],                                                                  to: 'question_drafted' },
  submit:                  { from: ['question_drafted', 'submitted'],                                                     to: 'submitted' },
  triage:                  { from: ['submitted', 'triage'],                                                               to: 'triage' },
  assign_responder:        { from: ['triage', 'assigned_to_responder'],                                                   to: 'assigned_to_responder' },
  commence_research:       { from: ['assigned_to_responder', 'research_in_progress', 'escalated'],                        to: 'research_in_progress' },
  draft_response:          { from: ['research_in_progress', 'response_drafted'],                                          to: 'response_drafted' },
  coordinate_review:       { from: ['response_drafted', 'cross_discipline_review'],                                       to: 'cross_discipline_review' },
  return_answer:           { from: ['response_drafted', 'cross_discipline_review', 'answer_returned'],                    to: 'answer_returned' },
  request_clarification:   { from: ['answer_returned', 'clarification_requested'],                                        to: 'clarification_requested' },
  close_out:               { from: ['answer_returned', 'clarification_requested', 'closed_out', 'escalated'],             to: 'closed_out' },
  archive:                 { from: ['closed_out'],                                                                        to: 'archived' },
  reject:                  { from: ALL_NON_TERMINAL,                                                                      to: 'rejected' },
  void:                    { from: VOID_FROM,                                                                             to: 'void' },
  escalate:                { from: ESCALATE_FROM,                                                                         to: 'escalated' },
  convert_to_change_order: { from: CONVERT_TO_CO_FROM,                                                                    to: 'closed_out' },
  link_to_dispute:         { from: LINK_DISPUTE_FROM,                                                                     to: 'escalated' },
};

export function nextStatus(current: IprStatus, action: IprAction): IprStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'draft_question' && current !== 'question_drafted') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: IprStatus): IprAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: IprAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [IprAction, typeof TRANSITIONS[IprAction]][]) {
    if (a === 'draft_question') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// URGENT SLA polarity stored as HOURS. 0 == no SLA. Higher RFI
// criticality (emergency_safety) gets the TIGHTEST window — a
// safety-blocking RFI must clear in hours; a narrative clarification
// can absorb 7 days.
const HOUR = 1;
const DAY = 24 * HOUR;

export const SLA_HOURS: Record<IprStatus, Record<IprTier, number>> = {
  question_drafted:       { emergency_safety: 2,  construction_blocking: 8,  coordination: 24,  clarification: 48 },
  submitted:              { emergency_safety: 4,  construction_blocking: 24, coordination: 72,  clarification: 168 }, // ANCHOR
  triage:                 { emergency_safety: 1,  construction_blocking: 4,  coordination: 12,  clarification: 24 },
  assigned_to_responder:  { emergency_safety: 1,  construction_blocking: 4,  coordination: 12,  clarification: 24 },
  research_in_progress:   { emergency_safety: 4,  construction_blocking: 24, coordination: 48,  clarification: 96 },
  response_drafted:       { emergency_safety: 2,  construction_blocking: 12, coordination: 24,  clarification: 48 },
  cross_discipline_review: { emergency_safety: 4, construction_blocking: 24, coordination: 48,  clarification: 96 },
  answer_returned:        { emergency_safety: 4,  construction_blocking: 24, coordination: 48,  clarification: 72 },
  clarification_requested: { emergency_safety: 4, construction_blocking: 24, coordination: 72,  clarification: 7 * DAY },
  closed_out:             { emergency_safety: 24, construction_blocking: 48, coordination: 96,  clarification: 168 },
  escalated:              { emergency_safety: 8,  construction_blocking: 24, coordination: 72,  clarification: 144 },
  archived:               { emergency_safety: 0,  construction_blocking: 0,  coordination: 0,   clarification: 0 },
  rejected:               { emergency_safety: 0,  construction_blocking: 0,  coordination: 0,   clarification: 0 },
  void:                   { emergency_safety: 0,  construction_blocking: 0,  coordination: 0,   clarification: 0 },
};

export function slaWindowHours(status: IprStatus, tier: IprTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: IprStatus, tier: IprTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from rfi_class.
export function tierForRfiClass(rfiClass: string | null | undefined): IprTier {
  const cls = (rfiClass || '').toLowerCase();
  if (cls === 'emergency_safety' || cls === 'safety' || cls === 'hv_safety') return 'emergency_safety';
  if (cls === 'construction_blocking' || cls === 'blocking' || cls === 'work_stoppage') return 'construction_blocking';
  if (cls === 'coordination' || cls === 'multi_discipline' || cls === 'interface') return 'coordination';
  return 'clarification';
}

export interface IprFloorFlags {
  safety_hazard_identified?: boolean | number | null;
  construction_stoppage_in_effect?: boolean | number | null;
  contractor_claim_basis?: boolean | number | null;
  dispute_basis_referenced?: boolean | number | null;
  regulatory_inquiry_triggered?: boolean | number | null;
}

export function countFloorFlags(args: IprFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.safety_hazard_identified) +
    t(args.construction_stoppage_in_effect) +
    t(args.contractor_claim_basis) +
    t(args.dispute_basis_referenced) +
    t(args.regulatory_inquiry_triggered)
  );
}

// FLOOR-AT-EMERGENCY-SAFETY on ANY one of the 5 contextual flags.
export function floorAtEmergencySafety(args: IprFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

export function effectiveTier(
  rawTier: IprTier,
  flags: IprFloorFlags,
): IprTier {
  if (floorAtEmergencySafety(flags)) return 'emergency_safety';
  return rawTier;
}

// Heavy tiers — emergency_safety + construction_blocking. SLA-breach
// reportability + signature crossings attach where not on universal
// hard lines.
const HEAVY_TIERS = new Set<IprTier>(['emergency_safety', 'construction_blocking']);

export function isHeavyTier(tier: IprTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: IprTier): boolean {
  return tier === 'emergency_safety';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W116 SIGNATURE: escalate crosses regulator EVERY tier when
// safety_hazard_identified || regulatory_inquiry_triggered. Safety/
// regulatory RFI escalation = IE/IPPO notice. Sister of W104-W115
// critical-action lines.
//
// Additional: reject crosses EVERY tier when contractor_claim_basis
// AND cost_impact_zar >= R10m (claim-basis rejection on big-money
// RFIs = dispute referral). convert_to_change_order crosses
// construction_blocking + emergency_safety only (W117 link).
export function crossesIntoRegulator(
  action: IprAction,
  tier: IprTier,
  args: {
    flags?: IprFloorFlags;
    cost_impact_zar?: number | null;
  },
): boolean {
  const flags = args.flags ?? {};
  const safety = !!flags.safety_hazard_identified;
  const stoppage = !!flags.construction_stoppage_in_effect;
  const claim = !!flags.contractor_claim_basis;
  const regulatory = !!flags.regulatory_inquiry_triggered;
  const cost = Number(args.cost_impact_zar ?? 0);

  // W116 SIGNATURE: escalate crosses regulator EVERY tier when
  // safety_hazard_identified OR regulatory_inquiry_triggered.
  if (action === 'escalate') {
    return safety || regulatory;
  }

  // reject crosses regulator EVERY tier when contractor_claim_basis
  // AND cost_impact_zar >= R10m.
  if (action === 'reject') {
    return claim && cost >= 10_000_000;
  }

  // convert_to_change_order crosses regulator on
  // construction_blocking + emergency_safety only (auto-link to W117).
  if (action === 'convert_to_change_order') {
    return tier === 'emergency_safety' || tier === 'construction_blocking';
  }

  // link_to_dispute crosses EVERY tier when dispute_basis_referenced
  // AND (claim basis OR construction stoppage in effect).
  if (action === 'link_to_dispute') {
    const dispute = !!flags.dispute_basis_referenced;
    return dispute && (claim || stoppage);
  }

  // close_out, archive, void never cross regulator on action.
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: IprTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<IprAction, IprParty> = {
  draft_question:          'contractor_PM',
  submit:                  'contractor_PM',
  void:                    'contractor_PM',
  link_to_dispute:         'contractor_PM',
  triage:                  'doc_controller',
  assign_responder:        'doc_controller',
  commence_research:       'engineer',
  draft_response:          'engineer',
  coordinate_review:       'engineer',
  return_answer:           'engineer',
  request_clarification:   'engineer',
  convert_to_change_order: 'engineer',
  close_out:               'owner_rep',
  archive:                 'owner_rep',
  reject:                  'owner_rep',
  escalate:                'owner_rep',
};

export function partyForAction(action: IprAction): IprParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: IprAction): IprEvent | null {
  switch (action) {
    case 'draft_question':          return 'ipp_rfi_drafted';
    case 'submit':                  return 'ipp_rfi_submitted';
    case 'triage':                  return 'ipp_rfi_triaged';
    case 'assign_responder':        return 'ipp_rfi_responder_assigned';
    case 'commence_research':       return 'ipp_rfi_research_started';
    case 'draft_response':          return 'ipp_rfi_response_drafted';
    case 'coordinate_review':       return 'ipp_rfi_coordinated';
    case 'return_answer':           return 'ipp_rfi_answered';
    case 'request_clarification':   return 'ipp_rfi_clarification_requested';
    case 'close_out':               return 'ipp_rfi_closed_out';
    case 'archive':                 return 'ipp_rfi_archived';
    case 'reject':                  return 'ipp_rfi_rejected';
    case 'void':                    return 'ipp_rfi_voided';
    case 'escalate':                return 'ipp_rfi_escalated';
    case 'convert_to_change_order': return 'ipp_rfi_converted_to_change_order';
    case 'link_to_dispute':         return 'ipp_rfi_linked_to_dispute';
  }
}

// ─── LIVE battery (~20 fields) ──────────────────────────────────────────

export function slaHoursRemaining(
  status: IprStatus,
  tier: IprTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type IprUrgency = 'critical' | 'high' | 'medium' | 'low';

// URGENT polarity: emergency_safety has the TIGHTEST urgency
// thresholds (less runway). clarification has LOOSEST.
export function urgencyBand(
  tier: IprTier,
  slaHoursLeft: number,
): IprUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'emergency_safety') {
    if (slaHoursLeft < 1)   return 'critical';
    if (slaHoursLeft < 2)   return 'high';
    if (slaHoursLeft < 4)   return 'medium';
    return 'low';
  }
  if (tier === 'construction_blocking') {
    if (slaHoursLeft < 4)   return 'critical';
    if (slaHoursLeft < 12)  return 'high';
    if (slaHoursLeft < 24)  return 'medium';
    return 'low';
  }
  if (tier === 'coordination') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 36)  return 'high';
    if (slaHoursLeft < 72)  return 'medium';
    return 'low';
  }
  // clarification
  if (slaHoursLeft < 24)    return 'critical';
  if (slaHoursLeft < 72)    return 'high';
  if (slaHoursLeft < 168)   return 'medium';
  return 'low';
}

// 3-step authority ladder: contractor_PM → engineer → owner_rep.
export type IprAuthority =
  | 'contractor_PM'
  | 'engineer'
  | 'owner_rep';

export function authorityRequired(tier: IprTier): IprAuthority {
  if (tier === 'emergency_safety') return 'owner_rep';
  if (tier === 'construction_blocking' || tier === 'coordination') return 'engineer';
  return 'contractor_PM';
}

// Regulator filing window hours — how fast a regulator-crossing event
// must be filed. URGENT polarity — emergency_safety tightest.
export function regulatorFilingWindowHours(tier: IprTier): number {
  if (tier === 'emergency_safety')      return 4;
  if (tier === 'construction_blocking') return 24;
  if (tier === 'coordination')          return 72;
  return 168;
}

// Days-to-construction-block-resolution — only relevant when
// construction is actively stopped. Drives urgency separately from
// SLA clock.
export function daysToConstructionBlockResolution(
  stoppage: boolean,
  stoppageStartedAt: Date | null,
  now: Date,
): number | null {
  if (!stoppage || !stoppageStartedAt) return null;
  const ms = now.getTime() - stoppageStartedAt.getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

// ─── 6-bridge architecture ──────────────────────────────────────────────
// W114 document control, W115 submittals, W112 schedule, W113 EVM,
// W19 procurement, W20 COD.
export function bridgesToDocumentControlChain(documentControlRef: string | null | undefined): boolean {
  return !!documentControlRef;
}
export function bridgesToSubmittalChain(submittalRef: string | null | undefined): boolean {
  return !!submittalRef;
}
export function bridgesToScheduleChain(scheduleRef: string | null | undefined): boolean {
  return !!scheduleRef;
}
export function bridgesToEvmChain(evmRef: string | null | undefined): boolean {
  return !!evmRef;
}
export function bridgesToProcurementChain(procurementRef: string | null | undefined): boolean {
  return !!procurementRef;
}
export function bridgesToCodChain(codRef: string | null | undefined): boolean {
  return !!codRef;
}

// linked_change_order_ref — pre-link to future W117 chain. Today this
// is just a passthrough flag (truthy → has CO link).
export function hasChangeOrderLink(changeOrderRef: string | null | undefined): boolean {
  return !!changeOrderRef;
}

// ─── RFI completeness index 0-130 ───────────────────────────────────────
// Tracks how many lifecycle milestones are stamped + bonus for clean
// close-out without rejection/void.
export function rfiCompletenessIndex(args: {
  question_drafted?: boolean | number | null;
  submitted?: boolean | number | null;
  triage?: boolean | number | null;
  assigned_to_responder?: boolean | number | null;
  research_in_progress?: boolean | number | null;
  response_drafted?: boolean | number | null;
  cross_discipline_review?: boolean | number | null;
  answer_returned?: boolean | number | null;
  clarification_requested?: boolean | number | null;
  closed_out?: boolean | number | null;
  archived?: boolean | number | null;
  clean_close_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.question_drafted)         * 6;
  score += t(args.submitted)                * 8;
  score += t(args.triage)                   * 6;
  score += t(args.assigned_to_responder)    * 6;
  score += t(args.research_in_progress)     * 8;
  score += t(args.response_drafted)         * 8;
  score += t(args.cross_discipline_review)  * 8;
  score += t(args.answer_returned)          * 10;
  score += t(args.clarification_requested)  * 6;
  score += t(args.closed_out)               * 12;
  score += t(args.archived)                 * 12;
  score += t(args.clean_close_bonus)        * 20;
  if (score > 130) score = 130;
  return score;
}

// ─── Hash-chain pre-stage for W118 ──────────────────────────────────────
// W118 will deliver tamper-evident hash-chain + merkle anchoring across
// every RFI event. W116 stamps an incrementing hash_chain_position +
// a placeholder merkle_root_segment so W118 can backfill without a
// migration. Today these are inert placeholders.
export function hashChainPositionFor(currentPosition: number | null | undefined): number {
  const p = Number(currentPosition ?? 0);
  if (!isFinite(p) || p < 0) return 1;
  return p + 1;
}

export function placeholderMerkleSegment(rfiId: string, position: number): string {
  // Deterministic 64-char hex placeholder. NOT cryptographic — W118
  // delivers the real hash chain. Stable shape so SPA + dashboards can
  // render the column today.
  const seed = `${rfiId}:${position}`;
  let h = 0n;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 1315423911n) ^ BigInt(seed.charCodeAt(i));
    h = h & 0xffffffffffffffffn;
  }
  const hex = h.toString(16).padStart(16, '0');
  // Compose a 64-char hex segment by tiling the 16-char hash 4x.
  return (hex + hex + hex + hex).slice(0, 64);
}
