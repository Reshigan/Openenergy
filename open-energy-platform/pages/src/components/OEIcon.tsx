import React from 'react';

/* ════════════════════════════════════════════════════════════════════════
 * OE Icon System — custom SVG icon set built from the Open Energy brand
 *
 * Every icon is a hand-drawn SVG using the same geometric language as the
 * OE three-ring logomark: 2px stroke, round line caps, Navy/Blue/Teal/Sky
 * accent palette. No external icon library and no AI-generated marks.
 *
 * Use:
 *   <OEIcon name="bolt" size={20} />
 *   <OEIcon name="leaf" size={24} tone="teal" />
 *   <OEIcon name="grid" filled />
 *
 * Adding a new icon: add the case to the switch below. Keep the 24×24
 * viewBox, use currentColor for monochrome marks, and the OE palette for
 * accents.
 * ═══════════════════════════════════════════════════════════════════════ */

export type IconName =
  // Navigation & shell
  | 'dashboard' | 'menu' | 'search' | 'bell' | 'help' | 'user' | 'logout'
  | 'settings' | 'shield' | 'refresh' | 'plus' | 'chevron-right' | 'chevron-left'
  | 'chevron-down' | 'chevron-up' | 'close' | 'external' | 'download' | 'upload'
  | 'check' | 'check-circle' | 'alert' | 'info' | 'flag' | 'clock' | 'calendar'
  | 'edit' | 'trash'
  // Commerce
  | 'doc' | 'doc-stack' | 'contract' | 'loi' | 'cart' | 'store' | 'tag'
  | 'receipt' | 'invoice' | 'currency-zar' | 'wallet' | 'piggy-bank'
  // Trading + risk
  | 'trending-up' | 'trending-down' | 'trending-flat' | 'chart-bar'
  | 'chart-line' | 'gauge' | 'target' | 'scale' | 'cpu' | 'brain' | 'activity'
  // Operations / projects
  | 'building' | 'flow' | 'wrench' | 'factory' | 'spark' | 'workflow'
  | 'connection'
  // Energy domain
  | 'bolt' | 'sun' | 'wind' | 'leaf' | 'eco' | 'battery' | 'flame' | 'globe'
  | 'gridmap'
  // People & roles
  | 'people' | 'team' | 'badge'
  // Insights & data
  | 'insights' | 'briefing' | 'report' | 'database' | 'layers'
  // OE brand mark
  | 'oe-mark';

export interface OEIconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Stroke colour override; defaults to currentColor (inherits text colour). */
  tone?: 'navy' | 'blue' | 'teal' | 'sky' | 'amber' | 'red' | 'green' | 'muted';
  /** Filled vs outline variant (only some icons support fill). */
  filled?: boolean;
  /** Decorative — for inline glyphs that don't convey meaning. */
  ariaLabel?: string;
}

const TONES: Record<string, string> = {
  navy: '#1a3a5c',
  blue: '#3b82c4',
  teal: '#1f9b95',
  sky: '#5fa8e8',
  amber: '#c97a14',
  red: '#c0392b',
  green: '#1a8a5b',
  muted: '#6b7685',
};

