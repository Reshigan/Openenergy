// black_start — grid black-start capability lifecycle as data.
//
// A generation provider declares that a unit can restart the grid from a total
// blackout with no external supply (self-cranking). The system operator assesses
// it, schedules a LIVE black-start test, witnesses the test, then certifies the
// capability into the restoration plan. During an actual grid collapse the
// operator activates the certified unit and the provider confirms restoration.
//
// The safety spine is STRUCTURAL, not a guard: certify leaves ONLY test_witnessed,
// and the ONLY path into test_witnessed is witness_test. So a black-start
// capability can NEVER be certified before it is physically tested and witnessed —
// no operator can list an untested unit in the restoration plan. Same shape as the
// permit_to_work isolation gate.
//
// A strategic-tier unit (>=100 MW anchor) also crosses to the regulator: certify
// is guarded by regulatorPresentIfStrategic (reads txn.fields.capacity_mw).
//
// settles:false — a capability certification is an operational grid control, never
// a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure restoration-tier bucketing off declared cranking capacity. No clock, no env.
const capabilityTier = (mw: Json | undefined): string => {
  if (typeof mw !== 'number') return 'unrated';
  if (mw >= 100) return 'anchor';
  if (mw >= 20) return 'support';
  return 'local';
};

export const blackStart: ChainDecl = {
  key: 'black_start',
  noun: 'Black-start capability',
  refPrefix: 'BS',
  title: (f) =>
    `Black-start — ${(f.unit_name as string) ?? 'unnamed unit'} @ ${(f.station_name as string) ?? 'unknown station'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Restoration — black-start service', effect: 'requires' },
    { instrument: 'NRS 048', provision: 'quality of supply / restoration performance', effect: 'requires' },
  ],
  roles: ['provider', 'operator', 'regulator'],

  fields: {
    capability_ref: { type: 'string', label: 'Capability ref' },
    provider_party: { type: 'party', role: 'provider', label: 'Capability provider' },
    operator_party: { type: 'party', role: 'operator', label: 'System operator' },
    unit_name: { type: 'string', required: true, label: 'Generating unit' },
    station_name: { type: 'string', required: true, label: 'Station' },
    capacity_mw: { type: 'number', min: 0, label: 'Cranking capacity (MW)' },
    cranking_source: { type: 'string', required: true, label: 'Cranking source (diesel/battery/hydro)' },
    restoration_role: { type: 'string', label: 'Restoration role (anchor/support)' },
    voltage_class: { type: 'string', label: 'Voltage class' },
    target_energisation_minutes: { type: 'number', min: 0, label: 'Target energisation (minutes)' },
    capability_tier: { type: 'string', label: 'Capability tier' },
    test_window: { type: 'string', label: 'Test window' },
    certificate_ref: { type: 'string', label: 'Certificate ref' },
    incident_ref: { type: 'string', label: 'Restoration incident ref' },
    // written by derive, never by the client
    declared_at: { type: 'string', label: 'Declared at' },
    tested_at: { type: 'string', label: 'Test witnessed at' },
    certified_at: { type: 'string', label: 'Certified at' },
    activated_at: { type: 'string', label: 'Activated at' },
    restored_at: { type: 'string', label: 'Restoration confirmed at' },
  },

  initial: 'capability_declared',

  states: {
    capability_declared: { label: 'Capability declared', terminal: false, holder: 'operator', sla: { hours: 24 } },
    under_assessment: { label: 'Under assessment', terminal: false, holder: 'operator', sla: { days: 5 } },
    test_scheduled: { label: 'Test scheduled', terminal: false, holder: 'operator', sla: { days: 30 } },
    test_witnessed: { label: 'Test witnessed', terminal: false, holder: 'operator', sla: { days: 5 } },
    certified: { label: 'Certified (in restoration plan)', terminal: false, holder: 'operator' },
    activated: { label: 'Activated (restoration in progress)', terminal: false, holder: 'provider', sla: { hours: 2 } },
    restoration_complete: { label: 'Restoration complete', terminal: true, holder: 'none' },
    capability_declined: { label: 'Declined', terminal: true, holder: 'none' },
    decertified: { label: 'Decertified', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'capability_declared',
      by: ['provider'],
      actorBecomes: 'provider',
      label: 'Declare black-start capability',
      intent: 'primary',
      input: {
        unit_name: { type: 'string', required: true },
        station_name: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        cranking_source: { type: 'string', required: true },
        restoration_role: { type: 'string' },
        voltage_class: { type: 'string' },
        target_energisation_minutes: { type: 'number', min: 0 },
        operator_party: { type: 'party', role: 'operator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, at: Instant) => ({ declared_at: isoUtc(at), capability_tier: capabilityTier(f.capacity_mw) }),
    },
    {
      id: 'begin_assessment',
      from: 'capability_declared',
      to: 'under_assessment',
      by: ['operator'],
      label: 'Begin capability assessment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'schedule_test',
      from: 'under_assessment',
      to: 'test_scheduled',
      by: ['operator'],
      label: 'Schedule live black-start test',
      intent: 'primary',
      input: { test_window: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural gate part 1: the ONLY edge into test_witnessed, and it only
      // fires from a scheduled test. A witnessed test is a physical event, not a
      // paperwork claim.
      id: 'witness_test',
      from: 'test_scheduled',
      to: 'test_witnessed',
      by: ['operator'],
      label: 'Witness black-start test',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ tested_at: isoUtc(at) }),
    },
    {
      // structural gate part 2: the ONLY edge into certified, and it can only fire
      // from test_witnessed. A capability therefore cannot be certified before its
      // black-start test is witnessed. Strategic (>=100 MW anchor) units also need
      // the regulator on the txn.
      id: 'certify',
      from: 'test_witnessed',
      to: 'certified',
      by: ['operator'],
      label: 'Certify into restoration plan',
      intent: 'primary',
      input: { certificate_ref: { type: 'string' } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at) }),
    },
    {
      id: 'activate',
      from: 'certified',
      to: 'activated',
      by: ['operator'],
      label: 'Activate for grid restoration',
      intent: 'primary',
      input: { incident_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },
    {
      id: 'confirm_restoration',
      from: 'activated',
      to: 'restoration_complete',
      by: ['provider'],
      label: 'Confirm restoration complete',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ restored_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      // a failed witnessed test also lands here (reason: failed_test) — no separate
      // terminal needed.
      id: 'decline_capability',
      from: ['capability_declared', 'under_assessment', 'test_scheduled'],
      to: 'capability_declined',
      by: ['operator', 'system'],
      label: 'Decline capability',
      intent: 'destructive',
      requiresReason: ['technical_infeasible', 'insufficient_cranking', 'failed_test', 'voltage_out_of_range', 'provider_nonresponsive'],
      guards: [],
    },
    {
      id: 'decertify',
      from: ['certified', 'activated'],
      to: 'decertified',
      by: ['operator', 'regulator'],
      label: 'Decertify capability',
      intent: 'destructive',
      requiresReason: ['periodic_retest_failed', 'equipment_degraded', 'regulatory_directive', 'activation_failed'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['capability_declared', 'under_assessment', 'test_scheduled'],
      to: 'withdrawn',
      by: ['provider'],
      label: 'Withdraw declaration',
      intent: 'destructive',
      requiresReason: ['unit_retired', 'commercial', 'rescheduled'],
      guards: [],
    },
  ],

  // test-scheduled time-bar: a scheduled black-start test left un-witnessed for 60
  // days stales out — the restoration plan can't carry an unverified slot.
  timers: [{ onState: 'test_scheduled', after: { days: 60 }, fire: 'decline_capability', kind: 'time_bar', reason: 'provider_nonresponsive' }],
};
