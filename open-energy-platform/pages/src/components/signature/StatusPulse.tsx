// StatusPulse — animated dot indicating live/active state. Steady fill
// under prefers-reduced-motion (handled by signature.css).

import React from 'react';

export interface StatusPulseProps {
  tone?: 'live' | 'warn' | 'critical' | 'idle';
  label?: string;
}

export function StatusPulse({ tone = 'live', label }: StatusPulseProps) {
  const color =
    tone === 'critical' ? '#c0392b' : tone === 'warn' ? '#c97a14' : tone === 'idle' ? '#6b7685' : '#1f8a5b';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        className="oe-pulse"
        aria-hidden="true"
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          color,
        }}
      />
      {label ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--role-on-surface-muted)',
          }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
