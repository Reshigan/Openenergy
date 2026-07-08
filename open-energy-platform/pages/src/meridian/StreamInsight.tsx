// Do-next stream: one-line "why me / why now" insight + a derived sparkline.
// Pure derivation from the case's existing score / quantum_zar / bucket — NO fetch.
import React from 'react';

type StreamCase = { bucket?: string; status?: string; score?: number; quantum_zar?: number };

function randShort(zar: number): string {
  if (zar >= 1_000_000) return `R${(zar / 1_000_000).toFixed(1)}m`;
  if (zar >= 1_000) return `R${(zar / 1_000).toFixed(0)}k`;
  return `R${zar.toFixed(0)}`;
}

export function insightLine(c: StreamCase): string {
  if (c.quantum_zar && c.quantum_zar > 0) return `${randShort(c.quantum_zar)} at stake · needs your call`;
  if ((c.score ?? 0) >= 80) return 'High attention — top of queue';
  if (c.status) return `Waiting: ${String(c.status).replace(/_/g, ' ')}`;
  return 'Ready for next step';
}

// Deterministic 8-point series: a gentle ramp toward the score. No random (breaks resume + tests).
export function sparklinePoints(score: number): number[] {
  const s = Math.max(0, Math.min(100, score || 0));
  return Array.from({ length: 8 }, (_, i) => Math.round(s * (0.4 + (0.6 * i) / 7)));
}

export default function StreamInsight({ c }: { c: StreamCase }): JSX.Element {
  const pts = sparklinePoints(c.score ?? 0);
  const max = Math.max(1, ...pts);
  const d = pts.map((p, i) => `${(i / 7) * 60},${16 - (p / max) * 14}`).join(' ');
  return (
    <div className="jc-insight">
      <span className="jc-insight-txt">{insightLine(c)}</span>
      <svg width="60" height="16" viewBox="0 0 60 16" className="jc-spark" aria-hidden="true">
        <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
