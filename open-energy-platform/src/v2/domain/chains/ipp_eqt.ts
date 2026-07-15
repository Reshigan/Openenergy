// ipp_eqt — IPP SPV equity transfer (secondary sale / DFI exit / sponsor
// reorg) as data, gated on NERSA consent under ERA 2006 s.11.
//
// A developer proposes a transfer of equity in the project SPV to a named
// transferee; the transfer is submitted for NERSA's licence-condition review
// (a change-of-control consent), and either completes, is refused, or lapses
// (the deal collapses, or the review runs past its long-stop). The structural
// spine: complete_transfer is the ONLY edge into transfer_completed, and it
// is reachable ONLY from nersa_review — so a transfer can NEVER be recorded
// complete before NERSA review was commenced. No guard needed for that; the
// state graph enforces it.
//
// commence_nersa_review is guarded by completenessEvidencePresent: NERSA
// won't open a licence-condition review on an incomplete application, so a
// named completeness-evidence ref is required to submit. open is guarded by
// counterpartyDistinct: a transferor selling equity to itself is not a
// transfer.
//
// URGENT SLA (v1 sla_due_date): a review left open past its long-stop lapses
// automatically rather than sitting stale — see the timer below.
//
// settles:false — this chain is the NERSA consent record for the equity
// move, not the payment/settlement of the sale consideration, which rails
// through its own instrument (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippEqt: ChainDecl = {
  key: 'ipp_eqt',
  noun: 'IPP equity transfer',
  refPrefix: 'EQT',
  title: (f) =>
    `Equity transfer — ${(f.project_ref as string) ?? 'project'} → ${(f.transferee_name as string) ?? 'transferee TBC'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's.11 licence conditions — change-of-control / equity-transfer consent', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'IPP SPV equity ownership change of control', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'transferee', 'regulator', 'operator'],

  fields: {
    project_ref: { type: 'string', required: true, label: 'Project reference' },
    transfer_type: { type: 'string', label: 'Transfer type (secondary_sale/community_equity/dfi_exit/sponsor_reorg/debt_equity_swap)' },
    equity_quantum_zar: { type: 'number', required: true, min: 0, label: 'Equity quantum (ZAR)' },
    equity_pct: { type: 'number', min: 0, max: 100, label: 'Equity percentage' },
    transferor_party: { type: 'party', role: 'ipp_developer', label: 'Transferor (IPP developer)' },
    transferor_name: { type: 'string', label: 'Transferor name' },
    transferee_party: { type: 'party', role: 'transferee', label: 'Transferee' },
    transferee_name: { type: 'string', label: 'Transferee name' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    notes: { type: 'string', label: 'Notes' },
    completeness_ref: { type: 'string', label: 'NERSA licence completeness evidence ref' },
    // written by derive, never by the client
    review_commenced_at: { type: 'string', label: 'NERSA review commenced at' },
    completed_at_eqt: { type: 'string', label: 'Transfer completed at' },
  },

  initial: 'transfer_proposed',

  states: {
    transfer_proposed: { label: 'Transfer proposed', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    nersa_review: { label: 'NERSA review', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    transfer_completed: { label: 'Transfer completed', terminal: true, holder: 'none' },
    transfer_rejected: { label: 'Transfer rejected', terminal: true, holder: 'none' },
    transfer_lapsed: { label: 'Transfer lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'transfer_proposed',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Propose equity transfer',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        transfer_type: { type: 'string' },
        equity_quantum_zar: { type: 'number', required: true, min: 0 },
        equity_pct: { type: 'number', min: 0, max: 100 },
        transferor_name: { type: 'string' },
        transferee_name: { type: 'string' },
        transferee_party: { type: 'party', role: 'transferee' },
        regulator_party: { type: 'party', role: 'regulator' },
        notes: { type: 'string' },
      },
      // a transfer to yourself is not a transfer — the two named legal
      // entities must be distinct.
      guards: ['counterpartyDistinct'],
    },
    {
      id: 'commence_nersa_review',
      from: 'transfer_proposed',
      to: 'nersa_review',
      by: ['ipp_developer', 'operator'],
      label: 'Commence NERSA review',
      intent: 'primary',
      input: { completeness_ref: { type: 'string', required: true } },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ review_commenced_at: isoUtc(at) }),
    },
    {
      // the ONLY edge into transfer_completed, reachable ONLY from
      // nersa_review — a transfer can never complete without NERSA review
      // having been commenced.
      id: 'complete_transfer',
      from: 'nersa_review',
      to: 'transfer_completed',
      by: ['ipp_developer', 'operator'],
      label: 'Complete transfer',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ completed_at_eqt: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_transfer',
      from: ['transfer_proposed', 'nersa_review'],
      to: 'transfer_rejected',
      by: ['ipp_developer', 'operator'],
      label: 'Reject transfer',
      intent: 'destructive',
      requiresReason: ['nersa_consent_refused', 'licence_condition_breach', 'ownership_threshold_exceeded', 'documentation_deficient'],
      guards: [],
    },
    {
      id: 'declare_lapsed',
      from: ['transfer_proposed', 'nersa_review'],
      to: 'transfer_lapsed',
      by: ['ipp_developer', 'operator', 'system'],
      label: 'Declare lapsed',
      intent: 'destructive',
      requiresReason: ['review_timeout', 'transaction_collapsed', 'financing_fell_through', 'long_stop_date_missed'],
      guards: [],
    },
  ],

  // URGENT SLA long-stop: a review sitting past its window lapses on its own
  // rather than staying open indefinitely (disposition / ipp_evm pattern).
  timers: [{ onState: 'nersa_review', after: { days: 14 }, fire: 'declare_lapsed', kind: 'sla', reason: 'review_timeout' }],
};
