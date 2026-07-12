// project_risk — PMBOK 7 / ISO 31000 project-risk lifecycle as data.
//
// A risk owner raises a risk against a project, then drives it through the
// standard risk process: qualitative assessment → quantitative SRA →
// response plan → response execution → monitoring → close. The methodology
// spine is structural, not guarded: quantify_risk leaves ONLY `assessed`, and
// the only path into `assessed` is assess_risk. So a risk can NEVER be
// quantified (EMV / SRA envelope computed) before it has been qualitatively
// assessed — the P×I bands the quantification narrows around must exist first.
// No guard enforces this; the state graph does.
//
// Escalation and acceptance are authority crossings: accept_risk is a `sponsor`
// edge (residual risk can only be accepted by someone with the mandate), and
// both are supplied as role-tagged parties at open(). settles:false — a risk
// register entry is a governance control, never a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure 1-5 banding off a 0-100 probability. No clock, no env.
const probBand = (pct: Json | undefined): number => {
  if (typeof pct !== 'number') return 0;
  if (pct >= 80) return 5;
  if (pct >= 60) return 4;
  if (pct >= 40) return 3;
  if (pct >= 20) return 2;
  return 1;
};

// pure 1-5 banding off a ZAR cost impact.
const impactBand = (zar: Json | undefined): number => {
  if (typeof zar !== 'number') return 0;
  if (zar >= 50_000_000) return 5;
  if (zar >= 10_000_000) return 4;
  if (zar >= 1_000_000) return 3;
  if (zar >= 100_000) return 2;
  return 1;
};

// expected monetary value = probability × most-likely cost. Pure.
const emv = (pct: Json | undefined, cost: Json | undefined): number => {
  if (typeof pct !== 'number' || typeof cost !== 'number') return 0;
  return (pct / 100) * cost;
};

