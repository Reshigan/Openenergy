// ════════════════════════════════════════════════════════════════════════
// i18n — tiny, dependency-free locale store.
//
// Three locales seeded: en-ZA (default), af, zu. Strings live in JSON
// dictionaries beside this file. Missing keys fall back to en-ZA and
// then to the key itself, so an untranslated string is visible as
// "common.save" rather than a blank.
//
// Usage:
//   const t = useT();
//   <button>{t('common.save')}</button>
//
// Switch locale:
//   useLocale().set('af')
// ════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import enZA from './dict-en-ZA.json';
import af from './dict-af.json';
import zu from './dict-zu.json';

export type Locale = 'en-ZA' | 'af' | 'zu';

const DICT: Record<Locale, Record<string, string>> = {
  'en-ZA': enZA as unknown as Record<string, string>,
  'af': af as unknown as Record<string, string>,
  'zu': zu as unknown as Record<string, string>,
};

const LS_KEY = 'oe.locale';

function getInitial(): Locale {
  if (typeof window === 'undefined') return 'en-ZA';
  const stored = window.localStorage.getItem(LS_KEY) as Locale | null;
  if (stored && DICT[stored]) return stored;
  const nav = navigator.language || 'en-ZA';
  if (nav.startsWith('af')) return 'af';
  if (nav.startsWith('zu')) return 'zu';
  return 'en-ZA';
}

// Simple subscriber list — components re-render when locale flips.
const listeners = new Set<(loc: Locale) => void>();
let current: Locale = getInitial();

export function setLocale(loc: Locale) {
  if (!DICT[loc] || current === loc) return;
  current = loc;
  if (typeof window !== 'undefined') window.localStorage.setItem(LS_KEY, loc);
  document.documentElement.setAttribute('lang', loc);
  listeners.forEach((cb) => cb(loc));
}

export function getLocale(): Locale {
  return current;
}

export function t(key: string, locale?: Locale): string {
  const loc = locale || current;
  return DICT[loc]?.[key] ?? DICT['en-ZA']?.[key] ?? key;
}

export function useLocale() {
  const [loc, setLoc] = useState<Locale>(current);
  useEffect(() => {
    const cb = (l: Locale) => setLoc(l);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);
  const set = useCallback((l: Locale) => setLocale(l), []);
  return { locale: loc, set, available: Object.keys(DICT) as Locale[] };
}

export function useT() {
  const { locale } = useLocale();
  return useCallback((key: string) => t(key, locale), [locale]);
}

export const LOCALE_META: Record<Locale, { label: string; native: string }> = {
  'en-ZA': { label: 'English (SA)', native: 'English' },
  'af':    { label: 'Afrikaans',    native: 'Afrikaans' },
  'zu':    { label: 'isiZulu',      native: 'isiZulu' },
};
