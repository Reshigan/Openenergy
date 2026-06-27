// ═══════════════════════════════════════════════════════════════════════════════
// W226 — REC Device Registration & Issuance: Issuance Request Lifecycle
// I-REC Standard (GCC) + zaRECs/RECSA (EECS-aligned SA domestic)
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  RecIssuanceStatus, RecIssuanceAction, RecIssuanceTier,
  deriveRecIssuanceSla, REC_ISSUANCE_HARD_TERMINALS,
  REC_ISSUANCE_VALID_TRANSITIONS, REC_ISSUANCE_STATE_TRANSITIONS,
  recIssuanceCrossesIntoRegulator, recIssuanceSlaBreachCrossesIntoRegulator,
} from '../utils/rec-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function recIssuanceSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_rec_issuance_requests
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('issued','rejected','cancelled')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_rec_issuance_requests SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (recIssuanceSlaBreachCrossesIntoRegulator(row.rec_issuance_tier as RecIssuanceTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'rec_issuance', row.id,
          'rec_issuance_sla_breach',
          `REC issuance SLA breached — ${row.rec_issuance_tier} — device ${(row.device_id as string) ?? '?'} — ${(row.net_mwh as number) ?? 0} MWh`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'rec_issuance_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'rec_issuance', entity_id: row.id as string,
      data: { rec_issuance_tier: row.rec_issuance_tier, device_id: row.device_id, net_mwh: row.net_mwh },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_issuance_requests WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    draft: all.filter(r => r.chain_status === 'draft').length,
    in_progress: all.filter(r => !['issued', 'rejected', 'cancelled'].includes(r.chain_status as string) && r.chain_status !== 'draft').length,
    issued: all.filter(r => r.chain_status === 'issued').length,
    rejected: all.filter(r => r.chain_status === 'rejected').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_issuance_requests WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'rec_issuance' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    rec_issuance_tier: RecIssuanceTier;
    device_id: string;
    net_mwh: number;
    period_start?: string;
    period_end?: string;
    reason?: string;
  }>();

  if (!body.rec_issuance_tier) return c.json({ success: false, error: 'rec_issuance_tier is required' }, 400);
  if (!body.device_id) return c.json({ success: false, error: 'device_id is required' }, 400);
  if (body.net_mwh == null) return c.json({ success: false, error: 'net_mwh is required' }, 400);

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.rec_issuance_tier;
  const certificatesRequested = Math.floor(body.net_mwh);

  const now = new Date().toISOString();
  const slaDays = deriveRecIssuanceSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_rec_issuance_requests
      (id, participant_id, rec_issuance_tier, device_id, net_mwh, certificates_requested,
       period_start, period_end,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,'draft',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier,
      body.device_id, body.net_mwh, certificatesRequested,
      body.period_start ?? null, body.period_end ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'rec_issuance_created' as EventType,
    actor_id: user.id, entity_type: 'rec_issuance', entity_id: id,
    data: { rec_issuance_tier: tier, device_id: body.device_id, net_mwh: body.net_mwh, certificates_requested: certificatesRequested },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_issuance_requests WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: RecIssuanceAction;
    reason?: string;
    registry_submission_ref?: string;
    issuer_invoice_ref?: string;
    fee_zar?: number;
    issued_certificate_ids?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_issuance_requests WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as RecIssuanceStatus;
  if (REC_ISSUANCE_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `REC issuance request in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = REC_ISSUANCE_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, REC_ISSUANCE_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_rec_issuance_requests SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'submit_to_issuer') { extra.push('submitted_to_issuer_at = ?'); eb.push(now); }
  if (action === 'await_payment') {
    extra.push('payment_pending_at = ?');
    eb.push(now);
    if (body.registry_submission_ref != null) { extra.push('registry_submission_ref = ?'); eb.push(body.registry_submission_ref); }
    if (body.fee_zar != null) { extra.push('fee_zar = ?'); eb.push(body.fee_zar); }
  }
  if (action === 'confirm_payment') {
    extra.push('payment_confirmed_at = ?');
    eb.push(now);
    if (body.issuer_invoice_ref != null) { extra.push('issuer_invoice_ref = ?'); eb.push(body.issuer_invoice_ref); }
  }
  if (action === 'commence_processing') { extra.push('processing_commenced_at = ?'); eb.push(now); }
  if (action === 'issue_certificates') {
    extra.push('issued_at = ?');
    eb.push(now);
    if (body.issued_certificate_ids != null) { extra.push('issued_certificate_ids = ?'); eb.push(body.issued_certificate_ids); }
  }
  if (action === 'reject') { extra.push('rejected_at = ?'); eb.push(now); }
  if (action === 'cancel') { extra.push('cancelled_at = ?'); eb.push(now); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_rec_issuance_requests SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (recIssuanceCrossesIntoRegulator(action, row.rec_issuance_tier as RecIssuanceTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'rec_issuance', id,
        `rec_issuance_${action}`,
        `REC issuance ${action.replace(/_/g, ' ')} — ${row.rec_issuance_tier} — device ${(row.device_id as string) ?? '?'} — ${(row.net_mwh as number) ?? 0} MWh`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_rec_issuance_requests SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `rec_issuance_${action}` as EventType,
    actor_id: user.id, entity_type: 'rec_issuance', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, rec_issuance_tier: row.rec_issuance_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_rec_issuance_requests WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await recIssuanceSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
