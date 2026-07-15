// stage_gate — IPP project DG0-DG4 stage-gate governance lifecycle as data.
//
// PMBOK 7 / Primavera P6 / Equator Principles style project gate chain: one
// txn per gate (DG0 Concept -> DG1 Feasibility -> DG2 FEED/FID-prep ->
// DG3 Sanction (FID) -> DG4 COD/Operations). The forward spine walks
// evidence -> IE review -> lender review -> board briefing -> CAB ->
// conditions -> decision -> conditions satisfied -> pass -> notify
// downstream -> archive. Any non-terminal state can defer, withdraw or
// reject; a passed/conditions-satisfied gate can loop through a soft
// "conditional pass" pause (satisfy_conditions re-admits it to the forward
// chain, mirroring the legacy gate_conditional_pass -> conditions_satisfied
// re-entry).
//
// Structural honesty (no invented guards):
//  - archive is the ONLY edge into the clean-close terminal, and it can only
//    fire from notified_downstream — the full review chain (IE, lender,
//    board, CAB, conditions, decision) is walked before a gate can archive,
//    the state graph enforces it, no guard needed.
//  - compile_evidence is guarded by completenessEvidencePresent: the IE/
//    lender/board review chain that follows cannot start on an uncited
//    evidence pack (Pattern A: present-but-not-required at the input layer,
//    the guard is the single source of the rejection).
//  - reject_gate / withdraw_gate / defer_gate fire from ANY non-terminal
//    state (legacy ALL_NON_TERMINAL), matching the real governance need to
//    kill or pause a project at any point in its review — none of the 10
//    registry guards model "every capex tier, unconditionally" (the legacy
//    SIGNATURE: reject_gate is reportable to NERSA/DMRE at every tier), so
//    that crossing is left to the cascade layer, not fabricated here as a
//    guard.
//
// settles:false — a stage-gate decision is a governance/reporting record; it
// gates capital release on other chains (drawdown, procurement) but never
// itself moves money (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const GATE_LABELS: Record<number, string> = {
  0: 'DG0 Concept',
  1: 'DG1 Feasibility',
  2: 'DG2 FEED/FID-prep',
  3: 'DG3 Sanction (FID)',
  4: 'DG4 COD/Operations',
};

// pure capex/E&S tier bucketing — Equator Cat A is a floor that overrides
// capex band (legacy tierForScope). No clock, no env.
const tierForCapex = (capex: Json | undefined, equatorCat: Json | undefined): string => {
  if (equatorCat === 'cat_a') return 'equator_cat_a';
  const c = typeof capex === 'number' ? capex : 0;
  if (c >= 2_000_000_000) return 'mega_capex';
  if (c >= 500_000_000) return 'high_capex';
  if (c >= 100_000_000) return 'medium_capex';
  return 'low_capex';
};

