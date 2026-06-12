// ─────────────────────────────────────────────────────────────────────────
// Layer-C cross-role push: Loan default notice issued → trading freeze
// notification for admin (freeze counterparty positions) and lender
// (initiate enforcement per LMA EoD provisions).
// Two separate dedup keys: entity_id for admin, entity_id + ':lender' for
// lender, so both pushes fire independently.
// No DB lookup needed — payload carries borrower_party_name.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr } from '../utils/cascade-data';

const CHAIN_KEY = 'default_freeze';
const ADMIN_ROUTE = '/admin/platform?tab=trading-controls';
const LENDER_ROUTE = '/lender-suite/workstation?tab=loan_default_chain';
const MATCHED_EVENT = 'loan_default.default_notice_issued';

async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

const RULES: CascadeRule[] = [
  {
    id: 'default_freeze.admin_trading_freeze',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === MATCHED_EVENT,
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const borrower = dstr(ctx, 'borrower_party_name') ?? 'unknown borrower';
      await pushRoleAction(ctx.env, {
        target_role: 'admin',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `Loan default declared — review and freeze counterparty trading positions for ${borrower}`,
        body: {
          loan_default_id: ctx.entity_id,
          borrower_party_name: borrower,
        },
        cross_option: { action_label: 'Manage trading controls', target_route: ADMIN_ROUTE },
        priority: 'high',
      });
    },
  },
  {
    id: 'default_freeze.lender_enforcement',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === MATCHED_EVENT,
    run: async (ctx: CascadeContext) => {
      // Separate dedup key so admin and lender pushes can fire independently.
      const lenderEntityId = ctx.entity_id + ':lender';
      if (await alreadyPushed(ctx, lenderEntityId)) return;
      const borrower = dstr(ctx, 'borrower_party_name') ?? 'unknown borrower';
      await pushRoleAction(ctx.env, {
        target_role: 'lender',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: lenderEntityId,
        title: `Default notice issued — initiate enforcement steps per LMA EoD provisions for ${borrower}`,
        body: {
          loan_default_id: ctx.entity_id,
          borrower_party_name: borrower,
        },
        cross_option: { action_label: 'Review enforcement options', target_route: LENDER_ROUTE },
        priority: 'high',
      });
    },
  },
];

export function registerDefaultFreezeRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

export function __defaultFreezeRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
