// PulseCanvas — the orbit/spatial state-space view.
//
// Layout model:
//   - Centre = "the system right now". Distance from centre encodes SLA
//     urgency (closer = more urgent). Angle encodes lifecycle status
//     (clockwise = forward state progression; branch states bottom-half).
//   - Orb radius encodes capacity_mva (sqrt-scaled so backbone doesn't
//     dominate the canvas).
//   - Orb colour encodes health band.
//   - Orbs with imminent SLA pulse (animated opacity only — transform
//     untouched, GPU-friendly).
//
// Emil rules applied here:
//   - Orb hover transitions `transform` + `box-shadow` only.
//   - Pulse is opacity-driven (.oe-pulse class).
//   - Keyboard nav (arrow keys cycle through orbs in urgency order) has
//     NO transition on selection ring; instant feedback.
//   - "Stop animations after first paint" idle rule: pulse is the ONLY
//     persistent animation, and only on imminent / breached orbs (not
//     every orb).

import React, { useMemo } from 'react';
import { ChainRow, slaColor, healthColor } from '../shared/SampleChainData';

const STATUS_ORDER = [
  'connector_proposed', 'endpoints_discovered', 'tls_configured',
  'handshake_completed', 'telemetry_streaming', 'quality_validated',
  'alarms_subscribed', 'control_commands_authorized',
  'live_operations', 'reconciliation_active', 'archived',
];

const BRANCH_STATES = new Set(['suspended', 'failover_active', 'disconnected', 'revoked']);

interface Positioned {
  row: ChainRow;
  x: number;
  y: number;
  r: number;
}

function position(rows: ChainRow[], width: number, height: number): Positioned[] {
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) * 0.42;
  return rows.map((row) => {
    // Distance: more urgent (closer to deadline) = closer to centre.
    // pct_remaining 100 → far, pct_remaining -100 → centre.
    // Branch terminals sit on outer ring (no SLA).
    let dist: number;
    if (row.sla_target_hours <= 0) {
      dist = maxRadius;
    } else {
      const pct = Math.max(-100, Math.min(100, row.sla_pct_remaining));
      dist = maxRadius * (0.18 + 0.82 * (Math.max(0, pct) / 100));
      if (pct < 0) dist = maxRadius * 0.10;
    }

    // Angle: forward states top half (10° → 170°); branch states bottom half.
    let angleDeg: number;
    if (BRANCH_STATES.has(row.status)) {
      // Distribute branches across the lower 180° in a stable order.
      const branchOrder = ['suspended', 'failover_active', 'disconnected', 'revoked'];
      const idx = branchOrder.indexOf(row.status);
      angleDeg = 190 + (idx + 0.5) * (160 / branchOrder.length);
    } else {
      const idx = STATUS_ORDER.indexOf(row.status);
      const frac = idx < 0 ? 0 : idx / (STATUS_ORDER.length - 1);
      angleDeg = 10 + frac * 160;
    }
    // Jitter using a deterministic hash of id so orbs in the same cell don't
    // collide. Tiny offset; keeps layout stable.
    const seed = row.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const jitterAngle = ((seed % 41) - 20) / 100; // ~±0.2 rad
    const jitterDist = ((seed % 19) - 9) * 1.5;   // ~±13px

    const a = ((angleDeg + jitterAngle * 30) * Math.PI) / 180;
    const x = cx + (dist + jitterDist) * Math.cos(a);
    const y = cy - (dist + jitterDist) * Math.sin(a);

    // Radius: sqrt-scaled to keep the 1500 MVA backbone orb from dwarfing.
    const r = 8 + Math.sqrt(row.capacity_mva) * 0.9;
    return { row, x, y, r };
  });
}

