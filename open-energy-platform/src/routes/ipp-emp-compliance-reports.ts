// ═══════════════════════════════════════════════════════════════════════════
// Wave 190 — IPP Environmental Management Plan (EMP) Annual Compliance Report
//
// Mounted at /api/ipp-emp-compliance-reports.
// INVERTED SLA: larger plant capacity = more complex EMP obligations, more
// stakeholder consultations, more monitoring points = more time granted by
// competent authorities. Flagship plants (>200 MW) receive 120 days from
// report period open date.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  EmpReportStatus,
  EmpReportAction,
  EmpCapacityTier,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  SLA_DAYS,
  deriveEmpCapacityTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-emp-compliance-report-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep (exported — called by cron) ───────────────────────────────────

export async function ippEmpComplianceReportSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, tier FROM oe_emp_compliance_reports
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; tier: EmpCapacityTier }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = slaBreachCrossesIntoRegulator(row.tier);

    await env.DB
      .prepare(
        `UPDATE oe_emp_compliance_reports
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    await fireCascade({
      event: 'empr_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_empr',
      entity_id: row.id,
      data: {
        tier: row.tier,
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
    tier,
    sla_breached,
    participant_id,
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
    if (participant_id) {
      clauses.push('ipp_id = ?');
      binds.push(participant_id);
    }
  } else {
    clauses.push('ipp_id = ?');
    binds.push(user.id);
  }

  if (status)      { clauses.push('chain_status = ?'); binds.push(status); }
  if (tier)        { clauses.push('tier = ?');          binds.push(tier); }
  if (sla_breached !== undefined && sla_breached !== '') {
    clauses.push('sla_breached = ?');
    binds.push(sla_breached === '1' || sla_breached === 'true' ? 1 : 0);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_emp_compliance_reports ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_emp_compliance_reports ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'report_accepted' THEN 1 ELSE 0 END) as accepted_count,
           SUM(CASE WHEN chain_status = 'report_rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'report_lapsed'   THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_emp_compliance_reports ${where}`,
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

// ─── POST / — create a new EMP compliance report ─────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    ipp_id: string;
    project_name: string;
    plant_mw: number;
    annual_revenue_zar: number;
    report_year: number;
    eco_name?: string | null;
  }>();

  if (!body.ipp_id || !body.project_name || body.plant_mw == null || body.annual_revenue_zar == null || body.report_year == null) {
    return c.json(
      {
        success: false,
        error: 'ipp_id, project_name, plant_mw, annual_revenue_zar and report_year are required',
      },
      400,
    );
  }

  const tier = deriveEmpCapacityTier(body.plant_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_empr_${crypto.randomUUID()}`;

  const slaDays = SLA_DAYS[tier];
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_emp_compliance_reports
         (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
          report_year, eco_name,
          incident_count, mitigation_status,
          chain_status, tier,
          sla_deadline, sla_breached, regulator_notified,
          actor_id,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,0,'on_track','report_period_opened',?,?,0,0,?,?,?)`,
    )
    .bind(
      id,
      body.ipp_id,
      body.project_name,
      body.plant_mw,
      body.annual_revenue_zar,
      body.report_year,
      body.eco_name ?? null,
      tier,
      slaDeadline,
      user.id,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'empr_evt_opened' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_empr',
    entity_id: id,
    data: {
      project_name: body.project_name,
      tier,
      sla_deadline: slaDeadline,
      plant_mw: body.plant_mw,
      report_year: body.report_year,
    },
    env: c.env,
  });

  return c.json(
    { success: true, data: { id, tier, sla_deadline: slaDeadline } },
    201,
  );
});

// ─── GET /:id — single record + audit trail ──────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_emp_compliance_reports WHERE id = ?')
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
       WHERE entity_type = 'ipp_empr' AND entity_id = ?
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
    action: EmpReportAction;
    reason?: string | null;
    incident_count?: number | null;
    eco_name?: string | null;
    mitigation_status?: string | null;
  }>();

  if (!body.action) {
    return c.json({ success: false, error: 'action is required' }, 400);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_emp_compliance_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.ipp_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as EmpReportStatus;

  if (HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status '${current}' is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const action = body.action as EmpReportAction;

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
  const tier = row.tier as EmpCapacityTier;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, tier);

  // Carry-forward mutable fields if new values not supplied
  const newIncidentCount    = body.incident_count    ?? (row.incident_count as number)    ?? 0;
  const newEcoName          = body.eco_name          ?? (row.eco_name as string | null)   ?? null;
  const newMitigationStatus = body.mitigation_status ?? (row.mitigation_status as string) ?? 'on_track';

  // SLA breach detection
  const slaDeadline   = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached = 1;
    if (slaBreachCrossesIntoRegulator(tier)) {
      regulatorNotified = 1;
    }
  }

  await c.env.DB
    .prepare(
      `UPDATE oe_emp_compliance_reports
       SET chain_status = ?,
           incident_count = ?,
           eco_name = ?,
           mitigation_status = ?,
           reason = ?,
           actor_id = ?,
           sla_breached = ?,
           regulator_notified = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus,
      newIncidentCount,
      newEcoName,
      newMitigationStatus,
      body.reason ?? null,
      user.id,
      slaBreached,
      regulatorNotified,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `empr_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_empr',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus,
      reason: body.reason ?? null,
      tier,
      plant_mw: row.plant_mw,
      project_name: row.project_name,
      report_year: row.report_year,
      incident_count: newIncidentCount,
      mitigation_status: newMitigationStatus,
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

  const result = await ippEmpComplianceReportSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const ippEmpComplianceReportRoutes = router;
export default router;
