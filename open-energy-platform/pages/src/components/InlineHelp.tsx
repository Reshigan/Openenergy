// ════════════════════════════════════════════════════════════════════════
// InlineHelp — small dismissable hint card for a workstation surface.
// Persists dismissal per-user via /api/ux-state/help-dismissals so each
// hint shows once and never again unless the user explicitly resets.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useHelpDismissal } from '../lib/uxState';

type Props = {
  helpKey: string;
  title?: string;
  children: React.ReactNode;
  tone?: 'info' | 'amber';
};

export function InlineHelp({ helpKey, title, children, tone = 'info' }: Props) {
  const { dismissed, dismiss } = useHelpDismissal(helpKey);
  if (dismissed !== false) return null;

  const palette = tone === 'amber'
    ? 'bg-[#fff5d0] border-[#e0b22b] text-[#7a5800]'
    : 'bg-[#eaf3fb] border-[#7eb6dd] text-[#0f3a5c]';

  return (
    <div className={`relative border rounded-md ${palette} p-3 text-[12px] flex items-start gap-2`}>
      <HelpCircle size={14} className="flex-none mt-0.5"/>
      <div className="flex-1">
        {title && <div className="font-semibold text-[13px] mb-0.5">{title}</div>}
        <div className="leading-relaxed">{children}</div>
      </div>
      <button type="button" onClick={() => void dismiss()} aria-label="Dismiss" className="flex-none opacity-60 hover:opacity-100">
        <X size={13}/>
      </button>
    </div>
  );
}
