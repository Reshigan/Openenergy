// PulseLens — Direction 1 root.
//
// Primary surface: the orbit canvas. Press `T` to swap into the table view
// (kept as a secondary, but still 100% accessible).
//
// Keyboard:
//   T          toggle canvas/table
//   ⌘K         command palette
//   ↑/↓        cycle orbs in urgency order
//   ⏎          open drawer for current orb
//   esc        close drawer / palette
//   ⌘⇧D        toggle density
//   F1..F4     filter: All / Breached / Imminent / Regulator

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DensityProvider, useDensity } from '../shared/DensityContext';
import { SAMPLE_CHAIN_DATA, ChainRow, computeStateOfWorld, slaColor, STATUS_LABEL, TIER_LABEL, healthColor } from '../shared/SampleChainData';
import '../shared/animations.css';
import { PulseCanvas } from './PulseCanvas';
import { PulseDrawer } from './PulseDrawer';
import { CommandPalette, PaletteCommand, useCommandPaletteHotkey } from '../shared/CommandPalette';
import { PrototypeShell, StateStrip, Tooltip } from '../shared/primitives';

type Filter = 'all' | 'breached' | 'imminent' | 'regulator';

function PulseBody() {
  const { density, toggle } = useDensity();
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'canvas' | 'table'>('canvas');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useCommandPaletteHotkey(setPaletteOpen);

  const filtered = useMemo<ChainRow[]>(() => {
    switch (filter) {
      case 'breached':  return SAMPLE_CHAIN_DATA.filter((r) => r.sla_breached);
      case 'imminent':  return SAMPLE_CHAIN_DATA.filter((r) => !r.sla_breached && r.sla_pct_remaining < 25 && r.sla_target_hours > 0);
      case 'regulator': return SAMPLE_CHAIN_DATA.filter((r) => r.regulator_relevant);
      default:          return SAMPLE_CHAIN_DATA;
    }
  }, [filter]);

  const world = useMemo(() => computeStateOfWorld(SAMPLE_CHAIN_DATA), []);

  // Urgency-ordered list for ↑/↓ traversal.
  const urgencyOrder = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.sla_breached !== b.sla_breached) return a.sla_breached ? -1 : 1;
      if (a.urgency_rank !== b.urgency_rank) return b.urgency_rank - a.urgency_rank;
      return a.sla_pct_remaining - b.sla_pct_remaining;
    });
  }, [filtered]);

  // Default selection
  useEffect(() => {
    if (!selectedId && urgencyOrder.length > 0) {
      setSelectedId(urgencyOrder[0].id);
    }
  }, [urgencyOrder, selectedId]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip when typing in any input.
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

      const idx = urgencyOrder.findIndex((r) => r.id === selectedId);
      if (e.key === 't' || e.key === 'T') {
        setView((v) => (v === 'canvas' ? 'table' : 'canvas'));
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = urgencyOrder[Math.min(urgencyOrder.length - 1, idx + 1)];
        if (next) setSelectedId(next.id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = urgencyOrder[Math.max(0, idx - 1)];
        if (prev) setSelectedId(prev.id);
      } else if (e.key === 'Enter') {
        if (selectedId) {
          e.preventDefault();
          setDrawerOpen(true);
        }
      } else if (e.key === 'F1') {
        e.preventDefault();
        setFilter('all');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setFilter('breached');
      } else if (e.key === 'F3') {
        e.preventDefault();
        setFilter('imminent');
      } else if (e.key === 'F4') {
        e.preventDefault();
        setFilter('regulator');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [urgencyOrder, selectedId]);

  const selectedRow = useMemo(() => SAMPLE_CHAIN_DATA.find((r) => r.id === selectedId) ?? null, [selectedId]);

  const onOrbSelect = useCallback((id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  }, []);

  // Palette commands
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [
      { id: 'view-canvas', group: 'View', label: 'Switch to canvas', shortcut: 'T', run: () => setView('canvas') },
      { id: 'view-table',  group: 'View', label: 'Switch to table',  shortcut: 'T', run: () => setView('table') },
      { id: 'filter-all',       group: 'Filter', label: 'Show all',       shortcut: 'F1', run: () => setFilter('all') },
      { id: 'filter-breached',  group: 'Filter', label: 'Show breached',  shortcut: 'F2', run: () => setFilter('breached') },
      { id: 'filter-imminent',  group: 'Filter', label: 'Show imminent',  shortcut: 'F3', run: () => setFilter('imminent') },
      { id: 'filter-regulator', group: 'Filter', label: 'Show NERSA-flagged', shortcut: 'F4', run: () => setFilter('regulator') },
      { id: 'density', group: 'View', label: 'Toggle density', shortcut: '⌘⇧D', run: toggle },
    ];
    // Per-row jump commands so users can type "kakamas" → enter to open.
    for (const r of SAMPLE_CHAIN_DATA) {
      cmds.push({
        id: `open-${r.id}`,
        group: 'Open connector',
        label: `${r.number} — ${r.substation}`,
        hint: `${STATUS_LABEL[r.status]} · ${TIER_LABEL[r.tier]}`,
        run: () => {
          setSelectedId(r.id);
          setDrawerOpen(true);
        },
      });
    }
    return cmds;
  }, [toggle]);

  return (
    <PrototypeShell title="Pulse Lens" subtitle="Spatial situational awareness · W122 SCADA connectors">
      <StateStrip
        world={world}
        density={density}
        onToggleDensity={toggle}
        filterLabel={
          filter === 'all' ? `All ${filtered.length}` :
          filter === 'breached' ? `Breached ${filtered.length}` :
          filter === 'imminent' ? `Imminent ${filtered.length}` :
          `NERSA-flagged ${filtered.length}`
        }
        rightSlot={<FilterRow filter={filter} setFilter={setFilter} />}
      />

      <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto' }}>
        {view === 'canvas' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Connector field — pulse view</h2>
              <KbdHints />
            </div>
            <PulseCanvas
              rows={filtered}
              selectedId={selectedId}
              onSelect={onOrbSelect}
              width={1080}
              height={560}
            />
            <CanvasLegend />
            {selectedRow && <UrgencyTicker row={selectedRow} />}
          </>
        ) : (
          <TableView
            rows={urgencyOrder}
            selectedId={selectedId}
            onSelect={(id) => { setSelectedId(id); setDrawerOpen(true); }}
          />
        )}
      </div>

      <PulseDrawer
        row={drawerOpen ? selectedRow : null}
        onClose={() => setDrawerOpen(false)}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />
    </PrototypeShell>
  );
}

