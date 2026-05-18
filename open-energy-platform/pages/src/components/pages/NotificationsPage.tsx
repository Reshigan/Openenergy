// ════════════════════════════════════════════════════════════════════════
// NotificationsPage — /notifications. The inbox triggered by the shell-
// bar bell. Read-on-click + "Mark all read" sweeps the badge.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, MailOpen, Inbox } from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';
import { EmptyState } from '../EmptyState';
import { Skeleton } from '../Skeleton';

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

  return (
    <StitchPage
      eyebrowIcon={Bell}
      eyebrowLabel="Inbox"
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread` : 'All caught up.'}
      actions={
        <>
          <div className="inline-flex items-center gap-1 bg-white border border-[#dde4ec] rounded-lg p-1">
            {(['unread', 'read', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`h-8 px-3 rounded-md text-[12px] font-semibold ${status === s ? 'bg-[#1a3a5c] text-white' : 'text-[#3d4756] hover:bg-[#eef2f7]'}`}
              >
                {s === 'unread' ? `Unread${unread > 0 ? ` (${unread})` : ''}` : s === 'read' ? 'Read' : 'All'}
              </button>
            ))}
          </div>
          <button
            onClick={markAll}
            disabled={unread === 0}
            className="h-9 px-3 rounded-md bg-white border border-[#dde4ec] text-[12px] font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <CheckCheck size={14} /> Mark all read
          </button>
        </>
      }
    >
      {err && <div className="text-[12px] text-red-700">{err}</div>}
      {loading ? (
        <Skeleton variant="card" rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={status === 'unread' ? 'No unread notifications' : 'No notifications'}
          description="System events, mentions, settlement confirmations and regulatory updates land here."
        />
      ) : (
        <ul className="rounded-xl border border-[#dde4ec] bg-white divide-y divide-[#eef2f7] overflow-hidden">
          {rows.map((n) => {
            const href = hrefForData(n);
            const Body = (
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5">
                  {n.read ? <MailOpen size={16} className="text-[#6b7685]" /> : <Inbox size={16} className="text-[#3b82c4]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] ${n.read ? 'text-[#6b7685]' : 'text-[#0f1c2e] font-semibold'} truncate`}>
                    {n.title}
                  </div>
                  {n.body && <div className="text-[12px] text-[#6b7685] mt-0.5 line-clamp-2">{n.body}</div>}
                  <div className="text-[10px] text-[#6b7685] mt-1">
                    {new Date(n.created_at).toLocaleString()} · <span className="font-mono">{n.type}</span>
                  </div>
                </div>
                {!n.read && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void markOne(n.id); }}
                    className="text-[11px] text-[#3b82c4] hover:underline"
                  >
                    Mark read
                  </button>
                )}
              </div>
            );
            return (
              <li key={n.id} className={`${n.read ? '' : 'bg-[#fafdff]'}`}>
                {href ? (
                  <Link to={href} className="block hover:bg-[#f8fafc]" onClick={() => !n.read && void markOne(n.id)}>{Body}</Link>
                ) : (
                  <div>{Body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </StitchPage>
  );
}
