// ════════════════════════════════════════════════════════════════════════
// WorkstationShell — shared primitive for each role's L4 workstation page
//
// Single-file pattern reused by Carbon / Grid / Regulator / Admin / Support
// workstations. Each role wraps the shell with its own list of tabs.
// Tab body either is custom JSX (when the workflow needs file/transition
// actions) or a generic listing table over a server endpoint.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';

export type WorkstationTab = {
  key: string;
  label: string;
  body: (props: { onRefresh: () => void }) => ReactNode;
};

export function WorkstationShell({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel,
  tabs,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  tabs: WorkstationTab[];
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = params.get('tab') || tabs[0]?.key;
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [bump, setBump] = useState(0);

  const setTab = (k: string) => {
    setActiveTab(k);
    const next = new URLSearchParams(params);
    next.set('tab', k);
    setParams(next, { replace: true });
  };

  const refresh = () => setBump(n => n + 1);
  const current = tabs.find(t => t.key === activeTab) || tabs[0];

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685] bg-white border border-[#dde4ec] rounded-full px-3 py-1">
            {eyebrow}
          </div>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>{title}</h1>
          <p className="text-[13px] text-[#3d4756]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {backHref && (
            <button onClick={() => navigate(backHref)} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
              <ArrowLeft size={12} /> {backLabel || 'Back'}
            </button>
          )}
          <button onClick={refresh} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-1 bg-white border border-[#dde4ec] rounded-lg p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`h-9 px-3 rounded-md text-[12px] font-semibold ${activeTab === t.key ? 'bg-[#1a3a5c] text-white' : 'text-[#3d4756] hover:bg-[#eef2f7]'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div key={`${activeTab}-${bump}`}>{current.body({ onRefresh: refresh })}</div>
    </div>
  );
}

// ─── Generic listing table for a server endpoint ─────────────────────
export type Column = {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
  align?: 'left' | 'right';
};

export function ListingTable({
  endpoint,
  columns,
  empty,
  rowKey,
}: {
  endpoint: string;
  columns: Column[];
  empty?: { title: string; description: string };
  rowKey: (row: any) => string;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get(endpoint);
      setRows((res.data?.data as any[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Skeleton variant="card" rows={4} />;
  if (err) return <ErrorBanner message={err} onRetry={() => void load()} />;
  if (rows.length === 0) {
    return <EmptyState title={empty?.title || 'No data'} description={empty?.description || ''} />;
  }
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
          <tr>{columns.map(col => <th key={col.key} className="px-4 py-2">{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={rowKey(r)} className="border-t border-[#e5ebf2] hover:bg-[#f8fafc]">
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : ''}`}>
                  {col.render ? col.render(r) : (r[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Pill = ({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'neutral' | 'info'; children: ReactNode }) => {
  const bg: Record<string, string> = {
    good: 'bg-green-100 text-green-700',
    warn: 'bg-amber-100 text-amber-800',
    bad: 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${bg[tone]}`}>{children}</span>;
};
