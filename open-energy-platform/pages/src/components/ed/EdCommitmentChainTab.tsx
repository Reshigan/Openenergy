// Wave 27 — REIPPPP Economic Development commitment monitoring chain.
//
// 9-state lifecycle for the 7 contractual ED commitments every REIPPPP-awarded
// project carries to IPPO/DMRE/DTI. Surfaced as a P6 audit chain on the IPP
// workstation (the IPP team owns cure-plan submission) and Regulator inbox.
//
//   • KPI strip: total / variance open / cure required / cure executing /
//     penalty open / escalated / breached / penalty total ZAR
//   • Filter pills by commitment type + chain state + reportable
//   • Listing with tier pill + variance % + SLA countdown
//   • Drill-down: timeline + per-state action button (13 transitions)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'baseline_locked' | 'monitoring' | 'variance_flagged'
  | 'cure_plan_required' | 'cure_plan_submitted' | 'cure_executing'
  | 'verified_compliant' | 'closed'
  | 'penalty_issued' | 'escalated' | 'false_alarm';

type Tier =
  | 'ownership' | 'local_content'
  | 'jobs' | 'skills'
  | 'enterprise_dev' | 'socio_economic' | 'community_trust';

interface EdRow {
  id: string;
  case_number: string;
  project_id: string;
  project_name: string;
  bid_window: string;
  commitment_type: Tier;
  commitment_label: string;
  baseline_value: number;
  baseline_unit: string;
  reporting_period: string;
  current_value: number | null;
  variance_pct: number | null;
  variance_threshold_pct: number;
  cure_plan_summary: string | null;
  cure_plan_filed_at: string | null;
  cure_plan_approved_at: string | null;
  remediation_summary: string | null;
  linked_wo_id: string | null;
  penalty_amount_zar: number | null;
  penalty_ref: string | null;
  regulator_authority: string | null;
  regulator_ref: string | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  closure_notes: string | null;
  baseline_locked_at: string;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  is_high_scoring?: boolean;
  is_reportable?: boolean;
  created_by: string;
  created_at: string;
}

interface EdEvent {
  id: string;
  commitment_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  baseline_locked:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Baseline locked' },
  monitoring:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Monitoring' },
  variance_flagged:    { bg: '#fff4d6', fg: '#a06200', label: 'Variance flagged' },
  cure_plan_required:  { bg: '#ffe4b5', fg: '#8a4a00', label: 'Cure plan required' },
  cure_plan_submitted: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Cure plan submitted' },
  cure_executing:      { bg: '#ffe4b5', fg: '#8a4a00', label: 'Cure executing' },
  verified_compliant:  { bg: '#daf5e2', fg: '#1f6b3a', label: 'Verified compliant' },
  penalty_issued:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Penalty issued' },
  escalated:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Escalated to DTI' },
  closed:              { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  false_alarm:         { bg: '#e3e7ec', fg: '#557',    label: 'False alarm' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  ownership:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'Ownership' },
  local_content:   { bg: '#fde0e0', fg: '#9b1f1f', label: 'Local content' },
  jobs:            { bg: '#ffe4b5', fg: '#8a4a00', label: 'Jobs' },
  skills:          { bg: '#ffe4b5', fg: '#8a4a00', label: 'Skills' },
  enterprise_dev:  { bg: '#fff4d6', fg: '#a06200', label: 'Enterprise dev' },
  socio_economic:  { bg: '#fff4d6', fg: '#a06200', label: 'Socio-economic' },
  community_trust: { bg: '#fff4d6', fg: '#a06200', label: 'Community trust' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'reportable',          label: 'High-scoring' },
  { key: 'ownership',           label: 'Ownership' },
  { key: 'local_content',       label: 'Local content' },
  { key: 'jobs',                label: 'Jobs' },
  { key: 'skills',              label: 'Skills' },
  { key: 'enterprise_dev',      label: 'Enterprise dev' },
  { key: 'socio_economic',      label: 'Socio-econ' },
  { key: 'community_trust',     label: 'Community trust' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'escalated',           label: 'Escalated' },
  { key: 'baseline_locked',     label: 'Baseline locked' },
  { key: 'monitoring',          label: 'Monitoring' },
  { key: 'variance_flagged',    label: 'Variance flagged' },
  { key: 'cure_plan_required',  label: 'Cure required' },
  { key: 'cure_plan_submitted', label: 'Cure submitted' },
  { key: 'cure_executing',      label: 'Cure executing' },
  { key: 'verified_compliant',  label: 'Verified' },
  { key: 'penalty_issued',      label: 'Penalty issued' },
  { key: 'closed',              label: 'Closed' },
];

type ActionKind =
  | 'activate-monitoring' | 'detect-variance' | 'require-cure-plan'
  | 'submit-cure-plan' | 'approve-cure-plan' | 'verify-compliance' | 'close-compliant'
  | 'issue-penalty' | 'close-with-penalty'
  | 'escalate' | 'close-escalated'
  | 'mark-false-alarm' | 'close-false-alarm';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  baseline_locked:     'activate-monitoring',
  monitoring:          'detect-variance',
  variance_flagged:    'require-cure-plan',
  cure_plan_required:  'submit-cure-plan',
  cure_plan_submitted: 'approve-cure-plan',
  cure_executing:      'verify-compliance',
  verified_compliant:  'close-compliant',
  penalty_issued:      'close-with-penalty',
  escalated:           'close-escalated',
  false_alarm:         'close-false-alarm',
  closed:              null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'activate-monitoring': 'Activate monitoring',
  'detect-variance':     'Flag variance',
  'require-cure-plan':   'Require cure plan (IPPO)',
  'submit-cure-plan':    'Submit cure plan',
  'approve-cure-plan':   'Approve + begin cure',
  'verify-compliance':   'Verify compliance',
  'close-compliant':     'Close compliant',
  'issue-penalty':       'Issue DMRE penalty',
  'close-with-penalty':  'Close with penalty',
  'escalate':            'Escalate to DTI',
  'close-escalated':     'Close escalated',
  'mark-false-alarm':    'Mark false alarm',
  'close-false-alarm':   'Close false alarm',
};

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

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-ZA');
}

