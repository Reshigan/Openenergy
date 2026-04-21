import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Printer, Download, Sparkles, Filter } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type Period = '30d' | '90d' | '12m' | 'ytd';

type ReportPayload = {
  period: string;
  role: string;
  kpis: Record<string, unknown>;
  narrative: { text: string; fallback: boolean };
};

const ROLE_TITLES: Record<string, string> = {
  admin: 'Platform operations report',
  trader: 'Trading desk report',
  ipp_developer: 'IPP portfolio report',
  offtaker: 'Offtaker energy & savings report',
  carbon_fund: 'Carbon fund performance report',
  lender: 'Lender credit & cashflow report',
  grid_operator: 'Grid operator balancing report',
  regulator: 'Regulator compliance report',
};

const ROLE_KPI_LAYOUT: Record<string, Array<{ key: string; label: string; format?: (v: unknown) => string }>> = {
  admin: [
    { key: 'participants.c', label: 'Active participants' },
    { key: 'contracts.c', label: 'Contracts in vault' },
    { key: 'trades.c', label: 'Trades in period' },
    { key: 'trades.gmv', label: 'GMV (ZAR)', format: zar },
    { key: 'invoices.c', label: 'Invoices in period' },
    { key: 'invoices.total', label: 'Invoice total (ZAR)', format: zar },
  ],
  trader: [
    { key: 'orders.c', label: 'Orders placed' },
    { key: 'orders.vol', label: 'Volume ordered (MWh)', format: num },
    { key: 'matches.c', label: 'Matches' },
    { key: 'matches.value', label: 'P&L value (ZAR)', format: zar },
  ],
  ipp_developer: [
    { key: 'projects.length', label: 'Projects' },
    { key: 'milestones.length', label: 'Milestones (open)' },
  ],
  offtaker: [
    { key: 'bills.length', label: 'Bills uploaded' },
    { key: 'lois.length', label: 'LOIs drafted' },
    { key: 'invoices.c', label: 'Invoices received' },
    { key: 'invoices.total', label: 'Spend (ZAR)', format: zar },
  ],
  carbon_fund: [
    { key: 'retirements.c', label: 'Retirement events' },
    { key: 'retirements.q', label: 'tCO₂e retired', format: num },
    { key: 'holdings.length', label: 'Methodologies held' },
  ],
  lender: [
    { key: 'disbursements.c', label: 'Disbursements in period' },
    { key: 'disbursements.total', label: 'Disbursed (ZAR)', format: zar },
    { key: 'projects.length', label: 'Portfolio projects' },
  ],
  grid_operator: [
    { key: 'connections.c', label: 'Grid connections' },
    { key: 'nominations.c', label: 'Nominations in period' },
    { key: 'nominations.v', label: 'Volume (MWh)', format: num },
  ],
  regulator: [
    { key: 'audit.length', label: 'Distinct event types' },
  ],
};

function zar(v: unknown) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}
function num(v: unknown) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
function readPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') {
      const a = acc as Record<string, unknown>;
      if (k === 'length' && Array.isArray(acc)) return acc.length;
      return a[k];
    }
    return undefined;
  }, obj);
}

export function Reports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('90d');
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = user?.role || 'admin';
  const layout = ROLE_KPI_LAYOUT[role] || [];
  const title = ROLE_TITLES[role] || 'Operations report';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get(`/ai/reports/${role}?period=${period}`);
      setData(resp.data?.data as ReportPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [role, period]);

  useEffect(() => { void load(); }, [load]);

  const kpis = useMemo(() => {
    if (!data?.kpis) return [];
    return layout.map((l) => {
      const raw = readPath(data.kpis as Record<string, unknown>, l.key);
      return { label: l.label, value: l.format ? l.format(raw) : num(raw) };
    });
  }, [data, layout]);

  return (
    <div className="min-h-screen bg-[#f5f6fa] p-6 lg:p-10 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6a6d70] bg-white border border-[#e5e5e5] rounded-full px-3 py-1">
            <FileText size={12} /> {role.replace('_', ' ')} — deep reporting
          </div>
          <h1 className="mt-2 text-[24px] font-semibold text-[#32363a]">{title}</h1>
          <p className="text-[13px] text-[#6a6d70]">AI-narrated executive summary, risk flags and recommendations, grounded in your live platform data.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 bg-white border border-[#e5e5e5] rounded-lg p-1">
            {(['30d', '90d', '12m', 'ytd'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`h-8 px-3 rounded-md text-[12px] font-semibold ${period === p ? 'bg-[#0a6ed1] text-white' : 'text-[#6a6d70] hover:bg-[#f5f6fa]'}`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => window.print()}
            className="h-9 px-3 rounded-lg border border-[#d0d5dd] text-[13px] text-[#6a6d70] hover:bg-white inline-flex items-center gap-2"
          >
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-[#ffcdd2] bg-[#ffebee] text-[13px] text-[#bb0000] px-4 py-2">
          {error}
        </div>
      )}

      {/* KPI matrix */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {loading && layout.map((l) => (
          <div key={l.key} className="rounded-lg border border-[#e5e5e5] bg-white p-4 animate-pulse h-[88px]" />
        ))}
        {!loading && kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-[#e5e5e5] bg-white p-4">
            <div className="text-[10px] uppercase tracking-wider text-[#6a6d70]">{k.label}</div>
            <div className="mt-1 text-[18px] font-semibold text-[#32363a]">{k.value}</div>
          </div>
        ))}
      </section>

      {/* AI executive summary */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] bg-gradient-to-r from-[#f5f6fa] to-[#eaf0ff]">
          <Sparkles size={16} className="text-[#5d36ff]" />
          <h2 className="text-[14px] font-semibold text-[#32363a]">Executive summary</h2>
          {data?.narrative?.fallback && (
            <span className="ml-auto text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px]">
              Deterministic fallback
            </span>
          )}
        </header>
        <div className="p-5 prose prose-sm max-w-none">
          {loading && <div className="text-[13px] text-[#6a6d70]"><Loader2 size={14} className="inline animate-spin mr-2" />Generating executive summary…</div>}
          {!loading && data?.narrative?.text && (
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#32363a] font-sans">{data.narrative.text}</pre>
          )}
          {!loading && !data?.narrative?.text && <div className="text-[13px] text-[#6a6d70]">No narrative generated.</div>}
        </div>
      </section>

      {/* Raw KPI dump (drill-down) */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0]">
          <Filter size={14} className="text-[#6a6d70]" />
          <h2 className="text-[14px] font-semibold text-[#32363a]">Underlying data</h2>
        </header>
        <pre className="px-5 py-4 text-[11px] leading-relaxed text-[#6a6d70] max-h-96 overflow-auto bg-[#fafbfd]">
          {data ? JSON.stringify(data.kpis, null, 2) : ''}
        </pre>
      </section>
    </div>
  );
}

export default Reports;
