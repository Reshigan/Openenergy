// crediting_renewal — carbon crediting-period renewal lifecycle as data.
//
// A registered VCM/REC project's crediting period (the window in which it may
// issue credits) expires. The proponent applies to renew it; a validation/
// verification body (VVB) reassesses continued additionality against the CURRENT
// methodology; the registry approves the new period.
//
// Structural gate: approve_renewal ONLY leaves `validated`, and the ONLY path
// into `validated` is `validate`. So a renewal can NEVER be approved before the
// VVB has re-validated the project against the live methodology — the state
// graph enforces it, no guard needed. The validate edge itself is guarded by
// completenessEvidencePresent: a sign-off needs a named assessment-evidence ref.
//
// NO claim key. A renewal is a periodic reassessment, not a permanent one-time
// consumption of a serial/asset — the same project renews again next cycle. A
// claim would wrongly block the project forever.
//
// settles:false — a crediting-period renewal is a registry control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure reassessment-tier bucketing off the numeric score (0..100). No clock.
const assessmentTier = (score: Json | undefined): string => {
  if (typeof score !== 'number') return 'unassessed';
  if (score >= 80) return 'strong';
  if (score >= 50) return 'adequate';
  return 'weak';
};

export const creditingRenewal: ChainDecl = {
  key: 'crediting_renewal',
  noun: 'Crediting-period renewal',
  refPrefix: 'CRED',
  title: (f) => `${(f.project_name as string) ?? 'unnamed project'} crediting renewal — cycle ${(f.renewal_cycle as number) ?? 1}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Verra VCS Standard', provision: 'crediting period renewal & reassessment', effect: 'requires' },
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset eligibility', effect: 'requires' },
  ],
  roles: ['proponent', 'validator', 'registry', 'regulator'],

  fields: {
    renewal_number: { type: 'string', label: 'Renewal number' },
    proponent_party: { type: 'party', role: 'proponent', label: 'Project proponent' },
    validator_party: { type: 'party', role: 'validator', label: 'Validation/verification body' },
    registry_party: { type: 'party', role: 'registry', label: 'Registry' },
    project_name: { type: 'string', required: true, label: 'Project name' },
    project_ref: { type: 'string', label: 'Registered project ref' },
    registry_name: { type: 'string', label: 'Registry (Verra/Gold Standard/…)' },
    methodology_ref: { type: 'string', label: 'Methodology version renewed against' },
    current_period_end: { type: 'string', label: 'Current crediting period end (date)' },
    crediting_period_years: { type: 'number', min: 0, label: 'New crediting period (years)' },
    renewal_cycle: { type: 'number', min: 1, label: 'Renewal cycle (1st/2nd/3rd)' },
    additionality_reassessed: { type: 'boolean', label: 'Additionality reassessed' },
    baseline_updated: { type: 'boolean', label: 'Baseline updated to current methodology' },
    assessment_score: { type: 'number', min: 0, max: 100, label: 'Reassessment score (0-100)' },
    assessment_tier: { type: 'string', label: 'Reassessment tier' },
    completeness_ref: { type: 'string', label: 'Assessment-completeness evidence ref' },
    // written by derive, never by the client
    validated_at: { type: 'string', label: 'Validated at' },
    renewed_at: { type: 'string', label: 'Renewed at' },
    closed_at_renewal: { type: 'string', label: 'Renewal closed at' },
  },

  initial: 'renewal_requested',

  states: {
    renewal_requested: { label: 'Renewal requested', terminal: false, holder: 'validator', sla: { days: 30 } },
    under_reassessment: { label: 'Under reassessment', terminal: false, holder: 'validator', sla: { days: 21 } },
    validated: { label: 'Validated', terminal: false, holder: 'registry', sla: { days: 14 } },
    renewed: { label: 'Renewed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'renewal_requested',
      by: ['proponent'],
      actorBecomes: 'proponent',
      label: 'Request renewal',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        project_ref: { type: 'string' },
        registry_name: { type: 'string' },
        methodology_ref: { type: 'string' },
        current_period_end: { type: 'string' },
        renewal_cycle: { type: 'number', min: 1 },
        validator_party: { type: 'party', role: 'validator' },
        registry_party: { type: 'party', role: 'registry' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_reassessment',
      from: 'renewal_requested',
      to: 'under_reassessment',
      by: ['validator'],
      label: 'Begin reassessment',
      intent: 'primary',
      input: { assessment_score: { type: 'number', min: 0, max: 100 } },
      guards: [],
      derive: (f, _at: Instant) => ({ assessment_tier: assessmentTier(f.assessment_score) }),
    },
    {
      // VVB sign-off. completenessEvidencePresent forces a named evidence ref.
      id: 'validate',
      from: 'under_reassessment',
      to: 'validated',
      by: ['validator'],
      label: 'Validate reassessment',
      intent: 'primary',
      input: {
        completeness_ref: { type: 'string' },
        additionality_reassessed: { type: 'boolean' },
        baseline_updated: { type: 'boolean' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ validated_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY edge into `renewed`, only from `validated`.
      // A renewal cannot be approved on an un-validated reassessment. No guard.
      id: 'approve_renewal',
      from: 'validated',
      to: 'renewed',
      by: ['registry'],
      label: 'Approve renewal',
      intent: 'primary',
      input: { crediting_period_years: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ renewed_at: isoUtc(at), closed_at_renewal: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_renewal',
      from: ['renewal_requested', 'under_reassessment', 'validated'],
      to: 'rejected',
      by: ['validator', 'registry'],
      label: 'Reject renewal',
      intent: 'destructive',
      requiresReason: ['additionality_lost', 'methodology_superseded', 'evidence_insufficient', 'baseline_invalid'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_renewal: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['renewal_requested', 'under_reassessment'],
      to: 'withdrawn',
      by: ['proponent'],
      label: 'Withdraw renewal',
      intent: 'destructive',
      requiresReason: ['project_retired', 'not_renewing', 'rescoped'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_renewal: isoUtc(at) }),
    },
    {
      id: 'lapse',
      from: ['renewal_requested', 'under_reassessment', 'validated'],
      to: 'lapsed',
      by: ['registry', 'system'],
      label: 'Lapse crediting period',
      intent: 'destructive',
      requiresReason: ['period_expired', 'no_response', 'superseded_methodology'],
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_renewal: isoUtc(at) }),
    },
  ],

  // period-expiry time-bar: a renewal not actioned before the crediting period
  // ends lapses (a project cannot issue on an expired, un-renewed period).
  // record-only stub; the sweep computes the real bar off state sla (ppa pattern).
  timers: [{ onState: 'renewal_requested', after: { days: 90 }, fire: 'lapse', kind: 'time_bar', reason: 'period_expired' }],
};
