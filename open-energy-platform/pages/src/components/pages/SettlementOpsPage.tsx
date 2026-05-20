// ════════════════════════════════════════════════════════════════════════
// SettlementOpsPage — /settlement-ops
//
// Settlement-team console:
//   • Late-payment fees list + waive / charge
//   • Prime-rate register history + add new rate
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { CircleDollarSign, Percent, AlertCircle, CheckCircle2, RefreshCw, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Fee = {
  id: string; invoice_id: string; participant_id: string; invoice_total: number;
  days_overdue: number; annual_rate_pct: number; fee_zar: number;
  computed_at: string; status: string; waived_by?: string; waiver_reason?: string;
};
type Rate = { effective_from: string; rate_pct: number; source: string | null; updated_by: string | null; updated_at: string };

type Tab = 'fees' | 'rates';

export function SettlementOpsPage() {
  const [tab, setTab] = useState<Tab>('fees');
  return (
    <StitchPage
      eyebrowIcon={CircleDollarSign}
      eyebrowLabel="Settlement · admin"
      title="Settlement ops console"
      subtitle="Late-payment fee accrual + prime-rate register."
    >
      <div className="border-b border-[#dde4ec] flex flex-wrap gap-1 mb-3">
        {([
          ['fees', 'Late fees', CircleDollarSign],
          ['rates', 'Prime rate', Percent],
        ] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`h-9 px-3 text-[12px] font-semibold inline-flex items-center gap-1.5 border-b-2 -mb-px ${
              tab === k ? 'border-[#1a3a5c] text-[#1a3a5c]' : 'border-transparent text-[#6b7685] hover:text-[#0f1c2e]'
            }`}>
            <Icon size={13}/> {label}
          </button>
        ))}
      </div>
      {tab === 'fees' && <FeesTab/>}
      {tab === 'rates' && <RatesTab/>}
    </StitchPage>
  );
}

