// om_work_order — O&M field work-order dispatch lifecycle as data.
//
// Wave 16 legacy home (chain-registry-meridian.ts `om_work_orders` /
// `wo-chain-spec.ts`): a dispatcher-role user (admin/support/om/esums/esco —
// the ESUMS O&M write roles) raises a work order against a site/fault,
// assigns a technician, who acknowledges, departs, arrives, diagnoses,
// repairs, tests, and completes. The work order is then verified and closed.
// `assigned_to` is a technician id, not a contractual counterparty (legacy
// counterpartyCol: null) — so it stays a plain string field, no party role.
//
// Structural honesty (no invented guards):
//  - `close` is the ONLY edge into the terminal `closed` state, and it only
//    fires from `verified` — so a work order can NEVER close without having
//    passed through verification. No guard needed, the state graph enforces it.
//  - `cancel` is guarded by regulatorPresentIfCritical: cancelling a critical
//    work order (grid-affecting fault, per legacy crossesIntoRegulator) must
//    not silently drop off the radar — a regulator must be a live party.
//    Non-critical cancels are unaffected (the guard is a no-op unless
//    priority === 'critical').
//  - DELIBERATELY no complianceHaltClear anywhere: a platform-wide compliance
//    halt must not block safety/repair work already underway.
//
// settles:false — total_cost_zar is a cost figure the record carries, not an
// actual settlement rail; contractor invoicing settles on its own chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const omWorkOrder: ChainDecl = {
  key: 'om_work_order',
  noun: 'O&M work order',
  refPrefix: 'OMWO',
  title: (f) => `${(f.title as string) ?? 'Work order'} — ${(f.site_id as string) ?? 'unassigned site'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'network operations & maintenance', effect: 'requires' },
  ],
  roles: ['admin', 'support', 'om', 'esums', 'esco', 'regulator'],

  fields: {
    wo_number: { type: 'string', label: 'WO number' },
    site_id: { type: 'string', required: true, label: 'Site' },
    fault_id: { type: 'string', label: 'Originating fault' },
    category: { type: 'string', required: true, label: 'Category (corrective/preventive/inspection/cleaning/installation/upgrade)' },
    priority: { type: 'string', required: true, label: 'Priority (critical/high/medium/low)' },
    title: { type: 'string', required: true, label: 'Title' },
    description: { type: 'string', label: 'Description' },
    assigned_to: { type: 'string', label: 'Assigned technician' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    resolution_notes: { type: 'string', label: 'Resolution notes' },
    total_cost_zar: { type: 'number', min: 0, label: 'Total cost (ZAR)' },
    // written by derive, never by the client
    assigned_at: { type: 'string', label: 'Assigned at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    completed_at: { type: 'string', label: 'Completed at' },
    verified_at: { type: 'string', label: 'Verified at' },
    closed_at: { type: 'string', label: 'Closed at' },
  },

  initial: 'created',

  states: {
    created: { label: 'Created', terminal: false, holder: 'support', sla: { minutes: 15 } },
    assigned: { label: 'Assigned', terminal: false, holder: 'support', sla: { minutes: 15 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'support', sla: { minutes: 30 } },
    en_route: { label: 'En route', terminal: false, holder: 'support', sla: { hours: 1 } },
    on_site: { label: 'On site', terminal: false, holder: 'support', sla: { minutes: 30 } },
    diagnosing: { label: 'Diagnosing', terminal: false, holder: 'support', sla: { hours: 1 } },
    repairing: { label: 'Repairing', terminal: false, holder: 'support', sla: { hours: 2 } },
    testing: { label: 'Testing', terminal: false, holder: 'support', sla: { minutes: 30 } },
    completed: { label: 'Completed', terminal: false, holder: 'esco', sla: { hours: 1 } },
    verified: { label: 'Verified', terminal: false, holder: 'esco', sla: { minutes: 30 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'created',
      by: ['admin', 'support', 'om', 'esums', 'esco'],
      actorBecomes: 'support',
      label: 'Raise work order',
      intent: 'primary',
      input: {
        site_id: { type: 'string', required: true },
        category: { type: 'string', required: true },
        priority: { type: 'string', required: true },
        title: { type: 'string', required: true },
        description: { type: 'string' },
        fault_id: { type: 'string' },
        assigned_to: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'assign',
      from: 'created',
      to: 'assigned',
      by: ['admin', 'support', 'om', 'esums', 'esco'],
      label: 'Assign technician',
      intent: 'primary',
      input: { assigned_to: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ assigned_at: isoUtc(at) }),
    },
    {
      id: 'acknowledge',
      from: 'assigned',
      to: 'acknowledged',
      by: ['admin', 'support', 'om', 'esums', 'esco'],
      label: 'Acknowledge',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    { id: 'depart', from: 'acknowledged', to: 'en_route', by: ['admin', 'support', 'om', 'esums', 'esco'], label: 'Depart', intent: 'primary', guards: [] },
    { id: 'arrive', from: 'en_route', to: 'on_site', by: ['admin', 'support', 'om', 'esums', 'esco'], label: 'Arrive on site', intent: 'primary', guards: [] },
    { id: 'diagnose', from: 'on_site', to: 'diagnosing', by: ['admin', 'support', 'om', 'esums', 'esco'], label: 'Diagnose', intent: 'primary', guards: [] },
    { id: 'repair', from: 'diagnosing', to: 'repairing', by: ['admin', 'support', 'om', 'esums', 'esco'], label: 'Repair', intent: 'primary', guards: [] },
    { id: 'test', from: 'repairing', to: 'testing', by: ['admin', 'support', 'om', 'esums', 'esco'], label: 'Test', intent: 'primary', guards: [] },
    {
      id: 'complete',
      from: 'testing',
      to: 'completed',
      by: ['admin', 'support', 'om', 'esums', 'esco'],
      label: 'Complete',
      intent: 'primary',
      input: { resolution_notes: { type: 'string' }, total_cost_zar: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ completed_at: isoUtc(at) }),
    },
    {
      // structural verification gate: the ONLY edge into `closed` is `close`,
      // and `close` only fires from `verified` — a WO cannot close unverified.
      id: 'verify',
      from: 'completed',
      to: 'verified',
      by: ['admin', 'support', 'om', 'esums', 'esco'],
      label: 'Verify completion',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'close',
      from: 'verified',
      to: 'closed',
      by: ['admin', 'support', 'om', 'esums', 'esco'],
      label: 'Close',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },

    // --- exit -------------------------------------------------------------
    {
      // regulatorPresentIfCritical is a no-op unless priority === 'critical'
      // (legacy crossesIntoRegulator: only a critical cancel is regulator-visible).
      id: 'cancel',
      from: ['created', 'assigned', 'acknowledged', 'en_route', 'on_site', 'diagnosing', 'repairing', 'testing', 'completed'],
      to: 'cancelled',
      by: ['admin', 'support', 'om', 'esums', 'esco'],
      label: 'Cancel work order',
      intent: 'destructive',
      requiresReason: ['duplicate', 'no_fault_found', 'superseded', 'access_denied', 'deferred'],
      guards: ['regulatorPresentIfCritical'],
    },
  ],
};
