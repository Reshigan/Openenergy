// ─────────────────────────────────────────────────────────────────────────
// Wave 115 — IPP Submittal / Transmittal Lifecycle chain.
//
// 10th IPP-pure chain. FOURTH Phase-A IPP wave (sibling of W112 WBS &
// Gantt schedule, W113 Cost & EVM, W114 Document Control). W112 owns the
// SCHEDULE; W113 owns the COST BOOK; W114 owns the DRAWING REGISTER;
// W115 owns the SUBMITTAL / TRANSMITTAL workflow — the rolling
// contractor → engineer → owner_rep delivery loop where every package
// can cycle through CSI 01 33 00 stamps A/B/C/D/E.
//
// Beats Procore Submittals / Aconex Workflows / Newforma Transmittals /
// Autodesk Construction Cloud Submittals / e-Builder Submittals / Asite
// Workflows / Conject Submittals / Oracle CCS Submittals / Coreworx EDMS
// / SmartUse Submittals. Each surfaces submittals as a list with a stamp
// + ball-in-court; W115 turns it into a 12-state P6 submittal chain with
// URGENT SLA polarity stored in HOURS, FLOOR-AT-CRITICAL-SAFETY on 5
// contextual flags (long_lead_item / commissioning_critical /
// regulatory_witness_required / lender_information_covenant /
// dispute_history), 3-step authority ladder (contractor_PM → engineer →
// owner_rep), 20-field LIVE submittal battery (stamp code A/B/C/D/E +
// cycle count + days-in-review + days-to-long-lead-deadline + SLA +
// urgency + authority + completeness + regulatory_witness_window +
// coordination_disciplines + comments_open + hash chain pre-stage +
// merkle root pre-stage + 6 bridges to W114 / W112 / W113 / W19 / W23 /
// W20), and the SIGNATURE STAMP-E-REJECT-CRITICAL EVERY-tier hard line.
//
// Standards: ISO 19650-2 §5.7 (information delivery workflows) + CSI
// 01 33 00 (Submittal Procedures — STAMPS A/B/C/D/E) + FIDIC Silver
// Book §6 (engineer's review) + NEC4 §54 (contractor information) +
// REIPPPP Schedule 4 (submittal protocol) + DMRE EPC submittal
// requirements.
//
// Forward path (clean submittal):
//   contractor_drafted → package_assembled → submitted → screening
//     → assigned_to_reviewer → under_review → coordination_review
//     → response_drafted → stamped_returned → resubmission_requested
//     → closed_out → archived (HARD terminal)
//
// Branches:
//   any non-terminal → rejected   (TERMINAL — stamp E "submit different
//                                  product" — SIGNATURE event when
//                                  critical_safety || commissioning_critical)
//   any non-terminal → void       (TERMINAL — pulled before assignment)
//   review states    → escalated  (SOFT — multi-discipline impasse; can
//                                  resume to under_review or close)
//
// Tier RE-DERIVED on every transition from submittal_class with
// FLOOR-AT-CRITICAL-SAFETY on 5 contextual flags:
//   - long_lead_item                 (long-lead procurement; days-to-
//                                      long-lead-deadline drives urgency)
//   - commissioning_critical          (gates a commissioning step)
//   - regulatory_witness_required    (witness hold-point in NERSA/DMRE
//                                      submittal package)
//   - lender_information_covenant    (LMA covenant — IE/LE distribution)
//   - dispute_history                (rejected/escalated in prior cycle)
//
// 4 tiers (URGENT polarity — higher submittal-criticality = TIGHTER):
//   om_manual         : O&M manual / spare-parts list (long runway)
//   material_approval : material brand / catalogue cuts
//   shop_drawing      : fabrication shop drawing
//   critical_safety   : safety-critical material / shop drawing /
//                        commissioning-critical / any flag-triggered floor
//
// URGENT SLA polarity stored as HOURS. Anchor on submitted (the moment
// the package leaves the contractor and lands on the engineer's desk):
//   critical_safety  × submitted = 24  hrs
//   shop_drawing     × submitted = 168 hrs (7d)
//   material_approval × submitted = 240 hrs (10d)
//   om_manual        × submitted = 480 hrs (20d)
//
// SIGNATURE Phase-A IPP regulator crossings (ISO 19650-2 + CSI 01 33 00
// + REIPPPP Schedule 4 + DMRE):
//   stamp_return  → EVERY tier when stamp_code = 'E' AND
//                    (critical_safety || commissioning_critical)
//                    (W115 SIGNATURE STAMP-E-REJECT-CRITICAL hard line —
//                     stamp E on safety/commissioning-critical submittal
//                     = supplier disqualification reportable to IE/IPPO;
//                     sister of W104-W114 critical-action lines)
//   reject        → EVERY tier when long_lead_item AND cycle_count >= 3
//                    (cycle-fatigue disqualification)
//   escalate      → material_approval + critical_safety only when
//                    regulatory_witness_required
//   close_out     → no regulator
//   sla_breached  → critical_safety + shop_drawing only
//
// Write {admin, ipp_developer}. READ all 9 personas. actor_party split:
//   contractor_PM : draft_package, assemble_package, submit, void
//   doc_controller: screen, assign_reviewer
//   engineer      : commence_review, coordinate_review, draft_response,
//                    stamp_return, request_resubmission,
//                    approve_with_comments
//   owner_rep     : close_out, archive, reject, escalate
//
// Event prefix: `ipp_submittal_evt_`. AUDIT_PREFIX_MAP entry:
//   ipp_submittal: 'ipp'
//
// Two crons:
//   - */15 * * * *   SLA sweep
//   - 30 0 * * *     nightly cycle-count + stamp-code refresh
//                     (no auto-transition — submittal decisions never
//                     auto-moved by cron)
// ─────────────────────────────────────────────────────────────────────────

