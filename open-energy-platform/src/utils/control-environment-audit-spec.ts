// ─────────────────────────────────────────────────────────────────────────
// Wave 121 - Control-Environment Audit.
//
// FOURTH and FINAL Phase-B wave. Closes Phase B (W118 spine + W119
// exports + W120 attestation + W121 control-environment audit).
//
// This is the unified control-environment EVIDENCE framework. Where
// W118 publishes the canonical audit-block spine, W119 packages
// regulator export files, W120 attests the cross-system books tie out,
// W121 builds per-control evidence dossiers (Design / Test of Design
// (ToD) / Test of Operating Effectiveness (ToOE) / deficiency
// assessment / remediation) that close the SOC 2 Type II + COSO 2013
// ICIF + ISO 27001:2022 ISMS certification loop.
//
// Goal: beat AuditBoard CrossComply + LogicGate Risk Cloud + Hyperproof
// + Drata + Vanta + Tugboat Logic + Resolver + Workiva + RSA Archer +
// Galvanize HighBond by turning every L5 chain into an evidence
// universe (no manual evidence collection - W118 publishes the
// canonical control event, W121 ties evidence dossier by control).
//
// Standards covered (the W121 cert backbone):
//   - AICPA SOC 2 Type II Trust Services Criteria (Security /
//     Availability / Processing Integrity / Confidentiality / Privacy)
//   - COSO 2013 Internal Control Integrated Framework
//     (5 components × 17 principles)
//   - ISO 27001:2022 Annex A 93 controls + ISO 27002:2022
//   - NIST Cybersecurity Framework 2.0 (Govern / Identify / Protect /
//     Detect / Respond / Recover)
//   - NIST SP 800-53 Rev 5 (Security & Privacy Controls)
//   - ISA 315 (Revised 2019) risk-based audit + ISA 330 audit responses
//   - IIA International Professional Practices Framework (IPPF)
//   - CMMC Level 3 + COBIT 2019 + ITIL 4 + CIS Controls v8
//   - POPIA s19 (security safeguards) + JSE SRL listed-issuer ICFR
//   - SARB op-risk capital (Basel III) + NERSA s14
//
// 12-state forward path + 4 branch states:
//   control_defined -> design_documented -> walkthrough_completed ->
//     tod_test_planned -> tod_evidence_collected -> tod_test_executed ->
//     tooe_test_planned -> tooe_evidence_collected ->
//     tooe_test_executed -> deficiency_assessed ->
//     remediation_completed -> archived (HARD terminal)
//   any non-terminal -> flag_deficient -> deficient (HARD/TERMINAL -
//     control fails)
//   any non-terminal -> accept_with_exception -> excepted (SOFT -
//     management accepts residual risk; can resume from
//     remediation_completed)
//   any pre-archive -> suspend -> suspended (SOFT - control under
//     review / resume to deficiency_assessed)
//   any failed-ToOE / failed-ToD -> initiate_re_test -> remediated_re_test
//     (SOFT - re-test after remediation; can resume to
//     tooe_test_planned)
//
// Tier RE-DERIVED on every transition from control_classification with
// FLOOR-AT-DIRECTIVE on 5 contextual flags:
//   - material_weakness_suspected      (control flagged as having
//                                         possible material weakness -
//                                         hard MATERIAL-WEAKNESS-
//                                         DEFICIENT signature lane)
//   - regulator_audit_in_progress      (NERSA/SARB/IRBA/PCAOB live
//                                         audit of the control)
//   - soc2_type2_period_open           (SOC 2 Type II observation
//                                         period in flight - period
//                                         evidence WINDOW)
//   - iso27001_surveillance_audit_due  (BSI/SGS/DNV surveillance audit
//                                         in 90 days)
//   - sox_404_attestation_pending      (Sarbanes-Oxley s404 attestation
//                                         period in flight)
//
// 5 tiers (INVERTED polarity - LONGER classification = MORE evidence
// depth required and MORE preparation time):
//   preventive : 168h    (preventive control - block before harm)
//   detective  : 240h    (detective control - find after harm)
//   corrective : 360h    (corrective control - fix after harm)
//   directive  : 480h    (directive control - policy / mandate)
//   governance : 720h    (governance control - board / committee)
//
// SIGNATURE Phase-B regulator crossings:
//   flag_deficient -> EVERY tier WHEN material_weakness_suspected
//     (W121 SIGNATURE MATERIAL-WEAKNESS-DEFICIENT hard line - material
//      weakness deficiency always crosses; SOC 2 SSAE 18 + ISA 265 +
//      JSE Listings 8.62 + Companies Act s30 + COSO Monitoring ALL
//      require disclosure within the audit window EVERY tier.)
//   accept_with_exception -> directive + governance only
//     (Management override of a directive/governance control ==
//     listed-issuer disclosure event; lighter tiers may be locally
//     accepted.)
//   archive -> EVERY tier WHEN external_auditor_sign_off
//     (External auditor sign-off lodged - audit-trail crossing required
//     to regulator inbox by every tier; the archive is the
//     attestation-complete signal.)
//   complete_remediation -> never crosses (normal flow - control
//     repaired; covered by next ToOE re-test cycle.)
//   sla_breached -> directive + governance only
//     (Operator failed to lodge ToD/ToOE on a heavy control =
//     listed-issuer + JSE 8.62 disclosure.)
//
// Write {admin ONLY}. READ all 9 personas + external_auditor pseudo-
// persona via signed JWT (same pattern as W120) - auditor identity
// JWT-bound, return read-only control evidence.
//
// actor_party split (4-step authority):
//   control_owner         : define_control / document_design /
//                           complete_walkthrough / plan_tod_test /
//                           collect_tod_evidence / execute_tod_test /
//                           plan_tooe_test / collect_tooe_evidence /
//                           execute_tooe_test
//   process_owner         : assess_deficiency / complete_remediation /
//                           suspend / initiate_re_test
//   CISO                  : flag_deficient / accept_with_exception /
//                           archive
//   audit_committee_chair : (escalation receiver; signs off material
//                           weakness disclosure - reads via
//                           audit-committee dashboard)
//
// Event prefix: `control_environment_audit_evt_`. AUDIT_PREFIX_MAP
// entry:
//   control_environment_audit: 'audit'   (joins W118 + W119 + W120
//   'audit' namespace - FOURTH non-role-suffixed entry. All four are
//   platform-wide L5 tamper-evident chains. W121 closes the audit-
//   namespace family.)
//
// Three crons:
//   - */15 * * * *        SLA sweep
//   - 58 0 * * *          nightly evidence-coverage recompute
//   - 0 6 1 1 *           annual external-audit cycle opener
//
// Eight bridges (W118 MANDATORY):
//   W113 EVM ref + W114 doc-control ref + W115 submittal ref +
//   W116 RFI ref + W117 change-order ref + W118 block_height range +
//   W119 export-pack ref + W120 attestation ref
//   (W118 MANDATORY - every control evidence dossier pairs against at
//   least one W118 published-block range. W119 + W120 are normal
//   evidence attachments for ICFR-relevant controls. Other bridges
//   are project-related evidence attachments.)
// ─────────────────────────────────────────────────────────────────────────

