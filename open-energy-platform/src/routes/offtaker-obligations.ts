// ═══════════════════════════════════════════════════════════════════════════
// Wave 7 — Offtaker PPA obligation routes.
//
// Flat-mounted at /api/offtaker/obligations.
//
// Roles (per [[feedback_role_ux_depth]]):
//   • READ_ROLES: admin/support/offtaker/ipp_developer/lender/regulator/carbon_fund
//   • OFFTAKER_WRITE: admin/support/offtaker (verify, reject, cure with evidence)
//   • IPP_WRITE: admin/support/ipp_developer (submit readings)
//
// Borrower-vs-lender style scoping: ipp_developer can only see obligations
// where they are the counterparty; offtaker only where they are participant.
//
// Every mutation fires a matching cascade.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  evaluateObligation,
  applyVerifiedDelta,
  periodEndOfMonth,
  isTakeOrPayTransition,
  takeOrPayLiability,
  DEFAULT_THRESHOLD_PCT,
  DEFAULT_CURE_WINDOW_DAYS,
  type ObligationStatus,
} from '../utils/offtaker-obligation-spec';

const OFFTAKER_WRITE = new Set(['admin', 'support', 'offtaker']);
const IPP_WRITE = new Set(['admin', 'support', 'ipp_developer']);
const READ_ROLES = new Set([
  'admin', 'support', 'offtaker', 'ipp_developer',
  'lender', 'regulator', 'carbon_fund', 'trader',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ObligationRow {
  id: string;
  ppa_id: string;
  participant_id: string;
  counterparty_id: string | null;
  period_month: string;
  contracted_mwh: number;
  delivered_mwh: number;
  threshold_pct: number;
  cure_deadline_at: string | null;
  status: ObligationStatus;
  take_or_pay_amount_zar: number;
  cured_at: string | null;
  cured_by: string | null;
  cure_evidence_r2_key: string | null;
  escalated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DeliveryVerificationRow {
  id: string;
  obligation_id: string;
  ppa_id: string;
  period_month: string;
  reading_mwh: number;
  reading_window_start: string | null;
  reading_window_end: string | null;
  submitted_by: string;
  submitted_at: string;
  status: 'submitted' | 'verified' | 'rejected' | 'reversed';
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  meter_evidence_r2_key: string | null;
  notes: string | null;
  created_at: string;
}

function ok(c: any, data: unknown) {
  return c.json({ success: true, data });
}

function isOfftakerRow(row: ObligationRow, user: { id: string; role: string }): boolean {
  if (user.role === 'admin' || user.role === 'support') return true;
  if (user.role === 'offtaker') return row.participant_id === user.id;
  if (user.role === 'ipp_developer') {
    return row.counterparty_id === user.id;
  }
  return READ_ROLES.has(user.role); // lender/regulator/trader/carbon_fund — read-only any row
}

// ─── GET / — list obligations ────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  const status = c.req.query('status'); // pending|delivered|shortfall|cured|take_or_pay
  const ppa_id = c.req.query('ppa_id');
  const period_month = c.req.query('period_month');

  const where: string[] = [];
  const binds: any[] = [];
  if (status && status !== 'all') { where.push('status = ?'); binds.push(status); }
  if (ppa_id) { where.push('ppa_id = ?'); binds.push(ppa_id); }
  if (period_month) { where.push('period_month = ?'); binds.push(period_month); }

  if (user.role === 'offtaker') { where.push('participant_id = ?'); binds.push(user.id); }
  if (user.role === 'ipp_developer') {
    where.push('counterparty_id = ?'); binds.push(user.id);
  }

  const sql = `
    SELECT * FROM oe_offtaker_ppa_obligations
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY period_month DESC, updated_at DESC
    LIMIT 200
  `;
  const res = await c.env.DB.prepare(sql).bind(...binds).all<ObligationRow>();
  return ok(c, res.results || []);
});

// ─── GET /:id — single obligation + its verifications ────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(`SELECT * FROM oe_offtaker_ppa_obligations WHERE id = ?`)
    .bind(id).first<ObligationRow>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (!isOfftakerRow(row, user)) return c.json({ success: false, error: 'forbidden' }, 403);

  const ver = await c.env.DB.prepare(
    `SELECT * FROM oe_offtaker_delivery_verification WHERE obligation_id = ? ORDER BY submitted_at DESC`,
  ).bind(id).all<DeliveryVerificationRow>();

  return ok(c, { obligation: row, verifications: ver.results || [] });
});

