// Wave 20 — IPP construction → COD certification chain tab.
//
// 10-state P6 chain layered on oe_cod_chain. Per-capacity-tier SLA tiering
// (large ≥100MW / medium 10-100MW / small <10MW — bigger projects get more
// time per real construction durations). Large-tier certify_cod + cancel +
// SLA-breach cross into regulator inbox per NERSA §C-5 + DMRE registry.
//
//   • KPI strip: total / large open / in_construction / certified / breached / cancelled
//   • Filter pills by chain state + tier + breached/escalated
//   • ChainCard list with tier pill + state pill + SLA countdown + MW
//   • Inline expandable: timeline + per-state action buttons + cancel + IE certify modal

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
  | 'draft' | 'epc_signed' | 'ntp_issued' | 'mobilization'
  | 'mechanical_complete' | 'cold_commissioning' | 'grid_synchronized'
  | 'reliability_run' | 'cod_certified' | 'cancelled';

type Tier = 'large' | 'medium' | 'small';

interface CodRow {
  [key: string]: unknown;
  id: string;
  cod_number: string;
  project_id: string | null;
  participant_id: string;
  project_name: string;
  epc_contract_id: string | null;
  epc_contractor_name: string | null;
  capacity_mw: number;
  capacity_tier: Tier;
  chain_status: ChainStatus;
  target_cod_date: string | null;
  actual_cod_date: string | null;
  epc_signed_at: string | null;
  ntp_issued_at: string | null;
  mobilization_at: string | null;
  mechanical_complete_at: string | null;
  cold_comm_at: string | null;
  grid_sync_at: string | null;
  reliability_run_at: string | null;
  cod_certified_at: string | null;
  ie_certifier: string | null;
  ie_cert_doc_ref: string | null;
  nersa_scada_ref: string | null;
  cancellation_reason: string | null;
  construction_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  sla_breached?: boolean;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
}

interface KpiState {
  total: number;
  large_open: number;
  breached: number;
  escalated: number;
  in_construction: number;
  in_commissioning: number;
  cod_certified_count: number;
  cancelled_count: number;
  total_capacity_certified: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'draft',
  'epc_signed',
  'ntp_issued',
  'mobilization',
  'mechanical_complete',
  'cold_commissioning',
  'grid_synchronized',
  'reliability_run',
  'cod_certified',
];
const BRANCH_STATES: readonly string[] = [
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',               label: 'Active' },
  { key: 'all',                  label: 'All' },
  { key: 'large',                label: 'Large' },
  { key: 'medium',               label: 'Medium' },
  { key: 'small',                label: 'Small' },
  { key: 'breached',             label: 'SLA breached' },
  { key: 'escalated',            label: 'Escalated' },
  { key: 'draft',                label: 'Draft' },
  { key: 'epc_signed',           label: 'EPC signed' },
  { key: 'ntp_issued',           label: 'NTP issued' },
  { key: 'mobilization',         label: 'Mobilisation' },
  { key: 'mechanical_complete',  label: 'Mech complete' },
  { key: 'cold_commissioning',   label: 'Cold comm' },
  { key: 'grid_synchronized',    label: 'Grid sync' },
  { key: 'reliability_run',      label: 'Reliability run' },
  { key: 'cod_certified',        label: 'COD certified' },
  { key: 'cancelled',            label: 'Cancelled' },
];

