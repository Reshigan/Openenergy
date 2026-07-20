// security_perfection — lender collateral-perfection lifecycle as data.
//
// A security agent identifies a security item (mortgage bond, notarial bond,
// share pledge, cession) granted by a borrower, drafts + executes the
// instrument, lodges it at the relevant registry (Deeds Office / CIPC /
// STRATE), gets it registered, reviews perfection, and confirms it perfected.
//
// The perfection spine is STRUCTURAL: confirm_perfection leaves ONLY
// perfection_review, and the only path into perfection_review is
// begin_perfection_review — which can only fire from `registered`. So a
// security can NEVER be declared perfected before it is actually registered at
// the registry — no guard needed, the state graph enforces it. A defective
// filing loops back to re-lodge (relodge_round++), it does not skip ahead.
//
// confirm_perfection is additionally guarded by completenessEvidencePresent: a
// perfection sign-off must carry a named legal-opinion completeness ref
// (completeness_ref) — an unsupported "perfected" is the double-count vector of
// collateral (a facility drawn against security that was never truly perfected).
//
// settles:false — perfection is a legal/registry control over collateral, never
// a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the secured value (ZAR). No clock, no env.
const severityTier = (value: Json | undefined): string => {
  if (typeof value !== 'number') return 'minor';
  if (value >= 500_000_000) return 'critical';
  if (value >= 100_000_000) return 'major';
  if (value >= 25_000_000) return 'material';
  if (value >= 5_000_000) return 'moderate';
  return 'minor';
};

