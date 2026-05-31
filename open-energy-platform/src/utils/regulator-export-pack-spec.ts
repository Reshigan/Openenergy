// ─────────────────────────────────────────────────────────────────────────
// Wave 119 - Certified Regulator Export Packs.
//
// SECOND Phase-B wave. Consumes W118 published audit blocks and
// assembles per-regulator certified export packs (NERSA / IPPO / SARB /
// DMRE / FSCA / DFFE / DTI / JSE-SRL / SARS / CIPC) for lodgement via
// API. Where W118 builds the tamper-evident spine, W119 is the
// REGULATOR-FACING OUTPUT - it turns blocks into XBRL/iXBRL/PDF/CSV
// packages, attaches IFRS taxonomy + ESG narrative + control-environment
// evidence, runs internal QA + counterparty sign-off, packages a
// digitally-signed pack, lodges it through the regulator's API (mTLS),
// records the ACK, and archives.
//
// Standards: XBRL 2.1 + iXBRL + IFRS Taxonomy + IFRS S1/S2 + GRI 1/2/3
// + SASB Standards + TCFD Recommendations + ISSB IFRS S1/S2 + ESRS +
// SOC 2 Type II CC Series + COSO Internal Control Integrated Framework
// + AICPA TSC + NERSA s14 (record keeping) + NERSA s10/s14 (licence
// returns) + IPPO Quarterly Reporting Standard + SARB ExCon Filing
// Manual + DMRE REIPPPP Bid Window Returns + FSCA Conduct Standard
// 1/2020 + DFFE Carbon Tax Act Returns + DTI BBBEE Status + JSE SRL
// Listed-Issuer Continuing Obligations + SARS BizFin returns + CIPC
// annual return + ETSI TS 119 312 (signature policy) + RFC 5652 CMS
// (cryptographic message syntax) + ISO 32000 PDF/A-3 (long-term
// archival).
//
// 12-state forward path + 4 branch states:
//   pack_proposed -> blocks_selected -> leaves_filtered ->
//     xbrl_assembled -> narratives_attached -> internal_qa ->
//     counterparty_signoff -> packaged -> countersigned ->
//     lodged_via_api -> acknowledged_by_regulator -> archived
//     (HARD terminal)
//   any non-terminal -> reject_pack -> rejected_by_regulator (TERMINAL)
//   pre-lodgement -> withdraw -> withdrawn (TERMINAL)
//   post-acknowledgement correction -> restate -> restated (SOFT)
//   regulator audit pause -> suspend -> suspended (SOFT - resume to
//     internal_qa)
//
// Tier RE-DERIVED on every transition from pack_cadence with
// FLOOR-AT-QUARTERLY on 5 contextual flags:
//   - cross_regulator_pack         (single pack lodged to multiple
//                                    regulators; e.g. NERSA + IPPO + SARB)
//   - material_restatement         (recasting a prior pack with material
//                                    impact > R5m)
//   - esg_double_materiality_trigger (IFRS S1/S2 + ESRS dual lens)
//   - lender_distribution_required (debt-side waterfall required)
//   - regulator_audit_in_progress  (NERSA/IPPO/SARB live audit)
//
// 5 tiers (INVERTED polarity - LONGER lodgement cadence = MORE
// preparation time):
//   ad_hoc                : 24h    (operator-triggered urgent return)
//   monthly_return        : 72h    (monthly NERSA s14 / IPPO / SARB)
//   quarterly_attestation : 168h   (quarterly NERSA / IPPO / SARB)
//   half_year             : 240h   (interim listed-issuer JSE SRL)
//   annual_audit          : 480h   (annual audited + IFRS taxonomy)
//
// SIGNATURE Phase-B regulator crossings:
//   reject_pack -> EVERY tier
//     (W119 SIGNATURE REGULATOR-REJECT-PACK hard line - a regulator
//      formally rejecting a pack means the filing failed; NERSA s14 +
//      IPPO + SARB + JSE SRL ALL require disclosure within the export
//      window EVERY tier.)
//   withdraw -> EVERY tier WHEN blocks_selected included a
//     PUBLISHED-block range (a published block being withdrawn from a
//     lodgement = audit-trail concern; reportable EVERY tier).
//   restate -> quarterly_attestation + annual_audit only (recasting an
//     acknowledged pack = listed-issuer disclosure event).
//   lodge_via_api -> NEVER crosses (lodgement is the normal flow,
//     even if it lands at the regulator inbox by definition).
//   sla_breached -> quarterly_attestation + half_year + annual_audit
//     only (operator failed to lodge on a major filing window =
//     listed-issuer + s14 disclosure).
//
// Write {admin, regulator} only. READ all 9 personas + external
// `regulator_filer` pseudo-persona via mTLS-gated
// /api/regulator-exports/lodge/:target endpoint (no JWT auth, mTLS
// fingerprint check).
//
// actor_party split (4-step authority + regulator counter):
//   preparer   : propose_pack / select_blocks / filter_leaves /
//                assemble_xbrl / attach_narratives
//   controller : run_internal_qa
//   CFO        : get_counterparty_signoff / package / countersign /
//                withdraw / suspend / resume / restate
//   CEO        : lodge_via_api (CEO countersignature required at
//                lodgement)
//   regulator  : record_acknowledgement / reject_pack / archive
//
// Event prefix: `regulator_export_evt_`. AUDIT_PREFIX_MAP entry:
//   regulator_export: 'audit'   (joins W118 'audit' namespace - both
//   are platform-wide L5 tamper-evident chains, NOT role-suffixed)
//
// Three crons:
//   - */15 * * * *        SLA sweep (already in wrangler.toml)
//   - 50 0 * * *          nightly XBRL conformance + coverage recompute
//   - 0 4 1 * *           monthly upcoming-deadline scan + auto-propose
//                         for upcoming returns
//
// Six bridges:
//   W113 EVM ref + W114 doc-control ref + W115 submittal ref +
//   W116 RFI ref + W117 change-order ref + W118 block_height range
//   (W118 ref MANDATORY - every pack sources from at least one W118
//   block range. Other bridges are evidence attachments.)
// ─────────────────────────────────────────────────────────────────────────

