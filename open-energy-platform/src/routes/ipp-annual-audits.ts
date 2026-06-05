// ═══════════════════════════════════════════════════════════════════════════
// Wave 189 — IPP Annual Financial Statements & Independent Audit
//
// Mounted at /api/ipp-annual-audits.
// INVERTED SLA: larger revenue base = more complex AFS (more subsidiaries,
// more tax calculations, more related-party disclosures) = more time granted
// by auditors and lenders. Flagship projects (>= R1B annual revenue) receive
// 180 days from financial year-end trigger date.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  AudStatus,
  AudAction,
  AudRevenueTier,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  SLA_DAYS,
  deriveAudRevenueTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-annual-audit-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippAnnualAuditSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, revenue_tier FROM oe_ipp_annual_audits
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; revenue_tier: AudRevenueTier }>();

  for (const row of breaches.results ?? []) {
    const reportable = slaBreachCrossesIntoRegulator(row.revenue_tier);

    await env.DB
      .prepare(
        `UPDATE oe_ipp_annual_audits
         SET sla_breached = 1, updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_aud.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_aud',
      entity_id: row.id,
      data: {
        revenue_tier: row.revenue_tier,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });

    await fireCascade({
      event: 'aud_evt_flag_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_aud',
      entity_id: row.id,
      data: {
        revenue_tier: row.revenue_tier,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }
}

// ─── GET / — list all records + KPIs ─────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    revenue_tier,
    financial_year,
    opinion_type,
    limit = '50',
    offset = '0',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const off     = Math.max(0, parseInt(offset) || 0);

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  }

  if (status)        { clauses.push('chain_status = ?');   binds.push(status); }
  if (revenue_tier)  { clauses.push('revenue_tier = ?');   binds.push(revenue_tier); }
  if (financial_year){ clauses.push('financial_year = ?'); binds.push(parseInt(financial_year)); }
  if (opinion_type)  { clauses.push('opinion_type = ?');   binds.push(opinion_type); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_annual_audits ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(
        `SELECT COUNT(*) as n FROM oe_ipp_annual_audits ${where}`,
      )
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'audit_completed' THEN 1 ELSE 0 END) as completed_count,
           SUM(CASE WHEN chain_status = 'audit_qualified' THEN 1 ELSE 0 END) as qualified_count,
           SUM(CASE WHEN chain_status = 'audit_lapsed'    THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_annual_audits ${where}`,
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

// ─── POST / — create a new annual audit record ────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id?: string | null;
    financial_year: number;
    year_end_date: string;
    auditor_firm?: string | null;
    annual_revenue_zar: number;
    total_assets_zar?: number | null;
    net_profit_zar?: number | null;
    opinion_type?: string | null;
    qualification_basis?: string | null;
    actor_party?: string | null;
    notes?: string | null;
  }>();

  if (body.financial_year == null || body.annual_revenue_zar == null || !body.year_end_date) {
    return c.json(
      {
        success: false,
        error: 'financial_year, year_end_date and annual_revenue_zar are required',
      },
      400,
    );
  }

  const tier = deriveAudRevenueTier(body.annual_revenue_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_aud_${crypto.randomUUID()}`;

  const slaDays = SLA_DAYS[tier];
  const slaDeadline = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_annual_audits
         (id, participant_id, project_id, financial_year, year_end_date,
          auditor_firm, annual_revenue_zar, total_assets_zar, net_profit_zar,
          opinion_type, qualification_basis,
          revenue_tier, chain_status,
          sla_days, sla_deadline, sla_breached,
          actor_id, actor_party, notes,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id ?? null,
      body.financial_year,
      body.year_end_date,
      body.auditor_firm ?? null,
      body.annual_revenue_zar,
      body.total_assets_zar ?? 0,
      body.net_profit_zar ?? 0,
      body.opinion_type ?? 'unqualified',
      body.qualification_basis ?? null,
      tier,
      'audit_cycle_opened',
      slaDays,
      slaDeadline,
      user.id,
      body.actor_party ?? null,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_aud.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_aud',
    entity_id: id,
    data: {
      revenue_tier: tier,
      financial_year: body.financial_year,
      year_end_date: body.year_end_date,
      auditor_firm: body.auditor_firm ?? null,
      annual_revenue_zar: body.annual_revenue_zar,
      total_assets_zar: body.total_assets_zar ?? 0,
      net_profit_zar: body.net_profit_zar ?? 0,
      opinion_type: body.opinion_type ?? 'unqualified',
      sla_days: slaDays,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, revenue_tier: tier } }, 201);
});

// ─── GET /:id — single record + audit trail ──────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_annual_audits WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'ipp_aud' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── PUT /:id/action — state machine transition ───────────────────────────────

router.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: AudAction;
    opinion_type?: string | null;
    qualification_basis?: string | null;
    notes?: string | null;
    actor_party?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_annual_audits WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as AudStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status ${current} is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const action = body.action as AudAction;

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

  const nextSt = STATE_TRANSITIONS[action];
  const tier = row.revenue_tier as AudRevenueTier;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, tier);

  // Carry forward opinion_type / qualification_basis updates if supplied
  const newOpinionType        = body.opinion_type        ?? (row.opinion_type as string | null)        ?? 'unqualified';
  const newQualificationBasis = body.qualification_basis ?? (row.qualification_basis as string | null) ?? null;

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_annual_audits
       SET chain_status = ?, opinion_type = ?, qualification_basis = ?,
           notes = ?, actor_id = ?, actor_party = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextSt,
      newOpinionType,
      newQualificationBasis,
      body.notes ?? row.notes ?? null,
      user.id,
      body.actor_party ?? row.actor_party ?? null,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `aud_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_aud',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      revenue_tier: tier,
      financial_year: row.financial_year,
      year_end_date: row.year_end_date,
      auditor_firm: row.auditor_firm,
      annual_revenue_zar: row.annual_revenue_zar,
      total_assets_zar: row.total_assets_zar,
      net_profit_zar: row.net_profit_zar,
      opinion_type: newOpinionType,
      qualification_basis: newQualificationBasis,
      notes: body.notes ?? null,
      regulator_notified: reportable,
      crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: { id, status: nextSt, regulator_notified: reportable },
  });
});

// ─── POST /sla-sweep — internal admin-only sweep ─────────────────────────────

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden — admin only' }, 403);
  }

  await ippAnnualAuditSlaSweep(c.env);
  return c.json({ success: true, data: { swept: true } });
});

export default router;
