// tcpi — To-Complete Performance Index assessment lifecycle as data.
//
// Bound to a project change-order txn (REBUILD_FUNCTIONAL_FLOOR: IPP Developer).
// Project controls (originator) raises a TCPI assessment off the change-order
// baseline (BAC/EV/AC); a reviewer computes the index and either accepts it (work
// is recoverable within budget) or flags recovery. TCPI_BAC = (BAC - EV)/(BAC - AC)
// — the cost-efficiency the REMAINING work must run at to still land on budget.
// >1.0 means every remaining rand must stretch; the tier buckets that severity.
//
// The recovery gate is STRUCTURAL, not a guard: accept_recovery leaves ONLY
// recovery_submitted, and the ONLY path into recovery_submitted is submit_recovery.
// So a recovery can NEVER be signed off before a recovery plan is actually
// submitted — the state graph enforces it. A critical-priority recovery also
// crosses to the regulator (regulatorPresentIfCritical).
//
// settles:false — a performance index is an EVM control readout, never a payment.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure TCPI off the baseline. Null when inputs are non-numeric or the budget
// remaining (BAC - AC) is zero (index undefined — cannot divide). No clock, no env.
const toCompletePerformanceIndex = (bac: Json | undefined, ev: Json | undefined, ac: Json | undefined): number | null => {
  if (typeof bac !== 'number' || typeof ev !== 'number' || typeof ac !== 'number') return null;
  const budgetRemaining = bac - ac;
  if (budgetRemaining === 0) return null;
  return (bac - ev) / budgetRemaining;
};

// severity bucket off the numeric index. <=1.0 recoverable, <=1.1 stretch, else unrecoverable.
const tcpiTier = (v: number | null): string => {
  if (v === null) return 'unassessed';
  if (v <= 1.0) return 'on_track';
  if (v <= 1.1) return 'stretch';
  return 'unrecoverable';
};

export const tcpi: ChainDecl = {
  key: 'tcpi',
  noun: 'TCPI assessment',
  refPrefix: 'TCPI',
  title: (f) => `TCPI — ${(f.project_name as string) ?? 'unnamed project'} (${(f.tcpi_tier as string) ?? 'unassessed'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'project cost & schedule controls', effect: 'requires' },
  ],
  roles: ['originator', 'reviewer', 'sponsor', 'regulator'],

  fields: {
    assessment_ref: { type: 'string', label: 'Assessment ref' },
    project_name: { type: 'string', required: true, label: 'Project' },
    change_order_ref: { type: 'string', required: true, label: 'Change-order ref' },
    reviewer_party: { type: 'party', role: 'reviewer', label: 'Reviewer' },
    sponsor_party: { type: 'party', role: 'sponsor', label: 'Sponsor' },
    priority: { type: 'string', label: 'Priority (critical raises regulator gate)' },
    contract_currency: { type: 'string', label: 'Contract currency' },
    bac: { type: 'number', min: 0, label: 'Budget at completion (BAC)' },
    ev: { type: 'number', min: 0, label: 'Earned value (EV)' },
    ac: { type: 'number', min: 0, label: 'Actual cost (AC)' },
    recovery_plan_ref: { type: 'string', label: 'Recovery plan ref' },
    // written by derive, never by the client
    tcpi_value: { type: 'number', label: 'TCPI value' },
    tcpi_tier: { type: 'string', label: 'TCPI tier' },
    reviewed_at: { type: 'string', label: 'Reviewed at' },
    accepted_at: { type: 'string', label: 'Accepted at' },
    recovery_accepted_at: { type: 'string', label: 'Recovery accepted at' },
  },

  initial: 'index_raised',

  states: {
    index_raised: { label: 'Index raised', terminal: false, holder: 'reviewer', sla: { hours: 8 } },
    under_review: { label: 'Under review', terminal: false, holder: 'reviewer', sla: { hours: 8 } },
    recovery_required: { label: 'Recovery required', terminal: false, holder: 'originator', sla: { days: 5 } },
    recovery_submitted: { label: 'Recovery submitted', terminal: false, holder: 'sponsor', sla: { days: 2 } },
    index_accepted: { label: 'Index accepted (on track)', terminal: true, holder: 'none' },
    recovery_accepted: { label: 'Recovery accepted', terminal: true, holder: 'none' },
    index_rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    index_withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'index_raised',
      by: ['originator'],
      actorBecomes: 'originator',
      label: 'Raise TCPI assessment',
      intent: 'primary',
      input: {
        project_name: { type: 'string', required: true },
        change_order_ref: { type: 'string', required: true },
        priority: { type: 'string' },
        contract_currency: { type: 'string' },
        bac: { type: 'number', min: 0 },
        ev: { type: 'number', min: 0 },
        ac: { type: 'number', min: 0 },
        reviewer_party: { type: 'party', role: 'reviewer' },
        sponsor_party: { type: 'party', role: 'sponsor' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'begin_review',
      from: 'index_raised',
      to: 'under_review',
      by: ['reviewer'],
      label: 'Begin review',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => {
        const v = toCompletePerformanceIndex(f.bac, f.ev, f.ac);
        return { tcpi_value: v === null ? 0 : v, tcpi_tier: tcpiTier(v), reviewed_at: isoUtc(at) };
      },
    },
    {
      id: 'accept_index',
      from: 'under_review',
      to: 'index_accepted',
      by: ['reviewer'],
      label: 'Accept index (on track)',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ accepted_at: isoUtc(at) }),
    },
    {
      id: 'flag_recovery',
      from: 'under_review',
      to: 'recovery_required',
      by: ['reviewer'],
      label: 'Flag recovery required',
      intent: 'secondary',
      requiresReason: ['index_over_cap', 'schedule_slip', 'scope_growth', 'cost_overrun'],
      guards: [],
    },
    {
      id: 'submit_recovery',
      from: 'recovery_required',
      to: 'recovery_submitted',
      by: ['originator'],
      label: 'Submit recovery plan',
      intent: 'primary',
      input: { recovery_plan_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural gate: the ONLY edge into recovery_accepted, and it can only fire
      // from recovery_submitted — which only submit_recovery reaches. A recovery
      // therefore cannot be signed off before a plan is submitted. Critical-priority
      // projects also need a regulator on the txn.
      id: 'accept_recovery',
      from: 'recovery_submitted',
      to: 'recovery_accepted',
      by: ['sponsor'],
      label: 'Accept recovery plan',
      intent: 'primary',
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ recovery_accepted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_index',
      from: ['index_raised', 'under_review', 'recovery_required', 'recovery_submitted'],
      to: 'index_rejected',
      by: ['reviewer', 'sponsor', 'system'],
      label: 'Reject assessment',
      intent: 'destructive',
      requiresReason: ['baseline_invalid', 'data_incomplete', 'recovery_infeasible', 'superseded', 'recovery_plan_overdue'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['index_raised', 'under_review'],
      to: 'index_withdrawn',
      by: ['originator'],
      label: 'Withdraw assessment',
      intent: 'destructive',
      requiresReason: ['raised_in_error', 'change_order_cancelled', 'rebaselined'],
      guards: [],
    },
  ],

  // recovery-required time-bar: a flagged assessment left without a submitted
  // recovery plan stales out and is rejected. record-only stub; the sweep computes
  // the real bar off the state's sla (ppa_contract pattern).
  timers: [{ onState: 'recovery_required', after: { days: 10 }, fire: 'reject_index', kind: 'time_bar', reason: 'recovery_plan_overdue' }],
};
