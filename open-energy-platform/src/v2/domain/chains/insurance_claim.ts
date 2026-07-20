// insurance_claim — asset-insurance claim lifecycle as data.
//
// A claimant (IPP / facility owner) notifies its insurer of a loss; the insurer
// assesses, assigns a loss adjuster, proposes a quantum, and — once the claimant
// agrees — settles and closes. Two spines are structural, not guarded:
//   1. settle_claim leaves ONLY quantum_agreed, and the ONLY paths into
//      quantum_agreed are agree_quantum and resolve_dispute. So a claim can
//      NEVER be paid out before a quantum is agreed — no guard needed, the state
//      graph forbids it.
//   2. close_claim leaves ONLY settled, so a claim can't close unpaid.
//
// counterpartyDistinct at '@new' stops a participant from claiming against a
// policy where it is its own insurer (self-dealing). Destructive exits (decline,
// withdraw) carry structured reason codes.
//
// settles:false — this records the claim lifecycle; the actual payout is a
// downstream payment the domain does not custody (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure quantum-tier bucketing off the claimed ZAR value. No clock, no env.
const valueTier = (zar: Json | undefined): string => {
  if (typeof zar !== 'number') return 'unassessed';
  if (zar >= 50_000_000) return 'catastrophic';
  if (zar >= 5_000_000) return 'major';
  if (zar >= 500_000) return 'minor';
  return 'small';
};

