// ipp_psec — IPP performance security (REIPPPP Sched 6 bond/guarantee/LC
// renewal) lifecycle, as data.
//
// An IPP submits a bond/guarantee application, the issuing bank assesses and
// issues terms, the IPP reviews and accepts them, documentation is executed,
// DMRE is notified, and the instrument is issued and confirmed. The issuing
// bank itself is never a party role here — v1 carries it as a plain
// `issuing_bank` string (like ipp_insr's `broker_name`), not a counterparty
// on the txn; only the IPP developer drives every step.
//
// Two negative exits — reject_security and lapse_security — are reachable
// from any non-terminal state: a bank can decline at any assessment stage,
// and an issued/accepted instrument can lapse (un-renewed, withdrawn,
// defaulted) at any point before confirmation. Both are PPA default events
// per v1's cascadeHint ("crosses the regulator inbox on every tier"), so
// regulator_party is captured at open for that routing — no guard enforces
// its presence since the cascade, not the state graph, is what needs it.
//
// settles:false — a performance security tracks bond/guarantee status
// against a REIPPPP/PPA covenant; it never itself moves settlement money
// (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippPsec: ChainDecl = {
  key: 'ipp_psec',
  noun: 'IPP performance security',
  refPrefix: 'PSEC',
  title: (f) => `Performance security — ${(f.project_ref as string) ?? 'project'} (${(f.security_type as string) ?? 'bond'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement Schedule 6 performance security covenant', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'regulator'],

  fields: {
    bond_reference: { type: 'string', label: 'Bond reference' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (inbox routing)' },
    project_ref: { type: 'string', required: true, label: 'Project reference' },
    bond_quantum_zar: { type: 'number', min: 0, required: true, label: 'Bond quantum (ZAR)' },
    security_type: { type: 'string', label: 'Security type' },
    expiry_date: { type: 'string', label: 'Expiry date' },
    issuing_bank: { type: 'string', label: 'Issuing bank' },
    beneficiary: { type: 'string', label: 'Beneficiary' },
    notes: { type: 'string', label: 'Notes' },
    // shared 'reason' field key — matches v1's single 'reason' input on both
    // reject_security (rejection basis) and lapse_security (lapse basis)
    reason: { type: 'string', label: 'Reason' },
    // derive-stamped timestamps
    bond_issued_at: { type: 'string', label: 'Bond issued at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
  },

  initial: 'application_submitted',

  states: {
    application_submitted: { label: 'Application submitted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    bank_assessment: { label: 'Bank assessment underway', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    terms_issued: { label: 'Terms issued', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    ipp_review: { label: 'IPP reviewing terms', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    terms_accepted: { label: 'Terms accepted', terminal: false, holder: 'ipp_developer', sla: { days: 5 } },
    documentation: { label: 'Bond documentation in preparation', terminal: false, holder: 'ipp_developer', sla: { days: 10 } },
    dmre_notified: { label: 'DMRE notified', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    bond_issued: { label: 'Bond issued', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    security_confirmed: { label: 'Security confirmed', terminal: true, holder: 'none' },
    security_rejected: { label: 'Security rejected', terminal: true, holder: 'none' },
    security_lapsed: { label: 'Security lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'submit_application',
      from: '@new',
      to: 'application_submitted',
      by: ['ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Submit application',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        bond_quantum_zar: { type: 'number', required: true, min: 0 },
        security_type: { type: 'string' },
        expiry_date: { type: 'string' },
        issuing_bank: { type: 'string' },
        beneficiary: { type: 'string' },
        bond_reference: { type: 'string' },
        notes: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'commence_bank_assessment',
      from: 'application_submitted',
      to: 'bank_assessment',
      by: ['ipp_developer'],
      label: 'Commence bank assessment',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'issue_terms',
      from: 'bank_assessment',
      to: 'terms_issued',
      by: ['ipp_developer'],
      label: 'Issue terms',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'commence_ipp_review',
      from: 'terms_issued',
      to: 'ipp_review',
      by: ['ipp_developer'],
      label: 'Commence IPP review',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'accept_terms',
      from: 'ipp_review',
      to: 'terms_accepted',
      by: ['ipp_developer'],
      label: 'Accept terms',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'prepare_bond_documentation',
      from: 'terms_accepted',
      to: 'documentation',
      by: ['ipp_developer'],
      label: 'Prepare bond documentation',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'send_dmre_notification',
      from: 'documentation',
      to: 'dmre_notified',
      by: ['ipp_developer'],
      label: 'Send DMRE notification',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'issue_bond',
      from: 'dmre_notified',
      to: 'bond_issued',
      by: ['ipp_developer'],
      label: 'Issue bond',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ bond_issued_at: isoUtc(at) }),
    },
    {
      // happy path — only reachable once the instrument has actually issued.
      id: 'confirm_security',
      from: 'bond_issued',
      to: 'security_confirmed',
      by: ['ipp_developer'],
      label: 'Confirm security',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },

    // --- exits ------------------------------------------------------------
    // both reachable from any pre-confirmation stage: a bank can decline
    // assessment at any point, and an accepted/issued instrument can lapse
    // before it's confirmed.
    {
      id: 'reject_security',
      from: [
        'application_submitted', 'bank_assessment', 'terms_issued', 'ipp_review',
        'terms_accepted', 'documentation', 'dmre_notified', 'bond_issued',
      ],
      to: 'security_rejected',
      by: ['ipp_developer'],
      label: 'Reject security',
      intent: 'destructive',
      input: { reason: { type: 'string', required: true } },
      requiresReason: ['bank_declined', 'documentation_deficient', 'terms_unacceptable', 'quantum_shortfall', 'beneficiary_dispute'],
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
    {
      id: 'lapse_security',
      from: [
        'application_submitted', 'bank_assessment', 'terms_issued', 'ipp_review',
        'terms_accepted', 'documentation', 'dmre_notified', 'bond_issued',
      ],
      to: 'security_lapsed',
      by: ['ipp_developer'],
      label: 'Lapse security',
      intent: 'destructive',
      input: { reason: { type: 'string', required: true } },
      requiresReason: ['expiry_unrenewed', 'payment_default', 'bank_withdrawal', 'documentation_lapsed', 'beneficiary_claim'],
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },
  ],

  // no timers: v1's sla_due_date has no documented automated sweep for this
  // chain (not in wrangler.toml cron list) — omitted rather than guessed.
};
