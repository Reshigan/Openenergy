// pages/src/meridian/components.tsx — shared Meridian primitives (markup matches meridian.css,
// which is ported verbatim from mockups/meridian/01-horizon.html: fuse fill is `.fuse > i`,
// tile children are .ref / .title / .zar / .meta).
import React from 'react';
import { Link } from 'react-router-dom';
import { fmtZar, zarMagnitudeClass, fuseFraction, humanizeKey, type MerCase } from './lib';
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
// Renders the curated, sentence-case label from statusLabel() on a Meridian
// .chip with a tone derived from the status itself. Pass an explicit `tone` to
// keep a call site's hand-tuned intent (e.g. "decision is always good when
// false_positive"); omit it to derive from the status stem.
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

export function FuseBar({ deadline }: { deadline: string | null }) {
  const f = fuseFraction(deadline);
  const cls = f === 0 ? 'fuse dead' : f < 0.25 ? 'fuse warn' : 'fuse';
  return (
    <div
      className={cls}
      role="img"
      aria-label={f === 0 ? 'SLA breached' : `${Math.round(f * 100)}% of SLA window remaining`}
    >
      <i style={{ width: `${f * 100}%` }} />
    </div>
  );
}

export function CaseTile({ c }: { c: MerCase }) {
  const breached = c.bucket === 'breached';
  return (
    <Link
      to={`/thread/${c.chain}/${c.id}`}
      className={breached ? 'tile breached' : 'tile'}
      data-bucket={c.bucket}
    >
      <div className="ref">{c.ref} · {humanizeKey(c.chain)}</div>
      <div className="title">{c.title}</div>
      {c.quantum_zar != null && (
        <div className={`zar ${zarMagnitudeClass(c.quantum_zar)}`}>{fmtZar(c.quantum_zar)}</div>
      )}
      <div className="meta">
        {(() => {
          // Breach overrides tone (oxide) regardless of the underlying state's tone.
          const s = statusLabel(c.status);
          const cls = breached ? STATUS_TONE_CLASS.oxide : STATUS_TONE_CLASS[s.tone];
          return <span className={cls}>{s.text}</span>;
        })()}
        {c.counterparty && <span>{c.counterparty}</span>}
      </div>
      <FuseBar deadline={c.deadline_at} />
    </Link>
  );
}
