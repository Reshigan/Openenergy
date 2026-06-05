// ═══════════════════════════════════════════════════════════════════════════
// Wave 193 — IPP Licence Obligation Monitor
//
// Mounted at /api/ipp-licence-obligations.
// URGENT SLA: most critical obligation class (security_of_supply) gets the
// tightest deadline — 7 days. Administrative conditions receive 45 days.
// WRITE roles include regulator because NERSA issues notices and declares
// breaches directly on the platform record.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  LicenceObligationMonitorStatus,
  LicenceObligationMonitorAction,
  ObligationClass,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  deriveSla,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-licence-obligation-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp', 'ipp_developer', 'wind', 'regulator'];

// ─── SLA sweep (exported — called by cron) ───────────────────────────────────

export async function ippLicenceObligationSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, obligation_class FROM oe_licence_obligations
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND chain_status != 'assessed_compliant'
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; obligation_class: ObligationClass }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = slaBreachCrossesIntoRegulator(row.obligation_class);

    await env.DB
      .prepare(
        `UPDATE oe_licence_obligations
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    await fireCascade({
      event: 'lo_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'licence_obligation',
      entity_id: row.id,
      data: {
        obligation_class: row.obligation_class,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }

  return { swept: rows.length };
}

// ─── GET / — list records + KPIs ─────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    obligation_class,
    sla_breached,
    ipp_id: qIppId,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Scope to participant unless admin/support/regulator
  if (['admin', 'support', 'regulator'].includes(user.role)) {
    if (qIppId) {
      clauses.push('ipp_id = ?');
      binds.push(qIppId);
    }
  } else {
    clauses.push('ipp_id = ?');
    binds.push(user.id);
  }

  if (status)           { clauses.push('chain_status = ?');      binds.push(status); }
  if (obligation_class) { clauses.push('obligation_class = ?');  binds.push(obligation_class); }
  if (sla_breached !== undefined && sla_breached !== '') {
    clauses.push('sla_breached = ?');
    binds.push(sla_breached === '1' || sla_breached === 'true' ? 1 : 0);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_licence_obligations ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_licence_obligations ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders})
                     AND chain_status != 'assessed_compliant'
                    THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'cured'    THEN 1 ELSE 0 END) as cured_count,
           SUM(CASE WHEN chain_status = 'breached' THEN 1 ELSE 0 END) as breached_count,
           SUM(CASE WHEN chain_status = 'assessed_compliant' THEN 1 ELSE 0 END) as compliant_count
         FROM oe_licence_obligations ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  const total = totalRow?.n ?? 0;

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: {
        page: pageNum,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
      kpis,
    },
  });
});

// ─── POST / — create a new licence obligation record ─────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    ipp_id: string;
    licence_number: string;
    obligation_ref: string;
    obligation_class: ObligationClass;
    condition_description: string;
    compliance_period: string;
    project_name?: string | null;
  }>();

  if (
    !body.ipp_id ||
    !body.licence_number ||
    !body.obligation_ref ||
    !body.obligation_class ||
    !body.condition_description ||
    !body.compliance_period
  ) {
    return c.json(
      {
        success: false,
        error: 'ipp_id, licence_number, obligation_ref, obligation_class, condition_description and compliance_period are required',
      },
      400,
    );
  }

  const validClasses: ObligationClass[] = [
    'security_of_supply', 'environmental', 'financial', 'technical', 'administrative',
  ];
  if (!validClasses.includes(body.obligation_class)) {
    return c.json({ success: false, error: `Invalid obligation_class: ${body.obligation_class}` }, 400);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const id = `licence_obligation_${crypto.randomUUID()}`;

  const slaDays = deriveSla(body.obligation_class);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_licence_obligations
         (id, ipp_id, licence_number, obligation_ref, obligation_class,
          condition_description, compliance_period, project_name,
          chain_status,
          sla_deadline, sla_breached, regulator_notified,
          actor_id,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,'monitoring_active',?,0,0,?,?,?)`,
    )
    .bind(
      id,
      body.ipp_id,
      body.licence_number,
      body.obligation_ref,
      body.obligation_class,
      body.condition_description,
      body.compliance_period,
      body.project_name ?? null,
      slaDeadline,
      user.id,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'lo_evt_created' as EventType,
    actor_id: user.id,
    entity_type: 'licence_obligation',
    entity_id: id,
    data: {
      licence_number: body.licence_number,
      obligation_ref: body.obligation_ref,
      obligation_class: body.obligation_class,
      compliance_period: body.compliance_period,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json(
    {
      success: true,
      data: { id, obligation_class: body.obligation_class, sla_deadline: slaDeadline },
    },
    201,
  );
});

// ─── GET /:id — single record + audit trail ──────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_licence_obligations WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.ipp_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'licence_obligation' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 20`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST /:id/action — state machine transition ──────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: LicenceObligationMonitorAction;
    reason?: string | null;
  }>();

  if (!body.action) {
    return c.json({ success: false, error: 'action is required' }, 400);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_licence_obligations WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.ipp_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as LicenceObligationMonitorStatus;

  if (HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status '${current}' is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const action = body.action as LicenceObligationMonitorAction;

  const rule = VALID_TRANSITIONS[action];
  if (!rule) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  if (!rule.from.includes(current)) {
    return c.json(
      {
        success: false,
        error: `Cannot apply action '${action}' from status '${current}'`,
      },
      400,
    );
  }

  const nextStatus = STATE_TRANSITIONS[action];
  const obligationClass = row.obligation_class as ObligationClass;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, obligationClass);

  // SLA breach detection
  const slaDeadline    = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached      = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached = 1;
    if (slaBreachCrossesIntoRegulator(obligationClass)) {
      regulatorNotified = 1;
    }
  }

  await c.env.DB
    .prepare(
      `UPDATE oe_licence_obligations
       SET chain_status = ?,
           reason = ?,
           actor_id = ?,
           sla_breached = ?,
           regulator_notified = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus,
      body.reason ?? null,
      user.id,
      slaBreached,
      regulatorNotified,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `lo_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'licence_obligation',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus,
      reason: body.reason ?? null,
      obligation_class: obligationClass,
      licence_number: row.licence_number,
      obligation_ref: row.obligation_ref,
      compliance_period: row.compliance_period,
      regulator_notified: reportable,
      crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: {
      id,
      status: nextStatus,
      regulator_notified: regulatorNotified === 1,
    },
  });
});

// ─── POST /sla-sweep — internal cron endpoint ────────────────────────────────

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden — admin only' }, 403);
  }

  const result = await ippLicenceObligationSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const ippLicenceObligationRoutes = router;
export default router;
