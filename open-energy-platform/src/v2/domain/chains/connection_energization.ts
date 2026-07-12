// connection_energization — grid connection go-live lifecycle as data.
//
// An applicant (IPP / large customer) requests to energize a connection point
// against a grid connection agreement; the grid operator inspects → witness-
// tests protection & compliance → clears → energizes. The safety spine is
// structural, not a guard: `energize` leaves ONLY cleared_to_energize, and the
// ONLY path into cleared_to_energize is clear_for_energization out of
// witness_testing. So a connection can NEVER go live before witness testing has
// passed — the state graph enforces it, no guard needed.
//
// Strategic connections (≥100 MW) also cross to the regulator:
// clear_for_energization is guarded by regulatorPresentIfStrategic (reads the
// txn's carried capacity_mw). NERSA must be a live party to authorise a
// strategic-tier energization.
//
// settles:false — energizing a connection is an operational grid control, never
// a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure connection-tier bucketing off the nameplate capacity (MW). No clock.
const connectionTier = (mw: Json | undefined): string => {
  if (typeof mw !== 'number') return 'unrated';
  if (mw >= 100) return 'strategic';
  if (mw >= 20) return 'large';
  return 'small';
};

export const connectionEnergization: ChainDecl = {
  key: 'connection_energization',
  noun: 'Connection energization',
  refPrefix: 'CE',
  title: (f) =>
    `Energize ${(f.connection_point as string) ?? 'connection'} — ${
      typeof f.capacity_mw === 'number' ? `${f.capacity_mw} MW` : 'unrated'
    }`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Connection & network code — energization & compliance witnessing', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's8 licence conditions — network connection', effect: 'requires' },
  ],
  roles: ['applicant', 'operator', 'regulator'],

  fields: {
    connection_ref: { type: 'string', label: 'Connection ref' },
    applicant_party: { type: 'party', role: 'applicant', label: 'Applicant' },
    operator_party: { type: 'party', role: 'operator', label: 'Grid operator' },
    connection_point: { type: 'string', required: true, label: 'Connection point / substation bay' },
    gca_ref: { type: 'string', required: true, label: 'Grid connection agreement ref' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Nameplate capacity (MW)' },
    voltage_kv: { type: 'number', min: 0, label: 'Connection voltage (kV)' },
    connection_tier: { type: 'string', label: 'Connection tier' },
    inspection_ref: { type: 'string', label: 'Inspection report ref' },
    witness_test_ref: { type: 'string', label: 'Witness-test certificate ref' },
    defect_count: { type: 'number', label: 'Defects raised' },
    // written by derive, never by the client
    cleared_at: { type: 'string', label: 'Cleared to energize at' },
    energized_at: { type: 'string', label: 'Energized at' },
  },

  initial: 'energization_requested',

  states: {
    energization_requested: { label: 'Energization requested', terminal: false, holder: 'operator', sla: { hours: 24 } },
    inspection: { label: 'Inspection', terminal: false, holder: 'operator', sla: { hours: 48 } },
    witness_testing: { label: 'Witness testing', terminal: false, holder: 'operator', sla: { hours: 24 } },
    defect_hold: { label: 'Defect hold', terminal: false, holder: 'operator' },
    cleared_to_energize: { label: 'Cleared to energize', terminal: false, holder: 'operator', sla: { hours: 12 } },
    energized: { label: 'Energized', terminal: true, holder: 'none' },
    connection_rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'energization_requested',
      by: ['applicant', 'operator'],
      actorBecomes: 'applicant',
      label: 'Request energization',
      intent: 'primary',
      input: {
        connection_point: { type: 'string', required: true },
        gca_ref: { type: 'string', required: true },
        capacity_mw: { type: 'number', required: true, min: 0 },
        voltage_kv: { type: 'number', min: 0 },
        operator_party: { type: 'party', role: 'operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ connection_tier: connectionTier(f.capacity_mw) }),
    },
    {
      id: 'begin_inspection',
      from: 'energization_requested',
      to: 'inspection',
      by: ['operator'],
      label: 'Begin inspection',
      intent: 'primary',
      guards: [],
    },
    {
      // physical inspection signed off → witness testing. Structural step on the
      // only path toward cleared_to_energize.
      id: 'record_inspection',
      from: 'inspection',
      to: 'witness_testing',
      by: ['operator'],
      label: 'Record inspection & begin witness testing',
      intent: 'primary',
      input: { inspection_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'raise_defect',
      from: ['inspection', 'witness_testing'],
      to: 'defect_hold',
      by: ['operator'],
      label: 'Raise defect',
      intent: 'secondary',
      requiresReason: ['protection_failure', 'earthing_defect', 'metering_defect', 'documentation_gap', 'compliance_shortfall'],
      guards: [],
      derive: (f, _at: Instant) => ({ defect_count: (typeof f.defect_count === 'number' ? f.defect_count : 0) + 1 }),
    },
    {
      // a resolved defect re-enters inspection — the connection is re-verified
      // from scratch, never fast-tracked back into clearance.
      id: 'resolve_defect',
      from: 'defect_hold',
      to: 'inspection',
      by: ['operator'],
      label: 'Resolve defect & re-inspect',
      intent: 'primary',
      guards: [],
    },
    {
      // witness tests passed → cleared. Strategic (≥100 MW) connections need a
      // regulator on the txn (reads carried capacity_mw).
      id: 'clear_for_energization',
      from: 'witness_testing',
      to: 'cleared_to_energize',
      by: ['operator'],
      label: 'Clear for energization',
      intent: 'primary',
      input: { witness_test_ref: { type: 'string', required: true } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ cleared_at: isoUtc(at) }),
    },
    {
      // structural safety gate: the ONLY edge into energized, and it can only
      // fire from cleared_to_energize — which only clear_for_energization
      // reaches out of witness_testing. A connection therefore cannot energize
      // before witness testing passed. No guard.
      id: 'energize',
      from: 'cleared_to_energize',
      to: 'energized',
      by: ['operator'],
      label: 'Energize connection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ energized_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_connection',
      from: ['energization_requested', 'inspection', 'witness_testing', 'defect_hold'],
      to: 'connection_rejected',
      by: ['operator', 'regulator'],
      label: 'Reject connection',
      intent: 'destructive',
      requiresReason: ['non_compliant', 'unresolved_defects', 'capacity_unavailable', 'gca_breach', 'safety_risk'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['energization_requested', 'inspection'],
      to: 'withdrawn',
      by: ['applicant'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['project_cancelled', 'rescheduled', 'no_longer_required'],
      guards: [],
    },
  ],

  // cleared-to-energize is a bounded authorization: an energization clearance
  // left unacted stales out (network state cannot be assumed indefinitely).
  // record-only stub; the sweep computes the real bar off the state's sla hours.
  timers: [{ onState: 'cleared_to_energize', after: { hours: 0 }, fire: 'reject_connection', kind: 'time_bar' }],
};
