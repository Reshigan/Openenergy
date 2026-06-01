// HorizonStrip — top time-axis ruler + grid for the bars.
// "now" line is the conceptual cursor. Time-zoom buttons (7d/30d/90d) shift
// the horizon scale.

import React, { useMemo } from 'react';
import { ChainBar, HorizonScale } from './ChainBar';
import { ChainRow } from '../shared/SampleChainData';

export type Horizon = '7d' | '30d' | '90d';

export function horizonRange(h: Horizon, nowMs: number): { startMs: number; endMs: number } {
  const day = 24 * 3600 * 1000;
  switch (h) {
    case '7d':  return { startMs: nowMs - 2 * day, endMs: nowMs + 7 * day };
    case '30d': return { startMs: nowMs - 7 * day, endMs: nowMs + 30 * day };
    case '90d': return { startMs: nowMs - 14 * day, endMs: nowMs + 90 * day };
  }
}

export function HorizonStrip({
  horizon,
  setHorizon,
  rows,
  selectedId,
  onSelect,
  width = 1100,
  nowMs,
}: {
  horizon: Horizon;
  setHorizon: (h: Horizon) => void;
  rows: ChainRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  width?: number;
  nowMs: number;
}) {
  const range = useMemo(() => horizonRange(horizon, nowMs), [horizon, nowMs]);
  const scale: HorizonScale = useMemo(() => ({ startMs: range.startMs, endMs: range.endMs, width }), [range, width]);

  // Tick marks every day for 7d, every 2 days for 30d, every 7 days for 90d.
  const tickStepMs = horizon === '7d' ? 24 * 3600 * 1000 : horizon === '30d' ? 2 * 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
  const ticks: Array<{ x: number; label: string; major?: boolean }> = [];
  for (let t = range.startMs; t <= range.endMs; t += tickStepMs) {
    const dt = new Date(t);
    const isMidnight = dt.getUTCHours() === 0;
    const label = `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    const x = ((t - range.startMs) / (range.endMs - range.startMs)) * width;
    ticks.push({ x, label, major: isMidnight });
  }

  const nowX = ((nowMs - range.startMs) / (range.endMs - range.startMs)) * width;

  return (
    <div style={{ width, margin: '0 auto', padding: '12px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'inline-flex', gap: 4 }}>
          {(['7d', '30d', '90d'] as Horizon[]).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHorizon(h)}
              className="oe-btn"
              aria-pressed={horizon === h}
              style={{
                padding: '4px 10px',
                fontSize: 11.5,
                borderRadius: 6,
                border: '1px solid ' + (horizon === h ? '#1a3a5c' : '#c5cdd6'),
                background: horizon === h ? '#1a3a5c' : '#fff',
                color: horizon === h ? '#fff' : '#1a3a5c',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {h}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: '#525a66' }}>
          <strong style={{ color: '#0f1c2e' }}>{rows.length}</strong> chains on horizon
        </div>
      </div>

      {/* Axis ruler */}
      <div style={{ position: 'relative', height: 28, background: '#f0f4f9', borderTop: '1px solid #dde4ec', borderBottom: '1px solid #dde4ec' }}>
        {ticks.map((t, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: t.x,
              top: 0,
              height: t.major ? 18 : 12,
              borderLeft: '1px solid ' + (t.major ? '#c5cdd6' : '#e3e8ee'),
              fontSize: 10,
              color: '#6b7685',
              paddingLeft: 4,
              paddingTop: 2,
              whiteSpace: 'nowrap',
            }}
          >
            {t.major ? t.label : ''}
          </div>
        ))}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: nowX - 1,
            top: -4,
            bottom: -4,
            width: 2,
            background: '#c0392b',
            boxShadow: '0 0 0 2px rgba(192,57,43,0.18)',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: nowX + 4,
            top: 0,
            fontSize: 10,
            color: '#c0392b',
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          NOW
        </div>
      </div>

      {/* Stack of chain bars */}
      <div
        style={{
          position: 'relative',
          paddingTop: 8,
          paddingBottom: 16,
          background: '#fff',
          borderLeft: '1px solid #dde4ec',
          borderRight: '1px solid #dde4ec',
          borderBottom: '1px solid #dde4ec',
        }}
      >
        {/* Now line continuation */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: nowX - 1,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'rgba(192,57,43,0.20)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', width }}>
          {rows.map((r) => (
            <ChainBar
              key={r.id}
              row={r}
              scale={scale}
              selected={r.id === selectedId}
              onClick={() => onSelect(r.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
