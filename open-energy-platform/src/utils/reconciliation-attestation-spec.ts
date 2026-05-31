// ─────────────────────────────────────────────────────────────────────────
// Wave 120 - ICFR Reconciliation Attestation.
//
// THIRD Phase-B wave. Attests that every cross-chain row + external-
// system feed (SAP S/4HANA + Oracle Financials + SAGE 300 + Workday +
// STRATE + SWIFT MT940 + NERSA/IPPO/DMRE regulator inboxes + bank
// statements) reconciles against W118 published audit blocks, with the
// resulting attestation lodged as a W119 export pack. W118 = spine;
// W119 = output; W120 = ATTESTATION that the books tie out.
//
// Goal: beat BlackLine + Trintech Cadency + FloQast + OneStream + Adra
// + FIS Reconciliation Hub + Broadridge + Duco + Gresham Clareti by
// turning the entire platform's L5 state-machine chains into the
// reconciliation universe (no external GL extracts required - W118
// publishes the canonical row, W120 ties feed-by-feed against it).
//
// Standards: ICFR (SOX s404 / King IV / JSE Listings Requirement
// 8.62 ICFR) + COSO Internal Control - Integrated Framework + AICPA
// Trust Services Criteria + ISO 27001 A.18 + ISA 315 (Revised 2019)
// risk-based audit + ISA 540 estimates + ISA 600 group audits +
// IFRS 9 expected credit loss reconciliation + IAS 1 presentation +
// IAS 8 errors + JSE Listings 8.62 + Companies Act 71 of 2008 s30
// (financial statements) + POPIA s19 (security safeguards on
// reconciliation evidence) + ETSI TS 119 312 (signature policy).
//
// 12-state forward path + 4 branch states:
//   attestation_proposed -> scope_defined -> feeds_ingested ->
//     blocks_paired -> variance_computed -> break_classified ->
//     root_cause_logged -> remediation_proposed ->
//     counter_party_signoff -> independent_review ->
//     attestation_signed -> archived (HARD terminal)
//   any non-terminal -> reject -> rejected (TERMINAL - material
//     weakness; the period attestation FAILS)
//   pre-sign -> suspend -> suspended (SOFT - feed outage / resume
//     to remediation_proposed)
//   post-sign -> restate -> restated (SOFT - superseded by a later
//     restated attestation)
//   any pre-sign -> escalate_to_audit_committee -> escalated (SOFT -
//     audit-committee chair takes ownership; can lift back to
//     remediation_proposed or close to rejected)
//
// Tier RE-DERIVED on every transition from cadence with
// FLOOR-AT-QUARTERLY on 5 contextual flags:
//   - material_variance_unresolved      (variance > materiality
//                                         threshold remains open)
//   - external_auditor_request_active   (PwC/EY/Deloitte/KPMG IRL
//                                         in flight)
//   - regulator_audit_in_progress       (NERSA/IPPO/SARB live audit)
//   - cross_border_feed_break           (STRATE/SWIFT feed not
//                                         reconciling - ExCon risk)
//   - icfr_deficiency_suspected         (ICFR control flagged as
//                                         possibly deficient - hard
//                                         ICFR-DEFICIENCY-ATTEST
//                                         signature lane)
//
// 5 tiers (INVERTED polarity - LONGER cadence = MORE preparation
// time; closer mapping to BlackLine/Trintech period-close cadence):
//   daily_tactical        : 24h    (daily ops tie-out, single feed)
//   weekly_management     : 96h    (weekly management cert)
//   monthly_management    : 168h   (monthly close attestation)
//   quarterly_attestation : 360h   (quarterly ICFR sub-cert pack)
//   annual_audit          : 720h   (annual external-audit cert)
//
// SIGNATURE Phase-B regulator crossings:
//   escalate_to_audit_committee -> EVERY tier
//     (W120 SIGNATURE ICFR-DEFICIENCY-ATTEST hard line - audit
//      committee escalation always crosses; JSE Listings 8.62 +
//      Companies Act s30 + COSO Monitoring component ALL require
//      disclosure within the attestation window EVERY tier.)
//   reject -> EVERY tier WHEN material_variance_unresolved AND
//     icfr_deficiency_suspected (material weakness attestation
//     fail = reportable EVERY tier; absent both flags, lighter
//     tiers do not auto-cross).
//   restate -> quarterly_attestation + annual_audit only
//     (IAS 8 restatement = listed-issuer disclosure event).
//   sign_attestation -> NEVER crosses (signing is the normal flow,
//     completing the period attestation).
//   sla_breached -> quarterly_attestation + annual_audit only
//     (operator failed to lodge on a major attestation window =
//     listed-issuer + JSE 8.62 disclosure).
//
// Write {admin ONLY}. READ all 9 personas. External-auditor read
// via signed JWT (NOT mTLS like W119) - auditor identity
// JWT-bound, return read-only attestation evidence.
//
// actor_party split (4-step authority):
//   reconciler            : propose_attestation / define_scope /
//                           ingest_feeds / pair_blocks /
//                           compute_variance / classify_break /
//                           log_root_cause / propose_remediation
//   controller            : get_counter_party_signoff / suspend /
//                           resume_from_suspend
//   CFO                   : sign_attestation / archive / reject /
//                           restate
//   audit_committee_chair : escalate_to_audit_committee /
//                           lift_escalation
//
// Event prefix: `reconciliation_attestation_evt_`. AUDIT_PREFIX_MAP
// entry:
//   reconciliation_attestation: 'audit'   (joins W118 + W119 'audit'
//   namespace - third non-role-suffixed entry. All three are
//   platform-wide L5 tamper-evident chains.)
//
// Three crons:
//   - */15 * * * *        SLA sweep
//   - 55 0 * * *          nightly variance recompute
//   - 0 5 1 * *           monthly audit-committee pack
//
// Seven bridges (W118 + W119 MANDATORY):
//   W113 EVM ref + W114 doc-control ref + W115 submittal ref +
//   W116 RFI ref + W117 change-order ref + W118 block_height range
//   + W119 export-pack ref
//   (W118 MANDATORY - every attestation pairs against at least one
//   W118 published-block range. W119 MANDATORY - every attestation
//   results in a lodged export pack so the regulator sees the
//   attestation chain. Other bridges are evidence attachments.)
// ─────────────────────────────────────────────────────────────────────────