export type IpsStatus =
  | 'contractor_drafted'
  | 'package_assembled'
  | 'submitted'
  | 'screening'
  | 'assigned_to_reviewer'
  | 'under_review'
  | 'coordination_review'
  | 'response_drafted'
  | 'stamped_returned'
  | 'resubmission_requested'
  | 'closed_out'
  | 'archived'
  | 'rejected'
  | 'void'
  | 'escalated';

export type IpsAction =
  | 'draft_package'
  | 'assemble_package'
  | 'submit'
  | 'screen'
  | 'assign_reviewer'
  | 'commence_review'
  | 'coordinate_review'
  | 'draft_response'
  | 'stamp_return'
  | 'request_resubmission'
  | 'close_out'
  | 'archive'
  | 'reject'
  | 'void'
  | 'escalate'
  | 'approve_with_comments';

export type IpsTier =
  | 'om_manual'
  | 'material_approval'
  | 'shop_drawing'
  | 'critical_safety';

export type IpsParty =
  | 'contractor_PM'
  | 'doc_controller'
  | 'engineer'
  | 'owner_rep';

// CSI 01 33 00 stamps:
//   A = Approved
//   B = Approved as Noted
//   C = Revise & Resubmit
//   D = Not Approved
//   E = Rejected (submit different product) — SIGNATURE event when
//        critical_safety || commissioning_critical.
export type IpsStampCode = 'A' | 'B' | 'C' | 'D' | 'E';

export type IpsEvent =
  | 'ipp_submittal_drafted'
  | 'ipp_submittal_assembled'
  | 'ipp_submittal_submitted'
  | 'ipp_submittal_screened'
  | 'ipp_submittal_reviewer_assigned'
  | 'ipp_submittal_review_started'
  | 'ipp_submittal_coordinated'
  | 'ipp_submittal_response_drafted'
  | 'ipp_submittal_stamped'
  | 'ipp_submittal_resubmission_requested'
  | 'ipp_submittal_closed_out'
  | 'ipp_submittal_archived'
  | 'ipp_submittal_rejected'
  | 'ipp_submittal_voided'
  | 'ipp_submittal_escalated'
  | 'ipp_submittal_approved_with_comments'
  | 'ipp_submittal_sla_breached';

// archived is HARD terminal. rejected + void are soft-terminals (this
// package lifecycle ends; a new package can be drafted as a fresh chain).
// escalated is a soft pause.
const HARD_TERMINALS = new Set<IpsStatus>([
  'archived',
]);

