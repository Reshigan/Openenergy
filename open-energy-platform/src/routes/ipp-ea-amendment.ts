// ═══════════════════════════════════════════════════════════════════════════
// Wave 169 — IPP Environmental Authorization Amendment & Compliance (P6)
//
// EA amendment lifecycle covering scope definition, application preparation,
// DFFE completeness review, public participation, specialist review,
// final DFFE review and grant/refuse/s24g referral.
//
// Mounted at /api/ipp-ea-amendment.
//
// INVERTED SLA: larger capacity_mw → more scrutiny → MORE time.
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

type EaCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

type EaTriggerCategory =
  | 'scope_change'
  | 'technology_substitution'
  | 'capacity_increase'
  | 'access_route_change'
  | 'footprint_expansion'
  | 'component_modification';

type EaAmendmentCategory =
  | 'basic_assessment'
  | 'scoping_and_eia'
  | 'variation_application'
  | 's24g_rectification'
  | 'exemption_application';

type EaAmendmentStatus =
  | 'ea_amendment_triggered'
  | 'scope_defined'
  | 'application_in_preparation'
  | 'application_submitted'
  | 'dffe_completeness_review'
  | 'public_participation_open'
  | 'public_participation_closed'
  | 'specialist_review'
  | 'dffe_final_review'
  | 'amendment_granted'
  | 'amendment_refused'
  | 's24g_referral';

type EaAmendmentAction =
  | 'define_scope'
  | 'prepare_application'
  | 'submit_application'
  | 'accept_for_review'
  | 'open_public_participation'
  | 'close_public_participation'
  | 'submit_specialist_review'
  | 'commence_final_review'
  | 'grant_amendment'
  | 'refuse_amendment'
  | 'refer_s24g';