export type RattStatus =
  | 'attestation_proposed'
  | 'scope_defined'
  | 'feeds_ingested'
  | 'blocks_paired'
  | 'variance_computed'
  | 'break_classified'
  | 'root_cause_logged'
  | 'remediation_proposed'
  | 'counter_party_signoff'
  | 'independent_review'
  | 'attestation_signed'
  | 'archived'
  | 'rejected'
  | 'suspended'
  | 'restated'
  | 'escalated_to_audit_committee';

export type RattAction =
  | 'propose_attestation'
  | 'define_scope'
  | 'ingest_feeds'
  | 'pair_blocks'
  | 'compute_variance'
  | 'classify_break'
  | 'log_root_cause'
  | 'propose_remediation'
  | 'get_counter_party_signoff'
  | 'run_independent_review'
  | 'sign_attestation'
  | 'archive'
  | 'reject'
  | 'suspend'
  | 'resume_from_suspend'
  | 'restate'
  | 'escalate_to_audit_committee'
  | 'lift_escalation';

export type RattTier =
  | 'daily_tactical'
  | 'weekly_management'
  | 'monthly_management'
  | 'quarterly_attestation'
  | 'annual_audit';

export type RattParty =
  | 'reconciler'
  | 'controller'
  | 'CFO'
  | 'audit_committee_chair';

export type RattEvent =
  | 'reconciliation_attestation_proposed'
  | 'reconciliation_attestation_scope_defined'
  | 'reconciliation_attestation_feeds_ingested'
  | 'reconciliation_attestation_blocks_paired'
  | 'reconciliation_attestation_variance_computed'
  | 'reconciliation_attestation_break_classified'
  | 'reconciliation_attestation_root_cause_logged'
  | 'reconciliation_attestation_remediation_proposed'
  | 'reconciliation_attestation_counter_party_signoff'
  | 'reconciliation_attestation_independent_review'
  | 'reconciliation_attestation_signed'
  | 'reconciliation_attestation_archived'
  | 'reconciliation_attestation_rejected'
  | 'reconciliation_attestation_suspended'
  | 'reconciliation_attestation_resumed'
  | 'reconciliation_attestation_restated'
  | 'reconciliation_attestation_escalated_to_audit_committee'
  | 'reconciliation_attestation_lift_escalation'
  | 'reconciliation_attestation_sla_breached';

// archived is HARD terminal. rejected is terminal (no further forward
// transitions). restated + suspended + escalated_to_audit_committee
// are soft pauses that can be resumed.
const HARD_TERMINALS = new Set<RattStatus>([
  'archived',
]);

