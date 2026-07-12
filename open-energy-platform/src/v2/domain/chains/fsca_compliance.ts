// fsca_compliance — FSCA regulatory compliance-filing lifecycle as data.
//
// A market participant (entity/trader) drafts a compliance filing, submits it
// into the FSCA review queue, the regulator reviews and records a determination
// of compliant or non_compliant. A non_compliant finding routes through a
// remediation loop that resubmits into review — the filing is never "done wrong
// and abandoned"; it re-enters review until the regulator records compliance.
//
// STRUCTURAL determination gate: `compliant` and `non_compliant` are reachable
// ONLY from `under_review`. There is no edge from `drafted` or `submitted`
// straight to a determination, so a filing can NEVER be marked compliant
// without the regulator actually opening a review first. No guard enforces this
// — the state graph does (permit_to_work isolation-gate pattern).
//
// settles:false — a compliance filing is a regulatory record. No money, no
// custody, no settlement finality moves through this chain (R-S5-1); export
// always carries the record-only notice.

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const fscaCompliance: ChainDecl = {
  key: 'fsca_compliance',
  noun: 'FSCA compliance filing',
  refPrefix: 'FSCC',
  title: (f) =>
    `FSCA filing — ${(f.entity_name as string) ?? 'unnamed'} (${(f.filing_type as string) ?? 'return'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Sector Regulation Act 9 of 2017', provision: 's129 regulatory reporting', effect: 'requires' },
    { instrument: 'Financial Markets Act 19 of 2012', provision: 's6 market-conduct compliance', effect: 'requires' },
  ],
  roles: ['entity', 'regulator', 'operator'],

  fields: {
    entity_name: { type: 'string', required: true, label: 'Filing entity' },
    filing_type: { type: 'string', required: true, label: 'Filing type' },
    reporting_period: { type: 'string', required: true, label: 'Reporting period' },
    regulator_party: { type: 'party', role: 'regulator', label: 'FSCA reviewer' },
    remediation_notes: { type: 'string', label: 'Remediation notes' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    determined_at: { type: 'string', label: 'Determination at' },
  },

  initial: 'drafted',

  states: {
    drafted: { label: 'Drafted', terminal: false, holder: 'entity', sla: { days: 30 } },
    submitted: { label: 'Submitted', terminal: false, holder: 'regulator', sla: { days: 5 } },
    under_review: { label: 'Under review', terminal: false, holder: 'regulator', sla: { days: 20 } },
    non_compliant: { label: 'Non-compliant', terminal: false, holder: 'entity', sla: { days: 14 } },
    remediation: { label: 'In remediation', terminal: false, holder: 'entity', sla: { days: 30 } },
    compliant: { label: 'Compliant', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'drafted',
      by: ['entity', 'operator'],
      actorBecomes: 'entity',
      label: 'Draft filing',
      intent: 'primary',
      input: {
        entity_name: { type: 'string', required: true },
        filing_type: { type: 'string', required: true },
        reporting_period: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'submit',
      from: 'drafted',
      to: 'submitted',
      by: ['entity', 'operator'],
      label: 'Submit filing',
      intent: 'primary',
      // a platform-wide compliance halt (NERSA/POPIA directive) freezes new
      // submissions into the review queue until it clears.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    { id: 'begin_review', from: 'submitted', to: 'under_review', by: ['regulator'], label: 'Begin review', intent: 'primary', guards: [] },
    {
      // structural gate: compliant only from under_review.
      id: 'record_compliant',
      from: 'under_review',
      to: 'compliant',
      by: ['regulator'],
      label: 'Record compliant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ determined_at: isoUtc(at) }),
    },
    {
      // structural gate: non_compliant only from under_review.
      id: 'record_non_compliant',
      from: 'under_review',
      to: 'non_compliant',
      by: ['regulator'],
      label: 'Record non-compliant',
      intent: 'destructive',
      requiresReason: ['incomplete_disclosure', 'threshold_breach', 'late_filing', 'control_deficiency', 'misstatement'],
      guards: [],
      derive: (_f, at: Instant) => ({ determined_at: isoUtc(at) }),
    },

    // --- remediation loop -----------------------------------------------------
    {
      id: 'begin_remediation',
      from: 'non_compliant',
      to: 'remediation',
      by: ['entity', 'operator'],
      label: 'Begin remediation',
      intent: 'primary',
      input: { remediation_notes: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'resubmit',
      from: 'remediation',
      to: 'submitted',
      by: ['entity', 'operator'],
      label: 'Resubmit filing',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject',
      from: ['submitted', 'under_review'],
      to: 'rejected',
      by: ['regulator'],
      label: 'Reject filing',
      intent: 'destructive',
      requiresReason: ['deficient_submission', 'wrong_entity', 'duplicate_filing', 'out_of_scope'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['drafted', 'non_compliant', 'remediation'],
      to: 'withdrawn',
      by: ['entity'],
      label: 'Withdraw filing',
      intent: 'destructive',
      requiresReason: ['superseded', 'filed_in_error', 'no_longer_required'],
      guards: [],
    },
  ],

  // remediation time-bar: a non_compliant finding must be remediated and
  // resubmitted within the window; an abandoned remediation lapses to withdrawn.
  // record-only stub — the sweep computes the real bar off the state sla days
  // (ppa_contract / permit_to_work pattern).
  timers: [{ onState: 'remediation', after: { days: 0 }, fire: 'withdraw', kind: 'time_bar' }],
};
