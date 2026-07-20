// ncr — IPP construction non-conformance report (NCR) lifecycle as data.
//
// ISO 9001 §8.7 control-of-nonconforming-outputs pattern layered onto REIPPPP
// EPC quality: a developer/EPC raises a defect, acknowledges it, investigates
// root cause, proposes a disposition (rework/repair/replace/scrap/accept),
// has it reviewed, then either reworks-and-recloses, accepts the concession
// as-is, or rejects-and-escalates. void_ncr is a pre-investigation-complete
// withdrawal (duplicate/misfiled/no-defect-confirmed) — it is reachable only
// from raised/acknowledged/under_investigation, never once a disposition has
// been proposed (legacy cascadeHint: "terminal exit before investigation
// complete").
//
// Structural honesty (no invented guards):
//  - close_ncr is the ONLY edge into `closed`, reachable only from
//    corrective_action_planned — an NCR can never close without a recorded
//    corrective/preventive action, the state graph enforces it, no guard
//    needed.
//  - accepted_as_is and rejected_escalated are reachable only from
//    disposition_reviewed — a concession or an escalation both require the
//    disposition to have been reviewed first.
//  - oe_ipp_ncrs (legacy mig 362) has no counterparty column — this is a
//    single-party quality record, so counterpartyDistinct never applies.
//  - the legacy cascadeHints flag that accept_as_is and reject_escalate can
//    cross the regulator (IE-notifiable / NERSA-reportable / SIGNATURE), but
//    that crossing is driven by the boolean ie_notification_required /
//    nersa_reportable flags recorded at raise time, not by capacity_mw
//    (regulatorPresentIfStrategic), priority==='critical'
//    (regulatorPresentIfCritical) or live_work/confined_space
//    (regulatorPresentIfHighHazard) — none of the 10 registry guards model a
//    flag-driven crossing, so it is left to the cascade layer (fireCascade),
//    not fabricated here as a guard.
//
// settles:false — an NCR is a quality/governance record. rework_cost_zar and
// schedule_impact_days are informational estimates the record carries; any
// actual payment (variation order, back-charge) settles on its own chain
// (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ncr: ChainDecl = {
  key: 'ncr',
  noun: 'Non-conformance report',
  refPrefix: 'NCR',
  title: (f) => `NCR — ${(f.description as string) ?? 'unnamed defect'} (${(f.ncr_severity as string) ?? 'severity TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ISO 9001:2015', provision: '§8.7 control of nonconforming outputs', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'IPP Programme Office EPC quality compliance', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator', 'operator'],

  fields: {
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer / EPC' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (IE/NERSA escalation)' },
    project_id: { type: 'string', required: true, label: 'Project' },
    description: { type: 'string', required: true, label: 'Description' },
    ncr_category: { type: 'string', required: true, label: 'NCR category' },
    ncr_severity: { type: 'string', required: true, label: 'Severity (safety_critical/structural/functional/minor/cosmetic)' },
    discipline: { type: 'string', label: 'Discipline' },
    work_area: { type: 'string', label: 'Work area' },
    rework_cost_zar: { type: 'number', min: 0, label: 'Rework cost (ZAR) — record only' },
    schedule_impact_days: { type: 'number', label: 'Schedule impact (days)' },
    ie_notification_required: { type: 'boolean', label: 'IE notification required' },
    lender_consent_required: { type: 'boolean', label: 'Lender consent required' },
    nersa_reportable: { type: 'boolean', label: 'NERSA reportable' },
    hold_point_triggered: { type: 'boolean', label: 'Hold point triggered' },
    safety_stop_work: { type: 'boolean', label: 'Safety stop-work' },
    rca_method: { type: 'string', label: 'Root-cause method (5-why/fishbone/fault-tree)' },
    root_cause: { type: 'string', label: 'Root cause' },
    disposition: { type: 'string', label: 'Disposition (rework/repair/replace/scrap/accept_as_is)' },
    disposition_justification: { type: 'string', label: 'Disposition justification' },
    rework_scope: { type: 'string', label: 'Rework scope' },
    reinspection_notes: { type: 'string', label: 'Reinspection findings' },
    corrective_action: { type: 'string', label: 'Corrective action' },
    preventive_action: { type: 'string', label: 'Preventive action' },
    ie_comments: { type: 'string', label: 'Independent Engineer comments' },
    closure_notes: { type: 'string', label: 'Closure / void notes' },
    // written by derive, never by the client
    raised_at: { type: 'string', label: 'Raised at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    investigation_started_at: { type: 'string', label: 'Investigation started at' },
    disposition_proposed_at: { type: 'string', label: 'Disposition proposed at' },
    disposition_reviewed_at: { type: 'string', label: 'Disposition reviewed at' },
    rework_started_at: { type: 'string', label: 'Rework started at' },
    reinspection_submitted_at: { type: 'string', label: 'Reinspection submitted at' },
    corrective_action_planned_at: { type: 'string', label: 'Corrective action planned at' },
    closed_at: { type: 'string', label: 'Closed at' },
    accepted_at: { type: 'string', label: 'Accepted as-is at' },
    escalated_at: { type: 'string', label: 'Rejected/escalated at' },
    voided_at: { type: 'string', label: 'Voided at' },
  },

  initial: 'raised',

  states: {
    raised: { label: 'Raised', terminal: false, holder: 'ipp_developer', sla: { hours: 4 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'ipp_developer', sla: { hours: 8 } },
    under_investigation: { label: 'Under investigation', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    disposition_proposed: { label: 'Disposition proposed', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    disposition_reviewed: { label: 'Disposition reviewed', terminal: false, holder: 'ipp_developer', sla: { days: 2 } },
    rework_in_progress: { label: 'Rework in progress', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    reinspection: { label: 'Reinspection', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    corrective_action_planned: { label: 'Corrective action planned', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    accepted_as_is: { label: 'Accepted as-is', terminal: true, holder: 'none' },
    rejected_escalated: { label: 'Rejected & escalated', terminal: true, holder: 'none' },
    voided: { label: 'Voided', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'raised',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Raise NCR',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        description: { type: 'string', required: true },
        ncr_category: { type: 'string', required: true },
        ncr_severity: { type: 'string', required: true },
        discipline: { type: 'string' },
        work_area: { type: 'string' },
        rework_cost_zar: { type: 'number', min: 0 },
        schedule_impact_days: { type: 'number' },
        ie_notification_required: { type: 'boolean' },
        lender_consent_required: { type: 'boolean' },
        nersa_reportable: { type: 'boolean' },
        hold_point_triggered: { type: 'boolean' },
        safety_stop_work: { type: 'boolean' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // no counterparty column on oe_ipp_ncrs — single-party quality record.
      guards: [],
      derive: (_f, at: Instant) => ({ raised_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge_ncr',
      from: 'raised',
      to: 'acknowledged',
      by: ['ipp_developer', 'operator'],
      label: 'Acknowledge NCR',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'start_investigation',
      from: 'acknowledged',
      to: 'under_investigation',
      by: ['ipp_developer', 'operator'],
      label: 'Start investigation',
      intent: 'primary',
      input: {
        rca_method: { type: 'string' },
        root_cause: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ investigation_started_at: isoUtc(at) }),
    },
    {
      id: 'propose_disposition',
      from: 'under_investigation',
      to: 'disposition_proposed',
      by: ['ipp_developer', 'operator'],
      label: 'Propose disposition',
      intent: 'primary',
      input: {
        disposition: { type: 'string', required: true },
        disposition_justification: { type: 'string' },
        rework_scope: { type: 'string' },
        rework_cost_zar: { type: 'number', min: 0 },
        schedule_impact_days: { type: 'number' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ disposition_proposed_at: isoUtc(at) }),
    },
    {
      id: 'review_disposition',
      from: 'disposition_proposed',
      to: 'disposition_reviewed',
      by: ['ipp_developer', 'operator'],
      label: 'Review disposition',
      intent: 'primary',
      input: { ie_comments: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ disposition_reviewed_at: isoUtc(at) }),
    },
    {
      id: 'start_rework',
      from: 'disposition_reviewed',
      to: 'rework_in_progress',
      by: ['ipp_developer', 'operator'],
      label: 'Start rework',
      intent: 'primary',
      input: {
        rework_scope: { type: 'string' },
        rework_cost_zar: { type: 'number', min: 0 },
        schedule_impact_days: { type: 'number' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ rework_started_at: isoUtc(at) }),
    },
    {
      id: 'submit_reinspection',
      from: 'rework_in_progress',
      to: 'reinspection',
      by: ['ipp_developer', 'operator'],
      label: 'Submit reinspection',
      intent: 'primary',
      input: { reinspection_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ reinspection_submitted_at: isoUtc(at) }),
    },
    {
      id: 'plan_corrective_action',
      from: 'reinspection',
      to: 'corrective_action_planned',
      by: ['ipp_developer', 'operator'],
      label: 'Plan corrective action',
      intent: 'primary',
      input: {
        corrective_action: { type: 'string' },
        preventive_action: { type: 'string' },
        rca_method: { type: 'string' },
        root_cause: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ corrective_action_planned_at: isoUtc(at) }),
    },
    {
      // structural clean-close: the ONLY edge into `closed`, reachable only
      // from corrective_action_planned — an NCR cannot close without a
      // recorded corrective/preventive action.
      id: 'close_ncr',
      from: 'corrective_action_planned',
      to: 'closed',
      by: ['ipp_developer', 'operator'],
      label: 'Close NCR',
      intent: 'primary',
      input: {
        corrective_action: { type: 'string' },
        preventive_action: { type: 'string' },
        closure_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },

    // --- exits from disposition_reviewed ---------------------------------------
    {
      id: 'accept_as_is',
      from: 'disposition_reviewed',
      to: 'accepted_as_is',
      by: ['ipp_developer', 'operator'],
      label: 'Accept as-is',
      intent: 'primary',
      input: {
        disposition_justification: { type: 'string' },
        ie_comments: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'reject_escalate',
      from: 'disposition_reviewed',
      to: 'rejected_escalated',
      by: ['ipp_developer', 'operator'],
      label: 'Reject & escalate',
      intent: 'destructive',
      requiresReason: ['disposition_rejected_by_ie', 'root_cause_unresolved', 'rework_infeasible', 'safety_risk_unacceptable', 'regulatory_objection'],
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },

    // --- pre-investigation-complete withdrawal ---------------------------------
    {
      id: 'void_ncr',
      from: ['raised', 'acknowledged', 'under_investigation'],
      to: 'voided',
      by: ['ipp_developer', 'operator'],
      label: 'Void NCR',
      intent: 'destructive',
      requiresReason: ['duplicate', 'misfiled', 'superseded', 'no_defect_confirmed', 'withdrawn_by_raiser'],
      input: { closure_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ voided_at: isoUtc(at) }),
    },
  ],
};