const UI_TERMINALS = new Set<RattStatus>([
  'archived',
  'rejected',
]);

export function isTerminal(s: RattStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: RattStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: RattStatus[] = [
  'attestation_proposed',
  'scope_defined',
  'feeds_ingested',
  'blocks_paired',
  'variance_computed',
  'break_classified',
  'root_cause_logged',
  'remediation_proposed',
  'counter_party_signoff',
  'independent_review',
  'attestation_signed',
  'restated',
  'suspended',
  'escalated_to_audit_committee',
];

// suspend can be entered from any active state up to independent_review.
const SUSPEND_FROM: RattStatus[] = [
  'feeds_ingested',
  'blocks_paired',
  'variance_computed',
  'break_classified',
  'root_cause_logged',
  'remediation_proposed',
  'counter_party_signoff',
  'independent_review',
];

// resume_from_suspend returns to remediation_proposed from suspended.
const RESUME_FROM: RattStatus[] = [
  'suspended',
];

// restate supersedes a signed/archived attestation (IAS 8 restatement).
const RESTATE_FROM: RattStatus[] = [
  'attestation_signed',
  'archived',
  'restated',
];

// escalate_to_audit_committee can be entered from any pre-sign work
// state (when audit committee chair takes over).
const ESCALATE_FROM: RattStatus[] = [
  'variance_computed',
  'break_classified',
  'root_cause_logged',
  'remediation_proposed',
  'counter_party_signoff',
  'independent_review',
];

// lift_escalation returns to remediation_proposed from escalated.
const LIFT_FROM: RattStatus[] = [
  'escalated_to_audit_committee',
];

export const TRANSITIONS: Record<RattAction, { from: RattStatus[]; to: RattStatus }> = {
  propose_attestation:       { from: ['attestation_proposed'],                                                              to: 'attestation_proposed' },
  define_scope:              { from: ['attestation_proposed', 'scope_defined'],                                             to: 'scope_defined' },
  ingest_feeds:              { from: ['scope_defined', 'feeds_ingested', 'suspended'],                                      to: 'feeds_ingested' },
  pair_blocks:               { from: ['feeds_ingested', 'blocks_paired'],                                                   to: 'blocks_paired' },
  compute_variance:          { from: ['blocks_paired', 'variance_computed'],                                                to: 'variance_computed' },
  classify_break:            { from: ['variance_computed', 'break_classified'],                                             to: 'break_classified' },
  log_root_cause:            { from: ['break_classified', 'root_cause_logged'],                                             to: 'root_cause_logged' },
  propose_remediation:       { from: ['root_cause_logged', 'remediation_proposed', 'escalated_to_audit_committee'],         to: 'remediation_proposed' },
  get_counter_party_signoff: { from: ['remediation_proposed', 'counter_party_signoff'],                                     to: 'counter_party_signoff' },
  run_independent_review:    { from: ['counter_party_signoff', 'independent_review'],                                       to: 'independent_review' },
  sign_attestation:          { from: ['independent_review', 'attestation_signed'],                                          to: 'attestation_signed' },
  archive:                   { from: ['attestation_signed'],                                                                to: 'archived' },
  reject:                    { from: ALL_NON_TERMINAL,                                                                      to: 'rejected' },
  suspend:                   { from: SUSPEND_FROM,                                                                          to: 'suspended' },
  resume_from_suspend:       { from: RESUME_FROM,                                                                           to: 'remediation_proposed' },
  restate:                   { from: RESTATE_FROM,                                                                          to: 'restated' },
  escalate_to_audit_committee: { from: ESCALATE_FROM,                                                                      to: 'escalated_to_audit_committee' },
  lift_escalation:           { from: LIFT_FROM,                                                                             to: 'remediation_proposed' },
};

export function nextStatus(current: RattStatus, action: RattAction): RattStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_attestation' && current !== 'attestation_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: RattStatus): RattAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: RattAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [RattAction, typeof TRANSITIONS[RattAction]][]) {
    if (a === 'propose_attestation') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger cadence
// (annual_audit) gets the LONGEST window - external-audit attestation
// requires deeper reconciliation + sign-off.
export const SLA_HOURS: Record<RattStatus, Record<RattTier, number>> = {
  // ANCHOR: attestation_proposed × cadence
  attestation_proposed:        { daily_tactical: 24, weekly_management: 96,  monthly_management: 168, quarterly_attestation: 360, annual_audit: 720 },
  scope_defined:               { daily_tactical: 12, weekly_management: 48,  monthly_management: 96,  quarterly_attestation: 168, annual_audit: 360 },
  feeds_ingested:              { daily_tactical: 12, weekly_management: 48,  monthly_management: 96,  quarterly_attestation: 168, annual_audit: 360 },
  blocks_paired:               { daily_tactical: 12, weekly_management: 48,  monthly_management: 96,  quarterly_attestation: 168, annual_audit: 360 },
  variance_computed:           { daily_tactical: 12, weekly_management: 48,  monthly_management: 96,  quarterly_attestation: 168, annual_audit: 360 },
  break_classified:            { daily_tactical: 8,  weekly_management: 36,  monthly_management: 72,  quarterly_attestation: 120, annual_audit: 240 },
  root_cause_logged:           { daily_tactical: 8,  weekly_management: 36,  monthly_management: 72,  quarterly_attestation: 120, annual_audit: 240 },
  remediation_proposed:        { daily_tactical: 8,  weekly_management: 36,  monthly_management: 72,  quarterly_attestation: 120, annual_audit: 240 },
  counter_party_signoff:       { daily_tactical: 8,  weekly_management: 24,  monthly_management: 48,  quarterly_attestation: 96,  annual_audit: 168 },
  independent_review:          { daily_tactical: 8,  weekly_management: 24,  monthly_management: 48,  quarterly_attestation: 96,  annual_audit: 168 },
  attestation_signed:          { daily_tactical: 4,  weekly_management: 12,  monthly_management: 24,  quarterly_attestation: 48,  annual_audit: 96 },
  suspended:                   { daily_tactical: 12, weekly_management: 36,  monthly_management: 72,  quarterly_attestation: 120, annual_audit: 240 },
  restated:                    { daily_tactical: 12, weekly_management: 36,  monthly_management: 72,  quarterly_attestation: 120, annual_audit: 240 },
  escalated_to_audit_committee:{ daily_tactical: 12, weekly_management: 36,  monthly_management: 72,  quarterly_attestation: 120, annual_audit: 240 },
  archived:                    { daily_tactical: 0,  weekly_management: 0,   monthly_management: 0,   quarterly_attestation: 0,   annual_audit: 0 },
  rejected:                    { daily_tactical: 0,  weekly_management: 0,   monthly_management: 0,   quarterly_attestation: 0,   annual_audit: 0 },
};

export function slaWindowHours(status: RattStatus, tier: RattTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: RattStatus, tier: RattTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from cadence.
export type RattCadence = 'daily_tactical' | 'weekly_management' | 'monthly_management' | 'quarterly_attestation' | 'annual_audit';

export function tierForCadence(cadence: RattCadence | string | null | undefined): RattTier {
  switch (cadence) {
    case 'daily_tactical':        return 'daily_tactical';
    case 'weekly_management':     return 'weekly_management';
    case 'monthly_management':    return 'monthly_management';
    case 'quarterly_attestation': return 'quarterly_attestation';
    case 'annual_audit':          return 'annual_audit';
    default:                      return 'monthly_management';
  }
}

export interface RattFloorFlags {
  material_variance_unresolved?: boolean | number | null;
  external_auditor_request_active?: boolean | number | null;
  regulator_audit_in_progress?: boolean | number | null;
  cross_border_feed_break?: boolean | number | null;
  icfr_deficiency_suspected?: boolean | number | null;
}

export function countFloorFlags(args: RattFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.material_variance_unresolved) +
    t(args.external_auditor_request_active) +
    t(args.regulator_audit_in_progress) +
    t(args.cross_border_feed_break) +
    t(args.icfr_deficiency_suspected)
  );
}

