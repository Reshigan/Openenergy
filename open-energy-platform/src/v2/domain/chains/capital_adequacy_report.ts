// capital_adequacy_report — SARB Basel III ICAAP submission lifecycle as data.
//
// A reporting bank (the LENDER role — the same risk_lender persona as
// capital_adequacy.ts) runs its internal capital-adequacy process for a
// reporting period: calculate risk-weighted assets, complete the ICAAP
// stress-test review, get board sign-off, then file with SARB (the
// REGULATOR). SARB may accept outright, raise queries (answered and
// re-reviewed in place), or flag a shortfall for remediation — which loops
// back through a refile once fixed. SARB can also declare a capital breach
// at any point once the filing is under its review.
//
// This is a distinct chain from capital_adequacy.ts (the FSCA market-participant
// return): same regulatory family, different regulator (SARB, not FSCA),
// different lifecycle shape (RWA/ICAAP/board-approval pipeline feeding a
// query/remediation loop, not a flat submit→accept/deficient loop).
//
// Structural gates (no invented guards):
//  - accepted is reachable ONLY from submitted_to_sarb via sarb_accept, and
//    submitted_to_sarb is reachable ONLY via submit_to_sarb (from
//    board_approved) or refile (from remediation_in_progress) or
//    respond_to_queries (from queries_raised). So SARB can never accept a
//    filing that hasn't cleared RWA calc → ICAAP → board approval — the
//    state graph enforces the pipeline order, no guard needed.
//  - submit_to_sarb and refile (the two edges that hand a filing to SARB)
//    are guarded by completenessEvidencePresent — mirrors capital_adequacy.ts's
//    submit/resubmit: a filing needs a named completeness-attestation ref.
//  - submit_to_sarb also carries counterpartyDistinct (the regulator_party
//    attached here must be a different legal entity from the bank) and
//    complianceHaltClear (no new SARB filings under a platform-wide halt);
//    refile repeats complianceHaltClear since it is also a new commitment
//    to the regulator. De-risking exits (declare_capital_breach, withdraw)
//    are never blocked by a halt.
//
// settles:false — a capital-adequacy filing records solvency ratios; it never
// moves money (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

/** pass/fail read on the Basel III CET1 minimum (4.5%). Pure: comparison only. */
const deriveCapitalAdequate = (f: Record<string, Json>): Record<string, Json> => {
  const cet1 = f.cet1_ratio;
  return typeof cet1 === 'number' ? { capital_adequate: cet1 >= 4.5 } : {};
};

