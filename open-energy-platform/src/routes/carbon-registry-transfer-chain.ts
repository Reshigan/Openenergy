// ═══════════════════════════════════════════════════════════════════════════════
// W206 — Carbon Registry Transfer & International Registry Notification
// UNFCCC Art 6.2 + Verra VCUS + Gold Standard + CORSIA
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  CrtStatus, CrtAction, TransferType,
  deriveCrtSla, CRT_HARD_TERMINALS,
  CRT_VALID_TRANSITIONS, CRT_STATE_TRANSITIONS,
  crtCrossesIntoRegulator, crtSlaBreachCrossesIntoRegulator,
} from '../utils/carbon-registry-transfer-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'carbon_fund', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function crtSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_carbon_registry_transfers
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('ca_notified','completed','aml_rejected','registry_rejected','cancelled')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_carbon_registry_transfers SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (crtSlaBreachCrossesIntoRegulator(row.transfer_type as TransferType)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'carbon_registry_transfer', row.id,
          'crt_sla_breach',
          `Carbon registry transfer SLA breached — ${row.quantity_tco2e} tCO2e — ${row.transfer_type}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'crt_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'carbon_registry_transfer', entity_id: row.id as string,
      data: { transfer_type: row.transfer_type, quantity_tco2e: row.quantity_tco2e },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support', 'regulator'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_registry_transfers WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    completed: all.filter(r => ['completed', 'ca_notified'].includes(r.chain_status as string)).length,
    pending: all.filter(r => !CRT_HARD_TERMINALS.has(r.chain_status as CrtStatus)).length,
    rejected: all.filter(r => ['aml_rejected', 'registry_rejected'].includes(r.chain_status as string)).length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_registry_transfers WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support', 'regulator'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'carbon_registry_transfer' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    counterparty_id?: string;
    transfer_type?: TransferType;
    quantity_tco2e: number;
    vintage_year?: number;
    project_id?: string;
    methodology?: string;
    source_registry?: string;
    destination_registry?: string;
    source_account?: string;
    destination_account?: string;
    serial_range_start?: string;
    serial_range_end?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const transferType = body.transfer_type ?? 'domestic';

  const now = new Date().toISOString();
  const slaDeadline = new Date(Date.now() + deriveCrtSla(transferType) * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_carbon_registry_transfers
      (id, participant_id, counterparty_id, transfer_type, quantity_tco2e,
       vintage_year, project_id, methodology,
       source_registry, destination_registry, source_account, destination_account,
       serial_range_start, serial_range_end,
       ca_required, chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'transfer_requested',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.counterparty_id ?? null, transferType,
      body.quantity_tco2e,
      body.vintage_year ?? null, body.project_id ?? null, body.methodology ?? null,
      body.source_registry ?? null, body.destination_registry ?? null,
      body.source_account ?? null, body.destination_account ?? null,
      body.serial_range_start ?? null, body.serial_range_end ?? null,
      transferType === 'international_art6' || transferType === 'corsia' ? 1 : 0,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'crt_transfer_requested' as EventType,
    actor_id: user.id, entity_type: 'carbon_registry_transfer', entity_id: id,
    data: { transfer_type: transferType, quantity_tco2e: body.quantity_tco2e },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_registry_transfers WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: CrtAction;
    reason?: string;
    aml_check_ref?: string;
    aml_rejection_reason?: string;
    registry_auth_ref?: string;
    registry_rejection_reason?: string;
    transfer_certificate_ref?: string;
    unfccc_notification_ref?: string;
    dna_notification_ref?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_registry_transfers WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as CrtStatus;
  if (CRT_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Transfer in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = CRT_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, CRT_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_carbon_registry_transfers SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.aml_check_ref) { extra.push('aml_check_ref = ?'); eb.push(body.aml_check_ref); }
  if (action === 'pass_aml_kyc') { extra.push('aml_check_passed_at = ?'); eb.push(now); }
  if (body.aml_rejection_reason) { extra.push('aml_rejection_reason = ?'); eb.push(body.aml_rejection_reason); }
  if (body.registry_auth_ref) { extra.push('registry_auth_ref = ?'); eb.push(body.registry_auth_ref); }
  if (action === 'authorize') { extra.push('authorized_at = ?'); eb.push(now); }
  if (body.registry_rejection_reason) { extra.push('registry_rejection_reason = ?'); eb.push(body.registry_rejection_reason); }
  if (action === 'initiate_transfer') { extra.push('transfer_initiated_at = ?'); eb.push(now); }
  if (action === 'confirm_receipt') { extra.push('receipt_confirmed_at = ?'); eb.push(now); }
  if (body.transfer_certificate_ref) { extra.push('transfer_certificate_ref = ?'); eb.push(body.transfer_certificate_ref); }
  if (action === 'flag_ca_required') { extra.push('ca_required = ?'); eb.push(1); }
  if (body.unfccc_notification_ref) { extra.push('unfccc_notification_ref = ?'); eb.push(body.unfccc_notification_ref); }
  if (body.dna_notification_ref) { extra.push('dna_notification_ref = ?'); eb.push(body.dna_notification_ref); }
  if (action === 'notify_ca') { extra.push('ca_notified_at = ?'); eb.push(now); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_carbon_registry_transfers SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (crtCrossesIntoRegulator(action, row.transfer_type as TransferType)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'carbon_registry_transfer', id,
        `crt_${action}`,
        `Carbon registry transfer ${action} — ${row.quantity_tco2e} tCO2e — ${row.transfer_type}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_carbon_registry_transfers SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `crt_${action}` as EventType,
    actor_id: user.id, entity_type: 'carbon_registry_transfer', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, transfer_type: row.transfer_type },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_registry_transfers WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await crtSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