// FLOOR-AT-QUARTERLY on >=1 flag. With >=2 flags, floor lifts to
// annual_audit.
export function floorAtQuarterly(args: RattFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

export function floorAtAnnual(args: RattFloorFlags): boolean {
  return countFloorFlags(args) >= 2;
}

// Tier ordering for promotion logic - higher index = longer SLA window.
const TIER_RANK: Record<RattTier, number> = {
  daily_tactical: 0,
  weekly_management: 1,
  monthly_management: 2,
  quarterly_attestation: 3,
  annual_audit: 4,
};

export function effectiveTier(
  rawTier: RattTier,
  flags: RattFloorFlags,
): RattTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 2) return 'annual_audit';
  if (flagCount >= 1) {
    // Lift to at least quarterly_attestation.
    if (TIER_RANK[rawTier] >= TIER_RANK['quarterly_attestation']) return rawTier;
    return 'quarterly_attestation';
  }
  return rawTier;
}

// Heavy tiers - quarterly_attestation + annual_audit.
// SLA-breach reportability + restate crossings attach here.
const HEAVY_TIERS = new Set<RattTier>(['quarterly_attestation', 'annual_audit']);

export function isHeavyTier(tier: RattTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: RattTier): boolean {
  return tier === 'quarterly_attestation' || tier === 'annual_audit';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W120 SIGNATURE: escalate_to_audit_committee crosses regulator EVERY
// tier - the ICFR-DEFICIENCY-ATTEST hard line. Audit committee
// escalation always crosses; JSE Listings 8.62 + Companies Act s30 +
// COSO Monitoring component ALL require disclosure within the
// attestation window EVERY tier.
//
// Additional:
//   reject -> EVERY tier WHEN material_variance_unresolved AND
//     icfr_deficiency_suspected (material weakness attestation fail
//     = reportable EVERY tier; absent both flags, lighter tiers do
//     not auto-cross).
//   restate -> quarterly_attestation + annual_audit only
//     (IAS 8 restatement = listed-issuer disclosure event).
//   sign_attestation -> never crosses (normal flow).
//   suspend -> crosses if regulator_audit_in_progress.
//   sla_breached -> quarterly_attestation + annual_audit only.
export function crossesIntoRegulator(
  action: RattAction,
  tier: RattTier,
  args: {
    flags?: RattFloorFlags;
  },
): boolean {
  const flags = args.flags ?? {};

  // W120 SIGNATURE ICFR-DEFICIENCY-ATTEST: escalate_to_audit_committee
  // EVERY tier.
  if (action === 'escalate_to_audit_committee') {
    return true;
  }

  // reject EVERY tier WHEN material_variance_unresolved AND
  // icfr_deficiency_suspected.
  if (action === 'reject') {
    return !!flags.material_variance_unresolved && !!flags.icfr_deficiency_suspected;
  }

  // restate -> quarterly_attestation + annual_audit only.
  if (action === 'restate') {
    return tier === 'quarterly_attestation' || tier === 'annual_audit';
  }

  // sign_attestation never crosses (normal completion).
  // archive never crosses.
  // suspend can cross if regulator_audit_in_progress.
  if (action === 'suspend') {
    return !!flags.regulator_audit_in_progress;
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: RattTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<RattAction, RattParty> = {
  propose_attestation:         'reconciler',
  define_scope:                'reconciler',
  ingest_feeds:                'reconciler',
  pair_blocks:                 'reconciler',
  compute_variance:            'reconciler',
  classify_break:              'reconciler',
  log_root_cause:              'reconciler',
  propose_remediation:         'reconciler',
  get_counter_party_signoff:   'controller',
  run_independent_review:      'controller',
  sign_attestation:            'CFO',
  archive:                     'CFO',
  reject:                      'CFO',
  suspend:                     'controller',
  resume_from_suspend:         'controller',
  restate:                     'CFO',
  escalate_to_audit_committee: 'audit_committee_chair',
  lift_escalation:             'audit_committee_chair',
};

export function partyForAction(action: RattAction): RattParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: RattAction): RattEvent | null {
  switch (action) {
    case 'propose_attestation':         return 'reconciliation_attestation_proposed';
    case 'define_scope':                return 'reconciliation_attestation_scope_defined';
    case 'ingest_feeds':                return 'reconciliation_attestation_feeds_ingested';
    case 'pair_blocks':                 return 'reconciliation_attestation_blocks_paired';
    case 'compute_variance':            return 'reconciliation_attestation_variance_computed';
    case 'classify_break':              return 'reconciliation_attestation_break_classified';
    case 'log_root_cause':              return 'reconciliation_attestation_root_cause_logged';
    case 'propose_remediation':         return 'reconciliation_attestation_remediation_proposed';
    case 'get_counter_party_signoff':   return 'reconciliation_attestation_counter_party_signoff';
    case 'run_independent_review':      return 'reconciliation_attestation_independent_review';
    case 'sign_attestation':            return 'reconciliation_attestation_signed';
    case 'archive':                     return 'reconciliation_attestation_archived';
    case 'reject':                      return 'reconciliation_attestation_rejected';
    case 'suspend':                     return 'reconciliation_attestation_suspended';
    case 'resume_from_suspend':         return 'reconciliation_attestation_resumed';
    case 'restate':                     return 'reconciliation_attestation_restated';
    case 'escalate_to_audit_committee': return 'reconciliation_attestation_escalated_to_audit_committee';
    case 'lift_escalation':             return 'reconciliation_attestation_lift_escalation';
  }
}

// ─── LIVE battery (~24 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: RattStatus,
  tier: RattTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type RattUrgency = 'critical' | 'high' | 'medium' | 'low';

// INVERTED polarity: annual_audit has the LOOSEST urgency thresholds.
// daily_tactical has TIGHTEST.
export function urgencyBand(
  tier: RattTier,
  slaHoursLeft: number,
): RattUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'annual_audit') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  if (tier === 'quarterly_attestation') {
    if (slaHoursLeft < 18)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'monthly_management') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'weekly_management') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  // daily_tactical - TIGHTEST INVERTED-polarity thresholds
  if (slaHoursLeft < 2)     return 'critical';
  if (slaHoursLeft < 6)     return 'high';
  if (slaHoursLeft < 12)    return 'medium';
  return 'low';
}

