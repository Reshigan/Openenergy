import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, BookOpen, Brain,
  ChevronDown, ChevronRight, Cpu, Edit3, Gauge,
  Play, Plus, RefreshCw, Search, Sparkles, Target, TrendingUp, X, XCircle, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { ExportBar } from '../ExportBar';

/* ════════════════════════════════════════════════════════════════════════
 * Trading Terminal — Trader role
 *
 * Five tabs:
 *   1. Terminal      — order book, ticket, last prints
 *   2. Algo Rules    — CRUD over the trader's own algorithmic strategies
 *   3. Backtester    — replay a strategy against /trading/prints history
 *   4. Blotter       — real-time fills feed (/trading/fills) + positions
 *   5. Risk          — VaR / margin / credit utilisation summary
 *
 * All POSTs go through the existing /api/trading/* and /api/trader-risk/*
 * routes; the page is read-tolerant when those return empty or error so the
 * UI stays usable in demo mode.
 * ═══════════════════════════════════════════════════════════════════════ */

type Tab = 'terminal' | 'algo' | 'backtest' | 'blotter' | 'risk' | 'rejections' | 'exceptions';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'terminal',   label: 'Terminal',   icon: BookOpen },
  { id: 'algo',       label: 'Algo Rules', icon: Cpu },
  { id: 'backtest',   label: 'Backtester', icon: Brain },
  { id: 'blotter',    label: 'Blotter',    icon: Activity },
  { id: 'risk',       label: 'Risk',       icon: Gauge },
  { id: 'rejections', label: 'Rejections', icon: XCircle },
  { id: 'exceptions', label: 'Exceptions', icon: AlertCircle },
];

