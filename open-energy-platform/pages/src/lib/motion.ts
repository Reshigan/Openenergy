// Motion primitives for the OE signature design system.
//
// Three named springs cover the entire motion grammar:
//   - snap    : list/card entrance (380/30)
//   - smooth  : hero/modal/page transitions (220/32)
//   - flick   : Bloomberg ticks, value flashes (600/40)
//
// All consumers MUST gate animations on prefersReducedMotion(). When the user
// has reduce-motion on, the helpers below return a no-op transition so values
// snap to their final state instead of animating.

import type { Transition, Variants } from 'framer-motion';

export const springs = {
  snap: { type: 'spring', stiffness: 380, damping: 30 } as Transition,
  smooth: { type: 'spring', stiffness: 220, damping: 32 } as Transition,
  flick: { type: 'spring', stiffness: 600, damping: 40 } as Transition,
};

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Use as the transition prop on motion components when the value should
// snap-on-reduce rather than animate.
export function motionTransition(preset: keyof typeof springs): Transition {
  if (prefersReducedMotion()) return { duration: 0 };
  return springs[preset];
}

// Stagger preset for grids/lists. 40ms per item in cinematic mode; 0 in
// Bloomberg or under reduced motion.
export function staggerChildren(density: 'cinematic' | 'bloomberg' = 'cinematic'): Transition {
  if (prefersReducedMotion() || density === 'bloomberg') {
    return { staggerChildren: 0 };
  }
  return { staggerChildren: 0.04 };
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0 },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
};
