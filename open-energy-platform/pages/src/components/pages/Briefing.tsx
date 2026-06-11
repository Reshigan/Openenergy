import React, { useCallback, useEffect, useState } from 'react';
import {
  Sun, RefreshCw, CheckCheck, Send, AlertTriangle, Bell, FileText, TrendingUp, Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';

// ── OKLCH design tokens ──────────────────────────────────────────────────────
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

// ── Types ────────────────────────────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function priorityColor(p: string): string {
  if (p === 'urgent') return BAD;
  if (p === 'high')   return WARN;
  if (p === 'normal') return ACC;
  return TX3;
}

function severityColor(s: string): string {
  if (s === 'critical') return BAD;
  if (s === 'warning')  return WARN;
  return ACC;
}

function pill(label: string, color: string) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 20,
      fontSize: 10, fontWeight: 700, textTransform: 'capitalize' as const,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>{label}</span>
  );
}

// ── KpiTile ──────────────────────────────────────────────────────────────────
function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px', minWidth: 80 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color }}>{value}</div>
    </div>
  );
}

// ── BriefingRow (generic row for lists) ─────────────────────────────────────
function BriefingRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
      borderBottom: `1px solid ${BORDER}`,
    }}>{children}</div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function Briefing() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [activeTab, setActiveTab] = useState<'actions' | 'intel' | 'invoices' | 'trades'>('actions');

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
      setError(err?.response?.data?.error || 'Failed to mark read');
    }
  };

  const sendBriefing = async () => {
    setSending(true);
    try {
      await api.post('/briefing/send', {});
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to queue briefing');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ padding: 24 }}><Skeleton variant="card" rows={6} /></div>;
  if (error) return <div style={{ padding: 24 }}><ErrorBanner message={error} onRetry={fetchBriefing} /></div>;
  if (!briefing) return (
    <div style={{ padding: 24 }}>
      <EmptyState icon={<Sun size={32} />} title="No briefing" description="Your briefing will populate once you have active items." />
    </div>
  );

  const dateLabel = new Date(briefing.date).toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const TABS: { key: typeof activeTab; label: string; count: number }[] = [
    { key: 'actions',  label: 'Actions',       count: briefing.action_items.length },
    { key: 'intel',    label: 'Intelligence',   count: briefing.intelligence.length },
    { key: 'invoices', label: 'Invoices',       count: briefing.invoices_due.length },
    { key: 'trades',   label: 'Recent trades',  count: briefing.recent_trades.length },
  ];

  const urgentCount  = briefing.action_items.filter(a => a.priority === 'urgent').length;
  const criticalCount = briefing.intelligence.filter(i => i.severity === 'critical').length;
  const overdueCount  = briefing.invoices_due.filter(inv => new Date(inv.due_date) < new Date()).length;

  return (
    <div style={{ background: BG, minHeight: 'calc(100vh - 50px)', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0 }}>

      {/* ── LEFT: main content ─────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', padding: '20px 20px 20px 24px' }}>

        {/* Header */}
        <header style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Sun size={16} style={{ color: ACC }} />
              <h1 style={{ fontSize: 18, fontWeight: 700, color: TX1, margin: 0 }}>Daily Briefing</h1>
            </div>
            <p style={{ fontSize: 12, color: TX2, margin: 0 }}>{dateLabel} · {briefing.role.replace(/_/g, ' ')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={markAllRead}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: BG2, color: TX2, border: `1px solid ${BORDER}` }}>
              <CheckCheck size={13} /> Mark read
            </button>
            <button type="button" onClick={sendBriefing} disabled={sending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: ACC, color: '#fff', border: `1px solid ${ACC}`, opacity: sending ? 0.6 : 1 }}>
              <Send size={13} /> {sending ? 'Queuing…' : sent ? 'Queued' : 'Send to inbox'}
            </button>
            <button type="button" onClick={fetchBriefing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: BG2, color: TX3, border: `1px solid ${BORDER}` }}>
              <RefreshCw size={13} />
            </button>
          </div>
        </header>

        {/* KPI strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <KpiTile label="Actions"    value={briefing.action_items.length} tone={urgentCount > 0 ? 'bad' : undefined} />
          <KpiTile label="Urgent"     value={urgentCount}  tone={urgentCount > 0 ? 'bad' : 'ok'} />
          <KpiTile label="Intel"      value={briefing.intelligence.length} tone={criticalCount > 0 ? 'bad' : undefined} />
          <KpiTile label="Invoices"   value={briefing.invoices_due.length} tone={overdueCount > 0 ? 'warn' : undefined} />
          <KpiTile label="Notices"    value={briefing.notifications.length} />
          <KpiTile label="Trades"     value={briefing.recent_trades.length} tone="ok" />
        </div>

        {/* Summary card */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>Summary</div>
          <p style={{ fontSize: 13, color: TX1, margin: 0, lineHeight: 1.6 }}>{briefing.summary}</p>
        </div>

        {/* Market snapshot */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <TrendingUp size={13} style={{ color: GOOD }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Market snapshot (7-day avg)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(briefing.markets).map(([k, v]) => (
              <div key={k} style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px', minWidth: 110 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: TX3, marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: MONO, color: TX1 }}>R{v.price_zar_per_mwh}</div>
                <div style={{ fontSize: 10, color: TX3 }}>{v.volume_mwh > 0 ? `${v.volume_mwh.toLocaleString()} MWh` : 'no matches'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {TABS.map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              style={{ height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                background: activeTab === tab.key ? ACC : BG2, color: activeTab === tab.key ? '#fff' : TX2,
                border: `1px solid ${activeTab === tab.key ? ACC : BORDER}` }}>
              {tab.label} {tab.count > 0 && <span style={{ opacity: 0.7 }}>({tab.count})</span>}
            </button>
          ))}
        </div>

        {/* Tab: Actions */}
        {activeTab === 'actions' && (
          <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, background: BG }}>
              <AlertTriangle size={13} style={{ color: WARN }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: TX1 }}>Action items</span>
            </div>
            <div style={{ padding: '0 16px' }}>
              {briefing.action_items.length === 0
                ? <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: TX3 }}>No pending actions</div>
                : briefing.action_items.map(a => (
                  <BriefingRow key={a.id}>
                    {pill(a.priority, priorityColor(a.priority))}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link to={actionDeepLink(a)} style={{ textDecoration: 'none' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TX1, marginBottom: 2 }}>{a.title}</div>
                      </Link>
                      {a.description && <div style={{ fontSize: 11, color: TX3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>}
                    </div>
                    {a.due_date && (
                      <span style={{ fontSize: 10, color: TX3, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={10} />{new Date(a.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </BriefingRow>
                ))}
            </div>
          </div>
        )}

        {/* Tab: Intelligence */}
        {activeTab === 'intel' && (
          <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, background: BG }}>
              <AlertTriangle size={13} style={{ color: BAD }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: TX1 }}>Intelligence alerts</span>
            </div>
            <div style={{ padding: '0 16px' }}>
              {briefing.intelligence.length === 0
                ? <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: TX3 }}>No intelligence alerts</div>
                : briefing.intelligence.map(i => (
                  <BriefingRow key={i.id}>
                    {pill(i.severity, severityColor(i.severity))}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TX1, marginBottom: 2 }}>{i.title}</div>
                      {i.description && <div style={{ fontSize: 11, color: TX3 }}>{i.description}</div>}
                    </div>
                  </BriefingRow>
                ))}
            </div>
          </div>
        )}

        {/* Tab: Invoices */}
        {activeTab === 'invoices' && (
          <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, background: BG }}>
              <FileText size={13} style={{ color: ACC }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: TX1 }}>Invoices due (14 days)</span>
            </div>
            <div style={{ padding: '0 16px' }}>
              {briefing.invoices_due.length === 0
                ? <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: TX3 }}>No invoices due in 14 days</div>
                : briefing.invoices_due.map(inv => {
                  const dueIn = Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000);
                  const dueColor = dueIn < 0 ? BAD : dueIn < 7 ? WARN : TX3;
                  return (
                    <BriefingRow key={inv.id}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link to="/settlement" style={{ textDecoration: 'none' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: TX1, marginBottom: 2 }}>{inv.invoice_number}</div>
                        </Link>
                        <div style={{ fontSize: 11, color: TX3, textTransform: 'capitalize' }}>{inv.status}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: TX1 }}>R{Number(inv.total_amount).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</div>
                        <div style={{ fontSize: 10, color: dueColor }}>
                          {dueIn < 0 ? `${Math.abs(dueIn)}d overdue` : dueIn === 0 ? 'due today' : `due in ${dueIn}d`}
                        </div>
                      </div>
                    </BriefingRow>
                  );
                })}
            </div>
          </div>
        )}

        {/* Tab: Trades */}
        {activeTab === 'trades' && (
          <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, background: BG }}>
              <TrendingUp size={13} style={{ color: GOOD }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: TX1 }}>Recent trades</span>
            </div>
            <div style={{ padding: '0 16px' }}>
              {briefing.recent_trades.length === 0
                ? <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: TX3 }}>No recent trades</div>
                : briefing.recent_trades.map(t => (
                  <BriefingRow key={t.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link to="/trading" style={{ textDecoration: 'none' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TX1, textTransform: 'capitalize', marginBottom: 2 }}>{t.energy_type}</div>
                      </Link>
                      <div style={{ fontSize: 11, color: TX3 }}>{new Date(t.matched_at).toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: GOOD }}>R{Math.round(t.matched_price)}/MWh</div>
                      <div style={{ fontSize: 10, color: TX3 }}>{t.matched_volume_mwh} MWh</div>
                    </div>
                  </BriefingRow>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: 380px fixed panel ───────────────────────────────────── */}
      <div style={{ width: 380, borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* AI assist card */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ACC, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>AI Assist</div>
          {urgentCount > 0 && (
            <p style={{ fontSize: 12, color: TX2, margin: '0 0 8px', lineHeight: 1.5 }}>
              You have <strong>{urgentCount} urgent action{urgentCount !== 1 ? 's' : ''}</strong> requiring immediate attention. Prioritise these before reviewing other items.
            </p>
          )}
          {criticalCount > 0 && (
            <p style={{ fontSize: 12, color: TX2, margin: '0 0 8px', lineHeight: 1.5 }}>
              <strong>{criticalCount} critical intelligence alert{criticalCount !== 1 ? 's' : ''}</strong> detected — review under the Intelligence tab.
            </p>
          )}
          {overdueCount > 0 && (
            <p style={{ fontSize: 12, color: TX2, margin: '0 0 8px', lineHeight: 1.5 }}>
              <strong>{overdueCount} invoice{overdueCount !== 1 ? 's are' : ' is'} overdue</strong> — navigate to Settlement to clear.
            </p>
          )}
          {urgentCount === 0 && criticalCount === 0 && overdueCount === 0 && (
            <p style={{ fontSize: 12, color: TX3, margin: 0, lineHeight: 1.5 }}>No high-priority items today. Review your action queue to stay ahead of upcoming deadlines.</p>
          )}
        </div>

        {/* Notifications */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Bell size={12} style={{ color: TX3 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notifications</div>
            {briefing.notifications.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: MONO, fontWeight: 700, color: ACC }}>{briefing.notifications.length}</span>
            )}
          </div>
          {briefing.notifications.length === 0
            ? <div style={{ fontSize: 12, color: TX3, textAlign: 'center', padding: '16px 0' }}>Inbox is clear</div>
            : briefing.notifications.map((n, idx) => (
              <div key={n.id} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: idx < briefing.notifications.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: TX1, marginBottom: 2 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 11, color: TX3, lineHeight: 1.4 }}>{n.body}</div>}
                <div style={{ fontSize: 10, color: TX3, marginTop: 4 }}>{new Date(n.created_at).toLocaleDateString()}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default Briefing;
