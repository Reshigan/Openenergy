// ════════════════════════════════════════════════════════════════════════
// TraderInsights — decision-support widgets for the trading desk.
//
//   1. PnlWaterfall       — UPL (mark-to-market) → realised → fees → net
//   2. MarkTermStructure  — mark price vs delivery date per energy type
//   3. OrderBookDepth     — bid/ask depth ladder for a chosen pair
//   4. ExecutionCostCard  — slippage vs benchmark (avg fill - mark)
//
// All four fetch from existing endpoints — no new backend.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, Legend,
} from 'recharts';
import { api } from '../../lib/api';

type Position = {
  energy_type: string;
  delivery_date: string;
  net_volume_mwh: number;
  avg_entry_price: number;
  unrealised_pnl_zar: number;
  realised_pnl_zar: number;
  last_mark_price: number;
};

type Mark = {
  energy_type: string;
  delivery_date: string;
  mark_price_zar_mwh: number;
  mark_date?: string;
};

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);
const formatZARm = (v: number) => `R${(v / 1_000_000).toFixed(2)}m`;

const ENERGY_COLOUR: Record<string, string> = {
  solar: '#f6c44a', wind: '#3b82c4', battery: '#6b3a82', power: '#1a3a5c',
  coal: '#3d3d3d', gas: '#e63946', carbon: '#1a8a5b',
};

