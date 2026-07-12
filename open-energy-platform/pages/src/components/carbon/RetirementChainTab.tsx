// Wave 17 — Carbon credit retirement chain tab.
//
// 7-state P6 audit chain layered on carbon_retirements. Per-scope SLA tiering
// (article6 24h / compliance 72h / voluntary 168h per stage). Article6 finalize
// + reject and SLA breaches in article6/compliance cross into regulator inbox.
//
//   • KPI strip: total / article6 open / breached / escalated / retired count
//   • Filter pills by chain state + scope + breached/escalated
//   • ChainCard list with scope pill + state pill + SLA countdown
//   • Inline expandable detail + audit timeline + ActionModal actions

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';
import { statusLabel } from '../../meridian/ease/statusLabel';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type ChainStatus =
  | 'requested' | 'validating' | 'adjustment_pending' | 'adjusted'
  | 'retired' | 'rejected' | 'cancelled';

type Scope = 'article6' | 'compliance' | 'voluntary';

interface RetirementRow {
  [key: string]: unknown;
  id: string;
  participant_id: string;
  project_id: string;
  quantity: number;
  retirement_reason: string | null;
  certificate_number: string | null;
  beneficiary_name: string | null;
  beneficiary_country: string | null;
  retirement_date: string | null;
  chain_status: ChainStatus;
  scope: Scope;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  validation_notes: string | null;
  rejection_reason: string | null;
  certificate_hash: string | null;
  sla_breached?: boolean;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'requested',
  'validating',
  'adjustment_pending',
  'adjusted',
  'retired',
];

const BRANCH_STATES: readonly string[] = [
  'rejected',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',             label: 'Active' },
  { key: 'all',                label: 'All' },
  { key: 'article6',           label: 'Article 6' },
  { key: 'compliance',         label: 'Compliance' },
  { key: 'voluntary',          label: 'Voluntary' },
  { key: 'breached',           label: 'SLA breached' },
  { key: 'escalated',          label: 'Escalated' },
  { key: 'requested',          label: 'Requested' },
  { key: 'validating',         label: 'Validating' },
  { key: 'adjustment_pending', label: 'Adjustment pending' },
  { key: 'adjusted',           label: 'Adjusted' },
  { key: 'retired',            label: 'Retired' },
  { key: 'rejected',           label: 'Rejected' },
  { key: 'cancelled',          label: 'Cancelled' },
];

const SCOPE_LABEL: Record<Scope, string> = {
  article6:   'Article 6',
  compliance: 'Compliance',
  voluntary:  'Voluntary',
};

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

