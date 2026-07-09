// W147 — IPP Payment Certificates
// JBCC 6.2 Cl.40-43 / NEC4 Cl.51
// GET  /api/ipp-payment-cert        — list + KPIs
// GET  /api/ipp-payment-cert/:id    — detail + audit trail
// POST /api/ipp-payment-cert        — create
// PUT  /api/ipp-payment-cert/:id/action — state transition

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type PaymentCertStatus,
  type PaymentCertAction,
  type CertTier,
  deriveCertTier,
  crossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-payment-cert-spec';
import { badEnum } from '../utils/validation';

// Migration 390 CHECK(claim_type IN (...)) — reject before D1 500s.
const PC_CLAIM_TYPES = ['progress', 'retention_release', 'final_account', 'variation', 'dayworks', 'loss_and_expense', 'advance_payment'];

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

export async function ippPaymentCertSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  // Mark overdue certified certs as lapsed
  const lapsed = await env.DB
    .prepare(`SELECT id, value_tier FROM oe_ipp_payment_certs
              WHERE chain_status = 'certified' AND payment_due_at IS NOT NULL
                AND payment_due_at <= ? AND lapsed_at IS NULL`)
    .bind(now)
    .all<{ id: string; value_tier: string }>();
  for (const row of lapsed.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_payment_certs SET chain_status='lapsed', lapsed_at=?, updated_at=? WHERE id=?`)
      .bind(now, now, row.id)
      .run();
    await fireCascade({ event: 'ipp_pc.mark_lapsed', actor_id: 'system',
      entity_type: 'ipp_payment_cert', entity_id: row.id,
      data: { value_tier: row.value_tier }, env });
  }
  // SLA breaches
  const breaches = await env.DB
    .prepare(`SELECT id, value_tier FROM oe_ipp_payment_certs
              WHERE sla_due_at IS NOT NULL AND sla_breached = 0
                AND chain_status NOT IN ('paid','final_payment','adjudicated','withdrawn','rejected')
                AND sla_due_at <= ?`)
    .bind(now)
    .all<{ id: string; value_tier: string }>();
  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_payment_certs SET sla_breached=1, updated_at=? WHERE id=?`)
      .bind(now, row.id)
      .run();
    await fireCascade({ event: 'ipp_pc.sla_breached', actor_id: 'system',
      entity_type: 'ipp_payment_cert', entity_id: row.id,
      data: { value_tier: row.value_tier }, env });
  }
}

// ── GET / ──────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const env = c.env;
  const { project_id, status, tier, claim_type, page = '1', per_page = '50' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(per_page);

  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?'); binds.push(user.id);
  }
  if (project_id) { clauses.push('project_id = ?'); binds.push(project_id); }
  if (status) { clauses.push('chain_status = ?'); binds.push(status); }
  if (tier) { clauses.push('value_tier = ?'); binds.push(tier); }
  if (claim_type) { clauses.push('claim_type = ?'); binds.push(claim_type); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [rows, total, kpis] = await Promise.all([
    env.DB.prepare(`SELECT * FROM oe_ipp_payment_certs ${where} ORDER BY cert_number DESC LIMIT ? OFFSET ?`)
      .bind(...binds, parseInt(per_page), offset)
      .all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) as n FROM oe_ipp_payment_certs ${where}`)
      .bind(...binds).first<{ n: number }>(),
    env.DB.prepare(`SELECT
        COUNT(*) as total,
        SUM(CASE WHEN chain_status NOT IN ('paid','final_payment','adjudicated','withdrawn','rejected') THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN chain_status IN ('paid','final_payment') THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN chain_status = 'disputed' THEN 1 ELSE 0 END) as disputed_count,
        SUM(CASE WHEN chain_status = 'lapsed' THEN 1 ELSE 0 END) as lapsed_count,
        SUM(CASE WHEN chain_status = 'adjudicated' THEN 1 ELSE 0 END) as adjudicated_count,
        SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
        COALESCE(SUM(CASE WHEN chain_status NOT IN ('paid','final_payment','adjudicated','withdrawn','rejected') THEN claimed_value_zar ELSE 0 END),0) as open_value_zar,
        COALESCE(SUM(CASE WHEN chain_status IN ('paid','final_payment') THEN certified_value_zar ELSE 0 END),0) as total_paid_zar,
        COALESCE(SUM(CASE WHEN chain_status IN ('certified','lapsed') THEN certified_value_zar ELSE 0 END),0) as outstanding_zar
      FROM oe_ipp_payment_certs ${where}`)
      .bind(...binds).first<Record<string, unknown>>(),
  ]);

  return c.json({ success: true, data: {
    items: rows.results ?? [],
    pagination: { page: parseInt(page), per_page: parseInt(per_page), total: total?.n ?? 0 },
    kpis,
  }});
});

// ── GET /:id ───────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();
  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_payment_certs WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support', 'regulator'].includes(user.role) && row.participant_id !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const audit = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type='ipp_payment_cert' AND entity_id=? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();
  return c.json({ success: true, data: { ...row, audit_trail: audit.results ?? [] } });
});

// ── POST / ────────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const env = c.env;

  const body = await c.req.json<{
    project_id: string;
    cert_number?: string;
    claim_type: string;
    claimed_value_zar: number;
    period_from?: string;
    period_to?: string;
    description?: string;
  }>();

  if (!body.project_id || !body.claim_type || body.claimed_value_zar == null) {
    return c.json({ error: 'project_id, claim_type, claimed_value_zar required' }, 400);
  }

  const typeErr = badEnum('claim_type', body.claim_type, PC_CLAIM_TYPES);
  if (typeErr) return c.json({ error: typeErr }, 400);

  const tier = deriveCertTier(body.claimed_value_zar);
  const slaAt = new Date(Date.now() + SLA_DAYS[tier] * 24 * 3_600_000).toISOString();
  const now = new Date().toISOString();
  const id = `ipppc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  // Auto-increment cert_number if not provided
  const maxCert = await env.DB
    .prepare(`SELECT MAX(CAST(REPLACE(cert_number,'PC-','') AS INTEGER)) as m FROM oe_ipp_payment_certs WHERE project_id=?`)
    .bind(body.project_id).first<{ m: number | null }>();
  const certNo = body.cert_number ?? `PC-${String((maxCert?.m ?? 0) + 1).padStart(3, '0')}`;

  await env.DB
    .prepare(`INSERT INTO oe_ipp_payment_certs
        (id, participant_id, project_id, cert_number, claim_type, value_tier,
         claimed_value_zar, period_from, period_to, description,
         chain_status, sla_due_at, sla_breached, submitted_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'draft',?,0,?,?,?)`)
    .bind(id, user.id, body.project_id, certNo, body.claim_type, tier,
      body.claimed_value_zar, body.period_from ?? null, body.period_to ?? null,
      body.description ?? null, slaAt, now, now, now)
    .run();

  await fireCascade({ event: 'ipp_pc.created', actor_id: user.id,
    entity_type: 'ipp_payment_cert', entity_id: id,
    data: { cert_number: certNo, claim_type: body.claim_type, tier, claimed_value_zar: body.claimed_value_zar },
    env });

  return c.json({ success: true, data: { id, cert_number: certNo } }, 201);
});

