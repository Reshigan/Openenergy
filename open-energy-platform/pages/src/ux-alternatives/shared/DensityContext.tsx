// DensityContext — adaptive density, persisted in localStorage.
//
// Surfaces every direction with two row-heights (compact 30px, comfortable 44px)
// and the keyboard shortcut Cmd+Shift+D. Also exposes a visible toggle the
// pickers / shells use.
//
// Persisted under localStorage['oe-density']. Defaults to comfortable for
// first-time visitors (more learnable); power users flip to compact.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

export type Density = 'compact' | 'comfortable';

interface DensityCtx {
  density: Density;
  toggle: () => void;
  set: (d: Density) => void;
}

const Ctx = createContext<DensityCtx | null>(null);

const STORAGE_KEY = 'oe-density';

function readInitial(): Density {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'compact' || raw === 'comfortable') return raw;
  } catch {
    // SSR / private mode — fall through.
  }
  return 'comfortable';
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<Density>(readInitial);

  const set = useCallback((d: Density) => {
    setDensity(d);
    try { localStorage.setItem(STORAGE_KEY, d); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback(() => {
    setDensity((cur) => {
      const next: Density = cur === 'compact' ? 'comfortable' : 'compact';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Cmd+Shift+D global shortcut. Mod-Shift-D on macOS, Ctrl-Shift-D on Win.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Reflect density on <html data-density> so global CSS variables resolve
  // even outside the React tree (e.g. portalled drawers).
  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    return () => {
      // Don't unset; next direction reuses the value.
    };
  }, [density]);

  const value = useMemo(() => ({ density, toggle, set }), [density, toggle, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDensity(): DensityCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDensity must be used within DensityProvider');
  return v;
}