export function PulseCanvas({
  rows,
  selectedId,
  onSelect,
  width = 900,
  height = 560,
}: {
  rows: ChainRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  width?: number;
  height?: number;
}) {
  const positioned = useMemo(() => position(rows, width, height), [rows, width, height]);

  return (
    <div
      role="application"
      aria-label="Pulse lens canvas"
      style={{
        position: 'relative',
        width,
        height,
        background:
          'radial-gradient(circle at center, rgba(31,155,149,0.10) 0%, rgba(15,28,46,0) 60%),' +
          'radial-gradient(circle at center, rgba(95,168,232,0.06) 0%, rgba(15,28,46,0) 80%),' +
          '#0a1c30',
        borderRadius: 14,
        overflow: 'hidden',
        margin: '0 auto',
        boxShadow: 'inset 0 0 0 1px #0f2540',
      }}
    >
      {/* Concentric guide rings — purely decorative; no animation. */}
      {[0.18, 0.45, 0.72].map((r, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: width / 2 - Math.min(width, height) * 0.42 * r,
            top: height / 2 - Math.min(width, height) * 0.42 * r,
            width: Math.min(width, height) * 0.42 * r * 2,
            height: Math.min(width, height) * 0.42 * r * 2,
            borderRadius: '50%',
            border: '1px dashed rgba(155, 200, 238, 0.10)',
            pointerEvents: 'none',
          }}
        />
      ))}
      {/* Axis labels */}
      <div style={{ position: 'absolute', top: 12, left: 16, color: '#5fa8e8', fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        ↑ Forward progression
      </div>
      <div style={{ position: 'absolute', bottom: 12, left: 16, color: '#a8385c', fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        ↓ Branch states (suspended / failover / disconnected / revoked)
      </div>
      <div style={{ position: 'absolute', top: 12, right: 16, color: '#dbe5f0', fontSize: 10.5, opacity: 0.65 }}>
        Centre = imminent · Edge = healthy / terminal
      </div>

      {/* The orbs */}
      {positioned.map(({ row, x, y, r }) => {
        const fill = healthColor(row.health);
        const ring = row.sla_breached
          ? '#5a0e08'
          : row.sla_pct_remaining < 25 && row.sla_target_hours > 0
            ? slaColor(row.sla_pct_remaining)
            : 'transparent';
        const pulsing = row.sla_breached || (row.sla_pct_remaining < 25 && row.sla_target_hours > 0);
        const selected = row.id === selectedId;
        return (
          <button
            key={row.id}
            type="button"
            className={`oe-orb${pulsing ? ' oe-pulse' : ''}`}
            data-orb-id={row.id}
            onClick={() => onSelect(row.id)}
            aria-label={`${row.substation} — ${row.status}`}
            title={`${row.substation}\n${row.status} · ${row.tier}\n${row.sla_breached ? 'BREACHED' : `${row.sla_pct_remaining}% SLA window remaining`}`}
            style={{
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              background: fill,
              border: selected ? '2px solid #fff' : ring !== 'transparent' ? `2px solid ${ring}` : '1px solid rgba(255,255,255,0.18)',
              boxShadow: selected
                ? `0 0 0 4px rgba(255,255,255,0.18), 0 0 18px ${fill}`
                : pulsing
                  ? `0 0 14px ${ring === 'transparent' ? fill : ring}`
                  : `0 0 6px ${fill}55`,
              cursor: 'pointer',
              padding: 0,
              color: '#fff',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 9,
              fontWeight: 700,
              outline: 'none',
            }}
          >
            {row.id.replace('scc-', '')}
          </button>
        );
      })}

      {/* Centre badge — count of imminent + breached */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(192,57,43,0.10)',
          border: '1px dashed rgba(192,57,43,0.45)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#c0392b',
          pointerEvents: 'none',
        }}
      >
        <span className="oe-num" style={{ fontSize: 18, fontWeight: 800 }}>
          {rows.filter((r) => r.sla_breached).length}
        </span>
        <span style={{ fontSize: 9, letterSpacing: 0.4, opacity: 0.8 }}>BREACH</span>
      </div>
    </div>
  );
}
