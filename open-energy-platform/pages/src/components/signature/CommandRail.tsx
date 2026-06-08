// CommandRail — sticky hotkey-driven action rail for Bloomberg-density
// workstations. Each item shows label + shortcut hint. Used by trader,
// grid, regulator, support workstations.

import React, { useEffect } from 'react';

export interface CommandItem {
  key: string;
  label: string;
  shortcut?: string;
  onTrigger: () => void;
  tone?: 'default' | 'danger';
}

export interface CommandRailProps {
  items: CommandItem[];
  ariaLabel?: string;
}

export function CommandRail({ items, ariaLabel = 'Command rail' }: CommandRailProps) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const pressed: string[] = [];
      if (e.altKey) pressed.push('alt');
      if (e.shiftKey) pressed.push('shift');
      if (e.ctrlKey) pressed.push('ctrl');
      pressed.push(e.key.toLowerCase());
      const combo = pressed.join('+');
      const match = items.find((i) => i.shortcut?.toLowerCase() === combo);
      if (match) {
        e.preventDefault();
        match.onTrigger();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items]);
  return (
    <nav
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        background: 'var(--role-surface-raised)',
        borderBottom: '1px solid var(--role-border)',
        fontFamily: 'var(--oe-num-font)',
        fontSize: 12,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {items.map((item) => (
        <button type="button"
          key={item.key}
          onClick={item.onTrigger}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 4,
            color: item.tone === 'danger' ? '#e57162' : 'var(--role-on-surface)',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            cursor: 'pointer',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--role-accent-soft)';
            e.currentTarget.style.borderColor = 'var(--role-accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          <span>{item.label}</span>
          {item.shortcut ? (
            <span
              style={{
                color: 'var(--role-on-surface-muted)',
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 3,
                background: 'rgba(0,0,0,0.08)',
              }}
            >
              {item.shortcut.toUpperCase()}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
