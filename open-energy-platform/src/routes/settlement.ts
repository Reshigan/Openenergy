// Settlement Routes — payments, disputes, reconciliation
// Invoice lifecycle (draft → issued → paid / disputed) lives on /api/invoices.
// This module covers the downstream: recording bank payments against invoices,
// resolving disputes, and producing reconciliation summaries.
import { Hono, type Context } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { computeFees, type InvoiceShape } from '../utils/settlement-fees';
import { explainSettlementRunFailure } from '../utils/run-failure-explainer';
import { adjustModifiedFollowing, buildD1Deps } from '../utils/business-day';
import { appendAudit, getChainHead, verifyChain } from '../utils/audit-chain';

const settlement = new Hono<HonoEnv>();
settlement.use('*', authMiddleware);

// Invoice child rows (breaks, confirmations, fees) are private to the two
// counterparties (+ admin). The POST handlers enforced this; the read
// handlers did not — a cross-tenant leak. Returns a 403/404 Response to bail
// with, or null when the caller is a party and the read may proceed.
async function assertInvoiceParty(
  c: Context<HonoEnv>,
  invoiceId: string,
): Promise<Response | null> {
  const user = getCurrentUser(c);
  const inv = await c.env.DB.prepare(
    `SELECT from_participant_id, to_participant_id FROM invoices WHERE id = ?`,
  )
    .bind(invoiceId)
    .first<{ from_participant_id: string; to_participant_id: string }>();
  if (!inv) return c.json({ success: false, error: 'Invoice not found' }, 404);
  const involved =
    user.id === inv.from_participant_id ||
    user.id === inv.to_participant_id ||
    user.role === 'admin';
  if (!involved) return c.json({ success: false, error: 'Forbidden' }, 403);
  return null;
}

type InvoiceRow = {
  id: string;
  invoice_number: string;
  from_participant_id: string;
  to_participant_id: string;
  status: string;
  total_amount: number;
  paid_amount: number | null;
  due_date: string;
  match_id: string | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string;
  payment_reference: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  bank_reference: string | null;
  reconciled: number;
  notes: string | null;
};

// GET /settlement/invoices — invoices visible to caller, optionally filtered.
settlement.get('/invoices', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const direction = c.req.query('direction'); // 'incoming' | 'outgoing' | undefined

  const filters: string[] = [];
  const bindings: unknown[] = [];
  if (direction === 'incoming') {
    filters.push('i.to_participant_id = ?');
    bindings.push(user.id);
  } else if (direction === 'outgoing') {
    filters.push('i.from_participant_id = ?');
    bindings.push(user.id);
  } else {
    filters.push('(i.from_participant_id = ? OR i.to_participant_id = ?)');
    bindings.push(user.id, user.id);
  }
  if (status) {
    filters.push('i.status = ?');
    bindings.push(status);
  }
  const query = `
    SELECT i.*, fp.name AS from_name, tp.name AS to_name
    FROM invoices i
    JOIN participants fp ON i.from_participant_id = fp.id
    JOIN participants tp ON i.to_participant_id = tp.id
    WHERE ${filters.join(' AND ')}
    ORDER BY i.due_date ASC, i.created_at DESC
    LIMIT 200
  `;
  const result = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ success: true, data: result.results || [] });
});

// GET /settlement/payments — payment history for invoices the caller is a party to.
settlement.get('/payments', async (c) => {
  const user = getCurrentUser(c);
  const invoiceId = c.req.query('invoice_id');
  const reconciled = c.req.query('reconciled');
  const filters = ['(i.from_participant_id = ? OR i.to_participant_id = ?)'];
  const bindings: unknown[] = [user.id, user.id];
  if (invoiceId) {
    filters.push('p.invoice_id = ?');
    bindings.push(invoiceId);
  }
  if (reconciled === '0' || reconciled === '1') {
    filters.push('p.reconciled = ?');
    bindings.push(Number(reconciled));
  }
  const result = await c.env.DB.prepare(`
    SELECT p.*, i.invoice_number, i.to_participant_id, i.from_participant_id,
           i.total_amount AS invoice_total, fp.name AS from_name, tp.name AS to_name
    FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    JOIN participants fp ON i.from_participant_id = fp.id
    JOIN participants tp ON i.to_participant_id = tp.id
    WHERE ${filters.join(' AND ')}
    ORDER BY p.payment_date DESC
    LIMIT 200
  `).bind(...bindings).all();
  return c.json({ success: true, data: result.results || [] });
});

// POST /settlement/payments — record a bank payment against an invoice.
// Caller must be the payer (invoice.to_participant_id). Fires invoice.paid
// cascade when cumulative payments cover the total.
settlement.post('/payments', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { invoice_id, amount, payment_method, bank_reference, payment_date, notes } = body as {
    invoice_id?: string;
    amount?: number;
    payment_method?: string;
    bank_reference?: string;
    payment_date?: string;
    notes?: string;
  };

  if (!invoice_id || !amount || amount <= 0) {
    return c.json({ success: false, error: 'invoice_id and positive amount are required' }, 400);
  }
  const allowedMethods = ['eft', 'swift', 'rtgs', 'internal'];
  const method = payment_method && allowedMethods.includes(payment_method) ? payment_method : 'eft';

  const invoice = (await c.env.DB.prepare(
    'SELECT id, invoice_number, from_participant_id, to_participant_id, status, total_amount, paid_amount, match_id FROM invoices WHERE id = ?'
  ).bind(invoice_id).first()) as InvoiceRow | null;
  if (!invoice) return c.json({ success: false, error: 'Invoice not found' }, 404);
  if (invoice.to_participant_id !== user.id) {
    return c.json({ success: false, error: 'Only the payer may record a payment on this invoice' }, 403);
  }
  if (invoice.status !== 'issued' && invoice.status !== 'partial' && invoice.status !== 'overdue') {
    return c.json({ success: false, error: `Cannot record payment on invoice in status '${invoice.status}'` }, 400);
  }

  const paymentId = 'pay_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const reference = 'PMT-' + Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  const now = new Date().toISOString();
  const effectiveDate = payment_date || now;

  await c.env.DB.prepare(`
    INSERT INTO payments (id, invoice_id, payment_reference, amount, currency, payment_method, payment_date, bank_reference, reconciled, notes, created_at)
    VALUES (?, ?, ?, ?, 'ZAR', ?, ?, ?, 0, ?, ?)
  `).bind(paymentId, invoice_id, reference, amount, method, effectiveDate, bank_reference || null, notes || null, now).run();

  const priorPaid = Number(invoice.paid_amount || 0);
  const newPaid = priorPaid + Number(amount);
  const total = Number(invoice.total_amount || 0);
  let nextStatus: string = invoice.status;
  if (newPaid >= total - 0.005) nextStatus = 'paid';
  else if (newPaid > 0) nextStatus = 'partial';

  await c.env.DB.prepare(`
    UPDATE invoices SET paid_amount = ?, status = ?, paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END, updated_at = ? WHERE id = ?
  `).bind(newPaid, nextStatus, nextStatus, now, now, invoice_id).run();

  if (nextStatus === 'paid') {
    await fireCascade({
      event: 'invoice.paid',
      actor_id: user.id,
      entity_type: 'invoices',
      entity_id: invoice_id,
      data: { invoice_number: invoice.invoice_number, paid_amount: newPaid, payment_reference: reference, match_id: invoice.match_id },
      env: c.env,
      skipAudit: true,
    });
  }

  await appendAudit({
    env: c.env, entity_type: 'settlement', entity_id: invoice_id,
    event_type: 'payment.recorded', actor_id: user.id,
    payload: {
      payment_id: paymentId, invoice_id, invoice_number: invoice.invoice_number,
      amount: Number(amount), payment_method: method, payment_reference: reference,
      bank_reference: bank_reference || null,
      prior_paid: priorPaid, new_paid: newPaid, new_status: nextStatus,
    },
  }).catch((e) => console.warn('audit_payment_failed', (e as Error).message));

  return c.json({
    success: true,
    data: {
      id: paymentId,
      payment_reference: reference,
      invoice_id,
      amount,
      invoice_status: nextStatus,
      paid_to_date: newPaid,
      balance: Math.max(0, total - newPaid),
    },
  }, 201);
});

