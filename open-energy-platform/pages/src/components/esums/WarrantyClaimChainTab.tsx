// Wave 15 — OEM warranty / RMA claim chain tab.
//
// Severity-tiered claim state machine surfaced as a P6 audit chain.
//
//   • KPI strip: total / open safety / breached / denied or disputed /
//     in OEM review / recovery (ZAR)
//   • Filter pills by chain state + severity
//   • ChainCard list with inline expand, ActionModal per action
//   • Audit timeline shown lazily via events prop

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
  | 'opened' | 'triaged' | 'submitted' | 'acknowledged' | 'under_review'
  | 'approved' | 'denied' | 'disputed' | 'fulfilled' | 'closed';

type Severity = 'safety' | 'performance' | 'cosmetic';

interface ClaimRow {
  [key: string]: unknown;
  id: string;
  claim_number: string;
  tenant_id: string | null;
  asset_label: string;
  oem_name: string;
  subject: string;
  description: string | null;
  severity: Severity;
  severity_label?: string;
  fault_code: string | null;
  rma_number: string | null;
  chain_status: ChainStatus;
  chain_status_label?: string;
  is_terminal?: boolean;
  has_sla_window?: boolean;
  sla_window?: string | null;
  sla_deadline_at?: string | null;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  triaged_at: string | null;
  submitted_at: string | null;
  acknowledged_at: string | null;
  approved_at: string | null;
  denied_at: string | null;
  disputed_at: string | null;
  fulfilled_at: string | null;
  closed_at: string | null;
  resolution: string | null;
  denial_reason: string | null;
  dispute_reason: string | null;
  recovery_zar: number | null;
  sla_breach_count: number;
  created_at: string;
}

interface KpiData {
  total: number;
  safety_open: number;
  breached: number;
  denied_or_disputed: number;
  in_review: number;
  total_recovery_zar: number;
}

// ── state machine ─────────────────────────────────────────────────────────
const ALL_STATES: readonly string[] = [
  'opened',
  'triaged',
  'submitted',
  'acknowledged',
  'under_review',
  'approved',
  'fulfilled',
  'closed',
];

const BRANCH_STATES: readonly string[] = [
  'denied',
  'disputed',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active',       label: 'Active (pre-close)' },
  { key: 'all',          label: 'All' },
  { key: 'opened',       label: 'Opened' },
  { key: 'triaged',      label: 'Triaged' },
  { key: 'submitted',    label: 'Submitted' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'under_review', label: 'Under review' },
  { key: 'approved',     label: 'Approved' },
  { key: 'denied',       label: 'Denied' },
  { key: 'disputed',     label: 'Disputed' },
  { key: 'fulfilled',    label: 'Fulfilled' },
  { key: 'closed',       label: 'Closed' },
  { key: 'safety',       label: 'Safety only' },
  { key: 'breached',     label: 'SLA breached' },
];

// ── helpers ───────────────────────────────────────────────────────────────
function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  safety:      'Safety',
  performance: 'Performance',
  cosmetic:    'Cosmetic',
};

