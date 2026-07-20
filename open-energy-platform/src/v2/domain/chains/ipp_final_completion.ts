// ipp_final_completion — IPP construction Final Completion Certificate (FCC)
// application and retention release, as data.
//
// A developer submits the FCC application; the independent engineer schedules
// and completes the physical inspection. A clean inspection goes straight to
// FCC issuance; a defective one issues a snag list first (holder: the EPC
// contractor, who must cure the defects before the IE will certify) — issue_fcc
// is reachable from EITHER inspection_complete or snag_list_issued, so an FCC
// can never be issued before an inspection has actually happened. Once the FCC
// is issued the developer releases the retention monies held under the DLP —
// the only edge into the terminal retention_released.
//
// The dispute spine: rejecting an application (legacy `reject_application`,
// documented "terminal" in v1) lands here on `disputed`, not a dead end —
// legacy's own `refer_adjudication` cascadeHint ("Refers a DISPUTED rejection
// to adjudication") only makes sense if a rejection is itself contestable. The
// developer then either refers it to adjudication (terminal: adjudicated),
// withdraws outright (terminal: withdrawn), or — if the SLA window on
// deadlineCol `sla_due_at` lapses without either — the dispute auto-expires
// into the harder terminal `rejected` via a system time-bar.
//
// Judgment call: legacy filters also list `defects_outstanding` and
// `snag_list_cleared` states, but no v1 action produces either — folded into
// `snag_list_issued` (a snag list *is* the outstanding-defects record; its
// clearance is evidenced off-chain by the IE issuing the FCC, not a separate
// transaction) rather than inventing an unlisted "clear snags" action.
//
// issue_fcc is guarded by completenessEvidencePresent — an FCC IS a
// completeness sign-off, the guard's exact documented use case.
//
// settles:false — this is a construction-controls record (an authorisation to
// release retention), not itself a payment rail; matches ipp_evm/ipp_schedule
// in the same cluster (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippFinalCompletion: ChainDecl = {
  key: 'ipp_final_completion',
  noun: 'IPP final completion application',
  refPrefix: 'FCC',
  title: (f) =>
    `Final completion — ${(f.project_name as string) ?? (f.project_id as string) ?? 'project'} (retention ZAR ${typeof f.retention_amount_zar === 'number' ? f.retention_amount_zar : 'n/a'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement completion & defects liability period', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'independent_engineer', 'epc_contractor', 'regulator'],

  fields: {
    application_ref: { type: 'string', label: 'Application ref' },
    project_id: { type: 'string', required: true, label: 'Project' },
    project_name: { type: 'string', label: 'Project name' },
    contract_value_zar: { type: 'number', min: 0, label: 'Contract value (ZAR)' },
    retention_amount_zar: { type: 'number', required: true, min: 0, label: 'Retention amount (ZAR)' },
    practical_completion_date: { type: 'string', label: 'Practical completion date' },
    dlp_end_date: { type: 'string', label: 'Defects liability period end date' },
    description: { type: 'string', label: 'Description' },
    developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (applicant)' },
    ie_party: { type: 'party', role: 'independent_engineer', label: 'Independent engineer' },
    contractor_party: { type: 'party', role: 'epc_contractor', label: 'EPC contractor' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    inspection_date: { type: 'string', label: 'Inspection date' },
    inspection_outcome: { type: 'string', label: 'Inspection outcome' },
    defects_summary: { type: 'string', label: 'Defects summary (snag list)' },
    completeness_ref: { type: 'string', label: 'Completeness evidence ref' },
    fcc_ref: { type: 'string', label: 'FCC document ref' },
    dispute_notice_ref: { type: 'string', label: 'Dispute / adjudication notice ref' },
    // derive-stamped, never client-set
    submitted_at: { type: 'string', label: 'Submitted at' },
    inspection_completed_at: { type: 'string', label: 'Inspection completed at' },
    snag_list_issued_at: { type: 'string', label: 'Snag list issued at' },
    fcc_issued_at: { type: 'string', label: 'FCC issued at' },
    retention_released_at: { type: 'string', label: 'Retention released at' },
    adjudicated_at: { type: 'string', label: 'Adjudicated at' },
  },

  initial: 'application_submitted',

  states: {
    application_submitted: { label: 'Application submitted', terminal: false, holder: 'independent_engineer', sla: { days: 5 } },
    inspection_scheduled: { label: 'Inspection scheduled', terminal: false, holder: 'independent_engineer', sla: { days: 10 } },
    inspection_complete: { label: 'Inspection complete', terminal: false, holder: 'independent_engineer', sla: { days: 5 } },
    snag_list_issued: { label: 'Snag list issued (defects outstanding)', terminal: false, holder: 'epc_contractor', sla: { days: 30 } },
    fcc_issued: { label: 'FCC issued', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    retention_released: { label: 'Retention released', terminal: true, holder: 'none' },
    disputed: { label: 'Rejected — disputed pending adjudication or withdrawal', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    adjudicated: { label: 'Referred to adjudication', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected (final)', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'application_submitted',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Submit final completion application',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        project_name: { type: 'string' },
        contract_value_zar: { type: 'number', min: 0 },
        retention_amount_zar: { type: 'number', required: true, min: 0 },
        practical_completion_date: { type: 'string' },
        dlp_end_date: { type: 'string' },
        description: { type: 'string' },
        ie_party: { type: 'party', role: 'independent_engineer' },
        contractor_party: { type: 'party', role: 'epc_contractor' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // opening a new retention-bearing application is a new commitment — blocked under halt.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'schedule_inspection',
      from: 'application_submitted',
      to: 'inspection_scheduled',
      by: ['ipp_developer', 'independent_engineer'],
      label: 'Schedule inspection',
      intent: 'primary',
      input: { inspection_date: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'complete_inspection',
      from: 'inspection_scheduled',
      to: 'inspection_complete',
      by: ['independent_engineer'],
      label: 'Complete inspection',
      intent: 'primary',
      input: { inspection_outcome: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ inspection_completed_at: isoUtc(at) }),
    },
    {
      id: 'issue_snag_list',
      from: 'inspection_complete',
      to: 'snag_list_issued',
      by: ['independent_engineer'],
      label: 'Issue snag list',
      intent: 'secondary',
      input: { defects_summary: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ snag_list_issued_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into fcc_issued — reachable from a clean inspection OR
      // (once defects are cured, evidenced by completeness_ref) a snag list.
      // completenessEvidencePresent is the registry's documented fit: an FCC
      // IS a completeness sign-off.
      id: 'issue_fcc',
      from: ['inspection_complete', 'snag_list_issued'],
      to: 'fcc_issued',
      by: ['independent_engineer'],
      label: 'Issue Final Completion Certificate',
      intent: 'primary',
      input: {
        completeness_ref: { type: 'string' },
        fcc_ref: { type: 'string', required: true },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ fcc_issued_at: isoUtc(at) }),
    },
    {
      id: 'release_retention',
      from: 'fcc_issued',
      to: 'retention_released',
      by: ['ipp_developer'],
      label: 'Release retention',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ retention_released_at: isoUtc(at) }),
    },

    // --- dispute spine ----------------------------------------------------
    {
      id: 'reject_application',
      from: ['application_submitted', 'inspection_scheduled', 'inspection_complete', 'snag_list_issued'],
      to: 'disputed',
      by: ['independent_engineer'],
      label: 'Reject application',
      intent: 'destructive',
      requiresReason: ['non_compliant_works', 'incomplete_documentation', 'outstanding_defects', 'safety_noncompliance', 'regulatory_noncompliance'],
      guards: [],
    },
    {
      id: 'refer_adjudication',
      from: 'disputed',
      to: 'adjudicated',
      by: ['ipp_developer'],
      label: 'Refer to adjudication',
      intent: 'primary',
      input: { dispute_notice_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ adjudicated_at: isoUtc(at) }),
    },
    {
      id: 'withdraw_application',
      from: ['application_submitted', 'inspection_scheduled', 'inspection_complete', 'snag_list_issued', 'disputed'],
      to: 'withdrawn',
      by: ['ipp_developer'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: ['project_reprioritised', 'duplicate_application', 'commissioning_delayed', 'superseded_application'],
      guards: [],
    },
    {
      // SLA time-bar: a rejection left uncontested for 14 days hardens into a
      // final rejection. No input, `by` includes system, `from` matches the
      // timer's onState — required shape for a firing edge.
      id: 'auto_reject_expired_dispute',
      from: 'disputed',
      to: 'rejected',
      by: ['system'],
      label: 'Auto-reject (dispute window lapsed)',
      intent: 'destructive',
      requiresReason: ['dispute_window_lapsed'],
      guards: [],
    },
  ],

  timers: [{ onState: 'disputed', after: { days: 14 }, fire: 'auto_reject_expired_dispute', kind: 'time_bar', reason: 'dispute_window_lapsed' }],
};
