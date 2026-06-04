// ═══════════════════════════════════════════════════════════════════════════
// Wave 167 — IPP O&M Contract Renewal chain (P6)
//
// O&M contract renewal lifecycle covering market sounding, tender process,
// bid evaluation, preferred bidder selection, lender consent, NERSA
// acknowledgement and contract execution (or novation where the incumbent
// contractor is assigned to a new project entity).
//
// Mounted at /api/ipp-om-contract.
//
// INVERTED SLA: larger annual O&M value → more scrutiny → MORE time.
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

type OmValueTier = 'minor' | 'moderate' | 'significant' | 'major' | 'material';

type OmContractCategory =
  | 'full_om'
  | 'maintenance_only'
  | 'operations_only'
  | 'asset_management'
  | 'specialist_equipment'
  | 'novation';

type OmContractStatus =
  | 'renewal_triggered'
  | 'market_sounding'
  | 'tender_issued'
  | 'bids_received'
  | 'evaluation_complete'
  | 'preferred_bidder_selected'
  | 'lender_consent'
  | 'nersa_acknowledgement'
  | 'contract_executed'
  | 'renewal_failed'
  | 'novation_pending'
  | 'novation_executed';

type OmContractAction =
  | 'commence_market_sounding'
  | 'issue_tender'
  | 'close_bids'
  | 'complete_evaluation'
  | 'select_preferred_bidder'
  | 'obtain_lender_consent'
  | 'obtain_nersa_acknowledgement'
  | 'execute_contract'
  | 'declare_renewal_failed'
  | 'trigger_novation'
  | 'execute_novation';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveOmValueTier(annual_om_value_zar: number): OmValueTier {
  if (annual_om_value_zar < 2_000_000)   return 'minor';
  if (annual_om_value_zar < 10_000_000)  return 'moderate';
  if (annual_om_value_zar < 50_000_000)  return 'significant';
  if (annual_om_value_zar < 200_000_000) return 'major';
  return 'material';
}

// ─── SLA constants (INVERTED) ────────────────────────────────────────────────

