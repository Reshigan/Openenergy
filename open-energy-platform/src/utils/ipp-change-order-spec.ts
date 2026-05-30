// ─────────────────────────────────────────────────────────────────────────
// Wave 117 — IPP Change Orders & Variations chain.
//
// 12th IPP-pure chain — TARGET-CLOSING for the Phase-A 12-chain IPP gold
// standard (W1 / W10 / W19 / W20 / W23 / W27 / W112 / W113 / W114 / W115 /
// W116 / W117). SIXTH AND FINAL Phase-A world-class wave. Sibling of W112
// schedule, W113 cost/EVM, W114 doc control, W115 submittals, W116 RFIs.
//
// W117 owns the CHANGE ORDER / VARIATION lifecycle — the formal route by
// which scope/cost/schedule changes are proposed, priced, negotiated,
// approved, scheduled, executed, and closed out under FIDIC §13 / NEC4
// §60-65 / AIA G701/G714 / CSI 01 26 00. Each prior wave can feed into
// W117: an RFI (W116) becomes a CR, a doc/drawing revision (W114) feeds
// scope quantification, a submittal change (W115) triggers cost
// reprice, a schedule slip (W112) requires recovery CR, an EVM cost
// blow-out (W113) triggers VOWD reset.
//
// Beats Procore Change Management / Aconex Cost Mgmt CRs / Oracle Aconex
// Variations / Autodesk Construction Cloud Cost / e-Builder Change Mgmt
// / Asite CRs / Coreworx Change / SAP S/4HANA EPC variations / Deltek
// Cobra change mgmt / InEight Control change mgmt. Each surfaces CRs as
// a list with status; W117 turns it into a 12-state P6 CR chain with
// INVERTED SLA polarity in HOURS, FLOOR-AT-MAJOR on 5 contextual flags
// (scope_baseline_change / regulatory_re_consent_required /
// schedule_impact_critical_path / lender_consent_required /
// safety_design_change), 4-step authority ladder (PM → engineer →
// owner_rep → IPP_CEO), 22-field LIVE CR battery (REIPPPP cumulative
// CR-value cap signal + EVM bridges + EAC delta + completeness + hash
// chain pre-stage + merkle root pre-stage + 6 bridges to W116 / W115 /
// W114 / W112 / W113 / W19 / W20), and the SIGNATURE SCOPE-BASELINE-
// CHANGE-APPROVE EVERY-tier hard line.
//
// Standards: FIDIC Silver §13 (Variations and Adjustments) + NEC4 §60-65
// (compensation events) + AIA G701 (Change Order) + AIA G714
// (Construction Change Directive) + CSI 01 26 00 (Contract Modification
// Procedures) + REIPPPP variations protocol + DMRE EPC change-control
// circular.
//
// Forward path (clean CR):
//   change_proposed → impact_assessed → cost_quoted → owner_review
//     → negotiated → approved → issued_for_execution → scheduled
//     → executing → executed → closed_out → archived (HARD terminal)
//
// Branches:
//   any non-terminal → rejected   (TERMINAL — out of scope / refused)
//   pre-approval     → void       (TERMINAL — withdrawn before approval)
//   pre-execution    → on_hold    (SOFT — paused; can resume to last
//                                   forward step)
//   review-touch     → disputed   (SOFT — pricing/schedule dispute; can
//                                   resume to negotiated or rejected)
//
// Tier RE-DERIVED on every transition from change_value_zar with
// FLOOR-AT-MAJOR on 5 contextual flags:
//   - scope_baseline_change            (alters the contracted scope
//                                       baseline — REIPPPP red-line)
//   - regulatory_re_consent_required   (CR triggers NERSA/DMRE/IPPO
//                                       re-consent or addendum)
//   - schedule_impact_critical_path    (CR pushes critical-path completion)
//   - lender_consent_required          (CR is a lender-consent event under
//                                       common-terms agreement)
//   - safety_design_change             (CR alters a safety-critical design
//                                       element)
//
// 4 tiers (INVERTED polarity — larger CR-value = MORE TIME for diligence):
//   minor            : <R500k                       (admin-level)
//   material         : R500k - R5m                  (engineer-level)
//   major            : R5m - R50m OR 1 floor flag   (owner_rep-level)
//   transformational : >=R50m OR 2+ floor flags     (IPP_CEO-level)
//
// INVERTED SLA polarity stored as HOURS. Anchor on owner_review:
//   minor            × owner_review = 168  hrs (7d)
//   material         × owner_review = 336  hrs (14d)
//   major            × owner_review = 720  hrs (30d)
//   transformational × owner_review = 1080 hrs (45d)
//
// SIGNATURE Phase-A IPP regulator crossings (FIDIC §13 + NEC4 §60-65 +
// REIPPPP + DMRE):
//   approve → EVERY tier when scope_baseline_change ||
//             regulatory_re_consent_required
//             (W117 SIGNATURE SCOPE-BASELINE-CHANGE-APPROVE hard line —
//              scope baseline / regulatory re-consent approval = NERSA/
//              IPPO/DMRE notice; closes the Phase-A IPP regulator-crossing
//              family started at W112)
//   reject  → EVERY tier when cumulative_change_value_pct >= 15
//             (REIPPPP cumulative CR cap signal — once 15% of
//              contract-value bucket is consumed, every refusal is
//              reportable to IPPO)
//   dispute → major + transformational only (price/schedule dispute on
//             material money = referral pathway)
//   close_out, archive, void, hold_resume → no regulator
//   sla_breached → major + transformational only
//
// Write {admin, ipp_developer}. READ all 9 personas. actor_party split:
//   PM:        propose, submit_for_review, hold_resume, void
//   engineer:  assess_impact, quote_cost
//   owner_rep: negotiate, reject, dispute
//   IPP_CEO:   approve, issue, schedule, commence_execution,
//              complete_execution, close_out, archive
//
// Event prefix: `ipp_change_order_evt_`. AUDIT_PREFIX_MAP entry:
//   ipp_change_order: 'ipp'
//
// Two crons:
//   - */15 * * * *   SLA sweep
//   - 40 0 * * *     nightly cumulative-CR-value-pct recompute (refresh
//                     the cumulative_change_value_pct against contract
//                     bucket without auto-transitioning - CR decisions
//                     never auto-moved by cron)
// ─────────────────────────────────────────────────────────────────────────

