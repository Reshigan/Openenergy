// Layer C — the cascade drives the offtaker's cross-party relationships.
//  • When an offtaker drafts an LOI (contract.created on loi_drafts) the matched
//    IPP gets a "Review LOI" action in its workstation inbox.
//  • When an offtaker inquires on a marketplace listing the seller gets a
//    "View inquiry" action.
// Purely additive: both events are already fired today (ai.ts /offtaker/loi and
// marketplace.ts /inquire). This module only adds Layer-C pushes alongside the
// existing legacy action_queue / notifications rows — no event-type changes.
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr, dnum } from '../utils/cascade-data';

// Best-effort dedup keyed on (source_entity_id, source_event) ONLY — never the
// target role. Each source entity has exactly one logical target (one LOI → one
// IPP; one inquiry → one seller), so if the resolved role drifts between firings
// (e.g. the seller's participant role is edited) we must still treat it as the
// same push, not a fresh one. NOTE: this is check-then-insert with no DB UNIQUE
// guard, so a genuine double-fire (DLQ replay racing the original) can still slip
// through. Hard idempotency would need a UNIQUE index on oe_role_action_queue —
// a platform-wide Layer-C change affecting every producer, out of scope here.
async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

const RULES: CascadeRule[] = [
  // Offtaker drafted an LOI → prompt the IPP to review it.
  {
    id: 'offtaker_procurement.loi_to_ipp',
    mode: 'drive',
    match: (ctx: CascadeContext) =>
      ctx.event === 'contract.created' && ctx.entity_type === 'loi_drafts',
    run: async (ctx: CascadeContext) => {
      const ipp = dstr(ctx, 'counterparty_id');
      if (!ipp) return;
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const name = dstr(ctx, 'project_name') ?? 'a project';
      await pushRoleAction(ctx.env, {
        target_role: 'ipp_developer',
        target_participant_id: ipp,
        source_event: ctx.event,
        source_chain_key: 'offtaker_procurement',
        source_entity_type: 'loi_drafts',
        source_entity_id: ctx.entity_id,
        title: `New Letter of Intent for ${name}`,
        body: {
          project_id: dstr(ctx, 'project_id'),
          annual_mwh: dnum(ctx, 'annual_mwh'),
          blended_price: dnum(ctx, 'blended_price'),
        },
        cross_option: {
          action_label: 'Review LOI',
          target_route: `/lois/${ctx.entity_id}`,
        },
        priority: 'high',
      });
    },
  },
  // Offtaker inquired on a marketplace listing → notify the seller.
  {
    id: 'offtaker_procurement.inquiry_to_seller',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'marketplace.inquired',
    run: async (ctx: CascadeContext) => {
      const seller = dstr(ctx, 'seller_id');
      if (!seller) return;
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const row = (await ctx.env.DB.prepare(
        `SELECT role FROM participants WHERE id = ?`,
      ).bind(seller).first()) as { role: string } | null;
      const role = row?.role ?? 'ipp_developer';
      const listingId = dstr(ctx, 'listing_id');
      await pushRoleAction(ctx.env, {
        target_role: role,
        target_participant_id: seller,
        source_event: ctx.event,
        source_chain_key: 'offtaker_procurement',
        source_entity_type: 'marketplace_inquiries',
        source_entity_id: ctx.entity_id,
        title: 'New marketplace inquiry',
        body: { listing_id: listingId },
        cross_option: {
          action_label: 'View inquiry',
          target_route: listingId ? `/marketplace?listing=${listingId}` : '/marketplace',
        },
        priority: 'normal',
      });
    },
  },
];

export function registerOfftakerProcurementRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

// Test-only accessor: the rule objects this module registers.
export function __offtakerProcurementRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
