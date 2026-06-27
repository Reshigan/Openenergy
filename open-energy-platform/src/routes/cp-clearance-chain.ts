// ═══════════════════════════════════════════════════════════════════════════════
// W223 — Lender Financial Close: Conditions Precedent (CP) Clearance
// LMA + SARB / Basel III project finance closing conditions
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  CpStatus, CpAction, CpTier,
  deriveCpSla, CP_HARD_TERMINALS,
  CP_VALID_TRANSITIONS, CP_STATE_TRANSITIONS,
  cpCrossesIntoRegulator, cpSlaBreachCrossesIntoRegulator,
} from '../utils/cp-clearance-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'lender', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function cpSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_cp_clearances
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('drawdown_authorized','cp_defaulted','withdrawn','expired')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_cp_clearances SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (cpSlaBreachCrossesIntoRegulator(row.cp_tier as CpTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'cp_clearance', row.id,
          'cp_sla_breach',
          `CP clearance SLA breached — ${row.cp_tier} — ${(row.borrower_name as string) ?? (row.id as string).slice(0, 8)} — facility ${(row.facility_ref as string) ?? '?'}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'cp_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'cp_clearance', entity_id: row.id as string,
      data: { cp_tier: row.cp_tier, borrower_name: row.borrower_name },
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
    .prepare(`SELECT * FROM oe_cp_clearances WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    in_progress: all.filter(r => !['drawdown_authorized','cp_defaulted','withdrawn','expired'].includes(r.chain_status as string)).length,
    authorized: all.filter(r => r.chain_status === 'drawdown_authorized').length,
    defaulted: all.filter(r => r.chain_status === 'cp_defaulted').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_cp_clearances WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'cp_clearance' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    cp_tier?: CpTier;
    facility_ref?: string;
    project_ref?: string;
    borrower_name?: string;
    cp_count_total?: number;
    closing_deadline?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.cp_tier ?? 'standard';

  const now = new Date().toISOString();
  const slaDays = deriveCpSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_cp_clearances
      (id, participant_id, cp_tier, facility_ref, project_ref, borrower_name,
       cp_count_total, closing_deadline,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,'cp_register_draft',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier,
      body.facility_ref ?? null, body.project_ref ?? null, body.borrower_name ?? null,
      body.cp_count_total ?? null, body.closing_deadline ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'cp_created' as EventType,
    actor_id: user.id, entity_type: 'cp_clearance', entity_id: id,
    data: { cp_tier: tier, borrower_name: body.borrower_name },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_cp_clearances WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: CpAction;
    reason?: string;
    cp_count_satisfied?: number;
    cp_count_waived?: number;
    cp_count_failed?: number;
    cp_failed_reason?: string;
    closing_deadline?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_cp_clearances WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as CpStatus;
  if (CP_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `CP register in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = CP_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, CP_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_cp_clearances SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'submit_register') { extra.push('register_submitted_at = ?'); eb.push(now); }
  if (action === 'agree_cp_list') { extra.push('register_agreed_at = ?'); eb.push(now); }
  if (action === 'commence_satisfaction') { extra.push('satisfaction_commenced_at = ?'); eb.push(now); }
  if (action === 'submit_evidence') { extra.push('evidence_submitted_at = ?'); eb.push(now); }
  if (action === 'commence_review') { extra.push('review_commenced_at = ?'); eb.push(now); }
  if (action === 'clear_cps' || action === 'waive_cps') {
    extra.push('cps_cleared_at = ?');
    eb.push(now);
    if (body.cp_count_satisfied != null) { extra.push('cp_count_satisfied = ?'); eb.push(body.cp_count_satisfied); }
    if (body.cp_count_waived != null) { extra.push('cp_count_waived = ?'); eb.push(body.cp_count_waived); }
  }
  if (action === 'authorize_drawdown') { extra.push('drawdown_authorized_at = ?'); eb.push(now); }
  if (action === 'declare_cp_default') {
    extra.push('cp_failed_reason = ?', 'cp_failed_at = ?');
    eb.push(body.cp_failed_reason ?? null, now);
    if (body.cp_count_failed != null) { extra.push('cp_count_failed = ?'); eb.push(body.cp_count_failed); }
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_cp_clearances SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (cpCrossesIntoRegulator(action, row.cp_tier as CpTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'cp_clearance', id,
        `cp_${action}`,
        `CP clearance ${action.replace(/_/g, ' ')} — ${row.cp_tier} — ${(row.borrower_name as string) ?? (row.id as string).slice(0, 8)} — facility ${(row.facility_ref as string) ?? '?'}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_cp_clearances SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `cp_${action}` as EventType,
    actor_id: user.id, entity_type: 'cp_clearance', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, cp_tier: row.cp_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_cp_clearances WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'lender', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await cpSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
