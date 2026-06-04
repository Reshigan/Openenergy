// ═══════════════════════════════════════════════════════════════════════════
// Wave 177 — IPP Independent Engineer Annual Performance Review (IEAR)
//
// REIPPPP Finance Documents and Equator Principles require an annual
// Independent Engineer (IE) review of the project's technical performance,
// financial model accuracy, O&M contract compliance, and grid code adherence.
// The IE provides an independent assessment to both the IPP and lenders.
// Material findings trigger a remediation plan; serious findings escalate
// directly to lender action and regulatory notification under NERSA s.34.
//
// Mounted at /api/ipp-ie-annual-reviews.
// INVERTED SLA: larger projects require more comprehensive IE review scope,
// warranting longer review windows.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveIearProjectTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-iear-spec';
import type { IearStatus, IearAction, IearProjectTier } from '../utils/ipp-iear-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippIeAnnualReviewSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, project_tier FROM oe_ipp_ie_annual_reviews
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; project_tier: IearProjectTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_ie_annual_reviews SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_iear.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_iear',
      entity_id: row.id,
      data: {
        project_tier: row.project_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.project_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.project_tier),
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
    project_tier,
    review_year,
    focus_area,
    finding_severity,
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
  if (chain_status)    { clauses.push('chain_status = ?');    binds.push(chain_status); }
  if (project_tier)    { clauses.push('project_tier = ?');    binds.push(project_tier); }
  if (review_year)     { clauses.push('review_year = ?');     binds.push(parseInt(review_year)); }
  if (focus_area)      { clauses.push('focus_area = ?');      binds.push(focus_area); }
  if (finding_severity){ clauses.push('finding_severity = ?');binds.push(finding_severity); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_ie_annual_reviews ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_ie_annual_reviews ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'review_closed' THEN 1 ELSE 0 END) as closed_count,
           SUM(CASE WHEN chain_status = 'remediation_required' THEN 1 ELSE 0 END) as remediation_count,
           SUM(CASE WHEN chain_status = 'escalated_to_lenders' THEN 1 ELSE 0 END) as escalated_count
         FROM oe_ipp_ie_annual_reviews ${where}`,
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

// ─── POST / — create a new IEAR record ───────────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    review_year: number;
    project_mw: number;
    ie_firm?: string | null;
    focus_area?: string | null;
    notes?: string | null;
  }>();

  if (
    !body.project_ref ||
    body.review_year == null ||
    body.project_mw == null
  ) {
    return c.json(
      {
        success: false,
        error: 'project_ref, review_year, project_mw are required',
      },
      400,
    );
  }

  const tier = deriveIearProjectTier(body.project_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  const focusArea = body.focus_area ?? 'comprehensive';

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_ie_annual_reviews
         (id, project_ref, review_year, project_mw, project_tier,
          ie_firm, focus_area, finding_severity,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,NULL,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.review_year,
      body.project_mw,
      tier,
      body.ie_firm ?? null,
      focusArea,
      'review_triggered',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_iear.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_iear',
    entity_id: id,
    data: {
      project_tier: tier,
      project_ref: body.project_ref,
      review_year: body.review_year,
      project_mw: body.project_mw,
      ie_firm: body.ie_firm ?? null,
      focus_area: focusArea,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, project_tier: tier } }, 201);
});

// ─── GET /:id — single row + is_reportable + audit trail ─────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_ie_annual_reviews WHERE id = ?')
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
       WHERE entity_type = 'ipp_iear' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as IearAction,
        row.project_tier as IearProjectTier,
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
    action: IearAction;
    finding_severity?: string | null;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_ie_annual_reviews WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as IearStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const action = body.action as IearAction;
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

  const tier = row.project_tier as IearProjectTier;
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

  // For issue_draft_report / issue_report / require_remediation, capture finding_severity if provided
  const findingSeverity =
    (action === 'issue_draft_report' ||
     action === 'issue_report' ||
     action === 'require_remediation' ||
     action === 'escalate_to_lenders')
      ? (body.finding_severity ?? null)
      : null;

  const updateSql = findingSeverity !== null
    ? `UPDATE oe_ipp_ie_annual_reviews
       SET chain_status = ?, sla_due_date = ?, finding_severity = ?, reason = ?, notes = ?,
           is_reportable = ?, updated_at = ?
       WHERE id = ?`
    : `UPDATE oe_ipp_ie_annual_reviews
       SET chain_status = ?, sla_due_date = ?, reason = ?, notes = ?,
           is_reportable = ?, updated_at = ?
       WHERE id = ?`;

  if (findingSeverity !== null) {
    await c.env.DB
      .prepare(updateSql)
      .bind(nextSt, slaDueDate, findingSeverity, body.reason ?? null, body.notes ?? null, reportable ? 1 : 0, nowIso, id)
      .run();
  } else {
    await c.env.DB
      .prepare(updateSql)
      .bind(nextSt, slaDueDate, body.reason ?? null, body.notes ?? null, reportable ? 1 : 0, nowIso, id)
      .run();
  }

  await fireCascade({
    event: `iear_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_iear',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      project_tier: tier,
      project_mw: row.project_mw,
      project_ref: row.project_ref,
      review_year: row.review_year,
      ie_firm: row.ie_firm ?? null,
      focus_area: row.focus_area ?? null,
      finding_severity: findingSeverity ?? row.finding_severity ?? null,
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
