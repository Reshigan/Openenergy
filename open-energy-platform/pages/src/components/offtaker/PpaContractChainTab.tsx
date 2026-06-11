// Wave 22 — Offtaker PPA contract execution lifecycle tab.
//
// 9-state P6 chain on oe_ppa_contract_chain. Per-capacity-tier SLAs
// (strategic ≥100MW / medium 10-100MW / small <10MW — bigger contracts get
// more diligence time). Strategic-tier execute, terminate, and SLA-breach
// cross into the regulator inbox (NERSA Section 34 determination).
//
//   • KPI strip: total / strategic open / in_negotiation / executed / in_force / breached / disputed / terminated
//   • Filter pills by chain state + tier + breached/escalated
//   • Listing with tier pill + state pill + SLA countdown + MW + offtaker
//   • Drill-down: timeline + per-state actions + dispute/resolve/terminate/cancel

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
  | 'draft' | 'in_negotiation' | 'terms_locked' | 'legal_signed'
  | 'executed' | 'in_force' | 'in_dispute'
  | 'terminated' | 'expired' | 'cancelled';

type Tier = 'strategic' | 'medium' | 'small';

interface PpaRow {
  [key: string]: unknown;
  id: string;
  ppa_number: string;
  project_id: string | null;
  participant_id: string;
  offtaker_id: string;
  project_name: string;
  offtaker_name: string;
  contract_term_years: number;
  capacity_mw: number;
  capacity_tier: Tier;
  tariff_zar_per_mwh: number | null;
  indexation: string | null;
  take_or_pay_pct: number | null;
  chain_status: ChainStatus;
  draft_at: string | null;
  negotiation_at: string | null;
  terms_locked_at: string | null;
  legal_signed_at: string | null;
  executed_at: string | null;
  in_force_at: string | null;
  dispute_at: string | null;
  resolved_at: string | null;
  terminated_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  nersa_section34_ref: string | null;
  legal_counterparty_ref: string | null;
  board_approval_ref: string | null;
  termination_reason: string | null;
  cancellation_reason: string | null;
  dispute_notes: string | null;
  contract_notes: string | null;
  expiry_date: string | null;
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
  'draft',
  'in_negotiation',
  'terms_locked',
  'legal_signed',
  'executed',
  'in_force',
];

