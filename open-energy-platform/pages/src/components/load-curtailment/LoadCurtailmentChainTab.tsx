// Wave 34 — Grid CSC-1 Load Curtailment / Emergency Load Reduction chain.
//
// 11-state lifecycle for every System Operator (SO) load-curtailment
// instruction issued under NERSA Grid Code System Operations Code §CSC-1 + §C-3
// during a Stage 1-8 load-shedding event. Forward path:
//   instruction_issued → acknowledged → curtailment_started → target_achieved →
//   instruction_lifted → reconciled → post_mortem → closed
// Branch terminals:
//   refused             — target party refuses to comply (§C-3 referral)
//   partial_compliance  — target not met (proportional penalty)
//   withdrawn           — SO withdrew before customer action
//
// URGENT SLA — higher stage = TIGHTER deadline (system survival). stage_7_8
// acknowledge in 5 minutes; stage_1_2 in 60. Reportability: refused crosses
// ALL stages; partial_compliance stage_3_4+; target_achieved + post_mortem
// close + sla_breach cross stage_5_6+ (national threshold). Split-write: SO
// drives issue/lift/reconcile/post-mortem/close; customer acknowledges /
// starts / reports / refuses.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'instruction_issued' | 'acknowledged' | 'curtailment_started'
  | 'target_achieved' | 'instruction_lifted' | 'reconciled' | 'post_mortem'
  | 'closed' | 'refused' | 'partial_compliance' | 'withdrawn';

type LoadShedStage = 'stage_1_2' | 'stage_3_4' | 'stage_5_6' | 'stage_7_8';

type CustomerCategory =
  | 'distribution' | 'large_industrial' | 'embedded_generator'
  | 'mining' | 'metro';

interface CurtailmentRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  so_party_id: string;
  so_party_name: string;
  customer_party_id: string;
  customer_party_name: string;
  customer_category: CustomerCategory;
  facility_name: string | null;
  facility_province: string | null;
  load_shed_stage: LoadShedStage;
  national_shed_gw: number;
  target_mw: number;
  actual_shed_mw: number | null;
  variance_pct: number | null;
  duration_hours: number;
  grid_code_section: string;
  instruction_ref: string | null;
  acknowledgement_ref: string | null;
  metering_reconcile_ref: string | null;
  post_mortem_ref: string | null;
  refusal_ref: string | null;
  partial_ref: string | null;
  withdrawal_ref: string | null;
  penalty_zar: number | null;
  penalty_basis: string | null;
  tribunal_case_ref: string | null;
  refusal_grounds: string | null;
  partial_basis: string | null;
  withdrawal_basis: string | null;
  post_mortem_findings: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  instruction_issued_at: string;
  acknowledged_at: string | null;
  curtailment_started_at: string | null;
  target_achieved_at: string | null;
  partial_compliance_at: string | null;
  instruction_lifted_at: string | null;
  reconciled_at: string | null;
  post_mortem_opened_at: string | null;
  closed_at: string | null;
  refused_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  sla_window_minutes?: number;
  created_by: string;
  created_at: string;
}

