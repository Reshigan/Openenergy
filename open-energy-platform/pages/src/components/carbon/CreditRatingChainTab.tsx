// Wave 109 — Carbon Credit Quality Rating & Continuous Re-rating Chain tab.
// 11th Carbon chain. Buyer-side due-diligence rating engine bridging W37
// (registration PDD), W11 (MRV verification), W42 (reversal / buffer pool).
//
// Beats Sylvera / BeZero Carbon Ratings / Pachama Verified Credits / Renoster
// Carbon Ratings / Calyx Global / Carbon Direct CDx / Patch Quality Layer /
// Cloverly Quality Tags / S&P Global carbon methodology / Moody KYC Carbon
// — each surfaces a rating as a single STATIC letter. W109 turns it into a
// 12-state P6 chain with INVERTED SLA polarity (institutional = LONGEST
// runway), FLOOR-AT-PREMIUM tier overlay, 4-step authority ladder
// (junior_analyst -> senior_analyst -> ratings_committee_chair ->
// board_rating_committee), 17-field LIVE battery (composite + 5 sub-scores +
// S&P-style 8-band AAA/AA/A/BBB/BB/B/CCC/D + 3-bridge architecture + ICROA
// bonus + monitoring freshness + drop% + downgrade-imminent flag),
// continuous monitoring with auto re-rating (90d stale -> system trigger),
// and signature regulator crossings.
//
// Standards: CCP Core Carbon Principles + ICROA Code of Best Practice +
// Article 6.4 Methodologies + ISO 14064-3 + VCS / Verra integrity.
//
// SIGNATURE crossings:
//   - downgrade              -> regulator EVERY tier on drop>=20% OR CCC/D
//   - escalate_to_integrity  -> regulator EVERY tier (fraud -> W42 reversal)
//   - publish_rating         -> premium+institutional when Article 6
//   - withdraw               -> regulator EVERY tier when issuer_disputed
//   - sla_breached           -> premium+institutional only

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'rating_requested' | 'desk_review' | 'methodology_score'
  | 'additionality_score' | 'permanence_score' | 'leakage_score'
  | 'cobenefit_score' | 'composite_score' | 'published' | 'monitoring'
  | 're_rating_triggered' | 're_rated' | 'downgraded' | 'withdrawn'
  | 'escalated_to_integrity';

type Tier = 'basic' | 'standard' | 'premium' | 'institutional';

type UrgencyBand = 'critical' | 'high' | 'medium' | 'low';

type Authority =
  | 'junior_analyst' | 'senior_analyst' | 'ratings_committee_chair'
  | 'board_rating_committee';

type RatingBand = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';

