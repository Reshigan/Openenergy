// market_abuse_case — trading-surveillance case lifecycle, as data (v1:
// oe_market_abuse_cases, wave 52).
//
// The platform's surveillance scan / SIEM dispatch cron (CLAUDE.md: every 15
// minutes) raises an alert against a subject trader for a suspected typology
// (layering, spoofing, wash trading, ...). The compliance desk triages,
// opens a formal investigation, compiles order-book/comms evidence, and
// completes the analysis. From there the case either clears (no abuse
// found), is dismissed early as a false positive, or a STOR is filed with
// the FSCA and referred to enforcement, ending in a sanction. Any live stage
// from analysis onward may be disputed by the subject and resolved.
//
// The subject trader is READ-ONLY (v1 comment: "trader lane is read-only
// visibility ... write access is per-action below — no action lists trader,
// so Thread shows no buttons"). `trader` is on the roles list only so the
// subject can be carried as a party and see the case; it never appears in
// a `by` array.
//
// Structural honesty (no invented guards):
//  - `raise_alert` has no v1 route of its own — v1 never exposes a manual
//    "open case" action, only the cron. `by: ['system', ...]` reflects that;
//    compliance/regulator staff are also listed because the desk can escalate
//    a case by hand (every other edge in this chain is dual system+desk).
//  - `clear` is only reachable from `analysis_complete` — a case can NEVER
//    close as "no abuse" without going through triage → investigation →
//    evidence → analysis. `dismiss` is the early-exit twin, reachable only
//    from `alert_raised`/`triaged` (a false positive caught before the desk
//    spends investigation effort) — both land on the same `cleared` terminal
//    because v1's terminal set has no separate "dismissed" state.
//  - `file_stor` is only reachable from `analysis_complete`, so a STOR can
//    never be filed without a completed analysis backing it.
//  - `raise_dispute` is reachable from every stage that produces a decision
//    the subject could contest (analysis, STOR, referral, enforcement) —
//    the graph carries that breadth, not a guard.
//  - none of the 10 registry guards model a surveillance typology or FSCA
//    filing; the escalation ladder itself is the control (mirrors
//    poslimit_case's stance).
//
// settles:false — a case records enforcement state; any imposed penalty
// settles on its own rail (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const marketAbuseCase: ChainDecl = {
  key: 'market_abuse_case',
  noun: 'Market abuse case',
  refPrefix: 'MAC',
  title: (f) => `Market abuse — ${(f.typology as string) ?? 'typology TBC'} (${(f.subject_party_name as string) ?? 'subject TBC'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Markets Act 2012', provision: 'Ch.X market abuse — insider trading, false/deceptive statements, market manipulation', effect: 'creates_offence' },
  ],
  roles: ['trader', 'compliance', 'regulator', 'operator'],

  fields: {
    case_number: { type: 'string', label: 'Case number' },
    typology: { type: 'string', label: 'Typology (e.g. layering / spoofing)' },
    suspect_value_zar_m: { type: 'number', min: 0, label: 'Suspect value (ZAR m)' },
    subject_party: { type: 'party', role: 'trader', label: 'Subject trader' },
    subject_party_name: { type: 'string', label: 'Subject (display name)' },
    triage_basis: { type: 'string', label: 'Triage basis / evidence' },
    investigation_ref: { type: 'string', label: 'Investigation ref' },
    investigation_basis: { type: 'string', label: 'Investigation basis / evidence' },
    evidence_ref: { type: 'string', label: 'Evidence pack ref' },
    evidence_basis: { type: 'string', label: 'Evidence basis' },
    analysis_ref: { type: 'string', label: 'Analysis ref' },
    analysis_basis: { type: 'string', label: 'Analysis basis / evidence' },
    resolution_notes: { type: 'string', label: 'Resolution notes' },
    dismissal_notes: { type: 'string', label: 'Dismissal notes' },
    stor_ref: { type: 'string', label: 'STOR ref' },
    stor_basis: { type: 'string', label: 'STOR basis / evidence' },
    regulator_ref: { type: 'string', label: 'FSCA / regulator ref' },
    referral_ref: { type: 'string', label: 'Referral ref' },
    referral_basis: { type: 'string', label: 'Referral basis / evidence' },
    enforcement_ref: { type: 'string', label: 'Enforcement ref' },
    enforcement_basis: { type: 'string', label: 'Enforcement basis / evidence' },
    sanction_ref: { type: 'string', label: 'Sanction ref' },
    penalty_zar_m: { type: 'number', min: 0, label: 'Penalty (ZAR m)' },
    sanction_basis: { type: 'string', label: 'Sanction basis / evidence' },
    dispute_ref: { type: 'string', label: 'Dispute ref' },
    dispute_basis: { type: 'string', label: 'Dispute basis / evidence' },
    resolution_ref: { type: 'string', label: 'Dispute resolution ref' },
    // written by derive, never by the client
    triaged_at: { type: 'string', label: 'Triaged at' },
    investigation_opened_at: { type: 'string', label: 'Investigation opened at' },
    evidence_compiled_at: { type: 'string', label: 'Evidence compiled at' },
    analysis_completed_at: { type: 'string', label: 'Analysis completed at' },
    cleared_at: { type: 'string', label: 'Cleared at' },
    dismissed_at: { type: 'string', label: 'Dismissed at' },
    stor_filed_at: { type: 'string', label: 'STOR filed at' },
    referred_at: { type: 'string', label: 'Referred at' },
    enforcement_commenced_at: { type: 'string', label: 'Enforcement commenced at' },
    sanctioned_at: { type: 'string', label: 'Sanctioned at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    dispute_resolved_at: { type: 'string', label: 'Dispute resolved at' },
  },

  initial: 'alert_raised',

  states: {
    alert_raised: { label: 'Alert raised', terminal: false, holder: 'compliance', sla: { hours: 4 } },
    triaged: { label: 'Triaged', terminal: false, holder: 'compliance', sla: { days: 5 } },
    under_investigation: { label: 'Under investigation', terminal: false, holder: 'compliance', sla: { days: 30 } },
    evidence_review: { label: 'Evidence review', terminal: false, holder: 'compliance', sla: { days: 15 } },
    analysis_complete: { label: 'Analysis complete', terminal: false, holder: 'compliance', sla: { days: 5 } },
    stor_filed: { label: 'STOR filed', terminal: false, holder: 'regulator', sla: { days: 10 } },
    regulator_referred: { label: 'Referred to regulator', terminal: false, holder: 'regulator', sla: { days: 30 } },
    enforcement_action: { label: 'Enforcement action', terminal: false, holder: 'regulator', sla: { days: 60 } },
    disputed: { label: 'Disputed', terminal: false, holder: 'compliance', sla: { days: 20 } },
    cleared: { label: 'Cleared', terminal: true, holder: 'none' },
    sanctioned: { label: 'Sanctioned', terminal: true, holder: 'none' },
    dispute_resolved: { label: 'Dispute resolved', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      // no v1 manual-open route: the surveillance-scan cron raises these.
      // compliance/regulator/operator are also listed since the desk can
      // escalate a case by hand off a tip-off or whistleblower report.
      id: 'raise_alert',
      from: '@new',
      to: 'alert_raised',
      by: ['system', 'compliance', 'regulator', 'operator'],
      actorBecomes: 'compliance',
      label: 'Raise surveillance alert',
      intent: 'primary',
      input: {
        case_number: { type: 'string' },
        subject_party: { type: 'party', role: 'trader' },
        subject_party_name: { type: 'string' },
        suspect_value_zar_m: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'triage',
      from: 'alert_raised',
      to: 'triaged',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Triage alert',
      intent: 'primary',
      input: {
        typology: { type: 'string' },
        triage_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ triaged_at: isoUtc(at) }),
    },
    {
      id: 'open_investigation',
      from: 'triaged',
      to: 'under_investigation',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Open investigation',
      intent: 'primary',
      input: {
        investigation_ref: { type: 'string' },
        investigation_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ investigation_opened_at: isoUtc(at) }),
    },
    {
      id: 'compile_evidence',
      from: 'under_investigation',
      to: 'evidence_review',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Compile evidence',
      intent: 'primary',
      input: {
        evidence_ref: { type: 'string' },
        evidence_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ evidence_compiled_at: isoUtc(at) }),
    },
    {
      // structural gate: analysis_complete is the ONLY door to clear or file
      // a STOR — a case can never resolve without a completed analysis.
      id: 'complete_analysis',
      from: 'evidence_review',
      to: 'analysis_complete',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Complete analysis',
      intent: 'primary',
      input: {
        analysis_ref: { type: 'string' },
        analysis_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ analysis_completed_at: isoUtc(at) }),
    },
    {
      id: 'clear',
      from: 'analysis_complete',
      to: 'cleared',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Clear case',
      intent: 'destructive',
      input: { resolution_notes: { type: 'string' } },
      requiresReason: ['no_abuse_found', 'insufficient_evidence', 'legitimate_trading_rationale'],
      guards: [],
      derive: (_f, at: Instant) => ({ cleared_at: isoUtc(at) }),
    },
    {
      // early-exit twin of `clear`: a false positive caught before the desk
      // spends investigation effort. Same `cleared` terminal — v1 has no
      // separate "dismissed" state.
      id: 'dismiss',
      from: ['alert_raised', 'triaged'],
      to: 'cleared',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Dismiss alert',
      intent: 'destructive',
      input: { dismissal_notes: { type: 'string' } },
      requiresReason: ['false_positive', 'stale_data', 'duplicate_alert', 'below_materiality'],
      guards: [],
      derive: (_f, at: Instant) => ({ dismissed_at: isoUtc(at) }),
    },
    {
      id: 'file_stor',
      from: 'analysis_complete',
      to: 'stor_filed',
      by: ['compliance', 'regulator', 'operator'],
      label: 'File STOR',
      intent: 'primary',
      input: {
        stor_ref: { type: 'string' },
        stor_basis: { type: 'string' },
        regulator_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ stor_filed_at: isoUtc(at) }),
    },
    {
      id: 'refer_regulator',
      from: 'stor_filed',
      to: 'regulator_referred',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Refer to regulator',
      intent: 'primary',
      input: {
        referral_ref: { type: 'string' },
        regulator_ref: { type: 'string' },
        referral_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ referred_at: isoUtc(at) }),
    },
    {
      id: 'commence_enforcement',
      from: 'regulator_referred',
      to: 'enforcement_action',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Commence enforcement',
      intent: 'primary',
      input: {
        enforcement_ref: { type: 'string' },
        enforcement_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ enforcement_commenced_at: isoUtc(at) }),
    },
    {
      id: 'sanction',
      from: 'enforcement_action',
      to: 'sanctioned',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Impose sanction',
      intent: 'destructive',
      input: {
        sanction_ref: { type: 'string' },
        penalty_zar_m: { type: 'number', min: 0 },
        sanction_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ sanctioned_at: isoUtc(at) }),
    },
    {
      // reachable from every stage that produces a decision the subject
      // could contest: analysis, STOR, referral, enforcement.
      id: 'raise_dispute',
      from: ['analysis_complete', 'stor_filed', 'regulator_referred', 'enforcement_action'],
      to: 'disputed',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Raise dispute',
      intent: 'destructive',
      input: {
        dispute_ref: { type: 'string' },
        dispute_basis: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'resolve_dispute',
      from: 'disputed',
      to: 'dispute_resolved',
      by: ['compliance', 'regulator', 'operator'],
      label: 'Resolve dispute',
      intent: 'primary',
      input: {
        resolution_ref: { type: 'string' },
        resolution_notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ dispute_resolved_at: isoUtc(at) }),
    },
  ],
};