export function OEIcon({ name, size = 20, className = '', tone, filled, ariaLabel }: OEIconProps) {
  const colour = tone ? TONES[tone] : 'currentColor';
  const fillCol = filled ? colour : 'none';
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: colour,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    role: ariaLabel ? 'img' : 'presentation' as 'img' | 'presentation',
    'aria-label': ariaLabel,
    'aria-hidden': ariaLabel ? undefined : true,
    className,
    xmlns: 'http://www.w3.org/2000/svg',
  };

  switch (name) {
    // ──────────── Navigation & shell ────────────
    case 'dashboard': return (
      <svg {...props}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" fill={filled ? colour : 'none'} fillOpacity={filled ? 0.15 : 1} />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" fill={filled ? colour : 'none'} fillOpacity={filled ? 0.15 : 1} />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    );
    case 'menu': return (
      <svg {...props}>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
    case 'search': return (
      <svg {...props}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M21 21l-4.5-4.5" />
      </svg>
    );
    case 'bell': return (
      <svg {...props}>
        <path d="M6 8a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M10 18a2 2 0 004 0" />
      </svg>
    );
    case 'help': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M9.5 9a2.5 2.5 0 015 0c0 1.2-1 1.6-1.7 2-.7.4-1.3.8-1.3 1.8" />
        <circle cx="12" cy="17" r="0.5" fill={colour} />
      </svg>
    );
    case 'user': return (
      <svg {...props}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20c0-3.5 3.4-6 7.5-6s7.5 2.5 7.5 6" />
      </svg>
    );
    case 'logout': return (
      <svg {...props}>
        <path d="M14 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" />
        <path d="M9 16l-4-4 4-4M5 12h11" />
      </svg>
    );
    case 'settings': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="2.8" />
        <path d="M12 1.5l1.4 2.7 3 .4 1 2.8 2.7 1.3-.3 3 1.9 2.4-1.9 2.4.3 3-2.7 1.3-1 2.8-3 .4L12 22.5l-1.4-2.7-3-.4-1-2.8-2.7-1.3.3-3L2.3 9.9l1.9-2.4-.3-3 2.7-1.3 1-2.8 3-.4L12 1.5z" />
      </svg>
    );
    case 'shield': return (
      <svg {...props}>
        <path d="M12 2.5l8 3.5v5c0 5-3.4 9.5-8 11-4.6-1.5-8-6-8-11v-5l8-3.5z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M8.5 12l2.5 2.5L16 9.5" />
      </svg>
    );
    case 'refresh': return (
      <svg {...props}>
        <path d="M20 11a8 8 0 10-2.3 5.7" />
        <path d="M20 4v6h-6" />
      </svg>
    );
    case 'plus': return (
      <svg {...props}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
    case 'chevron-right': return <svg {...props}><path d="M9 5l7 7-7 7" /></svg>;
    case 'chevron-left':  return <svg {...props}><path d="M15 5l-7 7 7 7" /></svg>;
    case 'chevron-down':  return <svg {...props}><path d="M5 9l7 7 7-7" /></svg>;
    case 'chevron-up':    return <svg {...props}><path d="M5 15l7-7 7 7" /></svg>;
    case 'close':         return <svg {...props}><path d="M6 6l12 12M18 6l-12 12" /></svg>;
    case 'external': return (
      <svg {...props}>
        <path d="M14 4h6v6" />
        <path d="M20 4L10 14" />
        <path d="M20 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h5" />
      </svg>
    );
    case 'download': return (
      <svg {...props}>
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 19h14" />
      </svg>
    );
    case 'upload': return (
      <svg {...props}>
        <path d="M12 21V9" />
        <path d="M7 14l5-5 5 5" />
        <path d="M5 5h14" />
      </svg>
    );
    case 'check': return <svg {...props}><path d="M5 12l5 5L20 6" /></svg>;
    case 'check-circle': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9.5" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M8 12l3 3 5-6" />
      </svg>
    );
    case 'alert': return (
      <svg {...props}>
        <path d="M12 3l10 17H2L12 3z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M12 10v4" />
        <circle cx="12" cy="17" r="0.5" fill={colour} />
      </svg>
    );
    case 'info': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9.5" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M12 11v6" />
        <circle cx="12" cy="8" r="0.6" fill={colour} />
      </svg>
    );
    case 'flag': return (
      <svg {...props}>
        <path d="M5 21V4" />
        <path d="M5 4h11l-2 4 2 4H5" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
      </svg>
    );
    case 'clock': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
    case 'calendar': return (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    );
    case 'edit': return (
      <svg {...props}>
        <path d="M4 20h4l11-11-4-4L4 16v4z" />
        <path d="M14 6l4 4" />
      </svg>
    );
    case 'trash': return (
      <svg {...props}>
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" />
      </svg>
    );

    // ──────────── Commerce ────────────
    case 'doc': return (
      <svg {...props}>
        <path d="M6 3h9l4 4v14H6V3z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M15 3v4h4" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    );
    case 'doc-stack': return (
      <svg {...props}>
        <path d="M8 5h8l3 3v12H8V5z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M16 5v3h3" />
        <path d="M5 8v12h11" />
      </svg>
    );
    case 'contract': return (
      <svg {...props}>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </svg>
    );
    case 'loi': return (
      <svg {...props}>
        <path d="M4 6l8 5 8-5" />
        <rect x="4" y="6" width="16" height="12" rx="1.5" />
        <path d="M9 14l3 2 3-2" />
      </svg>
    );
    case 'cart': return (
      <svg {...props}>
        <path d="M3 4h2l3 12h11l2-9H7" />
        <circle cx="9" cy="20" r="1.2" />
        <circle cx="18" cy="20" r="1.2" />
      </svg>
    );
    case 'store': return (
      <svg {...props}>
        <path d="M4 8l2-4h12l2 4v2a2 2 0 11-4 0 2 2 0 11-4 0 2 2 0 11-4 0 2 2 0 11-4 0V8z" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-5h4v5" />
      </svg>
    );
    case 'tag': return (
      <svg {...props}>
        <path d="M3 11V5a2 2 0 012-2h6l10 10-8 8L3 11z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <circle cx="8" cy="8" r="1.2" fill={colour} />
      </svg>
    );
    case 'receipt': return (
      <svg {...props}>
        <path d="M5 3h14v18l-2-1.5L15 21l-2-1.5L11 21 9 19.5 7 21l-2-1.5V3z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
    case 'invoice': return (
      <svg {...props}>
        <path d="M5 3h11l3 3v15H5V3z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M16 3v3h3" />
        <path d="M9 11h6M9 14h6M9 17h3" />
      </svg>
    );
    case 'currency-zar': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M7 7l4 5L7 17M11 12l3 4M14 7v10" />
      </svg>
    );
    case 'wallet': return (
      <svg {...props}>
        <path d="M3 8a3 3 0 013-3h12a3 3 0 013 3v9a3 3 0 01-3 3H6a3 3 0 01-3-3V8z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M15 12.5h4.5" />
        <circle cx="17.5" cy="12.5" r="0.5" fill={colour} />
      </svg>
    );
    case 'piggy-bank': return (
      <svg {...props}>
        <path d="M3 13c0-4 4-7 9-7s9 3 9 7-4 7-9 7c-1.4 0-2.6-.2-3.7-.6L5 21l1-3.5C4.2 16.3 3 14.7 3 13z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <circle cx="16" cy="12" r="0.6" fill={colour} />
        <path d="M9 8V6" />
      </svg>
    );

    // ──────────── Trading + risk ────────────
    case 'trending-up': return (
      <svg {...props}>
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M14 7h7v7" />
      </svg>
    );
    case 'trending-down': return (
      <svg {...props}>
        <path d="M3 7l6 6 4-4 8 8" />
        <path d="M14 17h7v-7" />
      </svg>
    );
    case 'trending-flat': return (
      <svg {...props}>
        <path d="M3 12h14" />
        <path d="M14 8l4 4-4 4" />
      </svg>
    );
    case 'chart-bar': return (
      <svg {...props}>
        <path d="M3 21h18" />
        <rect x="5" y="11" width="3.5" height="10" rx="0.5" fill={fillCol} fillOpacity={filled ? 0.4 : 1} />
        <rect x="10.5" y="6" width="3.5" height="15" rx="0.5" fill={fillCol} fillOpacity={filled ? 0.4 : 1} />
        <rect x="16" y="14" width="3.5" height="7" rx="0.5" fill={fillCol} fillOpacity={filled ? 0.4 : 1} />
      </svg>
    );
    case 'chart-line': return (
      <svg {...props}>
        <path d="M3 21V3" />
        <path d="M3 21h18" />
        <path d="M5 15l4-4 4 3 6-7" />
      </svg>
    );
    case 'gauge': return (
      <svg {...props}>
        <path d="M3 18a9 9 0 1118 0" />
        <path d="M12 18l5-6" />
        <circle cx="12" cy="18" r="1" fill={colour} />
      </svg>
    );
    case 'target': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9.5" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2.5" fill={fillCol} fillOpacity={filled ? 0.5 : 1} />
      </svg>
    );
    case 'scale': return (
      <svg {...props}>
        <path d="M12 3v18M5 7h14" />
        <path d="M5 7l-2 6a3 3 0 006 0L7 7" />
        <path d="M19 7l-2 6a3 3 0 006 0l-2-6" />
      </svg>
    );
    case 'cpu': return (
      <svg {...props}>
        <rect x="6" y="6" width="12" height="12" rx="2" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <rect x="9" y="9" width="6" height="6" rx="1" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
      </svg>
    );
    case 'brain': return (
      <svg {...props}>
        <path d="M9 4a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3h6a3 3 0 003-3v-2a3 3 0 003-3v-3a3 3 0 00-3-3 3 3 0 00-3-3H9z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M12 8v9M9 12h6M10 16l-1 1M14 16l1 1" />
      </svg>
    );
    case 'activity': return <svg {...props}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>;

    // ──────────── Operations / projects ────────────
    case 'building': return (
      <svg {...props}>
        <path d="M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M3 21h18" />
        <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" />
        <path d="M10 21v-4h4v4" />
      </svg>
    );
    case 'flow': return (
      <svg {...props}>
        <rect x="3" y="3" width="6" height="6" rx="1.5" />
        <rect x="15" y="3" width="6" height="6" rx="1.5" />
        <rect x="3" y="15" width="6" height="6" rx="1.5" />
        <rect x="15" y="15" width="6" height="6" rx="1.5" />
        <path d="M9 6h6M9 18h6M6 9v6M18 9v6" />
      </svg>
    );
    case 'wrench': return (
      <svg {...props}>
        <path d="M14 4a4 4 0 015 5l-1 1-2-2-3 3 2 2-1 1a4 4 0 01-5-5l-7 7a2 2 0 002.8 2.8l7-7a4 4 0 015-5z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
      </svg>
    );
    case 'factory': return (
      <svg {...props}>
        <path d="M3 21V11l5 3V11l5 3V8l8 4v9H3z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M3 21h18" />
        <circle cx="7" cy="17" r="0.7" fill={colour} />
        <circle cx="12" cy="17" r="0.7" fill={colour} />
        <circle cx="17" cy="17" r="0.7" fill={colour} />
      </svg>
    );
    case 'spark': return (
      <svg {...props}>
        <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M19 4l.6 1.7L21 6l-1.4.4-.6 1.6-.6-1.6L17 6l1.4-.3z" />
      </svg>
    );
    case 'workflow': return (
      <svg {...props}>
        <circle cx="6" cy="5" r="2.5" />
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="12" cy="19" r="2.5" />
        <path d="M6 8c0 4 6 4 6 8M18 8c0 4-6 4-6 8" />
      </svg>
    );
    case 'connection': return (
      <svg {...props}>
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="12" r="2.5" />
        <path d="M8.5 12h7" />
        <circle cx="12" cy="12" r="0.6" fill={colour} />
      </svg>
    );

    // ──────────── Energy domain ────────────
    case 'bolt': return (
      <svg {...props}>
        <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
      </svg>
    );
    case 'sun': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="4.5" fill={fillCol} fillOpacity={filled ? 0.2 : 1} />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2.1 2.1M17.4 17.4l2.1 2.1M4.5 19.5l2.1-2.1M17.4 6.6l2.1-2.1" />
      </svg>
    );
    case 'wind': return (
      <svg {...props}>
        <path d="M3 8h12a3 3 0 100-6c-1.5 0-2.6 1-3 2" />
        <path d="M3 16h16a3 3 0 110 6c-1.5 0-2.6-1-3-2" />
        <path d="M3 12h8" />
      </svg>
    );
    case 'leaf': return (
      <svg {...props}>
        <path d="M5 19c0-9 4-14 16-14 0 12-5 16-14 16-1.1 0-2-.9-2-2z" fill={fillCol} fillOpacity={filled ? 0.18 : 1} />
        <path d="M5 19c4-4 8-8 16-14" />
      </svg>
    );
    case 'eco': return (
      <svg {...props}>
        <path d="M21 4c-7 0-13 3-13 11 0 3 2 5 5 5 8 0 11-8 11-16h-3z" fill={fillCol} fillOpacity={filled ? 0.18 : 1} />
        <path d="M4 20c2-4 7-9 14-12" />
      </svg>
    );
    case 'battery': return (
      <svg {...props}>
        <rect x="3" y="7" width="16" height="10" rx="1.5" fill={fillCol} fillOpacity={filled ? 0.12 : 1} />
        <rect x="5" y="9" width="6" height="6" rx="0.5" fill={colour} fillOpacity={0.6} stroke="none" />
        <path d="M19 11v2h2v-2z" fill={colour} stroke="none" />
      </svg>
    );
    case 'flame': return (
      <svg {...props}>
        <path d="M12 2c0 4-5 5-5 10a5 5 0 0010 0c0-3-2-4-2-7 0-2 1-3-3-3z" fill={fillCol} fillOpacity={filled ? 0.18 : 1} />
      </svg>
    );
    case 'globe': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M2.5 12h19M12 2.5c3 3 3 16 0 19M12 2.5c-3 3-3 16 0 19" />
      </svg>
    );
    case 'gridmap': return (
      <svg {...props}>
        <rect x="3" y="3" width="18" height="18" rx="1.5" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    );

    // ──────────── People & roles ────────────
    case 'people': return (
      <svg {...props}>
        <circle cx="9" cy="9" r="3" />
        <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
        <circle cx="17" cy="10" r="2.5" />
        <path d="M14 19c0-2 2-3.5 4-3.5s4 1.5 4 3.5" />
      </svg>
    );
    case 'team': return (
      <svg {...props}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
        <circle cx="18" cy="5" r="0.6" fill={colour} />
      </svg>
    );
    case 'badge': return (
      <svg {...props}>
        <circle cx="12" cy="9" r="5" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M8 13l-2 8 6-3 6 3-2-8" />
        <path d="M10 9l1.5 1.5L15 7" />
      </svg>
    );

    // ──────────── Insights & data ────────────
    case 'insights': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M7 14l3-3 3 3 4-5" />
        <circle cx="7" cy="14" r="0.7" fill={colour} />
        <circle cx="13" cy="14" r="0.7" fill={colour} />
        <circle cx="17" cy="9" r="0.7" fill={colour} />
      </svg>
    );
    case 'briefing': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="5" fill={fillCol} fillOpacity={filled ? 0.18 : 1} />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" />
      </svg>
    );
    case 'report': return (
      <svg {...props}>
        <path d="M5 3h11l3 3v15H5V3z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M16 3v3h3" />
        <path d="M8 13h2v5H8zM12 10h2v8h-2zM16 14h2v4h-2z" stroke={colour} fill={colour} fillOpacity={0.5} />
      </svg>
    );
    case 'database': return (
      <svg {...props}>
        <ellipse cx="12" cy="5" rx="8" ry="2.5" fill={fillCol} fillOpacity={filled ? 0.18 : 1} />
        <path d="M4 5v6c0 1.5 3.5 2.5 8 2.5s8-1 8-2.5V5" />
        <path d="M4 11v6c0 1.5 3.5 2.5 8 2.5s8-1 8-2.5v-6" />
      </svg>
    );
    case 'layers': return (
      <svg {...props}>
        <path d="M12 3L3 8l9 5 9-5-9-5z" fill={fillCol} fillOpacity={filled ? 0.15 : 1} />
        <path d="M3 13l9 5 9-5M3 18l9 5 9-5" />
      </svg>
    );

    // ──────────── OE brand mark ────────────
    case 'oe-mark': return (
      <svg width={size} height={size} viewBox="0 0 400 400" role={ariaLabel ? 'img' : 'presentation'} aria-label={ariaLabel} className={className}>
        <g fill="none" strokeLinecap="round">
          <circle cx="142" cy="148" r="92" stroke="#3b82c4" strokeWidth="22" strokeDasharray="430 200" strokeDashoffset="-50" />
          <circle cx="258" cy="148" r="92" stroke="#1f9b95" strokeWidth="22" strokeDasharray="430 200" strokeDashoffset="80" />
          <circle cx="200" cy="252" r="92" stroke="#1a3a5c" strokeWidth="22" strokeDasharray="430 200" strokeDashoffset="200" />
        </g>
        <circle cx="200" cy="200" r="22" fill="#1a3a5c" />
        <circle cx="200" cy="200" r="9"  fill="#5fa8e8" />
      </svg>
    );

    default:
      // Fallback: a small ringed dot in the OE blue so missing icons are
      // visible and intentional rather than silently empty.
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" fill={colour} />
        </svg>
      );
  }
}