// 4-step authority ladder: reconciler -> controller -> CFO ->
// audit_committee_chair.
export type RattAuthority =
  | 'reconciler'
  | 'controller'
  | 'CFO'
  | 'audit_committee_chair';

export function authorityRequired(tier: RattTier): RattAuthority {
  if (tier === 'annual_audit')          return 'audit_committee_chair';
  if (tier === 'quarterly_attestation') return 'CFO';
  if (tier === 'monthly_management')    return 'CFO';
  if (tier === 'weekly_management')     return 'controller';
  return 'reconciler';
}

// Attestation window hours - INVERTED polarity, annual_audit longest.
export function attestationWindowHours(tier: RattTier): number {
  if (tier === 'annual_audit')          return 720;
  if (tier === 'quarterly_attestation') return 360;
  if (tier === 'monthly_management')    return 168;
  if (tier === 'weekly_management')     return 96;
  return 24;
}

// Days to next quarterly attestation deadline.
export function daysToQuarterlyAttestation(now: Date): number {
  const y = now.getUTCFullYear();
  const quarterEnds = [
    Date.UTC(y, 0, 31),
    Date.UTC(y, 3, 30),
    Date.UTC(y, 6, 31),
    Date.UTC(y, 9, 31),
    Date.UTC(y + 1, 0, 31),
  ];
  const nowMs = now.getTime();
  for (const t of quarterEnds) {
    if (t > nowMs) return Math.ceil((t - nowMs) / (24 * 3600 * 1000));
  }
  return 0;
}

