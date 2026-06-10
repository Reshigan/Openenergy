// Accessible drop-in replacement for window.prompt() / window.confirm(). Chain-tab
// action handlers historically chained synchronous window.prompt()/confirm() calls
// to collect field values before POSTing — that blocks the main thread, can't be
// styled or read by screen readers, and is suppressed by some browsers/embedders.
// `prompt()` / `confirmDialog()` return Promises with the same call shape so
// existing `const x = window.prompt(...)` / `window.confirm(...)` call sites become
// `await prompt(...)` / `await confirmDialog(...)` with no other handler changes.
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PromptRequest {
  id: number;
  kind: 'prompt';
  message: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
}

interface ConfirmRequest {
  id: number;
  kind: 'confirm';
  message: string;
  resolve: (value: boolean) => void;
}

type DialogRequest = PromptRequest | ConfirmRequest;

let nextId = 0;
let listeners: Array<(req: DialogRequest) => void> = [];

function dispatch(req: DialogRequest) {
  listeners.forEach((listener) => listener(req));
}

export function prompt(message: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    dispatch({ id: ++nextId, kind: 'prompt', message, defaultValue, resolve });
  });
}

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    dispatch({ id: ++nextId, kind: 'confirm', message, resolve });
  });
}

export function PromptHost() {
  const [active, setActive] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const handler = (req: DialogRequest) => {
      setActive(req);
      setValue(req.kind === 'prompt' ? req.defaultValue : '');
    };
    listeners.push(handler);
    return () => { listeners = listeners.filter((l) => l !== handler); };
  }, []);

  const closePrompt = useCallback((result: string | null) => {
    setActive((current) => {
      if (current?.kind === 'prompt') current.resolve(result);
      return null;
    });
  }, []);

  const closeConfirm = useCallback((result: boolean) => {
    setActive((current) => {
      if (current?.kind === 'confirm') current.resolve(result);
      return null;
    });
  }, []);

  const cancel = useCallback(() => {
    setActive((current) => {
      if (current?.kind === 'prompt') current.resolve(null);
      else if (current?.kind === 'confirm') current.resolve(false);
      return null;
    });
  }, []);

  if (!active) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
      >
        <h3 id="prompt-dialog-title" className="mb-3 text-sm font-semibold text-[#0f1c2e]">{active.message}</h3>
        {active.kind === 'prompt' ? (
          <>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') closePrompt(value); }}
              className="mb-4 w-full rounded border border-[#cbd5e1] px-3 py-2 text-sm text-[#0f1c2e] focus:border-[#c2873a] focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => closePrompt(null)} className="rounded px-3 py-1.5 text-sm text-[#4a5568] hover:bg-[#f1f5f9]">
                Cancel
              </button>
              <button type="button" onClick={() => closePrompt(value)} className="rounded bg-[#c2873a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#a3702f]">
                OK
              </button>
            </div>
          </>
        ) : (
          <div className="flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => closeConfirm(false)} className="rounded px-3 py-1.5 text-sm text-[#4a5568] hover:bg-[#f1f5f9]">
              No
            </button>
            <button type="button" onClick={() => closeConfirm(true)} className="rounded bg-[#c2873a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#a3702f]">
              Yes
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
