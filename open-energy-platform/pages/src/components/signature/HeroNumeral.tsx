// HeroNumeral — cinematic oversized figure with eyebrow, delta, optional sparkline.
//
// Inside Bloomberg-density shells the numeral compresses to 40px and the
// component switches to mono via --oe-num-font. Count-up animation runs on
// first render in cinematic only, gated by reduced motion.

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { motionTransition, prefersReducedMotion } from '../../lib/motion';

export interface HeroNumeralProps {
  eyebrow: string;
  value: number;
  format?: (v: number) => string;
  unit?: string;
  delta?: { value: number; tone?: 'good' | 'bad' | 'neutral'; label?: string };
  sparkline?: number[];
  countUp?: boolean;
}

function defaultFormat(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'k';
  return v.toFixed(0);
}

function useCountUp(target: number, enabled: boolean, durationMs = 600): number {
  const [v, setV] = useState(enabled ? 0 : target);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setV(target);
      return undefined;
    }
    let raf = 0;
    function tick(t: number) {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, durationMs]);
  return v;
}

export function HeroNumeral({
  eyebrow,
  value,
  format = defaultFormat,
  unit,
  delta,
  sparkline,
  countUp = true,
}: HeroNumeralProps) {
  const enableCountUp = countUp && !prefersReducedMotion();
  const animated = useCountUp(value, enableCountUp);
  const toneColor =
    delta?.tone === 'good' ? '#1f8a5b' : delta?.tone === 'bad' ? '#c0392b' : 'var(--role-on-surface-muted)';
  const arrow = delta && delta.value > 0 ? '▲' : delta && delta.value < 0 ? '▼' : '▬';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition('smooth')}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div
        className="oe-tnum"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--role-on-surface-muted)',
        }}
      >
        {eyebrow}
      </div>
      <div
        className="oe-tnum"
        style={{
          fontFamily: 'var(--oe-num-font)',
          fontSize: 'var(--oe-hero-numeral)',
          lineHeight: 0.95,
          fontWeight: 600,
          letterSpacing: '-0.025em',
          color: 'var(--role-on-surface)',
        }}
      >
        {format(animated)}
        {unit ? <span style={{ fontSize: '0.35em', marginLeft: 8, opacity: 0.65 }}>{unit}</span> : null}
      </div>
      {delta ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: toneColor }}>
          <span aria-hidden="true">{arrow}</span>
          <span className="oe-tnum">{Math.abs(delta.value).toFixed(1)}%</span>
          {delta.label ? <span style={{ color: 'var(--role-on-surface-muted)' }}>{delta.label}</span> : null}
        </div>
      ) : null}
      {sparkline && sparkline.length > 1 ? <Sparkline points={sparkline} /> : null}
    </motion.div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 120;
  const h = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} aria-hidden="true">
      <path d={path} fill="none" stroke="var(--role-accent)" strokeWidth={1.5} />
    </svg>
  );
}
