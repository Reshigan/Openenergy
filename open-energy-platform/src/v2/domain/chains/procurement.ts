// procurement — IPP construction procurement-package lifecycle as data.
//
// A buyer (procurement lead) raises a requisition, issues an RFQ, evaluates
// bids, awards to a supplier, cuts a PO, takes delivery, and closes the
// package. Two structural spines, no guard needed for either:
//   - issue_po leaves ONLY `awarded`, and the ONLY path into `awarded` is the
//     award edge from `bids_evaluating`. A PO therefore can NEVER be cut without
//     a competed award behind it — the state graph forbids the shortcut.
//   - award additionally runs counterpartyDistinct: the buyer cannot award a
//     package to itself (self-dealing on public IPP procurement).
//
// settles:false — a procurement package is a construction control artefact; the
// PO commits spend but this chain records it, it does not move money (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure award-variance vs. the pre-award estimate. No clock, no env.
const variancePct = (estimate: Json | undefined, award: Json | undefined): number => {
  if (typeof estimate !== 'number' || typeof award !== 'number' || estimate <= 0) return 0;
  return Math.round(((award - estimate) / estimate) * 10000) / 100;
};

export const procurement: ChainDecl = {
  key: 'procurement',
  noun: 'Procurement package',
  refPrefix: 'PROC',
  title: (f) => `${(f.discipline as string) ?? 'general'} procurement — ${(f.package_title as string) ?? 'untitled package'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'local-content & procurement obligations', effect: 'requires' },
    { instrument: 'PFMA / Treasury SCM', provision: 'competitive procurement & award record', effect: 'requires' },
  ],
  roles: ['buyer', 'supplier', 'operator'],

  fields: {
    package_ref: { type: 'string', label: 'Package ref' },
    package_title: { type: 'string', required: true, label: 'Package title' },
    discipline: { type: 'string', required: true, label: 'Discipline (mechanical/electrical/civil)' },
    buyer_party: { type: 'party', role: 'buyer', label: 'Buyer' },
    supplier_party: { type: 'party', role: 'supplier', label: 'Supplier' },
    scope_description: { type: 'string', required: true, label: 'Scope description' },
    estimated_value: { type: 'number', min: 0, label: 'Estimated value (ZAR)' },
    delivery_site: { type: 'string', label: 'Delivery site' },
    incoterm: { type: 'string', label: 'Incoterm' },
    rfq_ref: { type: 'string', label: 'RFQ ref' },
    bid_count: { type: 'number', min: 0, label: 'Bids received' },
    award_value: { type: 'number', min: 0, label: 'Award value (ZAR)' },
    po_number: { type: 'string', label: 'PO number' },
    // written by derive, never by the client
    award_variance_pct: { type: 'number', label: 'Award variance vs estimate (%)' },
    awarded_at: { type: 'string', label: 'Awarded at' },
    po_issued_at: { type: 'string', label: 'PO issued at' },
    delivered_at: { type: 'string', label: 'Delivered at' },
    closed_at_proc: { type: 'string', label: 'Package closed at' },
  },

  initial: 'requisition_raised',

  states: {
    requisition_raised: { label: 'Requisition raised', terminal: false, holder: 'buyer', sla: { hours: 48 } },
    rfq_issued: { label: 'RFQ issued', terminal: false, holder: 'buyer', sla: { days: 14 } },
    bids_evaluating: { label: 'Bids evaluating', terminal: false, holder: 'buyer', sla: { days: 7 } },
    awarded: { label: 'Awarded', terminal: false, holder: 'supplier', sla: { days: 5 } },
    po_issued: { label: 'PO issued', terminal: false, holder: 'supplier' },
    delivered: { label: 'Delivered', terminal: false, holder: 'buyer', sla: { hours: 48 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'requisition_raised',
      by: ['buyer', 'operator'],
      actorBecomes: 'buyer',
      label: 'Raise requisition',
      intent: 'primary',
      input: {
        package_title: { type: 'string', required: true },
        discipline: { type: 'string', required: true },
        scope_description: { type: 'string', required: true },
        estimated_value: { type: 'number', min: 0 },
        delivery_site: { type: 'string' },
        incoterm: { type: 'string' },
        supplier_party: { type: 'party', role: 'supplier' },
      },
      guards: [],
    },
    {
      id: 'issue_rfq',
      from: 'requisition_raised',
      to: 'rfq_issued',
      by: ['buyer', 'operator'],
      label: 'Issue RFQ',
      intent: 'primary',
      input: { rfq_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'begin_evaluation',
      from: 'rfq_issued',
      to: 'bids_evaluating',
      by: ['buyer', 'operator'],
      label: 'Begin bid evaluation',
      intent: 'primary',
      input: { bid_count: { type: 'number', min: 0 } },
      guards: [],
    },
    {
      // structural + guard gate: the ONLY edge into `awarded`, and counterpartyDistinct
      // stops a buyer awarding to itself. issue_po can then only fire from here.
      id: 'award',
      from: 'bids_evaluating',
      to: 'awarded',
      by: ['buyer'],
      label: 'Award package',
      intent: 'primary',
      input: { award_value: { type: 'number', min: 0, required: true } },
      guards: ['counterpartyDistinct'],
      derive: (f, at: Instant) => ({
        awarded_at: isoUtc(at),
        award_variance_pct: variancePct(f.estimated_value, f.award_value),
      }),
    },
    {
      // a PO can NEVER be cut without a competed award behind it — issue_po leaves
      // ONLY `awarded`, which only the award edge reaches. No guard needed.
      id: 'issue_po',
      from: 'awarded',
      to: 'po_issued',
      by: ['buyer', 'operator'],
      label: 'Issue purchase order',
      intent: 'primary',
      input: { po_number: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ po_issued_at: isoUtc(at) }),
    },
    {
      id: 'confirm_delivery',
      from: 'po_issued',
      to: 'delivered',
      by: ['buyer', 'supplier', 'operator'],
      label: 'Confirm delivery',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ delivered_at: isoUtc(at) }),
    },
    {
      id: 'close_package',
      from: 'delivered',
      to: 'closed',
      by: ['buyer'],
      label: 'Close package',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_proc: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_requisition',
      from: ['requisition_raised', 'rfq_issued', 'bids_evaluating'],
      to: 'rejected',
      by: ['buyer', 'operator'],
      label: 'Reject requisition',
      intent: 'destructive',
      requiresReason: ['budget_unavailable', 'scope_withdrawn', 'no_compliant_bids', 'duplicate_package'],
      guards: [],
    },
    {
      id: 'cancel_award',
      from: ['awarded', 'po_issued'],
      to: 'cancelled',
      by: ['buyer', 'operator'],
      label: 'Cancel award',
      intent: 'destructive',
      requiresReason: ['supplier_default', 'award_challenged', 'funding_pulled', 'scope_changed'],
      guards: [],
    },
  ],
};
