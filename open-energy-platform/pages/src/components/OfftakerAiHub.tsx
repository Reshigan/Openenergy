import React, { useCallback, useRef, useState } from 'react';
import { FileUp, Sparkles, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';

type MixItem = {
  project_id: string;
  project_name?: string;
  stage?: string;
  share_pct: number;
  mwh_per_year: number;
  blended_price: number;
  rationale?: string;
};

type OptimizeResponse = {
  text: string;
  fallback: boolean;
  structured?: {
    mix?: MixItem[];
    savings_pct?: number;
    carbon_tco2e?: number;
    warnings?: string[];
  };
  projects?: Array<Record<string, unknown>>;
};

type BillProfile = {
  annual_kwh?: number;
  peak_pct?: number;
  standard_pct?: number;
  offpeak_pct?: number;
  avg_tariff_zar_per_kwh?: number;
  demand_charge_zar_per_kva?: number;
  tou_risk?: string;
};

/**
 * OfftakerAiHub — embedded panel on the Offtaker cockpit:
 *  1) Upload a bill (or paste text) → extract tariff profile
 *  2) Optimise an energy mix across available IPP projects
 *  3) Generate Letters of Intent for the selected mix
 */
export function OfftakerAiHub() {
  const [stage, setStage] = useState<'upload' | 'profile' | 'mix' | 'lois'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const [profile, setProfile] = useState<BillProfile | null>(null);
  const [mix, setMix] = useState<MixItem[]>([]);
  const [opt, setOpt] = useState<OptimizeResponse | null>(null);
  const [lois, setLois] = useState<Array<{ loi_id: string; project_name: string; body_md: string }>>([]);
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        reader.readAsText(file);
      } else {
        reader.readAsText(file);
      }
    });

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const content = await readFile(file);
      setText(content);
      const resp = await api.post('/ai/offtaker/bills', {
        source: file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'pdf',
        content,
        meta: { filename: file.name, size: file.size },
      });
      const d = resp.data?.data as { bill_id: string; structured?: BillProfile };
      setBillId(d?.bill_id || null);
      setProfile(d?.structured || null);
      setStage('profile');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyse bill');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleText = useCallback(async () => {
    if (!text.trim()) { setError('Paste your bill text first'); return; }
    setLoading(true);
    setError(null);
    try {
      const resp = await api.post('/ai/offtaker/bills', { source: 'text', content: text });
      const d = resp.data?.data as { bill_id: string; structured?: BillProfile };
      setBillId(d?.bill_id || null);
      setProfile(d?.structured || null);
      setStage('profile');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyse bill');
    } finally {
      setLoading(false);
    }
  }, [text]);

  const runOptimize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.post('/ai/offtaker/optimize', {
        bill_id: billId,
        annual_kwh: profile?.annual_kwh,
        current_tariff: profile?.avg_tariff_zar_per_kwh,
      });
      const d = resp.data?.data as OptimizeResponse;
      setOpt(d);
      setMix(d?.structured?.mix || []);
      setStage('mix');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate mix');
    } finally {
      setLoading(false);
    }
  }, [billId, profile]);

  const toggleMix = (projectId: string) => {
    setMix((prev) =>
      prev.map((m) =>
        m.project_id === projectId ? { ...m, share_pct: m.share_pct === 0 ? 10 : 0 } : m,
      ),
    );
  };

  const sendLois = useCallback(async () => {
    const selected = mix.filter((m) => m.share_pct > 0);
    if (selected.length === 0) { setError('Select at least one project for the LOI batch'); return; }
    setLoading(true);
    setError(null);
    try {
      const resp = await api.post('/ai/offtaker/loi', {
        mix: selected,
        horizon_years: 15,
        notes: 'Generated from Open Energy AI optimisation.',
      });
      const d = resp.data?.data as { drafts: Array<{ loi_id: string; project_name: string; body_md: string }> };
      setLois(d?.drafts || []);
      setStage('lois');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate LOIs');
    } finally {
      setLoading(false);
    }
  }, [mix]);

  return (
    <section className="rounded-xl border border-[#e5e5e5] bg-white/95 backdrop-blur-sm overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-4 border-b border-[#f0f0f0] bg-gradient-to-r from-[#f5f6fa] to-[#eaf0ff]">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#0a6ed1] to-[#5d36ff] grid place-items-center text-white">
          <Sparkles size={18} />
        </div>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-[#32363a]">Offtaker AI — Bill → Mix → LOI</h2>
          <p className="text-[12px] text-[#6a6d70]">
            Upload your electricity bill. We extract tariff shape, recommend an optimal mix across
            operating / under-construction / financial-close projects, and draft Letters of Intent.
          </p>
        </div>
        <ol className="hidden md:flex items-center gap-3 text-[11px] text-[#6a6d70]">
          {(['upload', 'profile', 'mix', 'lois'] as const).map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${stage === s ? 'text-[#0a6ed1] font-semibold' : ''}`}>
              <span className={`inline-block w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold
                ${stage === s ? 'bg-[#0a6ed1] text-white' : 'bg-[#e5e5e5] text-[#6a6d70]'}`}>{i + 1}</span>
              <span className="uppercase tracking-wider">{s}</span>
            </li>
          ))}
        </ol>
      </header>

      {error && (
        <div className="px-5 py-2 text-[12px] text-[#bb0000] bg-[#ffebee] border-b border-[#ffcdd2]">
          {error}
        </div>
      )}

      <div className="p-5 space-y-4">
        {stage === 'upload' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 h-36 rounded-lg border-2 border-dashed border-[#d0d5dd] hover:border-[#0a6ed1] hover:bg-[#f8fbff] transition-colors text-[13px] text-[#6a6d70]"
            >
              <FileUp size={24} />
              <span>Click to upload PDF or CSV</span>
              <span className="text-[11px]">Bill statements, consumption exports</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.csv,.txt"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="flex flex-col gap-2">
              <label className="text-[12px] text-[#6a6d70]">Or paste bill text</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="Paste the key figures from your bill — annual kWh, peak/off-peak split, average tariff, demand charges."
                className="w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#0a6ed1]"
              />
              <button
                onClick={handleText}
                disabled={loading}
                className="self-start h-9 px-4 rounded-lg bg-[#0a6ed1] text-white text-[13px] font-semibold hover:bg-[#085bab] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Analyse bill
              </button>
            </div>
          </div>
        )}

        {stage === 'profile' && profile && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ProfileKpi label="Annual consumption" value={`${Math.round((profile.annual_kwh || 0) / 1000).toLocaleString()} MWh`} />
              <ProfileKpi label="Avg tariff" value={`R${profile.avg_tariff_zar_per_kwh ?? '—'}/kWh`} />
              <ProfileKpi label="Peak share" value={`${Math.round((profile.peak_pct || 0) * 100)}%`} />
              <ProfileKpi label="TOU risk" value={profile.tou_risk || '—'} />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={runOptimize}
                disabled={loading}
                className="h-10 px-5 rounded-lg bg-[#0a6ed1] text-white text-[13px] font-semibold hover:bg-[#085bab] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Recommend optimal mix
              </button>
              <button
                onClick={() => { setStage('upload'); setProfile(null); setBillId(null); }}
                className="h-10 px-4 rounded-lg border border-[#d0d5dd] text-[13px] text-[#6a6d70] hover:bg-[#f5f6fa]"
              >
                Upload different bill
              </button>
            </div>
          </div>
        )}

        {stage === 'mix' && (
          <div className="space-y-3">
            {opt?.fallback && (
              <div className="text-[11px] text-[#8b6d00] bg-[#fff4d6] border border-[#ffd97a] rounded px-3 py-2">
                AI binding unavailable — showing deterministic placeholder mix. Live AI will activate once
                Workers AI is enabled on the Pages project.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ProfileKpi label="Projected savings" value={`${opt?.structured?.savings_pct ?? 0}%`} />
              <ProfileKpi label="Carbon avoided" value={`${Math.round(opt?.structured?.carbon_tco2e ?? 0).toLocaleString()} tCO₂e`} />
              <ProfileKpi label="Projects in mix" value={`${mix.filter((m) => m.share_pct > 0).length} / ${mix.length}`} />
              <ProfileKpi label="Horizon" value="15 years" />
            </div>
            <div className="rounded-lg border border-[#e5e5e5] overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-[#fafafa] text-[#6a6d70]">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Project</th>
                    <th className="text-left px-3 py-2 font-semibold">Stage</th>
                    <th className="text-right px-3 py-2 font-semibold">Share</th>
                    <th className="text-right px-3 py-2 font-semibold">MWh/yr</th>
                    <th className="text-right px-3 py-2 font-semibold">R/MWh</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {mix.map((m) => (
                    <tr key={m.project_id} className="border-t border-[#f0f0f0]">
                      <td className="px-3 py-2 text-[#32363a] font-medium">{m.project_name || m.project_id}</td>
                      <td className="px-3 py-2 text-[#6a6d70]">{m.stage || '—'}</td>
                      <td className="px-3 py-2 text-right">{m.share_pct}%</td>
                      <td className="px-3 py-2 text-right">{Math.round(m.mwh_per_year).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">R{m.blended_price}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => toggleMix(m.project_id)}
                          className={`h-7 px-3 rounded-md text-[11px] font-semibold ${m.share_pct > 0 ? 'bg-[#0a6ed1] text-white' : 'bg-[#e5e5e5] text-[#6a6d70]'}`}
                        >
                          {m.share_pct > 0 ? 'In mix' : 'Add'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={sendLois}
                disabled={loading || mix.filter((m) => m.share_pct > 0).length === 0}
                className="h-10 px-5 rounded-lg bg-[#107e3e] text-white text-[13px] font-semibold hover:bg-[#0b6430] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Generate LOIs for selected projects
              </button>
              <button
                onClick={() => setStage('profile')}
                className="h-10 px-4 rounded-lg border border-[#d0d5dd] text-[13px] text-[#6a6d70] hover:bg-[#f5f6fa]"
              >
                Back to bill profile
              </button>
            </div>
          </div>
        )}

        {stage === 'lois' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[13px] text-[#107e3e] font-semibold">
              <CheckCircle2 size={16} /> {lois.length} LOI draft{lois.length === 1 ? '' : 's'} generated and queued for IPP review
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {lois.map((l) => (
                <article key={l.loi_id} className="rounded-lg border border-[#e5e5e5] p-4 bg-white">
                  <header className="flex items-center gap-2 mb-2">
                    <span className="h-6 w-6 rounded-md bg-[#e7f4ea] text-[#107e3e] grid place-items-center"><CheckCircle2 size={14} /></span>
                    <h3 className="text-[14px] font-semibold text-[#32363a]">{l.project_name}</h3>
                  </header>
                  <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#32363a] max-h-64 overflow-auto bg-[#fafafa] rounded p-2 border border-[#f0f0f0]">{l.body_md}</pre>
                </article>
              ))}
            </div>
            <button
              onClick={() => { setStage('upload'); setMix([]); setLois([]); setOpt(null); setProfile(null); setBillId(null); setText(''); }}
              className="h-9 px-4 rounded-lg border border-[#d0d5dd] text-[13px] text-[#6a6d70] hover:bg-[#f5f6fa]"
            >
              Start a new analysis
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileKpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-[#fafbfd] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[#6a6d70]">{label}</div>
      <div className="mt-1 text-[16px] font-semibold text-[#32363a]">{value}</div>
    </div>
  );
}
