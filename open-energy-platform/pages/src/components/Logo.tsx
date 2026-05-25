import React from 'react';

/* ════════════════════════════════════════════════════════════════════════
 * Open Energy — Brand mark
 *
 * Three interlocking rings:
 *   - Blue   (#3b82c4)  top-left  — energy
 *   - Teal   (#1f9b95)  top-right — sustainability
 *   - Navy   (#1a3a5c)  bottom    — institutional trust
 *   - Sky    (#5fa8e8)  centre dot — kinetic / live
 *
 * Inline SVG so it scales crisply, picks up `currentColor` where useful,
 * and doesn't require an extra HTTP fetch. The `Banner` variant adds the
 * wordmark to the right.
 * ═══════════════════════════════════════════════════════════════════════ */

export interface LogoProps {
  size?: number;            // mark height in px
  className?: string;
  title?: string;
  /** Light variant inverts the mark for dark headers (rings → white tints) */
  variant?: 'colour' | 'light';
}

export function LogoMark({ size = 32, className = '', title = 'Consolidated Energy Cockpit', variant = 'colour' }: LogoProps) {
  const blue = variant === 'light' ? '#9bc8ee' : '#3b82c4';
  const teal = variant === 'light' ? '#7fd5cf' : '#1f9b95';
  const navy = variant === 'light' ? '#ffffff' : '#1a3a5c';
  const dotOuter = variant === 'light' ? '#ffffff' : '#1a3a5c';
  const dotInner = variant === 'light' ? '#5fa8e8' : '#5fa8e8';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <g fill="none" strokeLinecap="round">
        <circle cx="142" cy="148" r="92" stroke={blue} strokeWidth="22" strokeDasharray="430 200" strokeDashoffset="-50" />
        <circle cx="258" cy="148" r="92" stroke={teal} strokeWidth="22" strokeDasharray="430 200" strokeDashoffset="80" />
        <circle cx="200" cy="252" r="92" stroke={navy} strokeWidth="22" strokeDasharray="430 200" strokeDashoffset="200" />
      </g>
      <circle cx="200" cy="200" r="22" fill={dotOuter} />
      <circle cx="200" cy="200" r="9"  fill={dotInner} />
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
  const navy = variant === 'light' ? '#ffffff' : '#1a3a5c';
  const blue = variant === 'light' ? '#9bc8ee' : '#3b82c4';

  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      style={{ height }}
    >
      {!wordmarkOnly && <LogoMark size={height} variant={variant} />}
      <div
        className="font-display font-extrabold leading-[0.95] tracking-tight"
        style={{ fontSize: Math.round(height * 0.42) }}
      >
        <div style={{ color: navy }}>OPEN</div>
        <div style={{ color: blue }}>ENERGY</div>
      </div>
    </div>
  );
}

export default LogoMark;
