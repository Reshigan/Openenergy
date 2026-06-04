// ═══════════════════════════════════════════════════════════════════════════
// Wave 170 — IPP Water Use License (WUL) Application & Compliance (P6)
//
// National Water Act (NWA) Act 36 of 1998 + DWS licensing process.
// IPP projects trigger Section 21 WUL requirements for cooling water
// abstraction (solar thermal / CCGT), dust suppression, panel washing,
// process water, and impeding flow in watercourses. A valid WUL is a
// lender CP and a NERSA condition for many generation licences.
//
// Mounted at /api/ipp-wul.
//
// INVERTED SLA: larger capacity_mw → more complex hydrological assessment
// → MORE time for DWS processing.
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

type WulCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

type WulTriggerCategory =
  | 'new_application'
  | 'renewal'
  | 'amendment'
  | 'transfer'
  | 'rectification';

type WulSection21Category =
  | 's21_a_diversion'
  | 's21_b_storage'
  | 's21_c_impeding_flow'
  | 's21_g_discharge'
  | 's21_h_disposal';

type WulStatus =
  | 'wul_application_triggered'
  | 'site_assessment'
  | 'application_preparation'
  | 'application_submitted'
  | 'dws_completeness_review'
  | 'public_participation_open'
  | 'public_participation_closed'
  | 'technical_assessment'
  | 'dws_final_review'
  | 'wul_granted'
  | 'wul_refused'
  | 'wul_lapsed';

type WulAction =
  | 'commence_site_assessment'
  | 'commence_application_preparation'
  | 'submit_application'
  | 'accept_for_review'
  | 'open_public_participation'
  | 'close_public_participation'
  | 'commence_technical_assessment'
  | 'commence_final_review'
  | 'grant_wul'
  | 'refuse_wul'
  | 'lapse_wul';