// ─── POST /readings — IPP submits a reading ──────────────────────────────────
app.post('/readings', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !IPP_WRITE.has(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => ({})) as Partial<{
    obligation_id: string; reading_mwh: number;
    reading_window_start: string; reading_window_end: string;
    meter_evidence_r2_key: string; notes: string;
  }>;

  if (!body.obligation_id || typeof body.reading_mwh !== 'number') {
    return c.json({ success: false, error: 'obligation_id and reading_mwh required' }, 400);
  }

  const obl = await c.env.DB.prepare(`SELECT * FROM oe_offtaker_ppa_obligations WHERE id = ?`)
    .bind(body.obligation_id).first<ObligationRow>();
  if (!obl) return c.json({ success: false, error: 'obligation_not_found' }, 404);

  // IPP can only submit against their own counterparty obligation.
  if (user.role !== 'admin' && user.role !== 'support' && obl.counterparty_id !== user.id) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  const id = 'dv_' + Math.random().toString(36).slice(2, 10);
  await c.env.DB.prepare(`
    INSERT INTO oe_offtaker_delivery_verification
      (id, obligation_id, ppa_id, period_month, reading_mwh,
       reading_window_start, reading_window_end,
       submitted_by, status, meter_evidence_r2_key, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, obl.id, obl.ppa_id, obl.period_month, body.reading_mwh,
    body.reading_window_start || null, body.reading_window_end || null,
    user.id, 'submitted', body.meter_evidence_r2_key || null, body.notes || null,
  ).run();

  await fireCascade({
    event: 'offtaker.reading_submitted',
    actor_id: user.id,
    entity_type: 'offtaker_delivery_verification',
    entity_id: id,
    data: { obligation_id: obl.id, ppa_id: obl.ppa_id, reading_mwh: body.reading_mwh },
    env: c.env,
  }).catch(() => null);

  return ok(c, { id });
});

// ─── POST /readings/:id/verify — offtaker verifies the reading ───────────────
app.post('/readings/:id/verify', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !OFFTAKER_WRITE.has(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');

  const dv = await c.env.DB.prepare(`SELECT * FROM oe_offtaker_delivery_verification WHERE id = ?`)
    .bind(id).first<DeliveryVerificationRow>();
  if (!dv) return c.json({ success: false, error: 'not_found' }, 404);
  if (dv.status !== 'submitted') return c.json({ success: false, error: 'not_in_submitted_state' }, 409);

  const obl = await c.env.DB.prepare(`SELECT * FROM oe_offtaker_ppa_obligations WHERE id = ?`)
    .bind(dv.obligation_id).first<ObligationRow>();
  if (!obl) return c.json({ success: false, error: 'obligation_missing' }, 500);

  // Offtaker can only verify their own obligation rows.
  if (user.role === 'offtaker' && obl.participant_id !== user.id) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  const newDelivered = applyVerifiedDelta(Number(obl.delivered_mwh || 0), Number(dv.reading_mwh || 0));

  const periodEnd = periodEndOfMonth(obl.period_month);
  const verdict = evaluateObligation({
    contracted_mwh: Number(obl.contracted_mwh || 0),
    delivered_mwh: newDelivered,
    threshold_pct: Number(obl.threshold_pct || DEFAULT_THRESHOLD_PCT),
    period_end_at: periodEnd,
    cure_window_days: DEFAULT_CURE_WINDOW_DAYS,
  });

  await c.env.DB.prepare(`
    UPDATE oe_offtaker_delivery_verification
       SET status = 'verified', verified_by = ?, verified_at = datetime('now')
     WHERE id = ?
  `).bind(user.id, id).run();

  await c.env.DB.prepare(`
    UPDATE oe_offtaker_ppa_obligations
       SET delivered_mwh = ?,
           status = ?,
           cure_deadline_at = COALESCE(cure_deadline_at, ?),
           cured_at = CASE WHEN ? = 'delivered' AND status = 'shortfall' THEN datetime('now') ELSE cured_at END,
           updated_at = datetime('now')
     WHERE id = ?
  `).bind(
    newDelivered,
    verdict.status,
    verdict.status === 'shortfall' ? verdict.cure_deadline_at.toISOString() : null,
    verdict.status,
    obl.id,
  ).run();

  await fireCascade({
    event: 'offtaker.reading_verified',
    actor_id: user.id,
    entity_type: 'offtaker_delivery_verification',
    entity_id: id,
    data: {
      obligation_id: obl.id, ppa_id: obl.ppa_id,
      delivered_mwh: newDelivered, status: verdict.status,
    },
    env: c.env,
  }).catch(() => null);

  // Side cascades on state transition.
  if (obl.status !== 'shortfall' && verdict.status === 'shortfall') {
    await fireCascade({
      event: 'offtaker.obligation_shortfall',
      actor_id: user.id,
      entity_type: 'offtaker_ppa_obligation',
      entity_id: obl.id,
      data: {
        ppa_id: obl.ppa_id, period_month: obl.period_month,
        shortfall_mwh: verdict.shortfall_mwh,
        cure_deadline_at: verdict.cure_deadline_at.toISOString(),
      },
      env: c.env,
    }).catch(() => null);
  } else if (obl.status === 'shortfall' && verdict.status === 'delivered') {
    await fireCascade({
      event: 'offtaker.obligation_cured',
      actor_id: user.id,
      entity_type: 'offtaker_ppa_obligation',
      entity_id: obl.id,
      data: { ppa_id: obl.ppa_id, period_month: obl.period_month },
      env: c.env,
    }).catch(() => null);
  } else if (isTakeOrPayTransition(obl.status, verdict.status)) {
    // Edge case — late verify against a period whose cure already expired.
    const liability = takeOrPayLiability({
      contracted_mwh: Number(obl.contracted_mwh || 0),
      delivered_mwh: newDelivered,
      price_zar_per_mwh: 0, // route doesn't know PPA price; cron sweep fills it. Leave 0 here; sweep idempotent.
    });
    await fireCascade({
      event: 'offtaker.obligation_take_or_pay',
      actor_id: user.id,
      entity_type: 'offtaker_ppa_obligation',
      entity_id: obl.id,
      data: { ppa_id: obl.ppa_id, period_month: obl.period_month, take_or_pay_amount_zar: liability },
      env: c.env,
    }).catch(() => null);
  }

  return ok(c, { status: verdict.status, delivered_mwh: newDelivered });
});

// ─── POST /readings/:id/reject — offtaker rejects the reading ────────────────
app.post('/readings/:id/reject', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !OFFTAKER_WRITE.has(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as Partial<{ reason: string }>;
  if (!body.reason) return c.json({ success: false, error: 'reason required' }, 400);

  const dv = await c.env.DB.prepare(`SELECT * FROM oe_offtaker_delivery_verification WHERE id = ?`)
    .bind(id).first<DeliveryVerificationRow>();
  if (!dv) return c.json({ success: false, error: 'not_found' }, 404);
  if (dv.status !== 'submitted') return c.json({ success: false, error: 'not_in_submitted_state' }, 409);

  await c.env.DB.prepare(`
    UPDATE oe_offtaker_delivery_verification
       SET status = 'rejected', verified_by = ?, verified_at = datetime('now'), rejection_reason = ?
     WHERE id = ?
  `).bind(user.id, body.reason, id).run();

  await fireCascade({
    event: 'offtaker.reading_rejected',
    actor_id: user.id,
    entity_type: 'offtaker_delivery_verification',
    entity_id: id,
    data: { obligation_id: dv.obligation_id, reason: body.reason },
    env: c.env,
  }).catch(() => null);

  return ok(c, { id, status: 'rejected' });
});

// ─── POST /:id/cure — offtaker accepts a cure plan with evidence ─────────────
app.post('/:id/cure', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !OFFTAKER_WRITE.has(user.role)) return c.json({ success: false, error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as Partial<{ evidence_r2_key: string; notes: string }>;
  if (!body.evidence_r2_key) return c.json({ success: false, error: 'evidence_r2_key required' }, 400);

  const row = await c.env.DB.prepare(`SELECT * FROM oe_offtaker_ppa_obligations WHERE id = ?`)
    .bind(id).first<ObligationRow>();
  if (!row) return c.json({ success: false, error: 'not_found' }, 404);
  if (row.status !== 'shortfall') return c.json({ success: false, error: 'not_in_shortfall_state' }, 409);
  if (user.role === 'offtaker' && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  await c.env.DB.prepare(`
    UPDATE oe_offtaker_ppa_obligations
       SET status = 'cured', cured_at = datetime('now'), cured_by = ?,
           cure_evidence_r2_key = ?, notes = COALESCE(?, notes), updated_at = datetime('now')
     WHERE id = ?
  `).bind(user.id, body.evidence_r2_key, body.notes || null, id).run();

  await fireCascade({
    event: 'offtaker.obligation_cured',
    actor_id: user.id,
    entity_type: 'offtaker_ppa_obligation',
    entity_id: id,
    data: { ppa_id: row.ppa_id, period_month: row.period_month, evidence_r2_key: body.evidence_r2_key },
    env: c.env,
  }).catch(() => null);

  return ok(c, { id, status: 'cured' });
});

export default app;
