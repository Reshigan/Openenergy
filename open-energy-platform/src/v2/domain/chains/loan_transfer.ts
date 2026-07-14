// loan_transfer — secondary-market transfer of a facility interest as data.
//
// Project-finance chain (docs/architecture/REBUILD_FUNCTIONAL_FLOOR.md). A
// transferor (existing lender) assigns/novates its interest in a facility to a
// transferee (incoming lender). LMA-style spine: propose → borrower/agent
// consent → transferee credit approval + CPs → execute transfer certificate →
// agent registers. The register step is what makes the transfer effective.
//
// The effectiveness gate is STRUCTURAL, not a guard: register_transfer leaves
// ONLY transfer_executed, and the ONLY path into transfer_executed is
// execute_transfer (from cp_satisfied). So a transfer can NEVER be registered
// before the certificate is executed and its CPs cleared — no guard needed, the
// state graph enforces it. execute_transfer itself is guarded by
// executionEvidencePresent (board approval + named legal counterparty).
//
// settles:false — recording a transfer of loan title is a legal/register event,
// never a movement of money on this platform. No custody, no payment rails
// (R-S5-1); the cash leg settles on an external rail.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure price-tier bucketing off transfer price vs outstanding principal. No
// clock, no env — deterministic.
const priceTier = (principal: Json | undefined, price: Json | undefined): string => {
  if (typeof principal !== 'number' || typeof price !== 'number' || principal <= 0) return 'unpriced';
  const pct = price / principal;
  if (pct > 1.005) return 'premium';
  if (pct < 0.995) return 'discount';
  return 'par';
};