// ─── 7-bridge architecture (W113-W119) ──────────────────────────────────
//
// W118 + W119 are MANDATORY - every attestation pairs against at least
// one W118 published-block range AND results in a lodged W119 export
// pack. Other bridges are evidence attachments.
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

// ─── Reconciliation completeness index 0-130 ────────────────────────────
//
// Scores how far the attestation has progressed through the 12-state
// path + clean-close bonus.
export function reconciliationCompletenessIndex(args: {
  attestation_proposed?: boolean | number | null;
  scope_defined?: boolean | number | null;
  feeds_ingested?: boolean | number | null;
  blocks_paired?: boolean | number | null;
  variance_computed?: boolean | number | null;
  break_classified?: boolean | number | null;
  root_cause_logged?: boolean | number | null;
  remediation_proposed?: boolean | number | null;
  counter_party_signoff?: boolean | number | null;
  independent_review?: boolean | number | null;
  attestation_signed?: boolean | number | null;
  archived?: boolean | number | null;
  clean_close_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.attestation_proposed)     * 3;
  score += t(args.scope_defined)            * 6;
  score += t(args.feeds_ingested)           * 8;
  score += t(args.blocks_paired)            * 10;
  score += t(args.variance_computed)        * 12;
  score += t(args.break_classified)         * 10;
  score += t(args.root_cause_logged)        * 10;
  score += t(args.remediation_proposed)     * 10;
  score += t(args.counter_party_signoff)    * 10;
  score += t(args.independent_review)       * 12;
  score += t(args.attestation_signed)       * 14;
  score += t(args.archived)                 * 10;
  score += t(args.clean_close_bonus)        * 15;
  if (score > 130) score = 130;
  return score;
}

