// Layer-A — the cross-role deal engine drives counterparties' workstation inboxes.
//   • offer.published (targeted at a request) → the demand party gets "Compare offers".
//   • deal.accepted → the provider whose offer won gets "your offer was accepted"
//     (+ Track delivery / View LOI depending on the dispatch shape).
//   • deal.accepted / deal.subscribed legs on a funded objective → the objective
//     owner gets a "leg committed" progress nudge; objective.subscribed → the owner
//     gets a "fully subscribed — initiate close" prompt.
//   • deal.accepted / deal.cleared / deal.subscribed satisfy any condition_precedent
//     links that point FROM the now-done deal; dependent deals whose CPs are all met
//     prompt their owner.
//
// Purely additive: every triggering event is already fired by src/routes/deals.ts.
// This module only adds Layer-A pushRoleAction rows alongside the existing cascade
// behaviour — no event-type changes, no route changes (bar the barrel registration).
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr } from '../utils/cascade-data';

// Best-effort dedup keyed on (source_entity_id, source_event) ONLY — never the
// target role. Each (source entity, event) has exactly one logical target, so a
// role drift between firings must still count as the same push, not a fresh one.
// NOTE: check-then-insert with no DB UNIQUE guard, so a genuine double-fire (DLQ
// replay racing the original) can still slip through — same caveat as the other
// Layer-A producers; hardening that is a platform-wide change, out of scope here.
async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

interface RequestRow {
  id: string;
  demand_id: string | null;
  demand_role: string | null;
  tenant_id: string | null;
  objective_id: string | null;
}
async function loadRequest(ctx: CascadeContext, id: string): Promise<RequestRow | null> {
  return (await ctx.env.DB.prepare(
    `SELECT id, demand_id, demand_role, tenant_id, objective_id FROM oe_deal_requests WHERE id = ?`,
  ).bind(id).first()) as RequestRow | null;
}

interface ObjectiveRow {
  id: string;
  owner_id: string | null;
  owner_role: string | null;
  tenant_id: string | null;
  funding_target_zar: number | null;
  committed_zar: number | null;
  close_chain_key: string | null;
}
async function loadObjective(ctx: CascadeContext, id: string): Promise<ObjectiveRow | null> {
  return (await ctx.env.DB.prepare(
    `SELECT id, owner_id, owner_role, tenant_id, funding_target_zar, committed_zar, close_chain_key
       FROM oe_deal_objectives WHERE id = ?`,
  ).bind(id).first()) as ObjectiveRow | null;
}