const formatZAR = (val: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val || 0);
const num = (val: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(val || 0);

interface OrderRow {
  id: string;
  side: 'buy' | 'sell' | 'bid' | 'ask';
  price: number;
  volume: number;
  energy_type?: string;
  status?: string;
  created_at?: string;
}

interface FillRow {
  id?: string;
  matched_at: string;
  matched_price: number;
  matched_volume_mwh: number;
  buyer_name?: string;
  seller_name?: string;
  energy_type?: string;
}

interface AlgoRule {
  id: string;
  name: string;
  side: 'buy' | 'sell';
  trigger_below?: number;
  trigger_above?: number;
  size_mwh: number;
  energy_type: string;
  enabled: boolean;
  last_fired_at?: string | null;
}

export function Trading() {
  const [tab, setTab] = useState<Tab>('terminal');

  return (
    <div className="p-6 lg:p-10 space-y-6 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685] bg-white border border-[#dde4ec] rounded-full px-3 py-1">
            <Zap size={12} /> Energy Trading
          </div>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>Trading Terminal</h1>
          <p className="text-[13px] text-[#3d4756]">Live order book, algorithmic rules, strategy backtester, real-time blotter and risk dashboard.</p>
        </div>
        <nav className="flex flex-wrap items-center gap-1 bg-white border border-[#dde4ec] rounded-lg p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`h-9 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-2 ${active ? 'bg-[#1a3a5c] text-white' : 'text-[#3d4756] hover:bg-[#eef2f7]'}`}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      {tab === 'terminal' && <TerminalTab onSeeRejections={() => setTab('rejections')} />}
      {tab === 'algo' && <AlgoRulesTab />}
      {tab === 'backtest' && <BacktesterTab />}
      {tab === 'blotter' && <BlotterTab />}
      {tab === 'risk' && <RiskTab />}
      {tab === 'rejections' && <RejectionsTab />}
      {tab === 'exceptions' && <ExceptionsTab />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 1 — Terminal (order book + ticket + recent prints)
//
// AI inline assists (subtle, contextual — no separate AI panel):
//   - Ghost-text size suggestion under Volume input, pulled from
//     /trading/order-suggest, with a "why" tooltip showing headroom + mark.
//   - On 422 rejection: structured RejectionCard inline under the ticket
//     with reason code, AI explanation, and 1-2 one-click remediations.
// ════════════════════════════════════════════════════════════════════════

interface RejectionPayload {
  rejection_id: string;
  reason_code: string;
  detail: string;
  notional_zar: number;
  snapshot: Record<string, unknown>;
}

interface SuggestPayload {
  suggested_volume_mwh: number | null;
  free_collateral_zar: number;
  headroom_zar: number;
  mark_price_zar_mwh: number | null;
  mark_age_minutes: number | null;
  market_state: 'open' | 'closed' | 'halted_instrument' | 'halted_market';
}

type OrderTypeT = 'limit' | 'market' | 'ioc' | 'fok' | 'stop' | 'stop_limit';
type TifT = 'gtc' | 'gtd' | 'day';

interface MyOrderRow {
  id: string;
  side: 'buy' | 'sell';
  energy_type: string;
  volume_mwh: number;
  remaining_volume_mwh: number | null;
  price: number | null;
  status: string;
  order_type?: string;
  time_in_force?: string;
  created_at: string;
}

function TerminalTab({ onSeeRejections }: { onSeeRejections: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderBook, setOrderBook] = useState<{ bids: OrderRow[]; asks: OrderRow[] }>({ bids: [], asks: [] });
  const [prints, setPrints] = useState<Array<{ matched_at: string; matched_price: number; matched_volume_mwh: number }>>([]);
  const [myOrders, setMyOrders] = useState<MyOrderRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState({
    side: 'buy' as 'buy' | 'sell',
    price: '',
    volume: '',
    energy_type: 'solar',
    order_type: 'limit' as OrderTypeT,
    time_in_force: 'gtc' as TifT,
    expires_at: '',
    stop_trigger_price: '',
    post_only: false,
    reduce_only: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rejection, setRejection] = useState<RejectionPayload | null>(null);
  const [suggest, setSuggest] = useState<SuggestPayload | null>(null);
  const [amending, setAmending] = useState<MyOrderRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [bookRes, printsRes, ordersRes] = await Promise.all([
        api.get('/trading/orderbook').catch(() => ({ data: { success: true, data: [] } })),
        api.get('/trading/matches').catch(() => ({ data: { success: true, data: [] } })),
        api.get('/trading/orders').catch(() => ({ data: { success: true, data: [] } })),
      ]);
      const raw = bookRes.data?.data;
      const bids: OrderRow[] = []; const asks: OrderRow[] = [];
      const list = Array.isArray(raw) ? raw : [...(raw?.bids || []), ...(raw?.asks || [])];
      for (const o of list) {
        const isBuy = o.side === 'buy' || o.side === 'bid';
        const price = isBuy ? Number(o.price_max ?? o.price_min ?? o.price ?? 0)
                            : Number(o.price_min ?? o.price_max ?? o.price ?? 0);
        const row: OrderRow = { ...o, side: isBuy ? 'bid' : 'ask', price, volume: Number(o.volume_mwh ?? o.volume ?? 0) };
        (isBuy ? bids : asks).push(row);
      }
      bids.sort((a, b) => b.price - a.price);
      asks.sort((a, b) => a.price - b.price);
      setOrderBook({ bids, asks });

      const printsArr = (Array.isArray(printsRes.data?.data) ? printsRes.data.data : []).map((m: Record<string, unknown>) => ({
        matched_at: (m.matched_at || m.timestamp || new Date().toISOString()) as string,
        matched_price: Number(m.matched_price ?? m.price_per_mwh ?? m.price ?? 0),
        matched_volume_mwh: Number(m.matched_volume_mwh ?? m.volume_mwh ?? m.volume ?? 0),
      }));
      setPrints(printsArr.slice(0, 50));

      setMyOrders((ordersRes.data?.data || []) as MyOrderRow[]);
    } catch (e: unknown) { setError((e as Error).message || 'Failed to load market'); }
    finally { setLoading(false); }
  }, []);

  const cancelOrder = useCallback(async (id: string) => {
    try {
      await api.post(`/trading/orders/${id}/cancel`);
      refresh();
    } catch { /* leave the row visible — server will explain on next attempt */ }
  }, [refresh]);
  useEffect(() => { refresh(); }, [refresh]);

  // Ghost-text suggestion — refreshes whenever side/energy_type changes.
  // Falls silent if the endpoint isn't available so the form stays usable.
  useEffect(() => {
    let alive = true;
    api.get('/trading/order-suggest', { params: { side: order.side, energy_type: order.energy_type } })
      .then((r) => { if (alive) setSuggest(r.data?.data || null); })
      .catch(() => { if (alive) setSuggest(null); });
    return () => { alive = false; };
  }, [order.side, order.energy_type]);

  const applyRemediation = useCallback(async (action: string, payload?: Record<string, unknown>) => {
    if (action === 'retry_with_size' && payload?.volume_mwh != null) {
      setOrder((o) => ({ ...o, volume: String(payload.volume_mwh) }));
    } else if (action === 'retry_with_price' && payload?.price_zar_mwh != null) {
      setOrder((o) => ({ ...o, price: String(payload.price_zar_mwh) }));
    } else if (action === 'review_open_orders') {
      onSeeRejections();
      return;
    }
    setRejection(null);
  }, [onSeeRejections]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setRejection(null); setError(null);
    try {
      await api.post('/trading/orders', {
        side: order.side,
        energy_type: order.energy_type,
        price: order.order_type === 'market' ? null : Number(order.price),
        volume_mwh: Number(order.volume),
        order_type: order.order_type,
        time_in_force: order.time_in_force,
        expires_at: order.time_in_force === 'gtd' && order.expires_at ? order.expires_at : null,
        stop_trigger_price: (order.order_type === 'stop' || order.order_type === 'stop_limit') && order.stop_trigger_price
          ? Number(order.stop_trigger_price) : null,
        post_only: order.post_only,
        reduce_only: order.reduce_only,
      });
      setOrder({ ...order, price: '', volume: '' });
      refresh();
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string; data?: RejectionPayload } } };
      if (err.response?.status === 422 && err.response?.data?.data) {
        setRejection(err.response.data.data);
      } else {
        setError(err.response?.data?.error || (e as Error).message || 'Order failed');
      }
    }
    finally { setSubmitting(false); }
  };

  if (loading) return <Skeleton variant="card" rows={4} />;
  if (error) return <ErrorBanner message={error} onRetry={refresh} />;

  const lastPrice = prints[0]?.matched_price || 0;
  const bestBid = orderBook.bids[0]?.price || 0;
  const bestAsk = orderBook.asks[0]?.price || 0;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const dayVol = prints.reduce((s, p) => s + (p.matched_volume_mwh || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Last price"  value={formatZAR(lastPrice)} icon={Zap} />
        <KPI label="Best bid"    value={formatZAR(bestBid)}   icon={ArrowUpRight}   tone="up" />
        <KPI label="Best ask"    value={formatZAR(bestAsk)}   icon={ArrowDownRight} tone="down" />
        <KPI label="24h volume"  value={`${num(dayVol, 0)} MWh`} icon={TrendingUp} sub={`${prints.length} prints · spread R${num(spread,0)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-xl border border-[#dde4ec] bg-white">
          <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center justify-between">
            <div className="flex items-center gap-2 font-display font-semibold text-[14px] text-[#0f1c2e]"><BookOpen size={14} /> Order Book</div>
            <button onClick={refresh} className="h-8 px-2 text-[12px] inline-flex items-center gap-1 rounded border border-[#dde4ec] hover:bg-[#eef2f7]"><RefreshCw size={12} /> Refresh</button>
          </header>
          <div className="grid grid-cols-2 divide-x divide-[#eef2f7]">
            <BookSide rows={orderBook.bids.slice(0, 10)} side="bid" />
            <BookSide rows={orderBook.asks.slice(0, 10)} side="ask" />
          </div>
          <ExportBar data={prints} filename="trades_today" />
        </section>

        <section className="rounded-xl border border-[#dde4ec] bg-white p-5">
          <h2 className="font-display font-semibold text-[14px] text-[#0f1c2e] mb-4">Place Order</h2>
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              {(['buy', 'sell'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setOrder({ ...order, side: s })}
                  className={`flex-1 h-9 rounded-md text-[13px] font-semibold ${
                    order.side === s
                      ? s === 'buy' ? 'bg-[#1a8a5b] text-white' : 'bg-[#c0392b] text-white'
                      : 'bg-[#eef2f7] text-[#3d4756]'
                  }`}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <Field label="Price (ZAR/MWh)">
              <input type="number" required value={order.price} onChange={(e) => setOrder({ ...order, price: e.target.value })}
                className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" placeholder="1950" />
            </Field>
            <Field label="Volume (MWh)">
              <input type="number" required value={order.volume} onChange={(e) => setOrder({ ...order, volume: e.target.value })}
                className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" placeholder={suggest?.suggested_volume_mwh != null ? String(suggest.suggested_volume_mwh) : '50'} />
              {suggest?.suggested_volume_mwh != null && suggest.suggested_volume_mwh > 0 && (
                <button
                  type="button"
                  onClick={() => setOrder({ ...order, volume: String(suggest.suggested_volume_mwh) })}
                  title={`Free collateral ${formatZAR(suggest.free_collateral_zar)} · headroom ${formatZAR(suggest.headroom_zar)}${suggest.mark_price_zar_mwh ? ` · mark R${num(suggest.mark_price_zar_mwh)}` : ''}`}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#3b82c4] hover:text-[#1a3a5c] hover:underline">
                  <Sparkles size={10} /> max safe: {num(suggest.suggested_volume_mwh, 1)} MWh
                </button>
              )}
              {suggest && suggest.market_state !== 'open' && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#c0392b]">
                  <AlertTriangle size={10} /> market {suggest.market_state.replace('_', ' ')}
                </div>
              )}
            </Field>
            <Field label="Product">
              <select value={order.energy_type} onChange={(e) => setOrder({ ...order, energy_type: e.target.value })}
                className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
                <option value="solar">Solar</option>
                <option value="wind">Wind</option>
                <option value="hybrid">Hybrid</option>
                <option value="storage">Storage</option>
                <option value="thermal">Thermal</option>
              </select>
            </Field>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full text-[11px] text-[#3d4756] hover:text-[#0f1c2e] inline-flex items-center gap-1 py-1">
              {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Advanced (type, time-in-force, modifiers)
            </button>

            {showAdvanced && (
              <div className="space-y-3 border-t border-[#eef2f7] pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Order type">
                    <select value={order.order_type} onChange={(e) => setOrder({ ...order, order_type: e.target.value as OrderTypeT })}
                      className="w-full h-9 px-2 rounded-md border border-[#dde4ec] text-[12px]">
                      <option value="limit">Limit</option>
                      <option value="market">Market</option>
                      <option value="ioc">IOC</option>
                      <option value="fok">FOK</option>
                      <option value="stop">Stop</option>
                      <option value="stop_limit">Stop-Limit</option>
                    </select>
                  </Field>
                  <Field label="Time in force">
                    <select value={order.time_in_force} onChange={(e) => setOrder({ ...order, time_in_force: e.target.value as TifT })}
                      className="w-full h-9 px-2 rounded-md border border-[#dde4ec] text-[12px]">
                      <option value="gtc">GTC</option>
                      <option value="gtd">GTD</option>
                      <option value="day">Day</option>
                    </select>
                  </Field>
                </div>
                {order.time_in_force === 'gtd' && (
                  <Field label="Expires at">
                    <input type="datetime-local" value={order.expires_at} onChange={(e) => setOrder({ ...order, expires_at: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                      className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" />
                  </Field>
                )}
                {(order.order_type === 'stop' || order.order_type === 'stop_limit') && (
                  <Field label="Stop trigger price (R/MWh)">
                    <input type="number" value={order.stop_trigger_price} onChange={(e) => setOrder({ ...order, stop_trigger_price: e.target.value })}
                      className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" placeholder="1900" />
                  </Field>
                )}
                <div className="flex items-center gap-4 text-[12px] text-[#3d4756]">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={order.post_only} onChange={(e) => setOrder({ ...order, post_only: e.target.checked })} />
                    post-only
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={order.reduce_only} onChange={(e) => setOrder({ ...order, reduce_only: e.target.checked })} />
                    reduce-only
                  </label>
                </div>
              </div>
            )}

            <button type="submit" disabled={submitting}
              className={`w-full h-10 rounded-md text-white font-semibold text-[13px] ${order.side === 'buy' ? 'bg-[#1a8a5b]' : 'bg-[#c0392b]'} disabled:opacity-50`}>
              {submitting ? 'Submitting…' : `Submit ${order.side.toUpperCase()}`}
            </button>
          </form>
          {rejection && <RejectionCard rejection={rejection} onApplyRemediation={applyRemediation} onDismiss={() => setRejection(null)} onSeeAll={onSeeRejections} />}
        </section>
      </div>

      <MyOrdersPanel
        orders={myOrders}
        onCancel={cancelOrder}
        onAmend={(o) => setAmending(o)}
      />
      {amending && (
        <AmendModal
          order={amending}
          onClose={() => setAmending(null)}
          onSaved={() => { setAmending(null); refresh(); }}
        />
      )}

      <section className="rounded-xl border border-[#dde4ec] bg-white">
        <header className="px-5 py-3 border-b border-[#eef2f7]">
          <div className="font-display font-semibold text-[14px] text-[#0f1c2e]">Recent prints</div>
          <div className="text-[11px] text-[#6b7685]">Last 50 matched trades · last price drives mark-to-market</div>
        </header>
        <div className="px-5 pt-3 pb-1">
          {prints.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#6b7685]">No prints in this session yet.</div>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...prints].reverse()}>
                  <defs>
                    <linearGradient id="prGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82c4" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#3b82c4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
                  <XAxis dataKey="matched_at" tickFormatter={(v) => new Date(v).toLocaleTimeString().slice(0,5)} fontSize={10} stroke="#6b7685" />
                  <YAxis tickFormatter={(v) => `R${v}`} fontSize={10} stroke="#6b7685" />
                  <Tooltip formatter={(v: number) => formatZAR(v)} labelFormatter={(v) => new Date(v).toLocaleString()} />
                  <Area type="monotone" dataKey="matched_price" stroke="#1a3a5c" strokeWidth={2} fill="url(#prGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 2 — Algo Rules (KV-backed, persisted under /api/trading/algo-rules)
// ════════════════════════════════════════════════════════════════════════
function AlgoRulesTab() {
  const [rules, setRules] = useState<AlgoRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<AlgoRule> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/trading/algo-rules');
      setRules((r.data?.data || []) as AlgoRule[]);
    } catch {
      setRules([]); // route may not exist on this build — show empty + invite to create
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    if (!editing || !editing.name || !editing.size_mwh) return;
    try {
      if (editing.id) await api.put(`/trading/algo-rules/${editing.id}`, editing);
      else await api.post('/trading/algo-rules', { ...editing, enabled: true });
      setEditing(null);
      refresh();
    } catch { /* best-effort */ }
  };

  const toggle = async (rule: AlgoRule) => {
    try {
      await api.put(`/trading/algo-rules/${rule.id}`, { ...rule, enabled: !rule.enabled });
      refresh();
    } catch { /* */ }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#dde4ec] bg-white">
        <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold text-[14px] text-[#0f1c2e]"><Cpu size={14} /> Algorithmic strategies</div>
          <button onClick={() => setEditing({ name: '', side: 'buy', size_mwh: 10, energy_type: 'solar', enabled: true })}
            className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold inline-flex items-center gap-1">
            <Plus size={14} /> New rule
          </button>
        </header>
        {loading ? <div className="p-8 text-center text-[13px] text-[#6b7685]">Loading…</div> : (
          rules.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#6b7685]">
              No algo rules yet. Define a price-trigger rule to auto-place orders when the market hits a threshold.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-[#fafbfd]">
                  <tr className="text-[11px] uppercase text-[#6b7685]">
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Side</th>
                    <th className="px-4 py-2 text-left">Product</th>
                    <th className="px-4 py-2 text-right">Trigger</th>
                    <th className="px-4 py-2 text-right">Size</th>
                    <th className="px-4 py-2 text-left">Last fired</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className="border-t border-[#eef2f7]">
                      <td className="px-4 py-2 font-medium text-[#0f1c2e]">{r.name}</td>
                      <td className="px-4 py-2"><span className={`text-[11px] font-semibold uppercase ${r.side === 'buy' ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>{r.side}</span></td>
                      <td className="px-4 py-2 text-[#3d4756]">{r.energy_type}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {r.trigger_below ? `< ${formatZAR(r.trigger_below)}` : ''}
                        {r.trigger_above ? `> ${formatZAR(r.trigger_above)}` : ''}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{num(r.size_mwh)} MWh</td>
                      <td className="px-4 py-2 text-[#6b7685] text-[11px] font-mono">{r.last_fired_at ? new Date(r.last_fired_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => toggle(r)}
                          className={`h-6 px-2 rounded text-[10px] font-semibold ${r.enabled ? 'bg-[#cdf0dd] text-[#1a8a5b]' : 'bg-[#eef2f7] text-[#6b7685]'}`}>
                          {r.enabled ? 'ENABLED' : 'PAUSED'}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => setEditing(r)} className="text-[12px] text-[#3b82c4] hover:underline">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      {editing && (
        <section className="rounded-xl border border-[#dde4ec] bg-white p-5">
          <h3 className="font-display font-semibold text-[14px] text-[#0f1c2e] mb-3">{editing.id ? 'Edit rule' : 'New rule'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Name"><input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
            <Field label="Side">
              <select value={editing.side || 'buy'} onChange={(e) => setEditing({ ...editing, side: e.target.value as 'buy'|'sell' })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
                <option value="buy">Buy</option><option value="sell">Sell</option>
              </select>
            </Field>
            <Field label="Product">
              <select value={editing.energy_type || 'solar'} onChange={(e) => setEditing({ ...editing, energy_type: e.target.value })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
                <option value="solar">Solar</option><option value="wind">Wind</option><option value="hybrid">Hybrid</option><option value="storage">Storage</option>
              </select>
            </Field>
            <Field label="Trigger below (R/MWh)"><input type="number" value={editing.trigger_below || ''} onChange={(e) => setEditing({ ...editing, trigger_below: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
            <Field label="Trigger above (R/MWh)"><input type="number" value={editing.trigger_above || ''} onChange={(e) => setEditing({ ...editing, trigger_above: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
            <Field label="Size (MWh)"><input type="number" value={editing.size_mwh || 0} onChange={(e) => setEditing({ ...editing, size_mwh: Number(e.target.value) })} className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold">Save</button>
            <button onClick={() => setEditing(null)} className="h-9 px-4 rounded-md border border-[#dde4ec] text-[#3d4756] text-[13px] font-semibold">Cancel</button>
          </div>
        </section>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 3 — Backtester
// ════════════════════════════════════════════════════════════════════════
function BacktesterTab() {
  const [horizon, setHorizon] = useState(30);
  const [strategy, setStrategy] = useState<'mean_reversion' | 'momentum' | 'spread'>('mean_reversion');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ pnl: number; sharpe: number; trades: number; equity: Array<{ t: string; v: number }> } | null>(null);
  const [prints, setPrints] = useState<Array<{ matched_at: string; matched_price: number }>>([]);

  useEffect(() => {
    api.get('/trading/prints').catch(() => ({ data: { success: true, data: [] } })).then((r) => {
      setPrints((r.data?.data || []) as Array<{ matched_at: string; matched_price: number }>);
    });
  }, []);

  const run = async () => {
    setRunning(true);
    try {
      // Try real endpoint first; if missing, run a deterministic JS sim on
      // /trading/prints history so the trader still gets a sensible curve.
      const r = await api.post('/trader-risk/backtest', { strategy, horizon_days: horizon }).catch(() => null);
      if (r?.data?.success) { setResult(r.data.data); return; }
      const series = simBacktest(strategy, prints.slice(0, horizon * 24));
      setResult(series);
    } finally { setRunning(false); }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#dde4ec] bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Strategy">
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}
              className="w-48 h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]">
              <option value="mean_reversion">Mean reversion</option>
              <option value="momentum">Momentum (MA crossover)</option>
              <option value="spread">Solar/Wind spread</option>
            </select>
          </Field>
          <Field label="Horizon (days)"><input type="number" min={1} max={365} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="w-28 h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" /></Field>
          <button onClick={run} disabled={running} className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />} Run backtest
          </button>
        </div>
      </section>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <KPI label="P&L"     value={formatZAR(result.pnl)}     icon={Target} tone={result.pnl >= 0 ? 'up' : 'down'} />
            <KPI label="Sharpe"  value={num(result.sharpe, 2)}     icon={TrendingUp} />
            <KPI label="Trades"  value={num(result.trades)}        icon={Activity} />
          </div>
          <section className="rounded-xl border border-[#dde4ec] bg-white p-5">
            <h3 className="font-display font-semibold text-[14px] text-[#0f1c2e] mb-3">Equity curve</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equity}>
                  <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
                  <XAxis dataKey="t" fontSize={10} stroke="#6b7685" />
                  <YAxis tickFormatter={(v) => `R${num(v)}`} fontSize={10} stroke="#6b7685" />
                  <Tooltip formatter={(v: number) => formatZAR(v)} />
                  <Line type="monotone" dataKey="v" stroke="#1a3a5c" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// Deterministic JS simulator — fallback when /trader-risk/backtest is absent.
function simBacktest(
  strategy: 'mean_reversion' | 'momentum' | 'spread',
  series: Array<{ matched_at: string; matched_price: number }>,
) {
  const equity: Array<{ t: string; v: number }> = [];
  let pos = 0; let cash = 1_000_000; let trades = 0;
  let mean = series.length > 0 ? series.reduce((s, x) => s + x.matched_price, 0) / series.length : 0;
  const lookback = Math.max(5, Math.floor(series.length / 10));
  for (let i = lookback; i < series.length; i++) {
    const px = series[i].matched_price; if (!px) continue;
    let signal = 0;
    if (strategy === 'mean_reversion') signal = px < mean * 0.98 ? 1 : px > mean * 1.02 ? -1 : 0;
    if (strategy === 'momentum') {
      const short = avg(series, i - lookback / 2, lookback / 2);
      const long  = avg(series, i - lookback, lookback);
      signal = short > long ? 1 : short < long ? -1 : 0;
    }
    if (strategy === 'spread') signal = (i % 7) < 4 ? 1 : -1;
    if (signal === 1 && pos === 0) { pos = 50; cash -= 50 * px; trades++; }
    if (signal === -1 && pos > 0) { cash += pos * px; pos = 0; trades++; }
    equity.push({ t: new Date(series[i].matched_at).toLocaleDateString(), v: cash + pos * px });
  }
  const start = equity[0]?.v || 1_000_000;
  const end = equity[equity.length - 1]?.v || start;
  const pnl = end - start;
  const returns = equity.slice(1).map((e, i) => (e.v - equity[i].v) / equity[i].v);
  const r = returns.length > 0 ? returns.reduce((s, x) => s + x, 0) / returns.length : 0;
  const v = returns.length > 0 ? Math.sqrt(returns.reduce((s, x) => s + (x - r) ** 2, 0) / returns.length) : 0;
  const sharpe = v > 0 ? (r * Math.sqrt(252)) / v : 0;
  return { pnl, sharpe, trades, equity };
}
function avg(s: Array<{ matched_price: number }>, start: number, n: number) {
  let total = 0, c = 0;
  for (let i = Math.max(0, Math.floor(start)); i < Math.min(s.length, Math.floor(start + n)); i++) { total += s[i].matched_price; c++; }
  return c > 0 ? total / c : 0;
}

// ════════════════════════════════════════════════════════════════════════
// Tab 4 — Blotter (real-time fills)
// ════════════════════════════════════════════════════════════════════════
function BlotterTab() {
  const [fills, setFills] = useState<FillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/trading/fills').catch(() => ({ data: { success: true, data: [] } }));
      setFills((r.data?.data || []) as FillRow[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [auto, refresh]);

  const filtered = useMemo(() => {
    if (!search) return fills;
    const s = search.toLowerCase();
    return fills.filter((f) => (f.buyer_name || '').toLowerCase().includes(s) || (f.seller_name || '').toLowerCase().includes(s) || (f.energy_type || '').toLowerCase().includes(s));
  }, [fills, search]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#dde4ec] bg-white">
        <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold text-[14px] text-[#0f1c2e]"><Activity size={14} /> Real-time blotter</div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#6b7685]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter…" className="h-8 pl-7 pr-3 rounded-md border border-[#dde4ec] text-[12px] w-40" />
            </div>
            <label className="text-[11px] text-[#6b7685] flex items-center gap-1"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh (5s)</label>
            <button onClick={refresh} className="h-8 px-2 text-[12px] inline-flex items-center gap-1 rounded border border-[#dde4ec] hover:bg-[#eef2f7]"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </header>
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-[12px]">
            <thead className="bg-[#fafbfd] sticky top-0">
              <tr className="text-[11px] uppercase text-[#6b7685]">
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-left">Buyer</th>
                <th className="px-3 py-2 text-left">Seller</th>
                <th className="px-3 py-2 text-right">Volume</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Notional</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => (
                <tr key={f.id || i} className="border-t border-[#eef2f7] hover:bg-[#fafbfd]">
                  <td className="px-3 py-2 font-mono">{new Date(f.matched_at).toLocaleTimeString()}</td>
                  <td className="px-3 py-2">{f.energy_type || '—'}</td>
                  <td className="px-3 py-2">{f.buyer_name || '—'}</td>
                  <td className="px-3 py-2">{f.seller_name || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{num(f.matched_volume_mwh, 1)} MWh</td>
                  <td className="px-3 py-2 text-right font-mono">{formatZAR(f.matched_price)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatZAR(f.matched_price * f.matched_volume_mwh)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#6b7685]">No fills in this session.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 5 — Risk
//
// AI inline assist: a one-line "what changed" narrative under the KPI grid,
// generated from /trading/risk-narrative (5-min cached). No separate AI panel.
// ════════════════════════════════════════════════════════════════════════
function RiskTab() {
  const [positions, setPositions] = useState<Array<Record<string, unknown>>>([]);
  const [credit, setCredit] = useState<Record<string, unknown> | null>(null);
  const [collateral, setCollateral] = useState<Array<Record<string, unknown>>>([]);
  const [narrative, setNarrative] = useState<{ headline: string; fallback?: boolean } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/trader-risk/positions').catch(() => ({ data: { success: true, data: [] } })),
      api.get('/trader-risk/credit-check').catch(() => ({ data: { success: true, data: null } })),
      api.get('/trader-risk/collateral/accounts').catch(() => ({ data: { success: true, data: [] } })),
      api.get('/trading/risk-narrative').catch(() => ({ data: { success: true, data: null } })),
    ]).then(([p, cr, co, nr]) => {
      setPositions((p.data?.data || []) as Array<Record<string, unknown>>);
      setCredit((cr.data?.data || null) as Record<string, unknown> | null);
      setCollateral((co.data?.data || []) as Array<Record<string, unknown>>);
      setNarrative((nr.data?.data || null) as { headline: string; fallback?: boolean } | null);
    });
  }, []);

  const totalNotional = positions.reduce((s, p) => s + Number(p.notional || 0), 0);
  const totalUnrealised = positions.reduce((s, p) => s + Number(p.unrealised_pnl || 0), 0);
  const utilisation = Number(credit?.utilisation_pct || 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Open positions" value={num(positions.length)} icon={Activity} />
        <KPI label="Notional" value={formatZAR(totalNotional)} icon={Target} />
        <KPI label="Unrealised P&L" value={formatZAR(totalUnrealised)} icon={TrendingUp} tone={totalUnrealised >= 0 ? 'up' : 'down'} />
        <KPI label="Credit util." value={`${num(utilisation, 1)}%`} icon={Gauge} tone={utilisation > 80 ? 'down' : 'up'} sub={credit?.credit_limit ? `Limit ${formatZAR(Number(credit.credit_limit))}` : undefined} />
      </div>

      {narrative?.headline && (
        <div className="rounded-lg border border-[#dde4ec] bg-[#fafbfd] px-4 py-2 text-[12px] text-[#3d4756] flex items-start gap-2">
          <Sparkles size={12} className="mt-0.5 text-[#3b82c4] flex-shrink-0" />
          <div className="flex-1">{narrative.headline}</div>
        </div>
      )}

      <section className="rounded-xl border border-[#dde4ec] bg-white">
        <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center gap-2 font-display font-semibold text-[14px] text-[#0f1c2e]">
          <Gauge size={14} /> Positions
        </header>
        <div className="overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafbfd]">
              <tr className="text-[11px] uppercase text-[#6b7685]">
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-right">Qty (MWh)</th>
                <th className="px-4 py-2 text-right">Avg price</th>
                <th className="px-4 py-2 text-right">Mark</th>
                <th className="px-4 py-2 text-right">Unrealised</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const u = Number(p.unrealised_pnl || 0);
                return (
                  <tr key={i} className="border-t border-[#eef2f7]">
                    <td className="px-4 py-2">{(p.energy_type as string) || (p.product as string) || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{num(Number(p.quantity_mwh || 0), 1)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatZAR(Number(p.avg_price || 0))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatZAR(Number(p.mark_price || 0))}</td>
                    <td className={`px-4 py-2 text-right font-mono ${u >= 0 ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>{formatZAR(u)}</td>
                  </tr>
                );
              })}
              {positions.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-[#6b7685]">No open positions.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[#dde4ec] bg-white">
        <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center gap-2 font-display font-semibold text-[14px] text-[#0f1c2e]">Collateral accounts</header>
        <div className="overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafbfd]"><tr className="text-[11px] uppercase text-[#6b7685]"><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-right">Balance</th><th className="px-4 py-2 text-right">Available</th></tr></thead>
            <tbody>
              {collateral.map((co, i) => (
                <tr key={i} className="border-t border-[#eef2f7]">
                  <td className="px-4 py-2">{(co.collateral_type as string) || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatZAR(Number(co.balance || 0))}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatZAR(Number(co.available || co.balance || 0))}</td>
                </tr>
              ))}
              {collateral.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-[#6b7685]">No collateral accounts.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Shared bits
// ════════════════════════════════════════════════════════════════════════
function KPI({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: React.ComponentType<{ size?: number }>; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
        <Icon size={14} />
      </div>
      <div className={`mt-1 text-[22px] font-semibold font-mono ${tone === 'up' ? 'text-[#1a8a5b]' : tone === 'down' ? 'text-[#c0392b]' : 'text-[#0f1c2e]'}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#6b7685] mt-1">{sub}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6b7685]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function BookSide({ rows, side }: { rows: OrderRow[]; side: 'bid' | 'ask' }) {
  const max = rows.reduce((m, r) => Math.max(m, r.volume), 1);
  return (
    <div className="p-3">
      <div className={`text-[11px] uppercase font-semibold tracking-wider mb-2 ${side === 'bid' ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>
        {side === 'bid' ? 'Bids' : 'Asks'}
      </div>
      <div className="space-y-[2px]">
        {rows.map((r, i) => (
          <div key={i} className="relative h-7 grid grid-cols-3 items-center text-[12px] px-2 rounded">
            <div className="absolute inset-y-0 right-0 rounded" style={{ width: `${(r.volume / max) * 100}%`, background: side === 'bid' ? 'rgba(26,138,91,0.10)' : 'rgba(192,57,43,0.10)' }} />
            <span className={`relative font-mono ${side === 'bid' ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>{formatZAR(r.price)}</span>
            <span className="relative text-right font-mono">{num(r.volume, 1)}</span>
            <span className="relative text-right text-[#6b7685] text-[11px]">{r.energy_type || ''}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="text-[11px] text-[#6b7685] py-2 text-center">No {side === 'bid' ? 'bids' : 'asks'}.</div>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// RejectionCard — inline, contextual AI explanation of a 422 from the
// order ticket. Renders straight under the form so the trader sees WHY
// the order was rejected and the 1-2 specific actions that would let it
// through, without leaving the screen.
// ════════════════════════════════════════════════════════════════════════
interface ExplanationPayload {
  human_explanation: string;
  suggested_remediations: Array<{ label: string; action: string; payload?: Record<string, unknown> }>;
  fallback?: boolean;
  cached?: boolean;
}

function RejectionCard({
  rejection,
  onApplyRemediation,
  onDismiss,
  onSeeAll,
}: {
  rejection: RejectionPayload;
  onApplyRemediation: (action: string, payload?: Record<string, unknown>) => void;
  onDismiss: () => void;
  onSeeAll: () => void;
}) {
  const [expl, setExpl] = useState<ExplanationPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/trading/rejections/${rejection.rejection_id}/explain`)
      .then((r) => { if (alive) setExpl(r.data?.data || null); })
      .catch(() => { if (alive) setExpl(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [rejection.rejection_id]);

  return (
    <div className="mt-4 rounded-lg border border-[#f5c6c2] bg-[#fdf2f1] p-3 text-[12px]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <XCircle size={14} className="mt-0.5 text-[#c0392b] flex-shrink-0" />
          <div>
            <div className="font-semibold text-[#0f1c2e]">{humaniseReasonCode(rejection.reason_code)}</div>
            <div className="text-[#3d4756] mt-0.5">{rejection.detail}</div>
          </div>
        </div>
        <button onClick={onDismiss} className="text-[10px] text-[#6b7685] hover:text-[#3d4756]">Dismiss</button>
      </div>
      {(loading || expl?.human_explanation) && (
        <div className="mt-2 flex items-start gap-2 text-[#3d4756]">
          <Sparkles size={11} className="mt-0.5 text-[#3b82c4] flex-shrink-0" />
          <div className="flex-1">
            {loading ? <span className="text-[#6b7685]">Generating explanation…</span> : expl?.human_explanation}
          </div>
        </div>
      )}
      {expl && expl.suggested_remediations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {expl.suggested_remediations.map((r, i) => (
            <button
              key={i}
              onClick={() => onApplyRemediation(r.action, r.payload)}
              className="h-7 px-3 rounded text-[11px] font-semibold bg-white border border-[#dde4ec] text-[#1a3a5c] hover:bg-[#eef2f7]">
              {r.label}
            </button>
          ))}
          <button
            onClick={onSeeAll}
            className="h-7 px-3 rounded text-[11px] font-semibold text-[#3b82c4] hover:underline">
            All my rejections →
          </button>
        </div>
      )}
    </div>
  );
}

function humaniseReasonCode(code: string): string {
  return code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (s) => s.toUpperCase());
}

// ════════════════════════════════════════════════════════════════════════
// Tab 6 — Rejections
//
// The audit log of every order placement that was blocked by pre-trade
// gating. Each row expands to show the AI explanation; the structured
// reason_code + snapshot are right there for support / risk officers.
// ════════════════════════════════════════════════════════════════════════
interface RejectionRow {
  id: string;
  attempted_at: string;
  reason_code: string;
  detail: string;
  side: string;
  energy_type: string;
  volume_mwh: number;
  price_zar_mwh: number | null;
  notional_zar: number;
}

function RejectionsTab() {
  const [rows, setRows] = useState<RejectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, ExplanationPayload | 'loading' | 'error' | null>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/trading/rejections');
      setRows((r.data?.data || []) as RejectionRow[]);
    } catch {
      setRows([]);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toggle = useCallback(async (id: string) => {
    if (expanded[id] && expanded[id] !== 'error') {
      setExpanded((e) => ({ ...e, [id]: null }));
      return;
    }
    setExpanded((e) => ({ ...e, [id]: 'loading' }));
    try {
      const r = await api.get(`/trading/rejections/${id}/explain`);
      setExpanded((e) => ({ ...e, [id]: (r.data?.data || null) as ExplanationPayload | null }));
    } catch {
      setExpanded((e) => ({ ...e, [id]: 'error' }));
    }
  }, [expanded]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#dde4ec] bg-white">
        <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold text-[14px] text-[#0f1c2e]">
            <XCircle size={14} /> Rejected order attempts
          </div>
          <button onClick={refresh} className="h-8 px-2 text-[12px] inline-flex items-center gap-1 rounded border border-[#dde4ec] hover:bg-[#eef2f7]">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </header>
        {loading ? <div className="p-8 text-center text-[13px] text-[#6b7685]">Loading…</div> : (
          rows.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#6b7685]">
              No rejections in the last 100 placements. Pre-trade gating is letting your orders through.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[#fafbfd]">
                  <tr className="text-[11px] uppercase text-[#6b7685]">
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 text-left">Reason</th>
                    <th className="px-4 py-2 text-left">Order</th>
                    <th className="px-4 py-2 text-right">Notional</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ex = expanded[r.id];
                    return (
                      <React.Fragment key={r.id}>
                        <tr className="border-t border-[#eef2f7] hover:bg-[#fafbfd]">
                          <td className="px-4 py-2 font-mono">{new Date(r.attempted_at).toLocaleString()}</td>
                          <td className="px-4 py-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#c0392b]">{humaniseReasonCode(r.reason_code)}</span>
                            <div className="text-[#6b7685] text-[11px] mt-0.5">{r.detail}</div>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`text-[11px] font-semibold uppercase ${r.side === 'buy' ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>{r.side}</span>{' '}
                            {num(r.volume_mwh, 1)} MWh {r.energy_type}
                            {r.price_zar_mwh != null && <span className="text-[#6b7685]"> @ {formatZAR(r.price_zar_mwh)}</span>}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">{formatZAR(r.notional_zar)}</td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => toggle(r.id)} className="text-[11px] text-[#3b82c4] hover:underline inline-flex items-center gap-1">
                              <Sparkles size={10} /> Why this happened {ex && ex !== 'error' && ex !== 'loading' ? '↑' : '→'}
                            </button>
                          </td>
                        </tr>
                        {ex === 'loading' && (
                          <tr className="border-t border-[#eef2f7] bg-[#fafbfd]">
                            <td colSpan={5} className="px-6 py-3 text-[#6b7685] text-[12px]">Generating explanation…</td>
                          </tr>
                        )}
                        {ex === 'error' && (
                          <tr className="border-t border-[#eef2f7] bg-[#fdf2f1]">
                            <td colSpan={5} className="px-6 py-3 text-[#c0392b] text-[12px]">Could not generate an explanation. The structured reason and detail above stand on their own.</td>
                          </tr>
                        )}
                        {ex && ex !== 'loading' && ex !== 'error' && (
                          <tr className="border-t border-[#eef2f7] bg-[#fafbfd]">
                            <td colSpan={5} className="px-6 py-3">
                              <div className="flex items-start gap-2 text-[12px] text-[#3d4756]">
                                <Sparkles size={12} className="mt-0.5 text-[#3b82c4] flex-shrink-0" />
                                <div className="flex-1">{ex.human_explanation}</div>
                              </div>
                              {ex.suggested_remediations.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {ex.suggested_remediations.map((s, i) => (
                                    <span key={i} className="h-6 px-2 rounded bg-white border border-[#dde4ec] text-[11px] text-[#1a3a5c] inline-flex items-center">
                                      {s.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {ex.cached && <div className="mt-1 text-[10px] text-[#6b7685]">cached</div>}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MyOrdersPanel — the trader's open + partial orders with inline Cancel
// and Amend actions. Inline (not a separate tab) so the loop "place →
// see → adjust → cancel" stays in one screen.
// ════════════════════════════════════════════════════════════════════════
function MyOrdersPanel({
  orders,
  onCancel,
  onAmend,
}: {
  orders: MyOrderRow[];
  onCancel: (id: string) => void;
  onAmend: (o: MyOrderRow) => void;
}) {
  const live = orders.filter((o) => o.status === 'open' || o.status === 'partial');
  const recent = orders.filter((o) => o.status !== 'open' && o.status !== 'partial').slice(0, 5);
  if (live.length === 0 && recent.length === 0) return null;
  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white">
      <header className="px-5 py-3 border-b border-[#eef2f7]">
        <div className="font-display font-semibold text-[14px] text-[#0f1c2e]">My orders</div>
        <div className="text-[11px] text-[#6b7685]">{live.length} live · {recent.length} recent</div>
      </header>
      <div className="overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-[#fafbfd]">
            <tr className="text-[11px] uppercase text-[#6b7685]">
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Side</th>
              <th className="px-4 py-2 text-left">Product</th>
              <th className="px-4 py-2 text-right">Filled / Total</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">TIF</th>
              <th className="px-4 py-2 text-right">Placed</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {[...live, ...recent].map((o) => {
              const remaining = Number(o.remaining_volume_mwh ?? o.volume_mwh);
              const filled = Number(o.volume_mwh) - remaining;
              const isLive = o.status === 'open' || o.status === 'partial';
              return (
                <tr key={o.id} className="border-t border-[#eef2f7] hover:bg-[#fafbfd]">
                  <td className="px-4 py-2">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[11px] font-semibold uppercase ${o.side === 'buy' ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>
                      {o.side}
                    </span>
                  </td>
                  <td className="px-4 py-2">{o.energy_type}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {num(filled, 1)} / {num(Number(o.volume_mwh), 1)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{o.price != null ? formatZAR(o.price) : <span className="text-[#6b7685]">market</span>}</td>
                  <td className="px-4 py-2 text-[11px] text-[#3d4756]">{o.order_type || 'limit'}</td>
                  <td className="px-4 py-2 text-[11px] text-[#3d4756]">{(o.time_in_force || 'gtc').toUpperCase()}</td>
                  <td className="px-4 py-2 text-right text-[11px] font-mono text-[#6b7685]">{new Date(o.created_at).toLocaleTimeString()}</td>
                  <td className="px-4 py-2 text-right">
                    {isLive && (
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => onAmend(o)} className="h-6 px-2 rounded text-[11px] text-[#3b82c4] hover:bg-[#eef2f7] inline-flex items-center gap-1">
                          <Edit3 size={10} /> Amend
                        </button>
                        <button onClick={() => onCancel(o.id)} className="h-6 px-2 rounded text-[11px] text-[#c0392b] hover:bg-[#fdf2f1]">
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'open' ? { bg: '#dbecfb', fg: '#1a5d97' } :
    status === 'partial' ? { bg: '#ffe9c2', fg: '#9b6610' } :
    status === 'matched' ? { bg: '#cdf0dd', fg: '#1a8a5b' } :
    status === 'cancelled' ? { bg: '#eef2f7', fg: '#6b7685' } :
    status === 'expired' ? { bg: '#fdf2f1', fg: '#c0392b' } :
    { bg: '#eef2f7', fg: '#3d4756' };
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider" style={{ background: tone.bg, color: tone.fg }}>
      {status}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════
// AmendModal — change price/volume on a live order. Surfaces the
// price-time priority impact inline before the trader confirms ("changing
// price loses your place in the queue") so the cost of the amendment is
// obvious. On 422 from the server, shows the structured rejection reason.
// ════════════════════════════════════════════════════════════════════════
function AmendModal({
  order,
  onClose,
  onSaved,
}: {
  order: MyOrderRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(order.price != null ? String(order.price) : '');
  const [volume, setVolume] = useState(String(order.volume_mwh));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newPrice = price === '' ? null : Number(price);
  const newVolume = Number(volume);
  const priceChanged = newPrice !== order.price;
  const volumeChanged = newVolume !== Number(order.volume_mwh);
  const lostPriority = priceChanged || newVolume > Number(order.volume_mwh);
  const noop = !priceChanged && !volumeChanged;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setError(null);
    try {
      await api.post(`/trading/orders/${order.id}/amend`, {
        price: priceChanged ? newPrice : undefined,
        volume_mwh: volumeChanged ? newVolume : undefined,
        reason: reason || undefined,
      });
      onSaved();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; data?: { reason_code?: string; detail?: string } } } };
      setError(err.response?.data?.data?.detail || err.response?.data?.error || (e as Error).message || 'Amendment failed');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-[#dde4ec] w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">Amend order</div>
            <div className="font-display font-semibold text-[14px] text-[#0f1c2e]">
              {order.side.toUpperCase()} {num(Number(order.volume_mwh), 1)} MWh {order.energy_type}
            </div>
          </div>
          <button onClick={onClose} className="text-[#6b7685] hover:text-[#3d4756]"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="New price (R/MWh)">
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" />
          </Field>
          <Field label="New volume (MWh)">
            <input type="number" value={volume} onChange={(e) => setVolume(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" />
          </Field>
          <Field label="Reason (optional)">
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" placeholder="e.g. risk limit revised" />
          </Field>
          <div className={`rounded-lg border px-3 py-2 text-[12px] flex items-start gap-2 ${lostPriority ? 'border-[#f5c6c2] bg-[#fdf2f1] text-[#c0392b]' : 'border-[#dde4ec] bg-[#fafbfd] text-[#3d4756]'}`}>
            <Sparkles size={12} className="mt-0.5 flex-shrink-0" />
            <div>
              {noop
                ? 'No changes yet — pick a new price or volume.'
                : lostPriority
                  ? `${priceChanged ? 'Price change' : 'Volume increase'} loses your place in the price-time queue — the order will be re-posted at the back.`
                  : 'Volume decrease keeps your existing price-time priority.'}
            </div>
          </div>
          {error && (
            <div className="rounded-lg border border-[#f5c6c2] bg-[#fdf2f1] text-[#c0392b] text-[12px] px-3 py-2 inline-flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-md border border-[#dde4ec] text-[13px]">Cancel</button>
            <button type="submit" disabled={noop || submitting}
              className="h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[13px] font-semibold disabled:opacity-50">
              {submitting ? 'Amending…' : 'Confirm amendment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Trading;



// ════════════════════════════════════════════════════════════════════════
// Tab 7 — Exceptions (L4 trade-side counterpart of settlement breaks)
//
// Lists every trade_exceptions row across fills the trader is party to.
// State machine: open → investigating → resolved | rejected; terminal
// transitions require notes (mirrors Settlement Breaks tab pattern).
// Trader files exceptions against bad-price / off-market / wrong-volume
// fills here rather than going through the full dispute / break-glass
// flow — the back office triages and resolves with an outcome.
// ════════════════════════════════════════════════════════════════════════

type TradeExceptionRow = {
  id: string;
  match_id: string;
  order_id: string;
  exception_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'rejected';
  reported_by: string;
  reported_at: string;
  reason: string;
  expected_value: number | null;
  actual_value: number | null;
  resolution_outcome: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  matched_volume_mwh: number;
  matched_price_zar: number;
};

const EX_SEVERITY_PILL: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-700',
};
const EX_STATUS_PILL: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  investigating: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-700',
  rejected: 'bg-gray-200 text-gray-700',
};

function ExceptionsTab() {
  const [rows, setRows] = useState<TradeExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('all');
  const [resolving, setResolving] = useState<TradeExceptionRow | null>(null);
  const [filing, setFiling] = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      const res = await api.get(`/trading/exceptions?${params.toString()}`);
      setRows((res.data?.data as TradeExceptionRow[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load exceptions');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const transition = async (id: string, to: 'investigating' | 'resolved' | 'rejected', notes?: string, outcome?: string) => {
    await api.post(`/trading/exceptions/${id}/transition`, { to, notes, outcome });
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[12px] text-[#6b7685]">Status:</span>
          {(['all', 'open', 'investigating', 'resolved', 'rejected'] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-full text-[11px] capitalize ${status === s ? 'bg-[#1a3a5c] text-white' : 'bg-white border border-[#dde4ec] text-[#3d4756]'}`}>
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFiling(true)}
          className="h-9 px-3 rounded-md bg-amber-600 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-amber-700"
        >
          <Plus size={14} /> File exception
        </button>
      </div>

      {loading && <div className="text-[13px] text-[#6b7685]">Loading…</div>}
      {err && <div className="text-[13px] text-red-700">{err}</div>}
      {!loading && !err && rows.length === 0 && (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-8 text-center">
          <div className="text-[14px] font-semibold text-[#0f1c2e]">No exceptions filed</div>
          <div className="text-[12px] text-[#6b7685] mt-1">Bad-price / off-market / wrong-volume fills filed against you will appear here.</div>
        </div>
      )}
      {!loading && !err && rows.length > 0 && (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Severity</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Fill</th>
                <th className="px-4 py-2">Reported</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#e5ebf2] hover:bg-[#f8fafc]">
                  <td className="px-4 py-2 capitalize">{r.exception_type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${EX_SEVERITY_PILL[r.severity] || 'bg-gray-100'}`}>{r.severity}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${EX_STATUS_PILL[r.status] || 'bg-gray-100'}`}>{r.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-2 text-[#6b7685] text-[11px]">
                    {num(r.matched_volume_mwh, 2)} MWh @ {formatZAR(r.matched_price_zar)}
                  </td>
                  <td className="px-4 py-2 text-[#6b7685]">{new Date(r.reported_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 max-w-md">
                    <span className="block truncate" title={r.reason}>{r.reason}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {r.status === 'open' && (
                        <button onClick={() => transition(r.id, 'investigating')} className="px-2 py-1 text-[11px] bg-blue-50 text-blue-700 rounded">Investigate</button>
                      )}
                      {(r.status === 'open' || r.status === 'investigating') && (
                        <>
                          <button onClick={() => setResolving({ ...r, status: 'resolved' as any })} className="px-2 py-1 text-[11px] bg-green-50 text-green-700 rounded">Resolve</button>
                          <button onClick={() => setResolving({ ...r, status: 'rejected' as any })} className="px-2 py-1 text-[11px] bg-gray-100 text-gray-700 rounded">Reject</button>
                        </>
                      )}
                      {(r.status === 'resolved' || r.status === 'rejected') && (
                        <span className="text-[11px] text-[#6b7685]">{r.resolution_outcome ? `outcome: ${r.resolution_outcome.replace(/_/g, ' ')}` : '—'}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolving && (
        <ResolveExceptionModal
          row={resolving}
          onClose={() => setResolving(null)}
          onDone={async (notes, outcome) => {
            const to = resolving.status as 'resolved' | 'rejected';
            setResolving(null);
            await transition(resolving.id, to, notes, outcome);
          }}
        />
      )}
      {filing && (
        <FileExceptionModal
          onClose={() => setFiling(false)}
          onDone={() => { setFiling(false); void load(); }}
        />
      )}
    </div>
  );
}

function ResolveExceptionModal({
  row, onClose, onDone,
}: {
  row: TradeExceptionRow;
  onClose: () => void;
  onDone: (notes: string, outcome: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const isResolved = row.status === 'resolved';
  const [outcome, setOutcome] = useState<string>(isResolved ? 'adjusted' : 'no_action');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (notes.trim().length < 3) { setErr('Notes ≥3 chars required.'); return; }
    setSaving(true); setErr(null);
    try { await onDone(notes, outcome); } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#0f1c2e]">{isResolved ? 'Resolve' : 'Reject'} exception</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-[12px] text-red-700">{err}</div>}
          <div className="text-[12px] text-[#6b7685]">{row.reason}</div>
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Outcome</span>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
              {isResolved ? (
                <>
                  <option value="adjusted">Adjusted</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="rebooked">Rebooked</option>
                  <option value="waived">Waived</option>
                  <option value="escalated">Escalated</option>
                </>
              ) : (
                <>
                  <option value="no_action">No action — exception not substantiated</option>
                  <option value="escalated">Escalate</option>
                </>
              )}
            </select>
          </label>
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="What changed? Required ≥3 chars." className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg resize-none" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 border border-[#dde4ec] rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${isResolved ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'}`}>
              {saving ? 'Saving…' : (isResolved ? 'Resolve' : 'Reject')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileExceptionModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [matchId, setMatchId] = useState('');
  const [exceptionType, setExceptionType] = useState('bad_price');
  const [severity, setSeverity] = useState('medium');
  const [reason, setReason] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!matchId) { setErr('Match (fill) ID required.'); return; }
    if (reason.trim().length < 3) { setErr('Reason ≥3 chars required.'); return; }
    setSaving(true); setErr(null);
    try {
      await api.post('/trading/exceptions', {
        match_id: matchId,
        exception_type: exceptionType,
        severity,
        reason,
        expected_value: expected ? Number(expected) : undefined,
        actual_value: actual ? Number(actual) : undefined,
      });
      onDone();
    } catch (e: unknown) {
      const anyErr = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(anyErr?.response?.data?.error || anyErr?.message || 'Failed to file');
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#0f1c2e]">File a trade exception</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-[12px] text-red-700">{err}</div>}
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Fill (match) ID</span>
            <input value={matchId} onChange={(e) => setMatchId(e.target.value)} placeholder="match_xxx" className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg font-mono text-[12px]" />
          </label>
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Exception type</span>
            <select value={exceptionType} onChange={(e) => setExceptionType(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
              <option value="bad_price">Bad price</option>
              <option value="off_market">Off-market execution</option>
              <option value="wrong_counterparty">Wrong counterparty</option>
              <option value="wrong_volume">Wrong volume</option>
              <option value="duplicate_fill">Duplicate fill</option>
              <option value="market_halt_override">Market-halt override</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Severity</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px]">
              <span className="text-[#6b7685]">Expected value</span>
              <input type="number" value={expected} onChange={(e) => setExpected(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg" />
            </label>
            <label className="block text-[13px]">
              <span className="text-[#6b7685]">Actual value</span>
              <input type="number" value={actual} onChange={(e) => setActual(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg" />
            </label>
          </div>
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Reason</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="What is wrong with this fill? At least 3 characters." className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg resize-none" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 border border-[#dde4ec] rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {saving ? 'Filing…' : 'File exception'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
