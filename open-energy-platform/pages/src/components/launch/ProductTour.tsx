import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export type TourStep = {
  target: string;   // matches data-tour="<target>" attribute
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
};

export type TourDef = {
  id: string;
  steps: TourStep[];
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8; // highlight padding around target

function getRect(target: string): Rect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function tooltipPosition(rect: Rect | null, placement: TourStep['placement'] = 'bottom'): React.CSSProperties {
  if (!rect || placement === 'center') {
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999 };
  }
  const vw = window.innerWidth;
  const TIP_W = 300;
  const TIP_H = 160;
  const ARROW = 12;

  let top: number, left: number;

  if (placement === 'bottom') {
    top = rect.top + rect.height + ARROW;
    left = Math.min(Math.max(rect.left + rect.width / 2 - TIP_W / 2, 12), vw - TIP_W - 12);
  } else if (placement === 'top') {
    top = rect.top - TIP_H - ARROW;
    left = Math.min(Math.max(rect.left + rect.width / 2 - TIP_W / 2, 12), vw - TIP_W - 12);
  } else if (placement === 'right') {
    top = rect.top + rect.height / 2 - TIP_H / 2;
    left = rect.left + rect.width + ARROW;
  } else {
    top = rect.top + rect.height / 2 - TIP_H / 2;
    left = rect.left - TIP_W - ARROW;
  }

  // Clamp to viewport
  top = Math.max(12, Math.min(top, window.innerHeight - TIP_H - 12));
  left = Math.max(12, Math.min(left, vw - TIP_W - 12));

  return { position: 'fixed', top, left, width: TIP_W, zIndex: 9999 };
}

export function ProductTour({
  def,
  stepIndex,
  onNext,
  onPrev,
  onClose,
}: {
  def: TourDef;
  stepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const step = def.steps[stepIndex];
  const isLast = stepIndex === def.steps.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const measuredRef = useRef(false);

  const measure = () => {
    const r = getRect(step.target);
    setRect(r);
    if (r) {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  useLayoutEffect(() => {
    measuredRef.current = false;
    const t = setTimeout(() => { measure(); measuredRef.current = true; }, 350);
    return () => clearTimeout(t);
  }, [stepIndex, step.target]);

  useEffect(() => {
    const handleResize = () => measure();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [stepIndex]);

  const tipStyle = tooltipPosition(rect, step.placement);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Clip-path: full screen with a rectangular hole punched for the target
  const clipPath = rect
    ? `polygon(
        0 0, ${vw}px 0, ${vw}px ${vh}px, 0 ${vh}px, 0 0,
        ${rect.left}px ${rect.top}px,
        ${rect.left}px ${rect.top + rect.height}px,
        ${rect.left + rect.width}px ${rect.top + rect.height}px,
        ${rect.left + rect.width}px ${rect.top}px,
        ${rect.left}px ${rect.top}px
      )`
    : undefined;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'none' }}
      >
        {/* Semi-transparent backdrop with cutout */}
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(10,20,34,0.60)',
            clipPath,
          }}
        />
        {/* Highlight ring around target */}
        {rect && (
          <div
            style={{
              position: 'fixed',
              top: rect.top, left: rect.left,
              width: rect.width, height: rect.height,
              borderRadius: 8,
              boxShadow: '0 0 0 2px #3b82c4, 0 0 20px rgba(59,130,196,0.5)',
              pointerEvents: 'none',
            }}
          />
        )}
      </motion.div>

      {/* Tooltip */}
      <motion.div
        key={`tip-${stepIndex}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
        style={{
          ...tipStyle,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(10,20,34,0.22), 0 0 0 1px rgba(59,130,196,0.15)',
          padding: '16px 18px',
          pointerEvents: 'all',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3b82c4', marginBottom: 3 }}>
              Step {stepIndex + 1} of {def.steps.length}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1c2e', lineHeight: 1.25 }}>
              {step.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#9aa6b4', padding: 2, marginTop: -2 }}
            aria-label="Close tour"
          >
            <X size={14} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: '#4a5568', lineHeight: 1.55, marginTop: 8 }}>
          {step.body}
        </p>

        {/* Step dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
          {def.steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === stepIndex ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === stepIndex ? '#3b82c4' : i < stepIndex ? '#1a8a5b' : '#dde4ec',
                transition: 'width 0.2s, background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 11, color: '#9aa6b4', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Skip tour
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={onPrev}
                style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, paddingLeft: 10, paddingRight: 12, borderRadius: 6, border: '1px solid #dde4ec', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#0f1c2e', fontWeight: 600 }}
              >
                <ChevronLeft size={13} /> Back
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, paddingLeft: 12, paddingRight: 10, borderRadius: 6, border: 'none', background: '#0f1c2e', cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600 }}
            >
              {isLast ? 'Done' : 'Next'} {!isLast && <ChevronRight size={13} />}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
