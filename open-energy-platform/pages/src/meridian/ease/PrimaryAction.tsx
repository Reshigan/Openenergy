// pages/src/meridian/ease/PrimaryAction.tsx — Ease Kit one-tap duty button.
// The time-to-action primitive, extracted verbatim from Horizon's act() so every
// surface fires a chain transition the same way:
//   • fielded action (needs a reason/quantum/evidence) → hand to the Thread drawer
//     (?act=) which has the schema-driven form — a bare click would 409;
//   • oxide (destructive) tone → confirm first;
//   • otherwise → inline POST the chain endpoint + caller-supplied refresh, with a
//     busy-lock so a double-click can't double-fire the transition.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import '../meridian.css';

export interface PrimaryActionTarget { chain: string; id: string; ref?: string }
export interface PrimaryActionDef {
  action: string;
  label: string;
  path: string;            // registry path, e.g. /api/<prefix>/<chain>/:id/<verb>
  cascadeHint?: string;
  tone?: string;           // 'oxide' = destructive → confirm
  fields?: unknown[];      // non-empty → fielded → route to Thread form
}

export function PrimaryAction({ target, action, onActed, onError, disabled, className }: {
  target: PrimaryActionTarget;
  action: PrimaryActionDef;
  onActed?: () => void | Promise<void>;   // refresh after a successful inline POST
  onError?: (msg: string) => void;        // state-machine 409s surface here
  disabled?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const fielded = !!action.fields?.length;
  const oxide = action.tone === 'oxide';

  async function run() {
    if (fielded) {
      navigate(`/thread/${target.chain}/${target.id}?act=${encodeURIComponent(action.action)}`);
      return;
    }
    if (oxide && !window.confirm(
      `${action.label}${target.ref ? ` — ${target.ref}` : ''}?\nThis transition may be hard to reverse.`,
    )) return;
    setBusy(true);
    try {
      await api.post(action.path.replace('/api', '').replace(':id', target.id), {});
      await onActed?.();
    } catch (e: any) {
      onError?.(e?.response?.data?.error ?? e?.message ?? 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={className ?? (oxide ? 'btn ox' : 'btn pri')}
      title={fielded ? `${action.cascadeHint ?? ''} — opens the form` : action.cascadeHint}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={run}
    >
      {busy ? '…' : fielded ? `${action.label}…` : action.label}
    </button>
  );
}