export const loanTransfer: ChainDecl = {
  key: 'loan_transfer',
  noun: 'Loan transfer',
  refPrefix: 'LT',
  title: (f) =>
    `${(f.transfer_type as string) ?? 'assignment'} — ${(f.facility_ref as string) ?? 'unnamed facility'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'LMA Facility Agreement', provision: 'assignment & transfer (transfer certificate)', effect: 'authorises' },
    { instrument: 'REIPPPP', provision: 'lender-of-record change consent', effect: 'requires' },
  ],
  roles: ['transferor', 'transferee', 'agent', 'borrower'],

  fields: {
    transfer_ref: { type: 'string', label: 'Transfer ref' },
    transferor_party: { type: 'party', role: 'transferor', label: 'Transferor (existing lender)' },
    transferee_party: { type: 'party', role: 'transferee', label: 'Transferee (incoming lender)' },
    agent_party: { type: 'party', role: 'agent', label: 'Facility agent' },
    facility_ref: { type: 'string', required: true, label: 'Facility ref' },
    transfer_type: { type: 'string', required: true, label: 'Type (assignment/novation/participation)' },
    principal_amount: { type: 'number', min: 0, required: true, label: 'Outstanding principal' },
    transfer_price: { type: 'number', min: 0, label: 'Transfer price (cash leg)' },
    currency: { type: 'string', label: 'Currency' },
    consent_required: { type: 'boolean', label: 'Borrower consent required' },
    price_tier: { type: 'string', label: 'Price tier (par/discount/premium)' },
    // evidence supplied on later edges
    credit_approval_ref: { type: 'string', label: 'Transferee credit approval ref' },
    cp_evidence_ref: { type: 'string', label: 'CP evidence ref' },
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    legal_counterparty_ref: { type: 'string', label: 'Legal counterparty ref' },
    transfer_certificate_ref: { type: 'string', label: 'Transfer certificate ref' },
    settlement_date: { type: 'string', label: 'Settlement date' },
    // written by derive, never by the client
    consented_at: { type: 'string', label: 'Consented at' },
    cp_cleared_at: { type: 'string', label: 'CPs cleared at' },
    executed_at: { type: 'string', label: 'Certificate executed at' },
    registered_at: { type: 'string', label: 'Registered at' },
  },

  initial: 'transfer_proposed',

  states: {
    transfer_proposed: { label: 'Transfer proposed', terminal: false, holder: 'agent', sla: { days: 10 } },
    consent_obtained: { label: 'Consent obtained', terminal: false, holder: 'transferee', sla: { days: 15 } },
    cp_satisfied: { label: 'Conditions precedent satisfied', terminal: false, holder: 'transferor', sla: { days: 10 } },
    transfer_executed: { label: 'Transfer certificate executed', terminal: false, holder: 'agent', sla: { days: 5 } },
    transfer_registered: { label: 'Transfer registered', terminal: true, holder: 'none' },
    transfer_declined: { label: 'Declined', terminal: true, holder: 'none' },
    transfer_withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'transfer_proposed',
      by: ['transferor', 'agent'],
      actorBecomes: 'transferor',
      label: 'Propose transfer',
      intent: 'primary',
      input: {
        facility_ref: { type: 'string', required: true },
        transfer_type: { type: 'string', required: true },
        principal_amount: { type: 'number', required: true, min: 0 },
        transfer_price: { type: 'number', min: 0 },
        currency: { type: 'string' },
        consent_required: { type: 'boolean' },
        transferee_party: { type: 'party', role: 'transferee' },
        agent_party: { type: 'party', role: 'agent' },
      },
      guards: ['complianceHaltClear'],
      derive: (f, _at: Instant) => ({ price_tier: priceTier(f.principal_amount, f.transfer_price) }),
    },
    {
      id: 'grant_consent',
      from: 'transfer_proposed',
      to: 'consent_obtained',
      by: ['agent', 'borrower'],
      label: 'Grant consent',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ consented_at: isoUtc(at) }),
    },
    {
      id: 'satisfy_cp',
      from: 'consent_obtained',
      to: 'cp_satisfied',
      by: ['transferee', 'transferor'],
      label: 'Satisfy conditions precedent',
      intent: 'primary',
      // credit_approval_ref + cp_evidence_ref are enforced by the guards below,
      // not the coerce step, so a missing ref surfaces the business reason code.
      input: {
        credit_approval_ref: { type: 'string' },
        cp_evidence_ref: { type: 'string' },
      },
      // transferee credit approval + named CP evidence.
      guards: ['creditApprovalPresent', 'cpEvidencePresent'],
      derive: (_f, at: Instant) => ({ cp_cleared_at: isoUtc(at) }),
    },
    {
      // structural effectiveness gate: the ONLY edge into transfer_executed, and
      // it can only fire from cp_satisfied. Registration downstream can therefore
      // never happen on an unexecuted certificate.
      id: 'execute_transfer',
      from: 'cp_satisfied',
      to: 'transfer_executed',
      by: ['transferor', 'transferee'],
      label: 'Execute transfer certificate',
      intent: 'primary',
      // board_approval_ref + legal_counterparty_ref are enforced by
      // executionEvidencePresent (not the coerce step) so a missing ref surfaces
      // the business reason code rather than a generic BAD_INPUT.
      input: {
        board_approval_ref: { type: 'string' },
        legal_counterparty_ref: { type: 'string' },
        transfer_certificate_ref: { type: 'string' },
      },
      guards: ['executionEvidencePresent'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into transfer_registered, only from transfer_executed.
      id: 'register_transfer',
      from: 'transfer_executed',
      to: 'transfer_registered',
      by: ['agent'],
      label: 'Register transfer',
      intent: 'primary',
      input: { settlement_date: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ registered_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'decline_transfer',
      from: ['transfer_proposed', 'consent_obtained', 'cp_satisfied'],
      to: 'transfer_declined',
      by: ['agent', 'transferee', 'borrower', 'system'],
      label: 'Decline transfer',
      intent: 'destructive',
      requiresReason: ['consent_refused', 'credit_declined', 'cp_not_met', 'kyc_failed', 'sanctions_hit', 'consent_window_lapsed'],
      guards: [],
    },
    {
      id: 'withdraw_transfer',
      from: ['transfer_proposed', 'consent_obtained', 'cp_satisfied'],
      to: 'transfer_withdrawn',
      by: ['transferor'],
      label: 'Withdraw transfer',
      intent: 'destructive',
      requiresReason: ['price_renegotiation', 'deal_pulled', 'transferee_changed', 'no_longer_required'],
      guards: [],
    },
  ],

  // consent time-bar: a proposed transfer left without consent for 30 days
  // stales out (the borrower/agent consent window is finite; well past the
  // 10-day state sla — ppa_contract / permit_to_work pattern). Fires the
  // declined exit.
  timers: [{ onState: 'transfer_proposed', after: { days: 30 }, fire: 'decline_transfer', kind: 'time_bar', reason: 'consent_window_lapsed' }],
};
