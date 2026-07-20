// spare_parts_provisioning — the maintenance spare-part demand-to-issue lifecycle
// as data.
//
// A maintenance planner identifies demand for a spare (off a W71 RUL signal, a
// W16 work order, a reorder point, or manually), raises a requisition, gets it
// approved, issues a PO to a supplier, receives → inspects/stocks the goods, then
// reserves and issues the part to the job. The inventory-integrity spine is
// STRUCTURAL: issue_part leaves ONLY `reserved`, `reserved` is reachable ONLY from
// `stocked`, and `stocked` ONLY from `received`. So a part can NEVER be issued to a
// job before it has physically been received and stocked — no guard needed, the
// state graph forbids issuing phantom stock. Every business rule here is a
// structural state-graph gate or a requiresReason exit; no guard genuinely fits
// (counterpartyDistinct can't isolate planner-vs-supplier while an approver party
// is also on the txn), so guards stay empty.
//
// settles:false — provisioning is an operational inventory control, not a payment
// rail. The PO value is recorded, never settled here (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure provisioning-tier bucketing off criticality + stockout economics. No clock.
const tierFor = (criticality: Json | undefined, stockoutZar: Json | undefined): string => {
  const impact = typeof stockoutZar === 'number' ? stockoutZar : 0;
  if (criticality === 'vital') return impact >= 1_000_000 ? 'catastrophic' : 'critical';
  if (criticality === 'essential') return impact >= 250_000 ? 'important' : 'standard';
  return 'routine';
};

