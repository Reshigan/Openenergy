// ═══════════════════════════════════════════════════════════════════════════
// Wave 196 — Grid Protection Relay & Anti-Islanding Compliance Test
//
// NRS 097-2-3 + NERSA Grid Code Chapter 3 + SANS 1012 + IEC 60255
//
// Mounted at /api/protection-relay-chain.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  ProtectionRelayTestStatus,
  ProtectionRelayTestAction,
  ProtectionClass,
  deriveRelaySla,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  failedFinalCrossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/protection-relay-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'support', 'ipp_developer', 'grid_operator'];

// ─── SLA sweep (exported — called by cron) ───────────────────────────────────

export async function protectionRelaySlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, protection_class FROM oe_protection_relay_tests
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; protection_class: ProtectionClass }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = slaBreachCrossesIntoRegulator(row.protection_class);

    await env.DB
      .prepare(
        `UPDATE oe_protection_relay_tests
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
             (id, category, priority, subject, body,
              source_table, source_id, source_event,
              participant_id, created_at)
           VALUES (?, 'protection_relay', 'high',
             'SLA breach: Protection relay test overdue',
             'Protection relay test ' || ? || ' (class: ' || ? || ') has exceeded its SLA window. Immediate attention required.',
             'oe_protection_relay_tests', ?, 'prt_evt_sla_breached',
             'system', ?)`,
        )
        .bind(
          `reg_prt_sla_${row.id}_${Date.now()}`,
          row.id,
          row.protection_class,
          row.id,
          now,
        )
        .run();
    }

    await fireCascade({
      event: 'prt_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'prt_test',
      entity_id: row.id,
      data: {
        protection_class: row.protection_class,
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
  const {
    status,
    protection_class,
    site_id,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (status)           { clauses.push('chain_status = ?');     binds.push(status); }
  if (protection_class) { clauses.push('protection_class = ?'); binds.push(protection_class); }
  if (site_id)          { clauses.push('site_id = ?');          binds.push(site_id); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const now = new Date().toISOString();

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_protection_relay_tests ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_protection_relay_tests ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           SUM(CASE WHEN chain_status NOT IN ('certified_pass','failed_final')
                    AND sla_deadline IS NOT NULL
                    AND sla_deadline >= ? THEN 1 ELSE 0 END)  AS tests_due,
           SUM(CASE WHEN chain_status = 'certified_pass' THEN 1 ELSE 0 END) AS pass_count,
           COUNT(*) AS total_completed,
           SUM(CASE WHEN chain_status = 'test_failed'
                    OR chain_status = 'failed_final' THEN 1 ELSE 0 END)     AS failed_count,
           SUM(CASE WHEN chain_status = 'certified_pass'
                    AND next_test_due IS NOT NULL
                    AND next_test_due <= date(?, '+30 days') THEN 1 ELSE 0 END) AS certs_expiring_soon
         FROM oe_protection_relay_tests`,
      )
      .bind(now, now)
      .first<Record<string, unknown>>(),
  ]);

  const total     = totalRow?.n ?? 0;
  const passCount = Number((kpis as Record<string, unknown>)?.pass_count ?? 0);
  const totalComp = Number((kpis as Record<string, unknown>)?.total_completed ?? 0);
  const passRate  = totalComp > 0 ? Math.round((passCount / totalComp) * 100) : 0;

  const kpisOut = {
    tests_due:           Number((kpis as Record<string, unknown>)?.tests_due ?? 0),
    pass_rate_pct:       passRate,
    failed_count:        Number((kpis as Record<string, unknown>)?.failed_count ?? 0),
    certs_expiring_soon: Number((kpis as Record<string, unknown>)?.certs_expiring_soon ?? 0),
  };

  return c.json({
    success: true,
    data: rows.results ?? [],
    kpis: kpisOut,
    pagination: {
      page: pageNum,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage),
    },
  });
});

// ─── GET /:id — single record + timeline ────────────────────────────────────

router.get('/:id', async (c) => {
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_protection_relay_tests WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const timeline = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'prt_test' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, timeline: timeline.results ?? [] },
  });
});

// ─── POST / — create a new test record ───────────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    site_id: string;
    device_sn: string;
    relay_type: string;
    test_standard: string;
    protection_class: ProtectionClass;
    test_engineer_id?: string;
    grid_witness_id?: string;
  }>();

  if (
    !body.site_id ||
    !body.device_sn ||
    !body.relay_type ||
    !body.test_standard ||
    !body.protection_class
  ) {
    return c.json(
      {
        success: false,
        error: 'site_id, device_sn, relay_type, test_standard, and protection_class are required',
      },
      400,
    );
  }

  const validClasses: ProtectionClass[] = [
    'safety_critical', 'transmission', 'distribution', 'embedded', 'routine',
  ];
  if (!validClasses.includes(body.protection_class)) {
    return c.json(
      {
        success: false,
        error: `protection_class must be one of: ${validClasses.join(', ')}`,
      },
      400,
    );
  }

  const now        = new Date();
  const nowIso     = now.toISOString();
  const id         = `prt_test_${crypto.randomUUID()}`;
  const slaDays    = deriveRelaySla(body.protection_class);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_protection_relay_tests
         (id, chain_status, site_id, device_sn, relay_type, test_standard,
          protection_class, test_engineer_id, grid_witness_id,
          pass_criteria_met, certificate_number, next_test_due,
          sla_deadline, sla_breached, regulator_notified,
          actor_id, reason, created_at, updated_at)
       VALUES (?, 'test_scheduled', ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL,
               ?, 0, 0, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      body.site_id,
      body.device_sn,
      body.relay_type,
      body.test_standard,
      body.protection_class,
      body.test_engineer_id ?? null,
      body.grid_witness_id ?? null,
      slaDeadline,
      user.id,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'prt_evt_created' as EventType,
    actor_id: user.id,
    entity_type: 'prt_test',
    entity_id: id,
    data: {
      site_id: body.site_id,
      device_sn: body.device_sn,
      protection_class: body.protection_class,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json(
    {
      success: true,
      data: { id, protection_class: body.protection_class, sla_deadline: slaDeadline },
    },
    201,
  );
});

// ─── POST /:id/action — state machine transition ──────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: ProtectionRelayTestAction;
    reason?: string | null;
    actor_id?: string | null;
    // Extra fields settable on specific actions
    pass_criteria_met?: number;
    certificate_number?: string;
    next_test_due?: string;
    test_engineer_id?: string;
    grid_witness_id?: string;
  }>();

  if (!body.action) {
    return c.json({ success: false, error: 'action is required' }, 400);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_protection_relay_tests WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const current = row.chain_status as ProtectionRelayTestStatus;

  if (HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status '${current}' is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const action = body.action as ProtectionRelayTestAction;
  const rule   = VALID_TRANSITIONS[action];

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

  const protectionClass = row.protection_class as ProtectionClass;
  const now     = new Date();
  const nowIso  = now.toISOString();

  // Determine next status — record_failure from rectification_complete context
  // leads to failed_final (terminal), otherwise test_failed
  let nextStatus: ProtectionRelayTestStatus = STATE_TRANSITIONS[action];
  if (
    action === 'record_failure' &&
    (current === 'rectification_complete' || current === 'retest_scheduled')
  ) {
    nextStatus = 'failed_final';
  }

  const isFailedFinal = nextStatus === 'failed_final';
  const reportable    = isFailedFinal
    ? failedFinalCrossesIntoRegulator(protectionClass)
    : crossesIntoRegulator(action, protectionClass);

  // SLA breach detection
  const slaDeadline     = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached       = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached = 1;
    if (slaBreachCrossesIntoRegulator(protectionClass)) {
      regulatorNotified = 1;
    }
  }

  // Build update for extra fields on specific actions
  const extraUpdates: string[] = [];
  const extraBinds: unknown[]  = [];

  if (action === 'certify_pass') {
    if (body.pass_criteria_met !== undefined) {
      extraUpdates.push('pass_criteria_met = ?');
      extraBinds.push(body.pass_criteria_met);
    }
    if (body.certificate_number) {
      extraUpdates.push('certificate_number = ?');
      extraBinds.push(body.certificate_number);
    }
    if (body.next_test_due) {
      extraUpdates.push('next_test_due = ?');
      extraBinds.push(body.next_test_due);
    }
  }

  if (body.test_engineer_id) {
    extraUpdates.push('test_engineer_id = ?');
    extraBinds.push(body.test_engineer_id);
  }
  if (body.grid_witness_id) {
    extraUpdates.push('grid_witness_id = ?');
    extraBinds.push(body.grid_witness_id);
  }

  const setClause = [
    'chain_status = ?',
    'reason = ?',
    'actor_id = ?',
    'sla_breached = ?',
    'regulator_notified = ?',
    'updated_at = ?',
    ...extraUpdates,
  ].join(', ');

  await c.env.DB
    .prepare(`UPDATE oe_protection_relay_tests SET ${setClause} WHERE id = ?`)
    .bind(
      nextStatus,
      body.reason ?? null,
      body.actor_id ?? user.id,
      slaBreached,
      regulatorNotified,
      nowIso,
      ...extraBinds,
      id,
    )
    .run();

  // Insert into regulator_inbox when crossing
  if (reportable) {
    const subject = isFailedFinal
      ? `MANDATORY: Protection relay failed_final — safety disconnect required [${row.device_sn as string}]`
      : `Protection relay test failure [${row.device_sn as string}] — ${protectionClass}`;

    const body_text = isFailedFinal
      ? `Protection relay test ${id} on device ${row.device_sn as string} (site: ${row.site_id as string}) has reached FAILED_FINAL status. ` +
        `NRS 097-2-3 requires mandatory safety disconnect. Protection class: ${protectionClass}.`
      : `Protection relay test ${id} on device ${row.device_sn as string} (site: ${row.site_id as string}) has recorded a test failure. ` +
        `Protection class: ${protectionClass}. Immediate rectification required.`;

    await c.env.DB
      .prepare(
        `INSERT INTO regulator_inbox
           (id, category, priority, subject, body,
            source_table, source_id, source_event,
            participant_id, created_at)
         VALUES (?, 'protection_relay', ?,
           ?, ?,
           'oe_protection_relay_tests', ?, ?,
           ?, ?)`,
      )
      .bind(
        `reg_prt_${id}_${Date.now()}`,
        isFailedFinal ? 'critical' : 'high',
        subject,
        body_text,
        id,
        `prt_evt_${action}`,
        body.actor_id ?? user.id,
        nowIso,
      )
      .run();
  }

  await fireCascade({
    event: `prt_evt_${action}` as EventType,
    actor_id: body.actor_id ?? user.id,
    entity_type: 'prt_test',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus,
      reason: body.reason ?? null,
      protection_class: protectionClass,
      site_id: row.site_id,
      device_sn: row.device_sn,
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

  const result = await protectionRelaySlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const protectionRelayRoutes = router;
export default router;
