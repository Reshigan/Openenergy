// cp_tracker — IPP Conditions Precedent (CP) tracker, as data.
//
// Every REIPPPP Implementation Agreement and NERSA generation-licence gates
// downstream milestones (drawdown, grid connection, COD) behind a schedule of
// Conditions Precedent. This chain tracks one CP from identification through
// verification to a positive (satisfied), neutral (waived) or negative
// (lapsed / rejected) close. Ported 1:1 from the v1 oe_cp_tracker state
// machine (src/utils/ipp-cp-tracker-spec.ts) — 12 states, 10 actions.
//
// Structural honesty (fidelity to v1, not a rewrite):
//  - v1's own STATE_TRANSITIONS never routes any action INTO `under_verification`
//    (submit_for_verification lands on `submitted`, not `under_verification`).
//    `under_verification` is a legitimate `from` state for conditional_pass /
//    flag_outstanding / satisfy_cp / waive_cp / reject_cp in v1's
//    VALID_TRANSITIONS, so it's kept as a real state here too — this is a
//    known gap in the legacy machine, not something this port should paper
//    over with an invented bridging action.
//  - satisfy_cp and waive_cp are the two edges that admit a CP as resolved
//    (positive or neutral); both are guarded by complianceHaltClear, mirroring
//    how ccp_assessment blocks admissions (not de-risking exits) under a
//    platform-wide compliance halt. reject_cp / expire_cp are never blocked —
//    a CP must always be closeable as failed.
//  - satisfy_cp requires a named cp_evidence_ref (cpEvidencePresent) — the
//    guard registry's evidence-ref check exists for exactly this chain.
//
// settles:false — a CP tracker records satisfaction of a contractual
// pre-condition; it never moves money itself (the gated drawdown/COD does,
// on its own chain) (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const cpTracker: ChainDecl = {
  key: 'cp_tracker',
  noun: 'Conditions precedent',
  refPrefix: 'CPTR',
  title: (f) => `CP — ${(f.cp_title as string) ?? 'untitled'} (${(f.cp_tier as string) ?? 'tier TBC'})`,
  visibility: 'owner',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP Implementation Agreement', provision: 'cl 11.3 — CP schedule & IPPO notification of CP failure', effect: 'requires' },
    { instrument: 'NERSA Grid Code / generation licence conditions', provision: 'CP rejection affecting grid connection or operating licence', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator'],

  fields: {
    cp_title: { type: 'string', required: true, label: 'CP title' },
    cp_tier: { type: 'string', required: true, label: 'CP tier (operational/commercial/financial/regulatory/strategic)' },
    project_ref: { type: 'string', label: 'Project ref' },
    lender_ref: { type: 'string', label: 'Lender ref' },
    gate_ref: { type: 'string', label: 'Downstream gate ref' },
    description: { type: 'string', label: 'Description' },
    cp_evidence_ref: { type: 'string', label: 'CP evidence ref' },
    // written by derive, never by the client
    identified_at: { type: 'string', label: 'Identified at' },
    satisfied_at: { type: 'string', label: 'Satisfied at' },
    waived_at: { type: 'string', label: 'Waived at' },
    lapsed_at: { type: 'string', label: 'Lapsed at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
  },

  initial: 'identified',

  states: {
    identified: { label: 'Identified', terminal: false, holder: 'ipp_developer' },
    documented: { label: 'Documented', terminal: false, holder: 'ipp_developer' },
    submitted: { label: 'Submitted', terminal: false, holder: 'operator' },
    under_verification: { label: 'Under verification', terminal: false, holder: 'operator' },
    conditional_pass: { label: 'Conditional pass', terminal: false, holder: 'ipp_developer' },
    outstanding: { label: 'Outstanding', terminal: false, holder: 'ipp_developer' },
    notice_served: { label: 'Notice served', terminal: false, holder: 'ipp_developer' },
    cure_underway: { label: 'Cure underway', terminal: false, holder: 'ipp_developer' },
    satisfied: { label: 'Satisfied', terminal: true, holder: 'none' },
    waived: { label: 'Waived', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'identified',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Register CP',
      intent: 'primary',
      input: {
        cp_title: { type: 'string', required: true },
        cp_tier: { type: 'string', required: true },
        project_ref: { type: 'string' },
        lender_ref: { type: 'string' },
        gate_ref: { type: 'string' },
        description: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ identified_at: isoUtc(at) }),
    },
    {
      id: 'document_cp',
      from: 'identified',
      to: 'documented',
      by: ['ipp_developer', 'operator'],
      label: 'Document CP',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'submit_for_verification',
      from: 'documented',
      to: 'submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit for verification',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'conditional_pass',
      from: 'under_verification',
      to: 'conditional_pass',
      by: ['ipp_developer', 'operator'],
      label: 'Conditional pass',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'flag_outstanding',
      from: ['under_verification', 'conditional_pass'],
      to: 'outstanding',
      by: ['ipp_developer', 'operator'],
      label: 'Flag outstanding',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'serve_notice',
      from: 'outstanding',
      to: 'notice_served',
      by: ['ipp_developer', 'operator'],
      label: 'Serve notice',
      intent: 'secondary',
      guards: [],
    },
    {
      id: 'commence_cure',
      from: 'notice_served',
      to: 'cure_underway',
      by: ['ipp_developer', 'operator'],
      label: 'Commence cure',
      intent: 'primary',
      guards: [],
    },
    {
      // the CP-evidence guard exists specifically for this edge: a CP cannot be
      // closed satisfied without a named evidence ref. complianceHaltClear
      // because satisfying a CP is an admission (unlocks a downstream gate).
      id: 'satisfy_cp',
      from: ['under_verification', 'conditional_pass', 'cure_underway'],
      to: 'satisfied',
      by: ['ipp_developer', 'operator'],
      label: 'Satisfy CP',
      intent: 'primary',
      input: { cp_evidence_ref: { type: 'string' } },
      guards: ['cpEvidencePresent', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ satisfied_at: isoUtc(at) }),
    },
    {
      id: 'waive_cp',
      from: ['under_verification', 'outstanding', 'notice_served', 'cure_underway'],
      to: 'waived',
      by: ['ipp_developer', 'operator'],
      label: 'Waive CP',
      intent: 'secondary',
      requiresReason: ['bilateral_agreement', 'regulator_consent', 'ministerial_signoff', 'condition_superseded'],
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ waived_at: isoUtc(at) }),
    },
    {
      // timer-fired backstop (see timers below) — never blocked by a halt, a
      // CP must always be closeable as lapsed once its deadline has passed.
      id: 'expire_cp',
      from: ['identified', 'documented', 'submitted', 'under_verification', 'conditional_pass', 'outstanding', 'notice_served', 'cure_underway'],
      to: 'lapsed',
      by: ['ipp_developer', 'operator', 'system'],
      label: 'Expire CP',
      intent: 'destructive',
      requiresReason: ['sla_deadline_missed', 'evidence_not_provided', 'project_abandoned'],
      guards: [],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
    {
      id: 'reject_cp',
      from: ['submitted', 'under_verification'],
      to: 'rejected',
      by: ['ipp_developer', 'operator'],
      label: 'Reject CP',
      intent: 'destructive',
      requiresReason: ['documentation_deficient', 'verification_failed', 'licence_condition_breach', 'counterparty_declined'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
  ],

  // v1's tiered SLA (14/21/45/30/60 days by cp_tier) can't be expressed as a
  // static per-state Duration. This is a worst-case (strategic-tier, 60d)
  // backstop time-bar from `identified` only — same simplification disposition.ts
  // uses for its CP long-stop: the real tiered deadline still lives on
  // sla_deadline / the SLA cron sweep outside the domain-purity boundary.
  timers: [{ onState: 'identified', after: { days: 60 }, fire: 'expire_cp', kind: 'time_bar', reason: 'sla_deadline_missed' }],
};
