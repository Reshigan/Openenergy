// Wave 21 — Lender drawdown / disbursement certification chain tab.
//
// 10-state P6 chain layered on oe_drawdown_chain. Per-tranche-tier SLA tiering
// (senior ≥R500m / mezz ≥R100m / equity <R100m — bigger tranches get more
// diligence time per SARB + REIPPPP). Senior-tier approve + reject + SLA-breach
// cross into the regulator inbox (SARB large-exposure + DMRE delivery-risk).
//
//   • KPI strip: total / senior open / in diligence / approved / funded / breached
//   • Filter pills by chain state + tier + breached/escalated
//   • Listing with tier pill + state pill + SLA countdown + ZAR amount
//   • Drill-down: per-state primary action + query + reject + cancel + audit timeline

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { prompt } from '../PromptDialog';

type ChainStatus =
  | 'requested' | 'documents_submitted' | 'ie_review' | 'cp_checklist'
  | 'on_hold' | 'approved' | 'funded' | 'closed' | 'rejected' | 'cancelled';

type Tier = 'senior' | 'mezz' | 'equity';

interface DrawdownRow {
  id: string;
  drawdown_number: string;
  facility_id: string | null;
  project_id: string | null;
  participant_id: string;
  lender_id: string;
  project_name: string;
  facility_name: string | null;
  tranche_label: string;
  amount_zar: number;
  tranche_tier: Tier;
  chain_status: ChainStatus;
  requested_at: string | null;
  documents_at: string | null;
  ie_review_at: string | null;
  cp_started_at: string | null;
  on_hold_at: string | null;
  approved_at: string | null;
  funded_at: string | null;
  closed_at: string | null;
  ie_certifier: string | null;
  ie_cert_doc_ref: string | null;
  cp_evidence_ref: string | null;
  sarb_disclosure_ref: string | null;
  query_notes: string | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  funding_account_ref: string | null;
  drawdown_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  sla_breached?: boolean;
  minutes_until_sla?: number | null;
  is_terminal?: boolean;
  created_at: string;
}

