// ═══════════════════════════════════════════════════════════════════════════
// Layer A — IPP-lifecycle cascade rules.
// Migrated verbatim from handleSpecialCascades (the legacy switch) so each
// reaction writes byte-identical rows; the matching switch cases were deleted
// in the same commit (no double-fire). Three events:
//   ipp.milestone_satisfied → nested fireCascade to ipp.financial_close (when
//                             milestone_type === 'financial_close') + a
//                             disbursement_approval action per lender
//   ipp.financial_close     → notify grid operators (if a grid connection
//                             exists) + offtaker counterparties (per contract)
//   ipp.insurance_expiring  → queue an insurance_renewal action for the
//                             project developer
//
// Transforms applied to the lifted bodies:
//   bare `db.`           → `ctx.env.DB.`
//   generateId()         → genId()  (legacy 'id_'+base36 format, from ./_enqueue)
//   enqueueAction(db, …) → enqueueAction(ctx.env.DB, …)
//   ctx.actor_id preserved exactly as the legacy code used it.
//
// The nested fireCascade inside ipp.milestone_satisfied is kept byte-identical
// (actor_id: ctx.actor_id, env: ctx.env). Because the ipp.financial_close rule
// lives in this same registry, that nested call re-enters runCascadeRegistry
// and drives the financial_close rule — intended. financial_close does NOT
// re-fire milestone_satisfied, so there is no loop.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { cachedProjectDeveloper, fireCascade } from '../utils/cascade';
import { enqueueAction, genId, daysFromNow } from './_enqueue';

export function registerIppLifecycleRules(): void {
  // ── ipp.milestone_satisfied ──────────────────────────────────────────────
  registerCascadeRule({
    id: 'ipp_lifecycle.milestone_satisfied',
    match: (ctx: CascadeContext) => ctx.event === 'ipp.milestone_satisfied',
    run: async (ctx: CascadeContext) => {
      // If milestone is financial_close, cascade to ipp.financial_close
      if (ctx.data?.milestone_type === 'financial_close') {
        await fireCascade({
          event: 'ipp.financial_close',
          actor_id: ctx.actor_id,
          entity_type: 'ipp_projects',
          entity_id: (ctx.data?.project_id as string) || ctx.entity_id,
          data: { project_name: ctx.data?.project_name },
          env: ctx.env,
        });
      }
      // Auto-queue disbursement approval for lenders
      const lenders = await ctx.env.DB.prepare(`SELECT id FROM participants WHERE role = 'lender'`).all();
      for (const l of lenders.results || []) {
        await enqueueAction(ctx.env.DB, {
          type: 'disbursement_approval',
          priority: 'high',
          actor_id: ctx.actor_id,
          assignee_id: (l as { id: string }).id,
          entity_type: 'project_milestones',
          entity_id: ctx.entity_id,
          title: `Approve disbursement for ${ctx.data?.milestone_name || 'milestone'}`,
          description: `Milestone "${ctx.data?.milestone_name || ctx.entity_id}" satisfied; review CPs and release disbursement.`,
          due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        });
      }
    },
  });

  // ── ipp.financial_close ──────────────────────────────────────────────────
  registerCascadeRule({
    id: 'ipp_lifecycle.financial_close',
    match: (ctx: CascadeContext) => ctx.event === 'ipp.financial_close',
    run: async (ctx: CascadeContext) => {
      // Notify all linked parties about FC
      const proj = await ctx.env.DB.prepare('SELECT * FROM ipp_projects WHERE id = ?').bind(ctx.entity_id).first();
      if (proj) {
        // Notify grid operator if connection exists
        const connection = await ctx.env.DB.prepare('SELECT id FROM grid_connections WHERE project_id = ?').bind(ctx.entity_id).first();
        if (connection) {
          const gridOps = await ctx.env.DB.prepare("SELECT id FROM participants WHERE role = 'grid_operator'").all();
          for (const op of gridOps.results || []) {
            await ctx.env.DB.prepare(`
              INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
              VALUES (?, ?, 'grid', ?, ?, ?, ?)
            `).bind(
              genId(), op.id, 'FC Declared — Prepare Grid Connection',
              `Project ${proj.project_name} has achieved Financial Close. Prepare for grid connection.`,
              JSON.stringify({ project_id: ctx.entity_id, cod: proj.commercial_operation_date }),
              new Date().toISOString()
            ).run();
          }
        }

        // Notify offtakers with contracts
        const contracts = await ctx.env.DB.prepare('SELECT counterparty_id FROM contract_documents WHERE project_id = ?').bind(ctx.entity_id).all();
        for (const c of contracts.results || []) {
          await ctx.env.DB.prepare(`
            INSERT INTO notifications (id, participant_id, type, title, body, data, created_at)
            VALUES (?, ?, 'contract', ?, ?, ?, ?)
          `).bind(
            genId(), c.counterparty_id, 'FC Declared — COD Expected',
            `Project ${proj.project_name} has achieved Financial Close. Expected COD: ${proj.commercial_operation_date}`,
            JSON.stringify({ project_id: ctx.entity_id, cod: proj.commercial_operation_date }),
            new Date().toISOString()
          ).run();
        }
      }
    },
  });

  // ── ipp.insurance_expiring ─────────────────────────────────────────────────
  registerCascadeRule({
    id: 'ipp_lifecycle.insurance_expiring',
    match: (ctx: CascadeContext) => ctx.event === 'ipp.insurance_expiring',
    run: async (ctx: CascadeContext) => {
      const projectId = ctx.data?.project_id as string | null;
      if (projectId) {
        const dev = await cachedProjectDeveloper(ctx.env, projectId);
        if (dev) {
          await enqueueAction(ctx.env.DB, {
            type: 'insurance_renewal',
            priority: 'high',
            actor_id: ctx.actor_id,
            assignee_id: dev,
            entity_type: 'insurance_policies',
            entity_id: ctx.entity_id,
            title: `Insurance renewal due: ${ctx.data?.policy_number || ctx.entity_id}`,
            description: `Policy expires ${ctx.data?.period_end || 'soon'}. Lender covenant requires continuous cover.`,
            due_date: typeof ctx.data?.period_end === 'string'
              ? (ctx.data.period_end as string).slice(0, 10)
              : daysFromNow(30),
          });
        }
      }
    },
  });
}
