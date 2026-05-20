// ════════════════════════════════════════════════════════════════════════
// VariationOrdersPage — /ipp/variations
//
// REIPPPP-style variation orders. Anyone with a project can raise. Lenders
// + offtakers see incoming VOs that need their decision. Admins see all.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { GitPullRequest, Plus, AlertCircle, CheckCircle2, X, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';
import { useAuth } from '../../lib/useAuth';

type VO = {
  id: string; project_id: string; raised_by: string; raised_at: string;
  vo_number: string; category: string; scope_change: string; rationale: string;
  cost_delta_zar: number | null; schedule_delta_days: number | null;
  status: string;
  lender_decision: string | null; lender_comment: string | null; lender_decided_at: string | null;
  offtaker_decision: string | null; offtaker_comment: string | null; offtaker_decided_at: string | null;
  approved_at: string | null; rejected_reason: string | null;
};

export function VariationOrdersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<VO[]>([]);
  const [status, setStatus] = useState<string>('');
  const [raising, setRaising] = useState(false);
  const [selected, setSelected] = useState<VO | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.get('/business-depth/variation-orders', { params: status ? { status } : {} });
      if (r.data?.success) setRows(r.data.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, [status]);

  const queues = useMemo(() => {
    const needLender = rows.filter((r) => r.status === 'raised' || r.status === 'lender_review' || (r.status === 'offtaker_review' && !r.lender_decision));
    const needOfftaker = rows.filter((r) => r.status === 'raised' || r.status === 'offtaker_review' || (r.status === 'lender_review' && !r.offtaker_decision));
    return { needLender: needLender.length, needOfftaker: needOfftaker.length };
  }, [rows]);

  return (
    <StitchPage
      eyebrowIcon={GitPullRequest}
      eyebrowLabel="IPP lifecycle · variation orders"
      title="Variation orders"
      subtitle="Raise PPA scope / cost / schedule amendments. Each VO needs separate lender + offtaker approval before it takes effect."
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[12px] text-[#6b7685]">{rows.length} VOs visible</div>
        <select className="h-8 px-2 rounded border border-[#dde4ec] text-[11px]"
                value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="raised">Raised</option>
          <option value="lender_review">Lender review</option>
          <option value="offtaker_review">Offtaker review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
        <button onClick={load} className="h-8 px-2 rounded border border-[#dde4ec] text-[11px] inline-flex items-center gap-1"><RefreshCw size={11}/>Refresh</button>
        <div className="ml-auto"/>
        <button onClick={() => setRaising(true)} className="h-8 px-3 rounded bg-[#1a3a5c] text-white text-[11px] font-semibold inline-flex items-center gap-1">
          <Plus size={12}/> Raise VO
        </button>
      </div>
      {user?.role === 'lender' && <div className="mb-2 text-[12px] text-[#7a5800]">You have {queues.needLender} VO(s) awaiting your decision.</div>}
      {user?.role === 'offtaker' && <div className="mb-2 text-[12px] text-[#7a5800]">You have {queues.needOfftaker} VO(s) awaiting your decision.</div>}
      {err && <div className="text-[12px] text-[#c0392b] mb-2">{err}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[#6b7685] border-b border-[#dde4ec]">
              <th className="py-1.5">Raised</th>
              <th className="py-1.5">VO #</th>
              <th className="py-1.5">Project</th>
              <th className="py-1.5">Category</th>
              <th className="py-1.5 text-right">Cost Δ</th>
              <th className="py-1.5 text-right">Days Δ</th>
              <th className="py-1.5">Status</th>
              <th className="py-1.5">Lender</th>
              <th className="py-1.5">Offtaker</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="border-b border-[#eef2f7]">
                <td className="py-1.5 font-mono">{new Date(v.raised_at).toLocaleDateString('en-ZA')}</td>
                <td className="py-1.5 font-mono">{v.vo_number}</td>
                <td className="py-1.5 font-mono">{v.project_id}</td>
                <td className="py-1.5">{v.category}</td>
                <td className="py-1.5 text-right font-mono">{v.cost_delta_zar != null ? `R${Number(v.cost_delta_zar).toLocaleString('en-ZA')}` : '—'}</td>
                <td className="py-1.5 text-right font-mono">{v.schedule_delta_days != null ? v.schedule_delta_days : '—'}</td>
                <td className="py-1.5"><span className="px-2 py-0.5 rounded bg-[#eef2f7] text-[10px] uppercase font-bold">{v.status}</span></td>
                <td className="py-1.5">{v.lender_decision || '—'}</td>
                <td className="py-1.5">{v.offtaker_decision || '—'}</td>
                <td className="py-1.5 text-right"><button onClick={() => setSelected(v)} className="text-[11px] text-[#1a3a5c] underline">Open</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="py-2 italic text-[#6b7685]">No variation orders.</td></tr>}
          </tbody>
        </table>
      </div>

      {raising && <RaiseModal onClose={() => setRaising(false)} onCreated={() => { setRaising(false); void load(); }}/>}
      {selected && <VoDetail vo={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); void load(); }}/>}
    </StitchPage>
  );
}

function RaiseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    project_id: '', category: 'scope', scope_change: '', rationale: '',
    cost_delta_zar: '', schedule_delta_days: '',
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/business-depth/variation-orders', {
        project_id: form.project_id,
        category: form.category,
        scope_change: form.scope_change,
        rationale: form.rationale,
        cost_delta_zar: form.cost_delta_zar ? Number(form.cost_delta_zar) : null,
        schedule_delta_days: form.schedule_delta_days ? Number(form.schedule_delta_days) : null,
      });
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      onCreated();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-[#dde4ec] flex items-center justify-between">
          <div className="font-semibold text-[#0f1c2e]">Raise variation order</div>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-[11px] font-semibold text-[#3a4658]">Project ID
            <input className="mt-1 w-full h-8 px-2 rounded border border-[#dde4ec] text-[12px] font-mono"
                   value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}/>
          </label>
          <label className="block text-[11px] font-semibold text-[#3a4658]">Category
            <select className="mt-1 w-full h-8 px-2 rounded border border-[#dde4ec] text-[12px]"
                    value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>scope</option><option>cost</option><option>schedule</option><option>equipment</option><option>other</option>
            </select>
          </label>
          <label className="block text-[11px] font-semibold text-[#3a4658]">Scope change
            <textarea rows={3} className="mt-1 w-full p-2 rounded border border-[#dde4ec] text-[12px]"
                   value={form.scope_change} onChange={(e) => setForm({ ...form, scope_change: e.target.value })}/>
          </label>
          <label className="block text-[11px] font-semibold text-[#3a4658]">Rationale
            <textarea rows={3} className="mt-1 w-full p-2 rounded border border-[#dde4ec] text-[12px]"
                   value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })}/>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[11px] font-semibold text-[#3a4658]">Cost delta (ZAR)
              <input type="number" className="mt-1 w-full h-8 px-2 rounded border border-[#dde4ec] text-[12px]"
                     value={form.cost_delta_zar} onChange={(e) => setForm({ ...form, cost_delta_zar: e.target.value })}/>
            </label>
            <label className="block text-[11px] font-semibold text-[#3a4658]">Schedule delta (days)
              <input type="number" className="mt-1 w-full h-8 px-2 rounded border border-[#dde4ec] text-[12px]"
                     value={form.schedule_delta_days} onChange={(e) => setForm({ ...form, schedule_delta_days: e.target.value })}/>
            </label>
          </div>
          {err && <div className="text-[12px] text-[#c0392b]"><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
        </div>
        <div className="p-4 border-t border-[#dde4ec] flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 text-[12px]">Cancel</button>
          <button disabled={busy} onClick={submit} className="h-8 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
            {busy ? 'Submitting…' : 'Raise VO'}
          </button>
        </div>
      </div>
    </div>
  );
}

