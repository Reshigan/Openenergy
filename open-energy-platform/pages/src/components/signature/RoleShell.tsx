// RoleShell — sets per-role CSS vars + density mode on a wrapping div.
//
// Every page that opts into the signature design system wraps its content
// in <RoleShell role="trader">. Defaults to cinematic density on launch
// boards; pass density="bloomberg" on the four ops-role workstations.

import React from 'react';
import { themeFor, type Density, type RoleKey } from '../../lib/role-themes';

export interface RoleShellProps {
  role: RoleKey | string;
  density?: Density;
  chrome?: 'dark' | 'light' | 'warm';
  className?: string;
  children: React.ReactNode;
}

export function RoleShell({ role, density, chrome, className, children }: RoleShellProps) {
  const theme = themeFor(role);
  const effectiveDensity: Density = density ?? 'cinematic';
  const effectiveChrome = chrome ?? theme.chrome;
  const style: React.CSSProperties & Record<string, string> = {
    '--role-accent': theme.accent,
    '--role-accent-secondary': theme.accentSecondary ?? theme.accent,
    '--role-accent-soft': theme.accentSoft,
    '--role-haze': theme.haze,
  };
  return (
    <div
      data-role-shell=""
      data-role={theme.key}
      data-density={effectiveDensity}
      data-chrome={effectiveChrome}
      data-display-font={theme.displayFont}
      className={className}
      style={{
        ...style,
        background: 'var(--role-surface)',
        color: 'var(--role-on-surface)',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  );
}