// every non-terminal state — defer/withdraw/reject can fire from any of them.
const ALL_NON_TERMINAL = [
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

export const stageGate: ChainDecl = {
  key: 'stage_gate',
  noun: 'Project stage gate',
  refPrefix: 'SG',
  title: (f) => {
    const idx = typeof f.gate_index === 'number' ? f.gate_index : -1;
    const label = GATE_LABELS[idx] ?? `Gate ${idx}`;
    return `${label} — ${(f.gate_title as string) ?? (f.project_id as string) ?? 'unnamed project'}`;
  },
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's14 licence — DG4 COD/Operations gate crossing', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'IPP Programme Office bid commitment — DG3 Sanction (FID) gate', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator', 'operator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (notified crossings)' },
    gate_index: { type: 'number', required: true, min: 0, max: 4, label: 'Gate index (DG0-DG4)' },
    project_id: { type: 'string', required: true, label: 'Project' },
    gate_title: { type: 'string', label: 'Title' },
    capex_zar: { type: 'number', min: 0, label: 'Capex (ZAR)' },
    equator_category: { type: 'string', label: 'Equator category (cat_a/cat_b/cat_c)' },
    debt_sized: { type: 'boolean', label: 'Debt sized' },
    fid_committed: { type: 'boolean', label: 'FID committed (floor flag)' },
    nersa_notifiable: { type: 'boolean', label: 'NERSA notifiable (floor flag)' },
    shareholder_consent_required: { type: 'boolean', label: 'Shareholder consent required (floor flag)' },
    completeness_ref: { type: 'string', label: 'Evidence completeness ref' },
    decision: { type: 'string', label: 'Gate decision' },
    conditions_ref: { type: 'string', label: 'Conditions ref' },
    evidence_ref: { type: 'string', label: 'Evidence / basis ref' },
    // written by derive, never by the client
    tier: { type: 'string', label: 'Capex/E&S tier' },
    proposed_at: { type: 'string', label: 'Proposed at' },
    decision_recorded_at: { type: 'string', label: 'Decision recorded at' },
    gate_passed_at: { type: 'string', label: 'Gate passed at' },
    archived_at: { type: 'string', label: 'Archived at' },
    deferred_at: { type: 'string', label: 'Deferred at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
  },

  initial: 'gate_proposed',

  states: {
    gate_proposed: { label: 'Gate proposed', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    evidence_compiled: { label: 'Evidence compiled', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    ie_reviewed: { label: 'IE reviewed', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    lender_reviewed: { label: 'Lender reviewed', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    board_briefing_circulated: { label: 'Board briefing circulated', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    cab_held: { label: 'CAB held', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    conditions_set: { label: 'Conditions set', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    decision_recorded: { label: 'Decision recorded', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    conditions_satisfied: { label: 'Conditions satisfied', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
    gate_passed: { label: 'Gate passed', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    notified_downstream: { label: 'Notified downstream', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    archived: { label: 'Archived', terminal: true, holder: 'none' },
    gate_deferred: { label: 'Gate deferred', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    gate_withdrawn: { label: 'Gate withdrawn', terminal: true, holder: 'none' },
    gate_rejected: { label: 'Gate rejected', terminal: true, holder: 'none' },
    gate_conditional_pass: { label: 'Conditional pass', terminal: false, holder: 'ipp_developer', sla: { days: 7 } },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'gate_proposed',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Propose stage gate',
      intent: 'primary',
      input: {
        gate_index: { type: 'number', required: true, min: 0, max: 4 },
        project_id: { type: 'string', required: true },
        gate_title: { type: 'string' },
        capex_zar: { type: 'number', min: 0 },
        equator_category: { type: 'string' },
        debt_sized: { type: 'boolean' },
        fid_committed: { type: 'boolean' },
        nersa_notifiable: { type: 'boolean' },
        shareholder_consent_required: { type: 'boolean' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, at: Instant) => ({
        proposed_at: isoUtc(at),
        tier: tierForCapex(f.capex_zar, f.equator_category),
      }),
    },
    {
      // evidence pack gate: cannot start the IE/lender/board review chain on
      // an uncited evidence pack. Also re-entered from gate_deferred once a
      // paused gate is rescheduled.
      id: 'compile_evidence',
      from: ['gate_proposed', 'evidence_compiled', 'gate_deferred'],
      to: 'evidence_compiled',
      by: ['ipp_developer', 'operator'],
      label: 'Compile evidence',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
    },
    {
      id: 'ie_review',
      from: ['evidence_compiled', 'ie_reviewed'],
      to: 'ie_reviewed',
      by: ['ipp_developer', 'operator'],
      label: 'Complete IE review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'lender_review',
      from: ['ie_reviewed', 'lender_reviewed'],
      to: 'lender_reviewed',
      by: ['ipp_developer', 'operator'],
      label: 'Complete lender review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'circulate_board_briefing',
      from: ['lender_reviewed', 'board_briefing_circulated'],
      to: 'board_briefing_circulated',
      by: ['ipp_developer', 'operator'],
      label: 'Circulate board briefing',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'hold_cab',
      from: ['board_briefing_circulated', 'cab_held'],
      to: 'cab_held',
      by: ['ipp_developer', 'operator'],
      label: 'Hold CAB',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'set_conditions',
      from: ['cab_held', 'conditions_set'],
      to: 'conditions_set',
      by: ['ipp_developer', 'operator'],
      label: 'Set conditions',
      intent: 'primary',
      input: { conditions_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'record_decision',
      from: ['conditions_set', 'decision_recorded'],
      to: 'decision_recorded',
      by: ['ipp_developer', 'operator'],
      label: 'Record gate decision',
      intent: 'primary',
      input: {
        decision: { type: 'string', required: true },
        conditions_ref: { type: 'string' },
        evidence_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ decision_recorded_at: isoUtc(at) }),
    },
    {
      // gate_conditional_pass is the soft-pause loop-back into here — a
      // conditionally-passed gate re-enters the forward chain by satisfying
      // its outstanding conditions.
      id: 'satisfy_conditions',
      from: ['decision_recorded', 'conditions_satisfied', 'gate_conditional_pass'],
      to: 'conditions_satisfied',
      by: ['ipp_developer', 'operator'],
      label: 'Satisfy conditions',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'pass_gate',
      from: ['conditions_satisfied', 'gate_passed'],
      to: 'gate_passed',
      by: ['ipp_developer', 'operator'],
      label: 'Pass gate',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ gate_passed_at: isoUtc(at) }),
    },
    {
      id: 'notify_downstream',
      from: ['gate_passed', 'notified_downstream'],
      to: 'notified_downstream',
      by: ['ipp_developer', 'operator'],
      label: 'Notify downstream systems',
      intent: 'primary',
      guards: [],
    },
    {
      // structural clean-close: the ONLY edge into archived, reachable ONLY
      // from notified_downstream — a gate cannot archive before the full
      // review chain has walked and downstream systems were notified.
      id: 'archive',
      from: 'notified_downstream',
      to: 'archived',
      by: ['ipp_developer', 'operator'],
      label: 'Archive gate',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ archived_at: isoUtc(at) }),
    },

    // --- pause / exits, reachable from any non-terminal state ------------------
    {
      id: 'defer_gate',
      from: ALL_NON_TERMINAL,
      to: 'gate_deferred',
      by: ['ipp_developer', 'operator'],
      label: 'Defer gate',
      intent: 'secondary',
      requiresReason: ['funding_not_ready', 'ie_findings_pending', 'lender_consent_pending', 'scope_under_review', 'scheduling_conflict'],
      input: { evidence_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ deferred_at: isoUtc(at) }),
    },
    {
      id: 'withdraw_gate',
      from: ALL_NON_TERMINAL,
      to: 'gate_withdrawn',
      by: ['ipp_developer', 'operator'],
      label: 'Withdraw gate',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'sponsor_decision', 'superseded_by_restructure', 'no_longer_pursuing'],
      input: { evidence_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
    {
      // legacy SIGNATURE: reportable to NERSA/DMRE at every capex tier — that
      // universal crossing is a cascade concern (fireCascade), not a domain
      // guard; none of the 10 registry guards model an unconditional crossing.
      id: 'reject_gate',
      from: ALL_NON_TERMINAL,
      to: 'gate_rejected',
      by: ['ipp_developer', 'operator'],
      label: 'Reject gate',
      intent: 'destructive',
      requiresReason: ['geotechnical_risk', 'ie_findings_unmitigated', 'financial_infeasibility', 'environmental_risk', 'regulatory_objection', 'commercial_terms_failed'],
      input: { evidence_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'conditional_pass',
      from: ['conditions_satisfied', 'gate_passed', 'gate_conditional_pass'],
      to: 'gate_conditional_pass',
      by: ['ipp_developer', 'operator'],
      label: 'Record conditional pass',
      intent: 'secondary',
      guards: [],
    },
  ],
};
