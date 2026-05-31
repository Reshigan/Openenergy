// ─────────────────────────────────────────────────────────────────────────
// Wave 131 - Project Stage Gates (DG0-DG4) governance chain.
//
// PHASE E WAVE 1 OF N - First IPP-PM profile-completeness wave under
// the "best-in-class projects system" directive (2026-05-31).
//
// Canonical PMBOK 7 / Primavera P6 / Equator Principles project
// governance gate chain. 5 gates per project: DG0 Concept -> DG1
// Feasibility -> DG2 FEED/FID-prep -> DG3 Sanction (FID) ->
// DG4 COD/Operations entry.
//
// Standards:
//   - Equator Principles IV (IFC Performance Standards)
//   - PMBOK 7 / PMI governance gate frameworks
//   - NERSA ERA 4/2006 Section 14 licence (DG4 COD crossing)
//   - REIPPPP IPP Programme Office (DG3 bid commitment)
//   - DMRE REIPPPP bid death reporting requirements
//   - SA Companies Act (NED ratification for mega + equator_cat_a)
//
// Beats: world-class IPP project governance platforms (Primavera P6
// Enterprise / Oracle Unifier / Bentley SYNCHRO / Procore / Autodesk
// Construction Cloud / InEight / e-Builder / Kahua / ProjectWise
// stage-gate modules). Full audit-trail-grade decision record for
// lender IE, IPPO and NERSA Section 14 review.
//
// 12-state forward path + 4 branch states (= 16 chain states):
//   gate_proposed -> evidence_compiled -> ie_reviewed ->
//     lender_reviewed -> board_briefing_circulated -> cab_held ->
//     conditions_set -> decision_recorded -> conditions_satisfied ->
//     gate_passed -> notified_downstream -> archived (HARD)
//   any non-terminal -> defer_gate -> gate_deferred (SOFT, loops to
//     evidence_compiled once rescheduled)
//   any non-terminal -> withdraw_gate -> gate_withdrawn (SOFT)
//   any non-terminal -> reject_gate -> gate_rejected (HARD - W131 SIG)
//   conditions_satisfied/gate_passed -> conditional_pass ->
//     gate_conditional_pass (SOFT, loops to conditions_satisfied)
//
// INVERTED SLA polarity at gate_proposed:
//   low_capex 168h -> medium_capex 336h -> high_capex 720h ->
//   mega_capex 1440h -> equator_cat_a 2160h
//   (Larger / more E&S-sensitive gates get MORE diligence time)
//
// SIGNATURE W131 regulator crossings:
//   reject_gate -> EVERY tier (W131 SIGNATURE - project termination
//     universally reportable to NERSA + DMRE; REIPPPP bid death IS
//     the reportable event; sister of W127 ML rollback hard line)
//   record_decision for gate_index=4 (DG4 COD) -> EVERY tier
//     (NERSA Section 14 licence crossing)
//   record_decision for gate_index=0 or gate_index=3 ->
//     medium_capex + high_capex + mega_capex + equator_cat_a
//   defer_gate -> mega_capex + equator_cat_a only (lender consent)
//   sla_breach -> high_capex + mega_capex + equator_cat_a only
//
// 4-step authority: project_manager -> ie_assessor -> cfo -> board_chair
//   (fresh terminology distinct from W127 ml_engineer / W112 pm)
//
// Write {admin, ipp_developer}. READ all 9 personas.
// AUDIT_PREFIX_MAP: stage_gate -> 'ipp' (JOINS existing IPP-PM family).
// ─────────────────────────────────────────────────────────────────────────

export type SgStatus =
  | 'gate_proposed'
  | 'evidence_compiled'
  | 'ie_reviewed'
  | 'lender_reviewed'
  | 'board_briefing_circulated'
  | 'cab_held'
  | 'conditions_set'
  | 'decision_recorded'
  | 'conditions_satisfied'
  | 'gate_passed'
  | 'notified_downstream'
  | 'archived'
  | 'gate_deferred'
  | 'gate_withdrawn'
  | 'gate_rejected'
  | 'gate_conditional_pass';

export type SgAction =
  | 'propose_gate'
  | 'compile_evidence'
  | 'ie_review'
  | 'lender_review'
  | 'circulate_board_briefing'
  | 'hold_cab'
  | 'set_conditions'
  | 'record_decision'
  | 'satisfy_conditions'
  | 'pass_gate'
  | 'notify_downstream'
  | 'archive'
  | 'defer_gate'
  | 'withdraw_gate'
  | 'reject_gate'
  | 'conditional_pass'
  | 'sla_breach';