function fmtTons(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toLocaleString('en-ZA', { maximumFractionDigits: 0 })} tCO2e`;
}

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: RetirementRow): ChainAction[] {
  const actions: ChainAction[] = [];

  // Primary forward action per state
  if (row.chain_status === 'requested') {
    actions.push({
      key: 'begin-validation',
      label: 'Begin CRA validation',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'validating') {
    actions.push({
      key: 'mark-adjustment-pending',
      label: 'Submit for corresponding adjustment',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'adjustment_pending') {
    actions.push({
      key: 'mark-adjusted',
      label: 'Mark adjustment posted',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (row.chain_status === 'adjusted') {
    // Article 6 finalize crosses regulator
    actions.push({
      key: 'finalize',
      label: 'Finalize retirement (mint cert)',
      tone: 'primary',
      fields: [],
      cascadeTo: row.scope === 'article6' ? ['regulator'] : [],
    });
  }

  // Reject — available in validating or adjustment_pending
  // Article 6 reject crosses regulator
  if (row.chain_status === 'validating' || row.chain_status === 'adjustment_pending') {
    actions.push({
      key: 'reject',
      label: 'Reject retirement',
      tone: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Rejection reason',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: row.scope === 'article6' ? ['regulator'] : [],
    });
  }

  // Cancel — available in any non-terminal state
  if (
    row.chain_status !== 'retired' &&
    row.chain_status !== 'rejected' &&
    row.chain_status !== 'cancelled'
  ) {
    actions.push({
      key: 'cancel',
      label: 'Cancel retirement',
      tone: 'ghost',
      fields: [
        {
          key: 'notes',
          label: 'Reason for cancel',
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

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: RetirementRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Scope"        value={SCOPE_LABEL[row.scope]} />
      <DetailPair label="State"        value={statusLabel(row.chain_status).text} />
      <DetailPair label="Quantity"     value={fmtTons(row.quantity)} />
      <DetailPair label="Country"      value={row.beneficiary_country ?? '—'} />
      <DetailPair label="SLA deadline" value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"   value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
      <DetailPair label="Escalation"   value={String(row.escalation_level)} />
      <DetailPair label="Certificate"  value={row.certificate_hash ?? row.certificate_number ?? '—'} />
      {row.retirement_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Reason</div>
          <div style={{ color: TX2 }}>{row.retirement_reason}</div>
        </div>
      )}
      {row.rejection_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Rejection reason</div>
          <div style={{ color: BAD }}>{row.rejection_reason}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function RetirementChainTab() {
  const [rows, setRows] = useState<RetirementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: RetirementRow[] } }>('/carbon/retirement-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load retirements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/carbon/retirement-chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { retirement: RetirementRow; events: ChainEvent[] } }>(
            `/carbon/retirement-chain/${rowId}`
          );
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
      const res = await api.get<{ data: { retirement: RetirementRow; events: ChainEvent[] } }>(
        `/carbon/retirement-chain/${id}`
      );
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')        return true;
      if (filter === 'active')     return r.chain_status !== 'retired' && r.chain_status !== 'rejected' && r.chain_status !== 'cancelled';
      if (filter === 'article6')   return r.scope === 'article6';
      if (filter === 'compliance') return r.scope === 'compliance';
      if (filter === 'voluntary')  return r.scope === 'voluntary';
      if (filter === 'breached')   return !!r.sla_breached;
      if (filter === 'escalated')  return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let article6_open = 0, breached = 0, escalated = 0, retired_count = 0, total_tco2 = 0;
    for (const r of rows) {
      if (r.scope === 'article6' && r.chain_status !== 'retired' && r.chain_status !== 'rejected' && r.chain_status !== 'cancelled') article6_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (r.chain_status === 'retired') {
        retired_count++;
        total_tco2 += r.quantity || 0;
      }
    }
    return { total: rows.length, article6_open, breached, escalated, retired_count, total_tco2 };
  }, [rows]);

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Carbon credit retirement chain</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          7-stage P6 chain · requested → validating → adjustment pending → adjusted → retired (+ rejected / cancelled).
          Per-scope SLA tiering (Article 6 24h / compliance 72h / voluntary 168h per stage).
          Article 6 finalize/reject and Article 6 / compliance SLA breaches escalate to the regulator inbox.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total retirements" value={kpis.total} />
        <KpiTile label="Article 6 open"    value={kpis.article6_open} tone={kpis.article6_open > 0 ? 'warn' : undefined} />
        <KpiTile label="SLA breached"       value={kpis.breached}      tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Escalated"          value={kpis.escalated}     tone={kpis.escalated > 0 ? 'warn' : undefined} />
        <KpiTile label="Retired"            value={`${kpis.retired_count} (${fmtTons(kpis.total_tco2)})`} />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
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
              title={row.beneficiary_name ?? `Retirement ${row.id.slice(0, 8)}`}
              meta={
                <span style={{ color: TX3, fontSize: 11 }}>
                  {SCOPE_LABEL[row.scope]}
                  {row.beneficiary_country ? ` · ${row.beneficiary_country}` : ''}
                  {' · '}{fmtTons(row.quantity)}
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
              No retirements match.
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

export default RetirementChainTab;
