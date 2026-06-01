// TimeAxis — Direction 2 root.
//
// Time is the primary x-axis. Every chain SLA is a horizontal bar across
// a 7d / 30d / 90d horizon. The vertical "now" line is the cursor.
//
// Keyboard:
//   ↑/↓     navigate rows
//   ←/→     shift horizon left/right by one day
//   1/2/3   horizon 7d / 30d / 90d
//   T       toggle into table view
//   ⌘K      command palette
//   ⏎       open drawer for selected
//   esc     close drawer
//   ⌘⇧D     toggle density

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DensityProvider, useDensity } from '../shared/DensityContext';
import { SAMPLE_CHAIN_DATA, ChainRow, computeStateOfWorld, STATUS_LABEL, TIER_LABEL, slaColor, healthColor } from '../shared/SampleChainData';
import '../shared/animations.css';
import { HorizonStrip, Horizon } from './HorizonStrip';
import { PulseDrawer } from '../pulse-lens/PulseDrawer';
import { CommandPalette, PaletteCommand, useCommandPaletteHotkey } from '../shared/CommandPalette';
import { PrototypeShell, StateStrip } from '../shared/primitives';

const NOW_MS = new Date('2026-05-31T14:30:00Z').getTime();

type Filter = 'all' | 'breached' | 'imminent' | 'regulator';

function TimeAxisBody() {
  const { density, toggle } = useDensity();
  const [horizon, setHorizon] = useState<Horizon>('30d');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'horizon' | 'table'>('horizon');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useCommandPaletteHotkey(setPaletteOpen);

  const filtered = useMemo<ChainRow[]>(() => {
    let rows = SAMPLE_CHAIN_DATA;
    switch (filter) {
      case 'breached':  rows = rows.filter((r) => r.sla_breached); break;
      case 'imminent':  rows = rows.filter((r) => !r.sla_breached && r.sla_pct_remaining < 25 && r.sla_target_hours > 0); break;
      case 'regulator': rows = rows.filter((r) => r.regulator_relevant); break;
    }
    // Sort: breach first, then by deadline asc — leftmost = most urgent.
    return [...rows].sort((a, b) => {
      if (a.sla_breached !== b.sla_breached) return a.sla_breached ? -1 : 1;
      const ad = a.sla_deadline_at ? new Date(a.sla_deadline_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.sla_deadline_at ? new Date(b.sla_deadline_at).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
  }, [filter]);

  const world = useMemo(() => computeStateOfWorld(SAMPLE_CHAIN_DATA), []);

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

      const idx = filtered.findIndex((r) => r.id === selectedId);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = filtered[Math.min(filtered.length - 1, idx + 1)];
        if (next) setSelectedId(next.id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = filtered[Math.max(0, idx - 1)];
        if (prev) setSelectedId(prev.id);
      } else if (e.key === 'Enter') {
        if (selectedId) { e.preventDefault(); setDrawerOpen(true); }
      } else if (e.key === '1') { setHorizon('7d'); }
      else if (e.key === '2') { setHorizon('30d'); }
      else if (e.key === '3') { setHorizon('90d'); }
      else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setView((v) => v === 'horizon' ? 'table' : 'horizon');
      } else if (e.key === 'F1') { e.preventDefault(); setFilter('all'); }
      else if (e.key === 'F2') { e.preventDefault(); setFilter('breached'); }
      else if (e.key === 'F3') { e.preventDefault(); setFilter('imminent'); }
      else if (e.key === 'F4') { e.preventDefault(); setFilter('regulator'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, selectedId]);

  const selectedRow = useMemo(() => SAMPLE_CHAIN_DATA.find((r) => r.id === selectedId) ?? null, [selectedId]);

  const onBarSelect = useCallback((id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  }, []);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [
      { id: 'horizon-7d',  group: 'Horizon', label: '7-day horizon',  shortcut: '1', run: () => setHorizon('7d') },
      { id: 'horizon-30d', group: 'Horizon', label: '30-day horizon', shortcut: '2', run: () => setHorizon('30d') },
      { id: 'horizon-90d', group: 'Horizon', label: '90-day horizon', shortcut: '3', run: () => setHorizon('90d') },
      { id: 'view-horizon', group: 'View', label: 'Switch to horizon', shortcut: 'T', run: () => setView('horizon') },
      { id: 'view-table',   group: 'View', label: 'Switch to table',   shortcut: 'T', run: () => setView('table') },
      { id: 'filter-all',       group: 'Filter', label: 'Show all',           shortcut: 'F1', run: () => setFilter('all') },
      { id: 'filter-breached',  group: 'Filter', label: 'Show breached',      shortcut: 'F2', run: () => setFilter('breached') },
      { id: 'filter-imminent',  group: 'Filter', label: 'Show imminent',      shortcut: 'F3', run: () => setFilter('imminent') },
      { id: 'filter-regulator', group: 'Filter', label: 'Show NERSA-flagged', shortcut: 'F4', run: () => setFilter('regulator') },
      { id: 'density', group: 'View', label: 'Toggle density', shortcut: '⌘⇧D', run: toggle },
    ];
    for (const r of SAMPLE_CHAIN_DATA) {
      cmds.push({
        id: `open-${r.id}`,
        group: 'Open connector',
        label: `${r.number} — ${r.substation}`,
        hint: `${STATUS_LABEL[r.status]} · ${TIER_LABEL[r.tier]}`,
        run: () => { setSelectedId(r.id); setDrawerOpen(true); },
      });
    }
    return cmds;
  }, [toggle]);

  return (
    <PrototypeShell title="Time Axis" subtitle="Horizon-as-x-axis · 7d / 30d / 90d SLA bars">
      <StateStrip
        world={world}
        density={density}
        onToggleDensity={toggle}
        filterLabel={`${filter} · ${filtered.length} bars on ${horizon} horizon`}
        rightSlot={
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            <kbd style={tinyKbd}>1</kbd><kbd style={tinyKbd}>2</kbd><kbd style={tinyKbd}>3</kbd> horizon
            <span style={{ margin: '0 6px' }}>·</span>
            <kbd style={tinyKbd}>T</kbd> table
          </span>
        }
      />

      <div style={{ padding: '24px 36px', maxWidth: 1280, margin: '0 auto' }}>
        {view === 'horizon' ? (
          <HorizonStrip
            horizon={horizon}
            setHorizon={setHorizon}
            rows={filtered}
            selectedId={selectedId}
            onSelect={onBarSelect}
            nowMs={NOW_MS}
          />
        ) : (
          <TableView
            rows={filtered}
            selectedId={selectedId}
            onSelect={(id) => { setSelectedId(id); setDrawerOpen(true); }}
          />
        )}

        {selectedRow && (
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
            <span style={{ fontWeight: 700 }}>{selectedRow.number}</span>
            <span style={{ color: '#3d4756' }}>{selectedRow.substation}</span>
            <span style={{ color: healthColor(selectedRow.health), fontWeight: 600 }}>{STATUS_LABEL[selectedRow.status]}</span>
            <span style={{ color: slaColor(selectedRow.sla_pct_remaining), fontWeight: 700 }} className="oe-num">
              {selectedRow.sla_target_hours > 0 ? (selectedRow.sla_breached ? 'BREACHED' : selectedRow.sla_pct_remaining + '%') : '—'}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ color: '#6b7685', fontSize: 11 }}>Hit <kbd style={hintKbd}>⏎</kbd> for drawer</span>
          </div>
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

const tinyKbd: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)', color: '#dbe5f0',
  padding: '0 4px', borderRadius: 3,
  fontFamily: 'ui-monospace, monospace', fontSize: 10, marginRight: 2,
  border: '1px solid rgba(255,255,255,0.18)',
};
const hintKbd: React.CSSProperties = {
  background: '#fff', border: '1px solid #c5cdd6', padding: '1px 5px', borderRadius: 4,
  fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
};

