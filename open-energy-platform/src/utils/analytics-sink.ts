// ═══════════════════════════════════════════════════════════════════════════
// Layer D — Insights & Analytics sink.
// recordPlatformEvent(ctx) appends one append-only row to oe_platform_events.
// The nightly rollup cron (Week 4) aggregates this into oe_metrics_daily /
// oe_chain_metrics; dashboards read the rollups, never this raw table.
// Error-isolated by the caller.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from './cascade';

export async function recordPlatformEvent(ctx: CascadeContext): Promise<void> {
  await ctx.env.DB.prepare(
    `INSERT INTO oe_platform_events
       (id, event, chain_key, entity_type, entity_id, actor_id, source_chain_status,
        affected_roles, entity_value, data_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `pev_${crypto.randomUUID()}`,
    ctx.event,
    ctx.chain_key ?? null,
    ctx.entity_type,
    ctx.entity_id,
    ctx.actor_id ?? null,
    ctx.source_chain_status ?? null,
    ctx.affected_roles ? JSON.stringify(ctx.affected_roles) : null,
    ctx.commercial?.entity_value ?? null,
    JSON.stringify(ctx.data ?? {}),
    new Date().toISOString(),
  ).run();
}
