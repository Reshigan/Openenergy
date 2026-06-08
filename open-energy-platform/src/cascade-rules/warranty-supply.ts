// ─────────────────────────────────────────────────────────────────────────
// Layer-C cross-role push: Warranty recovery assessment → spare-parts
// provisioning notification. Only fires when defect_class === 'systemic'.
// Non-systemic defects are silently skipped. No DB lookup needed — the
// payload carries defect_class. Dedup on (source_entity_id, source_event).
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr } from '../utils/cascade-data';

const CHAIN_KEY = 'warranty_supply';
const SPARE_PARTS_ROUTE = '/esums/om?tab=spare-parts';

async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

const RULES: CascadeRule[] = [
  {
    id: 'warranty_supply.systemic_defect_spare_parts',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'warranty_recovery.assessment_complete',
    run: async (ctx: CascadeContext) => {
      // Only notify for systemic defects — isolated/random failures don't
      // warrant a fleet-wide spare-parts provisioning alert.
      if (dstr(ctx, 'defect_class') !== 'systemic') return;
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      await pushRoleAction(ctx.env, {
        target_role: 'support',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: 'Systemic defect confirmed — open spare-parts provisioning for affected components',
        body: {
          warranty_recovery_id: ctx.entity_id,
          defect_class: 'systemic',
          component: dstr(ctx, 'component'),
        },
        cross_option: { action_label: 'Open spare-parts provisioning', target_route: SPARE_PARTS_ROUTE },
        priority: 'high',
      });
    },
  },
];

export function registerWarrantySupplyRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

export function __warrantySupplyRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
