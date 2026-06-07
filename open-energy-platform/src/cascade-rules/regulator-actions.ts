// ═══════════════════════════════════════════════════════════════════════════
// Layer A — regulator-actions cascade rules.
// Migrated verbatim from handleSpecialCascades (the legacy switch) so each
// reaction writes byte-identical rows; the matching switch cases were deleted
// in the same commit (no double-fire). Three events (one shared body):
//   regulator.licence_suspended,
//   regulator.licence_revoked      → queue an urgent regulatory_action item
//                                    for the licensee (title varies by event)
//   regulator.enforcement_finding  → queue an urgent enforcement_finding item
//                                    for the respondent
//   regulator.surveillance_escalated → queue a high-priority surveillance
//                                    escalation item for the subject
//
// Transforms applied to the lifted bodies: NONE — these already call
// enqueueAction(ctx.env.DB, …) and daysFromNow(...) directly (no generateId),
// so they are lifted byte-for-byte; ctx.actor_id preserved exactly as the
// legacy code used it.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { enqueueAction, daysFromNow } from './_enqueue';

export function registerRegulatorActionRules(): void {
  // ── regulator.licence_suspended / regulator.licence_revoked ──────────────
  registerCascadeRule({
    id: 'regulator_actions.licence_action',
    match: (ctx: CascadeContext) => ctx.event === 'regulator.licence_suspended' || ctx.event === 'regulator.licence_revoked',
    run: async (ctx: CascadeContext) => {
      const pid = ctx.data?.licensee_participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'regulatory_action',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: ctx.entity_type,
          entity_id: ctx.entity_id,
          title: ctx.event === 'regulator.licence_revoked' ? 'Licence revoked — cease operations' : 'Licence suspended — halt activities under this licence',
          description: `Details: ${ctx.data?.details || 'Consult the Regulator workbench for the event record.'}`,
          due_date: new Date().toISOString().slice(0, 10),
        });
      }
    },
  });

  // ── regulator.enforcement_finding ────────────────────────────────────────
  registerCascadeRule({
    id: 'regulator_actions.enforcement_finding',
    match: (ctx: CascadeContext) => ctx.event === 'regulator.enforcement_finding',
    run: async (ctx: CascadeContext) => {
      const pid = ctx.data?.respondent_participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'enforcement_finding',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'regulator_enforcement_cases',
          entity_id: ctx.entity_id,
          title: `Enforcement finding: ${ctx.data?.case_number || ctx.entity_id}`,
          description: `Penalty: R${(ctx.data?.penalty_amount_zar as number) || 0}. Consider appeal within statutory window.`,
          due_date: daysFromNow(30),
        });
      }
    },
  });

  // ── regulator.surveillance_escalated ─────────────────────────────────────
  registerCascadeRule({
    id: 'regulator_actions.surveillance_escalated',
    match: (ctx: CascadeContext) => ctx.event === 'regulator.surveillance_escalated',
    run: async (ctx: CascadeContext) => {
      const pid = ctx.data?.participant_id as string | null;
      if (pid) {
        await enqueueAction(ctx.env.DB, {
          type: 'surveillance_escalation',
          priority: 'high',
          actor_id: ctx.actor_id,
          assignee_id: pid,
          entity_type: 'regulator_enforcement_cases',
          entity_id: (ctx.data?.case_id as string) || ctx.entity_id,
          title: `Case opened: ${ctx.data?.case_number || ctx.entity_id}`,
          description: `Surveillance rule ${ctx.data?.rule_code || ''} escalated to enforcement. Respond to the investigating officer.`,
          due_date: daysFromNow(14),
        });
      }
    },
  });
}