type AnyAction = WulAction | 'flag_sla_breach';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveWulCapacityTier(capacity_mw: number): WulCapacityTier {
  if (capacity_mw < 10)  return 'small';
  if (capacity_mw < 50)  return 'medium';
  if (capacity_mw < 200) return 'large';
  if (capacity_mw < 500) return 'utility';
  return 'strategic';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<WulCapacityTier, number> = {
  small:      45,
  medium:     60,
  large:      90,
  utility:   120,
  strategic: 180,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<WulStatus>([
  'wul_granted',
  'wul_refused',
  'wul_lapsed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<WulAction, { from: WulStatus[] }> = {
  commence_site_assessment:         { from: ['wul_application_triggered'] },
  commence_application_preparation: { from: ['site_assessment'] },
  submit_application:               { from: ['application_preparation'] },
  accept_for_review:                { from: ['application_submitted'] },
  open_public_participation:        { from: ['dws_completeness_review'] },
  close_public_participation:       { from: ['public_participation_open'] },
  commence_technical_assessment:    { from: ['public_participation_closed'] },
  commence_final_review:            { from: ['technical_assessment'] },
  grant_wul:                        { from: ['dws_final_review'] },
  refuse_wul:                       { from: ['dws_final_review'] },
  lapse_wul:                        { from: ['dws_completeness_review', 'public_participation_open', 'dws_final_review'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<WulCapacityTier>(['small', 'medium', 'large', 'utility', 'strategic']);

function crossesIntoRegulator(action: WulAction, tier: WulCapacityTier): boolean {
  if (action === 'refuse_wul') return ALL_TIERS.has(tier);
  if (action === 'lapse_wul')  return tier === 'utility' || tier === 'strategic';
  if (action === 'grant_wul')  return tier === 'utility' || tier === 'strategic';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: WulCapacityTier): boolean {
  return tier === 'utility' || tier === 'strategic';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippWulSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, wul_capacity_tier FROM oe_ipp_wul_applications
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; wul_capacity_tier: WulCapacityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_wul_applications SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_wul.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_wul',
      entity_id: row.id,
      data: {
        wul_capacity_tier: row.wul_capacity_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.wul_capacity_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.wul_capacity_tier),
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
    wul_capacity_tier,
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
  if (chain_status)      { clauses.push('chain_status = ?');       binds.push(chain_status); }
  if (wul_capacity_tier) { clauses.push('wul_capacity_tier = ?');  binds.push(wul_capacity_tier); }
  if (trigger_category)  { clauses.push('trigger_category = ?');   binds.push(trigger_category); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_wul_applications ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_wul_applications ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           ROUND(
             100.0 * SUM(CASE WHEN chain_status = 'wul_granted' THEN 1 ELSE 0 END)
               / NULLIF(COUNT(*), 0),
             2
           ) as granted_pct,
           SUM(CASE WHEN chain_status = 'wul_lapsed' THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_wul_applications ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_wul_applications WHERE id = ?')
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
       WHERE entity_type = 'ipp_wul' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new WUL application record ───────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    trigger_category: WulTriggerCategory;
    section21_category: WulSection21Category;
    capacity_mw: number;
    dws_reference?: string | null;
    water_consultant?: string | null;
  }>();

  if (
    !body.project_id ||
    body.capacity_mw == null ||
    !body.trigger_category ||
    !body.section21_category
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, trigger_category, section21_category, capacity_mw are required',
      },
      400,
    );
  }

  const tier = deriveWulCapacityTier(body.capacity_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 17 columns exactly:
  // id, participant_id, project_id, trigger_category, section21_category,
  // capacity_mw, wul_capacity_tier, dws_reference, water_consultant,
  // chain_status, sla_due_at, sla_breached, application_submitted_at,
  // public_participation_closed_at, wul_decided_at, created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_wul_applications
         (id, participant_id, project_id, trigger_category, section21_category,
          capacity_mw, wul_capacity_tier, dws_reference, water_consultant,
          chain_status, sla_due_at, sla_breached, application_submitted_at,
          public_participation_closed_at, wul_decided_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.trigger_category,
      body.section21_category,
      body.capacity_mw,
      tier,
      body.dws_reference ?? null,
      body.water_consultant ?? null,
      'wul_application_triggered',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_wul.created',
    actor_id: user.id,
    entity_type: 'ipp_wul',
    entity_id: id,
    data: {
      tier,
      capacity_mw: body.capacity_mw,
      trigger_category: body.trigger_category,
      section21_category: body.section21_category,
      dws_reference: body.dws_reference ?? null,
      water_consultant: body.water_consultant ?? null,
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
    dws_reference?: string | null;
    water_consultant?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_wul_applications WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as WulStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.wul_capacity_tier as WulCapacityTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  const ACTION_STATE_MAP: Record<AnyAction, WulStatus> = {
    commence_site_assessment:         'site_assessment',
    commence_application_preparation: 'application_preparation',
    submit_application:               'application_submitted',
    accept_for_review:                'dws_completeness_review',
    open_public_participation:        'public_participation_open',
    close_public_participation:       'public_participation_closed',
    commence_technical_assessment:    'technical_assessment',
    commence_final_review:            'dws_final_review',
    grant_wul:                        'wul_granted',
    refuse_wul:                       'wul_refused',
    lapse_wul:                        'wul_lapsed',
    flag_sla_breach:                  current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as WulAction];
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
  if (action === 'submit_application')         extraCols.application_submitted_at       = nowIso;
  if (action === 'close_public_participation') extraCols.public_participation_closed_at = nowIso;
  if (action === 'grant_wul')                  extraCols.wul_decided_at                 = nowIso;
  if (action === 'refuse_wul')                 extraCols.wul_decided_at                 = nowIso;
  if (action === 'lapse_wul')                  extraCols.wul_decided_at                 = nowIso;
  if (action === 'flag_sla_breach')            extraCols.sla_breached                   = 1;

  // Allow updating DWS reference and consultant at any non-terminal point.
  if (body.dws_reference != null)     extraCols.dws_reference     = body.dws_reference;
  if (body.water_consultant != null)  extraCols.water_consultant  = body.water_consultant;

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
    ? crossesIntoRegulator(body.action as WulAction, tier)
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
    .prepare(`UPDATE oe_ipp_wul_applications SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `wul_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_wul',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      trigger_category: row.trigger_category,
      section21_category: row.section21_category,
      wul_capacity_tier: tier,
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
