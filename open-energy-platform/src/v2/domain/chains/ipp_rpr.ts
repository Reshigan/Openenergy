// ipp_rpr — REIPPPP progress report as data.
//
// An IPP's REIPPPP economic-development obligations (local content, ED spend,
// job creation) are reported on a fixed cycle. The chain is a straight-line
// data-collection → internal-governance → IPP-Office-submission spine: every
// figure gets tabulated before internal review, board approval gates the
// external submission, and the IPP Office's acknowledgement is what closes
// the loop. accept_report / reject_report are the IPP Office's determination
// — the ONLY edges into report_accepted / report_rejected, both reachable
// only from acknowledgement_pending, so a report can never be accepted or
// rejected before the office has actually acknowledged receipt. No guard
// needed for that ordering, the state graph enforces it.
//
// declare_lapsed is the missed-deadline exit (legacy deadlineCol
// sla_due_date): reachable from any open collection/review/submission state,
// mirrors the commissioning.ts mark_failed pattern.
//
// settles:false — a progress report is a compliance record, not a payment
// (R-S5-1); ed_spend_zar is reported quantum, not money this chain moves.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippRpr: ChainDecl = {
  key: 'ipp_rpr',
  noun: 'REIPPPP progress report',
  refPrefix: 'RPR',
  title: (f) => `REIPPPP report — ${(f.project_ref as string) ?? 'project'} (${(f.report_period as string) ?? 'period'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'economic-development reporting obligations', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    project_ref: { type: 'string', required: true, label: 'Project ref' },
    report_period: { type: 'string', required: true, label: 'Report period' },
    project_mw: { type: 'number', required: true, min: 0, label: 'Project MW' },
    actor_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    local_content_pct: { type: 'number', min: 0, max: 100, label: 'Local content (%)' },
    ed_spend_zar: { type: 'number', min: 0, label: 'ED spend (ZAR)' },
    jobs_created: { type: 'number', min: 0, label: 'Jobs created' },
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    ipp_office_ack_ref: { type: 'string', label: 'IPP Office acknowledgement ref' },
    // derive-stamped timestamps
    data_collection_started_at: { type: 'string', label: 'Data collection started at' },
    submitted_at: { type: 'string', label: 'Submitted to IPP Office at' },
    closed_at_rpr: { type: 'string', label: 'Report closed at' },
  },

  initial: 'report_cycle_opened',

  states: {
    report_cycle_opened: { label: 'Report cycle opened', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    data_collection: { label: 'Data collection', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    local_content_verification: { label: 'Local content verification', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    ed_spend_reconciliation: { label: 'ED spend reconciliation', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    job_creation_tabulation: { label: 'Job creation tabulation', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    internal_review: { label: 'Internal review', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    board_approval: { label: 'Board approval', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    ipp_office_submission: { label: 'IPP Office submission', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    acknowledgement_pending: { label: 'Acknowledgement pending', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    report_accepted: { label: 'Report accepted', terminal: true, holder: 'none' },
    report_rejected: { label: 'Report rejected', terminal: true, holder: 'none' },
    report_lapsed: { label: 'Report lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'report_cycle_opened',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Open progress report',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        report_period: { type: 'string', required: true },
        project_mw: { type: 'number', required: true, min: 0 },
      },
      guards: [],
    },
    {
      id: 'commence_data_collection',
      from: 'report_cycle_opened',
      to: 'data_collection',
      by: ['ipp_developer', 'admin'],
      label: 'Commence data collection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ data_collection_started_at: isoUtc(at) }),
    },
    {
      id: 'verify_local_content',
      from: 'data_collection',
      to: 'local_content_verification',
      by: ['ipp_developer', 'admin'],
      label: 'Verify local content',
      intent: 'primary',
      input: { local_content_pct: { type: 'number', min: 0, max: 100 } },
      guards: [],
    },
    {
      id: 'reconcile_ed_spend',
      from: 'local_content_verification',
      to: 'ed_spend_reconciliation',
      by: ['ipp_developer', 'admin'],
      label: 'Reconcile ED spend',
      intent: 'primary',
      input: { ed_spend_zar: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      id: 'tabulate_jobs',
      from: 'ed_spend_reconciliation',
      to: 'job_creation_tabulation',
      by: ['ipp_developer', 'admin'],
      label: 'Tabulate jobs',
      intent: 'primary',
      input: { jobs_created: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      id: 'conduct_internal_review',
      from: 'job_creation_tabulation',
      to: 'internal_review',
      by: ['ipp_developer', 'admin'],
      label: 'Conduct internal review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'obtain_board_approval',
      from: 'internal_review',
      to: 'board_approval',
      by: ['ipp_developer', 'admin'],
      label: 'Obtain board approval',
      intent: 'primary',
      input: { board_approval_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'submit_to_ipp_office',
      from: 'board_approval',
      to: 'ipp_office_submission',
      by: ['ipp_developer', 'admin'],
      label: 'Submit to IPP Office',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'confirm_acknowledgement',
      from: 'ipp_office_submission',
      to: 'acknowledgement_pending',
      by: ['ipp_developer', 'admin'],
      label: 'Confirm acknowledgement',
      intent: 'primary',
      input: { ipp_office_ack_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // the IPP Office's determination — ONLY reachable once acknowledgement
      // is confirmed, so a report can never be accepted before receipt.
      id: 'accept_report',
      from: 'acknowledgement_pending',
      to: 'report_accepted',
      by: ['ipp_developer', 'admin'],
      label: 'Accept report',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_rpr: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_report',
      from: ['internal_review', 'board_approval', 'ipp_office_submission', 'acknowledgement_pending'],
      to: 'report_rejected',
      by: ['ipp_developer', 'admin'],
      label: 'Reject report',
      intent: 'destructive',
      requiresReason: ['data_inconsistency', 'incomplete_figures', 'board_rejected', 'ipp_office_returned'],
      guards: [],
    },
    {
      id: 'declare_lapsed',
      from: [
        'report_cycle_opened',
        'data_collection',
        'local_content_verification',
        'ed_spend_reconciliation',
        'job_creation_tabulation',
        'internal_review',
        'board_approval',
        'ipp_office_submission',
        'acknowledgement_pending',
      ],
      to: 'report_lapsed',
      by: ['ipp_developer', 'admin', 'system'],
      label: 'Declare lapsed',
      intent: 'destructive',
      requiresReason: ['sla_deadline_missed'],
      guards: [],
    },
  ],

  // report_cycle_opened time-bar: a cycle never actioned within the SLA
  // window lapses (legacy deadlineCol sla_due_date), same pattern as
  // commissioning.ts mark_failed.
  timers: [{ onState: 'report_cycle_opened', after: { days: 30 }, fire: 'declare_lapsed', kind: 'sla', reason: 'sla_deadline_missed' }],
};
