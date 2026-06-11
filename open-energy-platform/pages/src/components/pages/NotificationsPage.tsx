// ════════════════════════════════════════════════════════════════════════
// NotificationsPage — /notifications. The inbox triggered by the shell-
// bar bell. Read-on-click + "Mark all read" sweeps the badge.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, MailOpen, Inbox } from 'lucide-react';
import { api } from '../../lib/api';

const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_BG  = 'oklch(0.96 0.05 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const BLUE    = 'oklch(0.45 0.18 250)';
const BLUE_BG = 'oklch(0.95 0.04 250)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: string | null; // JSON
  read: 0 | 1;
  created_at: string;
};

export function NotificationsPage() {
  const [status, setStatus] = useState<'unread' | 'read' | 'all'>('unread');
  const [rows, setRows] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`/notifications?status=${status}&limit=100`);
      setRows((r.data?.data?.notifications || []) as Notification[]);
      setUnread(Number(r.data?.data?.unread_count || 0));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [status]);

  const markOne = async (id: string) => {
    await api.post(`/notifications/${id}/read`, {});
    setRows((rs) => rs.map((n) => n.id === id ? { ...n, read: 1 } : n));
    setUnread((u) => Math.max(0, u - 1));
  };
  const markAll = async () => {
    await api.post('/notifications/mark-all-read', {});
    void load();
  };

  const hrefForData = (n: Notification): string | null => {
    if (!n.data) return null;
    try {
      const d = JSON.parse(n.data) as Record<string, string>;
      if (d.href) return d.href;
      if (d.invoice_id) return `/settlement/invoices/${d.invoice_id}`;
      if (d.contract_id) return `/contracts/${d.contract_id}`;
      if (d.project_id) return `/projects/${d.project_id}`;
      if (d.loi_id) return `/lois/${d.loi_id}`;
      if (d.order_id) return `/trading/orders/${d.order_id}`;
      if (d.ticket_id) return `/support/tickets/${d.ticket_id}`;
    } catch { /* ignore */ }
    return null;
  };

  const readCount = rows.filter((n) => n.read === 1).length;
  const totalCount = rows.length;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* LEFT COLUMN */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Bell size={18} style={{ color: ACC }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: TX3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inbox</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Notifications</h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            {unread > 0 ? `${unread} unread message${unread > 1 ? 's' : ''}` : 'All caught up.'}
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Unread</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: unread > 0 ? BLUE : TX1, fontFamily: MONO, marginTop: 4 }}>{unread}</div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Read</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{readCount}</div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{totalCount}</div>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div style={{ background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 6, padding: '10px 14px', fontSize: 12, color: BAD, marginBottom: 16 }}>
            {err}
          </div>
        )}

        {/* Notification list */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px', height: 72, opacity: 1 - i * 0.1 }}>
                <div style={{ background: BG2, borderRadius: 4, height: 12, width: '40%', marginBottom: 8 }} />
                <div style={{ background: BG2, borderRadius: 4, height: 10, width: '70%' }} />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '48px 24px', textAlign: 'center',
          }}>
            <Bell size={32} style={{ color: TX3, marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: TX1, marginBottom: 6 }}>
              {status === 'unread' ? 'No unread notifications' : 'No notifications'}
            </div>
            <div style={{ fontSize: 13, color: TX2 }}>
              System events, mentions, settlement confirmations and regulatory updates land here.
            </div>
          </div>
        ) : (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            {rows.map((n, i) => {
              const href = hrefForData(n);
              const rowBg = n.read ? 'transparent' : BLUE_BG;
              const rowBgAlt = n.read ? BG2 : 'oklch(0.94 0.05 250)';
              const bg = i % 2 === 1 ? rowBgAlt : rowBg;

              const Inner = (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: bg }}>
                  <div style={{ marginTop: 2, flexShrink: 0 }}>
                    {n.read
                      ? <MailOpen size={15} style={{ color: TX3 }} />
                      : <Inbox size={15} style={{ color: BLUE }} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: n.read ? 400 : 600,
                      color: n.read ? TX2 : TX1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 12, color: TX2, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: TX3, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                      <span style={{ color: BORDER }}>·</span>
                      <span style={{ fontFamily: MONO }}>{n.type}</span>
                    </div>
                  </div>
                  {!n.read && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void markOne(n.id); }}
                      style={{ fontSize: 11, color: BLUE, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', flexShrink: 0, fontWeight: 600 }}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              );

              return (
                <div key={n.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  {href ? (
                    <Link to={href} style={{ display: 'block', textDecoration: 'none' }} onClick={() => !n.read && void markOne(n.id)}>
                      {Inner}
                    </Link>
                  ) : (
                    Inner
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Filter toggle */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Filter
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['unread', 'read', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                style={{
                  background: status === s ? ACC_BG : 'transparent',
                  color: status === s ? ACC : TX2,
                  border: status === s ? `1px solid ${ACC}` : `1px solid ${BORDER}`,
                  borderRadius: 6,
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: status === s ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  {s === 'unread' ? 'Unread' : s === 'read' ? 'Read' : 'All'}
                </span>
                {s === 'unread' && unread > 0 && (
                  <span style={{
                    background: BLUE_BG, color: BLUE,
                    fontSize: 11, fontWeight: 700, fontFamily: MONO,
                    padding: '1px 6px', borderRadius: 10,
                  }}>
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Actions
          </div>
          <button
            type="button"
            onClick={markAll}
            disabled={unread === 0}
            style={{
              background: unread > 0 ? ACC : BG2,
              color: unread > 0 ? '#fff' : TX3,
              border: 'none',
              padding: '9px 16px',
              borderRadius: 6,
              fontWeight: 600,
              cursor: unread > 0 ? 'pointer' : 'not-allowed',
              fontSize: 13,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
            }}
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        </div>

        {/* Summary */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TX2 }}>Unread</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: unread > 0 ? BLUE : TX1, fontFamily: MONO }}>{unread}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TX2 }}>Read</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: TX1, fontFamily: MONO }}>{readCount}</span>
            </div>
            <div style={{ height: 1, background: BORDER }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: TX2 }}>Showing</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: TX1, fontFamily: MONO }}>{totalCount}</span>
            </div>
          </div>
        </div>

        {/* Info */}
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: TX3, lineHeight: 1.6 }}>
            System events, settlement confirmations, regulatory updates and mentions appear here. Click a notification to navigate to the related record.
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotificationsPage;
