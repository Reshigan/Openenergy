// ═══════════════════════════════════════════════════════════════════════════
// Wave 172 — IPP Atmospheric Emission Licence (AEL) Application & Renewal (P6)
//
// National Environmental Management: Air Quality Act (NEM:AQA) Act 39 of 2004
// + DFFE / Provincial authority licensing.  Any IPP project operating Listed
// Activities (Schedule 1–2 or Section 21) must hold or renew an AEL before
// construction and operation.  A valid AEL is a hard pre-condition for
// Environmental Authorisation, NERSA licence, and bank financial-close.
//
// Mounted at /api/ipp-ael.
//
// INVERTED SLA: larger capacity_mw → more complex authority review
// → MORE time for authority processing.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { badEnum } from '../utils/validation';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── Types ───────────────────────────────────────────────────────────────────

type AelCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

type AelTriggerCategory =
  | 'new_installation'
  | 'capacity_increase'
  | 'fuel_change'
  | 'technology_substitution'
  | 'renewal'
  | 'amendment';

type AelCategory =
  | 'category_1_major'
  | 'category_2_minor'
  | 's21_listed_activity'
  | 'point_source'
  | 'fugitive_emission';

type AelStatus =
  | 'ael_triggered'
  | 'emissions_inventory'
  | 'application_preparation'
  | 'application_submitted'
  | 'authority_completeness_review'
  | 'public_participation_open'
  | 'public_participation_closed'
  | 'technical_assessment'
  | 'authority_final_review'
  | 'ael_granted'
  | 'ael_refused'
  | 'ael_lapsed';

type AelAction =
  | 'commence_emissions_inventory'
  | 'prepare_application'
  | 'submit_application'
  | 'accept_for_review'
  | 'open_public_participation'
  | 'close_public_participation'
  | 'commence_technical_assessment'
  | 'commence_final_review'
  | 'grant_ael'
  | 'refuse_ael'
  | 'lapse_ael';

