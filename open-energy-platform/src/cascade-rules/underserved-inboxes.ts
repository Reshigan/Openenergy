// ─────────────────────────────────────────────────────────────────────────
// Layer-C cross-role pushes for three inboxes the audit found starved:
// grid_operator, offtaker, support. Each rule matches an event that ALREADY
// fires (grid-wheeling-charges.ts / support.ts) and pushRoleAction()s into
// oe_role_action_queue -> the workstation IncomingPanel. Mirrors
// offtaker-procurement.ts (NOT grid-dispatch.ts/trader-margin.ts: those use
// the P6 enqueueAction/oe_action_queue work-queue, a different surface).
// Dedup keys on (source_entity_id, source_event) only.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
import { dstr, dnum } from '../utils/cascade-data';

const CHAIN_KEY = 'underserved_inboxes';
const ACTION_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

const RULES: CascadeRule[] = [
  {
    id: 'underserved_inboxes.grid_wheeling_dispute',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'grid.wheeling_charge_disputed',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const period = dstr(ctx, 'period_month');
      const claimed = dnum(ctx, 'claimed_amount_zar');
      await pushRoleAction(ctx.env, {
        target_role: 'grid_operator',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `Wheeling charge disputed${period ? ` (${period})` : ''}`,
        body: {
          agreement_id: dstr(ctx, 'agreement_id'),
          period_month: period,
          dispute_id: dstr(ctx, 'dispute_id'),
          claimed_amount_zar: claimed,
        },
        cross_option: {
          action_label: 'Resolve dispute',
          target_route: '/grid-operator/workstation?tab=wheeling_charges',
        },
        priority: 'high',
      });
    },
  },
  {
    id: 'underserved_inboxes.offtaker_wheeling_charge',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'grid.wheeling_charge_issued',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const agreementId = dstr(ctx, 'agreement_id');
      if (!agreementId) return;
      // ctx.env.DB.first() is not generic in this context (matches offtaker-procurement.ts);
      // type the cast as nullable so the `!offtakerId` guard below is type-sound.
      const agreement = (await ctx.env.DB.prepare(
        `SELECT offtaker_id FROM oe_wheeling_agreements WHERE id = ?`,
      ).bind(agreementId).first()) as { offtaker_id: string | null } | null;
      const offtakerId = agreement?.offtaker_id;
      if (!offtakerId) return;
      const total = dnum(ctx, 'total_zar');
      const period = dstr(ctx, 'period_month');
      const deadline = dstr(ctx, 'dispute_deadline_at');
      await pushRoleAction(ctx.env, {
        target_role: 'offtaker',
        target_participant_id: offtakerId,
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `Wheeling charge issued${total != null ? `: R${total.toLocaleString()}` : ''}${period ? ` (${period})` : ''}`,
        body: { agreement_id: agreementId, period_month: period, total_zar: total, dispute_deadline_at: deadline },
        cross_option: {
          action_label: 'Review charge',
          target_route: '/offtaker-suite/workstation?tab=wheeling_charges',
        },
        priority: 'normal',
        ...(deadline ? { sla_due_at: deadline } : {}),
      });
    },
  },
  {
    id: 'underserved_inboxes.support_ticket_opened',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'support.ticket_opened',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const subject = dstr(ctx, 'subject') ?? 'New ticket';
      const ticketNo = dstr(ctx, 'ticket_number');
      const ticketPriority = dstr(ctx, 'priority');
      const priority = (ticketPriority && ACTION_PRIORITIES.has(ticketPriority)
        ? ticketPriority
        : 'normal') as 'low' | 'normal' | 'high' | 'urgent';
      await pushRoleAction(ctx.env, {
        target_role: 'support',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `New support ticket: ${subject}`,
        body: {
          ticket_number: ticketNo,
          reporter_id: dstr(ctx, 'reporter_id'),
          category: dstr(ctx, 'category'),
          priority: ticketPriority,
        },
        cross_option: {
          action_label: 'Open ticket',
          target_route: `/support/tickets/${ctx.entity_id}`,
        },
        priority,
      });
    },
  },
];

export function registerUnderservedInboxRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

export function __underservedInboxRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
