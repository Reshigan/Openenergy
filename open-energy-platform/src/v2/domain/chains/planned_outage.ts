// planned_outage — grid planned-outage window lifecycle as data.
//
// An asset owner / IPP requests a planned outage window against the system
// operator (SO); the SO reviews grid-security impact → approves the window →
// the asset is taken out of service → restored → the SO confirms return to
// service. The safety spine is structural, not a guard: start_outage leaves
// ONLY window_approved, and the only path into window_approved is
// approve_window. So an asset can NEVER be taken out of service before the SO
// has approved the window — the state graph enforces it.
//
// Strategic outages (>=100 MW, i.e. a bulk network security event) cross to the
// regulator: approve_window is guarded by regulatorPresentIfStrategic, which
// reads the txn's capacity_mw and requires a NERSA party on the txn.
//
// settles:false — an outage window is an operational grid control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const plannedOutage: ChainDecl = {
  key: 'planned_outage',
  noun: 'Planned outage',
  refPrefix: 'PO',
  title: (f) =>
    `${(f.outage_type as string) ?? 'grid'} outage — ${(f.asset_name as string) ?? 'unnamed asset'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'outage planning & coordination (System Operations Code)', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's35 system-operator security-of-supply duty', effect: 'requires' },
  ],
  roles: ['requester', 'operator', 'regulator', 'asset_owner'],

  fields: {
    outage_number: { type: 'string', label: 'Outage number' },
    requester_party: { type: 'party', role: 'requester', label: 'Requesting party' },
    operator_party: { type: 'party', role: 'operator', label: 'System operator' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    asset_name: { type: 'string', required: true, label: 'Asset' },
    asset_id: { type: 'string', label: 'Asset id' },
    network_element: { type: 'string', label: 'Network element (line/bay)' },
    outage_type: { type: 'string', required: true, label: 'Type (generation/transmission/substation)' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity affected (MW)' },
    outage_reason: { type: 'string', required: true, label: 'Reason / scope of work' },
    window_start: { type: 'string', label: 'Planned window start' },
    window_end: { type: 'string', label: 'Planned window end' },
    estimated_duration_hours: { type: 'number', min: 0, label: 'Estimated duration (hours)' },
    security_impact: { type: 'string', label: 'SO security-impact assessment' },
    // written by derive, never by the client
    reviewed_at: { type: 'string', label: 'Review started at' },
    approved_at: { type: 'string', label: 'Window approved at' },
    started_at: { type: 'string', label: 'Outage started at' },
    returned_at: { type: 'string', label: 'Returned to service at' },
  },

  initial: 'outage_requested',

  states: {
    outage_requested: { label: 'Outage requested', terminal: false, holder: 'operator', sla: { hours: 24 } },
    under_review: { label: 'Under review', terminal: false, holder: 'operator', sla: { hours: 48 } },
    window_approved: { label: 'Window approved', terminal: false, holder: 'requester' },
    outage_in_progress: { label: 'Outage in progress', terminal: false, holder: 'requester' },
    restoration_pending: { label: 'Restoration pending', terminal: false, holder: 'operator', sla: { hours: 4 } },
    returned_to_service: { label: 'Returned to service', terminal: true, holder: 'none' },
    request_rejected: { label: 'Request rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'outage_requested',
      by: ['requester', 'asset_owner'],
      actorBecomes: 'requester',
      label: 'Request outage window',
      intent: 'primary',
      input: {
        asset_name: { type: 'string', required: true },
        asset_id: { type: 'string' },
        network_element: { type: 'string' },
        outage_type: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        outage_reason: { type: 'string', required: true },
        window_start: { type: 'string' },
        window_end: { type: 'string' },
        estimated_duration_hours: { type: 'number', min: 0 },
        operator_party: { type: 'party', role: 'operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_review',
      from: 'outage_requested',
      to: 'under_review',
      by: ['operator'],
      label: 'Begin grid-security review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ reviewed_at: isoUtc(at) }),
    },
    {
      // strategic outages (>=100 MW) need a regulator on the txn to approve.
      id: 'approve_window',
      from: 'under_review',
      to: 'window_approved',
      by: ['operator'],
      label: 'Approve outage window',
      intent: 'primary',
      input: { security_impact: { type: 'string', required: true } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // structural safety gate: the ONLY edge into outage_in_progress, and it can
      // only fire from window_approved — which only approve_window reaches. An
      // asset therefore cannot be taken out of service before the SO approves.
      id: 'start_outage',
      from: 'window_approved',
      to: 'outage_in_progress',
      by: ['requester', 'asset_owner'],
      label: 'Take asset out of service',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ started_at: isoUtc(at) }),
    },
    {
      id: 'begin_restoration',
      from: 'outage_in_progress',
      to: 'restoration_pending',
      by: ['requester', 'asset_owner'],
      label: 'Work complete — begin restoration',
      intent: 'primary',
      guards: [],
    },
    {
      // return to service is confirmed by the SO, not the requester.
      id: 'return_to_service',
      from: 'restoration_pending',
      to: 'returned_to_service',
      by: ['operator'],
      label: 'Confirm return to service',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ returned_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_request',
      from: ['outage_requested', 'under_review'],
      to: 'request_rejected',
      by: ['operator'],
      label: 'Reject outage request',
      intent: 'destructive',
      requiresReason: ['grid_security_risk', 'clashing_outage', 'insufficient_notice', 'reserve_margin_breach'],
      guards: [],
    },
    {
      id: 'cancel_window',
      from: ['window_approved'],
      to: 'cancelled',
      by: ['operator', 'requester'],
      label: 'Cancel approved window',
      intent: 'destructive',
      requiresReason: ['grid_emergency', 'demand_forecast_change', 'rescheduled', 'resource_unavailable'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['outage_requested', 'under_review'],
      to: 'withdrawn',
      by: ['requester', 'asset_owner'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['work_cancelled', 'rescheduled', 'no_longer_required'],
      guards: [],
    },
  ],

  // outage-overrun time-bar: an asset out of service past its planned window is a
  // grid risk. record-only stub; the sweep computes the real bar off state sla
  // hours (ppa_contract pattern).
  timers: [{ onState: 'outage_in_progress', after: { hours: 0 }, fire: 'begin_restoration', kind: 'time_bar' }],
};
