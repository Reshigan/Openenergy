// ═══════════════════════════════════════════════════════════════════════════
// Wave 165 — IPP Grid Code Compliance chain (P6)
//
// NERSA Grid Code / NRS 048 — annual grid code compliance assessment covering
// power quality, protection relay, fault ride-through, reactive power,
// frequency response and earthing/bonding categories. IPPs must demonstrate
// compliance through witnessed testing, formal reporting and NERSA acceptance.
//
// Mounted at /api/ipp-grid-compliance.
//
// INVERTED SLA: larger installed capacity → more scrutiny → MORE time.
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

type CapacityTier = 'small' | 'medium' | 'large' | 'utility' | 'strategic';

type ComplianceCategory =
  | 'power_quality'
  | 'protection_relay'
  | 'fault_ride_through'
  | 'reactive_power'
  | 'frequency_response'
  | 'earthing_bonding';

type GridComplianceStatus =
  | 'assessment_due'
  | 'test_preparation'
  | 'testing_in_progress'
  | 'test_completed'
  | 'report_drafted'
  | 'submitted_to_nersa'
  | 'nersa_review'
  | 'deficiency_noted'
  | 'corrective_action'
  | 'verification_pending'
  | 'compliant'
  | 'non_compliant_notice';

type GridComplianceAction =
  | 'commence_preparation'
  | 'commence_testing'
  | 'complete_testing'
  | 'draft_report'
  | 'submit_to_nersa'
  | 'commence_nersa_review'
  | 'note_deficiency'
  | 'commence_corrective_action'
  | 'submit_for_verification'
  | 'certify_compliant'
  | 'issue_non_compliance';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveCapacityTier(capacity_mw: number): CapacityTier {
  if (capacity_mw < 10)  return 'small';
  if (capacity_mw < 50)  return 'medium';
  if (capacity_mw < 200) return 'large';
  if (capacity_mw < 500) return 'utility';
  return 'strategic';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<CapacityTier, number> = {
  small:    21,
  medium:   30,
  large:    45,
  utility:  60,
  strategic: 90,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<GridComplianceStatus>([
  'compliant',
  'non_compliant_notice',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<GridComplianceAction, { from: GridComplianceStatus[] }> = {
  commence_preparation:       { from: ['assessment_due'] },
  commence_testing:           { from: ['test_preparation'] },
  complete_testing:           { from: ['testing_in_progress'] },
  draft_report:               { from: ['test_completed'] },
  submit_to_nersa:            { from: ['report_drafted'] },
  commence_nersa_review:      { from: ['submitted_to_nersa'] },
  note_deficiency:            { from: ['nersa_review'] },
  commence_corrective_action: { from: ['deficiency_noted'] },
  submit_for_verification:    { from: ['corrective_action'] },
  certify_compliant:          { from: ['nersa_review', 'verification_pending'] },
  issue_non_compliance:       { from: ['nersa_review', 'verification_pending'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<CapacityTier>(['small', 'medium', 'large', 'utility', 'strategic']);

function crossesIntoRegulator(action: GridComplianceAction, tier: CapacityTier): boolean {
  if (action === 'issue_non_compliance') return ALL_TIERS.has(tier);
  if (action === 'certify_compliant')    return tier === 'utility' || tier === 'strategic';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: CapacityTier): boolean {
  return tier === 'utility' || tier === 'strategic';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippGridComplianceSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, capacity_tier FROM oe_ipp_grid_compliance
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; capacity_tier: CapacityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_grid_compliance SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_gcc.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_gcc',
      entity_id: row.id,
      data: {
        capacity_tier: row.capacity_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.capacity_tier),
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
    compliance_category,
    assessment_year,
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
  if (project_id)         { clauses.push('project_id = ?');          binds.push(project_id); }
  if (status)             { clauses.push('chain_status = ?');         binds.push(status); }
  if (tier)               { clauses.push('capacity_tier = ?');        binds.push(tier); }
  if (compliance_category){ clauses.push('compliance_category = ?');  binds.push(compliance_category); }
  if (assessment_year)    { clauses.push('assessment_year = ?');      binds.push(parseInt(assessment_year)); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_grid_compliance ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_grid_compliance ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'compliant' THEN 1 ELSE 0 END) as compliant_count,
           SUM(CASE WHEN chain_status = 'non_compliant_notice' THEN 1 ELSE 0 END) as non_compliant_count,
           SUM(CASE WHEN chain_status = 'deficiency_noted' OR chain_status = 'corrective_action' THEN 1 ELSE 0 END) as deficiency_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count
         FROM oe_ipp_grid_compliance ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_grid_compliance WHERE id = ?')
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
       WHERE entity_type = 'ipp_gcc' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new grid compliance assessment record ──────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    compliance_category: ComplianceCategory;
    assessment_year: number;
    capacity_mw: number;
    nersa_reference?: string;
  }>();

  if (
    !body.project_id ||
    body.capacity_mw == null ||
    !body.compliance_category ||
    body.assessment_year == null
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, compliance_category, assessment_year, capacity_mw are required',
      },
      400,
    );
  }

  const tier = deriveCapacityTier(body.capacity_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_gcc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 18 columns exactly:
  // id, participant_id, project_id, compliance_category, assessment_year,
  // capacity_mw, capacity_tier, nersa_reference, chain_status,
  // sla_due_at, sla_breached, submitted_to_nersa_at, deficiency_noted_at,
  // corrective_action_due_at, compliant_at, non_compliant_at,
  // created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_grid_compliance
         (id, participant_id, project_id, compliance_category, assessment_year,
          capacity_mw, capacity_tier, nersa_reference, chain_status,
          sla_due_at, sla_breached, submitted_to_nersa_at, deficiency_noted_at,
          corrective_action_due_at, compliant_at, non_compliant_at,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.compliance_category,
      body.assessment_year,
      body.capacity_mw,
      tier,
      body.nersa_reference ?? null,
      'assessment_due',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_gcc.created',
    actor_id: user.id,
    entity_type: 'ipp_gcc',
    entity_id: id,
    data: {
      tier,
      capacity_mw: body.capacity_mw,
      compliance_category: body.compliance_category,
      assessment_year: body.assessment_year,
      nersa_reference: body.nersa_reference ?? null,
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
    action: GridComplianceAction | 'flag_sla_breach';
    notes?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_grid_compliance WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as GridComplianceStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.capacity_tier as CapacityTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  type AnyAction = GridComplianceAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, GridComplianceStatus> = {
    commence_preparation:       'test_preparation',
    commence_testing:           'testing_in_progress',
    complete_testing:           'test_completed',
    draft_report:               'report_drafted',
    submit_to_nersa:            'submitted_to_nersa',
    commence_nersa_review:      'nersa_review',
    note_deficiency:            'deficiency_noted',
    commence_corrective_action: 'corrective_action',
    submit_for_verification:    'verification_pending',
    certify_compliant:          'compliant',
    issue_non_compliance:       'non_compliant_notice',
    flag_sla_breach:            current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as GridComplianceAction];
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

  if (action === 'submit_to_nersa')    extraCols.submitted_to_nersa_at = nowIso;
  if (action === 'note_deficiency') {
    extraCols.deficiency_noted_at = nowIso;
    // corrective_action_due_at = now + 30 days for any tier
    extraCols.corrective_action_due_at = new Date(now.getTime() + 30 * 24 * 3_600_000).toISOString();
  }
  if (action === 'certify_compliant')  extraCols.compliant_at = nowIso;
  if (action === 'issue_non_compliance') extraCols.non_compliant_at = nowIso;
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
    ? crossesIntoRegulator(body.action as GridComplianceAction, tier)
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
    .prepare(`UPDATE oe_ipp_grid_compliance SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `gcc_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_gcc',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      capacity_mw: row.capacity_mw,
      compliance_category: row.compliance_category,
      assessment_year: row.assessment_year,
      nersa_reference: row.nersa_reference ?? null,
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
