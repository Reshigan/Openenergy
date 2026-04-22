import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, TrendingUp, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { NarrativeText } from './NarrativeText';

type Recommendation = {
  action: 'match' | 'hedge' | 'place';
  my_order_id?: string;
  counterparty_order_id?: string;
  side?: 'buy' | 'sell';
  energy_type?: string;
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
 * Return the index of the matching '}' that closes the JSON object starting at
 * position 0, or -1 if no balanced object is found. Quote-aware: braces inside
 * string values are ignored, backslash escapes inside strings are handled.
 */
function findJsonObjectEnd(s: string): number {
  if (s[0] !== '{') return -1;
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === '\\') { i++; continue; } // skip the escaped char
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

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
    const s = result?.structured as
      | { recommendations?: Recommendation[] }
      | Recommendation[]
      | undefined;
    if (Array.isArray(s)) return s as Recommendation[];
    if (Array.isArray((s as { recommendations?: Recommendation[] } | undefined)?.recommendations)) {
      return (s as { recommendations: Recommendation[] }).recommendations;
    }
    return [];
  })();

  // The LLM typically wraps its output in a ```json …``` fence (the prompt
  // asks for exactly that), and sometimes echoes the whole structured payload
  // as prose. When we've already parsed `recs`, the structured cards ARE the
  // rendered form — the raw text is pure duplication, so we drop it. When we
  // have no recs (fallback path), we still show the text but with code fences
  // and any JSON-blob prefix stripped so the trader sees prose, not a blob.
  const narrativeText = (() => {
    const raw = result?.text?.trim();
    if (!raw) return '';
    if (recs.length > 0) return '';

    // Strip ```json … ``` (or generic ```) code fences — anywhere in the text.
    let cleaned = raw
      .replace(/```(?:json|javascript|js)?\s*[\s\S]*?```/gi, '')
      .trim();

    // Some models prefix a bare JSON object before prose — drop a leading { … }
    // block if what's left after it is non-empty prose. Use a quote-aware
    // scanner so braces inside string values don't throw off the depth count
    // (e.g. `{"rationale":"fell below } threshold"}`).
    if (cleaned.startsWith('{')) {
      const end = findJsonObjectEnd(cleaned);
      if (end > 0) {
        const after = cleaned.slice(end + 1).trim();
        if (after.length > 0) cleaned = after;
      }
    }

    return cleaned.trim();
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

  const oneClickAction = async (r: Recommendation, idx: number) => {
    setCreating(`${idx}`);
    setError(null);
    try {
      if (r.action === 'match' && r.my_order_id && r.counterparty_order_id) {
        // Need to figure out which side each id is. We pass the ids as-is; the
        // match endpoint validates sides. The simpler convention: my_order and
        // counterparty_order are already paired opposite. Resolve at server.
        // For the client we use: if rec.side === 'buy', my_order is buy.
        const mySide = r.side || 'buy';
        const body = mySide === 'buy'
          ? {
              buy_order_id: r.my_order_id,
              sell_order_id: r.counterparty_order_id,
              volume_mwh: r.volume_mwh || 10,
              price_per_mwh: r.indicative_price,
            }
          : {
              buy_order_id: r.counterparty_order_id,
              sell_order_id: r.my_order_id,
              volume_mwh: r.volume_mwh || 10,
              price_per_mwh: r.indicative_price,
            };
        await api.post('/trading/match', body);
        navigate('/trading');
        return;
      }
      const side = r.side || 'buy';
      await api.post('/trading/orders', {
        side,
        energy_type: r.energy_type || 'solar',
        volume_mwh: r.volume_mwh || 10,
        price_min: side === 'buy' ? undefined : r.indicative_price,
        price_max: side === 'buy' ? r.indicative_price : undefined,
        market_type: 'bilateral',
      });
      navigate('/trading');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to execute action');
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
        {narrativeText && (
          <NarrativeText text={narrativeText} tone="bubble" />
        )}
        {result && recs.length === 0 && !narrativeText && !loading && (
          <div className="text-[13px]" style={{ color: '#6a6d70' }}>
            No actionable recommendations from the current order book — try again once more orders are posted.
          </div>
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
                  onClick={() => oneClickAction(r, i)}
                  disabled={creating === `${i}`}
                  className="text-[12px] font-semibold px-3 h-8 rounded-md inline-flex items-center gap-1"
                  style={{ background: '#e5f0fa', color: '#0a6ed1' }}
                >
                  {creating === `${i}`
                    ? 'Executing…'
                    : r.action === 'match' ? 'Match now' : r.action === 'hedge' ? 'Create hedge' : 'Place order'}
                  <ArrowRight size={12} />
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
