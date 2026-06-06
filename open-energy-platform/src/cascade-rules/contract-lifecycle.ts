// ═══════════════════════════════════════════════════════════════════════════
// Layer A — contract-lifecycle cascade rules.
// Migrated verbatim from handleSpecialCascades (the legacy switch) so each
// reaction writes byte-identical rows; the matching switch cases were deleted
// in the same commit (no double-fire). Two events:
//   contract.signed         → activate the contract, open a month-1 invoice
//                             (when commercial terms carry a positive amount),
//                             queue a contract-activation action for the creator
//   contract.phase_changed  → on entering the `execution` phase, queue a
//                             contract_sign action for every unsigned signatory
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

export function registerContractLifecycleRules(): void {
  // ── contract.signed ──────────────────────────────────────────────────────
  registerCascadeRule({
    id: 'contract_lifecycle.contract_signed',
    match: (ctx: CascadeContext) => ctx.event === 'contract.signed',
    run: async (ctx: CascadeContext) => {
      // When a contract is signed by all parties, open a follow-up invoice + notify counterparty
      const contract = await ctx.env.DB.prepare(
        'SELECT id, title, creator_id, counterparty_id, project_id, commercial_terms FROM contract_documents WHERE id = ?'
      ).bind(ctx.entity_id).first();
      if (contract) {
        await ctx.env.DB.prepare(`UPDATE contract_documents SET phase = 'active', updated_at = ? WHERE id = ?`)
          .bind(new Date().toISOString(), ctx.entity_id).run();

        let terms: Record<string, unknown> = {};
        try { terms = JSON.parse((contract.commercial_terms as string) || '{}'); } catch { /* noop */ }
        const monthly = Number(terms.monthly_amount || terms.contract_value || 0);
        if (monthly > 0 && contract.creator_id && contract.counterparty_id) {
          const invoiceId = genId();
          const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;
          const subtotal = monthly / 1.15;
          const vat = monthly - subtotal;
          const period = new Date().toISOString().split('T')[0];
          await ctx.env.DB.prepare(`
            INSERT INTO invoices (id, invoice_number, project_id, from_participant_id, to_participant_id,
              invoice_type, period_start, period_end, line_items, subtotal, vat_rate, vat_amount,
              total_amount, due_date, status, tenant_id, issued_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'energy', ?, ?, ?, ?, 0.15, ?, ?, ?, 'issued', 'default', ?, ?, ?)
          `).bind(
            invoiceId, invoiceNum, contract.project_id || null, contract.creator_id, contract.counterparty_id,
            period, period, JSON.stringify([{ description: `${contract.title} — month 1`, amount: monthly }]),
            subtotal, vat, monthly,
            new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
          ).run();

          await enqueueAction(ctx.env.DB, {
            type: 'invoice_payment',
            priority: 'high',
            actor_id: contract.creator_id as string,
            assignee_id: contract.counterparty_id as string,
            entity_type: 'invoices',
            entity_id: invoiceId,
            title: `Pay invoice ${invoiceNum} — ${contract.title}`,
            description: `R${monthly.toFixed(2)} first instalment due for signed contract ${contract.title}.`,
            due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          });
        }

        await enqueueAction(ctx.env.DB, {
          type: 'contract_activate',
          priority: 'normal',
          actor_id: ctx.actor_id,
          assignee_id: (contract.creator_id as string),
          entity_type: 'contract_documents',
          entity_id: ctx.entity_id,
          title: `Contract ${contract.title} is fully signed`,
          description: 'All signatories signed. Upload a signed PDF to the vault and kick off delivery scheduling.',
        });
      }
    },
  });

  // ── contract.phase_changed ─────────────────────────────────────────────────
  registerCascadeRule({
    id: 'contract_lifecycle.contract_phase_changed',
    match: (ctx: CascadeContext) => ctx.event === 'contract.phase_changed',
    run: async (ctx: CascadeContext) => {
      // `execution` is the phase at which contract signatories are notified
      // — matches the CHECK constraint on contract_documents.phase in 001_core.
      if (ctx.data?.new_phase === 'execution') {
        const signatories = await ctx.env.DB.prepare(
          `SELECT participant_id FROM document_signatories WHERE document_id = ? AND signed = 0`
        ).bind(ctx.entity_id).all();
        for (const s of signatories.results || []) {
          await enqueueAction(ctx.env.DB, {
            type: 'contract_sign',
            priority: 'high',
            actor_id: ctx.actor_id,
            assignee_id: (s as { participant_id: string }).participant_id,
            entity_type: 'contract_documents',
            entity_id: ctx.entity_id,
            title: 'Contract awaiting your signature',
            description: `Contract ${ctx.entity_id} has been sent for signing.`,
            due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          });
        }
      }
    },
  });
}