export type IcoStatus =
  | 'change_proposed'
  | 'impact_assessed'
  | 'cost_quoted'
  | 'owner_review'
  | 'negotiated'
  | 'approved'
  | 'issued_for_execution'
  | 'scheduled'
  | 'executing'
  | 'executed'
  | 'closed_out'
  | 'archived'
  | 'rejected'
  | 'void'
  | 'on_hold'
  | 'disputed';

export type IcoAction =
  | 'propose'
  | 'assess_impact'
  | 'quote_cost'
  | 'submit_for_review'
  | 'negotiate'
  | 'approve'
  | 'issue'
  | 'schedule'
  | 'commence_execution'
  | 'complete_execution'
  | 'close_out'
  | 'archive'
  | 'reject'
  | 'void'
  | 'hold_resume'
  | 'dispute';

export type IcoTier =
  | 'minor'
  | 'material'
  | 'major'
  | 'transformational';

export type IcoParty =
  | 'PM'
  | 'engineer'
  | 'owner_rep'
  | 'IPP_CEO';

export type IcoEvent =
  | 'ipp_change_order_proposed'
  | 'ipp_change_order_impact_assessed'
  | 'ipp_change_order_cost_quoted'
  | 'ipp_change_order_submitted_for_review'
  | 'ipp_change_order_negotiated'
  | 'ipp_change_order_approved'
  | 'ipp_change_order_issued'
  | 'ipp_change_order_scheduled'
  | 'ipp_change_order_execution_started'
  | 'ipp_change_order_execution_completed'
  | 'ipp_change_order_closed_out'
  | 'ipp_change_order_archived'
  | 'ipp_change_order_rejected'
  | 'ipp_change_order_voided'
  | 'ipp_change_order_hold_resumed'
  | 'ipp_change_order_disputed'
  | 'ipp_change_order_sla_breached';

// archived is HARD terminal. rejected + void are soft-terminals.
// on_hold + disputed are soft pauses; can resume into prior forward
// steps.
const HARD_TERMINALS = new Set<IcoStatus>([
  'archived',
]);

