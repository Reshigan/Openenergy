// ═══════════════════════════════════════════════════════════════════════════
// Wave 171 — IPP Heritage Resources Assessment (HRA) & Permit (P6)
//
// National Heritage Resources Act (NHRA) Act 25 of 1999 + SAHRA permitting.
// IPP projects trigger Section 38 HRA requirements for any development that
// may impact archaeological, paleontological, historical, or architectural
// heritage. A completed HRA / heritage permit is a NERSA licence condition
// and an environmental authorisation pre-requisite for many generation types.
//
// Mounted at /api/ipp-hra.
//
// INVERTED SLA: larger capacity_mw → more complex SAHRA assessment
// → MORE time for authority processing.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── Types ───────────────────────────────────────────────────────────────────

type HraCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

type HraTriggerCategory =
  | 'new_development'
  | 'scope_change'
  | 'layout_modification'
  | 'access_road'
  | 'substation_addition'
  | 'transmission_line';

type HraCategory =
  | 'phase_1_desktop'
  | 'phase_2_field'
  | 'phase_3_excavation'
  | 'heritage_impact'
  | 'mitigation_plan';

type HraStatus =
  | 'hra_triggered'
  | 'desktop_study'
  | 'field_survey'
  | 'hra_report_preparation'
  | 'hra_submitted'
  | 'sahra_review'
  | 'public_participation'
  | 'specialist_assessment'
  | 'final_review'
  | 'hra_approved'
  | 'hra_refused'
  | 'heritage_watchlist';

type HraAction =
  | 'commence_desktop_study'
  | 'commence_field_survey'
  | 'prepare_hra_report'
  | 'submit_hra'
  | 'commence_sahra_review'
  | 'open_public_participation'
  | 'commence_specialist_assessment'
  | 'commence_final_review'
  | 'approve_hra'
  | 'refuse_hra'
  | 'add_to_watchlist';

