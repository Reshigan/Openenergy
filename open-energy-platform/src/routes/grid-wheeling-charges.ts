// ═══════════════════════════════════════════════════════════════════════════
// Wave 8 — Grid wheeling charge routes.
//
// Flat-mounted at /api/grid/wheeling-charges.
//
// Roles (per [[feedback_role_ux_depth]]):
//   • READ_ROLES: admin/support/grid_operator/offtaker/ipp_developer/regulator
//   • GRID_WRITE: admin/support/grid_operator (issue charge, resolve disputes,
//     mark paid)
//   • DISPUTE_RAISE: admin/support/offtaker (raise disputes against a charge)
//
// Every mutation fires a matching cascade. Daily 05:00 UTC cron sweeps
// disputed charges with expired deadlines into 'escalated' and posts a
// 'grid.wheeling_charge_escalated' event that lands in the regulator inbox
// at severity 'high'.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  computeWheelingCharge,
  disputeDeadlineFrom,
  DEFAULT_DISPUTE_WINDOW_DAYS,
  type WheelingChargeStatus,
  type WheelingDisputeStatus,
} from '../utils/wheeling-charges-spec';

const GRID_WRITE = new Set(['admin', 'support', 'grid_operator']);
const DISPUTE_RAISE = new Set(['admin', 'support', 'offtaker']);
const READ_ROLES = new Set([
  'admin', 'support', 'grid_operator', 'offtaker',
  'ipp_developer', 'regulator', 'trader',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ChargeRow {
  id: string;
  agreement_id: string;
  period_month: string;
  issued_by: string;
  issued_at: string;
  transmission_mwh: number;
  tariff_zar_per_mwh: number;
  loss_factor_pct: number;
  loss_mwh: number;
  gross_zar: number;
  loss_zar: number;
  ancillaries_zar: number;
  total_zar: number;
  status: WheelingChargeStatus;
  dispute_deadline_at: string | null;
  paid_at: string | null;
  paid_by: string | null;
  paid_amount_zar: number | null;
  escalated_at: string | null;
  escalated_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DisputeRow {
  id: string;
  charge_id: string;
  agreement_id: string;
  raised_by: string;
  raised_at: string;
  dispute_reason: string;
  claimed_amount_zar: number | null;
  status: WheelingDisputeStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_amount_zar: number | null;
  resolution_notes: string | null;
  evidence_r2_key: string | null;
  created_at: string;
}

interface AgreementRow {
  id: string;
  generator_id: string;
  offtaker_id: string;
  contracted_mw: number;
  loss_factor_pct: number;
  wheeling_tariff_zar_per_mwh: number;
  dispute_window_days: number | null;
  status: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function scopeFilter(role: string, userId: string): { sql: string; params: unknown[] } {
  // grid_operator / admin / support / regulator see everything.
  if (role === 'admin' || role === 'support' || role === 'grid_operator' || role === 'regulator') {
    return { sql: '', params: [] };
  }
  // offtaker / ipp_developer can only see charges on agreements they participate in.
  return {
    sql: ` AND c.agreement_id IN (
      SELECT id FROM oe_wheeling_agreements
      WHERE offtaker_id = ? OR generator_id = ?
    )`,
    params: [userId, userId],
  };
}

// ─── List charges ────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const status = c.req.query('status');
  const agreementId = c.req.query('agreement_id');
  const periodMonth = c.req.query('period_month');

  let sql = 'SELECT c.* FROM oe_grid_wheeling_charges c WHERE 1=1';
  const params: unknown[] = [];

  if (status) { sql += ' AND c.status = ?'; params.push(status); }
  if (agreementId) { sql += ' AND c.agreement_id = ?'; params.push(agreementId); }
  if (periodMonth) { sql += ' AND c.period_month = ?'; params.push(periodMonth); }

  const scope = scopeFilter(user.role, user.id);
  sql += scope.sql;
  params.push(...scope.params);

  sql += ' ORDER BY c.issued_at DESC LIMIT 500';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<ChargeRow>();
  return c.json({ success: true, data: results || [] });
});

// ─── Charge drill-down (with disputes) ───────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const charge = await c.env.DB
    .prepare('SELECT * FROM oe_grid_wheeling_charges WHERE id = ?')
    .bind(id).first<ChargeRow>();
  if (!charge) return c.json({ success: false, error: 'Not found' }, 404);

  if (user.role === 'offtaker' || user.role === 'ipp_developer') {
    const agreement = await c.env.DB
      .prepare('SELECT offtaker_id, generator_id FROM oe_wheeling_agreements WHERE id = ?')
      .bind(charge.agreement_id).first<{ offtaker_id: string; generator_id: string }>();
    if (!agreement || (agreement.offtaker_id !== user.id && agreement.generator_id !== user.id)) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }
  }

  const disputes = await c.env.DB
    .prepare('SELECT * FROM oe_grid_wheeling_disputes WHERE charge_id = ? ORDER BY raised_at DESC')
    .bind(id).all<DisputeRow>();

  return c.json({ success: true, data: { charge, disputes: disputes.results || [] } });
});

