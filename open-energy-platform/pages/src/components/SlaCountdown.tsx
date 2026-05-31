// SlaCountdown — shared SLA urgency indicator for chain tab components.
// Renders a colored progress bar + time-remaining text.
// Color thresholds: >50% green → 25-50% amber → 10-25% orange-red → <10% pulsing red → breached.

import React, { useEffect } from 'react';

export type SlaCountdownProps = {
  /** Hours remaining before deadline. */
  remainingHours: number;
  /** Total hours for this SLA window. */
  totalHours: number;
  /** If true, overrides all other states and shows a red "BREACHED" bar. */
  breached?: boolean;
  /** Label to show before the time text. Defaults to "SLA". */
  label?: string;
  /**
   * true — just the colored bar, no text, height 4px.
   * false (default) — bar + formatted time remaining.
   */
  compact?: boolean;
};

// ── Colour helpers ────────────────────────────────────────────────────────────

type SlaZone = 'breached' | 'critical' | 'warning' | 'low' | 'ok';

const ZONE_COLORS: Record<SlaZone, { bar: string; bg: string; text: string }> = {
  breached: { bar: '#dc2626', bg: '#fef2f2', text: '#dc2626' },
  critical: { bar: '#dc2626', bg: '#fef2f2', text: '#dc2626' },
  warning:  { bar: '#d97706', bg: '#fffbeb', text: '#d97706' },
  low:      { bar: '#d97706', bg: '#fffbeb', text: '#d97706' },
  ok:       { bar: '#16a34a', bg: '#f0fdf4', text: '#16a34a' },
};

const PULSE_STYLE_ID = 'sla-pulse-keyframes';
const PULSE_CSS = `
@keyframes sla-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
.sla-bar-pulse {
  animation: sla-pulse 1.2s ease-in-out infinite;
}
`;

function useInjectPulse() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(PULSE_STYLE_ID)) return;
    const tag = document.createElement('style');
    tag.id = PULSE_STYLE_ID;
    tag.textContent = PULSE_CSS;
    document.head.appendChild(tag);
  }, []);
}

function getZone(remainingHours: number, totalHours: number, breached: boolean): SlaZone {
  if (breached || remainingHours <= 0) return 'breached';
  const pct = totalHours > 0 ? remainingHours / totalHours : 0;
  if (pct < 0.10) return 'critical';
  if (pct < 0.25) return 'low';
  if (pct < 0.50) return 'warning';
  return 'ok';
}

/** Format hours into a human-readable string, e.g. "72h remaining" or "3d 4h remaining". */
function formatRemaining(hours: number): string {
  if (hours <= 0) return '0h remaining';
  const days = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  if (days === 0) return `${h}h remaining`;
  if (h === 0) return `${days}d remaining`;
  return `${days}d ${h}h remaining`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SlaCountdown({
  remainingHours,
  totalHours,
  breached = false,
  label = 'SLA',
  compact = false,
}: SlaCountdownProps) {
  useInjectPulse();

  const zone = getZone(remainingHours, totalHours, breached);
  const colors = ZONE_COLORS[zone];

  // Fill fraction clamped to [0, 1]; breached → 0
  const fillFraction = breached
    ? 0
    : totalHours > 0
    ? Math.min(1, Math.max(0, remainingHours / totalHours))
    : 0;

  const isPulsing = zone === 'critical';
  const barHeightPx = compact ? 4 : 6;
  const barBorderRadius = barHeightPx / 2;

  if (compact) {
    return (
      <div
        role="meter"
        aria-valuenow={Math.round(fillFraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${breached ? 'BREACHED' : formatRemaining(remainingHours)}`}
        style={{
          position: 'relative',
          width: 60,
          height: barHeightPx,
          borderRadius: barBorderRadius,
          backgroundColor: '#e5e7eb',
          overflow: 'hidden',
          display: 'inline-block',
          verticalAlign: 'middle',
        }}
      >
        <div
          className={isPulsing ? 'sla-bar-pulse' : undefined}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: breached ? '100%' : `${fillFraction * 100}%`,
            backgroundColor: colors.bar,
            borderRadius: barBorderRadius,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    );
  }

  // ── Full variant ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 120 }}>
      {/* Track */}
      <div
        role="meter"
        aria-valuenow={Math.round(fillFraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${breached ? 'BREACHED' : formatRemaining(remainingHours)}`}
        style={{
          position: 'relative',
          height: barHeightPx,
          backgroundColor: '#e5e7eb',
          borderRadius: barBorderRadius,
          overflow: 'hidden',
        }}
      >
        {breached ? (
          // Full red bar with "BREACHED" text baked in via a wrapper below
          <div
            className={isPulsing ? 'sla-bar-pulse' : undefined}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: colors.bar,
              borderRadius: barBorderRadius,
            }}
          />
        ) : (
          <div
            className={isPulsing ? 'sla-bar-pulse' : undefined}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${fillFraction * 100}%`,
              backgroundColor: colors.bar,
              borderRadius: barBorderRadius,
              transition: 'width 0.3s ease',
            }}
          />
        )}
      </div>

      {/* Time label row */}
      {breached ? (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            color: '#ffffff',
            backgroundColor: colors.bar,
            borderRadius: 3,
            padding: '1px 6px',
            alignSelf: 'flex-start',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          BREACHED
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#6b7280',
            }}
          >
            {label}
          </span>
          <span
            className={isPulsing ? 'sla-bar-pulse' : undefined}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: colors.text,
            }}
          >
            {formatRemaining(remainingHours)}
          </span>
        </div>
      )}
    </div>
  );
}

export default SlaCountdown;
