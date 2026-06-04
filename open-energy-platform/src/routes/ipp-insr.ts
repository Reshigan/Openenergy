// ═══════════════════════════════════════════════════════════════════════════
// Wave 178 — IPP Annual Insurance Renewal & Coverage Confirmation
//
// REIPPPP Power Purchase Agreements (Schedule 8) and Financing Documents
// require IPPs to maintain specific insurance coverage at all times:
// contractor's all-risk (CAR), operational all-risk, third-party liability,
// business interruption, directors' & officers' (D&O), and environmental
// impairment liability. Annual renewal must be confirmed to the DMRE IPP
// Office and lenders before policy expiry. Coverage lapse constitutes an
// immediate PPA default event.
//
// Mounted at /api/ipp-insurance-renewals.
// INVERTED SLA: higher premium → more complex placement → more time.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveInsrPremiumTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-insr-spec';
import type { InsrStatus, InsrAction, InsrPremiumTier } from '../utils/ipp-insr-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippInsuranceRenewalSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, premium_tier FROM oe_ipp_insurance_renewals
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; premium_tier: InsrPremiumTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_insurance_renewals SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_insr.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_insr',
      entity_id: row.id,
      data: {
        premium_tier: row.premium_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.premium_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.premium_tier),
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
    premium_tier,
    renewal_year,
    line_type,
    broker_name,
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
  if (chain_status) { clauses.push('chain_status = ?');  binds.push(chain_status); }
  if (premium_tier) { clauses.push('premium_tier = ?');  binds.push(premium_tier); }
  if (renewal_year) { clauses.push('renewal_year = ?');  binds.push(parseInt(renewal_year)); }
  if (line_type)    { clauses.push('line_type = ?');     binds.push(line_type); }
  if (broker_name)  { clauses.push('broker_name = ?');   binds.push(broker_name); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_insurance_renewals ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_insurance_renewals ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'confirmed_adequate' THEN 1 ELSE 0 END) as confirmed_adequate_count,
           SUM(CASE WHEN chain_status = 'confirmed_inadequate' THEN 1 ELSE 0 END) as inadequate_count,
           SUM(CASE WHEN chain_status = 'coverage_lapsed' THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_insurance_renewals ${where}`,
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

// ─── POST / — create a new insurance renewal record ──────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    renewal_year: number;
    annual_premium_zar: number;
    insured_value_zar?: number | null;
    line_type?: string | null;
    policy_expiry_date?: string | null;
    broker_name?: string | null;
    notes?: string | null;
  }>();

  if (
    !body.project_ref ||
    body.renewal_year == null ||
    body.annual_premium_zar == null
  ) {
    return c.json(
      {
        success: false,
        error: 'project_ref, renewal_year, annual_premium_zar are required',
      },
      400,
    );
  }

  const tier = deriveInsrPremiumTier(body.annual_premium_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  const lineType = body.line_type ?? 'comprehensive_package';

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_insurance_renewals
         (id, project_ref, renewal_year, annual_premium_zar, premium_tier,
          insured_value_zar, line_type, policy_expiry_date, broker_name,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.renewal_year,
      body.annual_premium_zar,
      tier,
      body.insured_value_zar ?? null,
      lineType,
      body.policy_expiry_date ?? null,
      body.broker_name ?? null,
      'renewal_triggered',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_insr.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_insr',
    entity_id: id,
    data: {
      premium_tier: tier,
      project_ref: body.project_ref,
      renewal_year: body.renewal_year,
      annual_premium_zar: body.annual_premium_zar,
      insured_value_zar: body.insured_value_zar ?? null,
      line_type: lineType,
      policy_expiry_date: body.policy_expiry_date ?? null,
      broker_name: body.broker_name ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, premium_tier: tier } }, 201);
});

// ─── GET /:id — single row + is_reportable + audit trail ─────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_insurance_renewals WHERE id = ?')
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
       WHERE entity_type = 'ipp_insr' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as InsrAction,
        row.premium_tier as InsrPremiumTier,
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
    action: InsrAction;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_insurance_renewals WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as InsrStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const action = body.action as InsrAction;
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

  const tier = row.premium_tier as InsrPremiumTier;
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
      `UPDATE oe_ipp_insurance_renewals
       SET chain_status = ?, sla_due_date = ?, reason = ?, notes = ?,
           is_reportable = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nextSt, slaDueDate, body.reason ?? null, body.notes ?? null, reportable ? 1 : 0, nowIso, id)
    .run();

  await fireCascade({
    event: `insr_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_insr',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      premium_tier: tier,
      annual_premium_zar: row.annual_premium_zar,
      project_ref: row.project_ref,
      renewal_year: row.renewal_year,
      insured_value_zar: row.insured_value_zar ?? null,
      line_type: row.line_type ?? null,
      policy_expiry_date: row.policy_expiry_date ?? null,
      broker_name: row.broker_name ?? null,
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
