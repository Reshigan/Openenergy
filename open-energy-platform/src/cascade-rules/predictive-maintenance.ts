// ─────────────────────────────────────────────────────────────────────────
// Layer-C cross-role push: Predictive asset health events → emergency PTW
// notification for the support team. When an asset prognostic is escalated
// or a confirmed failure is recorded, the support workstation IncomingPanel
// is notified to open an emergency Permit-to-Work.
// No DB lookup needed — payload carries site_id + tier.
// Dedup keys on (source_entity_id, source_event) only.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr } from '../utils/cascade-data';

const CHAIN_KEY = 'predictive_maintenance';
const WO_ROUTE = '/esums/om?tab=work-orders';

async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

function makeRule(eventName: string): CascadeRule {
  return {
    id: `predictive_maintenance.${eventName.replace('.', '_')}`,
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === eventName,
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const siteId = dstr(ctx, 'site_id') ?? ctx.entity_id;
      const tier = dstr(ctx, 'tier');
      await pushRoleAction(ctx.env, {
        target_role: 'support',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `Asset failure predicted — open emergency PTW for ${siteId}`,
        body: {
          site_id: siteId,
          tier,
          prognostic_id: ctx.entity_id,
        },
        cross_option: { action_label: 'Open emergency PTW', target_route: WO_ROUTE },
        priority: 'high',
      });
    },
  };
}

const RULES: CascadeRule[] = [
  makeRule('asset_prognostic.escalated'),
  makeRule('asset_prognostic.confirmed_failure'),
];

export function registerPredictiveMaintenanceRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

export function __predictiveMaintenanceRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
