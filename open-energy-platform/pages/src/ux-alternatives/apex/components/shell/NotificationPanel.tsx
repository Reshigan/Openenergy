import React, { useEffect, useState } from 'react';
import { OeIcon } from '../icons/Icons';
import { apexClient } from '../../lib/client';
import type { NotificationItem } from '../../lib/client';
import { api } from '../../../../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  // Fetch when panel opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    apexClient.notifications
      .list()
      .then(data => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load notifications');
        setLoading(false);
      });
  }, [open]);

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (open && e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.post('/notifications/mark-all-read');
      setItems(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // silently ignore — not worth blocking the UI
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = items.filter(n => !n.read).length;

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

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 201,
          width: 'min(400px, 100vw)',
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--oe-text-1)',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '18px',
                  height: '18px',
                  padding: '0 5px',
                  borderRadius: '9px',
                  background: 'var(--oe-rose)',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'var(--oe-font-mono)',
                  lineHeight: 1,
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {items.length > 0 && unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                style={{
                  background: 'none',
                  border: '1px solid var(--oe-border)',
                  borderRadius: '6px',
                  color: 'var(--oe-text-3)',
                  fontSize: '11px',
                  padding: '4px 10px',
                  cursor: markingAll ? 'not-allowed' : 'pointer',
                  opacity: markingAll ? 0.6 : 1,
                  transition: 'all 80ms',
                  whiteSpace: 'nowrap',
                }}
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
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

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Loading skeleton */}
          {loading && (
            <div style={{ padding: '8px 0' }}>
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--oe-border)',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Unread dot placeholder */}
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '3px',
                      background: 'var(--oe-surf-2)',
                      marginTop: '5px',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div
                      style={{
                        height: '12px',
                        borderRadius: '4px',
                        background: 'var(--oe-surf-2)',
                        width: `${65 + i * 8}%`,
                        animation: 'oe-shimmer 1.4s ease-in-out infinite',
                      }}
                    />
                    <div
                      style={{
                        height: '10px',
                        borderRadius: '4px',
                        background: 'var(--oe-surf-2)',
                        width: `${45 + i * 5}%`,
                        animation: 'oe-shimmer 1.4s ease-in-out infinite',
                        animationDelay: `${i * 0.12}s`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                color: 'var(--oe-rose)',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <OeIcon name="x-circle" size={20} color="var(--oe-rose)" />
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && items.length === 0 && (
            <div
              style={{
                padding: '60px 20px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <OeIcon name="bell" size={28} color="var(--oe-text-4)" />
              <span style={{ fontSize: '13px', color: 'var(--oe-text-3)' }}>
                You're all caught up
              </span>
            </div>
          )}

          {/* Notification list */}
          {!loading && !error && items.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map(n => (
                <li
                  key={n.id}
                  style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--oe-border)',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    background: n.read ? 'transparent' : 'var(--oe-surf)',
                    transition: 'background 80ms',
                  }}
                >
                  {/* Unread dot */}
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '3px',
                      background: n.read ? 'transparent' : 'var(--oe-rose)',
                      marginTop: '5px',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--oe-text-1)',
                        marginBottom: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {n.title}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--oe-text-2)',
                        lineHeight: 1.4,
                        marginBottom: '4px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {n.body}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--oe-text-3)',
                        fontFamily: 'var(--oe-font-mono)',
                      }}
                    >
                      {relTime(n.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Shimmer keyframes — injected once */}
      <style>{`
        @keyframes oe-shimmer {
          0%   { opacity: 0.55; }
          50%  { opacity: 1; }
          100% { opacity: 0.55; }
        }
      `}</style>
    </>
  );
}

export default NotificationPanel;
