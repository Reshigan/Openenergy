// capital_adequacy — FSCA capital adequacy return lifecycle as data.
//
// A market participant (the ENTITY, a trader/IPP counterparty) drafts a periodic
// capital adequacy return, attests it complete, and submits it to the FSCA (the
// REGULATOR). The regulator reviews and either ACCEPTS it or returns it with a
// structured deficiency reason; a deficient return goes into remediation and is
// resubmitted, looping until accepted or withdrawn.
//
// Settlement-honesty stance: settles:false. A capital adequacy return is a
// regulatory attestation — it records solvency figures, it never moves money.
// No custody, no ledger, no finality here (R-S5-1); export carries the
// record-only notice.
//
// Structural gates (no invented guards):
//  - The regulator is attached ONLY at @new (regulator_party). begin_review /
//    accept / flag_deficiency are by:['regulator'], so only a live regulator
//    party can adjudicate — self-review by the entity is impossible.
//  - accept can ONLY fire from under_review, and the sole edge into under_review
//    is begin_review from submitted. A return therefore cannot be accepted
//    without first being submitted and taken under review — the state graph
//    enforces the order, no guard needed.
//  - submit / resubmit are guarded by completenessEvidencePresent (registry):
//    a return cannot be filed without a named completeness-attestation ref.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** capital ratio = tier-1 / required. Pure: division only, guarded against a
 *  zero/absent denominator. No clock, no env. */
const deriveRatio = (f: Record<string, Json>): Record<string, Json> => {
  const t = f.tier1_capital_zar;
  const r = f.required_capital_zar;
  return typeof t === 'number' && typeof r === 'number' && r > 0 ? { capital_ratio: t / r } : {};
};

export const capitalAdequacyReturn: ChainDecl = {
  key: 'capital_adequacy',
  noun: 'Capital adequacy return',
  refPrefix: 'CAPA',
  title: (f) =>
    `Capital adequacy — ${(f.entity_name as string) ?? 'unnamed'} ${(f.reporting_period as string) ?? ''}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 2012', provision: 's6 & JSE Rules — market-participant capital adequacy', effect: 'requires' },
    { instrument: 'Financial Sector Regulation Act 2017', provision: 's106 regulatory reporting to the FSCA', effect: 'requires' },
  ],
  roles: ['entity', 'regulator', 'operator'],

  fields: {
    entity_name: { type: 'string', required: true, label: 'Entity' },
    reporting_period: { type: 'string', required: true, label: 'Reporting period (e.g. 2026-Q2)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'FSCA reviewer' },
    tier1_capital_zar: { type: 'number', min: 0, label: 'Tier-1 capital (ZAR)' },
    required_capital_zar: { type: 'number', min: 0, label: 'Required capital (ZAR)' },
    completeness_ref: { type: 'string', label: 'Completeness attestation ref' },
    // written by derive, never by the client
    capital_ratio: { type: 'number', label: 'Capital ratio (tier-1 / required)' },
    submitted_at: { type: 'string', label: 'Submitted at' },
    reviewed_at: { type: 'string', label: 'Review started at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    deficiency_count: { type: 'number', label: 'Times returned deficient' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'entity', sla: { days: 30 } },
    submitted: { label: 'Submitted', terminal: false, holder: 'regulator', sla: { days: 10 } },
    under_review: { label: 'Under review', terminal: false, holder: 'regulator', sla: { days: 20 } },
    deficient: { label: 'Returned deficient', terminal: false, holder: 'entity', sla: { days: 15 } },
    remediating: { label: 'Remediating', terminal: false, holder: 'entity', sla: { days: 15 } },
    accepted: { label: 'Accepted', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['entity', 'operator'],
      actorBecomes: 'entity',
      label: 'Open capital adequacy return',
      intent: 'primary',
      input: {
        entity_name: { type: 'string', required: true },
        reporting_period: { type: 'string', required: true },
        tier1_capital_zar: { type: 'number', min: 0 },
        required_capital_zar: { type: 'number', min: 0 },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },

    // --- filing loop --------------------------------------------------------
    {
      id: 'submit',
      from: 'draft',
      to: 'submitted',
      by: ['entity', 'operator'],
      label: 'Submit return',
      intent: 'primary',
      // presence + length owned by the guard (completenessEvidencePresent), not
      // a bare engine required-check, so the rejection carries the domain code.
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (f, at: Instant) => ({ submitted_at: isoUtc(at), ...deriveRatio(f) }),
    },
    {
      id: 'begin_review',
      from: 'submitted',
      to: 'under_review',
      by: ['regulator', 'system'],
      label: 'Begin review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ reviewed_at: isoUtc(at) }),
    },
    {
      id: 'accept',
      from: 'under_review',
      to: 'accepted',
      by: ['regulator'],
      label: 'Accept return',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'flag_deficiency',
      from: 'under_review',
      to: 'deficient',
      by: ['regulator'],
      label: 'Return with deficiency',
      intent: 'destructive',
      requiresReason: ['undercapitalised', 'incomplete_disclosure', 'unsupported_figures', 'stale_valuation'],
      guards: [],
      derive: (f) => ({ deficiency_count: (typeof f.deficiency_count === 'number' ? f.deficiency_count : 0) + 1 }),
    },
    { id: 'begin_remediation', from: 'deficient', to: 'remediating', by: ['entity', 'operator'], label: 'Begin remediation', intent: 'primary', guards: [] },
    {
      id: 'resubmit',
      from: 'remediating',
      to: 'submitted',
      by: ['entity', 'operator'],
      label: 'Resubmit return',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent'],
      derive: (f, at: Instant) => ({ submitted_at: isoUtc(at), ...deriveRatio(f) }),
    },

    // --- exits --------------------------------------------------------------
    {
      id: 'withdraw',
      from: ['draft', 'deficient', 'remediating'],
      to: 'withdrawn',
      by: ['entity'],
      label: 'Withdraw return',
      intent: 'destructive',
      requiresReason: ['superseded_period', 'entity_deregistered', 'filed_in_error'],
      guards: [],
    },
    // a return abandoned in draft/remediation past its bar lapses. system-fired
    // off the state sla by the timer sweep (ppa_contract pattern).
    { id: 'lapse', from: ['draft', 'deficient', 'remediating'], to: 'lapsed', by: ['system', 'operator'], label: 'Lapse', intent: 'secondary', guards: [] },
  ],

  timers: [
    { onState: 'draft', after: { days: 90 }, fire: 'lapse', kind: 'time_bar' },
    { onState: 'remediating', after: { days: 60 }, fire: 'lapse', kind: 'time_bar' },
    { onState: 'submitted', after: { days: 10 }, fire: 'begin_review', escalate: 'flag_deficiency', kind: 'sla' },
  ],
};
