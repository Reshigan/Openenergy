// ═══════════════════════════════════════════════════════════════════════════
// Wave 157 — IPP Project Refinancing & Debt Restructuring chain (P6)
//
// An operating IPP SPV (post-COD) seeks to refinance its senior debt facility.
// Three regulatory authorities are touched simultaneously:
//   1. NERSA §35 approval — when refinancing materially changes PPA credit-support
//      obligations (NERSA Licence Amendment Guidelines §4.3).
//   2. SARB Exchange Control (Circular 6/2010) — for non-resident lender involvement
//      or offshore credit facility drawdown.
//   3. LMA-standard borrower consent & conditions precedent.
//
// Mounted at /api/ipp-refinancing/chain.
//
// INVERTED SLA: larger debt quantum → more SARB/NERSA scrutiny → more time.
//   minor      < R50M   → shorter windows
//   material   >= R5B   → longest windows
//
// Signature reportability:
//   achieve_financial_close → EVERY tier
//   reject_refinancing      → significant + major + material
//   declare_lender_default  → EVERY tier
//
// Two-party split write: the IPP borrower drives mandate initiation, CP
// satisfaction, SARB/NERSA applications, and abandonment; the arranger/lender
// drives term sheet, credit approval, documentation, financial close, and
// default declarations. Regulator party handles approvals/clearances/rejections.
// actor_party (borrower | arranger | regulator) is derived from ACTION.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type RefinancingStatus,
  type RefinancingAction,
  type RefinancingTier,
  type RefinancingType,
  deriveRefinancingTier,
  crossesIntoRegulator,
  isReportable,
  partyForAction,
  slaBreachCrossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-refinancing-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ──────────────────────────────────────────────────────────────

