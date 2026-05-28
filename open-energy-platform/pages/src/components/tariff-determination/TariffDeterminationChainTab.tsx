// Wave 43 — Regulator Tariff / Revenue (MYPD Price-Control) Determination tab.
//
// NERSA's economic-regulation core (ERA 2006 §15–§16 + MYPD methodology + RCA).
// A licensee files a revenue application; NERSA checks completeness, runs public
// consultation, performs the revenue analysis (RAB × WACC + opex + RCA true-up),
// prepares a draft, tables it for the Energy Regulator (Council), issues the
// determination, and the tariff is implemented — or it is rejected, the
// applicant requests reconsideration, or a court sets it aside and remits it.
//
// Where W33 renewal decides WHO may operate and W40 inspection enforces licence
// conditions, this chain decides WHAT a licensee may charge. INVERTED SLA: the
// bigger the determination, the more time every window allows. Reportability:
// remit crosses for every class (court set-aside); issue_determination + reject
// + SLA breaches cross for material classes (multi_year + annual_tariff).
//
// Two-party split write: the applicant licensee files / requests reconsideration
// / withdraws; the regulator drives everything else. actor_party (applicant /
// registry / analyst / council / court) is derived from the action.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'application_received' | 'completeness_review' | 'public_consultation'
  | 'revenue_analysis' | 'draft_determination' | 'council_deliberation'
  | 'determination_issued' | 'reconsideration_requested'
  | 'implemented' | 'remitted' | 'rejected' | 'withdrawn';

type Klass = 'multi_year' | 'annual_tariff' | 'sseg_feedin';

interface DeterminationRow {
  id: string;
  determination_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  applicant_party_id: string;
  applicant_party_name: string;
  regulator_party_id: string;
  regulator_party_name: string;
  licence_ref: string | null;
  tariff_entity: string;
  tariff_segment: string | null;
  determination_class: Klass;
  mypd_period: string | null;
  price_year: string | null;
  requested_revenue_zar_m: number | null;
  allowed_revenue_zar_m: number | null;
  rab_zar_m: number | null;
  wacc_pre_tax: number | null;
  opex_zar_m: number | null;
  rca_balance_zar_m: number | null;
  requested_tariff_zar_kwh: number | null;
  allowed_tariff_zar_kwh: number | null;
  tariff_increase_pct: number | null;
  x_factor: number | null;
  application_ref: string | null;
  completeness_ref: string | null;
  consultation_ref: string | null;
  analysis_ref: string | null;
  draft_ref: string | null;
  determination_ref: string | null;
  reconsideration_ref: string | null;
  court_ref: string | null;
  gazette_ref: string | null;
  regulator_ref: string | null;
  application_basis: string | null;
  completeness_basis: string | null;
  consultation_basis: string | null;
  analysis_basis: string | null;
  draft_basis: string | null;
  determination_basis: string | null;
  reconsideration_basis: string | null;
  remit_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: ChainStatus;
  application_received_at: string;
  completeness_review_at: string | null;
  public_consultation_at: string | null;
  revenue_analysis_at: string | null;
  draft_determination_at: string | null;
  council_deliberation_at: string | null;
  determination_issued_at: string | null;
  reconsideration_requested_at: string | null;
  implemented_at: string | null;
  remitted_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  is_reportable: boolean;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  breach_crosses_regulator?: boolean;
}

