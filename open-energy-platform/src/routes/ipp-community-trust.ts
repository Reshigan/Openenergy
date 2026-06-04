// ═══════════════════════════════════════════════════════════════════════════
// Wave 164 — IPP Community Trust Reporting chain (P6)
//
// B-BBEE Act / REIPPPP ED commitments — annual community trust disbursement
// reporting to the DTIC. Covers equity dividends, socio-economic development,
// enterprise development, education bursaries and infrastructure upliftment.
// Reports must pass trustee review and IPP internal review before submission;
// DTIC may raise queries requiring formal responses before acceptance.
//
// Mounted at /api/ipp-community-trust.
//
// INVERTED SLA: larger disbursement amount → more scrutiny → MORE time.
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

type DisbursementTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

type TrustCategory =
  | 'equity_dividend'
  | 'socio_economic_development'
  | 'enterprise_development'
  | 'education_bursary'
  | 'infrastructure_upliftment';

type CommunityTrustStatus =
  | 'report_due'
  | 'data_preparation'
  | 'trustee_review'
  | 'report_drafted'
  | 'ipp_review'
  | 'submitted_to_dtic'
  | 'dtic_review'
  | 'queries_raised'
  | 'responses_submitted'
  | 'report_accepted'
  | 'report_rejected'
  | 'appeal_filed'
  | 'appeal_determined';

