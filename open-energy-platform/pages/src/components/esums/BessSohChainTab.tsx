// Wave 88 — Esums BESS State-of-Health Monitoring & Capacity-Augmentation tab.
//
// Every grid-connected BESS carries a contractual capacity guarantee — typically a
// state-of-health floor (e.g. >= 70% nameplate after 10 years). Capacity fades
// through calendar + cycle ageing. Once the SOH dips below the contracted floor
// the operator owes either an AUGMENTATION (install fresh modules) or a financial
// make-good. W88 puts the whole lifecycle on a 12-state P6 chain with a live
// health + economics battery, auto-derived tier, urgency-band SLA and a regulator
// hard line on augmentation / decommission for grid-connected >= 50 MW BESS
// (NERSA Grid Code security-of-supply).
//
//   • KPI strip: total / open / dispute / SLA breached / >=50 MW / reportable /
//     augmentation NPV ZAR
//   • Filter pills by tier + chain state + dispute + SLA breach + reportable
//   • Listing with tier pill + SOH vs floor + URGENT SLA countdown + shortfall MWh
//   • Drill-down: the live health + economics battery (SOH headroom %, fade rate,
//     EFC, cycle attribution, shortfall MWh, augmentation CapEx, capacity-payment
//     at risk, augmentation NPV, warranty eligibility, predicted decommission
//     years), party-tagged timeline + per-state actions
//
// Single-party write: the Esums asset-health desk operates the chain; actor_party
// records operator / oem / owner / regulator per step.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'baseline_set' | 'monitoring_active' | 'drift_detected' | 'assessment_pending'
  | 'augmentation_required' | 'augmentation_planned' | 'augmentation_in_progress'
  | 'augmentation_complete' | 'recommissioned' | 'disputed'
  | 'decommissioned' | 'cancelled';

type Tier = 'nominal' | 'watch' | 'material' | 'critical';
type Urgency = 'critical' | 'high' | 'medium' | 'low';

interface BsohRow {
  [key: string]: unknown;
  id: string;
  programme_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  bess_id: string;
  bess_reference: string;
  site_id: string;
  site_name: string;
  owner_id: string;
  owner_name: string;
  operator_id: string;
  operator_name: string;
  oem_id: string | null;
  oem_name: string | null;
  installed_capacity_mw: number;
  nameplate_energy_mwh: number;
  duration_hours: number;
  chemistry: string | null;
  commissioning_date: string;
  years_in_service: number;
  baseline_soh_pct: number;
  current_soh_pct: number;
  contractual_floor_pct: number;
  end_of_life_threshold_pct: number;
  warranty_end_date: string | null;
  warranty_years_remaining: number;
  total_throughput_mwh: number;
  equivalent_full_cycles: number;
  cycle_fade_attribution_pct: number;
  annualised_fade_rate_pct: number;
  capacity_shortfall_mwh: number;
  augmentation_capex_zar: number;
  capacity_payment_at_risk_zar: number;
  augmentation_npv_zar: number;
  augmentation_works_ref: string | null;
  augmentation_completed_mwh: number | null;
  dispute_ground: string | null;
  dispute_resolution_ref: string | null;
  warranty_recovery_eligible: number;
  warranty_recovery_amount_zar: number | null;
  soh_tier: Tier;
  programme_basis: string | null;
  reason_code: string | null;
  programme_summary: string | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable_flag?: boolean;
  breach_crosses_regulator?: boolean;
  soh_headroom_pct_live?: number;
  annualised_fade_rate_pct_live?: number;
  equivalent_full_cycles_live?: number;
  cycle_fade_attribution_pct_live?: number;
  capacity_shortfall_mwh_live?: number;
  augmentation_capex_zar_live?: number;
  capacity_payment_at_risk_zar_live?: number;
  augmentation_npv_zar_live?: number;
  warranty_recovery_eligible_live?: boolean;
  predicted_decommission_years_live?: number;
  sla_days_remaining_live?: number;
  urgency_band_live?: Urgency;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  monitoring_count: number;
  drift_count: number;
  assessment_count: number;
  augmentation_required_count: number;
  augmentation_planned_count: number;
  augmentation_in_progress_count: number;
  augmentation_complete_count: number;
  recommissioned_count: number;
  disputed_count: number;
  decommissioned_count: number;
  cancelled_count: number;
  breached: number;
  reportable_total: number;
  total_installed_capacity_mw: number;
  total_nameplate_energy_mwh: number;
  total_capacity_shortfall_mwh: number;
  total_augmentation_capex_zar: number;
  total_capacity_at_risk_zar: number;
  total_augmentation_npv_zar: number;
  warranty_eligible_count: number;
  critical_urgency_count: number;
  critical_tier_count: number;
  material_tier_count: number;
  ge_50mw_count: number;
}

