import React, { useCallback, useEffect, useState } from 'react';
import {
  Sun, RefreshCw, CheckCheck, Send, AlertTriangle, Bell, FileText, TrendingUp, Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';

interface ActionItem {
  id: string;
  type: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  entity_type: string;
  entity_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  created_at: string;
}

interface IntelItem {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  action_required: 0 | 1;
  created_at: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  created_at: string;
}

interface InvoiceDue {
  id: string;
  invoice_number: string;
  total_amount: number;
  due_date: string;
  status: string;
}

interface TradeRecent {
  id: string;
  matched_price: number;
  matched_volume_mwh: number;
  matched_at: string;
  energy_type: string;
}

interface MarketSnapshot {
  [key: string]: { price_zar_per_mwh: number; volume_mwh: number };
}

interface Briefing {
  date: string;
  role: string;
  summary: string;
  markets: MarketSnapshot;
  action_items: ActionItem[];
  intelligence: IntelItem[];
  notifications: Notification[];
  invoices_due: InvoiceDue[];
  recent_trades: TradeRecent[];
}

const PRIORITY_PILL: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  normal: 'bg-blue-100 text-blue-800',
  low: 'bg-gray-100 text-gray-700',
};

const SEV_PILL: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  warning: 'bg-yellow-100 text-yellow-800',
  info: 'bg-blue-100 text-blue-800',
};

function actionDeepLink(a: ActionItem): string {
  switch (a.entity_type) {
    case 'contract_documents': return `/contracts/${a.entity_id}`;
    case 'loi_drafts': return `/lois/${a.entity_id}`;
    case 'invoices': return '/settlement';
    case 'marketplace_listings': return '/marketplace';
    case 'ipp_projects': return '/projects';
    case 'trade_orders':
    case 'trade_matches': return '/trading';
    case 'grid_constraints':
    case 'grid_connections':
    case 'grid_wheeling_agreements': return '/grid';
    default: return '/cockpit';
  }
}

