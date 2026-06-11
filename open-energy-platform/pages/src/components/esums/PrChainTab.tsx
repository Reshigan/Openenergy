// Wave 24 — Esums Performance-Ratio sustained-underperformance chain.
//
// 9-state machine surfaced as a P6 audit chain on the Esums O&M workstation.
//
//   • KPI strip: total / utility open / intervention / escalated / breached / revenue loss
//   • Filter pills by chain state + tier
//   • Listing with tier pill + SLA countdown + PR shortfall
//   • Drill-down: timeline + per-state action button (10 transitions)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
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
  | 'monitoring' | 'warning' | 'investigating'
  | 'intervention_planned' | 'intervention_executing'
  | 'verified' | 'escalated' | 'closed' | 'false_alarm';

type Tier = 'utility' | 'midscale' | 'ci' | 'microgrid';

interface PrRow {
  [key: string]: unknown;
  id: string;
  case_number: string;
  site_id: string;
  site_name: string;
  technology: string;
  capacity_mw: number;
  capacity_tier: Tier;
  baseline_pr: number;
  observed_pr: number;
  pr_shortfall: number;
  window_days: number;
  detected_at: string;
  primary_cause: string | null;
  rca_summary: string | null;
  action_plan: string | null;
  linked_wo_id: string | null;
  linked_warranty_claim_id: string | null;
  revenue_loss_zar: number | null;
  chain_status: ChainStatus;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  is_terminal?: boolean;
  created_by: string;
  created_at: string;
}

interface PrEvent {
  id: string;
  case_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'monitoring',
  'warning',
  'investigating',
  'intervention_planned',
  'intervention_executing',
  'verified',
  'closed',
];

const BRANCH_STATES: readonly string[] = [
  'escalated',
  'false_alarm',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',                 label: 'Active' },
  { key: 'all',                    label: 'All' },
  { key: 'utility',                label: 'Utility' },
  { key: 'midscale',               label: 'Mid-scale' },
  { key: 'ci',                     label: 'C&I' },
  { key: 'microgrid',              label: 'Microgrid' },
  { key: 'breached',               label: 'SLA breached' },
  { key: 'escalated',              label: 'Escalated' },
  { key: 'warning',                label: 'Warning' },
  { key: 'investigating',          label: 'Investigating' },
  { key: 'intervention_planned',   label: 'Intervention planned' },
  { key: 'intervention_executing', label: 'Intervention executing' },
  { key: 'verified',               label: 'Verified' },
  { key: 'closed',                 label: 'Closed' },
  { key: 'false_alarm',            label: 'False alarm' },
];

// ── format helpers ────────────────────────────────────────────────────────
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

function fmtZar(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1_000_000) return `R${(v / 1_000_000).toFixed(1)}m`;
  if (Math.abs(v) >= 1_000) return `R${(v / 1_000).toFixed(0)}k`;
  return `R${Math.round(v)}`;
}

