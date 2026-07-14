// ed_commitment — REIPPPP Economic Development obligation lifecycle as data.
//
// An IPP developer locks a contractual ED baseline at financial close (black
// ownership %, local content %, FTE jobs, enterprise-dev spend, …). Each
// reporting cycle it reports the current value; the procurement authority (IPPO
// /DMRE/DTI) monitors variance. A material shortfall is flagged, a cure plan is
// required, submitted, approved, and executed — then the authority verifies
// compliance OR issues a penalty.
//
// The enforcement spine is STRUCTURAL, not a guard: issue_penalty leaves ONLY
// cure_executing or escalated. Neither is reachable without first passing
// through variance_flagged → cure_plan_required → cure_plan_submitted →
// approve_cure_plan (or an escalation off one of those). So a project sitting in
// `monitoring` — never flagged, never given a cure opportunity — can NEVER be
// penalised. The state graph is the due-process guarantee; no guard needed.
//
// settles:false — an ED obligation is a regulatory compliance control, never a
// payment. A levied penalty is recorded here but custody/collection is out of
// scope (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure variance %, deterministic, 2dp. null when unreportable (missing / zero base).
const variancePct = (baseline: Json | undefined, current: Json | undefined): number | null => {
  if (typeof baseline !== 'number' || typeof current !== 'number' || baseline === 0) return null;
  return Math.round(((current - baseline) / baseline) * 10000) / 100;
};

// pure tier bucketing off the variance and the (optional) threshold. No clock.
const varianceTier = (pct: number | null, threshold: Json | undefined): string => {
  if (pct === null) return 'unreported';
  const t = typeof threshold === 'number' ? threshold : -5;
  if (pct >= 0) return 'on_track';
  if (pct >= t) return 'watch';
  return 'breach';
};

