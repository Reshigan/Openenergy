// Wave 39 — Offtaker PPA Tariff Indexation / CPI Escalation lifecycle tab.
//
// 11-state P6 chain on oe_tariff_indexation — the ANNUAL repricing backbone of
// every long-term PPA. The seller publishes the reference index, calculates the
// escalation factor, issues an indexation notice; the offtaker reviews + agrees;
// the new tariff is applied to invoicing. Disagreements route through the
// dispute → recalculate → reissue / arbitration branches.
//
// MIXED SLA — machinery windows uniform across tiers; dispute / recalculation
// windows materiality-graded (utility_scale TIGHTEST). Reportability:
//   • refer_arbitration crosses for EVERY tier (ERA §4 hard line)
//   • dispute declarations + SLA breaches cross for utility_scale + commercial
//
// Two-party split write: the offtaker reviews / agrees / disputes / refers; the
// seller (IPP) drives the publish / calculate / notice / apply machinery.
// actor_party (seller / offtaker) is derived from the action, not the JWT role.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { prompt } from '../PromptDialog';

type ChainStatus =
  | 'indexation_due' | 'index_published' | 'escalation_calculated'
  | 'notice_issued' | 'under_review' | 'tariff_agreed' | 'applied'
  | 'disputed' | 'recalculated' | 'arbitrated' | 'withdrawn';

type Tier = 'utility_scale' | 'commercial' | 'embedded';

interface TariffIdxRow {
  id: string;
  indexation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  seller_party_id: string;
  seller_party_name: string;
  offtaker_party_id: string;
  offtaker_party_name: string;
  ppa_ref: string | null;
  project_name: string;
  contract_tier: Tier;
  contract_year: number | null;
  base_tariff_zar_mwh: number | null;
  index_type: string | null;
  index_reference_period: string | null;
  index_value: number | null;
  escalation_factor: number | null;
  proposed_tariff_zar_mwh: number | null;
  agreed_tariff_zar_mwh: number | null;
  annual_contract_value_zar: number | null;
  disputed_amount_zar: number | null;
  index_ref: string | null;
  notice_ref: string | null;
  dispute_ref: string | null;
  recalc_ref: string | null;
  arbitration_ref: string | null;
  calculation_basis: string | null;
  notice_basis: string | null;
  review_basis: string | null;
  dispute_basis: string | null;
  recalc_basis: string | null;
  arbitration_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  indexation_due_at: string;
  index_published_at: string | null;
  escalation_calculated_at: string | null;
  notice_issued_at: string | null;
  under_review_at: string | null;
  tariff_agreed_at: string | null;
  applied_at: string | null;
  disputed_at: string | null;
  recalculated_at: string | null;
  arbitrated_at: string | null;
  withdrawn_at: string | null;
  dispute_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_reportable?: boolean;
  in_dispute?: boolean;
}

