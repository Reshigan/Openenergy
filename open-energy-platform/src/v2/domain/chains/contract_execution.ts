// contract_execution — a bilateral contract's draft → e-signature → execution
// lifecycle as data. An originator drafts a contract from a template against a
// named counterparty, sends it out for signature, the counterparty e-signs, and
// the originator counter-signs to execute. The ChainDecl fields ARE the template:
// the generated form is the contract; legalBasis binds it to the instrument.
//
// The e-signature spine is STRUCTURAL, not a guard: fully_executed is reachable
// ONLY from partially_signed (via execute), and partially_signed is reachable
// ONLY from out_for_signature (via counterparty_sign). So a contract can NEVER
// be executed without the counterparty's signature on record — the state graph
// enforces it, no guard needed.
//
// Two signature payloads ride REQUIRED inputs (not guards): you cannot fire a
// signature edge without providing the signature ref — an absent ref is a
// genuine BAD_INPUT (you tried to sign with nothing), not a masked semantic code.
// counterpartyDistinct blocks self-execution (originator ≠ counterparty),
// complianceHaltClear blocks putting a new binding out under a platform halt, and
// completenessEvidencePresent forces a final signed-packet ref at execution.
//
// settles:false — a contract is a framework/obligation record; value moves on the
// transactions this contract authorises, never through THIS chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const contractExecution: ChainDecl = {
  key: 'contract_execution',
  noun: 'Contract',
  refPrefix: 'CX',
  title: (f) =>
    `${(f.contract_type as string) ?? 'Contract'} — ${(f.originator_name as string) ?? 'originator'} / ${(f.counterparty_name as string) ?? 'counterparty'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Electronic Communications and Transactions Act 25 of 2002', provision: 's13 advanced electronic signature validity', effect: 'authorises' },
    { instrument: 'ERA 2006', provision: 'licensed-activity contracting conduct', effect: 'requires' },
  ],
  roles: ['originator', 'counterparty', 'operator'],

  fields: {
    contract_ref: { type: 'string', label: 'Contract ref' },
    contract_type: { type: 'string', required: true, label: 'Contract type (PPA/offtake/NDA/service)' },
    template_ref: { type: 'string', label: 'Template ref' },
    originator_name: { type: 'string', required: true, label: 'Originator' },
    counterparty_name: { type: 'string', required: true, label: 'Counterparty' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty participant' },
    governing_law: { type: 'string', label: 'Governing law' },
    effective_date: { type: 'string', label: 'Effective date' },
    document_hash: { type: 'string', label: 'Document hash (integrity)' },
    // e-signature evidence (structural required inputs on the signature edges)
    counterparty_signature_ref: { type: 'string', label: 'Counterparty signature ref' },
    originator_signature_ref: { type: 'string', label: 'Originator signature ref' },
    completeness_ref: { type: 'string', label: 'Signed-packet completeness ref' },
    // written by derive, never by the client
    sent_at: { type: 'string', label: 'Sent for signature at' },
    counterparty_signed_at: { type: 'string', label: 'Counterparty signed at' },
    executed_at: { type: 'string', label: 'Executed at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'originator', sla: { days: 14 } },
    out_for_signature: { label: 'Out for signature', terminal: false, holder: 'counterparty', sla: { days: 10 } },
    partially_signed: { label: 'Partially signed', terminal: false, holder: 'originator', sla: { days: 5 } },
    fully_executed: { label: 'Fully executed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['originator', 'operator'],
      actorBecomes: 'originator',
      label: 'Draft contract',
      intent: 'primary',
      input: {
        contract_type: { type: 'string', required: true },
        template_ref: { type: 'string' },
        originator_name: { type: 'string', required: true },
        counterparty_name: { type: 'string', required: true },
        counterparty_party: { type: 'party', role: 'counterparty' },
        governing_law: { type: 'string' },
        effective_date: { type: 'string' },
        document_hash: { type: 'string' },
      },
      // no self-execution: originator and counterparty must be distinct entities.
      guards: ['counterpartyDistinct'],
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'send_for_signature',
      from: 'draft',
      to: 'out_for_signature',
      by: ['originator', 'operator'],
      label: 'Send for signature',
      intent: 'primary',
      // a platform-wide compliance halt blocks putting a new binding out.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ sent_at: isoUtc(at) }),
    },
    {
      // first signature: the counterparty e-signs the drafted terms. The
      // signature ref is a REQUIRED input — you cannot sign with nothing (an
      // absent ref is a genuine BAD_INPUT, not a masked guard code).
      id: 'counterparty_sign',
      from: 'out_for_signature',
      to: 'partially_signed',
      by: ['counterparty'],
      label: 'Sign contract',
      intent: 'primary',
      input: { counterparty_signature_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ counterparty_signed_at: isoUtc(at) }),
    },
    {
      // structural execution gate: the ONLY edge into fully_executed, and it can
      // only fire from partially_signed — which only counterparty_sign reaches. A
      // contract therefore can NEVER execute without the counterparty's signature.
      // The originator's countersignature is a required input; a final signed-
      // packet completeness ref rides completenessEvidencePresent (Pattern A).
      id: 'execute',
      from: 'partially_signed',
      to: 'fully_executed',
      by: ['originator', 'operator'],
      label: 'Countersign & execute',
      intent: 'primary',
      input: {
        originator_signature_ref: { type: 'string', required: true },
        // present-but-not-required so an absent ref surfaces the guard's
        // MISSING_COMPLETENESS_EVIDENCE, not a generic BAD_INPUT (Pattern A).
        completeness_ref: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ executed_at: isoUtc(at) }),
    },

    // revise-before-signing loop: originator pulls a sent contract back to draft.
    {
      id: 'return_to_draft',
      from: 'out_for_signature',
      to: 'draft',
      by: ['originator', 'operator'],
      label: 'Return to draft',
      intent: 'secondary',
      requiresReason: ['terms_revised', 'counterparty_requested_change', 'error_corrected'],
      guards: [],
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'withdraw',
      from: ['draft', 'out_for_signature', 'partially_signed'],
      to: 'withdrawn',
      by: ['originator', 'operator'],
      label: 'Withdraw contract',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'superseded', 'commercial_terms_changed', 'counterparty_ineligible'],
      guards: [],
    },
    {
      id: 'decline_to_sign',
      from: ['out_for_signature', 'partially_signed'],
      to: 'declined',
      by: ['counterparty'],
      label: 'Decline to sign',
      intent: 'destructive',
      requiresReason: ['terms_unacceptable', 'entity_mismatch', 'authority_lacking', 'due_diligence_failed'],
      guards: [],
    },
  ],

  // signature-request time-bar: a contract left unsigned past the window expires.
  // Record-only stub — the sweep computes the real bar off the state sla days
  // (ppa_contract / isda_agreement pattern).
  timers: [{ onState: 'out_for_signature', after: { days: 0 }, fire: 'withdraw', kind: 'time_bar' }],
};
