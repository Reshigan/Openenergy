import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Printer, Sparkles, Filter, Download, Table as TableIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type Period = '30d' | '90d' | '12m' | 'ytd';

type AiReportPayload = {
  period: string;
  role: string;
  kpis: Record<string, unknown>;
  narrative: { text: string; fallback: boolean };
};

type DetailedReport = {
  role: string;
  generated_at: string;
  summary: Record<string, string | number>;
  sections: Array<{ key: string; label: string; rows: Array<Record<string, string | number | null>> }>;
};

const ROLE_TITLES: Record<string, string> = {
  admin: 'Platform operations report',
  support: 'Support console report',
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

const SELECTABLE_ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Admin / platform' },
  { value: 'trader', label: 'Trader' },
  { value: 'ipp_developer', label: 'IPP developer' },
  { value: 'offtaker', label: 'Offtaker' },
  { value: 'lender', label: 'Lender' },
  { value: 'carbon_fund', label: 'Carbon fund' },
  { value: 'grid_operator', label: 'Grid operator' },
  { value: 'regulator', label: 'Regulator' },
];

function zar(v: unknown) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}
function num(v: unknown) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    return Math.abs(v) >= 1000 ? num(v) : String(v);
  }
  return String(v);
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
  const [aiData, setAiData] = useState<AiReportPayload | null>(null);
  const [detailed, setDetailed] = useState<DetailedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailedLoading, setDetailedLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailedError, setDetailedError] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState<string | null>(null);

  const isAdminLike = user?.role === 'admin' || user?.role === 'support';
  const [selectedRole, setSelectedRole] = useState<string>(user?.role || 'admin');

  const role = isAdminLike ? selectedRole : (user?.role || 'admin');
  const layout = ROLE_KPI_LAYOUT[role] || [];
  const title = ROLE_TITLES[role] || 'Operations report';

  const loadAi = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get(`/ai/reports/${role}?period=${period}`);
      setAiData(resp.data?.data as AiReportPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [role, period]);

  const loadDetailed = useCallback(async () => {
    setDetailedLoading(true);
    setDetailedError(null);
    try {
      const resp = await api.get(`/reports/${role}`);
      setDetailed(resp.data?.data as DetailedReport);
    } catch (e) {
      setDetailedError(e instanceof Error ? e.message : 'Failed to load detailed tables');
    } finally {
      setDetailedLoading(false);
    }
  }, [role]);

  useEffect(() => { void loadAi(); }, [loadAi]);
  useEffect(() => { void loadDetailed(); }, [loadDetailed]);

  const kpis = useMemo(() => {
    if (!aiData?.kpis) return [];
    return layout.map((l) => {
      const raw = readPath(aiData.kpis as Record<string, unknown>, l.key);
      return { label: l.label, value: l.format ? l.format(raw) : num(raw) };
    });
  }, [aiData, layout]);

  const downloadCsv = useCallback(async (sectionKey: string) => {
    setCsvBusy(sectionKey);
    try {
      const resp = await api.get(`/reports/${role}/csv?section=${encodeURIComponent(sectionKey)}`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${role}-${sectionKey}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setDetailedError(e instanceof Error ? e.message : 'CSV download failed');
    } finally {
      setCsvBusy(null);
    }
  }, [role]);

  return (
    <div className="min-h-screen bg-[#f5f6fa] p-6 lg:p-10 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6a6d70] bg-white border border-[#e5e5e5] rounded-full px-3 py-1">
            <FileText size={12} /> {role.replace('_', ' ')} — deep reporting
          </div>
          <h1 className="mt-2 text-[24px] font-semibold text-[#32363a]">{title}</h1>
          <p className="text-[13px] text-[#6a6d70]">AI-narrated executive summary, detailed tables and CSV export — grounded in live platform data.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdminLike && (
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#d0d5dd] bg-white text-[13px] text-[#32363a]"
              aria-label="Select role to report on"
            >
              {SELECTABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          )}
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

      {/* KPI matrix (from AI report) */}
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

      {/* Detailed summary tiles (from /reports/:role) */}
      {detailed && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <TableIcon size={14} className="text-[#6a6d70]" />
            <h2 className="text-[13px] uppercase tracking-wider text-[#6a6d70] font-semibold">Key metrics</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {Object.entries(detailed.summary).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-[#e5e5e5] bg-white p-4">
                <div className="text-[10px] uppercase tracking-wider text-[#6a6d70]">{k.replace(/_/g, ' ')}</div>
                <div className="mt-1 text-[18px] font-semibold text-[#32363a]">
                  {typeof v === 'number' ? num(v) : String(v)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI executive summary */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] bg-gradient-to-r from-[#f5f6fa] to-[#eaf0ff]">
          <Sparkles size={16} className="text-[#5d36ff]" />
          <h2 className="text-[14px] font-semibold text-[#32363a]">Executive summary</h2>
          {aiData?.narrative?.fallback && (
            <span className="ml-auto text-[10px] uppercase tracking-wider text-[#8b6d00] bg-[#fff4d6] rounded px-2 py-[2px]">
              Deterministic fallback
            </span>
          )}
        </header>
        <div className="p-5 prose prose-sm max-w-none">
          {loading && <div className="text-[13px] text-[#6a6d70]"><Loader2 size={14} className="inline animate-spin mr-2" />Generating executive summary…</div>}
          {!loading && aiData?.narrative?.text && (
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#32363a] font-sans">{aiData.narrative.text}</pre>
          )}
          {!loading && !aiData?.narrative?.text && <div className="text-[13px] text-[#6a6d70]">No narrative generated.</div>}
        </div>
      </section>

      {/* Detailed sections with CSV export */}
      {detailedError && (
        <div className="rounded-lg border border-[#ffcdd2] bg-[#ffebee] text-[13px] text-[#bb0000] px-4 py-2">
          {detailedError}
        </div>
      )}

      {detailedLoading && (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-6 text-[13px] text-[#6a6d70]">
          <Loader2 size={14} className="inline animate-spin mr-2" />Loading detailed tables…
        </div>
      )}

      {!detailedLoading && detailed && detailed.sections.map((section) => (
        <section key={section.key} className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
          <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0]">
            <TableIcon size={14} className="text-[#6a6d70]" />
            <h2 className="text-[14px] font-semibold text-[#32363a]">{section.label}</h2>
            <span className="text-[11px] text-[#6a6d70] ml-1">({section.rows.length} rows)</span>
            <button
              onClick={() => downloadCsv(section.key)}
              disabled={csvBusy === section.key || section.rows.length === 0}
              className="ml-auto h-7 px-3 rounded-md border border-[#d0d5dd] text-[12px] text-[#6a6d70] hover:bg-[#f5f6fa] inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={`Download ${section.label} as CSV`}
            >
              {csvBusy === section.key ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              CSV
            </button>
          </header>
          {section.rows.length === 0 ? (
            <div className="p-5 text-[13px] text-[#6a6d70]">No data for this period.</div>
          ) : (
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-[12px]">
                <thead className="bg-[#fafbfd] sticky top-0">
                  <tr>
                    {Object.keys(section.rows[0]).map((col) => (
                      <th key={col} className="text-left px-3 py-2 border-b border-[#f0f0f0] text-[10px] uppercase tracking-wider text-[#6a6d70] font-semibold">
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.slice(0, 200).map((row, i) => (
                    <tr key={i} className="border-b border-[#f5f6fa] hover:bg-[#fafbfd]">
                      {Object.keys(section.rows[0]).map((col) => (
                        <td key={col} className="px-3 py-1.5 text-[#32363a] whitespace-nowrap">
                          {formatCell(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {section.rows.length > 200 && (
                <div className="px-3 py-2 text-[11px] text-[#6a6d70] bg-[#fafbfd] border-t border-[#f0f0f0]">
                  Showing first 200 rows — download CSV for the full set.
                </div>
              )}
            </div>
          )}
        </section>
      ))}

      {/* Raw KPI dump (drill-down) */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0]">
          <Filter size={14} className="text-[#6a6d70]" />
          <h2 className="text-[14px] font-semibold text-[#32363a]">Raw AI KPI payload</h2>
        </header>
        <pre className="px-5 py-4 text-[11px] leading-relaxed text-[#6a6d70] max-h-96 overflow-auto bg-[#fafbfd]">
          {aiData ? JSON.stringify(aiData.kpis, null, 2) : ''}
        </pre>
      </section>
    </div>
  );
}

export default Reports;