export type CeaStatus =
  | 'control_defined'
  | 'design_documented'
  | 'walkthrough_completed'
  | 'tod_test_planned'
  | 'tod_evidence_collected'
  | 'tod_test_executed'
  | 'tooe_test_planned'
  | 'tooe_evidence_collected'
  | 'tooe_test_executed'
  | 'deficiency_assessed'
  | 'remediation_completed'
  | 'archived'
  | 'deficient'
  | 'excepted'
  | 'suspended'
  | 'remediated_re_test';

export type CeaAction =
  | 'define_control'
  | 'document_design'
  | 'complete_walkthrough'
  | 'plan_tod_test'
  | 'collect_tod_evidence'
  | 'execute_tod_test'
  | 'plan_tooe_test'
  | 'collect_tooe_evidence'
  | 'execute_tooe_test'
  | 'assess_deficiency'
  | 'complete_remediation'
  | 'archive'
  | 'flag_deficient'
  | 'accept_with_exception'
  | 'suspend'
  | 'initiate_re_test';

export type CeaTier =
  | 'preventive'
  | 'detective'
  | 'corrective'
  | 'directive'
  | 'governance';

export type CeaParty =
  | 'control_owner'
  | 'process_owner'
  | 'CISO'
  | 'audit_committee_chair';

export type CeaEvent =
  | 'control_environment_audit_defined'
  | 'control_environment_audit_design_documented'
  | 'control_environment_audit_walkthrough_completed'
  | 'control_environment_audit_tod_test_planned'
  | 'control_environment_audit_tod_evidence_collected'
  | 'control_environment_audit_tod_test_executed'
  | 'control_environment_audit_tooe_test_planned'
  | 'control_environment_audit_tooe_evidence_collected'
  | 'control_environment_audit_tooe_test_executed'
  | 'control_environment_audit_deficiency_assessed'
  | 'control_environment_audit_remediation_completed'
  | 'control_environment_audit_archived'
  | 'control_environment_audit_flagged_deficient'
  | 'control_environment_audit_accepted_with_exception'
  | 'control_environment_audit_suspended'
  | 'control_environment_audit_re_test_initiated'
  | 'control_environment_audit_sla_breached';

// archived is HARD terminal. deficient is terminal (no further forward
// transitions - the control has failed audit). excepted + suspended +
// remediated_re_test are soft pauses that can be resumed.
const HARD_TERMINALS = new Set<CeaStatus>([
  'archived',
]);

