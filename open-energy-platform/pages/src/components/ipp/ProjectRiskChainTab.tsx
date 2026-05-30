// Wave 92 — IPP Project Risk Register & Quantitative Schedule-Risk Analysis tab.
//
// The PROJECT-RISK-MANAGEMENT core of a best-in-class projects system. W1 gave
// the schedule (CPM/Gantt); W19/W20 procurement + COD; W81 change-control + EVM.
// W92 fills the gap every real capital project relies on next: QUANTIFYING risk
// via probability × impact, EMV, triangular Monte-Carlo cost & schedule risk
// analysis (SRA), and contingency drawdown traceability against the REIPPPP bid
// envelope. Beats Acumen Fuse Risk / Primavera Risk Analysis (PRA) / Safran
// Risk / @Risk / Crystal Ball / Deltek Acumen Risk / Riskonnect / Predict! /
// Synergi Life / Active Risk Manager — all of which treat the risk register as
// a static spreadsheet disconnected from EVM and from the bid envelope — via a
// LIVE-scored P50/P80 EMV battery, residual EMV after planned response,
// contingency drawdown vs project_reserve, and a bid-envelope-breach %.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'identified' | 'assessed' | 'quantified' | 'response_planned' | 'response_active'
  | 'monitoring' | 'realized' | 'closed' | 'accepted' | 'escalated'
  | 'withdrawn' | 'cancelled';

type Tier = 'low' | 'moderate' | 'high' | 'critical';

interface RiskRow {
  id: string;
  risk_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  reipppp_bid_window: string | null;
  facility_id: string | null;
  facility_name: string | null;
  risk_owner_party_id: string | null;
  risk_owner_party_name: string | null;
  raised_by_party_id: string | null;
  raised_by_party_name: string | null;
  risk_class: string;
  risk_category: string | null;
  risk_title: string | null;
  risk_description: string | null;
  risk_tier: Tier;
  authority_required: string | null;
  probability_pct: number;
  probability_band: number | null;
  worst_case_cost_impact_zar: number;
  worst_case_schedule_impact_days: number;
  impact_band: number | null;
  cost_optimistic_zar: number | null;
  cost_most_likely_zar: number | null;
  cost_pessimistic_zar: number | null;
  schedule_optimistic_days: number | null;
  schedule_most_likely_days: number | null;
  schedule_pessimistic_days: number | null;
  emv_zar: number | null;
  residual_emv_zar: number | null;
  integrity_floor_applied_flag: number;
  response_strategy: string | null;
  response_action: string | null;
  response_effectiveness_pct: number | null;
  response_owner: string | null;
  response_due_at: string | null;
  response_complete_flag: number;
  contingency_drawn_zar: number;
  total_contingency_zar: number;
  bid_envelope_zar: number;
  realized_flag: number;
  realized_cost_zar: number | null;
  realized_schedule_days: number | null;
  realized_basis: string | null;
  assess_basis: string | null;
  quantify_basis: string | null;
  response_plan_basis: string | null;
  response_active_basis: string | null;
  close_basis: string | null;
  escalate_basis: string | null;
  reason_code: string | null;
  response_summary: string | null;
  chain_status: ChainStatus;
  identified_at: string;
  assessed_at: string | null;
  quantified_at: string | null;
  response_planned_at: string | null;
  response_active_at: string | null;
  monitoring_at: string | null;
  realized_at: string | null;
  closed_at: string | null;
  accepted_at: string | null;
  escalated_at: string | null;
  withdrawn_at: string | null;
  cancelled_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // decorated
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  urgency_band?: string;
  is_reportable_flag?: boolean;
  high_tier_flag?: boolean;
  floor_at_high_class_flag?: boolean;
  signature_class_flag?: boolean;
  authority_required_live?: string;
  emv_zar_live?: number;
  tier_live?: Tier;
  p50_cost_zar_live?: number | null;
  p80_cost_zar_live?: number | null;
  p50_schedule_days_live?: number | null;
  p80_schedule_days_live?: number | null;
  residual_emv_zar_live?: number;
  bid_envelope_risk_pct_live?: number;
  bid_envelope_breach_flag?: boolean;
  contingency_drawdown_ratio_live?: number;
  contingency_exceeded_flag?: boolean;
}