/* Helper — drop-in for Material Symbols. Maps the Material name to our
 * closest OEIcon. Lets the FioriShell + Stitch screens keep using
 * Material's vocabulary without bundling the font. */
const MATERIAL_MAP: Record<string, IconName> = {
  dashboard: 'dashboard',
  description: 'doc',
  assignment: 'contract',
  trending_up: 'trending-up',
  trending_down: 'trending-down',
  receipt_long: 'receipt',
  shopping_cart: 'cart',
  storefront: 'store',
  apartment: 'building',
  account_tree: 'flow',
  bolt: 'bolt',
  build: 'wrench',
  eco: 'leaf',
  public: 'globe',
  savings: 'piggy-bank',
  insights: 'insights',
  wb_sunny: 'sun',
  bar_chart: 'chart-bar',
  privacy_tip: 'shield',
  settings: 'settings',
  support_agent: 'team',
  monitor_heart: 'activity',
  menu: 'menu',
  search: 'search',
  notifications: 'bell',
  help_outline: 'help',
  person: 'user',
  security: 'shield',
  admin_panel_settings: 'shield',
  logout: 'logout',
  chevron_right: 'chevron-right',
  chevron_left: 'chevron-left',
  add: 'plus',
  check: 'check',
  check_circle: 'check-circle',
  alert: 'alert',
  warning: 'alert',
  info: 'info',
  close: 'close',
  refresh: 'refresh',
  download: 'download',
  upload: 'upload',
  open_in_new: 'external',
  group_add: 'people',
  handshake: 'badge',
  fullscreen: 'gridmap',
};

export function MatIcon({ name, size = 20, className = '', tone, filled }: { name: string; size?: number; className?: string; tone?: OEIconProps['tone']; filled?: boolean }) {
  const mapped = MATERIAL_MAP[name] || 'oe-mark';
  return <OEIcon name={mapped} size={size} className={className} tone={tone} filled={filled} />;
}

export default OEIcon;
