// primitives.tsx — shared low-level UI atoms used by all 4 directions.
//
// Every primitive here is built to Emil-Kowalski's rubric:
//   - Button   : transform: scale(0.97) on :active, transition transform only.
//   - Tooltip  : 125ms initial delay, then `data-instant` skips delay on
//                hover of an adjacent host.
//   - Kbd      : keycap chip used in tooltip hints (Cmd↑↓ / ⏎ / ⌘F)
//   - StateStrip: status-of-world strip always visible above the workstation.
//   - Drawer   : right-side surface used instead of modals for non-destructive
//                detail; CSS-driven entry via @starting-style.
//   - ConfirmModal: ONLY for destructive confirms (revoke, disconnect).
//
// All primitives use only `transform` and `opacity` for animation — never
// margin/padding/width/height — so the GPU does the work.

import React, { useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { useDensity } from './DensityContext';
import { StateOfWorld } from './SampleChainData';

/* ────────────────────────────── Button ─────────────────────────────── */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  type = 'button',
  title,
  style,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: BtnVariant;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  const styles: Record<BtnVariant, React.CSSProperties> = {
    primary:   { background: '#1a3a5c', color: '#fff',     border: '1px solid #1a3a5c' },
    secondary: { background: '#fff',    color: '#1a3a5c',  border: '1px solid #c5cdd6' },
    ghost:     { background: 'transparent', color: '#1a3a5c', border: '1px solid transparent' },
    danger:    { background: '#c0392b', color: '#fff',     border: '1px solid #c0392b' },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className="oe-btn"
      style={{
        ...styles[variant],
        padding: '6px 12px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────── Kbd ──────────────────────────────── */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.22)',
        boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.18)',
        color: '#dbe5f0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

/* ───────────────────────────── Tooltip ─────────────────────────────── */
// 125ms delay on first hover. data-instant attr flips to 0ms when the user
// is already scanning a row of tooltips — Emil's "skip delay after adjacent".

export function Tooltip({
  children,
  label,
  shortcut,
  position = 'top',
  instant,
}: {
  children: ReactNode;
  label: ReactNode;
  shortcut?: string;
  position?: 'top' | 'bottom' | 'right';
  instant?: boolean;
}) {
  const offset = position === 'right' ? { left: '100%', top: '50%', transform: 'translate(8px,-50%)' }
    : position === 'bottom' ? { top: '100%', left: '50%', transform: 'translate(-50%,8px)' }
    : { bottom: '100%', left: '50%', transform: 'translate(-50%,-8px)' };

  return (
    <span className="oe-tooltip-host" style={{ position: 'relative', display: 'inline-flex' }}>
      {children}
      <span
        role="tooltip"
        className="oe-tooltip"
        data-instant={instant ? 'true' : 'false'}
        style={{
          position: 'absolute',
          ...offset,
          background: '#0f2540',
          color: '#dbe5f0',
          padding: '5px 9px',
          borderRadius: 6,
          fontSize: 11.5,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 4px 14px rgba(15,28,46,0.30)',
        }}
      >
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </span>
    </span>
  );
}

/* ──────────────────────────── StateStrip ───────────────────────────── */

export function StateStrip({
  world,
  filterLabel,
  density,
  onToggleDensity,
  rightSlot,
}: {
  world: StateOfWorld;
  filterLabel?: string;
  density: 'compact' | 'comfortable';
  onToggleDensity: () => void;
  rightSlot?: ReactNode;
}) {
  const breachColor = world.breached > 0 ? '#c0392b' : '#6b7685';
  const imminentColor = world.imminent > 0 ? '#d97706' : '#6b7685';
  return (
    <div
      style={{
        height: 36,
        background: '#0a1c30',
        color: '#dbe5f0',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        fontSize: 12,
        gap: 16,
        borderBottom: '1px solid #0f2540',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <span
        className={world.breached > 0 ? 'oe-pulse' : ''}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: breachColor }}
        aria-label={`${world.breached} breached`}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: breachColor, display: 'inline-block' }} />
        <strong className="oe-num" style={{ minWidth: 18, display: 'inline-block' }}>{world.breached}</strong>
        <span style={{ opacity: 0.7 }}>breached</span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: imminentColor }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: imminentColor }} />
        <strong className="oe-num">{world.imminent}</strong>
        <span style={{ opacity: 0.7 }}>imminent</span>
      </span>
      <span style={{ opacity: 0.7 }}>
        <strong className="oe-num">{world.in_flight}</strong> in flight
      </span>
      <span style={{ opacity: 0.7 }}>
        <strong className="oe-num">{world.regulator_flagged}</strong> NERSA-flagged
      </span>
      {filterLabel ? (
        <span style={{ opacity: 0.55, borderLeft: '1px solid #1c344f', paddingLeft: 16 }}>{filterLabel}</span>
      ) : null}
      <span style={{ flex: 1 }} />
      {rightSlot}
      <Tooltip label="Toggle density" shortcut="⌘⇧D" position="bottom">
        <button
          type="button"
          className="oe-btn"
          onClick={onToggleDensity}
          aria-label="Toggle density"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 6,
            color: '#dbe5f0',
            padding: '3px 8px',
            fontSize: 11,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {density === 'compact' ? 'Compact' : 'Comfortable'}
        </button>
      </Tooltip>
    </div>
  );
}

