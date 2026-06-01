import React, { useState } from 'react';
import { OeIcon } from '../icons/Icons';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: string;
  mono?: boolean;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
  compact?: boolean;
  footer?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  loading = false,
  emptyMessage = 'No records found.',
  onRowClick,
  stickyHeader = true,
  compact = false,
  footer,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedRows = React.useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const rowH = compact ? '40px' : '48px';
  const fontSize = compact ? '12px' : '13px';

  return (
    <div
      style={{
        background: 'var(--oe-canvas)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        overflow: 'hidden',
        boxShadow: 'var(--oe-shadow-card)',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize,
          }}
        >
          <thead
            style={stickyHeader ? {
              position: 'sticky',
              top: 0,
              zIndex: 1,
            } : undefined}
          >
            <tr>
              {columns.map(col => (
                <th
                  key={String(col.key)}
                  style={{
                    padding: compact ? '8px 12px' : '10px 14px',
                    background: 'var(--oe-grad-table-head)',
                    borderBottom: '1px solid var(--oe-border)',
                    textAlign: col.align ?? 'left',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'var(--oe-text-3)',
                    whiteSpace: 'nowrap',
                    width: col.width,
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                  onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {col.header}
                    {col.sortable && (
                      <span style={{ opacity: sortKey === String(col.key) ? 1 : 0.3 }}>
                        <OeIcon
                          name={sortKey === String(col.key) && sortDir === 'desc' ? 'trend-down' : 'trend-up'}
                          size={10}
                        />
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={String(col.key)} style={tdStyle(rowH, col.align, compact)}>
                      <div
                        style={{
                          height: '12px',
                          width: `${40 + Math.random() * 50}%`,
                          background: 'var(--oe-surf-2)',
                          borderRadius: '3px',
                          animation: 'oe-shimmer 1.4s ease-in-out infinite',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: '48px 16px',
                    textAlign: 'center',
                    color: 'var(--oe-text-3)',
                    fontSize: '13px',
                  }}
                >
                  <OeIcon name="list" size={24} color="var(--oe-text-4)" />
                  <div style={{ marginTop: '8px' }}>{emptyMessage}</div>
                </td>
              </tr>
            ) : (
              sortedRows.map((row, i) => (
                <tr
                  key={(row as Record<string, unknown>).id != null ? String((row as Record<string, unknown>).id) : i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    borderBottom: i < sortedRows.length - 1 ? '1px solid var(--oe-border-2)' : 'none',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background 80ms',
                    background: 'transparent',
                  }}
                  onMouseEnter={onRowClick ? e => ((e.currentTarget as HTMLElement).style.background = 'var(--oe-surf)') : undefined}
                  onMouseLeave={onRowClick ? e => ((e.currentTarget as HTMLElement).style.background = 'transparent') : undefined}
                >
                  {columns.map(col => {
                    const val = (row as any)[String(col.key)];
                    return (
                      <td key={String(col.key)} style={tdStyle(rowH, col.align, compact, col.mono)}>
                        {col.render ? col.render(row) : (
                          <span style={col.mono ? { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' } : undefined}>
                            {val ?? '—'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer && (
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--oe-border-2)',
            background: 'var(--oe-surf)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

function tdStyle(
  rowH: string,
  align: 'left' | 'right' | 'center' = 'left',
  compact: boolean,
  mono?: boolean,
): React.CSSProperties {
  return {
    padding: compact ? '0 12px' : '0 14px',
    height: rowH,
    textAlign: align,
    color: 'var(--oe-text-1)',
    fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  };
}

export default DataTable;
