// pages/src/meridian/surfaces/lender/_AutoTable.tsx
//
// Small schema-agnostic table used by the lender Meridian surfaces. The lender-suite read
// endpoints (reserves, waterfalls, covenants, IE certifications, watchlist, dunning, benchmark)
// return row shapes that aren't pinned in a static registry, so rather than hard-code (and risk
// wrong) column keys, AutoTable fetches the endpoint, unwraps the common envelope variants, and
// derives a sensible, formatted column set from the rows themselves. Read-only by design —
// mutating lender surfaces compose their own ActionModals around this.
import React, { useEffect, useState } from 'react';
import { Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function prettify(key: string): string {
  return key
    .replace(/_zar_m$/, ' (ZARm)')
    .replace(/_zar$/, ' (ZAR)')
    .replace(/_pct$/, ' %')
    .replace(/_mwh$/, ' MWh')
    .replace(/_mw$/, ' MW')
    .replace(/_at$/, '')
    .replace(/_id$/, ' ID')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(key: string, v: any): React.ReactNode {
  if (v == null || v === '') return <span className="text-slate-300">—</span>;
  if (typeof v === 'boolean') return <Pill tone={v ? 'good' : 'neutral'}>{v ? 'yes' : 'no'}</Pill>;
  if (/status|tier|severity|rating/.test(key) && typeof v === 'string') {
    const tone = /breach|reject|lapsed|default|overdue|fail/.test(v) ? 'bad'
      : /warn|pending|review|watch/.test(v) ? 'warn'
      : /active|certified|resolved|pass|good|cured|ok/.test(v) ? 'good' : 'info';
    return <Pill tone={tone as any}>{v.replace(/_/g, ' ')}</Pill>;
  }
  if (typeof v === 'string' && DATE_RE.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  if (typeof v === 'number') {
    if (/_zar_m$/.test(key)) return `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}m`;
    if (/_zar$/.test(key)) return `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
    if (/_pct$/.test(key)) return `${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}%`;
    return v.toLocaleString('en-ZA');
  }
  if (typeof v === 'object') return <span className="text-[10px] text-slate-400">{JSON.stringify(v).slice(0, 40)}…</span>;
  return String(v);
}

// Pull the first array we can find out of the {success,data} envelope, tolerating
// data:[], data:{items:[]}, data:{<name>:[]}, or a bare array.
function unwrap(payload: any): any[] {
  const d = payload?.data ?? payload;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    if (Array.isArray(d.items)) return d.items;
    for (const k of Object.keys(d)) if (Array.isArray(d[k])) return d[k];
  }
  return [];
}

export function AutoTable({
  endpoint, prefer = [], hide = [], maxCols = 8, empty = 'No rows.', refreshKey = 0,
}: {
  endpoint: string; prefer?: string[]; hide?: string[]; maxCols?: number; empty?: string; refreshKey?: number;
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null); setErr(null);
    api.get(endpoint)
      .then((res) => { if (live) setRows(unwrap(res.data)); })
      .catch((e) => { if (live) setErr(e?.response?.data?.error || e?.message || 'Failed to load'); });
    return () => { live = false; };
  }, [endpoint, refreshKey]);

  if (err) return <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">{err}</div>;
  if (rows == null) return <div className="text-[12px] text-slate-400 px-1 py-6">Loading…</div>;
  if (rows.length === 0) return <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-[12px] text-slate-400">{empty}</div>;

  const seen = new Set<string>();
  const sample = rows.slice(0, 8);
  const allKeys: string[] = [];
  for (const r of sample) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); allKeys.push(k); }
  const hidden = new Set([...hide, 'tenant_id', 'participant_id', 'counterparty_id', 'created_at', 'updated_at']);
  const ordered = [
    ...prefer.filter((k) => seen.has(k)),
    ...allKeys.filter((k) => !prefer.includes(k) && !hidden.has(k)),
  ].slice(0, maxCols);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-[12px]">
        <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
          <tr>{ordered.map((k) => <th key={k} className="text-left px-3 py-2 font-semibold">{prettify(k)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-t border-slate-100">
              {ordered.map((k) => <td key={k} className="px-3 py-2">{fmt(k, r[k])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
