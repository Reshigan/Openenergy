// Wave 103 — Carbon ESG Disclosure Lifecycle & Assurance Chain tab.
// Brings a JSE-listed entity's annual ESG cycle to L4-L5: 12-state lifecycle
// (period_open -> collect_data -> verify_boundary -> compute_metrics ->
// compile_draft -> submit_for_review -> engage_assurance -> start_assurance ->
// complete_assurance -> publish -> file_regulator -> archive) + disputed +
// cancelled branches; 4-tier composite re-derived every transition from
// scope x climate-exposure x assurance with FLOOR-AT-MATERIAL when JSE listed
// or Scope 3 inclusive 15-cat or scenario-required or 8+ material topics or
// SBTi committed; INVERTED SLA (strategic = 270d annual cycle, minor publish =
// 7d); 4-step authority ladder (analyst -> director -> audit chair -> board);
// regulator-crossings on restate (UNIVERSAL hard line - sister of W42 reversal)
// + qualified/adverse/disclaimer assurance opinion (material+strategic) +
// cancel-of-listed-year (universal) + sla_breach strategic only.
//
// Beats Workiva ESG, Sphera SpheraCloud, SAP Sustainability Control Tower,
// Microsoft Sustainability Manager, IBM Envizi, Salesforce Net Zero Cloud,
// Greenstone, EcoVadis, Persefoni, Watershed, Diligent ESG, Bloomberg ESG,
// Refinitiv Lipper ESG via LIVE 4-framework completeness battery (TCFD / GRI /
// CDP / JSE-SRL / King-IV / ISSB-S1S2) + SBTi alignment + ESG Disclosure Index
// + assurance-confidence ladder + regulator-filing countdown all composed on
// every fetch from raw inputs.
//
// Standards covered: ISSB IFRS S1 + S2 / TCFD 4 pillars / GRI Universal +
// sector / CDP Climate-Water-Forests / JSE SRL 2024 / King IV Principles 1-3 +
// 15-17 / SBTi alignment / Carbon Tax Act §6 / SAICA Code 8.
//
// Mounted on Carbon workstation (primary write) + cross-mounted on Esums O&M
// + Regulator portal (read-only).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'period_open' | 'data_collected' | 'boundary_verified' | 'metrics_computed'
  | 'draft_compiled' | 'internal_review' | 'assurance_engaged'
  | 'assurance_in_progress' | 'assured' | 'published' | 'filed' | 'archived'
  | 'disputed' | 'cancelled';

type Tier = 'minor' | 'standard' | 'material' | 'strategic';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority = 'esg_analyst' | 'sustainability_director' | 'audit_committee_chair' | 'board_chair';

type Party =
  | 'esg_analyst' | 'sustainability_director' | 'audit_committee_chair'
  | 'board_chair' | 'external_auditor' | 'regulator_observer' | 'system';

type DisclosureScope = 'entity_only' | 'entity_plus_subsidiaries' | 'group_consolidated';

type ClimateRiskExposure = 'low' | 'medium' | 'high';

type AssuranceLevel = 'none' | 'limited' | 'reasonable';

type AssuranceOpinion = 'unqualified' | 'limited' | 'qualified' | 'adverse' | 'disclaimer';