export type RepStatus =
  | 'pack_proposed'
  | 'blocks_selected'
  | 'leaves_filtered'
  | 'xbrl_assembled'
  | 'narratives_attached'
  | 'internal_qa'
  | 'counterparty_signoff'
  | 'packaged'
  | 'countersigned'
  | 'lodged_via_api'
  | 'acknowledged_by_regulator'
  | 'archived'
  | 'rejected_by_regulator'
  | 'withdrawn'
  | 'restated'
  | 'suspended';

export type RepAction =
  | 'propose_pack'
  | 'select_blocks'
  | 'filter_leaves'
  | 'assemble_xbrl'
  | 'attach_narratives'
  | 'run_internal_qa'
  | 'get_counterparty_signoff'
  | 'package'
  | 'countersign'
  | 'lodge_via_api'
  | 'record_acknowledgement'
  | 'archive'
  | 'reject_pack'
  | 'withdraw'
  | 'restate'
  | 'suspend';

export type RepTier =
  | 'ad_hoc'
  | 'monthly_return'
  | 'quarterly_attestation'
  | 'half_year'
  | 'annual_audit';

export type RepParty =
  | 'preparer'
  | 'controller'
  | 'CFO'
  | 'CEO'
  | 'regulator';

export type RepEvent =
  | 'regulator_export_pack_proposed'
  | 'regulator_export_blocks_selected'
  | 'regulator_export_leaves_filtered'
  | 'regulator_export_xbrl_assembled'
  | 'regulator_export_narratives_attached'
  | 'regulator_export_internal_qa'
  | 'regulator_export_counterparty_signoff'
  | 'regulator_export_packaged'
  | 'regulator_export_countersigned'
  | 'regulator_export_lodged_via_api'
  | 'regulator_export_acknowledged_by_regulator'
  | 'regulator_export_archived'
  | 'regulator_export_rejected_by_regulator'
  | 'regulator_export_withdrawn'
  | 'regulator_export_restated'
  | 'regulator_export_suspended'
  | 'regulator_export_resumed'
  | 'regulator_export_sla_breached';

// archived is HARD terminal. rejected_by_regulator + withdrawn are
// terminal (no further forward transitions). restated + suspended are
// soft pauses that can be resumed.
const HARD_TERMINALS = new Set<RepStatus>([
  'archived',
]);

const UI_TERMINALS = new Set<RepStatus>([
  'archived',
  'rejected_by_regulator',
  'withdrawn',
]);

