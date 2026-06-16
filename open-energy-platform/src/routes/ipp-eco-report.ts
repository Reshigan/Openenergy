// ═══════════════════════════════════════════════════════════════════════════
// Wave 161 — IPP Environmental Compliance Audit (ECO Annual Report) chain (P6)
//
// NEMA §43(3) — every IPP holding an Environmental Authorisation must appoint
// an Environmental Control Officer (ECO) and submit an annual compliance
// report to DFFE/DLME. Non-compliance feeds DFFE enforcement (separate from
// NERSA W40 compliance inspections). EA conditions differ per plant.
//
// Mounted at /api/ipp-eco-report.
//
// INVERTED SLA: larger installed capacity → more EA conditions → MORE time.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { badEnum } from '../utils/validation';
import {
  type EcoReportStatus,
  type EcoReportAction,
  type EcoCapacityTier,
  deriveEcoCapacityTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-eco-report-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ──────────────────────────────────────────────────────────────

export async function ippEcoReportSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, capacity_tier FROM oe_ipp_eco_reports
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; capacity_tier: EcoCapacityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_eco_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_eco.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_eco',
      entity_id: row.id,
      data: {
        capacity_tier: row.capacity_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.capacity_tier),
      },
      env,
    });
  }
}

// ─── GET / — paginated list + KPIs ────────────────────────────────────────

app.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    project_id,
    status,
    tier,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const pageNum = Math.max(1, parseInt(page) || 1);
  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const offset  = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Non-admin/support/regulator sees only their own rows.
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  }
  if (project_id) { clauses.push('project_id = ?');   binds.push(project_id); }
  if (status)     { clauses.push('chain_status = ?');  binds.push(status); }
  if (tier)       { clauses.push('capacity_tier = ?'); binds.push(tier); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_eco_reports ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_eco_reports ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'compliant' THEN 1 ELSE 0 END) as compliant_count,
           SUM(CASE WHEN chain_status IN ('non_compliance_identified','corrective_action_in_progress','enforcement_referral') THEN 1 ELSE 0 END) as non_compliant_count,
           SUM(CASE WHEN chain_status = 'enforcement_referral' THEN 1 ELSE 0 END) as enforcement_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count
         FROM oe_ipp_eco_reports ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: {
        page: pageNum,
        per_page: perPage,
        total: totalRow?.n ?? 0,
      },
      kpis,
    },
  });
});

// ─── GET /:id — single row + audit trail ──────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_eco_reports WHERE id = ?')
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
       WHERE entity_type = 'ipp_eco' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new ECO annual report record ───────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    reporting_year: number;
    capacity_mw: number;
    ea_reference?: string;
    eco_name?: string;
    violation_category?: string;
  }>();

  if (
    !body.project_id ||
    body.reporting_year == null ||
    body.capacity_mw == null
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, reporting_year, capacity_mw are required',
      },
      400,
    );
  }

  const enumErr = badEnum('violation_category', body.violation_category, ['none', 'water_management', 'waste_management', 'vegetation_clearing', 'noise_dust', 'heritage_resources', 'biodiversity', 'rehabilitation']);
  if (enumErr) return c.json({ success: false, error: enumErr }, 400);

  const tier = deriveEcoCapacityTier(body.capacity_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_eco_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 18 columns exactly:
  // id, participant_id, project_id, reporting_year, capacity_mw, capacity_tier,
  // ea_reference, eco_name, violation_category, chain_status, sla_due_at, sla_breached,
  // submitted_at, compliant_at, non_compliance_at,
  // enforcement_referral_at, created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_eco_reports
         (id, participant_id, project_id, reporting_year, capacity_mw, capacity_tier,
          ea_reference, eco_name, violation_category, chain_status, sla_due_at, sla_breached,
          submitted_at, compliant_at, non_compliance_at,
          enforcement_referral_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.reporting_year,
      body.capacity_mw,
      tier,
      body.ea_reference ?? null,
      body.eco_name ?? null,
      body.violation_category ?? 'none',
      'audit_due',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_eco.created',
    actor_id: user.id,
    entity_type: 'ipp_eco',
    entity_id: id,
    data: {
      tier,
      reporting_year: body.reporting_year,
      capacity_mw: body.capacity_mw,
      ea_reference: body.ea_reference ?? null,
      eco_name: body.eco_name ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ─── PUT /:id/action — state machine dispatch ─────────────────────────────

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: EcoReportAction | 'flag_sla_breach';
    notes?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_eco_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as EcoReportStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.capacity_tier as EcoCapacityTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  type AnyAction = EcoReportAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, EcoReportStatus> = {
    appoint_eco:                'eco_appointed',
    commence_site_inspection:   'site_inspection_in_progress',
    complete_site_inspection:   'report_drafting',
    submit_for_review:          'submitted_to_dffe',
    submit_report:              'submitted_to_dffe',
    commence_dffe_review:       'under_review',
    raise_queries:              'queries_raised',
    submit_responses:           'responses_submitted',
    certify_compliant:          'compliant',
    identify_non_compliance:    'non_compliance_identified',
    commence_corrective_action: 'corrective_action_in_progress',
    refer_to_enforcement:       'enforcement_referral',
    flag_sla_breach:            current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as EcoReportAction];
    if (!rule || !rule.from.includes(current)) {
      return c.json(
        { success: false, error: `Cannot transition '${current}' → '${action}'` },
        409,
      );
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const extraCols: Record<string, unknown> = {};

  if (action === 'submit_report' || action === 'submit_for_review') extraCols.submitted_at = nowIso;
  if (action === 'certify_compliant')       extraCols.compliant_at = nowIso;
  if (action === 'identify_non_compliance') extraCols.non_compliance_at = nowIso;
  if (action === 'refer_to_enforcement')    extraCols.enforcement_referral_at = nowIso;
  if (action === 'flag_sla_breach')         extraCols.sla_breached = 1;

  // Recompute SLA deadline for new non-terminal states; self-loops preserve existing SLA.
  const isSelfLoop = nextSt === current;
  let slaAt: string | null = null;
  if (!isSelfLoop && !HARD_TERMINALS.has(nextSt)) {
    const slaDays = SLA_DAYS[tier] ?? 0;
    if (slaDays > 0) {
      slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();
    }
  } else if (isSelfLoop) {
    slaAt = row.sla_due_at as string | null;
  }

  const reportable = action !== 'flag_sla_breach'
    ? crossesIntoRegulator(body.action as EcoReportAction, tier)
    : false;

  const setCols = [
    'chain_status = ?',
    'updated_at = ?',
    ...(isSelfLoop ? [] : ['sla_due_at = ?']),
    ...Object.keys(extraCols).map((k) => `${k} = ?`),
  ];

  const setValues = [
    nextSt,
    nowIso,
    ...(isSelfLoop ? [] : [slaAt]),
    ...Object.values(extraCols),
  ];

  await c.env.DB
    .prepare(`UPDATE oe_ipp_eco_reports SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `eco_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_eco',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      reporting_year: row.reporting_year,
      capacity_mw: row.capacity_mw,
      ea_reference: row.ea_reference ?? null,
      eco_name: row.eco_name ?? null,
      violation_category: row.violation_category ?? null,
      notes: body.notes ?? null,
      reason: body.reason ?? null,
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

export default app;
