import React, { useState } from 'react';
import { OeIcon } from '../icons/Icons';

export interface AlertBarItem {
  id: string;
  message: string;
  variant: 'rose' | 'amber' | 'blue';
  href?: string;
  dismissible?: boolean;
}

interface AlertBarProps {
  items: AlertBarItem[];
  style?: React.CSSProperties;
}

export function AlertBar({ items, style }: AlertBarProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);

  const visible = items.filter(i => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  const current = visible[Math.min(activeIndex, visible.length - 1)];

  const variantColors = {
    rose:  { bg: 'var(--oe-rose-bg)',  text: 'var(--oe-rose)',  border: 'rgba(176,41,41,0.15)' },
    amber: { bg: 'var(--oe-amber-bg)', text: 'var(--oe-amber)', border: 'rgba(140,90,9,0.15)' },
    blue:  { bg: 'var(--oe-blue-bg)',  text: 'var(--oe-blue)',  border: 'rgba(21,73,160,0.15)' },
  };
  const c = variantColors[current.variant];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: 'var(--oe-alertbar-h)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 12px',
        background: c.bg,
        borderBottom: `1px solid ${c.border}`,
        zIndex: 'var(--oe-z-alertbar)' as any,
        left: style?.marginLeft ?? 'var(--oe-sidebar-w)',
        ...style,
      }}
    >
      {/* Alert icon */}
      <OeIcon name="alert-triangle" size={13} color={c.text} />

      {/* Message */}
      <span style={{ fontSize: '12px', color: c.text, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {current.href ? (
          <a href={current.href} style={{ color: c.text, textDecoration: 'underline', textDecorationColor: 'transparent' }}
            onMouseEnter={e => ((e.target as HTMLAnchorElement).style.textDecorationColor = c.text)}
            onMouseLeave={e => ((e.target as HTMLAnchorElement).style.textDecorationColor = 'transparent')}
          >
            {current.message}
          </a>
        ) : current.message}
      </span>

      {/* Pagination if multiple */}
      {visible.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={() => setActiveIndex(i => Math.max(0, i - 1))}
            style={navBtnStyle(c.text)}
            disabled={activeIndex === 0}
          >
            <OeIcon name="chevron-left" size={11} />
          </button>
          <span style={{ fontSize: '10px', color: c.text, fontWeight: 600 }}>
            {Math.min(activeIndex, visible.length - 1) + 1} / {visible.length}
          </span>
          <button
            onClick={() => setActiveIndex(i => Math.min(visible.length - 1, i + 1))}
            style={navBtnStyle(c.text)}
            disabled={activeIndex >= visible.length - 1}
          >
            <OeIcon name="chevron-right" size={11} />
          </button>
        </div>
      )}

      {/* Dismiss */}
      {current.dismissible !== false && (
        <button
          onClick={() => {
            setDismissed(prev => new Set([...prev, current.id]));
            setActiveIndex(i => Math.max(0, Math.min(i, visible.length - 2)));
          }}
          style={{ ...navBtnStyle(c.text), flexShrink: 0 }}
          title="Dismiss"
        >
          <OeIcon name="close" size={12} />
        </button>
      )}
    </div>
  );
}

function navBtnStyle(color: string): React.CSSProperties {
  return {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    color,
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
    opacity: 0.7,
  };
}

export default AlertBar;