// ─── ICFR control effectiveness index 0-130 ─────────────────────────────
//
// Tracks whether the ICFR controls underpinning the attestation are
// operating effectively. COSO + AICPA TSC + ISA 315 components.
export function icfrControlEffectivenessIndex(args: {
  coso_components_tested?: number | null;        // 0-5
  tsc_categories_tested?: number | null;         // 0-5
  feeds_paired_pct?: number | null;              // 0-100
  variance_explained_pct?: number | null;        // 0-100
  break_classified_pct?: number | null;          // 0-100
  remediation_closed_pct?: number | null;        // 0-100
  counter_party_signed_off?: boolean | number | null;
  independent_review_passed?: boolean | number | null;
  cfo_attestation_signed?: boolean | number | null;
  audit_committee_briefed?: boolean | number | null;
  icfr_deficiency_suspected?: boolean | number | null;
  material_weakness_open?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  const n = (v: number | null | undefined, max: number): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(max, x));
  };
  let score = 0;
  // COSO components - 5 components × 4 points = 20.
  score += n(args.coso_components_tested, 5) * 4;
  // TSC categories - 5 categories × 4 points = 20.
  score += n(args.tsc_categories_tested, 5) * 4;
  // Feeds paired - up to 15 points scaled 0-100%.
  score += Math.round(n(args.feeds_paired_pct, 100) * 0.15);
  // Variance explained - up to 15 points scaled 0-100%.
  score += Math.round(n(args.variance_explained_pct, 100) * 0.15);
  // Break classified - up to 10 points scaled 0-100%.
  score += Math.round(n(args.break_classified_pct, 100) * 0.10);
  // Remediation closed - up to 10 points scaled 0-100%.
  score += Math.round(n(args.remediation_closed_pct, 100) * 0.10);
  // Sign-offs.
  score += t(args.counter_party_signed_off)    * 8;
  score += t(args.independent_review_passed)   * 10;
  score += t(args.cfo_attestation_signed)      * 10;
  score += t(args.audit_committee_briefed)     * 5;
  // Deductions for deficiencies.
  if (args.icfr_deficiency_suspected) score -= 15;
  if (args.material_weakness_open) score -= 25;
  if (score < 0) score = 0;
  if (score > 130) score = 130;
  return score;
}

// ─── Variance score 0-130 ───────────────────────────────────────────────
//
// Lower variance ZAR = higher score. Inverse-scaled against materiality.
export function varianceScoreIndex(args: {
  total_variance_zar?: number | null;
  materiality_threshold_zar?: number | null;
  net_variance_explained_zar?: number | null;
  unresolved_variance_zar?: number | null;
}): number {
  const n = (v: number | null | undefined): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, x);
  };
  const totalVar = n(args.total_variance_zar);
  const materiality = n(args.materiality_threshold_zar);
  const explained = n(args.net_variance_explained_zar);
  const unresolved = n(args.unresolved_variance_zar);

  if (materiality <= 0) return 0;

  // Start at full marks.
  let score = 130;
  // Penalty for total variance proportional to materiality (cap 60 pts).
  const totalRatio = totalVar / materiality;
  score -= Math.round(Math.min(60, totalRatio * 30));
  // Penalty for unresolved variance proportional to materiality (cap
  // 70 pts).
  const unresolvedRatio = unresolved / materiality;
  score -= Math.round(Math.min(70, unresolvedRatio * 70));
  // Bonus for explained portion of total.
  if (totalVar > 0) {
    const explainedPct = Math.min(1, explained / totalVar);
    score += Math.round(explainedPct * 15);
  }
  if (score < 0) score = 0;
  if (score > 130) score = 130;
  return score;
}

// ─── Remediation progress index 0-130 ───────────────────────────────────
//
// Captures how far the remediation plan has progressed - root cause
// logged, action plan agreed, owner assigned, target date set, evidence
// attached, controller review, CFO sign-off, audit-committee briefing.
export function remediationProgressIndex(args: {
  root_cause_logged?: boolean | number | null;
  action_plan_drafted?: boolean | number | null;
  owner_assigned?: boolean | number | null;
  target_date_set?: boolean | number | null;
  evidence_attached?: boolean | number | null;
  controller_reviewed?: boolean | number | null;
  cfo_signed_off?: boolean | number | null;
  audit_committee_briefed?: boolean | number | null;
  remediation_closed?: boolean | number | null;
  followup_test_passed?: boolean | number | null;
  remediation_progress_pct?: number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  const n = (v: number | null | undefined): number => {
    const x = Number(v || 0);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(100, x));
  };
  let score = 0;
  score += t(args.root_cause_logged)        * 8;
  score += t(args.action_plan_drafted)      * 10;
  score += t(args.owner_assigned)           * 8;
  score += t(args.target_date_set)          * 6;
  score += t(args.evidence_attached)        * 12;
  score += t(args.controller_reviewed)      * 10;
  score += t(args.cfo_signed_off)           * 12;
  score += t(args.audit_committee_briefed)  * 6;
  score += t(args.remediation_closed)       * 12;
  score += t(args.followup_test_passed)     * 16;
  // Optional progress percentage modifier (0-30 bonus).
  score += Math.round(n(args.remediation_progress_pct) * 0.3);
  if (score > 130) score = 130;
  return score;
}