const RULES: CascadeRule[] = [
  // ── Rule 1 — offer published against a request → notify the demand party. ──
  // Spam-safe: open-marketplace offers (no request_id) are discovered via GET
  // /options; only a targeted offer pushes.
  {
    id: 'deal_engine.offer_to_demand',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'deal.offer.published',
    run: async (ctx: CascadeContext) => {
      // request_id may ride the data payload or sit on the offer row.
      let requestId = dstr(ctx, 'request_id');
      if (!requestId) {
        const offer = (await ctx.env.DB.prepare(
          `SELECT request_id FROM oe_deal_offers WHERE id = ?`,
        ).bind(ctx.entity_id).first()) as { request_id: string | null } | null;
        requestId = offer?.request_id ?? null;
      }
      if (!requestId) return; // open-marketplace offer — discovered via options, never blasted.
      const req = await loadRequest(ctx, requestId);
      if (!req?.demand_role || !req.demand_id) return;
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const dealType = dstr(ctx, 'deal_type') ?? 'energy_supply';
      await pushRoleAction(ctx.env, {
        target_role: req.demand_role,
        target_participant_id: req.demand_id,
        tenant_id: req.tenant_id ?? undefined,
        source_event: ctx.event,
        source_chain_key: 'deal_engine',
        source_entity_type: 'deal_offers',
        source_entity_id: ctx.entity_id,
        title: `New offer for your ${dealType} request`,
        body: { offer_id: ctx.entity_id, request_id: requestId },
        cross_option: {
          action_label: 'Compare offers',
          target_route: `/deals/${dealType}/${requestId}/options`,
        },
        priority: 'normal',
      });
    },
  },

  // ── Rule 2 — offer accepted → notify the winning provider. ──
  {
    id: 'deal_engine.accept_to_provider',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'deal.accepted',
    run: async (ctx: CascadeContext) => {
      const offer = (await ctx.env.DB.prepare(
        `SELECT provider_id, provider_role, tenant_id, deal_type FROM oe_deal_offers WHERE id = ?`,
      ).bind(ctx.entity_id).first()) as
        | { provider_id: string | null; provider_role: string | null; tenant_id: string | null; deal_type: string | null }
        | null;
      if (!offer?.provider_role || !offer.provider_id) return;
      if (await alreadyPushed(ctx, ctx.entity_id)) return;

      const chainKey = dstr(ctx, 'chain_key');
      const caseId = dstr(ctx, 'dispatched_case_id');
      const loiId = dstr(ctx, 'loi_id');
      let crossOption: { action_label: string; target_route: string } | undefined;
      if (caseId && chainKey) {
        crossOption = { action_label: 'Track delivery', target_route: `/threads/${chainKey}/${caseId}` };
      } else if (loiId) {
        crossOption = { action_label: 'View LOI', target_route: `/lois/${loiId}` };
      }

      await pushRoleAction(ctx.env, {
        target_role: offer.provider_role,
        target_participant_id: offer.provider_id,
        tenant_id: offer.tenant_id ?? undefined,
        source_event: ctx.event,
        source_chain_key: 'deal_engine',
        source_entity_type: 'deal_offers',
        source_entity_id: ctx.entity_id,
        title: 'Your offer was accepted',
        body: {
          deal_type: offer.deal_type,
          request_id: dstr(ctx, 'request_id'),
          chain_key: chainKey,
          loi_id: loiId,
          dispatched_case_id: caseId,
        },
        ...(crossOption ? { cross_option: crossOption } : {}),
        priority: 'high',
      });
    },
  },

  // ── Rule 3a — a leg committed against a funded objective → progress nudge. ──
  // deal.accepted carries request_id in data; deal.subscribed's entity_id IS the
  // request id. dedup keyed on the leg source entity (offer for accept, request
  // for subscribe) so the two events on one leg don't both fire AND a replay of
  // either is idempotent.
  {
    id: 'deal_engine.leg_to_objective_progress',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'deal.accepted' || ctx.event === 'deal.subscribed',
    run: async (ctx: CascadeContext) => {
      const requestId = ctx.event === 'deal.subscribed' ? ctx.entity_id : dstr(ctx, 'request_id');
      if (!requestId) return;
      const req = await loadRequest(ctx, requestId);
      if (!req?.objective_id) return;
      const obj = await loadObjective(ctx, req.objective_id);
      if (!obj?.owner_role || !obj.owner_id) return;
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      await pushRoleAction(ctx.env, {
        target_role: obj.owner_role,
        target_participant_id: obj.owner_id,
        tenant_id: obj.tenant_id ?? undefined,
        source_event: ctx.event,
        source_chain_key: 'deal_engine',
        source_entity_type: 'deal_objectives',
        source_entity_id: ctx.entity_id,
        title: 'Capital-stack leg committed',
        body: {
          objective_id: obj.id,
          committed_zar: obj.committed_zar,
          funding_target_zar: obj.funding_target_zar,
        },
        priority: 'normal',
      });
    },
  },

  // ── Rule 3b — objective fully subscribed → prompt the owner to initiate close. ──
  // Does NOT auto-create a chain case; just surfaces the action.
  {
    id: 'deal_engine.objective_close_prompt',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'objective.subscribed',
    run: async (ctx: CascadeContext) => {
      const obj = await loadObjective(ctx, ctx.entity_id);
      if (!obj?.owner_role || !obj.owner_id) return;
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      await pushRoleAction(ctx.env, {
        target_role: obj.owner_role,
        target_participant_id: obj.owner_id,
        tenant_id: obj.tenant_id ?? undefined,
        source_event: ctx.event,
        source_chain_key: 'deal_engine',
        source_entity_type: 'deal_objectives',
        source_entity_id: ctx.entity_id,
        title: 'Capital stack fully subscribed',
        body: {
          objective_id: obj.id,
          funding_target_zar: obj.funding_target_zar,
          committed_zar: obj.committed_zar,
          close_chain_key: obj.close_chain_key,
        },
        cross_option: {
          action_label: 'Initiate close',
          target_route: `/objectives/${obj.id}`,
        },
        priority: 'high',
      });
    },
  },

  // ── Rule 4 — condition_precedent links resolve when the upstream deal closes. ──
  // condition_precedent ONLY (rofr is deliberately deferred). The accepted/cleared/
  // subscribed deal satisfies CP links pointing FROM it. For each dependent deal
  // whose CPs are now ALL met, prompt its owner. Defensive: links table is empty
  // in the common case.
  {
    id: 'deal_engine.link_resolver',
    mode: 'drive',
    match: (ctx: CascadeContext) =>
      ctx.event === 'deal.accepted' || ctx.event === 'deal.cleared' || ctx.event === 'deal.subscribed',
    run: async (ctx: CascadeContext) => {
      // The id(s) this event "completes". deal.accepted carries an offer (entity_id)
      // and may carry a request_id; deal.cleared/subscribed's entity_id IS the request.
      const fromIds = new Set<string>([ctx.entity_id]);
      if (ctx.event === 'deal.accepted') {
        const reqId = dstr(ctx, 'request_id');
        if (reqId) fromIds.add(reqId);
      }

      // Mark every pending CP link that points FROM one of these ids as met.
      const dependentToIds = new Set<string>();
      for (const fromId of fromIds) {
        const links = await ctx.env.DB.prepare(
          `SELECT id, to_id FROM oe_deal_links
            WHERE link_kind = 'condition_precedent' AND from_id = ? AND status != 'met'`,
        ).bind(fromId).all();
        for (const l of (links.results ?? []) as Array<{ id: string; to_id: string }>) {
          await ctx.env.DB.prepare(
            `UPDATE oe_deal_links SET condition_state = 'met', status = 'met', updated_at = datetime('now')
              WHERE id = ?`,
          ).bind(l.id).run();
          if (l.to_id) dependentToIds.add(l.to_id);
        }
      }

      // For each dependent deal whose CP links are now ALL met, prompt its owner.
      for (const toId of dependentToIds) {
        const unmet = await ctx.env.DB.prepare(
          `SELECT id FROM oe_deal_links
            WHERE link_kind = 'condition_precedent' AND to_id = ? AND status != 'met' LIMIT 1`,
        ).bind(toId).first();
        if (unmet) continue; // still has an unmet CP — not yet unblocked.

        // Resolve the dependent deal's owner. It may be an offer (provider) or a
        // request (demand). Best-effort: skip if we can't resolve a role.
        let role: string | null = null;
        let owner: string | null = null;
        let dealType = 'energy_supply';
        const off = (await ctx.env.DB.prepare(
          `SELECT provider_id, provider_role, deal_type FROM oe_deal_offers WHERE id = ?`,
        ).bind(toId).first()) as { provider_id: string | null; provider_role: string | null; deal_type: string | null } | null;
        if (off?.provider_role && off.provider_id) {
          role = off.provider_role; owner = off.provider_id; dealType = off.deal_type ?? dealType;
        } else {
          const req = await loadRequest(ctx, toId);
          if (req?.demand_role && req.demand_id) { role = req.demand_role; owner = req.demand_id; }
        }
        if (!role || !owner) continue;
        if (await alreadyPushed(ctx, toId)) continue;
        await pushRoleAction(ctx.env, {
          target_role: role,
          target_participant_id: owner,
          source_event: ctx.event,
          source_chain_key: 'deal_engine',
          source_entity_type: 'deal_links',
          source_entity_id: toId,
          title: 'Conditions precedent met',
          body: { dependent_id: toId },
          cross_option: { action_label: 'Proceed', target_route: `/deals/${dealType}/${toId}` },
          priority: 'high',
        });
      }
    },
  },
];

export function registerDealEngineRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

// Test-only accessor: the rule objects this module registers.
export function __dealEngineRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