const UI_TERMINALS = new Set<IpsStatus>([
  'archived',
  'rejected',
  'void',
]);

export function isTerminal(s: IpsStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: IpsStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// All non-terminal states (used by reject / void / escalate fan-outs).
const ALL_NON_TERMINAL: IpsStatus[] = [
  'contractor_drafted',
  'package_assembled',
  'submitted',
  'screening',
  'assigned_to_reviewer',
  'under_review',
  'coordination_review',
  'response_drafted',
  'stamped_returned',
  'resubmission_requested',
  'closed_out',
  'escalated',
];

// States from which escalate can be entered — review-touch states only.
const ESCALATE_FROM: IpsStatus[] = [
  'under_review',
  'coordination_review',
  'response_drafted',
  'stamped_returned',
  'resubmission_requested',
];

// States from which void can be entered — only before reviewer assignment.
const VOID_FROM: IpsStatus[] = [
  'contractor_drafted',
  'package_assembled',
  'submitted',
  'screening',
];

export const TRANSITIONS: Record<IpsAction, { from: IpsStatus[]; to: IpsStatus }> = {
  draft_package:          { from: ['contractor_drafted'],                                              to: 'contractor_drafted' },
  assemble_package:       { from: ['contractor_drafted', 'package_assembled', 'resubmission_requested'], to: 'package_assembled' },
  submit:                 { from: ['package_assembled', 'submitted'],                                  to: 'submitted' },
  screen:                 { from: ['submitted', 'screening'],                                          to: 'screening' },
  assign_reviewer:        { from: ['screening', 'assigned_to_reviewer'],                               to: 'assigned_to_reviewer' },
  commence_review:        { from: ['assigned_to_reviewer', 'under_review'],                            to: 'under_review' },
  coordinate_review:      { from: ['under_review', 'coordination_review'],                             to: 'coordination_review' },
  draft_response:         { from: ['under_review', 'coordination_review', 'response_drafted'],         to: 'response_drafted' },
  stamp_return:           { from: ['response_drafted', 'stamped_returned'],                            to: 'stamped_returned' },
  request_resubmission:   { from: ['stamped_returned', 'resubmission_requested'],                      to: 'resubmission_requested' },
  approve_with_comments:  { from: ['under_review', 'coordination_review', 'response_drafted'],         to: 'stamped_returned' },
  close_out:              { from: ['stamped_returned', 'closed_out', 'escalated'],                     to: 'closed_out' },
  archive:                { from: ['closed_out'],                                                      to: 'archived' },
  reject:                 { from: ALL_NON_TERMINAL,                                                    to: 'rejected' },
  void:                   { from: VOID_FROM,                                                           to: 'void' },
  escalate:               { from: ESCALATE_FROM,                                                       to: 'escalated' },
};

export function nextStatus(current: IpsStatus, action: IpsAction): IpsStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'draft_package' && current !== 'contractor_drafted') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: IpsStatus): IpsAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: IpsAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [IpsAction, typeof TRANSITIONS[IpsAction]][]) {
    if (a === 'draft_package') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// URGENT SLA polarity stored as HOURS. 0 == no SLA. Higher submittal
// criticality (critical_safety) gets the TIGHTEST window — because a
// safety-critical material delay propagates straight into commissioning
// while an O&M manual review can absorb 20 days.
const HOUR = 1;
const DAY = 24 * HOUR;

export const SLA_HOURS: Record<IpsStatus, Record<IpsTier, number>> = {
  contractor_drafted:     { critical_safety: 24,  shop_drawing: 72,  material_approval: 96,  om_manual: 168 },
  package_assembled:      { critical_safety: 12,  shop_drawing: 48,  material_approval: 72,  om_manual: 120 },
  submitted:              { critical_safety: 24,  shop_drawing: 168, material_approval: 240, om_manual: 480 }, // ANCHOR
  screening:              { critical_safety: 12,  shop_drawing: 24,  material_approval: 48,  om_manual: 72 },
  assigned_to_reviewer:   { critical_safety: 12,  shop_drawing: 24,  material_approval: 48,  om_manual: 72 },
  under_review:           { critical_safety: 24,  shop_drawing: 120, material_approval: 168, om_manual: 360 },
  coordination_review:    { critical_safety: 24,  shop_drawing: 96,  material_approval: 120, om_manual: 240 },
  response_drafted:       { critical_safety: 12,  shop_drawing: 48,  material_approval: 72,  om_manual: 120 },
  stamped_returned:       { critical_safety: 24,  shop_drawing: 72,  material_approval: 96,  om_manual: 168 },
  resubmission_requested: { critical_safety: 24,  shop_drawing: 7 * DAY, material_approval: 10 * DAY, om_manual: 20 * DAY },
  closed_out:             { critical_safety: 48,  shop_drawing: 96,  material_approval: 168, om_manual: 240 },
  escalated:              { critical_safety: 48,  shop_drawing: 96,  material_approval: 168, om_manual: 240 },
  archived:               { critical_safety: 0,   shop_drawing: 0,   material_approval: 0,   om_manual: 0 },
  rejected:               { critical_safety: 0,   shop_drawing: 0,   material_approval: 0,   om_manual: 0 },
  void:                   { critical_safety: 0,   shop_drawing: 0,   material_approval: 0,   om_manual: 0 },
};

export function slaWindowHours(status: IpsStatus, tier: IpsTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: IpsStatus, tier: IpsTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from submittal_class.
export function tierForSubmittalClass(submittalClass: string | null | undefined): IpsTier {
  const cls = (submittalClass || '').toLowerCase();
  if (cls === 'critical_safety' || cls === 'safety_critical' || cls === 'hv_material') return 'critical_safety';
  if (cls === 'shop_drawing' || cls === 'fabrication' || cls === 'isometric') return 'shop_drawing';
  if (cls === 'material_approval' || cls === 'material' || cls === 'catalogue_cut') return 'material_approval';
  return 'om_manual';
}

export interface IpsFloorFlags {
  long_lead_item?: boolean | number | null;
  commissioning_critical?: boolean | number | null;
  regulatory_witness_required?: boolean | number | null;
  lender_information_covenant?: boolean | number | null;
  dispute_history?: boolean | number | null;
}

export function countFloorFlags(args: IpsFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.long_lead_item) +
    t(args.commissioning_critical) +
    t(args.regulatory_witness_required) +
    t(args.lender_information_covenant) +
    t(args.dispute_history)
  );
}