export const sparePartsProvisioning: ChainDecl = {
  key: 'spare_parts_provisioning',
  noun: 'Spare-parts provisioning',
  refPrefix: 'SPP',
  title: (f) =>
    `${(f.criticality as string) ?? 'spare'} — ${(f.part_number as string) ?? 'part'} for ${(f.asset_name as string) ?? 'asset'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'network asset maintenance & spares holding', effect: 'requires' },
    { instrument: 'OHS Act 1993', provision: 's8 safe plant — fit-for-purpose replacement parts', effect: 'requires' },
  ],
  roles: ['planner', 'approver', 'supplier'],

  fields: {
    line_number: { type: 'string', label: 'Line number' },
    planner_party: { type: 'party', role: 'planner', label: 'Maintenance planner' },
    approver_party: { type: 'party', role: 'approver', label: 'Requisition approver' },
    supplier_party: { type: 'party', role: 'supplier', label: 'Supplier / OEM' },
    part_number: { type: 'string', required: true, label: 'Part number' },
    part_description: { type: 'string', label: 'Part description' },
    oem_name: { type: 'string', label: 'OEM' },
    asset_name: { type: 'string', required: true, label: 'Asset served' },
    site_name: { type: 'string', label: 'Site' },
    warehouse: { type: 'string', label: 'Stocking warehouse' },
    criticality: { type: 'string', required: true, label: 'Criticality (vital/essential/desirable)' },
    demand_source: { type: 'string', label: 'Demand source (predictive_rul/work_order/reorder_point/manual/rma_replacement)' },
    qty_required: { type: 'number', required: true, min: 1, label: 'Qty required' },
    qty_ordered: { type: 'number', min: 0, label: 'Qty ordered' },
    qty_received: { type: 'number', min: 0, label: 'Qty received' },
    unit_cost_zar: { type: 'number', min: 0, label: 'Unit cost (ZAR)' },
    lead_time_days: { type: 'number', min: 0, label: 'Lead time (days)' },
    rul_days: { type: 'number', label: 'RUL signal (days)' },
    stockout_impact_zar: { type: 'number', min: 0, label: 'Stockout impact (ZAR)' },
    provisioning_tier: { type: 'string', label: 'Provisioning tier' },
    reserved_for_wo: { type: 'string', label: 'Reserved for work order' },
    backorder_round: { type: 'number', label: 'Backorder rounds' },
    demand_basis: { type: 'string', label: 'Demand basis' },
    // refs
    requisition_ref: { type: 'string', label: 'Requisition ref' },
    approval_ref: { type: 'string', label: 'Approval ref' },
    po_ref: { type: 'string', label: 'PO ref' },
    shipment_ref: { type: 'string', label: 'Shipment ref' },
    receipt_ref: { type: 'string', label: 'Receipt ref' },
    reservation_ref: { type: 'string', label: 'Reservation ref' },
    issue_ref: { type: 'string', label: 'Issue ref' },
    // written by derive, never by the client
    requisition_raised_at: { type: 'string', label: 'Requisition raised at' },
    requisition_approved_at: { type: 'string', label: 'Requisition approved at' },
    po_issued_at: { type: 'string', label: 'PO issued at' },
    backordered_at: { type: 'string', label: 'Backordered at' },
    shipped_at: { type: 'string', label: 'Shipped at' },
    received_at: { type: 'string', label: 'Received at' },
    stocked_at: { type: 'string', label: 'Stocked at' },
    reserved_at: { type: 'string', label: 'Reserved at' },
    issued_at: { type: 'string', label: 'Issued at' },
    returned_at: { type: 'string', label: 'Returned at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
  },

  initial: 'demand_identified',

  states: {
    demand_identified: { label: 'Demand identified', terminal: false, holder: 'planner', sla: { hours: 24 } },
    requisition_raised: { label: 'Requisition raised', terminal: false, holder: 'approver', sla: { hours: 24 } },
    requisition_approved: { label: 'Requisition approved', terminal: false, holder: 'planner', sla: { hours: 8 } },
    po_issued: { label: 'PO issued', terminal: false, holder: 'supplier', sla: { days: 3 } },
    backordered: { label: 'Backordered', terminal: false, holder: 'supplier' },
    in_transit: { label: 'In transit', terminal: false, holder: 'planner' },
    received: { label: 'Received', terminal: false, holder: 'planner', sla: { hours: 8 } },
    stocked: { label: 'Stocked', terminal: false, holder: 'planner' },
    reserved: { label: 'Reserved', terminal: false, holder: 'planner' },
    issued: { label: 'Issued', terminal: true, holder: 'none' },
    returned: { label: 'Returned', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'demand_identified',
      by: ['planner'],
      actorBecomes: 'planner',
      label: 'Identify demand',
      intent: 'primary',
      input: {
        part_number: { type: 'string', required: true },
        part_description: { type: 'string' },
        oem_name: { type: 'string' },
        asset_name: { type: 'string', required: true },
        site_name: { type: 'string' },
        criticality: { type: 'string', required: true },
        demand_source: { type: 'string' },
        qty_required: { type: 'number', required: true, min: 1 },
        unit_cost_zar: { type: 'number', min: 0 },
        lead_time_days: { type: 'number', min: 0 },
        rul_days: { type: 'number' },
        stockout_impact_zar: { type: 'number', min: 0 },
        demand_basis: { type: 'string' },
        approver_party: { type: 'party', role: 'approver' },
        supplier_party: { type: 'party', role: 'supplier' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ provisioning_tier: tierFor(f.criticality, f.stockout_impact_zar) }),
    },
    {
      id: 'raise_requisition',
      from: 'demand_identified',
      to: 'requisition_raised',
      by: ['planner'],
      label: 'Raise requisition',
      intent: 'primary',
      input: { requisition_ref: { type: 'string', required: true }, qty_ordered: { type: 'number', min: 1 }, warehouse: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ requisition_raised_at: isoUtc(at) }),
    },
    {
      id: 'approve_requisition',
      from: 'requisition_raised',
      to: 'requisition_approved',
      by: ['approver'],
      label: 'Approve requisition',
      intent: 'primary',
      input: { approval_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ requisition_approved_at: isoUtc(at) }),
    },
    {
      id: 'issue_po',
      from: 'requisition_approved',
      to: 'po_issued',
      by: ['planner'],
      label: 'Issue purchase order',
      intent: 'primary',
      input: { po_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ po_issued_at: isoUtc(at) }),
    },
    {
      id: 'backorder',
      from: 'po_issued',
      to: 'backordered',
      by: ['supplier'],
      label: 'Flag backorder',
      intent: 'secondary',
      requiresReason: ['supplier_stockout', 'allocation_shortfall', 'manufacturing_delay', 'customs_hold'],
      guards: [],
      derive: (f, at: Instant) => ({
        backorder_round: (typeof f.backorder_round === 'number' ? f.backorder_round : 0) + 1,
        backordered_at: isoUtc(at),
      }),
    },
    {
      id: 'ship',
      from: 'po_issued',
      to: 'in_transit',
      by: ['supplier'],
      label: 'Ship',
      intent: 'primary',
      input: { shipment_ref: { type: 'string', required: true }, qty_ordered: { type: 'number', min: 1 } },
      guards: [],
      derive: (_f, at: Instant) => ({ shipped_at: isoUtc(at) }),
    },
    {
      id: 'ship_backorder',
      from: 'backordered',
      to: 'in_transit',
      by: ['supplier'],
      label: 'Ship (backorder fulfilled)',
      intent: 'primary',
      input: { shipment_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ shipped_at: isoUtc(at) }),
    },
    {
      id: 'receive',
      from: 'in_transit',
      to: 'received',
      by: ['planner'],
      label: 'Receive goods',
      intent: 'primary',
      input: { receipt_ref: { type: 'string', required: true }, qty_received: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ received_at: isoUtc(at) }),
    },
    {
      id: 'stock',
      from: 'received',
      to: 'stocked',
      by: ['planner'],
      label: 'Inspect & stock',
      intent: 'primary',
      input: { warehouse: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ stocked_at: isoUtc(at) }),
    },
    {
      id: 'reserve',
      from: 'stocked',
      to: 'reserved',
      by: ['planner'],
      label: 'Reserve for job',
      intent: 'primary',
      input: { reservation_ref: { type: 'string', required: true }, reserved_for_wo: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ reserved_at: isoUtc(at) }),
    },
    {
      // structural inventory gate: the ONLY edge into `issued`, reachable ONLY from
      // `reserved` — which trails received → stocked → reserved. A part therefore
      // cannot be issued before it is physically received and stocked. No guard.
      id: 'issue_part',
      from: 'reserved',
      to: 'issued',
      by: ['planner'],
      label: 'Issue part to job',
      intent: 'primary',
      input: { issue_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ issued_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'return_part',
      from: ['received', 'stocked', 'reserved'],
      to: 'returned',
      by: ['planner'],
      label: 'Return to supplier (RMA)',
      intent: 'destructive',
      requiresReason: ['defective_on_receipt', 'wrong_part', 'damaged_in_transit', 'failed_inspection'],
      guards: [],
      derive: (_f, at: Instant) => ({ returned_at: isoUtc(at) }),
    },
    {
      id: 'cancel',
      from: ['demand_identified', 'requisition_raised', 'requisition_approved', 'po_issued', 'backordered'],
      to: 'cancelled',
      by: ['planner', 'approver', 'system'],
      label: 'Cancel provisioning',
      intent: 'destructive',
      requiresReason: ['demand_withdrawn', 'asset_decommissioned', 'duplicate_line', 'budget_withheld', 'approval_window_elapsed'],
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
  ],

  // requisition staleness bar: a requisition left unapproved for 30 days is a
  // stale demand — auto-cancel (never auto-approve) and the planner re-raises if
  // the need still stands; escalate keeps the planner in the loop.
  timers: [{ onState: 'requisition_raised', after: { days: 30 }, fire: 'cancel', escalate: 'planner', kind: 'time_bar', reason: 'approval_window_elapsed' }],
};
