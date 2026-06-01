import React, { useState, useEffect, useRef, useMemo } from 'react';
import { OeIcon } from '../icons/Icons';
import type { NavConfig, NavItem } from './AppShell';

interface CommandPaletteProps {
  navConfig: NavConfig;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  section: string;
  href: string;
  icon?: string;
}

export function CommandPalette({ navConfig, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allItems: PaletteItem[] = useMemo(() =>
    navConfig.sections.flatMap(s =>
      s.items.map(i => ({ id: i.id, label: i.label, section: s.label, href: i.href, icon: i.icon }))
    ),
    [navConfig]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(i =>
      i.label.toLowerCase().includes(q) || i.section.toLowerCase().includes(q)
    );
  }, [query, allItems]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter') {
        const item = filtered[selectedIndex];
        if (item) { window.location.href = item.href; onClose(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [filtered, selectedIndex, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(7,24,46,0.4)',
          zIndex: 'calc(var(--oe-z-palette) - 1)' as any,
          backdropFilter: 'blur(4px)',
          animation: 'oe-fadeIn 120ms var(--oe-ease)',
        }}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-label="Command palette"
        style={{
          position: 'fixed',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(560px, calc(100vw - 32px))',
          background: 'var(--oe-canvas)',
          borderRadius: 'var(--oe-r-shell)',
          boxShadow: 'var(--oe-shadow-palette)',
          border: '1px solid var(--oe-border)',
          zIndex: 'var(--oe-z-palette)' as any,
          overflow: 'hidden',
          animation: 'oe-slideDown 120ms var(--oe-ease)',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--oe-border-2)',
          }}
        >
          <OeIcon name="search" size={16} color="var(--oe-text-3)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages, features, actions…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              color: 'var(--oe-text-1)',
              background: 'transparent',
              fontFamily: 'inherit',
            }}
          />
          <kbd
            style={{
              background: 'var(--oe-surf)',
              border: '1px solid var(--oe-border)',
              borderRadius: '4px',
              padding: '1px 6px',
              fontSize: '11px',
              color: 'var(--oe-text-3)',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{ maxHeight: '360px', overflowY: 'auto', padding: '6px 0' }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--oe-text-3)', fontSize: '13px' }}>
              No results for "{query}"
            </div>
          ) : (
            filtered.map((item, index) => (
              <a
                key={item.id}
                data-index={index}
                href={item.href}
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 16px',
                  textDecoration: 'none',
                  background: index === selectedIndex ? 'var(--oe-surf)' : 'transparent',
                  borderRadius: '0',
                  transition: 'background 60ms',
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {item.icon ? (
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '7px',
                      background: index === selectedIndex ? 'var(--oe-grad-active)' : 'var(--oe-surf-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'background 60ms',
                    }}
                  >
                    <svg width="14" height="14" fill="none" style={{ color: index === selectedIndex ? '#fff' : 'var(--oe-text-2)' }}>
                      <use href={`#oe-ic-${item.icon}`} />
                    </svg>
                  </span>
                ) : (
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '7px',
                      background: index === selectedIndex ? 'var(--oe-grad-active)' : 'var(--oe-surf-2)',
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--oe-text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Highlight text={item.label} query={query} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--oe-text-3)', marginTop: '1px' }}>
                    {item.section}
                  </div>
                </div>
                {index === selectedIndex && (
                  <kbd style={{ background: 'var(--oe-surf-2)', border: '1px solid var(--oe-border)', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', color: 'var(--oe-text-3)', fontFamily: 'inherit', flexShrink: 0 }}>
                    ↵
                  </kbd>
                )}
              </a>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            borderTop: '1px solid var(--oe-border-2)',
            padding: '8px 16px',
            display: 'flex',
            gap: '16px',
            alignItems: 'center',
          }}
        >
          {[['↑↓', 'Navigate'], ['↵', 'Open'], ['esc', 'Close']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={{ background: 'var(--oe-surf)', border: '1px solid var(--oe-border)', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', color: 'var(--oe-text-3)', fontFamily: 'inherit' }}>
                {key}
              </kbd>
              <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes oe-fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes oe-slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.97); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
      `}</style>
    </>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--oe-blue-bg)', color: 'var(--oe-blue)', borderRadius: '2px', padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default CommandPalette;