export const capitalAdequacyReport: ChainDecl = {
  key: 'capital_adequacy_report',
  noun: 'Capital adequacy report',
  refPrefix: 'CARP',
  title: (f) =>
    `Capital adequacy report — ${(f.bank_tier as string) ?? 'bank'} ${(f.report_period as string) ?? ''}`.trim(),
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Banks Act 1990', provision: 's90 regulatory capital-adequacy directives (Basel III)', effect: 'requires' },
    { instrument: 'Financial Sector Regulation Act 2017', provision: 's106 regulatory reporting to the Prudential Authority (SARB)', effect: 'requires' },
  ],
  roles: ['lender', 'regulator', 'operator'],

  fields: {
    report_period: { type: 'string', required: true, label: 'Report period (e.g. 2026-Q2)' },
    reporting_date: { type: 'string', label: 'Reporting date' },
    bank_tier: { type: 'string', label: 'Bank tier (smaller/mid_tier/large/systemically_important)' },
    lender_party: { type: 'party', role: 'lender', label: 'Reporting bank' },
    regulator_party: { type: 'party', role: 'regulator', label: 'SARB reviewer' },
    rwa_credit_risk: { type: 'number', min: 0, label: 'RWA credit risk (ZAR)' },
    rwa_market_risk: { type: 'number', min: 0, label: 'RWA market risk (ZAR)' },
    rwa_operational_risk: { type: 'number', min: 0, label: 'RWA operational risk (ZAR)' },
    rwa_total: { type: 'number', min: 0, label: 'Total RWA (ZAR)' },
    cet1_ratio: { type: 'number', min: 0, label: 'CET1 ratio (%)' },
    tier1_ratio: { type: 'number', min: 0, label: 'Tier 1 ratio (%)' },
    total_capital_ratio: { type: 'number', min: 0, label: 'Total capital ratio (%)' },
    leverage_ratio: { type: 'number', min: 0, label: 'Leverage ratio (%)' },
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    completeness_ref: { type: 'string', label: 'Completeness attestation ref' },
    sarb_submission_ref: { type: 'string', label: 'SARB submission ref' },
    sarb_query_detail: { type: 'string', label: 'SARB query detail' },
    sarb_query_response: { type: 'string', label: 'Response to SARB query' },
    remediation_description: { type: 'string', label: 'Remediation required' },
    remediation_deadline: { type: 'string', label: 'Remediation deadline' },
    remediation_count: { type: 'number', label: 'Times flagged for remediation' },
    // written by derive, never by the client
    capital_adequate: { type: 'boolean', label: 'Capital adequate (CET1 ≥ 4.5%)' },
    rwa_calc_started_at: { type: 'string', label: 'RWA calc started at' },
    rwa_calc_completed_at: { type: 'string', label: 'RWA calc completed at' },
    icaap_completed_at: { type: 'string', label: 'ICAAP completed at' },
    board_approved_at: { type: 'string', label: 'Board approved at' },
    submitted_at: { type: 'string', label: 'Submitted to SARB at' },
    queries_raised_at: { type: 'string', label: 'Queries raised at' },
    query_responded_at: { type: 'string', label: 'Query response submitted at' },
    remediation_flagged_at: { type: 'string', label: 'Remediation flagged at' },
    remediation_started_at: { type: 'string', label: 'Remediation started at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    capital_breach_at: { type: 'string', label: 'Capital breach declared at' },
  },

  initial: 'draft',

  states: {
    draft: { label: 'Draft', terminal: false, holder: 'lender', sla: { days: 30 } },
    rwa_calc_in_progress: { label: 'RWA calculation in progress', terminal: false, holder: 'lender', sla: { days: 15 } },
    rwa_calculated: { label: 'RWA calculated', terminal: false, holder: 'lender', sla: { days: 10 } },
    icaap_complete: { label: 'ICAAP complete', terminal: false, holder: 'lender', sla: { days: 10 } },
    board_approved: { label: 'Board approved', terminal: false, holder: 'lender', sla: { days: 10 } },
    submitted_to_sarb: { label: 'Submitted to SARB', terminal: false, holder: 'regulator', sla: { days: 20 } },
    queries_raised: { label: 'SARB queries raised', terminal: false, holder: 'lender', sla: { days: 10 } },
    remediation_flagged: { label: 'Remediation flagged', terminal: false, holder: 'lender', sla: { days: 10 } },
    remediation_in_progress: { label: 'Remediation in progress', terminal: false, holder: 'lender', sla: { days: 30 } },
    accepted: { label: 'Accepted', terminal: true, holder: 'none' },
    capital_breach: { label: 'Capital breach declared', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'draft',
      by: ['lender', 'operator'],
      actorBecomes: 'lender',
      label: 'Open capital adequacy report',
      intent: 'primary',
      input: {
        report_period: { type: 'string', required: true },
        reporting_date: { type: 'string' },
        bank_tier: { type: 'string' },
      },
      guards: [],
    },

    // --- internal capital-adequacy pipeline: RWA → ICAAP → board sign-off -----
    {
      id: 'start_rwa_calc',
      from: 'draft',
      to: 'rwa_calc_in_progress',
      by: ['lender', 'operator'],
      label: 'Start RWA calculation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ rwa_calc_started_at: isoUtc(at) }),
    },
    {
      id: 'complete_rwa_calc',
      from: 'rwa_calc_in_progress',
      to: 'rwa_calculated',
      by: ['lender', 'operator'],
      label: 'Complete RWA calculation',
      intent: 'primary',
      input: {
        rwa_credit_risk: { type: 'number', min: 0 },
        rwa_market_risk: { type: 'number', min: 0 },
        rwa_operational_risk: { type: 'number', min: 0 },
        rwa_total: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ rwa_calc_completed_at: isoUtc(at) }),
    },
    {
      id: 'complete_icaap',
      from: 'rwa_calculated',
      to: 'icaap_complete',
      by: ['lender', 'operator'],
      label: 'Complete ICAAP',
      intent: 'primary',
      input: {
        cet1_ratio: { type: 'number', min: 0 },
        tier1_ratio: { type: 'number', min: 0 },
        total_capital_ratio: { type: 'number', min: 0 },
        leverage_ratio: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => ({ icaap_completed_at: isoUtc(at), ...deriveCapitalAdequate(f) }),
    },
    {
      id: 'board_approve',
      from: 'icaap_complete',
      to: 'board_approved',
      by: ['lender', 'operator'],
      label: 'Board approve',
      intent: 'primary',
      input: { board_approval_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ board_approved_at: isoUtc(at) }),
    },

    // --- SARB filing + query/remediation loop ----------------------------------
    {
      // the ONLY edge into submitted_to_sarb from outside the loop, and it can
      // only fire from board_approved — a filing cannot reach SARB without
      // clearing RWA/ICAAP/board sign-off first.
      id: 'submit_to_sarb',
      from: 'board_approved',
      to: 'submitted_to_sarb',
      by: ['lender', 'operator'],
      label: 'Submit to SARB',
      intent: 'primary',
      input: {
        sarb_submission_ref: { type: 'string' },
        completeness_ref: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // SARB reviewer ≠ reporting bank (no self-review) + no new filings under
      // a compliance halt + completeness attestation owned by the guard so the
      // rejection carries the domain code, not a bare engine required-check.
      guards: ['counterpartyDistinct', 'complianceHaltClear', 'completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'sarb_raises_queries',
      from: 'submitted_to_sarb',
      to: 'queries_raised',
      by: ['regulator', 'operator'],
      label: 'SARB raises queries',
      intent: 'secondary',
      input: { sarb_query_detail: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ queries_raised_at: isoUtc(at) }),
    },
    {
      id: 'respond_to_queries',
      from: 'queries_raised',
      to: 'submitted_to_sarb',
      by: ['lender', 'operator'],
      label: 'Respond to queries',
      intent: 'primary',
      input: { sarb_query_response: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ query_responded_at: isoUtc(at) }),
    },
    {
      id: 'flag_remediation',
      from: 'submitted_to_sarb',
      to: 'remediation_flagged',
      by: ['regulator', 'operator'],
      label: 'Flag remediation',
      intent: 'destructive',
      input: {
        remediation_description: { type: 'string', required: true },
        remediation_deadline: { type: 'string' },
      },
      requiresReason: ['capital_shortfall', 'rwa_understated', 'process_gap', 'disclosure_gap'],
      guards: [],
      derive: (f, at: Instant) => ({
        remediation_count: (typeof f.remediation_count === 'number' ? f.remediation_count : 0) + 1,
        remediation_flagged_at: isoUtc(at),
      }),
    },
    {
      id: 'start_remediation',
      from: 'remediation_flagged',
      to: 'remediation_in_progress',
      by: ['lender', 'operator'],
      label: 'Start remediation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ remediation_started_at: isoUtc(at) }),
    },
    {
      // the loop back to SARB after remediation — same completeness gate as the
      // first filing, and the same halt gate (a resubmission is also a new
      // commitment to the regulator).
      id: 'refile',
      from: 'remediation_in_progress',
      to: 'submitted_to_sarb',
      by: ['lender', 'operator'],
      label: 'Refile',
      intent: 'primary',
      input: { completeness_ref: { type: 'string' } },
      guards: ['completenessEvidencePresent', 'complianceHaltClear'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'sarb_accept',
      from: 'submitted_to_sarb',
      to: 'accepted',
      by: ['regulator', 'operator'],
      label: 'SARB accept',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'declare_capital_breach',
      from: ['submitted_to_sarb', 'queries_raised', 'remediation_flagged', 'remediation_in_progress'],
      to: 'capital_breach',
      by: ['regulator', 'operator'],
      label: 'Declare capital breach',
      intent: 'destructive',
      requiresReason: ['capital_ratio_below_minimum', 'leverage_ratio_breach', 'liquidity_shortfall', 'regulatory_directive'],
      guards: [],
      derive: (_f, at: Instant) => ({ capital_breach_at: isoUtc(at) }),
    },

    // --- exit before SARB has the filing (never blocked by a halt) ------------
    {
      id: 'withdraw',
      from: ['draft', 'rwa_calc_in_progress', 'rwa_calculated', 'icaap_complete', 'board_approved'],
      to: 'withdrawn',
      by: ['lender', 'operator', 'system'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['superseded_period', 'entity_restructured', 'filed_in_error', 'abandoned_stale_draft'],
      guards: [],
    },
  ],

  // a draft abandoned pre-filing stales out — mirrors capital_adequacy.ts's
  // draft time-bar. system-fired off the state sla by the timer sweep.
  timers: [{ onState: 'draft', after: { days: 90 }, fire: 'withdraw', kind: 'time_bar', reason: 'abandoned_stale_draft' }],
};
