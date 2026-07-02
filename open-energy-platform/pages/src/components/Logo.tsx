import React from 'react';

/* ════════════════════════════════════════════════════════════════════════
 * Open Energy (a Vantax product) — Brand mark · "Cockpit Dial"
 *
 * An open gauge ring (the "C" of CEC, and a cockpit instrument) with a gold
 * needle swung to peak through the ring's mouth — energy read at a glance.
 *
 *   - Field : deep navy   (#16365A → #0B2034)  institutional / grid
 *   - Mark  : warm gold   (#F8C152 → #DC8417)  energy / the live reading
 *
 * Inline SVG so it scales crisply and needs no extra HTTP fetch. The Banner
 * variant adds the CEC wordmark to the right.
 * ═══════════════════════════════════════════════════════════════════════ */

export interface LogoProps {
  size?: number;            // mark height in px
  className?: string;
  title?: string;
  /** Light variant only affects the Banner wordmark colour on dark chrome */
  variant?: 'colour' | 'light';
}

export function LogoMark({ size = 32, className = '', title = 'Open Energy — a Vantax product' }: LogoProps) {
  const uid = React.useId().replace(/:/g, '');
  const field = `cecF-${uid}`;
  const gold = `cecG-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={field} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16365A" />
          <stop offset="1" stopColor="#0B2034" />
        </linearGradient>
        <linearGradient id={gold} x1="0.15" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#F8C152" />
          <stop offset="1" stopColor="#DC8417" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="23" fill={`url(#${field})`} />
      <path d="M83.66 45.27 A34 34 0 1 1 60.5 17.66" fill="none" stroke={`url(#${gold})`} strokeWidth="9.5" strokeLinecap="round" />
      <polygon points="45.5,49.8 69,26 54.5,56.2" fill={`url(#${gold})`} />
      <circle cx="50" cy="53" r="6.6" fill={`url(#${gold})`} />
      <circle cx="50" cy="53" r="2.7" fill="#0B2034" />
    </svg>
  );
}

export interface BannerProps {
  height?: number;
  className?: string;
  variant?: 'colour' | 'light';
  /** When true, renders only the wordmark (no mark) — useful inside small chrome */
  wordmarkOnly?: boolean;
}

export function LogoBanner({
  height = 40,
  className = '',
  variant = 'colour',
  wordmarkOnly = false,
}: BannerProps) {
  const navy = variant === 'light' ? '#ffffff' : '#102E4D';
  const sub = variant === 'light' ? 'rgba(255,255,255,0.72)' : '#5C6B7C';

  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      style={{ height }}
    >
      {!wordmarkOnly && <LogoMark size={height} />}
      <div
        className="font-display font-extrabold leading-[0.95] tracking-tight"
        style={{ fontSize: Math.round(height * 0.42) }}
      >
        <div style={{ color: navy, letterSpacing: '0.06em' }}>OPEN ENERGY</div>
        <div style={{ color: sub, fontSize: '0.5em', letterSpacing: '0.08em', fontWeight: 600 }}>A VANTAX PRODUCT</div>
      </div>
    </div>
  );
}

export default LogoMark;