interface CurtailmentEvent {
  id: string;
  curtailment_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  instruction_issued:  { bg: '#fbe7d0', fg: '#7a4500', label: 'Instruction issued' },
  acknowledged:        { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Acknowledged' },
  curtailment_started: { bg: '#fff4d6', fg: '#a06200', label: 'Curtailing' },
  target_achieved:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Target achieved' },
  instruction_lifted:  { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Lifted' },
  reconciled:          { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Reconciled' },
  post_mortem:         { bg: '#fff4d6', fg: '#a06200', label: 'Post-mortem' },
  closed:              { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Closed' },
  refused:             { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Refused' },
  partial_compliance:  { bg: '#f7d9b0', fg: '#8a3b00', label: 'Partial' },
  withdrawn:           { bg: '#e0e0e0', fg: '#555555', label: 'Withdrawn' },
};

const STAGE_TONE: Record<LoadShedStage, { bg: string; fg: string; label: string }> = {
  stage_1_2: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Stage 1-2 · mild' },
  stage_3_4: { bg: '#fff4d6', fg: '#a06200', label: 'Stage 3-4 · moderate' },
  stage_5_6: { bg: '#fbe0d0', fg: '#a03b00', label: 'Stage 5-6 · high' },
  stage_7_8: { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Stage 7-8 · critical' },
};

const CATEGORY_TONE: Record<CustomerCategory, { bg: string; fg: string; label: string }> = {
  distribution:       { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', label: 'Distribution' },
  large_industrial:   { bg: '#fff4d6', fg: '#a06200', label: 'Large industrial' },
  embedded_generator: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Embedded gen' },
  mining:             { bg: '#f0e0d0', fg: '#6b4500', label: 'Mining' },
  metro:              { bg: '#dbcffb', fg: '#3a1a5c', label: 'Metro' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'reportable',          label: 'NERSA reportable' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'stage_7_8',           label: 'Stage 7-8 (critical)' },
  { key: 'stage_5_6',           label: 'Stage 5-6 (high)' },
  { key: 'stage_3_4',           label: 'Stage 3-4' },
  { key: 'stage_1_2',           label: 'Stage 1-2' },
  { key: 'instruction_issued',  label: 'Issued' },
  { key: 'acknowledged',        label: 'Acknowledged' },
  { key: 'curtailment_started', label: 'Curtailing' },
  { key: 'target_achieved',     label: 'Target achieved' },
  { key: 'partial_compliance',  label: 'Partial' },
  { key: 'instruction_lifted',  label: 'Lifted' },
  { key: 'reconciled',          label: 'Reconciled' },
  { key: 'post_mortem',         label: 'Post-mortem' },
  { key: 'closed',              label: 'Closed' },
  { key: 'refused',             label: 'Refused' },
  { key: 'withdrawn',           label: 'Withdrawn' },
];

type ActionKind =
  | 'acknowledge' | 'start-curtailment' | 'report-target-achieved'
  | 'report-partial' | 'lift-instruction' | 'reconcile'
  | 'open-post-mortem' | 'close-post-mortem' | 'close' | 'refuse' | 'withdraw';

// Each state has ONE primary next-step action.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  instruction_issued:  'acknowledge',
  acknowledged:        'start-curtailment',
  curtailment_started: 'report-target-achieved',
  target_achieved:     'lift-instruction',
  partial_compliance:  'lift-instruction',
  instruction_lifted:  'reconcile',
  reconciled:          'open-post-mortem',
  post_mortem:         'close-post-mortem',
  closed:              null,
  refused:             null,
  withdrawn:           null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'acknowledge':            'Acknowledge instruction (customer)',
  'start-curtailment':      'Confirm curtailment started (customer)',
  'report-target-achieved': 'Report target achieved (customer)',
  'report-partial':         'Report partial compliance (customer)',
  'lift-instruction':       'Lift instruction (SO)',
  'reconcile':              'Reconcile metering (SO)',
  'open-post-mortem':       'Open post-mortem (SO)',
  'close-post-mortem':      'Close post-mortem (SO)',
  'close':                  'Close — skip post-mortem (SO)',
  'refuse':                 'Refuse to comply (customer §C-3)',
  'withdraw':               'Withdraw instruction (SO)',
};

// Customer may refuse only before curtailment begins.
const REFUSABLE: ChainStatus[] = ['instruction_issued', 'acknowledged'];
// Partial compliance can only be declared while curtailing.
const PARTIAL_WINDOW: ChainStatus[] = ['curtailment_started'];
// SO may withdraw before the customer achieves / partially complies.
const WITHDRAWABLE: ChainStatus[] = ['instruction_issued', 'acknowledged', 'curtailment_started'];
// From reconciled the SO may close directly (skip post-mortem on small events).
const SKIP_PM: ChainStatus[] = ['reconciled'];

function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (Math.abs(m) >= 1440) return `${Math.round(m / 1440)}d`;
  if (Math.abs(m) >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)} GW`;
  return `${n.toFixed(0)} MW`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return '—';
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toFixed(0)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  closed_count: number;
  refused_count: number;
  partial_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  high_open: number;
  total_target_mw: number;
  total_actual_mw: number;
  total_penalty_zar: number;
}

export function LoadCurtailmentChainTab() {
  const [rows, setRows] = useState<CurtailmentRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<CurtailmentRow | null>(null);
  const [events, setEvents] = useState<CurtailmentEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: CurtailmentRow[] } & KpiSummary }>('/load-curtailment/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          closed_count: data.closed_count || 0,
          refused_count: data.refused_count || 0,
          partial_count: data.partial_count || 0,
          withdrawn_count: data.withdrawn_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          critical_open: data.critical_open || 0,
          high_open: data.high_open || 0,
          total_target_mw: data.total_target_mw || 0,
          total_actual_mw: data.total_actual_mw || 0,
          total_penalty_zar: data.total_penalty_zar || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load load-curtailment chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: CurtailmentRow; events: CurtailmentEvent[] } }>(`/load-curtailment/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load case history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_reportable;
      if (filter === 'breached')   return r.sla_breached;
      if (filter.startsWith('stage_')) return r.load_shed_stage === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, closed_count: 0, refused_count: 0,
    partial_count: 0, withdrawn_count: 0, breached: 0, reportable_total: 0,
    critical_open: 0, high_open: 0, total_target_mw: 0, total_actual_mw: 0,
    total_penalty_zar: 0,
  };

  const act = useCallback(async (action: ActionKind, row: CurtailmentRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'acknowledge') {
        const ref = window.prompt('Acknowledgement reference (eg "ACK-AMSA-2026-0042"):');
        if (ref) body.acknowledgement_ref = ref;
      } else if (action === 'report-target-achieved') {
        const mw = window.prompt(`Actual shed MW (target ${row.target_mw} MW):`, String(row.target_mw));
        if (!mw) return;
        body.actual_shed_mw = Number(mw);
      } else if (action === 'report-partial') {
        const mw = window.prompt(`Actual shed MW achieved (target ${row.target_mw} MW):`);
        if (!mw) return;
        body.actual_shed_mw = Number(mw);
        const basis = window.prompt('Partial-compliance basis (why target was missed):');
        if (!basis) return;
        body.partial_basis = basis;
        const ref = window.prompt('Partial-compliance reference (eg "PARTIAL-AMSA-2026-0042"):');
        if (ref) body.partial_ref = ref;
        const pen = window.prompt('Proportional penalty (ZAR, optional):');
        if (pen) body.penalty_zar = Number(pen);
        const pbasis = window.prompt('Penalty basis (tariff/clause, optional):');
        if (pbasis) body.penalty_basis = pbasis;
      } else if (action === 'reconcile') {
        const ref = window.prompt('Metering reconciliation reference (eg "RECON-NRS048-2026-0042"):');
        if (!ref) return;
        body.metering_reconcile_ref = ref;
        const mw = window.prompt('Metered actual shed MW (optional — overrides reported):', row.actual_shed_mw != null ? String(row.actual_shed_mw) : '');
        if (mw) body.actual_shed_mw = Number(mw);
      } else if (action === 'open-post-mortem') {
        const ref = window.prompt('Post-mortem reference (eg "PM-2026-STAGE6-0042"):');
        if (!ref) return;
        body.post_mortem_ref = ref;
      } else if (action === 'close-post-mortem') {
        const findings = window.prompt('Post-mortem findings (root cause + corrective action):');
        if (!findings) return;
        body.post_mortem_findings = findings;
        const reason = window.prompt('Reason code (eg "GRID_RECOVERED", "DEMAND_RESTORED"):');
        if (reason) body.reason_code = reason;
        const rod = window.prompt('Record-of-decision notes (optional):');
        if (rod) body.rod_notes = rod;
      } else if (action === 'close') {
        const reason = window.prompt('Reason code (eg "MINOR_EVENT_NO_PM"):');
        if (reason) body.reason_code = reason;
        const rod = window.prompt('Close notes (optional):');
        if (rod) body.rod_notes = rod;
      } else if (action === 'refuse') {
        const grounds = window.prompt('Refusal grounds (§C-3 — customer rationale):');
        if (!grounds) return;
        body.refusal_grounds = grounds;
        const ref = window.prompt('Refusal reference (eg "REFUSE-MOTOTOLO-2026-0001"):');
        if (ref) body.refusal_ref = ref;
        const tribunal = window.prompt('Tribunal case reference (if escalated, optional):');
        if (tribunal) body.tribunal_case_ref = tribunal;
        const pen = window.prompt('Penalty (ZAR, optional):');
        if (pen) body.penalty_zar = Number(pen);
        const pbasis = window.prompt('Penalty basis (optional):');
        if (pbasis) body.penalty_basis = pbasis;
        const reason = window.prompt('Reason code (eg "SAFETY_CRITICAL_PROCESS"):');
        if (reason) body.reason_code = reason;
      } else if (action === 'withdraw') {
        const basis = window.prompt('Withdrawal basis (SO rationale — eg "grid recovered before action"):');
        if (!basis) return;
        body.withdrawal_basis = basis;
        const ref = window.prompt('Withdrawal reference (optional):');
        if (ref) body.withdrawal_ref = ref;
        const reason = window.prompt('Reason code (eg "GRID_STABILISED"):');
        if (reason) body.reason_code = reason;
      }
      await api.post(`/load-curtailment/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Load Curtailment / Emergency Load Reduction — NERSA Grid Code §CSC-1</h2>
          <p className="text-xs text-[#4a5568]">
            11-state P6 lifecycle for every System Operator load-curtailment
            instruction issued during a Stage 1-8 load-shedding event: issued →
            acknowledged → curtailing → target achieved → lifted → reconciled →
            post-mortem → closed (with refused / partial / withdrawn branches).
            URGENT SLA — higher load-shedding stage gets the TIGHTER deadline
            (stage 7-8 acknowledge in 5 minutes; stage 1-2 in 60). NERSA Grid
            Code crossings: refused for ALL stages (§C-3 mandatory); partial for
            stage 3-4+; target achieved + post-mortem close + SLA breach for
            stage 5-6+ (national threshold). Split-write: SO issues / lifts /
            reconciles / runs post-mortem; the curtailed customer acknowledges,
            starts, reports outcome, or refuses.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"         value={kpis.total} />
        <Kpi label="Open"          value={kpis.open_count}     tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Critical open" value={kpis.critical_open}  tone={kpis.critical_open > 0 ? 'bad' : 'ok'} />
        <Kpi label="High open"     value={kpis.high_open}      tone={kpis.high_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Closed"        value={kpis.closed_count} />
        <Kpi label="Refused"       value={kpis.refused_count}  tone={kpis.refused_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Partial"       value={kpis.partial_count}  tone={kpis.partial_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached"  value={kpis.breached}       tone={kpis.breached > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Reportable: <span className="font-semibold text-[#9b1f1f]">{kpis.reportable_total}</span></span>
        <span>Target MW: <span className="font-semibold text-[#0c2a4d]">{fmtMw(kpis.total_target_mw)}</span></span>
        <span>Actual MW: <span className="font-semibold text-[#1f5b3a]">{fmtMw(kpis.total_actual_mw)}</span></span>
        <span>Penalties: <span className="font-semibold text-[#a03b00]">{fmtZar(kpis.total_penalty_zar)}</span></span>
        <span>Withdrawn: <span className="font-semibold text-[#555]">{kpis.withdrawn_count}</span></span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#c2873a] text-white'
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
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Case #</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Customer / Facility</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Category</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>Stage</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Target / Actual</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>Var</th>
                <th className="px-3 py-2 font-semibold" style={{ color: 'oklch(0.46 0.16 55)' }}>State</th>
                <th className="px-3 py-2 font-semibold text-right" style={{ color: 'oklch(0.46 0.16 55)' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const cat = CATEGORY_TONE[r.customer_category];
                const st = STAGE_TONE[r.load_shed_stage];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2 max-w-[260px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
                      <div className="font-medium truncate" title={r.customer_party_name}>{r.customer_party_name}</div>
                      <div className="text-[10px] text-[#6b7685] truncate" title={r.facility_name ?? ''}>{r.facility_name ?? '—'}{r.facility_province ? ` · ${r.facility_province}` : ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cat.bg, color: cat.fg }}>
                        {cat.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: st.bg, color: st.fg }}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">
                      <div>{fmtMw(r.target_mw)}</div>
                      <div className="text-[10px] text-[#1f5b3a]">{r.actual_shed_mw != null ? fmtMw(r.actual_shed_mw) : '—'}</div>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.variance_pct != null && r.variance_pct < 0 ? 'text-red-700' : 'text-[#4a5568]'}`}>
                      {fmtPct(r.variance_pct)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No load-curtailment cases match.</td></tr>
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
  row: CurtailmentRow;
  events: CurtailmentEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: CurtailmentRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canRefuse = REFUSABLE.includes(row.chain_status);
  const canPartial = PARTIAL_WINDOW.includes(row.chain_status);
  const canWithdraw = WITHDRAWABLE.includes(row.chain_status);
  const canSkipPm = SKIP_PM.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.case_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">
                {row.customer_party_name}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {STAGE_TONE[row.load_shed_stage].label} · {CATEGORY_TONE[row.customer_category].label} · {row.facility_name ?? '—'}
                {row.facility_province ? ` · ${row.facility_province}` : ''}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="System operator"      value={row.so_party_name} />
            <Pair label="Customer"             value={row.customer_party_name} />
            <Pair label="Category"             value={CATEGORY_TONE[row.customer_category].label} />
            <Pair label="Load-shed stage"      value={STAGE_TONE[row.load_shed_stage].label} />
            <Pair label="National shed"        value={`${row.national_shed_gw} GW`} />
            <Pair label="Target shed"          value={fmtMw(row.target_mw)} />
            <Pair label="Actual shed"          value={fmtMw(row.actual_shed_mw)} />
            <Pair label="Variance"             value={fmtPct(row.variance_pct)} />
            <Pair label="Duration"             value={`${row.duration_hours} h`} />
            <Pair label="Grid Code section"    value={row.grid_code_section} />
            <Pair label="Instruction ref"      value={row.instruction_ref ?? '—'} />
            <Pair label="Acknowledgement ref"  value={row.acknowledgement_ref ?? '—'} />
            <Pair label="Metering recon ref"   value={row.metering_reconcile_ref ?? '—'} />
            <Pair label="Post-mortem ref"      value={row.post_mortem_ref ?? '—'} />
            <Pair label="Penalty"              value={fmtZar(row.penalty_zar)} />
            <Pair label="Penalty basis"        value={row.penalty_basis ?? '—'} />
            <Pair label="Tribunal case ref"    value={row.tribunal_case_ref ?? '—'} />
            <Pair label="Source wave"          value={row.source_wave ?? '—'} />
            <Pair label="Source event"         value={row.source_event ?? '—'} />
            <Pair label="Source entity"        value={`${row.source_entity_type ?? '—'} / ${row.source_entity_id ?? '—'}`} />
            <Pair label="Reason code"          value={row.reason_code ?? '—'} />
            <Pair label="State"                value={STATE_TONE[row.chain_status].label} />
            <Pair label="Escalation level"     value={String(row.escalation_level)} />
            <Pair label="SLA deadline"         value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"           value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Issued"               value={fmtDate(row.instruction_issued_at)} />
            <Pair label="Acknowledged"         value={fmtDate(row.acknowledged_at)} />
            <Pair label="Curtailment started"  value={fmtDate(row.curtailment_started_at)} />
            <Pair label="Lifted"               value={fmtDate(row.instruction_lifted_at)} />
            <Pair label="Reconciled"           value={fmtDate(row.reconciled_at)} />
            <Pair label="Closed"               value={fmtDate(row.closed_at)} />
          </div>
          {row.partial_basis && (
            <div className="mt-3 rounded border border-[#f0d0a0] bg-[#fff8ee] px-3 py-2 text-[12px] text-[#8a3b00]">
              <div className="text-[10px] uppercase tracking-wider text-[#a06200] mb-1">Partial-compliance basis</div>
              {row.partial_basis}
            </div>
          )}
          {row.refusal_grounds && (
            <div className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1">Refusal grounds (§C-3)</div>
              {row.refusal_grounds}
            </div>
          )}
          {row.withdrawal_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Withdrawal basis</div>
              {row.withdrawal_basis}
            </div>
          )}
          {row.post_mortem_findings && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Post-mortem findings</div>
              {row.post_mortem_findings}
            </div>
          )}
          {row.rod_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Record-of-decision notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {(nextAction || canRefuse || canPartial || canWithdraw || canSkipPm) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#c2873a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#c2873a]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canPartial && (
                <button type="button"
                  onClick={() => onAct('report-partial', row)}
                  className="rounded border border-[#f0c890] bg-white px-3 py-1.5 text-[12px] font-medium text-[#8a3b00] hover:bg-[#fff8ee]"
                >
                  {ACTION_LABEL['report-partial']}
                </button>
              )}
              {canSkipPm && (
                <button type="button"
                  onClick={() => onAct('close', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f5b3a] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['close']}
                </button>
              )}
              {canRefuse && (
                <button type="button"
                  onClick={() => onAct('refuse', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['refuse']}
                </button>
              )}
              {canWithdraw && (
                <button type="button"
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#557] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['withdraw']}
                </button>
              )}
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
                  {(e.from_status || e.to_status) && (
                    <div className="text-[#4a5568]">
                      {e.from_status ?? '—'} → {e.to_status ?? '—'}{e.actor_party ? ` · by ${e.actor_party}` : ''}
                    </div>
                  )}
                  {e.notes && <div className="mt-1" style={{ color: 'oklch(0.46 0.16 55)' }}>{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
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

export default LoadCurtailmentChainTab;