function VoDetail({ vo, onClose, onChanged }: { vo: VO; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const decide = async (which: 'lender' | 'offtaker', decision: 'approved' | 'rejected') => {
    const comment = window.prompt(`Comment for ${decision} (optional)`) || '';
    setBusy(true); setErr(null);
    try {
      const r = await api.post(`/business-depth/variation-orders/${encodeURIComponent(vo.id)}/${which}-decision`,
                              { decision, comment });
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      onChanged();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.step_up_required) setErr('Step-up auth required.');
      else setErr(data?.error || e?.message || 'failed');
    } finally { setBusy(false); }
  };

  const withdraw = async () => {
    if (!window.confirm('Withdraw this VO?')) return;
    setBusy(true);
    try {
      const r = await api.post(`/business-depth/variation-orders/${encodeURIComponent(vo.id)}/withdraw`);
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      onChanged();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'failed'); }
    finally { setBusy(false); }
  };

  const isLender = ['lender', 'admin', 'support'].includes(user?.role || '');
  const isOfftaker = ['offtaker', 'admin', 'support'].includes(user?.role || '');
  const canDecideLender = isLender && !vo.lender_decision && !['rejected', 'approved', 'withdrawn'].includes(vo.status);
  const canDecideOfftaker = isOfftaker && !vo.offtaker_decision && !['rejected', 'approved', 'withdrawn'].includes(vo.status);

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-[#dde4ec] flex items-center justify-between">
          <div>
            <div className="font-mono text-[12px] text-[#0f1c2e]">{vo.vo_number} · {vo.id}</div>
            <div className="text-[11px] text-[#6b7685]">project={vo.project_id} · raised by {vo.raised_by} on {new Date(vo.raised_at).toLocaleDateString('en-ZA')}</div>
            <div className="mt-1"><span className="px-2 py-0.5 rounded bg-[#eef2f7] text-[10px] uppercase font-bold">{vo.status}</span></div>
          </div>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3 text-[12px]">
          <div><span className="text-[#6b7685]">Category:</span> <span className="font-semibold">{vo.category}</span></div>
          <div><span className="text-[#6b7685]">Scope change:</span><div className="bg-[#f8fafc] border border-[#eef2f7] rounded p-2 mt-1 whitespace-pre-wrap">{vo.scope_change}</div></div>
          <div><span className="text-[#6b7685]">Rationale:</span><div className="bg-[#f8fafc] border border-[#eef2f7] rounded p-2 mt-1 whitespace-pre-wrap">{vo.rationale}</div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-[#6b7685]">Cost Δ:</span> <span className="font-mono">{vo.cost_delta_zar != null ? `R${Number(vo.cost_delta_zar).toLocaleString('en-ZA')}` : '—'}</span></div>
            <div><span className="text-[#6b7685]">Schedule Δ:</span> <span className="font-mono">{vo.schedule_delta_days != null ? `${vo.schedule_delta_days} days` : '—'}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#f8fafc] border border-[#eef2f7] rounded p-2">
              <div className="text-[11px] uppercase text-[#6b7685]">Lender</div>
              <div className="font-semibold">{vo.lender_decision || 'pending'}</div>
              {vo.lender_comment && <div className="text-[11px] text-[#3a4658] mt-1">{vo.lender_comment}</div>}
              {vo.lender_decided_at && <div className="text-[10px] text-[#6b7685] font-mono mt-1">{new Date(vo.lender_decided_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>}
            </div>
            <div className="bg-[#f8fafc] border border-[#eef2f7] rounded p-2">
              <div className="text-[11px] uppercase text-[#6b7685]">Offtaker</div>
              <div className="font-semibold">{vo.offtaker_decision || 'pending'}</div>
              {vo.offtaker_comment && <div className="text-[11px] text-[#3a4658] mt-1">{vo.offtaker_comment}</div>}
              {vo.offtaker_decided_at && <div className="text-[10px] text-[#6b7685] font-mono mt-1">{new Date(vo.offtaker_decided_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>}
            </div>
          </div>
          {vo.approved_at && <div className="text-[12px] text-[#1a8a5b] inline-flex items-center gap-1"><CheckCircle2 size={13}/> Approved on {new Date(vo.approved_at).toLocaleDateString('en-ZA')}</div>}
          {vo.rejected_reason && <div className="text-[12px] text-[#c0392b]">Rejected: {vo.rejected_reason}</div>}
          {err && <div className="text-[12px] text-[#c0392b]"><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
        </div>
        <div className="p-4 border-t border-[#dde4ec] flex flex-wrap justify-end gap-2">
          {['raised', 'lender_review', 'offtaker_review'].includes(vo.status) && (
            <button disabled={busy} onClick={withdraw} className="h-8 px-3 text-[12px] text-[#c0392b]">Withdraw</button>
          )}
          {canDecideLender && (
            <>
              <button disabled={busy} onClick={() => decide('lender', 'rejected')} className="h-8 px-3 rounded border border-[#c0392b] text-[#c0392b] text-[12px] font-semibold">Lender · reject</button>
              <button disabled={busy} onClick={() => decide('lender', 'approved')} className="h-8 px-3 rounded bg-[#1a8a5b] text-white text-[12px] font-semibold">Lender · approve</button>
            </>
          )}
          {canDecideOfftaker && (
            <>
              <button disabled={busy} onClick={() => decide('offtaker', 'rejected')} className="h-8 px-3 rounded border border-[#c0392b] text-[#c0392b] text-[12px] font-semibold">Offtaker · reject</button>
              <button disabled={busy} onClick={() => decide('offtaker', 'approved')} className="h-8 px-3 rounded bg-[#1a8a5b] text-white text-[12px] font-semibold">Offtaker · approve</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