export type SgTier =
  | 'low_capex'
  | 'medium_capex'
  | 'high_capex'
  | 'mega_capex'
  | 'equator_cat_a';

export type SgParty =
  | 'project_manager'
  | 'ie_assessor'
  | 'cfo'
  | 'board_chair';

export type SgEvent =
  | 'stage_gate.proposed'
  | 'stage_gate.evidence_compiled'
  | 'stage_gate.ie_reviewed'
  | 'stage_gate.lender_reviewed'
  | 'stage_gate.board_briefing_circulated'
  | 'stage_gate.cab_held'
  | 'stage_gate.conditions_set'
  | 'stage_gate.decision_recorded'
  | 'stage_gate.conditions_satisfied'
  | 'stage_gate.gate_passed'
  | 'stage_gate.notified_downstream'
  | 'stage_gate.archived'
  | 'stage_gate.gate_deferred'
  | 'stage_gate.gate_withdrawn'
  | 'stage_gate.gate_rejected'
  | 'stage_gate.conditional_pass'
  | 'stage_gate.sla_breached';

// HARD terminals: archived (clean close), gate_rejected (project death),
// gate_withdrawn (sponsor pull). gate_deferred and gate_conditional_pass
// are SOFT pauses that re-enter the forward chain.
const HARD_TERMINALS = new Set<SgStatus>([
  'archived',
  'gate_rejected',
  'gate_withdrawn',
]);

export function isTerminal(s: SgStatus): boolean {
  return HARD_TERMINALS.has(s);
}

export function isHardTerminal(s: SgStatus): boolean {
  return HARD_TERMINALS.has(s);
}

const ALL_NON_TERMINAL: SgStatus[] = [
  'gate_proposed',
  'evidence_compiled',
  'ie_reviewed',
  'lender_reviewed',
  'board_briefing_circulated',
  'cab_held',
  'conditions_set',
  'decision_recorded',
  'conditions_satisfied',
  'gate_passed',
  'notified_downstream',
  'gate_deferred',
  'gate_conditional_pass',
];

// conditional_pass applies from conditions_satisfied or gate_passed.
const CONDITIONAL_PASS_FROM: SgStatus[] = [
  'conditions_satisfied',
  'gate_passed',
  'gate_conditional_pass',
];

export const TRANSITIONS: Record<SgAction, { from: SgStatus[]; to: SgStatus }> = {
  propose_gate:              { from: ['gate_proposed'],                                                         to: 'gate_proposed' },
  compile_evidence:          { from: ['gate_proposed', 'evidence_compiled', 'gate_deferred'],                   to: 'evidence_compiled' },
  ie_review:                 { from: ['evidence_compiled', 'ie_reviewed'],                                      to: 'ie_reviewed' },
  lender_review:             { from: ['ie_reviewed', 'lender_reviewed'],                                        to: 'lender_reviewed' },
  circulate_board_briefing:  { from: ['lender_reviewed', 'board_briefing_circulated'],                          to: 'board_briefing_circulated' },
  hold_cab:                  { from: ['board_briefing_circulated', 'cab_held'],                                  to: 'cab_held' },
  set_conditions:            { from: ['cab_held', 'conditions_set'],                                             to: 'conditions_set' },
  record_decision:           { from: ['conditions_set', 'decision_recorded'],                                    to: 'decision_recorded' },
  satisfy_conditions:        { from: ['decision_recorded', 'conditions_satisfied', 'gate_conditional_pass'],    to: 'conditions_satisfied' },
  pass_gate:                 { from: ['conditions_satisfied', 'gate_passed'],                                    to: 'gate_passed' },
  notify_downstream:         { from: ['gate_passed', 'notified_downstream'],                                     to: 'notified_downstream' },
  archive:                   { from: ['notified_downstream'],                                                     to: 'archived' },
  defer_gate:                { from: ALL_NON_TERMINAL,                                                           to: 'gate_deferred' },
  withdraw_gate:             { from: ALL_NON_TERMINAL,                                                           to: 'gate_withdrawn' },
  reject_gate:               { from: ALL_NON_TERMINAL,                                                           to: 'gate_rejected' },
  conditional_pass:          { from: CONDITIONAL_PASS_FROM,                                                      to: 'gate_conditional_pass' },
  sla_breach:                { from: ALL_NON_TERMINAL,                                                           to: 'gate_proposed' }, // cron-only, status unchanged
};