// FLOOR-AT-CRITICAL-SAFETY on ANY one of the 5 contextual flags.
export function floorAtCriticalSafety(args: IpsFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

export function effectiveTier(
  rawTier: IpsTier,
  flags: IpsFloorFlags,
): IpsTier {
  if (floorAtCriticalSafety(flags)) return 'critical_safety';
  return rawTier;
}

// Heavy tiers — critical_safety + shop_drawing. SLA-breach reportability
// + signature crossings attach where not on universal hard lines.
const HEAVY_TIERS = new Set<IpsTier>(['critical_safety', 'shop_drawing']);

export function isHeavyTier(tier: IpsTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: IpsTier): boolean {
  return tier === 'critical_safety';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
export function crossesIntoRegulator(
  action: IpsAction,
  tier: IpsTier,
  args: {
    flags?: IpsFloorFlags;
    stamp_code?: IpsStampCode | null;
    cycle_count?: number | null;
  },
): boolean {
  const flags = args.flags ?? {};
  const ccp = !!flags.commissioning_critical;
  const longLead = !!flags.long_lead_item;
  const witness = !!flags.regulatory_witness_required;
  const stamp = args.stamp_code ?? null;
  const cycles = Number(args.cycle_count ?? 0);

  // W115 SIGNATURE: stamp_return crosses regulator EVERY tier when
  // stamp_code = 'E' AND (critical_safety tier OR commissioning_critical
  // flag) — supplier disqualification reportable to IE/IPPO.
  if (action === 'stamp_return') {
    if (stamp !== 'E') return false;
    return tier === 'critical_safety' || ccp;
  }

  // reject crosses regulator EVERY tier when long_lead_item AND
  // cycle_count >= 3 (cycle-fatigue disqualification).
  if (action === 'reject') {
    return longLead && cycles >= 3;
  }

  // escalate crosses regulator material_approval + critical_safety only
  // when regulatory_witness_required.
  if (action === 'escalate') {
    if (!witness) return false;
    return tier === 'critical_safety' || tier === 'material_approval';
  }

  // close_out, archive, void never cross regulator on action.
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: IpsTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<IpsAction, IpsParty> = {
  draft_package:         'contractor_PM',
  assemble_package:      'contractor_PM',
  submit:                'contractor_PM',
  void:                  'contractor_PM',
  screen:                'doc_controller',
  assign_reviewer:       'doc_controller',
  commence_review:       'engineer',
  coordinate_review:     'engineer',
  draft_response:        'engineer',
  stamp_return:          'engineer',
  request_resubmission:  'engineer',
  approve_with_comments: 'engineer',
  close_out:             'owner_rep',
  archive:               'owner_rep',
  reject:                'owner_rep',
  escalate:              'owner_rep',
};

export function partyForAction(action: IpsAction): IpsParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: IpsAction): IpsEvent | null {
  switch (action) {
    case 'draft_package':         return 'ipp_submittal_drafted';
    case 'assemble_package':      return 'ipp_submittal_assembled';
    case 'submit':                return 'ipp_submittal_submitted';
    case 'screen':                return 'ipp_submittal_screened';
    case 'assign_reviewer':       return 'ipp_submittal_reviewer_assigned';
    case 'commence_review':       return 'ipp_submittal_review_started';
    case 'coordinate_review':     return 'ipp_submittal_coordinated';
    case 'draft_response':        return 'ipp_submittal_response_drafted';
    case 'stamp_return':          return 'ipp_submittal_stamped';
    case 'request_resubmission':  return 'ipp_submittal_resubmission_requested';
    case 'close_out':             return 'ipp_submittal_closed_out';
    case 'archive':               return 'ipp_submittal_archived';
    case 'reject':                return 'ipp_submittal_rejected';
    case 'void':                  return 'ipp_submittal_voided';
    case 'escalate':              return 'ipp_submittal_escalated';
    case 'approve_with_comments': return 'ipp_submittal_approved_with_comments';
  }
}

// ─── LIVE battery (~20 fields) ──────────────────────────────────────────

export function slaHoursRemaining(
  status: IpsStatus,
  tier: IpsTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type IpsUrgency = 'critical' | 'high' | 'medium' | 'low';

// URGENT polarity: critical_safety has the TIGHTEST urgency thresholds
// (less runway). om_manual has LOOSEST.
export function urgencyBand(
  tier: IpsTier,
  slaHoursLeft: number,
): IpsUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'critical_safety') {
    if (slaHoursLeft < 4)   return 'critical';
    if (slaHoursLeft < 8)   return 'high';
    if (slaHoursLeft < 16)  return 'medium';
    return 'low';
  }
  if (tier === 'shop_drawing') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 120) return 'medium';
    return 'low';
  }
  if (tier === 'material_approval') {
    if (slaHoursLeft < 36)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  // om_manual
  if (slaHoursLeft < 72)    return 'critical';
  if (slaHoursLeft < 168)   return 'high';
  if (slaHoursLeft < 336)   return 'medium';
  return 'low';
}