const UI_TERMINALS = new Set<CeaStatus>([
  'archived',
  'deficient',
]);

export function isTerminal(s: CeaStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: CeaStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: CeaStatus[] = [
  'control_defined',
  'design_documented',
  'walkthrough_completed',
  'tod_test_planned',
  'tod_evidence_collected',
  'tod_test_executed',
  'tooe_test_planned',
  'tooe_evidence_collected',
  'tooe_test_executed',
  'deficiency_assessed',
  'remediation_completed',
  'excepted',
  'suspended',
  'remediated_re_test',
];

// suspend can be entered from any active state up to
// remediation_completed.
const SUSPEND_FROM: CeaStatus[] = [
  'design_documented',
  'walkthrough_completed',
  'tod_test_planned',
  'tod_evidence_collected',
  'tod_test_executed',
  'tooe_test_planned',
  'tooe_evidence_collected',
  'tooe_test_executed',
  'deficiency_assessed',
  'remediation_completed',
];

// (resume from suspend is modelled by assess_deficiency below, which
// accepts 'suspended' in its from set as the standard re-entry point.)

// accept_with_exception can be entered from any pre-archive state.
const EXCEPT_FROM: CeaStatus[] = [
  'design_documented',
  'walkthrough_completed',
  'tod_test_planned',
  'tod_evidence_collected',
  'tod_test_executed',
  'tooe_test_planned',
  'tooe_evidence_collected',
  'tooe_test_executed',
  'deficiency_assessed',
  'remediation_completed',
];

// initiate_re_test can be entered when a ToD or ToOE has been executed
// (and presumably failed) OR after remediation_completed.
const RE_TEST_FROM: CeaStatus[] = [
  'tod_test_executed',
  'tooe_test_executed',
  'deficiency_assessed',
  'remediation_completed',
  'remediated_re_test',
];

export const TRANSITIONS: Record<CeaAction, { from: CeaStatus[]; to: CeaStatus }> = {
  define_control:           { from: ['control_defined'],                                                                              to: 'control_defined' },
  document_design:          { from: ['control_defined', 'design_documented'],                                                         to: 'design_documented' },
  complete_walkthrough:     { from: ['design_documented', 'walkthrough_completed'],                                                   to: 'walkthrough_completed' },
  plan_tod_test:            { from: ['walkthrough_completed', 'tod_test_planned'],                                                    to: 'tod_test_planned' },
  collect_tod_evidence:     { from: ['tod_test_planned', 'tod_evidence_collected'],                                                   to: 'tod_evidence_collected' },
  execute_tod_test:         { from: ['tod_evidence_collected', 'tod_test_executed'],                                                  to: 'tod_test_executed' },
  plan_tooe_test:           { from: ['tod_test_executed', 'tooe_test_planned', 'remediated_re_test'],                                 to: 'tooe_test_planned' },
  collect_tooe_evidence:    { from: ['tooe_test_planned', 'tooe_evidence_collected'],                                                 to: 'tooe_evidence_collected' },
  execute_tooe_test:        { from: ['tooe_evidence_collected', 'tooe_test_executed'],                                                to: 'tooe_test_executed' },
  assess_deficiency:        { from: ['tooe_test_executed', 'deficiency_assessed', 'suspended'],                                       to: 'deficiency_assessed' },
  complete_remediation:     { from: ['deficiency_assessed', 'remediation_completed'],                                                 to: 'remediation_completed' },
  archive:                  { from: ['remediation_completed'],                                                                        to: 'archived' },
  flag_deficient:           { from: ALL_NON_TERMINAL,                                                                                 to: 'deficient' },
  accept_with_exception:    { from: EXCEPT_FROM,                                                                                      to: 'excepted' },
  suspend:                  { from: SUSPEND_FROM,                                                                                     to: 'suspended' },
  initiate_re_test:         { from: RE_TEST_FROM,                                                                                     to: 'remediated_re_test' },
};

export function nextStatus(current: CeaStatus, action: CeaAction): CeaStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'define_control' && current !== 'control_defined') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: CeaStatus): CeaAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: CeaAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [CeaAction, typeof TRANSITIONS[CeaAction]][]) {
    if (a === 'define_control') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger tier
// (governance) gets the LONGEST window - governance controls require
// deeper evidence, board-level sign-off, longer prep.
export const SLA_HOURS: Record<CeaStatus, Record<CeaTier, number>> = {
  // ANCHOR: control_defined × classification
  control_defined:             { preventive: 168, detective: 240, corrective: 360, directive: 480, governance: 720 },
  design_documented:           { preventive: 96,  detective: 144, corrective: 192, directive: 264, governance: 360 },
  walkthrough_completed:       { preventive: 72,  detective: 96,  corrective: 144, directive: 192, governance: 240 },
  tod_test_planned:            { preventive: 72,  detective: 96,  corrective: 144, directive: 192, governance: 240 },
  tod_evidence_collected:      { preventive: 96,  detective: 144, corrective: 192, directive: 240, governance: 360 },
  tod_test_executed:           { preventive: 48,  detective: 72,  corrective: 96,  directive: 144, governance: 192 },
  tooe_test_planned:           { preventive: 72,  detective: 96,  corrective: 144, directive: 192, governance: 240 },
  tooe_evidence_collected:     { preventive: 168, detective: 240, corrective: 360, directive: 480, governance: 720 },
  tooe_test_executed:          { preventive: 48,  detective: 72,  corrective: 96,  directive: 144, governance: 192 },
  deficiency_assessed:         { preventive: 72,  detective: 96,  corrective: 144, directive: 192, governance: 240 },
  remediation_completed:       { preventive: 168, detective: 240, corrective: 360, directive: 480, governance: 720 },
  suspended:                   { preventive: 72,  detective: 96,  corrective: 144, directive: 192, governance: 240 },
  excepted:                    { preventive: 72,  detective: 96,  corrective: 144, directive: 192, governance: 240 },
  remediated_re_test:          { preventive: 96,  detective: 144, corrective: 192, directive: 240, governance: 360 },
  archived:                    { preventive: 0,   detective: 0,   corrective: 0,   directive: 0,   governance: 0 },
  deficient:                   { preventive: 0,   detective: 0,   corrective: 0,   directive: 0,   governance: 0 },
};

export function slaWindowHours(status: CeaStatus, tier: CeaTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: CeaStatus, tier: CeaTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from control_classification (preventive / detective /
// corrective / directive / governance).
export type CeaClassification = 'preventive' | 'detective' | 'corrective' | 'directive' | 'governance';

export function tierForClassification(classification: CeaClassification | string | null | undefined): CeaTier {
  switch (classification) {
    case 'preventive': return 'preventive';
    case 'detective':  return 'detective';
    case 'corrective': return 'corrective';
    case 'directive':  return 'directive';
    case 'governance': return 'governance';
    default:           return 'detective';
  }
}

export interface CeaFloorFlags {
  material_weakness_suspected?: boolean | number | null;
  regulator_audit_in_progress?: boolean | number | null;
  soc2_type2_period_open?: boolean | number | null;
  iso27001_surveillance_audit_due?: boolean | number | null;
  sox_404_attestation_pending?: boolean | number | null;
}

export function countFloorFlags(args: CeaFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.material_weakness_suspected) +
    t(args.regulator_audit_in_progress) +
    t(args.soc2_type2_period_open) +
    t(args.iso27001_surveillance_audit_due) +
    t(args.sox_404_attestation_pending)
  );
}

// FLOOR-AT-DIRECTIVE on >=1 flag. With >=2 flags, floor lifts to
// governance.
export function floorAtDirective(args: CeaFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

export function floorAtGovernance(args: CeaFloorFlags): boolean {
  return countFloorFlags(args) >= 2;
}

// Tier ordering for promotion logic - higher index = longer SLA window
// + more evidence depth.
const TIER_RANK: Record<CeaTier, number> = {
  preventive: 0,
  detective: 1,
  corrective: 2,
  directive: 3,
  governance: 4,
};

export function effectiveTier(
  rawTier: CeaTier,
  flags: CeaFloorFlags,
): CeaTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 2) return 'governance';
  if (flagCount >= 1) {
    // Lift to at least directive.
    if (TIER_RANK[rawTier] >= TIER_RANK['directive']) return rawTier;
    return 'directive';
  }
  return rawTier;
}

