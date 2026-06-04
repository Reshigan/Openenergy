// ═══════════════════════════════════════════════════════════════════════════
// Wave 160 — IPP EPC Contractor Default & Termination chain (P6)
//
// FIDIC Silver Book Sub-Clause 15.2 (termination by employer) + REIPPPP PPA
// Schedule 3 §9 (contractor default events affecting the PPA) + ERA 2006 §35
// (material change to project resulting in licence amendment requirement).
//
// Mounted at /api/ipp-contractor-default.
//
// URGENT SLA: larger contract value → more financial exposure → TIGHTER window.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type ContractorDefaultStatus,
  type ContractorDefaultAction,
  type ContractTier,
  type DefaultCategory,
  deriveContractTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-contractor-default-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ──────────────────────────────────────────────────────────────

export async function ippContractorDefaultSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, contract_tier FROM oe_ipp_contractor_defaults
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; contract_tier: ContractTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_contractor_defaults SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_cd.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_cd',
      entity_id: row.id,
      data: {
        contract_tier: row.contract_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.contract_tier),
      },
      env,
    });
  }
}

// ─── GET / — paginated list + KPIs ────────────────────────────────────────

app.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    project_id,
    status,
    tier,
    default_category,
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
  if (project_id)       { clauses.push('project_id = ?');        binds.push(project_id); }
  if (status)           { clauses.push('chain_status = ?');       binds.push(status); }
  if (tier)             { clauses.push('contract_tier = ?');      binds.push(tier); }
  if (default_category) { clauses.push('default_category = ?');   binds.push(default_category); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_contractor_defaults ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_contractor_defaults ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status IN ('termination_notice_issued','step_in_assessed','bond_call_initiated','handover_in_progress','replacement_tendering') THEN 1 ELSE 0 END) as active_termination_count,
           SUM(CASE WHEN chain_status = 'replacement_appointed' THEN 1 ELSE 0 END) as replacement_count,
           SUM(CASE WHEN chain_status = 'settlement_agreed' THEN 1 ELSE 0 END) as settlement_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN contract_value_zar ELSE 0 END) as total_contract_value_zar
         FROM oe_ipp_contractor_defaults ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...[...HARD_TERMINALS], ...binds)
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

// ─── GET /:id — single row + audit trail ──────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_contractor_defaults WHERE id = ?')
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
       WHERE entity_type = 'ipp_cd' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new contractor default record ──────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    contract_value_zar: number;
    default_category: DefaultCategory;
    contractor_name?: string;
    contractor_reference?: string;
    description?: string;
  }>();

  if (
    !body.project_id ||
    body.contract_value_zar == null ||
    !body.default_category
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, contract_value_zar, default_category are required',
      },
      400,
    );
  }

  const tier = deriveContractTier(body.contract_value_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_cd_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 20 columns exactly:
  // id, participant_id, project_id, contract_value_zar, contract_tier, default_category,
  // contractor_name, contractor_reference, description, chain_status, sla_due_at, sla_breached,
  // default_confirmed_at, termination_issued_at, handover_completed_at,
  // replacement_appointed_at, settlement_agreed_at, withdrawn_at,
  // created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_contractor_defaults
         (id, participant_id, project_id, contract_value_zar, contract_tier, default_category,
          contractor_name, contractor_reference, description, chain_status, sla_due_at, sla_breached,
          default_confirmed_at, termination_issued_at, handover_completed_at,
          replacement_appointed_at, settlement_agreed_at, withdrawn_at,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.contract_value_zar,
      tier,
      body.default_category,
      body.contractor_name ?? null,
      body.contractor_reference ?? null,
      body.description ?? null,
      'default_identified',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_cd.created',
    actor_id: user.id,
    entity_type: 'ipp_cd',
    entity_id: id,
    data: {
      tier,
      default_category: body.default_category,
      contract_value_zar: body.contract_value_zar,
      contractor_name: body.contractor_name ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ─── PUT /:id/action — state machine dispatch ─────────────────────────────

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: ContractorDefaultAction;
    notes?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_contractor_defaults WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as ContractorDefaultStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.contract_tier as ContractTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // invoke_step_in_rights and flag_sla_breach are self-loops (fire event, stay on current).
  type AnyAction = ContractorDefaultAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, ContractorDefaultStatus> = {
    issue_default_notice:       'notice_of_default_issued',
    acknowledge_cure_period:    'cure_period_in_progress',
    confirm_default:            'default_confirmed',
    issue_termination_notice:   'termination_notice_issued',
    assess_step_in_rights:      'step_in_assessed',
    invoke_step_in_rights:      current,  // self-loop — event fired but status unchanged
    initiate_bond_call:         'bond_call_initiated',
    commence_handover:          'handover_in_progress',
    award_replacement_contract: 'replacement_tendering',
    appoint_replacement:        'replacement_appointed',
    reach_settlement:           'settlement_agreed',
    withdraw_termination:       'withdrawn',
    flag_sla_breach:            current,  // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as ContractorDefaultAction];
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

  if (action === 'confirm_default')           extraCols.default_confirmed_at = nowIso;
  if (action === 'issue_termination_notice')  extraCols.termination_issued_at = nowIso;
  if (action === 'appoint_replacement') {
    extraCols.replacement_appointed_at = nowIso;
    if (!row.handover_completed_at) extraCols.handover_completed_at = nowIso;
  }
  if (action === 'reach_settlement')          extraCols.settlement_agreed_at = nowIso;
  if (action === 'withdraw_termination')      extraCols.withdrawn_at = nowIso;
  if (action === 'flag_sla_breach')           extraCols.sla_breached = 1;

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
    ? crossesIntoRegulator(body.action as ContractorDefaultAction, tier)
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
    .prepare(`UPDATE oe_ipp_contractor_defaults SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `cd_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_cd',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      default_category: row.default_category,
      contract_value_zar: row.contract_value_zar,
      contractor_name: row.contractor_name ?? null,
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