export function isTerminal(s: RepStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: RepStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: RepStatus[] = [
  'pack_proposed',
  'blocks_selected',
  'leaves_filtered',
  'xbrl_assembled',
  'narratives_attached',
  'internal_qa',
  'counterparty_signoff',
  'packaged',
  'countersigned',
  'lodged_via_api',
  'acknowledged_by_regulator',
  'restated',
  'suspended',
];

// withdraw can be entered any time pre-acknowledgement.
const WITHDRAW_FROM: RepStatus[] = [
  'pack_proposed',
  'blocks_selected',
  'leaves_filtered',
  'xbrl_assembled',
  'narratives_attached',
  'internal_qa',
  'counterparty_signoff',
  'packaged',
  'countersigned',
  'lodged_via_api',
];

// suspend can be entered from any QA/sign-off/lodgement state.
const SUSPEND_FROM: RepStatus[] = [
  'internal_qa',
  'counterparty_signoff',
  'packaged',
  'countersigned',
  'lodged_via_api',
  'suspended',
];

// resume returns to internal_qa from suspended.
// restate supersedes an acknowledged pack.
const RESTATE_FROM: RepStatus[] = [
  'acknowledged_by_regulator',
  'archived',
  'restated',
];

export const TRANSITIONS: Record<RepAction, { from: RepStatus[]; to: RepStatus }> = {
  propose_pack:             { from: ['pack_proposed'],                                                                                  to: 'pack_proposed' },
  select_blocks:            { from: ['pack_proposed', 'blocks_selected'],                                                               to: 'blocks_selected' },
  filter_leaves:            { from: ['blocks_selected', 'leaves_filtered'],                                                             to: 'leaves_filtered' },
  assemble_xbrl:            { from: ['leaves_filtered', 'xbrl_assembled'],                                                              to: 'xbrl_assembled' },
  attach_narratives:        { from: ['xbrl_assembled', 'narratives_attached'],                                                          to: 'narratives_attached' },
  run_internal_qa:          { from: ['narratives_attached', 'internal_qa', 'suspended'],                                                to: 'internal_qa' },
  get_counterparty_signoff: { from: ['internal_qa', 'counterparty_signoff'],                                                            to: 'counterparty_signoff' },
  package:                  { from: ['counterparty_signoff', 'packaged'],                                                               to: 'packaged' },
  countersign:              { from: ['packaged', 'countersigned'],                                                                      to: 'countersigned' },
  lodge_via_api:            { from: ['countersigned', 'lodged_via_api'],                                                                to: 'lodged_via_api' },
  record_acknowledgement:   { from: ['lodged_via_api', 'acknowledged_by_regulator'],                                                    to: 'acknowledged_by_regulator' },
  archive:                  { from: ['acknowledged_by_regulator'],                                                                      to: 'archived' },
  reject_pack:              { from: ALL_NON_TERMINAL,                                                                                   to: 'rejected_by_regulator' },
  withdraw:                 { from: WITHDRAW_FROM,                                                                                      to: 'withdrawn' },
  restate:                  { from: RESTATE_FROM,                                                                                       to: 'restated' },
  suspend:                  { from: SUSPEND_FROM,                                                                                      to: 'suspended' },
};

export function nextStatus(current: RepStatus, action: RepAction): RepStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_pack' && current !== 'pack_proposed') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: RepStatus): RepAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: RepAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [RepAction, typeof TRANSITIONS[RepAction]][]) {
    if (a === 'propose_pack') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// INVERTED SLA polarity stored as HOURS. 0 == no SLA. Larger pack
// cadence (annual_audit) gets the LONGEST window - annual audited
// + IFRS taxonomy pack requires deeper assembly + counterparty
// sign-off.
export const SLA_HOURS: Record<RepStatus, Record<RepTier, number>> = {
  // ANCHOR: pack_proposed × cadence
  pack_proposed:            { ad_hoc: 24,  monthly_return: 72,  quarterly_attestation: 168, half_year: 240, annual_audit: 480 },
  blocks_selected:          { ad_hoc: 12,  monthly_return: 36,  quarterly_attestation: 84,  half_year: 120, annual_audit: 240 },
  leaves_filtered:          { ad_hoc: 12,  monthly_return: 36,  quarterly_attestation: 84,  half_year: 120, annual_audit: 240 },
  xbrl_assembled:           { ad_hoc: 12,  monthly_return: 36,  quarterly_attestation: 84,  half_year: 120, annual_audit: 240 },
  narratives_attached:      { ad_hoc: 12,  monthly_return: 36,  quarterly_attestation: 84,  half_year: 120, annual_audit: 240 },
  internal_qa:              { ad_hoc: 12,  monthly_return: 36,  quarterly_attestation: 72,  half_year: 96,  annual_audit: 168 },
  counterparty_signoff:     { ad_hoc: 12,  monthly_return: 36,  quarterly_attestation: 72,  half_year: 96,  annual_audit: 168 },
  packaged:                 { ad_hoc: 6,   monthly_return: 24,  quarterly_attestation: 48,  half_year: 72,  annual_audit: 120 },
  countersigned:            { ad_hoc: 6,   monthly_return: 24,  quarterly_attestation: 48,  half_year: 72,  annual_audit: 120 },
  lodged_via_api:           { ad_hoc: 6,   monthly_return: 12,  quarterly_attestation: 24,  half_year: 48,  annual_audit: 96 },
  acknowledged_by_regulator:{ ad_hoc: 12,  monthly_return: 24,  quarterly_attestation: 48,  half_year: 72,  annual_audit: 120 },
  restated:                 { ad_hoc: 12,  monthly_return: 36,  quarterly_attestation: 72,  half_year: 96,  annual_audit: 168 },
  suspended:                { ad_hoc: 12,  monthly_return: 36,  quarterly_attestation: 72,  half_year: 96,  annual_audit: 168 },
  archived:                 { ad_hoc: 0,   monthly_return: 0,   quarterly_attestation: 0,   half_year: 0,   annual_audit: 0 },
  rejected_by_regulator:    { ad_hoc: 0,   monthly_return: 0,   quarterly_attestation: 0,   half_year: 0,   annual_audit: 0 },
  withdrawn:                { ad_hoc: 0,   monthly_return: 0,   quarterly_attestation: 0,   half_year: 0,   annual_audit: 0 },
};

export function slaWindowHours(status: RepStatus, tier: RepTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: RepStatus, tier: RepTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from pack_cadence.
export type RepCadence = 'ad_hoc' | 'monthly_return' | 'quarterly_attestation' | 'half_year' | 'annual_audit';

export function tierForCadence(cadence: RepCadence | string | null | undefined): RepTier {
  switch (cadence) {
    case 'ad_hoc':                return 'ad_hoc';
    case 'monthly_return':        return 'monthly_return';
    case 'quarterly_attestation': return 'quarterly_attestation';
    case 'half_year':             return 'half_year';
    case 'annual_audit':          return 'annual_audit';
    default:                      return 'monthly_return';
  }
}

export interface RepFloorFlags {
  cross_regulator_pack?: boolean | number | null;
  material_restatement?: boolean | number | null;
  esg_double_materiality_trigger?: boolean | number | null;
  lender_distribution_required?: boolean | number | null;
  regulator_audit_in_progress?: boolean | number | null;
}

export function countFloorFlags(args: RepFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.cross_regulator_pack) +
    t(args.material_restatement) +
    t(args.esg_double_materiality_trigger) +
    t(args.lender_distribution_required) +
    t(args.regulator_audit_in_progress)
  );
}

