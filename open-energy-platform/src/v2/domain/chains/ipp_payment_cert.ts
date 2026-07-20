// ipp_payment_cert — IPP construction payment certificate lifecycle, as data.
//
// Standard EPC/Implementation Agreement payment certification: the IPP
// developer submits a claim (progress / retention release / final account /
// variation / dayworks / loss-and-expense / advance), the certifier assesses
// it, certifies a payable value (which may differ from the claimed value),
// and payment is confirmed — terminal. A certified value can be disputed;
// a dispute that doesn't settle is referred to adjudication — terminal.
//
// Structural honesty (no invented actions):
//  - v1's status column also carries `revised` and `final_payment` as historic
//    values, and `withdrawn`/`final_payment` sit in v1's terminal list, but the
//    seven documented v1 actions never produce them. Rather than fabricate an
//    unevidenced "revise_certificate" / split-terminal action, both states are
//    declared here (so legacy-imported rows still render/export correctly) but
//    left unreached by the current transition set — same call as
//    article6_adjustment's `blocked` staying terminal:false against v1's list.
//  - `withdraw_claim` IS wired (draft/submitted/assessed → withdrawn): a
//    claimant being able to withdraw their own unresolved claim is the same
//    standard destructive exit every other IPP chain in this cluster has
//    (cancel_book, cancel_schedule), not new domain logic.
//  - v1 groups `lapsed` under the "closed" filter alongside withdrawn/rejected
//    but omits it from the terminal array — treated as a data-entry gap; a
//    closed status with a live outgoing edge would never clear closed_at
//    (engine.ts), so it is terminal:true here and fired only by the SLA timer.
//
// settles:true — a payment certificate is the payable-quantum instrument
// itself; confirm_payment is the actual ZAR settlement event (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippPaymentCert: ChainDecl = {
  key: 'ipp_payment_cert',
  noun: 'IPP payment certificate',
  refPrefix: 'PC',
  title: (f) =>
    `Payment cert ${(f.cert_number as string) || (f.project_id as string) || 'unlinked'} — ${(f.claim_type as string) ?? 'claim'} R${typeof f.claimed_value_zar === 'number' ? f.claimed_value_zar : 0}`,
  visibility: 'party',
  settles: true,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement / EPC payment certification', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin'],

  fields: {
    cert_number: { type: 'string', label: 'Certificate number' },
    project_id: { type: 'string', required: true, label: 'Project' },
    claim_type: { type: 'string', required: true, label: 'Claim type' },
    description: { type: 'string', label: 'Description' },
    period_from: { type: 'string', label: 'Period from' },
    period_to: { type: 'string', label: 'Period to' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (claimant)' },
    claimed_value_zar: { type: 'number', required: true, min: 0, label: 'Claimed value (ZAR)' },
    certified_value_zar: { type: 'number', min: 0, label: 'Certified value (ZAR)' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    assessed_at: { type: 'string', label: 'Assessed at' },
    certified_at: { type: 'string', label: 'Certified at' },
    confirmed_paid_at: { type: 'string', label: 'Payment confirmed at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    adjudicated_at: { type: 'string', label: 'Referred to adjudication at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    submitted: { label: 'Submitted', terminal: false, holder: 'admin', sla: { days: 7 } },
    assessed: { label: 'Assessed', terminal: false, holder: 'admin', sla: { days: 5 } },
    certified: { label: 'Certified', terminal: false, holder: 'admin', sla: { days: 14 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'admin', sla: { days: 21 } },
    // v1 legacy status — no current action produces it; see header note.
    revised: { label: 'Revised (legacy)', terminal: false, holder: 'admin' },
    paid: { label: 'Paid', terminal: true, holder: 'none' },
    // v1 legacy terminal status — no current action produces it; see header note.
    final_payment: { label: 'Final payment (legacy)', terminal: true, holder: 'none' },
    adjudicated: { label: 'Referred to adjudication', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed (SLA missed)', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Draft payment certificate',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        claim_type: { type: 'string', required: true },
        claimed_value_zar: { type: 'number', required: true, min: 0 },
        cert_number: { type: 'string' },
        period_from: { type: 'string' },
        period_to: { type: 'string' },
        description: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'submit_claim',
      from: 'draft',
      to: 'submitted',
      by: ['ipp_developer', 'admin'],
      label: 'Submit claim',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'assess_claim',
      from: 'submitted',
      to: 'assessed',
      by: ['ipp_developer', 'admin'],
      label: 'Assess claim',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ assessed_at: isoUtc(at) }),
    },
    {
      id: 'certify_payment',
      from: 'assessed',
      to: 'certified',
      by: ['ipp_developer', 'admin'],
      label: 'Certify payment',
      intent: 'primary',
      input: { certified_value_zar: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ certified_at: isoUtc(at) }),
    },
    {
      id: 'confirm_payment',
      from: 'certified',
      to: 'paid',
      by: ['ipp_developer', 'admin'],
      label: 'Confirm payment',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ confirmed_paid_at: isoUtc(at) }),
    },
    {
      id: 'dispute_certificate',
      from: 'certified',
      to: 'disputed',
      by: ['ipp_developer', 'admin'],
      label: 'Dispute certificate',
      intent: 'secondary',
      requiresReason: ['quantum_dispute', 'measurement_disagreement', 'quality_defect', 'variation_unapproved', 'contra_charge'],
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'refer_adjudication',
      from: 'disputed',
      to: 'adjudicated',
      by: ['ipp_developer', 'admin'],
      label: 'Refer to adjudication',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ adjudicated_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_claim',
      from: ['submitted', 'assessed'],
      to: 'rejected',
      by: ['ipp_developer', 'admin'],
      label: 'Reject claim',
      intent: 'destructive',
      requiresReason: ['unsubstantiated', 'no_supporting_evidence', 'outside_contract_scope', 'duplicate_claim', 'period_already_certified'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'withdraw_claim',
      from: ['draft', 'submitted', 'assessed'],
      to: 'withdrawn',
      by: ['ipp_developer', 'admin'],
      label: 'Withdraw claim',
      intent: 'destructive',
      requiresReason: ['claim_error', 'superseded_claim', 'duplicate_claim', 'project_cancelled'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
    {
      // SLA time-bar only — no user-facing input, fired by the timers below.
      id: 'lapse_claim',
      from: ['submitted', 'assessed'],
      to: 'lapsed',
      by: ['system'],
      label: 'Claim lapses (SLA missed)',
      intent: 'destructive',
      requiresReason: ['sla_missed'],
      guards: [],
    },
  ],

  // an unassessed claim stales after 30 days; an assessed-but-uncertified one
  // after 14 (it's further along, less slack) — both fire the same time-bar edge.
  timers: [
    { onState: 'submitted', after: { days: 30 }, fire: 'lapse_claim', kind: 'sla', reason: 'sla_missed' },
    { onState: 'assessed', after: { days: 14 }, fire: 'lapse_claim', kind: 'sla', reason: 'sla_missed' },
  ],
};
