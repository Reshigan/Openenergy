// ═══════════════════════════════════════════════════════════════════════════
// Layer A — esg-events cascade rules.
// Migrated verbatim from handleSpecialCascades (the legacy switch) so each
// reaction writes byte-identical rows; the matching switch case was deleted
// in the same commit (no double-fire). One event:
//   esg.decarbonisation_completed → recompute the participant's latest ESG
//                                   report total from esg_data, and raise an
//                                   intelligence item if emissions moved
//                                   significantly since the previous reading
//
// Transforms applied to the lifted body:
//   generateId()  → genId()  (legacy 'id_'+base36 format, from ./_enqueue)
//   ctx.actor_id preserved exactly as the legacy code used it.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { genId } from './_enqueue';

export function registerEsgEventRules(): void {
  // ── esg.decarbonisation_completed ────────────────────────────────────────
  registerCascadeRule({
    id: 'esg_events.decarbonisation_completed',
    match: (ctx: CascadeContext) => ctx.event === 'esg.decarbonisation_completed',
    run: async (ctx: CascadeContext) => {
      // Recalculate ESG score
      const participantId = ctx.data?.participant_id;
      if (participantId) {
        // Calculate new score based on updated emissions
        const emissions = await ctx.env.DB.prepare(`
          SELECT SUM(value) as total FROM esg_data 
          WHERE participant_id = ? AND metric_id IN ('esg_met_001','esg_met_002','esg_met_003')
        `).bind(participantId).first();

        const totalEmissions = Number(emissions?.total ?? 0);
        const prevEmissions = Number(ctx.data?.previous_emissions ?? 0);

        // Update or create score record
        const existing = await ctx.env.DB.prepare('SELECT id FROM esg_reports WHERE participant_id = ? ORDER BY created_at DESC LIMIT 1').bind(participantId).first();
        if (existing) {
          await ctx.env.DB.prepare(`
            UPDATE esg_reports SET total_ghg_emissions_tco2e = ?, updated_at = ? WHERE id = ?
          `).bind(totalEmissions, new Date().toISOString(), existing.id).run();
        }

        // Intelligence item if significant change
        if (prevEmissions && Math.abs(totalEmissions - prevEmissions) > 500) {
          const reduction = prevEmissions - totalEmissions;
          await ctx.env.DB.prepare(`
            INSERT INTO intelligence_items (id, participant_id, type, severity, title, description, created_at)
            VALUES (?, ?, 'esg', 'info', ?, ?, ?)
          `).bind(
            genId(), participantId,
            `Scope ${ctx.data?.scope || 'unknown'} Emissions Reduced`,
            `Emissions reduced by ${reduction.toLocaleString()} tCO₂e`,
            new Date().toISOString()
          ).run();
        }
      }
    },
  });
}