interface CcrRow {
  id: string;
  rating_number: string;
  project_id: string;
  project_name: string | null;
  issuer_id: string;
  issuer_name: string | null;
  rater_id: string;
  rater_name: string | null;
  buyer_id: string | null;
  buyer_name: string | null;
  registration_chain_ref: string | null;
  mrv_chain_ref: string | null;
  reversal_chain_ref: string | null;
  credit_vintage_year: number;
  multi_vintage: number;
  scope_scale_tonnes: number;
  methodology_id: string | null;
  methodology_name: string | null;
  registry_name: string | null;
  methodology_score: number | null;
  additionality_score: number | null;
  permanence_score: number | null;
  leakage_score: number | null;
  cobenefit_score: number | null;
  composite_score: number | null;
  rating_band: RatingBand | null;
  prior_composite_score: number | null;
  prior_rating_band: RatingBand | null;
  composite_drop_pct: number;
  icroa_aligned: number;
  afolu_high_reversal_risk: number;
  methodology_under_review: number;
  external_credit_red_flag: number;
  ccp_aligned_project: number;
  article_6_authorised: number;
  institutional_buyer: number;
  issuer_disputed: number;
  current_tier: Tier;
  authority_required: Authority | null;
  urgency_band: string | null;
  rating_completeness_index: number;
  rerating_count_30d: number;
  monitoring_freshness_days: number | null;
  monitoring_data_stale: number;
  vintage_age_years: number;
  last_monitoring_data_at: string | null;
  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  withdraw_reason: string | null;
  downgrade_reason: string | null;
  integrity_reason: string | null;
  remediation_narrative: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ChainStatus;
  rating_requested_at: string | null;
  desk_review_at: string | null;
  methodology_score_at: string | null;
  additionality_score_at: string | null;
  permanence_score_at: string | null;
  leakage_score_at: string | null;
  cobenefit_score_at: string | null;
  composite_score_at: string | null;
  published_at: string | null;
  monitoring_at: string | null;
  re_rating_triggered_at: string | null;
  re_rated_at: string | null;
  downgraded_at: string | null;
  withdrawn_at: string | null;
  escalated_to_integrity_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Decorated by route
  is_terminal?: boolean;
  is_hard_terminal?: boolean;
  hours_until_sla?: number | null;
  sla_breached_live?: boolean;
  sla_window_hours?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  sla_hours_remaining_live?: number | null;
  urgency_band_live?: UrgencyBand;
  authority_required_live?: Authority;
  regulator_filing_window_hours_live?: number;
  floor_flag_count_live?: number;
  rating_completeness_index_live?: number;
  rerating_count_30d_live?: number;
  monitoring_freshness_days_live?: number | null;
  monitoring_data_stale_live?: boolean;
  vintage_age_years_live?: number;
  composite_drop_pct_live?: number;
  downgrade_imminent_live?: boolean;
  is_material_downgrade_live?: boolean;
  rating_band_live?: RatingBand | null;
  investment_grade_live?: boolean;
  distressed_live?: boolean;
  bridges_to_registration_chain_live?: boolean;
  bridges_to_mrv_chain_live?: boolean;
  bridges_to_reversal_chain_live?: boolean;
}