// FLOOR-AT-QUARTERLY on >=1 flag. With >=2 flags, floor lifts to
// annual_audit.
export function floorAtQuarterly(args: RepFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

export function floorAtAnnual(args: RepFloorFlags): boolean {
  return countFloorFlags(args) >= 2;
}

// Tier ordering for promotion logic - higher index = longer SLA window.
const TIER_RANK: Record<RepTier, number> = {
  ad_hoc: 0,
  monthly_return: 1,
  quarterly_attestation: 2,
  half_year: 3,
  annual_audit: 4,
};

export function effectiveTier(
  rawTier: RepTier,
  flags: RepFloorFlags,
): RepTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 2) return 'annual_audit';
  if (flagCount >= 1) {
    // Lift to at least quarterly_attestation.
    if (TIER_RANK[rawTier] >= TIER_RANK['quarterly_attestation']) return rawTier;
    return 'quarterly_attestation';
  }
  return rawTier;
}

// Heavy tiers - quarterly_attestation + half_year + annual_audit.
// SLA-breach reportability + restate crossings attach here.
const HEAVY_TIERS = new Set<RepTier>(['quarterly_attestation', 'half_year', 'annual_audit']);

export function isHeavyTier(tier: RepTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: RepTier): boolean {
  return tier === 'quarterly_attestation' || tier === 'annual_audit';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
//
// W119 SIGNATURE: reject_pack crosses regulator EVERY tier - the
// REGULATOR-REJECT-PACK hard line. A regulator formally rejecting a
// pack = the filing failed; NERSA/IPPO/SARB/JSE-SRL ALL require
// disclosure within the export window EVERY tier.
//
// Additional:
//   withdraw -> EVERY tier WHEN blocks_selected included published
//     blocks (audit-trail concern)
//   restate -> quarterly_attestation + annual_audit only (recasting an
//     acknowledged pack = listed-issuer disclosure event)
//   lodge_via_api -> never crosses (lodgement = normal flow even
//     though it inherently lands at the regulator inbox)
//   sla_breached -> quarterly_attestation + half_year + annual_audit
//     only
export function crossesIntoRegulator(
  action: RepAction,
  tier: RepTier,
  args: {
    flags?: RepFloorFlags;
    published_blocks_included?: boolean;
  },
): boolean {
  const flags = args.flags ?? {};
  const publishedIncluded = !!args.published_blocks_included;

  // W119 SIGNATURE REGULATOR-REJECT-PACK: reject_pack EVERY tier.
  if (action === 'reject_pack') {
    return true;
  }

  // withdraw EVERY tier when blocks_selected included published blocks.
  if (action === 'withdraw') {
    return publishedIncluded;
  }

  // restate -> quarterly_attestation + annual_audit only.
  if (action === 'restate') {
    return tier === 'quarterly_attestation' || tier === 'annual_audit';
  }

  // lodge_via_api never crosses on its own (normal flow).
  // record_acknowledgement is the regulator's own action - reflects
  // their inbox state, doesn't trigger a separate crossing.
  // suspend can cross if regulator_audit_in_progress.
  if (action === 'suspend') {
    return !!flags.regulator_audit_in_progress;
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: RepTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<RepAction, RepParty> = {
  propose_pack:             'preparer',
  select_blocks:            'preparer',
  filter_leaves:            'preparer',
  assemble_xbrl:            'preparer',
  attach_narratives:        'preparer',
  run_internal_qa:          'controller',
  get_counterparty_signoff: 'CFO',
  package:                  'CFO',
  countersign:              'CFO',
  lodge_via_api:            'CEO',
  record_acknowledgement:   'regulator',
  archive:                  'regulator',
  reject_pack:              'regulator',
  withdraw:                 'CFO',
  restate:                  'CFO',
  suspend:                  'CFO',
};

export function partyForAction(action: RepAction): RepParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: RepAction): RepEvent | null {
  switch (action) {
    case 'propose_pack':             return 'regulator_export_pack_proposed';
    case 'select_blocks':            return 'regulator_export_blocks_selected';
    case 'filter_leaves':            return 'regulator_export_leaves_filtered';
    case 'assemble_xbrl':            return 'regulator_export_xbrl_assembled';
    case 'attach_narratives':        return 'regulator_export_narratives_attached';
    case 'run_internal_qa':          return 'regulator_export_internal_qa';
    case 'get_counterparty_signoff': return 'regulator_export_counterparty_signoff';
    case 'package':                  return 'regulator_export_packaged';
    case 'countersign':              return 'regulator_export_countersigned';
    case 'lodge_via_api':            return 'regulator_export_lodged_via_api';
    case 'record_acknowledgement':   return 'regulator_export_acknowledged_by_regulator';
    case 'archive':                  return 'regulator_export_archived';
    case 'reject_pack':              return 'regulator_export_rejected_by_regulator';
    case 'withdraw':                 return 'regulator_export_withdrawn';
    case 'restate':                  return 'regulator_export_restated';
    case 'suspend':                  return 'regulator_export_suspended';
  }
}

// ─── LIVE battery (~22 fields decorated at fetch) ───────────────────────

export function slaHoursRemaining(
  status: RepStatus,
  tier: RepTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type RepUrgency = 'critical' | 'high' | 'medium' | 'low';

// INVERTED polarity: annual_audit has the LOOSEST urgency thresholds.
// ad_hoc has TIGHTEST.
export function urgencyBand(
  tier: RepTier,
  slaHoursLeft: number,
): RepUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'annual_audit') {
    if (slaHoursLeft < 24)  return 'critical';
    if (slaHoursLeft < 96)  return 'high';
    if (slaHoursLeft < 240) return 'medium';
    return 'low';
  }
  if (tier === 'half_year') {
    if (slaHoursLeft < 18)  return 'critical';
    if (slaHoursLeft < 72)  return 'high';
    if (slaHoursLeft < 168) return 'medium';
    return 'low';
  }
  if (tier === 'quarterly_attestation') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 48)  return 'high';
    if (slaHoursLeft < 96)  return 'medium';
    return 'low';
  }
  if (tier === 'monthly_return') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  // ad_hoc - TIGHTEST INVERTED-polarity thresholds
  if (slaHoursLeft < 2)     return 'critical';
  if (slaHoursLeft < 6)     return 'high';
  if (slaHoursLeft < 12)    return 'medium';
  return 'low';
}

