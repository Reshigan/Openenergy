// Wave 225 — Carbon Scope 3 Value Chain Emission Calculation & Third-Party
// Assurance lifecycle tab. TCFD + ISSB IFRS S2 + GHG Protocol Scope 3 + CDP.
//
// Distinct from the ESG disclosure chain (which carries a single Scope 3 total
// as one field of a broad ESG filing): THIS chain is the dedicated 15-category
// value-chain calculation plus the third-party assurance state machine.
//
//   scope3_initiated → category_boundaries_set → data_collection_open →
//     data_collection_complete → emission_calculations → calculations_reviewed →
//     [submit_for_assurance → limited/reasonable_assurance_complete →] disclosure_filed.
//   A reviewed disclosure may file directly (no assurance). Assurance may return a
//   qualified opinion (material error; terminal). Any pre-collection disclosure may
//   be withdrawn. INVERTED SLA: a wider Scope 3 boundary earns more data-collection
//   time (micro 21d → full_chain 60d). qualified opinions always cross to the
//   regulator inbox; large-scope filings cross the CDP/JSE mandatory threshold.
//
// Carbon-fund desk write (admin / carbon_fund / support). Action inputs use the
// same window.prompt convention as the sibling carbon chain tabs.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'scope3_initiated' | 'category_boundaries_set' | 'data_collection_open'
  | 'data_collection_complete' | 'emission_calculations' | 'calculations_reviewed'
  | 'assurance_submitted' | 'limited_assurance_complete' | 'reasonable_assurance_complete'
  | 'disclosure_filed' | 'assurance_qualified' | 'withdrawn';

type Action =
  | 'set_categories' | 'open_data_collection' | 'close_data_collection'
  | 'run_calculations' | 'complete_internal_review' | 'submit_for_assurance'
  | 'issue_limited_assurance' | 'issue_reasonable_assurance' | 'file_disclosure'
  | 'qualify_assurance' | 'withdraw';

type Tier = 'micro' | 'standard' | 'comprehensive' | 'full_chain';