export const insuranceClaim: ChainDecl = {
  key: 'insurance_claim',
  noun: 'Insurance claim',
  refPrefix: 'IC',
  title: (f) => `${(f.cover_type as string) ?? 'insurance'} claim — ${(f.asset_description as string) ?? 'unnamed asset'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Short-Term Insurance Act 1998', provision: 'policyholder claim & fair-treatment', effect: 'requires' },
    { instrument: 'FSCA Conduct Standard', provision: 's38 large-loss reporting', effect: 'requires' },
  ],
  roles: ['claimant', 'insurer', 'regulator'],

  fields: {
    claim_number: { type: 'string', label: 'Claim number' },
    claimant_party: { type: 'party', role: 'claimant', label: 'Claimant' },
    insurer_party: { type: 'party', role: 'insurer', label: 'Insurer' },
    insurer_name: { type: 'string', required: true, label: 'Insurer name' },
    policy_number: { type: 'string', required: true, label: 'Policy number' },
    cover_type: { type: 'string', required: true, label: 'Cover type (pd_bi/cargo/liability/force_majeure/cyber)' },
    incident_type: { type: 'string', required: true, label: 'Incident type' },
    incident_date: { type: 'string', required: true, label: 'Incident date' },
    asset_description: { type: 'string', required: true, label: 'Asset description' },
    claim_value_zar: { type: 'number', min: 0, required: true, label: 'Claimed value (ZAR)' },
    claim_value_tier: { type: 'string', label: 'Claim value tier' },
    loss_adjuster_name: { type: 'string', label: 'Loss adjuster' },
    loss_adjuster_ref: { type: 'string', label: 'Loss adjuster ref' },
    agreed_value_zar: { type: 'number', min: 0, label: 'Adjuster-agreed quantum (ZAR)' },
    excess_zar: { type: 'number', min: 0, label: 'Excess (ZAR)' },
    settled_value_zar: { type: 'number', min: 0, label: 'Settled value (ZAR)' },
    dispute_notes: { type: 'string', label: 'Dispute notes' },
    // written by derive, never by the client
    notified_at: { type: 'string', label: 'Notified at' },
    adjuster_assigned_at: { type: 'string', label: 'Adjuster assigned at' },
    quantum_proposed_at: { type: 'string', label: 'Quantum proposed at' },
    quantum_agreed_at: { type: 'string', label: 'Quantum agreed at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    settled_at_ic: { type: 'string', label: 'Settled at' },
    closed_at_ic: { type: 'string', label: 'Closed at' },
  },

  initial: 'notified',

  states: {
    notified: { label: 'Notified', terminal: false, holder: 'insurer', sla: { hours: 48 } },
    assessing: { label: 'Assessing', terminal: false, holder: 'insurer', sla: { days: 5 } },
    adjuster_assigned: { label: 'Adjuster assigned', terminal: false, holder: 'insurer', sla: { days: 10 } },
    quantum_proposed: { label: 'Quantum proposed', terminal: false, holder: 'claimant', sla: { days: 10 } },
    quantum_agreed: { label: 'Quantum agreed', terminal: false, holder: 'insurer', sla: { days: 5 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'insurer', sla: { days: 30 } },
    settled: { label: 'Settled', terminal: false, holder: 'insurer', sla: { days: 2 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'notified',
      by: ['claimant'],
      actorBecomes: 'claimant',
      label: 'Notify claim',
      intent: 'primary',
      input: {
        insurer_name: { type: 'string', required: true },
        policy_number: { type: 'string', required: true },
        cover_type: { type: 'string', required: true },
        incident_type: { type: 'string', required: true },
        incident_date: { type: 'string', required: true },
        asset_description: { type: 'string', required: true },
        claim_value_zar: { type: 'number', min: 0, required: true },
        insurer_party: { type: 'party', role: 'insurer' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // a claimant cannot be its own insurer (no self-dealing on the policy).
      guards: ['counterpartyDistinct'],
      derive: (f, at: Instant) => ({ claim_value_tier: valueTier(f.claim_value_zar), notified_at: isoUtc(at) }),
    },
    {
      id: 'begin_assessment',
      from: 'notified',
      to: 'assessing',
      by: ['insurer', 'system'],
      label: 'Begin assessment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'assign_adjuster',
      from: 'assessing',
      to: 'adjuster_assigned',
      by: ['insurer'],
      label: 'Assign loss adjuster',
      intent: 'primary',
      input: { loss_adjuster_name: { type: 'string', required: true }, loss_adjuster_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ adjuster_assigned_at: isoUtc(at) }),
    },
    {
      id: 'propose_quantum',
      from: 'adjuster_assigned',
      to: 'quantum_proposed',
      by: ['insurer'],
      label: 'Propose quantum',
      intent: 'primary',
      input: { agreed_value_zar: { type: 'number', min: 0, required: true }, excess_zar: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ quantum_proposed_at: isoUtc(at) }),
    },
    {
      id: 'agree_quantum',
      from: 'quantum_proposed',
      to: 'quantum_agreed',
      by: ['claimant'],
      label: 'Agree quantum',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ quantum_agreed_at: isoUtc(at) }),
    },
    {
      id: 'dispute_quantum',
      from: 'quantum_proposed',
      to: 'disputed',
      by: ['claimant'],
      label: 'Dispute quantum',
      intent: 'secondary',
      input: { dispute_notes: { type: 'string' } },
      requiresReason: ['quantum_too_low', 'excess_disputed', 'scope_disputed', 'depreciation_disputed'],
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'quantum_agreed',
      by: ['insurer'],
      label: 'Resolve dispute',
      intent: 'primary',
      input: { agreed_value_zar: { type: 'number', min: 0, required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ quantum_agreed_at: isoUtc(at) }),
    },
    {
      // structural payout gate: the ONLY edge into settled, and it can only fire
      // from quantum_agreed — which only agree_quantum / resolve_dispute reach. A
      // claim therefore cannot be paid before its quantum is agreed. No guard.
      id: 'settle_claim',
      from: 'quantum_agreed',
      to: 'settled',
      by: ['insurer'],
      label: 'Settle claim',
      intent: 'primary',
      input: { settled_value_zar: { type: 'number', min: 0, required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at_ic: isoUtc(at) }),
    },
    {
      id: 'close_claim',
      from: 'settled',
      to: 'closed',
      by: ['insurer'],
      label: 'Close claim',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_ic: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'decline_claim',
      from: ['notified', 'assessing', 'adjuster_assigned', 'quantum_proposed', 'disputed'],
      to: 'declined',
      by: ['insurer'],
      label: 'Decline claim',
      intent: 'destructive',
      requiresReason: ['policy_lapsed', 'exclusion_applies', 'fraud_suspected', 'insufficient_evidence', 'outside_cover'],
      guards: [],
    },
    {
      id: 'withdraw_claim',
      from: ['notified', 'assessing', 'adjuster_assigned', 'quantum_proposed'],
      to: 'withdrawn',
      by: ['claimant'],
      label: 'Withdraw claim',
      intent: 'destructive',
      requiresReason: ['claim_abandoned', 'settled_directly', 'duplicate', 'below_excess'],
      guards: [],
    },
  ],

  // acknowledgement SLA: a notified loss the insurer leaves unactioned breaches
  // the fair-treatment window. record-only stub; the sweep computes the real bar
  // off the state sla hours (permit_to_work pattern).
  timers: [{ onState: 'notified', after: { hours: 72 }, fire: 'begin_assessment', kind: 'sla' }],
};