// 3-step authority ladder: contractor_PM → engineer → owner_rep.
export type IpsAuthority =
  | 'contractor_PM'
  | 'engineer'
  | 'owner_rep';

export function authorityRequired(tier: IpsTier): IpsAuthority {
  if (tier === 'critical_safety') return 'owner_rep';
  if (tier === 'shop_drawing' || tier === 'material_approval') return 'engineer';
  return 'contractor_PM';
}

// Regulator filing window hours — how fast a regulator-crossing event
// must be filed. URGENT polarity — critical_safety tightest.
export function regulatorFilingWindowHours(tier: IpsTier): number {
  if (tier === 'critical_safety')  return 24;
  if (tier === 'shop_drawing')     return 48;
  if (tier === 'material_approval') return 72;
  return 168;
}

// Regulatory witness window hours — how long the witness hold-point can
// pause the chain before SLA breach.
export function regulatoryWitnessWindowHours(tier: IpsTier, witnessRequired: boolean): number {
  if (!witnessRequired) return 0;
  if (tier === 'critical_safety')  return 48;
  if (tier === 'shop_drawing')     return 120;
  if (tier === 'material_approval') return 168;
  return 240;
}

// ─── Stamp + cycle helpers ──────────────────────────────────────────────
// Stamp derived from action + body. stamp_return defaults to D (Not
// Approved) unless body specifies; approve_with_comments → B.
export function stampForAction(action: IpsAction, bodyStamp?: IpsStampCode | null): IpsStampCode | null {
  if (action === 'stamp_return') {
    return bodyStamp ?? 'D';
  }
  if (action === 'approve_with_comments') return 'B';
  return null;
}