type AnyAction = AelAction | 'flag_sla_breach';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveAelCapacityTier(capacity_mw: number): AelCapacityTier {
  if (capacity_mw < 10)  return 'small';
  if (capacity_mw < 50)  return 'medium';
  if (capacity_mw < 200) return 'large';
  if (capacity_mw < 500) return 'utility';
  return 'strategic';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<AelCapacityTier, number> = {
  small:      30,
  medium:     45,
  large:      60,
  utility:    90,
  strategic: 120,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<AelStatus>([
  'ael_granted',
  'ael_refused',
  'ael_lapsed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<AelAction, { from: AelStatus[] }> = {
  commence_emissions_inventory:  { from: ['ael_triggered'] },
  prepare_application:           { from: ['emissions_inventory'] },
  submit_application:            { from: ['application_preparation'] },
  accept_for_review:             { from: ['application_submitted'] },
  open_public_participation:     { from: ['authority_completeness_review'] },
  close_public_participation:    { from: ['public_participation_open'] },
  commence_technical_assessment: { from: ['public_participation_closed'] },
  commence_final_review:         { from: ['technical_assessment'] },
  grant_ael:                     { from: ['authority_final_review'] },
  refuse_ael:                    { from: ['authority_final_review'] },
  lapse_ael:                     { from: ['authority_completeness_review', 'public_participation_open', 'authority_final_review'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<AelCapacityTier>(['small', 'medium', 'large', 'utility', 'strategic']);

function crossesIntoRegulator(action: AelAction, tier: AelCapacityTier): boolean {
  if (action === 'refuse_ael') return ALL_TIERS.has(tier);
  if (action === 'lapse_ael')  return tier === 'utility' || tier === 'strategic';
  if (action === 'grant_ael')  return tier === 'utility' || tier === 'strategic';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: AelCapacityTier): boolean {
  return tier === 'utility' || tier === 'strategic';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippAelSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, ael_capacity_tier FROM oe_ipp_ael_applications
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; ael_capacity_tier: AelCapacityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_ael_applications SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_ael.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_ael',
      entity_id: row.id,
      data: {
        ael_capacity_tier: row.ael_capacity_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.ael_capacity_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.ael_capacity_tier),
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
    ael_capacity_tier,
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
  if (ael_capacity_tier){ clauses.push('ael_capacity_tier = ?'); binds.push(ael_capacity_tier); }
  if (trigger_category) { clauses.push('trigger_category = ?');  binds.push(trigger_category); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_ael_applications ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_ael_applications ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           ROUND(
             100.0 * SUM(CASE WHEN chain_status = 'ael_granted' THEN 1 ELSE 0 END)
               / NULLIF(COUNT(*), 0),
             2
           ) as granted_pct,
           SUM(CASE WHEN chain_status = 'ael_lapsed' THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_ael_applications ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_ael_applications WHERE id = ?')
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
       WHERE entity_type = 'ipp_ael' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new AEL application record ────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    trigger_category: AelTriggerCategory;
    ael_category: AelCategory;
    capacity_mw: number;
    authority_reference?: string | null;
    emissions_consultant?: string | null;
  }>();

  if (
    !body.project_id ||
    body.capacity_mw == null ||
    !body.trigger_category ||
    !body.ael_category
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, trigger_category, ael_category, capacity_mw are required',
      },
      400,
    );
  }

  const triggerCategoryErr = badEnum('trigger_category', body.trigger_category, ['new_installation', 'capacity_increase', 'fuel_change', 'technology_substitution', 'renewal', 'amendment']);
  if (triggerCategoryErr) return c.json({ success: false, error: triggerCategoryErr }, 400);
  const aelCategoryErr = badEnum('ael_category', body.ael_category, ['category_1_major', 'category_2_minor', 's21_listed_activity', 'point_source', 'fugitive_emission']);
  if (aelCategoryErr) return c.json({ success: false, error: aelCategoryErr }, 400);

  const tier = deriveAelCapacityTier(body.capacity_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 17 columns exactly:
  // id, participant_id, project_id, trigger_category, ael_category,
  // capacity_mw, ael_capacity_tier, authority_reference, emissions_consultant,
  // chain_status, sla_due_at, sla_breached, application_submitted_at,
  // public_participation_closed_at, ael_decided_at, created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_ael_applications
         (id, participant_id, project_id, trigger_category, ael_category,
          capacity_mw, ael_capacity_tier, authority_reference, emissions_consultant,
          chain_status, sla_due_at, sla_breached, application_submitted_at,
          public_participation_closed_at, ael_decided_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.trigger_category,
      body.ael_category,
      body.capacity_mw,
      tier,
      body.authority_reference ?? null,
      body.emissions_consultant ?? null,
      'ael_triggered',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_ael.created',
    actor_id: user.id,
    entity_type: 'ipp_ael',
    entity_id: id,
    data: {
      tier,
      capacity_mw: body.capacity_mw,
      trigger_category: body.trigger_category,
      ael_category: body.ael_category,
      authority_reference: body.authority_reference ?? null,
      emissions_consultant: body.emissions_consultant ?? null,
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
    authority_reference?: string | null;
    emissions_consultant?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_ael_applications WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as AelStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.ael_capacity_tier as AelCapacityTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  const ACTION_STATE_MAP: Record<AnyAction, AelStatus> = {
    commence_emissions_inventory:  'emissions_inventory',
    prepare_application:           'application_preparation',
    submit_application:            'application_submitted',
    accept_for_review:             'authority_completeness_review',
    open_public_participation:     'public_participation_open',
    close_public_participation:    'public_participation_closed',
    commence_technical_assessment: 'technical_assessment',
    commence_final_review:         'authority_final_review',
    grant_ael:                     'ael_granted',
    refuse_ael:                    'ael_refused',
    lapse_ael:                     'ael_lapsed',
    flag_sla_breach:               current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as AelAction];
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
  if (action === 'submit_application')          extraCols.application_submitted_at       = nowIso;
  if (action === 'close_public_participation')  extraCols.public_participation_closed_at = nowIso;
  if (action === 'grant_ael')                   extraCols.ael_decided_at                 = nowIso;
  if (action === 'refuse_ael')                  extraCols.ael_decided_at                 = nowIso;
  if (action === 'lapse_ael')                   extraCols.ael_decided_at                 = nowIso;
  if (action === 'flag_sla_breach')             extraCols.sla_breached                   = 1;

  // Allow updating authority reference and consultant at any non-terminal point.
  if (body.authority_reference != null)   extraCols.authority_reference   = body.authority_reference;
  if (body.emissions_consultant != null)  extraCols.emissions_consultant  = body.emissions_consultant;

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
    ? crossesIntoRegulator(body.action as AelAction, tier)
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
    .prepare(`UPDATE oe_ipp_ael_applications SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `ael_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_ael',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      trigger_category: row.trigger_category,
      ael_category: row.ael_category,
      ael_capacity_tier: tier,
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
