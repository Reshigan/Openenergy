// ════════════════════════════════════════════════════════════════════════
// FileTable + FileSection — small primitives for entity-file tab bodies.
//
// Every entity file tab follows the same shape: one or more sections, each
// with a title + table of rows. Rather than hand-rolling 30 nearly-
// identical table blocks across project/contract/RFP/LOI/fund detail
// pages, the tab render functions return <FileSection> wrappers around
// <FileTable> with a column config.
//
// Keep this tiny — no sort/filter/pagination plumbing here. Anything that
// needs that opens the dedicated workbench via the tab's "Open workbench"
// link in the section header.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { OEIcon } from '../OEIcon';
import { StitchPill } from '../StitchPage';

export interface FileColumn<TRow> {
  key: string;
  label: string;
  /** Optional cell renderer. Defaults to String(row[key]). */
  render?: (row: TRow) => React.ReactNode;
  /** Right-align numeric columns. */
  align?: 'left' | 'right';
  /** Render the cell using mono / tabular figures (good for amounts/dates). */
  mono?: boolean;
  /** Optional width hint applied via className. */
  className?: string;
}

export function FileSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2">
      <header className="px-5 py-3 border-b border-[var(--s2, #eef2f7)] flex items-center justify-between gap-2">
        <div>
          <div className="font-display font-semibold text-[14px] text-[var(--ink, #0f1c2e)]">{title}</div>
          {subtitle && <div className="text-[12px] text-[var(--ink-2, #6b7685)] mt-0.5">{subtitle}</div>}
        </div>
        {action}
      </header>
      <div>{children}</div>
    </section>
  );
}

export function FileTable<TRow extends Record<string, unknown>>({
  rows,
  columns,
  emptyMessage,
  emptyAction,
}: {
  rows: TRow[];
  columns: FileColumn<TRow>[];
  emptyMessage: string;
  emptyAction?: React.ReactNode;
}) {
  if (!rows || rows.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <div className="text-[var(--ink-2, #6b7685)] text-[13px]">{emptyMessage}</div>
        {emptyAction && <div className="mt-2">{emptyAction}</div>}
      </div>
    );
  }
  return (
    <div className="overflow-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-[var(--s1, #fafbfd)]">
          <tr className="text-[11px] uppercase text-[var(--ink-2, #6b7685)]">
            {columns.map((c) => (
              <th key={c.key} className={`px-4 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.className || ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={(row as { id?: string }).id || idx} className="border-t border-[var(--s2, #eef2f7)]">
              {columns.map((c) => {
                const raw = (row as Record<string, unknown>)[c.key];
                const value = c.render ? c.render(row) : raw == null ? '—' : String(raw);
                const cellClass = [
                  'px-4 py-2',
                  c.align === 'right' ? 'text-right' : '',
                  c.mono ? 'font-mono text-[11px] text-[var(--ink-2, #3d4756)]' : '',
                  c.className || '',
                ].filter(Boolean).join(' ');
                return (
                  <td key={c.key} className={cellClass}>
                    {value as React.ReactNode}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Cell renderers — re-used across every entity-file tab body.
 * ─────────────────────────────────────────────────────────────────────── */

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-ZA');
}

export function fmtZAR(n: number | string | null | undefined, opts: { decimals?: number } = {}): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (v == null || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(v);
}

export function fmtNum(n: number | string | null | undefined, decimals = 0): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (v == null || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: decimals }).format(v);
}

export function fmtPct(n: number | string | null | undefined, decimals = 1): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(decimals)}%`;
}

export function StatusCell({ value }: { value: unknown }) {
  if (value == null || value === '') return <span className="text-[var(--ink-2, #6b7685)]">—</span>;
  return <StitchPill status={String(value)} />;
}

export function LinkCell({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-[var(--info, #1a5d97)] font-semibold hover:underline"
    >
      {label} <OEIcon name="chevron-right" size={12} />
    </a>
  );
}

export default FileTable;