interface TariffIdxEvent {
  id: string;
  indexation_id: string;
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
  applied_count: number;
  active_dispute_count: number;
  arbitrated_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  utility_open: number;
  total_acv: number;
  total_disputed: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  indexation_due:        { bg: '#e3e7ec', fg: '#557',    label: 'Indexation due' },
  index_published:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Index published' },
  escalation_calculated: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Escalation calculated' },
  notice_issued:         { bg: '#fff4d6', fg: '#a06200', label: 'Notice issued' },
  under_review:          { bg: '#fff4d6', fg: '#a06200', label: 'Under review' },
  tariff_agreed:         { bg: '#daf5e2', fg: '#1f6b3a', label: 'Tariff agreed' },
  applied:               { bg: '#d4edda', fg: '#155724', label: 'Applied' },
  disputed:              { bg: '#ffe4e1', fg: '#a04040', label: 'Disputed' },
  recalculated:          { bg: '#ffe9d6', fg: '#8a4a00', label: 'Recalculated' },
  arbitrated:            { bg: '#fde0e0', fg: '#9b1f1f', label: 'Arbitrated' },
  withdrawn:             { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  utility_scale: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Utility scale' },
  commercial:    { bg: '#ffe4b5', fg: '#8a4a00', label: 'Commercial' },
  embedded:      { bg: '#e3e7ec', fg: '#557',    label: 'Embedded' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active' },
  { key: 'all',                   label: 'All' },
  { key: 'utility_scale',         label: 'Utility' },
  { key: 'commercial',            label: 'Commercial' },
  { key: 'embedded',              label: 'Embedded' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'indexation_due',        label: 'Due' },
  { key: 'index_published',       label: 'Index pub.' },
  { key: 'escalation_calculated', label: 'Calculated' },
  { key: 'notice_issued',         label: 'Notice issued' },
  { key: 'under_review',          label: 'Under review' },
  { key: 'tariff_agreed',         label: 'Agreed' },
  { key: 'applied',               label: 'Applied' },
  { key: 'disputed',              label: 'Disputed' },
  { key: 'recalculated',          label: 'Recalculated' },
  { key: 'arbitrated',            label: 'Arbitrated' },
  { key: 'withdrawn',             label: 'Withdrawn' },
];

type ActionKind =
  | 'publish-index' | 'calculate-escalation' | 'issue-notice' | 'reissue-notice'
  | 'begin-review' | 'agree-tariff' | 'apply-tariff'
  | 'raise-dispute' | 'recalculate' | 'refer-arbitration' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  indexation_due:        'publish-index',
  index_published:       'calculate-escalation',
  escalation_calculated: 'issue-notice',
  notice_issued:         'begin-review',
  under_review:          'agree-tariff',
  tariff_agreed:         'apply-tariff',
  applied:               null,
  disputed:              'recalculate',
  recalculated:          'reissue-notice',
  arbitrated:            null,
  withdrawn:             null,
};

// Party annotation per action (seller = IPP drives machinery, offtaker reviews).
const ACTION_LABEL: Record<ActionKind, string> = {
  'publish-index':        'Publish index (seller)',
  'calculate-escalation': 'Calculate escalation (seller)',
  'issue-notice':         'Issue notice (seller)',
  'reissue-notice':       'Reissue notice (seller)',
  'begin-review':         'Begin review (offtaker)',
  'agree-tariff':         'Agree tariff (offtaker)',
  'apply-tariff':         'Apply tariff (seller)',
  'raise-dispute':        'Raise dispute (offtaker)',
  'recalculate':          'Recalculate (seller)',
  'refer-arbitration':    'Refer to arbitration (offtaker)',
  'withdraw':             'Withdraw',
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

function fmtTariff(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `R${n.toFixed(2)}`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

const TERMINAL_STATES: ChainStatus[] = ['applied', 'arbitrated', 'withdrawn'];

export function TariffIndexationTab() {
  const [rows, setRows] = useState<TariffIdxRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<TariffIdxRow | null>(null);
  const [events, setEvents] = useState<TariffIdxEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: TariffIdxRow[] } & KpiSummary }>('/tariff-indexation/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count, applied_count: d.applied_count,
          active_dispute_count: d.active_dispute_count, arbitrated_count: d.arbitrated_count,
          withdrawn_count: d.withdrawn_count, breached: d.breached, reportable_total: d.reportable_total,
          utility_open: d.utility_open, total_acv: d.total_acv, total_disputed: d.total_disputed,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load tariff indexation chains');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: TariffIdxRow; events: TariffIdxEvent[] } }>(
        `/tariff-indexation/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load indexation history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'utility_scale') return r.contract_tier === 'utility_scale';
      if (filter === 'commercial') return r.contract_tier === 'commercial';
      if (filter === 'embedded')   return r.contract_tier === 'embedded';
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: TariffIdxRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'publish-index') {
        const ref = await prompt('Index reference (e.g. STATSSA-CPI-2026-03):');
        if (!ref) return;
        const type = await prompt('Index type (cpi / ppi / cpi_plus_forex):', row.index_type || 'cpi') || 'cpi';
        const period = await prompt('Index reference period (e.g. Mar 2026):') || '';
        const valStr = await prompt('Published index value (e.g. 6.30 for 6.3% CPI):');
        if (!valStr) return;
        body = { index_ref: ref, index_type: type, index_reference_period: period, index_value: Number(valStr) };
      } else if (action === 'calculate-escalation') {
        const factor = await prompt('Escalation factor (e.g. 1.063 for +6.3%):');
        if (!factor) return;
        const proposed = await prompt(`Proposed new tariff R/MWh (base was ${fmtTariff(row.base_tariff_zar_mwh)}):`);
        if (!proposed) return;
        const basis = await prompt('Calculation basis (clause + formula):') || '';
        body = { escalation_factor: Number(factor), proposed_tariff_zar_mwh: Number(proposed), calculation_basis: basis };
      } else if (action === 'issue-notice') {
        const ref = await prompt('Indexation notice reference (e.g. IDX-NOTICE-2026-014):');
        if (!ref) return;
        const acv = await prompt('Annual contract value at the proposed tariff (ZAR):');
        const basis = await prompt('Notice basis / cover note:') || '';
        body = { notice_ref: ref, notice_basis: basis };
        if (acv) body.annual_contract_value_zar = Number(acv);
      } else if (action === 'reissue-notice') {
        const ref = await prompt('Re-issued notice reference (post-recalculation):', row.notice_ref || '');
        if (!ref) return;
        const basis = await prompt('Re-issue basis (what changed):') || '';
        body = { notice_ref: ref, notice_basis: basis };
      } else if (action === 'begin-review') {
        const basis = await prompt('Review basis — what the offtaker is verifying:') || '';
        body = { review_basis: basis };
      } else if (action === 'agree-tariff') {
        const agreed = await prompt(`Agreed tariff R/MWh (proposed was ${fmtTariff(row.proposed_tariff_zar_mwh)} — blank accepts proposed):`);
        const reason = await prompt('Reason code (e.g. accepted_as_proposed / negotiated):') || '';
        body = { reason_code: reason };
        if (agreed) body.agreed_tariff_zar_mwh = Number(agreed);
      } else if (action === 'apply-tariff') {
        const rod = await prompt('Record-of-decision notes (effective date, invoicing reference):') || '';
        body = { rod_notes: rod, reason_code: 'applied_to_invoicing' };
      } else if (action === 'raise-dispute') {
        const ref = await prompt('Dispute reference (e.g. IDX-DISPUTE-2026-007):');
        if (!ref) return;
        const basis = await prompt('Dispute basis — clause / index source / formula challenged:');
        if (!basis) return;
        const amount = await prompt('Disputed amount (ZAR), if quantifiable:');
        body = { dispute_ref: ref, dispute_basis: basis, reason_code: 'tariff_disputed' };
        if (amount) body.disputed_amount_zar = Number(amount);
      } else if (action === 'recalculate') {
        const ref = await prompt('Recalculation reference:');
        if (!ref) return;
        const factor = await prompt('Revised escalation factor:', String(row.escalation_factor ?? ''));
        const proposed = await prompt('Revised proposed tariff R/MWh:', String(row.proposed_tariff_zar_mwh ?? ''));
        const basis = await prompt('Recalculation basis:') || '';
        body = { recalc_ref: ref, recalc_basis: basis };
        if (factor) body.escalation_factor = Number(factor);
        if (proposed) body.proposed_tariff_zar_mwh = Number(proposed);
      } else if (action === 'refer-arbitration') {
        const ref = await prompt('Arbitration reference (e.g. NERSA-TARIFF-ARB-2026-0003):');
        if (!ref) return;
        const basis = await prompt('Arbitration basis / forum:') || '';
        body = { arbitration_ref: ref, arbitration_basis: basis, reason_code: 'referred_to_arbitration' };
      } else if (action === 'withdraw') {
        const reason = await prompt('Withdrawal reason (e.g. superseded, contract terminated):');
        if (!reason) return;
        body = { reason_code: 'withdrawn', rod_notes: reason };
      }
      await api.post(`/tariff-indexation/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Offtaker PPA tariff indexation / CPI escalation</h2>
          <p className="text-xs text-[#4a5568]">
            11-stage P6 chain · indexation due → index published → escalation calculated → notice issued → under review →
            tariff agreed → applied. Disputes branch through recalculation, notice re-issue, and arbitration. The seller (IPP)
            drives the machinery; the offtaker reviews, agrees, disputes and refers. MIXED SLA: machinery windows uniform,
            dispute windows materiality-graded (utility scale tightest). Arbitration crosses to the regulator inbox for every
            tier; disputes + SLA breaches cross for utility-scale + commercial (NERSA ERA §4 tariff oversight).
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Utility open" value={kpis?.utility_open ?? 0} tone={(kpis?.utility_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="In dispute" value={kpis?.active_dispute_count ?? 0} tone={(kpis?.active_dispute_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Applied" value={kpis?.applied_count ?? 0} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Arbitrated" value={kpis?.arbitrated_count ?? 0} tone={(kpis?.arbitrated_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Annual value" value={fmtZar(kpis?.total_acv)} />
        <Kpi label="Disputed" value={fmtZar(kpis?.total_disputed)} tone={(kpis?.total_disputed ?? 0) > 0 ? 'bad' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Indexation #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / offtaker</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Yr</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Base → proposed</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.contract_tier];
                const shown = r.agreed_tariff_zar_mwh ?? r.proposed_tariff_zar_mwh;
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.indexation_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.project_name} · ${r.offtaker_party_name}`}>
                      {r.project_name}
                      <span className="text-[#4a5568]"> · {r.offtaker_party_name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{r.contract_year ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">
                      {fmtTariff(r.base_tariff_zar_mwh)} → {fmtTariff(shown)}
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
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No indexations match.</td></tr>
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
  row: TariffIdxRow;
  events: TariffIdxEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: TariffIdxRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canDispute = ['notice_issued', 'under_review'].includes(row.chain_status);
  const canArbitrate = ['disputed', 'recalculated'].includes(row.chain_status);
  const canWithdraw = !TERMINAL_STATES.includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.indexation_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.contract_tier].label} · {row.offtaker_party_name}
                {row.contract_year ? ` · contract yr ${row.contract_year}` : ''} · seller {row.seller_party_name}
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

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"            value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"             value={TIER_TONE[row.contract_tier].label} />
            <Pair label="PPA ref"          value={row.ppa_ref ?? '—'} />
            <Pair label="Contract year"    value={row.contract_year != null ? String(row.contract_year) : '—'} />
            <Pair label="Base tariff"      value={`${fmtTariff(row.base_tariff_zar_mwh)}/MWh`} />
            <Pair label="Index type"       value={row.index_type ?? '—'} />
            <Pair label="Index period"     value={row.index_reference_period ?? '—'} />
            <Pair label="Index value"      value={row.index_value != null ? `${row.index_value}` : '—'} />
            <Pair label="Escalation"       value={row.escalation_factor != null ? `×${row.escalation_factor}` : '—'} />
            <Pair label="Proposed tariff"  value={`${fmtTariff(row.proposed_tariff_zar_mwh)}/MWh`} />
            <Pair label="Agreed tariff"    value={`${fmtTariff(row.agreed_tariff_zar_mwh)}/MWh`} />
            <Pair label="Annual value"     value={fmtZar(row.annual_contract_value_zar)} />
            <Pair label="Disputed amount"  value={fmtZar(row.disputed_amount_zar)} />
            <Pair label="Dispute round"    value={String(row.dispute_round)} />
            <Pair label="Index ref"        value={row.index_ref ?? '—'} />
            <Pair label="Notice ref"       value={row.notice_ref ?? '—'} />
            <Pair label="Dispute ref"      value={row.dispute_ref ?? '—'} />
            <Pair label="Recalc ref"       value={row.recalc_ref ?? '—'} />
            <Pair label="Arbitration ref"  value={row.arbitration_ref ?? '—'} />
            <Pair label="Reason code"      value={row.reason_code ?? '—'} />
            <Pair label="Due"              value={fmtDate(row.indexation_due_at)} />
            <Pair label="Index published"  value={fmtDate(row.index_published_at)} />
            <Pair label="Escalation calc." value={fmtDate(row.escalation_calculated_at)} />
            <Pair label="Notice issued"    value={fmtDate(row.notice_issued_at)} />
            <Pair label="Under review"     value={fmtDate(row.under_review_at)} />
            <Pair label="Tariff agreed"    value={fmtDate(row.tariff_agreed_at)} />
            <Pair label="Applied"          value={fmtDate(row.applied_at)} />
            <Pair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"       value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"   value={String(row.escalation_level)} />
            <Pair label="Reportable"       value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.calculation_basis && (
            <BasisBlock label="Calculation basis" tone="#1a3a5c" text={row.calculation_basis} />
          )}
          {row.notice_basis && (
            <BasisBlock label="Notice basis" tone="#1a3a5c" text={row.notice_basis} />
          )}
          {row.review_basis && (
            <BasisBlock label="Review basis" tone="#1a3a5c" text={row.review_basis} />
          )}
          {row.dispute_basis && (
            <BasisBlock label="Dispute basis" tone="#a04040" text={row.dispute_basis} />
          )}
          {row.recalc_basis && (
            <BasisBlock label="Recalculation basis" tone="#8a4a00" text={row.recalc_basis} />
          )}
          {row.arbitration_basis && (
            <BasisBlock label="Arbitration basis" tone="#9b1f1f" text={row.arbitration_basis} />
          )}
          {row.rod_notes && (
            <BasisBlock label="Record of decision" tone="#155724" text={row.rod_notes} />
          )}
        </section>

        {(nextAction || canDispute || canArbitrate || canWithdraw) && (
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
              {canDispute && (
                <button
                  onClick={() => onAct('raise-dispute', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['raise-dispute']}
                </button>
              )}
              {canArbitrate && (
                <button
                  onClick={() => onAct('refer-arbitration', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['refer-arbitration']}
                </button>
              )}
              {canWithdraw && (
                <button
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b1f1f] hover:bg-[#f3e0e0]"
                >
                  {ACTION_LABEL.withdraw}
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
