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

type ChainStatus =
  | 'notified' | 'assessing' | 'adjuster_assigned'
  | 'quantum_proposed' | 'quantum_agreed' | 'disputed'
  | 'settled' | 'declined' | 'closed' | 'withdrawn';

type Tier = 'catastrophic' | 'major' | 'minor' | 'small';

interface ClaimRow {
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

interface ClaimEvent {
  id: string;
  claim_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  notified:          { bg: '#dbecfb', fg: '#1a3a5c', label: 'Notified' },
  assessing:         { bg: '#fff4d6', fg: '#a06200', label: 'Assessing' },
  adjuster_assigned: { bg: '#fff4d6', fg: '#a06200', label: 'Adjuster assigned' },
  quantum_proposed:  { bg: '#fde7c2', fg: '#8a4a00', label: 'Quantum proposed' },
  quantum_agreed:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Quantum agreed' },
  disputed:          { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  settled:           { bg: '#d4edda', fg: '#155724', label: 'Settled' },
  declined:          { bg: '#fde0e0', fg: '#9b1f1f', label: 'Declined' },
  closed:            { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
  withdrawn:         { bg: '#e3e7ec', fg: '#557',    label: 'Withdrawn' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  catastrophic: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Catastrophic (≥R50m)' },
  major:        { bg: '#fde7c2', fg: '#8a4a00', label: 'Major (R10m–R50m)' },
  minor:        { bg: '#fff4d6', fg: '#a06200', label: 'Minor (R500k–R10m)' },
  small:        { bg: '#e3e7ec', fg: '#557',    label: 'Small (<R500k)' },
};

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

type PrimaryAction =
  | 'begin-assessment' | 'assign-adjuster' | 'propose-quantum'
  | 'agree-quantum' | 'resolve-dispute' | 'settle' | 'close';

const ACTION_FOR_STATE: Record<ChainStatus, PrimaryAction | null> = {
  notified:          'begin-assessment',
  assessing:         'assign-adjuster',
  adjuster_assigned: 'propose-quantum',
  quantum_proposed:  'agree-quantum',
  quantum_agreed:    'settle',
  disputed:          'resolve-dispute',
  settled:           'close',
  declined:          'close',
  closed:            null,
  withdrawn:         null,
};

const ACTION_LABEL: Record<PrimaryAction | 'dispute' | 'decline' | 'withdraw', string> = {
  'begin-assessment': 'Begin assessment',
  'assign-adjuster':  'Assign loss adjuster',
  'propose-quantum':  'Propose quantum',
  'agree-quantum':    'Agree quantum',
  'resolve-dispute':  'Resolve dispute',
  'settle':           'Settle (payout)',
  'close':            'Close claim',
  'dispute':          'Dispute quantum',
  'decline':          'Decline claim',
  'withdraw':         'Withdraw claim',
};

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

export function InsuranceClaimChainTab() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ClaimRow | null>(null);
  const [events, setEvents] = useState<ClaimEvent[]>([]);

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

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { claim: ClaimRow; events: ClaimEvent[] } }>(
        `/insurance/claim-chain/${id}`,
      );
      if (res.data?.data?.claim) setSelected(res.data.data.claim);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load claim');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')          return true;
      if (filter === 'active')       return !['settled','declined','closed','withdrawn'].includes(r.chain_status);
      if (filter === 'catastrophic') return r.claim_value_tier === 'catastrophic';
      if (filter === 'major')        return r.claim_value_tier === 'major';
      if (filter === 'minor')        return r.claim_value_tier === 'minor';
      if (filter === 'small')        return r.claim_value_tier === 'small';
      if (filter === 'breached')     return r.sla_breached;
      if (filter === 'escalated')    return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let catastrophic_open = 0, breached = 0, escalated = 0, disputed = 0;
    let settled_count = 0, total_settled_zar = 0, total_claimed_zar = 0;
    for (const r of rows) {
      total_claimed_zar += r.claim_value_zar || 0;
      if (r.claim_value_tier === 'catastrophic' && !['settled','declined','closed','withdrawn'].includes(r.chain_status)) catastrophic_open++;
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

  const act = useCallback(async (action: PrimaryAction | 'dispute' | 'decline' | 'withdraw', row: ClaimRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'assign-adjuster') {
        const name = window.prompt('Loss adjuster firm (e.g. Crawford & Co, McLarens Africa, Marsh JLT):');
        if (!name) return;
        const ref = window.prompt('Adjuster reference (e.g. ADJ-2026-XXX-0001):') || '';
        body = { loss_adjuster_name: name };
        if (ref) body.loss_adjuster_ref = ref;
      } else if (action === 'propose-quantum') {
        const valStr = window.prompt('Adjuster-agreed quantum (ZAR, numeric):');
        if (!valStr) return;
        const val = Number(valStr.replace(/[, ]/g, ''));
        if (!isFinite(val) || val < 0) { setErr('Invalid amount'); return; }
        body = { agreed_value_zar: val };
        if (row.claim_value_tier === 'catastrophic') {
          const fsca = window.prompt('FSCA Section 38 report reference (catastrophic only):');
          if (fsca) body.fsca_report_ref = fsca;
        }
      } else if (action === 'settle') {
        const valStr = window.prompt(
          'Settled value (ZAR — defaults to agreed quantum):',
          String(row.agreed_value_zar ?? row.claim_value_zar),
        );
        if (!valStr) return;
        const val = Number(valStr.replace(/[, ]/g, ''));
        if (!isFinite(val) || val < 0) { setErr('Invalid amount'); return; }
        body = { settled_value_zar: val };
      } else if (action === 'dispute') {
        const notes = window.prompt('Dispute notes (required):');
        if (!notes) return;
        body = { dispute_notes: notes };
      } else if (action === 'decline') {
        const reason = window.prompt('Decline reason (policy citation expected):');
        if (!reason) return;
        body = { decline_reason: reason };
      } else if (action === 'withdraw') {
        const reason = window.prompt('Withdrawal reason:');
        if (!reason) return;
        body = { withdrawal_reason: reason };
      }
      await api.post(`/insurance/claim-chain/${row.id}/${action}`, body);
      await load();
      if (selected?.id === row.id) await loadEvents(row.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action}`);
    }
  }, [load, loadEvents, selected]);

  return (
    <div className="p-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Insurance claim chain</h2>
          <p className="text-xs text-[#4a5568]">
            10-state P6 chain · notified → assessing → adjuster assigned → quantum proposed → quantum agreed →
            settled, with disputed branch and declined/withdrawn/closed terminals. Per-claim-value-tier SLA tiering
            (catastrophic ≥R50m gets more diligence time at adjuster + dispute stages). Catastrophic-tier
            settlement, decline, and SLA breaches escalate to the regulator inbox per FSCA Section 38 large-loss
            filing.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total claims" value={kpis.total} />
        <Kpi label="Catastrophic open" value={kpis.catastrophic_open} tone={kpis.catastrophic_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="Disputed" value={kpis.disputed} tone={kpis.disputed > 0 ? 'warn' : 'ok'} />
        <Kpi label="Settled / closed" value={`${kpis.settled_count} · ${fmtZar(kpis.total_settled_zar)}`} />
        <Kpi label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Total claimed" value={fmtZar(kpis.total_claimed_zar)} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              filter === f.key
                ? 'bg-[#0c2a4d] text-white'
                : 'bg-white text-[#4a5568] border border-[#d8dde6] hover:bg-[#f3f5f9]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</div>
      )}
      {loading ? (
        <div className="rounded border border-[#d8dde6] bg-white px-4 py-6 text-center text-sm text-[#4a5568]">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded border border-[#d8dde6] bg-white">
          <table className="w-full text-[12px]">
            <thead className="bg-[#f3f5f9]">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Claim #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Asset</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Claim value</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Insurer</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.claim_value_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">{r.claim_number}</td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={r.asset_description}>{r.asset_description}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {r.claim_value_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(r.claim_value_zar)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] max-w-[180px] truncate" title={r.insurer_name}>{r.insurer_name}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No claims match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Drawer row={selected} events={events} onClose={() => setSelected(null)} onAct={act} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0c2a4d';
  return (
    <div className="rounded border border-[#d8dde6] bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Drawer({
  row, events, onClose, onAct,
}: {
  row: ClaimRow;
  events: ClaimEvent[];
  onClose: () => void;
  onAct: (action: PrimaryAction | 'dispute' | 'decline' | 'withdraw', row: ClaimRow) => void;
}) {
  const nextAction = ACTION_FOR_STATE[row.chain_status];
  const canDispute = ['quantum_proposed','quantum_agreed'].includes(row.chain_status);
  const canDecline = ['assessing','adjuster_assigned','quantum_proposed','disputed'].includes(row.chain_status);
  const canWithdraw = ['notified','assessing','adjuster_assigned','quantum_proposed','disputed'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[680px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.claim_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.asset_description}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.claim_value_tier].label} · {fmtZar(row.claim_value_zar)} · {row.insurer_name}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"               value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tier"                value={TIER_TONE[row.claim_value_tier].label} />
            <Pair label="Insurer"             value={row.insurer_name} />
            <Pair label="Policy"              value={row.policy_number} />
            <Pair label="Cover type"          value={row.cover_type} />
            <Pair label="Incident type"       value={row.incident_type} />
            <Pair label="Incident date"       value={fmtDate(row.incident_date)} />
            <Pair label="Claim value"         value={fmtZar(row.claim_value_zar)} />
            <Pair label="Agreed quantum"      value={fmtZar(row.agreed_value_zar)} />
            <Pair label="Settled value"       value={fmtZar(row.settled_value_zar)} />
            <Pair label="Excess"              value={fmtZar(row.excess_zar)} />
            <Pair label="Loss adjuster"       value={row.loss_adjuster_name ?? '—'} />
            <Pair label="Adjuster ref"        value={row.loss_adjuster_ref ?? '—'} />
            <Pair label="FSCA §38 ref"        value={row.fsca_report_ref ?? '—'} />
            <Pair label="Reinsurance layer"   value={row.reinsurance_layer ?? '—'} />
            <Pair label="Notified at"         value={fmtDate(row.notified_at)} />
            <Pair label="Assessing at"        value={fmtDate(row.assessing_at)} />
            <Pair label="Adjuster assigned"   value={fmtDate(row.adjuster_assigned_at)} />
            <Pair label="Quantum proposed"    value={fmtDate(row.quantum_proposed_at)} />
            <Pair label="Quantum agreed"      value={fmtDate(row.quantum_agreed_at)} />
            <Pair label="Disputed at"         value={fmtDate(row.disputed_at)} />
            <Pair label="Settled at"          value={fmtDate(row.settled_at)} />
            <Pair label="Declined at"         value={fmtDate(row.declined_at)} />
            <Pair label="Closed at"           value={fmtDate(row.closed_at)} />
            <Pair label="Withdrawn at"        value={fmtDate(row.withdrawn_at)} />
            <Pair label="SLA deadline"        value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"          value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation"          value={String(row.escalation_level)} />
          </div>
          {row.decline_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#9b1f1f]">Decline reason</div>
              <div className="text-[#9b1f1f]">{row.decline_reason}</div>
            </div>
          )}
          {row.dispute_notes && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#a06200]">Dispute notes</div>
              <div className="text-[#0c2a4d]">{row.dispute_notes}</div>
            </div>
          )}
          {row.withdrawal_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">Withdrawal reason</div>
              <div className="text-[#1a3a5c]">{row.withdrawal_reason}</div>
            </div>
          )}
          {row.claim_notes && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">Claim notes</div>
              <div className="text-[#1a3a5c] whitespace-pre-wrap">{row.claim_notes}</div>
            </div>
          )}
        </section>

        {(nextAction || canDispute || canDecline || canWithdraw) && (
          <section className="px-5 py-4 border-b border-[#e3e7ec]">
            <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Actions</div>
            <div className="flex flex-wrap gap-2">
              {nextAction && (
                <button
                  onClick={() => onAct(nextAction, row)}
                  className="rounded bg-[#0c2a4d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1a3a5c]"
                >
                  {ACTION_LABEL[nextAction]}
                </button>
              )}
              {canDispute && (
                <button
                  onClick={() => onAct('dispute', row)}
                  className="rounded border border-[#fac579] bg-white px-3 py-1.5 text-[12px] font-medium text-[#a06200] hover:bg-[#fff8ec]"
                >
                  {ACTION_LABEL.dispute}
                </button>
              )}
              {canDecline && (
                <button
                  onClick={() => onAct('decline', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.decline}
                </button>
              )}
              {canWithdraw && (
                <button
                  onClick={() => onAct('withdraw', row)}
                  className="rounded border border-[#d8dde6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4a5568] hover:bg-[#f3f5f9]"
                >
                  {ACTION_LABEL.withdraw}
                </button>
              )}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-[#4a5568] mb-2">Audit timeline</div>
          {events.length === 0 ? (
            <div className="text-[12px] text-[#4a5568]">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded border border-[#e3e7ec] bg-[#fafbfc] px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#0c2a4d]">{e.event_type}</span>
                    <span className="text-[#4a5568] tabular-nums">{fmtDate(e.created_at)}</span>
                  </div>
                  {(e.from_status || e.to_status) && (
                    <div className="text-[#4a5568]">{e.from_status ?? '—'} → {e.to_status ?? '—'}</div>
                  )}
                  {e.notes && <div className="mt-1 text-[#1a3a5c]">{e.notes}</div>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">{label}</div>
      <div className="text-[12px] text-[#0c2a4d]">{value}</div>
    </div>
  );
}