function FeesTab() {
  const [rows, setRows] = useState<Fee[]>([]);
  const [status, setStatus] = useState<string>('pending');
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setErr(null);
    try {
      const r = await api.get('/business-depth/late-fees', { params: status ? { status } : {} });
      if (r.data.success) setRows(r.data.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, [status]);

  const waive = async (id: string) => {
    const reason = window.prompt('Waiver reason?');
    if (!reason) return;
    setBusy(true); setAck(null); setErr(null);
    try {
      const r = await api.post(`/business-depth/late-fees/${encodeURIComponent(id)}/waive`, { reason });
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck(`Waived ${id}`);
      await load();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.step_up_required) setErr('Step-up auth required to waive.');
      else setErr(data?.error || e?.message || 'failed');
    } finally { setBusy(false); }
  };

  const charge = async (id: string) => {
    setBusy(true); setAck(null); setErr(null);
    try {
      const r = await api.post(`/business-depth/late-fees/${encodeURIComponent(id)}/charge`);
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck(`Charged ${id}`);
      await load();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'failed'); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <select className="h-8 px-2 rounded border border-[#dde4ec] text-[11px]"
                value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="charged">Charged</option>
          <option value="waived">Waived</option>
          <option value="settled">Settled</option>
        </select>
        <button onClick={load} className="h-8 px-2 rounded border border-[#dde4ec] text-[11px] inline-flex items-center gap-1"><RefreshCw size={11}/>Refresh</button>
      </div>
      {err && <div className="text-[12px] text-[#c0392b]"><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
      {ack && <div className="text-[12px] text-[#1a8a5b]"><CheckCircle2 size={13} className="inline mr-1"/>{ack}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[#6b7685] border-b border-[#dde4ec]">
              <th className="py-1.5">Computed</th>
              <th className="py-1.5">Invoice</th>
              <th className="py-1.5">Party</th>
              <th className="py-1.5 text-right">Invoice total</th>
              <th className="py-1.5 text-right">Days</th>
              <th className="py-1.5 text-right">Rate</th>
              <th className="py-1.5 text-right">Fee</th>
              <th className="py-1.5">Status</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="border-b border-[#eef2f7]">
                <td className="py-1.5 font-mono">{new Date(f.computed_at).toLocaleDateString('en-ZA')}</td>
                <td className="py-1.5 font-mono">{f.invoice_id}</td>
                <td className="py-1.5 font-mono">{f.participant_id}</td>
                <td className="py-1.5 text-right font-mono">R{Number(f.invoice_total).toLocaleString('en-ZA')}</td>
                <td className="py-1.5 text-right font-mono">{f.days_overdue}</td>
                <td className="py-1.5 text-right font-mono">{Number(f.annual_rate_pct).toFixed(2)}%</td>
                <td className="py-1.5 text-right font-mono font-semibold">R{Number(f.fee_zar).toLocaleString('en-ZA')}</td>
                <td className="py-1.5"><span className="px-2 py-0.5 rounded bg-[#eef2f7] text-[10px] uppercase font-bold">{f.status}</span></td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {f.status === 'pending' && (
                    <>
                      <button disabled={busy} onClick={() => waive(f.id)} className="text-[11px] text-[#6b7685] underline mr-2">Waive</button>
                      <button disabled={busy} onClick={() => charge(f.id)} className="text-[11px] text-[#1a3a5c] underline">Charge</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="py-2 italic text-[#6b7685]">No fees.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RatesTab() {
  const [current, setCurrent] = useState<Rate | null>(null);
  const [history, setHistory] = useState<Rate[]>([]);
  const [form, setForm] = useState({ effective_from: new Date().toISOString().slice(0, 10), rate_pct: '', source: 'SARB' });
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setErr(null);
    try {
      const r = await api.get('/business-depth/prime-rate');
      if (r.data.success) {
        setCurrent(r.data.data.current);
        setHistory(r.data.data.history || []);
      }
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    setBusy(true); setAck(null); setErr(null);
    try {
      const r = await api.post('/business-depth/prime-rate', {
        effective_from: form.effective_from,
        rate_pct: Number(form.rate_pct),
        source: form.source,
      });
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck(`Recorded ${form.rate_pct}% effective ${form.effective_from}`);
      setForm({ ...form, rate_pct: '' });
      await load();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.step_up_required) setErr('Step-up auth required to update prime rate.');
      else setErr(data?.error || e?.message || 'failed');
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-3">
      <div className="widget-card p-4">
        <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">Currently effective</div>
        <div className="text-[24px] font-bold text-[#0f1c2e]">
          {current ? `${Number(current.rate_pct).toFixed(2)}%` : '—'}
        </div>
        <div className="text-[11px] text-[#6b7685]">
          {current ? `Since ${current.effective_from} · source ${current.source || 'unknown'}` : 'No rate set.'}
        </div>
      </div>

      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold text-[#0f1c2e] mb-2 inline-flex items-center gap-1"><Plus size={13}/> Add new rate</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-[11px] font-semibold text-[#3a4658]">Effective from
            <input type="date" className="mt-1 w-full h-8 px-2 rounded border border-[#dde4ec] text-[12px]"
                   value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })}/>
          </label>
          <label className="text-[11px] font-semibold text-[#3a4658]">Rate (%)
            <input type="number" step="0.05" className="mt-1 w-full h-8 px-2 rounded border border-[#dde4ec] text-[12px] font-mono"
                   value={form.rate_pct} onChange={(e) => setForm({ ...form, rate_pct: e.target.value })}/>
          </label>
          <label className="text-[11px] font-semibold text-[#3a4658]">Source
            <input className="mt-1 w-full h-8 px-2 rounded border border-[#dde4ec] text-[12px]"
                   value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}/>
          </label>
        </div>
        {err && <div className="text-[12px] text-[#c0392b] mt-2"><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
        {ack && <div className="text-[12px] text-[#1a8a5b] mt-2"><CheckCircle2 size={13} className="inline mr-1"/>{ack}</div>}
        <button disabled={busy || !form.rate_pct} onClick={submit}
                className="mt-3 h-8 px-3 rounded bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
          {busy ? 'Saving…' : 'Record rate'}
        </button>
      </div>

      <div className="widget-card">
        <header className="widget-card-header"><div className="widget-card-title">Rate history</div></header>
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[#6b7685]">
                <th className="py-1">Effective from</th>
                <th className="py-1 text-right">Rate</th>
                <th className="py-1">Source</th>
                <th className="py-1">Recorded by</th>
                <th className="py-1">At</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.effective_from} className="border-t border-[#eef2f7]">
                  <td className="py-1 font-mono">{h.effective_from}</td>
                  <td className="py-1 text-right font-mono">{Number(h.rate_pct).toFixed(2)}%</td>
                  <td className="py-1">{h.source || '—'}</td>
                  <td className="py-1 font-mono">{h.updated_by || '—'}</td>
                  <td className="py-1 font-mono">{new Date(h.updated_at).toLocaleDateString('en-ZA')}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={5} className="py-2 italic text-[#6b7685]">No history.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