type CommunityTrustAction =
  | 'commence_data_preparation'
  | 'submit_to_trustees'
  | 'complete_trustee_review'
  | 'complete_ipp_review'
  | 'submit_to_dtic'
  | 'commence_dtic_review'
  | 'raise_queries'
  | 'submit_responses'
  | 'accept_report'
  | 'reject_report'
  | 'file_appeal'
  | 'determine_appeal';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveDisbursementTier(disbursement_amount_zar: number): DisbursementTier {
  if (disbursement_amount_zar < 1_000_000)   return 'minor';
  if (disbursement_amount_zar < 5_000_000)   return 'moderate';
  if (disbursement_amount_zar < 20_000_000)  return 'significant';
  if (disbursement_amount_zar < 100_000_000) return 'major';
  return 'material';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<DisbursementTier, number> = {
  minor:       21,
  moderate:    30,
  significant: 45,
  major:       60,
  material:    90,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<CommunityTrustStatus>([
  'report_accepted',
  'report_rejected',
  'appeal_determined',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<CommunityTrustAction, { from: CommunityTrustStatus[] }> = {
  commence_data_preparation: { from: ['report_due'] },
  submit_to_trustees:        { from: ['data_preparation'] },
  complete_trustee_review:   { from: ['trustee_review'] },
  complete_ipp_review:       { from: ['report_drafted', 'ipp_review'] },
  submit_to_dtic:            { from: ['ipp_review'] },
  commence_dtic_review:      { from: ['submitted_to_dtic'] },
  raise_queries:             { from: ['dtic_review'] },
  submit_responses:          { from: ['queries_raised'] },
  accept_report:             { from: ['dtic_review', 'responses_submitted'] },
  reject_report:             { from: ['dtic_review', 'responses_submitted'] },
  file_appeal:               { from: ['report_rejected'] },
  determine_appeal:          { from: ['appeal_filed'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<DisbursementTier>(['minor', 'moderate', 'significant', 'major', 'material']);

function crossesIntoRegulator(action: CommunityTrustAction, tier: DisbursementTier): boolean {
  if (action === 'reject_report')    return ALL_TIERS.has(tier);
  if (action === 'determine_appeal') return ALL_TIERS.has(tier);
  if (action === 'accept_report')    return tier === 'major' || tier === 'material';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: DisbursementTier): boolean {
  return tier === 'major' || tier === 'material';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippCommunityTrustSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, disbursement_tier FROM oe_ipp_community_trust_reports
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; disbursement_tier: DisbursementTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_community_trust_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_ctr.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_ctr',
      entity_id: row.id,
      data: {
        disbursement_tier: row.disbursement_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.disbursement_tier),
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
    trust_category,
    reporting_year,
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
  if (project_id)     { clauses.push('project_id = ?');        binds.push(project_id); }
  if (status)         { clauses.push('chain_status = ?');       binds.push(status); }
  if (tier)           { clauses.push('disbursement_tier = ?');  binds.push(tier); }
  if (trust_category) { clauses.push('trust_category = ?');     binds.push(trust_category); }
  if (reporting_year) { clauses.push('reporting_year = ?');     binds.push(parseInt(reporting_year)); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_community_trust_reports ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_community_trust_reports ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'report_accepted' THEN 1 ELSE 0 END) as accepted_count,
           SUM(CASE WHEN chain_status = 'report_rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status IN ('appeal_filed','appeal_determined') THEN 1 ELSE 0 END) as appeal_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(CASE WHEN chain_status = 'report_accepted' THEN disbursement_amount_zar ELSE 0 END) as total_accepted_zar
         FROM oe_ipp_community_trust_reports ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_community_trust_reports WHERE id = ?')
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
       WHERE entity_type = 'ipp_ctr' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new community trust report record ─────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    trust_category: TrustCategory;
    reporting_year: number;
    disbursement_amount_zar: number;
    trust_name?: string;
  }>();

  if (
    !body.project_id ||
    body.disbursement_amount_zar == null ||
    !body.trust_category ||
    body.reporting_year == null
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, trust_category, reporting_year, disbursement_amount_zar are required',
      },
      400,
    );
  }

  const tier = deriveDisbursementTier(body.disbursement_amount_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_ctr_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 18 columns exactly:
  // id, participant_id, project_id, trust_category, reporting_year,
  // disbursement_amount_zar, disbursement_tier, trust_name, chain_status,
  // sla_due_at, sla_breached, submitted_to_dtic_at, report_accepted_at,
  // report_rejected_at, appeal_filed_at, appeal_determined_at,
  // created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_community_trust_reports
         (id, participant_id, project_id, trust_category, reporting_year,
          disbursement_amount_zar, disbursement_tier, trust_name, chain_status,
          sla_due_at, sla_breached, submitted_to_dtic_at, report_accepted_at,
          report_rejected_at, appeal_filed_at, appeal_determined_at,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.trust_category,
      body.reporting_year,
      body.disbursement_amount_zar,
      tier,
      body.trust_name ?? null,
      'report_due',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_ctr.created',
    actor_id: user.id,
    entity_type: 'ipp_ctr',
    entity_id: id,
    data: {
      tier,
      disbursement_amount_zar: body.disbursement_amount_zar,
      trust_category: body.trust_category,
      reporting_year: body.reporting_year,
      trust_name: body.trust_name ?? null,
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
    action: CommunityTrustAction | 'flag_sla_breach';
    notes?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_community_trust_reports WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as CommunityTrustStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.disbursement_tier as DisbursementTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  type AnyAction = CommunityTrustAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, CommunityTrustStatus> = {
    commence_data_preparation: 'data_preparation',
    submit_to_trustees:        'trustee_review',
    complete_trustee_review:   'report_drafted',
    complete_ipp_review:       'ipp_review',
    submit_to_dtic:            'submitted_to_dtic',
    commence_dtic_review:      'dtic_review',
    raise_queries:             'queries_raised',
    submit_responses:          'responses_submitted',
    accept_report:             'report_accepted',
    reject_report:             'report_rejected',
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
    const rule = VALID_TRANSITIONS[body.action as CommunityTrustAction];
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

  if (action === 'submit_to_dtic')    extraCols.submitted_to_dtic_at = nowIso;
  if (action === 'accept_report')     extraCols.report_accepted_at = nowIso;
  if (action === 'reject_report')     extraCols.report_rejected_at = nowIso;
  if (action === 'file_appeal')       extraCols.appeal_filed_at = nowIso;
  if (action === 'determine_appeal')  extraCols.appeal_determined_at = nowIso;
  if (action === 'flag_sla_breach')   extraCols.sla_breached = 1;

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
    ? crossesIntoRegulator(body.action as CommunityTrustAction, tier)
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
    .prepare(`UPDATE oe_ipp_community_trust_reports SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `ctr_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_ctr',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      disbursement_amount_zar: row.disbursement_amount_zar,
      trust_category: row.trust_category,
      reporting_year: row.reporting_year,
      trust_name: row.trust_name ?? null,
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