// ── PUT /:id/action ────────────────────────────────────────────────────────────
app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const env = c.env;

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: PaymentCertAction;
    reason?: string;
    certified_value_zar?: number;
    payment_due_at?: string;
  }>();

  const row = await env.DB
    .prepare('SELECT * FROM oe_ipp_payment_certs WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!['admin', 'support'].includes(user.role) && row.participant_id !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as PaymentCertStatus;
  if (HARD_TERMINALS.includes(current)) return c.json({ error: `Status ${current} is terminal` }, 409);

  const ACTION_STATE_MAP: Partial<Record<PaymentCertAction, PaymentCertStatus>> = {
    submit_claim:        'submitted',
    assess_claim:        'assessed',
    certify_payment:     'certified',
    confirm_payment:     'paid',
    certify_final:       'final_payment',
    dispute_certificate: 'disputed',
    revise_certificate:  'revised',
    refer_adjudication:  'adjudicated',
    reject_claim:        'rejected',
    withdraw_claim:      'withdrawn',
    mark_lapsed:         'lapsed',
    flag_sla_breach:     current,
  };

  const nextStatus = ACTION_STATE_MAP[body.action];
  if (!nextStatus) return c.json({ error: `Unknown action: ${body.action}` }, 400);
  if (nextStatus !== current && !VALID_TRANSITIONS[current]?.includes(nextStatus)) {
    return c.json({ error: `Cannot transition ${current} → ${nextStatus}` }, 409);
  }

  const now = new Date().toISOString();
  const tier = row.value_tier as CertTier;
  const extraCols: Record<string, unknown> = {};

  if (body.action === 'submit_claim') extraCols.submitted_at = now;
  if (body.action === 'assess_claim') extraCols.assessed_at = now;
  if (body.action === 'certify_payment' || body.action === 'certify_final') {
    extraCols.certified_at = now;
    if (body.certified_value_zar != null) extraCols.certified_value_zar = body.certified_value_zar;
    if (body.payment_due_at) extraCols.payment_due_at = body.payment_due_at;
    else {
      // Default: 30 days from certification (JBCC payment period)
      extraCols.payment_due_at = new Date(Date.now() + 30 * 24 * 3_600_000).toISOString();
    }
  }
  if (body.action === 'confirm_payment') extraCols.paid_at = now;
  if (body.action === 'dispute_certificate') extraCols.disputed_at = now;
  if (body.action === 'refer_adjudication') extraCols.adjudicated_at = now;
  if (body.action === 'reject_claim') extraCols.rejected_at = now;
  if (body.action === 'withdraw_claim') extraCols.withdrawn_at = now;
  if (body.action === 'mark_lapsed') extraCols.lapsed_at = now;
  if (body.action === 'flag_sla_breach') extraCols.sla_breached = 1;

  const setCols = ['chain_status = ?', 'updated_at = ?', ...Object.keys(extraCols).map(k => `${k} = ?`)];
  await env.DB
    .prepare(`UPDATE oe_ipp_payment_certs SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextStatus, now, ...Object.values(extraCols), id)
    .run();

  const reportable = crossesIntoRegulator(body.action, tier);
  await fireCascade({ event: `ipp_pc.${body.action}` as never, actor_id: user.id,
    entity_type: 'ipp_payment_cert', entity_id: id,
    data: { from: current, to: nextStatus, reason: body.reason, tier, is_reportable: reportable }, env });

  return c.json({ success: true, data: { id, status: nextStatus, is_reportable: reportable } });
});

export default app;