// POST /settlement/payments/:id/reconcile — mark a payment reconciled against
// a bank statement. Only the invoice issuer (receiver) can reconcile.
settlement.post('/payments/:id/reconcile', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { bank_reference, notes } = await c.req.json().catch(() => ({} as Record<string, unknown>));

  const payment = (await c.env.DB.prepare(`
    SELECT p.*, i.from_participant_id FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE p.id = ?
  `).bind(id).first()) as (PaymentRow & { from_participant_id: string }) | null;
  if (!payment) return c.json({ success: false, error: 'Payment not found' }, 404);
  if (payment.from_participant_id !== user.id) {
    return c.json({ success: false, error: 'Only the invoice issuer may reconcile this payment' }, 403);
  }
  if (payment.reconciled === 1) {
    return c.json({ success: false, error: 'Payment already reconciled' }, 400);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE payments SET reconciled = 1, reconciled_by = ?, reconciled_at = ?, bank_reference = COALESCE(?, bank_reference), notes = COALESCE(?, notes) WHERE id = ?
  `).bind(user.id, now, bank_reference || null, notes || null, id).run();

  await appendAudit({
    env: c.env, entity_type: 'settlement', entity_id: id,
    event_type: 'payment.reconciled', actor_id: user.id,
    payload: { payment_id: id, bank_reference: bank_reference || null, notes: notes || null },
  }).catch((e) => console.warn('audit_recon_failed', (e as Error).message));

  return c.json({ success: true, data: { id, reconciled: true, reconciled_at: now } });
});

// GET /settlement/disputes — disputes visible to caller.
settlement.get('/disputes', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const filters = ['(i.from_participant_id = ? OR i.to_participant_id = ?)'];
  const bindings: unknown[] = [user.id, user.id];
  if (status) {
    filters.push('d.status = ?');
    bindings.push(status);
  }
  const result = await c.env.DB.prepare(`
    SELECT d.*, i.invoice_number, i.total_amount, i.from_participant_id, i.to_participant_id,
           fp.name AS from_name, tp.name AS to_name, filer.name AS filed_by_name
    FROM settlement_disputes d
    JOIN invoices i ON d.invoice_id = i.id
    JOIN participants fp ON i.from_participant_id = fp.id
    JOIN participants tp ON i.to_participant_id = tp.id
    JOIN participants filer ON d.filed_by = filer.id
    WHERE ${filters.join(' AND ')}
    ORDER BY d.created_at DESC
    LIMIT 100
  `).bind(...bindings).all();
  return c.json({ success: true, data: result.results || [] });
});

// POST /settlement/disputes — file a dispute. Keeps the richer dispute record
// (reason + evidence) that /api/invoices/:id/dispute does not capture.
settlement.post('/disputes', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const { invoice_id, reason, evidence_keys } = body as {
    invoice_id?: string;
    reason?: string;
    evidence_keys?: string[] | string;
  };

  if (!invoice_id || !reason || reason.length < 3) {
    return c.json({ success: false, error: 'invoice_id and a reason of 3+ chars are required' }, 400);
  }

  const invoice = (await c.env.DB.prepare(
    'SELECT id, invoice_number, from_participant_id, to_participant_id, status, match_id FROM invoices WHERE id = ?'
  ).bind(invoice_id).first()) as InvoiceRow | null;
  if (!invoice) return c.json({ success: false, error: 'Invoice not found' }, 404);
  if (invoice.from_participant_id !== user.id && invoice.to_participant_id !== user.id) {
    return c.json({ success: false, error: 'Not a party to this invoice' }, 403);
  }
  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return c.json({ success: false, error: `Cannot dispute invoice in status '${invoice.status}'` }, 400);
  }

  const disputeId = 'disp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  const evidenceJson = Array.isArray(evidence_keys)
    ? JSON.stringify(evidence_keys)
    : typeof evidence_keys === 'string'
      ? evidence_keys
      : null;

  await c.env.DB.prepare(`
    INSERT INTO settlement_disputes (id, invoice_id, filed_by, reason, evidence_keys, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
  `).bind(disputeId, invoice_id, user.id, reason, evidenceJson, now, now).run();

  if (invoice.status !== 'disputed') {
    await c.env.DB.prepare('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?').bind('disputed', now, invoice_id).run();
  }

  await fireCascade({
    event: 'dispute.filed',
    actor_id: user.id,
    entity_type: 'settlement_disputes',
    entity_id: disputeId,
    data: { invoice_id, invoice_number: invoice.invoice_number, reason, match_id: invoice.match_id },
    env: c.env,
    skipAudit: true,
  });

  await appendAudit({
    env: c.env, entity_type: 'settlement', entity_id: disputeId,
    event_type: 'dispute.filed', actor_id: user.id,
    payload: {
      dispute_id: disputeId, invoice_id, invoice_number: invoice.invoice_number,
      reason, evidence_keys: evidenceJson,
    },
  }).catch((e) => console.warn('audit_dispute_filed_failed', (e as Error).message));

  return c.json({ success: true, data: { id: disputeId, status: 'open' } }, 201);
});

// POST /settlement/disputes/:id/resolve — resolve a dispute. Only the
// counterparty (invoice issuer if payer filed, or vice versa) can resolve.
settlement.post('/disputes/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { resolution, outcome } = await c.req.json().catch(() => ({} as Record<string, unknown>));
  if (!resolution || typeof resolution !== 'string' || resolution.length < 3) {
    return c.json({ success: false, error: 'resolution (3+ chars) is required' }, 400);
  }
  const finalOutcome: 'resolved' | 'rejected' = outcome === 'rejected' ? 'rejected' : 'resolved';

  const dispute = (await c.env.DB.prepare(`
    SELECT d.*, i.from_participant_id, i.to_participant_id, i.invoice_number, i.status AS invoice_status
    FROM settlement_disputes d JOIN invoices i ON d.invoice_id = i.id WHERE d.id = ?
  `).bind(id).first()) as (Record<string, unknown> & { filed_by: string; from_participant_id: string; to_participant_id: string; invoice_id: string; status: string; invoice_number: string; invoice_status: string }) | null;
  if (!dispute) return c.json({ success: false, error: 'Dispute not found' }, 404);
  if (dispute.status !== 'open' && dispute.status !== 'under_review') {
    return c.json({ success: false, error: `Dispute already ${dispute.status}` }, 400);
  }
  const counterparty = dispute.filed_by === dispute.from_participant_id ? dispute.to_participant_id : dispute.from_participant_id;
  if (user.id !== counterparty) {
    return c.json({ success: false, error: 'Only the counterparty may resolve this dispute' }, 403);
  }

  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE settlement_disputes SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ?, updated_at = ? WHERE id = ?
  `).bind(finalOutcome, resolution, user.id, now, now, id).run();

  const nextInvoiceStatus = finalOutcome === 'resolved' ? 'issued' : 'cancelled';
  await c.env.DB.prepare('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?').bind(nextInvoiceStatus, now, dispute.invoice_id).run();

  await fireCascade({
    event: 'dispute.resolved',
    actor_id: user.id,
    entity_type: 'settlement_disputes',
    entity_id: id,
    data: { invoice_id: dispute.invoice_id, invoice_number: dispute.invoice_number, outcome: finalOutcome, resolution },
    env: c.env,
    skipAudit: true,
  });

  await appendAudit({
    env: c.env, entity_type: 'settlement', entity_id: id,
    event_type: 'dispute.resolved', actor_id: user.id,
    payload: {
      dispute_id: id, invoice_id: dispute.invoice_id,
      outcome: finalOutcome, resolution,
    },
  }).catch((e) => console.warn('audit_dispute_resolved_failed', (e as Error).message));

  return c.json({ success: true, data: { id, status: finalOutcome } });
});