const ALL_STATES = [
  'baseline_set',
  'monitoring_active',
  'drift_detected',
  'assessment_pending',
  'augmentation_required',
  'augmentation_planned',
  'augmentation_in_progress',
  'augmentation_complete',
  'recommissioned',
] as const;

const BRANCH_STATES = [
  'disputed',
  'decommissioned',
  'cancelled',
] as const;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                   label: 'Active (pre-terminal)' },
  { key: 'all',                      label: 'All' },
  { key: 'critical',                 label: 'Critical' },
  { key: 'material',                 label: 'Material' },
  { key: 'watch',                    label: 'Watch' },
  { key: 'nominal',                  label: 'Nominal' },
  { key: 'monitoring_active',        label: 'Monitoring' },
  { key: 'drift_detected',           label: 'Drift' },
  { key: 'assessment_pending',       label: 'Assessment' },
  { key: 'augmentation_required',    label: 'Aug required' },
  { key: 'augmentation_planned',     label: 'Aug planned' },
  { key: 'augmentation_in_progress', label: 'Works' },
  { key: 'augmentation_complete',    label: 'Works done' },
  { key: 'recommissioned',           label: 'Recommissioned' },
  { key: 'disputed',                 label: 'Disputed' },
  { key: 'decommissioned',           label: 'Decommissioned' },
  { key: 'breached',                 label: 'SLA breached' },
  { key: 'reportable',               label: 'Reportable' },
];

const TIERS = new Set<string>(['nominal', 'watch', 'material', 'critical']);

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R${(v / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000)     return `R${(v / 1_000).toFixed(0)}k`;
  return `R${v.toFixed(0)}`;
}

function fmtMwh(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} MWh`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(1)}%`;
}

