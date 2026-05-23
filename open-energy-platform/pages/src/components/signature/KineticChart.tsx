// KineticChart — Recharts wrapper that themes lines/areas/bars in the
// active role-accent color, with a spring entrance and tabular-num caption.
//
// Intentionally thin — we keep using Recharts directly elsewhere. KineticChart
// is the "branded" wrapper for signature surfaces.

import React from 'react';
import { motion } from 'framer-motion';
import { motionTransition } from '../../lib/motion';

export interface KineticChartProps {
  height?: number;
  children: React.ReactNode;
  caption?: string;
}

export function KineticChart({ height = 240, children, caption }: KineticChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition('smooth')}
      style={{ width: '100%' }}
    >
      <div style={{ width: '100%', height }}>{children}</div>
      {caption ? (
        <div
          className="oe-tnum"
          style={{
            marginTop: 8,
            fontSize: 12,
            color: 'var(--role-on-surface-muted)',
            fontFamily: 'var(--oe-num-font)',
          }}
        >
          {caption}
        </div>
      ) : null}
    </motion.div>
  );
}
