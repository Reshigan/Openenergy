// ═══════════════════════════════════════════════════════════════════════════
// Wave 198 — Participant KYC / FICA Entity Verification
// Mounted at /api/kyc-verifications
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  KycStatus, KycAction, RiskLevel,
  deriveKycSla, KYC_HARD_TERMINALS,
  KYC_VALID_TRANSITIONS, KYC_STATE_TRANSITIONS,
  kycCrossesIntoRegulator, kycSlaBreachCrossesIntoRegulator,
} from '../utils/kyc-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'support'];

export async function kycSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...KYC_HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, risk_level FROM oe_kyc_verifications
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...KYC_HARD_TERMINALS, now)
    .all<{ id: string; risk_level: RiskLevel }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = kycSlaBreachCrossesIntoRegulator(row.risk_level);

    await env.DB
      .prepare(
        `UPDATE oe_kyc_verifications
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    if (reportable) {
      await env.DB
        .prepare(
          `INSERT INTO regulator_inbox
             (id, category, priority, subject, body, source_table, source_id,
              source_event, participant_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          `kyc_sla_${row.id}_${Date.now()}`,
          'kyc_verification',
          'high',
          `KYC SLA Breach — ${row.risk_level}`,
          `KYC verification ${row.id} (${row.risk_level}) has breached its SLA deadline.`,
          'oe_kyc_verifications',
          row.id,
          'kyc_evt_sla_breached',
          row.id,
          now,
        )
        .run();
    }

    await fireCascade({
      event: 'kyc_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'kyc_verification',
      entity_id: row.id,
      data: { risk_level: row.risk_level, regulator_notified: reportable },
      env,
    });
  }

  return { swept: rows.length };
}

// ─── GET / — list ────────────────────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);
  const { status, risk_level, participant_id: qParticipant, page = '1', per_page = '50' } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Participants see only their own record
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  } else {
    if (qParticipant) { clauses.push('participant_id = ?'); binds.push(qParticipant); }
    if (status)       { clauses.push('chain_status = ?');   binds.push(status); }
    if (risk_level)   { clauses.push('risk_level = ?');     binds.push(risk_level); }
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPh = [...KYC_HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(`SELECT * FROM oe_kyc_verifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_kyc_verifications ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           SUM(CASE WHEN chain_status NOT IN (${terminalPh}) THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN chain_status = 'verified' THEN 1 ELSE 0 END) as verified,
           SUM(CASE WHEN chain_status = 'rejected' THEN 1 ELSE 0 END) as rejected,
           SUM(CASE WHEN chain_status = 'suspended' THEN 1 ELSE 0 END) as suspended,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached
         FROM oe_kyc_verifications ${where}`,
      )
      .bind(...[...KYC_HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: rows.results ?? [],
    kpis: {
      pending:     kpis?.pending     ?? 0,
      verified:    kpis?.verified    ?? 0,
      rejected:    kpis?.rejected    ?? 0,
      suspended:   kpis?.suspended   ?? 0,
      sla_breached: kpis?.sla_breached ?? 0,
    },
    pagination: {
      page: pageNum, per_page: perPage,
      total: totalRow?.n ?? 0,
      total_pages: Math.ceil((totalRow?.n ?? 0) / perPage),
    },
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_kyc_verifications WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'kyc_verification' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: { ...row, timeline: timeline.results ?? [] } });
});

