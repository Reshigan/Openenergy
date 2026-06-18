// Layer A - KYC gate cascade rules (admin-inbox fan-out lifecycle).
//
// IMPORTANT - who owns the guard-critical state: participant_market_access is
// written AUTHORITATIVELY and SYNCHRONOUSLY by the admin PUT /kyc/:id handler
// (src/routes/admin.ts). It MUST be, because the cascade registry runs behind a
// QUEUE binding in production - asynchronously, in the queue consumer - so a
// cascade rule cannot be the source of truth for anything a pre-trade guard
// reads on the next request. This rule file therefore does NOT touch
// participant_market_access. Its sole job is the admin-inbox fan-out lifecycle:
//   - kyc.submitted  → open ONE pending admin review action (idempotent)
//   - kyc.decided    → close the open admin action(s) for that participant
//
// Close-out note: oe_role_action_queue.status has a CHECK of
// ('pending','acknowledged','actioned','dismissed','expired') and has no
// resolved_at column (migrations 476/482/504). The canonical close-out used
// everywhere else in the codebase (src/routes/feed.ts) is status='actioned'
// with actioned_at - that is the schema-valid way to close an inbox row, so
// this rule uses it. The lifecycle is unchanged: submission opens, decision
// closes.
//
// SQL identifier safety: every table/column/status literal below is a static
// code literal; every context value binds to a ? placeholder.
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';

export function registerKycGateRules(): void {
  // Open the admin review action when a KYC pack is submitted.
  registerCascadeRule({
    id: 'kyc-gate.submitted',
    match: (ctx: CascadeContext) => ctx.event === 'kyc.submitted',
    run: async (ctx: CascadeContext) => {
      const db = ctx.env.DB;
      // Idempotency: never open a second pending admin action for the same
      // participant if one is already open.
      const existing = await db
        .prepare(
          `SELECT id FROM oe_role_action_queue
           WHERE target_role = 'admin' AND source_event = 'kyc.submitted'
             AND source_entity_id = ? AND status = 'pending'`,
        )
        .bind(ctx.entity_id)
        .first();
      if (existing) return;

      await pushRoleAction(ctx.env, {
        target_role: 'admin',
        source_event: 'kyc.submitted',
        source_entity_type: 'participant',
        source_entity_id: ctx.entity_id,
        title: 'KYC pack awaiting review',
        body: { participant_id: ctx.entity_id },
        priority: 'high',
      });
    },
  });

  // Close the open admin action(s) when a decision is recorded. The natural
  // inbox lifecycle: submission opens the action, decision closes it. Does NOT
  // write participant_market_access (the handler owns that).
  registerCascadeRule({
    id: 'kyc-gate.decided',
    // Defence in depth: only a terminal decision closes the review action. The
    // handler already gates the fire to approved/rejected, but if a future
    // caller fires kyc.decided for a non-terminal status this guard keeps a
    // pending review action open rather than silently clearing it.
    match: (ctx: CascadeContext) =>
      ctx.event === 'kyc.decided' &&
      (ctx.data?.kyc_status === 'approved' || ctx.data?.kyc_status === 'rejected'),
    run: async (ctx: CascadeContext) => {
      const db = ctx.env.DB;
      const actor = ctx.actor_id ?? 'system';
      await db
        .prepare(
          `UPDATE oe_role_action_queue
           SET status = 'actioned', actioned_by = ?, actioned_at = datetime('now'),
               updated_at = datetime('now')
           WHERE target_role = 'admin' AND source_event = 'kyc.submitted'
             AND source_entity_id = ? AND status = 'pending'`,
        )
        .bind(actor, ctx.entity_id)
        .run();
    },
  });
}