const TIER_LABEL: Record<Tier, string> = {
  utility:   'Utility ≥50MW',
  midscale:  'Mid 10-50MW',
  ci:        'C&I 1-10MW',
  microgrid: 'Microgrid <1MW',
};

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: PrRow): ChainAction[] {
  const actions: ChainAction[] = [];

  // Primary forward action per state
  switch (row.chain_status) {
    case 'monitoring':
      actions.push({
        key: 'start-warning',
        label: 'Start warning',
        fields: [],
        cascadeTo: [],
      });
      break;

    case 'warning':
      actions.push({
        key: 'begin-investigation',
        label: 'Begin investigation',
        fields: [],
        cascadeTo: [],
      });
      break;

    case 'investigating':
      actions.push({
        key: 'complete-rca',
        label: 'Complete RCA',
        fields: [
          {
            key: 'primary_cause',
            label: 'Primary cause (soiling / inverter_fault / string_loss / shading / OEM_defect / weather)',
            type: 'text',
            required: true,
            placeholder: row.primary_cause ?? '',
          },
          {
            key: 'rca_summary',
            label: 'RCA summary',
            type: 'textarea',
            required: false,
            placeholder: row.rca_summary ?? '',
          },
          {
            key: 'action_plan',
            label: 'Action plan',
            type: 'textarea',
            required: false,
            placeholder: row.action_plan ?? '',
          },
        ],
        cascadeTo: [],
      });
      break;

    case 'intervention_planned':
      actions.push({
        key: 'dispatch-intervention',
        label: 'Dispatch intervention',
        fields: [
          {
            key: 'linked_wo_id',
            label: 'Linked work order ID (optional)',
            type: 'text',
            required: false,
            placeholder: row.linked_wo_id ?? '',
          },
        ],
        cascadeTo: [],
      });
      break;

    case 'intervention_executing':
      actions.push({
        key: 'verify-recovery',
        label: 'Verify recovery',
        fields: [
          {
            key: 'observed_pr',
            label: 'Observed PR after intervention (e.g. 0.84)',
            type: 'number',
            required: false,
            placeholder: String(row.observed_pr ?? ''),
          },
        ],
        cascadeTo: [],
      });
      break;

    case 'verified':
      actions.push({
        key: 'close',
        label: 'Close + archive',
        fields: [
          {
            key: 'closure_notes',
            label: 'Closure notes',
            type: 'textarea',
            required: false,
            placeholder: '',
          },
        ],
        cascadeTo: [],
      });
      break;

    case 'escalated':
      actions.push({
        key: 'close-escalated',
        label: 'Close escalated',
        fields: [
          {
            key: 'closure_notes',
            label: 'Closure notes',
            type: 'textarea',
            required: false,
            placeholder: '',
          },
        ],
        cascadeTo: [],
      });
      break;

    case 'false_alarm':
      actions.push({
        key: 'close-false-alarm',
        label: 'Close false alarm',
        fields: [
          {
            key: 'closure_notes',
            label: 'Closure notes',
            type: 'textarea',
            required: false,
            placeholder: '',
          },
        ],
        cascadeTo: [],
      });
      break;

    case 'closed':
      break;
  }

  // Secondary: escalate (available during investigating or intervention_executing)
  if (row.chain_status === 'investigating' || row.chain_status === 'intervention_executing') {
    actions.push({
      key: 'escalate',
      label: 'Escalate (warranty)',
      fields: [
        {
          key: 'linked_warranty_claim_id',
          label: 'Linked warranty claim ID (optional)',
          type: 'text',
          required: false,
          placeholder: row.linked_warranty_claim_id ?? '',
        },
      ],
      cascadeTo: [],
    });
  }

  // Secondary: mark false alarm (available during warning or investigating)
  if (row.chain_status === 'warning' || row.chain_status === 'investigating') {
    actions.push({
      key: 'mark-false-alarm',
      label: 'Mark false alarm',
      fields: [
        {
          key: 'closure_notes',
          label: 'False-alarm reason (weather/grid attribution)',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: PrRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Baseline PR"   value={row.baseline_pr.toFixed(3)} />
      <DetailPair label="Observed PR"   value={row.observed_pr.toFixed(3)} />
      <DetailPair label="PR shortfall"  value={`${(row.pr_shortfall * 100).toFixed(1)}pp`} />
      <DetailPair label="Window"        value={`${row.window_days} consecutive days`} />
      <DetailPair label="Primary cause" value={row.primary_cause ?? '—'} />
      <DetailPair label="Revenue loss"  value={fmtZar(row.revenue_loss_zar)} />
      <DetailPair label="State"         value={row.chain_status.replace(/_/g, ' ')} />
      <DetailPair label="Escalation"    value={String(row.escalation_level)} />
      <DetailPair label="Linked WO"     value={row.linked_wo_id ?? '—'} />
      <DetailPair label="Linked claim"  value={row.linked_warranty_claim_id ?? '—'} />
      <DetailPair label="SLA deadline"  value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"    value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Technology"    value={row.technology} />
      <DetailPair label="Capacity"      value={`${row.capacity_mw.toFixed(1)} MW`} />
      <DetailPair label="Tier"          value={TIER_LABEL[row.capacity_tier]} />
      <DetailPair label="Detected"      value={fmtDate(row.detected_at)} />
      {row.rca_summary && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>RCA summary</div>
          <div style={{ color: TX2 }}>{row.rca_summary}</div>
        </div>
      )}
      {row.action_plan && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Action plan</div>
          <div style={{ color: TX2 }}>{row.action_plan}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PrChainTab() {
  const [rows, setRows] = useState<PrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: PrRow[] } }>('/esums/pr-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PR cases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/esums/pr-chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/esums/pr-chain/${rowId}`);
          setExpandedEvents(prev => ({ ...prev, [rowId]: res.data?.data?.events ?? [] }));
        } catch { /* silent */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${key}`);
    }
  }, [load, expandedEvents]);

  const handleExpand = useCallback(async (id: string) => {
    if (expandedEvents[id]) return;
    try {
      const res = await api.get<{ data: { case: PrRow; events: ChainEvent[] } }>(`/esums/pr-chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all') return true;
      if (filter === 'active') return !r.is_terminal;
      if (filter === 'utility' || filter === 'midscale' || filter === 'ci' || filter === 'microgrid') {
        return r.capacity_tier === filter;
      }
      if (filter === 'breached') return !!r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0 || r.chain_status === 'escalated';
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let utility_open = 0, intervention = 0, escalated = 0, breached = 0;
    let revenue_loss = 0;
    for (const r of rows) {
      if (r.capacity_tier === 'utility' && !r.is_terminal) utility_open++;
      if (r.chain_status === 'intervention_executing') intervention++;
      if (r.chain_status === 'escalated' || r.escalation_level > 0) escalated++;
      if (r.sla_breached) breached++;
      revenue_loss += r.revenue_loss_zar || 0;
    }
    return { total: rows.length, utility_open, intervention, escalated, breached, revenue_loss };
  }, [rows]);

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>PR sustained-underperformance chain</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          9-stage P6 chain · monitoring → warning → investigating → RCA → intervention → verified → closed.
          Tier SLAs (utility 24h warning, 30d intervention). Utility-tier escalations and breaches cross into the regulator inbox.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total cases"  value={kpis.total} />
        <KpiTile label="Utility open" value={kpis.utility_open} tone={kpis.utility_open > 0 ? 'warn' : undefined} />
        <KpiTile label="Intervention" value={kpis.intervention} />
        <KpiTile label="Escalated"    value={kpis.escalated} tone={kpis.escalated > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Revenue loss" value={fmtZar(kpis.revenue_loss)} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: filter === f.key ? ACC : BG2,
              color: filter === f.key ? '#fff' : TX2,
              border: `1px solid ${filter === f.key ? ACC : BORDER}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
          style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={`${row.case_number} — ${row.site_name}`}
              meta={`${TIER_LABEL[row.capacity_tier]} · ${row.technology} · ${row.capacity_mw.toFixed(1)} MW · PR ${row.observed_pr.toFixed(3)} (baseline ${row.baseline_pr.toFixed(3)})`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
              style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No PR cases match.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[80px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default PrChainTab;