interface EsgRow {
  id: string;
  disclosure_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  reporting_entity_id: string;
  reporting_entity_name: string | null;
  reporting_entity_lei: string | null;
  ticker: string | null;
  financial_year_label: string | null;
  financial_year_end_at: string | null;
  period_opened_at: string | null;
  disclosure_scope: DisclosureScope;
  climate_risk_exposure: ClimateRiskExposure;
  assurance_level: AssuranceLevel;
  assurance_opinion: AssuranceOpinion | null;
  assurance_provider: string | null;
  external_auditor_party_id: string | null;
  jse_listed_strict: number;
  scope3_inclusive_15cat: number;
  climate_scenario_required: number;
  material_topics_count: number;
  sbti_committed_strict: number;
  year_had_listed_disclosure: number;
  scope1_tco2e: number | null;
  scope2_market_tco2e: number | null;
  scope2_location_tco2e: number | null;
  scope3_total_tco2e: number | null;
  baseline_year: number | null;
  baseline_total_tco2e: number | null;
  reduction_pct_vs_baseline: number | null;
  sbti_alignment_score: number | null;
  tcfd_completeness_pct: number | null;
  gri_completeness_pct: number | null;
  cdp_score: number | null;
  cdp_score_band: string | null;
  jse_srl_completeness_pct: number | null;
  king_iv_completeness_pct: number | null;
  issb_s1_s2_completeness_pct: number | null;
  assurance_confidence_level: string | null;
  esg_disclosure_index: number | null;
  regulator_filing_window_days: number | null;
  urgency_band: UrgencyBand | null;
  current_tier: Tier;
  effective_tier: Tier | null;
  authority_required: Authority | null;
  dispute_count: number;
  restate_count: number;
  cancel_count: number;
  parent_disclosure_id: string | null;
  prior_disclosure_id: string | null;
  regulator_ref: string | null;
  jse_sens_ref: string | null;
  cipc_ref: string | null;
  dffe_ref: string | null;
  sars_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  disputed_reason: string | null;
  cancelled_reason: string | null;
  restated_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  analyst_party: string | null;
  director_party: string | null;
  audit_committee_party: string | null;
  board_party: string | null;
  chain_status: ChainStatus;
  period_open_at: string | null;
  data_collected_at: string | null;
  boundary_verified_at: string | null;
  metrics_computed_at: string | null;
  draft_compiled_at: string | null;
  internal_review_at: string | null;
  assurance_engaged_at: string | null;
  assurance_in_progress_at: string | null;
  assured_at: string | null;
  published_at: string | null;
  filed_at: string | null;
  archived_at: string | null;
  disputed_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated by route
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  floor_at_material_flag?: boolean;
  scope3_total_tco2e_live?: number | null;
  total_emissions_tco2e_live?: number | null;
  reduction_pct_vs_baseline_live?: number | null;
  sbti_alignment_score_live?: number | null;
  tcfd_completeness_pct_live?: number | null;
  cdp_score_band_live?: string | null;
  assurance_confidence_live?: string | null;
  esg_disclosure_index_live?: number | null;
  regulator_filing_window_days_live?: number | null;
  sla_days_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
  authority_required_live?: Authority;
  days_in_court_live?: number;
}

