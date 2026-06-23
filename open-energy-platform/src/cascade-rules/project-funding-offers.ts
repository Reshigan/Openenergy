// Layer C — the cascade drives the IPP's funding/offtake counterparty reach.
//  • When an IPP creates a project (ipp.project_created) the IPP itself gets a
//    "Review funding & offtake options" nudge in its own IncomingPanel, deep-linked
//    to the project's funding-options panel.
//  • When the IPP selects offers (marketplace.inquired on oe_offer_engagements,
//    fired by POST /projects/:id/engage) each chosen offeror — a carbon fund or a
//    lender — gets a "New funding request for <project>" action.
// Purely additive: both events already fire today. This module only adds Layer-C
// pushes alongside the existing legacy queue / notifications.
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr } from '../utils/cascade-data';

// Dedup keyed on (source_entity_id, source_event) — same convention as
// offtaker-procurement. Each engagement row pushes to exactly one offeror; the
// self-nudge keys on the project id. Check-then-insert, no DB UNIQUE guard.
async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

const RULES: CascadeRule[] = [
  // IPP loaded a new project → nudge the IPP to review the standing offers.
  {
    id: 'project_funding_offers.nudge_ipp',
    mode: 'drive',
    match: (ctx: CascadeContext) =>
      ctx.event === 'ipp.project_created' && ctx.entity_type === 'ipp_projects',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const name = dstr(ctx, 'project_name') ?? 'your project';
      await pushRoleAction(ctx.env, {
        target_role: 'ipp_developer',
        target_participant_id: ctx.actor_id,
        source_event: ctx.event,
        source_chain_key: 'project_funding_offers',
        source_entity_type: 'ipp_projects',
        source_entity_id: ctx.entity_id,
        title: `Funding & offtake options for ${name}`,
        body: { project_id: ctx.entity_id },
        cross_option: {
          action_label: 'Review options',
          target_route: `/projects/${ctx.entity_id}?panel=funding`,
        },
        priority: 'normal',
      });
    },
  },
  // IPP engaged an offer → tell the offeror (carbon fund / lender) a request is in.
  {
    id: 'project_funding_offers.request_to_offeror',
    mode: 'drive',
    match: (ctx: CascadeContext) =>
      ctx.event === 'marketplace.inquired' && ctx.entity_type === 'oe_offer_engagements',
    run: async (ctx: CascadeContext) => {
      const offeror = dstr(ctx, 'offeror_id');
      if (!offeror) return;
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      // Trust the role on the event but fall back to the live participant role.
      let role = dstr(ctx, 'offeror_role') ?? '';
      if (!role) {
        const row = (await ctx.env.DB.prepare(
          `SELECT role FROM participants WHERE id = ?`,
        ).bind(offeror).first()) as { role: string } | null;
        role = row?.role ?? 'lender';
      }
      const projectId = dstr(ctx, 'project_id');
      const projectName = dstr(ctx, 'project_name') ?? 'a project';
      const kind = dstr(ctx, 'offer_kind') ?? '';
      const isCarbon = kind.startsWith('carbon_');
      await pushRoleAction(ctx.env, {
        target_role: role,
        target_participant_id: offeror,
        source_event: ctx.event,
        source_chain_key: 'project_funding_offers',
        source_entity_type: 'oe_offer_engagements',
        source_entity_id: ctx.entity_id,
        title: `New ${isCarbon ? 'offtake' : 'funding'} request for ${projectName}`,
        body: {
          offer_id: dstr(ctx, 'offer_id'),
          offer_kind: kind,
          project_id: projectId,
          note: dstr(ctx, 'note') ?? '',
        },
        cross_option: {
          action_label: isCarbon ? 'Review offtake request' : 'Review funding request',
          target_route: projectId ? `/projects/${projectId}` : '/horizon',
        },
        priority: 'high',
      });
    },
  },
];

export function registerProjectFundingOfferRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

// Test-only accessor: the rule objects this module registers.
export function __projectFundingOfferRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