interface CcrEvent {
  id: string;
  rating_id: string;
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
  by_status: Record<string, number>;
  by_tier: Record<string, number>;
  by_urgency: Record<string, number>;
  by_band: Record<string, number>;
  active_count: number;
  published_count: number;
  monitoring_count: number;
  re_rated_count: number;
  downgraded_count: number;
  withdrawn_count: number;
  integrity_count: number;
  institutional_count: number;
  premium_count: number;
  breached: number;
  reportable_total: number;
  downgrade_imminent_count: number;
  material_downgrade_count: number;
  investment_grade_count: number;
  distressed_count: number;
  article_6_count: number;
  ccp_aligned_count: number;
  stale_count: number;
  registration_bridged_count: number;
  mrv_bridged_count: number;
  reversal_bridged_count: number;
  total_scope_tonnes: number;
  avg_composite_score: number;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  rating_requested:       { bg: '#dbecfb', fg: '#1a3a5c', label: 'Rating requested' },
  desk_review:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Desk review' },
  methodology_score:      { bg: '#fff4d6', fg: '#a06200', label: 'Methodology scored' },
  additionality_score:    { bg: '#fff4d6', fg: '#a06200', label: 'Additionality scored' },
  permanence_score:       { bg: '#fff4d6', fg: '#a06200', label: 'Permanence scored' },
  leakage_score:          { bg: '#fff4d6', fg: '#a06200', label: 'Leakage scored' },
  cobenefit_score:        { bg: '#fff4d6', fg: '#a06200', label: 'Co-benefits scored' },
  composite_score:        { bg: '#fff4d6', fg: '#a06200', label: 'Composite computed' },
  published:              { bg: '#daf5e2', fg: '#1f6b3a', label: 'Rating published' },
  monitoring:             { bg: '#daf5e2', fg: '#1f6b3a', label: 'Monitoring (live)' },
  re_rating_triggered:    { bg: '#fde0e0', fg: '#9b1f1f', label: 'Re-rating triggered' },
  re_rated:               { bg: '#e3e7ec', fg: '#557',    label: 'Re-rated' },
  downgraded:             { bg: '#fbd0d0', fg: '#7a1414', label: 'Downgraded' },
  withdrawn:              { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
  escalated_to_integrity: { bg: '#fbd0d0', fg: '#7a1414', label: 'Escalated to integrity' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  basic:         { bg: '#e3e7ec', fg: '#557',    label: 'Basic' },
  standard:      { bg: '#dbecfb', fg: '#1a3a5c', label: 'Standard' },
  premium:       { bg: '#fff4d6', fg: '#a06200', label: 'Premium' },
  institutional: { bg: '#fbd0d0', fg: '#7a1414', label: 'Institutional' },
};

const URGENCY_TONE: Record<UrgencyBand, { bg: string; fg: string; label: string }> = {
  low:      { bg: '#e3e7ec', fg: '#557',    label: 'Low' },
  medium:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Medium' },
  high:     { bg: '#fff4d6', fg: '#a06200', label: 'High' },
  critical: { bg: '#fbd0d0', fg: '#7a1414', label: 'Critical' },
};

const AUTH_LABEL: Record<Authority, string> = {
  junior_analyst:          'Junior analyst',
  senior_analyst:          'Senior analyst',
  ratings_committee_chair: 'Ratings committee chair',
  board_rating_committee:  'Board rating committee',
};

const BAND_TONE: Record<RatingBand, { bg: string; fg: string }> = {
  AAA: { bg: '#0b6e3a', fg: '#ffffff' },
  AA:  { bg: '#1f8a4d', fg: '#ffffff' },
  A:   { bg: '#3aa86b', fg: '#ffffff' },
  BBB: { bg: '#86c79a', fg: '#0f1c2e' },
  BB:  { bg: '#f4d068', fg: '#5a3d00' },
  B:   { bg: '#f2a83c', fg: '#5a3000' },
  CCC: { bg: '#d8602b', fg: '#ffffff' },
  D:   { bg: '#9b1f1f', fg: '#ffffff' },
};

const PARTY_TONE: Record<string, { bg: string; fg: string }> = {
  rater:  { bg: '#dbecfb', fg: '#1a3a5c' },
  issuer: { bg: '#fff4d6', fg: '#a06200' },
  buyer:  { bg: '#daf5e2', fg: '#1f6b3a' },
  system: { bg: '#e3e7ec', fg: '#557'    },
};

// UX revisit 2026-05-30 — pills grouped into 2 visual rows: action-LEFT
// (SLA breached / Downgrade imminent / Distressed / Article 6 / etc.) first;
// lifecycle state pills second. Cuts per-row pill count from 24->12 so they
// fit two rows on 1440px.
const FILTER_ROW_ACTION: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active (pre-terminal)' },
  { key: 'all',                 label: 'All' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'downgrade_imminent',  label: 'Downgrade imminent' },
  { key: 'distressed',          label: 'Distressed (CCC/D)' },
  { key: 'reportable',          label: 'Reportable' },
  { key: 'stale',               label: 'Monitoring stale' },
  { key: 'article_6',           label: 'Article 6' },
  { key: 'ccp_aligned',         label: 'CCP-aligned' },
  { key: 'institutional',       label: 'Institutional' },
  { key: 'premium',             label: 'Premium' },
  { key: 'standard',            label: 'Standard' },
];

const FILTER_ROW_STATE: Array<{ key: string; label: string }> = [
  { key: 'rating_requested',       label: 'Rating requested' },
  { key: 'desk_review',            label: 'Desk review' },
  { key: 'methodology_score',      label: 'Methodology' },
  { key: 'additionality_score',    label: 'Additionality' },
  { key: 'permanence_score',       label: 'Permanence' },
  { key: 'leakage_score',          label: 'Leakage' },
  { key: 'cobenefit_score',        label: 'Co-benefits' },
  { key: 'composite_score',        label: 'Composite' },
  { key: 'published',              label: 'Published' },
  { key: 'monitoring',             label: 'Monitoring' },
  { key: 're_rated',               label: 'Re-rated' },
  { key: 'downgraded',             label: 'Downgraded' },
];

const TIERS = new Set<string>(['basic', 'standard', 'premium', 'institutional']);

function fmtHrs(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  if (Math.abs(h) >= 24) return `${(h / 24).toFixed(1)}d`;
  return `${h.toFixed(0)}h`;
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

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(1);
}

function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString();
}

