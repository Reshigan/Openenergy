import React, { useState } from 'react';
import { Sparkles, Loader2, FileBarChart } from 'lucide-react';
import { api } from '../lib/api';
import { NarrativeText } from './NarrativeText';

type FilingType = 'nersa_annual' | 'popia_pia' | 'jse_srl' | 'carbon_tax' | 'ipp_quarterly';

const FILING_OPTIONS: Array<{ value: FilingType; label: string; framework: string }> = [
  { value: 'nersa_annual',  label: 'NERSA Annual Return',       framework: 'ECA 2006 + NERSA Rules' },
  { value: 'popia_pia',     label: 'POPIA PIA',                 framework: 'POPIA 4 of 2013' },
  { value: 'jse_srl',       label: 'JSE Sustainability Report', framework: 'JSE-SRL · King IV' },
  { value: 'carbon_tax',    label: 'Carbon Tax Disclosure',     framework: 'Carbon Tax Act 15/2019' },
  { value: 'ipp_quarterly', label: 'IPP Quarterly Compliance',  framework: 'REIPPPP' },
];

export function RegulatorAiHub() {
  const [filingType, setFilingType] = useState<FilingType>('nersa_annual');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; metrics?: Record<string, unknown> } | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(`/regulator/filing/${filingType}/generate`, { reporting_period: period });
      setResult(res.data?.data as { text: string; metrics?: Record<string, unknown> });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to draft filing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: '#e5e5e5' }}>
      <header className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: '#f0f1f2' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
             style={{ background: 'linear-gradient(135deg,#107e3e 0%,#0a6ed1 100%)' }}>
          <FileBarChart size={18} />
        </div>
        <div className="leading-tight">
          <h2 className="text-[15px] font-semibold" style={{ color: '#32363a' }}>Regulator compliance copilot</h2>
          <p className="text-[12px]" style={{ color: '#6a6d70' }}>
            AI-drafted filings grounded in ECA 2006, NERSA, POPIA, Companies Act, Carbon Tax Act
          </p>
        </div>
      </header>

      <div className="p-5 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#6a6d70' }}>Filing type</span>
            <select
              value={filingType}
              onChange={(e) => setFilingType(e.target.value as FilingType)}
              className="h-9 px-3 rounded-md border text-[13px]"
              style={{ borderColor: '#d5d6d8', color: '#32363a' }}
            >
              {FILING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label} — {o.framework}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#6a6d70' }}>Period</span>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-04"
              className="h-9 px-3 rounded-md border text-[13px]"
              style={{ borderColor: '#d5d6d8', color: '#32363a' }}
            />
          </label>
          <button
            onClick={generate}
            disabled={loading}
            className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white inline-flex items-center gap-2"
            style={{ background: 'linear-gradient(135deg,#107e3e 0%,#0a6ed1 100%)' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Drafting…' : 'Draft filing'}
          </button>
        </div>
        {error && (
          <div className="text-[13px] rounded-md px-3 py-2" style={{ background: '#ffebeb', color: '#bb0000' }}>{error}</div>
        )}
        {result && (
          <div className="max-h-96 overflow-auto rounded-md p-3" style={{ background: '#f7f8f9' }}>
            <NarrativeText text={result.text} />
          </div>
        )}
      </div>
    </section>
  );
}

export default RegulatorAiHub;
