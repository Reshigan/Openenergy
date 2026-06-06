import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface WizardStep {
  title: string;
  /** Step body. Receives a setter the step can use to gate "Next" (e.g. require a field). */
  render: (ctx: { setCanAdvance: (ok: boolean) => void }) => ReactNode;
}

export interface WizardShellProps {
  open: boolean;
  heading: string;
  steps: WizardStep[];
  finalLabel?: string;
  onClose: () => void;
  onComplete: () => Promise<void> | void;
}

export default function WizardShell({
  open, heading, steps, finalLabel = 'Confirm', onClose, onComplete,
}: WizardShellProps) {
  const [i, setI] = useState(0);
  const [canAdvance, setCanAdvance] = useState(true);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setI(0); setCanAdvance(true); setBusy(false); } }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, i, onClose]);

  if (!open) return null;
  const last = i === steps.length - 1;
  const step = steps[i];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/40 backdrop-blur-sm">
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label={heading}
        className="w-full max-w-lg rounded-xl bg-white border border-[#dde4ec] shadow-2xl"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-[#eef2f7]">
          <div>
            <h2 className="text-[14px] font-display font-semibold text-[#0f1c2e]">{heading}</h2>
            <p className="text-[11px] text-[#6b7685] mt-0.5">Step {i + 1} of {steps.length} · {step.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-md p-1.5 text-[#6b7685] hover:text-[#0f1c2e] hover:bg-[#eef2f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c]">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="px-5 py-4 text-[13px] text-[#3d4756]">{step.render({ setCanAdvance })}</div>

        <footer className="flex items-center justify-between px-5 py-3 border-t border-[#eef2f7]">
          <button type="button" onClick={() => (i === 0 ? onClose() : setI(i - 1))}
            className="text-[12px] text-[#6b7685] hover:text-[#0f1c2e] px-3 py-1.5 rounded-md hover:bg-[#eef2f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c]">
            {i === 0 ? 'Cancel' : 'Back'}
          </button>
          <button
            type="button" disabled={!canAdvance || busy}
            onClick={async () => {
              if (!last) { setI(i + 1); return; }
              setBusy(true); try { await onComplete(); } finally { setBusy(false); }
            }}
            className="rounded-md bg-[#1a3a5c] hover:bg-[#16314e] text-white text-[12px] font-semibold px-4 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c] focus-visible:ring-offset-1"
          >
            {last ? finalLabel : 'Next'}
          </button>
        </footer>
      </div>
    </div>
  );
}
