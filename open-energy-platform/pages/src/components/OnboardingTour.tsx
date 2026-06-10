// ════════════════════════════════════════════════════════════════════════
// OnboardingTour — declarative first-run tour. Pass a sequence of steps;
// each step's `key` is tracked per-user in /api/ux-state/onboarding so the
// step only ever fires once. Skip closes the whole tour for the session.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { useOnboarding } from '../lib/uxState';

export type TourStep = {
  key: string;
  title: string;
  body: React.ReactNode;
  cta?: string;
};

type Props = {
  /** Surface this tour belongs to. */
  scope: string;
  steps: TourStep[];
};

export function OnboardingTour({ scope, steps }: Props) {
  const { isComplete, complete, completed } = useOnboarding();
  const [skip, setSkip] = useState(false);

  const remaining = useMemo(() => {
    return steps.filter((s) => !isComplete(`${scope}.${s.key}`));
  }, [steps, scope, completed]); // eslint-disable-line react-hooks/exhaustive-deps

  const [cursor, setCursor] = useState(0);
  useEffect(() => { setCursor(0); }, [remaining.length]);

  // Session-wide kill switch used by recording/automation. The video helper
  // sets `oe.onboarding.skipped=1` before navigating so the tooltip never
  // paints on top of a shot.
  if (typeof window !== 'undefined' && window.localStorage?.getItem('oe.onboarding.skipped') === '1') {
    return null;
  }

  if (skip || remaining.length === 0) return null;

  const step = remaining[cursor];
  if (!step) return null;

  const advance = async () => {
    await complete(`${scope}.${step.key}`);
    if (cursor + 1 >= remaining.length) setSkip(true);
    else setCursor((c) => c + 1);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm widget-card shadow-lg border border-[#dde4ec] bg-white p-4">
      <div className="flex items-start gap-2">
        <div className="flex-none w-7 h-7 rounded-full bg-[#eaf3fb] flex items-center justify-center">
          <Sparkles size={14} className="text-[#1a3a5c]"/>
        </div>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">Quick tour · {cursor + 1} of {remaining.length}</div>
          <div className="font-semibold text-[14px] text-[#0f1c2e]">{step.title}</div>
          <div className="text-[12px] text-[#3a4658] mt-1 leading-relaxed">{step.body}</div>
        </div>
        <button type="button" onClick={() => setSkip(true)} aria-label="Skip tour" className="text-[#6b7685] hover:text-[#0f1c2e] flex-none">
          <X size={14}/>
        </button>
      </div>
      <div className="flex justify-end mt-3 gap-2">
        <button type="button" onClick={() => setSkip(true)} className="h-8 px-3 text-[11px] text-[#6b7685] hover:text-[#0f1c2e]">Skip</button>
        <button type="button" onClick={() => void advance()} className="h-8 px-3 rounded bg-[#c2873a] text-white text-[11px] font-semibold inline-flex items-center gap-1">
          {step.cta || 'Got it'} <ArrowRight size={12}/>
        </button>
      </div>
    </div>
  );
}