export const securityPerfection: ChainDecl = {
  key: 'security_perfection',
  noun: 'Security perfection',
  refPrefix: 'SP',
  title: (f) =>
    `${(f.security_type as string) ?? 'security'} — ${(f.borrower_name as string) ?? 'unnamed borrower'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Deeds Registries Act 1937', provision: 's50 mortgage-bond registration', effect: 'requires' },
    { instrument: 'Security by Means of Movable Property Act 1993', provision: 'notarial bond registration', effect: 'requires' },
    { instrument: 'Financial Markets Act 2012', provision: 'STRATE uncertificated-securities pledge', effect: 'authorises' },
  ],
  roles: ['agent', 'grantor', 'regulator', 'operator'],

  fields: {
    case_number: { type: 'string', label: 'Case number' },
    agent_party: { type: 'party', role: 'agent', label: 'Security agent' },
    grantor_party: { type: 'party', role: 'grantor', label: 'Grantor / borrower' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (SARB ExCon)' },
    borrower_name: { type: 'string', required: true, label: 'Borrower' },
    facility_name: { type: 'string', label: 'Facility' },
    project_name: { type: 'string', label: 'Project' },
    security_type: { type: 'string', required: true, label: 'Security type (mortgage_bond/notarial_bond/share_pledge/cession)' },
    security_description: { type: 'string', label: 'Security description' },
    registry: { type: 'string', label: 'Registry (deeds_office/cipc/strate)' },
    secured_value_zar: { type: 'number', min: 0, label: 'Secured value (ZAR)' },
    ranking: { type: 'string', label: 'Ranking (first/second/subordinated/pari_passu)' },
    perfection_critical: { type: 'boolean', label: 'CP to first drawdown' },
    cross_border: { type: 'boolean', label: 'Cross-border (SARB ExCon)' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    document_ref: { type: 'string', label: 'Executed instrument ref' },
    lodgement_ref: { type: 'string', label: 'Lodgement ref' },
    registration_ref: { type: 'string', label: 'Registration ref' },
    completeness_ref: { type: 'string', label: 'Legal-opinion completeness ref' },
    perfection_ref: { type: 'string', label: 'Perfection ref' },
    release_ref: { type: 'string', label: 'Release ref' },
    relodge_round: { type: 'number', label: 'Re-lodge round' },
    // written by derive, never by the client
    executed_at_sp: { type: 'string', label: 'Executed at' },
    lodged_at_sp: { type: 'string', label: 'Lodged at' },
    registered_at_sp: { type: 'string', label: 'Registered at' },
    perfected_at_sp: { type: 'string', label: 'Perfected at' },
    released_at_sp: { type: 'string', label: 'Released at' },
  },

  initial: 'identified',

  states: {
    identified: { label: 'Identified', terminal: false, holder: 'agent', sla: { days: 5 } },
    documentation_pending: { label: 'Documentation pending', terminal: false, holder: 'agent', sla: { days: 10 } },
    executed: { label: 'Executed', terminal: false, holder: 'agent', sla: { days: 5 } },
    lodged_for_registration: { label: 'Lodged for registration', terminal: false, holder: 'agent', sla: { days: 30 } },
    registered: { label: 'Registered', terminal: false, holder: 'agent', sla: { days: 5 } },
    perfection_review: { label: 'Perfection review', terminal: false, holder: 'agent', sla: { days: 5 } },
    defective: { label: 'Defective', terminal: false, holder: 'agent', sla: { days: 10 } },
    perfection_overdue: { label: 'Perfection overdue', terminal: false, holder: 'agent' },
    perfected: { label: 'Perfected', terminal: true, holder: 'none' },
    released: { label: 'Released', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'identified',
      by: ['agent', 'operator'],
      actorBecomes: 'agent',
      label: 'Identify security',
      intent: 'primary',
      input: {
        borrower_name: { type: 'string', required: true },
        facility_name: { type: 'string' },
        project_name: { type: 'string' },
        security_type: { type: 'string', required: true },
        security_description: { type: 'string' },
        registry: { type: 'string' },
        secured_value_zar: { type: 'number', min: 0 },
        ranking: { type: 'string' },
        perfection_critical: { type: 'boolean' },
        cross_border: { type: 'boolean' },
        grantor_party: { type: 'party', role: 'grantor' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ severity_tier: severityTier(f.secured_value_zar) }),
    },
    {
      id: 'prepare_documentation',
      from: 'identified',
      to: 'documentation_pending',
      by: ['agent'],
      label: 'Prepare documentation',
      intent: 'primary',
      input: { security_description: { type: 'string' } },
      guards: [],
    },
    {
      id: 'execute_instrument',
      from: 'documentation_pending',
      to: 'executed',
      by: ['agent', 'grantor'],
      label: 'Execute instrument',
      intent: 'primary',
      input: { document_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ executed_at_sp: isoUtc(at) }),
    },
    {
      id: 'lodge_for_registration',
      from: ['executed', 'defective'],
      to: 'lodged_for_registration',
      by: ['agent'],
      label: 'Lodge for registration',
      intent: 'primary',
      input: { lodgement_ref: { type: 'string', required: true } },
      guards: [],
      // a re-lodge (from defective) bumps the round; first lodge starts at 0→1.
      derive: (f, at: Instant) => ({
        lodged_at_sp: isoUtc(at),
        relodge_round: (typeof f.relodge_round === 'number' ? f.relodge_round : 0) + 1,
      }),
    },
    {
      id: 'confirm_registration',
      from: 'lodged_for_registration',
      to: 'registered',
      by: ['agent'],
      label: 'Confirm registration',
      intent: 'primary',
      input: { registration_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ registered_at_sp: isoUtc(at) }),
    },
    {
      id: 'begin_perfection_review',
      from: 'registered',
      to: 'perfection_review',
      by: ['agent'],
      label: 'Begin perfection review',
      intent: 'primary',
      guards: [],
    },
    {
      // structural perfection gate: the ONLY edge into `perfected`, and it can
      // only fire from perfection_review — which only begin_perfection_review
      // reaches, and only from `registered`. A security therefore cannot be
      // perfected before it is registered. Evidence-guarded on top.
      id: 'confirm_perfection',
      from: 'perfection_review',
      to: 'perfected',
      by: ['agent'],
      label: 'Confirm perfection',
      intent: 'primary',
      // completeness_ref is NOT a required field — the guard is the enforcer, so a
      // missing legal opinion surfaces as MISSING_COMPLETENESS_EVIDENCE, not BAD_INPUT.
      input: {
        completeness_ref: { type: 'string' },
        perfection_ref: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ perfected_at_sp: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'mark_defective',
      from: ['lodged_for_registration', 'registered', 'perfection_review'],
      to: 'defective',
      by: ['agent'],
      label: 'Mark defective',
      intent: 'secondary',
      requiresReason: ['registry_rejection', 'missing_signature', 'ranking_conflict', 'incorrect_description', 'stamp_duty_unpaid'],
      guards: [],
    },
    {
      id: 'mark_overdue',
      from: ['lodged_for_registration', 'registered', 'perfection_review', 'defective'],
      to: 'perfection_overdue',
      by: ['agent', 'system'],
      label: 'Mark perfection overdue',
      intent: 'secondary',
      requiresReason: ['deadline_passed', 'registry_backlog', 'unresolved_defect'],
      guards: [],
    },
    {
      id: 'release_security',
      from: 'perfected',
      to: 'released',
      by: ['agent'],
      label: 'Release security',
      intent: 'destructive',
      requiresReason: ['facility_repaid', 'refinanced', 'substituted', 'released_by_consent'],
      input: { release_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ released_at_sp: isoUtc(at) }),
    },
    {
      id: 'lapse_security',
      from: ['registered', 'perfection_overdue', 'defective', 'perfected'],
      to: 'lapsed',
      by: ['agent', 'regulator'],
      label: 'Lapse security',
      intent: 'destructive',
      requiresReason: ['registration_expired', 'not_renewed', 'grantor_liquidated', 'enforcement_failed'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['identified', 'documentation_pending', 'executed'],
      to: 'withdrawn',
      by: ['agent'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['facility_cancelled', 'security_not_required', 'restructured'],
      guards: [],
    },
  ],

  // perfection time-bar: a lodged filing left unregistered past the 30-day
  // registry deadline stales into overdue.
  timers: [{ onState: 'lodged_for_registration', after: { days: 30 }, fire: 'mark_overdue', kind: 'time_bar', reason: 'deadline_passed' }],
};
