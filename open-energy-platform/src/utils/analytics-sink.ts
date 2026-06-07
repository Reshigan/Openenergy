// ═══════════════════════════════════════════════════════════════════════════
// Layer D — Insights & Analytics sink.
// recordPlatformEvent(ctx) appends one append-only row to oe_platform_events.
// The nightly rollup cron (Week 4) aggregates this into oe_metrics_daily /
// oe_chain_metrics; dashboards read the rollups, never this raw table.
// Error-isolated by the caller.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from './cascade';

// Some registered chains fire fireCascade() without setting chain_key /
// source_chain_status on the context (they pass everything else through
// `data`). Without attribution their events land as 'unattributed' in the
// rollup and the matching InsightsPanel stays permanently empty. This map
// recovers chain_key from entity_type for those chains. Every entry is an
// identity mapping except 'regulator_levy' → 'levy_assessment' (the chain's
// canonical chain_key in chain-terminal-registry.ts differs from its
// entity_type).
const ENTITY_TYPE_TO_CHAIN_KEY: Record<string, string> = {
  drawdown: 'drawdown',
  loan_default: 'loan_default',
  reserve_account: 'reserve_account',
  carbon_retirement: 'carbon_retirement',
  regulator_levy: 'levy_assessment',
};

/** Attribute the event to a Layer-D chain: explicit chain_key wins, else map from entity_type. */
function attributeChainKey(ctx: CascadeContext): string | null {
  return ctx.chain_key ?? ENTITY_TYPE_TO_CHAIN_KEY[ctx.entity_type] ?? null;
}

/**
 * Resolve the post-transition status for a registered chain. Explicit
 * source_chain_status wins; otherwise (only when the event attributes to a
 * chain) read it from the cascade payload — chains carry it as either
 * data.to_status or data.chain_status. Returns null when neither applies.
 */
function attributeChainStatus(ctx: CascadeContext, chainKey: string | null): string | null {
  if (ctx.source_chain_status) return ctx.source_chain_status;
  if (!chainKey) return null;
  const d = ctx.data as Record<string, unknown> | undefined;
  const status = d?.to_status ?? d?.chain_status;
  return typeof status === 'string' ? status : null;
}

export async function recordPlatformEvent(ctx: CascadeContext): Promise<void> {
  const chainKey = attributeChainKey(ctx);
  await ctx.env.DB.prepare(
    `INSERT INTO oe_platform_events
       (id, event, chain_key, entity_type, entity_id, actor_id, source_chain_status,
        affected_roles, entity_value, data_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `pev_${crypto.randomUUID()}`,
    ctx.event,
    chainKey,
    ctx.entity_type,
    ctx.entity_id,
    ctx.actor_id ?? null,
    attributeChainStatus(ctx, chainKey),
    ctx.affected_roles ? JSON.stringify(ctx.affected_roles) : null,
    ctx.commercial?.entity_value ?? null,
    JSON.stringify(ctx.data ?? {}),
    new Date().toISOString(),
  ).run();
}