interface DeterminationEvent {
  id: string;
  determination_id: string;
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
  implemented_count: number;
  remitted_count: number;
  rejected_count: number;
  withdrawn_count: number;
  reconsideration_count: number;
  breached: number;
  reportable_total: number;
  multi_year_open: number;
  total_requested_revenue: number;
  total_allowed_revenue: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  application_received:      { bg: '#e3e7ec', fg: '#557',    label: 'Application received' },
  completeness_review:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Completeness review' },
  public_consultation:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Public consultation' },
  revenue_analysis:          { bg: '#e0e7ff', fg: '#3730a3', label: 'Revenue analysis' },
  draft_determination:       { bg: '#fff4d6', fg: '#a06200', label: 'Draft determination' },
  council_deliberation:      { bg: '#ffe9d6', fg: '#8a4a00', label: 'Council deliberation' },
  determination_issued:      { bg: '#daf5e2', fg: '#1f6b3a', label: 'Determination issued' },
  reconsideration_requested: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Reconsideration requested' },
  implemented:               { bg: '#d4edda', fg: '#155724', label: 'Implemented' },
  remitted:                  { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Remitted (set aside)' },
  rejected:                  { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Rejected' },
  withdrawn:                 { bg: '#eceff3', fg: '#666',    label: 'Withdrawn' },
};

const CLASS_TONE: Record<Klass, { bg: string; fg: string; label: string }> = {
  multi_year:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Multi-year (MYPD)' },
  annual_tariff: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Annual tariff' },
  sseg_feedin:   { bg: '#e3e7ec', fg: '#557',    label: 'SSEG feed-in' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                    label: 'Active' },
  { key: 'all',                       label: 'All' },
  { key: 'multi_year',                label: 'Multi-year' },
  { key: 'annual_tariff',             label: 'Annual' },
  { key: 'sseg_feedin',               label: 'SSEG' },
  { key: 'breached',                  label: 'SLA breached' },
  { key: 'reportable',                label: 'Reportable' },
  { key: 'application_received',      label: 'Received' },
  { key: 'completeness_review',       label: 'Completeness' },
  { key: 'public_consultation',       label: 'Consultation' },
  { key: 'revenue_analysis',          label: 'Analysis' },
  { key: 'draft_determination',       label: 'Draft' },
  { key: 'council_deliberation',      label: 'Council' },
  { key: 'determination_issued',      label: 'Issued' },
  { key: 'reconsideration_requested', label: 'Reconsideration' },
  { key: 'implemented',               label: 'Implemented' },
  { key: 'remitted',                  label: 'Remitted' },
  { key: 'rejected',                  label: 'Rejected' },
  { key: 'withdrawn',                 label: 'Withdrawn' },
];

type ActionKind =
  | 'begin-review' | 'open-consultation' | 'begin-analysis' | 'prepare-draft'
  | 'table-for-council' | 'issue-determination' | 'request-reconsideration'
  | 'implement' | 'remit' | 'reject' | 'withdraw';

// Primary forward action per state.
const ACTION_FOR_STATE: Record<ChainStatus, ActionKind | null> = {
  application_received:      'begin-review',
  completeness_review:       'open-consultation',
  public_consultation:       'begin-analysis',
  revenue_analysis:          'prepare-draft',
  draft_determination:       'table-for-council',
  council_deliberation:      'issue-determination',
  determination_issued:      'implement',
  reconsideration_requested: 'implement',
  implemented:               null,
  remitted:                  null,
  rejected:                  null,
  withdrawn:                 null,
};

// Party annotation per action. The regulator drives the machinery; the applicant
// licensee requests reconsideration and withdraws; a court remits a set-aside.
const ACTION_LABEL: Record<ActionKind, string> = {
  'begin-review':            'Begin completeness review (registry)',
  'open-consultation':       'Open public consultation (registry)',
  'begin-analysis':          'Begin revenue analysis (analyst)',
  'prepare-draft':           'Prepare draft determination (analyst)',
  'table-for-council':       'Table for Council (analyst)',
  'issue-determination':     'Issue determination (council)',
  'request-reconsideration': 'Request reconsideration (applicant)',
  'implement':               'Implement tariff (registry)',
  'remit':                   'Court set-aside / remit (court)',
  'reject':                  'Reject application (council)',
  'withdraw':                'Withdraw (applicant)',
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

// Economic figures are stored in R millions; render compactly as R bn / R m.
function fmtZarM(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(2)}bn`;
  return `R${n.toFixed(0)}m`;
}

function fmtTariff(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `R${n.toFixed(4)}/kWh`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(2)}%`;
}

const TERMINAL_STATES: ChainStatus[] = ['implemented', 'remitted', 'rejected', 'withdrawn'];

export function TariffDeterminationChainTab() {
  const [rows, setRows] = useState<DeterminationRow[]>([]);
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<DeterminationRow | null>(null);
  const [events, setEvents] = useState<DeterminationEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: DeterminationRow[] } & KpiSummary }>('/tariff-determination/chain');
      setRows(res.data?.data?.items || []);
      const d = res.data?.data;
      if (d) {
        setKpis({
          total: d.total, open_count: d.open_count,
          implemented_count: d.implemented_count, remitted_count: d.remitted_count,
          rejected_count: d.rejected_count, withdrawn_count: d.withdrawn_count,
          reconsideration_count: d.reconsideration_count, breached: d.breached,
          reportable_total: d.reportable_total, multi_year_open: d.multi_year_open,
          total_requested_revenue: d.total_requested_revenue,
          total_allowed_revenue: d.total_allowed_revenue,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load tariff determination chains');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: DeterminationRow; events: DeterminationEvent[] } }>(
        `/tariff-determination/chain/${id}`
      );
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load determination history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !TERMINAL_STATES.includes(r.chain_status);
      if (filter === 'multi_year')   return r.determination_class === 'multi_year';
      if (filter === 'annual_tariff') return r.determination_class === 'annual_tariff';
      if (filter === 'sseg_feedin')  return r.determination_class === 'sseg_feedin';
      if (filter === 'breached')     return r.sla_breached;
      if (filter === 'reportable')   return r.is_reportable;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const act = useCallback(async (action: ActionKind, row: DeterminationRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'begin-review') {
        const ref = window.prompt('Completeness review reference (e.g. NERSA-COMP-2026-0042):', row.completeness_ref || '');
        const basis = window.prompt('Completeness basis — schedules / cost study being checked:') || '';
        body = { completeness_basis: basis };
        if (ref) body.completeness_ref = ref;
      } else if (action === 'open-consultation') {
        const ref = window.prompt('Consultation reference (gazette / hearing notice):', row.consultation_ref || '');
        const basis = window.prompt('Consultation basis — hearings / comment window scope:') || '';
        body = { consultation_basis: basis };
        if (ref) body.consultation_ref = ref;
      } else if (action === 'begin-analysis') {
        const ref = window.prompt('Analysis reference (e.g. NERSA-ANALYSIS-2026-0042):', row.analysis_ref || '');
        const basis = window.prompt('Analysis basis — RAB × WACC + opex + RCA true-up scope:') || '';
        const rab = window.prompt('Regulatory asset base — RAB (R millions), if known:');
        const wacc = window.prompt('Pre-tax real WACC (fraction, e.g. 0.0875), if known:');
        const opex = window.prompt('Allowed opex (R millions), if known:');
        const rca = window.prompt('RCA true-up balance (R millions), if known:');
        body = { analysis_basis: basis };
        if (ref) body.analysis_ref = ref;
        if (rab) body.rab_zar_m = Number(rab);
        if (wacc) body.wacc_pre_tax = Number(wacc);
        if (opex) body.opex_zar_m = Number(opex);
        if (rca) body.rca_balance_zar_m = Number(rca);
      } else if (action === 'prepare-draft') {
        const ref = window.prompt('Draft determination reference:', row.draft_ref || '');
        const basis = window.prompt('Draft basis — proposed allowed revenue + tariff:') || '';
        const rev = window.prompt('Proposed allowed revenue (R millions):');
        const tariff = window.prompt('Proposed average tariff (R/kWh):');
        const incr = window.prompt('Headline increase (percent), if known:');
        body = { draft_basis: basis };
        if (ref) body.draft_ref = ref;
        if (rev) body.allowed_revenue_zar_m = Number(rev);
        if (tariff) body.allowed_tariff_zar_kwh = Number(tariff);
        if (incr) body.tariff_increase_pct = Number(incr);
      } else if (action === 'table-for-council') {
        const basis = window.prompt('Determination basis — recommendation tabled for the Energy Regulator:') || '';
        body = { determination_basis: basis };
      } else if (action === 'issue-determination') {
        const ref = window.prompt('Determination document reference:', row.determination_ref || '');
        if (!ref) return;
        const gazette = window.prompt('Government Gazette notice reference (e.g. GG-49832):');
        const rev = window.prompt('Final allowed revenue (R millions):', row.allowed_revenue_zar_m != null ? String(row.allowed_revenue_zar_m) : '');
        const tariff = window.prompt('Final average tariff (R/kWh):', row.allowed_tariff_zar_kwh != null ? String(row.allowed_tariff_zar_kwh) : '');
        const incr = window.prompt('Headline determined increase (percent):', row.tariff_increase_pct != null ? String(row.tariff_increase_pct) : '');
        const basis = window.prompt('Determination basis / reasons:') || '';
        body = { determination_ref: ref, determination_basis: basis };
        if (gazette) body.gazette_ref = gazette;
        if (rev) body.allowed_revenue_zar_m = Number(rev);
        if (tariff) body.allowed_tariff_zar_kwh = Number(tariff);
        if (incr) body.tariff_increase_pct = Number(incr);
      } else if (action === 'request-reconsideration') {
        const ref = window.prompt('Reconsideration reference:');
        if (!ref) return;
        const basis = window.prompt('Grounds for reconsideration:');
        if (!basis) return;
        body = { reconsideration_ref: ref, reconsideration_basis: basis };
      } else if (action === 'implement') {
        const gazette = window.prompt('Implementation gazette reference, if any:', row.gazette_ref || '');
        const rod = window.prompt('Record-of-decision — tariff brought into force:');
        if (!rod) return;
        body = { rod_notes: rod };
        if (gazette) body.gazette_ref = gazette;
      } else if (action === 'remit') {
        const ref = window.prompt('Court / case reference (e.g. GP-HC-2023-041287):');
        if (!ref) return;
        const basis = window.prompt('Remit basis — grounds the determination was set aside:');
        if (!basis) return;
        body = { court_ref: ref, remit_basis: basis, reason_code: 'judicial_set_aside' };
      } else if (action === 'reject') {
        const reason = window.prompt('Rejection reason (e.g. application incomplete, methodology not met):');
        if (!reason) return;
        const rod = window.prompt('Record-of-decision — reasons for rejection:') || reason;
        body = { reason_code: 'application_rejected', rod_notes: rod };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason (e.g. application superseded, refiled):');
        if (!reason) return;
        body = { reason_code: 'withdrawn', rod_notes: reason };
      }
      await api.post(`/tariff-determination/chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Tariff / revenue (MYPD price-control) determination</h2>
          <p className="text-xs text-[#4a5568]">
            12-stage P6 chain · application received → completeness review → public consultation → revenue analysis
            (RAB × WACC + opex + RCA true-up) → draft determination → council deliberation → determination issued →
            implemented. The applicant may request reconsideration; a court may set aside and remit; early applications
            can be rejected or withdrawn. INVERTED SLA: the bigger the determination, the more time every window allows.
            Remit crosses to the regulator inbox for every class; issued determinations + rejections + SLA breaches cross
            for material classes (multi-year + annual). NERSA ERA §15–§16 + MYPD methodology + Regulatory Clearing Account.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="Open" value={kpis?.open_count ?? 0} />
        <Kpi label="Multi-year open" value={kpis?.multi_year_open ?? 0} tone={(kpis?.multi_year_open ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Reconsideration" value={kpis?.reconsideration_count ?? 0} tone={(kpis?.reconsideration_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Reportable" value={kpis?.reportable_total ?? 0} tone={(kpis?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Implemented" value={kpis?.implemented_count ?? 0} tone="ok" />
        <Kpi label="Remitted" value={kpis?.remitted_count ?? 0} tone={(kpis?.remitted_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rejected" value={kpis?.rejected_count ?? 0} />
        <Kpi label="Withdrawn" value={kpis?.withdrawn_count ?? 0} />
        <Kpi label="Requested rev." value={fmtZarM(kpis?.total_requested_revenue)} />
        <Kpi label="Allowed rev." value={fmtZarM(kpis?.total_allowed_revenue)} tone="ok" />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Determination #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Entity / applicant</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Class</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Period</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Allowed rev.</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Increase</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const ct = CLASS_TONE[r.determination_class];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">
                      {r.determination_number}
                      {r.is_reportable && <span className="ml-1 text-[#9b1f1f]" title="Reportable to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={`${r.tariff_entity} · ${r.applicant_party_name}`}>
                      {r.tariff_entity}
                      <span className="text-[#4a5568]"> · {r.applicant_party_name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: ct.bg, color: ct.fg }}>
                        {ct.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568]">{r.mypd_period ?? r.price_year ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZarM(r.allowed_revenue_zar_m)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtPct(r.tariff_increase_pct)}</td>
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
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[#4a5568]">No determinations match.</td></tr>
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
  row: DeterminationRow;
  events: DeterminationEvent[];
  onClose: () => void;
  onAct: (action: ActionKind, row: DeterminationRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canReject = ['completeness_review', 'revenue_analysis'].includes(row.chain_status);
  const canWithdraw = ['application_received', 'completeness_review', 'public_consultation'].includes(row.chain_status);
  const canReconsider = row.chain_status === 'determination_issued';
  const canRemit = ['determination_issued', 'reconsideration_requested'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.determination_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.tariff_entity}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {CLASS_TONE[row.determination_class].label} · applicant {row.applicant_party_name}
                {row.tariff_segment ? ` · ${row.tariff_segment}` : ''} · {row.regulator_party_name}
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
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Class"               value={CLASS_TONE[row.determination_class].label} />
            <Pair label="MYPD period"         value={row.mypd_period ?? '—'} />
            <Pair label="Price year"          value={row.price_year ?? '—'} />
            <Pair label="Segment"             value={row.tariff_segment ?? '—'} />
            <Pair label="Licence ref"         value={row.licence_ref ?? '—'} />
            <Pair label="Requested revenue"   value={fmtZarM(row.requested_revenue_zar_m)} />
            <Pair label="Allowed revenue"     value={fmtZarM(row.allowed_revenue_zar_m)} />
            <Pair label="RAB"                 value={fmtZarM(row.rab_zar_m)} />
            <Pair label="Pre-tax WACC"        value={row.wacc_pre_tax != null ? `${(row.wacc_pre_tax * 100).toFixed(2)}%` : '—'} />
            <Pair label="Allowed opex"        value={fmtZarM(row.opex_zar_m)} />
            <Pair label="RCA balance"         value={fmtZarM(row.rca_balance_zar_m)} />
            <Pair label="Requested tariff"    value={fmtTariff(row.requested_tariff_zar_kwh)} />
            <Pair label="Allowed tariff"      value={fmtTariff(row.allowed_tariff_zar_kwh)} />
            <Pair label="Increase"            value={fmtPct(row.tariff_increase_pct)} />
            <Pair label="X-factor"            value={row.x_factor != null ? row.x_factor.toFixed(3) : '—'} />
            <Pair label="Determination ref"   value={row.determination_ref ?? '—'} />
            <Pair label="Gazette ref"         value={row.gazette_ref ?? '—'} />
            <Pair label="Reconsideration ref" value={row.reconsideration_ref ?? '—'} />
            <Pair label="Court ref"           value={row.court_ref ?? '—'} />
            <Pair label="Reason code"         value={row.reason_code ?? '—'} />
            <Pair label="Received"            value={fmtDate(row.application_received_at)} />
            <Pair label="Completeness"        value={fmtDate(row.completeness_review_at)} />
            <Pair label="Consultation"        value={fmtDate(row.public_consultation_at)} />
            <Pair label="Analysis"            value={fmtDate(row.revenue_analysis_at)} />
            <Pair label="Draft"               value={fmtDate(row.draft_determination_at)} />
            <Pair label="Council"             value={fmtDate(row.council_deliberation_at)} />
            <Pair label="Issued"              value={fmtDate(row.determination_issued_at)} />
            <Pair label="Implemented"         value={fmtDate(row.implemented_at)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation lvl"      value={String(row.escalation_level)} />
            <Pair label="Reportable"          value={row.is_reportable ? 'Yes' : 'No'} />
          </div>
          {row.application_basis && (
            <BasisBlock label="Application basis" tone="#1a3a5c" text={row.application_basis} />
          )}
          {row.completeness_basis && (
            <BasisBlock label="Completeness basis" tone="#1a3a5c" text={row.completeness_basis} />
          )}
          {row.consultation_basis && (
            <BasisBlock label="Consultation basis" tone="#1a3a5c" text={row.consultation_basis} />
          )}
          {row.analysis_basis && (
            <BasisBlock label="Analysis basis" tone="#3730a3" text={row.analysis_basis} />
          )}
          {row.draft_basis && (
            <BasisBlock label="Draft basis" tone="#a06200" text={row.draft_basis} />
          )}
          {row.determination_basis && (
            <BasisBlock label="Determination basis" tone="#1f6b3a" text={row.determination_basis} />
          )}
          {row.reconsideration_basis && (
            <BasisBlock label="Reconsideration basis" tone="#9b1f1f" text={row.reconsideration_basis} />
          )}
          {row.remit_basis && (
            <BasisBlock label="Remit basis" tone="#6b1f1f" text={row.remit_basis} />
          )}
          {row.rod_notes && (
            <BasisBlock label="Record of decision" tone="#155724" text={row.rod_notes} />
          )}
        </section>

        {(nextAction || canReject || canReconsider || canRemit || canWithdraw) && (
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
              {canReconsider && (
                <button
                  onClick={() => onAct('request-reconsideration', row)}
                  className="rounded border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-700 hover:bg-amber-50"
                >
                  {ACTION_LABEL['request-reconsideration']}
                </button>
              )}
              {canRemit && (
                <button
                  onClick={() => onAct('remit', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.remit}
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => onAct('reject', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.reject}
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
