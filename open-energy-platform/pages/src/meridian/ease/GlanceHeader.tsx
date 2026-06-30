// pages/src/meridian/ease/GlanceHeader.tsx — Ease Kit "name the top task <5s" header.
// A calm surface header: what this is (title), why you're here (one plain-language
// purpose line), and the single number that matters (one metric, optionally toned).
// Replaces the dense multi-stat banners; the rest of a surface's numbers live in
// the body, not competing in the header. Reuses meridian.css (.mer, .hd-serif, mono).
import React from 'react';
import '../meridian.css';

export type GlanceTone = 'neutral' | 'good' | 'warn' | 'oxide';

const TONE_COLOR: Record<GlanceTone, string> = {
  neutral: 'var(--ink, #1b2438)',
  good: 'var(--good, #1f8a5b)',
  warn: 'var(--warn, #b5832a)',
  oxide: 'var(--oxide, #b23b2e)',
};

export function GlanceHeader({ title, purpose, metric }: {
  title: string;
  purpose?: string;
  // The one most-important number for this surface (e.g. "3 overdue", "R 2.5m at risk").
  metric?: { value: string; label?: string; tone?: GlanceTone };
}) {
  return (
    <header className="mer glance-header" style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--line, #e6e9f0)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="hd-serif" style={{ margin: 0, fontSize: 22, lineHeight: 1.2 }}>{title}</h1>
        {metric && (
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: TONE_COLOR[metric.tone ?? 'neutral'] }}>
              {metric.value}
            </div>
            {metric.label && (
              <div style={{ fontSize: 12, color: 'var(--ink3, #5b6b85)' }}>{metric.label}</div>
            )}
          </div>
        )}
      </div>
      {purpose && (
        <p style={{ margin: '6px 0 0', color: 'var(--ink3, #5b6b85)', fontSize: 14, maxWidth: 680 }}>{purpose}</p>
      )}
    </header>
  );
}

// ponytail: self-check — pure render constructs with and without the metric.
export function __demo(): boolean {
  return (
    React.isValidElement(<GlanceHeader title="x" />) &&
    React.isValidElement(<GlanceHeader title="x" purpose="y" metric={{ value: '3', label: 'overdue', tone: 'oxide' }} />)
  );
}