// ─── Issue a new monthly charge (grid_operator) ─────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !GRID_WRITE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    agreement_id: string;
    period_month: string;
    transmission_mwh: number;
    ancillaries_zar?: number;
    notes?: string;
  }>();

  if (!body.agreement_id || !body.period_month || body.transmission_mwh == null) {
    return c.json({ success: false, error: 'agreement_id, period_month, transmission_mwh required' }, 400);
  }

  const agreement = await c.env.DB
    .prepare('SELECT * FROM oe_wheeling_agreements WHERE id = ?')
    .bind(body.agreement_id).first<AgreementRow>();
  if (!agreement) return c.json({ success: false, error: 'Agreement not found' }, 404);

  const breakdown = computeWheelingCharge({
    transmission_mwh: Number(body.transmission_mwh),
    tariff_zar_per_mwh: Number(agreement.wheeling_tariff_zar_per_mwh),
    loss_factor_pct: Number(agreement.loss_factor_pct),
    ancillaries_zar: Number(body.ancillaries_zar || 0),
  });

  const now = new Date();
  const window = agreement.dispute_window_days ?? DEFAULT_DISPUTE_WINDOW_DAYS;
  const deadline = disputeDeadlineFrom(now, window);
  const id = newId('chg');

  await c.env.DB.prepare(`
    INSERT INTO oe_grid_wheeling_charges (
      id, agreement_id, period_month, issued_by, issued_at,
      transmission_mwh, tariff_zar_per_mwh, loss_factor_pct,
      loss_mwh, gross_zar, loss_zar, ancillaries_zar, total_zar,
      status, dispute_deadline_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).bind(
    id, body.agreement_id, body.period_month, user.id, now.toISOString(),
    breakdown.transmission_mwh, breakdown.tariff_zar_per_mwh, breakdown.loss_factor_pct,
    breakdown.loss_mwh, breakdown.gross_zar, breakdown.loss_zar,
    breakdown.ancillaries_zar, breakdown.total_zar,
    deadline.toISOString(), body.notes || null,
  ).run();

  await fireCascade({
    event: 'grid.wheeling_charge_issued',
    actor_id: user.id,
    entity_type: 'oe_grid_wheeling_charges',
    entity_id: id,
    data: {
      agreement_id: body.agreement_id,
      period_month: body.period_month,
      total_zar: breakdown.total_zar,
      dispute_deadline_at: deadline.toISOString(),
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, ...breakdown, dispute_deadline_at: deadline.toISOString() } });
});

// ─── Raise a dispute against a charge (offtaker) ─────────────────────────────
app.post('/:id/dispute', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !DISPUTE_RAISE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{
    dispute_reason: string;
    claimed_amount_zar?: number;
    evidence_r2_key?: string;
  }>();

  if (!body.dispute_reason) {
    return c.json({ success: false, error: 'dispute_reason required' }, 400);
  }

  const charge = await c.env.DB
    .prepare('SELECT * FROM oe_grid_wheeling_charges WHERE id = ?')
    .bind(id).first<ChargeRow>();
  if (!charge) return c.json({ success: false, error: 'Not found' }, 404);

  if (charge.status === 'paid' || charge.status === 'escalated') {
    return c.json({ success: false, error: `Cannot dispute a ${charge.status} charge` }, 409);
  }

  if (user.role === 'offtaker') {
    const agreement = await c.env.DB
      .prepare('SELECT offtaker_id FROM oe_wheeling_agreements WHERE id = ?')
      .bind(charge.agreement_id).first<{ offtaker_id: string }>();
    if (!agreement || agreement.offtaker_id !== user.id) {
      return c.json({ success: false, error: 'Not the offtaker on this agreement' }, 403);
    }
  }

  const existingOpen = await c.env.DB
    .prepare("SELECT id FROM oe_grid_wheeling_disputes WHERE charge_id = ? AND status = 'open'")
    .bind(id).first<{ id: string }>();
  if (existingOpen) {
    return c.json({ success: false, error: 'An open dispute already exists for this charge' }, 409);
  }

  const disputeId = newId('dsp');
  await c.env.DB.prepare(`
    INSERT INTO oe_grid_wheeling_disputes (
      id, charge_id, agreement_id, raised_by, dispute_reason,
      claimed_amount_zar, status, evidence_r2_key
    ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).bind(
    disputeId, id, charge.agreement_id, user.id, body.dispute_reason,
    body.claimed_amount_zar ?? null, body.evidence_r2_key || null,
  ).run();

  await c.env.DB.prepare(
    "UPDATE oe_grid_wheeling_charges SET status='disputed', updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  await fireCascade({
    event: 'grid.wheeling_charge_disputed',
    actor_id: user.id,
    entity_type: 'oe_grid_wheeling_charges',
    entity_id: id,
    data: {
      agreement_id: charge.agreement_id,
      period_month: charge.period_month,
      dispute_id: disputeId,
      claimed_amount_zar: body.claimed_amount_zar ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { dispute_id: disputeId } });
});