// ─── 1 ─── PnL waterfall ──────────────────────────────────────────────
function PnlWaterfall({ positions }: { positions: Position[] }) {
  const steps = useMemo(() => {
    const upl = positions.reduce((s, p) => s + Number(p.unrealised_pnl_zar || 0), 0);
    const rpl = positions.reduce((s, p) => s + Number(p.realised_pnl_zar || 0), 0);
    // Fees & broker take are not in positions — show as placeholder slot.
    const fees = 0;
    const net = upl + rpl + fees;
    let running = 0;
    const rows = [
      { label: 'UPL',   delta: upl, kind: upl >= 0 ? 'add' : 'sub' },
      { label: 'RPL',   delta: rpl, kind: rpl >= 0 ? 'add' : 'sub' },
      { label: 'Fees',  delta: fees, kind: 'sub' as const },
      { label: 'Net P&L', delta: net, kind: 'total' as const },
    ];
    return rows.map((r) => {
      let base = 0, bar = 0;
      if (r.kind === 'total') { base = 0; bar = r.delta; running = r.delta; }
      else if (r.kind === 'add') { base = running; bar = r.delta; running += r.delta; }
      else { running += r.delta; base = running; bar = -r.delta; }
      return { ...r, base, bar };
    });
  }, [positions]);

  const net = steps[steps.length - 1]?.delta || 0;

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7] flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-[#0f1c2e]">P&L waterfall</div>
          <div className="text-[11px] text-[#6b7685]">Unrealised → realised → fees → net</div>
        </div>
        <div className={`text-[14px] font-mono font-semibold ${net >= 0 ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>
          {formatZAR(net)}
        </div>
      </header>
      <div style={{ height: 200 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={steps} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7685' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => formatZARm(Number(v))} />
            <Tooltip formatter={(v: any, _n: any, p: any) => [formatZAR(Math.abs(Number(v))), p?.payload?.label]} labelFormatter={() => ''} />
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="bar" stackId="a">
              {steps.map((s, i) => (
                <Cell key={i} fill={s.kind === 'total' ? (net >= 0 ? '#1a8a5b' : '#c0392b') : s.kind === 'add' ? '#1a8a5b' : '#c0392b'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 2 ─── Mark term structure ────────────────────────────────────────
function MarkTermStructure({ marks }: { marks: Mark[] }) {
  const data = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    const energies = new Set<string>();
    for (const m of marks) {
      const k = m.delivery_date;
      const row = byDate.get(k) || {};
      row[m.energy_type] = Number(m.mark_price_zar_mwh || 0);
      byDate.set(k, row);
      energies.add(m.energy_type);
    }
    const rows = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, r]) => ({ delivery: d, ...r }));
    return { rows, energies: Array.from(energies) };
  }, [marks]);

  if (!data.rows.length) {
    return <section className="widget-card widget-empty">No mark data.</section>;
  }

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7]">
        <div className="text-[13px] font-semibold text-[#0f1c2e]">Mark term structure</div>
        <div className="text-[11px] text-[#6b7685]">Mark price by delivery date — contango (up) or backwardation (down)</div>
      </header>
      <div style={{ height: 220 }} className="px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows} margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="delivery" tick={{ fontSize: 10, fill: '#6b7685' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `R${v}`} />
            <Tooltip formatter={(v: any) => `R${Number(v).toFixed(0)}/MWh`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {data.energies.map((e) => (
              <Line key={e} type="monotone" dataKey={e} stroke={ENERGY_COLOUR[e] || '#3b82c4'} strokeWidth={2} dot={false} name={e} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── 3 ─── Order book depth ───────────────────────────────────────────
type DepthLevel = { price: number; size: number; side: 'bid' | 'ask' };

function OrderBookDepth() {
  const [pair, setPair] = useState<string>('solar:2026-06');
  const [levels, setLevels] = useState<DepthLevel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const [energy, delivery] = pair.split(':');
    let cancelled = false;
    setLoading(true);
    api.get(`/trading/orders?energy_type=${energy}&delivery_date=${delivery}&status=open&limit=200`)
      .then((r) => {
        if (cancelled) return;
        const rows = (r.data?.data || []) as Array<{ side: string; price_zar_mwh: number; remaining_volume_mwh: number }>;
        const dpth: DepthLevel[] = rows.map((o) => ({
          price: Number(o.price_zar_mwh || 0),
          size: Number(o.remaining_volume_mwh || 0),
          side: (o.side === 'buy' ? 'bid' : 'ask') as 'bid' | 'ask',
        })).sort((a, b) => a.price - b.price);
        setLevels(dpth);
      })
      .catch(() => setLevels([]))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pair]);

  // Bucket prices into 50 R/MWh bins for a cleaner chart
  const ladder = useMemo(() => {
    const bins = new Map<number, { bid: number; ask: number }>();
    for (const l of levels) {
      const bin = Math.round(l.price / 50) * 50;
      const cur = bins.get(bin) || { bid: 0, ask: 0 };
      if (l.side === 'bid') cur.bid += l.size;
      else cur.ask += l.size;
      bins.set(bin, cur);
    }
    return Array.from(bins.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([price, v]) => ({ price, bid: v.bid, ask: -v.ask })); // ask negative for mirrored bar
  }, [levels]);

  const bestBid = Math.max(...levels.filter((l) => l.side === 'bid').map((l) => l.price), 0);
  const bestAsk = Math.min(...levels.filter((l) => l.side === 'ask').map((l) => l.price), Infinity);
  const spread = Number.isFinite(bestAsk) && bestBid > 0 ? bestAsk - bestBid : null;

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7] flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-[#0f1c2e]">Order book depth</div>
          <div className="text-[11px] text-[#6b7685]">Bid (green) vs ask (red) volume by price bucket</div>
        </div>
        <div className="flex items-center gap-2">
          <select value={pair} onChange={(e) => setPair(e.target.value)} className="h-8 px-2 rounded border border-[#dde4ec] text-[11px]">
            <option value="solar:2026-06">solar · 2026-06</option>
            <option value="wind:2026-06">wind · 2026-06</option>
            <option value="solar:2026-07">solar · 2026-07</option>
            <option value="wind:2026-07">wind · 2026-07</option>
            <option value="battery:2026-06">battery · 2026-06</option>
          </select>
          {spread != null && (
            <span className="text-[11px] text-[#6b7685]">
              Spread <span className="font-mono font-semibold text-[#0f1c2e]">R{spread.toFixed(0)}</span>
            </span>
          )}
        </div>
      </header>
      <div style={{ height: 220 }} className="px-2 pt-3">
        {loading ? (
          <div className="h-full grid place-items-center text-[12px] text-[#6b7685]">Loading depth…</div>
        ) : ladder.length === 0 ? (
          <div className="h-full grid place-items-center text-[12px] text-[#6b7685]">No open orders for this pair.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ladder} layout="vertical" stackOffset="sign" margin={{ top: 8, right: 16, bottom: 12, left: 28 }}>
              <CartesianGrid stroke="#eef2f7" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `${Math.abs(Number(v))}`} />
              <YAxis type="category" dataKey="price" tick={{ fontSize: 10, fill: '#6b7685' }} tickFormatter={(v) => `R${v}`} />
              <Tooltip formatter={(v: any) => `${Math.abs(Number(v)).toFixed(1)} MWh`} />
              <ReferenceLine x={0} stroke="#1a3a5c" />
              <Bar dataKey="bid" name="Bid" stackId="x" fill="#1a8a5b" />
              <Bar dataKey="ask" name="Ask" stackId="x" fill="#c0392b" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

// ─── 4 ─── Execution cost ─────────────────────────────────────────────
function ExecutionCostCard({ positions, marks }: { positions: Position[]; marks: Mark[] }) {
  const rows = useMemo(() => {
    const markBy = new Map<string, number>();
    for (const m of marks) markBy.set(`${m.energy_type}|${m.delivery_date}`, Number(m.mark_price_zar_mwh || 0));

    return positions
      .filter((p) => Math.abs(Number(p.net_volume_mwh || 0)) > 0)
      .map((p) => {
        const mark = markBy.get(`${p.energy_type}|${p.delivery_date}`) || Number(p.last_mark_price || 0);
        const avg = Number(p.avg_entry_price || 0);
        const slippage = mark > 0 ? avg - mark : 0;
        const slippageBps = mark > 0 ? (slippage / mark) * 10_000 : 0;
        return {
          key: `${p.energy_type} · ${p.delivery_date}`,
          slippageBps,
          slippageZar: slippage * Math.abs(Number(p.net_volume_mwh || 0)),
          vol: Math.abs(Number(p.net_volume_mwh || 0)),
        };
      })
      .sort((a, b) => Math.abs(b.slippageBps) - Math.abs(a.slippageBps))
      .slice(0, 8);
  }, [positions, marks]);

  if (!rows.length) {
    return <section className="widget-card widget-empty">No open positions to score.</section>;
  }

  const totalCost = rows.reduce((s, r) => s + r.slippageZar, 0);

  return (
    <section className="widget-card">
      <header className="px-4 py-3 border-b border-[#eef2f7] flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-[#0f1c2e]">Execution cost</div>
          <div className="text-[11px] text-[#6b7685]">Slippage vs mark — top positions by absolute bps</div>
        </div>
        <div className={`text-[13px] font-mono font-semibold ${totalCost <= 0 ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>
          Net {formatZAR(-totalCost)}
        </div>
      </header>
      <div className="p-3">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[#6b7685]">
              <th className="text-left py-1">Pair</th>
              <th className="text-right py-1">Vol (MWh)</th>
              <th className="text-right py-1">Slippage (bps)</th>
              <th className="text-right py-1">Slippage (R)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-[#eef2f7]">
                <td className="py-1">{r.key}</td>
                <td className="py-1 text-right font-mono">{r.vol.toFixed(0)}</td>
                <td className={`py-1 text-right font-mono ${r.slippageBps > 50 ? 'text-[#c0392b]' : r.slippageBps < -50 ? 'text-[#1a8a5b]' : 'text-[#3d4756]'}`}>
                  {r.slippageBps > 0 ? '+' : ''}{r.slippageBps.toFixed(1)}
                </td>
                <td className="py-1 text-right font-mono">{formatZAR(r.slippageZar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Composite component ──────────────────────────────────────────────
export function TraderInsights() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get('/trader-risk/positions').catch(() => ({ data: { data: [] } })),
      api.get('/trader-risk/mark-prices').catch(() => ({ data: { data: [] } })),
    ]).then(([p, m]) => {
      if (cancelled) return;
      setPositions((p.data?.data as Position[]) || []);
      setMarks((m.data?.data as Mark[]) || []);
    }).catch((e) => setErr(e instanceof Error ? e.message : 'load failed'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="text-[12px] text-[#6b7685]">Loading insights…</div>;
  if (err) return <div className="text-[12px] text-[#c0392b]">{err}</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <PnlWaterfall positions={positions} />
      <MarkTermStructure marks={marks} />
      <OrderBookDepth />
      <ExecutionCostCard positions={positions} marks={marks} />
    </div>
  );
}

export default TraderInsights;