function getActions(row: BsohRow): ChainAction[] {
  const cs = row.chain_status;
  const actions: ChainAction[] = [];

  if (cs === 'baseline_set') {
    actions.push({
      key: 'activate-monitoring',
      label: 'Activate monitoring (operator)',
      tone: 'primary',
      fields: [
        { key: 'current_soh_pct',       label: 'Current SOH % (defaults to baseline)',  type: 'text' },
        { key: 'total_throughput_mwh',  label: 'Total throughput MWh (optional)',        type: 'text' },
        { key: 'programme_basis',       label: 'Programme basis (optional)',             type: 'textarea' },
      ],
    });
  }

  if (cs === 'monitoring_active') {
    actions.push({
      key: 'detect-drift',
      label: 'Detect drift (operator)',
      tone: 'danger',
      fields: [
        { key: 'current_soh_pct',       label: 'Current SOH % (drift reading)',                        type: 'text' },
        { key: 'total_throughput_mwh',  label: 'Total throughput MWh (optional)',                      type: 'text' },
        { key: 'programme_basis',       label: 'Drift basis (e.g. cycle fade vs contractual curve)',   type: 'textarea' },
      ],
    });
  }

  if (cs === 'drift_detected' || cs === 'disputed') {
    actions.push({
      key: 'assess-cause',
      label: 'Assess cause (operator)',
      tone: 'primary',
      fields: [
        { key: 'current_soh_pct',               label: 'Current SOH % (optional)',                                      type: 'text' },
        { key: 'cycle_fade_attribution_pct',     label: 'Cycle attribution % (e.g. 65 if cycle-dominated)',              type: 'text' },
        { key: 'programme_basis',                label: 'Assessment basis (cycle / calendar / cell-imbalance / thermal)', type: 'textarea' },
      ],
    });
  }

  if (cs === 'assessment_pending') {
    actions.push({
      key: 'require-augmentation',
      label: 'Require augmentation (operator)',
      tone: 'danger',
      fields: [
        { key: 'current_soh_pct',              label: 'Confirmed SOH % (drives tier)',                     type: 'text' },
        { key: 'augmentation_capex_per_kwh',   label: 'Augmentation CapEx per kWh ZAR (default 6500)',    type: 'text' },
        { key: 'capacity_rate_per_mw_year',    label: 'Capacity rate ZAR / MW-yr (default 1,200,000)',    type: 'text' },
        { key: 'residual_warranty_years',      label: 'Residual warranty years (optional)',               type: 'text' },
        { key: 'discount_rate_pct',            label: 'Discount rate % (default 12)',                     type: 'text' },
      ],
    });
  }

  if (cs === 'augmentation_required') {
    actions.push({
      key: 'plan-augmentation',
      label: 'Plan augmentation (owner)',
      tone: 'primary',
      fields: [
        { key: 'augmentation_works_ref',       label: 'Augmentation works reference',                       type: 'text', required: true },
        { key: 'augmentation_capex_per_kwh',   label: 'Augmentation CapEx per kWh ZAR (optional override)', type: 'text' },
      ],
    });
  }

  if (cs === 'augmentation_planned') {
    actions.push({
      key: 'start-works',
      label: 'Start works (OEM)',
      tone: 'primary',
      fields: [
        { key: 'augmentation_works_ref', label: 'Works mobilisation reference (optional)', type: 'text' },
      ],
    });
  }

  if (cs === 'augmentation_in_progress') {
    actions.push({
      key: 'complete-works',
      label: 'Complete works (OEM)',
      tone: 'primary',
      fields: [
        { key: 'augmentation_completed_mwh', label: 'Augmentation completed MWh', type: 'text', required: true },
        { key: 'current_soh_pct',            label: 'Post-works SOH %',           type: 'text', required: true },
      ],
    });
  }

  if (cs === 'augmentation_complete') {
    actions.push({
      key: 'recommission',
      label: 'Recommission (owner)',
      tone: 'primary',
      fields: [
        { key: 'current_soh_pct', label: 'Final SOH % at recommissioning', type: 'text', required: true },
      ],
    });
  }

  if (['drift_detected', 'assessment_pending', 'augmentation_required'].includes(cs)) {
    actions.push({
      key: 'raise-dispute',
      label: 'Raise SOH dispute (owner)',
      tone: 'danger',
      fields: [
        { key: 'dispute_ground', label: 'Dispute ground (methodology / measurement / curve)', type: 'textarea', required: true },
      ],
    });
  }

  if (cs === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute (operator)',
      tone: 'primary',
      fields: [
        { key: 'dispute_resolution_ref', label: 'Dispute resolution reference',            type: 'text', required: true },
        { key: 'current_soh_pct',        label: 'Agreed SOH % post-resolution (optional)', type: 'text' },
      ],
    });
  }

  if (['monitoring_active', 'drift_detected', 'assessment_pending', 'augmentation_required', 'augmentation_planned', 'augmentation_in_progress', 'augmentation_complete', 'disputed'].includes(cs)) {
    actions.push({
      key: 'decommission',
      label: 'Decommission (owner)',
      tone: 'danger',
      fields: [
        { key: 'current_soh_pct', label: 'Final SOH % at decommissioning', type: 'text' },
      ],
    });
  }

  if (cs === 'baseline_set') {
    actions.push({
      key: 'cancel-programme',
      label: 'Cancel programme (opened in error)',
      tone: 'warn',
      fields: [
        { key: 'reason_code', label: 'Reason code (optional)', type: 'text' },
      ],
    });
  }

  return actions;
}

