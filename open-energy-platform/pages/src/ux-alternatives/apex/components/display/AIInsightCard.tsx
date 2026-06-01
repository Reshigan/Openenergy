import React, { useState } from 'react';
import { OeIcon } from '../icons/Icons';

export interface AIInsightCardProps {
  title: string;
  reasoning: string;
  suggestion: string;
  confidence?: 'high' | 'medium' | 'low';
  onAccept?: () => void;
  onDismiss?: () => void;
  accepted?: boolean;
}

const CONFIDENCE_COLORS = {
  high:   { text: 'var(--oe-green)',  bg: 'var(--oe-green-bg)', label: 'High confidence' },
  medium: { text: 'var(--oe-amber)',  bg: 'var(--oe-amber-bg)', label: 'Medium confidence' },
  low:    { text: 'var(--oe-text-3)', bg: 'var(--oe-surf-2)',   label: 'Low confidence' },
};

export function AIInsightCard({
  title,
  reasoning,
  suggestion,
  confidence = 'medium',
  onAccept,
  onDismiss,
  accepted = false,
}: AIInsightCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [localAccepted, setLocalAccepted] = useState(accepted);
  const [whyOpen, setWhyOpen] = useState(false);

  if (dismissed) return null;

  const cc = CONFIDENCE_COLORS[confidence];

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, rgba(11,31,58,0.02) 0%, rgba(21,61,110,0.04) 100%)',
        border: '1px solid rgba(21,61,110,0.12)',
        borderRadius: 'var(--oe-r-card)',
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle gradient accent at left */}
      <div
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: '3px',
          background: 'var(--oe-grad-active)',
          borderRadius: 'var(--oe-r-card) 0 0 var(--oe-r-card)',
        }}
      />

      <div style={{ paddingLeft: '4px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* AI indicator — subtle spark icon */}
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '5px',
                background: 'var(--oe-navy-1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <OeIcon name="lightning" size={12} color="#fff" />
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--oe-navy-1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {title}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 600,
                color: cc.text,
                background: cc.bg,
                padding: '2px 6px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {cc.label}
            </span>
            <button
              onClick={() => setDismissed(true)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--oe-text-3)', padding: '2px' }}
              title="Dismiss"
            >
              <OeIcon name="close" size={12} />
            </button>
          </div>
        </div>

        {/* Suggestion */}
        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--oe-text-1)', lineHeight: '1.5' }}>
          {suggestion}
        </div>

        {/* Why toggle */}
        <button
          onClick={() => setWhyOpen(o => !o)}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--oe-text-3)',
            fontSize: '11px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '8px',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          <OeIcon name={whyOpen ? 'chevron-down' : 'chevron-right'} size={11} />
          Why this suggestion?
        </button>

        {whyOpen && (
          <div
            style={{
              marginTop: '6px',
              fontSize: '11px',
              color: 'var(--oe-text-2)',
              background: 'rgba(11,31,58,0.04)',
              borderRadius: '6px',
              padding: '8px 10px',
              lineHeight: '1.5',
            }}
          >
            {reasoning}
          </div>
        )}

        {/* Actions */}
        {!localAccepted && onAccept && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              onClick={() => { setLocalAccepted(true); onAccept?.(); }}
              style={{
                border: 'none',
                background: 'var(--oe-grad-button)',
                borderRadius: 'var(--oe-r-btn)',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#fff',
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: 'var(--oe-shadow-btn)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'transform 100ms var(--oe-ease)',
              }}
              onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            >
              <OeIcon name="check" size={13} color="#fff" />
              Accept suggestion
            </button>
            {onDismiss && (
              <button
                onClick={() => { setDismissed(true); onDismiss?.(); }}
                style={{
                  border: '1px solid var(--oe-border)',
                  background: 'none',
                  borderRadius: 'var(--oe-r-btn)',
                  padding: '7px 14px',
                  fontSize: '12px',
                  color: 'var(--oe-text-2)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {localAccepted && (
          <div
            style={{
              marginTop: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--oe-green)',
              fontWeight: 500,
            }}
          >
            <OeIcon name="check-circle" size={14} color="var(--oe-green)" />
            Suggestion accepted
          </div>
        )}
      </div>
    </div>
  );
}

export default AIInsightCard;
