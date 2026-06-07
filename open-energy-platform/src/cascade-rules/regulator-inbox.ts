// ═══════════════════════════════════════════════════════════════════════════
// Layer A — regulator-inbox materializer cascade rule.
// Migrated verbatim from materializeRegulatorInbox in handleSpecialCascades;
// the special-stage call was deleted in the same commit (no double-write).
//
// Unlike sibling rules, this rule is event-AGNOSTIC: its match() calls
// regulatorInboxSpec(...) and returns true only for events on the spec's
// curated allowlist (so the registry does not write an audit row on every
// unrelated cascade event).
//
// Transform applied: generateId() → genId(). Body otherwise byte-for-byte
// identical to the legacy function including multi-line SQL, .bind() arg
// order, JSON.stringify(ctx.data || {}), and 'pending' literal in VALUES.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { regulatorInboxSpec, computeSlaDueAt } from '../utils/regulator-inbox-spec';
import { genId } from './_enqueue';

export function registerRegulatorInboxRules(): void {
  // ── regulator_inbox.materialize ──────────────────────────────────────────
  registerCascadeRule({
    id: 'regulator_inbox.materialize',
    match: (ctx: CascadeContext) => regulatorInboxSpec(ctx.event, ctx.entity_id, ctx.data) != null,
    run: async (ctx: CascadeContext) => {
      const spec = regulatorInboxSpec(ctx.event, ctx.entity_id, ctx.data);
      if (!spec) return;

      const now = new Date();
      const dueAt = computeSlaDueAt(spec.severity, now);

      await ctx.env.DB.prepare(`
        INSERT INTO oe_regulator_inbox
          (id, source_event, source_entity_type, source_entity_id, severity,
           title, body_json, ack_status, sla_due_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `).bind(
        genId(),
        ctx.event,
        ctx.entity_type,
        ctx.entity_id,
        spec.severity,
        spec.title,
        JSON.stringify(ctx.data || {}),
        dueAt,
        now.toISOString(),
        now.toISOString(),
      ).run();
    },
  });
}
