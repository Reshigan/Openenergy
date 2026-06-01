import React, { useState, useEffect } from 'react';
import { OeIcon, IconName } from '../icons/Icons';
import { StatusPill, PillVariant } from './StatusPill';

export interface DrawerField {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  span?: boolean;
}

export interface DrawerAction {
  id: string;
  label: string;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger';
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  form?: React.ReactNode;
}

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  entityRef?: string;
  status?: string;
  statusVariant?: PillVariant;
  fields?: DrawerField[];
  actions?: DrawerAction[];
  children?: React.ReactNode;
  onActionComplete?: () => void;
}

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  entityRef,
  status,
  statusVariant = 'default',
  fields = [],
  actions = [],
  children,
  onActionComplete,
}: DetailDrawerProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setActionLoading(null);
      setActionError(null);
      setActionDone(null);
      setFormOpen(null);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (open && e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleAction = async (action: DrawerAction) => {
    if (action.disabled || actionLoading) return;
    if (action.form) {
      setFormOpen(prev => (prev === action.id ? null : action.id));
      return;
    }
    setActionLoading(action.id);
    setActionError(null);
    setActionDone(null);
    try {
      await action.onClick();
      setActionDone(action.id);
      onActionComplete?.();
      setTimeout(() => setActionDone(null), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setActionError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const pillMap: Record<string, PillVariant> = {
    active: 'green', approved: 'green', issued: 'green', settled: 'green',
    complete: 'green', completed: 'green', compliant: 'green', closed: 'green',
    issued_to_market: 'green', commercial_operation: 'green', deployed: 'green',
    pending: 'amber', submitted: 'amber', in_progress: 'amber', reviewing: 'amber',
    assessment: 'amber', validating: 'amber', negotiating: 'amber', pending_approval: 'amber',
    overdue: 'rose', breached: 'rose', rejected: 'rose', defaulted: 'rose',
    failed: 'rose', lapsed: 'rose', cancelled: 'rose', suspended: 'rose',
    escalated: 'rose', enforcement: 'rose',
    draft: 'default', open: 'blue', new: 'blue', filed: 'blue', registered: 'blue',
  };

  const resolvedVariant: PillVariant =
    status ? (pillMap[status] ?? statusVariant) : statusVariant;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: 'rgba(11,31,58,0.35)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
          backdropFilter: 'blur(1px)',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 201,
          width: 'min(520px, 100vw)',
          background: 'var(--oe-surface)',
          borderLeft: '1px solid var(--oe-border)',
          boxShadow: '-12px 0 40px rgba(11,31,58,0.18)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--oe-border)',
            background: 'var(--oe-surf)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {entityRef && (
                <div
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--oe-font-mono)',
                    color: 'var(--oe-text-3)',
                    marginBottom: '3px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {entityRef}
                </div>
              )}
              <h2
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--oe-text-1)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </h2>
              {subtitle && (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--oe-text-3)',
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {subtitle}
                </div>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
                marginTop: '2px',
              }}
            >
              {status && (
                <StatusPill label={status.replace(/_/g, ' ')} variant={resolvedVariant} size="md" />
              )}
              <button
                onClick={onClose}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '1px solid var(--oe-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--oe-text-3)',
                  flexShrink: 0,
                }}
              >
                <OeIcon name="close" size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Fields grid */}
          {fields.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1px',
                background: 'var(--oe-border)',
                borderRadius: 'var(--oe-r-card)',
                overflow: 'hidden',
                border: '1px solid var(--oe-border)',
              }}
            >
              {fields.map((f, i) => (
                <div
                  key={i}
                  style={{
                    gridColumn: f.span ? '1 / -1' : undefined,
                    padding: '10px 14px',
                    background: 'var(--oe-canvas)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      color: 'var(--oe-text-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: '3px',
                    }}
                  >
                    {f.label}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--oe-text-1)',
                      fontFamily: f.mono ? 'var(--oe-font-mono)' : undefined,
                      lineHeight: 1.4,
                    }}
                  >
                    {f.value ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Custom content */}
          {children}

          {/* Actions */}
          {actions.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: 'var(--oe-text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '8px',
                }}
              >
                Actions
              </div>

              {actionError && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'var(--oe-rose-bg)',
                    border: '1px solid var(--oe-rose)',
                    borderRadius: '6px',
                    color: 'var(--oe-rose)',
                    fontSize: '12px',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <OeIcon name="x-circle" size={12} />
                  {actionError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {actions.map(action => {
                  const isFormAction = !!action.form;
                  const isFormOpen = formOpen === action.id;
                  const isLoading = actionLoading === action.id;
                  const isDone = actionDone === action.id;
                  const variant = action.variant ?? 'secondary';

                  const btnBg =
                    variant === 'primary'
                      ? 'var(--oe-navy-1)'
                      : variant === 'danger'
                      ? 'var(--oe-rose-bg)'
                      : isFormOpen
                      ? 'var(--oe-surf-2)'
                      : 'var(--oe-canvas)';

                  const btnColor =
                    variant === 'primary'
                      ? '#fff'
                      : variant === 'danger'
                      ? 'var(--oe-rose)'
                      : 'var(--oe-text-1)';

                  const btnBorder =
                    variant === 'primary'
                      ? 'var(--oe-navy-1)'
                      : variant === 'danger'
                      ? 'var(--oe-rose)'
                      : 'var(--oe-border)';

                  return (
                    <div key={action.id}>
                      <button
                        onClick={() => handleAction(action)}
                        disabled={!!action.disabled || !!actionLoading}
                        title={action.disabled ? action.disabledReason : undefined}
                        style={{
                          width: '100%',
                          padding: '9px 14px',
                          borderRadius: '8px',
                          border: `1px solid ${btnBorder}`,
                          background: btnBg,
                          color: btnColor,
                          cursor:
                            action.disabled || actionLoading ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '13px',
                          fontWeight: 500,
                          textAlign: 'left',
                          opacity: action.disabled ? 0.45 : 1,
                          transition: 'all 120ms ease',
                        }}
                      >
                        {isDone ? (
                          <OeIcon name="check-circle" size={14} color="var(--oe-green)" />
                        ) : action.icon ? (
                          <OeIcon name={action.icon} size={14} />
                        ) : null}
                        <span style={{ flex: 1 }}>
                          {isDone ? 'Done' : action.label}
                        </span>
                        {isLoading && (
                          <span
                            style={{
                              fontSize: '10px',
                              color:
                                variant === 'primary' ? 'rgba(255,255,255,0.7)' : 'var(--oe-text-3)',
                            }}
                          >
                            …
                          </span>
                        )}
                        {isFormAction && !isLoading && (
                          <OeIcon
                            name={isFormOpen ? 'chevron-down' : 'chevron-right'}
                            size={12}
                          />
                        )}
                      </button>
                      {isFormAction && isFormOpen && (
                        <div
                          style={{
                            marginTop: '4px',
                            padding: '14px',
                            background: 'var(--oe-surf)',
                            border: '1px solid var(--oe-border)',
                            borderRadius: '8px',
                          }}
                        >
                          {action.form}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
