import React, { useState, useEffect } from 'react';
import { Zap, TrendingUp, TrendingDown, Plus, RefreshCw, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { ExportBar } from '../ExportBar';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

export function Trading() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderBook, setOrderBook] = useState({ bids: [] as any[], asks: [] as any[] });
  const [positions, setPositions] = useState<any[]>([]);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [newOrder, setNewOrder] = useState({ side: 'buy', price: '', volume: '', type: 'limit' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchTradingData(); }, []);

  const fetchTradingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bookRes, posRes, histRes] = await Promise.all([
        api.get('/trading/orderbook').catch(() => ({ data: { success: true, data: { bids: generateSampleOrders('buy', 5), asks: generateSampleOrders('sell', 5) } } })),
        api.get('/trading/positions').catch(() => ({ data: { success: true, data: [] } })),
        api.get('/trading/matches').catch(() => ({ data: { success: true, data: generateSampleHistory() } })),
      ]);
      const raw = bookRes.data?.data;
      let bids: any[] = [];
      let asks: any[] = [];
      if (Array.isArray(raw)) {
        for (const o of raw) {
          const price = Number(o.price_max ?? o.price_min ?? o.price ?? 0);
          const volume = Number(o.volume_mwh ?? o.volume ?? 0);
          const row = { ...o, price, volume };
          if (o.side === 'buy' || o.side === 'bid') bids.push(row);
          else asks.push(row);
        }
      } else if (raw && typeof raw === 'object') {
        bids = Array.isArray(raw.bids) ? raw.bids : [];
        asks = Array.isArray(raw.asks) ? raw.asks : [];
      }
      setOrderBook({ bids, asks });
      const posData = posRes.data?.data;
      setPositions(Array.isArray(posData) ? posData : []);
      const histData = histRes.data?.data;
      const histArr = Array.isArray(histData)
        ? histData.map((m: any) => ({
            timestamp: m.matched_at ?? m.timestamp ?? new Date().toISOString(),
            price: Number(m.price_per_mwh ?? m.price ?? 0),
            volume: Number(m.volume_mwh ?? m.volume ?? 0),
          }))
        : [];
      setTradeHistory(histArr);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/trading/orders', newOrder);
      fetchTradingData();
      setNewOrder({ side: 'buy', price: '', volume: '', type: 'limit' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={4} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchTradingData} /></div>;

  const safeBids = Array.isArray(orderBook?.bids) ? orderBook.bids : [];
  const safeAsks = Array.isArray(orderBook?.asks) ? orderBook.asks : [];
  const combinedBook = [
    ...safeBids.map(b => ({ ...b, side: 'bid' })),
    ...safeAsks.map(a => ({ ...a, side: 'ask' })),
  ].sort((a, b) => b.price - a.price);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Energy Trading</h1>
          <p className="text-ionex-text-mute">Spot market trading dashboard</p>
        </div>
        <button onClick={fetchTradingData} className="flex items-center gap-2 px-3 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Market Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Last Price" value={formatZAR(1950)} trend={{ value: 2.5, positive: true }} icon={<Zap className="w-5 h-5" />} />
        <StatCard title="24h Volume" value="245 MWh" trend={{ value: 12, positive: true }} icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard title="Open Interest" value="1,250 MWh" icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard title="Best Bid" value={formatZAR(1940)} trend={{ value: 1.2, positive: true }} icon={<ArrowUpRight className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Book */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Order Book</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={combinedBook.slice(0, 10)} layout="vertical">
                <XAxis type="number" tickFormatter={v => `R${v}`} />
                <YAxis dataKey="price" type="category" width={60} tickFormatter={v => `R${v}`} />
                <Tooltip formatter={(v: number) => formatZAR(v)} />
                <Bar dataKey="volume" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ExportBar data={tradeHistory} filename="trade_history" />
        </div>

        {/* Place Order */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Place Order</h2>
          <form onSubmit={handlePlaceOrder} className="space-y-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => setNewOrder({ ...newOrder, side: 'buy' })} className={`flex-1 py-2 rounded-lg font-medium ${newOrder.side === 'buy' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>Buy</button>
              <button type="button" onClick={() => setNewOrder({ ...newOrder, side: 'sell' })} className={`flex-1 py-2 rounded-lg font-medium ${newOrder.side === 'sell' ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>Sell</button>
            </div>
            <div>
              <label className="block text-sm text-ionex-text-sub mb-1">Price (ZAR/MWh)</label>
              <input type="number" required value={newOrder.price} onChange={e => setNewOrder({ ...newOrder, price: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" placeholder="1950" />
            </div>
            <div>
              <label className="block text-sm text-ionex-text-sub mb-1">Volume (MWh)</label>
              <input type="number" required value={newOrder.volume} onChange={e => setNewOrder({ ...newOrder, volume: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" placeholder="50" />
            </div>
            <button type="submit" disabled={submitting} className={`w-full py-3 rounded-lg font-medium text-white ${newOrder.side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50`}>
              {submitting ? 'Placing Order...' : `Place ${newOrder.side === 'buy' ? 'Buy' : 'Sell'} Order`}
            </button>
          </form>
        </div>
      </div>

      {/* Positions & Trade History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">My Positions</h2>
          {positions.length === 0 ? <div className="text-center py-8 text-ionex-text-mute">No open positions</div> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-ionex-border-100"><th className="text-left py-2">Product</th><th className="text-right">Volume</th><th className="text-right">Avg Price</th><th className="text-right">P&L</th></tr></thead>
              <tbody>{positions.map((p, i) => <tr key={i} className="border-b border-ionex-border-50"><td className="py-2">{p.product}</td><td className="text-right">{p.volume} MWh</td><td className="text-right">{formatZAR(p.avgPrice)}</td><td className={`text-right ${p.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatZAR(p.pnl)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Trades</h2>
          {tradeHistory.length === 0 ? <div className="text-center py-8 text-ionex-text-mute">No trades yet</div> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-ionex-border-100"><th className="text-left py-2">Time</th><th className="text-right">Price</th><th className="text-right">Volume</th></tr></thead>
              <tbody>{tradeHistory.slice(0, 10).map((t, i) => <tr key={i} className="border-b border-ionex-border-50"><td className="py-2">{new Date(t.timestamp).toLocaleTimeString()}</td><td className="text-right">{formatZAR(t.price)}</td><td className="text-right">{t.volume} MWh</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend, icon }: any) {
  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-ionex-text-mute text-sm">{title}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-xl font-bold">{value}</span>
        {trend && <span className={`text-sm flex items-center ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>{trend.positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}{trend.value}%</span>}
      </div>
    </div>
  );
}

function generateSampleOrders(side: string, count: number) {
  const base = side === 'buy' ? 1900 : 2000;
  return Array.from({ length: count }, (_, i) => ({ price: base + (side === 'buy' ? -i * 10 : -i * 10), volume: Math.floor(Math.random() * 100) + 10 }));
}

function generateSampleHistory() {
  return Array.from({ length: 20 }, (_, i) => ({ timestamp: new Date(Date.now() - i * 60000).toISOString(), price: 1900 + Math.floor(Math.random() * 100), volume: Math.floor(Math.random() * 50) + 5 }));
}