const UI_TERMINALS = new Set<IcoStatus>([
  'archived',
  'rejected',
  'void',
]);

export function isTerminal(s: IcoStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: IcoStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// All non-terminal states (used by reject fan-out).
const ALL_NON_TERMINAL: IcoStatus[] = [
  'change_proposed',
  'impact_assessed',
  'cost_quoted',
  'owner_review',
  'negotiated',
  'approved',
  'issued_for_execution',
  'scheduled',
  'executing',
  'executed',
  'closed_out',
  'on_hold',
  'disputed',
];

// States from which void can be entered — only before approval.
const VOID_FROM: IcoStatus[] = [
  'change_proposed',
  'impact_assessed',
  'cost_quoted',
  'owner_review',
  'negotiated',
];

// States from which hold_resume (placeholder for hold-and-resume) can
// be entered — only before execution starts. Soft pause.
const HOLD_FROM: IcoStatus[] = [
  'change_proposed',
  'impact_assessed',
  'cost_quoted',
  'owner_review',
  'negotiated',
  'approved',
  'issued_for_execution',
  'scheduled',
  'on_hold',
];

// States from which dispute can be entered — only in review-touch
// states where pricing/schedule is being challenged.
const DISPUTE_FROM: IcoStatus[] = [
  'cost_quoted',
  'owner_review',
  'negotiated',
  'disputed',
];

export const TRANSITIONS: Record<IcoAction, { from: IcoStatus[]; to: IcoStatus }> = {
  propose:            { from: ['change_proposed'],                                                                        to: 'change_proposed' },
  assess_impact:      { from: ['change_proposed', 'impact_assessed'],                                                     to: 'impact_assessed' },
  quote_cost:         { from: ['impact_assessed', 'cost_quoted'],                                                         to: 'cost_quoted' },
  submit_for_review:  { from: ['cost_quoted', 'owner_review'],                                                            to: 'owner_review' },
  negotiate:          { from: ['owner_review', 'negotiated', 'disputed'],                                                 to: 'negotiated' },
  approve:            { from: ['owner_review', 'negotiated', 'approved'],                                                 to: 'approved' },
  issue:              { from: ['approved', 'issued_for_execution'],                                                       to: 'issued_for_execution' },
  schedule:           { from: ['issued_for_execution', 'scheduled'],                                                      to: 'scheduled' },
  commence_execution: { from: ['scheduled', 'executing'],                                                                 to: 'executing' },
  complete_execution: { from: ['executing', 'executed'],                                                                  to: 'executed' },
  close_out:          { from: ['executed', 'closed_out'],                                                                 to: 'closed_out' },
  archive:            { from: ['closed_out'],                                                                             to: 'archived' },
  reject:             { from: ALL_NON_TERMINAL,                                                                           to: 'rejected' },
  void:               { from: VOID_FROM,                                                                                  to: 'void' },
  hold_resume:        { from: HOLD_FROM,                                                                                  to: 'on_hold' },
  dispute:            { from: DISPUTE_FROM,                                                                               to: 'disputed' },
};

export function nextStatus(current: IcoStatus, action: IcoAction): IcoStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose' && current !== 'change_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: IcoStatus): IcoAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: IcoAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [IcoAction, typeof TRANSITIONS[IcoAction]][]) {
    if (a === 'propose') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger CR-value
// (transformational) gets the LONGEST window — a R100m+ CR demands deep
// diligence; a R200k admin CR can clear in a week.

export const SLA_HOURS: Record<IcoStatus, Record<IcoTier, number>> = {
  change_proposed:      { minor: 48,  material: 96,  major: 168, transformational: 240 },
  impact_assessed:      { minor: 72,  material: 168, major: 336, transformational: 480 },
  cost_quoted:          { minor: 96,  material: 192, major: 360, transformational: 504 },
  owner_review:         { minor: 168, material: 336, major: 720, transformational: 1080 }, // ANCHOR
  negotiated:           { minor: 96,  material: 168, major: 360, transformational: 504 },
  approved:             { minor: 48,  material: 96,  major: 168, transformational: 240 },
  issued_for_execution: { minor: 48,  material: 96,  major: 168, transformational: 240 },
  scheduled:            { minor: 96,  material: 168, major: 336, transformational: 480 },
  executing:            { minor: 168, material: 336, major: 720, transformational: 1080 },
  executed:             { minor: 96,  material: 168, major: 336, transformational: 480 },
  closed_out:           { minor: 168, material: 240, major: 360, transformational: 504 },
  on_hold:              { minor: 168, material: 240, major: 360, transformational: 504 },
  disputed:             { minor: 96,  material: 168, major: 336, transformational: 480 },
  archived:             { minor: 0,   material: 0,   major: 0,   transformational: 0 },
  rejected:             { minor: 0,   material: 0,   major: 0,   transformational: 0 },
  void:                 { minor: 0,   material: 0,   major: 0,   transformational: 0 },
};

export function slaWindowHours(status: IcoStatus, tier: IcoTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: IcoStatus, tier: IcoTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from change_value_zar.
export function tierForChangeValue(changeValueZar: number | null | undefined): IcoTier {
  const v = Number(changeValueZar ?? 0);
  if (!isFinite(v) || v < 0) return 'minor';
  if (v >= 50_000_000) return 'transformational';
  if (v >= 5_000_000) return 'major';
  if (v >= 500_000) return 'material';
  return 'minor';
}

export interface IcoFloorFlags {
  scope_baseline_change?: boolean | number | null;
  regulatory_re_consent_required?: boolean | number | null;
  schedule_impact_critical_path?: boolean | number | null;
  lender_consent_required?: boolean | number | null;
  safety_design_change?: boolean | number | null;
}

export function countFloorFlags(args: IcoFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.scope_baseline_change) +
    t(args.regulatory_re_consent_required) +
    t(args.schedule_impact_critical_path) +
    t(args.lender_consent_required) +
    t(args.safety_design_change)
  );
}

