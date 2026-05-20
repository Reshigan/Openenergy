// ════════════════════════════════════════════════════════════════════════
// stepUp — tiny event bus shared between the axios interceptor and the
// global <StepUpModal/>. The interceptor calls requestStepUp(op_type),
// awaits the Promise, and retries the failed request iff success === true.
// ════════════════════════════════════════════════════════════════════════

type Listener = (opType: string | null) => void;

const listeners = new Set<Listener>();
let pendingResolver: ((ok: boolean) => void) | null = null;

export function subscribeStepUp(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Open the modal for the given op_type. Resolves true if the user
 * completed a fresh challenge; false if they cancelled.
 *
 * Concurrent step-up requests collapse: while one challenge is in
 * progress, any new request awaits the same resolver.
 */
export function requestStepUp(opType: string): Promise<boolean> {
  if (pendingResolver) {
    // A challenge is already open — wait for it.
    return new Promise<boolean>((resolve) => {
      const prev = pendingResolver;
      pendingResolver = (ok) => { prev?.(ok); resolve(ok); };
    });
  }
  return new Promise<boolean>((resolve) => {
    pendingResolver = resolve;
    listeners.forEach((cb) => cb(opType));
  });
}

/** Called by <StepUpModal/> when the user finishes (success or cancel). */
export function resolveStepUp(_opType: string, ok: boolean): void {
  const r = pendingResolver;
  pendingResolver = null;
  listeners.forEach((cb) => cb(null));
  r?.(ok);
}
