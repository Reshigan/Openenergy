// warranty_recovery — OEM/vendor warranty cost-recovery lifecycle as data.
//
// After a component fails under warranty, an O&M/support claimant files a
// recovery against the OEM/vendor. The vendor assesses, may bounce it back for
// more evidence, then either approves or denies it; an approved recovery is
// settled (credit note / replacement issued). The commercial spine is
// structural: the ONLY edge into `recovered` is `settle_recovery`, and that can
// ONLY fire from `recovery_approved` — reached solely by `approve_recovery`. So
// a recovery can NEVER be settled before the vendor has actually accepted the
// claim; no guard is needed, the state graph enforces it. Self-dealing
// (claimant == vendor) is refused at `approve_recovery` by counterpartyDistinct
// — the value-commitment edge, where both parties are live on the txn.
//
// settles:false — a warranty recovery is a claim/entitlement record, not a
// payment rail; the credit note settles through invoicing chains, not here
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure claim-size bucketing off the ZAR amount. No clock, no env.
const recoveryTier = (amount: Json | undefined): string => {
  if (typeof amount !== 'number') return 'unquantified';
  if (amount >= 1_000_000) return 'major';
  if (amount >= 100_000) return 'material';
  return 'minor';
};

export const warrantyRecovery: ChainDecl = {
  key: 'warranty_recovery',
  noun: 'Warranty recovery',
  refPrefix: 'WR',
  title: (f) => `${(f.failed_component as string) ?? 'component'} warranty recovery — ${(f.asset_name as string) ?? 'unnamed asset'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Consumer Protection Act 2008', provision: 's56 implied warranty of quality', effect: 'authorises' },
    { instrument: 'REIPPPP IA', provision: 'OEM warranty & defects liability', effect: 'requires' },
  ],
  roles: ['claimant', 'vendor', 'operator'],

  fields: {
    recovery_number: { type: 'string', label: 'Recovery number' },
    claimant_party: { type: 'party', role: 'claimant', label: 'Claimant' },
    vendor_party: { type: 'party', role: 'vendor', label: 'OEM / vendor' },
    asset_name: { type: 'string', required: true, label: 'Asset' },
    failed_component: { type: 'string', required: true, label: 'Failed component' },
    serial_number: { type: 'string', label: 'Component serial number' },
    warranty_ref: { type: 'string', required: true, label: 'Warranty / contract ref' },
    failure_description: { type: 'string', required: true, label: 'Failure description' },
    failure_date: { type: 'string', label: 'Failure date' },
    claim_amount_zar: { type: 'number', min: 0, label: 'Claimed amount (ZAR)' },
    approved_amount_zar: { type: 'number', min: 0, label: 'Approved amount (ZAR)' },
    recovery_tier: { type: 'string', label: 'Recovery tier' },
    resubmit_count: { type: 'number', label: 'Times resubmitted' },
    // written by derive, never by the client
    filed_at: { type: 'string', label: 'Filed at' },
    approved_at: { type: 'string', label: 'Approved at' },
    recovered_at: { type: 'string', label: 'Recovered at' },
  },

  initial: 'recovery_filed',

  states: {
    recovery_filed: { label: 'Recovery filed', terminal: false, holder: 'vendor', sla: { hours: 72 } },
    under_assessment: { label: 'Under vendor assessment', terminal: false, holder: 'vendor', sla: { hours: 120 } },
    info_requested: { label: 'Information requested', terminal: false, holder: 'claimant', sla: { hours: 72 } },
    recovery_approved: { label: 'Recovery approved', terminal: false, holder: 'vendor', sla: { hours: 72 } },
    recovered: { label: 'Recovered', terminal: true, holder: 'none' },
    recovery_denied: { label: 'Denied', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'recovery_filed',
      by: ['claimant', 'operator'],
      actorBecomes: 'claimant',
      label: 'File warranty recovery',
      intent: 'primary',
      input: {
        asset_name: { type: 'string', required: true },
        failed_component: { type: 'string', required: true },
        serial_number: { type: 'string' },
        warranty_ref: { type: 'string', required: true },
        failure_description: { type: 'string', required: true },
        failure_date: { type: 'string' },
        claim_amount_zar: { type: 'number', min: 0 },
        vendor_party: { type: 'party', role: 'vendor' },
      },
      guards: [],
      derive: (f, at: Instant) => ({ recovery_tier: recoveryTier(f.claim_amount_zar), filed_at: isoUtc(at) }),
    },
    {
      id: 'begin_assessment',
      from: 'recovery_filed',
      to: 'under_assessment',
      by: ['vendor'],
      label: 'Begin assessment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'request_info',
      from: 'under_assessment',
      to: 'info_requested',
      by: ['vendor'],
      label: 'Request more information',
      intent: 'secondary',
      requiresReason: ['serial_unreadable', 'failure_evidence_missing', 'root_cause_unclear', 'warranty_ref_invalid'],
      guards: [],
    },
    {
      id: 'resubmit',
      from: 'info_requested',
      to: 'under_assessment',
      by: ['claimant'],
      label: 'Resubmit with information',
      intent: 'primary',
      guards: [],
      derive: (f, _at: Instant) => ({ resubmit_count: (typeof f.resubmit_count === 'number' ? f.resubmit_count : 0) + 1 }),
    },
    {
      // structural commercial gate: the ONLY edge into recovery_approved. A
      // recovery cannot be settled until the vendor has accepted it here. The
      // vendor and claimant must be distinct legal entities (no self-dealing).
      id: 'approve_recovery',
      from: 'under_assessment',
      to: 'recovery_approved',
      by: ['vendor'],
      label: 'Approve recovery',
      intent: 'primary',
      input: { approved_amount_zar: { type: 'number', min: 0 } },
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY edge into `recovered`, and it can ONLY fire
      // from recovery_approved — reached solely by approve_recovery. So a
      // recovery can never settle without vendor acceptance. No guard.
      id: 'settle_recovery',
      from: 'recovery_approved',
      to: 'recovered',
      by: ['vendor', 'operator'],
      label: 'Settle recovery',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ recovered_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'deny_recovery',
      from: ['recovery_filed', 'under_assessment', 'info_requested'],
      to: 'recovery_denied',
      by: ['vendor'],
      label: 'Deny recovery',
      intent: 'destructive',
      requiresReason: ['out_of_warranty', 'no_fault_found', 'misuse_exclusion', 'time_barred', 'insufficient_evidence'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['recovery_filed', 'under_assessment', 'info_requested'],
      to: 'withdrawn',
      by: ['claimant'],
      label: 'Withdraw recovery',
      intent: 'destructive',
      requiresReason: ['repaired_in_house', 'duplicate_claim', 'cost_below_threshold', 'claim_abandoned'],
      guards: [],
    },
  ],

  // info-requested time-bar: a recovery left with the claimant for more
  // information lapses if never answered. record-only stub; the sweep computes
  // the real bar off the state sla hours (ppa_contract pattern).
  timers: [{ onState: 'info_requested', after: { hours: 0 }, fire: 'deny_recovery', kind: 'time_bar' }],
};
