// project_change_order — an EPC/IPP project change order lifecycle as data.
//
// An originator (IPP / project owner) raises a change against a project
// baseline, its cost & schedule impact is assessed, then an approver commits
// the revised baseline. The safety spine is structural: approve_change ONLY
// leaves pending_approval, whose ONLY inbound edge is submit_for_approval, whose
// ONLY inbound is assess_impact. So a change order can NEVER be approved before
// its cost/schedule impact has been assessed — no guard needed, the state graph
// enforces it. approve_change also requires a named credit/funding-approval ref
// (creditApprovalPresent): committing extra cost without a funding sign-off is
// refused.
//
// The cumulative-pct cap band (co-cap in the functional floor) is a PURE derived
// field, not a cron and not one of the 10 registry guards — it is surfaced as a
// record-only band on every assessment so an over-cap change is visible, while
// the two-person approval remains the structural control.
//
// settles:false — a change order revises a project baseline, it is not itself a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const num = (v: Json | undefined): number => (typeof v === 'number' ? v : 0);

// cumulative overrun of all approved+this change against the original baseline.
const cumulativeOverrunPct = (f: Record<string, Json>): number => {
  const baseline = num(f.baseline_cost_zar);
  if (baseline <= 0) return 0;
  const overrun = num(f.cumulative_prior_cost_zar) + num(f.cost_impact_zar);
  return Math.round((overrun / baseline) * 10000) / 100; // 2dp
};

// pure banding off the cap threshold (cap_pct, e.g. 10). No clock, no env.
const capBand = (pct: number, cap: Json | undefined): string => {
  const c = typeof cap === 'number' && cap > 0 ? cap : 10;
  if (pct <= c) return 'within_cap';
  if (pct <= c * 1.5) return 'warning';
  return 'over_cap';
};

export const projectChangeOrder: ChainDecl = {
  key: 'project_change_order',
  noun: 'Project change order',
  refPrefix: 'PCO',
  title: (f) => `Change order — ${(f.change_title as string) ?? 'untitled'} · ${(f.project_name as string) ?? 'unnamed project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Implementation Agreement — change control', effect: 'requires' },
    { instrument: 'FIDIC Silver Book', provision: 'cl.13 Variations & Adjustments', effect: 'authorises' },
  ],
  roles: ['originator', 'approver', 'regulator', 'operator'],

  fields: {
    change_order_number: { type: 'string', label: 'Change order number' },
    originator_party: { type: 'party', role: 'originator', label: 'Originator' },
    approver_party: { type: 'party', role: 'approver', label: 'Approver' },
    project_ref: { type: 'string', required: true, label: 'Project ref' },
    project_name: { type: 'string', required: true, label: 'Project' },
    change_title: { type: 'string', required: true, label: 'Change title' },
    change_description: { type: 'string', required: true, label: 'Change description' },
    change_category: { type: 'string', label: 'Category (scope/design/site-condition/regulatory)' },
    baseline_cost_zar: { type: 'number', min: 0, label: 'Baseline cost (ZAR)' },
    cumulative_prior_cost_zar: { type: 'number', min: 0, label: 'Prior approved change cost (ZAR)' },
    cap_pct: { type: 'number', min: 0, label: 'Cumulative cap (%)' },
    cost_impact_zar: { type: 'number', label: 'Cost impact (ZAR)' },
    schedule_impact_days: { type: 'number', label: 'Schedule impact (days)' },
    credit_approval_ref: { type: 'string', label: 'Credit / funding approval ref' },
    // written by derive, never by the client
    revised_baseline_cost_zar: { type: 'number', label: 'Revised baseline cost (ZAR)' },
    cumulative_overrun_pct: { type: 'number', label: 'Cumulative overrun (%)' },
    cap_band: { type: 'string', label: 'Cap band' },
    assessed_at: { type: 'string', label: 'Impact assessed at' },
    approved_at: { type: 'string', label: 'Approved at' },
    closed_at_pco: { type: 'string', label: 'Change order closed at' },
  },

  initial: 'raised',

  states: {
    raised: { label: 'Raised', terminal: false, holder: 'originator', sla: { hours: 24 } },
    assessed: { label: 'Impact assessed', terminal: false, holder: 'originator', sla: { hours: 24 } },
    pending_approval: { label: 'Pending approval', terminal: false, holder: 'approver', sla: { days: 5 } },
    approved: { label: 'Approved', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'raised',
      by: ['originator', 'operator'],
      actorBecomes: 'originator',
      label: 'Raise change order',
      intent: 'primary',
      input: {
        project_ref: { type: 'string', required: true },
        project_name: { type: 'string', required: true },
        change_title: { type: 'string', required: true },
        change_description: { type: 'string', required: true },
        change_category: { type: 'string' },
        baseline_cost_zar: { type: 'number', min: 0 },
        cumulative_prior_cost_zar: { type: 'number', min: 0 },
        cap_pct: { type: 'number', min: 0 },
        approver_party: { type: 'party', role: 'approver' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      // pricing gate: assess the cost & schedule impact and surface the cap band.
      id: 'assess_impact',
      from: 'raised',
      to: 'assessed',
      by: ['originator', 'operator'],
      label: 'Assess cost & schedule impact',
      intent: 'primary',
      input: {
        cost_impact_zar: { type: 'number', required: true },
        schedule_impact_days: { type: 'number' },
      },
      guards: [],
      derive: (f, at: Instant) => {
        const pct = cumulativeOverrunPct(f);
        return {
          revised_baseline_cost_zar: num(f.baseline_cost_zar) + num(f.cumulative_prior_cost_zar) + num(f.cost_impact_zar),
          cumulative_overrun_pct: pct,
          cap_band: capBand(pct, f.cap_pct),
          assessed_at: isoUtc(at),
        };
      },
    },
    {
      id: 'submit_for_approval',
      from: 'assessed',
      to: 'pending_approval',
      by: ['originator', 'operator'],
      label: 'Submit for approval',
      intent: 'primary',
      guards: [],
    },
    {
      // send back for re-assessment (e.g. scope or cost basis disputed).
      id: 'request_revision',
      from: 'pending_approval',
      to: 'raised',
      by: ['approver'],
      label: 'Request revision',
      intent: 'secondary',
      requiresReason: ['cost_basis_disputed', 'scope_unclear', 'insufficient_justification', 'schedule_understated'],
      guards: [],
    },
    {
      // structural gate: the ONLY edge into approved, reachable ONLY from
      // pending_approval — so a change cannot be approved un-assessed. Committing
      // extra cost also needs a named funding approval (creditApprovalPresent).
      id: 'approve_change',
      from: 'pending_approval',
      to: 'approved',
      by: ['approver'],
      label: 'Approve change order',
      intent: 'primary',
      input: { credit_approval_ref: { type: 'string' } },
      guards: ['creditApprovalPresent'],
      derive: (_f, at: Instant) => ({ approved_at: isoUtc(at), closed_at_pco: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'reject_change',
      from: 'pending_approval',
      to: 'rejected',
      by: ['approver', 'regulator'],
      label: 'Reject change order',
      intent: 'destructive',
      requiresReason: ['not_justified', 'over_cap_not_funded', 'commercially_unacceptable', 'baseline_error'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['raised', 'assessed'],
      to: 'withdrawn',
      by: ['originator'],
      label: 'Withdraw change order',
      intent: 'destructive',
      requiresReason: ['raised_in_error', 'superseded', 'no_longer_required'],
      guards: [],
    },
  ],
};
