// Wave 15 — OEM warranty / RMA claim chain tab.
//
// Severity-tiered claim state machine surfaced as a P6 audit chain.
//
//   • KPI strip: total / open safety / breached / denied or disputed /
//     in OEM review / recovery (ZAR)
//   • Filter pills by chain state + severity
//   • Listing with severity pill + SLA countdown
//   • Drill-down: timeline + per-state action buttons (9 transitions)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'opened' | 'triaged' | 'submitted' | 'acknowledged' | 'under_review'
  | 'approved' | 'denied' | 'disputed' | 'fulfilled' | 'closed';

type Severity = 'safety' | 'performance' | 'cosmetic';

interface ClaimRow {
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

interface ClaimEvent {
  id: string;
  claim_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  sla_window: string | null;
  actor_id: string | null;
  notes: string | null;
  payload_json: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  opened:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'Opened' },
  triaged:      { bg: '#fff4d6', fg: '#a06200', label: 'Triaged' },
  submitted:    { bg: '#dbecfb', fg: '#1a3a5c', label: 'Submitted' },
  acknowledged: { bg: '#dbecfb', fg: '#1a3a5c', label: 'OEM acknowledged' },
  under_review: { bg: '#fff4d6', fg: '#a06200', label: 'Under review' },
  approved:     { bg: '#daf5e2', fg: '#1f6b3a', label: 'Approved' },
  denied:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'Denied' },
  disputed:     { bg: '#fde0e0', fg: '#9b1f1f', label: 'Disputed' },
  fulfilled:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Fulfilled' },
  closed:       { bg: '#e3e7ec', fg: '#557',    label: 'Closed' },
};

const SEVERITY_TONE: Record<Severity, { bg: string; fg: string; label: string }> = {
  safety:      { bg: '#fde0e0', fg: '#9b1f1f', label: 'Safety' },
  performance: { bg: '#fff4d6', fg: '#a06200', label: 'Performance' },
  cosmetic:    { bg: '#e3e7ec', fg: '#557',    label: 'Cosmetic' },
};

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

interface KpiData {
  total: number;
  safety_open: number;
  breached: number;
  denied_or_disputed: number;
  in_review: number;
  total_recovery_zar: number;
}

function fmtZar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}

function fmtMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  if (Math.abs(min) >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (Math.abs(min) >= 60)   return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

export function WarrantyClaimChainTab() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('active');
  const [selected, setSelected] = useState<ClaimRow | null>(null);
  const [events, setEvents] = useState<ClaimEvent[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ data: { items: ClaimRow[] } }>('/esums/warranty-claims');
      setRows(res.data?.data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load warranty claims');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadEvents = useCallback(async (id: string) => {
    try {
      const res = await api.get<{ data: { claim: ClaimRow; events: ClaimEvent[] } }>(`/esums/warranty-claims/${id}`);
      if (res.data?.data?.claim) setSelected(res.data.data.claim);
      setEvents(res.data?.data?.events || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load claim history');
    }
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'all')      return true;
      if (filter === 'active')   return r.chain_status !== 'closed';
      if (filter === 'safety')   return r.severity === 'safety';
      if (filter === 'breached') return r.sla_breached;
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

  const doAction = useCallback(async (path: string, body?: object) => {
    if (!selected) return;
    try {
      await api.post(`/esums/warranty-claims/${selected.id}/${path}`, body ?? {});
      await load();
      await loadEvents(selected.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    }
  }, [selected, load, loadEvents]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start gap-3">
        <div className="grid grid-cols-6 gap-3 flex-1">
          <Kpi label="Total" value={kpis.total} />
          <Kpi label="Safety open"  value={kpis.safety_open}        tone={kpis.safety_open > 0 ? 'bad' : 'ok'} />
          <Kpi label="SLA breached" value={kpis.breached}            tone={kpis.breached > 0 ? 'bad' : 'ok'} />
          <Kpi label="Denied/disputed" value={kpis.denied_or_disputed} tone={kpis.denied_or_disputed > 0 ? 'warn' : 'ok'} />
          <Kpi label="In OEM review" value={kpis.in_review} />
          <Kpi label="Recovery booked" value={fmtZar(kpis.total_recovery_zar)} small />
        </div>
        <button type="button"
          onClick={() => setCreating(true)}
          className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold whitespace-nowrap">
          + New claim
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              filter === f.key
                ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                : 'bg-white text-[#4a5568] border-[#dde4ec] hover:bg-gray-50'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <div className="px-3 py-2 bg-red-50 text-red-700 text-[12px] rounded-md">{err}</div>}

      <div className="bg-white border border-[#e5ebf2] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-[#6b7685]">
            <tr>
              <th className="px-3 py-2 text-left">Claim #</th>
              <th className="px-3 py-2 text-left">Subject</th>
              <th className="px-3 py-2 text-left">OEM</th>
              <th className="px-3 py-2 text-left">Severity</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-left">SLA window</th>
              <th className="px-3 py-2 text-right">Δ deadline</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-[#6b7685]">No claims match the current filter.</td></tr>
            ) : filtered.map((r) => {
              const stateTone = STATE_TONE[r.chain_status];
              const sevTone   = SEVERITY_TONE[r.severity];
              return (
                <tr
                  key={r.id}
                  onClick={() => loadEvents(r.id)}
                  className={`cursor-pointer hover:bg-[#f7f9fb] border-t border-[#eef2f6] ${selected?.id === r.id ? 'bg-[#fffae6]' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.claim_number}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={r.subject}>{r.subject}</td>
                  <td className="px-3 py-2 text-[#4a5568]">{r.oem_name}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: sevTone.bg, color: sevTone.fg }}>
                      {sevTone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: stateTone.bg, color: stateTone.fg }}>
                      {stateTone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[#4a5568]">{r.sla_window ?? '—'}</td>
                  <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.sla_breached ? 'text-red-700 font-semibold' : 'text-[#4a5568]'}`}>
                    {fmtMin(r.minutes_until_sla)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <ClaimDrawer
          claim={selected}
          events={events}
          onClose={() => { setSelected(null); setEvents([]); }}
          doAction={doAction}
        />
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

function Kpi({ label, value, tone = 'ok', small = false }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad'; small?: boolean }) {
  const fg = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : '#0f1c2e';
  return (
    <div className="bg-white border border-[#e5ebf2] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className={small ? 'text-[15px] font-semibold tabular-nums mt-0.5' : 'text-[20px] font-semibold tabular-nums mt-0.5'} style={{ color: fg }}>{value}</div>
    </div>
  );
}

function ClaimDrawer({
  claim, events, onClose, doAction,
}: {
  claim: ClaimRow;
  events: ClaimEvent[];
  onClose: () => void;
  doAction: (path: string, body?: object) => Promise<void>;
}) {
  const cs = claim.chain_status;
  const transitionable = !claim.is_terminal;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-stretch justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">Claim {claim.claim_number}</div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e] mt-0.5">{claim.subject}</h3>
            <div className="flex gap-2 mt-2 text-[12px]">
              <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: SEVERITY_TONE[claim.severity].bg, color: SEVERITY_TONE[claim.severity].fg }}>
                {SEVERITY_TONE[claim.severity].label}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: STATE_TONE[cs].bg, color: STATE_TONE[cs].fg }}>
                {STATE_TONE[cs].label}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]">✕</button>
        </div>

        <div className="p-5 space-y-4 text-[13px]">
          <Pair label="Asset"        value={claim.asset_label} />
          <Pair label="OEM"          value={claim.oem_name} />
          <Pair label="Description"  value={claim.description ?? '—'} />
          {claim.rma_number && <Pair label="RMA #" value={claim.rma_number} />}
          {claim.fault_code && <Pair label="Fault code" value={claim.fault_code} />}
          {claim.denial_reason && <Pair label="Denial reason"  value={claim.denial_reason} />}
          {claim.dispute_reason && <Pair label="Dispute reason" value={claim.dispute_reason} />}
          {claim.recovery_zar  && <Pair label="Recovery booked" value={fmtZar(claim.recovery_zar)} />}
          {claim.sla_deadline_at && (
            <Pair label="Next SLA" value={`${claim.sla_window ?? '?'} → ${new Date(claim.sla_deadline_at).toLocaleString()} (${fmtMin(claim.minutes_until_sla)})`} />
          )}

          {transitionable && (
            <div className="border-t border-[#eef2f6] pt-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Actions</div>
              <div className="flex flex-wrap gap-2">
                {cs === 'opened'       && <ActionBtn label="Triage"        onClick={() => doAction('triage')} />}
                {cs === 'triaged'      && (
                  <ActionBtn label="Submit to OEM" onClick={() => {
                    const rma = window.prompt('OEM RMA number (optional):') ?? undefined;
                    void doAction('submit', rma ? { rma_number: rma } : {});
                  }} />
                )}
                {cs === 'submitted'    && <ActionBtn label="Mark OEM ack"  onClick={() => doAction('acknowledge')} />}
                {cs === 'acknowledged' && <ActionBtn label="Start review"  onClick={() => doAction('begin-review')} />}
                {cs === 'under_review' && <ActionBtn label="Approve"       onClick={() => doAction('approve')} tone="good" />}
                {cs === 'under_review' && (
                  <ActionBtn label="Deny" tone="bad" onClick={() => {
                    const r = window.prompt('OEM denial reason:');
                    if (r) void doAction('deny', { denial_reason: r });
                  }} />
                )}
                {cs === 'denied' && (
                  <ActionBtn label="Dispute" tone="bad" onClick={() => {
                    const r = window.prompt('Dispute reason / counter-evidence:');
                    if (r) void doAction('dispute', { dispute_reason: r });
                  }} />
                )}
                {cs === 'denied'    && <ActionBtn label="Accept denial (close)" onClick={() => doAction('uphold-denial')} />}
                {cs === 'disputed'  && <ActionBtn label="Approve (reversal)"     onClick={() => doAction('approve')} tone="good" />}
                {cs === 'disputed'  && <ActionBtn label="OEM upheld denial"      onClick={() => doAction('uphold-denial')} />}
                {cs === 'approved'  && (
                  <ActionBtn label="Mark fulfilled" tone="good" onClick={() => {
                    const r = window.prompt('Resolution notes (optional):') ?? undefined;
                    const z = window.prompt('Recovery booked (ZAR, optional):');
                    const zar = z ? Number(z) : undefined;
                    void doAction('fulfill', { resolution: r, recovery_zar: zar });
                  }} />
                )}
                {(cs === 'fulfilled' || cs === 'opened' || cs === 'triaged') && (
                  <ActionBtn label="Close" onClick={() => doAction('close')} />
                )}
              </div>
            </div>
          )}

          <div className="border-t border-[#eef2f6] pt-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6b7685] mb-2">Timeline</div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-[12px] text-[#6b7685]">No events yet.</div>
              ) : events.map((e) => (
                <div key={e.id} className="flex gap-3 text-[12px] border-l-2 border-[#e5ebf2] pl-3 py-1">
                  <span className="font-mono text-[11px] text-[#6b7685] whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span>
                  <div>
                    <span className="font-semibold text-[#0f1c2e]">{e.event_type}</span>
                    {e.from_status && e.to_status && (
                      <span className="text-[#6b7685]"> · {e.from_status} → {e.to_status}</span>
                    )}
                    {e.notes && <div className="text-[#4a5568] mt-0.5">{e.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#6b7685]">{label}</div>
      <div className="text-[#0f1c2e] mt-0.5">{value}</div>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = 'neutral' }: { label: string; onClick: () => void; tone?: 'neutral' | 'good' | 'bad' }) {
  const bg = tone === 'good' ? 'bg-emerald-700' : tone === 'bad' ? 'bg-red-700' : 'bg-[#1a3a5c]';
  return (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 ${bg} text-white text-[12px] rounded-md hover:opacity-90`}>
      {label}
    </button>
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
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#0f1c2e]">Open warranty / RMA claim</h3>
          <button type="button" onClick={onClose} className="text-[#6b7685]">✕</button>
        </div>
        <div className="p-5 space-y-3 text-[13px]">
          {err && <div className="text-[12px] text-red-700">{err}</div>}
          <Field label="Asset (label, serial)"    value={assetLabel}  onChange={setAssetLabel} placeholder="Sungrow SG250HX SN SGN-1234" />
          <Field label="OEM"                      value={oemName}     onChange={setOemName}    placeholder="Sungrow Power" />
          <Field label="Subject"                  value={subject}     onChange={setSubject} />
          <div>
            <label className="text-[#6b7685]">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
              <option value="safety">Safety</option>
              <option value="performance">Performance</option>
              <option value="cosmetic">Cosmetic</option>
            </select>
          </div>
          <label className="block">
            <span className="text-[#6b7685]">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg resize-none" />
          </label>
          <Field label="Fault code (optional)"   value={faultCode}   onChange={setFaultCode} />
          <Field label="Warranty reference (optional)" value={warrantyRef} onChange={setWarrantyRef} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[#dde4ec] rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 bg-[#1a3a5c] text-white rounded-lg disabled:opacity-50">
              {saving ? 'Opening…' : 'Open claim'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[#6b7685]">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg" />
    </label>
  );
}
