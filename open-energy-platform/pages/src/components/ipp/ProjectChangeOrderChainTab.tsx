// Wave 81 — IPP Project Change-Order / Variation Control & Earned-Value tab.
//
// The PROJECT-CONTROLS core of a best-in-class projects system. W1 gave the IPP
// the schedule (CPM / Gantt / resource-leveling); W19/W20 gave it procurement
// and the construction-to-COD lifecycle. None of them manage the CHANGE — a
// site condition, design change, regulatory shift or client request lands a
// variation against the approved baseline. Project controls quantifies its
// cost / schedule / earned-value impact, draws it against the contingency
// reserve, gates approval on an authority tiered by magnitude, and only then
// RE-BASELINES the plan. This is that layer.
//
// DISTINCTIVE move (beat Primavera P6 EVM / Procore Change Management / MS
// Project baselines / Oracle Aconex): every change order is scored LIVE against
// the project earned-value battery (CV/SV/CPI/SPI/EAC/VAC/TCPI) and its
// contingency, the approval authority is DERIVED from the variation magnitude,
// and a variation that pushes the project past its REIPPPP BID ENVELOPE crosses
// to the regulator (DMRE / IPP Office) as a viability signal. Tier is DERIVED
// from |cost_impact_zar| and re-derived on every transition. INVERTED SLA — a
// larger variation gets MORE time. Reportable is RE-BASELINE-driven: incorporate
// crosses for HIGH tiers; approve / reject cross for critical; sla_breach HIGH.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'draft' | 'submitted' | 'screening' | 'impact_assessment' | 'pending_approval'
  | 'approved' | 'incorporated' | 'deferred' | 'disputed' | 'rejected'
  | 'withdrawn' | 'cancelled';

type Tier = 'minor' | 'moderate' | 'major' | 'critical';

interface CoRow {
  id: string;
  co_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string | null;
  project_name: string;
  participant_id: string | null;
  participant_name: string | null;
  contractor_name: string | null;
  change_type: string | null;
  title: string;
  description: string | null;
  variation_tier: Tier;
  cost_impact_zar: number;
  schedule_impact_days: number;
  baseline_cost_zar: number | null;
  baseline_duration_days: number | null;
  contingency_zar: number | null;
  contingency_drawn_zar: number;
  earned_value_zar: number | null;
  planned_value_zar: number | null;
  actual_cost_zar: number | null;
  budget_at_completion_zar: number | null;
  cumulative_approved_variation_zar: number;
  cumulative_approved_days: number;
  bid_envelope_cost_pct: number | null;
  bid_envelope_schedule_days: number | null;
  approval_authority: string | null;
  approved_by: string | null;
  raised_by_party: string | null;
  reason_code: string | null;
  rejection_reason: string | null;
  dispute_reason: string | null;
  submission_ref: string | null;
  screening_ref: string | null;
  assessment_ref: string | null;
  approval_ref: string | null;
  incorporation_ref: string | null;
  deferral_ref: string | null;
  dispute_ref: string | null;
  rejection_ref: string | null;
  regulator_ref: string | null;
  evidence_ref: string | null;
  submission_basis: string | null;
  screening_basis: string | null;
  assessment_basis: string | null;
  approval_basis: string | null;
  incorporation_basis: string | null;
  deferral_basis: string | null;
  dispute_basis: string | null;
  rejection_basis: string | null;
  notes: string | null;
  chain_status: ChainStatus;
  draft_at: string;
  submitted_at: string | null;
  screening_at: string | null;
  impact_assessment_at: string | null;
  pending_approval_at: string | null;
  approved_at: string | null;
  incorporated_at: string | null;
  deferred_at: string | null;
  disputed_at: string | null;
  rejected_at: string | null;
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
  is_reportable_flag?: boolean;
  approval_authority_derived?: string;
  breach_crosses_regulator?: boolean;
  cost_variance_zar?: number;
  schedule_variance_zar?: number;
  cpi?: number;
  spi?: number;
  estimate_at_completion_zar?: number;
  variance_at_completion_zar?: number;
  tcpi?: number;
  contingency_remaining_zar?: number;
  within_contingency?: boolean;
  revised_baseline_cost_zar?: number;
  cumulative_overrun_pct?: number;
  breaches_bid_envelope?: boolean;
}

