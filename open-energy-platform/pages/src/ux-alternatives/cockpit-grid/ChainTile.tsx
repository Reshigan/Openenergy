// ChainTile — the per-tile content. Adapts to the size:
//   1×1 → sparkline-only summary
//   2×2 → mini table (4 rows)
//   3×3 → full table
//   4×4 → table + command rail

import React from 'react';
import { ChainRow, SAMPLE_CHAIN_DATA, slaColor, healthColor, STATUS_LABEL, TIER_LABEL } from '../shared/SampleChainData';

export type TileSize = '1x1' | '2x2' | '3x3' | '4x4';

export interface TileSpec {
  id: string;          // tile uuid
  title: string;
  filter: (r: ChainRow) => boolean;
  filterLabel: string;
}

export const TILE_TEMPLATES: TileSpec[] = [
  { id: 'all',       title: 'All connectors',     filter: () => true,                                         filterLabel: 'All' },
  { id: 'breached',  title: 'Breached SLA',        filter: (r) => r.sla_breached,                              filterLabel: 'Breached' },
  { id: 'imminent',  title: 'Imminent (<25%)',     filter: (r) => !r.sla_breached && r.sla_pct_remaining < 25 && r.sla_target_hours > 0, filterLabel: 'Imminent' },
  { id: 'backbone',  title: 'National backbone',   filter: (r) => r.tier === 'national_grid_backbone',         filterLabel: 'Backbone' },
  { id: 'nersa',     title: 'NERSA-flagged',       filter: (r) => r.regulator_relevant,                        filterLabel: 'NERSA' },
  { id: 'pilot',     title: 'Pilot bench',          filter: (r) => r.tier === 'pilot',                          filterLabel: 'Pilot' },
];

export function ChainTile({
  spec,
  size,
  selectedId,
  onSelect,
  focused,
}: {
  spec: TileSpec;
  size: TileSize;
  selectedId: string | null;
  onSelect: (id: string) => void;
  focused: boolean;
}) {
  const rows = SAMPLE_CHAIN_DATA.filter(spec.filter);
  const breachCount = rows.filter((r) => r.sla_breached).length;
  const imminentCount = rows.filter((r) => !r.sla_breached && r.sla_pct_remaining < 25 && r.sla_target_hours > 0).length;
  const worstHealth = rows.some((r) => r.health === 'critical') ? '#5a0e08'
    : rows.some((r) => r.health === 'red') ? '#c0392b'
    : rows.some((r) => r.health === 'amber') ? '#c97a14' : '#0e6d68';

  const visibleRows = size === '1x1' ? rows.slice(0, 0)
    : size === '2x2' ? rows.slice(0, 4)
    : rows;

  return (
    <div
      className="oe-tile"
      style={{
        height: '100%',
        background: '#fff',
        border: focused ? '2px solid #1a3a5c' : '1px solid #dde4ec',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      <header
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #eef2f6',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: focused ? '#e7f0f9' : '#f5f8fb',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: worstHealth }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0f1c2e', flex: 1 }}>{spec.title}</span>
        <span style={{ fontSize: 10.5, color: '#525a66' }}>
          <strong className="oe-num" style={{ color: '#0f1c2e' }}>{rows.length}</strong>
        </span>
      </header>

      {/* Summary strip — always shown */}
      <div style={{ padding: '6px 12px', display: 'flex', gap: 12, alignItems: 'center', fontSize: 10.5, color: '#525a66', borderBottom: '1px solid #eef2f6' }}>
        <span style={{ color: breachCount > 0 ? '#c0392b' : '#6b7685' }}>
          <strong className="oe-num">{breachCount}</strong> brch
        </span>
        <span style={{ color: imminentCount > 0 ? '#d97706' : '#6b7685' }}>
          <strong className="oe-num">{imminentCount}</strong> imm
        </span>
        <Sparkline rows={rows} />
      </div>

      {/* Body — table; 1x1 hides entirely */}
      {size !== '1x1' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {visibleRows.map((r) => (
            <div
              key={r.id}
              className="oe-row"
              data-selected={r.id === selectedId}
              onClick={() => onSelect(r.id)}
              role="button"
              tabIndex={-1}
              style={{
                display: 'grid',
                gridTemplateColumns: size === '4x4' ? '60px 1fr 70px 60px 60px' : size === '3x3' ? '60px 1fr 80px 60px' : '50px 1fr 60px',
                alignItems: 'center',
                borderTop: '1px solid #eef2f6',
                cursor: 'pointer',
                gap: 6,
              }}
            >
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: '#1a3a5c' }}>{r.id.replace('scc-', '')}</span>
              <span style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.substation}</span>
              {size === '4x4' && (
                <span style={{ fontSize: 11, color: healthColor(r.health), fontWeight: 600 }}>{STATUS_LABEL[r.status]}</span>
              )}
              {(size === '3x3' || size === '4x4') && (
                <span style={{ fontSize: 11, color: '#525a66' }}>{TIER_LABEL[r.tier]}</span>
              )}
              <span className="oe-num" style={{ fontSize: 11, color: slaColor(r.sla_pct_remaining), fontWeight: 700, textAlign: 'right' }}>
                {r.sla_target_hours > 0 ? (r.sla_breached ? 'BR' : r.sla_pct_remaining + '%') : '—'}
              </span>
            </div>
          ))}
          {size === '2x2' && rows.length > 4 && (
            <div style={{ padding: '6px 10px', fontSize: 10.5, color: '#6b7685', borderTop: '1px solid #eef2f6' }}>
              +{rows.length - 4} more — resize to 3×3 to expand
            </div>
          )}
        </div>
      )}

      {/* 1×1 — sparkline + headline only */}
      {size === '1x1' && (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div className="oe-num" style={{ fontSize: 24, fontWeight: 800, color: '#0f1c2e' }}>{rows.length}</div>
          <div style={{ fontSize: 10.5, color: '#525a66', marginTop: 4, letterSpacing: 0.4, textTransform: 'uppercase' }}>{spec.filterLabel}</div>
        </div>
      )}
    </div>
  );
}

function Sparkline({ rows }: { rows: ChainRow[] }) {
  // SLA pct distribution sparkline (tiny). Bars: <0, 0-25, 25-60, 60-100.
  const buckets = [0, 0, 0, 0];
  for (const r of rows) {
    if (r.sla_target_hours <= 0) continue;
    if (r.sla_pct_remaining < 0) buckets[0] += 1;
    else if (r.sla_pct_remaining < 25) buckets[1] += 1;
    else if (r.sla_pct_remaining < 60) buckets[2] += 1;
    else buckets[3] += 1;
  }
  const max = Math.max(1, ...buckets);
  const colors = ['#5a0e08', '#c0392b', '#d97706', '#0e6d68'];
  return (
    <span style={{ display: 'inline-flex', gap: 1, marginLeft: 'auto', alignItems: 'flex-end', height: 16 }}>
      {buckets.map((v, i) => (
        <span key={i} style={{ width: 6, height: 4 + (v / max) * 12, background: colors[i], borderRadius: 1, opacity: v === 0 ? 0.2 : 1 }} />
      ))}
    </span>
  );
}
