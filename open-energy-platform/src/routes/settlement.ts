// Settlement Routes — payments, disputes, reconciliation
// Invoice lifecycle (draft → issued → paid / disputed) lives on /api/invoices.
// This module covers the downstream: recording bank payments against invoices,
// resolving disputes, and producing reconciliation summaries.
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { computeFees, type InvoiceShape } from '../utils/settlement-fees';
import { explainSettlementRunFailure } from '../utils/run-failure-explainer';
import { adjustModifiedFollowing, buildD1Deps } from '../utils/business-day';

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

export default settlement;
