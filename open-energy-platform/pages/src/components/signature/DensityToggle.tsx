// DensityToggle — segmented control for cinematic vs bloomberg workstation
// density. Only rendered for cinematic-default roles where power users may
// want a denser view; bloomberg-default roles never see it.

import React from 'react';
import type { Density } from '../../lib/role-themes';

export interface DensityToggleProps {
  density: Density;
  onChange: (next: Density) => void;
  className?: string;
}

const OPTIONS: { value: Density; label: string; hint: string }[] = [
  { value: 'cinematic', label: 'Cinematic', hint: 'Spacious. Defaults.' },
  { value: 'bloomberg', label: 'Dense', hint: 'Bloomberg-style. More on one screen.' },
];

export function DensityToggle({ density, onChange, className }: DensityToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Workstation density"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        background: 'var(--role-surface-raised, rgba(15,28,46,0.06))',
        border: '1px solid var(--role-border, rgba(15,28,46,0.10))',
        borderRadius: 999,
      }}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === density;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              border: 'none',
              background: active ? 'var(--role-accent)' : 'transparent',
              color: active ? '#0a1622' : 'var(--role-on-surface-muted, #6b7685)',
              fontWeight: active ? 600 : 500,
              fontSize: 11,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'background 150ms ease, color 150ms ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
