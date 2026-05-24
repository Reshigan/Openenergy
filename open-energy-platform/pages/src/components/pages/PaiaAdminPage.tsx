// ════════════════════════════════════════════════════════════════════════
// PaiaAdminPage — /admin/paia
//
// Information Officer's queue of incoming PAIA / POPIA SAR requests.
// Each row can be assigned, then responded to (fulfilled or rejected).
// 30-day statutory clock surfaces overdue rows in amber/red.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RefreshCw, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Sar = {
  id: string; subject_email: string; subject_name: string | null;
  participant_id: string | null; request_type: string; request_body: string | null;
  status: string; received_at: string; due_at: string;
  acknowledged_at: string | null; responded_at: string | null;
  assigned_to: string | null; response_summary: string | null; rejection_reason: string | null;
};

export function PaiaAdminPage() {
  const [rows, setRows] = useState<Sar[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [selected, setSelected] = useState<Sar | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.get('/popia-deep/sar', { params: filter ? { status: filter } : {} });
      if (r.data.success) setRows(r.data.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, [filter]);

  const stats = useMemo(() => {
    const now = Date.now();
    let overdue = 0; let pending = 0;
    for (const r of rows) {
      const due = new Date(r.due_at).getTime();
      const open = !['fulfilled', 'rejected'].includes(r.status);
      if (open) pending += 1;
      if (open && due < now) overdue += 1;
    }
    return { overdue, pending };
  }, [rows]);

  return (
    <StitchPage
      eyebrowIcon={ShieldCheck}
      eyebrowLabel="Compliance · PAIA / POPIA"
      title="Information Officer queue"
      subtitle="Incoming PAIA / POPIA subject access requests. 30-day statutory clock auto-tracked."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <Kpi label="Open" value={stats.pending}/>
        <Kpi label="Overdue (>30d)" value={stats.overdue} tone={stats.overdue > 0 ? 'bad' : 'ok'}/>
        <Kpi label="Total visible" value={rows.length}/>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
                className="h-8 px-2 rounded border border-[#dde4ec] text-[11px]">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="in_progress">In progress</option>
          <option value="escalated">Escalated</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="rejected">Rejected</option>
        </select>
        <button onClick={load} className="h-8 px-2 rounded border border-[#dde4ec] text-[11px] inline-flex items-center gap-1"><RefreshCw size={11}/>Refresh</button>
      </div>
      {err && <div className="text-[12px] text-[#c0392b] mb-2"><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[#6b7685] border-b border-[#dde4ec]">
              <th className="py-1.5">Received</th>
              <th className="py-1.5">Due</th>
              <th className="py-1.5">Requester</th>
              <th className="py-1.5">Type</th>
              <th className="py-1.5">Assigned</th>
              <th className="py-1.5">Status</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const overdue = !['fulfilled', 'rejected'].includes(r.status) && new Date(r.due_at).getTime() < Date.now();
              return (
                <tr key={r.id} className={`border-b border-[#eef2f7] ${overdue ? 'bg-[#fbe9e6]' : ''}`}>
                  <td className="py-1.5 font-mono">{new Date(r.received_at).toLocaleDateString('en-ZA')}</td>
                  <td className={`py-1.5 font-mono ${overdue ? 'text-[#c0392b] font-semibold' : ''}`}>{new Date(r.due_at).toLocaleDateString('en-ZA')}</td>
                  <td className="py-1.5">{r.subject_name || r.subject_email}<div className="text-[10px] text-[#6b7685]">{r.subject_email}</div></td>
                  <td className="py-1.5">{r.request_type}</td>
                  <td className="py-1.5 font-mono">{r.assigned_to || '—'}</td>
                  <td className="py-1.5"><span className="px-2 py-0.5 rounded bg-[#eef2f7] text-[10px] uppercase font-bold">{r.status}</span></td>
                  <td className="py-1.5 text-right"><button onClick={() => setSelected(r)} className="text-[11px] text-[#1a3a5c] underline">Open</button></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="py-2 italic text-[#6b7685]">No requests in queue.</td></tr>}
          </tbody>
        </table>
      </div>
      {selected && <SarDetail sar={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); void load(); }}/>}
    </StitchPage>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'bad' }) {
  const cls = tone === 'bad' ? 'widget-tone-bad' : tone === 'ok' ? '' : '';
  return (
    <div className={`widget-card p-4 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="text-[24px] font-bold text-[#0f1c2e]">{value}</div>
    </div>
  );
}

function SarDetail({ sar, onClose, onChanged }: { sar: Sar; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [respSummary, setRespSummary] = useState('');
  const [rejReason, setRejReason] = useState('');

  const assign = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post(`/popia-deep/sar/${encodeURIComponent(sar.id)}/assign`, {});
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck('Assigned to you'); onChanged();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'failed'); }
    finally { setBusy(false); }
  };

  const respond = async (outcome: 'fulfilled' | 'rejected') => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post(`/popia-deep/sar/${encodeURIComponent(sar.id)}/respond`, {
        outcome,
        response_summary: outcome === 'fulfilled' ? respSummary : null,
        rejection_reason: outcome === 'rejected' ? rejReason : null,
      });
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck(`Responded ${outcome}`); onChanged();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-[#dde4ec] flex items-center justify-between">
          <div>
            <div className="font-mono text-[12px]">{sar.id}</div>
            <div className="text-[11px] text-[#6b7685]">{sar.subject_email} · {sar.request_type}</div>
            <div className="mt-1"><span className="px-2 py-0.5 rounded bg-[#eef2f7] text-[10px] uppercase font-bold">{sar.status}</span></div>
          </div>
          <button onClick={onClose} aria-label="Close dialog"><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3 text-[12px]">
          <div><span className="text-[#6b7685]">Received:</span> {new Date(sar.received_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>
          <div><span className="text-[#6b7685]">Due:</span> {new Date(sar.due_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>
          {sar.request_body && (
            <div>
              <div className="text-[11px] uppercase text-[#6b7685]">Request</div>
              <pre className="bg-[#f8fafc] border border-[#eef2f7] rounded p-2 mt-1 whitespace-pre-wrap">{sar.request_body}</pre>
            </div>
          )}
          {!sar.assigned_to && (
            <div className="border-t pt-3 border-[#eef2f7]">
              <button disabled={busy} onClick={assign} className="h-8 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
                Assign to me
              </button>
            </div>
          )}
          {!['fulfilled', 'rejected'].includes(sar.status) && (
            <>
              <div className="border-t pt-3 border-[#eef2f7]">
                <div className="text-[12px] font-semibold text-[#0f1c2e] mb-1">Respond</div>
                <label className="block text-[11px] font-semibold text-[#3a4658]">Response summary
                  <textarea rows={3} className="mt-1 w-full p-2 rounded border border-[#dde4ec] text-[12px]"
                         value={respSummary} onChange={(e) => setRespSummary(e.target.value)}/>
                </label>
                <label className="block text-[11px] font-semibold text-[#3a4658] mt-2">Rejection reason (if rejecting)
                  <input className="mt-1 w-full h-8 px-2 rounded border border-[#dde4ec] text-[12px]"
                         value={rejReason} onChange={(e) => setRejReason(e.target.value)}/>
                </label>
              </div>
            </>
          )}
          {err && <div className="text-[12px] text-[#c0392b]"><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
          {ack && <div className="text-[12px] text-[#1a8a5b]"><CheckCircle2 size={13} className="inline mr-1"/>{ack}</div>}
        </div>
        <div className="p-4 border-t border-[#dde4ec] flex justify-end gap-2">
          {!['fulfilled', 'rejected'].includes(sar.status) && (
            <>
              <button disabled={busy || !rejReason} onClick={() => respond('rejected')} className="h-8 px-3 rounded border border-[#c0392b] text-[#c0392b] text-[12px] font-semibold disabled:opacity-40">
                Reject
              </button>
              <button disabled={busy || !respSummary} onClick={() => respond('fulfilled')} className="h-8 px-3 rounded bg-[#1a8a5b] text-white text-[12px] font-semibold disabled:opacity-40">
                Fulfil
              </button>
            </>
          )}
          <button onClick={onClose} className="h-8 px-3 text-[12px]">Close</button>
        </div>
      </div>
    </div>
  );
}