function fmtVariance(v: number | null): string {
  if (v === null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtBaseline(value: number, unit: string): string {
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'fte')     return `${Math.round(value)} FTE`;
  if (unit === 'zar')     return `R${value.toLocaleString('en-ZA')}`;
  return `${value.toLocaleString('en-ZA')} ${unit}`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000)     return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toLocaleString('en-ZA')}`;
}

export function EdCommitmentChainTab() {
  const [rows, setRows] = useState<EdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<EdRow | null>(null);
  const [events, setEvents] = useState<EdEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: EdRow[] } }>('/ed/commitment-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load ED commitments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: EdRow; events: EdEvent[] } }>(`/ed/commitment-chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load ED commitment history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'reportable') return r.is_high_scoring;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'escalated')  return r.chain_status === 'escalated' || r.escalation_level > 0;
      if (['ownership','local_content','jobs','skills','enterprise_dev','socio_economic','community_trust'].includes(filter)) {
        return r.commitment_type === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let variance_open = 0, cure_required = 0, cure_executing = 0;
    let penalty_open = 0, escalated = 0, breached = 0;
    let penalty_total_zar = 0;
    for (const r of rows) {
      if (r.chain_status === 'variance_flagged') variance_open++;
      if (r.chain_status === 'cure_plan_required' || r.chain_status === 'cure_plan_submitted') cure_required++;
      if (r.chain_status === 'cure_executing') cure_executing++;
      if (r.chain_status === 'penalty_issued') penalty_open++;
      if (r.chain_status === 'escalated' || r.escalation_level > 0) escalated++;
      if (r.sla_breached) breached++;
      penalty_total_zar += r.penalty_amount_zar || 0;
    }
    return { total: rows.length, variance_open, cure_required, cure_executing, penalty_open, escalated, breached, penalty_total_zar };
  }, [rows]);

  const act = useCallback(async (action: ActionKind, row: EdRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'detect-variance') {
        const cv = window.prompt(`Current ${row.commitment_label} value (baseline ${fmtBaseline(row.baseline_value, row.baseline_unit)}):`);
        if (!cv) return;
        body.current_value = Number(cv);
        const vp = window.prompt('Variance % vs baseline (negative = under):');
        if (vp) body.variance_pct = Number(vp);
      } else if (action === 'require-cure-plan') {
        const defaultAuth = row.commitment_type === 'ownership' || row.commitment_type === 'local_content'
          ? 'IPPO;DMRE' : 'IPPO';
        const auth = window.prompt('Regulator authority (IPPO / IPPO;DMRE / IPPO;DTI):', defaultAuth);
        if (auth) body.regulator_authority = auth;
        const ref = window.prompt('IPPO cure-plan notice reference (e.g. IPPO-ED-2026-0142):');
        if (ref) body.regulator_ref = ref;
      } else if (action === 'submit-cure-plan') {
        const summary = window.prompt('Cure plan summary (key actions, milestones, ZAR commitment):');
        if (!summary) return;
        body.cure_plan_summary = summary;
      } else if (action === 'approve-cure-plan') {
        const wo = window.prompt('Linked work order ID (optional):');
        if (wo) body.linked_wo_id = wo;
      } else if (action === 'verify-compliance') {
        const summary = window.prompt('Remediation summary (what was achieved):');
        if (summary) body.remediation_summary = summary;
        const cv = window.prompt('Verified current value:');
        if (cv) body.current_value = Number(cv);
        const vp = window.prompt('Verified variance %:');
        if (vp) body.variance_pct = Number(vp);
      } else if (action === 'issue-penalty') {
        const amt = window.prompt('Penalty amount (ZAR):');
        if (!amt) return;
        body.penalty_amount_zar = Number(amt);
        const ref = window.prompt('DMRE penalty reference (e.g. DMRE-PEN-2026-0014):');
        if (ref) body.penalty_ref = ref;
        const auth = window.prompt('Regulator authority (DMRE / IPPO;DMRE):', 'DMRE');
        if (auth) body.regulator_authority = auth;
      } else if (action === 'mark-false-alarm') {
        const reason = window.prompt('False-alarm reason (e.g. stale-data reconciliation):');
        if (!reason) return;
        body.closure_notes = reason;
      } else if (action === 'close-compliant' || action === 'close-with-penalty' || action === 'close-escalated' || action === 'close-false-alarm') {
        const notes = window.prompt('Closure notes:');
        if (notes) body.closure_notes = notes;
      }
      await api.post(`/ed/commitment-chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">REIPPPP Economic Development commitment chain</h2>
          <p className="text-xs text-[#4a5568]">
            7 contractual ED commitments (ownership · local content · jobs · skills · enterprise dev · SED · community trust)
            tracked baseline → quarterly monitoring → variance → IPPO cure plan → cure execution → verification → close.
            Ownership/local-content 14d variance window, IPPO 30d cure plan, DMRE penalty + DTI Codes Council escalation
            on persistent under-performance. High-scoring + jobs/skills breaches cross to regulator inbox.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"            value={kpis.total} />
        <Kpi label="Variance open"    value={kpis.variance_open}   tone={kpis.variance_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Cure required"    value={kpis.cure_required}   tone={kpis.cure_required > 0 ? 'warn' : 'ok'} />
        <Kpi label="Cure executing"   value={kpis.cure_executing}  tone={kpis.cure_executing > 0 ? 'warn' : 'ok'} />
        <Kpi label="Penalty open"     value={kpis.penalty_open}    tone={kpis.penalty_open > 0 ? 'bad' : 'ok'} />
        <Kpi label="Escalated"        value={kpis.escalated}       tone={kpis.escalated > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached"     value={kpis.breached}        tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Penalty total"    value={fmtZar(kpis.penalty_total_zar)} tone={kpis.penalty_total_zar > 0 ? 'bad' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Case #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">BW</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Commitment</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Baseline</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Variance</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Period</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Reg ref</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.commitment_type];
                const vNeg = r.variance_pct !== null && r.variance_pct < 0;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2 text-[#1a3a5c]">{r.project_name}</td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.bid_window}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtBaseline(r.baseline_value, r.baseline_unit)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${vNeg ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {fmtVariance(r.variance_pct)}
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.reporting_period}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#4a5568]">{r.regulator_ref ?? '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#4a5568]">No ED commitments match.</td></tr>
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
  row: EdRow;
  events: EdEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: EdRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canIssuePenalty = row.chain_status === 'cure_executing';
  const canEscalate = row.chain_status === 'cure_executing' || row.chain_status === 'penalty_issued';
  const canFalseAlarm = row.chain_status === 'variance_flagged';

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
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {row.bid_window} · {TIER_TONE[row.commitment_type].label} · {row.commitment_label}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="Project"            value={row.project_id} />
            <Pair label="Bid window"         value={row.bid_window} />
            <Pair label="Reporting period"   value={row.reporting_period} />
            <Pair label="Baseline"           value={fmtBaseline(row.baseline_value, row.baseline_unit)} />
            <Pair label="Current"            value={row.current_value !== null ? fmtBaseline(row.current_value, row.baseline_unit) : '—'} />
            <Pair label="Variance"           value={fmtVariance(row.variance_pct)} />
            <Pair label="Threshold"          value={`${row.variance_threshold_pct.toFixed(1)}%`} />
            <Pair label="State"              value={STATE_TONE[row.chain_status].label} />
            <Pair label="Regulator"          value={row.regulator_authority ?? '—'} />
            <Pair label="Regulator ref"      value={row.regulator_ref ?? '—'} />
            <Pair label="Penalty"            value={fmtZar(row.penalty_amount_zar)} />
            <Pair label="Penalty ref"        value={row.penalty_ref ?? '—'} />
            <Pair label="Linked WO"          value={row.linked_wo_id ?? '—'} />
            <Pair label="Cure filed"         value={fmtDate(row.cure_plan_filed_at)} />
            <Pair label="Cure approved"      value={fmtDate(row.cure_plan_approved_at)} />
            <Pair label="Escalation"         value={String(row.escalation_level)} />
            <Pair label="SLA deadline"       value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"         value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
          </div>
          {row.cure_plan_summary && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Cure plan</div>
              {row.cure_plan_summary}
            </div>
          )}
          {row.remediation_summary && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Remediation summary</div>
              {row.remediation_summary}
            </div>
          )}
          {row.closure_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Closure notes</div>
              {row.closure_notes}
            </div>
          )}
        </section>

        {(nextAction || canIssuePenalty || canEscalate || canFalseAlarm) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canIssuePenalty && (
                <button
                  onClick={() => onAct('issue-penalty', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['issue-penalty']}
                </button>
              )}
              {canEscalate && (
                <button
                  onClick={() => onAct('escalate', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.escalate}
                </button>
              )}
              {canFalseAlarm && (
                <button
                  onClick={() => onAct('mark-false-alarm', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['mark-false-alarm']}
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
                    <div className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</div>
                  )}
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

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}

export default EdCommitmentChainTab;
