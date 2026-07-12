// dispute_resolution — a commercial dispute between two counterparties as data.
//
// A claimant files a dispute against a named respondent; the matter is referred
// to mediation, escalated to arbitration when mediation fails, and closed by a
// binding arbitral award. At any live stage the parties may settle privately, the
// claimant may withdraw, or the arbitrator may dismiss for cause.
//
// The award spine is STRUCTURAL, not a guard: `awarded` is reachable ONLY from
// in_arbitration (via render_award). So render_award from in_mediation — a matter
// still in mediation, never arbitrated — is an ILLEGAL_TRANSITION the engine's
// step-4 state check refuses before any guard runs. A dispute can therefore never
// be "awarded" without first passing through arbitration.
//
// counterpartyDistinct at @new blocks a party disputing with itself (self-dealing).
// completenessEvidencePresent forces a complete award-record ref at render_award
// (Pattern A: present-but-not-required, so an absent ref surfaces the guard's
// MISSING_COMPLETENESS_EVIDENCE, not a generic BAD_INPUT).
//
// settles:false — a dispute record is a framework/notice record; any monetary
// award is executed through the settlement transactions it authorises, never
// through THIS chain (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const disputeResolution: ChainDecl = {
  key: 'dispute_resolution',
  noun: 'Dispute',
  refPrefix: 'DISP',
  title: (f) =>
    `Dispute — ${(f.claimant_name as string) ?? 'claimant'} v ${(f.respondent_name as string) ?? 'respondent'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Arbitration Act 15 of 2017 (RSA)', provision: 's1 arbitration agreement + binding award', effect: 'authorises' },
    { instrument: 'ERA 2006', provision: 'licensed-activity dispute conduct standards', effect: 'requires' },
  ],
  roles: ['claimant', 'respondent', 'arbitrator', 'operator'],

  fields: {
    claimant_name: { type: 'string', required: true, label: 'Claimant' },
    respondent_name: { type: 'string', required: true, label: 'Respondent' },
    respondent_party: { type: 'party', role: 'respondent', label: 'Respondent participant' },
    dispute_type: { type: 'string', label: 'Dispute type (settlement/tariff/breach/metering)' },
    amount_in_dispute: { type: 'number', label: 'Amount in dispute (ZAR)' },
    governing_law: { type: 'string', label: 'Governing law' },
    statement_ref: { type: 'string', label: 'Statement of claim ref' },
    // present-but-not-required award-record ref (Pattern A: rides the guard)
    completeness_ref: { type: 'string', label: 'Award-record completeness ref' },
    // written by derive, never by the client
    awarded_at: { type: 'string', label: 'Award rendered at' },
    settled_at: { type: 'string', label: 'Privately settled at' },
  },

  initial: 'filed',

  states: {
    filed: { label: 'Filed', terminal: false, holder: 'respondent', sla: { days: 21 } },
    in_mediation: { label: 'In mediation', terminal: false, holder: 'none', sla: { days: 30 } },
    in_arbitration: { label: 'In arbitration', terminal: false, holder: 'arbitrator', sla: { days: 60 } },
    awarded: { label: 'Awarded', terminal: true, holder: 'none' },
    settled: { label: 'Settled', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'filed',
      by: ['claimant', 'operator'],
      actorBecomes: 'claimant',
      label: 'File dispute',
      intent: 'primary',
      input: {
        claimant_name: { type: 'string', required: true },
        respondent_name: { type: 'string', required: true },
        respondent_party: { type: 'party', role: 'respondent' },
        dispute_type: { type: 'string' },
        amount_in_dispute: { type: 'number' },
        governing_law: { type: 'string' },
        statement_ref: { type: 'string' },
      },
      // no self-dispute: claimant and respondent must be distinct entities.
      guards: ['counterpartyDistinct'],
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'refer_to_mediation',
      from: 'filed',
      to: 'in_mediation',
      by: ['claimant', 'operator'],
      label: 'Refer to mediation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'escalate_to_arbitration',
      from: 'in_mediation',
      to: 'in_arbitration',
      by: ['claimant', 'operator'],
      label: 'Escalate to arbitration',
      intent: 'primary',
      requiresReason: ['mediation_failed', 'no_agreement', 'respondent_non_participation'],
      guards: [],
    },
    {
      // structural award gate: the ONLY edge into `awarded`, firing ONLY from
      // in_arbitration. A dispute can never be awarded without passing through
      // arbitration — the state graph enforces it, no guard needed. A complete
      // award-record ref rides completenessEvidencePresent (Pattern A).
      id: 'render_award',
      from: 'in_arbitration',
      to: 'awarded',
      by: ['arbitrator', 'claimant', 'operator'],
      label: 'Render binding award',
      intent: 'primary',
      input: {
        // present-but-not-required so an absent ref surfaces the guard's
        // MISSING_COMPLETENESS_EVIDENCE, not a generic BAD_INPUT (Pattern A).
        completeness_ref: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ awarded_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'settle_privately',
      from: ['filed', 'in_mediation', 'in_arbitration'],
      to: 'settled',
      by: ['claimant', 'respondent', 'operator'],
      label: 'Settle privately',
      intent: 'secondary',
      requiresReason: ['mutual_settlement', 'commercial_resolution', 'without_prejudice_agreement'],
      guards: [],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['filed', 'in_mediation', 'in_arbitration'],
      to: 'withdrawn',
      by: ['claimant', 'operator'],
      label: 'Withdraw dispute',
      intent: 'destructive',
      requiresReason: ['claim_abandoned', 'no_longer_pursued', 'resolved_informally'],
      guards: [],
    },
    {
      id: 'dismiss',
      from: ['filed', 'in_mediation', 'in_arbitration'],
      to: 'dismissed',
      by: ['arbitrator', 'operator'],
      label: 'Dismiss dispute',
      intent: 'destructive',
      requiresReason: ['no_jurisdiction', 'frivolous', 'time_barred', 'no_arbitration_agreement'],
      guards: [],
    },
  ],

  // arbitration time-bar: a matter left un-awarded past the window stales out.
  // Record-only stub — the sweep computes the real bar off the state sla days
  // (isda_agreement / contract_execution pattern).
  timers: [{ onState: 'in_arbitration', after: { days: 0 }, fire: 'dismiss', kind: 'time_bar' }],
};