// FLOOR-AT-MAJOR on >=1 flag. With >=2 flags, floor lifts to
// transformational.
export function floorAtMajor(args: IcoFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

export function floorAtTransformational(args: IcoFloorFlags): boolean {
  return countFloorFlags(args) >= 2;
}

export function effectiveTier(
  rawTier: IcoTier,
  flags: IcoFloorFlags,
): IcoTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 2) return 'transformational';
  if (flagCount >= 1) {
    // Lift to at least major.
    if (rawTier === 'transformational') return 'transformational';
    return 'major';
  }
  return rawTier;
}

// Heavy tiers — major + transformational. SLA-breach reportability +
// signature crossings attach where not on universal hard lines.
const HEAVY_TIERS = new Set<IcoTier>(['major', 'transformational']);

export function isHeavyTier(tier: IcoTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: IcoTier): boolean {
  return tier === 'transformational';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W117 SIGNATURE: approve crosses regulator EVERY tier when
// scope_baseline_change || regulatory_re_consent_required. Approving a
// CR that alters the contracted scope baseline OR triggers regulator
// re-consent is itself a NERSA / IPPO / DMRE notice event. Closes the
// Phase-A IPP regulator-crossing family started at W112.
//
// Additional: reject crosses EVERY tier when
// cumulative_change_value_pct >= 15 (REIPPPP cumulative CR cap signal).
// dispute crosses major + transformational only.
export function crossesIntoRegulator(
  action: IcoAction,
  tier: IcoTier,
  args: {
    flags?: IcoFloorFlags;
    cumulative_change_value_pct?: number | null;
  },
): boolean {
  const flags = args.flags ?? {};
  const scopeBaseline = !!flags.scope_baseline_change;
  const regulatoryReConsent = !!flags.regulatory_re_consent_required;
  const cumPct = Number(args.cumulative_change_value_pct ?? 0);

  // W117 SIGNATURE: approve crosses regulator EVERY tier when
  // scope_baseline_change OR regulatory_re_consent_required.
  if (action === 'approve') {
    return scopeBaseline || regulatoryReConsent;
  }

  // reject crosses regulator EVERY tier when
  // cumulative_change_value_pct >= 15 (REIPPPP cap signal).
  if (action === 'reject') {
    return cumPct >= 15;
  }

  // dispute crosses regulator on major + transformational only.
  if (action === 'dispute') {
    return tier === 'major' || tier === 'transformational';
  }

  // close_out, archive, void, hold_resume never cross regulator.
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: IcoTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<IcoAction, IcoParty> = {
  propose:            'PM',
  submit_for_review:  'PM',
  hold_resume:        'PM',
  void:               'PM',
  assess_impact:      'engineer',
  quote_cost:         'engineer',
  negotiate:          'owner_rep',
  reject:             'owner_rep',
  dispute:            'owner_rep',
  approve:            'IPP_CEO',
  issue:              'IPP_CEO',
  schedule:           'IPP_CEO',
  commence_execution: 'IPP_CEO',
  complete_execution: 'IPP_CEO',
  close_out:          'IPP_CEO',
  archive:            'IPP_CEO',
};

export function partyForAction(action: IcoAction): IcoParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: IcoAction): IcoEvent | null {
  switch (action) {
    case 'propose':            return 'ipp_change_order_proposed';
    case 'assess_impact':      return 'ipp_change_order_impact_assessed';
    case 'quote_cost':         return 'ipp_change_order_cost_quoted';
    case 'submit_for_review':  return 'ipp_change_order_submitted_for_review';
    case 'negotiate':          return 'ipp_change_order_negotiated';
    case 'approve':            return 'ipp_change_order_approved';
    case 'issue':              return 'ipp_change_order_issued';
    case 'schedule':           return 'ipp_change_order_scheduled';
    case 'commence_execution': return 'ipp_change_order_execution_started';
    case 'complete_execution': return 'ipp_change_order_execution_completed';
    case 'close_out':          return 'ipp_change_order_closed_out';
    case 'archive':            return 'ipp_change_order_archived';
    case 'reject':             return 'ipp_change_order_rejected';
    case 'void':               return 'ipp_change_order_voided';
    case 'hold_resume':        return 'ipp_change_order_hold_resumed';
    case 'dispute':            return 'ipp_change_order_disputed';
  }
}

// ─── LIVE battery (~22 fields) ──────────────────────────────────────────

export function slaHoursRemaining(
  status: IcoStatus,
  tier: IcoTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type IcoUrgency = 'critical' | 'high' | 'medium' | 'low';

// INVERTED polarity: transformational has the LOOSEST urgency
// thresholds (more runway). minor has TIGHTEST (less runway).
export function urgencyBand(
  tier: IcoTier,
  slaHoursLeft: number,
): IcoUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'transformational') {
    if (slaHoursLeft < 48)   return 'critical';
    if (slaHoursLeft < 168)  return 'high';
    if (slaHoursLeft < 360)  return 'medium';
    return 'low';
  }
  if (tier === 'major') {
    if (slaHoursLeft < 24)   return 'critical';
    if (slaHoursLeft < 96)   return 'high';
    if (slaHoursLeft < 240)  return 'medium';
    return 'low';
  }
  if (tier === 'material') {
    if (slaHoursLeft < 12)   return 'critical';
    if (slaHoursLeft < 48)   return 'high';
    if (slaHoursLeft < 120)  return 'medium';
    return 'low';
  }
  // minor — TIGHTEST INVERTED-polarity thresholds
  if (slaHoursLeft < 8)      return 'critical';
  if (slaHoursLeft < 24)     return 'high';
  if (slaHoursLeft < 72)     return 'medium';
  return 'low';
}

