// certificate_bundle — assembling issued renewable-energy / carbon certificates
// (a serial range from a registry) into one tradable bundle, as data.
//
// An issuer (carbon fund) drafts a bundle over a serial range, submits it for
// third-party verification, and — once verified — offers and transfers it to a
// buyer, then closes it. The integrity spine is structural + one guard:
//   - serialRangeConsistent on submit_for_verification: a bundle cannot enter
//     verification unless end ≥ start AND quantity == the inclusive range size.
//     That kills a mis-stated quantity (a double-count vector) at the door.
//   - counterpartyDistinct on transfer: an issuer cannot transfer a bundle to
//     itself (no wash allocation).
//   - the ONLY path into `transferred` is `transfer`, whose ONLY `from` is
//     `offered`, whose ONLY `from` is `verified`. So a bundle can NEVER be
//     transferred before it is verified — no guard needed, the graph enforces it.
//
// settles:false — a bundle allocation is a registry/custody record, not a
// payment. Money moves (if at all) on a separate settlement chain (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure: inclusive range size, or 0 when the range is not two numbers.
const rangeSize = (start: Json | undefined, end: Json | undefined): number =>
  typeof start === 'number' && typeof end === 'number' && end >= start ? end - start + 1 : 0;

export const certificateBundle: ChainDecl = {
  key: 'certificate_bundle',
  noun: 'Certificate bundle',
  refPrefix: 'CERT',
  title: (f) =>
    `${(f.certificate_type as string) ?? 'certificate'} bundle — ${(f.quantity_tco2e as number) ?? 0} units${
      f.registry ? ` (${f.registry as string})` : ''
    }`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Carbon Tax Act 2019', provision: 's13 carbon offset allowance', effect: 'authorises' },
    { instrument: 'JSE-SRL', provision: 'renewable-energy certificate registry rules', effect: 'requires' },
  ],
  roles: ['issuer', 'verifier', 'buyer', 'operator'],

  fields: {
    bundle_reference: { type: 'string', label: 'Bundle reference' },
    issuer_party: { type: 'party', role: 'issuer', label: 'Issuer' },
    verifier_party: { type: 'party', role: 'verifier', label: 'Verifier' },
    buyer_party: { type: 'party', role: 'buyer', label: 'Buyer' },
    certificate_type: { type: 'string', required: true, label: 'Certificate type (rec/carbon_credit)' },
    registry: { type: 'string', required: true, label: 'Registry' },
    vintage_year: { type: 'number', min: 2000, max: 2100, label: 'Vintage year' },
    serial_start: { type: 'number', min: 0, required: true, label: 'Serial start' },
    serial_end: { type: 'number', min: 0, required: true, label: 'Serial end' },
    quantity_tco2e: { type: 'number', min: 1, required: true, label: 'Quantity (units / tCO2e)' },
    verification_ref: { type: 'string', label: 'Verification evidence ref' },
    // written by derive, never by the client
    unit_count: { type: 'number', label: 'Unit count (derived)' },
    verified_at: { type: 'string', label: 'Verified at' },
    transferred_at: { type: 'string', label: 'Transferred at' },
    closed_at_bundle: { type: 'string', label: 'Bundle closed at' },
  },

  initial: 'drafted',

  states: {
    drafted: { label: 'Drafted', terminal: false, holder: 'issuer', sla: { hours: 24 } },
    submitted: { label: 'Submitted for verification', terminal: false, holder: 'verifier', sla: { hours: 48 } },
    verified: { label: 'Verified', terminal: false, holder: 'issuer' },
    offered: { label: 'Offered', terminal: false, holder: 'issuer' },
    transferred: { label: 'Transferred', terminal: false, holder: 'buyer' },
    bundle_closed: { label: 'Closed', terminal: true, holder: 'none' },
    bundle_rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'drafted',
      by: ['issuer', 'operator'],
      actorBecomes: 'issuer',
      label: 'Draft bundle',
      intent: 'primary',
      input: {
        bundle_reference: { type: 'string' },
        certificate_type: { type: 'string', required: true },
        registry: { type: 'string', required: true },
        vintage_year: { type: 'number', min: 2000, max: 2100 },
        serial_start: { type: 'number', min: 0, required: true },
        serial_end: { type: 'number', min: 0, required: true },
        quantity_tco2e: { type: 'number', min: 1, required: true },
        verifier_party: { type: 'party', role: 'verifier' },
        buyer_party: { type: 'party', role: 'buyer' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ unit_count: rangeSize(f.serial_start, f.serial_end) }),
    },
    {
      // integrity gate: a bundle cannot enter verification unless its serial
      // range is well-formed AND quantity matches the inclusive range size.
      id: 'submit_for_verification',
      from: 'drafted',
      to: 'submitted',
      by: ['issuer', 'operator'],
      label: 'Submit for verification',
      intent: 'primary',
      guards: ['serialRangeConsistent'],
    },
    {
      id: 'verify',
      from: 'submitted',
      to: 'verified',
      by: ['verifier'],
      label: 'Verify bundle',
      intent: 'primary',
      input: { verification_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'offer',
      from: 'verified',
      to: 'offered',
      by: ['issuer', 'operator'],
      label: 'Offer bundle',
      intent: 'primary',
      guards: [],
    },
    {
      // structural gate: only path into `transferred`, only from `offered` —
      // which is only reachable from `verified`. No pre-verification transfer.
      // counterpartyDistinct blocks a self-allocation (issuer == buyer).
      id: 'transfer',
      from: 'offered',
      to: 'transferred',
      by: ['issuer', 'operator'],
      label: 'Transfer bundle',
      intent: 'primary',
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ transferred_at: isoUtc(at) }),
    },
    {
      id: 'close_bundle',
      from: 'transferred',
      to: 'bundle_closed',
      by: ['issuer', 'operator', 'buyer'],
      label: 'Close bundle',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_bundle: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_bundle',
      from: 'submitted',
      to: 'bundle_rejected',
      by: ['verifier'],
      label: 'Reject bundle',
      intent: 'destructive',
      requiresReason: ['serial_conflict', 'registry_mismatch', 'evidence_insufficient', 'double_issuance_suspected'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['drafted', 'verified', 'offered'],
      to: 'withdrawn',
      by: ['issuer', 'operator'],
      label: 'Withdraw bundle',
      intent: 'destructive',
      requiresReason: ['listing_cancelled', 'repriced', 'no_longer_available'],
      guards: [],
    },
  ],
};
