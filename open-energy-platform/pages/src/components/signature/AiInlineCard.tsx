// AiInlineCard — inline AI suggestion card. Per [[feedback_ai_subtle_active]]:
// no popups, no AI tab, just inline cards with a "why" line and 1-click accept.

import React from 'react';
import { motion } from 'framer-motion';
import { motionTransition } from '../../lib/motion';

export interface AiInlineCardProps {
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; onClick?: () => void; href?: string };
  dismiss?: { label: string; onClick?: () => void };
}

export function AiInlineCard({ title, why, confidence, accept, dismiss }: AiInlineCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition('snap')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 16,
        background: 'var(--role-accent-soft)',
        border: '1px solid var(--role-accent)',
        borderRadius: 'var(--oe-radius-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 999,
            background: 'var(--role-accent)',
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--role-accent)',
          }}
        >
          AI suggestion
          {typeof confidence === 'number' ? (
            <span style={{ marginLeft: 8, opacity: 0.7 }}>{Math.round(confidence * 100)}%</span>
          ) : null}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--role-on-surface)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--role-on-surface-muted)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--role-on-surface)', fontWeight: 600 }}>Why: </strong>
        {why}
      </div>
      {accept || dismiss ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {accept ? (
            <a
              href={accept.href}
              onClick={(e) => {
                if (accept.onClick) {
                  e.preventDefault();
                  accept.onClick();
                }
              }}
              style={{
                padding: '8px 14px',
                background: 'var(--role-accent)',
                color: '#0a1622',
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              {accept.label}
            </a>
          ) : null}
          {dismiss ? (
            <button type="button"
              onClick={dismiss.onClick}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                color: 'var(--role-on-surface-muted)',
                border: '1px solid var(--role-border)',
                borderRadius: 999,
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {dismiss.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}
