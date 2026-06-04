// ═══════════════════════════════════════════════════════════════════════════
// Wave 163 — IPP Land & Servitude Amendment chain (P6)
//
// SPLUMA / MPRDA / Deeds Registries Act — amendment of land use rights,
// servitude registrations and wayleaves supporting IPP generation facilities.
// Surveys must precede submission; public notice + objection period are
// statutory steps for most amendment classes; appeals available when refused.
//
// Mounted at /api/ipp-land-amendment.
//
// INVERTED SLA: larger land area → more stakeholder complexity → MORE time.
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

type AreaTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

type AmendmentCategory =
  | 'lease_amendment'
  | 'servitude_registration'
  | 'servitude_extension'
  | 'wayleave_grant'
  | 'wayleave_extension'
  | 'right_of_way';

type LandAmendmentStatus =
  | 'amendment_requested'
  | 'surveyor_appointed'
  | 'survey_completed'
  | 'application_submitted'
  | 'authority_review'
  | 'public_notice'
  | 'objection_period'
  | 'objections_resolved'
  | 'amendment_granted'
  | 'amendment_refused'
  | 'appeal_filed'
  | 'appeal_determined';

type LandAmendmentAction =
  | 'appoint_surveyor'
  | 'complete_survey'
  | 'submit_application'
  | 'commence_authority_review'
  | 'issue_public_notice'
  | 'close_objection_period'
  | 'resolve_objections'
  | 'grant_amendment'
  | 'refuse_amendment'
  | 'file_appeal'
  | 'determine_appeal';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveAreaTier(land_area_hectares: number): AreaTier {
  if (land_area_hectares < 1)   return 'minor';
  if (land_area_hectares < 10)  return 'moderate';
  if (land_area_hectares < 50)  return 'significant';
  if (land_area_hectares < 200) return 'major';
  return 'material';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<AreaTier, number> = {
  minor:       14,
  moderate:    21,
  significant: 30,
  major:       45,
  material:    60,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<LandAmendmentStatus>([
  'amendment_granted',
  'amendment_refused',
  'appeal_determined',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<LandAmendmentAction, { from: LandAmendmentStatus[] }> = {
  appoint_surveyor:          { from: ['amendment_requested'] },
  complete_survey:           { from: ['surveyor_appointed'] },
  submit_application:        { from: ['survey_completed'] },
  commence_authority_review: { from: ['application_submitted'] },
  issue_public_notice:       { from: ['authority_review'] },
  close_objection_period:    { from: ['public_notice', 'objection_period'] },
  resolve_objections:        { from: ['objection_period', 'objections_resolved'] },
  grant_amendment:           { from: ['authority_review', 'objections_resolved'] },
  refuse_amendment:          { from: ['authority_review', 'objections_resolved', 'objection_period'] },
  file_appeal:               { from: ['amendment_refused'] },
  determine_appeal:          { from: ['appeal_filed'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<AreaTier>(['minor', 'moderate', 'significant', 'major', 'material']);

function crossesIntoRegulator(action: LandAmendmentAction, tier: AreaTier): boolean {
  if (action === 'refuse_amendment')   return ALL_TIERS.has(tier);
  if (action === 'determine_appeal')   return ALL_TIERS.has(tier);
  if (action === 'grant_amendment')    return tier === 'major' || tier === 'material';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: AreaTier): boolean {
  return tier === 'major' || tier === 'material';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippLandAmendmentSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, area_tier FROM oe_ipp_land_amendments
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; area_tier: AreaTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_land_amendments SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_lam.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_lam',
      entity_id: row.id,
      data: {
        area_tier: row.area_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.area_tier),
      },
      env,
    });
  }
}

// ─── GET / — paginated list + KPIs ───────────────────────────────────────────

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
  if (tier)       { clauses.push('area_tier = ?');     binds.push(tier); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_land_amendments ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_land_amendments ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'amendment_granted' THEN 1 ELSE 0 END) as granted_count,
           SUM(CASE WHEN chain_status = 'amendment_refused' THEN 1 ELSE 0 END) as refused_count,
           SUM(CASE WHEN chain_status IN ('appeal_filed','appeal_determined') THEN 1 ELSE 0 END) as appeal_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(CASE WHEN chain_status = 'amendment_granted' THEN land_area_hectares ELSE 0 END) as total_granted_hectares
         FROM oe_ipp_land_amendments ${where}`,
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

// ─── GET /:id — single row + audit trail ─────────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_land_amendments WHERE id = ?')
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
       WHERE entity_type = 'ipp_lam' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new land amendment record ─────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    amendment_category: AmendmentCategory;
    land_area_hectares: number;
    counterparty_name?: string;
    deeds_office_reference?: string;
  }>();

  if (
    !body.project_id ||
    body.land_area_hectares == null ||
    !body.amendment_category
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, land_area_hectares, amendment_category are required',
      },
      400,
    );
  }

  const tier = deriveAreaTier(body.land_area_hectares);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_lam_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 18 columns exactly:
  // id, participant_id, project_id, amendment_category, land_area_hectares,
  // area_tier, counterparty_name, deeds_office_reference, chain_status,
  // sla_due_at, sla_breached, survey_completed_at, amendment_granted_at,
  // amendment_refused_at, appeal_filed_at, appeal_determined_at,
  // created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_land_amendments
         (id, participant_id, project_id, amendment_category, land_area_hectares,
          area_tier, counterparty_name, deeds_office_reference, chain_status,
          sla_due_at, sla_breached, survey_completed_at, amendment_granted_at,
          amendment_refused_at, appeal_filed_at, appeal_determined_at,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.amendment_category,
      body.land_area_hectares,
      tier,
      body.counterparty_name ?? null,
      body.deeds_office_reference ?? null,
      'amendment_requested',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_lam.created',
    actor_id: user.id,
    entity_type: 'ipp_lam',
    entity_id: id,
    data: {
      tier,
      land_area_hectares: body.land_area_hectares,
      amendment_category: body.amendment_category,
      counterparty_name: body.counterparty_name ?? null,
      deeds_office_reference: body.deeds_office_reference ?? null,
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
    action: LandAmendmentAction | 'flag_sla_breach';
    notes?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_land_amendments WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as LandAmendmentStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.area_tier as AreaTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  type AnyAction = LandAmendmentAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, LandAmendmentStatus> = {
    appoint_surveyor:          'surveyor_appointed',
    complete_survey:           'survey_completed',
    submit_application:        'application_submitted',
    commence_authority_review: 'authority_review',
    issue_public_notice:       'public_notice',
    close_objection_period:    'objection_period',
    resolve_objections:        'objections_resolved',
    grant_amendment:           'amendment_granted',
    refuse_amendment:          'amendment_refused',
    file_appeal:               'appeal_filed',
    determine_appeal:          'appeal_determined',
    flag_sla_breach:           current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as LandAmendmentAction];
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

  if (action === 'complete_survey')    extraCols.survey_completed_at = nowIso;
  if (action === 'grant_amendment')    extraCols.amendment_granted_at = nowIso;
  if (action === 'refuse_amendment')   extraCols.amendment_refused_at = nowIso;
  if (action === 'file_appeal')        extraCols.appeal_filed_at = nowIso;
  if (action === 'determine_appeal')   extraCols.appeal_determined_at = nowIso;
  if (action === 'flag_sla_breach')    extraCols.sla_breached = 1;

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
    ? crossesIntoRegulator(body.action as LandAmendmentAction, tier)
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
    .prepare(`UPDATE oe_ipp_land_amendments SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `lam_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_lam',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      land_area_hectares: row.land_area_hectares,
      amendment_category: row.amendment_category,
      counterparty_name: row.counterparty_name ?? null,
      deeds_office_reference: row.deeds_office_reference ?? null,
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