export function nextStatus(current: SgStatus, action: SgAction): SgStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'propose_gate' && current !== 'gate_proposed') return null;
  // sla_breach is cron-only; does not change chain_status
  if (action === 'sla_breach') return current;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: SgStatus): SgAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: SgAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [SgAction, typeof TRANSITIONS[SgAction]][]) {
    if (a === 'propose_gate') continue; // create-only
    if (a === 'sla_breach') continue;   // cron-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// ─── Tier derivation ──────────────────────────────────────────────────────
//
// tierForScope(capex_zar, equator_category, debt_sized):
//   equator_cat_a  - Equator Cat A regardless of capex (FLOOR - highest E&S)
//   low_capex      - < R100M AND Equator C
//   medium_capex   - R100M <= capex < R500M, Equator B
//   high_capex     - R500M <= capex < R2bn, Equator B
//   mega_capex     - capex >= R2bn, Equator B (REIPPPP utility scale)
export function tierForScope(args: {
  capex_zar?: number | null;
  equator_category?: string | null;
  debt_sized?: boolean | number | null;
}): SgTier {
  const capex = Number(args.capex_zar || 0);
  const cat = (args.equator_category || '').toLowerCase();

  // Equator Cat A is a floor - overrides capex band
  if (cat === 'cat_a') return 'equator_cat_a';

  if (capex >= 2_000_000_000) return 'mega_capex';
  if (capex >= 500_000_000)   return 'high_capex';
  if (capex >= 100_000_000)   return 'medium_capex';
  return 'low_capex';
}

// ─── Floor flags ──────────────────────────────────────────────────────────
export interface SgFloorFlags {
  floor_equator_cat_a?: boolean | number | null;
  floor_fid_committed?: boolean | number | null;
  floor_nersa_notifiable?: boolean | number | null;
  floor_debt_sized?: boolean | number | null;
  floor_shareholder_consent_required?: boolean | number | null;
}

export function countFloorFlags(args: SgFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.floor_equator_cat_a) +
    t(args.floor_fid_committed) +
    t(args.floor_nersa_notifiable) +
    t(args.floor_debt_sized) +
    t(args.floor_shareholder_consent_required)
  );
}

