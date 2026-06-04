// ═══════════════════════════════════════════════════════════════════════════
// Wave 181 — IPP REIPPPP Socio-Economic Development (SED) Annual Spend
//
// REIPPPP Bid Conditions require IPPs to spend a minimum percentage of
// revenue on Socio-Economic Development (SED) annually — typically 1–2%
// of gross revenue on education, healthcare, infrastructure, and skills
// development in host communities. This is distinct from CEP (equity
// participation, W180) — SED is cash spend on community upliftment programmes.
//
// Annual SED reports must be filed with the DMRE IPP Office and verified
// by an independent auditor appointed in terms of the PPA. Failure to
// comply or submit triggers a DMRE Default Notice. Persistent non-compliance
// is grounds for PPA termination.
//
// Mounted at /api/ipp-sed-compliance.
//
// INVERTED SLA: larger-revenue projects have larger SED obligations, more
// beneficiaries, more programmes to verify, and more complex audit trails,
// warranting additional time to complete the annual cycle.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveSedRevenueTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-sed-compliance-spec';
import type { SedStatus, SedAction, SedRevenueTier } from '../utils/ipp-sed-compliance-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippSedComplianceSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, revenue_tier FROM oe_ipp_sed_compliance
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; revenue_tier: SedRevenueTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_sed_compliance SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_sed.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_sed',
      entity_id: row.id,
      data: {
        revenue_tier: row.revenue_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.revenue_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.revenue_tier),
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
    revenue_tier,
    focus_area,
    compliance_year,
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
  if (revenue_tier)    { clauses.push('revenue_tier = ?');    binds.push(revenue_tier); }
  if (focus_area)      { clauses.push('focus_area = ?');      binds.push(focus_area); }
  if (compliance_year) { clauses.push('compliance_year = ?'); binds.push(parseInt(compliance_year)); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_sed_compliance ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_sed_compliance ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'sed_compliant' THEN 1 ELSE 0 END) as compliant_count,
           SUM(CASE WHEN chain_status = 'sed_non_compliant' THEN 1 ELSE 0 END) as non_compliant_count,
           SUM(CASE WHEN chain_status = 'sed_lapsed' THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_sed_compliance ${where}`,
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

// ─── POST / — create a new SED compliance record ─────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    compliance_year: number;
    annual_revenue_zar: number;
    sed_spend_zar?: number | null;
    sed_spend_pct?: number | null;
    focus_area?: string | null;
    auditor_name?: string | null;
    notes?: string | null;
  }>();

  if (!body.project_ref || body.annual_revenue_zar == null || body.compliance_year == null) {
    return c.json(
      {
        success: false,
        error: 'project_ref, annual_revenue_zar, and compliance_year are required',
      },
      400,
    );
  }

  const tier = deriveSedRevenueTier(body.annual_revenue_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  const focusArea = body.focus_area ?? 'comprehensive';

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_sed_compliance
         (id, project_ref, compliance_year, annual_revenue_zar, revenue_tier,
          sed_spend_zar, sed_spend_pct, focus_area, auditor_name,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.compliance_year,
      body.annual_revenue_zar,
      tier,
      body.sed_spend_zar ?? null,
      body.sed_spend_pct ?? null,
      focusArea,
      body.auditor_name ?? null,
      'sed_triggered',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_sed.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_sed',
    entity_id: id,
    data: {
      revenue_tier: tier,
      project_ref: body.project_ref,
      compliance_year: body.compliance_year,
      annual_revenue_zar: body.annual_revenue_zar,
      sed_spend_zar: body.sed_spend_zar ?? null,
      sed_spend_pct: body.sed_spend_pct ?? null,
      focus_area: focusArea,
      auditor_name: body.auditor_name ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, revenue_tier: tier } }, 201);
});

// ─── GET /:id — single row + is_reportable + audit trail ─────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_sed_compliance WHERE id = ?')
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
       WHERE entity_type = 'ipp_sed' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as SedAction,
        row.revenue_tier as SedRevenueTier,
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
    action: SedAction;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_sed_compliance WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as SedStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const action = body.action as SedAction;
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

  const tier = row.revenue_tier as SedRevenueTier;
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
      `UPDATE oe_ipp_sed_compliance
       SET chain_status = ?, sla_due_date = ?, reason = ?, notes = ?,
           is_reportable = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nextSt, slaDueDate, body.reason ?? null, body.notes ?? null, reportable ? 1 : 0, nowIso, id)
    .run();

  await fireCascade({
    event: `sed_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_sed',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      revenue_tier: tier,
      annual_revenue_zar: row.annual_revenue_zar,
      project_ref: row.project_ref,
      compliance_year: row.compliance_year,
      sed_spend_zar: row.sed_spend_zar ?? null,
      sed_spend_pct: row.sed_spend_pct ?? null,
      focus_area: row.focus_area ?? null,
      auditor_name: row.auditor_name ?? null,
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
