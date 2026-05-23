// DensityCard — generic card that adapts padding/radius to density mode.
// All other cards (FrostedCard etc.) compose on top of this primitive.

import React from 'react';

export interface DensityCardProps {
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  children: React.ReactNode;
  interactive?: boolean;
}

export function DensityCard({ className, style, onClick, children, interactive }: DensityCardProps) {
  const clickable = interactive || !!onClick;
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: 'var(--role-surface-raised)',
        border: '1px solid var(--role-border)',
        borderRadius: 'var(--oe-radius-card)',
        padding: 'var(--oe-pad-card)',
        cursor: clickable ? 'pointer' : undefined,
        transition: 'border-color 160ms ease-out, box-shadow 160ms ease-out',
        ...style,
      }}
      onMouseEnter={
        clickable
          ? (e) => {
              e.currentTarget.style.borderColor = 'var(--role-accent)';
              e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.10)';
            }
          : undefined
      }
      onMouseLeave={
        clickable
          ? (e) => {
              e.currentTarget.style.borderColor = 'var(--role-border)';
              e.currentTarget.style.boxShadow = 'none';
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
