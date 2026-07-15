// pr_underperformance — sustained Performance-Ratio underperformance case for
// a generation site, as data (legacy: Wave 24 Esums PR chain, oe_pr_chain).
//
// An O&M engineer (or the monitoring sweep) opens a case when a site's PR has
// sat below baseline for a sustained window. It walks warning → investigation
// → RCA → intervention → recovery verification → close, with two exits off
// the main line: mark_false_alarm (weather/grid attribution, no fault found)
// and escalate (root cause is beyond routine O&M — e.g. an OEM defect bound
// for warranty). Both exits still require an explicit close step, so nothing
// leaves the ledger open-ended.
//
// Structural honesty (no invented guards):
//  - close is only reachable from `verified`, and verified is only reachable
//    via verify_recovery from `intervention_executing` — so a case can NEVER
//    close without a recorded intervention and a recovery check. Likewise
//    close_escalated only fires from `escalated`, and close_false_alarm only
//    from `false_alarm`. The state graph enforces which closure narrative
//    was actually followed; no guard needed.
//  - escalate is guarded by regulatorPresentIfStrategic. The legacy chain
//    crosses into the regulator inbox when capacity_tier === 'utility' (≥50
//    MW); the registry guard's fixed threshold is ≥100 MW, so this is a
//    stricter subset of the legacy crossing, not an exact match — documented
//    here rather than left silent.
//
// settles:false — a PR case records a fault-finding and remediation
// narrative plus an informational revenue_loss_zar estimate; it never moves
// money itself (any LD/warranty claim it triggers settles on its own chain).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const prUnderperformance: ChainDecl = {
  key: 'pr_underperformance',
  noun: 'PR underperformance case',
  refPrefix: 'PRUP',
  title: (f) =>
    `PR case — ${(f.site_name as string) ?? 'unnamed site'} (${(f.capacity_tier as string) ?? 'tier n/a'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'generator performance-ratio & availability reporting', effect: 'requires' },
  ],
  roles: ['engineer', 'regulator', 'operator'],

  fields: {
    site_name: { type: 'string', required: true, label: 'Site' },
    technology: { type: 'string', label: 'Technology' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    capacity_tier: { type: 'string', label: 'Capacity tier (utility/midscale/ci/microgrid)' },
    baseline_pr: { type: 'number', label: 'Baseline PR' },
    observed_pr: { type: 'number', label: 'Observed PR' },
    pr_shortfall: { type: 'number', label: 'PR shortfall' },
    window_days: { type: 'number', min: 1, label: 'Sustained window (days)' },
    primary_cause: { type: 'string', label: 'Primary cause' },
    rca_summary: { type: 'string', label: 'RCA summary' },
    action_plan: { type: 'string', label: 'Action plan' },
    linked_wo_id: { type: 'string', label: 'Linked work order' },
    linked_warranty_claim_id: { type: 'string', label: 'Linked warranty claim' },
    revenue_loss_zar: { type: 'number', min: 0, label: 'Revenue loss (ZAR) — informational' },
    closure_notes: { type: 'string', label: 'Closure notes' },
    // written by derive, never by the client
    detected_at: { type: 'string', label: 'Detected at' },
    warning_at: { type: 'string', label: 'Warning raised at' },
    investigating_at: { type: 'string', label: 'Investigation started at' },
    intervention_planned_at: { type: 'string', label: 'RCA completed / intervention planned at' },
    intervention_executing_at: { type: 'string', label: 'Intervention dispatched at' },
    verified_at: { type: 'string', label: 'Recovery verified at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
    false_alarm_at: { type: 'string', label: 'Marked false alarm at' },
    closed_at: { type: 'string', label: 'Closed at' },
  },

  initial: 'monitoring',

  states: {
    monitoring: { label: 'Monitoring', terminal: false, holder: 'engineer' },
    warning: { label: 'Warning', terminal: false, holder: 'engineer' },
    investigating: { label: 'Investigating', terminal: false, holder: 'engineer' },
    intervention_planned: { label: 'Intervention planned', terminal: false, holder: 'engineer' },
    intervention_executing: { label: 'Intervention executing', terminal: false, holder: 'engineer' },
    verified: { label: 'Recovery verified', terminal: false, holder: 'engineer' },
    escalated: { label: 'Escalated', terminal: false, holder: 'engineer' },
    false_alarm: { label: 'False alarm', terminal: false, holder: 'engineer' },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'monitoring',
      by: ['engineer', 'operator'],
      actorBecomes: 'engineer',
      label: 'Open PR case',
      intent: 'primary',
      input: {
        site_name: { type: 'string', required: true },
        technology: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        capacity_tier: { type: 'string' },
        baseline_pr: { type: 'number' },
        observed_pr: { type: 'number' },
        pr_shortfall: { type: 'number' },
        window_days: { type: 'number', min: 1 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ detected_at: isoUtc(at) }),
    },
    {
      id: 'start_warning',
      from: 'monitoring',
      to: 'warning',
      by: ['engineer', 'operator'],
      label: 'Start warning',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ warning_at: isoUtc(at) }),
    },
    {
      id: 'begin_investigation',
      from: 'warning',
      to: 'investigating',
      by: ['engineer', 'operator'],
      label: 'Begin investigation',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ investigating_at: isoUtc(at) }),
    },
    {
      id: 'complete_rca',
      from: 'investigating',
      to: 'intervention_planned',
      by: ['engineer', 'operator'],
      label: 'Complete RCA',
      intent: 'primary',
      input: {
        primary_cause: { type: 'string' },
        rca_summary: { type: 'string' },
        action_plan: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ intervention_planned_at: isoUtc(at) }),
    },
    {
      id: 'dispatch_intervention',
      from: 'intervention_planned',
      to: 'intervention_executing',
      by: ['engineer', 'operator'],
      label: 'Dispatch intervention',
      intent: 'primary',
      input: { linked_wo_id: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ intervention_executing_at: isoUtc(at) }),
    },
    {
      id: 'verify_recovery',
      from: 'intervention_executing',
      to: 'verified',
      by: ['engineer', 'operator'],
      label: 'Verify recovery',
      intent: 'primary',
      input: { observed_pr: { type: 'number' } },
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      // the ONLY door into a routine close: unreachable without a recorded
      // recovery check, so a case can never close on an unverified fix.
      id: 'close',
      from: 'verified',
      to: 'closed',
      by: ['engineer', 'operator'],
      label: 'Close case',
      intent: 'primary',
      input: {
        closure_notes: { type: 'string' },
        revenue_loss_zar: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },

    // --- escalation branch (root cause beyond routine O&M) ---------------------
    {
      id: 'escalate',
      from: ['investigating', 'intervention_executing'],
      to: 'escalated',
      by: ['engineer', 'operator'],
      label: 'Escalate',
      intent: 'secondary',
      input: { linked_warranty_claim_id: { type: 'string' } },
      // ≥100 MW cases must carry a regulator on the txn before escalating —
      // approximates the legacy utility-tier (≥50 MW) regulator crossing.
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      id: 'close_escalated',
      from: 'escalated',
      to: 'closed',
      by: ['engineer', 'operator'],
      label: 'Close (escalated)',
      intent: 'primary',
      input: {
        closure_notes: { type: 'string' },
        revenue_loss_zar: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },

    // --- false-alarm branch (weather/grid attribution, no fault found) --------
    {
      id: 'mark_false_alarm',
      from: ['warning', 'investigating'],
      to: 'false_alarm',
      by: ['engineer', 'operator'],
      label: 'Mark false alarm',
      intent: 'destructive',
      input: { closure_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ false_alarm_at: isoUtc(at) }),
    },
    {
      id: 'close_false_alarm',
      from: 'false_alarm',
      to: 'closed',
      by: ['engineer', 'operator'],
      label: 'Close (false alarm)',
      intent: 'primary',
      input: { closure_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at: isoUtc(at) }),
    },
  ],

  // No timers: the legacy SLA windows are tier-conditional (utility/midscale/
  // ci/microgrid each carry a different duration per state — see
  // utils/pr-chain-spec.ts SLA_MINUTES), and TimerDecl only supports one fixed
  // Duration per state. A single-tier approximation would misrepresent the
  // other three tiers, so timers are omitted rather than guessed.
};
