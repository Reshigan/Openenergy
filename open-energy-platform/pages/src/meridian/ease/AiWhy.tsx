// pages/src/meridian/ease/AiWhy.tsx — Ease Kit inline AI assist card.
// The platform's ONLY AI affordance shape: a calm inline card with a plain-language
// suggestion, the WHY behind it, and a single 1-click accept (plus dismiss). No AI
// tabs, no popups, no chat. Spine/E4 surfaces only. Reuses meridian.css (.mer, btn).
import React from 'react';
import '../meridian.css';

export interface AiSuggestion {
  id: string;
  title: string;          // the suggested action, plain language
  why: string;            // one line: the evidence/reason it's suggested
  acceptLabel?: string;   // defaults to "Accept"
}

export function AiWhy({ suggestion, onAccept, onDismiss, busy }: {
  suggestion: AiSuggestion;
  onAccept: (s: AiSuggestion) => void | Promise<void>;
  onDismiss?: (s: AiSuggestion) => void;
  busy?: boolean;
}) {
  return (
    <div
      className="mer ai-why"
      role="note"
      aria-label="AI suggestion"
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: '12px 14px', border: '1px solid var(--line, #e6e9f0)',
        borderLeft: '3px solid var(--accent, #3b6fd4)', borderRadius: 8,
        background: 'var(--raised, #f7f9fc)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: '20px', color: 'var(--accent, #3b6fd4)' }}>✦</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{suggestion.title}</div>
        <div style={{ fontSize: 13, color: 'var(--ink3, #5b6b85)', marginTop: 2 }}>
          <span style={{ fontWeight: 600 }}>Why: </span>{suggestion.why}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button" className="btn pri"
          disabled={busy} aria-busy={busy || undefined}
          onClick={() => onAccept(suggestion)}
        >
          {busy ? '…' : (suggestion.acceptLabel ?? 'Accept')}
        </button>
        {onDismiss && (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => onDismiss(suggestion)}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

// Renders a stack of suggestions (or nothing). Convenience for surfaces that hold
// several inline assists; keeps the "cards, never a panel" rule in one place.
export function AiWhyStack({ suggestions, onAccept, onDismiss, busyId }: {
  suggestions: AiSuggestion[];
  onAccept: (s: AiSuggestion) => void | Promise<void>;
  onDismiss?: (s: AiSuggestion) => void;
  busyId?: string | null;
}) {
  if (!suggestions.length) return null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {suggestions.map(s => (
        <AiWhy key={s.id} suggestion={s} onAccept={onAccept} onDismiss={onDismiss} busy={busyId === s.id} />
      ))}
    </div>
  );
}