// ── helpers ───────────────────────────────────────────────────────────────
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

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}GW`;
  return `${n}MW`;
}

const TIER_LABEL: Record<Tier, string> = {
  large:  'Large (≥100MW)',
  medium: 'Medium (10-100MW)',
  small:  'Small (<10MW)',
};

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: CodRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const canCancel = !['cod_certified', 'cancelled'].includes(row.chain_status);

  switch (row.chain_status) {
    case 'draft':
      actions.push({
        key: 'sign-epc',
        label: 'Sign EPC contract',
        fields: [],
        // no crossing mentioned for sign-epc
        cascadeTo: [],
      });
      break;
    case 'epc_signed':
      actions.push({
        key: 'issue-ntp',
        label: 'Issue Notice to Proceed',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'ntp_issued':
      actions.push({
        key: 'mobilize',
        label: 'Mobilise site',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'mobilization':
      actions.push({
        key: 'mechanical-complete',
        label: 'Mechanical complete',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'mechanical_complete':
      actions.push({
        key: 'cold-commission',
        label: 'Cold commissioning',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'cold_commissioning':
      actions.push({
        key: 'grid-synchronize',
        label: 'Synchronise to grid',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'grid_synchronized':
      actions.push({
        key: 'begin-reliability-run',
        label: 'Begin reliability run',
        fields: [],
        cascadeTo: [],
      });
      break;
    case 'reliability_run':
      // certify-cod crosses regulator for large tier
      actions.push({
        key: 'certify-cod',
        label: 'Certify COD (IE sign-off)',
        fields: [
          {
            key: 'ie_certifier',
            label: 'Independent Engineer firm (e.g. Mott MacDonald)',
            type: 'text',
            required: true,
            placeholder: row.ie_certifier ?? '',
          },
          {
            key: 'ie_cert_doc_ref',
            label: 'IE certificate document reference (e.g. IE-CERT-2026-NAME-0001)',
            type: 'text',
            required: true,
            placeholder: row.ie_cert_doc_ref ?? '',
          },
          {
            key: 'actual_cod_date',
            label: 'Actual COD date',
            type: 'date',
            required: true,
            placeholder: new Date().toISOString().slice(0, 10),
          },
          ...(row.capacity_tier === 'large' ? [{
            key: 'nersa_scada_ref',
            label: 'NERSA SCADA registration reference (large-tier only)',
            type: 'text' as const,
            required: false,
            placeholder: row.nersa_scada_ref ?? '',
          }] : []),
        ],
        // Large-tier certify_cod crosses regulator per NERSA §C-5 + DMRE registry
        cascadeTo: row.capacity_tier === 'large' ? ['regulator'] : [],
      });
      break;
  }

  // cancel action — available for all non-terminal states
  // Large-tier cancel crosses regulator
  if (canCancel) {
    actions.push({
      key: 'cancel',
      label: 'Cancel project',
      fields: [
        {
          key: 'reason',
          label: 'Reason for cancelling the project',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: row.capacity_tier === 'large' ? ['regulator'] : [],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: CodRow): React.ReactNode {
  return (
    <div style={{ fontFamily: 'inherit' }}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DetailPair label="State"            value={row.chain_status.replace(/_/g, ' ')} />
        <DetailPair label="Capacity tier"    value={TIER_LABEL[row.capacity_tier]} />
        <DetailPair label="Capacity"         value={fmtMw(row.capacity_mw)} />
        <DetailPair label="EPC contractor"   value={row.epc_contractor_name ?? '—'} />
        <DetailPair label="Target COD"       value={fmtDate(row.target_cod_date)} />
        <DetailPair label="Actual COD"       value={fmtDate(row.actual_cod_date)} />
        <DetailPair label="EPC signed"       value={fmtDate(row.epc_signed_at)} />
        <DetailPair label="NTP issued"       value={fmtDate(row.ntp_issued_at)} />
        <DetailPair label="Mobilisation"     value={fmtDate(row.mobilization_at)} />
        <DetailPair label="Mechanical comp." value={fmtDate(row.mechanical_complete_at)} />
        <DetailPair label="Cold comm."       value={fmtDate(row.cold_comm_at)} />
        <DetailPair label="Grid sync"        value={fmtDate(row.grid_sync_at)} />
        <DetailPair label="Reliability run"  value={fmtDate(row.reliability_run_at)} />
        <DetailPair label="COD certified"    value={fmtDate(row.cod_certified_at)} />
        <DetailPair label="IE certifier"     value={row.ie_certifier ?? '—'} />
        <DetailPair label="IE cert ref"      value={row.ie_cert_doc_ref ?? '—'} />
        <DetailPair label="NERSA SCADA"      value={row.nersa_scada_ref ?? '—'} />
        <DetailPair label="SLA deadline"     value={fmtDate(row.sla_deadline_at)} />
        <DetailPair label="SLA status"       value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
        <DetailPair label="Escalation"       value={String(row.escalation_level)} />
      </div>
      {row.cancellation_reason && (
        <div className="col-span-2 mt-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Cancellation reason</div>
          <div className="text-[11px]" style={{ color: BAD }}>{row.cancellation_reason}</div>
        </div>
      )}
      {row.construction_notes && (
        <div className="mt-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Construction notes</div>
          <div className="text-[11px] whitespace-pre-wrap" style={{ color: TX2 }}>{row.construction_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function CodChainTab() {
  const [rows, setRows] = useState<CodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{ data: { items: CodRow[] } }>('/ipp/cod-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load COD chains');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/ipp/cod-chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/cod-chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/ipp/cod-chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return !['cod_certified', 'cancelled'].includes(r.chain_status);
      if (filter === 'large')     return r.capacity_tier === 'large';
      if (filter === 'medium')    return r.capacity_tier === 'medium';
      if (filter === 'small')     return r.capacity_tier === 'small';
      if (filter === 'breached')  return !!r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo<KpiState>(() => {
    let large_open = 0, breached = 0, escalated = 0, in_construction = 0, in_commissioning = 0;
    let cod_certified_count = 0, cancelled_count = 0, total_capacity_certified = 0;
    for (const r of rows) {
      if (r.capacity_tier === 'large' && !['cod_certified', 'cancelled'].includes(r.chain_status)) large_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (['ntp_issued', 'mobilization', 'mechanical_complete'].includes(r.chain_status)) in_construction++;
      if (['cold_commissioning', 'grid_synchronized', 'reliability_run'].includes(r.chain_status)) in_commissioning++;
      if (r.chain_status === 'cod_certified') {
        cod_certified_count++;
        total_capacity_certified += r.capacity_mw || 0;
      }
      if (r.chain_status === 'cancelled') cancelled_count++;
    }
    return { total: rows.length, large_open, breached, escalated, in_construction, in_commissioning, cod_certified_count, cancelled_count, total_capacity_certified };
  }, [rows]);

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>IPP construction → COD certification chain</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          10-stage P6 chain · draft → EPC signed → NTP issued → mobilisation → mechanical complete →
          cold commissioning → grid synchronised → reliability run → COD certified. Per-capacity-tier SLA tiering
          (large ≥100MW / medium 10-100MW / small &lt;10MW). Large-tier COD certification, cancellation, and SLA breaches escalate to the regulator inbox per NERSA Grid Code §C-5 + DMRE registry.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total projects"      value={kpis.total} />
        <KpiTile label="Large-tier open"     value={kpis.large_open}          tone={kpis.large_open > 0 ? 'warn' : undefined} />
        <KpiTile label="In construction"     value={kpis.in_construction} />
        <KpiTile label="COD certified"       value={`${kpis.cod_certified_count} · ${fmtMw(kpis.total_capacity_certified)}`} tone={kpis.cod_certified_count > 0 ? 'ok' : undefined} />
        <KpiTile label="SLA breached"        value={kpis.breached}            tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Cancelled"           value={kpis.cancelled_count}     tone={kpis.cancelled_count > 0 ? 'bad' : undefined} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>{err}</div>
      )}
      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.project_name}
              meta={`${TIER_LABEL[row.capacity_tier]} · ${fmtMw(row.capacity_mw)} · ${row.cod_number}`}
              actions={getActions(row)}
              onAction={(key, values) => handleAction(row.id, key, values)}
              cascadeTo={[]}
              detail={renderDetail(row)}
              events={expandedEvents[row.id]}
              onExpand={handleExpand}
            />
          ))}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No projects match.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
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
      <div className="text-[11px]" style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default CodChainTab;