// Heavy tiers - directive + governance.
// SLA-breach reportability + accept_with_exception crossings attach here.
const HEAVY_TIERS = new Set<CeaTier>(['directive', 'governance']);

export function isHeavyTier(tier: CeaTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: CeaTier): boolean {
  return tier === 'directive' || tier === 'governance';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W121 SIGNATURE: flag_deficient crosses regulator EVERY tier WHEN
// material_weakness_suspected - the MATERIAL-WEAKNESS-DEFICIENT hard
// line. Material weakness flagged in any control class is always
// reportable; SOC 2 SSAE 18 + ISA 265 + JSE Listings 8.62 + Companies
// Act s30 + COSO Monitoring component ALL require disclosure within
// the audit window EVERY tier.
//
// Additional:
//   accept_with_exception -> directive + governance only
//     (Management override of a directive/governance control - listed-
//     issuer disclosure event.)
//   archive -> EVERY tier WHEN external_auditor_sign_off=true
//     (external-auditor signs off the dossier - archive is the
//     attestation-complete signal.)
//   complete_remediation -> never crosses (normal flow).
//   sla_breached -> directive + governance only.
export function crossesIntoRegulator(
  action: CeaAction,
  tier: CeaTier,
  args: {
    flags?: CeaFloorFlags;
    external_auditor_sign_off?: boolean | number | null;
  },
): boolean {
  const flags = args.flags ?? {};

  // W121 SIGNATURE MATERIAL-WEAKNESS-DEFICIENT: flag_deficient EVERY
  // tier when material_weakness_suspected.
  if (action === 'flag_deficient') {
    return !!flags.material_weakness_suspected;
  }

  // accept_with_exception -> directive + governance only.
  if (action === 'accept_with_exception') {
    return tier === 'directive' || tier === 'governance';
  }

  // archive EVERY tier WHEN external_auditor_sign_off.
  if (action === 'archive') {
    return !!args.external_auditor_sign_off;
  }

  // complete_remediation never crosses (normal flow).
  // suspend never crosses on its own.
  // initiate_re_test never crosses (normal re-test).

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: CeaTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<CeaAction, CeaParty> = {
  define_control:        'control_owner',
  document_design:       'control_owner',
  complete_walkthrough:  'control_owner',
  plan_tod_test:         'control_owner',
  collect_tod_evidence:  'control_owner',
  execute_tod_test:      'control_owner',
  plan_tooe_test:        'control_owner',
  collect_tooe_evidence: 'control_owner',
  execute_tooe_test:     'control_owner',
  assess_deficiency:     'process_owner',
  complete_remediation:  'process_owner',
  archive:               'CISO',
  flag_deficient:        'CISO',
  accept_with_exception: 'CISO',
  suspend:               'process_owner',
  initiate_re_test:      'process_owner',
};

export function partyForAction(action: CeaAction): CeaParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: CeaAction): CeaEvent | null {
  switch (action) {
    case 'define_control':        return 'control_environment_audit_defined';
    case 'document_design':       return 'control_environment_audit_design_documented';
    case 'complete_walkthrough':  return 'control_environment_audit_walkthrough_completed';
    case 'plan_tod_test':         return 'control_environment_audit_tod_test_planned';
    case 'collect_tod_evidence':  return 'control_environment_audit_tod_evidence_collected';
    case 'execute_tod_test':      return 'control_environment_audit_tod_test_executed';
    case 'plan_tooe_test':        return 'control_environment_audit_tooe_test_planned';
    case 'collect_tooe_evidence': return 'control_environment_audit_tooe_evidence_collected';
    case 'execute_tooe_test':     return 'control_environment_audit_tooe_test_executed';
    case 'assess_deficiency':     return 'control_environment_audit_deficiency_assessed';
    case 'complete_remediation':  return 'control_environment_audit_remediation_completed';
    case 'archive':               return 'control_environment_audit_archived';
    case 'flag_deficient':        return 'control_environment_audit_flagged_deficient';
    case 'accept_with_exception': return 'control_environment_audit_accepted_with_exception';
    case 'suspend':               return 'control_environment_audit_suspended';
    case 'initiate_re_test':      return 'control_environment_audit_re_test_initiated';
  }
}

// ─── LIVE battery (~26 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: CeaStatus,
  tier: CeaTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type CeaUrgency = 'critical' | 'high' | 'medium' | 'low';

// INVERTED polarity: governance has the LOOSEST urgency thresholds.
// preventive has TIGHTEST.
export function urgencyBand(
  tier: CeaTier,
  slaHoursLeft: number,
): CeaUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'governance') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  if (tier === 'directive') {
    if (slaHoursLeft < 18)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'corrective') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'detective') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  // preventive - TIGHTEST INVERTED-polarity thresholds
  if (slaHoursLeft < 4)     return 'critical';
  if (slaHoursLeft < 12)    return 'high';
  if (slaHoursLeft < 24)    return 'medium';
  return 'low';
}