// ─── External-auditor signed-JWT validator ──────────────────────────────
//
// External-auditor read endpoint
// (GET /api/reconciliation-attestation/external/:id) is signed-JWT-gated
// (NOT mTLS like W119). The JWT carries the auditor's identity and an
// `aud` claim of `external_auditor`. We validate format here and verify
// signature server-side via HMAC-SHA256.
export interface ExternalAuditorClaims {
  sub: string;                    // auditor identifier (e.g. firm code)
  aud: 'external_auditor';
  scope: string[];                // attestation IDs the auditor can read
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

export function externalAuditorCanReadAttestation(
  claims: ExternalAuditorClaims,
  attestationId: string,
  now: Date,
): boolean {
  if (isExternalAuditorClaimsExpired(claims, now)) return false;
  if (!claims.scope.includes(attestationId) && !claims.scope.includes('*')) return false;
  return true;
}

// Reconciliation feed sources supported.
export const FEED_SOURCES = [
  'sap_s4hana',
  'oracle_financials',
  'sage_300',
  'workday',
  'strate',
  'swift_mt940',
  'nersa_inbox',
  'ippo_inbox',
  'dmre_inbox',
  'bank_statement',
  'w118_audit_chain',
] as const;

export type FeedSource = typeof FEED_SOURCES[number];

export function isKnownFeedSource(s: string | null | undefined): s is FeedSource {
  if (!s) return false;
  return (FEED_SOURCES as readonly string[]).includes(s);
}

// Break classification taxonomy.
export const BREAK_CLASSIFICATIONS = [
  'none',
  'timing',
  'quantum',
  'missing',
  'duplicate',
  'fx_translation',
  'rounding',
  'unauthorised',
  'system_error',
  'manual_journal',
  'timing+quantum',
  'timing+missing',
  'quantum+missing',
  'timing+quantum+missing',
] as const;

export type BreakClassification = typeof BREAK_CLASSIFICATIONS[number];

export function isKnownBreakClassification(s: string | null | undefined): s is BreakClassification {
  if (!s) return false;
  return (BREAK_CLASSIFICATIONS as readonly string[]).includes(s);
}

// Root cause taxonomy.
export const ROOT_CAUSE_TAXONOMIES = [
  'none',
  'control',
  'process',
  'system',
  'external',
  'people',
  'data',
  'control+external',
  'control+system',
  'process+data',
  'system+external',
] as const;

export type RootCauseTaxonomy = typeof ROOT_CAUSE_TAXONOMIES[number];

export function isKnownRootCauseTaxonomy(s: string | null | undefined): s is RootCauseTaxonomy {
  if (!s) return false;
  return (ROOT_CAUSE_TAXONOMIES as readonly string[]).includes(s);
}

// Attestation health band - composite from completeness + ICFR
// effectiveness + variance + remediation + SLA.
export type RattHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function attestationHealthBand(
  status: RattStatus,
  completeness: number,
  icfrEffectiveness: number,
  varianceScore: number,
  remediationProgress: number,
  slaBreached: boolean,
  rejected: boolean,
  escalated: boolean,
  flags: RattFloorFlags,
): RattHealthBand {
  if (rejected) return 'critical';
  if (escalated) return 'critical';
  if (flags.icfr_deficiency_suspected && flags.material_variance_unresolved) return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (status === 'suspended') return 'amber';
  if (status === 'restated') return 'amber';
  if (icfrEffectiveness < 60) return 'red';
  if (varianceScore < 40) return 'red';
  if (icfrEffectiveness < 90) return 'amber';
  if (remediationProgress < 50 && (status === 'remediation_proposed' || status === 'counter_party_signoff')) return 'amber';
  if (completeness < 30) return 'amber';
  if (completeness < 80) return 'amber';
  return 'green';
}