function renderDetail(row: BsohRow): React.ReactNode {
  return (
    <div className="space-y-3" style={{ fontSize: 12 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>SOH window</div>
        <div className="grid grid-cols-4 gap-3">
          <DetailPair label="Baseline"          value={fmtPct(row.baseline_soh_pct)} />
          <DetailPair label="Current SOH"       value={fmtPct(row.current_soh_pct)} />
          <DetailPair label="Contracted floor"  value={fmtPct(row.contractual_floor_pct)} />
          <DetailPair label="Headroom"          value={fmtPct(row.soh_headroom_pct_live)} />
          <DetailPair label="Fade rate"         value={`${(row.annualised_fade_rate_pct_live ?? 0).toFixed(2)} %/yr`} />
          <DetailPair label="EFC"               value={(row.equivalent_full_cycles_live ?? 0).toFixed(1)} />
          <DetailPair label="Cycle attribution" value={fmtPct(row.cycle_fade_attribution_pct_live)} />
          <DetailPair label="Predicted EoL"     value={`${(row.predicted_decommission_years_live ?? 0).toFixed(1)} yr`} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>Augmentation economics</div>
        <div className="grid grid-cols-4 gap-3">
          <DetailPair label="Shortfall"                     value={fmtMwh(row.capacity_shortfall_mwh_live)} />
          <DetailPair label="Augmentation CapEx"            value={fmtZar(row.augmentation_capex_zar_live)} />
          <DetailPair label="Capacity payment at risk / yr" value={fmtZar(row.capacity_payment_at_risk_zar_live)} />
          <DetailPair label="Augmentation NPV"              value={fmtZar(row.augmentation_npv_zar_live)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DetailPair label="Owner"            value={row.owner_name} />
        <DetailPair label="Operator"         value={row.operator_name} />
        {row.oem_name                        && <DetailPair label="OEM"              value={row.oem_name} />}
        <DetailPair label="Commissioning"    value={row.commissioning_date} />
        <DetailPair label="Years in service" value={row.years_in_service.toFixed(1)} />
        {row.chemistry                       && <DetailPair label="Chemistry"        value={row.chemistry} />}
        {row.warranty_end_date               && <DetailPair label="Warranty end"     value={row.warranty_end_date} />}
        <DetailPair label="Duration"         value={`${row.duration_hours} hr`} />
        {row.augmentation_works_ref          && <DetailPair label="Works ref"        value={row.augmentation_works_ref} />}
        {row.augmentation_completed_mwh != null && <DetailPair label="Completed MWh" value={fmtMwh(row.augmentation_completed_mwh)} />}
        {row.dispute_ground                  && <DetailPair label="Dispute ground"   value={row.dispute_ground} />}
        {row.dispute_resolution_ref          && <DetailPair label="Dispute resolution" value={row.dispute_resolution_ref} />}
        {row.reason_code                     && <DetailPair label="Reason code"      value={row.reason_code} />}
      </div>

      {row.programme_basis   && <DetailPair label="Programme basis"   value={row.programme_basis} />}
      {row.programme_summary && <DetailPair label="Programme summary" value={row.programme_summary} />}
      {row.source_wave       && (
        <DetailPair
          label="Provenance"
          value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`}
        />
      )}
      {row.sla_deadline_at && !row.is_terminal && (
        <DetailPair
          label="Next SLA"
          value={`${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})${row.escalation_level > 0 ? ` · ${row.escalation_level} breach(es)` : ''}`}
        />
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {row.installed_capacity_mw >= 50 && (
          <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: 'oklch(0.96 0.05 55)', color: WARN }}>NERSA ≥50 MW</span>
        )}
        {row.is_reportable_flag && (
          <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 500, background: 'oklch(0.97 0.04 20)', color: BAD }}>Regulator reportable</span>
        )}
        {row.warranty_recovery_eligible_live && (
          <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 500, background: 'oklch(0.95 0.04 155)', color: GOOD }}>Warranty eligible</span>
        )}
      </div>
    </div>
  );
}

export function BessSohChainTab() {
  const [rows, setRows]                     = useState<BsohRow[]>([]);
  const [summary, setSummary]               = useState<KpiData | null>(null);
  const [loading, setLoading]               = useState(true);
  const [err, setErr]                       = useState<string | null>(null);
  const [filter, setFilter]                 = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: BsohRow[] } }>('/bess-soh/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setSummary(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load BESS SOH programmes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      const numFields = new Set([
        'current_soh_pct', 'total_throughput_mwh', 'cycle_fade_attribution_pct',
        'augmentation_capex_per_kwh', 'capacity_rate_per_mw_year', 'residual_warranty_years',
        'discount_rate_pct', 'augmentation_completed_mwh',
      ]);
      const body: Record<string, string | number | undefined> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined) continue;
        body[k] = numFields.has(k) ? Number(v) : v;
      }
      await api.post(`/bess-soh/chain/${rowId}/${key}`, body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: BsohRow; events: ChainEvent[] } }>(`/bess-soh/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
      if (res.data?.data?.case) {
        setRows(prev => prev.map(r => r.id === id ? (res.data.data.case as BsohRow) : r));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load programme history');
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'reportable') return !!r.is_reportable_flag;
      if (TIERS.has(filter))       return r.soh_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div className="space-y-3" style={{ background: BG, minHeight: 0 }}>
      {/* KPI strip */}
      <div className="grid grid-cols-7 gap-3">
        <KpiTile label="Total"          value={summary?.total ?? 0} />
        <KpiTile label="Open"           value={summary?.open_count ?? 0} />
        <KpiTile label="Disputed"       value={summary?.disputed_count ?? 0}         tone={(summary?.disputed_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached"   value={summary?.breached ?? 0}               tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="≥50 MW (NERSA)" value={summary?.ge_50mw_count ?? 0}         tone={(summary?.ge_50mw_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Reportable"     value={summary?.reportable_total ?? 0}       tone={(summary?.reportable_total ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="Aug NPV"        value={fmtZar(summary?.total_augmentation_npv_zar ?? 0)} tone={(summary?.total_augmentation_npv_zar ?? 0) >= 0 ? 'ok' : 'bad'} />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 500,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
              background: filter === f.key ? ACC : BG1,
              color: filter === f.key ? '#fff' : TX2,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ padding: '8px 12px', background: 'oklch(0.97 0.04 20)', color: BAD, borderRadius: 6, fontSize: 12 }}>
          {err}
        </div>
      )}

      {/* Chain cards */}
      <div className="space-y-2">
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: TX3, fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: TX3, fontSize: 13 }}>No SOH programmes match the current filter.</div>
        ) : filtered.map((r) => {
          const headroom = r.soh_headroom_pct_live ?? (r.current_soh_pct - r.contractual_floor_pct);
          const meta = (
            <span style={{ fontFamily: MONO, fontSize: 11, color: TX3 }}>
              {fmtPct(r.current_soh_pct)} / {fmtPct(r.contractual_floor_pct)} floor
              {' · '}
              <span style={{ color: (r.capacity_shortfall_mwh_live ?? 0) > 0 ? BAD : TX3 }}>
                {fmtMwh(r.capacity_shortfall_mwh_live)} shortfall
              </span>
              {' · '}
              <span style={{ color: headroom < 0 ? BAD : TX2, fontWeight: headroom < 0 ? 600 : 400 }}>
                {headroom >= 0 ? '+' : ''}{headroom.toFixed(1)}% headroom
              </span>
              {r.installed_capacity_mw >= 50 && (
                <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: 'oklch(0.96 0.05 55)', color: WARN }}>≥50MW</span>
              )}
              {r.sla_breached && (
                <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: 'oklch(0.97 0.04 20)', color: BAD }}>SLA BREACHED</span>
              )}
              {r.is_reportable_flag && (
                <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: 'oklch(0.97 0.04 20)', color: BAD }}>REPORTABLE</span>
              )}
            </span>
          );

          return (
            <ChainCard
              key={r.id}
              item={{ ...r, case_number: r.programme_number }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${r.site_name} · ${r.installed_capacity_mw} MW / ${r.nameplate_energy_mwh} MWh`}
              meta={meta}
              actions={r.is_terminal ? [] : getActions(r)}
              onAction={(key, values) => handleAction(r.id, key, values)}
              onExpand={handleExpand}
              events={expandedEvents[r.id]}
              detail={renderDetail(r)}
              cascadeTo={r.is_reportable_flag || r.installed_capacity_mw >= 50 ? ['regulator', 'admin'] : ['admin']}
            />
          );
        })}
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone = 'ok' }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const fg = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2, color: fg }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3 }}>{label}</div>
      <div style={{ fontSize: 12, color: TX1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default BessSohChainTab;
