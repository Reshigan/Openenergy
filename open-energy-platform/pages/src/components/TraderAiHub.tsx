import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, TrendingUp, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';

type Recommendation = {
  action: 'match' | 'hedge' | 'place';
  my_order_id?: string;
  counterparty_order_id?: string;
  volume_mwh?: number;
  indicative_price?: number;
  rationale?: string;
  estimated_pnl_zar?: number;
};

type RecommendResponse = {
  text: string;
  fallback: boolean;
  structured?: { recommendations?: Recommendation[] } | Record<string, unknown>;
};

/**
 * TraderAiHub — AI copilot panel for the trader cockpit.
 * Calls POST /api/trading/recommend, renders the top actions, lets the trader
 * one-click create an order for any "place" recommendation.
 */
export function TraderAiHub() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const recs: Recommendation[] = (() => {
    const s = result?.structured as { recommendations?: Recommendation[] } | undefined;
    if (Array.isArray(s?.recommendations)) return s.recommendations;
    return [];
  })();

  const runRecommend = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/trading/recommend', { max_recommendations: 5 });
      setResult(res.data?.data as RecommendResponse);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to get recommendations');
    } finally {
      setLoading(false);
    }
  };

  const oneClickPlace = async (r: Recommendation, idx: number) => {
    setCreating(`${idx}`);
    try {
      await api.post('/trading/orders', {
        side: 'buy',
        energy_type: 'solar',
        volume_mwh: r.volume_mwh || 10,
        price_min: r.indicative_price,
        market_type: 'bilateral',
      });
      navigate('/trading');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create order');
    } finally {
      setCreating(null);
    }
  };

  return (
    <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: '#e5e5e5' }}>
      <header className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#f0f1f2' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
               style={{ background: 'linear-gradient(135deg,#0a6ed1 0%,#5d36ff 100%)' }}>
            <Sparkles size={18} />
          </div>
          <div className="leading-tight">
            <h2 className="text-[15px] font-semibold" style={{ color: '#32363a' }}>Trader AI copilot</h2>
            <p className="text-[12px]" style={{ color: '#6a6d70' }}>
              Match / hedge / place recommendations from the live order book
            </p>
          </div>
        </div>
        <button
          onClick={runRecommend}
          disabled={loading}
          className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white inline-flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0a6ed1 0%,#5d36ff 100%)' }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
          {loading ? 'Analysing…' : 'Recommend actions'}
        </button>
      </header>

      <div className="p-5 space-y-3">
        {error && (
          <div className="text-[13px] rounded-md px-3 py-2" style={{ background: '#ffebeb', color: '#bb0000' }}>
            {error}
          </div>
        )}
        {!result && !loading && (
          <div className="text-[13px]" style={{ color: '#6a6d70' }}>
            Hit "Recommend actions" to get AI-ranked opportunities across your open orders and the book.
          </div>
        )}
        {result?.text && (
          <pre className="text-[12px] whitespace-pre-wrap font-mono p-3 rounded-md"
               style={{ background: '#f7f8f9', color: '#32363a' }}>
            {result.text}
          </pre>
        )}
        {recs.length > 0 && (
          <div className="space-y-2">
            {recs.map((r, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-md border"
                   style={{ borderColor: '#e5e5e5', background: '#fafafa' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: '#32363a' }}>
                    {(r.action || 'place').toUpperCase()}
                    {r.volume_mwh ? ` · ${r.volume_mwh} MWh` : ''}
                    {r.indicative_price ? ` @ R${r.indicative_price}/MWh` : ''}
                  </div>
                  {r.rationale && (
                    <div className="text-[12px] truncate" style={{ color: '#6a6d70' }}>{r.rationale}</div>
                  )}
                  {typeof r.estimated_pnl_zar === 'number' && (
                    <div className="text-[11px] mt-1 font-semibold"
                         style={{ color: r.estimated_pnl_zar >= 0 ? '#107e3e' : '#bb0000' }}>
                      P&L est. R{r.estimated_pnl_zar.toLocaleString()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => oneClickPlace(r, i)}
                  disabled={creating === `${i}`}
                  className="text-[12px] font-semibold px-3 h-8 rounded-md inline-flex items-center gap-1"
                  style={{ background: '#e5f0fa', color: '#0a6ed1' }}
                >
                  {creating === `${i}` ? 'Creating…' : 'Place order'} <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default TraderAiHub;
