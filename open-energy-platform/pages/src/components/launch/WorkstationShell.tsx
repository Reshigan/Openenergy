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
import { RoleShell, CommandRail, type CommandItem } from '../signature';
import { themeFor, type RoleKey } from '../../lib/role-themes';

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
  role,
  commands,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  tabs: WorkstationTab[];
  /** Role key from role-themes. When provided, the workstation is wrapped in
   *  RoleShell at the role's workstationDensity (bloomberg for ops, cinematic
   *  for others) and chrome adopts signature tokens. */
  role?: RoleKey | string;
  /** Optional hotkey-driven command rail. Only rendered when role is given. */
  commands?: CommandItem[];
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

  if (role) {
    const theme = themeFor(role);
    return (
      <RoleShell role={role} density={theme.workstationDensity}>
        {commands && commands.length > 0 ? <CommandRail items={commands} /> : null}
        <div style={{ padding: 'var(--oe-pad-section)', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%' }}>
          <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--role-accent)',
                  padding: '4px 10px',
                  border: '1px solid var(--role-border)',
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--role-accent-soft) 80%, transparent)',
                }}
              >
                {eyebrow}
              </div>
              <h1
                style={{
                  fontFamily: 'var(--oe-display-font)',
                  fontSize: theme.workstationDensity === 'bloomberg' ? 22 : 28,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  marginTop: 8,
                  color: 'var(--role-on-surface)',
                }}
              >
                {title}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--role-on-surface-muted)', maxWidth: 720, margin: '4px 0 0' }}>
                {subtitle}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {backHref && (
                <button
                  onClick={() => navigate(backHref)}
                  style={{
                    height: 32,
                    padding: '0 12px',
                    border: '1px solid var(--role-border)',
                    background: 'var(--role-surface-raised)',
                    color: 'var(--role-on-surface)',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <ArrowLeft size={12} /> {backLabel || 'Back'}
                </button>
              )}
              <button
                onClick={refresh}
                style={{
                  height: 32,
                  padding: '0 12px',
                  border: '1px solid var(--role-border)',
                  background: 'var(--role-surface-raised)',
                  color: 'var(--role-on-surface)',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
          </header>

          <nav
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              padding: 4,
              border: '1px solid var(--role-border)',
              borderRadius: 'var(--oe-radius-card)',
              background: 'var(--role-surface-raised)',
            }}
          >
            {tabs.map(t => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    height: 30,
                    padding: '0 12px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    color: isActive ? '#0a1622' : 'var(--role-on-surface-muted)',
                    background: isActive ? 'var(--role-accent)' : 'transparent',
                    transition: 'background 120ms ease-out',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          <div key={`${activeTab}-${bump}`}>{current.body({ onRefresh: refresh })}</div>
        </div>
      </RoleShell>
    );
  }

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
  rowHref,
  rowOnClick,
}: {
  endpoint: string;
  columns: Column[];
  empty?: { title: string; description: string };
  rowKey: (row: any) => string;
  rowHref?: (row: any) => string;
  /** Alternative to rowHref: fire a callback (e.g. open a modal). The
   *  click handler still ignores clicks on buttons/inputs inside the row. */
  rowOnClick?: (row: any) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get(endpoint);
      // Some endpoints return { allocations, unallocated } shape — flatten
      // to a single array for rendering when that pattern is detected.
      const raw = res.data?.data;
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.allocations)) {
        setRows(raw.allocations as any[]);
      } else {
        setRows((raw as any[]) || []);
      }
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
    <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto">
      <table className="w-full text-[13px] min-w-[640px]">
        <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
          <tr>{columns.map(col => <th key={col.key} className="px-4 py-2">{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const href = rowHref ? rowHref(r) : null;
            const clickHandler = (e: React.MouseEvent) => {
              // Only navigate when the click was on the row chrome — let
              // buttons / links inside the row keep their own handlers.
              if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
              if (href) nav(href);
              else if (rowOnClick) rowOnClick(r);
            };
            const clickable = !!(href || rowOnClick);
            return (
              <tr
                key={rowKey(r)}
                onClick={clickHandler}
                className={`border-t border-[#e5ebf2] hover:bg-[#f8fafc] ${clickable ? 'cursor-pointer' : ''}`}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : ''}`}>
                    {col.render ? col.render(r) : (r[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
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

// ─── Generic form modal for workflow transitions ────────────────────
//
// Every workstation needs to POST to a transition / create endpoint
// with a small handful of fields. Rather than building a bespoke modal
// per action, this generic component accepts a field schema and a
// submit handler.

export type FieldSpec = {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'number' | 'date';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
  helperText?: string;
};

export function ActionModal({
  title,
  fields,
  submitLabel = 'Submit',
  onClose,
  onSubmit,
  cta = 'primary',
}: {
  title: string;
  fields: FieldSpec[];
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  cta?: 'primary' | 'danger';
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.defaultValue || '';
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const update = (k: string, v: string) => setValues(prev => ({ ...prev, [k]: v }));
  const submit = async () => {
    for (const f of fields) {
      if (f.required && !values[f.key]) {
        setErr(`${f.label} is required.`); return;
      }
    }
    setSaving(true); setErr(null);
    try { await onSubmit(values); } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); setSaving(false); }
  };
  const btnCls = cta === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1a3a5c] hover:bg-[#0f1c2e]';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#0f1c2e]">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-[#6b7685] hover:text-[#0f1c2e]">×</button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-[12px] text-red-700">{err}</div>}
          {fields.map(f => (
            <label key={f.key} className="block text-[13px]">
              <span className="text-[#6b7685]">{f.label}{f.required && ' *'}</span>
              {f.type === 'textarea' ? (
                <textarea value={values[f.key]} onChange={(e) => update(f.key, e.target.value)} rows={4} placeholder={f.placeholder} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg resize-none" />
              ) : f.type === 'select' ? (
                <select value={values[f.key]} onChange={(e) => update(f.key, e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
                  <option value="">— select —</option>
                  {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={values[f.key]} onChange={(e) => update(f.key, e.target.value)} placeholder={f.placeholder} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg" />
              )}
              {f.helperText && <span className="block mt-1 text-[10px] text-[#6b7685]">{f.helperText}</span>}
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 border border-[#dde4ec] rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${btnCls}`}>
              {saving ? 'Saving…' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
