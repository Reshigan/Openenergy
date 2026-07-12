import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportColumn = {
  key: string;
  label: string;
  numeric?: boolean;
  align?: 'left' | 'right';
  render?: (row: any) => React.ReactNode;
};

export type ReportFilter = {
  key: string;
  label: string;
  type: 'select' | 'text';
  options?: { value: string; label: string }[];
};

export type ReportConfig = {
  title: string;
  endpoint: string;          // base API endpoint; query params appended automatically
  columns: ReportColumn[];
  filters?: ReportFilter[];  // attribute filters shown in the filter bar
  dateKey?: string;          // column used for date filtering (default: 'created_at')
  pivotGroupBy?: string;     // default field to pivot/group by
  mailSubject?: string;      // default email subject
};

type ViewMode = 'report' | 'table' | 'pivot';

// ─── Pivot helpers ────────────────────────────────────────────────────────────

type PivotRow = { group: string; count: number; [sum: string]: number | string };

function pivot(rows: any[], groupKey: string, numericKeys: string[]): PivotRow[] {
  const map = new Map<string, PivotRow>();
  for (const r of rows) {
    const g = String(r[groupKey] ?? '(blank)');
    if (!map.has(g)) {
      const init: PivotRow = { group: g, count: 0 };
      for (const k of numericKeys) init[`sum_${k}`] = 0;
      map.set(g, init);
    }
    const agg = map.get(g)!;
    agg.count += 1;
    for (const k of numericKeys) {
      const v = parseFloat(r[k]);
      if (!isNaN(v)) (agg[`sum_${k}`] as number) += v;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ReportPanel({ config }: { config: ReportConfig }) {
  const [view, setView] = useState<ViewMode>('table');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [attrFilters, setAttrFilters] = useState<Record<string, string>>({});
  const [pivotField, setPivotField] = useState(config.pivotGroupBy ?? config.columns[0]?.key ?? '');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [mailTo, setMailTo] = useState('');
  const [mailing, setMailing] = useState(false);
  const [mailMsg, setMailMsg] = useState('');
  const PAGE_SIZE = 25;
  const dateKey = config.dateKey ?? 'created_at';

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    for (const [k, v] of Object.entries(attrFilters)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return config.endpoint + (qs ? (config.endpoint.includes('?') ? '&' : '?') + qs : '');
  }, [config.endpoint, from, to, attrFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get(buildUrl());
      const payload = res?.data;
      const data = (payload as any)?.rows ?? (payload as any)?.results ?? payload ?? [];
      setRows(Array.isArray(data) ? data : []);
      setPage(0);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  const numericKeys = config.columns.filter(c => c.numeric).map(c => c.key);
  const pivotData = useMemo(() => pivot(rows, pivotField, numericKeys), [rows, pivotField, numericKeys]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function exportCsv() {
    if (!rows.length) return;
    const cols = config.columns;
    const headers = cols.map(c => c.label);
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.join(','), ...rows.map(r => cols.map(c => escape(r[c.key])).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${config.title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function sendMail() {
    if (!mailTo.trim()) return;
    setMailing(true); setMailMsg('');
    try {
      const csvLines = config.columns.map(c => c.label).join(',') + '\n' +
        rows.map(r => config.columns.map(c => {
          const v = r[c.key] ?? '';
          const s = String(v);
          return s.includes(',') ? `"${s}"` : s;
        }).join(',')).join('\n');
      await api.post('/reports/mail', {
        to: mailTo.trim(),
        subject: config.mailSubject ?? `${config.title} — ${new Date().toLocaleDateString()}`,
        body: `Report: ${config.title}\nFilters: from=${from || 'all'} to=${to || 'all'}\nRows: ${rows.length}`,
        csv_attachment: csvLines,
        filename: `${config.title.replace(/\s+/g, '-').toLowerCase()}.csv`,
      });
      setMailMsg('Sent');
    } catch (e: any) {
      setMailMsg(e?.message ?? 'Failed to send');
    } finally {
      setMailing(false);
    }
  }

  const summaryNumerics = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const c of config.columns.filter(col => col.numeric)) {
      totals[c.key] = rows.reduce((s, r) => s + (parseFloat(r[c.key]) || 0), 0);
    }
    return totals;
  }, [rows, config.columns]);

  return (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="bg-[var(--s1, #f8fafc)] border border-[var(--border-subtle, #dde4ec)] rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-[var(--ink-2, #6b7685)] uppercase tracking-wide">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="h-7 px-2 text-xs border border-[var(--border-subtle, #dde4ec)] rounded bg-surface-v2 focus:outline-none focus:ring-1 focus:ring-[#c2873a]" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-[var(--ink-2, #6b7685)] uppercase tracking-wide">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="h-7 px-2 text-xs border border-[var(--border-subtle, #dde4ec)] rounded bg-surface-v2 focus:outline-none focus:ring-1 focus:ring-[#c2873a]" />
          </div>
          {(config.filters ?? []).map(f => (
            <div key={f.key} className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-[var(--ink-2, #6b7685)] uppercase tracking-wide">{f.label}</label>
              {f.type === 'select' ? (
                <select value={attrFilters[f.key] ?? ''} onChange={e => setAttrFilters(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="h-7 px-2 text-xs border border-[var(--border-subtle, #dde4ec)] rounded bg-surface-v2 focus:outline-none focus:ring-1 focus:ring-[#c2873a]">
                  <option value="">All</option>
                  {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type="text" placeholder="Filter…" value={attrFilters[f.key] ?? ''}
                  onChange={e => setAttrFilters(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="h-7 px-2 text-xs border border-[var(--border-subtle, #dde4ec)] rounded bg-surface-v2 focus:outline-none focus:ring-1 focus:ring-[#c2873a]" />
              )}
            </div>
          ))}
          <button onClick={load}
            className="h-7 px-3 text-xs bg-[#c2873a] text-white rounded hover:bg-[#a3702f] font-medium">
            Apply
          </button>
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        {/* View switcher */}
        <div className="flex rounded overflow-hidden text-xs" style={{ border: '1px solid var(--border-subtle, #dde4ec)' }}>
          {(['report', 'table', 'pivot'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-1.5 font-medium capitalize transition-colors"
              style={view === v
                ? { background: '#c2873a', color: '#fff' }
                : { background: 'oklch(0.99 0.002 80)', color: 'var(--ink-2, #3d4756)' }
              }>
              {v}
            </button>
          ))}
        </div>
        {/* Export + mail actions */}
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={exportCsv}
            className="px-3 py-1.5 text-xs text-white rounded font-medium"
            style={{ background: '#c2873a' }}>
            Export CSV
          </button>
          <button onClick={() => window.print()}
            className="px-3 py-1.5 text-xs rounded font-medium"
            style={{ background: 'oklch(0.99 0.002 80)', border: '1px solid var(--border-subtle, #dde4ec)', color: 'var(--ink-2, #3d4756)' }}>
            Print / PDF
          </button>
          <div className="flex items-center gap-1">
            <input type="email" placeholder="mail report to…" value={mailTo}
              onChange={e => setMailTo(e.target.value)}
              className="h-7 px-2 text-xs rounded focus:outline-none focus:ring-1 focus:ring-[#c2873a] w-48"
              style={{ border: '1px solid var(--border-subtle, #dde4ec)' }} />
            <button onClick={sendMail} disabled={mailing || !mailTo.trim()}
              className="h-7 px-2 text-xs text-white rounded disabled:opacity-40 font-medium"
              style={{ background: '#c2873a' }}>
              {mailing ? '…' : 'Mail'}
            </button>
            {mailMsg && <span className={`text-[10px] font-medium ${mailMsg === 'Sent' ? 'text-emerald-600' : 'text-red-500'}`}>{mailMsg}</span>}
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="h-24 flex items-center justify-center text-xs text-[var(--ink-2, #6b7685)]">Loading…</div>
      )}
      {!loading && err && (
        <div className="text-xs text-red-500 border border-red-200 bg-red-50 rounded p-3 flex items-center justify-between gap-3">
          <span>{err}</span>
          {/* Don't strand the user on a failed report load; one-click retry. */}
          <button type="button" onClick={() => void load()} className="shrink-0 rounded border border-red-300 px-2 py-1 font-semibold text-red-600 hover:bg-red-100">
            Try again
          </button>
        </div>
      )}
      {!loading && !err && rows.length === 0 && (
        <div className="rounded-lg border border-[#e3e8ef] bg-surface-v2 px-4 py-10 text-center text-xs text-[var(--ink-2, #6b7685)]">
          No data for the selected filters. Widen the date range or clear filters.
        </div>
      )}

      {!loading && !err && rows.length > 0 && view === 'report' && (
        <ReportView rows={rows} columns={config.columns} numerics={summaryNumerics} title={config.title} from={from} to={to} />
      )}
      {!loading && !err && rows.length > 0 && view === 'table' && (
        <TableView
          rows={pageRows} columns={config.columns}
          sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}
          page={page} totalPages={totalPages}
          onPage={setPage} total={rows.length}
        />
      )}
      {!loading && !err && rows.length > 0 && view === 'pivot' && (
        <PivotView
          data={pivotData} columns={config.columns} numericKeys={numericKeys}
          pivotField={pivotField} onPivotField={setPivotField}
          total={rows.length}
        />
      )}
    </div>
  );
}

// ─── Report view (formatted summary card) ────────────────────────────────────

function ReportView({ rows, columns, numerics, title, from, to }: {
  rows: any[]; columns: ReportColumn[];
  numerics: Record<string, number>;
  title: string; from: string; to: string;
}) {
  const numCols = columns.filter(c => c.numeric);
  const latest5 = rows.slice(0, 5);
  return (
    <div className="space-y-4 print:space-y-3">
      <div className="border border-[var(--border-subtle, #dde4ec)] rounded-lg p-4 bg-surface-v2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[var(--ink, #1e2a38)]">{title}</div>
            <div className="text-[10px] text-[var(--ink-2, #6b7685)] mt-0.5">
              {from || to ? `${from || '–'} → ${to || '–'}` : 'All time'} · {rows.length} records
            </div>
          </div>
          <div className="text-[10px] text-[var(--ink-2, #6b7685)]">{new Date().toLocaleDateString()}</div>
        </div>
        {numCols.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {numCols.map(c => (
              <div key={c.key} className="rounded bg-[var(--s1, #f8fafc)] border border-[var(--s2, #eef2f7)] p-2">
                <div className="text-[9px] text-[var(--ink-2, #6b7685)] uppercase tracking-wide">{c.label}</div>
                <div className="text-sm font-semibold text-[var(--ink, #1e2a38)] mt-0.5">
                  {numerics[c.key]?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '0'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {latest5.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-[var(--ink-2, #6b7685)] uppercase tracking-wide mb-2">Recent records</div>
          <div className="divide-y divide-[var(--s2, #eef2f7)] border border-[var(--border-subtle, #dde4ec)] rounded-lg overflow-hidden">
            {latest5.map((r, i) => (
              <div key={i} className="flex flex-wrap gap-3 px-3 py-2 text-xs bg-surface-v2">
                {columns.slice(0, 5).map(c => (
                  <span key={c.key} className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[9px] text-[var(--ink-2, #6b7685)] uppercase">{c.label}</span>
                    <span className="text-[var(--ink, #2d3748)] truncate max-w-[120px]">
                      {c.render ? c.render(r) : String(r[c.key] ?? '')}
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {rows.length === 0 && (
        <div className="text-xs text-[var(--ink-2, #6b7685)] text-center py-8">No records match the selected filters.</div>
      )}
    </div>
  );
}

// ─── Table view (sortable) ────────────────────────────────────────────────────

function TableView({ rows, columns, sortKey, sortDir, onSort, page, totalPages, onPage, total }: {
  rows: any[]; columns: ReportColumn[];
  sortKey: string; sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  page: number; totalPages: number;
  onPage: (p: number) => void;
  total: number;
}) {
  if (!rows.length) return (
    <div className="text-xs text-[var(--ink-2, #6b7685)] text-center py-8">No records match the selected filters.</div>
  );
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle, #dde4ec)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--s1, #f8fafc)] border-b border-[var(--border-subtle, #dde4ec)]">
              {columns.map(c => (
                <th key={c.key}
                  className={`px-3 py-2 text-left font-semibold text-[var(--ink-2, #4a5568)] cursor-pointer select-none whitespace-nowrap hover:text-[var(--ink, #1e2a38)] ${c.align === 'right' ? 'text-right' : ''}`}
                  onClick={() => onSort(c.key)}>
                  {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--s2, #eef2f7)]">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-[var(--s1, #f8fafc)]">
                {columns.map(c => (
                  <td key={c.key} className={`px-3 py-2 text-[var(--ink, #2d3748)] ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                    {c.render ? c.render(r) : String(r[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--ink-2, #4a5568)]">
          <span>{total} records · page {page + 1} / {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => onPage(page - 1)}
              className="px-2 py-1 border border-[var(--border-subtle, #dde4ec)] rounded disabled:opacity-40 hover:bg-[var(--s1, #f8fafc)]">‹ Prev</button>
            <button disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}
              className="px-2 py-1 border border-[var(--border-subtle, #dde4ec)] rounded disabled:opacity-40 hover:bg-[var(--s1, #f8fafc)]">Next ›</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pivot view ───────────────────────────────────────────────────────────────

function PivotView({ data, columns, numericKeys, pivotField, onPivotField, total }: {
  data: PivotRow[]; columns: ReportColumn[]; numericKeys: string[];
  pivotField: string; onPivotField: (k: string) => void; total: number;
}) {
  const nonNumericCols = columns.filter(c => !c.numeric);
  const numericCols = columns.filter(c => c.numeric);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-semibold text-[var(--ink-2, #6b7685)] uppercase tracking-wide">Group by</label>
        <select value={pivotField} onChange={e => onPivotField(e.target.value)}
          className="h-7 px-2 text-xs border border-[var(--border-subtle, #dde4ec)] rounded bg-surface-v2 focus:outline-none focus:ring-1 focus:ring-[#c2873a]">
          {nonNumericCols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <span className="text-[10px] text-[var(--ink-2, #6b7685)]">{total} records · {data.length} groups</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle, #dde4ec)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--s1, #f8fafc)] border-b border-[var(--border-subtle, #dde4ec)]">
              <th className="px-3 py-2 text-left font-semibold text-[var(--ink-2, #4a5568)]">
                {columns.find(c => c.key === pivotField)?.label ?? pivotField}
              </th>
              <th className="px-3 py-2 text-right font-semibold text-[var(--ink-2, #4a5568)]">Count</th>
              {numericCols.map(c => (
                <th key={c.key} className="px-3 py-2 text-right font-semibold text-[var(--ink-2, #4a5568)]">{c.label} (Σ)</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--s2, #eef2f7)]">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-[var(--s1, #f8fafc)]">
                <td className="px-3 py-2 text-[var(--ink, #2d3748)] font-medium">{row.group}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--ink, #2d3748)]">{row.count}</td>
                {numericCols.map(c => (
                  <td key={c.key} className="px-3 py-2 text-right tabular-nums text-[var(--ink, #2d3748)]">
                    {(row[`sum_${c.key}`] as number)?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="bg-[var(--s1, #f8fafc)] border-t border-[var(--border-subtle, #dde4ec)] font-semibold">
                <td className="px-3 py-2 text-[var(--ink-2, #3d4756)]">Total</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--ink, #2d3748)]">{total}</td>
                {numericCols.map(c => (
                  <td key={c.key} className="px-3 py-2 text-right tabular-nums text-[var(--ink, #2d3748)]">
                    {data.reduce((s, r) => s + (r[`sum_${c.key}`] as number), 0)
                      .toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {data.length === 0 && (
        <div className="text-xs text-[var(--ink-2, #6b7685)] text-center py-8">No records match the selected filters.</div>
      )}
    </div>
  );
}