export async function ippRefinancingSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, refinancing_tier, sarb_approval_required FROM oe_ipp_refinancing
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; refinancing_tier: RefinancingTier; sarb_approval_required: number }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_refinancing SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_refi.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_refi',
      entity_id: row.id,
      data: {
        refinancing_tier: row.refinancing_tier,
        sarb_approval_required: row.sarb_approval_required,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.refinancing_tier),
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
  if (project_id) { clauses.push('project_id = ?');     binds.push(project_id); }
  if (status)     { clauses.push('chain_status = ?');   binds.push(status); }
  if (tier)       { clauses.push('refinancing_tier = ?'); binds.push(tier); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_refinancing ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_refinancing ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'financial_close' THEN 1 ELSE 0 END) as closed_count,
           SUM(CASE WHEN chain_status = 'abandoned' THEN 1 ELSE 0 END) as abandoned_count,
           SUM(CASE WHEN chain_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(CASE WHEN chain_status = 'financial_close' THEN debt_quantum_zar ELSE 0 END) as total_debt_zar
         FROM oe_ipp_refinancing ${where}`,
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

// ─── GET /:id — single row + audit trail ──────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_refinancing WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  // Non-privileged users may only read their own rows.
  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'ipp_refi' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create refinancing mandate ─────────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    debt_quantum_zar: number;
    refinancing_type: RefinancingType;
    sarb_approval_required?: boolean;
    lender_name?: string;
    description?: string;
  }>();

  if (!body.project_id || body.debt_quantum_zar == null || !body.refinancing_type) {
    return c.json(
      { success: false, error: 'project_id, debt_quantum_zar, refinancing_type are required' },
      400,
    );
  }

  const tier = deriveRefinancingTier(body.debt_quantum_zar);
  const sarbRequired = body.sarb_approval_required ?? false;
  const reportable = isReportable(tier, sarbRequired);

  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_refi_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const initialStatus: RefinancingStatus = 'refinancing_mandated';
  const slaDays = SLA_DAYS[initialStatus][tier];
  const slaAt = slaDays > 0
    ? new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString()
    : null;

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_refinancing
         (id, project_id, debt_quantum_zar, refinancing_type, refinancing_tier,
          sarb_approval_required, lender_name, description,
          chain_status, sla_due_at, sla_breached,
          participant_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
    )
    .bind(
      id,
      body.project_id,
      body.debt_quantum_zar,
      body.refinancing_type,
      tier,
      sarbRequired ? 1 : 0,
      body.lender_name ?? null,
      body.description ?? null,
      initialStatus,
      slaAt,
      user.id,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_refi.created',
    actor_id: user.id,
    entity_type: 'ipp_refi',
    entity_id: id,
    data: {
      tier,
      debt_quantum_zar: body.debt_quantum_zar,
      refinancing_type: body.refinancing_type,
      sarb_approval_required: sarbRequired,
      is_reportable: reportable,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tier, is_reportable: reportable } }, 201);
});

// ─── PUT /:id/action — state machine dispatch ─────────────────────────────

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  // Allow WRITE_ROLES plus regulator (for approvals/clearances/rejections).
  if (!WRITE_ROLES.includes(user.role) && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: RefinancingAction | 'flag_sla_breach';
    notes?: string;
    actual_debt_zar?: number;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_refinancing WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  // Non-privileged users may only act on their own records.
  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as RefinancingStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.refinancing_tier as RefinancingTier;
  const sarbApprovalRequired = Boolean(row.sarb_approval_required);

  // ACTION_STATE_MAP — maps each action to its target state.
  // Self-loops (apply_nersa_clearance, finalise_documentation, flag_sla_breach)
  // stay at the current status; transitions are validated below.
  type AnyAction = RefinancingAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, RefinancingStatus> = {
    sign_term_sheet:        'term_sheet_signed',
    submit_credit:          'credit_approval',
    satisfy_conditions:     'conditions_precedent',
    apply_sarb:             'sarb_exchange_control',
    obtain_sarb_approval:   'nersa_clearance',
    apply_nersa_clearance:  'nersa_clearance',      // self-loop: resubmission
    obtain_nersa_clearance: 'legal_documentation',
    finalise_documentation: 'legal_documentation',  // self-loop: in-progress note
    achieve_financial_close:'financial_close',
    reject_refinancing:     'rejected',
    abandon:                'abandoned',
    declare_lender_default: 'lender_default',
    resolve_lender_default: 'recovery_in_progress',
    flag_sla_breach:        current,               // self-loop: marks breach
  };

  const nextSt = ACTION_STATE_MAP[body.action as AnyAction];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${body.action}` }, 400);
  }

  // Validate non-self-loop transitions against the spec's VALID_TRANSITIONS.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as RefinancingAction];
    if (!rule || !rule.from.includes(current)) {
      return c.json(
        { success: false, error: `Cannot transition '${current}' → '${body.action}'` },
        409,
      );
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const extraCols: Record<string, unknown> = {};

  // Extra timestamps per action.
  if (body.action === 'achieve_financial_close') {
    extraCols.financial_close_at = nowIso;
    if (typeof body.actual_debt_zar === 'number') {
      extraCols.actual_debt_zar = body.actual_debt_zar;
    }
  }
  if (body.action === 'reject_refinancing') {
    extraCols.rejected_at = nowIso;
  }
  if (body.action === 'declare_lender_default') {
    extraCols.lender_default_at = nowIso;
  }
  if (body.action === 'flag_sla_breach') {
    extraCols.sla_breached = 1;
  }

  // Recompute SLA deadline for the new state (self-loops and terminal states → NULL).
  let slaAt: string | null = null;
  if (nextSt !== current && !HARD_TERMINALS.has(nextSt)) {
    const slaDays = SLA_DAYS[nextSt]?.[tier] ?? 0;
    if (slaDays > 0) {
      slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();
    }
  }

  // Determine reportability for this action (returned in response, not stored in DB).
  const reportable = crossesIntoRegulator(body.action as RefinancingAction, tier);

  const setCols = [
    'chain_status = ?',
    'updated_at = ?',
    'sla_due_at = ?',
    ...Object.keys(extraCols).map((k) => `${k} = ?`),
  ];

  await c.env.DB
    .prepare(`UPDATE oe_ipp_refinancing SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextSt, nowIso, slaAt, ...Object.values(extraCols), id)
    .run();

  const actorParty = body.action !== 'flag_sla_breach'
    ? partyForAction(body.action as RefinancingAction)
    : 'system';

  await fireCascade({
    event: `ipp_refi.${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_refi',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      sarb_approval_required: sarbApprovalRequired,
      notes: body.notes ?? null,
      actor_party: actorParty,
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
