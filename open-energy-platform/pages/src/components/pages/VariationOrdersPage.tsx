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
        <div className="text-[12px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{rows.length} VOs visible</div>
        <select className="h-8 px-2 rounded text-[11px]" style={{ border: '1px solid oklch(0.87 0.006 250)' }}
                value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="raised">Raised</option>
          <option value="lender_review">Lender review</option>
          <option value="offtaker_review">Offtaker review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
        <button type="button" onClick={load} className="h-8 px-2 rounded text-[11px] inline-flex items-center gap-1" style={{ border: '1px solid oklch(0.87 0.006 250)', color: 'oklch(0.40 0.009 250)' }}><RefreshCw size={11}/>Refresh</button>
        <div className="ml-auto"/>
        <button type="button" onClick={() => setRaising(true)} className="h-8 px-3 rounded text-white text-[11px] font-semibold inline-flex items-center gap-1" style={{ background: 'oklch(0.46 0.16 55)' }}>
          <Plus size={12}/> Raise VO
        </button>
      </div>
      {user?.role === 'lender' && <div className="mb-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>You have {queues.needLender} VO(s) awaiting your decision.</div>}
      {user?.role === 'offtaker' && <div className="mb-2 text-[12px]" style={{ color: 'oklch(0.46 0.16 55)' }}>You have {queues.needOfftaker} VO(s) awaiting your decision.</div>}
      {err && <div className="text-[12px] mb-2" style={{ color: 'oklch(0.48 0.20 20)' }}>{err}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left" style={{ color: 'oklch(0.60 0.007 250)', borderBottom: '1px solid oklch(0.87 0.006 250)' }}>
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
              <tr key={v.id} style={{ borderBottom: '1px solid oklch(0.91 0.005 250)' }}>
                <td className="py-1.5 font-mono" style={{ color: 'oklch(0.17 0.010 250)' }}>{new Date(v.raised_at).toLocaleDateString('en-ZA')}</td>
                <td className="py-1.5 font-mono" style={{ color: 'oklch(0.17 0.010 250)' }}>{v.vo_number}</td>
                <td className="py-1.5 font-mono" style={{ color: 'oklch(0.17 0.010 250)' }}>{v.project_id}</td>
                <td className="py-1.5" style={{ color: 'oklch(0.17 0.010 250)' }}>{v.category}</td>
                <td className="py-1.5 text-right font-mono" style={{ color: 'oklch(0.17 0.010 250)' }}>{v.cost_delta_zar != null ? `R${Number(v.cost_delta_zar).toLocaleString('en-ZA')}` : '—'}</td>
                <td className="py-1.5 text-right font-mono" style={{ color: 'oklch(0.17 0.010 250)' }}>{v.schedule_delta_days != null ? v.schedule_delta_days : '—'}</td>
                <td className="py-1.5"><span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: 'oklch(0.93 0.008 250)', color: 'oklch(0.40 0.009 250)' }}>{v.status}</span></td>
                <td className="py-1.5" style={{ color: 'oklch(0.40 0.009 250)' }}>{v.lender_decision || '—'}</td>
                <td className="py-1.5" style={{ color: 'oklch(0.40 0.009 250)' }}>{v.offtaker_decision || '—'}</td>
                <td className="py-1.5 text-right"><button type="button" onClick={() => setSelected(v)} className="text-[11px] underline" style={{ color: 'oklch(0.46 0.16 55)' }}>Open</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="py-2 italic" style={{ color: 'oklch(0.60 0.007 250)' }}>No variation orders.</td></tr>}
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
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="max-w-xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'oklch(0.99 0.002 80)', borderRadius: '12px', border: '1px solid oklch(0.87 0.006 250)' }}>
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid oklch(0.87 0.006 250)' }}>
          <div className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Raise variation order</div>
          <button type="button" onClick={onClose} aria-label="Close dialog" style={{ color: 'oklch(0.60 0.007 250)' }}><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-[11px] font-semibold" style={{ color: 'oklch(0.40 0.009 250)' }}>Project ID
            <input className="mt-1 w-full h-8 px-2 rounded text-[12px] font-mono"
                   style={{ border: '1px solid oklch(0.87 0.006 250)', background: 'oklch(0.99 0.002 80)', color: 'oklch(0.17 0.010 250)' }}
                   value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}/>
          </label>
          <label className="block text-[11px] font-semibold" style={{ color: 'oklch(0.40 0.009 250)' }}>Category
            <select className="mt-1 w-full h-8 px-2 rounded text-[12px]"
                    style={{ border: '1px solid oklch(0.87 0.006 250)', background: 'oklch(0.99 0.002 80)', color: 'oklch(0.17 0.010 250)' }}
                    value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>scope</option><option>cost</option><option>schedule</option><option>equipment</option><option>other</option>
            </select>
          </label>
          <label className="block text-[11px] font-semibold" style={{ color: 'oklch(0.40 0.009 250)' }}>Scope change
            <textarea rows={3} className="mt-1 w-full p-2 rounded text-[12px]"
                   style={{ border: '1px solid oklch(0.87 0.006 250)', background: 'oklch(0.99 0.002 80)', color: 'oklch(0.17 0.010 250)' }}
                   value={form.scope_change} onChange={(e) => setForm({ ...form, scope_change: e.target.value })}/>
          </label>
          <label className="block text-[11px] font-semibold" style={{ color: 'oklch(0.40 0.009 250)' }}>Rationale
            <textarea rows={3} className="mt-1 w-full p-2 rounded text-[12px]"
                   style={{ border: '1px solid oklch(0.87 0.006 250)', background: 'oklch(0.99 0.002 80)', color: 'oklch(0.17 0.010 250)' }}
                   value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })}/>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[11px] font-semibold" style={{ color: 'oklch(0.40 0.009 250)' }}>Cost delta (ZAR)
              <input type="number" className="mt-1 w-full h-8 px-2 rounded text-[12px]"
                     style={{ border: '1px solid oklch(0.87 0.006 250)', background: 'oklch(0.99 0.002 80)', color: 'oklch(0.17 0.010 250)' }}
                     value={form.cost_delta_zar} onChange={(e) => setForm({ ...form, cost_delta_zar: e.target.value })}/>
            </label>
            <label className="block text-[11px] font-semibold" style={{ color: 'oklch(0.40 0.009 250)' }}>Schedule delta (days)
              <input type="number" className="mt-1 w-full h-8 px-2 rounded text-[12px]"
                     style={{ border: '1px solid oklch(0.87 0.006 250)', background: 'oklch(0.99 0.002 80)', color: 'oklch(0.17 0.010 250)' }}
                     value={form.schedule_delta_days} onChange={(e) => setForm({ ...form, schedule_delta_days: e.target.value })}/>
            </label>
          </div>
          {err && <div className="text-[12px] inline-flex items-center gap-1" style={{ color: 'oklch(0.48 0.20 20)' }}><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
        </div>
        <div className="p-4 flex justify-end gap-2" style={{ borderTop: '1px solid oklch(0.87 0.006 250)' }}>
          <button type="button" onClick={onClose} className="h-8 px-3 text-[12px]" style={{ color: 'oklch(0.40 0.009 250)' }}>Cancel</button>
          <button type="button" disabled={busy} onClick={submit} className="h-8 px-3 rounded text-white text-[12px] font-semibold disabled:opacity-50" style={{ background: 'oklch(0.46 0.16 55)' }}>
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
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'oklch(0.99 0.002 80)', borderRadius: '12px', border: '1px solid oklch(0.87 0.006 250)' }}>
        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid oklch(0.87 0.006 250)' }}>
          <div>
            <div className="font-mono text-[12px]" style={{ color: 'oklch(0.17 0.010 250)' }}>{vo.vo_number} · {vo.id}</div>
            <div className="text-[11px]" style={{ color: 'oklch(0.60 0.007 250)' }}>project={vo.project_id} · raised by {vo.raised_by} on {new Date(vo.raised_at).toLocaleDateString('en-ZA')}</div>
            <div className="mt-1"><span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: 'oklch(0.93 0.008 250)', color: 'oklch(0.40 0.009 250)' }}>{vo.status}</span></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" style={{ color: 'oklch(0.60 0.007 250)' }}><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3 text-[12px]" style={{ color: 'oklch(0.17 0.010 250)' }}>
          <div><span style={{ color: 'oklch(0.60 0.007 250)' }}>Category:</span> <span className="font-semibold">{vo.category}</span></div>
          <div><span style={{ color: 'oklch(0.60 0.007 250)' }}>Scope change:</span>
            <div className="p-2 mt-1 whitespace-pre-wrap" style={{ background: 'oklch(0.96 0.003 250)', border: '1px solid oklch(0.91 0.005 250)', borderRadius: '6px' }}>{vo.scope_change}</div>
          </div>
          <div><span style={{ color: 'oklch(0.60 0.007 250)' }}>Rationale:</span>
            <div className="p-2 mt-1 whitespace-pre-wrap" style={{ background: 'oklch(0.96 0.003 250)', border: '1px solid oklch(0.91 0.005 250)', borderRadius: '6px' }}>{vo.rationale}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><span style={{ color: 'oklch(0.60 0.007 250)' }}>Cost Δ:</span> <span className="font-mono">{vo.cost_delta_zar != null ? `R${Number(vo.cost_delta_zar).toLocaleString('en-ZA')}` : '—'}</span></div>
            <div><span style={{ color: 'oklch(0.60 0.007 250)' }}>Schedule Δ:</span> <span className="font-mono">{vo.schedule_delta_days != null ? `${vo.schedule_delta_days} days` : '—'}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2" style={{ background: 'oklch(0.96 0.003 250)', border: '1px solid oklch(0.91 0.005 250)', borderRadius: '6px' }}>
              <div className="text-[11px] uppercase" style={{ color: 'oklch(0.60 0.007 250)' }}>Lender</div>
              <div className="font-semibold">{vo.lender_decision || 'pending'}</div>
              {vo.lender_comment && <div className="text-[11px] mt-1" style={{ color: 'oklch(0.40 0.009 250)' }}>{vo.lender_comment}</div>}
              {vo.lender_decided_at && <div className="text-[10px] font-mono mt-1" style={{ color: 'oklch(0.60 0.007 250)' }}>{new Date(vo.lender_decided_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>}
            </div>
            <div className="p-2" style={{ background: 'oklch(0.96 0.003 250)', border: '1px solid oklch(0.91 0.005 250)', borderRadius: '6px' }}>
              <div className="text-[11px] uppercase" style={{ color: 'oklch(0.60 0.007 250)' }}>Offtaker</div>
              <div className="font-semibold">{vo.offtaker_decision || 'pending'}</div>
              {vo.offtaker_comment && <div className="text-[11px] mt-1" style={{ color: 'oklch(0.40 0.009 250)' }}>{vo.offtaker_comment}</div>}
              {vo.offtaker_decided_at && <div className="text-[10px] font-mono mt-1" style={{ color: 'oklch(0.60 0.007 250)' }}>{new Date(vo.offtaker_decided_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</div>}
            </div>
          </div>
          {vo.approved_at && <div className="text-[12px] inline-flex items-center gap-1" style={{ color: 'oklch(0.45 0.15 150)' }}><CheckCircle2 size={13}/> Approved on {new Date(vo.approved_at).toLocaleDateString('en-ZA')}</div>}
          {vo.rejected_reason && <div className="text-[12px]" style={{ color: 'oklch(0.48 0.20 20)' }}>Rejected: {vo.rejected_reason}</div>}
          {err && <div className="text-[12px] inline-flex items-center gap-1" style={{ color: 'oklch(0.48 0.20 20)' }}><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
        </div>
        <div className="p-4 flex flex-wrap justify-end gap-2" style={{ borderTop: '1px solid oklch(0.87 0.006 250)' }}>
          {['raised', 'lender_review', 'offtaker_review'].includes(vo.status) && (
            <button type="button" disabled={busy} onClick={withdraw} className="h-8 px-3 text-[12px]" style={{ color: 'oklch(0.48 0.20 20)' }}>Withdraw</button>
          )}
          {canDecideLender && (
            <>
              <button type="button" disabled={busy} onClick={() => decide('lender', 'rejected')} className="h-8 px-3 rounded text-[12px] font-semibold" style={{ border: '1px solid oklch(0.48 0.20 20)', color: 'oklch(0.48 0.20 20)' }}>Lender · reject</button>
              <button type="button" disabled={busy} onClick={() => decide('lender', 'approved')} className="h-8 px-3 rounded text-white text-[12px] font-semibold" style={{ background: 'oklch(0.45 0.15 150)' }}>Lender · approve</button>
            </>
          )}
          {canDecideOfftaker && (
            <>
              <button type="button" disabled={busy} onClick={() => decide('offtaker', 'rejected')} className="h-8 px-3 rounded text-[12px] font-semibold" style={{ border: '1px solid oklch(0.48 0.20 20)', color: 'oklch(0.48 0.20 20)' }}>Offtaker · reject</button>
              <button type="button" disabled={busy} onClick={() => decide('offtaker', 'approved')} className="h-8 px-3 rounded text-white text-[12px] font-semibold" style={{ background: 'oklch(0.45 0.15 150)' }}>Offtaker · approve</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
