// Wave 16 — Work Order dispatch chain tab (Esums O&M).
//
// 12-state machine surfaced as a P6 audit chain.
//
//   • KPI strip: total / critical open / breached / escalated / by status
//   • Filter pills by chain state + priority
//   • ChainCard list with inline expand
//   • Actions use ActionModal (via ChainCard pendingAction)
//   • Audit timeline shown lazily via events prop
//   • Priority-tiered SLAs (critical 15m / 1–2h per stage)
//   • Critical-priority cancels and breaches escalate to the regulator inbox

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
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

// ── types ─────────────────────────────────────────────────────────────────
type ChainStatus =
  | 'created' | 'assigned' | 'acknowledged' | 'en_route' | 'on_site'
  | 'diagnosing' | 'repairing' | 'testing' | 'completed' | 'verified'
  | 'closed' | 'cancelled';

type Priority = 'critical' | 'high' | 'medium' | 'low';

interface WoRow {
  [key: string]: unknown;
  id: string;
  wo_number: string;
  site_id: string;
  fault_id: string | null;
  category: string;
  priority: Priority;
  status: ChainStatus;
  chain_status: ChainStatus;
  assigned_to: string | null;
  title: string | null;
  description: string | null;
  sla_deadline: string | null;
  sla_deadline_at?: string | null;
  sla_breached?: boolean;
  last_sla_breach_at: string | null;
  escalation_level: number;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
  resolution_notes: string | null;
}

interface KpiType {
  total: number;
  critical_open: number;
  breached: number;
  escalated: number;
  in_field: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'created', 'assigned', 'acknowledged', 'en_route', 'on_site',
  'diagnosing', 'repairing', 'testing', 'completed', 'verified', 'closed',
];

const BRANCH_STATES: readonly string[] = [
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',        label: 'Active' },
  { key: 'all',           label: 'All' },
  { key: 'critical',      label: 'Critical priority' },
  { key: 'breached',      label: 'SLA breached' },
  { key: 'escalated',     label: 'Escalated' },
  { key: 'created',       label: 'Created' },
  { key: 'assigned',      label: 'Assigned' },
  { key: 'en_route',      label: 'En route' },
  { key: 'on_site',       label: 'On site' },
  { key: 'repairing',     label: 'Repairing' },
  { key: 'completed',     label: 'Completed' },
  { key: 'verified',      label: 'Verified' },
  { key: 'closed',        label: 'Closed' },
  { key: 'cancelled',     label: 'Cancelled' },
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

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: WoRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const cs = row.chain_status;

  // Primary forward action per state
  if (cs === 'created') {
    actions.push({
      key: 'assign',
      label: 'Assign to technician',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (cs === 'assigned') {
    actions.push({
      key: 'acknowledge',
      label: 'Technician acknowledge',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (cs === 'acknowledged') {
    actions.push({
      key: 'depart',
      label: 'Depart (en route)',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (cs === 'en_route') {
    actions.push({
      key: 'arrive',
      label: 'Arrive on site',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (cs === 'on_site') {
    actions.push({
      key: 'diagnose',
      label: 'Begin diagnosis',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (cs === 'diagnosing') {
    actions.push({
      key: 'repair',
      label: 'Start repair',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (cs === 'repairing') {
    actions.push({
      key: 'test',
      label: 'Begin testing',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (cs === 'testing') {
    actions.push({
      key: 'complete',
      label: 'Mark completed',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (cs === 'completed') {
    actions.push({
      key: 'verify',
      label: 'Senior tech verify',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (cs === 'verified') {
    actions.push({
      key: 'close',
      label: 'Close + archive',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  // Cancel available on non-terminal, non-verified states
  if (cs !== 'closed' && cs !== 'cancelled' && cs !== 'verified') {
    actions.push({
      key: 'cancel',
      label: 'Cancel WO',
      tone: 'danger',
      // Critical-priority cancels escalate to regulator inbox
      cascadeTo: row.priority === 'critical' ? ['regulator'] : [],
      fields: [
        {
          key: 'notes',
          label: 'Reason for cancel',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: WoRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Priority"      value={row.priority.charAt(0).toUpperCase() + row.priority.slice(1)} />
      <DetailPair label="State"         value={row.chain_status.replace(/_/g, ' ')} />
      <DetailPair label="Assigned to"   value={row.assigned_to ?? '—'} />
      <DetailPair label="Escalation"    value={String(row.escalation_level)} />
      <DetailPair label="SLA deadline"  value={fmtDate(row.sla_deadline ?? row.sla_deadline_at ?? null)} />
      <DetailPair label="SLA status"    value={row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Site"          value={row.site_id} />
      <DetailPair label="Category"      value={row.category} />
      {row.fault_id && (
        <DetailPair label="Fault ref"   value={row.fault_id} />
      )}
      <DetailPair label="Created"       value={fmtDate(row.created_at)} />
      {row.description && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Description</div>
          <div style={{ color: TX2 }}>{row.description}</div>
        </div>
      )}
      {row.resolution_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-1" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Resolution notes</div>
          <div style={{ color: TX2 }}>{row.resolution_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function WoChainTab() {
  const [rows, setRows] = useState<WoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: WoRow[] } }>('/esums/wo-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/esums/wo-chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { wo: WoRow; events: ChainEvent[] } }>(`/esums/wo-chain/${rowId}`);
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
      const res = await api.get<{ data: { wo: WoRow; events: ChainEvent[] } }>(`/esums/wo-chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return r.chain_status !== 'closed' && r.chain_status !== 'cancelled';
      if (filter === 'critical')  return r.priority === 'critical';
      if (filter === 'breached')  return !!r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo<KpiType>(() => {
    let critical_open = 0, breached = 0, escalated = 0, in_field = 0;
    for (const r of rows) {
      if (r.priority === 'critical' && r.chain_status !== 'closed' && r.chain_status !== 'cancelled') critical_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (['en_route', 'on_site', 'diagnosing', 'repairing', 'testing'].includes(r.chain_status)) in_field++;
    }
    return { total: rows.length, critical_open, breached, escalated, in_field };
  }, [rows]);

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Work order dispatch chain</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          12-stage P6 chain · created → assigned → acknowledged → en route → on site → diagnosing → repairing → testing → completed → verified → closed.
          Priority-tiered SLAs (critical 15m / 1–2h per stage). Critical-priority cancels and breaches escalate to the regulator inbox.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total WOs"     value={kpis.total} />
        <KpiTile label="Critical open" value={kpis.critical_open} tone={kpis.critical_open > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"  value={kpis.breached}      tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Escalated"     value={kpis.escalated}     tone={kpis.escalated > 0 ? 'warn' : undefined} />
        <KpiTile label="In field"      value={kpis.in_field} />
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
              item={{
                ...row,
                sla_deadline_at: row.sla_deadline_at ?? row.sla_deadline ?? null,
              }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.wo_number + (row.title ? ` — ${row.title}` : '')}
              meta={
                <span style={{ fontFamily: MONO, fontSize: 10, color: TX3 }}>
                  {row.priority.toUpperCase()} · {row.site_id} · {row.category}
                  {row.assigned_to ? ` · ${row.assigned_to}` : ''}
                </span>
              }
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
              No work orders match.
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
      <div style={{ color: TX1, fontSize: 11 }}>{value}</div>
    </div>
  );
}

export default WoChainTab;