interface EsgEvent {
  id: string;
  disclosure_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  archived_count: number;
  filed_count: number;
  published_count: number;
  assured_count: number;
  disputed_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  total_scope1_tco2e: number;
  total_scope2_tco2e: number;
  total_scope3_tco2e: number;
  total_emissions_tco2e: number;
  avg_reduction_pct: number;
  avg_disclosure_index: number;
  avg_tcfd_pct: number;
  critical_urgency_count: number;
  strategic_tier_count: number;
  material_tier_count: number;
  floor_at_material_count: number;
  jse_listed_count: number;
  qualified_opinion_count: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  period_open:           { bg: '#dbecfb', fg: '#1a3a5c', label: 'Period open' },
  data_collected:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Data collected' },
  boundary_verified:     { bg: '#dbecfb', fg: '#1a3a5c', label: 'Boundary verified' },
  metrics_computed:      { bg: '#fff4d6', fg: '#a06200', label: 'Metrics computed' },
  draft_compiled:        { bg: '#fff4d6', fg: '#a06200', label: 'Draft compiled' },
  internal_review:       { bg: '#fff4d6', fg: '#a06200', label: 'Internal review' },
  assurance_engaged:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Assurance engaged' },
  assurance_in_progress: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Assurance live' },
  assured:               { bg: '#daf5e2', fg: '#1f6b3a', label: 'Assured' },
  published:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Published' },
  filed:                 { bg: '#daf5e2', fg: '#1f6b3a', label: 'Filed (regulator)' },
  archived:              { bg: '#e3e7ec', fg: '#557',    label: 'Archived' },
  disputed:              { bg: '#fbd0d0', fg: '#7a1414', label: 'Disputed' },
  cancelled:             { bg: '#e3e7ec', fg: '#557',    label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  minor:     { bg: '#e3e7ec', fg: '#557',    label: 'Minor' },
  standard:  { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  material:  { bg: '#fff4d6', fg: '#a06200', label: 'Material' },
  strategic: { bg: '#fbd0d0', fg: '#7a1414', label: 'Strategic' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const AUTH_LABEL: Record<Authority, string> = {
  esg_analyst:           'ESG analyst',
  sustainability_director: 'Sustainability director',
  audit_committee_chair: 'Audit committee chair',
  board_chair:           'Board chair',
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  esg_analyst:             { bg: '#dbecfb', fg: '#1a3a5c' },
  sustainability_director: { bg: '#fff4d6', fg: '#a06200' },
  audit_committee_chair:   { bg: '#daf5e2', fg: '#1f6b3a' },
  board_chair:             { bg: '#fbd0d0', fg: '#7a1414' },
  external_auditor:        { bg: '#e8defc', fg: '#5320a3' },
  regulator_observer:      { bg: '#fde0e0', fg: '#9b1f1f' },
  system:                  { bg: '#e3e7ec', fg: '#557' },
};

// UX revisit 2026-05-30 — pills grouped into 2 visual rows: action-oriented
// (active/scope + tier + flags) first; lifecycle state pills second. Cuts
// per-row pill count from 24→10 and 24→12 so they fit two rows on 1440px.
const FILTER_ROW_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active (pre-terminal)' },
  { key: 'all',                   label: 'All' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
  { key: 'critical_urgency',      label: 'Critical urgency' },
  { key: 'floored',               label: 'Floor-at-material' },
  { key: 'jse_listed',            label: 'JSE listed' },
  { key: 'qualified',             label: 'Qualified opinion' },
  { key: 'strategic',             label: 'Strategic' },
  { key: 'material',              label: 'Material' },
  { key: 'standard',              label: 'Standard' },
  { key: 'minor',                 label: 'Minor' },
];

const FILTER_ROW_STATE: Array<{ key: string; label: string }> = [
  { key: 'period_open',           label: 'Period open' },
  { key: 'data_collected',        label: 'Data collected' },
  { key: 'boundary_verified',     label: 'Boundary verified' },
  { key: 'metrics_computed',      label: 'Metrics computed' },
  { key: 'draft_compiled',        label: 'Draft compiled' },
  { key: 'internal_review',       label: 'Internal review' },
  { key: 'assurance_engaged',     label: 'Assurance engaged' },
  { key: 'assurance_in_progress', label: 'Assurance live' },
  { key: 'assured',               label: 'Assured' },
  { key: 'published',             label: 'Published' },
  { key: 'filed',                 label: 'Filed' },
  { key: 'disputed',              label: 'Disputed' },
];

const TIERS = new Set<string>(['minor', 'standard', 'material', 'strategic']);

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function fmtTco2e(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Mt`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(1)} kt`;
  return `${v.toFixed(0)} t`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(digits)}%`;
}

function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString();
}

export function EsgDisclosureChainTab() {
  const [rows, setRows] = useState<EsgRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<EsgRow | null>(null);
  const [events, setEvents] = useState<EsgEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: EsgRow[] } }>('/carbon/esg-disclosure/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load ESG disclosures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { disclosure: EsgRow; events: EsgEvent[] } }>(`/carbon/esg-disclosure/chain/${id}`);
      if (res.data?.data?.disclosure) setSelected(res.data.data.disclosure);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load disclosure history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')              return true;
      if (filter === 'active')           return !r.is_terminal;
      if (filter === 'breached')         return r.sla_breached;
      if (filter === 'reportable')       return r.is_reportable_flag;
      if (filter === 'critical_urgency') return r.urgency_band_live === 'critical';
      if (filter === 'floored')          return r.floor_at_material_flag;
      if (filter === 'jse_listed')       return !!r.jse_listed_strict;
      if (filter === 'qualified')        return r.assurance_opinion === 'qualified' || r.assurance_opinion === 'adverse' || r.assurance_opinion === 'disclaimer';
      if (TIERS.has(filter))             return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/carbon/esg-disclosure/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      {/* UX revisit 2026-05-30 — KPI strip reordered so the FOUR numbers the
          sustainability director opens the workstation FOR (SLA breached,
          Disputed, Qualified opinion, Strategic tier) sit left of total/active
          counts. Total emissions stays right (anchors-the-tail magnitude). */}
      <div className="grid grid-cols-8 gap-3">
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Disputed" value={kpis?.disputed_count ?? 0} tone={(kpis?.disputed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Qualified opinion" value={kpis?.qualified_opinion_count ?? 0} tone={(kpis?.qualified_opinion_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Strategic tier" value={kpis?.strategic_tier_count ?? 0} tone={(kpis?.strategic_tier_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="JSE listed" value={kpis?.jse_listed_count ?? 0} />
        <Kpi label="Active" value={kpis?.open_count ?? 0} />
        <Kpi label="Total" value={kpis?.total ?? 0} />
        <Kpi label="Total emissions" value={fmtTco2e(kpis?.total_emissions_tco2e ?? 0)} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_ROW_ACTION.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#c2873a] text-white border-[#1a3a5c]'
                : 'bg-white text-[#4a5568] border-[#dde4ec] hover:bg-[#eef2f7]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_ROW_STATE.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#c2873a] text-white border-[#1a3a5c]'
                : 'bg-white text-[#6b7685] border-[#eef2f6] hover:bg-[#eef2f7]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-white border border-[#e5ebf2] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-[#6b7685]">
            <tr>
              <th className="px-3 py-2 text-left">Disclosure #</th>
              <th className="px-3 py-2 text-left">Entity / FY</th>
              <th className="px-3 py-2 text-right">Scope 1+2+3</th>
              <th className="px-3 py-2 text-right">vs baseline</th>
              <th className="px-3 py-2 text-right">Index</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">No ESG disclosures match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.current_tier];
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.disclosure_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.reporting_entity_name ?? r.reporting_entity_id} · ${r.financial_year_label ?? '—'}`}>
                    {r.reporting_entity_name ?? r.reporting_entity_id}
                    <span className="text-[#6b7685]"> · {r.financial_year_label ?? '—'}</span>
                    {!!r.jse_listed_strict && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#dbecfb] text-[#1a3a5c]">JSE</span>}
                    {r.floor_at_material_flag && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fff4d6] text-[#a06200]">FLOOR</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{fmtTco2e(r.total_emissions_tco2e_live)}</td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${(r.reduction_pct_vs_baseline_live ?? 0) >= 0 ? 'text-[#1f6b3a]' : 'text-[#9b1f1f]'}`}>
                    {fmtPct(r.reduction_pct_vs_baseline_live, 1)}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{(r.esg_disclosure_index_live ?? 0).toFixed(1)}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: tierTone.bg, color: tierTone.fg }}>
                      {tierTone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: stateTone.bg, color: stateTone.fg }}>
                      {stateTone.label}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                    {r.is_terminal ? '—' : fmtMin(r.minutes_until_sla)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <EsgDrawer
          row={selected}
          events={events}
          onClose={() => { setSelected(null); setEvents([]); }}
          doAction={doAction}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = 'ok' }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const fg = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0f1c2e';
  return (
    <div className="bg-white border border-[#e5ebf2] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-semibold tabular-nums mt-0.5" style={{ color: fg }}>{value}</div>
    </div>
  );
}

function EsgDrawer({
  row, events, onClose, doAction,
}: {
  row: EsgRow;
  events: EsgEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_terminal;
  const disputable = ['draft_compiled', 'internal_review', 'assured'].includes(cs);
  const cancellable = !row.is_terminal;
  const restatable = cs === 'filed';
  const urgencyTone = row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live] : null;
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-stretch justify-end oe-overlay-in" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl shadow-xl overflow-y-auto oe-drawer-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">ESG disclosure {row.disclosure_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
              {row.reporting_entity_name ?? row.reporting_entity_id} · {row.financial_year_label ?? '—'}
            </h3>
            <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: TIER_TONE[row.current_tier].bg, color: TIER_TONE[row.current_tier].fg }}>
                {TIER_TONE[row.current_tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
              {urgencyTone && (
                <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: urgencyTone.bg, color: urgencyTone.fg }}>
                  {urgencyTone.label} urgency
                </span>
              )}
              {row.floor_at_material_flag && (
                <span className="px-2 py-0.5 rounded-full font-bold bg-[#fff4d6] text-[#a06200]">FLOOR @ material</span>
              )}
              {row.is_reportable_flag && (
                <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
              )}
              {authorityNow && (
                <span className="px-2 py-0.5 rounded-full bg-[#dbecfb] text-[#1a3a5c] font-medium">Auth: {AUTH_LABEL[authorityNow]}</span>
              )}
              {!!row.jse_listed_strict && (
                <span className="px-2 py-0.5 rounded-full bg-[#dbecfb] text-[#1a3a5c] font-medium">JSE listed</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Emissions ledger (GHG protocol Scope 1+2+3)</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="Scope 1" value={fmtTco2e(row.scope1_tco2e)} />
              <Pair label="Scope 2 (market)" value={fmtTco2e(row.scope2_market_tco2e)} />
              <Pair label="Scope 2 (location)" value={fmtTco2e(row.scope2_location_tco2e)} />
              <Pair label="Scope 3 (15-cat)" value={fmtTco2e(row.scope3_total_tco2e_live)} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Total tCO2e" value={fmtTco2e(row.total_emissions_tco2e_live)} />
              <Pair label="Baseline year" value={fmtCount(row.baseline_year)} />
              <Pair label="Baseline tCO2e" value={fmtTco2e(row.baseline_total_tco2e)} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Reduction vs baseline" value={fmtPct(row.reduction_pct_vs_baseline_live)} />
              <Pair label="SBTi alignment" value={`${(row.sbti_alignment_score_live ?? 0).toFixed(1)} / 100`} />
              <Pair label="ESG Disclosure Index" value={`${(row.esg_disclosure_index_live ?? 0).toFixed(1)} / 100`} />
            </div>
          </div>

          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Framework completeness battery</div>
            <div className="grid grid-cols-4 gap-3">
              <Pair label="TCFD" value={fmtPct(row.tcfd_completeness_pct_live)} />
              <Pair label="GRI" value={fmtPct(row.gri_completeness_pct)} />
              <Pair label="CDP" value={row.cdp_score_band_live ?? row.cdp_score_band ?? '—'} />
              <Pair label="JSE SRL" value={fmtPct(row.jse_srl_completeness_pct)} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="King IV" value={fmtPct(row.king_iv_completeness_pct)} />
              <Pair label="ISSB S1+S2" value={fmtPct(row.issb_s1_s2_completeness_pct)} />
              <Pair label="Material topics" value={fmtCount(row.material_topics_count)} />
            </div>
          </div>

          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Assurance & filing</div>
            <div className="grid grid-cols-3 gap-3">
              <Pair label="Scope" value={row.disclosure_scope.replace(/_/g, ' ')} />
              <Pair label="Climate-risk exposure" value={row.climate_risk_exposure} />
              <Pair label="Assurance level" value={row.assurance_level} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Opinion" value={row.assurance_opinion ?? '—'} />
              <Pair label="Provider" value={row.assurance_provider ?? '—'} />
              <Pair label="Confidence" value={row.assurance_confidence_live ?? row.assurance_confidence_level ?? '—'} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="FY end" value={row.financial_year_end_at ? new Date(row.financial_year_end_at).toLocaleDateString() : '—'} />
              <Pair label="Filing window" value={row.regulator_filing_window_days_live != null ? `${row.regulator_filing_window_days_live}d` : '—'} />
              <Pair label="SLA days left" value={row.sla_days_remaining_live != null ? `${row.sla_days_remaining_live}d` : '—'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FlagPill on={!!row.jse_listed_strict} label="JSE listed strict" />
            <FlagPill on={!!row.scope3_inclusive_15cat} label="Scope 3 (15-cat inclusive)" />
            <FlagPill on={!!row.climate_scenario_required} label="Climate scenario required" />
            <FlagPill on={(row.material_topics_count ?? 0) >= 8} label="Material topics ≥ 8" />
            <FlagPill on={!!row.sbti_committed_strict} label="SBTi committed strict" />
            <FlagPill on={!!row.year_had_listed_disclosure} label="Year had listed disclosure" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {row.reporting_entity_lei && <Pair label="LEI" value={row.reporting_entity_lei} />}
            {row.ticker && <Pair label="Ticker" value={row.ticker} />}
            {row.jse_sens_ref && <Pair label="JSE SENS ref" value={row.jse_sens_ref} />}
            {row.cipc_ref && <Pair label="CIPC ref" value={row.cipc_ref} />}
            {row.dffe_ref && <Pair label="DFFE ref" value={row.dffe_ref} />}
            {row.sars_ref && <Pair label="SARS ref" value={row.sars_ref} />}
            {row.regulator_inbox_ref && <Pair label="Regulator inbox" value={row.regulator_inbox_ref} />}
            {row.dispute_count > 0 && <Pair label="Disputes" value={`${row.dispute_count}`} />}
            {row.restate_count > 0 && <Pair label="Restatements" value={`${row.restate_count}`} />}
            {row.disputed_reason && <Pair label="Disputed reason" value={row.disputed_reason} />}
            {row.cancelled_reason && <Pair label="Cancelled reason" value={row.cancelled_reason} />}
            {row.restated_reason && <Pair label="Restated reason" value={row.restated_reason} />}
            {row.reason_code && <Pair label="Reason code" value={row.reason_code} />}
          </div>

          {row.source_wave && (
            <Pair label="Provenance" value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`} />
          )}

          {row.sla_deadline_at && !row.is_terminal && (
            <Pair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'period_open' && (
                  <ActionBtn label="Collect data (ESG analyst)" onClick={() => {
                    const s1 = window.prompt('Scope 1 tCO2e:') ?? undefined;
                    const s2m = window.prompt('Scope 2 market tCO2e:') ?? undefined;
                    const s2l = window.prompt('Scope 2 location tCO2e (optional):') ?? undefined;
                    const s3 = window.prompt('Scope 3 total tCO2e (15-cat):') ?? undefined;
                    const bYr = window.prompt('Baseline year (optional):') ?? undefined;
                    const bTot = window.prompt('Baseline total tCO2e (optional):') ?? undefined;
                    void doAction('collect-data', {
                      scope1_tco2e: s1 ? Number(s1) : undefined,
                      scope2_market_tco2e: s2m ? Number(s2m) : undefined,
                      scope2_location_tco2e: s2l ? Number(s2l) : undefined,
                      scope3_total_tco2e: s3 ? Number(s3) : undefined,
                      baseline_year: bYr ? Number(bYr) : undefined,
                      baseline_total_tco2e: bTot ? Number(bTot) : undefined,
                    });
                  }} />
                )}
                {cs === 'data_collected' && (
                  <ActionBtn label="Verify boundary (ESG analyst)" onClick={() => {
                    const scope = window.prompt('Scope (entity_only | entity_plus_subsidiaries | group_consolidated):') ?? undefined;
                    const expo = window.prompt('Climate-risk exposure (low | medium | high):') ?? undefined;
                    const s3in = window.confirm('Scope 3 inclusive 15-cat?');
                    const scen = window.confirm('Climate scenario required?');
                    const mat = window.prompt('Material topics count:') ?? undefined;
                    void doAction('verify-boundary', {
                      disclosure_scope: scope,
                      climate_risk_exposure: expo,
                      scope3_inclusive_15cat: s3in,
                      climate_scenario_required: scen,
                      material_topics_count: mat ? Number(mat) : undefined,
                    });
                  }} />
                )}
                {cs === 'boundary_verified' && (
                  <ActionBtn label="Compute metrics (ESG analyst)" onClick={() => {
                    const tcfd = window.prompt('TCFD completeness % (optional):') ?? undefined;
                    const gri  = window.prompt('GRI completeness % (optional):') ?? undefined;
                    const cdp  = window.prompt('CDP score 0-100 (optional):') ?? undefined;
                    const jse  = window.prompt('JSE SRL completeness % (optional):') ?? undefined;
                    const king = window.prompt('King IV completeness % (optional):') ?? undefined;
                    const issb = window.prompt('ISSB S1+S2 completeness % (optional):') ?? undefined;
                    void doAction('compute-metrics', {
                      tcfd_completeness_pct: tcfd ? Number(tcfd) : undefined,
                      gri_completeness_pct: gri ? Number(gri) : undefined,
                      cdp_score: cdp ? Number(cdp) : undefined,
                      jse_srl_completeness_pct: jse ? Number(jse) : undefined,
                      king_iv_completeness_pct: king ? Number(king) : undefined,
                      issb_s1_s2_completeness_pct: issb ? Number(issb) : undefined,
                    });
                  }} />
                )}
                {cs === 'metrics_computed' && (
                  <ActionBtn label="Compile draft (sustainability director)" onClick={() => {
                    const title = window.prompt('Draft title:') ?? undefined;
                    void doAction('compile-draft', { title });
                  }} />
                )}
                {cs === 'draft_compiled' && (
                  <ActionBtn label="Submit for review" onClick={() => { void doAction('submit-for-review', {}); }} />
                )}
                {cs === 'internal_review' && (
                  <ActionBtn label="Engage assurance (audit committee chair)" onClick={() => {
                    const lvl = window.prompt('Assurance level (none | limited | reasonable):') ?? undefined;
                    const prov = window.prompt('Assurance provider name:') ?? undefined;
                    void doAction('engage-assurance', {
                      assurance_level: lvl,
                      assurance_provider: prov,
                    });
                  }} />
                )}
                {cs === 'assurance_engaged' && (
                  <ActionBtn label="Start assurance (external auditor)" onClick={() => { void doAction('start-assurance', {}); }} />
                )}
                {cs === 'assurance_in_progress' && (
                  <ActionBtn label="Complete assurance (external auditor)" onClick={() => {
                    const op = window.prompt('Opinion (unqualified | limited | qualified | adverse | disclaimer):') ?? undefined;
                    void doAction('complete-assurance', { assurance_opinion: op });
                  }} />
                )}
                {cs === 'assured' && (
                  <ActionBtn label="Publish disclosure (board chair)" tone="good" onClick={() => { void doAction('publish-disclosure', {}); }} />
                )}
                {cs === 'published' && (
                  <ActionBtn label="File with regulator" tone="good" onClick={() => {
                    const jse  = window.prompt('JSE SENS ref (optional):') ?? undefined;
                    const cipc = window.prompt('CIPC ref (optional):') ?? undefined;
                    const dffe = window.prompt('DFFE ref (optional):') ?? undefined;
                    const sars = window.prompt('SARS ref (optional):') ?? undefined;
                    void doAction('file-regulator', {
                      jse_sens_ref: jse, cipc_ref: cipc, dffe_ref: dffe, sars_ref: sars,
                    });
                  }} />
                )}
                {cs === 'filed' && (
                  <ActionBtn label="Archive year" onClick={() => { void doAction('archive-year', {}); }} />
                )}
                {disputable && (
                  <ActionBtn label="Raise dispute (audit committee chair)" tone="bad" onClick={() => {
                    const reason = window.prompt('Dispute reason:') ?? undefined;
                    void doAction('raise-dispute', { disputed_reason: reason });
                  }} />
                )}
                {cs === 'disputed' && (
                  <ActionBtn label="Resolve dispute" tone="good" onClick={() => { void doAction('resolve-dispute', {}); }} />
                )}
                {restatable && (
                  <ActionBtn label="Restate disclosure (regulator reportable EVERY tier)" tone="bad" onClick={() => {
                    const reason = window.prompt('Restatement reason:') ?? undefined;
                    void doAction('restate-disclosure', { restated_reason: reason });
                  }} />
                )}
                {cancellable && (
                  <ActionBtn label="Cancel year" onClick={() => {
                    const reason = window.prompt('Cancellation reason:') ?? undefined;
                    void doAction('cancel-year', { cancelled_reason: reason });
                  }} />
                )}
              </div>
            </div>
          )}

          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Timeline</div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-[12px] text-[#6b7685]">No events yet.</div>
              ) : events.map((e) => {
                const partyTone = PARTY_TONE[e.actor_party ?? 'system'] ?? PARTY_TONE.system;
                return (
                  <div key={e.id} className="flex gap-3 text-[12px] border-l-2 border-[#e5ebf2] pl-3 py-1">
                    <span className="font-mono text-[11px] text-[#6b7685] whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span>
                    <div>
                      <span className="font-semibold text-[#0f1c2e]">{e.event_type}</span>
                      {e.actor_party && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase" style={{ background: partyTone.bg, color: partyTone.fg }}>
                          {e.actor_party}
                        </span>
                      )}
                      {e.from_status && e.to_status && e.from_status !== e.to_status && (
                        <span className="text-[#6b7685]"> · {e.from_status} → {e.to_status}</span>
                      )}
                      {e.notes && <div className="text-[#4a5568] mt-0.5">{e.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[#0f1c2e] mt-0.5">{value}</div>
    </div>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-[12px] ${on ? 'bg-[#fff4d6] text-[#a06200] border border-[#f4d68f]' : 'bg-[#f7f9fb] text-[#6b7685] border border-[#e5ebf2]'}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-[#a06200]' : 'bg-[#cbd5e0]'}`} />
      <span>{label}</span>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'neutral' | 'good' | 'bad' }) {
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#c2873a]';
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
  );
}