// 4-step authority ladder: preparer -> controller -> CFO -> CEO.
export type RepAuthority =
  | 'preparer'
  | 'controller'
  | 'CFO'
  | 'CEO';

export function authorityRequired(tier: RepTier): RepAuthority {
  if (tier === 'annual_audit')          return 'CEO';
  if (tier === 'half_year')             return 'CEO';
  if (tier === 'quarterly_attestation') return 'CFO';
  if (tier === 'monthly_return')        return 'controller';
  return 'preparer';
}

// Regulator export window hours - INVERTED polarity, annual_audit
// longest.
export function regulatorExportWindowHours(tier: RepTier): number {
  if (tier === 'annual_audit')          return 480;
  if (tier === 'half_year')             return 240;
  if (tier === 'quarterly_attestation') return 168;
  if (tier === 'monthly_return')        return 72;
  return 24;
}

// Days to next quarterly attestation lodgement deadline (NERSA/IPPO/
// SARB).
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

// ─── 6-bridge architecture (W113-W118) ──────────────────────────────────
//
// W118 is MANDATORY - every regulator pack sources from at least one
// W118 published-block range. Other bridges are evidence attachments
// that strengthen the pack but are not required.
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

// ─── Pack completeness index 0-130 ──────────────────────────────────────
export function packCompletenessIndex(args: {
  pack_proposed?: boolean | number | null;
  blocks_selected?: boolean | number | null;
  leaves_filtered?: boolean | number | null;
  xbrl_assembled?: boolean | number | null;
  narratives_attached?: boolean | number | null;
  internal_qa?: boolean | number | null;
  counterparty_signoff?: boolean | number | null;
  packaged?: boolean | number | null;
  countersigned?: boolean | number | null;
  lodged_via_api?: boolean | number | null;
  acknowledged_by_regulator?: boolean | number | null;
  archived?: boolean | number | null;
  clean_close_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.pack_proposed)              * 3;
  score += t(args.blocks_selected)            * 6;
  score += t(args.leaves_filtered)            * 6;
  score += t(args.xbrl_assembled)             * 10;
  score += t(args.narratives_attached)        * 10;
  score += t(args.internal_qa)                * 12;
  score += t(args.counterparty_signoff)       * 10;
  score += t(args.packaged)                   * 8;
  score += t(args.countersigned)              * 10;
  score += t(args.lodged_via_api)             * 12;
  score += t(args.acknowledged_by_regulator)  * 14;
  score += t(args.archived)                   * 14;
  score += t(args.clean_close_bonus)          * 15;
  if (score > 130) score = 130;
  return score;
}

