// ═══════════════════════════════════════════════════════════════════════════
// Wave 166 — IPP Connection Cost Contribution (CCC) chain (P6)
//
// NERSA Grid Code / NRS 048 — connection cost contribution negotiation
// covering the capital cost of network augmentation required to connect an
// IPP generation facility. Involves load-flow studies, cost assessment,
// IPP review, negotiation and, if required, expert determination or formal
// NERSA adjudication.
//
// Mounted at /api/ipp-ccc.
//
// INVERTED SLA: larger CCC amount → more scrutiny → MORE time.
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

type CccTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

type CccCategory =
  | 'line_extension'
  | 'substation_upgrade'
  | 'protection_relay'
  | 'reactive_compensation'
  | 'metering_telecoms'
  | 'combined';

type CccStatus =
  | 'ccc_initiated'
  | 'load_flow_study'
  | 'cost_assessment'
  | 'ipp_review'
  | 'negotiation_in_progress'
  | 'expert_determination'
  | 'provisional_agreement'
  | 'dispute_filed'
  | 'arbitration_in_progress'
  | 'ccc_agreed'
  | 'ccc_rejected'
  | 'regulatory_determination';

type CccAction =
  | 'commission_load_flow_study'
  | 'complete_cost_assessment'
  | 'submit_for_ipp_review'
  | 'commence_negotiation'
  | 'refer_to_expert'
  | 'accept_expert_determination'
  | 'reach_provisional_agreement'
  | 'file_dispute'
  | 'commence_arbitration'
  | 'agree_ccc'
  | 'reject_ccc'
  | 'refer_to_nersa';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveCccTier(ccc_amount_zar: number): CccTier {
  if (ccc_amount_zar < 5_000_000)   return 'minor';
  if (ccc_amount_zar < 25_000_000)  return 'moderate';
  if (ccc_amount_zar < 100_000_000) return 'significant';
  if (ccc_amount_zar < 500_000_000) return 'major';
  return 'material';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<CccTier, number> = {
  minor:       30,
  moderate:    45,
  significant: 60,
  major:       90,
  material:    120,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<CccStatus>([
  'ccc_agreed',
  'ccc_rejected',
  'regulatory_determination',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<CccAction, { from: CccStatus[] }> = {
  commission_load_flow_study:  { from: ['ccc_initiated'] },
  complete_cost_assessment:    { from: ['load_flow_study'] },
  submit_for_ipp_review:       { from: ['cost_assessment'] },
  commence_negotiation:        { from: ['ipp_review'] },
  refer_to_expert:             { from: ['negotiation_in_progress'] },
  accept_expert_determination: { from: ['expert_determination'] },
  reach_provisional_agreement: { from: ['negotiation_in_progress', 'expert_determination'] },
  file_dispute:                { from: ['provisional_agreement', 'ipp_review'] },
  commence_arbitration:        { from: ['dispute_filed'] },
  agree_ccc:                   { from: ['provisional_agreement', 'arbitration_in_progress'] },
  reject_ccc:                  { from: ['arbitration_in_progress', 'provisional_agreement'] },
  refer_to_nersa:              { from: ['dispute_filed', 'arbitration_in_progress'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<CccTier>(['minor', 'moderate', 'significant', 'major', 'material']);

function crossesIntoRegulator(action: CccAction, tier: CccTier): boolean {
  if (action === 'reject_ccc')    return ALL_TIERS.has(tier);
  if (action === 'refer_to_nersa') return ALL_TIERS.has(tier);
  if (action === 'agree_ccc')     return tier === 'major' || tier === 'material';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: CccTier): boolean {
  return tier === 'major' || tier === 'material';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippCccSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, ccc_tier FROM oe_ipp_ccc_negotiations
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; ccc_tier: CccTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_ccc_negotiations SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_ccc.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_ccc',
      entity_id: row.id,
      data: {
        ccc_tier: row.ccc_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.ccc_tier),
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
    ccc_category,
    network_operator,
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
  if (project_id)      { clauses.push('project_id = ?');      binds.push(project_id); }
  if (status)          { clauses.push('chain_status = ?');     binds.push(status); }
  if (tier)            { clauses.push('ccc_tier = ?');         binds.push(tier); }
  if (ccc_category)    { clauses.push('ccc_category = ?');     binds.push(ccc_category); }
  if (network_operator){ clauses.push('network_operator = ?'); binds.push(network_operator); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_ccc_negotiations ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_ccc_negotiations ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'ccc_agreed' THEN 1 ELSE 0 END) as agreed_count,
           SUM(CASE WHEN chain_status = 'ccc_rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'dispute_filed' OR chain_status = 'arbitration_in_progress' THEN 1 ELSE 0 END) as dispute_count,
           SUM(CASE WHEN chain_status = 'regulatory_determination' THEN 1 ELSE 0 END) as regulatory_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(ccc_amount_zar) as total_ccc_amount_zar
         FROM oe_ipp_ccc_negotiations ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_ccc_negotiations WHERE id = ?')
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
       WHERE entity_type = 'ipp_ccc' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new CCC negotiation record ────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    ccc_category: CccCategory;
    ccc_amount_zar: number;
    network_operator: string;
    grid_connection_ref?: string | null;
  }>();

  if (
    !body.project_id ||
    body.ccc_amount_zar == null ||
    !body.ccc_category ||
    !body.network_operator
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, ccc_category, ccc_amount_zar, network_operator are required',
      },
      400,
    );
  }

  const tier = deriveCccTier(body.ccc_amount_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_ccc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 18 columns exactly:
  // id, participant_id, project_id, ccc_category, ccc_amount_zar,
  // ccc_tier, network_operator, grid_connection_ref, chain_status,
  // sla_due_at, sla_breached, expert_appointed_at, provisional_agreement_at,
  // ccc_agreed_at, ccc_rejected_at, nersa_referral_at,
  // created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_ccc_negotiations
         (id, participant_id, project_id, ccc_category, ccc_amount_zar,
          ccc_tier, network_operator, grid_connection_ref, chain_status,
          sla_due_at, sla_breached, expert_appointed_at, provisional_agreement_at,
          ccc_agreed_at, ccc_rejected_at, nersa_referral_at,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.ccc_category,
      body.ccc_amount_zar,
      tier,
      body.network_operator,
      body.grid_connection_ref ?? null,
      'ccc_initiated',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_ccc.created',
    actor_id: user.id,
    entity_type: 'ipp_ccc',
    entity_id: id,
    data: {
      tier,
      ccc_amount_zar: body.ccc_amount_zar,
      ccc_category: body.ccc_category,
      network_operator: body.network_operator,
      grid_connection_ref: body.grid_connection_ref ?? null,
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
    action: CccAction | 'flag_sla_breach';
    notes?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_ccc_negotiations WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as CccStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.ccc_tier as CccTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  type AnyAction = CccAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, CccStatus> = {
    commission_load_flow_study:  'load_flow_study',
    complete_cost_assessment:    'cost_assessment',
    submit_for_ipp_review:       'ipp_review',
    commence_negotiation:        'negotiation_in_progress',
    refer_to_expert:             'expert_determination',
    accept_expert_determination: 'ipp_review',
    reach_provisional_agreement: 'provisional_agreement',
    file_dispute:                'dispute_filed',
    commence_arbitration:        'arbitration_in_progress',
    agree_ccc:                   'ccc_agreed',
    reject_ccc:                  'ccc_rejected',
    refer_to_nersa:              'regulatory_determination',
    flag_sla_breach:             current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as CccAction];
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

  if (action === 'refer_to_expert')             extraCols.expert_appointed_at = nowIso;
  if (action === 'reach_provisional_agreement') extraCols.provisional_agreement_at = nowIso;
  if (action === 'agree_ccc')                   extraCols.ccc_agreed_at = nowIso;
  if (action === 'reject_ccc')                  extraCols.ccc_rejected_at = nowIso;
  if (action === 'refer_to_nersa')              extraCols.nersa_referral_at = nowIso;
  if (action === 'flag_sla_breach')             extraCols.sla_breached = 1;

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
    ? crossesIntoRegulator(body.action as CccAction, tier)
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
    .prepare(`UPDATE oe_ipp_ccc_negotiations SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `ccc_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_ccc',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      ccc_amount_zar: row.ccc_amount_zar,
      ccc_category: row.ccc_category,
      network_operator: row.network_operator,
      grid_connection_ref: row.grid_connection_ref ?? null,
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
