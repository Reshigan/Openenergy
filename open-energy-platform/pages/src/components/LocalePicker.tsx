// ════════════════════════════════════════════════════════════════════════
// LocalePicker — drops in anywhere; switches between en-ZA / af / zu.
// Selection is persisted in localStorage so the choice survives reloads.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Languages } from 'lucide-react';
import { useLocale, LOCALE_META, Locale } from '../i18n';

export function LocalePicker({ compact }: { compact?: boolean }) {
  const { locale, set, available } = useLocale();
  return (
    <label className="inline-flex items-center gap-1 text-[11px] text-[#6b7685]">
      {!compact && <Languages size={12}/>}
      <select
        aria-label="Language"
        value={locale}
        onChange={(e) => set(e.target.value as Locale)}
        className="h-7 px-1 rounded border border-[#dde4ec] text-[11px] bg-white"
      >
        {available.map((l) => (
          <option key={l} value={l}>
            {LOCALE_META[l]?.native || l}
          </option>
        ))}
      </select>
    </label>
  );
}
