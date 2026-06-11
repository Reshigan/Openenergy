import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Lightbulb, RefreshCw } from 'lucide-react';
import {
  getChainInsights, getChainAiInsights,
  type ChainInsights, type InsightAiCard,
} from '../../lib/insights';

export interface InsightsPanelProps {
  chainKey: string;
  /** Human label for the chain/feature (defaults to the key). */
  label?: string;
  className?: string;
}

function zar(n: number): string {
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${Math.round(n)}`;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const w = 120, h = 28;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="text-[oklch(0.46_0.16_55)]">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function InsightsPanel({ chainKey, label, className }: InsightsPanelProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<ChainInsights | null>(null);
  const [cards, setCards] = useState<InsightAiCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [d, c] = await Promise.all([getChainInsights(chainKey), getChainAiInsights(chainKey)]);
      setData(d); setCards(c);
    } catch {
      setError('Insights unavailable.');
    } finally {
      setLoading(false);
    }
  }, [chainKey]);

  useEffect(() => { void load(); }, [load]);

  const empty = !loading && !error && data && data.totals.events_30d === 0 && data.snapshot.open_count === 0;

  return (
    <section className={`rounded-xl bg-white border border-[#dde4ec] ${className ?? ''}`}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#eef2f7]">
        <div className="flex items-center gap-2 text-[#0f1c2e]">
          <BarChart3 className="h-4 w-4 text-[oklch(0.46_0.16_55)]" aria-hidden />
          <h2 className="text-[13px] font-display font-semibold">Insights</h2>
          {label && <span className="text-[11px] text-[#6b7685] truncate max-w-[8rem]">{label}</span>}
        </div>
        <button
          type="button" onClick={() => void load()}
          className="rounded-md p-1.5 text-[#6b7685] hover:text-[#0f1c2e] hover:bg-[#eef2f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a]"
          aria-label="Refresh insights"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </header>

      <div className="p-3 space-y-3">
        {error && <p className="text-[11px] text-rose-600 px-1">{error}</p>}
        {empty && <p className="text-[11px] text-[#6b7685] px-1 py-4 text-center">No activity on this chain yet.</p>}

        {data && !empty && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Kpi label="Open" value={data.snapshot.open_count} />
              <Kpi label="Closed" value={data.snapshot.terminal_count} />
              <Kpi label="Breaches 30d" value={data.totals.breaches_30d} tone={data.totals.breaches_30d > 0 ? 'warn' : undefined} />
              <Kpi label="Value 30d" value={zar(data.totals.value_30d_zar)} />
            </div>

            {data.throughput.length > 1 && (
              <div className="rounded-lg bg-[#f8fafc] border border-[#e5ebf2] p-3">
                <p className="text-[10px] uppercase tracking-wide text-[#6b7685] mb-1">Events / day (30d)</p>
                <Sparkline points={data.throughput.map((p) => p.events)} />
              </div>
            )}

            {data.bottleneck && (
              <p className="text-[11px] text-[#3d4756] px-1">
                Bottleneck:{' '}
                <span className="font-medium text-[#0f1c2e]">{data.bottleneck.status.replaceAll('_', ' ')}</span>{' '}
                ({data.bottleneck.open_entities} waiting)
              </p>
            )}
          </>
        )}

        {cards.map((card) => (
          <article key={card.key} className="rounded-lg border border-amber-200 bg-gradient-to-br from-[#fffdf3] to-[#fff7e3] p-3">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[#0f1c2e] leading-snug">{card.title}</p>
                <p className="mt-1 text-[11px] text-[#6b7685] leading-snug">{card.why}</p>
                {card.accept?.href && (
                  <button
                    type="button" onClick={() => navigate(card.accept!.href!)}
                    className="mt-2 rounded-md bg-[#c2873a] hover:bg-[#a3702f] text-white text-[11px] font-semibold px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a]"
                  >
                    {card.accept.label}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'warn' }) {
  return (
    <div className="rounded-lg bg-[#f8fafc] border border-[#e5ebf2] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#6b7685]">{label}</p>
      <p className={`text-[15px] font-semibold ${tone === 'warn' ? 'text-amber-600' : 'text-[#0f1c2e]'}`}>{value}</p>
    </div>
  );
}
