import React, { useEffect, useState } from 'react';
import { Sparkles, ShieldAlert, Loader2, Banknote, Activity, LineChart } from 'lucide-react';
import { api } from '../lib/api';

type Summary = {
  facility_count: number;
  committed_zar: number;
  drawn_zar: number;
  active_facilities: number;
  breached: number;
  watching: number;
  pending: number;
  pending_zar: number;
};

type Facility = {
  id: string;
  facility_name: string;
  project_name?: string;
  technology?: string;
  capacity_mw?: number;
  committed_amount?: number;
  drawn_amount?: number;
  interest_rate_pct?: number;
  dscr_covenant?: number;
  status?: string;
  breached_covenants?: number;
  pending_disbursements?: number;
};

type Covenant = {
  id: string;
  facility_id: string;
  facility_name: string;
  covenant_type: string;
  threshold?: number;
  last_value?: number;
  status: string;
  notes?: string;
};

type Disbursement = {
  id: string;
  facility_id: string;
  facility_name: string;
  project_name?: string;
  amount: number;
  currency?: string;
  status: string;
};

const zar = (n: number, decimals = 0) =>
  Number.isFinite(n) ? n.toLocaleString('en-ZA', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) : '—';

export function FunderAiHub() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [covenants, setCovenants] = useState<Covenant[]>([]);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<string>('');
  const [cashflow, setCashflow] = useState<{ text: string; fallback: boolean } | null>(null);
  const [sensitivity, setSensitivity] = useState<{ text: string; fallback: boolean } | null>(null);
  const [insights, setInsights] = useState<{ text: string; fallback: boolean } | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const setBusyKey = (k: string, v: boolean) => setBusy((prev) => ({ ...prev, [k]: v }));

  const reload = async () => {
    try {
      const [s, f, cv, dr] = await Promise.all([
        api.get('/funder/summary'),
        api.get('/funder/facilities'),
        api.get('/funder/covenants'),
        api.get('/funder/disbursements'),
      ]);
      setSummary(s.data?.data || null);
      setFacilities(f.data?.data || []);
      setCovenants(cv.data?.data || []);
      setDisbursements(dr.data?.data || []);
      if (!selectedFacility && (f.data?.data || []).length > 0) {
        setSelectedFacility((f.data.data[0] as Facility).id);
      }
    } catch {
      // non-fatal
    }
  };

  useEffect(() => { reload(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const runCashflow = async () => {
    if (!selectedFacility) return;
    setBusyKey('cf', true);
    try {
      const r = await api.post(`/funder/facilities/${selectedFacility}/cashflow`, {});
      setCashflow({ text: r.data?.data?.text || '', fallback: !!r.data?.data?.fallback });
    } finally { setBusyKey('cf', false); }
  };
  const runSensitivity = async () => {
    if (!selectedFacility) return;
    setBusyKey('sens', true);
    try {
      const r = await api.post(`/funder/facilities/${selectedFacility}/sensitivity`, {});
      setSensitivity({ text: r.data?.data?.text || '', fallback: !!r.data?.data?.fallback });
    } finally { setBusyKey('sens', false); }
  };
  const runInsights = async () => {
    setBusyKey('ins', true);
    try {
      const r = await api.get('/funder/insights');
      setInsights({ text: r.data?.data?.text || '', fallback: !!r.data?.data?.fallback });
    } finally { setBusyKey('ins', false); }
  };
  const checkCovenant = async (id: string) => {
    setBusyKey(`cov_${id}`, true);
    try { await api.post(`/funder/covenants/${id}/check`, {}); await reload(); } finally { setBusyKey(`cov_${id}`, false); }
  };
  const approveDisbursement = async (id: string) => {
    setBusyKey(`disb_${id}`, true);
    try { await api.post(`/funder/disbursements/${id}/approve`, {}); await reload(); } finally { setBusyKey(`disb_${id}`, false); }
  };

  const tiles = [
    { label: 'Facilities', value: zar(summary?.facility_count || 0), icon: Banknote, tone: 'blue' as const },
    { label: 'Committed', value: `R${zar(summary?.committed_zar || 0)}`, icon: LineChart, tone: 'indigo' as const },
    { label: 'Drawn', value: `R${zar(summary?.drawn_zar || 0)}`, icon: Activity, tone: 'emerald' as const },
    { label: 'Breached covenants', value: zar(summary?.breached || 0), icon: ShieldAlert, tone: 'rose' as const },
  ];

  return (
    <section className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden shadow-[0_8px_32px_rgba(10,110,209,0.06)]">
      <header className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-[#0a6ed1] via-[#2b7ad4] to-[#4a9adc] text-white">
        <Sparkles size={18} />
        <div>
          <div className="text-[12px] uppercase tracking-[0.2em] text-blue-50/80">Funder Copilot</div>
          <div className="text-[16px] font-semibold">Cashflow forecast · sensitivity · covenant triage · disbursements</div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5 bg-[#f5f9ff]">
        {tiles.map((t, i) => (
          <div key={i} className="rounded-xl border border-[#d4e3f4] bg-white p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.tone === 'blue' ? 'bg-blue-50 text-blue-700' : t.tone === 'indigo' ? 'bg-indigo-50 text-indigo-700' : t.tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              <t.icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-[#6a6d70]">{t.label}</div>
              <div className="text-[15px] font-semibold text-[#32363a] truncate">{t.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-0 border-t border-[#e5e5e5]">
        <div className="p-5 border-b xl:border-b-0 xl:border-r border-[#e5e5e5]">
          <h4 className="text-[14px] font-semibold text-[#32363a] mb-2">Facility book</h4>
          {facilities.length === 0 ? (
            <p className="text-[12px] text-[#6a6d70]">No facilities yet. Seed data will populate this list.</p>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {facilities.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFacility(f.id)}
                  className={`w-full text-left rounded-lg border p-3 transition ${selectedFacility === f.id ? 'border-blue-500 bg-[#eef5ff]' : 'border-[#e5e5e5] hover:border-blue-200 hover:bg-[#f5f9ff]'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold text-[#32363a] truncate">{f.facility_name}</div>
                    {(f.breached_covenants ?? 0) > 0 && <span className="text-[10px] uppercase bg-rose-50 text-rose-700 rounded px-2 py-[2px]">{f.breached_covenants} breached</span>}
                  </div>
                  <div className="text-[11px] text-[#6a6d70]">{f.project_name || 'Unattached'} · R{zar(f.committed_amount || 0)} committed · drawn R{zar(f.drawn_amount || 0)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-b xl:border-b-0 xl:border-r border-[#e5e5e5]">
          <h4 className="text-[14px] font-semibold text-[#32363a] mb-2">AI analysis</h4>
          <div className="flex flex-wrap gap-2">
            <button onClick={runCashflow} disabled={!selectedFacility || !!busy['cf']} className="h-9 px-3 rounded-lg bg-blue-600 text-white text-[12px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
              {busy['cf'] ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Cashflow 60m
            </button>
            <button onClick={runSensitivity} disabled={!selectedFacility || !!busy['sens']} className="h-9 px-3 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
              {busy['sens'] ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Sensitivity
            </button>
            <button onClick={runInsights} disabled={!!busy['ins']} className="h-9 px-3 rounded-lg bg-amber-600 text-white text-[12px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
              {busy['ins'] ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Portfolio brief
            </button>
          </div>
          {cashflow?.text && (
            <div className="mt-3 rounded-lg border border-blue-100 bg-[#f5f9ff] p-3">
              {cashflow.fallback && <span className="text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px] mr-2">Fallback</span>}
              <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#32363a] font-sans">{cashflow.text}</pre>
            </div>
          )}
          {sensitivity?.text && (
            <div className="mt-3 rounded-lg border border-indigo-100 bg-[#f3f4ff] p-3">
              {sensitivity.fallback && <span className="text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px] mr-2">Fallback</span>}
              <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#32363a] font-sans">{sensitivity.text}</pre>
            </div>
          )}
          {insights?.text && (
            <div className="mt-3 rounded-lg border border-amber-100 bg-[#fff9ec] p-3">
              {insights.fallback && <span className="text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px] mr-2">Fallback</span>}
              <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#32363a] font-sans">{insights.text}</pre>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <h4 className="text-[14px] font-semibold text-[#32363a] mb-2">Covenant watchlist</h4>
            {covenants.length === 0 ? (
              <p className="text-[12px] text-[#6a6d70]">No tracked covenants.</p>
            ) : (
              <div className="space-y-2 max-h-[140px] overflow-y-auto">
                {covenants.map((cv) => (
                  <div key={cv.id} className="rounded-lg border border-[#e5e5e5] p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-[#32363a]">{cv.covenant_type} · {cv.facility_name}</div>
                      <div className="text-[11px] text-[#6a6d70]">threshold {cv.threshold ?? '—'} · last {cv.last_value ?? '—'} · <span className={cv.status === 'breached' ? 'text-rose-700 font-semibold' : cv.status === 'watch' ? 'text-amber-700' : 'text-emerald-700'}>{cv.status}</span></div>
                    </div>
                    <button onClick={() => checkCovenant(cv.id)} disabled={!!busy[`cov_${cv.id}`]} className="h-7 px-2 rounded-md bg-rose-50 text-rose-700 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                      {busy[`cov_${cv.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Triage
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-[14px] font-semibold text-[#32363a] mb-2">Disbursement queue</h4>
            {disbursements.length === 0 ? (
              <p className="text-[12px] text-[#6a6d70]">No pending disbursements.</p>
            ) : (
              <div className="space-y-2 max-h-[140px] overflow-y-auto">
                {disbursements.map((d) => (
                  <div key={d.id} className="rounded-lg border border-[#e5e5e5] p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-[#32363a]">{d.project_name || d.facility_name}</div>
                      <div className="text-[11px] text-[#6a6d70]">R{zar(Number(d.amount || 0))}</div>
                    </div>
                    <button onClick={() => approveDisbursement(d.id)} disabled={!!busy[`disb_${d.id}`]} className="h-7 px-2 rounded-md bg-emerald-600 text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                      {busy[`disb_${d.id}`] ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Approve
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
