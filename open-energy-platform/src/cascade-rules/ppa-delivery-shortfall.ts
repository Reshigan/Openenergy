// ─────────────────────────────────────────────────────────────────────────
// Layer-C generator-side PPA delivery seam. The offtaker obligation chain
// (offtaker-obligations.ts) fires offtaker.obligation_shortfall and
// offtaker.obligation_take_or_pay against an oe_offtaker_ppa_obligations row,
// but nothing surfaced those to the generator who actually earns the
// take-or-pay. These rules resolve the generator (the obligation's
// counterparty_id, which the event payload does NOT carry) and pushRoleAction()
// into oe_role_action_queue -> the IPP workstation IncomingPanel, deep-linking
// to the take-or-pay claims tab. Mirrors offtaker-procurement.ts /
// underserved-inboxes.ts (NOT the P6 enqueueAction work-queue surface).
// Dedup keys on (source_entity_id, source_event) only.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr, dnum } from '../utils/cascade-data';

const CHAIN_KEY = 'ppa_delivery_shortfall';
const CLAIM_ROUTE = '/ipp-lifecycle/workstation?tab=take-or-pay-claims';

async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

// The take-or-pay/shortfall payloads omit the generator, so resolve it from the
// obligation row. ctx.entity_id is the obligation id (offtaker-obligations.ts).
async function resolveGenerator(ctx: CascadeContext): Promise<string | null> {
  const row = (await ctx.env.DB.prepare(
    `SELECT counterparty_id FROM oe_offtaker_ppa_obligations WHERE id = ?`,
  ).bind(ctx.entity_id).first()) as { counterparty_id: string | null } | null;
  const generatorId = row?.counterparty_id;
  return generatorId && generatorId.length > 0 ? generatorId : null;
}

const RULES: CascadeRule[] = [
  {
    id: 'ppa_delivery_shortfall.take_or_pay_to_generator',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'offtaker.obligation_take_or_pay',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const generatorId = await resolveGenerator(ctx);
      if (!generatorId) return;
      const period = dstr(ctx, 'period_month');
      const amount = dnum(ctx, 'take_or_pay_amount_zar');
      await pushRoleAction(ctx.env, {
        target_role: 'ipp_developer',
        target_participant_id: generatorId,
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `Take-or-pay claim available${amount != null ? `: R${amount.toLocaleString()}` : ''}${period ? ` (${period})` : ''}`,
        body: {
          ppa_id: dstr(ctx, 'ppa_id'),
          period_month: period,
          take_or_pay_amount_zar: amount,
        },
        cross_option: { action_label: 'Review claim', target_route: CLAIM_ROUTE },
        priority: 'high',
      });
    },
  },
  {
    id: 'ppa_delivery_shortfall.shortfall_to_generator',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'offtaker.obligation_shortfall',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const generatorId = await resolveGenerator(ctx);
      if (!generatorId) return;
      const period = dstr(ctx, 'period_month');
      const shortfall = dnum(ctx, 'shortfall_mwh');
      const deadline = dstr(ctx, 'cure_deadline_at');
      await pushRoleAction(ctx.env, {
        target_role: 'ipp_developer',
        target_participant_id: generatorId,
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `PPA delivery shortfall flagged${period ? ` (${period})` : ''}`,
        body: {
          ppa_id: dstr(ctx, 'ppa_id'),
          period_month: period,
          shortfall_mwh: shortfall,
          cure_deadline_at: deadline,
        },
        cross_option: { action_label: 'Review claim', target_route: CLAIM_ROUTE },
        priority: 'normal',
        ...(deadline ? { sla_due_at: deadline } : {}),
      });
    },
  },
];

export function registerPpaDeliveryShortfallRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

export function __ppaDeliveryShortfallRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
