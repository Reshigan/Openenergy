// pages/src/shared/StatusPill.tsx — relocated from the retired meridian/components.tsx
// (StatusPill was the only export of that file still consumed by live v2 surfaces).
import React from 'react';
import { statusLabel, STATUS_TONE_CLASS, type StatusTone } from './ease/statusLabel';

// Legacy Pill tone vocabulary used across the listing surfaces → StatusTone.
// 'bad' folds onto oxide (the breach colour); 'info' onto neutral — there is no
// "info" tone in the Meridian chip system, only neutral/good/warn/oxide.
type LegacyTone = 'good' | 'warn' | 'bad' | 'neutral' | 'info' | 'oxide';
function toStatusTone(tone: LegacyTone): StatusTone {
  if (tone === 'good' || tone === 'warn' || tone === 'oxide' || tone === 'neutral') return tone;
  if (tone === 'bad') return 'oxide';
  return 'neutral';
}

// Drop-in replacement for the raw `<Pill tone={...}>{x.replace(/_/g,' ')}</Pill>`
// pattern that leaked snake_case state codes to operators ("in_om" → "in om").
// Renders the curated, sentence-case label from statusLabel() with a tone derived
// from the status itself. Pass an explicit `tone` to keep a call site's hand-tuned
// intent (e.g. "decision is always good when false_positive"); omit it to derive
// from the status stem.
export function StatusPill({ status, tone, fallback }: {
  status: string | null | undefined;
  tone?: LegacyTone;
  fallback?: string;
}) {
  const s = statusLabel(status);
  const t = tone ? toStatusTone(tone) : s.tone;
  const text = (status == null || String(status).trim() === '') && fallback ? fallback : s.text;
  return <span className={STATUS_TONE_CLASS[t]}>{text}</span>;
}
