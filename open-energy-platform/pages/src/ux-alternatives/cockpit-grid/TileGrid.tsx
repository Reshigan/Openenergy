// TileGrid - hand-rolled 12-column grid. Tile placement persists in
// localStorage. F1..F12 jumps focus.
//
// We use a 12x8 grid. Each tile has {col, row, w, h}. Drag uses
// pointer events (no library). Resize handle on bottom-right corner.
// Springs ONLY for the drop snap (per Emil rule "springs for drag/
// momentum only") - implemented inline with requestAnimationFrame.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChainTile, TileSize, TILE_TEMPLATES } from './ChainTile';

const COLS = 12;
const ROWS = 8;

export interface TilePlacement {
  uid: string;
  templateId: string;  // matches TILE_TEMPLATES.id
  col: number;         // 0..COLS-1
  row: number;
  w: number;           // 1..COLS
  h: number;           // 1..ROWS
}

const STORAGE_KEY = 'oe-cockpit-grid-layout';

const DEFAULT_LAYOUT: TilePlacement[] = [
  { uid: 't-1', templateId: 'breached', col: 0, row: 0, w: 6, h: 4 },
  { uid: 't-2', templateId: 'nersa',    col: 6, row: 0, w: 6, h: 4 },
  { uid: 't-3', templateId: 'backbone', col: 0, row: 4, w: 4, h: 4 },
  { uid: 't-4', templateId: 'all',      col: 4, row: 4, w: 5, h: 4 },
  { uid: 't-5', templateId: 'pilot',    col: 9, row: 4, w: 3, h: 4 },
];

function loadLayout(): TilePlacement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TilePlacement[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_LAYOUT;
}

function saveLayout(l: TilePlacement[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(l)); } catch { /* ignore */ }
}

function sizeFor(p: TilePlacement): TileSize {
  if (p.w >= 8 && p.h >= 5) return '4x4';
  if (p.w >= 5 && p.h >= 4) return '3x3';
  if (p.w >= 3 && p.h >= 3) return '2x2';
  return '1x1';
}

