// ═══════════════════════════════════════════════════════════════════════════
// Layer A — trade/settlement cascade rules (mode:'drive').
// Migrated verbatim from handleSpecialCascades (the legacy switch) so each
// reaction writes byte-identical rows; the matching switch cases were deleted
// in the same commit (no double-fire). Four events:
//   trade.matched   → auto-create escrow + initial invoice + both-side actions
//   invoice.issued  → queue a payment action for the payee
//   invoice.paid    → release held escrow, settle the match, complete actions
//   dispute.filed   → mark escrow disputed + queue an admin dispute review
//
// Transforms applied to the lifted bodies:
//   bare `db.`     → `ctx.env.DB.`
//   generateId()   → genId()  (legacy 'id_'+base36 format, from ./_enqueue)
//   enqueueAction(db, …) → enqueueAction(ctx.env.DB, …)
//   ctx.actor_id preserved exactly as the legacy code used it.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { enqueueAction, genId } from './_enqueue';

export function registerTradeSettlementRules(): void {
  // ── trade.matched ──────────────────────────────────────────────────────────
  registerCascadeRule({
    id: 'trade_settlement.trade_matched',
    match: (ctx: CascadeContext) => ctx.event === 'trade.matched',
    run: async (ctx: CascadeContext) => {
      // Auto-create escrow + initial invoice + action queues for both sides
      if (ctx.data?.match_id) {
        await ctx.env.DB.prepare(`
          INSERT INTO escrow_accounts (id, match_id, amount, currency, status, created_at)
          VALUES (?, ?, ?, 'ZAR', 'held', ?)
        `).bind(genId(), ctx.data.match_id, ctx.data.total_value || 0, new Date().toISOString()).run();
      }
      if (ctx.data?.match_id && ctx.data?.buyer_id && ctx.data?.seller_id) {
        const invoiceId = genId();
        const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;
        const total = Number(ctx.data.total_value || 0);
        const subtotal = total / 1.15;
        const vat = total - subtotal;
        const deliveryDate = (ctx.data.delivery_date as string) || new Date().toISOString().split('T')[0];
        await ctx.env.DB.prepare(`
          INSERT INTO invoices (id, invoice_number, match_id, from_participant_id, to_participant_id,
            invoice_type, period_start, period_end, line_items, subtotal, vat_rate, vat_amount,
            total_amount, due_date, status, tenant_id, issued_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'energy', ?, ?, ?, ?, 0.15, ?, ?, ?, 'issued', 'default', ?, ?, ?)
        `).bind(
          invoiceId, invoiceNum, ctx.data.match_id, ctx.data.seller_id, ctx.data.buyer_id,
          deliveryDate, deliveryDate,
          JSON.stringify([{ description: 'Energy supply', volume_mwh: ctx.data.volume_mwh, price_per_mwh: ctx.data.price_per_mwh }]),
          subtotal, vat, total,
          new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
        ).run();

        await enqueueAction(ctx.env.DB, {
          type: 'invoice_payment',
          priority: 'high',
          actor_id: ctx.data.seller_id as string,
          assignee_id: ctx.data.buyer_id as string,
          entity_type: 'invoices',
          entity_id: invoiceId,
          title: `Pay invoice ${invoiceNum}`,
          description: `R${total.toFixed(2)} due for ${ctx.data.volume_mwh || 0} MWh matched trade. Escrow is held.`,
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        });
        await enqueueAction(ctx.env.DB, {
          type: 'trade_delivery',
          priority: 'normal',
          actor_id: ctx.data.buyer_id as string,
          assignee_id: ctx.data.seller_id as string,
          entity_type: 'trade_matches',
          entity_id: ctx.data.match_id as string,
          title: `Deliver ${ctx.data.volume_mwh || 0} MWh`,
          description: `Confirm delivery of matched trade on ${deliveryDate}. Escrow releases on confirmation.`,
          due_date: deliveryDate,
        });
      }
    },
  });

  // ── invoice.issued ─────────────────────────────────────────────────────────
  registerCascadeRule({
    id: 'trade_settlement.invoice_issued',
    match: (ctx: CascadeContext) => ctx.event === 'invoice.issued',
    run: async (ctx: CascadeContext) => {
      const inv = await ctx.env.DB.prepare(
        'SELECT id, invoice_number, from_participant_id, to_participant_id, total_amount, due_date FROM invoices WHERE id = ?'
      ).bind(ctx.entity_id).first();
      if (inv?.to_participant_id) {
        await enqueueAction(ctx.env.DB, {
          type: 'invoice_payment',
          priority: 'high',
          actor_id: inv.from_participant_id as string,
          assignee_id: inv.to_participant_id as string,
          entity_type: 'invoices',
          entity_id: inv.id as string,
          title: `Pay invoice ${inv.invoice_number}`,
          description: `R${Number(inv.total_amount || 0).toFixed(2)} due by ${inv.due_date || 'N/A'}.`,
          due_date: (inv.due_date as string) || null,
        });
      }
    },
  });

  // ── invoice.paid ───────────────────────────────────────────────────────────
  registerCascadeRule({
    id: 'trade_settlement.invoice_paid',
    match: (ctx: CascadeContext) => ctx.event === 'invoice.paid',
    run: async (ctx: CascadeContext) => {
      const inv = await ctx.env.DB.prepare(
        'SELECT id, match_id, from_participant_id, to_participant_id FROM invoices WHERE id = ?'
      ).bind(ctx.entity_id).first();
      if (inv?.match_id) {
        // release escrow on match
        await ctx.env.DB.prepare(
          `UPDATE escrow_accounts SET status = 'released', released_at = ?, updated_at = ? WHERE match_id = ? AND status = 'held'`
        ).bind(new Date().toISOString(), new Date().toISOString(), inv.match_id).run();
        await ctx.env.DB.prepare(
          `UPDATE trade_matches SET status = 'settled' WHERE id = ?`
        ).bind(inv.match_id).run();
      }
      // mark action queue items for this invoice complete
      await ctx.env.DB.prepare(
        `UPDATE action_queue SET status = 'completed', completed_at = ? WHERE entity_type = 'invoices' AND entity_id = ? AND status = 'pending'`
      ).bind(new Date().toISOString(), ctx.entity_id).run();
    },
  });

  // ── dispute.filed ──────────────────────────────────────────────────────────
  registerCascadeRule({
    id: 'trade_settlement.dispute_filed',
    match: (ctx: CascadeContext) => ctx.event === 'dispute.filed',
    run: async (ctx: CascadeContext) => {
      if (ctx.data?.match_id) {
        await ctx.env.DB.prepare(`
          UPDATE escrow_accounts SET status = 'disputed', updated_at = ?
          WHERE match_id = ? AND status = 'held'
        `).bind(new Date().toISOString(), ctx.data.match_id).run();
      }
      const admins = await ctx.env.DB.prepare(`SELECT id FROM participants WHERE role = 'admin'`).all();
      for (const a of admins.results || []) {
        await enqueueAction(ctx.env.DB, {
          type: 'dispute_review',
          priority: 'urgent',
          actor_id: ctx.actor_id,
          assignee_id: (a as { id: string }).id,
          entity_type: 'invoices',
          entity_id: ctx.entity_id,
          title: 'Review dispute',
          description: `Dispute filed: ${(ctx.data?.reason as string) || 'No reason provided'}`,
          due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        });
      }
    },
  });
}