export const edCommitment: ChainDecl = {
  key: 'ed_commitment',
  noun: 'ED commitment',
  refPrefix: 'EDCO',
  title: (f) =>
    `${(f.commitment_label as string) ?? (f.commitment_type as string) ?? 'ED'} — ${(f.project_name as string) ?? 'unnamed project'} (${(f.bid_window as string) ?? '—'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'Economic Development Obligations (Implementation Agreement Sch. 1)', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's34 determination — procurement conditions', effect: 'requires' },
  ],
  roles: ['reporter', 'authority', 'regulator', 'operator'],

  fields: {
    case_number: { type: 'string', label: 'Case number' },
    reporter_party: { type: 'party', role: 'reporter', label: 'IPP developer' },
    authority_party: { type: 'party', role: 'authority', label: 'Procurement authority' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    project_id: { type: 'string', required: true, label: 'Project id' },
    project_name: { type: 'string', required: true, label: 'Project name' },
    bid_window: { type: 'string', required: true, label: 'Bid window (BW5/BW6/RMIPPPP)' },
    commitment_type: { type: 'string', required: true, label: 'Type (ownership/local_content/jobs/skills/enterprise_dev/socio_economic/community_trust)' },
    commitment_label: { type: 'string', label: 'Commitment label' },
    baseline_value: { type: 'number', required: true, label: 'Baseline (contractual)' },
    baseline_unit: { type: 'string', required: true, label: 'Unit (percent/fte/zar/count)' },
    variance_threshold_pct: { type: 'number', label: 'Variance threshold %' },
    reporting_period: { type: 'string', label: 'Reporting period (YYYY-Qn)' },
    current_value: { type: 'number', label: 'Latest reported value' },
    cure_plan_summary: { type: 'string', label: 'Cure plan summary' },
    remediation_summary: { type: 'string', label: 'Remediation summary' },
    penalty_amount_zar: { type: 'number', min: 0, label: 'Penalty (ZAR)' },
    penalty_ref: { type: 'string', label: 'Penalty reference' },
    regulator_authority: { type: 'string', label: 'Regulator authority (IPPO/DMRE/DTI)' },
    regulator_ref: { type: 'string', label: 'Regulator reference' },
    // written by derive, never by the client
    variance_pct: { type: 'number', label: 'Variance %' },
    variance_tier: { type: 'string', label: 'Variance tier' },
    escalation_level: { type: 'number', label: 'Escalation level' },
    baseline_locked_at: { type: 'string', label: 'Baseline locked at' },
    variance_flagged_at: { type: 'string', label: 'Variance flagged at' },
    cure_required_at: { type: 'string', label: 'Cure plan required at' },
    cure_submitted_at: { type: 'string', label: 'Cure plan submitted at' },
    cure_approved_at: { type: 'string', label: 'Cure plan approved at' },
    verified_compliant_at: { type: 'string', label: 'Verified compliant at' },
    penalty_issued_at: { type: 'string', label: 'Penalty issued at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
    closed_at_ed: { type: 'string', label: 'Closed at' },
  },

  initial: 'baseline_locked',

  states: {
    baseline_locked: { label: 'Baseline locked', terminal: false, holder: 'authority', sla: { days: 5 } },
    monitoring: { label: 'Monitoring', terminal: false, holder: 'reporter', sla: { days: 90 } },
    variance_flagged: { label: 'Variance flagged', terminal: false, holder: 'authority', sla: { days: 10 } },
    cure_plan_required: { label: 'Cure plan required', terminal: false, holder: 'reporter', sla: { days: 30 } },
    cure_plan_submitted: { label: 'Cure plan submitted', terminal: false, holder: 'authority', sla: { days: 15 } },
    cure_executing: { label: 'Cure executing', terminal: false, holder: 'reporter', sla: { days: 90 } },
    escalated: { label: 'Escalated', terminal: false, holder: 'regulator', sla: { days: 20 } },
    verified_compliant: { label: 'Verified compliant', terminal: true, holder: 'none' },
    penalty_issued: { label: 'Penalty issued', terminal: true, holder: 'none' },
    commitment_closed: { label: 'Commitment closed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'baseline_locked',
      by: ['reporter', 'operator'],
      actorBecomes: 'reporter',
      label: 'Lock ED baseline',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        project_name: { type: 'string', required: true },
        bid_window: { type: 'string', required: true },
        commitment_type: { type: 'string', required: true },
        commitment_label: { type: 'string' },
        baseline_value: { type: 'number', required: true },
        baseline_unit: { type: 'string', required: true },
        variance_threshold_pct: { type: 'number' },
        reporting_period: { type: 'string' },
        regulator_authority: { type: 'string' },
        authority_party: { type: 'party', role: 'authority' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ baseline_locked_at: isoUtc(at), escalation_level: 0 }),
    },
    {
      id: 'begin_monitoring',
      from: 'baseline_locked',
      to: 'monitoring',
      by: ['authority', 'reporter'],
      label: 'Begin monitoring',
      intent: 'primary',
      guards: [],
    },
    {
      // self-loop: each reporting cycle restates the current value and recomputes
      // variance. Stays in monitoring — only the authority's flag_variance moves it on.
      id: 'report_progress',
      from: 'monitoring',
      to: 'monitoring',
      by: ['reporter'],
      label: 'Report progress',
      intent: 'primary',
      input: { current_value: { type: 'number', required: true }, reporting_period: { type: 'string' } },
      guards: [],
      derive: (f, _at: Instant) => {
        const pct = variancePct(f.baseline_value, f.current_value);
        return { variance_pct: pct, variance_tier: varianceTier(pct, f.variance_threshold_pct) };
      },
    },
    {
      id: 'flag_variance',
      from: 'monitoring',
      to: 'variance_flagged',
      by: ['authority'],
      label: 'Flag variance',
      intent: 'secondary',
      requiresReason: ['below_threshold', 'sustained_shortfall', 'reporting_gap', 'regulator_directive'],
      guards: [],
      derive: (_f, at: Instant) => ({ variance_flagged_at: isoUtc(at) }),
    },
    {
      id: 'require_cure_plan',
      from: 'variance_flagged',
      to: 'cure_plan_required',
      by: ['authority'],
      label: 'Require cure plan',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ cure_required_at: isoUtc(at) }),
    },
    {
      id: 'submit_cure_plan',
      from: 'cure_plan_required',
      to: 'cure_plan_submitted',
      by: ['reporter'],
      label: 'Submit cure plan',
      intent: 'primary',
      input: { cure_plan_summary: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ cure_submitted_at: isoUtc(at) }),
    },
    {
      id: 'approve_cure_plan',
      from: 'cure_plan_submitted',
      to: 'cure_executing',
      by: ['authority'],
      label: 'Approve cure plan',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ cure_approved_at: isoUtc(at) }),
    },
    {
      // structural spine: the ONLY paths to a resolved compliant state OR a
      // penalty run through cure_executing (or an escalation of it). A project
      // in `monitoring` can be verified/penalised by NO edge.
      id: 'verify_compliant',
      from: ['cure_executing', 'escalated'],
      to: 'verified_compliant',
      by: ['authority', 'regulator'],
      label: 'Verify compliant',
      intent: 'primary',
      input: { remediation_summary: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ verified_compliant_at: isoUtc(at) }),
    },
    {
      id: 'escalate',
      from: ['variance_flagged', 'cure_plan_required', 'cure_plan_submitted', 'cure_executing'],
      to: 'escalated',
      by: ['authority', 'regulator', 'system'],
      label: 'Escalate',
      intent: 'secondary',
      requiresReason: ['cure_overdue', 'cure_inadequate', 'repeat_breach', 'regulator_referral'],
      guards: [],
      derive: (f, at: Instant) => ({
        escalated_at: isoUtc(at),
        escalation_level: (typeof f.escalation_level === 'number' ? f.escalation_level : 0) + 1,
      }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'issue_penalty',
      from: ['cure_executing', 'escalated'],
      to: 'penalty_issued',
      by: ['authority', 'regulator'],
      label: 'Issue penalty',
      intent: 'destructive',
      input: { penalty_amount_zar: { type: 'number', min: 0, required: true }, penalty_ref: { type: 'string' }, regulator_ref: { type: 'string' } },
      requiresReason: ['cure_failed', 'no_cure_filed', 'material_default', 'regulator_determination'],
      guards: [],
      derive: (_f, at: Instant) => ({ penalty_issued_at: isoUtc(at) }),
    },
    {
      // a flagged variance that turns out to be a reporting error returns to monitoring.
      id: 'dismiss_variance',
      from: 'variance_flagged',
      to: 'monitoring',
      by: ['authority'],
      label: 'Dismiss variance (false alarm)',
      intent: 'secondary',
      requiresReason: ['reporting_error', 'data_correction', 'within_tolerance'],
      guards: [],
    },
    {
      id: 'close_commitment',
      from: 'monitoring',
      to: 'commitment_closed',
      by: ['authority'],
      label: 'Close commitment',
      intent: 'primary',
      input: { remediation_summary: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_ed: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['baseline_locked', 'monitoring'],
      to: 'withdrawn',
      by: ['reporter'],
      label: 'Withdraw commitment',
      intent: 'destructive',
      requiresReason: ['project_not_financed', 'commitment_superseded', 'entered_in_error'],
      guards: [],
    },
  ],

  // cure_plan_required time-bar: an unfiled cure plan stales out and escalates.
  // record-only stub; the sweep computes the real bar off state sla days.
  timers: [{ onState: 'cure_plan_required', after: { days: 30 }, fire: 'escalate', kind: 'time_bar', reason: 'cure_overdue' }],
};
