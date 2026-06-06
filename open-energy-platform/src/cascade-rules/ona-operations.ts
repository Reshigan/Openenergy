// ═══════════════════════════════════════════════════════════════════════════
// Layer A — ona-operations cascade rules.
// Migrated verbatim from handleSpecialCascades (the legacy switch) so each
// reaction writes byte-identical rows; the matching switch cases were deleted
// in the same commit (no double-fire). One event:
//   ona.fault_detected  → update estimated_revenue_impact on the fault,
//                         create an intelligence item, queue IPP fault review
//
// Transforms applied to the lifted body:
//   generateId()  → genId()  (legacy 'id_'+base36 format, from ./_enqueue)
//   ctx.actor_id preserved exactly as the legacy code used it.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { genId } from './_enqueue';

export function registerOnaOperationsRules(): void {
  // ── ona.fault_detected ───────────────────────────────────────────────────
  registerCascadeRule({
    id: 'ona_operations.fault_detected',
    match: (ctx: CascadeContext) => ctx.event === 'ona.fault_detected',
    run: async (ctx: CascadeContext) => {
      // Calculate and store revenue impact
      const severityMultiplier = { low: 0.5, medium: 1, high: 2, critical: 5 };
      const multiplier = severityMultiplier[ctx.data?.severity as keyof typeof severityMultiplier] || 1;
      const ppaValue = Number(ctx.data?.ppa_value_per_day ?? 50000);
      const dailyImpact = ppaValue * multiplier;

      // Update fault with estimated impact
      await ctx.env.DB.prepare(`
        UPDATE ona_faults SET estimated_revenue_impact = ?, updated_at = ?
        WHERE id = ?
      `).bind(dailyImpact, new Date().toISOString(), ctx.entity_id).run();

      // Create intelligence item
      await ctx.env.DB.prepare(`
        INSERT INTO intelligence_items (id, type, severity, title, description, entity_type, entity_id, action_required, created_at)
        VALUES (?, 'operational', 'critical', ?, ?, 'ona_faults', ?, ?, ?)
      `).bind(
        genId(),
        `Fault: ${ctx.data?.fault_description || 'Unknown'}`,
        `Revenue at risk: R${dailyImpact.toLocaleString()}/day. Site: ${ctx.data?.site_name || ctx.entity_id}`,
        ctx.entity_id,
        'Review fault and submit insurance claim if applicable',
        new Date().toISOString()
      ).run();

      // Create action queue for IPP
      const site = await ctx.env.DB.prepare('SELECT project_id FROM ona_sites WHERE id = ?').bind(ctx.data?.site_id).first();
      if (site) {
        const proj = await ctx.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(site.project_id).first();
        if (proj) {
          await ctx.env.DB.prepare(`
            INSERT INTO action_queue (id, type, priority, actor_id, assignee_id, entity_type, entity_id, title, description, status, due_date, created_at)
            VALUES (?, 'fault_review', 'urgent', ?, ?, 'ona_faults', ?, ?, ?, 'pending', ?, ?)
          `).bind(
            genId(), ctx.actor_id, proj.developer_id, ctx.entity_id,
            `View Fault: ${ctx.data?.fault_description || 'Unknown'}`,
            `Revenue impact: R${dailyImpact.toLocaleString()}/day. Request disbursement adjustment if necessary.`,
            new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
            new Date().toISOString()
          ).run();
        }
      }
    },
  });
}
