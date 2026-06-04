// ═══════════════════════════════════════════════════════════════════════════
// Wave 174 — IPP REIPPPP Local Content & SED Quarterly Compliance
//
// REIPPPP Bid Specifications Schedule 4 (Local Content) and Schedule 5
// (Socio-Economic Development) impose quarterly reporting obligations on all
// REIPPPP projects. The IPP must demonstrate that its supply chain meets the
// committed LC percentage and SED spending targets through certified reports
// submitted to the DMRE IPP Office. Failure triggers a contractual default
// notice and potential penalty deduction from monthly energy payments.
//
// Mounted at /api/ipp-lc-reports.
//
// URGENT SLA: higher LC commitment percentage = tighter quarterly review
// window. Premium bidders (>65% local content) face maximum scrutiny and
// have the least time to resolve queries. Low-commitment projects get more
// time but still face hard quarterly submission deadlines.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveLcTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-lc-report-spec';
import type { LcStatus, LcAction, LcTier } from '../utils/ipp-lc-report-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippLcReportSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, lc_tier FROM oe_ipp_lc_reports
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; lc_tier: LcTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_lc_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'lcr_evt_flag_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_lcr',
      entity_id: row.id,
      data: {
        lc_tier: row.lc_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.lc_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.lc_tier),
      },
      env,
    });
  }
}

// ─── GET / — list all + KPIs ─────────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    project_ref,
    chain_status,
    lc_tier,
    report_quarter,
    limit = '50',
    offset = '0',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const off     = Math.max(0, parseInt(offset) || 0);

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('actor_party = ?');
    binds.push(user.id);
  } else if (project_ref) {
    clauses.push('project_ref = ?');
    binds.push(project_ref);
  }
  if (chain_status)   { clauses.push('chain_status = ?');   binds.push(chain_status); }
  if (lc_tier)        { clauses.push('lc_tier = ?');        binds.push(lc_tier); }
  if (report_quarter) { clauses.push('report_quarter = ?'); binds.push(report_quarter); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_lc_reports ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_lc_reports ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'compliant' THEN 1 ELSE 0 END) as compliant_count,
           SUM(CASE WHEN chain_status = 'non_compliant' THEN 1 ELSE 0 END) as non_compliant_count,
           SUM(CASE WHEN chain_status = 'conditional_compliance' THEN 1 ELSE 0 END) as conditional_count
         FROM oe_ipp_lc_reports ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: {
        limit: perPage,
        offset: off,
        total: totalRow?.n ?? 0,
      },
      kpis,
    },
  });
});

// ─── POST / — create a new LC report record ───────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    report_quarter: string;
    lc_commitment_pct: number;
    lc_achieved_pct?: number | null;
    sed_commitment_zar?: number | null;
    sed_achieved_zar?: number | null;
    lc_content_type?: string | null;
    notes?: string | null;
  }>();

  if (
    !body.project_ref ||
    !body.report_quarter ||
    body.lc_commitment_pct == null
  ) {
    return c.json(
      {
        success: false,
        error: 'project_ref, report_quarter, lc_commitment_pct are required',
      },
      400,
    );
  }

  const tier = deriveLcTier(body.lc_commitment_pct);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_lc_reports
         (id, project_ref, report_quarter, lc_commitment_pct, lc_tier,
          lc_achieved_pct, sed_commitment_zar, sed_achieved_zar, lc_content_type,
          chain_status, sla_due_date, sla_breached, actor_party, reason, notes,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.report_quarter,
      body.lc_commitment_pct,
      tier,
      body.lc_achieved_pct ?? null,
      body.sed_commitment_zar ?? null,
      body.sed_achieved_zar ?? null,
      body.lc_content_type ?? 'goods',
      'period_open',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_lcr.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_lcr',
    entity_id: id,
    data: {
      tier,
      project_ref: body.project_ref,
      report_quarter: body.report_quarter,
      lc_commitment_pct: body.lc_commitment_pct,
      lc_content_type: body.lc_content_type ?? 'goods',
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ─── GET /:id — single row + audit trail ─────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_lc_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'ipp_lcr' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as LcAction,
        row.lc_tier as LcTier,
      )
    : false;

  return c.json({
    success: true,
    data: { ...row, is_reportable: isReportable ? 1 : 0, audit_trail: audit.results ?? [] },
  });
});

// ─── PUT /:id/action — state machine dispatch ─────────────────────────────────

router.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: LcAction;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_lc_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as LcStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const action = body.action as LcAction;
  const nextSt = STATE_TRANSITIONS[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  const rule = VALID_TRANSITIONS[action];
  if (!rule || !rule.from.includes(current)) {
    return c.json(
      { success: false, error: `Cannot transition '${current}' → '${action}'` },
      409,
    );
  }

  const tier = row.lc_tier as LcTier;
  const now = new Date();
  const nowIso = now.toISOString();

  let slaDueDate: string | null = null;
  if (!HARD_TERMINALS.has(nextSt)) {
    const slaDays = SLA_DAYS[tier] ?? 0;
    if (slaDays > 0) {
      slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();
    }
  }

  const reportable = crossesIntoRegulator(action, tier);

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_lc_reports
       SET chain_status = ?, sla_due_date = ?, reason = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nextSt, slaDueDate, body.reason ?? null, body.notes ?? null, nowIso, id)
    .run();

  await fireCascade({
    event: `lcr_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_lcr',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      lc_tier: tier,
      lc_commitment_pct: row.lc_commitment_pct,
      project_ref: row.project_ref,
      report_quarter: row.report_quarter,
      reason: body.reason ?? null,
      notes: body.notes ?? null,
      is_reportable: reportable,
      crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: { id, status: nextSt, is_reportable: reportable },
  });
});

export default router;