function TableView({ rows, selectedId, onSelect }: { rows: ChainRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #dde4ec', borderRadius: 8, overflow: 'hidden' }}>
      <div className="oe-sticky-head" style={{ display: 'grid', gridTemplateColumns: '100px 1fr 110px 100px 110px 80px 100px 110px', padding: '8px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: '#525a66' }}>
        <span>Number</span><span>Substation</span><span>Status</span><span>Tier</span><span style={{ textAlign: 'right' }}>Deadline</span><span style={{ textAlign: 'right' }}>SLA%</span><span style={{ textAlign: 'right' }}>Cert (d)</span><span style={{ textAlign: 'right' }}>Cap MVA</span>
      </div>
      <div style={{ maxHeight: 540, overflow: 'auto' }}>
        {rows.map((r) => (
          <div
            key={r.id}
            className="oe-row"
            data-selected={r.id === selectedId}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(r.id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 110px 100px 110px 80px 100px 110px',
              alignItems: 'center',
              borderTop: '1px solid #eef2f6',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#1a3a5c' }}>{r.number}</span>
            <span>{r.substation}</span>
            <span style={{ color: healthColor(r.health), fontWeight: 600 }}>{STATUS_LABEL[r.status]}</span>
            <span>{TIER_LABEL[r.tier]}</span>
            <span className="oe-num" style={{ fontSize: 11 }}>{r.sla_deadline_at?.slice(0, 10) ?? '—'}</span>
            <span className="oe-num" style={{ color: slaColor(r.sla_pct_remaining), fontWeight: 700 }}>{r.sla_target_hours > 0 ? (r.sla_breached ? 'BRCH' : r.sla_pct_remaining + '%') : '—'}</span>
            <span className="oe-num" style={{ color: r.days_to_cert_renewal < 30 ? '#c0392b' : r.days_to_cert_renewal < 90 ? '#d97706' : '#0e6d68', fontWeight: 600 }}>{r.days_to_cert_renewal}</span>
            <span className="oe-num">{r.capacity_mva}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TimeAxis() {
  return (
    <DensityProvider>
      <TimeAxisBody />
    </DensityProvider>
  );
}