interface CoEvent {
  id: string;
  co_id: string;
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
  pending_approval: number;
  in_assessment: number;
  disputed_count: number;
  deferred_count: number;
  incorporated_count: number;
  rejected_count: number;
  breached: number;
  reportable_total: number;
  bid_envelope_breaches: number;
  high_tier_count: number;
  total_cost_impact_zar: number;
  total_schedule_impact_days: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  draft:             { bg: '#e3e7ec', fg: '#557',    label: 'Draft' },
  submitted:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  screening:         { bg: '#dbecfb', fg: '#1a3a5c', label: 'Screening' },
  impact_assessment: { bg: '#fff4d6', fg: '#a06200', label: 'Impact assessment' },
  pending_approval:  { bg: '#fff4d6', fg: '#a06200', label: 'Pending approval' },
  approved:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  incorporated:      { bg: '#d4edda', fg: '#155724', label: 'Incorporated (re-baselined)' },
  deferred:          { bg: '#ffe9d6', fg: '#8a4a00', label: 'Deferred' },
  disputed:          { bg: '#ffe4b5', fg: '#8a4a00', label: 'Disputed' },
  rejected:          { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  withdrawn:         { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
  cancelled:         { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Critical (≥R50m)' },
  major:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Major (R10–50m)' },
  moderate: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate (R1–10m)' },
  minor:    { bg: '#e3e7ec', fg: '#557',    label: 'Minor (<R1m)' },
};

// Approval authority derived from the variation magnitude.
const AUTHORITY_LABEL: Record<string, string> = {
  project_manager: 'Project manager',
  sponsor:         'Sponsor',
  board:           'Board capital committee',
  dmre_notify:     'Board + DMRE notification',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open',          label: 'Open' },
  { key: 'all',           label: 'All' },
  { key: 'critical',      label: 'Critical' },
  { key: 'major',         label: 'Major' },
  { key: 'moderate',      label: 'Moderate' },
  { key: 'minor',         label: 'Minor' },
  { key: 'pending_approval', label: 'Pending approval' },
  { key: 'impact_assessment', label: 'In assessment' },
  { key: 'disputed',      label: 'Disputed' },
  { key: 'deferred',      label: 'Deferred' },
  { key: 'bid_envelope',  label: 'Bid-envelope breach' },
  { key: 'breached',      label: 'SLA breached' },
  { key: 'reportable',    label: 'Reportable' },
  { key: 'incorporated',  label: 'Incorporated' },
  { key: 'rejected',      label: 'Rejected' },
];

type ActionKind =
  | 'submit' | 'begin-screening' | 'assess-impact' | 'submit-for-approval'
  | 'approve' | 'incorporate' | 'defer' | 'resubmit' | 'raise-dispute'
  | 'resolve-dispute' | 'reject' | 'withdraw' | 'cancel';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  draft:             'submit',
  submitted:         'begin-screening',
  screening:         'assess-impact',
  impact_assessment: 'submit-for-approval',
  pending_approval:  'approve',
  approved:          'incorporate',
  deferred:          'resubmit',
  disputed:          'resolve-dispute',
  incorporated:      null,
  rejected:          null,
  withdrawn:         null,
  cancelled:         null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'submit':              'Submit (project manager)',
  'begin-screening':     'Begin screening (project controls)',
  'assess-impact':       'Assess impact / EVM (project controls)',
  'submit-for-approval': 'Submit for approval (project controls)',
  'approve':             'Approve (sponsor)',
  'incorporate':         'Incorporate / re-baseline (sponsor)',
  'defer':               'Defer / park (project controls)',
  'resubmit':            'Resubmit (project manager)',
  'raise-dispute':       'Raise dispute (project controls)',
  'resolve-dispute':     'Resolve dispute (project controls)',
  'reject':              'Reject (sponsor)',
  'withdraw':            'Withdraw (project manager)',
  'cancel':              'Cancel (project manager)',
};

// Secondary actions offered alongside the primary forward action, per state.
const SECONDARY_ACTIONS: Record<ChainStatus, ActionKind[]> = {
  draft:             ['withdraw', 'cancel'],
  submitted:         ['withdraw', 'cancel'],
  screening:         ['defer', 'reject', 'withdraw', 'cancel'],
  impact_assessment: ['reject', 'withdraw', 'cancel'],
  pending_approval:  ['raise-dispute', 'reject', 'withdraw', 'cancel'],
  approved:          ['cancel'],
  deferred:          ['reject', 'cancel'],
  disputed:          ['reject', 'cancel'],
  incorporated:      [],
  rejected:          [],
  withdrawn:         [],
  cancelled:         [],
};

const DESTRUCTIVE: ActionKind[] = ['reject', 'withdraw', 'cancel', 'defer', 'raise-dispute'];

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

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TERMINAL_STATES: ChainStatus[] = ['incorporated', 'rejected', 'withdrawn', 'cancelled'];

export function ProjectChangeOrderChainTab() {
  const [rows, setRows] = useState<CoRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('open');
  const [selected, setSelected] = useState<CoRow | null>(null);
  const [events, setEvents] = useState<CoEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CoRow[] } & KpiSummary }>('/ipp/change-order/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, pending_approval: d.pending_approval,
          in_assessment: d.in_assessment, disputed_count: d.disputed_count,
          deferred_count: d.deferred_count, incorporated_count: d.incorporated_count,
          rejected_count: d.rejected_count, breached: d.breached,
          reportable_total: d.reportable_total, bid_envelope_breaches: d.bid_envelope_breaches,
          high_tier_count: d.high_tier_count, total_cost_impact_zar: d.total_cost_impact_zar,
          total_schedule_impact_days: d.total_schedule_impact_days,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load change orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: CoRow; events: CoEvent[] } }>(`/ipp/change-order/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load change-order history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'open')         return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'breached')     return r.sla_breached;
      if (filter === 'reportable')   return r.is_reportable_flag;
      if (filter === 'bid_envelope') return r.breaches_bid_envelope;
      if (['minor', 'moderate', 'major', 'critical'].includes(filter)) {
        return r.variation_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: CoRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'submit') {
        const cost = window.prompt('Cost impact (ZAR) — tier is derived from this:', String(row.cost_impact_zar ?? '')) || '';
        const days = window.prompt('Schedule impact (days):', String(row.schedule_impact_days ?? '')) || '';
        const basis = window.prompt('Submission basis — the variation cause + scope:') || '';
        const ref = window.prompt('Submission reference:') || '';
        body = { submission_basis: basis };
        if (ref) body.submission_ref = ref;
        if (cost && !Number.isNaN(Number(cost))) body.cost_impact_zar = Number(cost);
        if (days && !Number.isNaN(Number(days))) body.schedule_impact_days = Number(days);
      } else if (action === 'begin-screening') {
        const basis = window.prompt('Screening basis — initial triage / merit:') || '';
        const ref = window.prompt('Screening reference:') || '';
        body = { screening_basis: basis };
        if (ref) body.screening_ref = ref;
      } else if (action === 'assess-impact') {
        const cost = window.prompt('Assessed cost impact (ZAR) — re-derives tier:', String(row.cost_impact_zar ?? '')) || '';
        const days = window.prompt('Assessed schedule impact (days):', String(row.schedule_impact_days ?? '')) || '';
        const ev = window.prompt('Earned value to date (ZAR):', row.earned_value_zar != null ? String(row.earned_value_zar) : '') || '';
        const pv = window.prompt('Planned value to date (ZAR):', row.planned_value_zar != null ? String(row.planned_value_zar) : '') || '';
        const ac = window.prompt('Actual cost to date (ZAR):', row.actual_cost_zar != null ? String(row.actual_cost_zar) : '') || '';
        const bac = window.prompt('Budget at completion (ZAR):', row.budget_at_completion_zar != null ? String(row.budget_at_completion_zar) : '') || '';
        const basis = window.prompt('Assessment basis — cost / schedule / EVM rationale:') || '';
        body = { assessment_basis: basis };
        if (cost && !Number.isNaN(Number(cost))) body.cost_impact_zar = Number(cost);
        if (days && !Number.isNaN(Number(days))) body.schedule_impact_days = Number(days);
        if (ev && !Number.isNaN(Number(ev))) body.earned_value_zar = Number(ev);
        if (pv && !Number.isNaN(Number(pv))) body.planned_value_zar = Number(pv);
        if (ac && !Number.isNaN(Number(ac))) body.actual_cost_zar = Number(ac);
        if (bac && !Number.isNaN(Number(bac))) body.budget_at_completion_zar = Number(bac);
      } else if (action === 'submit-for-approval') {
        const basis = window.prompt('Assessment basis — package routed to approval authority:') || '';
        const ref = window.prompt('Approval reference:') || '';
        body = { assessment_basis: basis };
        if (ref) body.approval_ref = ref;
      } else if (action === 'approve') {
        const by = window.prompt('Approved by (authority):', AUTHORITY_LABEL[row.approval_authority_derived ?? ''] ?? '') || '';
        const basis = window.prompt('Approval basis — authority + decision rationale:') || '';
        const ref = window.prompt('Approval reference:') || '';
        body = { approval_basis: basis };
        if (by) body.approved_by = by;
        if (ref) body.approval_ref = ref;
      } else if (action === 'incorporate') {
        const basis = window.prompt('Incorporation basis — baseline re-issued; a HIGH-tier re-baseline is reportable:');
        if (!basis) return;
        const ref = window.prompt('Incorporation reference:') || '';
        const reg = window.prompt('Regulator reference (a material bid-envelope move is reportable to DMRE / IPPO):') || '';
        body = { incorporation_basis: basis };
        if (ref) body.incorporation_ref = ref;
        if (reg) body.regulator_ref = reg;
      } else if (action === 'defer') {
        const basis = window.prompt('Deferral basis — why the variation is parked:');
        if (!basis) return;
        const ref = window.prompt('Deferral reference:') || '';
        body = { deferral_basis: basis, reason_code: 'deferred' };
        if (ref) body.deferral_ref = ref;
      } else if (action === 'resubmit') {
        const cost = window.prompt('Revised cost impact (ZAR):', String(row.cost_impact_zar ?? '')) || '';
        const days = window.prompt('Revised schedule impact (days):', String(row.schedule_impact_days ?? '')) || '';
        const basis = window.prompt('Resubmission basis — what changed since deferral:') || '';
        body = { submission_basis: basis };
        if (cost && !Number.isNaN(Number(cost))) body.cost_impact_zar = Number(cost);
        if (days && !Number.isNaN(Number(days))) body.schedule_impact_days = Number(days);
      } else if (action === 'raise-dispute') {
        const reason = window.prompt('Dispute reason — contractor contests the assessed quantum:');
        if (!reason) return;
        const basis = window.prompt('Dispute basis:') || '';
        const ref = window.prompt('Dispute reference:') || '';
        body = { dispute_reason: reason, dispute_basis: basis };
        if (ref) body.dispute_ref = ref;
      } else if (action === 'resolve-dispute') {
        const cost = window.prompt('Re-assessed cost impact (ZAR), if revised:', String(row.cost_impact_zar ?? '')) || '';
        const days = window.prompt('Re-assessed schedule impact (days), if revised:', String(row.schedule_impact_days ?? '')) || '';
        const basis = window.prompt('Resolution basis — dispute settled, re-assessing:');
        if (!basis) return;
        body = { dispute_basis: basis };
        if (cost && !Number.isNaN(Number(cost))) body.cost_impact_zar = Number(cost);
        if (days && !Number.isNaN(Number(days))) body.schedule_impact_days = Number(days);
      } else if (action === 'reject') {
        const reason = window.prompt('Rejection reason:');
        if (!reason) return;
        const basis = window.prompt('Rejection basis:') || '';
        const reg = window.prompt('Regulator reference (rejecting a critical variation can signal project distress — reportable):') || '';
        body = { rejection_reason: reason, rejection_basis: basis, reason_code: 'rejected' };
        if (reg) body.regulator_ref = reg;
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal note — raiser pulls the variation:');
        if (!basis) return;
        body = { reason_code: 'withdrawn', notes: basis };
      } else if (action === 'cancel') {
        const basis = window.prompt('Cancellation note:');
        if (!basis) return;
        body = { reason_code: 'cancelled', notes: basis };
      }
      await api.post(`/ipp/change-order/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Change orders &amp; variation control · earned-value management</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage integrated change-control chain · draft → submitted → screening → impact assessment →
            pending approval → approved → incorporated (baseline re-issued), with a deferral park (screening →
            deferred → resubmit) and a dispute loop (pending approval → disputed → resolve → impact assessment).
            The PROJECT-CONTROLS core under the IPP schedule (W1), procurement (W19) and construction-to-COD (W20):
            a site condition, design change, regulatory shift or client request lands a variation against the
            approved baseline — and this is the layer that quantifies its cost / schedule / earned-value impact,
            draws it against the contingency reserve, gates approval on an authority tiered by magnitude, and only
            then RE-BASELINES the plan. The DIFFERENTIATOR over Primavera P6 EVM / Procore Change Management /
            MS Project baselines / Oracle Aconex: every change order is scored LIVE against the earned-value battery
            (CV / SV / CPI / SPI / EAC / VAC / TCPI) and its contingency, the approval authority is DERIVED from the
            variation magnitude, and a variation that pushes the project past its REIPPPP BID ENVELOPE crosses to the
            regulator (DMRE / IPP Office) as a viability signal. Tier is DERIVED from the cost impact (re-derived live).
            INVERTED SLA — a larger variation gets MORE time. Reportable is RE-BASELINE-driven: incorporating a HIGH-tier
            variation crosses; approving / rejecting a critical variation crosses; an SLA breach crosses for the HIGH tiers.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total variations" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} tone={(kpis?.open_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Pending approval" value={kpis?.pending_approval ?? 0} tone={(kpis?.pending_approval ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In assessment" value={kpis?.in_assessment ?? 0} />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Deferred" value={kpis?.deferred_count ?? 0} tone={(kpis?.deferred_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Incorporated" value={kpis?.incorporated_count ?? 0} tone="ok" />
        <Kpi label="Bid-envelope breach" value={kpis?.bid_envelope_breaches ?? 0} tone={(kpis?.bid_envelope_breaches ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="High-tier" value={kpis?.high_tier_count ?? 0} tone={(kpis?.high_tier_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Net cost impact" value={fmtZar(kpis?.total_cost_impact_zar)} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">CO #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / variation</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Cost impact</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Sched</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">CPI / SPI</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.variation_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.co_number}
                      {r.is_reportable_flag && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                      {r.breaches_bid_envelope && <span className="ml-1 text-[#9b1f1f]" title="Past REIPPPP bid envelope">▲</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.project_name} · ${r.title}`}>
                      {r.project_name}
                      <span className="text-[#4a5568]"> · {r.title}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {r.variation_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0c2a4d]">{fmtZar(r.cost_impact_zar)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{r.schedule_impact_days != null ? `${r.schedule_impact_days}d` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[11px]">
                      <span className={(r.cpi ?? 1) < 1 ? 'text-red-700' : 'text-[#1f6b3a]'}>{fmtNum(r.cpi)}</span>
                      <span className="text-[#9aa5b1]"> / </span>
                      <span className={(r.spi ?? 1) < 1 ? 'text-red-700' : 'text-[#1f6b3a]'}>{fmtNum(r.spi)}</span>
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
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No change orders match.</td></tr>
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
  row: CoRow;
  events: CoEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: CoRow) => void;
}) {
  const primary = ACTION_FOR_STATE[row.chain_status];
  const secondary = SECONDARY_ACTIONS[row.chain_status];
  const authority = AUTHORITY_LABEL[row.approval_authority_derived ?? row.approval_authority ?? ''] ?? (row.approval_authority ?? '—');

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[760px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.co_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name} · {row.title}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.variation_tier].label}
                {row.change_type ? ` · ${row.change_type}` : ''}
                {row.contractor_name ? ` · ${row.contractor_name}` : ''}
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

        {/* The distinctive layer — live earned-value battery + contingency + bid envelope. */}
        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Live earned-value battery</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="CPI" value={fmtNum(row.cpi)} bad={(row.cpi ?? 1) < 1} hint="Cost performance" />
              <Metric label="SPI" value={fmtNum(row.spi)} bad={(row.spi ?? 1) < 1} hint="Schedule performance" />
              <Metric label="CV" value={fmtZar(row.cost_variance_zar)} bad={(row.cost_variance_zar ?? 0) < 0} hint="Cost variance" />
              <Metric label="SV" value={fmtZar(row.schedule_variance_zar)} bad={(row.schedule_variance_zar ?? 0) < 0} hint="Schedule variance" />
              <Metric label="EAC" value={fmtZar(row.estimate_at_completion_zar)} hint="Estimate at completion" />
              <Metric label="VAC" value={fmtZar(row.variance_at_completion_zar)} bad={(row.variance_at_completion_zar ?? 0) < 0} hint="Variance at completion" />
              <Metric label="TCPI" value={fmtNum(row.tcpi)} bad={(row.tcpi ?? 1) > 1} hint="To-complete performance" />
              <Metric label="BAC" value={fmtZar(row.budget_at_completion_zar)} hint="Budget at completion" />
            </div>
          </div>
          <div className="mb-3 rounded border border-[#d8dde6] bg-[#f8fafc] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Contingency &amp; re-baseline</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
              <Metric label="Contingency left" value={fmtZar(row.contingency_remaining_zar)} bad={(row.contingency_remaining_zar ?? 0) < 0} />
              <Metric label="Within contingency" value={row.within_contingency ? 'Yes' : 'No'} bad={row.within_contingency === false} />
              <Metric label="Revised baseline" value={fmtZar(row.revised_baseline_cost_zar)} />
              <Metric label="Cumulative overrun" value={row.cumulative_overrun_pct != null ? `${fmtNum(row.cumulative_overrun_pct, 1)}%` : '—'} bad={(row.cumulative_overrun_pct ?? 0) > 0} />
              <Metric label="Bid envelope" value={row.breaches_bid_envelope ? 'BREACHED' : 'Within'} bad={!!row.breaches_bid_envelope} hint="REIPPPP commitment" />
              <Metric label="Bid cost tol." value={row.bid_envelope_cost_pct != null ? `${row.bid_envelope_cost_pct}%` : '—'} />
              <Metric label="Bid COD tol." value={row.bid_envelope_schedule_days != null ? `${row.bid_envelope_schedule_days}d` : '—'} />
              <Metric label="Approval authority" value={authority} hint="Derived from magnitude" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Variation tier"     value={TIER_TONE[row.variation_tier].label} />
            <Pair label="Change type"        value={row.change_type ?? '—'} />
            <Pair label="Cost impact"        value={fmtZar(row.cost_impact_zar)} />
            <Pair label="Schedule impact"    value={row.schedule_impact_days != null ? `${row.schedule_impact_days}d` : '—'} />
            <Pair label="Baseline cost"      value={fmtZar(row.baseline_cost_zar)} />
            <Pair label="Baseline duration"  value={row.baseline_duration_days != null ? `${row.baseline_duration_days}d` : '—'} />
            <Pair label="Contingency"        value={fmtZar(row.contingency_zar)} />
            <Pair label="Contingency drawn"  value={fmtZar(row.contingency_drawn_zar)} />
            <Pair label="Cumulative approved" value={fmtZar(row.cumulative_approved_variation_zar)} />
            <Pair label="Cumulative days"    value={`${row.cumulative_approved_days ?? 0}d`} />
            <Pair label="Project"            value={row.project_name} />
            <Pair label="Participant"        value={row.participant_name ?? '—'} />
            <Pair label="Contractor"         value={row.contractor_name ?? '—'} />
            <Pair label="Approved by"        value={row.approved_by ?? '—'} />
            <Pair label="Reason code"        value={row.reason_code ?? '—'} />
            <Pair label="Rejection reason"   value={row.rejection_reason ?? '—'} />
            <Pair label="Dispute reason"     value={row.dispute_reason ?? '—'} />
            <Pair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
            <Pair label="Drafted"            value={fmtDate(row.draft_at)} />
            <Pair label="Submitted"          value={fmtDate(row.submitted_at)} />
            <Pair label="Assessed"           value={fmtDate(row.impact_assessment_at)} />
            <Pair label="Approved"           value={fmtDate(row.approved_at)} />
            <Pair label="Incorporated"       value={fmtDate(row.incorporated_at)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"     value={String(row.escalation_level)} />
            <Pair label="Reportable"         value={row.is_reportable_flag ? 'Yes' : 'No'} />
          </div>
          {row.description && <BasisBlock label="Description" tone="#1a3a5c" text={row.description} />}
          {row.submission_basis && <BasisBlock label="Submission basis" tone="#1a3a5c" text={row.submission_basis} />}
          {row.screening_basis && <BasisBlock label="Screening basis" tone="#1a3a5c" text={row.screening_basis} />}
          {row.assessment_basis && <BasisBlock label="Assessment basis" tone="#a06200" text={row.assessment_basis} />}
          {row.approval_basis && <BasisBlock label="Approval basis" tone="#1f6b3a" text={row.approval_basis} />}
          {row.incorporation_basis && <BasisBlock label="Incorporation basis" tone="#155724" text={row.incorporation_basis} />}
          {row.deferral_basis && <BasisBlock label="Deferral basis" tone="#8a4a00" text={row.deferral_basis} />}
          {row.dispute_basis && <BasisBlock label="Dispute basis" tone="#8a4a00" text={row.dispute_basis} />}
          {row.rejection_basis && <BasisBlock label="Rejection basis" tone="#9b1f1f" text={row.rejection_basis} />}
          {row.notes && <BasisBlock label="Notes" tone="#557" text={row.notes} />}
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
