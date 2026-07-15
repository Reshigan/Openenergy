// ppa_contract_chain — power purchase agreement drafting-through-execution
// lifecycle, as data (v1: W22, oe_ppa_contract_chain).
//
// An offtaker drafts a PPA against a prospective IPP seller, negotiates and
// locks commercial terms, gets it legally signed, then executes it — which
// fires the NERSA Section 34 registration crossing (ERA 2006) and arms the
// commencement window. Once delivery commences the PPA is in force and feeds
// monthly contracted-vs-delivered billing (W32 take-or-pay); it can be
// disputed and resolved without leaving force, or exit via termination
// (unresolved breach), natural expiry, or pre-execution cancellation.
//
// Structural honesty (no invented guards):
//  - `execute` is the ONLY door from legal_signed to executed, and `commence`
//    is the ONLY door into `in_force` — so a PPA can never start billing
//    without having been executed, and never execute without having been
//    legally signed. The state graph enforces the drafting gate.
//  - `execute` is guarded by executionEvidencePresent: v1 requires
//    board_approval_ref + legal_counterparty_ref on this exact action — the
//    guard is a direct port, not an addition.
//  - `execute` is also guarded by regulatorPresentIfStrategic: a ≥100MW PPA
//    is exactly the REIPPPP-scale deal NERSA Section 34 registration exists
//    for, so a regulator must already be a party before execution fires the
//    registration crossing.
//  - `open` is guarded by counterpartyDistinct: the offtaker cannot draft a
//    PPA naming itself as the IPP seller.
//
// settles:false — quantumCol is null on the v1 descriptor; this chain is the
// contract record, not a payment. Money moves on the take-or-pay billing
// chain this PPA feeds (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ppaContractChain: ChainDecl = {
  key: 'ppa_contract_chain',
  noun: 'PPA contract',
  refPrefix: 'PPA',
  title: (f) => `PPA — ${(f.project_name as string) ?? 'unnamed project'}${f.ppa_number ? ` (${f.ppa_number as string})` : ''}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Electricity Regulation Act 2006', provision: 's34 ministerial determination / NERSA registration of PPAs', effect: 'requires' },
  ],
  roles: ['offtaker', 'ipp_developer', 'regulator', 'operator'],

  fields: {
    project_name: { type: 'string', required: true, label: 'Project name' },
    ppa_number: { type: 'string', label: 'PPA number' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP seller' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    capacity_mw: { type: 'number', min: 0, label: 'Contracted capacity (MW)' },
    nersa_section34_ref: { type: 'string', label: 'NERSA Section 34 ref' },
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    legal_counterparty_ref: { type: 'string', label: 'Legal counterparty ref' },
    reason_note: { type: 'string', label: 'Reason detail' },
    // written by derive, never by the client
    executed_at: { type: 'string', label: 'Executed at' },
    commenced_at: { type: 'string', label: 'Commenced at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
    terminated_at: { type: 'string', label: 'Terminated at' },
    cancelled_at: { type: 'string', label: 'Cancelled at' },
    expired_at: { type: 'string', label: 'Expired at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'offtaker', sla: { days: 5 } },
    in_negotiation: { label: 'In negotiation', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    terms_locked: { label: 'Terms locked', terminal: false, holder: 'offtaker', sla: { days: 10 } },
    legal_signed: { label: 'Legal signed', terminal: false, holder: 'offtaker', sla: { days: 10 } },
    executed: { label: 'Executed', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    in_force: { label: 'In force', terminal: false, holder: 'none' },
    in_dispute: { label: 'In dispute', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    terminated: { label: 'Terminated', terminal: true, holder: 'none' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
    cancelled: { label: 'Cancelled', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['offtaker', 'operator'],
      actorBecomes: 'offtaker',
      label: 'Draft PPA',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        ppa_number: { type: 'string' },
        ipp_party: { type: 'party', role: 'ipp_developer' },
        regulator_party: { type: 'party', role: 'regulator' },
        capacity_mw: { type: 'number', min: 0 },
      },
      // offtaker ≠ IPP seller (no self-dealing) + no new commitments under a halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
    },
    {
      id: 'begin_negotiation',
      from: 'draft',
      to: 'in_negotiation',
      by: ['offtaker', 'operator'],
      label: 'Begin negotiation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'lock_terms',
      from: 'in_negotiation',
      to: 'terms_locked',
      by: ['offtaker', 'operator'],
      label: 'Lock terms',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'legal_sign',
      from: 'terms_locked',
      to: 'legal_signed',
      by: ['offtaker', 'operator'],
      label: 'Legal sign',
      intent: 'primary',
      guards: [],
    },
    {
      // structural execution gate: the only door from legal_signed. Guards port
      // v1's exact required fields (board_approval_ref, legal_counterparty_ref)
      // plus the regulator-on-txn requirement for strategic-scale capacity.
      id: 'execute',
      from: 'legal_signed',
      to: 'executed',
      by: ['offtaker', 'operator'],
      label: 'Execute PPA',
      intent: 'primary',
      input: {
        nersa_section34_ref: { type: 'string' },
        board_approval_ref: { type: 'string', required: true },
        legal_counterparty_ref: { type: 'string', required: true },
      },
      guards: ['executionEvidencePresent', 'regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },
    {
      // the only door into in_force — a PPA can never start billing without
      // having been executed.
      id: 'commence',
      from: 'executed',
      to: 'in_force',
      by: ['offtaker', 'operator'],
      label: 'Commence delivery',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ commenced_at: isoUtc(at) }),
    },
    {
      id: 'dispute',
      from: 'in_force',
      to: 'in_dispute',
      by: ['offtaker', 'operator'],
      label: 'Dispute',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'resolve',
      from: 'in_dispute',
      to: 'in_force',
      by: ['offtaker', 'operator'],
      label: 'Resolve',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    {
      id: 'terminate',
      from: ['in_force', 'in_dispute'],
      to: 'terminated',
      by: ['offtaker', 'operator'],
      label: 'Terminate PPA',
      intent: 'destructive',
      input: { reason_note: { type: 'string' } },
      requiresReason: ['unremedied_seller_default', 'failure_to_reach_cod', 'material_breach', 'force_majeure_extended', 'insolvency'],
      guards: [],
      derive: (_f, at: Instant) => ({ terminated_at: isoUtc(at) }),
    },
    {
      id: 'cancel',
      from: ['draft', 'in_negotiation', 'terms_locked', 'legal_signed'],
      to: 'cancelled',
      by: ['offtaker', 'operator'],
      label: 'Cancel PPA',
      intent: 'destructive',
      input: { reason_note: { type: 'string' } },
      requiresReason: ['project_withdrawn_before_financial_close', 'commercial_terms_unacceptable', 'permitting_failure', 'financing_failure'],
      guards: [],
      derive: (_f, at: Instant) => ({ cancelled_at: isoUtc(at) }),
    },
    {
      id: 'expire',
      from: 'in_force',
      to: 'expired',
      by: ['offtaker', 'operator'],
      label: 'Expire PPA',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ expired_at: isoUtc(at) }),
    },
  ],
};
