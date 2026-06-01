// CommandPalette — Cmd+K everywhere.
//
// Emil-Kowalski rule: this is a HIGH-FREQUENCY surface. NO open/close
// animation. Raycast doesn't animate; we don't either. Mount is instant,
// unmount is instant. Hover/select feedback is also instant (no transition).
//
// The palette accepts a list of commands at mount time; each direction
// extends the base actions with its own view-specific shortcuts.
//
// Keyboard:
//   Cmd+K / Ctrl+K   open
//   Esc              close
//   ↑/↓              navigate
//   Enter            run
//   Tab              jump to next group
//
// No filtering library — plain substring filtering keeps the bundle tiny
// and matches Linear/Raycast's "instant response" feel.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface PaletteCommand {
  id: string;
  label: string;
  group?: string;
  shortcut?: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  commands,
  onClose,
  open,
}: {
  commands: PaletteCommand[];
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      (c.group ?? '').toLowerCase().includes(q) ||
      (c.hint ?? '').toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(filtered.length - 1, a + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) {
          cmd.run();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
  }, [open, filtered, active, onClose]);

  // Scroll active row into view.
  useEffect(() => {
    if (!open || !listRef.current) return undefined;
    const el = listRef.current.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: 'nearest' });
    return undefined;
  }, [active, open]);

  if (!open) return null;

  // Group commands by .group for display.
  const groups: Record<string, PaletteCommand[]> = {};
  for (const c of filtered) {
    const g = c.group ?? 'Actions';
    if (!groups[g]) groups[g] = [];
    groups[g].push(c);
  }

  // Flat index for ↑/↓ navigation matches filtered order.
  let flatIdx = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="oe-no-anim"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '14vh',
      }}
    >
      <div onClick={onClose} aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(15,28,46,0.40)' }} />
      <div
        style={{
          position: 'relative',
          width: 560,
          maxWidth: '92vw',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(15,28,46,0.30)',
          overflow: 'hidden',
          border: '1px solid #c5cdd6',
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e3e8ee', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#5fa8e8', fontSize: 12, fontWeight: 700, letterSpacing: 0.4 }}>⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, type to filter…"
            aria-label="Search commands"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 14,
              fontWeight: 500,
              color: '#0f1c2e',
              background: 'transparent',
            }}
          />
          <span style={{ fontSize: 11, color: '#6b7685' }}>{filtered.length}</span>
        </div>
        <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto' }}>
          {Object.keys(groups).length === 0 && (
            <div style={{ padding: 18, color: '#6b7685', fontSize: 13, textAlign: 'center' }}>
              No commands match “{query}”.
            </div>
          )}
          {Object.entries(groups).map(([gName, gCmds]) => (
            <div key={gName}>
              <div
                style={{
                  padding: '8px 14px 4px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: '#6b7685',
                  textTransform: 'uppercase',
                  background: '#f5f8fb',
                }}
              >
                {gName}
              </div>
              {gCmds.map((c) => {
                flatIdx += 1;
                const idx = flatIdx;
                const isActive = idx === active;
                return (
                  <div
                    key={c.id}
                    data-idx={idx}
                    role="button"
                    tabIndex={-1}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => {
                      c.run();
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 14px',
                      gap: 10,
                      background: isActive ? '#e7f0f9' : 'transparent',
                      cursor: 'pointer',
                      borderLeft: isActive ? '2px solid #1a3a5c' : '2px solid transparent',
                    }}
                  >
                    <div style={{ flex: 1, fontSize: 13, color: '#0f1c2e', fontWeight: isActive ? 600 : 500 }}>
                      {c.label}
                      {c.hint ? <span style={{ fontSize: 11, color: '#6b7685', marginLeft: 8 }}>{c.hint}</span> : null}
                    </div>
                    {c.shortcut ? (
                      <span
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 11,
                          color: '#3d4756',
                          background: '#f0f4f9',
                          border: '1px solid #dde4ec',
                          borderRadius: 4,
                          padding: '2px 6px',
                        }}
                      >
                        {c.shortcut}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <footer
          style={{
            borderTop: '1px solid #e3e8ee',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: '#f5f8fb',
            fontSize: 11,
            color: '#525a66',
          }}
        >
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>⏎</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </footer>
      </div>
    </div>
  );
}

/* useCommandPaletteHotkey — convenience hook each direction calls. */
export function useCommandPaletteHotkey(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}
