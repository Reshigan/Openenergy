// ═══════════════════════════════════════════════════════════════════════════
// Layer A — grid-dispatch cascade rules.
// Migrated verbatim from handleSpecialCascades (the legacy switch) so each
// reaction writes byte-identical rows; the matching switch cases were deleted
// in the same commit (no double-fire). Two events:
//   grid.instruction_issued        → queue an urgent dispatch_acknowledge item
//                                    for the dispatched participant
//   grid.instruction_non_compliant → queue an urgent non_compliance item for
//                                    the participant who missed the dispatch
//
// Transforms applied to the lifted bodies: NONE — these already call
// enqueueAction(ctx.env.DB, …) and daysFromNow(...) directly (no generateId),
// so they are lifted byte-for-byte; ctx.actor_id preserved exactly as the
// legacy code used it.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { enqueueAction, daysFromNow } from './_enqueue';

export function registerGridDispatchRules(): void {
  // ── grid.instruction_issued ──────────────────────────────────────────────
  registerCascadeRule({
    id: 'grid_dispatch.instruction_issued',
    match: (ctx: CascadeContext) => ctx.event === 'grid.instruction_issued',
    run: async (ctx: CascadeContext) => {
      const pid = ctx.data?.participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'dispatch_acknowledge',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'dispatch_instructions',
          entity_id: ctx.entity_id,
          title: `Acknowledge dispatch: ${ctx.data?.instruction_number || ''}`,
          description: `${ctx.data?.instruction_type || 'Action required'} — target ${ctx.data?.target_mw ?? 0} MW effective ${ctx.data?.effective_from || 'now'}.`,
          due_date: daysFromNow(1),
        });
      }
    },
  });

  // ── grid.instruction_non_compliant ───────────────────────────────────────
  registerCascadeRule({
    id: 'grid_dispatch.instruction_non_compliant',
    match: (ctx: CascadeContext) => ctx.event === 'grid.instruction_non_compliant',
    run: async (ctx: CascadeContext) => {
      const pid = ctx.data?.participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'non_compliance',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'dispatch_instructions',
          entity_id: ctx.entity_id,
          title: 'Dispatch non-compliance — review and respond',
          description: `Penalty assessed: R${(ctx.data?.penalty_amount_zar as number) || 0}. Provide evidence or appeal.`,
          due_date: daysFromNow(7),
        });
      }
    },
  });
}