// POST /settlement/disputes/:id/review — flag as under_review (counterparty only).
settlement.post('/disputes/:id/review', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const dispute = (await c.env.DB.prepare(`
    SELECT d.status, d.filed_by, i.from_participant_id, i.to_participant_id
    FROM settlement_disputes d JOIN invoices i ON d.invoice_id = i.id WHERE d.id = ?
  `).bind(id).first()) as { status: string; filed_by: string; from_participant_id: string; to_participant_id: string } | null;
  if (!dispute) return c.json({ success: false, error: 'Dispute not found' }, 404);
  if (dispute.status !== 'open') {
    return c.json({ success: false, error: `Cannot set under_review from status '${dispute.status}'` }, 400);
  }
  const counterparty = dispute.filed_by === dispute.from_participant_id ? dispute.to_participant_id : dispute.from_participant_id;
  if (user.id !== counterparty) {
    return c.json({ success: false, error: 'Only the counterparty may begin review' }, 403);
  }
  await c.env.DB.prepare('UPDATE settlement_disputes SET status = ?, updated_at = ? WHERE id = ?').bind('under_review', new Date().toISOString(), id).run();
  return c.json({ success: true, data: { id, status: 'under_review' } });
});

// GET /settlement/reconciliation — bird's eye view: totals issued, collected,
// outstanding, overdue, disputed. Scoped to caller's direction.
settlement.get('/reconciliation', async (c) => {
  const user = getCurrentUser(c);
  const direction = c.req.query('direction') === 'incoming' ? 'incoming' : 'outgoing';
  const partyFilter = direction === 'incoming' ? 'i.to_participant_id = ?' : 'i.from_participant_id = ?';

  const rows = (await c.env.DB.prepare(`
    SELECT i.status, COUNT(*) AS c, COALESCE(SUM(i.total_amount), 0) AS total, COALESCE(SUM(i.paid_amount), 0) AS paid
    FROM invoices i WHERE ${partyFilter} GROUP BY i.status
  `).bind(user.id).all()).results || [];

  const summary = {
    direction,
    buckets: rows as Array<{ status: string; c: number; total: number; paid: number }>,
    totals: {
      invoices: 0,
      billed_zar: 0,
      collected_zar: 0,
      outstanding_zar: 0,
      disputed_zar: 0,
    },
  };
  for (const b of summary.buckets) {
    summary.totals.invoices += Number(b.c || 0);
    summary.totals.billed_zar += Number(b.total || 0);
    summary.totals.collected_zar += Number(b.paid || 0);
    if (b.status === 'issued' || b.status === 'partial' || b.status === 'overdue') {
      summary.totals.outstanding_zar += Number(b.total || 0) - Number(b.paid || 0);
    }
    if (b.status === 'disputed') {
      summary.totals.disputed_zar += Number(b.total || 0);
    }
  }

  const aging = (await c.env.DB.prepare(`
    SELECT
      SUM(CASE WHEN i.due_date IS NULL OR julianday(DATE('now')) - julianday(DATE(i.due_date)) <= 0 THEN (i.total_amount - COALESCE(i.paid_amount,0)) ELSE 0 END) AS current_zar,
      SUM(CASE WHEN i.due_date IS NOT NULL AND julianday(DATE('now')) - julianday(DATE(i.due_date)) BETWEEN 1 AND 30 THEN (i.total_amount - COALESCE(i.paid_amount,0)) ELSE 0 END) AS d1_30_zar,
      SUM(CASE WHEN i.due_date IS NOT NULL AND julianday(DATE('now')) - julianday(DATE(i.due_date)) BETWEEN 31 AND 60 THEN (i.total_amount - COALESCE(i.paid_amount,0)) ELSE 0 END) AS d31_60_zar,
      SUM(CASE WHEN i.due_date IS NOT NULL AND julianday(DATE('now')) - julianday(DATE(i.due_date)) > 60 THEN (i.total_amount - COALESCE(i.paid_amount,0)) ELSE 0 END) AS d60p_zar
    FROM invoices i WHERE ${partyFilter} AND i.status IN ('issued','partial','overdue')
  `).bind(user.id).first()) as { current_zar: number | null; d1_30_zar: number | null; d31_60_zar: number | null; d60p_zar: number | null } | null;

  return c.json({
    success: true,
    data: {
      ...summary,
      aging: {
        current_zar: Number(aging?.current_zar || 0),
        d1_30_zar: Number(aging?.d1_30_zar || 0),
        d31_60_zar: Number(aging?.d31_60_zar || 0),
        d60p_zar: Number(aging?.d60p_zar || 0),
      },
    },
  });
});