const BRANCH_STATES: readonly string[] = [
  'in_dispute',
  'terminated',
  'expired',
  'cancelled',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',         label: 'Active' },
  { key: 'all',            label: 'All' },
  { key: 'strategic',      label: 'Strategic' },
  { key: 'medium',         label: 'Medium' },
  { key: 'small',          label: 'Small' },
  { key: 'breached',       label: 'SLA breached' },
  { key: 'escalated',      label: 'Escalated' },
  { key: 'draft',          label: 'Draft' },
  { key: 'in_negotiation', label: 'Negotiating' },
  { key: 'terms_locked',   label: 'Terms locked' },
  { key: 'legal_signed',   label: 'Legal signed' },
  { key: 'executed',       label: 'Executed' },
  { key: 'in_force',       label: 'In force' },
  { key: 'in_dispute',     label: 'In dispute' },
  { key: 'terminated',     label: 'Terminated' },
  { key: 'expired',        label: 'Expired' },
  { key: 'cancelled',      label: 'Cancelled' },
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

function fmtMw(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}GW`;
  return `${n}MW`;
}

function fmtZar(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `R${n.toFixed(2)}/MWh`;
}

const TIER_LABEL: Record<Tier, string> = {
  strategic: 'Strategic (≥100MW)',
  medium:    'Medium (10-100MW)',
  small:     'Small (<10MW)',
};

// ── action builder ────────────────────────────────────────────────────────
function getActions(row: PpaRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const s = row.chain_status;

  // Primary forward action per state
  if (s === 'draft') {
    actions.push({
      key: 'begin-negotiation',
      label: 'Begin negotiation',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (s === 'in_negotiation') {
    actions.push({
      key: 'lock-terms',
      label: 'Lock commercial terms',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (s === 'terms_locked') {
    actions.push({
      key: 'legal-sign',
      label: 'Legal sign-off',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (s === 'legal_signed') {
    // execute: strategic tier requires NERSA S34 ref; board + legal always required
    // Strategic execute crosses regulator inbox (NERSA Section 34)
    actions.push({
      key: 'execute',
      label: 'Execute (NERSA S34)',
      tone: 'primary',
      fields: [
        ...(row.capacity_tier === 'strategic' ? [{
          key: 'nersa_section34_ref',
          label: 'NERSA Section 34 determination reference (strategic-tier — required for regulator inbox)',
          type: 'text' as const,
          required: true,
          placeholder: 'e.g. NERSA/S34/2026-001',
        }] : []),
        {
          key: 'board_approval_ref',
          label: 'Offtaker board resolution reference',
          type: 'text' as const,
          required: true,
          placeholder: 'e.g. BR-2026-019',
        },
        {
          key: 'legal_counterparty_ref',
          label: 'Legal counterparty reference',
          type: 'text' as const,
          required: true,
          placeholder: 'e.g. Webber Wentzel',
        },
      ],
      cascadeTo: row.capacity_tier === 'strategic' ? ['regulator'] : [],
    });
  } else if (s === 'executed') {
    actions.push({
      key: 'commence',
      label: 'Commence (COD reached)',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  } else if (s === 'in_dispute') {
    actions.push({
      key: 'resolve',
      label: 'Resolve dispute',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  // Dispute action — available from in_force
  if (s === 'in_force') {
    actions.push({
      key: 'dispute',
      label: 'Raise dispute',
      tone: 'warn',
      fields: [
        {
          key: 'dispute_notes',
          label: 'Dispute notes — clause, amount, evidence',
          type: 'textarea',
          required: true,
          placeholder: 'Describe the dispute in detail...',
        },
      ],
      cascadeTo: [],
    });
  }

  // Terminate — available post-execution
  if (['executed', 'in_force', 'in_dispute'].includes(s)) {
    actions.push({
      key: 'terminate',
      label: 'Terminate',
      tone: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Termination reason (material breach, default, etc)',
          type: 'textarea',
          required: true,
          placeholder: 'e.g. Material breach of clause 12.3...',
        },
      ],
      // Strategic terminate crosses regulator per header comment
      cascadeTo: row.capacity_tier === 'strategic' ? ['regulator'] : [],
    });
  }

  // Cancel — available pre-execution
  if (['draft', 'in_negotiation', 'terms_locked', 'legal_signed'].includes(s)) {
    actions.push({
      key: 'cancel',
      label: 'Cancel',
      tone: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Cancellation reason (pre-execution withdrawal)',
          type: 'textarea',
          required: true,
          placeholder: 'e.g. Project no longer viable...',
        },
      ],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail renderer ───────────────────────────────────────────────────────
function renderDetail(row: PpaRow): React.ReactNode {
  const slaDisplay = row.is_terminal || row.chain_status === 'in_force'
    ? '—'
    : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla);

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Capacity"       value={fmtMw(row.capacity_mw)} />
      <DetailPair label="Tier"           value={TIER_LABEL[row.capacity_tier]} />
      <DetailPair label="Tariff"         value={fmtZar(row.tariff_zar_per_mwh)} />
      <DetailPair label="Indexation"     value={row.indexation ?? '—'} />
      <DetailPair label="Take-or-pay"    value={row.take_or_pay_pct ? `${row.take_or_pay_pct}%` : '—'} />
      <DetailPair label="Term"           value={`${row.contract_term_years} years`} />
      <DetailPair label="Expiry"         value={row.expiry_date ?? '—'} />
      <DetailPair label="Draft"          value={fmtDate(row.draft_at)} />
      <DetailPair label="Negotiation"    value={fmtDate(row.negotiation_at)} />
      <DetailPair label="Terms locked"   value={fmtDate(row.terms_locked_at)} />
      <DetailPair label="Legal signed"   value={fmtDate(row.legal_signed_at)} />
      <DetailPair label="Executed"       value={fmtDate(row.executed_at)} />
      <DetailPair label="In force"       value={fmtDate(row.in_force_at)} />
      <DetailPair label="NERSA S34"      value={row.nersa_section34_ref ?? '—'} />
      <DetailPair label="Board approval" value={row.board_approval_ref ?? '—'} />
      <DetailPair label="Legal counter." value={row.legal_counterparty_ref ?? '—'} />
      <DetailPair label="SLA deadline"   value={fmtDate(row.sla_deadline_at)} />
      <DetailPair label="SLA status"     value={slaDisplay} />
      <DetailPair label="Escalation"     value={String(row.escalation_level)} />

      {row.dispute_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Dispute notes</div>
          <div style={{ color: BAD }}>{row.dispute_notes}</div>
        </div>
      )}
      {row.termination_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Termination reason</div>
          <div style={{ color: BAD }}>{row.termination_reason}</div>
        </div>
      )}
      {row.cancellation_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: BAD }}>Cancellation reason</div>
          <div style={{ color: BAD }}>{row.cancellation_reason}</div>
        </div>
      )}
      {row.contract_notes && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Contract notes</div>
          <div style={{ color: TX2 }}>{row.contract_notes}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function PpaContractChainTab() {
  const [rows, setRows] = useState<PpaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{ data: { items: PpaRow[] } }>('/offtaker/ppa-contract-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load PPA chains');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/offtaker/ppa-contract-chain/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/offtaker/ppa-contract-chain/${rowId}`);
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
      const res = await api.get<{ data: { ppa: PpaRow; events: ChainEvent[] } }>(`/offtaker/ppa-contract-chain/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return !['terminated', 'expired', 'cancelled'].includes(r.chain_status);
      if (filter === 'strategic') return r.capacity_tier === 'strategic';
      if (filter === 'medium')    return r.capacity_tier === 'medium';
      if (filter === 'small')     return r.capacity_tier === 'small';
      if (filter === 'breached')  return !!r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let strategic_open = 0, breached = 0, in_negotiation = 0;
    let executed_count = 0, in_force = 0, in_dispute = 0, terminated = 0;
    let contracted_mw = 0;
    for (const r of rows) {
      if (r.capacity_tier === 'strategic' && !['terminated', 'expired', 'cancelled'].includes(r.chain_status)) strategic_open++;
      if (r.sla_breached) breached++;
      if (['draft', 'in_negotiation', 'terms_locked', 'legal_signed'].includes(r.chain_status)) in_negotiation++;
      if (r.chain_status === 'executed') executed_count++;
      if (r.chain_status === 'in_force') { in_force++; contracted_mw += r.capacity_mw || 0; }
      if (r.chain_status === 'in_dispute') in_dispute++;
      if (r.chain_status === 'terminated') terminated++;
    }
    return { total: rows.length, strategic_open, breached, in_negotiation, executed_count, in_force, in_dispute, terminated, contracted_mw };
  }, [rows]);

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Offtaker PPA contract execution lifecycle</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          9-stage P6 chain · draft → in negotiation → terms locked → legal signed → executed → in force.
          Disputes branch in/out of in-force; cancel for pre-execution, terminate post-execution. Per-capacity-tier SLAs
          (strategic ≥100MW gets 90d draft + 180d negotiation + 18mo to COD). Strategic-tier execute, termination, and
          SLA breaches cross to the regulator inbox per NERSA Section 34 determination + market-stability mandate.
        </p>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total PPAs"     value={kpis.total} />
        <KpiTile label="Strategic open" value={kpis.strategic_open} tone={kpis.strategic_open > 0 ? 'warn' : undefined} />
        <KpiTile label="Negotiating"    value={kpis.in_negotiation} />
        <KpiTile label="In force"       value={`${kpis.in_force} · ${fmtMw(kpis.contracted_mw)}`} />
        <KpiTile label="In dispute"     value={kpis.in_dispute} tone={kpis.in_dispute > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached"   value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
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
              title={row.ppa_number}
              meta={
                <span style={{ color: TX3, fontSize: 11 }}>
                  {row.project_name} · {row.offtaker_name} · {TIER_LABEL[row.capacity_tier]} · {fmtMw(row.capacity_mw)} · {row.contract_term_years}yr
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
            <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No PPAs match.</div>
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

export default PpaContractChainTab;
