// dlp_defect — Defects Liability Period (DLP) punch-list item lifecycle, as data.
//
// A defect identified during the DLP is notified to the developer/EPC, who
// acknowledges it, rectifies it, and submits for inspection. An independent
// review either accepts the rectification (→ close) or rejects it, which
// escalates the item to a formal NCR (a separate chain: ncr.ts) rather than
// looping inside this one. A rectification can also be disputed and, once
// the dispute is resolved, goes back through inspection.
//
// Structural honesty (no invented guards):
//  - close_defect is the ONLY edge into `closed`, reachable only from
//    ie_accepted — a defect can never close without the rectification having
//    been accepted, the state graph enforces it, no guard needed.
//  - ie_reject is the ONLY edge into `escalated_to_ncr` — the terminal exit
//    for a rejected rectification carries an ncr_ref (the linked NCR chain
//    picks up from there); this chain does not model the NCR flow itself.
//  - oe_ipp_dlp_defects (legacy wave 145) has no counterparty column — this
//    is a single-party quality record, so counterpartyDistinct never applies.
//    None of the other 10 registry guards key off fields this table carries
//    (no capacity_mw, priority, live_work, credit/cp/completeness refs, or
//    serial ranges) — every transition below is guards: [].
//  - request_extension / grant_extension are self-loops on `in_rectification`:
//    v1 never modelled a separate "extension pending" status (absent from
//    every filter bucket), so an extension only ever adjusts the recorded
//    day-count without moving the state.
//
// settles:false — a DLP defect is a quality/punch-list record; it never
// moves money (any back-charge or variation order settles on its own chain,
// R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const dlpDefect: ChainDecl = {
  key: 'dlp_defect',
  noun: 'DLP defect',
  refPrefix: 'DLPD',
  title: (f) => `DLP defect — ${(f.description as string) ?? 'unnamed defect'} (${(f.severity_class as string) ?? 'severity TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'EPC contract Defects Liability Period', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator', 'operator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer / EPC' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NCR escalation)' },
    project_id: { type: 'string', required: true, label: 'Project' },
    severity_class: { type: 'string', required: true, label: 'Severity class' },
    description: { type: 'string', required: true, label: 'Description' },
    extension_requested_days: { type: 'number', min: 0, label: 'Extension requested (days)' },
    extension_granted_days: { type: 'number', min: 0, label: 'Extension granted (days)' },
    ncr_ref: { type: 'string', label: 'NCR ref' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    identified_at: { type: 'string', label: 'Identified at' },
    notified_at: { type: 'string', label: 'Notified at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    rectification_started_at: { type: 'string', label: 'Rectification started at' },
    rectified_submitted_at: { type: 'string', label: 'Rectified submitted at' },
    ie_accepted_at: { type: 'string', label: 'IE accepted at' },
    escalated_at: { type: 'string', label: 'Escalated to NCR at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    dispute_resolved_at: { type: 'string', label: 'Dispute resolved at' },
    closed_at: { type: 'string', label: 'Closed at' },
    waived_at: { type: 'string', label: 'Waived at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
  },

  initial: 'identified',

  states: {
    identified: { label: 'Identified', terminal: false, holder: 'ipp_developer', sla: { hours: 24 } },
    notified: { label: 'Notified', terminal: false, holder: 'ipp_developer', sla: { hours: 8 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    in_rectification: { label: 'In rectification', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    rectified_pending_inspection: { label: 'Rectified — pending inspection', terminal: false, holder: 'operator', sla: { days: 3 } },
    ie_accepted: { label: 'IE accepted', terminal: false, holder: 'operator', sla: { days: 2 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'operator', sla: { days: 5 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    escalated_to_ncr: { label: 'Escalated to NCR', terminal: true, holder: 'none' },
    waived: { label: 'Waived', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'identified',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Log defect',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        severity_class: { type: 'string', required: true },
        description: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // no counterparty column on oe_ipp_dlp_defects — single-party quality record.
      guards: [],
      derive: (_f, at: Instant) => ({ identified_at: isoUtc(at) }),
    },
    {
      // 'system' in `by` so the identified-state SLA timer can auto-notify a
      // defect nobody has notified within the window.
      id: 'notify_defect',
      from: 'identified',
      to: 'notified',
      by: ['ipp_developer', 'operator', 'system'],
      label: 'Notify defect',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ notified_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge_receipt',
      from: 'notified',
      to: 'acknowledged',
      by: ['ipp_developer', 'operator'],
      label: 'Acknowledge receipt',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'start_rectification',
      from: 'acknowledged',
      to: 'in_rectification',
      by: ['ipp_developer', 'operator'],
      label: 'Start rectification',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ rectification_started_at: isoUtc(at) }),
    },

    // --- extension self-loops: v1 never gave these their own status --------
    {
      id: 'request_extension',
      from: 'in_rectification',
      to: 'in_rectification',
      by: ['ipp_developer', 'operator'],
      label: 'Request extension',
      intent: 'secondary',
      input: { extension_requested_days: { type: 'number', required: true, min: 0 } },
      guards: [],
    },
    {
      id: 'grant_extension',
      from: 'in_rectification',
      to: 'in_rectification',
      by: ['ipp_developer', 'operator'],
      label: 'Grant extension',
      intent: 'secondary',
      input: { extension_granted_days: { type: 'number', required: true, min: 0 } },
      guards: [],
    },

    {
      id: 'submit_rectified',
      from: 'in_rectification',
      to: 'rectified_pending_inspection',
      by: ['ipp_developer', 'operator'],
      label: 'Submit rectified',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ rectified_submitted_at: isoUtc(at) }),
    },
    {
      id: 'ie_accept',
      from: 'rectified_pending_inspection',
      to: 'ie_accepted',
      by: ['ipp_developer', 'operator'],
      label: 'IE accept',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ ie_accepted_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into escalated_to_ncr — a rejected rectification never
      // loops back inside this chain, it hands off to the ncr chain via ncr_ref.
      id: 'ie_reject',
      from: 'rectified_pending_inspection',
      to: 'escalated_to_ncr',
      by: ['ipp_developer', 'operator'],
      label: 'IE reject',
      intent: 'destructive',
      input: {
        ncr_ref: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // v1 carries ncr_ref/regulator_ref, not a reason_code — no requiresReason.
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into the terminal `closed` state, reachable only from
      // ie_accepted — a defect can never close without an accepted rectification.
      id: 'close_defect',
      from: 'ie_accepted',
      to: 'closed',
      by: ['ipp_developer', 'operator'],
      label: 'Close defect',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },

    // --- dispute loop -----------------------------------------------------
    {
      id: 'dispute_rectification',
      from: ['rectified_pending_inspection', 'ie_accepted'],
      to: 'disputed',
      by: ['ipp_developer', 'operator'],
      label: 'Dispute rectification',
      intent: 'destructive',
      input: { notes: { type: 'string', required: true } },
      // v1 carries free-text `notes`, not a reason_code — no requiresReason.
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'rectified_pending_inspection',
      by: ['ipp_developer', 'operator'],
      label: 'Resolve dispute',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_resolved_at: isoUtc(at) }),
    },

    // --- terminal exits available from any open state ----------------------
    {
      id: 'waive_defect',
      from: ['identified', 'notified', 'acknowledged', 'in_rectification', 'rectified_pending_inspection', 'ie_accepted', 'disputed'],
      to: 'waived',
      by: ['ipp_developer', 'operator'],
      label: 'Waive defect',
      intent: 'destructive',
      input: { notes: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ waived_at: isoUtc(at) }),
    },
    {
      id: 'cancel_defect',
      from: ['identified', 'notified', 'acknowledged', 'in_rectification', 'rectified_pending_inspection', 'ie_accepted', 'disputed'],
      to: 'cancelled',
      by: ['ipp_developer', 'operator'],
      label: 'Cancel defect',
      intent: 'destructive',
      input: { notes: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],

  // SLA sweep: a defect left un-notified for a day auto-notifies (matches
  // legacy sla_deadline / "SLA breached" KPI). notify_defect has no required
  // input and 'system' in `by`, satisfying the timer-audit contract.
  timers: [{ onState: 'identified', after: { hours: 24 }, fire: 'notify_defect', kind: 'sla' }],
};
