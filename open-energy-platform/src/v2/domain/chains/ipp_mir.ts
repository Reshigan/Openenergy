// ipp_mir — Material Inspection Record (MIR) lifecycle as data.
//
// An IPP developer logs an inbound material, records its delivery, and takes
// it through inspection: initial visual, then (if warranted) a detailed pass
// with lab test samples and results. An independent inspector signs the
// result off — approved outright, or approved conditionally (crosses the
// lender inbox when a hold-point applies, per legacy cascadeHint — that
// crossing is wired at the route/cascade layer, not modelled as a domain
// guard here, since no structured field like a hold-point flag exists on
// this record). Either approval path can be incorporated into the works —
// terminal. A failed or unsafe material is rejected or quarantined on site
// (quarantine crosses the regulator inbox per legacy cascadeHint, same
// caveat) and, from either, returned to the supplier — terminal.
//
// Independence is enforced on the sign-off edges (approve_material /
// approve_conditional) by counterpartyDistinct: the inspector recorded on the
// txn cannot be the same legal entity as the IPP developer who logged the
// material — the core self-certification risk for a QA record. No other
// registry guard keys off fields this table carries (no capacity_mw,
// priority, live_work, credit/cp refs, or serial ranges).
//
// settles:false — a material inspection record is a construction QA record,
// never a payment (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippMir: ChainDecl = {
  key: 'ipp_mir',
  noun: 'Material inspection record',
  refPrefix: 'MIR',
  title: (f) => `MIR — ${(f.material_description as string) ?? 'unnamed material'} (${(f.material_tier as string) ?? 'tier TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [{ instrument: 'REIPPPP', provision: 'EPC contract quality-control & materials acceptance', effect: 'requires' }],
  roles: ['ipp_developer', 'inspector', 'regulator', 'lender', 'operator'],

  fields: {
    mir_number: { type: 'string', label: 'MIR number' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    inspector_party: { type: 'party', role: 'inspector', label: 'Inspector' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (critical-safety crossing)' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender (hold-point crossing)' },
    project_id: { type: 'string', required: true, label: 'Project' },
    material_description: { type: 'string', required: true, label: 'Material' },
    material_category: { type: 'string', required: true, label: 'Category' },
    material_tier: { type: 'string', required: true, label: 'Tier (critical_structural/electrical_mechanical/civil/general)' },
    lab_name: { type: 'string', label: 'Laboratory name' },
    lab_sample_ref: { type: 'string', label: 'Lab sample reference' },
    test_results: { type: 'string', label: 'Test results' },
    test_passed: { type: 'boolean', label: 'Test passed' },
    conditional_notes: { type: 'string', label: 'Conditional approval notes' },
    quarantine_reason: { type: 'string', label: 'Quarantine reason' },
    rejection_reason: { type: 'string', label: 'Rejection reason' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    delivered_at: { type: 'string', label: 'Delivered at' },
    initial_inspection_started_at: { type: 'string', label: 'Initial inspection started at' },
    detailed_inspection_started_at: { type: 'string', label: 'Detailed inspection started at' },
    samples_taken_at: { type: 'string', label: 'Samples taken at' },
    results_received_at: { type: 'string', label: 'Results received at' },
    approved_at: { type: 'string', label: 'Approved at' },
    conditional_approved_at: { type: 'string', label: 'Conditionally approved at' },
    incorporated_at: { type: 'string', label: 'Incorporated at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    quarantined_at: { type: 'string', label: 'Quarantined at' },
    returned_at: { type: 'string', label: 'Returned to supplier at' },
  },

  initial: 'delivery_notified',

  states: {
    delivery_notified: { label: 'Delivery notified', terminal: false, holder: 'ipp_developer', sla: { hours: 48 } },
    delivered: { label: 'Delivered', terminal: false, holder: 'inspector', sla: { hours: 24 } },
    initial_inspection: { label: 'Initial inspection', terminal: false, holder: 'inspector', sla: { hours: 24 } },
    detailed_inspection: { label: 'Detailed inspection', terminal: false, holder: 'inspector', sla: { days: 2 } },
    test_sampling: { label: 'Test sampling', terminal: false, holder: 'inspector', sla: { days: 3 } },
    results_pending: { label: 'Results pending', terminal: false, holder: 'inspector', sla: { days: 2 } },
    approved: { label: 'Approved', terminal: false, holder: 'ipp_developer', sla: { hours: 24 } },
    conditional_approval: { label: 'Conditional approval', terminal: false, holder: 'ipp_developer', sla: { hours: 24 } },
    rejected_on_site: { label: 'Rejected on site', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    quarantined: { label: 'Quarantined', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    incorporated: { label: 'Incorporated', terminal: true, holder: 'none' },
    returned_to_supplier: { label: 'Returned to supplier', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'delivery_notified',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Log material inspection',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        material_description: { type: 'string', required: true },
        material_category: { type: 'string', required: true },
        material_tier: { type: 'string', required: true },
        inspector_party: { type: 'party', role: 'inspector' },
      },
      guards: [],
    },
    {
      id: 'record_delivery',
      from: 'delivery_notified',
      to: 'delivered',
      by: ['ipp_developer', 'operator'],
      label: 'Record delivery',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ delivered_at: isoUtc(at) }),
    },
    {
      id: 'start_initial_inspection',
      from: 'delivered',
      to: 'initial_inspection',
      by: ['inspector', 'ipp_developer', 'operator'],
      label: 'Start inspection',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ initial_inspection_started_at: isoUtc(at) }),
    },
    {
      id: 'proceed_to_detailed',
      from: 'initial_inspection',
      to: 'detailed_inspection',
      by: ['inspector', 'operator'],
      label: 'Detailed inspection',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ detailed_inspection_started_at: isoUtc(at) }),
    },
    {
      id: 'take_test_samples',
      from: 'detailed_inspection',
      to: 'test_sampling',
      by: ['inspector', 'operator'],
      label: 'Take test samples',
      intent: 'primary',
      input: { lab_name: { type: 'string' }, lab_sample_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ samples_taken_at: isoUtc(at) }),
    },
    {
      id: 'await_results',
      from: 'test_sampling',
      to: 'results_pending',
      by: ['inspector', 'operator'],
      label: 'Await test results',
      intent: 'primary',
      input: { test_results: { type: 'string' }, test_passed: { type: 'boolean' } },
      guards: [],
      derive: (_f, at: Instant) => ({ results_received_at: isoUtc(at) }),
    },
    {
      // independence gate: the inspector signing off cannot be the IPP
      // developer who logged the material — self-certification risk.
      id: 'approve_material',
      from: 'results_pending',
      to: 'approved',
      by: ['inspector', 'operator'],
      label: 'Approve',
      intent: 'primary',
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      id: 'approve_conditional',
      from: 'results_pending',
      to: 'conditional_approval',
      by: ['inspector', 'operator'],
      label: 'Approve conditional',
      intent: 'secondary',
      input: {
        conditional_notes: { type: 'string', required: true },
        lender_party: { type: 'party', role: 'lender' },
      },
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ conditional_approved_at: isoUtc(at) }),
    },
    {
      id: 'incorporate_material',
      from: ['approved', 'conditional_approval'],
      to: 'incorporated',
      by: ['ipp_developer', 'operator'],
      label: 'Incorporate',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ incorporated_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_material',
      from: ['initial_inspection', 'detailed_inspection', 'test_sampling', 'results_pending'],
      to: 'rejected_on_site',
      by: ['inspector', 'operator'],
      label: 'Reject',
      intent: 'destructive',
      input: { rejection_reason: { type: 'string', required: true } },
      // v1 carries free-text rejection_reason, not a reason_code — no requiresReason.
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'quarantine_material',
      from: ['delivered', 'initial_inspection', 'detailed_inspection', 'test_sampling', 'results_pending'],
      to: 'quarantined',
      by: ['inspector', 'ipp_developer', 'operator'],
      label: 'Quarantine material',
      intent: 'destructive',
      input: {
        quarantine_reason: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // v1 carries free-text quarantine_reason, not a reason_code — no requiresReason.
      guards: [],
      derive: (_f, at: Instant) => ({ quarantined_at: isoUtc(at) }),
    },
    {
      id: 'return_to_supplier',
      from: ['rejected_on_site', 'quarantined'],
      to: 'returned_to_supplier',
      by: ['ipp_developer', 'operator'],
      label: 'Return to supplier',
      intent: 'destructive',
      input: { notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ returned_at: isoUtc(at) }),
    },
  ],
};
