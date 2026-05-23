// FrostedCard — cinematic glass card. Layers a translucent surface over
// the role haze gradient. Only meaningful in cinematic density.

import React from 'react';

export interface FrostedCardProps {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function FrostedCard({ className, style, children }: FrostedCardProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--role-surface-raised) 70%, transparent) 0%, color-mix(in srgb, var(--role-surface-raised) 90%, transparent) 100%)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        border: '1px solid var(--role-border)',
        borderRadius: 'var(--oe-radius-card)',
        padding: 'var(--oe-pad-card)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
