// ═══════════════════════════════════════════════════════════════════════════
// Layer A — trader-margin cascade rules.
// Migrated verbatim from handleSpecialCascades (the legacy switch) so each
// reaction writes byte-identical rows; the matching switch case was deleted
// in the same commit (no double-fire). One event:
//   trader.margin_call_issued → queue an urgent margin_call item for the
//                               affected participant
//
// Transforms applied to the lifted body: NONE — already calls
// enqueueAction(ctx.env.DB, …) and daysFromNow(...) directly; ctx.actor_id
// preserved exactly.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { enqueueAction, daysFromNow } from './_enqueue';

export function registerTraderMarginRules(): void {
  // ── trader.margin_call_issued ────────────────────────────────────────────
  registerCascadeRule({
    id: 'trader_margin.margin_call_issued',
    match: (ctx: CascadeContext) => ctx.event === 'trader.margin_call_issued',
    run: async (ctx: CascadeContext) => {
      const pid = ctx.data?.participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'margin_call',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'margin_calls',
          entity_id: ctx.entity_id,
          title: 'Margin call — post collateral',
          description: `Shortfall R${(ctx.data?.shortfall_zar as number) || 0}. Due by ${ctx.data?.due_by || 'end of next business day'}.`,
          due_date: typeof ctx.data?.due_by === 'string'
            ? (ctx.data.due_by as string).slice(0, 10)
            : daysFromNow(1),
        });
      }
    },
  });
}