// cycle_count increments on resubmission_requested or assemble_package
// after a resubmission_requested phase.
export function incrementCycleCount(
  action: IpsAction,
  fromStatus: IpsStatus,
  currentCycle: number,
): number {
  if (action === 'request_resubmission') return currentCycle + 1;
  if (action === 'assemble_package' && fromStatus === 'resubmission_requested') return currentCycle + 1;
  return currentCycle;
}

// ─── 6-bridge architecture ──────────────────────────────────────────────
// W114 document control (latest IFC drawing set), W112 schedule (submittal
// dates anchor activity windows), W113 EVM (cost variance from rework),
// W19 procurement (BOQ procurement matches), W23 insurance (warranty
// claims), W20 COD (closeout gates commercial operation).
export function bridgesToDocumentControlChain(documentControlRef: string | null | undefined): boolean {
  return !!documentControlRef;
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
export function bridgesToInsuranceChain(insuranceRef: string | null | undefined): boolean {
  return !!insuranceRef;
}
export function bridgesToCodChain(codRef: string | null | undefined): boolean {
  return !!codRef;
}

// ─── Submittal completeness index 0-130 ─────────────────────────────────
// Tracks how many lifecycle milestones are stamped + bonus for clean
// close-out without rejection/void.
export function submittalCompletenessIndex(args: {
  contractor_drafted?: boolean | number | null;
  package_assembled?: boolean | number | null;
  submitted?: boolean | number | null;
  screening?: boolean | number | null;
  assigned_to_reviewer?: boolean | number | null;
  under_review?: boolean | number | null;
  coordination_review?: boolean | number | null;
  response_drafted?: boolean | number | null;
  stamped_returned?: boolean | number | null;
  resubmission_requested?: boolean | number | null;
  closed_out?: boolean | number | null;
  archived?: boolean | number | null;
  clean_close_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.contractor_drafted)     * 6;
  score += t(args.package_assembled)      * 6;
  score += t(args.submitted)              * 8;
  score += t(args.screening)              * 6;
  score += t(args.assigned_to_reviewer)   * 6;
  score += t(args.under_review)           * 8;
  score += t(args.coordination_review)    * 8;
  score += t(args.response_drafted)       * 8;
  score += t(args.stamped_returned)       * 10;
  score += t(args.resubmission_requested) * 6;
  score += t(args.closed_out)             * 12;
  score += t(args.archived)               * 12;
  score += t(args.clean_close_bonus)      * 20;
  if (score > 130) score = 130;
  return score;
}

// ─── Hash-chain pre-stage for W118 ──────────────────────────────────────
// W118 will deliver tamper-evident hash-chain + merkle anchoring across
// every submittal event. W115 stamps an incrementing hash_chain_position +
// a placeholder merkle_root_segment so W118 can backfill without a
// migration. Today these are inert placeholders.
export function hashChainPositionFor(currentPosition: number | null | undefined): number {
  const p = Number(currentPosition ?? 0);
  if (!isFinite(p) || p < 0) return 1;
  return p + 1;
}

export function placeholderMerkleSegment(submittalId: string, position: number): string {
  // Deterministic 64-char hex placeholder. NOT cryptographic — W118
  // delivers the real hash chain. Stable shape so SPA + dashboards can
  // render the column today.
  const seed = `${submittalId}:${position}`;
  let h = 0n;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 1315423911n) ^ BigInt(seed.charCodeAt(i));
    h = h & 0xffffffffffffffffn;
  }
  const hex = h.toString(16).padStart(16, '0');
  // Compose a 64-char hex segment by tiling the 16-char hash 4x.
  return (hex + hex + hex + hex).slice(0, 64);
}
