// wo — field work order (fault dispatch → repair → verify → close) as data.
//
// Pilot chain 5. A dispatcher raises a work order against a site/fault, assigns
// a technician or contractor, who acknowledges, travels, diagnoses, repairs,
// tests, and completes. An operator/dispatcher verifies and closes. Critical
// priority crosses a regulatory line (grid-affecting fault): the assign edge is
// guarded by regulatorPresentIfCritical — a critical WO cannot be assigned
// without a regulator on the txn.
//
// DELIBERATELY no complianceHaltClear anywhere: a platform compliance halt must
// NOT block emergency safety/repair work. Blocking a repair on a POPIA/NERSA
// commitment-halt would be an own-goal (a halt is about new market commitments,
// not keeping the lights on).
//
// NO claim key. A work order does not permanently consume a shared resource; the
// same asset is repaired again and again over its life. (Contrast carbon_retirement,
// where a serial burn is permanent.)
//
// settles:false — a work order is operational, never a payment. Contractor
// invoicing settles on a separate chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const wo: ChainDecl = {
  key: 'wo',
  noun: 'Work order',
  refPrefix: 'WO',
  title: (f) => `${(f.title as string) ?? 'work order'} — ${(f.site_id as string) ?? 'unassigned site'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'network operations & maintenance', effect: 'requires' },
    { instrument: 'OHS Act 1993', provision: 's8 duties of employer', effect: 'requires' },
  ],
  roles: ['dispatcher', 'technician', 'contractor', 'regulator', 'operator'],

  fields: {
    wo_number: { type: 'string', label: 'WO number' },
    site_id: { type: 'string', required: true, label: 'Site' },
    fault_id: { type: 'string', label: 'Originating fault' },
    category: { type: 'string', required: true, label: 'Category' },
    priority: { type: 'string', required: true, label: 'Priority (critical/high/normal/low)' },
    title: { type: 'string', required: true, label: 'Title' },
    description: { type: 'string', label: 'Description' },
    assigned_to: { type: 'party', role: 'technician', label: 'Assigned technician' },
    contractor_id: { type: 'party', role: 'contractor', label: 'Assigned contractor' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    resolution_notes: { type: 'string', label: 'Resolution notes' },
    // written by derive, never by the client
    assigned_at: { type: 'string', label: 'Assigned at' },
    completed_at: { type: 'string', label: 'Completed at' },
    verified_at: { type: 'string', label: 'Verified at' },
    closed_out_at: { type: 'string', label: 'Closed at' },
  },

  initial: 'new',

  states: {
    new: { label: 'New', terminal: false, holder: 'dispatcher', sla: { hours: 4 } },
    assigned: { label: 'Assigned', terminal: false, holder: 'technician', sla: { hours: 2 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'technician', sla: { hours: 4 } },
    en_route: { label: 'En route', terminal: false, holder: 'technician', sla: { hours: 4 } },
    on_site: { label: 'On site', terminal: false, holder: 'technician' },
    diagnose: { label: 'Diagnosing', terminal: false, holder: 'technician' },
    repair: { label: 'Repairing', terminal: false, holder: 'technician' },
    test: { label: 'Testing', terminal: false, holder: 'technician' },
    completed: { label: 'Completed', terminal: false, holder: 'dispatcher', sla: { hours: 24 } },
    verified: { label: 'Verified', terminal: false, holder: 'dispatcher', sla: { hours: 24 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'new',
      by: ['dispatcher', 'operator'],
      actorBecomes: 'dispatcher',
      label: 'Raise work order',
      intent: 'primary',
      input: {
        site_id: { type: 'string', required: true },
        fault_id: { type: 'string' },
        category: { type: 'string', required: true },
        priority: { type: 'string', required: true },
        title: { type: 'string', required: true },
        description: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'assign',
      from: ['new', 'assigned'],
      to: 'assigned',
      by: ['dispatcher', 'operator'],
      label: 'Assign',
      intent: 'primary',
      input: {
        assigned_to: { type: 'party', role: 'technician' },
        contractor_id: { type: 'party', role: 'contractor' },
      },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ assigned_at: isoUtc(at) }),
    },
    { id: 'acknowledge', from: 'assigned', to: 'acknowledged', by: ['technician', 'contractor'], label: 'Acknowledge', intent: 'primary', guards: [] },
    { id: 'depart', from: 'acknowledged', to: 'en_route', by: ['technician', 'contractor'], label: 'Depart', intent: 'primary', guards: [] },
    { id: 'arrive', from: 'en_route', to: 'on_site', by: ['technician', 'contractor'], label: 'Arrive on site', intent: 'primary', guards: [] },
    { id: 'diagnose', from: 'on_site', to: 'diagnose', by: ['technician', 'contractor'], label: 'Begin diagnosis', intent: 'primary', guards: [] },
    { id: 'repair', from: 'diagnose', to: 'repair', by: ['technician', 'contractor'], label: 'Begin repair', intent: 'primary', guards: [] },
    { id: 'test', from: 'repair', to: 'test', by: ['technician', 'contractor'], label: 'Test repair', intent: 'primary', guards: [] },
    {
      id: 'complete',
      from: 'test',
      to: 'completed',
      by: ['technician', 'contractor'],
      label: 'Complete work',
      intent: 'primary',
      input: { resolution_notes: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ completed_at: isoUtc(at) }),
    },
    {
      id: 'verify',
      from: 'completed',
      to: 'verified',
      by: ['dispatcher', 'operator'],
      label: 'Verify work',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'close',
      from: 'verified',
      to: 'closed',
      by: ['dispatcher', 'operator'],
      label: 'Close out',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_out_at: isoUtc(at) }),
    },

    // --- exit -----------------------------------------------------------------
    {
      id: 'cancel',
      from: ['new', 'assigned', 'acknowledged', 'en_route', 'on_site', 'diagnose'],
      to: 'cancelled',
      by: ['dispatcher', 'operator'],
      label: 'Cancel',
      intent: 'destructive',
      requiresReason: ['duplicate', 'no_fault_found', 'superseded', 'access_denied', 'deferred'],
      guards: [],
    },
  ],

  // acknowledgement SLA: an assigned WO not acknowledged in time escalates back
  // to the dispatcher for re-assignment (no auto-transition — sla class surfaces
  // the breach; re-assign is a human act via the assign self-loop).
  timers: [{ onState: 'assigned', after: { hours: 2 }, fire: 'assign', escalate: 'dispatcher', kind: 'sla' }],
};
