// Settlement Routes — payments, disputes, reconciliation
// Invoice lifecycle (draft → issued → paid / disputed) lives on /api/invoices.
// This module covers the downstream: recording bank payments against invoices,
// resolving disputes, and producing reconciliation summaries.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const settlement = new Hono<HonoEnv>();
settlement.use('*', authMiddleware);

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
    });
  }

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
  });

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
  });

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
      SUM(CASE WHEN julianday('now') - julianday(i.due_date) <= 0 THEN (i.total_amount - COALESCE(i.paid_amount,0)) ELSE 0 END) AS current_zar,
      SUM(CASE WHEN julianday('now') - julianday(i.due_date) BETWEEN 1 AND 30 THEN (i.total_amount - COALESCE(i.paid_amount,0)) ELSE 0 END) AS d1_30_zar,
      SUM(CASE WHEN julianday('now') - julianday(i.due_date) BETWEEN 31 AND 60 THEN (i.total_amount - COALESCE(i.paid_amount,0)) ELSE 0 END) AS d31_60_zar,
      SUM(CASE WHEN julianday('now') - julianday(i.due_date) > 60 THEN (i.total_amount - COALESCE(i.paid_amount,0)) ELSE 0 END) AS d60p_zar
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

export default settlement;
