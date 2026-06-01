// ChainBar — one row in the time-axis horizon strip.
//
// Each bar represents the SLA window for a single chain. Left edge = chain
// creation (clamped to 'now' for past-due rows). Right edge = SLA deadline
// (clamped to horizon end). Colour encodes SLA-pct severity. A vertical
// "now" line runs through the strip.
//
// Emil rules applied:
//   - No transition on hover (high-frequency scan surface).
//   - Selected ring uses `outline` not `box-shadow` to avoid layout shift.
//   - Bar fade-in on first paint uses @starting-style (CSS-only).

import React from 'react';
import { ChainRow, slaColor, healthColor, STATUS_LABEL, TIER_LABEL } from '../shared/SampleChainData';

export interface HorizonScale {
  startMs: number;
  endMs: number;
  width: number;
}

export function ChainBar({
  row,
  scale,
  selected,
  onClick,
}: {
  row: ChainRow;
  scale: HorizonScale;
  selected: boolean;
  onClick: () => void;
}) {
  // Bar span — clamp to visible horizon. If no deadline (terminal), draw
  // a thin badge at the row's updated_at marker.
  const updatedMs = new Date(row.updated_at).getTime();
  const dlMs = row.sla_deadline_at ? new Date(row.sla_deadline_at).getTime() : updatedMs;
  const x0Raw = Math.min(updatedMs, dlMs);
  const x1Raw = Math.max(updatedMs, dlMs);
  const span = scale.endMs - scale.startMs;
  const x0 = ((Math.max(scale.startMs, x0Raw) - scale.startMs) / span) * scale.width;
  const x1 = ((Math.min(scale.endMs, x1Raw) - scale.startMs) / span) * scale.width;
  const w = Math.max(6, x1 - x0);

  const color = row.sla_target_hours > 0
    ? slaColor(row.sla_pct_remaining)
    : '#525a66';

  const label = `${row.number} ${row.substation}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      aria-label={`${label} — ${STATUS_LABEL[row.status]} — ${row.sla_breached ? 'BREACHED' : row.sla_target_hours > 0 ? row.sla_pct_remaining + '% SLA remaining' : 'terminal'}`}
      style={{
        position: 'relative',
        height: 26,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        outline: selected ? '2px solid #5fa8e8' : '2px solid transparent',
        outlineOffset: -2,
        borderRadius: 3,
        background: selected ? 'rgba(95,168,232,0.06)' : 'transparent',
      }}
    >
      {/* The bar itself */}
      <div
        style={{
          position: 'absolute',
          left: x0,
          width: w,
          height: 14,
          top: 6,
          borderRadius: 3,
          background: color,
          opacity: 0.92,
        }}
      />
      {/* Endpoint tick at deadline */}
      {row.sla_deadline_at && (
        <div
          style={{
            position: 'absolute',
            left: x1 - 1.5,
            width: 3,
            height: 22,
            top: 2,
            background: row.sla_breached ? '#5a0e08' : color,
            opacity: 0.9,
          }}
        />
      )}
      {/* Label — fixed-width left rail, doesn't move when filter changes */}
      <span
        style={{
          position: 'absolute',
          left: 8,
          top: 0,
          height: 26,
          display: 'flex',
          alignItems: 'center',
          color: '#0f1c2e',
          fontSize: 11.5,
          fontWeight: 600,
          textShadow: '0 0 4px rgba(255,255,255,0.85)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 2,
          maxWidth: 220,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {row.number} · {row.substation}
      </span>
      {/* Right-side metadata: status + tier + SLA% */}
      <span
        style={{
          position: 'absolute',
          right: 8,
          top: 0,
          height: 26,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: '#3d4756',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <span style={{ color: healthColor(row.health), fontWeight: 600 }}>{STATUS_LABEL[row.status]}</span>
        <span style={{ color: '#6b7685' }}>{TIER_LABEL[row.tier]}</span>
        <span className="oe-num" style={{ color: color, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>
          {row.sla_breached ? 'BRCH' : row.sla_target_hours > 0 ? row.sla_pct_remaining + '%' : '—'}
        </span>
      </span>
    </div>
  );
}