// ─── XBRL conformance validator (structural) 0-130 ──────────────────────
//
// Structural validation only - element well-formedness count + required
// IFRS taxonomy element presence (assets, liabilities, equity, revenue,
// profit_loss, cash_equivalents, segments_reported). The real schema
// validation runs against the regulator's taxonomy server; this is the
// PRE-flight check before lodgement.
export function xbrlConformanceIndex(args: {
  xbrl_assembled?: boolean | number | null;
  taxonomy_version_set?: boolean | number | null;
  schema_well_formed?: boolean | number | null;
  required_element_assets?: boolean | number | null;
  required_element_liabilities?: boolean | number | null;
  required_element_equity?: boolean | number | null;
  required_element_revenue?: boolean | number | null;
  required_element_profit_loss?: boolean | number | null;
  required_element_cash_equivalents?: boolean | number | null;
  required_element_segments_reported?: boolean | number | null;
  ixbrl_inline_html_valid?: boolean | number | null;
  pdf_a3_archival_attached?: boolean | number | null;
  signing_policy_etsi_119312?: boolean | number | null;
  cms_signature_rfc5652?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.xbrl_assembled)                     * 8;
  score += t(args.taxonomy_version_set)               * 6;
  score += t(args.schema_well_formed)                 * 14;
  score += t(args.required_element_assets)            * 8;
  score += t(args.required_element_liabilities)       * 8;
  score += t(args.required_element_equity)            * 8;
  score += t(args.required_element_revenue)           * 8;
  score += t(args.required_element_profit_loss)       * 8;
  score += t(args.required_element_cash_equivalents)  * 8;
  score += t(args.required_element_segments_reported) * 8;
  score += t(args.ixbrl_inline_html_valid)            * 10;
  score += t(args.pdf_a3_archival_attached)           * 8;
  score += t(args.signing_policy_etsi_119312)         * 10;
  score += t(args.cms_signature_rfc5652)              * 10;
  if (score > 130) score = 130;
  return score;
}

