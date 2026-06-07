// ═══════════════════════════════════════════════════════════════════════════
// Layer A — carbon-events cascade rules.
// Migrated verbatim from handleSpecialCascades (the legacy switch) so each
// reaction writes byte-identical rows; the matching switch case was deleted
// in the same commit (no double-fire). One event:
//   carbon.mrv_verified → queue a normal mrv_followup item for the submitter
//
// Transforms applied to the lifted body: NONE — already calls
// enqueueAction(ctx.env.DB, …) and daysFromNow(...) directly; ctx.actor_id
// preserved exactly.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { enqueueAction, daysFromNow } from './_enqueue';

export function registerCarbonEventRules(): void {
  // ── carbon.mrv_verified ──────────────────────────────────────────────────
  registerCascadeRule({
    id: 'carbon_events.mrv_verified',
    match: (ctx: CascadeContext) => ctx.event === 'carbon.mrv_verified',
    run: async (ctx: CascadeContext) => {
      const pid = ctx.data?.submitted_by as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'mrv_followup',
          priority: 'normal',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'mrv_verifications',
          entity_id: ctx.entity_id,
          title: `MRV verified: ${ctx.data?.opinion || 'positive'}`,
          description: `Verified ${ctx.data?.verified_reductions_tco2e ?? '—'} tCO₂e. Request issuance with your chosen registry.`,
          due_date: daysFromNow(30),
        });
      }
    },
  });
}