// ────────────────────────────────────────────────────────────────────────
// L4 endpoints — settlement breaks, business-day calendar, fees engine,
// invoice confirmations handshake, AI run-failure explainer.
//
// These extend the basic CRUD above with the operational depth needed to
// run a real settlement function: exception handling, fee accrual,
// confirmation handshake, AI-assisted DLQ explanation. Each endpoint
// follows the same idempotency + audit patterns used in the trading
// rejection-explainer route (src/routes/trading.ts).
// ────────────────────────────────────────────────────────────────────────

// GET /settlement/breaks — list breaks across every invoice the caller is
// party to. Supports ?status= and ?severity= filters. Used by the
// Settlement.tsx Breaks tab so the user has one screen for every open
// exception they're involved in (not a per-invoice deep-dive).
settlement.get('/breaks', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const severity = c.req.query('severity');
  const where: string[] = ['(i.from_participant_id = ? OR i.to_participant_id = ?)'];
  const binds: unknown[] = [user.id, user.id];
  if (status) { where.push('b.status = ?'); binds.push(status); }
  if (severity) { where.push('b.severity = ?'); binds.push(severity); }
  const rows = await c.env.DB.prepare(
    `SELECT b.id, b.invoice_id, b.break_type, b.severity, b.status,
            b.reported_by, b.reported_at, b.reason,
            b.expected_value, b.actual_value,
            b.resolution_outcome, b.resolution_notes, b.resolved_at, b.resolved_by,
            i.invoice_number, i.from_participant_id, i.to_participant_id,
            i.total_amount, i.status AS invoice_status
       FROM settlement_breaks b
       INNER JOIN invoices i ON i.id = b.invoice_id
      WHERE ${where.join(' AND ')}
      ORDER BY CASE b.severity
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
        b.reported_at DESC
      LIMIT 200`,
  )
    .bind(...binds)
    .all()
    .catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

// POST /settlement/invoices/:id/breaks — file an exception against an invoice.
settlement.post('/invoices/:id/breaks', async (c) => {
  const user = getCurrentUser(c);
  const invoiceId = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    break_type?: string;
    severity?: string;
    reason?: string;
    expected_value?: number;
    actual_value?: number;
  };
  const breakType = String(body.break_type || '').trim();
  const reason = String(body.reason || '').trim();
  if (!breakType || !reason || reason.length < 3) {
    return c.json({ success: false, error: 'break_type and reason (≥3 chars) are required' }, 400);
  }

  // Authz — caller must be either party to the invoice OR an admin.
  const inv = await c.env.DB.prepare(
    `SELECT id, from_participant_id, to_participant_id FROM invoices WHERE id = ?`,
  )
    .bind(invoiceId)
    .first<{ id: string; from_participant_id: string; to_participant_id: string }>();
  if (!inv) return c.json({ success: false, error: 'Invoice not found' }, 404);
  const involved =
    user.id === inv.from_participant_id ||
    user.id === inv.to_participant_id ||
    user.role === 'admin';
  if (!involved) return c.json({ success: false, error: 'Forbidden' }, 403);

  // Severity defaulted by rule of thumb where the body doesn't specify.
  const sev = (body.severity || 'medium').trim();
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO settlement_breaks
      (id, invoice_id, break_type, severity, reported_by, reason, expected_value, actual_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      invoiceId,
      breakType,
      sev,
      user.id,
      reason,
      body.expected_value ?? null,
      body.actual_value ?? null,
    )
    .run();

  // High+critical breaks auto-flip the invoice to disputed so the UI
  // surfaces the contention immediately.
  if (sev === 'high' || sev === 'critical') {
    await c.env.DB.prepare(
      `UPDATE invoices SET confirmation_status = 'disputed' WHERE id = ? AND confirmation_status != 'disputed'`,
    )
      .bind(invoiceId)
      .run()
      .catch(() => {});
  }

  return c.json({ success: true, data: { id, status: 'open' } });
});