// FLOOR-AT-HIGH >=1 flag.
export function floorAtHigh(args: SgFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

// FLOOR-AT-MEGA >=3 flags.
export function floorAtMega(args: SgFloorFlags): boolean {
  return countFloorFlags(args) >= 3;
}

const TIER_RANK: Record<SgTier, number> = {
  low_capex: 0,
  medium_capex: 1,
  high_capex: 2,
  mega_capex: 3,
  equator_cat_a: 4,
};

export function effectiveTier(rawTier: SgTier, flags: SgFloorFlags): SgTier {
  const flagCount = countFloorFlags(flags);
  if (flagCount >= 3) {
    // FLOOR-AT-MEGA
    if (TIER_RANK[rawTier] >= TIER_RANK['mega_capex']) return rawTier;
    return 'mega_capex';
  }
  if (flagCount >= 1) {
    // FLOOR-AT-HIGH
    if (TIER_RANK[rawTier] >= TIER_RANK['high_capex']) return rawTier;
    return 'high_capex';
  }
  return rawTier;
}

// ─── INVERTED SLA at gate_proposed ────────────────────────────────────────
//
// INVERTED polarity: larger / more E&S-sensitive gates get MORE time.
// Only the gate_proposed state has a meaningful SLA (the initial review
// window). Subsequent states have shorter internal deadlines to keep
// the overall gate moving.
export const SLA_HOURS: Record<SgStatus, Record<SgTier, number>> = {
  gate_proposed:                { low_capex: 168,  medium_capex: 336,  high_capex: 720,  mega_capex: 1440, equator_cat_a: 2160 },
  evidence_compiled:            { low_capex: 120,  medium_capex: 240,  high_capex: 480,  mega_capex: 720,  equator_cat_a: 960 },
  ie_reviewed:                  { low_capex: 48,   medium_capex: 96,   high_capex: 192,  mega_capex: 336,  equator_cat_a: 480 },
  lender_reviewed:              { low_capex: 48,   medium_capex: 96,   high_capex: 192,  mega_capex: 336,  equator_cat_a: 480 },
  board_briefing_circulated:    { low_capex: 48,   medium_capex: 96,   high_capex: 168,  mega_capex: 240,  equator_cat_a: 336 },
  cab_held:                     { low_capex: 48,   medium_capex: 96,   high_capex: 168,  mega_capex: 240,  equator_cat_a: 336 },
  conditions_set:               { low_capex: 48,   medium_capex: 96,   high_capex: 168,  mega_capex: 240,  equator_cat_a: 336 },
  decision_recorded:            { low_capex: 72,   medium_capex: 168,  high_capex: 336,  mega_capex: 504,  equator_cat_a: 720 },
  conditions_satisfied:         { low_capex: 168,  medium_capex: 336,  high_capex: 720,  mega_capex: 1440, equator_cat_a: 2160 },
  gate_passed:                  { low_capex: 48,   medium_capex: 96,   high_capex: 168,  mega_capex: 240,  equator_cat_a: 336 },
  notified_downstream:          { low_capex: 48,   medium_capex: 96,   high_capex: 168,  mega_capex: 240,  equator_cat_a: 336 },
  gate_deferred:                { low_capex: 336,  medium_capex: 672,  high_capex: 1440, mega_capex: 2880, equator_cat_a: 4320 },
  gate_conditional_pass:        { low_capex: 168,  medium_capex: 336,  high_capex: 720,  mega_capex: 1440, equator_cat_a: 2160 },
  // terminals have no SLA
  archived:                     { low_capex: 0, medium_capex: 0, high_capex: 0, mega_capex: 0, equator_cat_a: 0 },
  gate_rejected:                { low_capex: 0, medium_capex: 0, high_capex: 0, mega_capex: 0, equator_cat_a: 0 },
  gate_withdrawn:               { low_capex: 0, medium_capex: 0, high_capex: 0, mega_capex: 0, equator_cat_a: 0 },
};

export function slaWindowHours(status: SgStatus, tier: SgTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: SgStatus, tier: SgTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

export function slaHoursRemaining(
  status: SgStatus,
  tier: SgTier,
  enteredAt: Date,
  now: Date,
): number | null {
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return null;
  return Math.max(0, (deadline.getTime() - now.getTime()) / 3600000);
}

// ─── SIGNATURE regulator crossings ─────────────────────────────────────
//
// W131 SIGNATURE: reject_gate crosses regulator EVERY tier.
// Project termination is universally reportable to NERSA + DMRE.
// REIPPPP bid death IS the reportable event. Sister of W127 ML rollback.
//
// Additional:
//   record_decision + gate_index=4 (DG4 COD) -> EVERY tier
//     (NERSA Section 14 licence crossing)
//   record_decision + gate_index=0 or gate_index=3 ->
//     medium_capex + high_capex + mega_capex + equator_cat_a
//   defer_gate -> mega_capex + equator_cat_a only (lender consent)
//   sla_breach -> high_capex + mega_capex + equator_cat_a only
export function crossesIntoRegulator(
  action: SgAction,
  tier: SgTier,
  args: {
    gate_index?: number | null;
  },
): boolean {
  // W131 SIGNATURE: reject_gate EVERY tier.
  if (action === 'reject_gate') return true;

  // record_decision for DG4 COD -> EVERY tier (NERSA s14 licence crossing).
  if (action === 'record_decision' && args.gate_index === 4) return true;

  // record_decision for DG0 concept or DG3 sanction -> medium+ tiers.
  if (action === 'record_decision' && (args.gate_index === 0 || args.gate_index === 3)) {
    return (
      tier === 'medium_capex' ||
      tier === 'high_capex' ||
      tier === 'mega_capex' ||
      tier === 'equator_cat_a'
    );
  }

  // defer_gate -> mega_capex + equator_cat_a only (lender consent required).
  if (action === 'defer_gate') {
    return tier === 'mega_capex' || tier === 'equator_cat_a';
  }

  return false;
}

export function slaBreachCrossesIntoRegulator(tier: SgTier): boolean {
  return tier === 'high_capex' || tier === 'mega_capex' || tier === 'equator_cat_a';
}

export function isReportable(
  action: SgAction,
  tier: SgTier,
  args: { gate_index?: number | null },
): boolean {
  if (action === 'sla_breach') return slaBreachCrossesIntoRegulator(tier);
  return crossesIntoRegulator(action, tier, args);
}

// ─── Authority + party ───────────────────────────────────────────────────
//
// 4-step authority ladder: project_manager -> ie_assessor -> cfo -> board_chair
export function partyForAction(action: SgAction): SgParty {
  switch (action) {
    case 'propose_gate':
    case 'compile_evidence':
    case 'defer_gate':
    case 'withdraw_gate':
      return 'project_manager';
    case 'ie_review':
      return 'ie_assessor';
    case 'lender_review':
    case 'circulate_board_briefing':
    case 'hold_cab':
    case 'set_conditions':
    case 'satisfy_conditions':
    case 'conditional_pass':
      return 'cfo';
    case 'record_decision':
    case 'pass_gate':
    case 'notify_downstream':
    case 'archive':
    case 'reject_gate':
      return 'board_chair';
    case 'sla_breach':
      return 'project_manager';
    default:
      return 'project_manager';
  }
}

// ─── Event type mapping ──────────────────────────────────────────────────
export function eventTypeFor(action: SgAction): SgEvent {
  const map: Record<SgAction, SgEvent> = {
    propose_gate:             'stage_gate.proposed',
    compile_evidence:         'stage_gate.evidence_compiled',
    ie_review:                'stage_gate.ie_reviewed',
    lender_review:            'stage_gate.lender_reviewed',
    circulate_board_briefing: 'stage_gate.board_briefing_circulated',
    hold_cab:                 'stage_gate.cab_held',
    set_conditions:           'stage_gate.conditions_set',
    record_decision:          'stage_gate.decision_recorded',
    satisfy_conditions:       'stage_gate.conditions_satisfied',
    pass_gate:                'stage_gate.gate_passed',
    notify_downstream:        'stage_gate.notified_downstream',
    archive:                  'stage_gate.archived',
    defer_gate:               'stage_gate.gate_deferred',
    withdraw_gate:            'stage_gate.gate_withdrawn',
    reject_gate:              'stage_gate.gate_rejected',
    conditional_pass:         'stage_gate.conditional_pass',
    sla_breach:               'stage_gate.sla_breached',
  };
  return map[action];
}

// ─── Helpers ──────────────────────────────────────────────────────────────
export function urgencyBand(tier: SgTier, _sla_target_hours?: number): string {
  if (tier === 'equator_cat_a' || tier === 'mega_capex') return 'strategic';
  if (tier === 'high_capex')   return 'high';
  if (tier === 'medium_capex') return 'medium';
  return 'standard';
}

export function authorityRequired(gate_index: number, tier: SgTier): string {
  if (gate_index === 3 || tier === 'mega_capex' || tier === 'equator_cat_a') {
    return 'board_chair';
  }
  if (gate_index >= 2 || tier === 'high_capex') return 'cfo';
  if (gate_index >= 1) return 'ie_assessor';
  return 'project_manager';
}

export function bridgesToW19(w19_procurement_ref: string | null | undefined): boolean {
  return !!w19_procurement_ref;
}
export function bridgesToW20(w20_cod_ref: string | null | undefined): boolean {
  return !!w20_cod_ref;
}
export function bridgesToW21(w21_drawdown_ref: string | null | undefined): boolean {
  return !!w21_drawdown_ref;
}
export function bridgesToW113(w113_evm_ref: string | null | undefined): boolean {
  return !!w113_evm_ref;
}
export function bridgesToW118(w118_block_ref: string | null | undefined): boolean {
  return !!w118_block_ref;
}

export function conditionsAgingDays(
  conditions_set_at: string | null | undefined,
  now: Date,
): number | null {
  if (!conditions_set_at) return null;
  const set_at = new Date(conditions_set_at);
  return Math.floor((now.getTime() - set_at.getTime()) / (1000 * 60 * 60 * 24));
}

export function timeInStateHours(state_entered_at: string | null | undefined, now: Date): number | null {
  if (!state_entered_at) return null;
  return (now.getTime() - new Date(state_entered_at).getTime()) / 3600000;
}

// Gate name mapping for display
export const GATE_NAMES: Record<number, string> = {
  0: 'DG0 Concept',
  1: 'DG1 Feasibility',
  2: 'DG2 FEED/FID-prep',
  3: 'DG3 Sanction (FID)',
  4: 'DG4 COD/Operations',
};
