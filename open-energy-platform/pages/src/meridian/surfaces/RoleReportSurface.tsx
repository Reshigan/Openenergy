// pages/src/meridian/surfaces/RoleReportSurface.tsx
//
// Canonical per-role reporting surface. Every role's Reports tile renders this — it hits the
// one real, tenant/role-guarded report builder (GET /api/reports/:role → buildFor(), see
// src/routes/reports.ts) which returns { role, generated_at, summary:{kpi…}, sections:[{key,label,rows}] }.
// The nine bespoke ReportsSurface configs it replaced pointed at endpoints that never existed
// (every panel body 404'd). One source, one consistent journey: KPI band → section tables →
// per-section CSV export. `role` comes from the JWT via MeridianSurfacePage and equals the
// reports API role name for all nine reporting roles.
import React, { useEffect, useMemo, useState } from 'react';

type Row = Record<string, string | number | null>;
type Section = { key: string; label: string; rows: Row[] };
interface Report { role: string; generated_at?: string; summary?: Record<string, string | number>; sections?: Section[] }

import { api } from '../../lib/api';

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const isNum = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)));
const fmt = (v: unknown) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-ZA', { maximumFractionDigits: 2 });
  return String(v);
};

function downloadCsv(name: string, rows: Row[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

function KpiBand({ summary }: { summary: Record<string, string | number> }) {
  const keys = Object.keys(summary);
  if (!keys.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
      {keys.map((k) => (
        <div key={k} style={{ border: '1px solid var(--border-subtle, #dde4ec)', borderRadius: 10, padding: '12px 14px', background: 'var(--surface, #fff)' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-2, #6b7685)' }}>{titleCase(k)}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink, #1e2a38)', marginTop: 4 }}>{fmt(summary[k])}</div>
        </div>
      ))}
    </div>
  );
}

function SectionTable({ section }: { section: Section }) {
  const [sortKey, setSortKey] = useState('');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const cols = section.rows.length ? Object.keys(section.rows[0]) : [];
  const sorted = useMemo(() => {
    if (!sortKey) return section.rows;
    return [...section.rows].sort((a, b) => {
      const va = a[sortKey] ?? '', vb = b[sortKey] ?? '';
      const c = isNum(va) && isNum(vb) ? Number(va) - Number(vb) : String(va).localeCompare(String(vb));
      return dir === 'asc' ? c : -c;
    });
  }, [section.rows, sortKey, dir]);
  const toggle = (k: string) => { if (sortKey === k) setDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(k); setDir('asc'); } };

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2, #4a5568)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {section.label} <span style={{ color: 'var(--ink-3, #9aa4b2)', fontWeight: 500 }}>· {section.rows.length}</span>
        </span>
        {section.rows.length > 0 && (
          <button type="button" onClick={() => downloadCsv(`${section.key}`, section.rows)}
            className="btn" style={{ fontSize: 11, padding: '4px 10px' }}>Export CSV</button>
        )}
      </div>
      {section.rows.length === 0 ? (
        <div style={{ border: '1px solid var(--border-subtle, #e3e8ef)', borderRadius: 8, padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--ink-2, #6b7685)', background: 'var(--surface, #fff)' }}>
          No records yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle, #dde4ec)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s1, #f8fafc)' }}>
                {cols.map((c) => (
                  <th key={c} onClick={() => toggle(c)}
                    style={{ padding: '8px 10px', textAlign: isNum(section.rows[0][c]) ? 'right' : 'left', fontWeight: 600, color: 'var(--ink-2, #4a5568)', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle, #dde4ec)' }}>
                    {titleCase(c)}{sortKey === c ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} style={{ borderTop: i ? '1px solid var(--s2, #eef2f7)' : 'none' }}>
                  {cols.map((c) => (
                    <td key={c} style={{ padding: '8px 10px', textAlign: isNum(r[c]) ? 'right' : 'left', color: 'var(--ink, #2d3748)' }}>{fmt(r[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RoleReportSurface({ role }: { role: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    setReport(null); setErr(false);
    api.get(`/reports/${role}`)
      .then((r) => { if (live) setReport((r.data?.data as Report) || null); })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [role]);

  if (err) return <div className="mer mer-error" role="alert">Could not load the {titleCase(role)} report.</div>;
  if (!report) return <div className="mer mer-loading" aria-busy="true">Loading report…</div>;

  const sections = report.sections || [];
  return (
    <div className="mer">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink, #1e2a38)' }}>{titleCase(role)} report</span>
        <span style={{ fontSize: 11, color: 'var(--ink-2, #6b7685)' }}>
          Generated {report.generated_at ? new Date(report.generated_at).toLocaleString('en-ZA') : new Date().toLocaleString('en-ZA')}
        </span>
      </div>
      {report.summary && <KpiBand summary={report.summary} />}
      {sections.length === 0
        ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--ink-2, #6b7685)' }}>No report sections available.</div>
        : sections.map((s) => <SectionTable key={s.key} section={s} />)}
    </div>
  );
}
