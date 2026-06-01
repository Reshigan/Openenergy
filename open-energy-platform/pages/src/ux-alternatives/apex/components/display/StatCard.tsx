import React from 'react';
import { OeIcon, IconName } from '../icons/Icons';

export type StatVariant = 'green' | 'amber' | 'rose' | 'blue' | 'navy' | 'default';

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string | number;
  deltaLabel?: string;
  positive?: boolean;
  icon?: IconName;
  variant?: StatVariant;
  subtext?: string;
  href?: string;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const VARIANT_ACCENT: Record<StatVariant, string> = {
  green:   'var(--oe-green)',
  amber:   'var(--oe-amber)',
  rose:    'var(--oe-rose)',
  blue:    'var(--oe-blue)',
  navy:    'var(--oe-navy-1)',
  default: 'var(--oe-text-3)',
};

const VARIANT_BG: Record<StatVariant, string> = {
  green:   'linear-gradient(160deg, rgba(11,112,64,0.06) 0%, transparent 60%)',
  amber:   'linear-gradient(160deg, rgba(140,90,9,0.06) 0%, transparent 60%)',
  rose:    'linear-gradient(160deg, rgba(176,41,41,0.06) 0%, transparent 60%)',
  blue:    'linear-gradient(160deg, rgba(21,73,160,0.06) 0%, transparent 60%)',
  navy:    'linear-gradient(160deg, rgba(11,31,58,0.06) 0%, transparent 60%)',
  default: 'none',
};

export function StatCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  positive,
  icon,
  variant = 'default',
  subtext,
  href,
  loading = false,
  size = 'md',
}: StatCardProps) {
  const accent = VARIANT_ACCENT[variant];
  const accentBg = VARIANT_BG[variant];

  const Wrapper = href ? 'a' : 'div';
  const wrapperProps = href ? { href, style: { textDecoration: 'none' } } : {};

  const valueFontSize = size === 'lg' ? '28px' : size === 'sm' ? '18px' : '22px';
  const padding = size === 'sm' ? '12px 14px' : '16px';

  if (loading) {
    return (
      <div style={cardBase(padding)}>
        <div style={skeletonStyle('12px', '60%')} />
        <div style={{ ...skeletonStyle('28px', '70%'), marginTop: '8px' }} />
        <div style={{ ...skeletonStyle('11px', '40%'), marginTop: '6px' }} />
      </div>
    );
  }

  return (
    <Wrapper
      {...(wrapperProps as any)}
      style={{
        ...cardBase(padding),
        background: `${accentBg}, var(--oe-grad-kpi)`,
        cursor: href ? 'pointer' : 'default',
        transition: 'box-shadow 120ms var(--oe-ease), transform 120ms var(--oe-ease)',
      }}
      onMouseEnter={href ? (e: React.MouseEvent) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--oe-shadow-card-hover)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
      } : undefined}
      onMouseLeave={href ? (e: React.MouseEvent) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--oe-shadow-card)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      } : undefined}
    >
      {/* Top row: label + icon */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        {icon && (
          <span
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: variant === 'default' ? 'var(--oe-surf-2)' : `${accent}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: variant === 'default' ? 'var(--oe-text-3)' : accent,
            }}
          >
            <OeIcon name={icon} size={15} />
          </span>
        )}
      </div>

      {/* Value */}
      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span
          className="oe-mono"
          style={{
            fontSize: valueFontSize,
            fontWeight: 700,
            color: variant === 'default' ? 'var(--oe-text-1)' : accent,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--oe-text-3)' }}>{unit}</span>
        )}
      </div>

      {/* Delta / subtext */}
      {(delta != null || subtext) && (
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {delta != null && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '11px',
                fontWeight: 600,
                color: positive === false
                  ? 'var(--oe-rose)'
                  : positive === true
                    ? 'var(--oe-green)'
                    : 'var(--oe-text-3)',
              }}
            >
              <OeIcon
                name={positive === false ? 'trend-down' : positive === true ? 'trend-up' : 'chart-line'}
                size={11}
              />
              {delta}
            </span>
          )}
          {deltaLabel && (
            <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{deltaLabel}</span>
          )}
          {!delta && subtext && (
            <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>{subtext}</span>
          )}
        </div>
      )}

      {/* Accent bar at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: '2px',
          background: accent,
          borderRadius: '0 0 var(--oe-r-card) var(--oe-r-card)',
          opacity: variant === 'default' ? 0 : 0.4,
        }}
      />
    </Wrapper>
  );
}

function cardBase(padding: string): React.CSSProperties {
  return {
    background: 'var(--oe-grad-kpi)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-card)',
    boxShadow: 'var(--oe-shadow-card)',
    padding,
    position: 'relative',
    overflow: 'hidden',
  };
}

function skeletonStyle(h: string, w: string): React.CSSProperties {
  return {
    height: h,
    width: w,
    background: 'linear-gradient(90deg, var(--oe-surf-2) 25%, var(--oe-surf-3) 50%, var(--oe-surf-2) 75%)',
    backgroundSize: '200% 100%',
    borderRadius: '4px',
    animation: 'oe-shimmer 1.4s ease-in-out infinite',
  };
}

/** Grid wrapper for a row of stat cards */
export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '12px',
      }}
    >
      {children}
    </div>
  );
}

export default StatCard;