const SLA_DAYS: Record<OmValueTier, number> = {
  minor:       21,
  moderate:    30,
  significant: 45,
  major:       60,
  material:    90,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<OmContractStatus>([
  'contract_executed',
  'renewal_failed',
  'novation_executed',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<OmContractAction, { from: OmContractStatus[] }> = {
  commence_market_sounding:     { from: ['renewal_triggered'] },
  issue_tender:                 { from: ['market_sounding'] },
  close_bids:                   { from: ['tender_issued'] },
  complete_evaluation:          { from: ['bids_received'] },
  select_preferred_bidder:      { from: ['evaluation_complete'] },
  obtain_lender_consent:        { from: ['preferred_bidder_selected'] },
  obtain_nersa_acknowledgement: { from: ['lender_consent'] },
  execute_contract:             { from: ['nersa_acknowledgement', 'lender_consent'] },
  declare_renewal_failed:       { from: ['market_sounding', 'tender_issued', 'bids_received', 'evaluation_complete', 'lender_consent'] },
  trigger_novation:             { from: ['renewal_triggered', 'renewal_failed'] },
  execute_novation:             { from: ['novation_pending'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<OmValueTier>(['minor', 'moderate', 'significant', 'major', 'material']);

function crossesIntoRegulator(action: OmContractAction, tier: OmValueTier): boolean {
  if (action === 'declare_renewal_failed') return ALL_TIERS.has(tier);
  if (action === 'execute_novation')       return tier === 'significant' || tier === 'major' || tier === 'material';
  if (action === 'execute_contract')       return tier === 'major' || tier === 'material';
  return false;
}

function slaBreachCrossesIntoRegulator(tier: OmValueTier): boolean {
  return tier === 'major' || tier === 'material';
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippOmContractSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, om_value_tier FROM oe_ipp_om_contracts
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; om_value_tier: OmValueTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_om_contracts SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_omc.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_omc',
      entity_id: row.id,
      data: {
        om_value_tier: row.om_value_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.om_value_tier),
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
    om_contract_category,
    contractor_name,
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
  if (project_id)          { clauses.push('project_id = ?');          binds.push(project_id); }
  if (status)              { clauses.push('chain_status = ?');         binds.push(status); }
  if (tier)                { clauses.push('om_value_tier = ?');        binds.push(tier); }
  if (om_contract_category){ clauses.push('om_contract_category = ?'); binds.push(om_contract_category); }
  if (contractor_name)     { clauses.push('contractor_name = ?');      binds.push(contractor_name); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_om_contracts ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_om_contracts ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'contract_executed' THEN 1 ELSE 0 END) as executed_count,
           SUM(CASE WHEN chain_status = 'renewal_failed' THEN 1 ELSE 0 END) as failed_count,
           SUM(CASE WHEN chain_status = 'novation_executed' THEN 1 ELSE 0 END) as novation_count,
           SUM(CASE WHEN chain_status = 'lender_consent' OR chain_status = 'nersa_acknowledgement' THEN 1 ELSE 0 END) as consent_pending_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(annual_om_value_zar) as total_annual_om_value_zar
         FROM oe_ipp_om_contracts ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_om_contracts WHERE id = ?')
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
       WHERE entity_type = 'ipp_omc' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new O&M contract renewal record ───────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    om_contract_category: OmContractCategory;
    annual_om_value_zar: number;
    contractor_name: string;
    contract_expiry_date?: string | null;
  }>();

  if (
    !body.project_id ||
    body.annual_om_value_zar == null ||
    !body.om_contract_category ||
    !body.contractor_name
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, om_contract_category, annual_om_value_zar, contractor_name are required',
      },
      400,
    );
  }

  const tier = deriveOmValueTier(body.annual_om_value_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_omc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 18 columns exactly:
  // id, participant_id, project_id, om_contract_category, annual_om_value_zar,
  // om_value_tier, contractor_name, contract_expiry_date, chain_status,
  // sla_due_at, sla_breached, preferred_bidder_name, lender_consent_at,
  // contract_executed_at, renewal_failed_at, novation_executed_at,
  // created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_om_contracts
         (id, participant_id, project_id, om_contract_category, annual_om_value_zar,
          om_value_tier, contractor_name, contract_expiry_date, chain_status,
          sla_due_at, sla_breached, preferred_bidder_name, lender_consent_at,
          contract_executed_at, renewal_failed_at, novation_executed_at,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.om_contract_category,
      body.annual_om_value_zar,
      tier,
      body.contractor_name,
      body.contract_expiry_date ?? null,
      'renewal_triggered',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_omc.created',
    actor_id: user.id,
    entity_type: 'ipp_omc',
    entity_id: id,
    data: {
      tier,
      annual_om_value_zar: body.annual_om_value_zar,
      om_contract_category: body.om_contract_category,
      contractor_name: body.contractor_name,
      contract_expiry_date: body.contract_expiry_date ?? null,
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
    action: OmContractAction | 'flag_sla_breach';
    notes?: string;
    reason?: string;
    preferred_bidder_name?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_om_contracts WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as OmContractStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.om_value_tier as OmValueTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  type AnyAction = OmContractAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, OmContractStatus> = {
    commence_market_sounding:     'market_sounding',
    issue_tender:                 'tender_issued',
    close_bids:                   'bids_received',
    complete_evaluation:          'evaluation_complete',
    select_preferred_bidder:      'preferred_bidder_selected',
    obtain_lender_consent:        'lender_consent',
    obtain_nersa_acknowledgement: 'nersa_acknowledgement',
    execute_contract:             'contract_executed',
    declare_renewal_failed:       'renewal_failed',
    trigger_novation:             'novation_pending',
    execute_novation:             'novation_executed',
    flag_sla_breach:              current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as OmContractAction];
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

  if (action === 'obtain_lender_consent')  extraCols.lender_consent_at = nowIso;
  if (action === 'execute_contract')       extraCols.contract_executed_at = nowIso;
  if (action === 'declare_renewal_failed') extraCols.renewal_failed_at = nowIso;
  if (action === 'execute_novation')       extraCols.novation_executed_at = nowIso;
  if (action === 'select_preferred_bidder' && body.preferred_bidder_name) {
    extraCols.preferred_bidder_name = body.preferred_bidder_name;
  }
  if (action === 'flag_sla_breach')        extraCols.sla_breached = 1;

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
    ? crossesIntoRegulator(body.action as OmContractAction, tier)
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
    .prepare(`UPDATE oe_ipp_om_contracts SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `omc_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_omc',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      annual_om_value_zar: row.annual_om_value_zar,
      om_contract_category: row.om_contract_category,
      contractor_name: row.contractor_name,
      preferred_bidder_name: row.preferred_bidder_name ?? null,
      contract_expiry_date: row.contract_expiry_date ?? null,
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
