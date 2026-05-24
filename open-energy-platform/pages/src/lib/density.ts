// Per-role density preference, persisted to localStorage.
//
// Cinematic-default roles (lender, IPP, offtaker, carbon, admin, wind) may
// flip their workstation to bloomberg density. Bloomberg-default roles
// (trader, grid, regulator, support) don't get the toggle — they're power
// users by definition and the dense view is the contract.

import { useCallback, useEffect, useState } from 'react';
import type { Density, RoleKey, RoleTheme } from './role-themes';

const STORAGE_KEY = 'oe.density.workstation';

export const TOGGLEABLE_ROLES: ReadonlySet<RoleKey> = new Set<RoleKey>([
  'lender',
  'ipp_developer',
  'offtaker',
  'carbon_fund',
  'admin',
  'wind_operator',
]);

export function canToggleDensity(role: string | undefined | null): boolean {
  if (!role) return false;
  return TOGGLEABLE_ROLES.has(role as RoleKey);
}

function storageKeyFor(role: string): string {
  return `${STORAGE_KEY}.${role}`;
}

function readStored(role: string): Density | null {
  try {
    const raw = localStorage.getItem(storageKeyFor(role));
    if (raw === 'cinematic' || raw === 'bloomberg') return raw;
  } catch {
    // localStorage blocked (private mode, SSR) — fall through.
  }
  return null;
}

function writeStored(role: string, density: Density): void {
  try {
    localStorage.setItem(storageKeyFor(role), density);
  } catch {
    // ignore
  }
}

export interface DensityState {
  density: Density;
  isOverride: boolean;
  canToggle: boolean;
  setDensity: (next: Density) => void;
  toggle: () => void;
}

export function useDensityPreference(theme: RoleTheme): DensityState {
  const base = theme.workstationDensity;
  const canToggle = canToggleDensity(theme.key);

  const [override, setOverride] = useState<Density | null>(() =>
    canToggle ? readStored(theme.key) : null,
  );

  useEffect(() => {
    if (!canToggle) {
      setOverride(null);
      return;
    }
    setOverride(readStored(theme.key));
  }, [theme.key, canToggle]);

  const density: Density = canToggle && override ? override : base;

  const setDensity = useCallback(
    (next: Density) => {
      if (!canToggle) return;
      writeStored(theme.key, next);
      setOverride(next);
    },
    [theme.key, canToggle],
  );

  const toggle = useCallback(() => {
    setDensity(density === 'cinematic' ? 'bloomberg' : 'cinematic');
  }, [density, setDensity]);

  return {
    density,
    isOverride: canToggle && override !== null && override !== base,
    canToggle,
    setDensity,
    toggle,
  };
}