interface S3Row {
  id: string;
  participant_id: string;
  s3_tier: Tier;
  reporting_year: number;
  entity_name: string | null;
  reporting_framework: string | null;
  category_count: number | null;
  category_list: string | null;
  primary_data_coverage_pct: number | null;
  spend_based_pct: number | null;
  supplier_responses: number | null;
  scope3_total_tco2e: number | null;
  cat1_purchased_goods_tco2e: number | null;
  cat3_fuel_energy_tco2e: number | null;
  cat11_use_of_products_tco2e: number | null;
  cat12_eol_treatment_tco2e: number | null;
  assurance_provider: string | null;
  assurance_standard: string | null;
  assurance_type: string | null;
  assurance_completed_at: string | null;
  qualified_opinion_reason: string | null;
  filing_platform: string | null;
  filing_ref: string | null;
  filing_submitted_at: string | null;
  categories_set_at: string | null;
  data_collection_opened_at: string | null;
  data_collection_closed_at: string | null;
  calculations_completed_at: string | null;
  review_completed_at: string | null;
  chain_status: ChainStatus;
  sla_deadline: string;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditEvent {
  id: string;
  entity_type: string;
  entity_id: string | null;
  event_type: string;
  actor_id: string;
  payload_json: string;
  sequence_no: number;
  created_at: string;
}

interface Kpis {
  total: number;
  in_progress: number;
  filed: number;
  qualified: number;
  sla_breached: number;
}

const TERMINALS: ChainStatus[] = ['disclosure_filed', 'assurance_qualified', 'withdrawn'];

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  scope3_initiated:              { bg: '#e3e7ec', fg: '#557',    label: 'Initiated' },
  category_boundaries_set:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Categories set' },
  data_collection_open:          { bg: '#dbecfb', fg: '#1a3a5c', label: 'Data collection open' },
  data_collection_complete:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Data collected' },
  emission_calculations:         { bg: '#fff4d6', fg: '#a06200', label: 'Calculating' },
  calculations_reviewed:         { bg: '#fff4d6', fg: '#a06200', label: 'Reviewed' },
  assurance_submitted:           { bg: '#ffe9d6', fg: '#8a4a00', label: 'In assurance' },
  limited_assurance_complete:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Limited assurance' },
  reasonable_assurance_complete: { bg: '#daf5e2', fg: '#1f6b3a', label: 'Reasonable assurance' },
  disclosure_filed:              { bg: '#d4edda', fg: '#155724', label: 'Filed' },
  assurance_qualified:           { bg: '#fde0e0', fg: '#9b1f1f', label: 'Qualified opinion' },
  withdrawn:                     { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  micro:         { bg: '#e3e7ec', fg: '#557',    label: 'Micro (<5 cat · 21d)' },
  standard:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard (5–10 · 30d)' },
  comprehensive: { bg: '#ffe4b5', fg: '#8a4a00', label: 'Comprehensive (10–13 · 45d)' },
  full_chain:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Full chain (15+ · 60d)' },
};

// Mirrors S3_VALID_TRANSITIONS in scope3-disclosure-spec.ts (sla_breach is
// system-only and excluded from the operator action surface).
const VALID_ACTIONS: Record<ChainStatus, Action[]> = {
  scope3_initiated:              ['set_categories', 'withdraw'],
  category_boundaries_set:       ['open_data_collection', 'withdraw'],
  data_collection_open:          ['close_data_collection'],
  data_collection_complete:      ['run_calculations'],
  emission_calculations:         ['complete_internal_review'],
  calculations_reviewed:         ['submit_for_assurance', 'file_disclosure'],
  assurance_submitted:           ['issue_limited_assurance', 'issue_reasonable_assurance', 'qualify_assurance'],
  limited_assurance_complete:    ['issue_reasonable_assurance', 'file_disclosure'],
  reasonable_assurance_complete: ['file_disclosure'],
  disclosure_filed:              [],
  assurance_qualified:           [],
  withdrawn:                     [],
};

const ACTION_LABEL: Record<Action, string> = {
  set_categories:             'Set category boundaries',
  open_data_collection:       'Open data collection',
  close_data_collection:      'Close data collection',
  run_calculations:           'Run GHG calculations',
  complete_internal_review:   'Complete internal review',
  submit_for_assurance:       'Submit for assurance',
  issue_limited_assurance:    'Issue limited assurance',
  issue_reasonable_assurance: 'Issue reasonable assurance',
  file_disclosure:            'File disclosure',
  qualify_assurance:          'Qualify (material error)',
  withdraw:                   'Withdraw',
};

const DESTRUCTIVE: Action[] = ['withdraw', 'qualify_assurance'];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtTco2e(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA')} tCO₂e`;
}
function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}
function slaLabel(row: S3Row): string {
  if (TERMINALS.includes(row.chain_status)) return '—';
  if (row.sla_breached) return 'BREACHED';
  const ms = new Date(row.sla_deadline).getTime() - Date.now();
  if (Number.isNaN(ms)) return '—';
  const days = Math.round(ms / 86400000);
  return days >= 0 ? `${days}d` : `${days}d overdue`;
}