// 4-step authority ladder: control_owner -> process_owner -> CISO ->
// audit_committee_chair.
export type CeaAuthority =
  | 'control_owner'
  | 'process_owner'
  | 'CISO'
  | 'audit_committee_chair';

export function authorityRequired(tier: CeaTier): CeaAuthority {
  if (tier === 'governance') return 'audit_committee_chair';
  if (tier === 'directive')  return 'CISO';
  if (tier === 'corrective') return 'CISO';
  if (tier === 'detective')  return 'process_owner';
  return 'control_owner';
}

// Audit window hours - INVERTED polarity, governance longest.
export function auditWindowHours(tier: CeaTier): number {
  if (tier === 'governance') return 720;
  if (tier === 'directive')  return 480;
  if (tier === 'corrective') return 360;
  if (tier === 'detective')  return 240;
  return 168;
}

// Days to next quarterly cutoff (used for SOC 2 Type II + ISO 27001
// surveillance + SOX 404 attestation rhythm).
export function daysToQuarterlyCutoff(now: Date): number {
  const y = now.getUTCFullYear();
  const quarterEnds = [
    Date.UTC(y, 2, 31),
    Date.UTC(y, 5, 30),
    Date.UTC(y, 8, 30),
    Date.UTC(y, 11, 31),
    Date.UTC(y + 1, 2, 31),
  ];
  const nowMs = now.getTime();
  for (const t of quarterEnds) {
    if (t > nowMs) return Math.ceil((t - nowMs) / (24 * 3600 * 1000));
  }
  return 0;
}