// 4-step authority ladder: PM → engineer → owner_rep → IPP_CEO.
export type IcoAuthority =
  | 'PM'
  | 'engineer'
  | 'owner_rep'
  | 'IPP_CEO';

export function authorityRequired(tier: IcoTier): IcoAuthority {
  if (tier === 'transformational') return 'IPP_CEO';
  if (tier === 'major')            return 'owner_rep';
  if (tier === 'material')         return 'engineer';
  return 'PM';
}

// Regulator filing window hours — how fast a regulator-crossing event
// must be filed. INVERTED polarity — transformational longest window
// (matches diligence depth).
export function regulatorFilingWindowHours(tier: IcoTier): number {
  if (tier === 'transformational') return 240;
  if (tier === 'major')            return 168;
  if (tier === 'material')         return 96;
  return 72;
}

// REIPPPP cumulative CR cap signal — once cumulative_change_value_pct
// crosses 15% of the contract bucket, every rejection becomes
// reportable. Helper to classify the cap band for the UI:
export type IcoCumCapBand = 'clear' | 'watch' | 'warning' | 'breach';

export function cumulativeCapBand(cumPct: number | null | undefined): IcoCumCapBand {
  const v = Number(cumPct ?? 0);
  if (!isFinite(v) || v < 5)  return 'clear';
  if (v < 10) return 'watch';
  if (v < 15) return 'warning';
  return 'breach';
}

