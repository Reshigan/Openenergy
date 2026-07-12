// Ticker — Bloomberg-style tape. Renders symbol rows, flashes the cell on
// value change. Used as the Trader hero motif and elsewhere where live
// values matter more than chart shape.
//
// Accessibility: container is aria-live="polite". Up/down direction has a
// glyph (▲/▼) in addition to color so the signal isn't color-only.

import React, { useEffect, useRef } from 'react';

export interface TickerRow {
  symbol: string;
  label: string;
  value: number;
  delta: number;
  display?: string;
}

export interface TickerProps {
  rows: TickerRow[];
  ariaLabel: string;
}

function fmtPrice(v: number): string {
  return `R ${v.toFixed(2)}`;
}

export function Ticker({ rows, ariaLabel }: TickerProps) {
  const lastValues = useRef<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    rows.forEach((r) => {
      const prev = lastValues.current[r.symbol];
      if (prev !== undefined && prev !== r.value) {
        const direction = r.value > prev ? 'up' : 'down';
        const el = container.querySelector<HTMLElement>(`[data-ticker-row="${r.symbol}"]`);
        if (el) {
          el.setAttribute('data-flash', direction);
          window.setTimeout(() => {
            if (el.getAttribute('data-flash') === direction) el.removeAttribute('data-flash');
          }, 240);
        }
      }
      lastValues.current[r.symbol] = r.value;
    });
  }, [rows]);
  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      aria-live="polite"
      style={{
        fontFamily: 'var(--oe-num-font)',
        fontSize: 13,
        background: 'var(--role-surface-raised)',
        border: '1px solid var(--role-border)',
        borderRadius: 'var(--oe-radius-card)',
        overflow: 'hidden',
      }}
    >
      {rows.map((r, idx) => {
        const up = r.delta >= 0;
        return (
          <div
            key={r.symbol}
            data-ticker-row={r.symbol}
            className="oe-tnum"
            style={{
              display: 'grid',
              gridTemplateColumns: '64px 1fr auto auto',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              borderTop: idx === 0 ? 'none' : '1px solid var(--role-border)',
            }}
          >
            <span style={{ fontWeight: 700, letterSpacing: '0.05em', color: 'var(--role-accent)' }}>
              {r.symbol}
            </span>
            <span style={{ color: 'var(--role-on-surface-muted)' }}>{r.label}</span>
            <span style={{ color: 'var(--role-on-surface)' }}>{r.display ?? fmtPrice(r.value)}</span>
            <span
              style={{
                width: 64,
                textAlign: 'right',
                color: up ? '#1f8a5b' : 'var(--bad, #c0392b)',
                fontWeight: 600,
              }}
            >
              <span aria-hidden="true">{up ? '▲' : '▼'}</span> {Math.abs(r.delta).toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
