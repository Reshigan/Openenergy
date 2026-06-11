// Wave 51 — Esums O&M Availability Guarantee & Liquidated Damages chain tab.
//
// Per-reporting-period reconciliation of contracted plant availability against
// the O&M contractor's guaranteed availability (IEC 61724/62446 + REIPPPP O&M
// service agreement). The availability counterpart to W24 PR underperformance —
// availability is time-based uptime; PR is energy-based yield.
//
//   • KPI strip: total / open / shortfall flagged / SLA breached / critical open
//     / LD assessed (ZAR) / settlement (ZAR)
//   • Filter pills by shortfall tier + chain state + SLA breach + reportable
//   • Listing with tier pill + URGENT SLA countdown (larger shortfall = tighter)
//   • Drill-down: timeline (owner/contractor party tags) + per-state actions
//
// Single-party write: Esums O&M operators record every party's action; the
// actor_party tag records whether the asset owner or the O&M contractor performed
// the contractual function. No create form — cases originate from W24 PR
// escalation / metering rollups and the operator field workflow.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainCardProps, type ChainEvent } from '../ChainCard';

type ChainCardItem = ChainCardProps['item'];

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
  | 'period_open' | 'measurement_submitted' | 'adjustment_review' | 'reconciled'
  | 'meets_guarantee' | 'shortfall_flagged' | 'ld_assessed' | 'cure_period'
  | 'settled' | 'disputed' | 'dispute_resolved' | 'withdrawn';

type ShortfallTier =
  | 'minor_shortfall' | 'moderate_shortfall' | 'material_shortfall'
  | 'severe_shortfall' | 'critical_shortfall';

interface GuaranteeRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  owner_party_name: string;
  contractor_party_name: string;
  site_name: string;
  site_province: string | null;
  technology: string;
  capacity_mw: number | null;
  contract_ref: string | null;
  reporting_period: string;
  period_start: string | null;
  period_end: string | null;
  guaranteed_availability_pct: number;
  bonus_threshold_pct: number | null;
  measured_availability_pct: number | null;
  excused_downtime_hours: number | null;
  adjusted_availability_pct: number | null;
  shortfall_pp: number | null;
  shortfall_tier: ShortfallTier;
  ld_rate_zar_per_pp: number | null;
  ld_cap_zar: number | null;
  ld_assessed_zar: number | null;
  bonus_zar: number | null;
  settlement_zar: number | null;
  measurement_ref: string | null;
  adjustment_ref: string | null;
  reconciliation_ref: string | null;
  ld_assessment_ref: string | null;
  cure_plan_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  regulator_ref: string | null;
  measurement_basis: string | null;
  adjustment_basis: string | null;
  shortfall_basis: string | null;
  ld_basis: string | null;
  cure_plan: string | null;
  settlement_basis: string | null;
  dispute_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  escalation_level: number;
  is_terminal?: boolean;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  sla_window_minutes?: number;
  is_reportable?: boolean;
  breach_crosses_regulator?: boolean;
  created_at: string;
}

interface KpiData {
  total: number;
  open_count: number;
  settled_count: number;
  meets_guarantee_count: number;
  shortfall_count: number;
  ld_assessed_count: number;
  cure_count: number;
  disputed_count: number;
  dispute_resolved_count: number;
  withdrawn_count: number;
  breached: number;
  reportable_total: number;
  critical_open: number;
  total_capacity_mw: number;
  total_ld_assessed_zar: number;
  total_bonus_zar: number;
  total_settlement_zar: number;
}

const ALL_STATES = [
  'period_open',
  'measurement_submitted',
  'adjustment_review',
  'reconciled',
  'shortfall_flagged',
  'ld_assessed',
  'cure_period',
  'settled',
] as const;

