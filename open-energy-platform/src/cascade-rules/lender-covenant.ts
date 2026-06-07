// ═══════════════════════════════════════════════════════════════════════════
// Layer A — lender-covenant cascade rules.
// Migrated from handleSpecialCascades (the legacy switch) AND the
// materializeLenderWatchlist function so each reaction writes byte-identical
// rows; the matching switch case + function were deleted in the same commit
// (no double-fire). Two rules:
//   lender.covenant_breach        → (Rule A) queue covenant_breach action
//                                    items for the lender + project developer
//   lender.covenant_breach /      → (Rule B) auto-add facility/borrower to
//     lender.covenant_warn             oe_lender_watchlist (if not already
//                                    present) + issue a cycle-1 dunning
//                                    notice with a cure deadline
//
// Transforms applied:
//   Rule A lifted verbatim (already uses enqueueActions(ctx.env.DB, …),
//   cachedProjectDeveloper, daysFromNow); trailing `break;` dropped (not
//   needed inside a rule's run function).
//   Rule B lifted verbatim with generateId() → genId() and the leading
//   event guard hoisted into `match`; ctx.actor_id || 'system' fallbacks
//   preserved byte-for-byte.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { cachedProjectDeveloper } from '../utils/cascade';
import { initialDunningCycle } from '../utils/lender-escalation-spec';
import { registerCascadeRule } from '../utils/cascade-registry';
import { enqueueActions, daysFromNow, genId } from './_enqueue';
import type { EnqueueActionInput } from './_enqueue';

export function registerLenderCovenantRules(): void {
  // ── lender.covenant_breach — queue action items ──────────────────────────
  registerCascadeRule({
    id: 'lender_covenant.breach_actions',
    match: (ctx: CascadeContext) => ctx.event === 'lender.covenant_breach',
    run: async (ctx: CascadeContext) => {
      // Notify both the lender and the project developer. Both assignees
      // get the same action structure so we build the list up-front and
      // batch the INSERTs into a single env.DB.batch() call.
      const lenderId = ctx.data?.lender_participant_id as string | null;
      const projectId = ctx.data?.project_id as string | null;
      const code = ctx.data?.covenant_code as string || '';
      const title = `Covenant breach: ${code}`;
      const desc = `Measured ${ctx.data?.measured_value ?? '—'} vs threshold ${ctx.data?.threshold ?? '—'} for ${ctx.data?.test_period || 'current period'}.`;
      const assignments: EnqueueActionInput[] = [];
      if (lenderId) {
        assignments.push({
          type: 'covenant_breach',
          priority: ctx.data?.material_adverse_effect ? 'urgent' : 'high',
          actor_id: ctx.actor_id,
          assignee_id: lenderId,
          entity_type: 'covenant_tests',
          entity_id: ctx.entity_id,
          title,
          description: desc,
          due_date: daysFromNow(7),
        });
      }
      if (projectId) {
        const dev = await cachedProjectDeveloper(ctx.env, projectId);
        if (dev) {
          assignments.push({
            type: 'covenant_breach',
            priority: 'high',
            actor_id: ctx.actor_id,
            assignee_id: dev,
            entity_type: 'covenant_tests',
            entity_id: ctx.entity_id,
            title: `Action: ${title}`,
            description: `${desc} — consider requesting a waiver or remedial plan.`,
            due_date: daysFromNow(7),
          });
        }
      }
      if (assignments.length > 0) await enqueueActions(ctx.env.DB, assignments);
    },
  });

  // ── lender.covenant_breach / lender.covenant_warn — watchlist materializer ──
  registerCascadeRule({
    id: 'lender_covenant.watchlist_materializer',
    match: (ctx: CascadeContext) => ctx.event === 'lender.covenant_breach' || ctx.event === 'lender.covenant_warn',
    run: async (ctx: CascadeContext) => {
      const data = ctx.data || {};
      const facilityId = (data as any).facility_id as string | undefined;
      const borrowerId =
        (data as any).borrower_id as string | undefined ||
        (data as any).borrower_participant_id as string | undefined ||
        (data as any).participant_id as string | undefined;
      if (!facilityId || !borrowerId) return;

      // Avoid duplicate dunning if an open watchlist row already exists for
      // this facility + borrower.
      const existing = await ctx.env.DB
        .prepare(`SELECT id FROM oe_lender_watchlist WHERE facility_id = ? AND participant_id = ? AND cleared_at IS NULL LIMIT 1`)
        .bind(facilityId, borrowerId)
        .first() as { id: string } | null;

      const now = new Date();
      const init = initialDunningCycle(now);
      const triggerSignal = ctx.event === 'lender.covenant_breach' ? 'covenant_breach' : 'covenant_warn';
      const triggerValue = Number((data as any).measured_value ?? (data as any).threshold ?? 0) || null;

      let watchlistId: string;
      if (existing?.id) {
        watchlistId = existing.id;
      } else {
        watchlistId = genId();
        await ctx.env.DB.prepare(`
          INSERT INTO oe_lender_watchlist
            (id, facility_id, participant_id, watchlist_tier, trigger_signal, trigger_value,
             action_plan, added_at, next_review_at, added_by,
             cure_deadline_at, dunning_cycle, auto_escalated_at, borrower_acked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        `).bind(
          watchlistId,
          facilityId,
          borrowerId,
          init.tier,
          triggerSignal,
          triggerValue,
          `Auto-added from ${ctx.event} cascade.`,
          now.toISOString(),
          init.cure_deadline_at,
          ctx.actor_id || 'system',
          init.cure_deadline_at,
          init.cycle,
        ).run();
        await ctx.env.DB.prepare(`
          INSERT INTO oe_lender_watchlist_events
            (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
          VALUES (?, ?, 'added', NULL, ?, ?, ?, ?)
        `).bind(genId(), watchlistId, init.tier, ctx.actor_id || 'system',
                `Initial entry from ${ctx.event}`, now.toISOString()).run();
      }

      // Issue the cycle-1 dunning notice.
      const noticeId = genId();
      const body = {
        covenant: (data as any).covenant_code || null,
        threshold: (data as any).threshold ?? null,
        measured: (data as any).measured_value ?? null,
        period: (data as any).test_period || null,
        source_event: ctx.event,
      };
      await ctx.env.DB.prepare(`
        INSERT INTO oe_lender_dunning_notices
          (id, watchlist_id, facility_id, borrower_id, cycle, trigger_signal,
           title, body_json, status, issued_at, issued_by, cure_deadline_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?)
      `).bind(
        noticeId,
        watchlistId,
        facilityId,
        borrowerId,
        init.cycle,
        triggerSignal,
        `Covenant ${triggerSignal.replace('_', ' ')} — cycle 1 notice`,
        JSON.stringify(body),
        now.toISOString(),
        ctx.actor_id || 'system',
        init.cure_deadline_at,
      ).run();

      await ctx.env.DB.prepare(`
        INSERT INTO oe_lender_watchlist_events
          (id, watchlist_id, event_type, from_tier, to_tier, actor_id, notes, occurred_at)
        VALUES (?, ?, 'dunning_issued', ?, ?, ?, ?, ?)
      `).bind(genId(), watchlistId, init.tier, init.tier, ctx.actor_id || 'system',
              `Cycle ${init.cycle} notice ${noticeId} issued`, now.toISOString()).run();
    },
  });
}