// ─── POST / — create KYC record ──────────────────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    participant_id: string;
    entity_type?: string;
    risk_level?: RiskLevel;
  }>();

  if (!body.participant_id) {
    return c.json({ success: false, error: 'participant_id is required' }, 400);
  }

  const existing = await c.env.DB
    .prepare('SELECT id FROM oe_kyc_verifications WHERE participant_id = ?')
    .bind(body.participant_id).first();
  if (existing) {
    return c.json({ success: false, error: 'KYC record already exists for this participant' }, 409);
  }

  const riskLevel = (body.risk_level ?? 'standard') as RiskLevel;
  const now       = new Date();
  const nowIso    = now.toISOString();
  const id        = `kyc_${crypto.randomUUID()}`;
  const slaDays   = deriveKycSla(riskLevel);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000).toISOString().slice(0, 10);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_kyc_verifications
         (id, participant_id, entity_type, risk_level, chain_status,
          sla_deadline, sla_breached, regulator_notified, actor_id, created_at, updated_at)
       VALUES (?,?,?,?,'pending_submission',?,0,0,?,?,?)`,
    )
    .bind(id, body.participant_id, body.entity_type ?? 'company', riskLevel,
          slaDeadline, user.id, nowIso, nowIso)
    .run();

  await fireCascade({
    event: 'kyc_evt_created' as EventType,
    actor_id: user.id,
    entity_type: 'kyc_verification',
    entity_id: id,
    data: { participant_id: body.participant_id, risk_level: riskLevel, sla_deadline: slaDeadline },
    env: c.env,
  });

  return c.json({ success: true, data: { id, risk_level: riskLevel, sla_deadline: slaDeadline } }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const body = await c.req.json<{
    action: KycAction;
    reason?: string | null;
    pep_match?: boolean;
    sanctions_match?: boolean;
    adverse_media_match?: boolean;
    conditions_text?: string | null;
    edd_report_ref?: string | null;
  }>();

  if (!body.action) return c.json({ success: false, error: 'action is required' }, 400);

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_kyc_verifications WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  // Participants may only submit_documents on their own record
  const isParticipantSelf = row.participant_id === user.id;
  if (body.action === 'submit_documents' && isParticipantSelf) {
    // allowed
  } else if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current    = row.chain_status as KycStatus;
  const action     = body.action as KycAction;
  const riskLevel  = row.risk_level as RiskLevel;

  if (KYC_HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 400);
  }

  const rule = KYC_VALID_TRANSITIONS[action];
  if (!rule) return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  if (!rule.from.includes(current)) {
    return c.json({ success: false, error: `Cannot apply '${action}' from '${current}'` }, 400);
  }

  const nextStatus = KYC_STATE_TRANSITIONS[action];
  const now        = new Date();
  const nowIso     = now.toISOString();
  const reportable = kycCrossesIntoRegulator(action, riskLevel);

  const slaDeadline     = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached       = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached       = 1;
    regulatorNotified = 1;
  }

  const verifiedAt = (nextStatus === 'verified') ? nowIso : (row.verified_at as string | null);

  await c.env.DB
    .prepare(
      `UPDATE oe_kyc_verifications
       SET chain_status = ?, reason = ?, actor_id = ?,
           sla_breached = ?, regulator_notified = ?,
           pep_match = COALESCE(?, pep_match),
           sanctions_match = COALESCE(?, sanctions_match),
           adverse_media_match = COALESCE(?, adverse_media_match),
           conditions_text = COALESCE(?, conditions_text),
           edd_report_ref = COALESCE(?, edd_report_ref),
           verified_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus, body.reason ?? null, user.id,
      slaBreached, regulatorNotified,
      body.pep_match != null ? (body.pep_match ? 1 : 0) : null,
      body.sanctions_match != null ? (body.sanctions_match ? 1 : 0) : null,
      body.adverse_media_match != null ? (body.adverse_media_match ? 1 : 0) : null,
      body.conditions_text ?? null,
      body.edd_report_ref ?? null,
      verifiedAt,
      nowIso,
      id,
    )
    .run();

  if (reportable) {
    await c.env.DB
      .prepare(
        `INSERT INTO regulator_inbox
           (id, category, priority, subject, body, source_table, source_id,
            source_event, participant_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        `kyc_reg_${id}_${action}_${Date.now()}`,
        'kyc_verification',
        (action === 'reject' || action === 'suspend') ? 'high' : 'medium',
        `KYC — ${action.replace(/_/g, ' ')} — ${riskLevel}`,
        `KYC verification ${id} (${riskLevel}) reached '${nextStatus}' via '${action}'.`,
        'oe_kyc_verifications', id, `kyc_evt_${action}`,
        row.participant_id as string, nowIso,
      )
      .run();
  }

  await fireCascade({
    event: `kyc_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'kyc_verification',
    entity_id: id,
    data: {
      action, from_status: current, to_status: nextStatus,
      risk_level: riskLevel, reason: body.reason ?? null,
      regulator_notified: reportable, crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, status: nextStatus, regulator_notified: regulatorNotified === 1 } });
});

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await kycSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const kycRoutes = router;
export default router;