// ─── ESG taxonomy coverage scorer 0-100 ─────────────────────────────────
//
// Tracks the four big-tent ESG frameworks: GRI 1/2/3 + SASB Standards +
// TCFD Recommendations + ISSB IFRS S1/S2. Each contributes 25 points
// when present.
export function esgTaxonomyCoverageIndex(args: {
  gri_standards_attached?: boolean | number | null;
  sasb_standards_attached?: boolean | number | null;
  tcfd_recommendations_attached?: boolean | number | null;
  issb_ifrs_s1_s2_attached?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.gri_standards_attached)        * 25;
  score += t(args.sasb_standards_attached)       * 25;
  score += t(args.tcfd_recommendations_attached) * 25;
  score += t(args.issb_ifrs_s1_s2_attached)      * 25;
  if (score > 100) score = 100;
  return score;
}

// ─── Controls narrative completeness 0-130 ──────────────────────────────
//
// COSO + SOC 2 + AICPA TSC controls-narrative coverage. Five COSO
// components + five SOC 2 trust services criteria + 3 SOC narrative
// bonuses.
export function controlsNarrativeIndex(args: {
  // Granular per-component (legacy / spec form)
  coso_control_environment?: boolean | number | null;
  coso_risk_assessment?: boolean | number | null;
  coso_control_activities?: boolean | number | null;
  coso_information_communication?: boolean | number | null;
  coso_monitoring_activities?: boolean | number | null;
  tsc_security?: boolean | number | null;
  tsc_availability?: boolean | number | null;
  tsc_processing_integrity?: boolean | number | null;
  tsc_confidentiality?: boolean | number | null;
  tsc_privacy?: boolean | number | null;
  // Aggregate counts (D1 schema form)
  coso_components_present?: number | null;
  tsc_trust_categories_present?: number | null;
  management_assertion_signed?: boolean | number | null;
  auditor_opinion_attached?: boolean | number | null;
  bridge_letter_attached?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  // Prefer granular flags when supplied; otherwise fall back to aggregate
  // counts. Counts are clamped to component cardinality (5 each).
  const hasGranularCoso =
    args.coso_control_environment !== undefined ||
    args.coso_risk_assessment !== undefined ||
    args.coso_control_activities !== undefined ||
    args.coso_information_communication !== undefined ||
    args.coso_monitoring_activities !== undefined;
  if (hasGranularCoso) {
    score += t(args.coso_control_environment)       * 10;
    score += t(args.coso_risk_assessment)           * 10;
    score += t(args.coso_control_activities)        * 10;
    score += t(args.coso_information_communication) * 10;
    score += t(args.coso_monitoring_activities)     * 10;
  } else {
    const c = Math.max(0, Math.min(5, Number(args.coso_components_present || 0)));
    score += c * 10;
  }
  const hasGranularTsc =
    args.tsc_security !== undefined ||
    args.tsc_availability !== undefined ||
    args.tsc_processing_integrity !== undefined ||
    args.tsc_confidentiality !== undefined ||
    args.tsc_privacy !== undefined;
  if (hasGranularTsc) {
    score += t(args.tsc_security)                   * 10;
    score += t(args.tsc_availability)               * 8;
    score += t(args.tsc_processing_integrity)       * 8;
    score += t(args.tsc_confidentiality)            * 8;
    score += t(args.tsc_privacy)                    * 8;
  } else {
    // Aggregate: weighted-average ~8.4 per category, rounded.
    const c = Math.max(0, Math.min(5, Number(args.tsc_trust_categories_present || 0)));
    // First category = security (10), the rest = 8 each → matches granular sum.
    if (c > 0) score += 10 + (Math.min(c, 5) - 1) * 8;
  }
  score += t(args.management_assertion_signed)    * 10;
  score += t(args.auditor_opinion_attached)       * 12;
  score += t(args.bridge_letter_attached)         * 6;
  if (score > 130) score = 130;
  return score;
}

// ─── Integrity index 0-130 ──────────────────────────────────────────────
//
// Composite: 6 bridge reconciliations + QA pass + counterparty
// sign-off + lodgement ACK. Each successful bridge worth 15; QA pass
// 15; ACK 25.
export function integrityIndex(args: {
  bridge_w113_evm?: boolean | number | null;
  bridge_w114_doc?: boolean | number | null;
  bridge_w115_sub?: boolean | number | null;
  bridge_w116_rfi?: boolean | number | null;
  bridge_w117_co?: boolean | number | null;
  bridge_w118_audit?: boolean | number | null;
  internal_qa_passed?: boolean | number | null;
  counterparty_signoff_obtained?: boolean | number | null;
  regulator_ack_received?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.bridge_w113_evm)               * 10;
  score += t(args.bridge_w114_doc)               * 10;
  score += t(args.bridge_w115_sub)               * 10;
  score += t(args.bridge_w116_rfi)               * 10;
  score += t(args.bridge_w117_co)                * 10;
  score += t(args.bridge_w118_audit)             * 15;
  score += t(args.internal_qa_passed)            * 15;
  score += t(args.counterparty_signoff_obtained) * 25;
  score += t(args.regulator_ack_received)        * 25;
  if (score > 130) score = 130;
  return score;
}

// ─── mTLS fingerprint validator ─────────────────────────────────────────
//
// External regulator-filer endpoint
// (POST /api/regulator-exports/lodge/:target) is mTLS-gated. The header
// `x-mtls-cert-fingerprint` carries a SHA-256 fingerprint set by the
// Cloudflare edge after mutual-TLS handshake. We validate format here.
export function isValidMtlsFingerprint(fp: string | null | undefined): boolean {
  if (!fp || typeof fp !== 'string') return false;
  const cleaned = fp.replace(/[:\s-]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(cleaned);
}

// Regulator targets supported by the lodgement endpoint.
export const REGULATOR_TARGETS = [
  'nersa',
  'ippo',
  'sarb',
  'dmre',
  'fsca',
  'dffe',
  'dti',
  'jse_srl',
  'sars',
  'cipc',
] as const;

export type RegulatorTarget = typeof REGULATOR_TARGETS[number];

export function isKnownRegulatorTarget(s: string | null | undefined): s is RegulatorTarget {
  if (!s) return false;
  return (REGULATOR_TARGETS as readonly string[]).includes(s);
}

// Pack health band - composite from completeness + integrity + xbrl +
// SLA.
export type RepHealthBand = 'green' | 'amber' | 'red' | 'critical';

export function packHealthBand(
  status: RepStatus,
  integrity: number,
  completeness: number,
  xbrlConformance: number,
  slaBreached: boolean,
  rejected: boolean,
  withdrawn: boolean,
  suspended: boolean,
): RepHealthBand {
  if (rejected) return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (withdrawn) return 'amber';
  if (suspended) return 'amber';
  if (xbrlConformance < 60 && (status === 'xbrl_assembled' || status === 'narratives_attached' || status === 'internal_qa')) return 'red';
  if (integrity < 60) return 'red';
  if (integrity < 100) return 'amber';
  if (completeness < 30) return 'amber';
  if (completeness < 80) return 'amber';
  return 'green';
}