export function Briefing() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/briefing');
      setBriefing(res.data?.data || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load briefing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);

  const markAllRead = async () => {
    try {
      await api.post('/briefing/mark-read', {});
      await fetchBriefing();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to mark read');
    }
  };

  const sendBriefing = async () => {
    setSending(true);
    try {
      await api.post('/briefing/send', {});
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to queue briefing');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={6} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchBriefing} /></div>;
  if (!briefing) return <div className="p-6"><EmptyState icon={<Sun className="w-8 h-8" />} title="No briefing" description="Your briefing will populate once you have active items." /></div>;

  const dateLabel = new Date(briefing.date).toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Sun size={22} className="text-ionex-brand" /> Daily briefing</h1>
          <p className="text-ionex-text-mute">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={markAllRead} className="flex items-center gap-2 px-3 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50 text-sm">
            <CheckCheck size={14} /> Mark all read
          </button>
          <button onClick={sendBriefing} disabled={sending} className="flex items-center gap-2 px-3 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand/90 disabled:opacity-50 text-sm">
            <Send size={14} /> {sending ? 'Queuing…' : sent ? 'Queued' : 'Send to inbox'}
          </button>
          <button onClick={fetchBriefing} className="flex items-center gap-2 px-3 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50 text-sm">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-ionex-border-100 bg-gradient-to-r from-blue-50 to-green-50 p-5">
        <div className="text-xs uppercase tracking-wide text-ionex-text-mute mb-2">Summary for {briefing.role.replace(/_/g, ' ')}</div>
        <p className="text-lg text-gray-900">{briefing.summary}</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ionex-text-sub mb-2 flex items-center gap-2"><TrendingUp size={14} /> Market snapshot (7-day average)</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(briefing.markets).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-ionex-border-100 bg-white p-3">
              <div className="text-[11px] uppercase text-ionex-text-mute">{k}</div>
              <div className="text-lg font-semibold">R{v.price_zar_per_mwh}</div>
              <div className="text-[11px] text-ionex-text-mute">{v.volume_mwh > 0 ? `${v.volume_mwh.toLocaleString()} MWh matched` : 'no matches'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section icon={<AlertTriangle size={16} className="text-orange-600" />} title={`Action items (${briefing.action_items.length})`}>
          {briefing.action_items.length === 0 ? <EmptyMini label="No pending actions" />
            : (
              <ul className="divide-y divide-ionex-border-100">
                {briefing.action_items.map(a => (
                  <li key={a.id} className="py-3">
                    <Link to={actionDeepLink(a)} className="flex items-start justify-between gap-3 hover:bg-gray-50 rounded -mx-2 px-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${PRIORITY_PILL[a.priority]}`}>{a.priority}</span>
                          <span className="font-medium truncate">{a.title}</span>
                        </div>
                        {a.description && <div className="text-xs text-ionex-text-mute mt-1 truncate">{a.description}</div>}
                      </div>
                      {a.due_date && <span className="text-[11px] text-ionex-text-mute whitespace-nowrap"><Clock size={10} className="inline mr-0.5" />{new Date(a.due_date).toLocaleDateString()}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Section>

        <Section icon={<AlertTriangle size={16} className="text-red-600" />} title={`Intelligence (${briefing.intelligence.length})`}>
          {briefing.intelligence.length === 0 ? <EmptyMini label="No intelligence alerts" />
            : (
              <ul className="divide-y divide-ionex-border-100">
                {briefing.intelligence.map(i => (
                  <li key={i.id} className="py-3">
                    <div className="flex items-start gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${SEV_PILL[i.severity]}`}>{i.severity}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{i.title}</div>
                        {i.description && <div className="text-xs text-ionex-text-mute mt-0.5 line-clamp-2">{i.description}</div>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </Section>

        <Section icon={<FileText size={16} className="text-blue-600" />} title={`Invoices due (${briefing.invoices_due.length})`}>
          {briefing.invoices_due.length === 0 ? <EmptyMini label="No invoices due in 14 days" />
            : (
              <ul className="divide-y divide-ionex-border-100">
                {briefing.invoices_due.map(inv => {
                  const dueIn = Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000);
                  return (
                    <li key={inv.id} className="py-3">
                      <Link to="/settlement" className="flex items-center justify-between gap-3 hover:bg-gray-50 rounded -mx-2 px-2">
                        <div>
                          <div className="font-medium">{inv.invoice_number}</div>
                          <div className="text-xs text-ionex-text-mute capitalize">{inv.status}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">R{Number(inv.total_amount).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</div>
                          <div className={`text-[11px] ${dueIn < 0 ? 'text-red-600' : dueIn < 7 ? 'text-orange-600' : 'text-ionex-text-mute'}`}>
                            {dueIn < 0 ? `${Math.abs(dueIn)} days overdue` : dueIn === 0 ? 'due today' : `due in ${dueIn} day${dueIn === 1 ? '' : 's'}`}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
        </Section>

        <Section icon={<Bell size={16} className="text-ionex-brand" />} title={`Unread notifications (${briefing.notifications.length})`}>
          {briefing.notifications.length === 0 ? <EmptyMini label="Inbox is clear" />
            : (
              <ul className="divide-y divide-ionex-border-100">
                {briefing.notifications.map(n => (
                  <li key={n.id} className="py-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{n.title}</div>
                        {n.body && <div className="text-xs text-ionex-text-mute mt-0.5 line-clamp-2">{n.body}</div>}
                      </div>
                      <span className="text-[11px] text-ionex-text-mute whitespace-nowrap">{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </Section>

        {briefing.recent_trades.length > 0 && (
          <Section icon={<TrendingUp size={16} className="text-green-600" />} title={`Recent trades (${briefing.recent_trades.length})`}>
            <ul className="divide-y divide-ionex-border-100">
              {briefing.recent_trades.map(t => (
                <li key={t.id} className="py-3">
                  <Link to="/trading" className="flex items-center justify-between gap-3 hover:bg-gray-50 rounded -mx-2 px-2">
                    <div>
                      <div className="font-medium capitalize">{t.energy_type}</div>
                      <div className="text-xs text-ionex-text-mute">{new Date(t.matched_at).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">R{Math.round(t.matched_price)}/MWh</div>
                      <div className="text-[11px] text-ionex-text-mute">{t.matched_volume_mwh} MWh</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ionex-border-100 bg-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ionex-border-100">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

function EmptyMini({ label }: { label: string }) {
  return <div className="py-6 text-center text-sm text-ionex-text-mute">{label}</div>;
}
