// SignatureHero — full-bleed top region that hosts the role's hero motif.
//
// Sets the haze gradient background, sizes for cinematic mode, renders
// eyebrow/title/subtitle/CTA + a slot for the role-specific motif. The
// actual motif (ticker, waterfall, grid map…) is passed as children of `motif`.

import React from 'react';
import { motion } from 'framer-motion';
import { motionTransition } from '../../lib/motion';

export interface SignatureHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  motif?: React.ReactNode;
  primaryCta?: { label: string; onClick?: () => void; href?: string };
}

export function SignatureHero({ eyebrow, title, subtitle, motif, primaryCta }: SignatureHeroProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={motionTransition('smooth')}
      style={{
        position: 'relative',
        minHeight: 'clamp(280px, 38vh, 480px)',
        padding: 'clamp(24px, 4vw, 64px)',
        background: 'var(--role-haze)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 1fr)',
          gap: 32,
          alignItems: 'center',
          maxWidth: 1440,
          margin: '0 auto',
        }}
      >
        <div>
          {eyebrow ? (
            <div
              className="oe-tnum"
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--role-accent)',
                marginBottom: 16,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <h1
            style={{
              fontFamily: 'var(--oe-display-font)',
              fontSize: 'clamp(40px, 5vw, 64px)',
              lineHeight: 1.05,
              fontWeight: 600,
              letterSpacing: '-0.025em',
              margin: 0,
              color: 'var(--role-on-surface)',
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                fontSize: 'clamp(15px, 1.4vw, 18px)',
                lineHeight: 1.55,
                marginTop: 16,
                maxWidth: 560,
                color: 'var(--role-on-surface-muted)',
              }}
            >
              {subtitle}
            </p>
          ) : null}
          {primaryCta ? (
            <a
              href={primaryCta.href}
              onClick={(e) => {
                if (primaryCta.onClick) {
                  e.preventDefault();
                  primaryCta.onClick();
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 24,
                padding: '12px 20px',
                background: 'var(--role-accent)',
                color: '#0a1622',
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: 'none',
                letterSpacing: '0.01em',
              }}
            >
              {primaryCta.label} <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </div>
        <div style={{ minWidth: 0 }}>{motif}</div>
      </div>
    </motion.section>
  );
}
