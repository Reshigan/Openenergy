// ═══════════════════════════════════════════════════════════════════════════
// Wave 168 — IPP Bankability Feasibility Study (BFS) chain (P6)
//
// BFS lifecycle covering scope definition, data collection, analysis,
// draft issuance, peer review, IPP comments, independent engineer (IE)
// review, query/response cycles and final certification or rejection.
//
// Mounted at /api/ipp-bfs.
//
// INVERTED SLA: larger capacity_mw → more scrutiny → MORE time.
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

type BfsCapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

type TriggerCategory =
  | 'scope_change'
  | 'component_substitution'
  | 'tariff_rebid'
  | 'resource_update'
  | 'periodic_refresh'
  | 'lender_request';

type BfsStatus =
  | 'bfs_triggered'
  | 'scope_definition'
  | 'data_collection'
  | 'analysis_in_progress'
  | 'draft_bfs_issued'
  | 'peer_review'
  | 'ipp_comments_submitted'
  | 'ie_review'
  | 'queries_raised'
  | 'responses_submitted'
  | 'bfs_certified'
  | 'bfs_rejected';

type BfsAction =
  | 'define_scope'
  | 'commence_data_collection'
  | 'commence_analysis'
  | 'issue_draft_bfs'
  | 'commence_peer_review'
  | 'submit_ipp_comments'
  | 'submit_to_ie'
  | 'raise_queries'
  | 'submit_responses'
  | 'certify_bfs'
  | 'reject_bfs';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveBfsCapacityTier(capacity_mw: number): BfsCapacityTier {
  if (capacity_mw < 10)  return 'small';
  if (capacity_mw < 50)  return 'medium';
  if (capacity_mw < 200) return 'large';
  if (capacity_mw < 500) return 'utility';
  return 'strategic';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<BfsCapacityTier, number> = {
  small:    30,
  medium:   45,
  large:    60,
  utility:  90,
  strategic: 120,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<BfsStatus>([
  'bfs_certified',
  'bfs_rejected',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<BfsAction, { from: BfsStatus[] }> = {
  define_scope:             { from: ['bfs_triggered'] },
  commence_data_collection: { from: ['scope_definition'] },
  commence_analysis:        { from: ['data_collection'] },
  issue_draft_bfs:          { from: ['analysis_in_progress'] },
  commence_peer_review:     { from: ['draft_bfs_issued'] },
  submit_ipp_comments:      { from: ['peer_review', 'draft_bfs_issued'] },
  submit_to_ie:             { from: ['ipp_comments_submitted', 'peer_review'] },
  raise_queries:            { from: ['ie_review'] },
  submit_responses:         { from: ['queries_raised'] },
  certify_bfs:              { from: ['ie_review', 'responses_submitted'] },
  reject_bfs:               { from: ['ie_review', 'responses_submitted'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<BfsCapacityTier>(['small', 'medium', 'large', 'utility', 'strategic']);

function crossesIntoRegulator(action: BfsAction, tier: BfsCapacityTier): boolean {
  if (action === 'reject_bfs')  return ALL_TIERS.has(tier);
  if (action === 'certify_bfs') return tier === 'utility' || tier === 'strategic';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: BfsCapacityTier): boolean {
  return tier === 'utility' || tier === 'strategic';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippBfsSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, bfs_capacity_tier FROM oe_ipp_bfs_studies
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; bfs_capacity_tier: BfsCapacityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_bfs_studies SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_bfs.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_bfs',
      entity_id: row.id,
      data: {
        bfs_capacity_tier: row.bfs_capacity_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.bfs_capacity_tier),
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
    trigger_category,
    ie_firm_name,
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
  if (project_id)       { clauses.push('project_id = ?');         binds.push(project_id); }
  if (status)           { clauses.push('chain_status = ?');        binds.push(status); }
  if (tier)             { clauses.push('bfs_capacity_tier = ?');   binds.push(tier); }
  if (trigger_category) { clauses.push('trigger_category = ?');    binds.push(trigger_category); }
  if (ie_firm_name)     { clauses.push('ie_firm_name = ?');        binds.push(ie_firm_name); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_bfs_studies ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_bfs_studies ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'bfs_certified' THEN 1 ELSE 0 END) as certified_count,
           SUM(CASE WHEN chain_status = 'bfs_rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'ie_review' OR chain_status = 'queries_raised' THEN 1 ELSE 0 END) as ie_active_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(capacity_mw) as total_capacity_mw,
           SUM(p50_yield_gwh) as total_p50_yield_gwh,
           SUM(p90_yield_gwh) as total_p90_yield_gwh
         FROM oe_ipp_bfs_studies ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_bfs_studies WHERE id = ?')
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
       WHERE entity_type = 'ipp_bfs' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new BFS record ────────────────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    trigger_category: TriggerCategory;
    capacity_mw: number;
    ie_firm_name?: string | null;
    bfs_reference?: string | null;
  }>();

  if (
    !body.project_id ||
    body.capacity_mw == null ||
    !body.trigger_category
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, trigger_category, capacity_mw are required',
      },
      400,
    );
  }

  const tier = deriveBfsCapacityTier(body.capacity_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_bfs_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 18 columns exactly:
  // id, participant_id, project_id, trigger_category, capacity_mw,
  // bfs_capacity_tier, ie_firm_name, bfs_reference, p50_yield_gwh, p90_yield_gwh,
  // chain_status, sla_due_at, sla_breached, submitted_to_ie_at,
  // bfs_certified_at, bfs_rejected_at, created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_bfs_studies
         (id, participant_id, project_id, trigger_category, capacity_mw,
          bfs_capacity_tier, ie_firm_name, bfs_reference, p50_yield_gwh, p90_yield_gwh,
          chain_status, sla_due_at, sla_breached, submitted_to_ie_at,
          bfs_certified_at, bfs_rejected_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,?,0,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.trigger_category,
      body.capacity_mw,
      tier,
      body.ie_firm_name ?? null,
      body.bfs_reference ?? null,
      'bfs_triggered',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_bfs.created',
    actor_id: user.id,
    entity_type: 'ipp_bfs',
    entity_id: id,
    data: {
      tier,
      capacity_mw: body.capacity_mw,
      trigger_category: body.trigger_category,
      ie_firm_name: body.ie_firm_name ?? null,
      bfs_reference: body.bfs_reference ?? null,
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
    action: BfsAction | 'flag_sla_breach';
    notes?: string;
    reason?: string;
    p50_yield_gwh?: number | null;
    p90_yield_gwh?: number | null;
    ie_firm_name?: string | null;
    bfs_reference?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_bfs_studies WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as BfsStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.bfs_capacity_tier as BfsCapacityTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  type AnyAction = BfsAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, BfsStatus> = {
    define_scope:             'scope_definition',
    commence_data_collection: 'data_collection',
    commence_analysis:        'analysis_in_progress',
    issue_draft_bfs:          'draft_bfs_issued',
    commence_peer_review:     'peer_review',
    submit_ipp_comments:      'ipp_comments_submitted',
    submit_to_ie:             'ie_review',
    raise_queries:            'queries_raised',
    submit_responses:         'responses_submitted',
    certify_bfs:              'bfs_certified',
    reject_bfs:               'bfs_rejected',
    flag_sla_breach:          current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as BfsAction];
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

  if (action === 'submit_to_ie')  extraCols.submitted_to_ie_at = nowIso;
  if (action === 'certify_bfs')   extraCols.bfs_certified_at   = nowIso;
  if (action === 'reject_bfs')    extraCols.bfs_rejected_at    = nowIso;
  if (action === 'flag_sla_breach') extraCols.sla_breached = 1;

  // Allow updating p50/p90 yield when commencing analysis or at any point before terminal.
  if (body.p50_yield_gwh != null) extraCols.p50_yield_gwh = body.p50_yield_gwh;
  if (body.p90_yield_gwh != null) extraCols.p90_yield_gwh = body.p90_yield_gwh;

  // Allow capturing IE firm name when submitting to IE.
  if (action === 'submit_to_ie' && body.ie_firm_name) {
    extraCols.ie_firm_name = body.ie_firm_name;
  }

  // Allow capturing BFS reference once issued.
  if (action === 'issue_draft_bfs' && body.bfs_reference) {
    extraCols.bfs_reference = body.bfs_reference;
  }

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
    ? crossesIntoRegulator(body.action as BfsAction, tier)
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
    .prepare(`UPDATE oe_ipp_bfs_studies SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `bfs_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_bfs',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      capacity_mw: row.capacity_mw,
      trigger_category: row.trigger_category,
      ie_firm_name: (extraCols.ie_firm_name ?? row.ie_firm_name) ?? null,
      bfs_reference: (extraCols.bfs_reference ?? row.bfs_reference) ?? null,
      p50_yield_gwh: (extraCols.p50_yield_gwh ?? row.p50_yield_gwh) ?? null,
      p90_yield_gwh: (extraCols.p90_yield_gwh ?? row.p90_yield_gwh) ?? null,
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
