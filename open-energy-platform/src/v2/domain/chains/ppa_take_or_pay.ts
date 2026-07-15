// ppa_take_or_pay — annual take-or-pay true-up for a PPA delivery shortfall,
// as data.
//
// Under the DMRE REIPPPP PPA template + standard utility PPAs, the offtaker
// is obligated to PAY the contracted MWh price even where the IPP didn't
// DELIVER it, net of credits for force-majeure, scheduled outages, and
// curtailment instructions (IFRS 16 lease accounting + IFRS 15 revenue
// recognition). Once a contract-year closes, the offtaker issues a
// delivery-vs-contract statement, may demand evidence from the IPP, proposes
// the take-or-pay quantum, and — once the IPP accepts — settles it. The IPP
// may instead dispute the proposed/agreed quantum (PPA Section 34
// arbitration) or the offtaker may waive the year's shortfall on a board
// exception (force-majeure / regulator-directed curtailment).
//
// Structural honesty (no invented guards):
//  - `settled` is reachable ONLY from `quantum_agreed`, and `quantum_agreed`
//    is reachable ONLY via accept_quantum from `quantum_proposed` — so a
//    take-or-pay amount can NEVER be settled without the IPP first accepting
//    a proposed quantum. No guard required, the state graph enforces it.
//  - `open` is guarded by counterpartyDistinct (offtaker and IPP must be
//    different legal entities — no self-dealing on a bilateral PPA) and
//    complianceHaltClear (no new true-up case opens under a platform-wide
//    compliance halt).
//  - `settle` (the edge that actually releases the take-or-pay payment) is
//    also guarded by complianceHaltClear — same reasoning as
//    tariff_indexation's apply-tariff: the halt blocks the money movement,
//    never the de-risking exits (dispute / waive stay open).
//
// SLA simplification: the legacy per-tier SLA matrix (catastrophic/major/
// moderate/minor, inverted so catastrophic is shortest) collapses here to
// the "major" tier duration — the Section 34 statutory anchor tier — since
// StateDecl.sla is a single duration, not tier-indexed.
//
// settles:true — `settle` records the actual take-or-pay payment against the
// agreed quantum (top_amount_settled + settlement_ref); this is real money
// moving, not a governance record (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ppaTakeOrPay: ChainDecl = {
  key: 'ppa_take_or_pay',
  noun: 'Take-or-pay case',
  refPrefix: 'TOP',
  title: (f) =>
    `Take-or-pay — ${(f.ipp_party_name as string) ?? 'unnamed IPP'} (${(f.reconciliation_year as number) ?? '?'})`,
  visibility: 'party',
  settles: true,
  legalBasis: [
    { instrument: 'REIPPPP PPA template', provision: 'Take-or-pay clause — offtaker pays contracted MWh irrespective of delivery', effect: 'requires' },
    { instrument: 'Electricity Regulation Act 2006', provision: 's34 — dispute referral / NERSA arbitration', effect: 'requires' },
  ],
  roles: ['offtaker', 'ipp_developer', 'operator'],

  fields: {
    ipp_party_name: { type: 'string', required: true, label: 'IPP' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP entity' },
    offtaker_party: { type: 'party', role: 'offtaker', label: 'Offtaker entity' },
    reconciliation_year: { type: 'number', label: 'Reconciliation year' },
    contracted_mwh: { type: 'number', min: 0, label: 'Contracted MWh' },
    delivered_mwh: { type: 'number', min: 0, label: 'Delivered MWh' },
    credited_mwh: { type: 'number', min: 0, label: 'Credited MWh (force-majeure/outage/curtailment)' },
    shortfall_mwh: { type: 'number', min: 0, label: 'Shortfall MWh' },
    shortfall_pct: { type: 'number', min: 0, label: 'Shortfall %' },
    severity_tier: { type: 'string', label: 'Severity tier (catastrophic/major/moderate/minor)' },
    top_rate_per_mwh: { type: 'number', min: 0, label: 'Take-or-pay rate (ZAR/MWh)' },
    evidence_findings: { type: 'string', label: 'Evidence findings' },
    evidence_ref: { type: 'string', label: 'Evidence ref' },
    top_amount_proposed: { type: 'number', min: 0, label: 'Proposed quantum (ZAR)' },
    quantum_proposal_ref: { type: 'string', label: 'Proposal basis / ref' },
    top_amount_agreed: { type: 'number', min: 0, label: 'Agreed quantum (ZAR)' },
    quantum_acceptance_ref: { type: 'string', label: 'Acceptance basis / ref' },
    top_amount_settled: { type: 'number', min: 0, label: 'Settled amount (ZAR)' },
    settlement_ref: { type: 'string', label: 'Settlement ref' },
    nersa_top_return_ref: { type: 'string', label: 'NERSA TOP return ref' },
    dispute_panel_ref: { type: 'string', label: 'Dispute panel ref' },
    section34_filing_ref: { type: 'string', label: 'Section 34 filing ref' },
    waiver_basis: { type: 'string', label: 'Waiver basis' },
    waiver_minute_ref: { type: 'string', label: 'Waiver minute ref' },
    rod_notes: { type: 'string', label: 'Record-of-decision notes' },
    // written by derive, never by the client
    accrual_opened_at: { type: 'string', label: 'Accrual opened at' },
    year_end_at: { type: 'string', label: 'Year-end at' },
    statement_issued_at: { type: 'string', label: 'Statement issued at' },
    evidence_required_at: { type: 'string', label: 'Evidence requested at' },
    evidence_submitted_at: { type: 'string', label: 'Evidence submitted at' },
    quantum_proposed_at: { type: 'string', label: 'Quantum proposed at' },
    quantum_agreed_at: { type: 'string', label: 'Quantum agreed at' },
    settled_at: { type: 'string', label: 'Settled at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    waived_at: { type: 'string', label: 'Waived at' },
  },

  initial: 'accrual_open',

  states: {
    accrual_open: { label: 'Accrual open', terminal: false, holder: 'offtaker', sla: { days: 21 } },
    year_end: { label: 'Year end', terminal: false, holder: 'offtaker', sla: { days: 14 } },
    statement_issued: { label: 'Statement issued', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    evidence_required: { label: 'Evidence required', terminal: false, holder: 'ipp_developer', sla: { days: 21 } },
    evidence_submitted: { label: 'Evidence submitted', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    quantum_proposed: { label: 'Quantum proposed', terminal: false, holder: 'ipp_developer', sla: { days: 90 } },
    quantum_agreed: { label: 'Quantum agreed', terminal: false, holder: 'offtaker', sla: { days: 30 } },
    settled: { label: 'Settled', terminal: true, holder: 'none' },
    disputed: { label: 'Disputed', terminal: true, holder: 'none' },
    waived: { label: 'Waived', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'accrual_open',
      by: ['offtaker', 'operator'],
      actorBecomes: 'offtaker',
      label: 'Open take-or-pay case',
      intent: 'primary',
      input: {
        ipp_party_name: { type: 'string', required: true },
        ipp_party: { type: 'party', role: 'ipp_developer' },
        reconciliation_year: { type: 'number' },
        contracted_mwh: { type: 'number', min: 0 },
        delivered_mwh: { type: 'number', min: 0 },
        credited_mwh: { type: 'number', min: 0 },
        shortfall_mwh: { type: 'number', min: 0 },
        shortfall_pct: { type: 'number', min: 0 },
        severity_tier: { type: 'string' },
        top_rate_per_mwh: { type: 'number', min: 0 },
      },
      // offtaker ≠ IPP (no self-dealing) + no new true-up case under a halt.
      guards: ['counterpartyDistinct', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ accrual_opened_at: isoUtc(at) }),
    },
    {
      id: 'close_year',
      from: 'accrual_open',
      to: 'year_end',
      by: ['offtaker', 'operator'],
      label: 'Close contract year',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ year_end_at: isoUtc(at) }),
    },
    {
      id: 'issue_statement',
      from: 'year_end',
      to: 'statement_issued',
      by: ['offtaker', 'operator'],
      label: 'Issue delivery-vs-contract statement',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ statement_issued_at: isoUtc(at) }),
    },
    {
      id: 'request_evidence',
      from: 'statement_issued',
      to: 'evidence_required',
      by: ['offtaker', 'operator'],
      label: 'Request evidence',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ evidence_required_at: isoUtc(at) }),
    },
    {
      id: 'submit_evidence',
      from: 'evidence_required',
      to: 'evidence_submitted',
      by: ['ipp_developer', 'operator'],
      label: 'Submit evidence',
      intent: 'primary',
      input: {
        evidence_findings: { type: 'string' },
        evidence_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ evidence_submitted_at: isoUtc(at) }),
    },
    {
      // reachable directly off the statement (no dispute over delivery) or
      // after the IPP's evidence has been considered.
      id: 'propose_quantum',
      from: ['statement_issued', 'evidence_submitted'],
      to: 'quantum_proposed',
      by: ['offtaker', 'operator'],
      label: 'Propose quantum',
      intent: 'primary',
      input: {
        top_amount_proposed: { type: 'number', min: 0 },
        quantum_proposal_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ quantum_proposed_at: isoUtc(at) }),
    },
    {
      id: 'accept_quantum',
      from: 'quantum_proposed',
      to: 'quantum_agreed',
      by: ['ipp_developer', 'operator'],
      label: 'Accept quantum',
      intent: 'primary',
      input: {
        top_amount_agreed: { type: 'number', min: 0 },
        quantum_acceptance_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ quantum_agreed_at: isoUtc(at) }),
    },
    {
      // structural settlement gate: the ONLY edge into `settled`, and it can
      // only fire from quantum_agreed — so a take-or-pay amount can never
      // settle without the IPP's prior acceptance.
      id: 'settle',
      from: 'quantum_agreed',
      to: 'settled',
      by: ['offtaker', 'operator'],
      label: 'Settle',
      intent: 'primary',
      input: {
        top_amount_settled: { type: 'number', min: 0 },
        settlement_ref: { type: 'string' },
        nersa_top_return_ref: { type: 'string' },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ settled_at: isoUtc(at) }),
    },
    {
      id: 'dispute',
      from: ['quantum_proposed', 'quantum_agreed', 'evidence_submitted'],
      to: 'disputed',
      by: ['ipp_developer', 'operator'],
      label: 'Dispute',
      intent: 'destructive',
      input: {
        dispute_panel_ref: { type: 'string' },
        section34_filing_ref: { type: 'string' },
        rod_notes: { type: 'string' },
      },
      requiresReason: [
        'delivered_volume_understated',
        'force_majeure_not_credited',
        'curtailment_not_credited',
        'quantum_calculation_error',
        'other',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'waive',
      from: ['year_end', 'statement_issued', 'evidence_required', 'evidence_submitted', 'quantum_proposed'],
      to: 'waived',
      by: ['offtaker', 'operator'],
      label: 'Waive',
      intent: 'destructive',
      input: {
        waiver_basis: { type: 'string' },
        waiver_minute_ref: { type: 'string' },
        rod_notes: { type: 'string' },
      },
      requiresReason: [
        'force_majeure',
        'regulator_directed_curtailment',
        'scheduled_outage_credit',
        'board_exception',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ waived_at: isoUtc(at) }),
    },
  ],
};