const BRANCH_STATES = [
  'meets_guarantee',
  'disputed',
  'dispute_resolved',
  'withdrawn',
] as const;

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                label: 'Active (pre-terminal)' },
  { key: 'all',                   label: 'All' },
  { key: 'critical_shortfall',    label: 'Critical' },
  { key: 'severe_shortfall',      label: 'Severe' },
  { key: 'material_shortfall',    label: 'Material' },
  { key: 'moderate_shortfall',    label: 'Moderate' },
  { key: 'minor_shortfall',       label: 'Minor' },
  { key: 'measurement_submitted', label: 'Measurement' },
  { key: 'adjustment_review',     label: 'Adjustment review' },
  { key: 'reconciled',            label: 'Reconciled' },
  { key: 'meets_guarantee',       label: 'Meets guarantee' },
  { key: 'shortfall_flagged',     label: 'Shortfall flagged' },
  { key: 'ld_assessed',           label: 'LD assessed' },
  { key: 'cure_period',           label: 'Cure period' },
  { key: 'disputed',              label: 'Disputed' },
  { key: 'settled',               label: 'Settled' },
  { key: 'breached',              label: 'SLA breached' },
  { key: 'reportable',            label: 'Reportable' },
];

function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(2)}%`;
}

function getActions(row: GuaranteeRow): ChainAction[] {
  const cs = row.chain_status;
  if (row.is_terminal) return [];

  const actions: ChainAction[] = [];

  if (cs === 'period_open') {
    actions.push({
      key: 'submit-measurement',
      label: 'Submit measurement (contractor)',
      tone: 'primary',
      fields: [
        { key: 'measured_availability_pct', label: 'Measured availability (%)', type: 'text', required: false },
        { key: 'measurement_ref', label: 'Measurement reference (optional)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'measurement_submitted') {
    actions.push({
      key: 'open-adjustment-review',
      label: 'Open adjustment review',
      tone: 'primary',
      fields: [
        { key: 'excused_downtime_hours', label: 'Excused downtime (hours, optional)', type: 'text', required: false },
        { key: 'adjusted_availability_pct', label: 'Adjusted availability (%, optional)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'adjustment_review') {
    actions.push({
      key: 'reconcile',
      label: 'Reconcile',
      tone: 'primary',
      fields: [
        { key: 'adjusted_availability_pct', label: 'Adjusted availability (%, optional)', type: 'text', required: false },
        { key: 'shortfall_pp', label: 'Shortfall (pp, optional — guaranteed minus adjusted)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'reconciled') {
    actions.push({
      key: 'confirm-meets-guarantee',
      label: 'Confirm meets guarantee',
      tone: 'primary',
      fields: [
        { key: 'bonus_zar', label: 'Availability bonus (ZAR, optional)', type: 'text', required: false },
      ],
    });
    actions.push({
      key: 'flag-shortfall',
      label: 'Flag shortfall',
      tone: 'danger',
      fields: [
        { key: 'shortfall_pp', label: 'Shortfall (pp)', type: 'text', required: false },
        { key: 'shortfall_basis', label: 'Shortfall basis', type: 'textarea', required: false },
      ],
    });
  }

  if (cs === 'shortfall_flagged') {
    actions.push({
      key: 'assess-ld',
      label: 'Assess LD',
      tone: 'danger',
      fields: [
        { key: 'ld_assessed_zar', label: 'Liquidated damages assessed (ZAR)', type: 'text', required: false },
        { key: 'ld_basis', label: 'LD basis', type: 'textarea', required: false },
      ],
    });
  }

  if (cs === 'ld_assessed') {
    actions.push({
      key: 'agree-cure-plan',
      label: 'Agree cure plan (contractor)',
      tone: 'primary',
      fields: [
        { key: 'cure_plan', label: 'Cure plan', type: 'textarea', required: false },
      ],
    });
  }

  if (cs === 'meets_guarantee' || cs === 'ld_assessed' || cs === 'cure_period') {
    actions.push({
      key: 'settle',
      label: 'Settle',
      tone: 'primary',
      fields: [
        { key: 'settlement_zar', label: 'Net settlement (ZAR, optional)', type: 'text', required: false },
        { key: 'settlement_basis', label: 'Settlement basis (optional)', type: 'textarea', required: false },
      ],
    });
  }

  if (cs === 'ld_assessed' || cs === 'cure_period') {
    actions.push({
      key: 'waive-ld',
      label: 'Waive LD',
      tone: 'warn',
      fields: [
        { key: 'settlement_basis', label: 'Waiver basis', type: 'textarea', required: false },
        { key: 'reason_code', label: 'Reason code (optional)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'shortfall_flagged' || cs === 'ld_assessed' || cs === 'cure_period') {
    actions.push({
      key: 'raise-dispute',
      label: 'Raise dispute (contractor)',
      tone: 'danger',
      fields: [
        { key: 'dispute_basis', label: 'Dispute basis', type: 'textarea', required: false },
      ],
    });
  }

  if (cs === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute',
      tone: 'primary',
      fields: [
        { key: 'dispute_basis', label: 'Resolution basis', type: 'textarea', required: false },
        { key: 'settlement_zar', label: 'Settlement after resolution (ZAR, optional)', type: 'text', required: false },
      ],
    });
  }

  if (cs === 'period_open' || cs === 'measurement_submitted' || cs === 'adjustment_review') {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw',
      tone: 'ghost',
      fields: [
        { key: 'reason_code', label: 'Reason code (optional)', type: 'text', required: false },
      ],
    });
  }

  return actions;
}

function renderDetail(row: GuaranteeRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
      <DetailPair label="Asset owner" value={row.owner_party_name} />
      <DetailPair label="O&M contractor" value={row.contractor_party_name} />
      <DetailPair label="Technology" value={`${row.technology}${row.capacity_mw != null ? ` · ${row.capacity_mw} MW` : ''}`} />
      {row.site_province && <DetailPair label="Province" value={row.site_province} />}
      <DetailPair label="Guaranteed" value={fmtPct(row.guaranteed_availability_pct)} />
      {row.bonus_threshold_pct != null && <DetailPair label="Bonus threshold" value={fmtPct(row.bonus_threshold_pct)} />}
      {row.measured_availability_pct != null && <DetailPair label="Measured" value={fmtPct(row.measured_availability_pct)} />}
      {row.adjusted_availability_pct != null && <DetailPair label="Adjusted" value={fmtPct(row.adjusted_availability_pct)} />}
      {row.excused_downtime_hours != null && <DetailPair label="Excused downtime" value={`${row.excused_downtime_hours} h`} />}
      {row.shortfall_pp != null && <DetailPair label="Shortfall" value={`${row.shortfall_pp.toFixed(2)} pp`} />}
      {row.contract_ref && <DetailPair label="O&M contract" value={row.contract_ref} />}
      {row.ld_rate_zar_per_pp != null && <DetailPair label="LD rate / pp" value={fmtZar(row.ld_rate_zar_per_pp)} />}
      {row.ld_cap_zar != null && <DetailPair label="LD cap" value={fmtZar(row.ld_cap_zar)} />}
      {row.ld_assessed_zar != null && <DetailPair label="LD assessed" value={fmtZar(row.ld_assessed_zar)} />}
      {row.bonus_zar != null && <DetailPair label="Bonus" value={fmtZar(row.bonus_zar)} />}
      {row.settlement_zar != null && <DetailPair label="Settlement" value={fmtZar(row.settlement_zar)} />}
      {row.dispute_round > 0 && <DetailPair label="Dispute round" value={String(row.dispute_round)} />}
      {row.measurement_basis && <DetailPair label="Measurement basis" value={row.measurement_basis} />}
      {row.adjustment_basis && <DetailPair label="Adjustment basis" value={row.adjustment_basis} />}
      {row.shortfall_basis && <DetailPair label="Shortfall basis" value={row.shortfall_basis} />}
      {row.ld_basis && <DetailPair label="LD basis" value={row.ld_basis} />}
      {row.cure_plan && <DetailPair label="Cure plan" value={row.cure_plan} />}
      {row.settlement_basis && <DetailPair label="Settlement basis" value={row.settlement_basis} />}
      {row.dispute_basis && <DetailPair label="Dispute basis" value={row.dispute_basis} />}
      {row.notes && <DetailPair label="Notes" value={row.notes} />}
      {row.source_wave && (
        <DetailPair
          label="Provenance"
          value={`${row.source_wave}${row.source_entity_id ? ` · ${row.source_entity_id}` : ''}${row.source_event ? ` (${row.source_event})` : ''}`}
        />
      )}
      {row.is_reportable && (
        <div className="col-span-2">
          <span
            className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
            style={{ background: 'oklch(0.97 0.04 20)', color: BAD }}
          >
            Regulator reportable
          </span>
        </div>
      )}
    </div>
  );
}

export function AvailabilityGuaranteeChainTab() {
  const [rows, setRows] = useState<GuaranteeRow[]>([]);
  const [summary, setSummary] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: KpiData & { items: GuaranteeRow[] } }>('/availability-guarantee/chain');
      const d = res.data?.data;
      setRows(d?.items || []);
      if (d) {
        const { items: _items, ...rest } = d;
        setSummary(rest as KpiData);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load availability guarantees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v == null) continue;
        const numericKeys = [
          'measured_availability_pct', 'excused_downtime_hours', 'adjusted_availability_pct',
          'shortfall_pp', 'bonus_zar', 'ld_assessed_zar', 'settlement_zar',
        ];
        body[k] = numericKeys.includes(k) ? Number(v) : v;
      }
      await api.post(`/availability-guarantee/chain/${rowId}/${key}`, body);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: GuaranteeRow; events: ChainEvent[] } }>(`/availability-guarantee/chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events || [] }));
    } catch {
      setExpandedEvents(prev => ({ ...prev, [id]: [] }));
    }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return !r.is_terminal;
      if (filter === 'breached')   return r.sla_breached;
      if (filter === 'reportable') return r.is_reportable;
      if (filter.endsWith('_shortfall')) return r.shortfall_tier === filter;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  return (
    <div style={{ background: BG, minHeight: '100%', padding: '12px 0' }}>
      {/* KPI strip */}
      <div
        className="grid gap-3 mb-4"
        style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
      >
        <KpiTile label="Total" value={summary?.total ?? 0} />
        <KpiTile label="Open" value={summary?.open_count ?? 0} />
        <KpiTile label="Shortfall flagged" value={summary?.shortfall_count ?? 0} tone={(summary?.shortfall_count ?? 0) > 0 ? 'warn' : 'ok'} />
        <KpiTile label="SLA breached" value={summary?.breached ?? 0} tone={(summary?.breached ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="Critical open" value={summary?.critical_open ?? 0} tone={(summary?.critical_open ?? 0) > 0 ? 'bad' : 'ok'} />
        <KpiTile label="LD assessed" value={fmtZar(summary?.total_ld_assessed_zar ?? 0)} />
        <KpiTile label="Settlement" value={fmtZar(summary?.total_settlement_zar ?? 0)} />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium border"
            style={
              filter === f.key
                ? { background: ACC, color: '#fff', borderColor: ACC }
                : { background: BG1, color: TX2, borderColor: BORDER }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div
          className="px-3 py-2 rounded-md text-[12px] mb-3"
          style={{ background: 'oklch(0.97 0.04 20)', color: BAD, border: `1px solid ${BAD}30` }}
        >
          {err}
        </div>
      )}

      {/* Chain card list */}
      <div className="space-y-2">
        {loading ? (
          <div className="py-10 text-center text-[12px]" style={{ color: TX3 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-[12px]" style={{ color: TX3 }}>No guarantees match the current filter.</div>
        ) : filtered.map((row) => (
          <ChainCard
            key={row.id}
            item={row as unknown as ChainCardItem}
            allStates={ALL_STATES}
            branchStates={BRANCH_STATES}
            title={`${row.site_name} · ${row.reporting_period}`}
            meta={`${row.contractor_party_name} · ${row.shortfall_tier.replace(/_/g, ' ')} · ${fmtPct(row.guaranteed_availability_pct)} guaranteed / ${fmtPct(row.adjusted_availability_pct)} adjusted`}
            actions={getActions(row)}
            onAction={(key, values) => handleAction(row.id, key, values)}
            onExpand={handleExpand}
            events={expandedEvents[row.id]}
            detail={renderDetail(row)}
          />
        ))}
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: BG1, border: `1px solid ${BORDER}` }}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-semibold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div className="text-[12px] mt-0.5" style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default AvailabilityGuaranteeChainTab;