export function Scope3DisclosureChainTab() {
  const [rows, setRows] = useState<S3Row[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<S3Row | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: S3Row[]; kpis: Kpis }>('/carbon/scope3-disclosure/chain');
      setRows(res.data?.data || []);
      setKpis(res.data?.kpis || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load Scope 3 disclosures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: S3Row; timeline: AuditEvent[] }>(`/carbon/scope3-disclosure/chain/${id}`);
      if (res.data?.data) setSelected(res.data.data);
      setEvents(res.data?.timeline || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load disclosure history');
    }
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (filter === 'all')      return true;
    if (filter === 'active')   return !TERMINALS.includes(r.chain_status);
    if (filter === 'filed')    return r.chain_status === 'disclosure_filed';
    if (filter === 'assurance') return ['assurance_submitted', 'limited_assurance_complete', 'reasonable_assurance_complete'].includes(r.chain_status);
    if (filter === 'breached') return !!r.sla_breached;
    if (['micro', 'standard', 'comprehensive', 'full_chain'].includes(filter)) return r.s3_tier === filter;
    return r.chain_status === filter;
  }), [rows, filter]);

  const create = useCallback(async () => {
    try {
      const tier = (window.prompt('Tier — micro / standard / comprehensive / full_chain:', 'standard') || '').trim();
      if (!tier) return;
      const yearStr = window.prompt('Reporting year:', String(new Date().getFullYear())) || '';
      const entity = window.prompt('Reporting entity name:') || '';
      const framework = window.prompt('Framework — ghg_protocol / issb_ifrs_s2 / cdp / tcfd / king_iv / integrated:', 'ghg_protocol') || '';
      const body: Record<string, string | number> = { s3_tier: tier };
      if (yearStr && !Number.isNaN(Number(yearStr))) body.reporting_year = Number(yearStr);
      if (entity) body.entity_name = entity;
      if (framework) body.reporting_framework = framework;
      await api.post('/carbon/scope3-disclosure/chain', body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create disclosure');
    }
  }, [load]);

  const act = useCallback(async (action: Action, row: S3Row) => {
    try {
      const body: Record<string, string | number> = { action };
      if (action === 'set_categories') {
        const count = window.prompt('Number of Scope 3 categories in scope (1–15):', String(row.category_count ?? ''));
        const list = window.prompt('Category list — comma-separated category numbers (e.g. 1,3,4,11,12):', row.category_list ?? '') || '';
        if (count && !Number.isNaN(Number(count))) body.category_count = Number(count);
        if (list) body.category_list = list;
      } else if (action === 'close_data_collection') {
        const cov = window.prompt('Primary-data coverage (% of spend/activity covered by primary data):', String(row.primary_data_coverage_pct ?? ''));
        if (cov && !Number.isNaN(Number(cov))) body.primary_data_coverage_pct = Number(cov);
      } else if (action === 'complete_internal_review') {
        const total = window.prompt('Reviewed Scope 3 total (tCO₂e):', String(row.scope3_total_tco2e ?? ''));
        if (total && !Number.isNaN(Number(total))) body.scope3_total_tco2e = Number(total);
      } else if (action === 'submit_for_assurance') {
        const provider = window.prompt('Assurance provider:') || '';
        const standard = window.prompt('Assurance standard — AA1000AS / ISO 14064-3 / ISAE 3000:') || '';
        if (provider) body.assurance_provider = provider;
        if (standard) body.assurance_standard = standard;
      } else if (action === 'file_disclosure') {
        const platform = window.prompt('Filing platform — CDP / JSE / ISSB registry / SA Climate Registry:') || '';
        const ref = window.prompt('Filing reference:') || '';
        if (platform) body.filing_platform = platform;
        if (ref) body.filing_ref = ref;
      } else if (action === 'qualify_assurance') {
        const reason = window.prompt('Qualified-opinion reason — the material misstatement found:');
        if (!reason) return;
        body.qualified_opinion_reason = reason;
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason:');
        if (!reason) return;
        body.reason = reason;
      }
      await api.post(`/carbon/scope3-disclosure/chain/${row.id}/action`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  const FILTERS: Array<{ key: string; label: string }> = [
    { key: 'active', label: 'Active' },
    { key: 'all', label: 'All' },
    { key: 'assurance', label: 'In assurance' },
    { key: 'filed', label: 'Filed' },
    { key: 'breached', label: 'SLA breached' },
    { key: 'micro', label: 'Micro' },
    { key: 'standard', label: 'Standard' },
    { key: 'comprehensive', label: 'Comprehensive' },
    { key: 'full_chain', label: 'Full chain' },
  ];

  return (
    <div className="p-5">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Scope 3 value-chain disclosure &amp; assurance</h2>
          <p className="max-w-3xl text-xs text-[#4a5568]">
            12-stage GHG Protocol Scope 3 chain · initiated → categories set → data collection → calculations →
            internal review → third-party assurance → filed. A reviewed disclosure may file directly without
            assurance; assurance may return a qualified opinion (material error). INVERTED SLA: a wider Scope 3
            boundary earns more data-collection time (micro 21d to full_chain 60d). Qualified opinions always cross
            to the regulator inbox; comprehensive and full-chain filings cross the CDP/JSE mandatory threshold
            (TCFD + ISSB IFRS S2 + GHG Protocol Scope 3 + CDP).
          </p>
        </div>
        <button type="button"
          onClick={create}
          className="shrink-0 rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
        >
          New disclosure
        </button>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Total" value={kpis?.total ?? rows.length} />
        <Kpi label="In progress" value={kpis?.in_progress ?? 0} tone={(kpis?.in_progress ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Filed" value={kpis?.filed ?? 0} tone="ok" />
        <Kpi label="Qualified" value={kpis?.qualified ?? 0} tone={(kpis?.qualified ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="SLA breached" value={kpis?.sla_breached ?? 0} tone={(kpis?.sla_breached ?? 0) > 0 ? 'bad' : 'ok'} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
                : 'border border-[#d8dde6] bg-white text-[#4a5568] hover:bg-[#f3f5f9]'
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Entity</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Year</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Categories</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Scope 3 total</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.s3_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[260px] truncate" title={r.entity_name ?? r.id}>
                      {r.entity_name ?? r.id.slice(0, 8)}
                      {!!r.regulator_notified && <span className="ml-1 text-[#9b1f1f]" title="Notified to regulator">●</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {tt.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{r.reporting_year}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#4a5568]">{r.category_count ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtTco2e(r.scope3_total_tco2e)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'font-semibold text-red-700' : 'text-[#4a5568]'}`}>
                      {slaLabel(r)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No Scope 3 disclosures match.</td></tr>
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
  row: S3Row;
  events: AuditEvent[];
  onClose: () => void;
  onAct: (action: Action, row: S3Row) => void;
}) {
  const actions = VALID_ACTIONS[row.chain_status];
  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full overflow-y-auto bg-white shadow-2xl md:w-[720px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.id.slice(0, 12)}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.entity_name ?? 'Scope 3 disclosure'}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.s3_tier].label} · FY{row.reporting_year}
                {row.reporting_framework ? ` · ${row.reporting_framework}` : ''}
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="border-b border-[#e3e7ec] px-5 py-4">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"                  value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                   value={TIER_TONE[row.s3_tier].label} />
            <Pair label="Reporting year"         value={String(row.reporting_year)} />
            <Pair label="Framework"              value={row.reporting_framework ?? '—'} />
            <Pair label="Categories in scope"    value={row.category_count != null ? `${row.category_count}${row.category_list ? ` (${row.category_list})` : ''}` : '—'} />
            <Pair label="Primary-data coverage"  value={fmtPct(row.primary_data_coverage_pct)} />
            <Pair label="Supplier responses"     value={row.supplier_responses != null ? String(row.supplier_responses) : '—'} />
            <Pair label="Scope 3 total"          value={fmtTco2e(row.scope3_total_tco2e)} />
            <Pair label="Cat 1 purchased goods"  value={fmtTco2e(row.cat1_purchased_goods_tco2e)} />
            <Pair label="Cat 3 fuel & energy"     value={fmtTco2e(row.cat3_fuel_energy_tco2e)} />
            <Pair label="Cat 11 use of products" value={fmtTco2e(row.cat11_use_of_products_tco2e)} />
            <Pair label="Cat 12 end-of-life"     value={fmtTco2e(row.cat12_eol_treatment_tco2e)} />
            <Pair label="Assurance provider"     value={row.assurance_provider ?? '—'} />
            <Pair label="Assurance standard"     value={row.assurance_standard ?? '—'} />
            <Pair label="Assurance type"         value={row.assurance_type ?? '—'} />
            <Pair label="Assurance completed"    value={fmtDate(row.assurance_completed_at)} />
            <Pair label="Filing platform"        value={row.filing_platform ?? '—'} />
            <Pair label="Filing ref"             value={row.filing_ref ?? '—'} />
            <Pair label="Filing submitted"       value={fmtDate(row.filing_submitted_at)} />
            <Pair label="Categories set"         value={fmtDate(row.categories_set_at)} />
            <Pair label="Collection opened"      value={fmtDate(row.data_collection_opened_at)} />
            <Pair label="Collection closed"      value={fmtDate(row.data_collection_closed_at)} />
            <Pair label="Calculations done"      value={fmtDate(row.calculations_completed_at)} />
            <Pair label="Review done"            value={fmtDate(row.review_completed_at)} />
            <Pair label="SLA deadline"           value={fmtDate(row.sla_deadline)} />
            <Pair label="SLA status"             value={slaLabel(row)} />
            <Pair label="Regulator notified"     value={row.regulator_notified ? 'Yes' : 'No'} />
          </div>
          {row.qualified_opinion_reason && (
            <BasisBlock label="Qualified-opinion reason" tone="#9b1f1f" text={row.qualified_opinion_reason} />
          )}
          {row.reason && (
            <BasisBlock label="Last reason" tone="#1a3a5c" text={row.reason} />
          )}
        </section>

        {actions.length > 0 && (
          <section className="border-b border-[#e3e7ec] px-5 py-4">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-[#4a5568]">Actions</div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a, i) => {
                const destructive = DESTRUCTIVE.includes(a);
                const primary = i === 0 && !destructive;
                const cls = primary
                  ? 'rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]'
                  : destructive
                    ? 'rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50'
                    : 'rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1a3a5c] hover:bg-[#f3f5f9]';
                return (
                  <button type="button" key={a} onClick={() => onAct(a, row)} className={cls}>
                    {ACTION_LABEL[a]}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-[#4a5568]">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="tabular-nums text-[#4a5568]">{fmtDate(e.created_at)}</span>
                  </div>
                  <div className="text-[#4a5568]">actor {e.actor_id} · seq {e.sequence_no}</div>
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