// Days to next annual external-audit cycle (1 January each year).
export function daysToAnnualAudit(now: Date): number {
  const y = now.getUTCFullYear();
  const thisYear = Date.UTC(y, 0, 1);
  const nextYear = Date.UTC(y + 1, 0, 1);
  const nowMs = now.getTime();
  const target = thisYear > nowMs ? thisYear : nextYear;
  return Math.ceil((target - nowMs) / (24 * 3600 * 1000));
}

// ─── 8-bridge architecture (W113-W120) ──────────────────────────────────
//
// W118 is MANDATORY - every control evidence dossier pairs against at
// least one W118 published-block range. W119 + W120 are normal evidence
// attachments for ICFR-relevant controls. Other bridges are project-
// related evidence attachments.
export function bridgesToW113EvmChain(evmRef: string | null | undefined): boolean {
  return !!evmRef;
}
export function bridgesToW114DocControlChain(docRef: string | null | undefined): boolean {
  return !!docRef;
}
export function bridgesToW115SubmittalChain(subRef: string | null | undefined): boolean {
  return !!subRef;
}
export function bridgesToW116RfiChain(rfiRef: string | null | undefined): boolean {
  return !!rfiRef;
}
export function bridgesToW117ChangeOrderChain(coRef: string | null | undefined): boolean {
  return !!coRef;
}
export function bridgesToW118AuditChain(blockRef: string | null | undefined): boolean {
  return !!blockRef;
}
export function bridgesToW119RegulatorExportChain(packRef: string | null | undefined): boolean {
  return !!packRef;
}
export function bridgesToW120ReconciliationAttestationChain(rattRef: string | null | undefined): boolean {
  return !!rattRef;
}

// ─── Design documentation completeness index 0-130 ──────────────────────
//
// Scores how well the control is DOCUMENTED.  COSO requires design +
// implementation; SOC 2 requires control description + responsible
// party + frequency; ISO 27001 requires Statement of Applicability
// linkage.
export function designDocumentationCompletenessIndex(args: {
  control_description?: boolean | number | null;
  control_objective?: boolean | number | null;
  control_classification?: boolean | number | null;
  responsible_party?: boolean | number | null;
  frequency_documented?: boolean | number | null;
  inputs_documented?: boolean | number | null;
  outputs_documented?: boolean | number | null;
  ipe_documented?: boolean | number | null;  // information produced by entity
  manual_or_automated?: boolean | number | null;
  preventive_or_detective?: boolean | number | null;
  coso_principle_mapped?: boolean | number | null;
  iso27001_control_mapped?: boolean | number | null;
  soc2_criteria_mapped?: boolean | number | null;
  walkthrough_evidence?: boolean | number | null;
  soa_linked?: boolean | number | null;       // Statement of Applicability
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.control_description)      * 8;
  score += t(args.control_objective)        * 8;
  score += t(args.control_classification)   * 6;
  score += t(args.responsible_party)        * 8;
  score += t(args.frequency_documented)     * 6;
  score += t(args.inputs_documented)        * 8;
  score += t(args.outputs_documented)       * 8;
  score += t(args.ipe_documented)           * 10;
  score += t(args.manual_or_automated)      * 6;
  score += t(args.preventive_or_detective)  * 6;
  score += t(args.coso_principle_mapped)    * 10;
  score += t(args.iso27001_control_mapped)  * 10;
  score += t(args.soc2_criteria_mapped)     * 10;
  score += t(args.walkthrough_evidence)     * 16;
  score += t(args.soa_linked)               * 10;
  if (score > 130) score = 130;
  return score;
}

