import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, BookOpen, Brain, Cpu, Gauge,
  Play, Plus, RefreshCw, Search, Target, TrendingUp, Zap,
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

type Tab = 'terminal' | 'algo' | 'backtest' | 'blotter' | 'risk';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'terminal', label: 'Terminal',   icon: BookOpen },
  { id: 'algo',     label: 'Algo Rules', icon: Cpu },
  { id: 'backtest', label: 'Backtester', icon: Brain },
  { id: 'blotter',  label: 'Blotter',    icon: Activity },
  { id: 'risk',     label: 'Risk',       icon: Gauge },
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

      {tab === 'terminal' && <TerminalTab />}
      {tab === 'algo' && <AlgoRulesTab />}
      {tab === 'backtest' && <BacktesterTab />}
      {tab === 'blotter' && <BlotterTab />}
      {tab === 'risk' && <RiskTab />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 1 — Terminal (order book + ticket + recent prints)
// ════════════════════════════════════════════════════════════════════════
function TerminalTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderBook, setOrderBook] = useState<{ bids: OrderRow[]; asks: OrderRow[] }>({ bids: [], asks: [] });
  const [prints, setPrints] = useState<Array<{ matched_at: string; matched_price: number; matched_volume_mwh: number }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState({ side: 'buy' as 'buy' | 'sell', type: 'limit', price: '', volume: '', energy_type: 'solar' });

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [bookRes, printsRes] = await Promise.all([
        api.get('/trading/orderbook').catch(() => ({ data: { success: true, data: [] } })),
        api.get('/trading/matches').catch(() => ({ data: { success: true, data: [] } })),
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
    } catch (e: unknown) { setError((e as Error).message || 'Failed to load market'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await api.post('/trading/orders', { ...order, price: Number(order.price), volume_mwh: Number(order.volume) });
      setOrder({ ...order, price: '', volume: '' });
      refresh();
    } catch (e: unknown) { setError((e as Error).message || 'Order failed'); }
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
                className="w-full h-9 px-3 rounded-md border border-[#dde4ec] text-[13px]" placeholder="50" />
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
            <button type="submit" disabled={submitting}
              className={`w-full h-10 rounded-md text-white font-semibold text-[13px] ${order.side === 'buy' ? 'bg-[#1a8a5b]' : 'bg-[#c0392b]'} disabled:opacity-50`}>
              {submitting ? 'Submitting…' : `Submit ${order.side.toUpperCase()}`}
            </button>
          </form>
        </section>
      </div>

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
// ════════════════════════════════════════════════════════════════════════
function RiskTab() {
  const [positions, setPositions] = useState<Array<Record<string, unknown>>>([]);
  const [credit, setCredit] = useState<Record<string, unknown> | null>(null);
  const [collateral, setCollateral] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    Promise.all([
      api.get('/trader-risk/positions').catch(() => ({ data: { success: true, data: [] } })),
      api.get('/trader-risk/credit-check').catch(() => ({ data: { success: true, data: null } })),
      api.get('/trader-risk/collateral/accounts').catch(() => ({ data: { success: true, data: [] } })),
    ]).then(([p, cr, co]) => {
      setPositions((p.data?.data || []) as Array<Record<string, unknown>>);
      setCredit((cr.data?.data || null) as Record<string, unknown> | null);
      setCollateral((co.data?.data || []) as Array<Record<string, unknown>>);
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

export default Trading;