// EAC delta — change in estimate-at-completion driven by this CR.
// Positive = cost overrun signal.
export function eacDeltaSign(eacDeltaZar: number | null | undefined): 'positive' | 'negative' | 'flat' {
  const v = Number(eacDeltaZar ?? 0);
  if (!isFinite(v) || v === 0) return 'flat';
  return v > 0 ? 'positive' : 'negative';
}

// Days-to-critical-path-recovery — how many days the CR is currently
// expected to push or pull the critical path.
export function daysToCriticalPathRecovery(
  schedule_impact_critical_path: boolean,
  scheduleImpactDays: number | null,
): number | null {
  if (!schedule_impact_critical_path) return null;
  const v = Number(scheduleImpactDays ?? 0);
  if (!isFinite(v)) return null;
  return v;
}

// ─── 6-bridge architecture ──────────────────────────────────────────────
// W116 RFIs, W115 submittals, W114 doc control, W112 schedule, W113 EVM,
// W19 procurement, W20 COD.
export function bridgesToRfiChain(rfiRef: string | null | undefined): boolean {
  return !!rfiRef;
}
export function bridgesToSubmittalChain(submittalRef: string | null | undefined): boolean {
  return !!submittalRef;
}
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
export function bridgesToCodChain(codRef: string | null | undefined): boolean {
  return !!codRef;
}

// ─── CR completeness index 0-130 ────────────────────────────────────────
// Tracks how many lifecycle milestones are stamped + bonus for clean
// close-out without rejection/void/dispute.
export function changeOrderCompletenessIndex(args: {
  change_proposed?: boolean | number | null;
  impact_assessed?: boolean | number | null;
  cost_quoted?: boolean | number | null;
  owner_review?: boolean | number | null;
  negotiated?: boolean | number | null;
  approved?: boolean | number | null;
  issued_for_execution?: boolean | number | null;
  scheduled?: boolean | number | null;
  executing?: boolean | number | null;
  executed?: boolean | number | null;
  closed_out?: boolean | number | null;
  archived?: boolean | number | null;
  clean_close_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.change_proposed)      * 5;
  score += t(args.impact_assessed)      * 6;
  score += t(args.cost_quoted)          * 6;
  score += t(args.owner_review)         * 8;
  score += t(args.negotiated)           * 6;
  score += t(args.approved)             * 10;
  score += t(args.issued_for_execution) * 6;
  score += t(args.scheduled)            * 6;
  score += t(args.executing)            * 8;
  score += t(args.executed)             * 10;
  score += t(args.closed_out)           * 12;
  score += t(args.archived)             * 12;
  score += t(args.clean_close_bonus)    * 20;
  if (score > 130) score = 130;
  return score;
}

// ─── Hash-chain pre-stage for W118 ──────────────────────────────────────
// W118 will deliver tamper-evident hash-chain + merkle anchoring across
// every CR event. W117 stamps an incrementing hash_chain_position + a
// placeholder merkle_root_segment so W118 can backfill without a
// migration. Today these are inert placeholders.
export function hashChainPositionFor(currentPosition: number | null | undefined): number {
  const p = Number(currentPosition ?? 0);
  if (!isFinite(p) || p < 0) return 1;
  return p + 1;
}

export function placeholderMerkleSegment(coId: string, position: number): string {
  // Deterministic 64-char hex placeholder. NOT cryptographic — W118
  // delivers the real hash chain. Stable shape so SPA + dashboards can
  // render the column today.
  const seed = `${coId}:${position}`;
  let h = 0n;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 1315423911n) ^ BigInt(seed.charCodeAt(i));
    h = h & 0xffffffffffffffffn;
  }
  const hex = h.toString(16).padStart(16, '0');
  // Compose a 64-char hex segment by tiling the 16-char hash 4x.
  return (hex + hex + hex + hex).slice(0, 64);
}