interface DrawdownEvent {
  id: string;
  drawdown_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  requested:           { bg: '#e3e7ec', fg: '#557',    label: 'Requested' },
  documents_submitted: { bg: '#dbecfb', fg: '#1a3a5c', label: 'Documents in' },
  ie_review:           { bg: '#fff4d6', fg: '#a06200', label: 'IE review' },
  cp_checklist:        { bg: '#fff4d6', fg: '#a06200', label: 'CP checklist' },
  on_hold:             { bg: '#ffe4e1', fg: '#a04040', label: 'On hold (query)' },
  approved:            { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  funded:              { bg: '#d4edda', fg: '#155724', label: 'Funded' },
  closed:              { bg: '#cce6cc', fg: '#0d4f1d', label: 'Closed' },
  rejected:            { bg: '#fde0e0', fg: '#9b1f1f', label: 'Rejected' },
  cancelled:           { bg: '#f3e0e0', fg: '#6b1f1f', label: 'Cancelled' },
};

const TIER_TONE: Record<Tier, { bg: string; fg: string; label: string }> = {
  senior: { bg: '#fde0e0', fg: '#9b1f1f', label: 'Senior (≥R500m)' },
  mezz:   { bg: '#ffe4b5', fg: '#8a4a00', label: 'Mezz (R100m–R500m)' },
  equity: { bg: '#e3e7ec', fg: '#557',    label: 'Equity (<R100m)' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',              label: 'Active' },
  { key: 'all',                 label: 'All' },
  { key: 'senior',              label: 'Senior' },
  { key: 'mezz',                label: 'Mezz' },
  { key: 'equity',              label: 'Equity' },
  { key: 'breached',            label: 'SLA breached' },
  { key: 'escalated',           label: 'Escalated' },
  { key: 'requested',           label: 'Requested' },
  { key: 'documents_submitted', label: 'Docs in' },
  { key: 'ie_review',           label: 'IE review' },
  { key: 'cp_checklist',        label: 'CP checklist' },
  { key: 'on_hold',             label: 'On hold' },
  { key: 'approved',            label: 'Approved' },
  { key: 'funded',              label: 'Funded' },
  { key: 'closed',              label: 'Closed' },
  { key: 'rejected',            label: 'Rejected' },
  { key: 'cancelled',           label: 'Cancelled' },
];

type PrimaryAction =
  | 'submit-documents' | 'begin-ie-review' | 'pass-to-cp'
  | 'resume' | 'approve' | 'fund' | 'close';

const ACTION_FOR_STATE: Record<ChainStatus, PrimaryAction | null> = {
  requested:           'submit-documents',
  documents_submitted: 'begin-ie-review',
  ie_review:           'pass-to-cp',
  cp_checklist:        'approve',
  on_hold:             'resume',
  approved:            'fund',
  funded:              'close',
  closed:              null,
  rejected:            null,
  cancelled:           null,
};

const ACTION_LABEL: Record<PrimaryAction | 'query' | 'reject' | 'cancel', string> = {
  'submit-documents': 'Submit documents',
  'begin-ie-review':  'Begin IE review',
  'pass-to-cp':       'Pass to CP checklist',
  'resume':           'Resume to CP',
  'approve':          'Approve (IE + SARB sign-off)',
  'fund':             'Fund (treasury wire)',
  'close':            'Close drawdown',
  'query':            'Query (put on hold)',
  'reject':           'Reject',
  'cancel':           'Cancel',
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
  if (n >= 1_000_000_000) return `R${(n / 1_000_000_000).toFixed(2)}bn`;
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${n}`;
}

export function DrawdownChainTab() {
  const [rows, setRows] = useState<DrawdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<DrawdownRow | null>(null);
  const [events, setEvents] = useState<DrawdownEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: DrawdownRow[] } }>('/lender/drawdown-chain');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load drawdown chains');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { drawdown: DrawdownRow; events: DrawdownEvent[] } }>(
        `/lender/drawdown-chain/${id}`
      );
      if (res.data?.data?.drawdown) setSelected(res.data.data.drawdown);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load drawdown history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')       return true;
      if (filter === 'active')    return !['closed','rejected','cancelled'].includes(r.chain_status);
      if (filter === 'senior')    return r.tranche_tier === 'senior';
      if (filter === 'mezz')      return r.tranche_tier === 'mezz';
      if (filter === 'equity')    return r.tranche_tier === 'equity';
      if (filter === 'breached')  return r.sla_breached;
      if (filter === 'escalated') return r.escalation_level > 0;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis = useMemo(() => {
    let senior_open = 0, breached = 0, escalated = 0;
    let in_diligence = 0, approved_open = 0, funded_count = 0, rejected_count = 0;
    let total_funded_zar = 0, total_pipeline_zar = 0;
    for (const r of rows) {
      if (r.tranche_tier === 'senior' && !['closed','rejected','cancelled'].includes(r.chain_status)) senior_open++;
      if (r.sla_breached) breached++;
      if (r.escalation_level > 0) escalated++;
      if (['documents_submitted','ie_review','cp_checklist','on_hold'].includes(r.chain_status)) {
        in_diligence++;
        total_pipeline_zar += r.amount_zar || 0;
      }
      if (r.chain_status === 'approved') {
        approved_open++;
        total_pipeline_zar += r.amount_zar || 0;
      }
      if (r.chain_status === 'funded' || r.chain_status === 'closed') {
        funded_count++;
        total_funded_zar += r.amount_zar || 0;
      }
      if (r.chain_status === 'rejected') rejected_count++;
    }
    return { total: rows.length, senior_open, breached, escalated, in_diligence, approved_open, funded_count, rejected_count, total_funded_zar, total_pipeline_zar };
  }, [rows]);

  const act = useCallback(async (action: PrimaryAction | 'query' | 'reject' | 'cancel', row: DrawdownRow) => {
    try {
      let body: Record<string, string | number> = {};
      if (action === 'begin-ie-review') {
        const ie = await prompt('Independent Engineer firm (e.g. Mott MacDonald):');
        if (!ie) return;
        body = { ie_certifier: ie };
      } else if (action === 'pass-to-cp') {
        const cert = await prompt('IE certificate document ref (e.g. IE-CERT-2026-NAME-0001):');
        if (!cert) return;
        body = { ie_cert_doc_ref: cert };
      } else if (action === 'approve') {
        const cp = await prompt('CP evidence bundle ref (e.g. CP-PACK-2026-NAME-Q2):');
        if (!cp) return;
        let sarb = '';
        if (row.tranche_tier === 'senior') {
          sarb = await prompt('SARB large-exposure disclosure ref (senior tranche — required for regulator inbox):') || '';
          if (!sarb) return;
        }
        body = { cp_evidence_ref: cp };
        if (sarb) body.sarb_disclosure_ref = sarb;
      } else if (action === 'fund') {
        const wire = await prompt('Treasury wire reference (e.g. WIRE-REF-SBSA-20260601-0500000000):');
        if (!wire) return;
        body = { funding_account_ref: wire };
      } else if (action === 'query') {
        const notes = await prompt('Query notes — what is blocked, what evidence is required:');
        if (!notes) return;
        body = { query_notes: notes };
      } else if (action === 'reject') {
        const reason = await prompt('Rejection reason (filed against IPP):');
        if (!reason) return;
        body = { reason };
      } else if (action === 'cancel') {
        const reason = await prompt('Cancellation reason (PPA collapse, sponsor walk-away, etc):');
        if (!reason) return;
        body = { reason };
      }
      await api.post(`/lender/drawdown-chain/${row.id}/${action}`, body);
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
          <h2 className="text-lg font-semibold text-[#0c2a4d]">Lender drawdown / disbursement certification chain</h2>
          <p className="text-xs text-[#4a5568]">
            10-stage P6 chain · requested → documents in → IE review → CP checklist → approved → funded → closed
            (query branches to on-hold; resume returns to CP). Per-tranche-tier SLAs (senior ≥R500m / mezz ≥R100m / equity &lt;R100m —
            bigger tranches get more diligence time). Senior-tier approval, rejection, and SLA breaches cross to the regulator inbox
            per SARB large-exposure mandate + REIPPPP transparency.
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Total tranches" value={kpis.total} />
        <Kpi label="Senior open" value={kpis.senior_open} tone={kpis.senior_open > 0 ? 'warn' : 'ok'} />
        <Kpi label="In diligence" value={`${kpis.in_diligence} · ${fmtZar(kpis.total_pipeline_zar)}`} />
        <Kpi label="Funded" value={`${kpis.funded_count} · ${fmtZar(kpis.total_funded_zar)}`} />
        <Kpi label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : 'ok'} />
        <Kpi label="Rejected" value={kpis.rejected_count} tone={kpis.rejected_count > 0 ? 'bad' : 'ok'} />
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
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Drawdown #</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Project / tranche</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Tier</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">Amount</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">State</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c]">Lender</th>
                <th className="px-3 py-2 font-semibold text-[#1a3a5c] text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cs = STATE_TONE[r.chain_status];
                const tt = TIER_TONE[r.tranche_tier];
                return (
                  <tr
                    key={r.id}
                    onClick={() => loadEvents(r.id)}
                    className="cursor-pointer border-t border-[#e3e7ec] hover:bg-[#f8fafc]"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] text-[#1a3a5c]">{r.drawdown_number}</td>
                    <td className="px-3 py-2 text-[#0c2a4d] max-w-[280px] truncate" title={`${r.project_name} · ${r.tranche_label}`}>
                      {r.project_name}
                      <span className="text-[#4a5568]"> · {r.tranche_label}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: tt.bg, color: tt.fg }}>
                        {r.tranche_tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1a3a5c]">{fmtZar(r.amount_zar)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: cs.bg, color: cs.fg }}>
                        {cs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#4a5568] max-w-[140px] truncate" title={r.lender_id}>
                      {r.lender_id}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                      {r.is_terminal ? '—' : r.sla_breached ? 'BREACHED' : fmtMinutes(r.minutes_until_sla)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#4a5568]">No drawdowns match.</td></tr>
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
  row: DrawdownRow;
  events: DrawdownEvent[];
  onClose: () => void;
  onAct: (action: PrimaryAction | 'query' | 'reject' | 'cancel', row: DrawdownRow) => void;
}) {
  const nextAction   = ACTION_FOR_STATE[row.chain_status];
  const canQuery     = ['ie_review', 'cp_checklist'].includes(row.chain_status);
  const canReject    = ['requested','documents_submitted','ie_review','cp_checklist','on_hold'].includes(row.chain_status);
  const canCancel    = !['funded','closed','rejected','cancelled'].includes(row.chain_status);

  return (
    <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full md:w-[720px] overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-[#d8dde6] bg-[#f3f5f9] px-5 py-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[12px] text-[#4a5568]">{row.drawdown_number}</div>
              <div className="text-base font-semibold text-[#0c2a4d]">{row.project_name}</div>
              <div className="mt-1 text-[12px] text-[#4a5568]">
                {TIER_TONE[row.tranche_tier].label} · {fmtZar(row.amount_zar)} · {row.tranche_label}
                {row.facility_name ? ` · ${row.facility_name}` : ''}
              </div>
            </div>
            <button onClick={onClose} className="text-[#4a5568] hover:text-[#0c2a4d]">✕</button>
          </div>
        </header>

        <section className="px-5 py-4 border-b border-[#e3e7ec]">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Pair label="State"             value={STATE_TONE[row.chain_status].label} />
            <Pair label="Tranche tier"      value={TIER_TONE[row.tranche_tier].label} />
            <Pair label="Amount"            value={fmtZar(row.amount_zar)} />
            <Pair label="Tranche label"     value={row.tranche_label} />
            <Pair label="IPP (participant)" value={row.participant_id} />
            <Pair label="Lender"            value={row.lender_id} />
            <Pair label="Requested"         value={fmtDate(row.requested_at)} />
            <Pair label="Documents in"      value={fmtDate(row.documents_at)} />
            <Pair label="IE review"         value={fmtDate(row.ie_review_at)} />
            <Pair label="CP started"        value={fmtDate(row.cp_started_at)} />
            <Pair label="On hold"           value={fmtDate(row.on_hold_at)} />
            <Pair label="Approved"          value={fmtDate(row.approved_at)} />
            <Pair label="Funded"            value={fmtDate(row.funded_at)} />
            <Pair label="Closed"            value={fmtDate(row.closed_at)} />
            <Pair label="IE certifier"      value={row.ie_certifier ?? '—'} />
            <Pair label="IE cert ref"       value={row.ie_cert_doc_ref ?? '—'} />
            <Pair label="CP evidence ref"   value={row.cp_evidence_ref ?? '—'} />
            <Pair label="SARB disclosure"   value={row.sarb_disclosure_ref ?? '—'} />
            <Pair label="Wire reference"    value={row.funding_account_ref ?? '—'} />
            <Pair label="SLA deadline"      value={fmtDate(row.sla_deadline_at)} />
            <Pair label="SLA status"        value={row.is_terminal ? '—' : row.sla_breached ? 'BREACHED' : fmtMinutes(row.minutes_until_sla)} />
            <Pair label="Escalation"        value={String(row.escalation_level)} />
          </div>
          {row.query_notes && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#a04040]">Query notes</div>
              <div className="text-[#a04040] whitespace-pre-wrap">{row.query_notes}</div>
            </div>
          )}
          {row.rejection_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#9b1f1f]">Rejection reason</div>
              <div className="text-[#9b1f1f]">{row.rejection_reason}</div>
            </div>
          )}
          {row.cancellation_reason && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#6b1f1f]">Cancellation reason</div>
              <div className="text-[#6b1f1f]">{row.cancellation_reason}</div>
            </div>
          )}
          {row.drawdown_notes && (
            <div className="mt-3 text-[12px]">
              <div className="text-[10px] uppercase tracking-wider text-[#4a5568]">Drawdown notes</div>
              <div className="text-[#1a3a5c] whitespace-pre-wrap">{row.drawdown_notes}</div>
            </div>
          )}
        </section>

        {(nextAction || canQuery || canReject || canCancel) && (
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
              {canQuery && (
                <button
                  onClick={() => onAct('query', row)}
                  className="rounded border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-medium text-amber-800 hover:bg-amber-50"
                >
                  {ACTION_LABEL.query}
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => onAct('reject', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.reject}
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => onAct('cancel', row)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50"
                >
                  {ACTION_LABEL.cancel}
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
