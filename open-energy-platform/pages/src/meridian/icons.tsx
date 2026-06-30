// pages/src/meridian/icons.tsx — custom inline-SVG icon set (no emoji).
// One <Icon name=…/> primitive in the Substation line style (1.6px stroke,
// currentColor, round joins, 24-grid). Journey icon keys (see journeys.ts) +
// the cockpit UI marks (search / start / ai spark / chevron). Abstract-but-
// consistent geometric glyphs — institutional, not pictographic clip-art.
import React from 'react';

const PATHS: Record<string, React.ReactNode> = {
  today:   <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
  finance: <><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></>,
  deliver: <><path d="M12 3 21 8v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5" /><line x1="12" y1="13" x2="12" y2="21" /></>,
  sell:    <><polygon points="13 2 4 14 11 14 10 22 19 10 12 10" /></>,
  comply:  <><path d="M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6z" /><polyline points="9 12 11 14 15 10" /></>,
  operate: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" /></>,
  trade:   <><polyline points="3 17 9 11 13 15 21 6" /><polyline points="15 6 21 6 21 12" /></>,
  risk:    <><path d="M12 3 22 20H2z" /><line x1="12" y1="10" x2="12" y2="15" /><circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" /></>,
  settle:  <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  watch:   <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  license: <><rect x="4" y="4" width="16" height="13" rx="2" /><circle cx="12" cy="10" r="2.4" /><path d="M9 17l-1 4 4-2 4 2-1-4" /></>,
  tariff:  <><line x1="6" y1="4" x2="6" y2="20" /><circle cx="6" cy="9" r="2.4" /><line x1="18" y1="4" x2="18" y2="20" /><circle cx="18" cy="15" r="2.4" /></>,
  deals:   <><path d="M3 12l4-4 4 4-4 4z" /><path d="M13 12l4-4 4 4-4 4z" /></>,
  esg:     <><path d="M12 21c-5-2-8-6-8-11 5 0 8 3 8 8" /><path d="M12 13c0-5 3-8 8-8 0 5-3 9-8 11" /></>,
  reports: <><rect x="5" y="3" width="14" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" /></>,
  insight: <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10c-.7.7-1 1.3-1 2H9c0-.7-.3-1.3-1-2a6 6 0 0 1 4-10z" /></>,
  national:<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  admin:   <><line x1="4" y1="8" x2="20" y2="8" /><circle cx="9" cy="8" r="2.2" /><line x1="4" y1="16" x2="20" y2="16" /><circle cx="15" cy="16" r="2.2" /></>,
  grid:    <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  carbon:  <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5C14 8.6 13 8 12 8c-1.7 0-3 1.3-3 3v2c0 1.7 1.3 3 3 3 1 0 2-.6 2.5-1.5" /></>,
  people:  <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.3" /><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M15.5 19c0-2 1-3.6 3-3.6" /></>,
  more:    <><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  // UI marks
  search:  <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  plus:    <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  spark:   <><path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z" fill="currentColor" stroke="none" /></>,
  chevron: <><polyline points="9 6 15 12 9 18" /></>,
};

export function Icon({ name, size = 18, strokeWidth = 1.6, className, title }: {
  name: string; size?: number; strokeWidth?: number; className?: string; title?: string;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name] ?? PATHS.more}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS);