export const projectRisk: ChainDecl = {
  key: 'project_risk',
  noun: 'Project risk',
  refPrefix: 'PR',
  title: (f) =>
    `${(f.risk_tier as string) ?? 'untiered'} risk — ${(f.risk_title as string) ?? (f.project_name as string) ?? 'unnamed project'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ISO 31000:2018', provision: 'risk management process', effect: 'requires' },
    { instrument: 'PMBOK 7', provision: 'uncertainty performance domain (qualitative + SRA)', effect: 'requires' },
    { instrument: 'REIPPPP', provision: 'IPP project risk register & contingency governance', effect: 'requires' },
  ],
  roles: ['risk_owner', 'sponsor', 'regulator', 'operator'],

  fields: {
    risk_number: { type: 'string', label: 'Risk number' },
    risk_owner_party: { type: 'party', role: 'risk_owner', label: 'Risk owner' },
    sponsor_party: { type: 'party', role: 'sponsor', label: 'Project sponsor' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    project_id: { type: 'string', required: true, label: 'Project id' },
    project_name: { type: 'string', label: 'Project name' },
    facility_name: { type: 'string', label: 'Facility' },
    risk_class: { type: 'string', required: true, label: 'Risk class (cost_overrun/schedule_slip/…)' },
    risk_title: { type: 'string', required: true, label: 'Risk title' },
    risk_description: { type: 'string', label: 'Risk description' },
    risk_tier: { type: 'string', required: true, label: 'Tier (low/moderate/high/critical)' },
    // qualitative assessment inputs + derived bands
    probability_pct: { type: 'number', min: 0, max: 100, label: 'Probability (%)' },
    worst_case_cost_impact_zar: { type: 'number', min: 0, label: 'Worst-case cost impact (ZAR)' },
    worst_case_schedule_impact_days: { type: 'number', min: 0, label: 'Worst-case schedule impact (days)' },
    probability_band: { type: 'number', label: 'Probability band (1-5)' },
    impact_band: { type: 'number', label: 'Impact band (1-5)' },
    risk_score: { type: 'number', label: 'Risk score (P×I)' },
    // quantitative SRA inputs (triangular) + derived EMV
    cost_optimistic_zar: { type: 'number', min: 0, label: 'Cost optimistic (ZAR)' },
    cost_most_likely_zar: { type: 'number', min: 0, label: 'Cost most-likely (ZAR)' },
    cost_pessimistic_zar: { type: 'number', min: 0, label: 'Cost pessimistic (ZAR)' },
    schedule_most_likely_days: { type: 'number', min: 0, label: 'Schedule most-likely (days)' },
    emv_zar: { type: 'number', label: 'Expected monetary value (ZAR)' },
    residual_emv_zar: { type: 'number', label: 'Residual EMV after response (ZAR)' },
    // response
    response_strategy: { type: 'string', label: 'Strategy (avoid/transfer/mitigate/accept/…)' },
    response_action: { type: 'string', label: 'Response action' },
    response_owner: { type: 'string', label: 'Response owner' },
    response_effectiveness_pct: { type: 'number', min: 0, max: 100, label: 'Response effectiveness (%)' },
    // written by derive, never by the client
    assessed_at: { type: 'string', label: 'Assessed at' },
    quantified_at: { type: 'string', label: 'Quantified at' },
    response_planned_at: { type: 'string', label: 'Response planned at' },
    response_active_at: { type: 'string', label: 'Response active at' },
    monitoring_at: { type: 'string', label: 'Monitoring at' },
    realized_at: { type: 'string', label: 'Realized at' },
    closed_at_risk: { type: 'string', label: 'Risk closed at' },
  },

  initial: 'identified',

  states: {
    identified: { label: 'Identified', terminal: false, holder: 'risk_owner', sla: { hours: 48 } },
    assessed: { label: 'Assessed (qualitative)', terminal: false, holder: 'risk_owner', sla: { hours: 72 } },
    quantified: { label: 'Quantified (SRA)', terminal: false, holder: 'risk_owner', sla: { hours: 72 } },
    response_planned: { label: 'Response planned', terminal: false, holder: 'risk_owner', sla: { days: 5 } },
    response_active: { label: 'Response active', terminal: false, holder: 'risk_owner' },
    monitoring: { label: 'Monitoring', terminal: false, holder: 'risk_owner' },
    realized: { label: 'Realized', terminal: false, holder: 'risk_owner', sla: { hours: 24 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    accepted: { label: 'Accepted', terminal: true, holder: 'none' },
    escalated: { label: 'Escalated', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'identified',
      by: ['risk_owner', 'operator'],
      actorBecomes: 'risk_owner',
      label: 'Raise risk',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        project_name: { type: 'string' },
        facility_name: { type: 'string' },
        risk_class: { type: 'string', required: true },
        risk_title: { type: 'string', required: true },
        risk_description: { type: 'string' },
        risk_tier: { type: 'string', required: true },
        sponsor_party: { type: 'party', role: 'sponsor' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'assess_risk',
      from: 'identified',
      to: 'assessed',
      by: ['risk_owner'],
      label: 'Assess (qualitative P×I)',
      intent: 'primary',
      input: {
        probability_pct: { type: 'number', required: true, min: 0, max: 100 },
        worst_case_cost_impact_zar: { type: 'number', required: true, min: 0 },
        worst_case_schedule_impact_days: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => {
        const pb = probBand(f.probability_pct);
        const ib = impactBand(f.worst_case_cost_impact_zar);
        return { probability_band: pb, impact_band: ib, risk_score: pb * ib, assessed_at: isoUtc(at) };
      },
    },
    {
      // structural methodology gate: the ONLY edge into `quantified`, and it can
      // only fire from `assessed` — which only assess_risk reaches. A risk can
      // therefore never be quantified before it is qualitatively assessed.
      id: 'quantify_risk',
      from: 'assessed',
      to: 'quantified',
      by: ['risk_owner'],
      label: 'Quantify (SRA / EMV)',
      intent: 'primary',
      input: {
        cost_optimistic_zar: { type: 'number', min: 0 },
        cost_most_likely_zar: { type: 'number', required: true, min: 0 },
        cost_pessimistic_zar: { type: 'number', min: 0 },
        schedule_most_likely_days: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => ({ emv_zar: emv(f.probability_pct, f.cost_most_likely_zar), quantified_at: isoUtc(at) }),
    },
    {
      id: 'plan_response',
      from: 'quantified',
      to: 'response_planned',
      by: ['risk_owner'],
      label: 'Plan response',
      intent: 'primary',
      input: {
        response_strategy: { type: 'string', required: true },
        response_action: { type: 'string', required: true },
        response_owner: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ response_planned_at: isoUtc(at) }),
    },
    {
      id: 'activate_response',
      from: 'response_planned',
      to: 'response_active',
      by: ['risk_owner'],
      label: 'Activate response',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ response_active_at: isoUtc(at) }),
    },
    {
      id: 'begin_monitoring',
      from: 'response_active',
      to: 'monitoring',
      by: ['risk_owner'],
      label: 'Begin monitoring',
      intent: 'primary',
      input: { response_effectiveness_pct: { type: 'number', min: 0, max: 100 } },
      guards: [],
      derive: (f, at: Instant) => {
        const base = typeof f.emv_zar === 'number' ? f.emv_zar : 0;
        const eff = typeof f.response_effectiveness_pct === 'number' ? f.response_effectiveness_pct : 0;
        return { residual_emv_zar: base * (1 - eff / 100), monitoring_at: isoUtc(at) };
      },
    },
    {
      id: 'close_risk',
      from: ['monitoring', 'realized'],
      to: 'closed',
      by: ['risk_owner', 'sponsor'],
      label: 'Close risk',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_risk: isoUtc(at) }),
    },

    // --- realization + exits --------------------------------------------------
    {
      id: 'realize_risk',
      from: ['response_active', 'monitoring'],
      to: 'realized',
      by: ['risk_owner'],
      label: 'Mark realized',
      intent: 'secondary',
      requiresReason: ['trigger_event_occurred', 'response_ineffective', 'impact_materialized'],
      guards: [],
      derive: (_f, at: Instant) => ({ realized_at: isoUtc(at) }),
    },
    {
      id: 'accept_risk',
      from: ['assessed', 'quantified', 'response_planned', 'monitoring'],
      to: 'accepted',
      by: ['sponsor'],
      label: 'Accept residual risk',
      intent: 'destructive',
      requiresReason: ['within_tolerance', 'no_cost_effective_response', 'sponsor_mandate'],
      guards: [],
    },
    {
      id: 'escalate_risk',
      from: ['identified', 'assessed', 'quantified', 'response_planned', 'response_active', 'monitoring'],
      to: 'escalated',
      by: ['risk_owner', 'sponsor'],
      label: 'Escalate',
      intent: 'destructive',
      requiresReason: ['exceeds_owner_authority', 'contingency_breach', 'board_notification_required', 'sla_breach'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['identified', 'assessed'],
      to: 'withdrawn',
      by: ['risk_owner'],
      label: 'Withdraw risk',
      intent: 'destructive',
      requiresReason: ['duplicate', 'not_a_risk', 'superseded'],
      guards: [],
    },
  ],

  // identified-state triage bar: an unassessed risk left past its SLA auto-
  // escalates to the sponsor/board. Record-only stub; the sweep computes the
  // real bar off the state sla hours (permit_to_work / ppa_contract pattern).
  timers: [{ onState: 'identified', after: { hours: 0 }, fire: 'escalate_risk', kind: 'sla' }],
};
