import React from 'react';

export type PillVariant =
  | 'green' | 'amber' | 'rose' | 'blue' | 'navy' | 'violet' | 'default';

export interface StatusPillProps {
  label: string;
  variant?: PillVariant;
  dot?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

const STYLES: Record<PillVariant, { bg: string; color: string; dot: string }> = {
  green:   { bg: 'var(--oe-green-bg)',  color: 'var(--oe-green)',  dot: 'var(--oe-green)' },
  amber:   { bg: 'var(--oe-amber-bg)',  color: 'var(--oe-amber)',  dot: 'var(--oe-amber)' },
  rose:    { bg: 'var(--oe-rose-bg)',   color: 'var(--oe-rose)',   dot: 'var(--oe-rose)' },
  blue:    { bg: 'var(--oe-blue-bg)',   color: 'var(--oe-blue)',   dot: 'var(--oe-blue)' },
  navy:    { bg: 'rgba(11,31,58,0.08)', color: 'var(--oe-navy-1)', dot: 'var(--oe-navy-1)' },
  violet:  { bg: 'var(--oe-violet-bg)', color: 'var(--oe-violet)', dot: 'var(--oe-violet)' },
  default: { bg: 'var(--oe-surf-2)',    color: 'var(--oe-text-2)', dot: 'var(--oe-text-3)' },
};

const FONT_SIZE: Record<string, string> = { xs: '9px', sm: '10px', md: '11px' };
const PADDING: Record<string, string> = { xs: '1px 5px', sm: '2px 6px', md: '3px 8px' };

export function StatusPill({ label, variant = 'default', dot = true, size = 'sm' }: StatusPillProps) {
  const s = STYLES[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: s.bg,
        color: s.color,
        fontSize: FONT_SIZE[size],
        fontWeight: 600,
        padding: PADDING[size],
        borderRadius: 'var(--oe-r-pill)',
        whiteSpace: 'nowrap',
        letterSpacing: '0.01em',
        textTransform: 'uppercase',
      }}
    >
      {dot && (
        <span
          style={{
            width: size === 'xs' ? '4px' : '5px',
            height: size === 'xs' ? '4px' : '5px',
            borderRadius: '50%',
            background: s.dot,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}

/** Map common state machine state names to pill variants */
export function stateVariant(state: string): PillVariant {
  const s = state.toLowerCase();
  if (/complete|closed|settled|issued|approved|granted|active|live|operational|commissioned/.test(s)) return 'green';
  if (/pending|submitted|review|draft|assessment|evaluating|scheduled|notified/.test(s)) return 'blue';
  if (/breach|overdue|failed|rejected|refused|cancelled|terminated|expired|written_off/.test(s)) return 'rose';
  if (/warning|at.?risk|escalat|watchlist|cure|deferr|suspended|hold/.test(s)) return 'amber';
  if (/authoris|signed|certified|verified/.test(s)) return 'navy';
  return 'default';
}

export default StatusPill;
