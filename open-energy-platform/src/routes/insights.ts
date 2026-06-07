// ═══════════════════════════════════════════════════════════════════════════
// Layer D — per-chain Insights & Analytics HTTP surface.
// Reads ONLY the pre-aggregated rollup tables (oe_metrics_daily,
// oe_chain_metrics) plus a bounded live open/terminal read off the event log —
// never the ~80 live chain tables — so it stays cheap at national scale.
//   GET /chain/:chainKey      → snapshot + 30d throughput series + totals + bottleneck
//   GET /chain/:chainKey/ai   → deterministic AI insight cards (anomaly/trend),
//                               shaped like the SPA AiSuggestion (key/title/why/accept)
// Every authenticated role may read insights (no participant-scoped rows here —
// these are aggregate chain metrics, not tenant data).
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware } from '../middleware/auth';
import { computeOpenTerminal, isTerminalStatus } from '../utils/chain-state';

const insights = new Hono<HonoEnv>();
insights.use('*', authMiddleware);

interface DailyRow {
  metric_date: string;
  events_count: number;
  value_total_zar: number;
  sla_breaches: number;
  regulator_crossings: number;
}

// Pull the last 30 calendar days of daily rollups for a chain, oldest→newest.
async function recentDaily(env: HonoEnv['Bindings'], chainKey: string): Promise<DailyRow[]> {
  const res = await env.DB.prepare(
    `SELECT metric_date, events_count, value_total_zar, sla_breaches, regulator_crossings
       FROM oe_metrics_daily
      WHERE chain_key = ?
      ORDER BY metric_date DESC
      LIMIT 30`,
  ).bind(chainKey).all<DailyRow>();
  return (res.results ?? []).slice().reverse();
}

insights.get('/chain/:chainKey', async (c) => {
  const chainKey = c.req.param('chainKey');
  const [snapRow, daily, openTerminal] = await Promise.all([
    c.env.DB.prepare(
      `SELECT chain_key, open_count, terminal_count, breach_count, value_total_zar, last_event_at
         FROM oe_chain_metrics WHERE chain_key = ?`,
    ).bind(chainKey).first<Record<string, unknown>>(),
    recentDaily(c.env, chainKey),
    computeOpenTerminal(c.env.DB, chainKey),
  ]);

  const totals = daily.reduce(
    (a, r) => ({
      events_30d: a.events_30d + Number(r.events_count || 0),
      value_30d_zar: a.value_30d_zar + Number(r.value_total_zar || 0),
      breaches_30d: a.breaches_30d + Number(r.sla_breaches || 0),
      crossings_30d: a.crossings_30d + Number(r.regulator_crossings || 0),
    }),
    { events_30d: 0, value_30d_zar: 0, breaches_30d: 0, crossings_30d: 0 },
  );

  // Snapshot prefers the live open/terminal read (always current); the cumulative
  // value/breach/last_event come from the nightly snapshot if present. When no
  // nightly snapshot row exists yet, value_total_zar falls back to the trailing-30d
  // total (best-effort, not lifetime).
  const snapshot = {
    open_count: openTerminal.open_count,
    terminal_count: openTerminal.terminal_count,
    breach_count: Number(snapRow?.breach_count ?? 0),
    value_total_zar: Number(snapRow?.value_total_zar ?? totals.value_30d_zar),
    last_event_at: (snapRow?.last_event_at as string | null) ?? null,
  };

  // Bottleneck = the OPEN (non-terminal) status holding the most entities right
  // now. We fetch the full non-null status histogram (ordered by count) and pick
  // the first non-terminal one, classified by the chain's authoritative
  // isTerminalStatus (registry-exact for registered chains, heuristic otherwise).
  // TODO(W7): this is a second windowed scan over the same event subset as
  // computeOpenTerminal — collapse into a single histogram read off the replica.
  const hist = await c.env.DB.prepare(
    `WITH latest AS (
       SELECT entity_id, source_chain_status,
              ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY occurred_at DESC, id DESC) AS rn
         FROM oe_platform_events
        WHERE COALESCE(NULLIF(chain_key, ''), 'unattributed') = ?
     )
     SELECT source_chain_status AS status, COUNT(*) AS c
       FROM latest WHERE rn = 1 AND source_chain_status IS NOT NULL
      GROUP BY source_chain_status ORDER BY c DESC`,
  ).bind(chainKey).all<{ status: string; c: number }>();
  const bn = (hist.results ?? []).find((r) => !isTerminalStatus(r.status, chainKey)) ?? null;

  return c.json({
    success: true,
    data: {
      chain_key: chainKey,
      snapshot,
      throughput: daily.map((r) => ({
        date: r.metric_date,
        events: Number(r.events_count || 0),
        value_zar: Number(r.value_total_zar || 0),
        sla_breaches: Number(r.sla_breaches || 0),
        regulator_crossings: Number(r.regulator_crossings || 0),
      })),
      totals,
      bottleneck: bn?.status ? { status: bn.status, open_entities: Number(bn.c || 0) } : null,
    },
  });
});

