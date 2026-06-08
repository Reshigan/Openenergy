// ─────────────────────────────────────────────────────────────────────────
// Layer-C cross-role push: MYPD tariff determination issued → PPA reprice
// notification for offtakers (W39 tariff indexation) and IPP developers
// (revenue model update). No DB lookup needed — entity_id is the
// determination id. Two separate dedup keys so both pushes can fire
// independently: entity_id for offtaker, entity_id + ':ipp' for IPP.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';

const CHAIN_KEY = 'tariff_reprice';
const OFFTAKER_ROUTE = '/offtaker/workstation?tab=tariff_indexation_chain';
const IPP_ROUTE = '/ipp-lifecycle/workstation?tab=dscr_reports';
const MATCHED_EVENT = 'tariff_determination.determination_issued';

async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

const RULES: CascadeRule[] = [
  {
    id: 'tariff_reprice.offtaker_notification',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === MATCHED_EVENT,
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      await pushRoleAction(ctx.env, {
        target_role: 'offtaker',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: 'MYPD tariff determination issued — review and initiate PPA tariff indexation (W39)',
        body: { determination_id: ctx.entity_id },
        cross_option: { action_label: 'Review tariff indexation', target_route: OFFTAKER_ROUTE },
        priority: 'high',
      });
    },
  },
  {
    id: 'tariff_reprice.ipp_notification',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === MATCHED_EVENT,
    run: async (ctx: CascadeContext) => {
      // Separate dedup key so both offtaker and IPP pushes can fire independently.
      const ippEntityId = ctx.entity_id + ':ipp';
      if (await alreadyPushed(ctx, ippEntityId)) return;
      await pushRoleAction(ctx.env, {
        target_role: 'ipp_developer',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ippEntityId,
        title: 'MYPD tariff determination issued — update PPA pricing and revenue model',
        body: { determination_id: ctx.entity_id },
        cross_option: { action_label: 'Review revenue model', target_route: IPP_ROUTE },
        priority: 'normal',
      });
    },
  },
];

export function registerTariffRepriceRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

export function __tariffRepriceRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
