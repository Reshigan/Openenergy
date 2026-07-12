// oem_fco — OEM Field Change Order lifecycle as data.
//
// A manufacturer (OEM) issues a Field Change Order against a fielded equipment
// model and a range of affected unit serials: a mandatory or recommended
// modification the fleet operator must apply and the OEM then verifies. The
// spine is structural — close_fco leaves ONLY `verification`, and the only path
// into `verification` is submit_verification, which itself only fires from
// `in_progress`. So an FCO can NEVER be closed (units certified modified) unless
// the modification was actually applied and submitted for verification. No guard
// enforces this; the state graph does.
//
// A critical (safety-classified) FCO crosses to the regulator: acknowledge_fco
// is guarded by regulatorPresentIfCritical, so a critical order opened without a
// regulator party on the txn cannot enter remediation.
//
// NO claim key. An FCO is not exclusive consumption of a resource — successive
// revisions target the same model/serials over the fleet's life; a permanent
// claim would wrongly lock the serial range forever.
//
// settles:false — an FCO is an engineering compliance control, never a payment
// (R-S5-1). Any parts/labour billing rides a separate settling chain.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure remediation-urgency bucketing off the priority string. No clock, no env.
const remediationTier = (priority: Json | undefined): string => {
  if (priority === 'critical') return 'immediate';
  if (priority === 'urgent') return 'expedited';
  return 'scheduled';
};

export const oemFco: ChainDecl = {
  key: 'oem_fco',
  noun: 'OEM field change order',
  refPrefix: 'OF',
  title: (f) =>
    `${(f.fco_number as string) ?? 'FCO'} — ${(f.equipment_model as string) ?? 'unknown model'} (${(f.fco_title as string) ?? 'field change'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'plant modification & compliance obligations', effect: 'requires' },
    { instrument: 'OHS Act 1993', provision: 'General Machinery Regs — safe plant & machinery', effect: 'requires' },
  ],
  roles: ['oem', 'operator', 'regulator'],

  fields: {
    fco_number: { type: 'string', label: 'FCO number' },
    oem_party: { type: 'party', role: 'oem', label: 'Issuing OEM' },
    operator_party: { type: 'party', role: 'operator', label: 'Fleet operator' },
    equipment_model: { type: 'string', required: true, label: 'Equipment model' },
    fco_title: { type: 'string', required: true, label: 'FCO title' },
    change_description: { type: 'string', required: true, label: 'Change description' },
    root_cause: { type: 'string', label: 'Root cause' },
    mandatory: { type: 'boolean', label: 'Mandatory modification' },
    priority: { type: 'string', label: 'Priority (routine/urgent/critical)' },
    remediation_tier: { type: 'string', label: 'Remediation tier' },
    serial_start: { type: 'number', min: 0, label: 'Affected serial — start' },
    serial_end: { type: 'number', min: 0, label: 'Affected serial — end' },
    affected_units: { type: 'number', min: 0, label: 'Affected units' },
    units_modified: { type: 'number', min: 0, label: 'Units modified' },
    planned_start: { type: 'string', label: 'Planned rollout start' },
    // written by derive, never by the client
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    scheduled_at: { type: 'string', label: 'Scheduled at' },
    closed_at_fco: { type: 'string', label: 'FCO closed at' },
  },

  initial: 'issued',

  states: {
    issued: { label: 'Issued', terminal: false, holder: 'operator', sla: { hours: 48 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'operator', sla: { hours: 72 } },
    scheduled: { label: 'Rollout scheduled', terminal: false, holder: 'operator' },
    in_progress: { label: 'Rollout in progress', terminal: false, holder: 'operator' },
    verification: { label: 'Verification', terminal: false, holder: 'oem', sla: { hours: 48 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'issued',
      by: ['oem'],
      actorBecomes: 'oem',
      label: 'Issue field change order',
      intent: 'primary',
      input: {
        equipment_model: { type: 'string', required: true },
        fco_title: { type: 'string', required: true },
        change_description: { type: 'string', required: true },
        root_cause: { type: 'string' },
        mandatory: { type: 'boolean' },
        priority: { type: 'string' },
        serial_start: { type: 'number', min: 0 },
        serial_end: { type: 'number', min: 0 },
        affected_units: { type: 'number', min: 0 },
        operator_party: { type: 'party', role: 'operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'acknowledge_fco',
      from: 'issued',
      to: 'acknowledged',
      by: ['operator'],
      label: 'Acknowledge FCO',
      intent: 'primary',
      // a critical (safety) FCO crosses to the regulator: one must be a party.
      guards: ['regulatorPresentIfCritical'],
      derive: (f, at: Instant) => ({
        acknowledged_at: isoUtc(at),
        remediation_tier: remediationTier(f.priority),
      }),
    },
    {
      id: 'schedule_rollout',
      from: 'acknowledged',
      to: 'scheduled',
      by: ['operator'],
      label: 'Schedule rollout',
      intent: 'primary',
      input: { planned_start: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ scheduled_at: isoUtc(at) }),
    },
    {
      id: 'begin_rollout',
      from: 'scheduled',
      to: 'in_progress',
      by: ['operator'],
      label: 'Begin rollout',
      intent: 'primary',
      guards: [],
    },
    {
      // structural gate: the ONLY edge into verification, from in_progress only.
      id: 'submit_verification',
      from: 'in_progress',
      to: 'verification',
      by: ['operator'],
      label: 'Submit for verification',
      intent: 'primary',
      input: { units_modified: { type: 'number', min: 0, required: true } },
      guards: [],
    },
    {
      // the ONLY edge into closed, from verification only — so an FCO cannot
      // close without having been applied and submitted.
      id: 'close_fco',
      from: 'verification',
      to: 'closed',
      by: ['oem'],
      label: 'Close FCO',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_fco: isoUtc(at) }),
    },
    {
      id: 'return_for_rework',
      from: 'verification',
      to: 'in_progress',
      by: ['oem'],
      label: 'Return for rework',
      intent: 'secondary',
      requiresReason: ['modification_incomplete', 'defect_persists', 'wrong_procedure', 'evidence_insufficient'],
      guards: [],
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_fco',
      from: ['issued', 'acknowledged'],
      to: 'rejected',
      by: ['operator'],
      label: 'Reject FCO',
      intent: 'destructive',
      requiresReason: ['not_applicable', 'equipment_decommissioned', 'serials_out_of_fleet', 'safety_dispute'],
      guards: [],
    },
    {
      id: 'cancel_fco',
      from: ['issued', 'acknowledged', 'scheduled', 'in_progress', 'verification'],
      to: 'cancelled',
      by: ['oem', 'regulator'],
      label: 'Cancel FCO',
      intent: 'destructive',
      requiresReason: ['superseded_by_revision', 'issued_in_error', 'recall_upgraded', 'no_longer_required'],
      guards: [],
    },
  ],
};