// ─── Resolve an open dispute (grid_operator) ─────────────────────────────────
app.post('/disputes/:id/resolve', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !GRID_WRITE.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const disputeId = c.req.param('id');
  const body = await c.req.json<{
    resolution_amount_zar: number;
    resolution_notes?: string;
  }>();

  if (body.resolution_amount_zar == null) {
    return c.json({ success: false, error: 'resolution_amount_zar required' }, 400);
  }

  const dispute = await c.env.DB
    .prepare('SELECT * FROM oe_grid_wheeling_disputes WHERE id = ?')
    .bind(disputeId).first<DisputeRow>();
  if (!dispute) return c.json({ success: false, error: 'Not found' }, 404);
  if (dispute.status !== 'open') {
    return c.json({ success: false, error: `Dispute is already ${dispute.status}` }, 409);
  }

  await c.env.DB.prepare(`
    UPDATE oe_grid_wheeling_disputes
    SET status='resolved', resolved_by=?, resolved_at=datetime('now'),
        resolution_amount_zar=?, resolution_notes=?
    WHERE id=?
  `).bind(
    user.id, Number(body.resolution_amount_zar),
    body.resolution_notes || null, disputeId,
  ).run();

  await c.env.DB.prepare(`
    UPDATE oe_grid_wheeling_charges
    SET status='reconciled', total_zar=?, updated_at=datetime('now')
    WHERE id=?
  `).bind(Number(body.resolution_amount_zar), dispute.charge_id).run();

  await fireCascade({
    event: 'grid.wheeling_dispute_resolved',
    actor_id: user.id,
    entity_type: 'oe_grid_wheeling_disputes',
    entity_id: disputeId,
    data: {
      charge_id: dispute.charge_id,
      agreement_id: dispute.agreement_id,
      resolution_amount_zar: Number(body.resolution_amount_zar),
    },
    env: c.env,
  });

  return c.json({ success: true });
});

// ─── Mark a charge paid (offtaker or grid_operator) ─────────────────────────
app.post('/:id/pay', async (c) => {
  const user = getCurrentUser(c);
  if (!user || (!GRID_WRITE.has(user.role) && user.role !== 'offtaker')) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json<{
    paid_amount_zar: number;
    notes?: string;
  }>();

  if (body.paid_amount_zar == null) {
    return c.json({ success: false, error: 'paid_amount_zar required' }, 400);
  }

  const charge = await c.env.DB
    .prepare('SELECT * FROM oe_grid_wheeling_charges WHERE id = ?')
    .bind(id).first<ChargeRow>();
  if (!charge) return c.json({ success: false, error: 'Not found' }, 404);
  if (charge.status === 'paid' || charge.status === 'escalated') {
    return c.json({ success: false, error: `Cannot pay a ${charge.status} charge` }, 409);
  }

  if (user.role === 'offtaker') {
    const agreement = await c.env.DB
      .prepare('SELECT offtaker_id FROM oe_wheeling_agreements WHERE id = ?')
      .bind(charge.agreement_id).first<{ offtaker_id: string }>();
    if (!agreement || agreement.offtaker_id !== user.id) {
      return c.json({ success: false, error: 'Not the offtaker on this agreement' }, 403);
    }
  }

  await c.env.DB.prepare(`
    UPDATE oe_grid_wheeling_charges
    SET status='paid', paid_at=datetime('now'), paid_by=?, paid_amount_zar=?,
        updated_at=datetime('now')
    WHERE id=?
  `).bind(user.id, Number(body.paid_amount_zar), id).run();

  await fireCascade({
    event: 'grid.wheeling_charge_paid',
    actor_id: user.id,
    entity_type: 'oe_grid_wheeling_charges',
    entity_id: id,
    data: {
      agreement_id: charge.agreement_id,
      period_month: charge.period_month,
      paid_amount_zar: Number(body.paid_amount_zar),
    },
    env: c.env,
  });

  return c.json({ success: true });
});

export default app;
