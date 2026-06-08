// Wave 32 — Offtaker Take-or-Pay Annual Reconciliation chain.
//
// 10-state lifecycle for the calendar-year roll-up of monthly PPA delivery
// shortfalls under IFRS 16 + DMRE PPA template + NERSA Section 34 disputes.
//
// INVERTED tier SLA — catastrophic (>50%) compressed (PPA termination risk),
// minor (<5%) extended (de-minimis housekeeping). Major (20-50%) anchors
// the 90-day Section 34 statutory quantum dispute window.
// Regulator crossings: settle/dispute/waive for catastrophic+major; SLA
// breach for ALL tiers (annual TOP return hard line). Split-write:
// offtaker drives, IPP submits evidence + accepts/disputes quantum.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'accrual_open' | 'year_end' | 'statement_issued'
  | 'evidence_required' | 'evidence_submitted'
  | 'quantum_proposed' | 'quantum_agreed' | 'settled'
  | 'disputed' | 'waived';

type Tier = 'catastrophic' | 'major' | 'moderate' | 'minor';

interface TopRow {
  id: string;
  case_number: string;
  ppa_contract_id: string | null;
  ppa_chain_id: string | null;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  ipp_party_id: string;
  ipp_party_name: string;
  offtaker_party_id: string;
  offtaker_party_name: string;
  reconciliation_year: number;
  contracted_mwh: number;
  delivered_mwh: number;
  credited_mwh: number;
  shortfall_mwh: number;
  shortfall_pct: number;
  severity_tier: Tier;
  top_rate_per_mwh: number;
  top_amount_proposed: number | null;
  top_amount_agreed: number | null;
  top_amount_settled: number | null;
  evidence_findings: string | null;
  evidence_ref: string | null;
  quantum_proposal_ref: string | null;
  quantum_acceptance_ref: string | null;
  settlement_ref: string | null;
  dispute_panel_ref: string | null;
  dispute_award_ref: string | null;
  waiver_basis: string | null;
  waiver_minute_ref: string | null;
  reason_code: string | null;
  nersa_top_return_ref: string | null;
  section34_filing_ref: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  accrual_opened_at: string;
  year_end_at: string | null;
  statement_issued_at: string | null;
  evidence_required_at: string | null;
  evidence_submitted_at: string | null;
  quantum_proposed_at: string | null;
  quantum_agreed_at: string | null;
  settled_at: string | null;
  disputed_at: string | null;
  waived_at: string | null;
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

interface TopEvent {
  id: string;
  top_id: string;
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
  accrual_open:       { bg: '#e3e7ec', fg: '#557',    label: 'Accrual open' },
  year_end:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Year end' },
  statement_issued:   { bg: '#fff4d6', fg: '#a06200', label: 'Statement' },
  evidence_required:  { bg: '#fbe7d0', fg: '#7a4500', label: 'Evidence req' },
  evidence_submitted: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Evidence sub' },
  quantum_proposed:   { bg: '#fff4d6', fg: '#a06200', label: 'Quantum prop' },
  quantum_agreed:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Quantum agreed' },
  settled:            { bg: '#cfe6d3', fg: '#1f5b3a', label: 'Settled' },
  disputed:           { bg: '#fcc3c3', fg: '#7a0e0e', label: 'Disputed' },
  waived:             { bg: '#dbcffb', fg: '#3a1a5c', label: 'Waived' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  catastrophic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Catastrophic' },
  major:        { bg: '#fff4d6', fg: '#a06200', label: 'Major' },
  moderate:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Moderate' },
  minor:        { bg: '#daf5e2', fg: '#1f6b3a', label: 'Minor' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'reportable',         label: 'NERSA reportable' },
  { key: 'catastrophic',       label: 'Catastrophic' },
  { key: 'major',              label: 'Major' },
  { key: 'moderate',           label: 'Moderate' },
  { key: 'minor',              label: 'Minor' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'accrual_open',       label: 'Accrual open' },
  { key: 'year_end',           label: 'Year end' },
  { key: 'statement_issued',   label: 'Statement' },
  { key: 'evidence_required',  label: 'Evidence req' },
  { key: 'evidence_submitted', label: 'Evidence sub' },
  { key: 'quantum_proposed',   label: 'Quantum prop' },
  { key: 'quantum_agreed',     label: 'Quantum agreed' },
  { key: 'settled',            label: 'Settled' },
  { key: 'disputed',           label: 'Disputed' },
  { key: 'waived',             label: 'Waived' },
];

type ActionKind =
  | 'close-year' | 'issue-statement' | 'request-evidence'
  | 'submit-evidence' | 'propose-quantum' | 'accept-quantum'
  | 'settle' | 'dispute' | 'waive';

const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  accrual_open:       'close-year',
  year_end:           'issue-statement',
  statement_issued:   'request-evidence',
  evidence_required:  'submit-evidence',
  evidence_submitted: 'propose-quantum',
  quantum_proposed:   'accept-quantum',
  quantum_agreed:     'settle',
  settled:            null,
  disputed:           null,
  waived:             null,
};

const ACTION_LABEL: Record<ActionKind, string> = {
  'close-year':       'Close year for reconciliation',
  'issue-statement':  'Issue TOP statement',
  'request-evidence': 'Request FM/curtailment evidence',
  'submit-evidence':  'Submit evidence pack (IPP)',
  'propose-quantum':  'Propose quantum (R)',
  'accept-quantum':   'Accept quantum (IPP)',
  'settle':           'Settle (payment / netting)',
  'dispute':          'Dispute (Section 34 panel)',
  'waive':            'Waive (board exception)',
};

const DISPUTABLE: ChainStatus[] = ['quantum_proposed', 'quantum_agreed', 'evidence_submitted'];

const WAIVABLE: ChainStatus[] = [
  'year_end', 'statement_issued', 'evidence_required', 'evidence_submitted', 'quantum_proposed',
];

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

function fmtR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n.toFixed(0)}`;
}

function fmtMwh(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} TWh`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)} GWh`;
  return `${Math.round(n)} MWh`;
}

interface KpiSummary {
  total: number;
  open_count: number;
  settled_count: number;
  disputed_count: number;
  waived_count: number;
  breached: number;
  reportable_total: number;
  catastrophic_open: number;
  major_open: number;
  total_shortfall_mwh: number;
  total_proposed: number;
  total_agreed: number;
  total_settled: number;
}

export function TakeOrPayChainTab() {
  const [rows, setRows] = useState<TopRow[]>([]);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<TopRow | null>(null);
  const [events, setEvents] = useState<TopEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: TopRow[] } & KpiSummary }>('/take-or-pay/chain');
      const data = res.data?.data;
      setRows(data?.items || []);
      if (data) {
        setSummary({
          total: data.total ?? (data.items?.length || 0),
          open_count: data.open_count || 0,
          settled_count: data.settled_count || 0,
          disputed_count: data.disputed_count || 0,
          waived_count: data.waived_count || 0,
          breached: data.breached || 0,
          reportable_total: data.reportable_total || 0,
          catastrophic_open: data.catastrophic_open || 0,
          major_open: data.major_open || 0,
          total_shortfall_mwh: data.total_shortfall_mwh || 0,
          total_proposed: data.total_proposed || 0,
          total_agreed: data.total_agreed || 0,
          total_settled: data.total_settled || 0,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load take-or-pay chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: TopRow; events: TopEvent[] } }>(`/take-or-pay/chain/${id}`);
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
      if (filter === 'catastrophic' || filter === 'major' || filter === 'moderate' || filter === 'minor') {
        return r.severity_tier === filter;
      }
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = summary ?? {
    total: rows.length, open_count: 0, settled_count: 0, disputed_count: 0, waived_count: 0,
    breached: 0, reportable_total: 0, catastrophic_open: 0, major_open: 0,
    total_shortfall_mwh: 0, total_proposed: 0, total_agreed: 0, total_settled: 0,
  };

  const act = useCallback(async (action: ActionKind, row: TopRow) => {
    try {
      const body: Record<string, unknown> = {};
      if (action === 'submit-evidence') {
        const findings = window.prompt('Evidence findings (FM claim summary / curtailment chronology):');
        if (!findings) return;
        body.evidence_findings = findings;
        const ref = window.prompt('Evidence pack reference (eg "EVID-PACK-KOU-2025-V1"):');
        if (ref) body.evidence_ref = ref;
      } else if (action === 'propose-quantum') {
        const amt = window.prompt('Quantum proposed (ZAR, eg "165400000"):');
        if (!amt) return;
        const n = Number(amt);
        if (!Number.isFinite(n)) return;
        body.top_amount_proposed = n;
        const ref = window.prompt('Quantum proposal reference (eg "QP-KOU-2025-V1"):');
        if (ref) body.quantum_proposal_ref = ref;
      } else if (action === 'accept-quantum') {
        const amt = window.prompt('Quantum agreed (ZAR, eg "165400000"):',
          String(row.top_amount_proposed ?? ''));
        if (!amt) return;
        const n = Number(amt);
        if (!Number.isFinite(n)) return;
        body.top_amount_agreed = n;
        const ref = window.prompt('Acceptance reference (eg "QA-KOU-2025-FINAL"):');
        if (ref) body.quantum_acceptance_ref = ref;
      } else if (action === 'settle') {
        const amt = window.prompt('Amount settled (ZAR):',
          String(row.top_amount_agreed ?? row.top_amount_proposed ?? ''));
        if (!amt) return;
        const n = Number(amt);
        if (!Number.isFinite(n)) return;
        body.top_amount_settled = n;
        const ref = window.prompt('Settlement reference (eg "STL-KOU-2025-09-30"):');
        if (ref) body.settlement_ref = ref;
        const rret = window.prompt('NERSA TOP annual return reference (optional):');
        if (rret) body.nersa_top_return_ref = rret;
      } else if (action === 'dispute') {
        const panel = window.prompt('NERSA Section 34 panel reference (eg "NERSA-S34-PANEL-2026-0011"):');
        if (!panel) return;
        body.dispute_panel_ref = panel;
        const filing = window.prompt('Section 34 filing reference (eg "NERSA-S34-FILING-2026-0011"):');
        if (filing) body.section34_filing_ref = filing;
        const reason = window.prompt('Reason code (eg "FM_REJECTED", "QUANTUM_DISPUTED"):');
        if (reason) body.reason_code = reason;
        const rod = window.prompt('ROD notes (dispute rationale):');
        if (!rod) return;
        body.rod_notes = rod;
      } else if (action === 'waive') {
        const basis = window.prompt('Waiver basis (FM coverage, regulator direction, etc.):');
        if (!basis) return;
        body.waiver_basis = basis;
        const min = window.prompt('Board waiver minute reference (eg "BOARD-WAIVER-DEA-2026-002"):');
        if (min) body.waiver_minute_ref = min;
        const reason = window.prompt('Reason code (eg "NDMA_FM", "GRID_FAULT_FM"):');
        if (reason) body.reason_code = reason;
        const rod = window.prompt('ROD notes (waiver rationale):');
        if (!rod) return;
        body.rod_notes = rod;
      }
      await api.post(`/take-or-pay/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Take-or-Pay Annual Reconciliation — IFRS 16 / NERSA Section 34</h2>
          <p className="text-xs text-[#4a5568]">
            10-state lifecycle for every calendar-year roll-up of monthly PPA delivery
            shortfalls: accrual open → year end → statement issued → evidence required →
            evidence submitted → quantum proposed → quantum agreed → settled (branches:
            disputed, waived). INVERTED tier SLA — catastrophic (&gt;50%) compressed
            (PPA termination risk); major (20-50%) anchors the 90-day Section 34
            statutory window; minor (&lt;5%) extended as housekeeping. NERSA crossings:
            settle/dispute/waive for catastrophic+major; SLA breach for ALL tiers.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-8 gap-3">
        <Kpi label="Total"            value={kpis.total} />
        <Kpi label="Open"             value={kpis.open_count}        tone={kpis.open_count > 0 ? 'warn' : 'ok'} />
        <Kpi label="Settled"          value={kpis.settled_count} />
        <Kpi label="Disputed"         value={kpis.disputed_count}    tone={kpis.disputed_count > 0 ? 'bad' : 'ok'} />
        <Kpi label="Waived"           value={kpis.waived_count} />
        <Kpi label="SLA breached"     value={kpis.breached}          tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Catastrophic"     value={kpis.catastrophic_open} tone={kpis.catastrophic_open > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable"       value={kpis.reportable_total} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-[#4a5568]">
        <span>Major open: <span className="font-semibold text-[#a06200]">{kpis.major_open}</span></span>
        <span>Total shortfall: <span className="font-semibold text-[#9b1f1f]">{fmtMwh(kpis.total_shortfall_mwh)}</span></span>
        <span>Total proposed: <span className="font-semibold text-[#a06200]">{fmtR(kpis.total_proposed)}</span></span>
        <span>Total agreed: <span className="font-semibold text-[#1f5b3a]">{fmtR(kpis.total_agreed)}</span></span>
        <span>Total settled: <span className="font-semibold text-[#1f5b3a]">{fmtR(kpis.total_settled)}</span></span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Year</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">IPP / Offtaker</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Shortfall</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Proposed</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tier = TIER_TONE[r.severity_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[#0c2a4d]">{r.case_number}</td>
                    <td className="px-3 py-2 tabular-nums text-[#1a3a5c]">{r.reconciliation_year}</td>
                    <td className="px-3 py-2 text-[#1a3a5c] max-w-[260px]">
                      <div className="font-medium truncate" title={r.ipp_party_name}>{r.ipp_party_name}</div>
                      <div className="text-[10px] text-[#6b7685] truncate" title={r.offtaker_party_name}>→ {r.offtaker_party_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.fg }}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">
                      <div className="font-medium text-[#9b1f1f]">{r.shortfall_pct.toFixed(1)}%</div>
                      <div className="text-[10px]">{fmtMwh(r.shortfall_mwh)}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{fmtR(r.top_amount_proposed)}</td>
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
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No take-or-pay cases match.</td></tr>
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
  row: TopRow;
  events: TopEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: TopRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canDispute = DISPUTABLE.includes(row.chain_status);
  const canWaive = WAIVABLE.includes(row.chain_status);

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
                Y{row.reconciliation_year} — {row.ipp_party_name}
              </div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.severity_tier].label} · {row.shortfall_pct.toFixed(1)}% shortfall · → {row.offtaker_party_name}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="PPA contract"        value={row.ppa_contract_id ?? '—'} />
            <Pair label="PPA chain"           value={row.ppa_chain_id ?? '—'} />
            <Pair label="Reconciliation year" value={String(row.reconciliation_year)} />
            <Pair label="Severity tier"       value={TIER_TONE[row.severity_tier].label} />
            <Pair label="Contracted"          value={fmtMwh(row.contracted_mwh)} />
            <Pair label="Delivered"           value={fmtMwh(row.delivered_mwh)} />
            <Pair label="Credited"            value={fmtMwh(row.credited_mwh)} />
            <Pair label="Shortfall"           value={`${fmtMwh(row.shortfall_mwh)} (${row.shortfall_pct.toFixed(1)}%)`} />
            <Pair label="TOP rate"            value={`R${row.top_rate_per_mwh.toLocaleString('en-ZA')}/MWh`} />
            <Pair label="Amount proposed"     value={fmtR(row.top_amount_proposed)} />
            <Pair label="Amount agreed"       value={fmtR(row.top_amount_agreed)} />
            <Pair label="Amount settled"      value={fmtR(row.top_amount_settled)} />
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Source wave"         value={row.source_wave ?? '—'} />
            <Pair label="Source event"        value={row.source_event ?? '—'} />
            <Pair label="Source entity"       value={`${row.source_entity_type ?? '—'} / ${row.source_entity_id ?? '—'}`} />
            <Pair label="Evidence ref"        value={row.evidence_ref ?? '—'} />
            <Pair label="Quantum proposal"    value={row.quantum_proposal_ref ?? '—'} />
            <Pair label="Quantum acceptance"  value={row.quantum_acceptance_ref ?? '—'} />
            <Pair label="Settlement ref"      value={row.settlement_ref ?? '—'} />
            <Pair label="Dispute panel"       value={row.dispute_panel_ref ?? '—'} />
            <Pair label="Section 34 filing"   value={row.section34_filing_ref ?? '—'} />
            <Pair label="Waiver minute"       value={row.waiver_minute_ref ?? '—'} />
            <Pair label="NERSA TOP return"    value={row.nersa_top_return_ref ?? '—'} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Escalation level"    value={String(row.escalation_level)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Accrual opened"      value={fmtDate(row.accrual_opened_at)} />
            <Pair label="Year end"            value={fmtDate(row.year_end_at)} />
            <Pair label="Statement issued"    value={fmtDate(row.statement_issued_at)} />
            <Pair label="Settled at"          value={fmtDate(row.settled_at)} />
          </div>
          {row.evidence_findings && (
            <div className="mt-3 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Evidence findings</div>
              {row.evidence_findings}
            </div>
          )}
          {row.waiver_basis && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">Waiver basis</div>
              {row.waiver_basis}
            </div>
          )}
          {row.rod_notes && (
            <div className="mt-2 rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#1a3a5c]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568] mb-1">ROD notes</div>
              {row.rod_notes}
            </div>
          )}
        </section>

        {(nextAction || canDispute || canWaive) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button type="button"
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canDispute && (
                <button type="button"
                  onClick={() => onAct('dispute', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL['dispute']}
                </button>
              )}
              {canWaive && (
                <button type="button"
                  onClick={() => onAct('waive', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3a1a5c] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL['waive']}
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

export default TakeOrPayChainTab;
