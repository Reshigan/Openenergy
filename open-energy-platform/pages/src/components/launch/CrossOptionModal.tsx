import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { actOnRoleAction, type RoleAction } from '../../lib/roleActions';

export interface CrossOptionModalProps {
  /** The action whose cross_option drives the next step; null hides the sheet. */
  action: RoleAction | null;
  onClose: () => void;
  /** Called after the action is marked actioned, so the host can refresh its inbox. */
  onActioned?: (id: string) => void;
}

/** Append prefill values as query params to the cross-option target route. */
function withPrefill(route: string, prefill?: Record<string, unknown>): string {
  if (!prefill || Object.keys(prefill).length === 0) return route;
  const [path, existing] = route.split('?');
  const qs = new URLSearchParams(existing);
  for (const [k, v] of Object.entries(prefill)) {
    if (v != null) qs.set(k, String(v));
  }
  return `${path}?${qs.toString()}`;
}

export default function CrossOptionModal({ action, onClose, onActioned }: CrossOptionModalProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!action) return undefined;
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
    return () => document.removeEventListener('keydown', onKey);
  }, [action, onClose]);

  useEffect(() => {
    if (!action) return;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [action]);

  if (!action || !action.cross_option) return null;
  const co = action.cross_option;

  const doIt = async () => {
    setBusy(true);
    try { await actOnRoleAction(action.id, 'action'); } catch { /* surfaced on next inbox refresh */ }
    onActioned?.(action.id);
    const route = withPrefill(co.target_route, co.prefill);
    setBusy(false);
    navigate(route);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0b1c30]/40 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Suggested next step"
        ref={dialogRef}
        className="w-full sm:max-w-md bg-white border border-[#dde4ec] rounded-t-2xl sm:rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between px-5 py-3 border-b border-[#eef2f7]">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'oklch(0.55 0.008 250)' }}>Suggested next step</p>
            <h2 className="text-[14px] font-display font-semibold text-[#0f1c2e] mt-0.5">{action.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-md p-1.5 text-[#6b7685] hover:text-[#0f1c2e] hover:bg-[#eef2f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a]">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="px-5 py-4 text-[13px] text-[#3d4756] space-y-1">
          <p>
            From <span className="font-medium text-[#0f1c2e]">{action.source_chain_key ?? action.source_entity_type}</span>
            {' · '}{action.source_entity_id}
          </p>
          <p className="text-[12px] text-[#6b7685]">
            Completing this opens <span className="text-[#0f1c2e] font-medium">{co.target_route}</span>.
          </p>
        </div>

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#eef2f7]">
          <button type="button" onClick={onClose} disabled={busy}
            className="text-[12px] text-[#6b7685] hover:text-[#0f1c2e] px-3 py-1.5 rounded-md hover:bg-[#eef2f7] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a]">
            Later
          </button>
          <button type="button" onClick={() => void doIt()} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#c2873a] hover:bg-[#a3702f] text-white text-[12px] font-semibold px-4 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a] focus-visible:ring-offset-1">
            {co.action_label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </footer>
      </div>
    </div>
  );
}