interface RiskEvent {
  id: string;
  risk_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiSummary {
  total: number;
  open_count: number;
  realized_count: number;
  escalated_count: number;
  accepted_count: number;
  closed_count: number;
  withdrawn_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  signature_count: number;
  floor_applied_count: number;
  envelope_breach_count: number;
  contingency_exceeded_count: number;
  total_emv_zar: number;
  total_residual_emv_zar: number;
  total_worst_case_zar: number;
  total_realized_cost_zar: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  identified:       { bg: '#e3e7ec', fg: '#557',    label: 'Identified' },
  assessed:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Assessed (qualitative)' },
  quantified:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Quantified (SRA)' },
  response_planned: { bg: '#fff4d6', fg: '#a06200', label: 'Response planned' },
  response_active:  { bg: '#fff4d6', fg: '#a06200', label: 'Response active' },
  monitoring:       { bg: '#daf5e2', fg: '#1f6b3a', label: 'Monitoring' },
  realized:         { bg: '#fde0e0', fg: '#9b1f1f', label: 'Realized' },
  closed:           { bg: '#d4edda', fg: '#155724', label: 'Closed' },
  accepted:         { bg: '#e3e7ec', fg: '#557',    label: 'Accepted as-is' },
  escalated:        { bg: '#ffe4b5', fg: '#8a4a00', label: 'Escalated' },
  withdrawn:        { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
  cancelled:        { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical (≥R50m EMV)' },
  high:     { bg: '#ffe4b5', fg: '#8a4a00', label: 'High (R5–50m EMV)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (R500k–5m EMV)' },
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low (<R500k EMV)' },
};

const AUTHORITY_LABEL: Record<string, string> = {
  project_manager: 'Project manager',
  risk_owner:      'Risk owner',
  sponsor:         'Sponsor',
  board:           'Board capital committee',
  dmre_notify:     'Board + DMRE notification',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',             label: 'Open' },
  { key: 'all',              label: 'All' },
  { key: 'critical',         label: 'Critical' },
  { key: 'high',             label: 'High' },
  { key: 'moderate',         label: 'Moderate' },
  { key: 'low',              label: 'Low' },
  { key: 'quantified',       label: 'Quantified' },
  { key: 'response_active',  label: 'Response active' },
  { key: 'monitoring',       label: 'Monitoring' },
  { key: 'realized',         label: 'Realized' },
  { key: 'escalated',        label: 'Escalated' },
  { key: 'envelope_breach',  label: 'Bid-envelope breach' },
  { key: 'contingency_over', label: 'Contingency exceeded' },
  { key: 'signature',        label: 'Force majeure / regulatory' },
  { key: 'breached',         label: 'SLA breached' },
  { key: 'reportable',       label: 'Reportable' },
];

type ActionKind =
  | 'assess' | 'quantify' | 'plan-response' | 'execute-response' | 'begin-monitoring'
  | 'realize-risk' | 'close-risk' | 'accept-risk' | 'escalate' | 'reanalyze'
  | 'withdraw' | 'cancel';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  identified:       'assess',
  assessed:         'quantify',
  quantified:       'plan-response',
  response_planned: 'execute-response',
  response_active:  'begin-monitoring',
  monitoring:       'close-risk',
  escalated:        'reanalyze',
  realized:         'close-risk',
  closed:           null,
  accepted:         null,
  withdrawn:        null,
  cancelled:        null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'assess':            'Assess (risk owner)',
  'quantify':          'Quantify / SRA (project controls)',
  'plan-response':     'Plan response (risk owner)',
  'execute-response':  'Execute response (project manager)',
  'begin-monitoring':  'Begin monitoring (project controls)',
  'realize-risk':      'Realize risk (project manager)',
  'close-risk':        'Close (sponsor)',
  'accept-risk':       'Accept as-is (sponsor)',
  'escalate':          'Escalate (project manager)',
  'reanalyze':         'Re-analyze (project controls)',
  'withdraw':          'Withdraw (raiser)',
  'cancel':            'Cancel',
};

const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  identified:       ['accept-risk', 'withdraw', 'cancel'],
  assessed:         ['accept-risk', 'withdraw', 'cancel'],
  quantified:       ['accept-risk', 'escalate', 'withdraw', 'cancel'],
  response_planned: ['escalate', 'realize-risk', 'cancel'],
  response_active:  ['escalate', 'realize-risk', 'cancel'],
  monitoring:       ['escalate', 'realize-risk', 'cancel'],
  realized:         ['escalate', 'cancel'],
  escalated:        ['accept-risk', 'cancel'],
  closed:           [],
  accepted:         [],
  withdrawn:        [],
  cancelled:        [],
};

const DESTRUCTIVE: ActionKind[] = ['realize-risk', 'escalate', 'withdraw', 'cancel', 'accept-risk'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}R${(a / 1_000_000).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}m`;
  if (a >= 1000) return `${sign}R${(a / 1000).toLocaleString('en-ZA', { maximumFractionDigits: 1 })}k`;
  return `${sign}R${a.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TERMINAL_STATES: ChainStatus[] = ['closed', 'accepted', 'withdrawn', 'cancelled'];

export function ProjectRiskChainTab() {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<RiskRow | null>(null);
  const [events, setEvents] = useState<RiskEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RiskRow[] } & KpiSummary }>('/ipp/project-risk/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, realized_count: d.realized_count,
          escalated_count: d.escalated_count, accepted_count: d.accepted_count,
          closed_count: d.closed_count, withdrawn_count: d.withdrawn_count,
          cancelled_count: d.cancelled_count, breached: d.breached,
          reportable_total: d.reportable_total, signature_count: d.signature_count,
          floor_applied_count: d.floor_applied_count,
          envelope_breach_count: d.envelope_breach_count,
          contingency_exceeded_count: d.contingency_exceeded_count,
          total_emv_zar: d.total_emv_zar, total_residual_emv_zar: d.total_residual_emv_zar,
          total_worst_case_zar: d.total_worst_case_zar, total_realized_cost_zar: d.total_realized_cost_zar,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load project risks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: RiskRow; events: RiskEvent[] } }>(`/ipp/project-risk/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load risk history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'open')             return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')         return r.sla_breached;
      if (filter === 'reportable')       return r.is_reportable_flag;
      if (filter === 'envelope_breach')  return r.bid_envelope_breach_flag;
      if (filter === 'contingency_over') return r.contingency_exceeded_flag;
      if (filter === 'signature')        return r.signature_class_flag;
      if (['low', 'moderate', 'high', 'critical'].includes(filter)) {
        return r.risk_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: RiskRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'assess') {
        const prob = window.prompt('Probability % (0–100):', String(row.probability_pct ?? '')) || '';
        const worst = window.prompt('Worst-case cost impact (ZAR) — tier is derived from probability × worst:', String(row.worst_case_cost_impact_zar ?? '')) || '';
        const days = window.prompt('Worst-case schedule impact (days):', String(row.worst_case_schedule_impact_days ?? '')) || '';
        const basis = window.prompt('Assessment basis — qualitative scoring rationale:') || '';
        const ref = window.prompt('Assessment reference:') || '';
        body = { assess_basis: basis };
        if (ref) body.assess_ref = ref;
        if (prob && !Number.isNaN(Number(prob))) body.probability_pct = Number(prob);
        if (worst && !Number.isNaN(Number(worst))) body.worst_case_cost_impact_zar = Number(worst);
        if (days && !Number.isNaN(Number(days))) body.worst_case_schedule_impact_days = Number(days);
      } else if (action === 'quantify') {
        const optC = window.prompt('Cost optimistic (ZAR):', row.cost_optimistic_zar != null ? String(row.cost_optimistic_zar) : '') || '';
        const mlC = window.prompt('Cost most-likely (ZAR):', row.cost_most_likely_zar != null ? String(row.cost_most_likely_zar) : '') || '';
        const pesC = window.prompt('Cost pessimistic (ZAR):', row.cost_pessimistic_zar != null ? String(row.cost_pessimistic_zar) : '') || '';
        const optS = window.prompt('Schedule optimistic (days):', row.schedule_optimistic_days != null ? String(row.schedule_optimistic_days) : '') || '';
        const mlS = window.prompt('Schedule most-likely (days):', row.schedule_most_likely_days != null ? String(row.schedule_most_likely_days) : '') || '';
        const pesS = window.prompt('Schedule pessimistic (days):', row.schedule_pessimistic_days != null ? String(row.schedule_pessimistic_days) : '') || '';
        const basis = window.prompt('Quantify basis — triangular distribution + Monte-Carlo rationale:') || '';
        body = { quantify_basis: basis };
        if (optC && !Number.isNaN(Number(optC))) body.cost_optimistic_zar = Number(optC);
        if (mlC && !Number.isNaN(Number(mlC))) body.cost_most_likely_zar = Number(mlC);
        if (pesC && !Number.isNaN(Number(pesC))) body.cost_pessimistic_zar = Number(pesC);
        if (optS && !Number.isNaN(Number(optS))) body.schedule_optimistic_days = Number(optS);
        if (mlS && !Number.isNaN(Number(mlS))) body.schedule_most_likely_days = Number(mlS);
        if (pesS && !Number.isNaN(Number(pesS))) body.schedule_pessimistic_days = Number(pesS);
      } else if (action === 'plan-response') {
        const strat = window.prompt('Response strategy (avoid / transfer / mitigate / accept / exploit / share / enhance):', row.response_strategy ?? '') || '';
        const act = window.prompt('Response action — concrete mitigation:') || '';
        const eff = window.prompt('Response effectiveness % (0–100):', row.response_effectiveness_pct != null ? String(row.response_effectiveness_pct) : '') || '';
        const owner = window.prompt('Response owner:') || '';
        const contingency = window.prompt('Total project contingency (ZAR):', row.total_contingency_zar != null ? String(row.total_contingency_zar) : '') || '';
        const envelope = window.prompt('REIPPPP bid envelope (ZAR):', row.bid_envelope_zar != null ? String(row.bid_envelope_zar) : '') || '';
        const basis = window.prompt('Plan basis — response strategy rationale:') || '';
        body = { response_plan_basis: basis };
        if (strat) body.response_strategy = strat;
        if (act) body.response_action = act;
        if (eff && !Number.isNaN(Number(eff))) body.response_effectiveness_pct = Number(eff);
        if (owner) body.response_owner = owner;
        if (contingency && !Number.isNaN(Number(contingency))) body.total_contingency_zar = Number(contingency);
        if (envelope && !Number.isNaN(Number(envelope))) body.bid_envelope_zar = Number(envelope);
      } else if (action === 'execute-response') {
        const drawn = window.prompt('Contingency drawn so far (ZAR):', String(row.contingency_drawn_zar ?? 0)) || '';
        const basis = window.prompt('Execution basis — response now under way:') || '';
        body = { response_active_basis: basis };
        if (drawn && !Number.isNaN(Number(drawn))) body.contingency_drawn_zar = Number(drawn);
      } else if (action === 'begin-monitoring') {
        const ref = window.prompt('Monitoring reference:') || '';
        const notes = window.prompt('Monitoring note — what is being watched:') || '';
        body = {};
        if (ref) body.monitor_ref = ref;
        if (notes) body.notes = notes;
      } else if (action === 'realize-risk') {
        const cost = window.prompt('Realized cost impact (ZAR):') || '';
        const days = window.prompt('Realized schedule impact (days):') || '';
        const drawn = window.prompt('Updated contingency drawn (ZAR):', String(row.contingency_drawn_zar ?? 0)) || '';
        const basis = window.prompt('Realization basis — risk event description:');
        if (!basis) return;
        const reg = window.prompt('Regulator reference (force_majeure / regulatory_change crosses to DMRE / NERSA for EVERY tier):') || '';
        body = { realized_basis: basis, reason_code: 'realized' };
        if (cost && !Number.isNaN(Number(cost))) body.realized_cost_zar = Number(cost);
        if (days && !Number.isNaN(Number(days))) body.realized_schedule_days = Number(days);
        if (drawn && !Number.isNaN(Number(drawn))) body.contingency_drawn_zar = Number(drawn);
        if (reg) body.regulator_ref = reg;
      } else if (action === 'close-risk') {
        const basis = window.prompt('Close basis — outcome + lessons learned:');
        if (!basis) return;
        const ref = window.prompt('Close reference:') || '';
        const reg = window.prompt('Regulator reference (closing a critical realized risk is reportable):') || '';
        body = { close_basis: basis, reason_code: 'closed' };
        if (ref) body.close_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'accept-risk') {
        const basis = window.prompt('Acceptance basis — sponsor accepts risk as-is (critical tier crosses regulator):');
        if (!basis) return;
        const ref = window.prompt('Acceptance reference:') || '';
        const reg = window.prompt('Regulator reference (accepting a critical risk is a governance event):') || '';
        body = { reason_code: 'accepted', notes: basis };
        if (ref) body.accept_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'escalate') {
        const basis = window.prompt('Escalation basis — material residual EMV; re-analyze required:');
        if (!basis) return;
        const ref = window.prompt('Escalation reference:') || '';
        const reg = window.prompt('Regulator reference (escalation crosses for high+critical tiers):') || '';
        body = { escalate_basis: basis, reason_code: 'escalated' };
        if (ref) body.escalate_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'reanalyze') {
        const basis = window.prompt('Re-analysis basis — revised quantification:');
        if (!basis) return;
        const ref = window.prompt('Re-analysis reference:') || '';
        body = { quantify_basis: basis };
        if (ref) body.reanalyze_ref = ref;
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal note — raiser pulls the risk:');
        if (!basis) return;
        body = { reason_code: 'withdrawn', notes: basis };
      } else if (action === 'cancel') {
        const basis = window.prompt('Cancellation note:');
        if (!basis) return;
        body = { reason_code: 'cancelled', notes: basis };
      }
      await api.post(`/ipp/project-risk/chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Project risk register &amp; quantitative SRA</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage integrated risk-management chain · identified → assessed → quantified → response_planned →
            response_active → monitoring → closed, with realized (event occurred), escalated (re-analyze),
            accepted (sponsor as-is), and withdrawn/cancelled terminals. The PROJECT-RISK-MANAGEMENT core under
            the IPP schedule (W1), procurement (W19), construction-to-COD (W20) and change-control (W81). The
            DIFFERENTIATOR over Acumen Fuse Risk / Primavera Risk Analysis (PRA) / Safran Risk / @Risk / Crystal
            Ball / Deltek Acumen Risk / Riskonnect / Predict! / Synergi Life / Active Risk Manager: every risk
            is LIVE-scored every fetch against a P50/P80 EMV battery (triangular Monte-Carlo cost &amp; schedule),
            residual EMV after planned response, contingency drawdown vs project_reserve, and a
            bid-envelope-breach % vs the REIPPPP commitment. Tier is EMV-DERIVED on every transition
            (probability_pct × |worst_case_zar|) — low &lt;R500k / moderate &lt;R5m / high &lt;R50m / critical
            ≥R50m — with a floor-at-high for force_majeure, regulatory_change and strategic classes.
            INVERTED SLA — a larger EMV gets MORE time (deeper Monte-Carlo, board review, external-advisor
            consultation). Reportable is REALIZATION-driven: realize_risk for force_majeure / regulatory_change
            crosses regulator EVERY tier (W92 SIGNATURE hard line), other realize_risk crosses high+critical,
            escalate crosses high+critical, accept_risk crosses critical only (governance event), close_risk
            crosses critical + realized only (post-event close-out), SLA breach crosses high+critical.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total risks" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Realized" value={kpis?.realized_count ?? 0} tone={(kpis?.realized_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Escalated" value={kpis?.escalated_count ?? 0} tone={(kpis?.escalated_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Accepted" value={kpis?.accepted_count ?? 0} />
        <Kpi label="Closed" value={kpis?.closed_count ?? 0} tone="ok" />
        <Kpi label="Envelope breach" value={kpis?.envelope_breach_count ?? 0} tone={(kpis?.envelope_breach_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Contingency over" value={kpis?.contingency_exceeded_count ?? 0} tone={(kpis?.contingency_exceeded_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Signature class" value={kpis?.signature_count ?? 0} tone={(kpis?.signature_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Total EMV" value={fmtZar(kpis?.total_emv_zar)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Risk #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / title</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">EMV</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">P80 cost</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Envelope</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.risk_tier];
                const envPct = r.bid_envelope_risk_pct_live ?? null;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.risk_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {r.signature_class_flag && <span className="ml-1 text-[#9b1f1f]" title="Force majeure / regulatory_change (W92 SIGNATURE)">★</span>}
                      {r.bid_envelope_breach_flag && <span className="ml-1 text-[#9b1f1f]" title="Past REIPPPP bid envelope">▲</span>}
                      {r.contingency_exceeded_flag && <span className="ml-1 text-[#9b1f1f]" title="Contingency exceeded">◆</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.project_name ?? ''} · ${r.risk_title ?? ''}`}>
                      {r.project_name ?? '—'}
                      <span className="text-[#4a5568]"> · {r.risk_title ?? ''}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#4a5568]">{r.risk_class}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {r.risk_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{fmtZar(r.emv_zar_live)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtZar(r.p80_cost_zar_live)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${envPct != null && envPct >= 100 ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {envPct != null ? fmtPct(envPct, 0) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-[#4a5568]">No risks match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: RiskRow;
  events: RiskEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: RiskRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];
  const authority = AUTHORITY_LABEL[row.authority_required_live ?? row.authority_required ?? ''] ?? (row.authority_required ?? '—');

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.risk_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name ?? '—'} · {row.risk_title ?? ''}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.risk_tier].label}
                {row.risk_class ? ` · ${row.risk_class}` : ''}
                {row.facility_name ? ` · ${row.facility_name}` : ''}
              </div>
              {row.source_wave && (
                <div className="mt-1 text-[11px] text-[#4a5568]">
                  Sourced from {row.source_wave}{row.source_entity_id ? ` · ${row.source_entity_id}` : ''}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        {/* The distinctive layer — live SRA Monte-Carlo battery + contingency + bid envelope. */}
        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live SRA Monte-Carlo battery</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="EMV" value={fmtZar(row.emv_zar_live)} bad={(row.emv_zar_live ?? 0) >= 50_000_000} hint="Expected monetary value" />
              <Metric label="Residual EMV" value={fmtZar(row.residual_emv_zar_live)} bad={(row.residual_emv_zar_live ?? 0) >= 25_000_000} hint="After planned response" />
              <Metric label="Tier (live)" value={(row.tier_live ?? row.risk_tier).toString()} hint="EMV-derived, re-derived every fetch" />
              <Metric label="Floor applied" value={row.floor_at_high_class_flag ? 'Yes (high)' : 'No'} bad={!!row.floor_at_high_class_flag} hint="force_majeure / regulatory_change / strategic" />
              <Metric label="P50 cost" value={fmtZar(row.p50_cost_zar_live)} hint="Triangular median" />
              <Metric label="P80 cost" value={fmtZar(row.p80_cost_zar_live)} bad={(row.p80_cost_zar_live ?? 0) >= 25_000_000} hint="Triangular 80th percentile" />
              <Metric label="P50 schedule" value={row.p50_schedule_days_live != null ? `${fmtNum(row.p50_schedule_days_live, 0)}d` : '—'} hint="Triangular median" />
              <Metric label="P80 schedule" value={row.p80_schedule_days_live != null ? `${fmtNum(row.p80_schedule_days_live, 0)}d` : '—'} hint="Triangular 80th percentile" />
            </div>
          </div>
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Contingency &amp; bid envelope</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Contingency drawn" value={fmtZar(row.contingency_drawn_zar)} />
              <Metric label="Total contingency" value={fmtZar(row.total_contingency_zar)} />
              <Metric label="Drawdown ratio" value={row.contingency_drawdown_ratio_live != null ? fmtPct(row.contingency_drawdown_ratio_live * 100, 1) : '—'} bad={!!row.contingency_exceeded_flag} />
              <Metric label="Contingency over" value={row.contingency_exceeded_flag ? 'YES' : 'No'} bad={!!row.contingency_exceeded_flag} />
              <Metric label="Bid envelope" value={fmtZar(row.bid_envelope_zar)} hint="REIPPPP commitment" />
              <Metric label="Envelope risk %" value={row.bid_envelope_risk_pct_live != null ? fmtPct(row.bid_envelope_risk_pct_live, 1) : '—'} bad={!!row.bid_envelope_breach_flag} />
              <Metric label="Envelope breach" value={row.bid_envelope_breach_flag ? 'BREACHED' : 'Within'} bad={!!row.bid_envelope_breach_flag} />
              <Metric label="Authority" value={authority} hint="Derived from tier" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                  value={STATE_TONE[row.chain_status].label} />
            <Pair label="Risk tier"              value={TIER_TONE[row.risk_tier].label} />
            <Pair label="Risk class"             value={row.risk_class} />
            <Pair label="Category"               value={row.risk_category ?? '—'} />
            <Pair label="Probability"            value={fmtPct(row.probability_pct, 0)} />
            <Pair label="Worst-case cost"        value={fmtZar(row.worst_case_cost_impact_zar)} />
            <Pair label="Worst-case sched"       value={`${row.worst_case_schedule_impact_days}d`} />
            <Pair label="Response strategy"      value={row.response_strategy ?? '—'} />
            <Pair label="Response action"        value={row.response_action ?? '—'} />
            <Pair label="Response effectiveness" value={row.response_effectiveness_pct != null ? fmtPct(row.response_effectiveness_pct, 0) : '—'} />
            <Pair label="Response owner"         value={row.response_owner ?? '—'} />
            <Pair label="Response due"           value={fmtDate(row.response_due_at)} />
            <Pair label="Risk owner"             value={row.risk_owner_party_name ?? '—'} />
            <Pair label="Raised by"              value={row.raised_by_party_name ?? '—'} />
            <Pair label="REIPPPP window"         value={row.reipppp_bid_window ?? '—'} />
            <Pair label="Realized?"              value={row.realized_flag === 1 ? 'Yes' : 'No'} />
            <Pair label="Realized cost"          value={fmtZar(row.realized_cost_zar)} />
            <Pair label="Realized sched"         value={row.realized_schedule_days != null ? `${row.realized_schedule_days}d` : '—'} />
            <Pair label="Reason code"            value={row.reason_code ?? '—'} />
            <Pair label="Identified"             value={fmtDate(row.identified_at)} />
            <Pair label="Assessed"               value={fmtDate(row.assessed_at)} />
            <Pair label="Quantified"             value={fmtDate(row.quantified_at)} />
            <Pair label="Response planned"       value={fmtDate(row.response_planned_at)} />
            <Pair label="Response active"        value={fmtDate(row.response_active_at)} />
            <Pair label="Monitoring"             value={fmtDate(row.monitoring_at)} />
            <Pair label="Realized at"            value={fmtDate(row.realized_at)} />
            <Pair label="Closed"                 value={fmtDate(row.closed_at)} />
            <Pair label="SLA deadline"           value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"             value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"         value={String(row.escalation_level)} />
            <Pair label="Reportable"             value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.risk_description && <BasisBlock label="Risk description" tone="#1a3a5c" text={row.risk_description} />}
          {row.assess_basis && <BasisBlock label="Assessment basis" tone="#1a3a5c" text={row.assess_basis} />}
          {row.quantify_basis && <BasisBlock label="Quantify basis (SRA)" tone="#1a3a5c" text={row.quantify_basis} />}
          {row.response_plan_basis && <BasisBlock label="Response plan basis" tone="#a06200" text={row.response_plan_basis} />}
          {row.response_active_basis && <BasisBlock label="Response active basis" tone="#a06200" text={row.response_active_basis} />}
          {row.realized_basis && <BasisBlock label="Realization basis" tone="#9b1f1f" text={row.realized_basis} />}
          {row.escalate_basis && <BasisBlock label="Escalation basis" tone="#8a4a00" text={row.escalate_basis} />}
          {row.close_basis && <BasisBlock label="Close basis" tone="#155724" text={row.close_basis} />}
          {row.response_summary && <BasisBlock label="Response summary" tone="#557" text={row.response_summary} />}
        </section>

        {(primary || secondary.length > 0) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {primary && (
                <button
                  onClick={() => onAct(primary, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[primary]}
                </button>
              )}
              {secondary.map((a) => {
                const danger = DESTRUCTIVE.includes(a);
                return (
                  <button
                    key={a}
                    onClick={() => onAct(a, row)}
                    className={
                      danger
                        ? 'rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50'
                        : 'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]'
                    }
                  >
                    {ACTION_LABEL[a]}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {(e.from_status || e.to_status) && (
                      <span className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
                    )}
                    {e.actor_party && (
                      <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[10px] font-medium text-[#4a5568]">{e.actor_party}</span>
                    )}
                  </div>
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, bad, hint }: { label: string; value: string; bad?: boolean; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className={`text-[13px] font-semibold tabular-nums ${bad ? 'text-[#9b1f1f]' : 'text-[#0c2a4d]'}`}>{value}</div>
    </div>
  );
}

function BasisBlock({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="mt-3 text-[12px]">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: tone }}>{label}</div>
      <div className="whitespace-pre-wrap" style={{ color: tone }}>{text}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