type AnyAction = EaAmendmentAction | 'flag_sla_breach';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveEaCapacityTier(capacity_mw: number): EaCapacityTier {
  if (capacity_mw < 10)  return 'small';
  if (capacity_mw < 50)  return 'medium';
  if (capacity_mw < 200) return 'large';
  if (capacity_mw < 500) return 'utility';
  return 'strategic';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<EaCapacityTier, number> = {
  small:     60,
  medium:    90,
  large:    120,
  utility:  180,
  strategic: 270,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<EaAmendmentStatus>([
  'amendment_granted',
  'amendment_refused',
  's24g_referral',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<EaAmendmentAction, { from: EaAmendmentStatus[] }> = {
  define_scope:               { from: ['ea_amendment_triggered'] },
  prepare_application:        { from: ['scope_defined'] },
  submit_application:         { from: ['application_in_preparation'] },
  accept_for_review:          { from: ['application_submitted'] },
  open_public_participation:  { from: ['dffe_completeness_review'] },
  close_public_participation: { from: ['public_participation_open'] },
  submit_specialist_review:   { from: ['public_participation_closed'] },
  commence_final_review:      { from: ['specialist_review'] },
  grant_amendment:            { from: ['dffe_final_review'] },
  refuse_amendment:           { from: ['dffe_final_review'] },
  refer_s24g:                 { from: ['dffe_completeness_review', 'public_participation_open', 'dffe_final_review'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<EaCapacityTier>(['small', 'medium', 'large', 'utility', 'strategic']);

function crossesIntoRegulator(action: EaAmendmentAction, tier: EaCapacityTier): boolean {
  if (action === 'refuse_amendment') return ALL_TIERS.has(tier);
  if (action === 'refer_s24g')       return ALL_TIERS.has(tier);
  if (action === 'grant_amendment')  return tier === 'utility' || tier === 'strategic';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: EaCapacityTier): boolean {
  return tier === 'utility' || tier === 'strategic';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippEaAmendmentSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, ea_capacity_tier FROM oe_ipp_ea_amendments
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; ea_capacity_tier: EaCapacityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_ea_amendments SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_eam.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_eam',
      entity_id: row.id,
      data: {
        ea_capacity_tier: row.ea_capacity_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.ea_capacity_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.ea_capacity_tier),
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
    ea_capacity_tier,
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
  if (ea_capacity_tier) { clauses.push('ea_capacity_tier = ?');  binds.push(ea_capacity_tier); }
  if (trigger_category) { clauses.push('trigger_category = ?');  binds.push(trigger_category); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_ea_amendments ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_ea_amendments ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           ROUND(
             100.0 * SUM(CASE WHEN chain_status = 'amendment_granted' THEN 1 ELSE 0 END)
               / NULLIF(COUNT(*), 0),
             2
           ) as granted_pct,
           SUM(CASE WHEN chain_status = 's24g_referral' THEN 1 ELSE 0 END) as s24g_count
         FROM oe_ipp_ea_amendments ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_ea_amendments WHERE id = ?')
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
       WHERE entity_type = 'ipp_eam' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new EA amendment record ───────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    trigger_category: EaTriggerCategory;
    amendment_category: EaAmendmentCategory;
    capacity_mw: number;
    dffe_reference?: string | null;
    environmental_consultant?: string | null;
  }>();

  if (
    !body.project_id ||
    body.capacity_mw == null ||
    !body.trigger_category ||
    !body.amendment_category
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, trigger_category, amendment_category, capacity_mw are required',
      },
      400,
    );
  }

  const enumErr =
    badEnum('trigger_category', body.trigger_category, ['scope_change', 'technology_substitution', 'capacity_increase', 'access_route_change', 'footprint_expansion', 'component_modification'])
    ?? badEnum('amendment_category', body.amendment_category, ['basic_assessment', 'scoping_and_eia', 'variation_application', 's24g_rectification', 'exemption_application']);
  if (enumErr) return c.json({ success: false, error: enumErr }, 400);

  const tier = deriveEaCapacityTier(body.capacity_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 17 columns exactly:
  // id, participant_id, project_id, trigger_category, amendment_category,
  // capacity_mw, ea_capacity_tier, dffe_reference, environmental_consultant,
  // chain_status, sla_due_at, sla_breached, application_submitted_at,
  // public_participation_closed_at, amendment_decided_at, created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_ea_amendments
         (id, participant_id, project_id, trigger_category, amendment_category,
          capacity_mw, ea_capacity_tier, dffe_reference, environmental_consultant,
          chain_status, sla_due_at, sla_breached, application_submitted_at,
          public_participation_closed_at, amendment_decided_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.trigger_category,
      body.amendment_category,
      body.capacity_mw,
      tier,
      body.dffe_reference ?? null,
      body.environmental_consultant ?? null,
      'ea_amendment_triggered',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_eam.created',
    actor_id: user.id,
    entity_type: 'ipp_eam',
    entity_id: id,
    data: {
      tier,
      capacity_mw: body.capacity_mw,
      trigger_category: body.trigger_category,
      amendment_category: body.amendment_category,
      dffe_reference: body.dffe_reference ?? null,
      environmental_consultant: body.environmental_consultant ?? null,
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
    dffe_reference?: string | null;
    environmental_consultant?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_ea_amendments WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as EaAmendmentStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.ea_capacity_tier as EaCapacityTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  const ACTION_STATE_MAP: Record<AnyAction, EaAmendmentStatus> = {
    define_scope:               'scope_defined',
    prepare_application:        'application_in_preparation',
    submit_application:         'application_submitted',
    accept_for_review:          'dffe_completeness_review',
    open_public_participation:  'public_participation_open',
    close_public_participation: 'public_participation_closed',
    submit_specialist_review:   'specialist_review',
    commence_final_review:      'dffe_final_review',
    grant_amendment:            'amendment_granted',
    refuse_amendment:           'amendment_refused',
    refer_s24g:                 's24g_referral',
    flag_sla_breach:            current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as EaAmendmentAction];
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
  if (action === 'submit_application')         extraCols.application_submitted_at          = nowIso;
  if (action === 'close_public_participation') extraCols.public_participation_closed_at    = nowIso;
  if (action === 'grant_amendment')            extraCols.amendment_decided_at              = nowIso;
  if (action === 'refuse_amendment')           extraCols.amendment_decided_at              = nowIso;
  if (action === 'refer_s24g')                 extraCols.amendment_decided_at              = nowIso;
  if (action === 'flag_sla_breach')            extraCols.sla_breached                      = 1;

  // Allow updating DFFE reference and consultant at any non-terminal point.
  if (body.dffe_reference != null)           extraCols.dffe_reference             = body.dffe_reference;
  if (body.environmental_consultant != null) extraCols.environmental_consultant   = body.environmental_consultant;

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
    ? crossesIntoRegulator(body.action as EaAmendmentAction, tier)
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
    .prepare(`UPDATE oe_ipp_ea_amendments SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `eam_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_eam',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      trigger_category: row.trigger_category,
      amendment_category: row.amendment_category,
      ea_capacity_tier: tier,
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
