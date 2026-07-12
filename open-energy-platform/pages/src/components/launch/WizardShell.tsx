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
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setI(0); setCanAdvance(true); setBusy(false); setErr(null); } }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, i, onClose]);

  if (!open) return null;
  const last = i === steps.length - 1;
  const step = steps[i];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#0b1c30]/40 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label={heading}
        className="w-full sm:max-w-lg max-h-[85vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl bg-surface-v2 border border-[var(--border-subtle, #dde4ec)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--s2, #eef2f7)]">
          <div>
            <h2 className="text-[14px] font-display font-semibold text-[var(--ink, #0f1c2e)]">{heading}</h2>
            <p className="text-[11px] text-[var(--ink-2, #6b7685)] mt-0.5">Step {i + 1} of {steps.length} · {step.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-md p-1.5 text-[var(--ink-2, #6b7685)] hover:text-[var(--ink, #0f1c2e)] hover:bg-[var(--s2, #eef2f7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a]">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="px-5 py-4 text-[13px] text-[var(--ink-2, #3d4756)]">{step.render({ setCanAdvance })}</div>

        <footer className="flex flex-col px-5 py-3 border-t border-[var(--s2, #eef2f7)] gap-2">
          {err && (
            <p role="alert" className="text-[12px] text-red-700 mt-1">{err}</p>
          )}
          <div className="flex items-center justify-between">
          <button type="button" onClick={() => (i === 0 ? onClose() : setI(i - 1))}
            className="text-[12px] text-[var(--ink-2, #6b7685)] hover:text-[var(--ink, #0f1c2e)] px-3 py-1.5 rounded-md hover:bg-[var(--s2, #eef2f7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a]">
            {i === 0 ? 'Cancel' : 'Back'}
          </button>
          <button
            type="button" disabled={!canAdvance || busy}
            onClick={async () => {
              if (!last) { setI(i + 1); return; }
              setBusy(true);
              setErr(null);
              try {
                await onComplete();
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Submission failed. Please try again.');
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-md bg-[#c2873a] hover:bg-[#a3702f] text-white text-[12px] font-semibold px-4 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a] focus-visible:ring-offset-1"
          >
            {last ? finalLabel : 'Next'}
          </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
