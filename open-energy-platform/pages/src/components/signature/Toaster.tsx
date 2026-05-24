// Signature toast system — role-tinted, accessible.
//
// Notes:
//  - aria-live="polite" (toasts update constantly under live trading; assertive
//    would steal focus and is reserved for errors).
//  - Role accent comes from the surrounding <RoleShell> CSS vars, so toasts
//    automatically tint per role without each caller knowing the role.
//  - prefers-reduced-motion collapses springs to a static fade via the shared
//    motion helper.
//  - Single global provider via useToaster(); fire with toast({title, ...}).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { motionTransition } from '../../lib/motion';

export type ToastTone = 'info' | 'good' | 'warn' | 'bad';

export interface ToastOptions {
  title: string;
  body?: string;
  tone?: ToastTone;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastEntry extends ToastOptions {
  id: number;
}

interface ToasterContext {
  toast: (opts: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToasterContext | null>(null);

const TONE_COLORS: Record<ToastTone, { border: string; pip: string }> = {
  info: { border: 'var(--role-accent)', pip: 'var(--role-accent)' },
  good: { border: '#1f8a5b', pip: '#1f8a5b' },
  warn: { border: '#d97706', pip: '#d97706' },
  bad: { border: '#c0392b', pip: '#c0392b' },
};

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = ++counter.current;
      const entry: ToastEntry = { id, ...opts };
      setToasts((prev) => [...prev, entry]);
      const duration = opts.durationMs ?? 4500;
      if (duration > 0) {
        const handle = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, handle);
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const handles = timers.current;
    return () => {
      handles.forEach((h) => clearTimeout(h));
      handles.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          maxWidth: 'min(92vw, 380px)',
        }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const colors = TONE_COLORS[t.tone ?? 'info'];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={motionTransition('snap')}
                style={{
                  pointerEvents: 'auto',
                  background: 'var(--role-surface, #ffffff)',
                  color: 'var(--role-on-surface, #0f1c2e)',
                  border: `1px solid var(--role-border, rgba(15,28,46,0.10))`,
                  borderLeft: `3px solid ${colors.border}`,
                  borderRadius: 'var(--oe-radius-card, 8px)',
                  padding: '12px 14px',
                  boxShadow: '0 8px 24px rgba(10, 22, 34, 0.18)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: colors.pip,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{t.title}</span>
                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss notification"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--role-on-surface-muted, #6b7685)',
                      cursor: 'pointer',
                      fontSize: 16,
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
                {t.body ? (
                  <div style={{ fontSize: 12, color: 'var(--role-on-surface-muted, #6b7685)', lineHeight: 1.4 }}>
                    {t.body}
                  </div>
                ) : null}
                {t.action ? (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                    style={{
                      alignSelf: 'flex-start',
                      marginTop: 4,
                      background: 'transparent',
                      border: 'none',
                      color: colors.border,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    {t.action.label}
                  </button>
                ) : null}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToaster(): ToasterContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      toast: (opts) => {
        if (typeof console !== 'undefined') {
          console.warn('[Toaster] called outside ToasterProvider:', opts.title);
        }
      },
      dismiss: () => {},
    };
  }
  return ctx;
}