export function CreditRatingChainTab() {
  const [rows, setRows] = useState<CcrRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<CcrRow | null>(null);
  const [events, setEvents] = useState<CcrEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: CcrRow[] } }>('/carbon/credit-rating/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setKpis(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load carbon credit ratings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { case: CcrRow; events: CcrEvent[] } }>(`/carbon/credit-rating/chain/${id}`);
      if (res.data?.data?.case) setSelected(res.data.data.case);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load rating history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')                return true;
      if (filter === 'active')             return !r.is_terminal;
      if (filter === 'breached')           return !!(r.sla_breached_live || r.sla_breached);
      if (filter === 'downgrade_imminent') return !!r.downgrade_imminent_live;
      if (filter === 'distressed')         return !!r.distressed_live;
      if (filter === 'reportable')         return !!r.is_reportable_flag;
      if (filter === 'stale')              return !!r.monitoring_data_stale_live;
      if (filter === 'article_6')          return !!r.article_6_authorised;
      if (filter === 'ccp_aligned')        return !!r.ccp_aligned_project;
      if (TIERS.has(filter))               return r.current_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/carbon/credit-rating/chain/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      {/* UX revisit 2026-05-30 — KPI strip reordered so the FOUR numbers the
          ratings desk opens the workstation FOR (SLA breached, Downgrade
          imminent, Distressed CCC/D, Article 6 institutional) sit left of
          total/active counts. Total scope tonnes stays right. */}
      <div className="grid grid-cols-8 gap-3">
        <Kpi label="SLA breached" value={kpis?.breached ?? 0} tone={(kpis?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Downgrade imminent" value={kpis?.downgrade_imminent_count ?? 0} tone={(kpis?.downgrade_imminent_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Distressed (CCC/D)" value={kpis?.distressed_count ?? 0} tone={(kpis?.distressed_count ?? 0) > 0 ? 'bad' : 'ok'} />
        <Kpi label="Article 6" value={kpis?.article_6_count ?? 0} />
        <Kpi label="Institutional tier" value={kpis?.institutional_count ?? 0} />
        <Kpi label="Active" value={kpis?.active_count ?? 0} />
        <Kpi label="Total" value={kpis?.total ?? 0} />
        <Kpi label="Avg composite" value={fmtScore(kpis?.avg_composite_score ?? 0)} />
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
              <th className="px-3 py-2 text-left">Rating #</th>
              <th className="px-3 py-2 text-left">Project / Issuer</th>
              <th className="px-3 py-2 text-right">Scope (tCO2e)</th>
              <th className="px-3 py-2 text-right">Composite</th>
              <th className="px-3 py-2 text-center">Band</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Δ SLA</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-[#6b7685]">No carbon credit ratings match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const tierTone  = TIER_TONE[r.current_tier];
              const band = r.rating_band_live ?? r.rating_band;
              const bandTone = band ? BAND_TONE[band] : null;
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.rating_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={`${r.project_name ?? r.project_id} · ${r.issuer_name ?? r.issuer_id}`}>
                    {r.project_name ?? r.project_id}
                    <span className="text-[#6b7685]"> · {r.issuer_name ?? r.issuer_id}</span>
                    {!!r.article_6_authorised && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fde0e0] text-[#9b1f1f]">ART 6</span>}
                    {!!r.ccp_aligned_project && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#daf5e2] text-[#1f6b3a]">CCP</span>}
                    {(r.floor_flag_count_live ?? 0) >= 2 && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-[#fff4d6] text-[#a06200]">FLOOR</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{fmtTco2e(r.scope_scale_tonnes)}</td>
                  <td className="px-3 py-2 text-right text-[12px] tabular-nums">{fmtScore(r.composite_score)}</td>
                  <td className="px-3 py-2 text-center">
                    {bandTone && band ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: bandTone.bg, color: bandTone.fg }}>
                        {band}
                      </span>
                    ) : (
                      <span className="text-[#6b7685]">—</span>
                    )}
                  </td>
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
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${(r.sla_breached_live || r.sla_breached) ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                    {r.is_terminal ? '—' : fmtHrs(r.sla_hours_remaining_live)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <CcrDrawer
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

function CcrDrawer({
  row, events, onClose, doAction,
}: {
  row: CcrRow;
  events: CcrEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = row.chain_status;
  const transitionable = !row.is_terminal;
  const withdrawable = ['rating_requested', 'desk_review', 'methodology_score', 'additionality_score',
    'permanence_score', 'leakage_score', 'cobenefit_score', 'composite_score'].includes(cs);
  const escalatable = !row.is_terminal;
  const downgradable = cs === 'monitoring' || cs === 're_rating_triggered';
  const remediable = cs === 'downgraded';
  const urgencyTone = row.urgency_band_live ? URGENCY_TONE[row.urgency_band_live] : null;
  const authorityNow = row.authority_required_live ?? row.authority_required ?? null;
  const band = row.rating_band_live ?? row.rating_band;
  const priorBand = row.prior_rating_band;
  const bandTone = band ? BAND_TONE[band] : null;
  const priorBandTone = priorBand ? BAND_TONE[priorBand] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-stretch justify-end oe-overlay-in" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl shadow-xl overflow-y-auto oe-drawer-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-start justify-between sticky top-0 bg-white z-10">
          <div className="flex gap-4 items-start">
            {bandTone && band && (
              <div className="flex flex-col items-center">
                <div className="px-3 py-2 rounded-md text-[20px] font-bold tabular-nums" style={{ background: bandTone.bg, color: bandTone.fg }}>
                  {band}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-[#6b7685] mt-1">S&amp;P band</div>
              </div>
            )}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Carbon credit rating {row.rating_number}</div>
              <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">
                {row.project_name ?? row.project_id} · {row.issuer_name ?? row.issuer_id}
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
                {(row.floor_flag_count_live ?? 0) >= 1 && (
                  <span className="px-2 py-0.5 rounded-full font-bold bg-[#fff4d6] text-[#a06200]">
                    FLOOR ({row.floor_flag_count_live} flag{(row.floor_flag_count_live ?? 0) === 1 ? '' : 's'})
                  </span>
                )}
                {row.is_reportable_flag && (
                  <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Regulator reportable</span>
                )}
                {authorityNow && (
                  <span className="px-2 py-0.5 rounded-full bg-[#dbecfb] text-[#1a3a5c] font-medium">Auth: {AUTH_LABEL[authorityNow]}</span>
                )}
                {!!row.article_6_authorised && (
                  <span className="px-2 py-0.5 rounded-full bg-[#fde0e0] text-[#9b1f1f] font-medium">Article 6 authorised</span>
                )}
                {!!row.ccp_aligned_project && (
                  <span className="px-2 py-0.5 rounded-full bg-[#daf5e2] text-[#1f6b3a] font-medium">CCP-aligned</span>
                )}
                {row.downgrade_imminent_live && (
                  <span className="px-2 py-0.5 rounded-full bg-[#fbd0d0] text-[#7a1414] font-bold">Downgrade imminent</span>
                )}
                {row.investment_grade_live && (
                  <span className="px-2 py-0.5 rounded-full bg-[#daf5e2] text-[#1f6b3a] font-medium">Investment grade</span>
                )}
                {row.distressed_live && (
                  <span className="px-2 py-0.5 rounded-full bg-[#fbd0d0] text-[#7a1414] font-bold">Distressed</span>
                )}
                {row.monitoring_data_stale_live && (
                  <span className="px-2 py-0.5 rounded-full bg-[#fff4d6] text-[#a06200] font-medium">Monitoring stale</span>
                )}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          {/* 5 sub-score panel + composite */}
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Live 5-pillar scoring battery</div>
            <div className="grid grid-cols-5 gap-3">
              <Pair label="Methodology (25%)" value={fmtScore(row.methodology_score)} />
              <Pair label="Additionality (25%)" value={fmtScore(row.additionality_score)} />
              <Pair label="Permanence (20%)" value={fmtScore(row.permanence_score)} />
              <Pair label="Leakage (15%)" value={fmtScore(row.leakage_score)} />
              <Pair label="Co-benefits (15%)" value={fmtScore(row.cobenefit_score)} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Composite (0-100)" value={fmtScore(row.composite_score)} />
              <Pair label="ICROA bonus" value={row.icroa_aligned ? '+5' : '—'} />
              <Pair label="Completeness" value={`${row.rating_completeness_index_live ?? 0} / 100`} />
            </div>
            {row.prior_composite_score != null && (
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
                <Pair label="Prior composite" value={fmtScore(row.prior_composite_score)} />
                <Pair label="Prior band" value={priorBand ?? '—'} />
                <Pair label="Drop vs prior" value={fmtPct(row.composite_drop_pct_live, 2)} />
              </div>
            )}
          </div>

          {/* S&P 8-band ladder visualisation */}
          {band && bandTone && (
            <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">S&amp;P-style 8-band ladder</div>
              <div className="flex gap-1">
                {(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'] as RatingBand[]).map((b) => {
                  const tone = BAND_TONE[b];
                  const active = b === band;
                  const wasPrior = b === priorBand;
                  return (
                    <div key={b} className="flex-1 text-center">
                      <div
                        className={`py-1.5 px-1 rounded text-[12px] font-bold border-2 ${active ? 'shadow-md' : 'opacity-60'}`}
                        style={{
                          background: tone.bg,
                          color: tone.fg,
                          borderColor: active ? '#0f1c2e' : 'transparent',
                        }}>
                        {b}
                      </div>
                      {active && <div className="text-[9px] mt-0.5 text-[#0f1c2e] font-semibold">CURRENT</div>}
                      {wasPrior && !active && <div className="text-[9px] mt-0.5 text-[#a06200]">prior</div>}
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-[#6b7685] mt-2">
                AAA-BBB investment-grade · BB-B speculative · CCC/D distressed (W42 buffer pool eligible)
              </div>
            </div>
          )}

          {/* 5 floor-flag pills */}
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Floor-at-premium flags ({row.floor_flag_count_live ?? 0} / 5)</div>
            <div className="grid grid-cols-2 gap-2">
              <FlagPill on={!!row.afolu_high_reversal_risk} label="AFOLU high reversal risk" />
              <FlagPill on={!!row.methodology_under_review} label="Methodology under review" />
              <FlagPill on={!!row.external_credit_red_flag} label="External red flag" />
              <FlagPill on={!!row.ccp_aligned_project} label="CCP-aligned project" />
              <FlagPill on={!!row.article_6_authorised} label="Article 6 authorised" />
              <FlagPill on={!!row.institutional_buyer} label="Institutional buyer" />
            </div>
          </div>

          {/* 3-bridge architecture */}
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Bridges to sibling carbon chains</div>
            <div className="grid grid-cols-3 gap-3">
              <BridgePill on={!!row.bridges_to_registration_chain_live} label="W37 Registration PDD" ref_={row.registration_chain_ref} />
              <BridgePill on={!!row.bridges_to_mrv_chain_live} label="W11 MRV verification" ref_={row.mrv_chain_ref} />
              <BridgePill on={!!row.bridges_to_reversal_chain_live} label="W42 Reversal/buffer pool" ref_={row.reversal_chain_ref} />
            </div>
          </div>

          {/* Project + monitoring + vintage */}
          <div className="bg-[#f7f9fb] border border-[#e5ebf2] rounded-lg p-3">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Project, vintage &amp; monitoring</div>
            <div className="grid grid-cols-3 gap-3">
              <Pair label="Vintage year" value={fmtCount(row.credit_vintage_year)} />
              <Pair label="Vintage age" value={`${row.vintage_age_years_live ?? row.vintage_age_years} yrs`} />
              <Pair label="Multi-vintage" value={row.multi_vintage ? 'Yes' : 'No'} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Scope (tCO2e)" value={fmtTco2e(row.scope_scale_tonnes)} />
              <Pair label="Methodology" value={row.methodology_name ?? row.methodology_id ?? '—'} />
              <Pair label="Registry" value={row.registry_name ?? '—'} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[#e5ebf2]">
              <Pair label="Last monitoring data" value={row.last_monitoring_data_at ? new Date(row.last_monitoring_data_at).toLocaleDateString() : '—'} />
              <Pair label="Freshness" value={row.monitoring_freshness_days_live != null ? `${row.monitoring_freshness_days_live}d` : '—'} />
              <Pair label="Re-rating triggers (30d)" value={fmtCount(row.rerating_count_30d_live)} />
            </div>
          </div>

          {/* Parties + SLA */}
          <div className="grid grid-cols-2 gap-4">
            {row.rater_name && <Pair label="Rater" value={row.rater_name} />}
            {row.buyer_name && <Pair label="Buyer" value={row.buyer_name} />}
            {row.regulator_inbox_ref && <Pair label="Regulator inbox" value={row.regulator_inbox_ref} />}
            {row.regulator_ref && <Pair label="Regulator ref" value={row.regulator_ref} />}
            {row.downgrade_reason && <Pair label="Downgrade reason" value={row.downgrade_reason} />}
            {row.withdraw_reason && <Pair label="Withdraw reason" value={row.withdraw_reason} />}
            {row.integrity_reason && <Pair label="Integrity reason" value={row.integrity_reason} />}
            {row.remediation_narrative && <Pair label="Remediation" value={row.remediation_narrative} />}
            {row.reason_code && <Pair label="Reason code" value={row.reason_code} />}
          </div>

          {row.sla_deadline_at && !row.is_terminal && (
            <Pair label="Next SLA" value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtHrs(row.sla_hours_remaining_live)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'rating_requested' && (
                  <ActionBtn label="Start desk review (rater)" onClick={() => { void doAction('start-desk-review', {}); }} />
                )}
                {cs === 'desk_review' && (
                  <ActionBtn label="Score methodology (0-100)" onClick={() => {
                    const s = window.prompt('Methodology score (0-100):') ?? undefined;
                    void doAction('score-methodology', { score: s ? Number(s) : undefined });
                  }} />
                )}
                {cs === 'methodology_score' && (
                  <ActionBtn label="Score additionality (0-100)" onClick={() => {
                    const s = window.prompt('Additionality score (0-100):') ?? undefined;
                    void doAction('score-additionality', { score: s ? Number(s) : undefined });
                  }} />
                )}
                {cs === 'additionality_score' && (
                  <ActionBtn label="Score permanence (0-100)" onClick={() => {
                    const s = window.prompt('Permanence score (0-100):') ?? undefined;
                    void doAction('score-permanence', { score: s ? Number(s) : undefined });
                  }} />
                )}
                {cs === 'permanence_score' && (
                  <ActionBtn label="Score leakage (0-100)" onClick={() => {
                    const s = window.prompt('Leakage score (0-100):') ?? undefined;
                    void doAction('score-leakage', { score: s ? Number(s) : undefined });
                  }} />
                )}
                {cs === 'leakage_score' && (
                  <ActionBtn label="Score co-benefits (0-100)" onClick={() => {
                    const s = window.prompt('Co-benefits score (0-100):') ?? undefined;
                    void doAction('score-cobenefits', { score: s ? Number(s) : undefined });
                  }} />
                )}
                {cs === 'cobenefit_score' && (
                  <ActionBtn label="Compute composite (rater)" tone="good" onClick={() => { void doAction('compute-composite', {}); }} />
                )}
                {cs === 'composite_score' && (
                  <ActionBtn label="Publish rating (ratings committee)" tone="good" onClick={() => { void doAction('publish-rating', {}); }} />
                )}
                {cs === 'published' && (
                  <ActionBtn label="Start monitoring (live)" onClick={() => {
                    const d = window.prompt('Last monitoring data timestamp (ISO 8601, optional):') ?? undefined;
                    void doAction('start-monitoring', { last_monitoring_data_at: d });
                  }} />
                )}
                {cs === 'monitoring' && (
                  <ActionBtn label="Trigger re-rating" onClick={() => { void doAction('trigger-rerating', {}); }} />
                )}
                {cs === 're_rating_triggered' && (
                  <ActionBtn label="Re-rate (refresh 5 sub-scores)" tone="good" onClick={() => {
                    const m = window.prompt('New methodology score (optional):') ?? undefined;
                    const a = window.prompt('New additionality score (optional):') ?? undefined;
                    const p = window.prompt('New permanence score (optional):') ?? undefined;
                    const l = window.prompt('New leakage score (optional):') ?? undefined;
                    const c = window.prompt('New co-benefits score (optional):') ?? undefined;
                    void doAction('rerate', {
                      methodology_score: m ? Number(m) : undefined,
                      additionality_score: a ? Number(a) : undefined,
                      permanence_score: p ? Number(p) : undefined,
                      leakage_score: l ? Number(l) : undefined,
                      cobenefit_score: c ? Number(c) : undefined,
                    });
                  }} />
                )}
                {downgradable && (
                  <ActionBtn label="Downgrade (regulator EVERY tier on drop ≥20% or CCC/D)" tone="bad" onClick={() => {
                    const reason = window.prompt('Downgrade reason:') ?? undefined;
                    void doAction('downgrade', { downgrade_reason: reason });
                  }} />
                )}
                {withdrawable && (
                  <ActionBtn label="Withdraw rating (issuer-dispute = regulator EVERY tier)" tone="bad" onClick={() => {
                    const reason = window.prompt('Withdraw reason:') ?? undefined;
                    const disputed = window.confirm('Is the issuer disputing this withdrawal?');
                    void doAction('withdraw', { withdraw_reason: reason, issuer_disputed: disputed });
                  }} />
                )}
                {escalatable && (
                  <ActionBtn label="Escalate to integrity (fraud → W42 reversal)" tone="bad" onClick={() => {
                    const reason = window.prompt('Integrity escalation reason:') ?? undefined;
                    void doAction('escalate-to-integrity', { integrity_reason: reason });
                  }} />
                )}
              </div>
            </div>
          )}

          {remediable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Issuer remediation</div>
              <ActionBtn label="Remediate (issuer) — re-enter monitoring" tone="good" onClick={() => {
                const narrative = window.prompt('Remediation narrative:') ?? undefined;
                void doAction('remediate', { remediation_narrative: narrative });
              }} />
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
                        <span className="text-[#6b7685]"> · {e.from_status} {'→'} {e.to_status}</span>
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

function BridgePill({ on, label, ref_ }: { on: boolean; label: string; ref_: string | null }) {
  return (
    <div className={`px-2 py-2 rounded-md text-[12px] ${on ? 'bg-[#daf5e2] text-[#1f6b3a] border border-[#9ed8b0]' : 'bg-[#f7f9fb] text-[#6b7685] border border-[#e5ebf2]'}`}>
      <div className="flex items-center gap-2 font-semibold">
        <span className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-[#1f6b3a]' : 'bg-[#cbd5e0]'}`} />
        <span>{label}</span>
      </div>
      {ref_ && <div className="font-mono text-[10px] mt-1 text-[#557]">{ref_}</div>}
      {!ref_ && <div className="text-[10px] mt-1 text-[#6b7685]">No bridge wired</div>}
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
