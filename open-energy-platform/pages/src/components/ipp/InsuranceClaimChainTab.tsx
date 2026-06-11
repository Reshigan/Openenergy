// Wave 23 — Insurance claim chain tab (FSCA Section 38).
//
// 10-state P6 chain layered on oe_insurance_claim_chain. Per-claim-value-tier
// SLAs (catastrophic ≥R50m / major ≥R10m / minor ≥R500k / small <R500k —
// catastrophic gets MORE diligence time at adjuster + dispute stages, LESS
// time at notify + post-quantum settle). Catastrophic-tier settle + decline +
// SLA-breach cross into regulator inbox per FSCA Section 38 large-loss filing.
//
//   • KPI strip: total · catastrophic open · disputed · settled (ZAR) · breached
//   • Filter pills by chain state + tier + breached/escalated
//   • Listing with tier pill + state pill + SLA countdown + claim value
//   • Drill-down: timeline + per-state action buttons + decline + withdraw

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
  | 'notified' | 'assessing' | 'adjuster_assigned'
  | 'quantum_proposed' | 'quantum_agreed' | 'disputed'
  | 'settled' | 'declined' | 'closed' | 'withdrawn';

type Tier = 'catastrophic' | 'major' | 'minor' | 'small';

interface ClaimRow {
  [key: string]: unknown;
  id: string;
  claim_number: string;
  project_id: string | null;
  facility_id: string | null;
  participant_id: string;
  insurer_name: string;
  policy_number: string;
  cover_type: string;
  incident_type: string;
  incident_date: string;
  asset_description: string;
  claim_value_zar: number;
  claim_value_tier: Tier;
  agreed_value_zar: number | null;
  settled_value_zar: number | null;
  excess_zar: number | null;
  loss_adjuster_name: string | null;
  loss_adjuster_ref: string | null;
  fsca_report_ref: string | null;
  reinsurance_layer: string | null;
  chain_status: ChainStatus;
  notified_at: string | null;
  assessing_at: string | null;
  adjuster_assigned_at: string | null;
  quantum_proposed_at: string | null;
  quantum_agreed_at: string | null;
  disputed_at: string | null;
  resolved_at: string | null;
  settled_at: string | null;
  declined_at: string | null;
  closed_at: string | null;
  withdrawn_at: string | null;
  decline_reason: string | null;
  withdrawal_reason: string | null;
  dispute_notes: string | null;
  claim_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  sla_breached?: boolean;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'notified',
  'assessing',
  'adjuster_assigned',
  'quantum_proposed',
  'quantum_agreed',
  'settled',
  'closed',
];
const BRANCH_STATES: readonly string[] = [
  'disputed',
  'declined',
  'withdrawn',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',            label: 'Active' },
  { key: 'all',               label: 'All' },
  { key: 'catastrophic',      label: 'Catastrophic' },
  { key: 'major',             label: 'Major' },
  { key: 'minor',             label: 'Minor' },
  { key: 'small',             label: 'Small' },
  { key: 'breached',          label: 'SLA breached' },
  { key: 'escalated',         label: 'Escalated' },
  { key: 'notified',          label: 'Notified' },
  { key: 'assessing',         label: 'Assessing' },
  { key: 'adjuster_assigned', label: 'Adjuster' },
  { key: 'quantum_proposed',  label: 'Quantum proposed' },
  { key: 'quantum_agreed',    label: 'Quantum agreed' },
  { key: 'disputed',          label: 'Disputed' },
  { key: 'settled',           label: 'Settled' },
  { key: 'declined',          label: 'Declined' },
  { key: 'closed',            label: 'Closed' },
  { key: 'withdrawn',         label: 'Withdrawn' },
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

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n}`;
}

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: ClaimRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward actions per state
  if (s === 'notified') {
    actions.push({
      key: 'begin-assessment',
      label: 'Begin assessment',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'assessing') {
    actions.push({
      key: 'assign-adjuster',
      label: 'Assign loss adjuster',
      fields: [
        {
          key: 'loss_adjuster_name',
          label: 'Loss adjuster firm (e.g. Crawford & Co, McLarens Africa, Marsh JLT)',
          type: 'text',
          required: true,
        },
        {
          key: 'loss_adjuster_ref',
          label: 'Adjuster reference (e.g. ADJ-2026-XXX-0001)',
          type: 'text',
          required: false,
        },
      ],
      cascadeTo: [],
    });
  }

  if (s === 'adjuster_assigned') {
    actions.push({
      key: 'propose-quantum',
      label: 'Propose quantum',
      fields: [
        {
          key: 'agreed_value_zar',
          label: 'Adjuster-agreed quantum (ZAR, numeric)',
          type: 'number',
          required: true,
        },
        ...(row.claim_value_tier === 'catastrophic'
          ? [{
              key: 'fsca_report_ref',
              label: 'FSCA Section 38 report reference (catastrophic only)',
              type: 'text' as const,
              required: false,
            }]
          : []),
      ],
      cascadeTo: [],
    });
  }

  if (s === 'quantum_proposed') {
    actions.push({
      key: 'agree-quantum',
      label: 'Agree quantum',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'quantum_agreed') {
    // settle — catastrophic crosses regulator per FSCA Section 38
    actions.push({
      key: 'settle',
      label: 'Settle (payout)',
      fields: [
        {
          key: 'settled_value_zar',
          label: 'Settled value (ZAR — defaults to agreed quantum)',
          type: 'number',
          required: true,
          placeholder: String(row.agreed_value_zar ?? row.claim_value_zar),
        },
      ],
      cascadeTo: row.claim_value_tier === 'catastrophic' ? ['regulator'] : [],
    });
  }

  if (s === 'disputed') {
    actions.push({
      key: 'resolve-dispute',
      label: 'Resolve dispute',
      fields: [],
      cascadeTo: [],
    });
  }

  if (s === 'settled' || s === 'declined') {
    actions.push({
      key: 'close',
      label: 'Close claim',
      fields: [],
      cascadeTo: [],
    });
  }

  // dispute — available from quantum_proposed or quantum_agreed
  if (s === 'quantum_proposed' || s === 'quantum_agreed') {
    actions.push({
      key: 'dispute',
      label: 'Dispute quantum',
      fields: [
        {
          key: 'dispute_notes',
          label: 'Dispute notes (required)',
          type: 'textarea',
          required: true,
        },
      ],
      cascadeTo: [],
    });
  }

  // decline — available from assessing, adjuster_assigned, quantum_proposed, disputed
  // catastrophic decline crosses regulator per FSCA Section 38
  if (['assessing', 'adjuster_assigned', 'quantum_proposed', 'disputed'].includes(s)) {
    actions.push({
      key: 'decline',
      label: 'Decline claim',
      fields: [
        {
          key: 'decline_reason',
          label: 'Decline reason (policy citation expected)',
          type: 'textarea',
          required: true,
        },
      ],
      cascadeTo: row.claim_value_tier === 'catastrophic' ? ['regulator'] : [],
    });
  }

  // withdraw — available from notified, assessing, adjuster_assigned, quantum_proposed, disputed
  if (['notified', 'assessing', 'adjuster_assigned', 'quantum_proposed', 'disputed'].includes(s)) {
    actions.push({
      key: 'withdraw',
      label: 'Withdraw claim',
      fields: [
        {
          key: 'withdrawal_reason',
          label: 'Withdrawal reason',
          type: 'textarea',
          required: true,
        },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail panel ──────────────────────────────────────────────────────────
function renderDetail(row: ClaimRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="State"             value={row.chain_status} />
      <DetailPair label="Tier"              value={row.claim_value_tier} />
      <DetailPair label="Insurer"           value={row.insurer_name} />
      <DetailPair label="Policy"            value={row.policy_number} />
      <DetailPair label="Cover type"        value={row.cover_type} />
      <DetailPair label="Incident type"     value={row.incident_type} />
      <DetailPair label="Incident date"     value={fmtDate(row.incident_date)} />
      <DetailPair label="Claim value"       value={fmtZar(row.claim_value_zar)} />
      <DetailPair label="Agreed quantum"    value={fmtZar(row.agreed_value_zar)} />
      <DetailPair label="Settled value"     value={fmtZar(row.settled_value_zar)} />
      <DetailPair label="Excess"            value={fmtZar(row.excess_zar)} />
      <DetailPair label="Loss adjuster"     value={row.loss_adjuster_name ?? '—'} />
      <DetailPair label="Adjuster ref"      value={row.loss_adjuster_ref ?? '—'} />
      <DetailPair label="FSCA §38 ref"      value={row.fsca_report_ref ?? '—'} />
      <DetailPair label="Reinsurance layer" value={row.reinsurance_layer ?? '—'} />
      <DetailPair label="Notified at"       value={fmtDate(row.notified_at)} />
      <DetailPair label="Assessing at"      value={fmtDate(row.assessing_at)} />
      <DetailPair label="Adjuster assigned" value={fmtDate(row.adjuster_assigned_at)} />
      <DetailPair label="Quantum proposed"  value={fmtDate(row.quantum_proposed_at)} />
      <DetailPair label="Quantum agreed"    value={fmtDate(row.quantum_agreed_at)} />
      <DetailPair label="Disputed at"       value={fmtDate(row.disputed_at)} />
      <DetailPair label="Settled at"        value={fmtDate(row.settled_at)} />
      <DetailPair label="Declined at"       value={fmtDate(row.declined_at)} />
      <DetailPair label="Closed at"         value={fmtDate(row.closed_at)} />
      <DetailPair label="Withdrawn at"      value={fmtDate(row.withdrawn_at)} />
      <DetailPair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
      <DetailPair
        label="SLA status"
        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)}
      />
      <DetailPair label="Escalation" value={String(row.escalation_level)} />

      {row.decline_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Decline reason</div>
          <div style={{ color: BAD }}>{row.decline_reason}</div>
        </div>
      )}
      {row.dispute_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: WARN }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: WARN }}>Dispute notes</div>
          <div style={{ color: TX2 }}>{row.dispute_notes}</div>
        </div>
      )}
      {row.withdrawal_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Withdrawal reason</div>
          <div style={{ color: TX2 }}>{row.withdrawal_reason}</div>
        </div>
      )}
      {row.claim_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Claim notes</div>
          <div style={{ color: TX2, whiteSpace: 'pre-wrap' }}>{row.claim_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function InsuranceClaimChainTab() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ClaimRow[] } }>('/insurance/claim-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load claims');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/insurance/claim-chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/insurance/claim-chain/${rowId}`);
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
      const res = await api.get<{ data: { events: ChainEvent[] } }>(`/insurance/claim-chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !['settled', 'declined', 'closed', 'withdrawn'].includes(r.chain_status);
      if (filter === 'catastrophic') return r.claim_value_tier === 'catastrophic';
      if (filter === 'major')        return r.claim_value_tier === 'major';
      if (filter === 'minor')        return r.claim_value_tier === 'minor';
      if (filter === 'small')        return r.claim_value_tier === 'small';
      if (filter === 'breached')     return !!r.sla_breached;
      if (filter === 'escalated')    return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let catastrophic_open = 0, breached = 0, escalated = 0, disputed = 0;
    let settled_count = 0, total_settled_zar = 0, total_claimed_zar = 0;
    for (const r of rows) {
      total_claimed_zar += r.claim_value_zar || 0;
      if (r.claim_value_tier === 'catastrophic' && !['settled', 'declined', 'closed', 'withdrawn'].includes(r.chain_status)) catastrophic_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (r.chain_status === 'disputed') disputed++;
      if (r.chain_status === 'settled' || r.chain_status === 'closed') {
        settled_count++;
        total_settled_zar += r.settled_value_zar || r.agreed_value_zar || 0;
      }
    }
    return { total: rows.length, catastrophic_open, breached, escalated, disputed, settled_count, total_settled_zar, total_claimed_zar };
  }, [rows]);

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Insurance claim chain</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          10-state P6 chain · notified → assessing → adjuster assigned → quantum proposed → quantum agreed →
          settled, with disputed branch and declined/withdrawn/closed terminals. Per-claim-value-tier SLA tiering
          (catastrophic ≥R50m gets more diligence time at adjuster + dispute stages). Catastrophic-tier
          settlement, decline, and SLA breaches escalate to the regulator inbox per FSCA Section 38 large-loss filing.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total claims"      value={kpis.total} />
        <KpiTile label="Catastrophic open" value={kpis.catastrophic_open} tone={kpis.catastrophic_open > 0 ? 'warn' : undefined} />
        <KpiTile label="Disputed"          value={kpis.disputed}          tone={kpis.disputed > 0 ? 'warn' : undefined} />
        <KpiTile label="Settled / closed"  value={`${kpis.settled_count} · ${fmtZar(kpis.total_settled_zar)}`} />
        <KpiTile label="SLA breached"      value={kpis.breached}          tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Total claimed"     value={fmtZar(kpis.total_claimed_zar)} />
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
              title={row.claim_number}
              meta={`${row.claim_value_tier} · ${fmtZar(row.claim_value_zar)} · ${row.insurer_name}`}
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
              No claims match.
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

export default InsuranceClaimChainTab;