// ─── ToD test completeness index 0-130 ──────────────────────────────────
//
// Test of Design - is the control DESIGNED appropriately?
export function todTestCompletenessIndex(args: {
  tod_test_plan?: boolean | number | null;
  tod_sample_size_documented?: boolean | number | null;
  tod_sample_population_defined?: boolean | number | null;
  tod_evidence_collected?: boolean | number | null;
  tod_test_executed?: boolean | number | null;
  tod_reviewer_signoff?: boolean | number | null;
  tod_pass_rate_pct?: number | null;         // 0-100
  tod_exceptions_logged?: boolean | number | null;
  tod_root_cause_assessed?: boolean | number | null;
  tod_remediation_proposed?: boolean | number | null;
  tod_passed?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  const n = (v: number | null | undefined, max: number): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(max, x));
  };
  let score = 0;
  score += t(args.tod_test_plan)                * 8;
  score += t(args.tod_sample_size_documented)   * 8;
  score += t(args.tod_sample_population_defined) * 10;
  score += t(args.tod_evidence_collected)       * 16;
  score += t(args.tod_test_executed)            * 14;
  score += t(args.tod_reviewer_signoff)         * 10;
  score += Math.round(n(args.tod_pass_rate_pct, 100) * 0.20);
  score += t(args.tod_exceptions_logged)        * 6;
  score += t(args.tod_root_cause_assessed)      * 8;
  score += t(args.tod_remediation_proposed)     * 8;
  score += t(args.tod_passed)                   * 22;
  if (score > 130) score = 130;
  return score;
}

// ─── ToOE test completeness index 0-130 ─────────────────────────────────
//
// Test of Operating Effectiveness - is the control OPERATING effectively
// throughout the period?
export function tooeTestCompletenessIndex(args: {
  tooe_test_plan?: boolean | number | null;
  tooe_sample_size_documented?: boolean | number | null;
  tooe_period_defined?: boolean | number | null;
  tooe_sample_population_defined?: boolean | number | null;
  tooe_evidence_collected?: boolean | number | null;
  tooe_test_executed?: boolean | number | null;
  tooe_reviewer_signoff?: boolean | number | null;
  tooe_pass_rate_pct?: number | null;        // 0-100
  tooe_exceptions_logged?: boolean | number | null;
  tooe_root_cause_assessed?: boolean | number | null;
  tooe_remediation_proposed?: boolean | number | null;
  tooe_passed?: boolean | number | null;
  external_auditor_sign_off?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  const n = (v: number | null | undefined, max: number): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(max, x));
  };
  let score = 0;
  score += t(args.tooe_test_plan)                 * 6;
  score += t(args.tooe_sample_size_documented)    * 8;
  score += t(args.tooe_period_defined)            * 8;
  score += t(args.tooe_sample_population_defined) * 8;
  score += t(args.tooe_evidence_collected)        * 14;
  score += t(args.tooe_test_executed)             * 12;
  score += t(args.tooe_reviewer_signoff)          * 8;
  score += Math.round(n(args.tooe_pass_rate_pct, 100) * 0.18);
  score += t(args.tooe_exceptions_logged)         * 6;
  score += t(args.tooe_root_cause_assessed)       * 6;
  score += t(args.tooe_remediation_proposed)      * 6;
  score += t(args.tooe_passed)                    * 20;
  score += t(args.external_auditor_sign_off)      * 10;
  if (score > 130) score = 130;
  return score;
}

// ─── Evidence coverage index 0-130 ──────────────────────────────────────
//
// Captures how much underlying evidence has been collected against the
// dossier: W118 block range, W119 export pack, W120 attestation ref +
// project-evidence bridges + audit-package artefacts.
export function evidenceCoverageIndex(args: {
  w118_block_range_paired?: boolean | number | null;
  w119_export_pack_attached?: boolean | number | null;
  w120_attestation_ref_attached?: boolean | number | null;
  w113_evm_ref_attached?: boolean | number | null;
  w114_doc_control_ref_attached?: boolean | number | null;
  w115_submittal_ref_attached?: boolean | number | null;
  w116_rfi_ref_attached?: boolean | number | null;
  w117_change_order_ref_attached?: boolean | number | null;
  walkthrough_evidence?: boolean | number | null;
  tod_evidence_collected?: boolean | number | null;
  tooe_evidence_collected?: boolean | number | null;
  reviewer_signoff?: boolean | number | null;
  external_auditor_sign_off?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  // W118 mandatory bridge - heavy weight.
  score += t(args.w118_block_range_paired)             * 22;
  score += t(args.w119_export_pack_attached)           * 12;
  score += t(args.w120_attestation_ref_attached)       * 12;
  // Project-evidence bridges.
  score += t(args.w113_evm_ref_attached)               * 6;
  score += t(args.w114_doc_control_ref_attached)       * 6;
  score += t(args.w115_submittal_ref_attached)         * 6;
  score += t(args.w116_rfi_ref_attached)               * 6;
  score += t(args.w117_change_order_ref_attached)      * 6;
  // Audit-package artefacts.
  score += t(args.walkthrough_evidence)                * 10;
  score += t(args.tod_evidence_collected)              * 14;
  score += t(args.tooe_evidence_collected)             * 14;
  score += t(args.reviewer_signoff)                    * 8;
  score += t(args.external_auditor_sign_off)           * 12;
  if (score > 130) score = 130;
  return score;
}

// ─── External-auditor signed-JWT validator ──────────────────────────────
//
// External-auditor read endpoint
// (GET /api/control-environment-audit/external/:id) is signed-JWT-gated
// (same pattern as W120). The JWT carries the auditor's identity and an
// `aud` claim of `external_auditor`. We validate format here and verify
// signature server-side via HMAC-SHA256.
export interface ExternalAuditorClaims {
  sub: string;                    // auditor identifier (e.g. firm code)
  aud: 'external_auditor';
  scope: string[];                // control IDs the auditor can read
  iat: number;                    // issued at (seconds)
  exp: number;                    // expiry (seconds)
  jti?: string;                   // optional unique token id
  audit_firm?: string;            // optional firm name (PwC/EY/etc)
  engagement_ref?: string;        // optional engagement reference
}

export function isValidExternalAuditorJwtFormat(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p) && p.length > 0);
}

