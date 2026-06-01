// CockpitGrid - Direction 4 root.
//
// Resizable 12x8 tile canvas. Layout persists in localStorage.
// F1..F12 jumps tile focus, Cmd+K opens palette, click row opens drawer.

import React, { useMemo, useState } from 'react';
import { DensityProvider, useDensity } from '../shared/DensityContext';
import { SAMPLE_CHAIN_DATA, computeStateOfWorld, STATUS_LABEL, TIER_LABEL } from '../shared/SampleChainData';
import '../shared/animations.css';
import { TileGrid } from './TileGrid';
import { CommandPalette, PaletteCommand, useCommandPaletteHotkey } from '../shared/CommandPalette';
import { PrototypeShell, StateStrip } from '../shared/primitives';
import { PulseDrawer } from '../pulse-lens/PulseDrawer';

function CockpitGridBody() {
  const { density, toggle } = useDensity();
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusedTileIdx, setFocusedTileIdx] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);

  useCommandPaletteHotkey(setPaletteOpen);

  const world = useMemo(() => computeStateOfWorld(SAMPLE_CHAIN_DATA), []);

  const selectedRow = useMemo(() => SAMPLE_CHAIN_DATA.find((r) => r.id === selectedRowId) ?? null, [selectedRowId]);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [
      { id: 'density', group: 'View', label: 'Toggle density', shortcut: 'Cmd+Shift+D', run: toggle },
      { id: 'focus-f1', group: 'Focus tile', label: 'Focus tile 1', shortcut: 'F1', run: () => setFocusedTileIdx(0) },
      { id: 'focus-f2', group: 'Focus tile', label: 'Focus tile 2', shortcut: 'F2', run: () => setFocusedTileIdx(1) },
      { id: 'focus-f3', group: 'Focus tile', label: 'Focus tile 3', shortcut: 'F3', run: () => setFocusedTileIdx(2) },
      { id: 'focus-f4', group: 'Focus tile', label: 'Focus tile 4', shortcut: 'F4', run: () => setFocusedTileIdx(3) },
    ];
    for (const r of SAMPLE_CHAIN_DATA) {
      cmds.push({
        id: `open-${r.id}`, group: 'Open connector',
        label: `${r.number} - ${r.substation}`,
        hint: `${STATUS_LABEL[r.status]} - ${TIER_LABEL[r.tier]}`,
        run: () => { setSelectedRowId(r.id); setDrawerOpen(true); },
      });
    }
    return cmds;
  }, [toggle]);

  return (
    <PrototypeShell title="Cockpit Grid" subtitle="Resizable 12-col tile canvas - drop chain tiles in, F1-F12 jumps focus">
      <StateStrip
        world={world}
        density={density}
        onToggleDensity={toggle}
        filterLabel={`${SAMPLE_CHAIN_DATA.length} chains across configurable tiles`}
        rightSlot={
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            <kbd style={tinyKbd}>F1..Fn</kbd> focus tile
            <span style={{ margin: '0 6px' }}>-</span>
            <kbd style={tinyKbd}>drag handle</kbd> move
          </span>
        }
      />

      <div style={{ padding: '20px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <TileGrid
          key={resetCounter}
          selectedRowId={selectedRowId}
          setSelectedRowId={(id) => { setSelectedRowId(id); if (id) setDrawerOpen(true); }}
          focusedTileIdx={focusedTileIdx}
          setFocusedTileIdx={setFocusedTileIdx}
          onResetLayout={() => setResetCounter((c) => c + 1)}
        />

        <div
          style={{
            marginTop: 16,
            padding: '10px 14px',
            background: '#fff',
            border: '1px solid #dde4ec',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 12,
            color: '#525a66',
            flexWrap: 'wrap',
          }}
        >
          <strong style={{ color: '#0f1c2e' }}>Tips:</strong>
          <span>Drag a tile by its top strip.</span>
          <span>Drag the bottom-right corner to resize.</span>
          <span>Tile size adapts (1x1 / 2x2 / 3x3 / 4x4) - more cells = more detail.</span>
          <span>Layout is saved per-browser in <code>localStorage[oe-cockpit-grid-layout]</code>.</span>
        </div>
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

const tinyKbd: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)', color: '#dbe5f0',
  padding: '0 4px', borderRadius: 3,
  fontFamily: 'ui-monospace, monospace', fontSize: 10, marginRight: 2,
  border: '1px solid rgba(255,255,255,0.18)',
};

export default function CockpitGrid() {
  return (
    <DensityProvider>
      <CockpitGridBody />
    </DensityProvider>
  );
}