/* ─────────────────────────────── Drawer ────────────────────────────── */
// Right-side drawer for non-destructive details. Uses @starting-style.
// Click backdrop, ESC, or close button to dismiss. Focus trapped lightly.

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    // Focus the drawer once mounted so screen readers + Tab nav land here.
    requestAnimationFrame(() => ref.current?.focus());
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : 'Detail drawer'}
      style={{ position: 'fixed', inset: 0, zIndex: 80 }}
    >
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,28,46,0.32)',
        }}
      />
      <div
        ref={ref}
        tabIndex={-1}
        className="oe-drawer-entry"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '95vw',
          background: '#ffffff',
          borderLeft: '1px solid #c5cdd6',
          boxShadow: '-10px 0 40px rgba(15,28,46,0.18)',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid #e3e8ee',
            gap: 8,
          }}
        >
          <div style={{ flex: 1, fontWeight: 700, color: '#0f1c2e', fontSize: 14 }}>{title}</div>
          <Tooltip label="Close" shortcut="esc" position="bottom">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="oe-btn"
              style={{
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 6,
                width: 28,
                height: 28,
                cursor: 'pointer',
                color: '#3d4756',
              }}
            >
              ×
            </button>
          </Tooltip>
        </header>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

/* ───────────────────────── ConfirmModal (destructive) ──────────────── */

export function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  title,
  body,
  confirmLabel = 'Confirm',
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel?: string;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div onClick={onCancel} aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(15,28,46,0.48)' }} />
      <div
        className="oe-modal-entry"
        style={{
          position: 'relative',
          width: 440,
          maxWidth: '92vw',
          background: '#fff',
          borderRadius: 10,
          padding: 20,
          boxShadow: '0 12px 40px rgba(15,28,46,0.30)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f1c2e', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#3d4756', marginBottom: 18, lineHeight: 1.5 }}>{body}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onCancel} variant="secondary">Cancel</Button>
          <Button onClick={onConfirm} variant="danger">{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── PrototypeShell ────────────────────────── */
// Tiny wrapper that wires up CSS link, sets data-density on its scope, and
// provides the consistent <header> with title + back-to-picker link.

export function PrototypeShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { density } = useDensity();
  return (
    <div
      data-density={density}
      style={{
        minHeight: '100vh',
        background: '#f5f8fb',
        color: '#0f1c2e',
        fontFamily: 'Inter Variable, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px',
          background: '#0f1c2e',
          color: '#fff',
          borderBottom: '1px solid #0f2540',
          gap: 14,
        }}
      >
        <a
          href="/ux-prototype"
          style={{
            color: '#9bc8ee',
            fontSize: 12,
            textDecoration: 'none',
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          ← Directions
        </a>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.2 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 11, color: '#9bc8ee' }}>{subtitle}</div> : null}
        </div>
      </header>
      {children}
    </div>
  );
}

/* ─────────────────── Inline edit cell (table-friendly) ─────────────── */
// Click to edit; Tab commits + moves on; Esc cancels. Used by the table view
// in cockpit-grid and time-axis.

export function InlineEdit({
  value,
  onCommit,
  width = 120,
  align = 'left',
  numeric,
}: {
  value: string | number;
  onCommit: (next: string) => void;
  width?: number;
  align?: 'left' | 'right';
  numeric?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== String(value)) onCommit(draft);
  }, [draft, value, onCommit]);

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
        className={numeric ? 'oe-num' : ''}
        style={{
          display: 'inline-block',
          width,
          textAlign: align,
          cursor: 'text',
          padding: '0 4px',
          borderRadius: 3,
        }}
      >
        {value}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          setDraft(String(value));
          setEditing(false);
        }
      }}
      className={numeric ? 'oe-num' : ''}
      style={{
        width,
        textAlign: align,
        padding: '0 4px',
        border: '1px solid #5fa8e8',
        borderRadius: 3,
        outline: 'none',
        font: 'inherit',
      }}
    />
  );
}