export function TileGrid({
  selectedRowId,
  setSelectedRowId,
  focusedTileIdx,
  setFocusedTileIdx,
  onResetLayout,
}: {
  selectedRowId: string | null;
  setSelectedRowId: (id: string | null) => void;
  focusedTileIdx: number;
  setFocusedTileIdx: (idx: number) => void;
  onResetLayout: () => void;
}) {
  const [tiles, setTiles] = useState<TilePlacement[]>(loadLayout);
  const [dragging, setDragging] = useState<{ uid: string; offsetCol: number; offsetRow: number } | null>(null);
  const [resizing, setResizing] = useState<{ uid: string; startW: number; startH: number; startCol: number; startRow: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { saveLayout(tiles); }, [tiles]);

  // Compute cell pixel size from container.
  const cellSize = useRef<{ w: number; h: number }>({ w: 60, h: 60 });
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      cellSize.current = { w: rect.width / COLS, h: rect.height / ROWS };
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent, uid: string, mode: 'drag' | 'resize') => {
    if (mode === 'drag') {
      const t = tiles.find((x) => x.uid === uid);
      if (!t) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const offsetCol = (e.clientX - rect.left) / cellSize.current.w;
      const offsetRow = (e.clientY - rect.top) / cellSize.current.h;
      setDragging({ uid, offsetCol, offsetRow });
    } else {
      const t = tiles.find((x) => x.uid === uid);
      if (!t) return;
      setResizing({ uid, startW: t.w, startH: t.h, startCol: t.col, startRow: t.row });
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [tiles]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (dragging) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.max(0, Math.min(COLS - 1, Math.round(x / cellSize.current.w - dragging.offsetCol)));
      const row = Math.max(0, Math.min(ROWS - 1, Math.round(y / cellSize.current.h - dragging.offsetRow)));
      setTiles((cur) => cur.map((t) => {
        if (t.uid !== dragging.uid) return t;
        const clampedCol = Math.min(col, COLS - t.w);
        const clampedRow = Math.min(row, ROWS - t.h);
        return { ...t, col: clampedCol, row: clampedRow };
      }));
    } else if (resizing) {
      const t = tiles.find((x) => x.uid === resizing.uid);
      if (!t) return;
      const wCells = Math.max(2, Math.round((e.clientX - rect.left) / cellSize.current.w - t.col));
      const hCells = Math.max(2, Math.round((e.clientY - rect.top) / cellSize.current.h - t.row));
      const w = Math.min(COLS - t.col, wCells);
      const h = Math.min(ROWS - t.row, hCells);
      setTiles((cur) => cur.map((x) => x.uid === resizing.uid ? { ...x, w, h } : x));
    }
  }, [dragging, resizing, tiles]);

  const onPointerUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  const reset = useCallback(() => {
    setTiles(DEFAULT_LAYOUT);
  }, []);

  // F1..F12 focus tile by 1-based index
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      const m = /^F(\d+)$/.exec(e.key);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        if (idx >= 0 && idx < tiles.length) {
          e.preventDefault();
          setFocusedTileIdx(idx);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tiles.length, setFocusedTileIdx]);

  const addTile = useCallback((templateId: string) => {
    setTiles((cur) => {
      // Find first free spot.
      const occupied = new Set<string>();
      for (const t of cur) {
        for (let c = t.col; c < t.col + t.w; c += 1) {
          for (let r = t.row; r < t.row + t.h; r += 1) {
            occupied.add(`${c}-${r}`);
          }
        }
      }
      let placed = false;
      let col = 0, row = 0;
      outer: for (let r = 0; r <= ROWS - 3; r += 1) {
        for (let c = 0; c <= COLS - 3; c += 1) {
          let ok = true;
          for (let dc = 0; dc < 3 && ok; dc += 1) {
            for (let dr = 0; dr < 3 && ok; dr += 1) {
              if (occupied.has(`${c + dc}-${r + dr}`)) ok = false;
            }
          }
          if (ok) { col = c; row = r; placed = true; break outer; }
        }
      }
      if (!placed) return cur; // grid full
      const newTile: TilePlacement = {
        uid: 't-' + Date.now(),
        templateId,
        col, row, w: 3, h: 3,
      };
      return [...cur, newTile];
    });
  }, []);

  const removeTile = useCallback((uid: string) => {
    setTiles((cur) => cur.filter((t) => t.uid !== uid));
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#525a66', fontWeight: 600 }}>Add tile:</span>
        {TILE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="oe-btn"
            onClick={() => addTile(t.id)}
            style={{
              padding: '4px 10px', fontSize: 11.5, borderRadius: 6,
              border: '1px solid #c5cdd6', background: '#fff', color: '#1a3a5c', cursor: 'pointer', fontWeight: 600,
            }}
          >
            + {t.title}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="oe-btn"
          onClick={() => { reset(); onResetLayout(); }}
          style={{
            padding: '4px 10px', fontSize: 11.5, borderRadius: 6,
            border: '1px solid #c5cdd6', background: '#fff', color: '#525a66', cursor: 'pointer', fontWeight: 600,
          }}
        >
          Reset layout
        </button>
      </div>

      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'relative',
          width: '100%',
          height: 620,
          background:
            'linear-gradient(to right, rgba(95,168,232,0.06) 1px, transparent 1px) 0 0 / calc(100%/12) 100%,' +
            'linear-gradient(to bottom, rgba(95,168,232,0.06) 1px, transparent 1px) 0 0 / 100% calc(100%/8),' +
            '#f5f8fb',
          borderRadius: 12,
          border: '1px solid #dde4ec',
          overflow: 'hidden',
        }}
      >
        {tiles.map((t, idx) => {
          const spec = TILE_TEMPLATES.find((x) => x.id === t.templateId);
          if (!spec) return null;
          const focused = idx === focusedTileIdx;
          return (
            <div
              key={t.uid}
              tabIndex={0}
              onFocus={() => setFocusedTileIdx(idx)}
              style={{
                position: 'absolute',
                left: `${(t.col / COLS) * 100}%`,
                top: `${(t.row / ROWS) * 100}%`,
                width: `${(t.w / COLS) * 100}%`,
                height: `${(t.h / ROWS) * 100}%`,
                padding: 6,
                boxSizing: 'border-box',
                touchAction: 'none',
                outline: 'none',
              }}
              onPointerDown={(e) => {
                const trg = e.target as HTMLElement;
                if (trg.closest('[data-drag-handle]')) {
                  onPointerDown(e, t.uid, 'drag');
                } else if (trg.closest('[data-resize-handle]')) {
                  onPointerDown(e, t.uid, 'resize');
                }
              }}
            >
              <div style={{ position: 'relative', height: '100%' }}>
                <div
                  data-drag-handle="true"
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, height: 30,
                    cursor: 'move',
                    zIndex: 2,
                  }}
                  aria-hidden="true"
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 4, right: 4, zIndex: 3,
                    fontSize: 10,
                    color: focused ? '#fff' : '#3d4756',
                    background: focused ? '#1a3a5c' : '#fff',
                    border: '1px solid ' + (focused ? '#1a3a5c' : '#dde4ec'),
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontFamily: 'ui-monospace, monospace',
                    fontWeight: 700,
                  }}
                >
                  F{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeTile(t.uid)}
                  aria-label="Remove tile"
                  className="oe-btn"
                  style={{
                    position: 'absolute',
                    top: 4, right: 40, zIndex: 3,
                    width: 18, height: 18, padding: 0,
                    background: 'transparent', color: '#6b7685', border: '1px solid #dde4ec', borderRadius: 4,
                    cursor: 'pointer', fontSize: 11, fontWeight: 700, lineHeight: 1,
                  }}
                >x</button>
                <ChainTile
                  spec={spec}
                  size={sizeFor(t)}
                  selectedId={selectedRowId}
                  onSelect={setSelectedRowId}
                  focused={focused}
                />
                <div
                  data-resize-handle="true"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    right: 2, bottom: 2,
                    width: 14, height: 14,
                    cursor: 'nwse-resize',
                    background: 'linear-gradient(135deg, transparent 50%, #c5cdd6 50%)',
                    zIndex: 3,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
