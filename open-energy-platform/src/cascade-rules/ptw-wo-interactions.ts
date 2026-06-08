// ─────────────────────────────────────────────────────────────────────────
// Layer-C cross-role push: Permit-to-Work lifecycle → Work Order surface.
// When a PTW is issued or revoked, the support team's workstation
// IncomingPanel is notified so they can proceed or stop work immediately.
// No DB lookup needed — the payload carries work_class + facility_id.
// Dedup keys on (source_entity_id, source_event) only.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr } from '../utils/cascade-data';

const CHAIN_KEY = 'ptw_wo_gate';
const WO_ROUTE = '/esums/om?tab=work-orders';

async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

const RULES: CascadeRule[] = [
  {
    id: 'ptw_wo_interactions.issued',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'permit_to_work.issued',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const workClass = dstr(ctx, 'work_class') ?? 'unclassified';
      const facilityId = dstr(ctx, 'facility_id') ?? ctx.entity_id;
      await pushRoleAction(ctx.env, {
        target_role: 'support',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `PTW issued — work order can now proceed: ${workClass} on ${facilityId}`,
        body: {
          work_class: workClass,
          facility_id: facilityId,
        },
        cross_option: { action_label: 'View work orders', target_route: WO_ROUTE },
        priority: 'high',
      });
    },
  },
  {
    id: 'ptw_wo_interactions.revoked',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'permit_to_work.revoked',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const workClass = dstr(ctx, 'work_class') ?? 'unclassified';
      const facilityId = dstr(ctx, 'facility_id') ?? ctx.entity_id;
      await pushRoleAction(ctx.env, {
        target_role: 'support',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `PTW revoked — stop all work immediately: ${workClass}`,
        body: {
          work_class: workClass,
          facility_id: facilityId,
        },
        cross_option: { action_label: 'View work orders', target_route: WO_ROUTE },
        priority: 'high',
      });
    },
  },
];

export function registerPtwWoInteractionRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

export function __ptwWoInteractionRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