// GET /settlement/invoices/:id/breaks — list breaks for an invoice.
settlement.get('/invoices/:id/breaks', async (c) => {
  const invoiceId = c.req.param('id');
  const gate = await assertInvoiceParty(c, invoiceId);
  if (gate) return gate;
  const rows = await c.env.DB.prepare(
    `SELECT id, break_type, severity, status, reported_by, reported_at, reason,
            expected_value, actual_value, resolution_outcome, resolution_notes,
            resolved_at, resolved_by
       FROM settlement_breaks
      WHERE invoice_id = ?
      ORDER BY reported_at DESC`,
  )
    .bind(invoiceId)
    .all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /settlement/breaks/:id/transition — state machine transition.
//   open → investigating | rejected
//   investigating → resolved | rejected
// Notes required on resolved/rejected terminal transitions.
settlement.post('/breaks/:id/transition', async (c) => {
  const user = getCurrentUser(c);
  const breakId = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    to?: string;
    outcome?: string;
    notes?: string;
  };
  const to = String(body.to || '').trim();
  if (!['investigating', 'resolved', 'rejected'].includes(to)) {
    return c.json({ success: false, error: 'Invalid transition target' }, 400);
  }

  const brk = await c.env.DB.prepare(
    `SELECT b.id, b.status, b.invoice_id, i.from_participant_id, i.to_participant_id
       FROM settlement_breaks b INNER JOIN invoices i ON i.id = b.invoice_id
      WHERE b.id = ?`,
  )
    .bind(breakId)
    .first<any>();
  if (!brk) return c.json({ success: false, error: 'Break not found' }, 404);
  const involved =
    user.id === brk.from_participant_id ||
    user.id === brk.to_participant_id ||
    user.role === 'admin';
  if (!involved) return c.json({ success: false, error: 'Forbidden' }, 403);

  // Guard: cannot exit a terminal state.
  if (brk.status === 'resolved' || brk.status === 'rejected') {
    return c.json({ success: false, error: `Break is ${brk.status}; no further transitions allowed` }, 422);
  }
  // Guard: only investigating can move to resolved.
  if (to === 'resolved' && brk.status !== 'investigating') {
    return c.json({ success: false, error: 'Move to investigating before resolving' }, 422);
  }
  if ((to === 'resolved' || to === 'rejected') && (!body.notes || body.notes.length < 3)) {
    return c.json({ success: false, error: 'Notes ≥3 chars required on terminal transitions' }, 400);
  }

  const now = new Date().toISOString();
  const isTerminal = to === 'resolved' || to === 'rejected';
  await c.env.DB.prepare(
    `UPDATE settlement_breaks
       SET status = ?,
           resolution_outcome = ?,
           resolution_notes   = ?,
           resolved_at        = ?,
           resolved_by        = ?,
           updated_at         = ?
     WHERE id = ?`,
  )
    .bind(
      to,
      isTerminal ? (body.outcome || (to === 'resolved' ? 'corrected' : 'no_action')) : null,
      body.notes || null,
      isTerminal ? now : null,
      isTerminal ? user.id : null,
      now,
      breakId,
    )
    .run();

  return c.json({ success: true, data: { id: breakId, status: to } });
});

// POST /settlement/invoices/:id/confirm — issuer/payer handshake.
// issuer confirms first → payer can then acknowledge. Either side
// can reject; rejection flips the invoice to disputed.
settlement.post('/invoices/:id/confirm', async (c) => {
  const user = getCurrentUser(c);
  const invoiceId = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    party?: string;
    status?: string;
    notes?: string;
  };
  const party = String(body.party || '').trim();
  const status = String(body.status || '').trim();
  if (!['issuer', 'payer'].includes(party)) {
    return c.json({ success: false, error: 'party must be issuer or payer' }, 400);
  }
  if (!['confirmed', 'rejected'].includes(status)) {
    return c.json({ success: false, error: 'status must be confirmed or rejected' }, 400);
  }

  const inv = await c.env.DB.prepare(
    `SELECT id, from_participant_id, to_participant_id, confirmation_status FROM invoices WHERE id = ?`,
  )
    .bind(invoiceId)
    .first<any>();
  if (!inv) return c.json({ success: false, error: 'Invoice not found' }, 404);

  // The user's role on this invoice — issuer is the one who issued
  // (from_participant_id), payer is the recipient (to_participant_id).
  const userIsIssuer = user.id === inv.from_participant_id;
  const userIsPayer = user.id === inv.to_participant_id;
  if (!userIsIssuer && !userIsPayer && user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  if (party === 'issuer' && !userIsIssuer && user.role !== 'admin') {
    return c.json({ success: false, error: 'Only the issuer can confirm as issuer' }, 403);
  }
  if (party === 'payer' && !userIsPayer && user.role !== 'admin') {
    return c.json({ success: false, error: 'Only the payer can acknowledge as payer' }, 403);
  }
  // The payer cannot acknowledge before the issuer has confirmed —
  // enforce the order so the audit trail is sensible.
  if (party === 'payer' && status === 'confirmed' && inv.confirmation_status !== 'issuer_confirmed') {
    return c.json({ success: false, error: 'Issuer must confirm before payer can acknowledge' }, 422);
  }

  await c.env.DB.prepare(
    `INSERT INTO invoice_confirmations (id, invoice_id, party, confirmed_by, status, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (invoice_id, party) DO UPDATE SET
       confirmed_by = excluded.confirmed_by,
       confirmed_at = datetime('now'),
       status       = excluded.status,
       notes        = excluded.notes`,
  )
    .bind(crypto.randomUUID(), invoiceId, party, user.id, status, body.notes || null)
    .run();

  // Roll-up the invoice's confirmation_status field.
  let newConfirmation = inv.confirmation_status;
  if (status === 'rejected') newConfirmation = 'disputed';
  else if (party === 'issuer' && status === 'confirmed') newConfirmation = 'issuer_confirmed';
  else if (party === 'payer' && status === 'confirmed') newConfirmation = 'payer_acknowledged';
  if (newConfirmation !== inv.confirmation_status) {
    await c.env.DB.prepare(`UPDATE invoices SET confirmation_status = ? WHERE id = ?`)
      .bind(newConfirmation, invoiceId)
      .run();
  }

  return c.json({ success: true, data: { invoice_id: invoiceId, confirmation_status: newConfirmation } });
});

// GET /settlement/invoices/:id/confirmations
settlement.get('/invoices/:id/confirmations', async (c) => {
  const invoiceId = c.req.param('id');
  const gate = await assertInvoiceParty(c, invoiceId);
  if (gate) return gate;
  const rows = await c.env.DB.prepare(
    `SELECT party, confirmed_by, confirmed_at, status, notes
       FROM invoice_confirmations WHERE invoice_id = ?
      ORDER BY confirmed_at`,
  )
    .bind(invoiceId)
    .all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /settlement/invoices/:id/fees/recompute — idempotent fee accrual.
settlement.post('/invoices/:id/fees/recompute', async (c) => {
  const invoiceId = c.req.param('id');
  const inv = await c.env.DB.prepare(
    `SELECT id, status, total_amount, paid_amount, due_date AS payment_due_at, created_at AS issued_at
       FROM invoices WHERE id = ?`,
  )
    .bind(invoiceId)
    .first<InvoiceShape>();
  if (!inv) return c.json({ success: false, error: 'Invoice not found' }, 404);

  const fees = computeFees({ now: new Date(), invoice: inv });
  let inserted = 0;
  for (const f of fees) {
    const r = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO settlement_fees
        (id, invoice_id, fee_type, basis, amount_zar, reason, calc_rule_version, applied_after, applied_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        f.id,
        f.invoice_id,
        f.fee_type,
        f.basis,
        f.amount_zar,
        f.reason,
        f.calc_rule_version,
        f.applied_after ?? null,
        f.applied_by ?? 'system',
      )
      .run()
      .catch(() => ({ changes: 0 } as any));
    inserted += Number((r as any)?.changes || 0);
  }

  const rows = await c.env.DB.prepare(
    `SELECT id, fee_type, basis, amount_zar, reason, calc_rule_version, applied_after, calculated_at
       FROM settlement_fees WHERE invoice_id = ? ORDER BY calculated_at DESC`,
  )
    .bind(invoiceId)
    .all();
  return c.json({ success: true, data: { fees: rows.results || [], new_rows: inserted } });
});

// GET /settlement/invoices/:id/fees
settlement.get('/invoices/:id/fees', async (c) => {
  const invoiceId = c.req.param('id');
  const gate = await assertInvoiceParty(c, invoiceId);
  if (gate) return gate;
  const rows = await c.env.DB.prepare(
    `SELECT id, fee_type, basis, amount_zar, reason, calc_rule_version, applied_after, calculated_at
       FROM settlement_fees WHERE invoice_id = ? ORDER BY calculated_at DESC`,
  )
    .bind(invoiceId)
    .all();
  return c.json({ success: true, data: rows.results || [] });
});

// POST /settlement/runs/:id/explain — AI run-failure explainer.
// Looks up the DLQ row, runs the deterministic resolver first, then
// falls through to the gateway path for novel codes. Persists into
// ai_settlement_run_failures regardless of source.
settlement.post('/runs/:id/explain', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'support' && user.role !== 'regulator') {
    // operators only; the trader / offtaker SPA doesn't surface this
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const runId = c.req.param('id');
  const dlq = await c.env.DB.prepare(
    `SELECT id, run_id, failure_code, failure_message
       FROM settlement_dlq WHERE run_id = ?
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(runId)
    .first<any>()
    .catch(() => null);

  const code = dlq?.failure_code || null;
  const msg = dlq?.failure_message || null;
  const explanation = await explainSettlementRunFailure(code, msg);

  // Persist idempotently — same (run_id, failure_code) only ever lands once.
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO ai_settlement_run_failures
      (id, run_id, dlq_id, failure_code, failure_message, explanation, suggested_action, confidence, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      runId,
      dlq?.id || null,
      code,
      msg,
      explanation.explanation,
      explanation.suggested_action,
      explanation.confidence,
      explanation.source,
    )
    .run()
    .catch(() => {});

  return c.json({ success: true, data: { id, ...explanation } });
});

// GET /settlement/calendar/holidays?from=&to=
settlement.get('/calendar/holidays', async (c) => {
  const from = c.req.query('from') || new Date().toISOString().slice(0, 10);
  const to =
    c.req.query('to') ||
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const zone = c.req.query('market_zone') || 'ZA';
  const rows = await c.env.DB.prepare(
    `SELECT date, market_zone, is_business_day, holiday_name, observed, notes
       FROM business_day_calendar
      WHERE market_zone = ? AND date BETWEEN ? AND ?
      ORDER BY date`,
  )
    .bind(zone, from, to)
    .all();
  return c.json({ success: true, data: rows.results || [] });
});

// GET /settlement/calendar/next-business-day?date=YYYY-MM-DD
// Lightweight helper the SPA calls to preview an adjusted due-date.
settlement.get('/calendar/next-business-day', async (c) => {
  const date = c.req.query('date') || new Date().toISOString().slice(0, 10);
  const zone = c.req.query('market_zone') || 'ZA';
  const deps = buildD1Deps(c.env.DB);
  const adjusted = await adjustModifiedFollowing(date, zone, deps);
  return c.json({ success: true, data: { input: date, adjusted, market_zone: zone } });
});

// GET /settlement/invoices/:id/detail — invoice + every L4 sub-resource
// (breaks, fees, confirmations, line items, payments) in one round-trip
// so the SPA Invoice detail page paints fast.
settlement.get('/invoices/:id/detail', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const inv = await c.env.DB.prepare(
    `SELECT i.*, fp.name AS from_name, tp.name AS to_name
       FROM invoices i
       JOIN participants fp ON i.from_participant_id = fp.id
       JOIN participants tp ON i.to_participant_id = tp.id
      WHERE i.id = ?`,
  ).bind(id).first<any>();
  if (!inv) return c.json({ success: false, error: 'Invoice not found' }, 404);
  if (inv.from_participant_id !== user.id && inv.to_participant_id !== user.id && user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const safe = async (sql: string, binds: unknown[]): Promise<any[]> =>
    c.env.DB.prepare(sql).bind(...binds).all().then(r => (r as any).results || []).catch(() => []);
  const breaks = await safe('SELECT * FROM settlement_breaks WHERE invoice_id = ? ORDER BY reported_at DESC', [id]);
  const fees = await safe('SELECT * FROM settlement_fees WHERE invoice_id = ? ORDER BY calculated_at DESC', [id]);
  const confirmations = await safe('SELECT * FROM invoice_confirmations WHERE invoice_id = ? ORDER BY confirmed_at', [id]);
  const lineItems = await safe('SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY sequence_no', [id]);
  const payments = await safe(
    `SELECT p.* FROM payments p WHERE p.invoice_id = ? ORDER BY p.payment_date DESC`, [id],
  );
  return c.json({
    success: true,
    data: { invoice: inv, breaks, fees, confirmations, line_items: lineItems, payments },
  });
});

// ════════════════════════════════════════════════════════════════════════
// L5 — Tamper-evident audit, SARS/POPIA-shape export, bank-statement recon.
// ════════════════════════════════════════════════════════════════════════

// Settlement is a clearing/settlement oversight function — its audit chain and
// export packs are officer-only (admin/support/regulator), matching the
// isOfficer split already used in GET /audit/events and the officer-gated
// POST /audit/export. The frontend audit panel is registered under admin.
const settlementAuditOfficer = (role: string): boolean =>
  role === 'admin' || role === 'support' || role === 'regulator';

settlement.get('/audit/head', async (c) => {
  const user = getCurrentUser(c);
  if (!settlementAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const head = await getChainHead(c.env, 'settlement');
  return c.json({ success: true, data: head });
});

settlement.get('/audit/events', async (c) => {
  const user = getCurrentUser(c);
  const limit = Math.min(200, Number(c.req.query('limit') || 50));
  const beforeSeq = c.req.query('before_seq');
  const where: string[] = [`entity_type = 'settlement'`];
  const binds: unknown[] = [];
  const isOfficer = user.role === 'admin' || user.role === 'support' || user.role === 'regulator';
  if (!isOfficer) { where.push('actor_id = ?'); binds.push(user.id); }
  if (beforeSeq) { where.push('sequence_no < ?'); binds.push(Number(beforeSeq)); }
  const rs = await c.env.DB.prepare(
    `SELECT id, entity_id, event_type, actor_id, sequence_no,
            content_hash, prev_hash, created_at, payload_json
       FROM audit_events
      WHERE ${where.join(' AND ')}
      ORDER BY sequence_no DESC
      LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

settlement.post('/audit/verify', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const fromSeq = Number(c.req.query('from_seq') || 1) || 1;
  const result = await verifyChain(c.env, 'settlement', fromSeq);
  return c.json({ success: result.ok, data: result });
});

// POST /settlement/audit/export — SARS-style invoice register CSV. Includes:
//   invoice_number, issued_at, payer_id, payee_id, currency, net_zar, vat_zar,
//   gross_zar, paid_zar, status, confirmation_at, paid_at, match_id
// Streams to R2 under audit-exports/settlement/<id>/. Manifest signed by the
// settlement chain head so a SARS auditor can verify the export against the
// audited state at the moment of generation.
settlement.post('/audit/export', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = body.to || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return c.json({ success: false, error: 'from/to must be YYYY-MM-DD' }, 400);
  }

  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.invoice_number, i.created_at AS issued_at,
            i.from_participant_id AS payee_id, i.to_participant_id AS payer_id,
            i.currency, i.total_amount AS gross_zar, i.paid_amount AS paid_zar,
            i.status, i.paid_at, i.match_id,
            (SELECT MAX(confirmed_at) FROM invoice_confirmations
              WHERE invoice_id = i.id) AS confirmation_at
       FROM invoices i
      WHERE substr(i.created_at, 1, 10) BETWEEN ? AND ?
      ORDER BY i.created_at ASC`,
  ).bind(from, to).all<{
    id: string; invoice_number: string; issued_at: string;
    payee_id: string; payer_id: string; currency: string;
    gross_zar: number; paid_zar: number | null; status: string;
    paid_at: string | null; match_id: string | null; confirmation_at: string | null;
  }>();
  const data = rows.results || [];

  const header = ['invoice_id','invoice_number','issued_at','payer_id','payee_id','currency',
                  'net_zar','vat_zar','gross_zar','paid_zar','status','confirmation_at','paid_at','match_id'].join(',');
  const csvLines = [header];
  for (const r of data) {
    // VAT is 15% in SA; net = gross / 1.15. We don't have a separate VAT
    // column today so we derive it for the register. This matches what
    // SARS expects on a tax invoice register.
    const gross = Number(r.gross_zar || 0);
    const net = +(gross / 1.15).toFixed(2);
    const vat = +(gross - net).toFixed(2);
    csvLines.push([
      r.id, r.invoice_number, r.issued_at,
      r.payer_id, r.payee_id, r.currency || 'ZAR',
      net.toFixed(2), vat.toFixed(2), gross.toFixed(2),
      Number(r.paid_zar || 0).toFixed(2),
      r.status, r.confirmation_at || '', r.paid_at || '',
      r.match_id || '',
    ].join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  const csvBytes = new TextEncoder().encode(csv);
  const csvSha = await sha256OfBytes(csvBytes);

  const head = await getChainHead(c.env, 'settlement');
  const exportId = 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-exports/settlement/${exportId}/invoices.csv`;
  const manifestKey = `audit-exports/settlement/${exportId}/manifest.json`;

  const manifest = {
    export_id: exportId,
    entity_type: 'settlement',
    from, to,
    generated_at: new Date().toISOString(),
    generated_by: user.id,
    row_count: data.length,
    csv: { r2_key: csvKey, sha256: csvSha, bytes: csvBytes.byteLength },
    chain: {
      head_hash: head?.head_hash || null,
      head_sequence: head?.head_sequence || 0,
      last_verified_at: head?.last_verified_at || null,
    },
    format: { profile: 'SARS tax-invoice register v1', encoding: 'utf-8',
              vat_rate_pct: 15.0 },
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestBytes = new TextEncoder().encode(manifestJson);

  try {
    await c.env.R2.put(csvKey, csvBytes, { httpMetadata: { contentType: 'text/csv' } });
    await c.env.R2.put(manifestKey, manifestBytes, { httpMetadata: { contentType: 'application/json' } });
  } catch (e) {
    return c.json({ success: false, error: 'R2 write failed', data: { detail: (e as Error).message } }, 502);
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_exports
       (id, entity_type, from_ts, to_ts, row_count,
        csv_r2_key, manifest_r2_key, chain_head_hash, generated_by, generated_at)
     VALUES (?, 'settlement', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(exportId, from, to, data.length, csvKey, manifestKey,
         head?.head_hash || '', user.id).run();

  await appendAudit({
    env: c.env, entity_type: 'settlement', entity_id: exportId,
    event_type: 'audit.export_generated', actor_id: user.id,
    payload: { export_id: exportId, from, to, row_count: data.length, csv_sha256: csvSha },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { export_id: exportId, row_count: data.length, csv_r2_key: csvKey, manifest_r2_key: manifestKey, manifest },
  }, 201);
});

settlement.get('/audit/exports', async (c) => {
  const user = getCurrentUser(c);
  if (!settlementAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT id, from_ts, to_ts, row_count, csv_r2_key, manifest_r2_key,
            chain_head_hash, generated_by, generated_at
       FROM audit_exports WHERE entity_type = 'settlement'
      ORDER BY generated_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

settlement.get('/audit/exports/:id/manifest', async (c) => {
  const user = getCurrentUser(c);
  if (!settlementAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT manifest_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'settlement'`,
  ).bind(id).first<{ manifest_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.manifest_r2_key);
  if (!obj) return c.json({ success: false, error: 'Manifest object missing in R2' }, 404);
  const text = await obj.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  return c.json({ success: true, data: parsed ?? { raw: text } });
});

settlement.get('/audit/exports/:id/csv', async (c) => {
  const user = getCurrentUser(c);
  if (!settlementAuditOfficer(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT csv_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'settlement'`,
  ).bind(id).first<{ csv_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.csv_r2_key);
  if (!obj) return c.json({ success: false, error: 'CSV object missing in R2' }, 404);
  return new Response(await obj.arrayBuffer(), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${id}.csv"`,
    },
  });
});

// POST /settlement/audit/recon — bank-statement reconciliation. Body:
//   { source: 'bank' | 'absa' | 'standard_bank' | …, csv: 'header,row1\n…' }
// CSV columns required: bank_ref, value_date, amount_zar, narrative
// Matches against `payments.bank_reference`. Mismatches classified as:
//   • missing_in_ours      — bank has a credit; we have no payment row
//   • missing_in_theirs    — we have a payment with bank_reference unseen in bank file
//   • field_mismatch       — amount differs >R0.01 between ours and theirs
settlement.post('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator' && user.role !== 'offtaker') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; csv?: string };
  const source = (body.source || 'bank').toLowerCase();
  if (typeof body.csv !== 'string' || body.csv.length < 10) {
    return c.json({ success: false, error: 'csv body required' }, 400);
  }

  const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  const need = ['bank_ref','value_date','amount_zar','narrative'];
  for (const k of need) {
    if (!headers.includes(k)) {
      return c.json({ success: false, error: `csv missing column: ${k}` }, 400);
    }
  }
  const idxOf = (k: string) => headers.indexOf(k);
  type TheirRow = { bank_ref: string; value_date: string; amount_zar: number; narrative: string };
  const theirs: TheirRow[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    theirs.push({
      bank_ref:  (cols[idxOf('bank_ref')] || '').trim(),
      value_date: (cols[idxOf('value_date')] || '').trim(),
      amount_zar: Number(cols[idxOf('amount_zar')] || 0),
      narrative: (cols[idxOf('narrative')] || '').trim(),
    });
  }

  const runId = 'recon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-recon/settlement/${runId}/bank-statement.csv`;
  await c.env.R2.put(csvKey, new TextEncoder().encode(body.csv), {
    httpMetadata: { contentType: 'text/csv' },
  }).catch(() => null);

  const ours = await c.env.DB.prepare(
    `SELECT p.id, p.invoice_id, p.bank_reference, p.amount, p.payment_date,
            i.invoice_number, i.to_participant_id AS payer_id
       FROM payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
      WHERE p.bank_reference IS NOT NULL`,
  ).all<{
    id: string; invoice_id: string; bank_reference: string; amount: number;
    payment_date: string; invoice_number: string; payer_id: string;
  }>();
  type OurRow = (typeof ours)['results'][number];
  const ourByRef = new Map<string, OurRow>();
  for (const r of (ours.results || []) as OurRow[]) {
    if (r.bank_reference) ourByRef.set(r.bank_reference, r);
  }
  const matchedRefs = new Set<string>();
  type Break = { type: string; bank_ref: string | null; our: unknown; their: unknown; field: string | null };
  const breaks: Break[] = [];
  for (const t of theirs) {
    if (!t.bank_ref) {
      breaks.push({ type: 'missing_in_ours', bank_ref: null, our: null, their: t, field: null });
      continue;
    }
    const o = ourByRef.get(t.bank_ref);
    if (!o) {
      breaks.push({ type: 'missing_in_ours', bank_ref: t.bank_ref, our: null, their: t, field: null });
      continue;
    }
    matchedRefs.add(t.bank_ref);
    if (Math.abs(Number(o.amount) - Number(t.amount_zar)) > 0.01) {
      breaks.push({ type: 'field_mismatch', bank_ref: t.bank_ref, our: o, their: t, field: 'amount_zar' });
    }
  }
  for (const [ref, o] of ourByRef.entries()) {
    if (matchedRefs.has(ref)) continue;
    breaks.push({ type: 'missing_in_theirs', bank_ref: ref, our: o, their: null, field: null });
  }

  const matchedCount = theirs.length - breaks.filter((b) => b.type !== 'field_mismatch').length;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_recon_runs
       (id, entity_type, source, uploaded_csv_r2_key, row_count,
        matched_count, break_count, status, started_at, finished_at, started_by)
     VALUES (?, 'settlement', ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  ).bind(runId, source, csvKey, theirs.length, matchedCount,
         breaks.length, now, now, user.id).run();

  if (breaks.length > 0) {
    const inserts = breaks.map((b) => c.env.DB.prepare(
      `INSERT INTO audit_recon_breaks
         (id, run_id, break_type, external_ref, our_value, their_value, field, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    ).bind(
      'brk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      runId, b.type, b.bank_ref,
      b.our != null ? JSON.stringify(b.our) : null,
      b.their != null ? JSON.stringify(b.their) : null,
      b.field,
    ));
    await c.env.DB.batch(inserts);
  }

  await appendAudit({
    env: c.env, entity_type: 'settlement', entity_id: runId,
    event_type: 'audit.recon_run', actor_id: user.id,
    payload: { run_id: runId, source, row_count: theirs.length, break_count: breaks.length },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { run_id: runId, source, row_count: theirs.length, matched_count: matchedCount, break_count: breaks.length },
  }, 201);
});

// Recon reads match the recon-write audience (admin/regulator/offtaker do
// settlement reconciliation) plus support; these are operational run summaries,
// not the full-chain evidence pack.
const settlementReconRead = (role: string): boolean =>
  role === 'admin' || role === 'regulator' || role === 'support' || role === 'offtaker';

settlement.get('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (!settlementReconRead(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT id, source, row_count, matched_count, break_count, status,
            started_at, finished_at
       FROM audit_recon_runs WHERE entity_type = 'settlement'
      ORDER BY started_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

settlement.get('/audit/recon/:id/breaks', async (c) => {
  const user = getCurrentUser(c);
  if (!settlementReconRead(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const rs = await c.env.DB.prepare(
    `SELECT id, break_type, external_ref, our_value, their_value, field,
            resolution, resolution_notes, resolved_at, resolved_by
       FROM audit_recon_breaks WHERE run_id = ?
      ORDER BY break_type, external_ref`,
  ).bind(id).all();
  return c.json({ success: true, data: rs.results || [] });
});

settlement.post('/audit/recon/:run_id/breaks/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'offtaker') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const runId = c.req.param('run_id');
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { resolution?: string; notes?: string };
  const allowed = ['accepted_ours','accepted_theirs','cancelled','investigating'];
  if (!allowed.includes(String(body.resolution))) {
    return c.json({ success: false, error: `resolution must be one of ${allowed.join('/')}` }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE audit_recon_breaks
       SET resolution = ?, resolution_notes = ?, resolved_at = datetime('now'), resolved_by = ?
     WHERE id = ? AND run_id = ?`,
  ).bind(body.resolution, body.notes || null, user.id, id, runId).run();
  await appendAudit({
    env: c.env, entity_type: 'settlement', entity_id: id,
    event_type: 'audit.recon_break_resolved', actor_id: user.id,
    payload: { run_id: runId, break_id: id, resolution: body.resolution, notes: body.notes || null },
  }).catch(() => {});
  return c.json({ success: true });
});

async function sha256OfBytes(b: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export default settlement;
