// carbon_mrv — Monitoring, Reporting & Verification lifecycle as data.
//
// A project developer submits a monitoring report for a crediting period; an
// INDEPENDENT verifier picks it up, verifies the claimed reductions, and only
// then can the report be published to the registry (a verified MRV event is
// what prompts issuance/retirement downstream — cross-chain `drive`).
//
// The integrity spine is structural: publish_report leaves ONLY `verified`, and
// the ONLY path into `verified` is `verify`. So a report can NEVER be published
// without passing verification — no guard needed, the state graph enforces it.
// Independence is enforced on the verify edge by counterpartyDistinct (a
// developer cannot verify its own reductions — the core self-verification risk),
// and the verifier's sign-off must carry a completeness-evidence ref
// (completenessEvidencePresent).
//
// settles:false — an MRV report is a measurement/assurance record, never a
// payment (R-S5-1). Any value transfer happens on the retirement/issuance chain
// this one prompts, not here.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const carbonMrv: ChainDecl = {
  key: 'carbon_mrv',
  noun: 'Carbon MRV report',
  refPrefix: 'CM',
  title: (f) =>
    `MRV report — ${(f.project_name as string) ?? (f.project_id as string) ?? 'unnamed project'} (${(f.period_start as string) ?? '?'}..${(f.period_end as string) ?? '?'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act 2019', provision: 's13 offset allowance — verified reductions', effect: 'requires' },
    { instrument: 'ISO 14064-3', provision: 'validation & verification of GHG assertions', effect: 'requires' },
  ],
  roles: ['developer', 'verifier', 'operator'],

  fields: {
    report_number: { type: 'string', label: 'Report number' },
    developer_party: { type: 'party', role: 'developer', label: 'Project developer' },
    verifier_party: { type: 'party', role: 'verifier', label: 'Independent verifier' },
    project_id: { type: 'string', required: true, label: 'Project' },
    project_name: { type: 'string', label: 'Project name' },
    methodology: { type: 'string', required: true, label: 'Methodology' },
    period_start: { type: 'string', required: true, label: 'Crediting period start' },
    period_end: { type: 'string', required: true, label: 'Crediting period end' },
    reduction_tco2e: { type: 'number', min: 0, label: 'Claimed reduction (tCO2e)' },
    monitoring_report_ref: { type: 'string', label: 'Monitoring report ref' },
    completeness_ref: { type: 'string', label: 'Completeness-evidence ref' },
    verifier_org: { type: 'string', label: 'Verifier organisation' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    verified_at: { type: 'string', label: 'Verified at' },
    published_at: { type: 'string', label: 'Published at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'developer', sla: { days: 30 } },
    submitted: { label: 'Submitted', terminal: false, holder: 'verifier', sla: { days: 5 } },
    under_verification: { label: 'Under verification', terminal: false, holder: 'verifier', sla: { days: 20 } },
    verified: { label: 'Verified', terminal: false, holder: 'operator', sla: { days: 5 } },
    published: { label: 'Published', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['developer', 'operator'],
      actorBecomes: 'developer',
      label: 'Draft MRV report',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        project_name: { type: 'string' },
        methodology: { type: 'string', required: true },
        period_start: { type: 'string', required: true },
        period_end: { type: 'string', required: true },
        reduction_tco2e: { type: 'number', min: 0 },
        monitoring_report_ref: { type: 'string' },
        verifier_party: { type: 'party', role: 'verifier' },
      },
      guards: [],
    },
    {
      id: 'submit',
      from: 'draft',
      to: 'submitted',
      by: ['developer', 'operator'],
      label: 'Submit for verification',
      intent: 'primary',
      input: { reduction_tco2e: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'begin_verification',
      from: 'submitted',
      to: 'under_verification',
      by: ['verifier'],
      label: 'Begin verification',
      intent: 'primary',
      input: { verifier_org: { type: 'string' } },
      guards: [],
    },
    {
      // independence + evidence gate. counterpartyDistinct: the developer cannot
      // verify its own reductions. completenessEvidencePresent: the sign-off must
      // carry a completeness-evidence ref.
      id: 'verify',
      from: 'under_verification',
      to: 'verified',
      by: ['verifier'],
      label: 'Verify reductions',
      intent: 'primary',
      input: {
        // present-but-not-required so an absent ref surfaces the guard's
        // MISSING_COMPLETENESS_EVIDENCE, not a generic BAD_INPUT (Pattern A).
        completeness_ref: { type: 'string' },
        reduction_tco2e: { type: 'number', min: 0 },
      },
      guards: ['counterpartyDistinct', 'completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      // structural integrity gate: the ONLY edge into `published`, and it can only
      // fire from `verified` — which only `verify` reaches. A report therefore
      // cannot publish without verification. No guard needed.
      id: 'publish_report',
      from: 'verified',
      to: 'published',
      by: ['operator', 'developer', 'verifier'],
      label: 'Publish to registry',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ published_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_report',
      from: ['submitted', 'under_verification'],
      to: 'rejected',
      by: ['verifier'],
      label: 'Reject report',
      intent: 'destructive',
      requiresReason: ['insufficient_evidence', 'methodology_deviation', 'quantification_error', 'monitoring_gap', 'double_counting'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['draft', 'submitted'],
      to: 'withdrawn',
      by: ['developer'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['period_reopened', 'data_restatement', 'project_suspended', 'no_longer_pursued'],
      guards: [],
    },
  ],

  // verification time-bar: a report sitting under_verification past the assurance
  // window stales out. record-only stub; the sweep computes the real bar off the
  // state sla days (permit_to_work / ppa_contract pattern).
  timers: [{ onState: 'under_verification', after: { days: 0 }, fire: 'reject_report', kind: 'time_bar' }],
};
