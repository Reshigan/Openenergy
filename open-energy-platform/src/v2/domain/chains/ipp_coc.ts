// ipp_coc — IPP change-of-control notification as data (ERA s.11 NERSA consent).
//
// A developer notifies NERSA of a controlling-interest transaction (share
// transfer, asset acquisition, merger, MBO, fund recycling, lender step-in).
// NERSA commences a completeness screen, then decides: grant approval
// outright, grant it conditionally, or refuse. Only an approved (conditional
// or not) notification can execute — transfer_control is the ONLY edge into
// control_transferred, reachable ONLY from approved/conditionally_approved,
// so control can never be recorded as transferred without a NERSA decision
// on file. The notifying party may withdraw before any final determination.
//
// Strategic crossing: this chain names capacity_mw at notification, so the
// decision points (grant/impose conditions) require the regulator to already
// be a live party — regulatorPresentIfStrategic reads capacity_mw the same
// way ipp_evm/ipp_schedule do, but here the ≥100 MW gate lines up with the
// chain's own subject matter (a NERSA consent).
//
// settles:false — a change-of-control consent is a regulatory record, never
// a payment (R-S5-1). The transaction's purchase price, if any, settles
// elsewhere.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippCoc: ChainDecl = {
  key: 'ipp_coc',
  noun: 'IPP change of control',
  refPrefix: 'COC',
  title: (f) => `Change of control — ${(f.acquirer_name as string) ?? 'unnamed acquirer'} (${(f.transaction_type as string) ?? 'unspecified'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's.11 NERSA consent to change of control', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'licensee ownership & control disclosure', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator', 'admin'],

  fields: {
    coc_ref: { type: 'string', label: 'Change-of-control reference' },
    project_id: { type: 'string', required: true, label: 'Project' },
    ipp_developer_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer (notifying party)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'NERSA' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Project capacity (MW)' },
    transaction_type: { type: 'string', required: true, label: 'Transaction type' },
    acquirer_name: { type: 'string', required: true, label: 'Acquirer' },
    foreign_ownership_flag: { type: 'string', label: 'Foreign ownership flag' },
    transferor_name: { type: 'string', label: 'Transferor' },
    acquirer_ownership_pct: { type: 'number', min: 0, max: 100, label: 'Acquirer ownership (%)' },
    description: { type: 'string', label: 'Description' },
    approval_notes: { type: 'string', label: 'Approval notes' },
    conditions_text: { type: 'string', label: 'Conditions imposed' },
    refusal_notes: { type: 'string', label: 'Refusal basis' },
    withdrawal_reason: { type: 'string', label: 'Withdrawal reason' },
    // written by derive, never by the client
    completeness_started_at: { type: 'string', label: 'Completeness review started at' },
    approved_at: { type: 'string', label: 'Approved at' },
    conditions_imposed_at: { type: 'string', label: 'Conditions imposed at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
    transferred_at: { type: 'string', label: 'Control transferred at' },
  },

  initial: 'notified',

  states: {
    notified: { label: 'Notified', terminal: false, holder: 'regulator', sla: { days: 5 } },
    completeness_review: { label: 'Completeness review', terminal: false, holder: 'regulator', sla: { days: 10 } },
    approved: { label: 'Approved', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    conditionally_approved: { label: 'Conditionally approved', terminal: false, holder: 'ipp_developer', sla: { days: 60 } },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    control_transferred: { label: 'Control transferred', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'notified',
      by: ['ipp_developer', 'admin'],
      actorBecomes: 'ipp_developer',
      label: 'Notify change of control',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        capacity_mw: { type: 'number', required: true, min: 0 },
        transaction_type: { type: 'string', required: true },
        acquirer_name: { type: 'string', required: true },
        foreign_ownership_flag: { type: 'string' },
        transferor_name: { type: 'string' },
        acquirer_ownership_pct: { type: 'number', min: 0, max: 100 },
        description: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'commence_completeness',
      from: 'notified',
      to: 'completeness_review',
      by: ['ipp_developer', 'admin', 'regulator'],
      label: 'Commence completeness review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ completeness_started_at: isoUtc(at) }),
    },
    {
      // an unconditional consent — needs the regulator already on the txn.
      id: 'grant_approval',
      from: 'completeness_review',
      to: 'approved',
      by: ['ipp_developer', 'admin', 'regulator'],
      label: 'Grant approval',
      intent: 'primary',
      input: { approval_notes: { type: 'string' } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at) }),
    },
    {
      // a conditional consent — same strategic-tier gate as an outright grant.
      id: 'impose_conditions',
      from: 'completeness_review',
      to: 'conditionally_approved',
      by: ['ipp_developer', 'admin', 'regulator'],
      label: 'Impose conditions',
      intent: 'primary',
      input: { conditions_text: { type: 'string', required: true } },
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ conditions_imposed_at: isoUtc(at) }),
    },
    {
      // structural execution gate: the ONLY edge into control_transferred,
      // reachable ONLY from a NERSA decision that already granted consent.
      id: 'transfer_control',
      from: ['approved', 'conditionally_approved'],
      to: 'control_transferred',
      by: ['ipp_developer', 'admin', 'regulator'],
      label: 'Transfer control',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ transferred_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_change',
      from: 'completeness_review',
      to: 'rejected',
      by: ['ipp_developer', 'admin', 'regulator'],
      label: 'Reject change',
      intent: 'destructive',
      input: { refusal_notes: { type: 'string' } },
      requiresReason: ['foreign_ownership_breach', 'grid_code_noncompliance', 'creditworthiness_concern', 'public_interest_test_failed', 'incomplete_notification'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['notified', 'completeness_review'],
      to: 'withdrawn',
      by: ['ipp_developer', 'admin'],
      label: 'Withdraw notification',
      intent: 'destructive',
      input: { withdrawal_reason: { type: 'string' } },
      requiresReason: ['financing_fell_through', 'transaction_restructured', 'regulatory_timeline_exceeded', 'commercial_terms_changed'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