interface AiCard {
  key: string;
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; href?: string };
}

insights.get('/chain/:chainKey/ai', async (c) => {
  const chainKey = c.req.param('chainKey');
  const daily = await recentDaily(c.env, chainKey);
  const cards: AiCard[] = [];
  if (daily.length === 0) return c.json({ success: true, data: cards });

  // Split into the last 7 ROWS vs the prior 7 rows (not calendar windows). Daily
  // rows are unique per day, so for a chain emitting daily this is 7d vs prior 7d;
  // a sparse chain's windows span more days, and a chain with ≤7 rows has an empty
  // prior window — the guards below (>=3, priorX>0) degrade safely in that case.
  const recent = daily.slice(-7);
  const prior = daily.slice(-14, -7);
  const sum = (rows: DailyRow[], k: keyof DailyRow) =>
    rows.reduce((s, r) => s + Number(r[k] || 0), 0);

  const recentBreaches = sum(recent, 'sla_breaches');
  const priorBreaches = sum(prior, 'sla_breaches');
  if (recentBreaches >= 3 && recentBreaches > priorBreaches) {
    // From a zero prior baseline a "% up" figure is meaningless (it's a brand
    // new spike, not a multiple), so report the raw count in that case.
    const title = priorBreaches > 0
      ? `SLA breaches up ${Math.round(((recentBreaches - priorBreaches) / priorBreaches) * 100)}% week-over-week`
      : `${recentBreaches} SLA breaches this week`;
    cards.push({
      key: 'breach_spike',
      title,
      why: `${recentBreaches} breaches in the last 7 days vs ${priorBreaches} the week before. Review the slowest stage and re-assign or escalate before the trend compounds.`,
      confidence: 0.7,
    });
  }

  const recentCrossings = sum(recent, 'regulator_crossings');
  if (recentCrossings >= 3) {
    cards.push({
      key: 'regulator_attention',
      title: `${recentCrossings} regulator crossings this week`,
      why: `Several transitions on this chain crossed to the regulator in the last 7 days. Confirm the evidence pack is complete to avoid an enforcement escalation.`,
      confidence: 0.65,
    });
  }

  const recentValue = sum(recent, 'value_total_zar');
  const priorValue = sum(prior, 'value_total_zar');
  if (priorValue > 0 && recentValue < priorValue * 0.5) {
    cards.push({
      key: 'throughput_drop',
      title: 'Value processed dropped sharply',
      why: `R${Math.round(recentValue).toLocaleString('en-ZA')} flowed through this chain in the last 7 days vs R${Math.round(priorValue).toLocaleString('en-ZA')} the prior week. Check for a stuck stage or a stalled counterparty.`,
      confidence: 0.6,
    });
  }

  return c.json({ success: true, data: cards });
});

export default insights;