// ── actions ───────────────────────────────────────────────────────────────
function getActions(row: ClaimRow): ChainAction[] {
  const actions: ChainAction[] = [];
  const cs = row.chain_status;

  if (cs === 'opened') {
    actions.push({
      key: 'triage',
      label: 'Triage',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'close',
      label: 'Close',
      tone: 'ghost',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'triaged') {
    actions.push({
      key: 'submit',
      label: 'Submit to OEM',
      tone: 'primary',
      fields: [
        {
          key: 'rma_number',
          label: 'OEM RMA number (optional)',
          type: 'text',
          required: false,
          placeholder: String(row.rma_number ?? ''),
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'close',
      label: 'Close',
      tone: 'ghost',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'submitted') {
    actions.push({
      key: 'acknowledge',
      label: 'Mark OEM ack',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'acknowledged') {
    actions.push({
      key: 'begin-review',
      label: 'Start review',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'under_review') {
    actions.push({
      key: 'approve',
      label: 'Approve',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'deny',
      label: 'Deny',
      tone: 'danger',
      fields: [
        {
          key: 'denial_reason',
          label: 'OEM denial reason',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'denied') {
    actions.push({
      key: 'dispute',
      label: 'Dispute',
      tone: 'danger',
      fields: [
        {
          key: 'dispute_reason',
          label: 'Dispute reason / counter-evidence',
          type: 'textarea',
          required: true,
          placeholder: '',
        },
      ],
      cascadeTo: [],
    });
    actions.push({
      key: 'uphold-denial',
      label: 'Accept denial (close)',
      tone: 'ghost',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'disputed') {
    actions.push({
      key: 'approve',
      label: 'Approve (reversal)',
      tone: 'primary',
      fields: [],
      cascadeTo: [],
    });
    actions.push({
      key: 'uphold-denial',
      label: 'OEM upheld denial',
      tone: 'ghost',
      fields: [],
      cascadeTo: [],
    });
  }

  if (cs === 'approved') {
    actions.push({
      key: 'fulfill',
      label: 'Mark fulfilled',
      tone: 'primary',
      fields: [
        {
          key: 'resolution',
          label: 'Resolution notes (optional)',
          type: 'textarea',
          required: false,
          placeholder: String(row.resolution ?? ''),
        },
        {
          key: 'recovery_zar',
          label: 'Recovery booked (ZAR, optional)',
          type: 'number',
          required: false,
          placeholder: String(row.recovery_zar ?? ''),
        },
      ],
      cascadeTo: [],
    });
  }

  if (cs === 'fulfilled') {
    actions.push({
      key: 'close',
      label: 'Close',
      tone: 'ghost',
      fields: [],
      cascadeTo: [],
    });
  }

  return actions;
}

// ── detail render ─────────────────────────────────────────────────────────
function renderDetail(row: ClaimRow): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
      <DetailPair label="Asset" value={row.asset_label} />
      <DetailPair label="OEM" value={row.oem_name} />
      <DetailPair label="Claim #" value={row.claim_number} />
      <DetailPair label="Severity" value={SEVERITY_LABEL[row.severity]} />
      {row.fault_code && <DetailPair label="Fault code" value={row.fault_code} />}
      {row.rma_number && <DetailPair label="RMA #" value={row.rma_number} />}
      {row.recovery_zar != null && <DetailPair label="Recovery booked" value={fmtZar(row.recovery_zar)} />}
      {row.sla_deadline_at && (
        <DetailPair
          label="Next SLA"
          value={`${row.sla_window ?? '?'} → ${new Date(row.sla_deadline_at).toLocaleString()} (${fmtMin(row.minutes_until_sla)})`}
        />
      )}
      {row.description && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Description</div>
          <div style={{ color: TX2 }}>{row.description}</div>
        </div>
      )}
      {row.denial_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Denial reason</div>
          <div style={{ color: TX2 }}>{row.denial_reason}</div>
        </div>
      )}
      {row.dispute_reason && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Dispute reason</div>
          <div style={{ color: TX2 }}>{row.dispute_reason}</div>
        </div>
      )}
      {row.resolution && (
        <div className="col-span-2 rounded border px-2 py-1.5" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Resolution</div>
          <div style={{ color: TX2 }}>{row.resolution}</div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function WarrantyClaimChainTab() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('active');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get<{ data: { items: ClaimRow[] } }>('/esums/warranty-claims');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load warranty claims');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    try {
      await api.post(`/esums/warranty-claims/${rowId}/${key}`, values);
      await load();
      if (expandedEvents[rowId]) {
        try {
          const res = await api.get<{ data: { events: ChainEvent[] } }>(`/esums/warranty-claims/${rowId}`);
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
      const res = await api.get<{ data: { claim: ClaimRow; events: ChainEvent[] } }>(`/esums/warranty-claims/${id}`);
      setExpandedEvents(prev => ({ ...prev, [id]: res.data?.data?.events ?? [] }));
    } catch { /* silent */ }
  }, [expandedEvents]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'all')      return true;
      if (filter === 'active')   return r.chain_status !== 'closed';
      if (filter === 'safety')   return r.severity === 'safety';
      if (filter === 'breached') return !!r.sla_breached;
      return r.chain_status === filter;
    });
  }, [rows, filter]);

  const kpis: KpiData = useMemo(() => {
    let safety_open = 0, breached = 0, denied_or_disputed = 0, in_review = 0, total_recovery_zar = 0;
    for (const r of rows) {
      if (r.severity === 'safety' && r.chain_status !== 'closed') safety_open++;
      if (r.sla_breached) breached++;
      if (r.chain_status === 'denied' || r.chain_status === 'disputed') denied_or_disputed++;
      if (r.chain_status === 'under_review') in_review++;
      if (r.recovery_zar) total_recovery_zar += r.recovery_zar;
    }
    return { total: rows.length, safety_open, breached, denied_or_disputed, in_review, total_recovery_zar };
  }, [rows]);

  return (
    <div className="p-5" style={{ background: BG }}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Warranty / RMA Claims</h2>
          <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>OEM warranty and RMA claim lifecycle — severity-tiered, SLA-tracked.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-9 px-3 rounded-md text-white text-[12px] font-semibold whitespace-nowrap"
          style={{ background: ACC }}>
          + New claim
        </button>
      </header>

      {/* KPI strip */}
      <div className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total" value={kpis.total} />
        <KpiTile label="Safety open" value={kpis.safety_open} tone={kpis.safety_open > 0 ? 'bad' : undefined} />
        <KpiTile label="SLA breached" value={kpis.breached} tone={kpis.breached > 0 ? 'bad' : undefined} />
        <KpiTile label="Denied/disputed" value={kpis.denied_or_disputed} tone={kpis.denied_or_disputed > 0 ? 'warn' : undefined} />
        <KpiTile label="In OEM review" value={kpis.in_review} />
        <KpiTile label="Recovery booked" value={fmtZar(kpis.total_recovery_zar)} />
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
        <div className="mb-3 rounded border px-3 py-2 text-[11px]" style={{ background: 'oklch(0.97 0.04 20)', borderColor: BAD, color: BAD }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]" style={{ background: BG1, borderColor: BORDER, color: TX3 }}>
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => (
            <ChainCard
              key={row.id}
              item={{ ...row, sla_deadline_at: row.sla_deadline_at ?? null }}
              allStates={ALL_STATES}
              branchStates={BRANCH_STATES}
              title={row.subject}
              meta={
                <span style={{ color: TX3, fontSize: 11 }}>
                  {SEVERITY_LABEL[row.severity]} · {row.oem_name} · {row.claim_number}
                  {row.sla_breached ? <span style={{ color: BAD, fontWeight: 600 }}> · SLA BREACHED</span> : null}
                  {row.minutes_until_sla != null && !row.sla_breached
                    ? <span style={{ color: WARN }}> · {fmtMin(row.minutes_until_sla)} left</span>
                    : null}
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
              No claims match the current filter.
            </div>
          )}
        </div>
      )}

      {creating && (
        <CreateClaimModal
          onClose={() => setCreating(false)}
          onDone={() => { setCreating(false); void load(); }}
        />
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

function CreateClaimModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [assetLabel, setAssetLabel] = useState('');
  const [oemName, setOemName]       = useState('');
  const [subject, setSubject]       = useState('');
  const [severity, setSeverity]     = useState<Severity>('performance');
  const [description, setDescription] = useState('');
  const [faultCode, setFaultCode]   = useState('');
  const [warrantyRef, setWarrantyRef] = useState('');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState<string | null>(null);

  const submit = async () => {
    if (!assetLabel || !oemName || !subject) {
      setErr('Asset, OEM, and subject are required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.post('/esums/warranty-claims', {
        asset_label: assetLabel, oem_name: oemName, subject, severity,
        description: description || undefined,
        fault_code: faultCode || undefined,
        warranty_ref: warrantyRef || undefined,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" style={{ background: BG1 }} onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Open warranty / RMA claim</h3>
          <button type="button" onClick={onClose} style={{ color: TX3, fontSize: 16 }}>✕</button>
        </div>
        <div className="p-5 space-y-3 text-[13px]">
          {err && <div className="text-[12px]" style={{ color: BAD }}>{err}</div>}
          <ModalField label="Asset (label, serial)" value={assetLabel} onChange={setAssetLabel} placeholder="Sungrow SG250HX SN SGN-1234" />
          <ModalField label="OEM" value={oemName} onChange={setOemName} placeholder="Sungrow Power" />
          <ModalField label="Subject" value={subject} onChange={setSubject} />
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className="w-full px-3 py-2 rounded-lg text-[13px]"
              style={{ border: `1px solid ${BORDER}`, background: BG1, color: TX1 }}>
              <option value="safety">Safety</option>
              <option value="performance">Performance</option>
              <option value="cosmetic">Cosmetic</option>
            </select>
          </div>
          <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg resize-none text-[13px]"
              style={{ border: `1px solid ${BORDER}`, background: BG1, color: TX1 }} />
          </label>
          <ModalField label="Fault code (optional)" value={faultCode} onChange={setFaultCode} />
          <ModalField label="Warranty reference (optional)" value={warrantyRef} onChange={setWarrantyRef} />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px]"
              style={{ border: `1px solid ${BORDER}`, color: TX2 }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50"
              style={{ background: ACC }}>
              {saving ? 'Opening…' : 'Open claim'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: TX3 }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-[13px]"
        style={{ border: `1px solid ${BORDER}`, background: BG1, color: TX1 }} />
    </label>
  );
}

export default WarrantyClaimChainTab;