function FilterRow({ filter, setFilter }: { filter: Filter; setFilter: (f: Filter) => void }) {
  const items: Array<{ k: Filter; label: string; shortcut: string }> = [
    { k: 'all',       label: 'All',       shortcut: 'F1' },
    { k: 'breached',  label: 'Breached',  shortcut: 'F2' },
    { k: 'imminent',  label: 'Imminent',  shortcut: 'F3' },
    { k: 'regulator', label: 'NERSA',     shortcut: 'F4' },
  ];
  return (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      {items.map((it) => (
        <Tooltip key={it.k} label={it.label} shortcut={it.shortcut} position="bottom" instant={true}>
          <button
            type="button"
            className="oe-btn"
            onClick={() => setFilter(it.k)}
            aria-pressed={filter === it.k}
            style={{
              padding: '3px 9px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid ' + (filter === it.k ? '#5fa8e8' : 'rgba(255,255,255,0.18)'),
              background: filter === it.k ? 'rgba(95,168,232,0.16)' : 'transparent',
              color: '#dbe5f0',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {it.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function KbdHints() {
  return (
    <div style={{ display: 'inline-flex', gap: 12, fontSize: 11.5, color: '#525a66' }}>
      <span><kbd style={hintKbd}>↑↓</kbd> cycle</span>
      <span><kbd style={hintKbd}>⏎</kbd> open</span>
      <span><kbd style={hintKbd}>T</kbd> table</span>
      <span><kbd style={hintKbd}>⌘K</kbd> palette</span>
    </div>
  );
}
const hintKbd: React.CSSProperties = {
  background: '#fff', border: '1px solid #c5cdd6', padding: '1px 5px', borderRadius: 4,
  fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
};

function CanvasLegend() {
  return (
    <div
      style={{
        marginTop: 14,
        display: 'flex',
        gap: 18,
        fontSize: 11.5,
        color: '#525a66',
        flexWrap: 'wrap',
      }}
    >
      <LegendDot color="#0e6d68" label="green" />
      <LegendDot color="#c97a14" label="amber" />
      <LegendDot color="#c0392b" label="red" />
      <LegendDot color="#5a0e08" label="critical" />
      <span style={{ marginLeft: 18, opacity: 0.6 }}>·  Pulse ring = SLA breach or imminent  ·  Centre = system urgency core</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function UrgencyTicker({ row }: { row: ChainRow }) {
  return (
    <div
      style={{
        marginTop: 18,
        padding: '10px 14px',
        background: '#fff',
        border: '1px solid #dde4ec',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontSize: 12.5,
      }}
    >
      <span style={{ fontWeight: 700, color: '#0f1c2e' }}>{row.number}</span>
      <span style={{ color: '#3d4756' }}>{row.substation}</span>
      <span style={{ color: '#6b7685' }}>·</span>
      <span style={{ color: healthColor(row.health), fontWeight: 600 }}>{STATUS_LABEL[row.status]}</span>
      <span style={{ color: '#6b7685' }}>·</span>
      <span className="oe-num" style={{ color: slaColor(row.sla_pct_remaining), fontWeight: 700 }}>
        {row.sla_target_hours > 0 ? (row.sla_breached ? 'BREACHED' : `${row.sla_pct_remaining}% SLA remaining`) : '—'}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ color: '#6b7685', fontSize: 11 }}>
        Hit <kbd style={hintKbd}>⏎</kbd> for drawer
      </span>
    </div>
  );
}

function TableView({
  rows, selectedId, onSelect,
}: { rows: ChainRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #dde4ec',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div className="oe-sticky-head" style={{ display: 'grid', gridTemplateColumns: '100px 1fr 110px 80px 110px 80px 100px 100px', padding: '8px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: '#525a66' }}>
        <span>Number</span><span>Substation</span><span>Status</span><span>Tier</span><span>Urgency</span><span style={{ textAlign: 'right' }}>Cap MVA</span><span style={{ textAlign: 'right' }}>SLA%</span><span style={{ textAlign: 'right' }}>Esc</span>
      </div>
      <div style={{ maxHeight: 520, overflow: 'auto' }}>
        {rows.map((r) => (
          <div
            key={r.id}
            className="oe-row"
            data-selected={r.id === selectedId}
            onClick={() => onSelect(r.id)}
            role="button"
            tabIndex={0}
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 110px 80px 110px 80px 100px 100px',
              alignItems: 'center',
              borderTop: '1px solid #eef2f6',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#1a3a5c' }}>{r.number}</span>
            <span>{r.substation}</span>
            <span style={{ color: healthColor(r.health), fontWeight: 600 }}>{STATUS_LABEL[r.status]}</span>
            <span>{TIER_LABEL[r.tier]}</span>
            <span style={{ color: r.urgency === 'critical' ? '#5a0e08' : r.urgency === 'high' ? '#a8385c' : '#3d4756', fontWeight: 600 }}>{r.urgency}</span>
            <span className="oe-num">{r.capacity_mva}</span>
            <span className="oe-num" style={{ color: slaColor(r.sla_pct_remaining), fontWeight: 700 }}>{r.sla_target_hours > 0 ? (r.sla_breached ? 'BREACHED' : r.sla_pct_remaining + '%') : '—'}</span>
            <span className="oe-num">{r.escalation_level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PulseLens() {
  return (
    <DensityProvider>
      <PulseBody />
    </DensityProvider>
  );
}