export function parseExternalAuditorClaims(payloadJson: string | null | undefined): ExternalAuditorClaims | null {
  if (!payloadJson) return null;
  try {
    const obj = JSON.parse(payloadJson) as ExternalAuditorClaims;
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.sub !== 'string' || obj.sub.length === 0) return null;
    if (obj.aud !== 'external_auditor') return null;
    if (!Array.isArray(obj.scope)) return null;
    if (!obj.scope.every((s) => typeof s === 'string')) return null;
    if (typeof obj.iat !== 'number') return null;
    if (typeof obj.exp !== 'number') return null;
    return obj;
  } catch {
    return null;
  }
}

export function isExternalAuditorClaimsExpired(claims: ExternalAuditorClaims, now: Date): boolean {
  return claims.exp * 1000 < now.getTime();
}

export function externalAuditorCanReadControl(
  claims: ExternalAuditorClaims,
  controlId: string,
  now: Date,
): boolean {
  if (isExternalAuditorClaimsExpired(claims, now)) return false;
  if (!claims.scope.includes(controlId) && !claims.scope.includes('*')) return false;
  return true;
}

// Control framework universe supported.
export const CONTROL_FRAMEWORKS = [
  'coso_2013',
  'soc2_tsc',
  'iso27001_2022',
  'iso27002_2022',
  'nist_csf_20',
  'nist_sp_800_53',
  'cmmc_l3',
  'cobit_2019',
  'itil_4',
  'cis_v8',
  'sox_404',
  'popia',
  'king_iv',
  'jse_srl_862',
] as const;

export type ControlFramework = typeof CONTROL_FRAMEWORKS[number];

export function isKnownControlFramework(s: string | null | undefined): s is ControlFramework {
  if (!s) return false;
  return (CONTROL_FRAMEWORKS as readonly string[]).includes(s);
}

// Control classification supported.
export const CONTROL_CLASSIFICATIONS = [
  'preventive',
  'detective',
  'corrective',
  'directive',
  'governance',
] as const;

export function isKnownControlClassification(s: string | null | undefined): s is CeaClassification {
  if (!s) return false;
  return (CONTROL_CLASSIFICATIONS as readonly string[]).includes(s);
}

// Deficiency severity taxonomy.
export const DEFICIENCY_SEVERITIES = [
  'none',
  'control_deficiency',
  'significant_deficiency',
  'material_weakness',
] as const;

export type DeficiencySeverity = typeof DEFICIENCY_SEVERITIES[number];

export function isKnownDeficiencySeverity(s: string | null | undefined): s is DeficiencySeverity {
  if (!s) return false;
  return (DEFICIENCY_SEVERITIES as readonly string[]).includes(s);
}

// Control health band - composite from design + ToD + ToOE +
// evidence coverage + SLA.
export type CeaHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function controlHealthBand(
  status: CeaStatus,
  designCompleteness: number,
  todCompleteness: number,
  tooeCompleteness: number,
  evidenceCoverage: number,
  slaBreached: boolean,
  deficient: boolean,
  excepted: boolean,
  flags: CeaFloorFlags,
  deficiencySeverity: DeficiencySeverity | null,
): CeaHealthBand {
  if (deficient) return 'critical';
  if (deficiencySeverity === 'material_weakness') return 'critical';
  if (flags.material_weakness_suspected) return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (excepted) return 'amber';
  if (status === 'suspended') return 'amber';
  if (deficiencySeverity === 'significant_deficiency') return 'red';
  if (designCompleteness < 60) return 'red';
  if (tooeCompleteness < 60 && (status === 'tooe_test_executed' || status === 'deficiency_assessed')) return 'red';
  if (evidenceCoverage < 50) return 'amber';
  if (todCompleteness < 80 && (status === 'tod_test_executed' || status === 'tooe_test_planned')) return 'amber';
  if (tooeCompleteness < 90 && (status === 'tooe_test_executed' || status === 'remediation_completed')) return 'amber';
  if (designCompleteness < 90) return 'amber';
  return 'green';
}