type AnyAction = HraAction | 'flag_sla_breach';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveHraCapacityTier(capacity_mw: number): HraCapacityTier {
  if (capacity_mw < 10)  return 'small';
  if (capacity_mw < 50)  return 'medium';
  if (capacity_mw < 200) return 'large';
  if (capacity_mw < 500) return 'utility';
  return 'strategic';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<HraCapacityTier, number> = {
  small:      30,
  medium:     45,
  large:      60,
  utility:    90,
  strategic: 120,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<HraStatus>([
  'hra_approved',
  'hra_refused',
  'heritage_watchlist',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<HraAction, { from: HraStatus[] }> = {
  commence_desktop_study:         { from: ['hra_triggered'] },
  commence_field_survey:          { from: ['desktop_study'] },
  prepare_hra_report:             { from: ['field_survey'] },
  submit_hra:                     { from: ['hra_report_preparation'] },
  commence_sahra_review:          { from: ['hra_submitted'] },
  open_public_participation:      { from: ['sahra_review'] },
  commence_specialist_assessment: { from: ['public_participation'] },
  commence_final_review:          { from: ['specialist_assessment'] },
  approve_hra:                    { from: ['final_review'] },
  refuse_hra:                     { from: ['final_review'] },
  add_to_watchlist:               { from: ['final_review', 'specialist_assessment'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<HraCapacityTier>(['small', 'medium', 'large', 'utility', 'strategic']);

function crossesIntoRegulator(action: HraAction, tier: HraCapacityTier): boolean {
  if (action === 'refuse_hra')       return ALL_TIERS.has(tier);
  if (action === 'add_to_watchlist') return tier === 'utility' || tier === 'strategic';
  if (action === 'approve_hra')      return tier === 'utility' || tier === 'strategic';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: HraCapacityTier): boolean {
  return tier === 'utility' || tier === 'strategic';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippHraSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, hra_capacity_tier FROM oe_ipp_hra_assessments
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; hra_capacity_tier: HraCapacityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_hra_assessments SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_hra.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_hra',
      entity_id: row.id,
      data: {
        hra_capacity_tier: row.hra_capacity_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.hra_capacity_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.hra_capacity_tier),
      },
      env,
    });
  }
}

// ─── GET / — paginated list + KPIs ───────────────────────────────────────────

app.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    participant_id,
    chain_status,
    hra_capacity_tier,
    trigger_category,
    limit = '50',
    offset = '0',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const off     = Math.max(0, parseInt(offset) || 0);

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Non-admin/support/regulator sees only their own rows.
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  } else if (participant_id) {
    clauses.push('participant_id = ?');
    binds.push(participant_id);
  }
  if (chain_status)     { clauses.push('chain_status = ?');      binds.push(chain_status); }
  if (hra_capacity_tier){ clauses.push('hra_capacity_tier = ?'); binds.push(hra_capacity_tier); }
  if (trigger_category) { clauses.push('trigger_category = ?');  binds.push(trigger_category); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_hra_assessments ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_hra_assessments ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           ROUND(
             100.0 * SUM(CASE WHEN chain_status = 'hra_approved' THEN 1 ELSE 0 END)
               / NULLIF(COUNT(*), 0),
             2
           ) as approved_pct,
           SUM(CASE WHEN chain_status = 'heritage_watchlist' THEN 1 ELSE 0 END) as watchlist_count
         FROM oe_ipp_hra_assessments ${where}`,
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

// ─── GET /:id — single row + audit trail ─────────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_hra_assessments WHERE id = ?')
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
       WHERE entity_type = 'ipp_hra' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new HRA assessment record ─────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    trigger_category: HraTriggerCategory;
    hra_category: HraCategory;
    capacity_mw: number;
    sahra_reference?: string | null;
    heritage_consultant?: string | null;
  }>();

  if (
    !body.project_id ||
    body.capacity_mw == null ||
    !body.trigger_category ||
    !body.hra_category
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, trigger_category, hra_category, capacity_mw are required',
      },
      400,
    );
  }

  const tier = deriveHraCapacityTier(body.capacity_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 17 columns exactly:
  // id, participant_id, project_id, trigger_category, hra_category,
  // capacity_mw, hra_capacity_tier, sahra_reference, heritage_consultant,
  // chain_status, sla_due_at, sla_breached, hra_submitted_at,
  // public_participation_closed_at, hra_decided_at, created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_hra_assessments
         (id, participant_id, project_id, trigger_category, hra_category,
          capacity_mw, hra_capacity_tier, sahra_reference, heritage_consultant,
          chain_status, sla_due_at, sla_breached, hra_submitted_at,
          public_participation_closed_at, hra_decided_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.trigger_category,
      body.hra_category,
      body.capacity_mw,
      tier,
      body.sahra_reference ?? null,
      body.heritage_consultant ?? null,
      'hra_triggered',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_hra.created',
    actor_id: user.id,
    entity_type: 'ipp_hra',
    entity_id: id,
    data: {
      tier,
      capacity_mw: body.capacity_mw,
      trigger_category: body.trigger_category,
      hra_category: body.hra_category,
      sahra_reference: body.sahra_reference ?? null,
      heritage_consultant: body.heritage_consultant ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ─── PUT /:id/action — state machine dispatch ─────────────────────────────────

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: AnyAction;
    notes?: string;
    reason?: string;
    sahra_reference?: string | null;
    heritage_consultant?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_hra_assessments WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as HraStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.hra_capacity_tier as HraCapacityTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  const ACTION_STATE_MAP: Record<AnyAction, HraStatus> = {
    commence_desktop_study:         'desktop_study',
    commence_field_survey:          'field_survey',
    prepare_hra_report:             'hra_report_preparation',
    submit_hra:                     'hra_submitted',
    commence_sahra_review:          'sahra_review',
    open_public_participation:      'public_participation',
    commence_specialist_assessment: 'specialist_assessment',
    commence_final_review:          'final_review',
    approve_hra:                    'hra_approved',
    refuse_hra:                     'hra_refused',
    add_to_watchlist:               'heritage_watchlist',
    flag_sla_breach:                current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as HraAction];
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

  // Timestamp side-effects
  if (action === 'submit_hra')                     extraCols.hra_submitted_at              = nowIso;
  if (action === 'commence_specialist_assessment') extraCols.public_participation_closed_at = nowIso;
  if (action === 'approve_hra')                    extraCols.hra_decided_at                = nowIso;
  if (action === 'refuse_hra')                     extraCols.hra_decided_at                = nowIso;
  if (action === 'add_to_watchlist')               extraCols.hra_decided_at                = nowIso;
  if (action === 'flag_sla_breach')                extraCols.sla_breached                  = 1;

  // Allow updating SAHRA reference and consultant at any non-terminal point.
  if (body.sahra_reference != null)      extraCols.sahra_reference      = body.sahra_reference;
  if (body.heritage_consultant != null)  extraCols.heritage_consultant  = body.heritage_consultant;

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
    ? crossesIntoRegulator(body.action as HraAction, tier)
    : slaBreachCrossesIntoRegulator(tier);

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
    .prepare(`UPDATE oe_ipp_hra_assessments SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `hra_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_hra',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      trigger_category: row.trigger_category,
      hra_category: row.hra_category,
      hra_capacity_tier: tier,
      capacity_mw: row.capacity_mw,
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
