// ═══════════════════════════════════════════════════════════════════════════
// Wave 182 — IPP REIPPPP BBBEE Annual Compliance Verification
//
// REIPPPP Bid Conditions require IPPs to maintain minimum BBBEE ownership
// levels and overall scores annually. An independent BBBEE verification
// agency accredited by SANAS or IRBA must issue a valid BBBEE Verification
// Certificate. Failure to maintain minimum ownership (typically 26% black
// equity) or minimum BBBEE level (typically Level 4 or better) triggers a
// DMRE Default Notice. Loss of BBBEE status is a compliance event reportable
// to the DMRE.
//
// Mounted at /api/ipp-bbbee-verification.
//
// URGENT SLA: higher BBBEE equity target = more complex ownership verification
// = greater DMRE scrutiny = TIGHTER deadline to renew before certificate lapses.
// Exemplary projects (>75% black equity) face the most stringent annual review.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveBbbeeEquityTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-bbbee-verification-spec';
import type { BbbeeStatus, BbbeeAction, BbbeeEquityTier } from '../utils/ipp-bbbee-verification-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippBbbeeVerificationSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, equity_tier FROM oe_ipp_bbbee_verification
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; equity_tier: BbbeeEquityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_bbbee_verification SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_bbbee.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_bbbee',
      entity_id: row.id,
      data: {
        equity_tier: row.equity_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.equity_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.equity_tier),
      },
      env,
    });
  }
}

// ─── GET / — list all + KPIs ─────────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    project_ref,
    chain_status,
    equity_tier,
    verification_year,
    limit = '50',
    offset = '0',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const off     = Math.max(0, parseInt(offset) || 0);

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('actor_party = ?');
    binds.push(user.id);
  } else if (project_ref) {
    clauses.push('project_ref = ?');
    binds.push(project_ref);
  }
  if (chain_status)      { clauses.push('chain_status = ?');      binds.push(chain_status); }
  if (equity_tier)       { clauses.push('equity_tier = ?');       binds.push(equity_tier); }
  if (verification_year) { clauses.push('verification_year = ?'); binds.push(parseInt(verification_year)); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_bbbee_verification ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_bbbee_verification ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'bbbee_verified' THEN 1 ELSE 0 END) as verified_count,
           SUM(CASE WHEN chain_status = 'bbbee_non_compliant' THEN 1 ELSE 0 END) as non_compliant_count,
           SUM(CASE WHEN chain_status = 'certificate_lapsed' THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_bbbee_verification ${where}`,
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

// ─── POST / — create a new BBBEE verification record ─────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    verification_year: number;
    bbbee_target_pct: number;
    bbbee_score?: number | null;
    bbbee_level?: number | null;
    agency_name?: string | null;
    certificate_expiry?: string | null;
    notes?: string | null;
  }>();

  if (!body.project_ref || body.bbbee_target_pct == null || body.verification_year == null) {
    return c.json(
      {
        success: false,
        error: 'project_ref, bbbee_target_pct, and verification_year are required',
      },
      400,
    );
  }

  const tier = deriveBbbeeEquityTier(body.bbbee_target_pct);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_bbbee_verification
         (id, project_ref, verification_year, bbbee_target_pct, equity_tier,
          bbbee_score, bbbee_level, agency_name, certificate_expiry,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.verification_year,
      body.bbbee_target_pct,
      tier,
      body.bbbee_score ?? null,
      body.bbbee_level ?? null,
      body.agency_name ?? null,
      body.certificate_expiry ?? null,
      'verification_triggered',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_bbbee.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_bbbee',
    entity_id: id,
    data: {
      equity_tier: tier,
      project_ref: body.project_ref,
      verification_year: body.verification_year,
      bbbee_target_pct: body.bbbee_target_pct,
      bbbee_score: body.bbbee_score ?? null,
      bbbee_level: body.bbbee_level ?? null,
      agency_name: body.agency_name ?? null,
      certificate_expiry: body.certificate_expiry ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, equity_tier: tier } }, 201);
});

// ─── GET /:id — single row + is_reportable + audit trail ─────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_bbbee_verification WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'ipp_bbbee' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as BbbeeAction,
        row.equity_tier as BbbeeEquityTier,
      )
    : false;

  return c.json({
    success: true,
    data: { ...row, is_reportable: isReportable ? 1 : 0, audit_trail: audit.results ?? [] },
  });
});

// ─── PUT /:id/action — state machine dispatch ─────────────────────────────────

router.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: BbbeeAction;
    reason?: string;
    notes?: string;
    bbbee_score?: number | null;
    bbbee_level?: number | null;
    agency_name?: string | null;
    certificate_expiry?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_bbbee_verification WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as BbbeeStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const action = body.action as BbbeeAction;
  const nextSt = STATE_TRANSITIONS[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  const rule = VALID_TRANSITIONS[action];
  if (!rule || !rule.from.includes(current)) {
    return c.json(
      { success: false, error: `Cannot transition '${current}' → '${action}'` },
      409,
    );
  }

  const tier = row.equity_tier as BbbeeEquityTier;
  const now = new Date();
  const nowIso = now.toISOString();

  let slaDueDate: string | null = null;
  if (!HARD_TERMINALS.has(nextSt)) {
    const slaDays = SLA_DAYS[tier] ?? 0;
    if (slaDays > 0) {
      slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();
    }
  }

  const reportable = crossesIntoRegulator(action, tier);

  // Build optional field updates for score/level/agency/expiry if provided on terminal actions
  const updatedScore = body.bbbee_score !== undefined ? body.bbbee_score : (row.bbbee_score ?? null);
  const updatedLevel = body.bbbee_level !== undefined ? body.bbbee_level : (row.bbbee_level ?? null);
  const updatedAgency = body.agency_name !== undefined ? body.agency_name : (row.agency_name ?? null);
  const updatedExpiry = body.certificate_expiry !== undefined ? body.certificate_expiry : (row.certificate_expiry ?? null);

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_bbbee_verification
       SET chain_status = ?, sla_due_date = ?, reason = ?, notes = ?,
           is_reportable = ?, bbbee_score = ?, bbbee_level = ?,
           agency_name = ?, certificate_expiry = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextSt,
      slaDueDate,
      body.reason ?? null,
      body.notes ?? null,
      reportable ? 1 : 0,
      updatedScore,
      updatedLevel,
      updatedAgency,
      updatedExpiry,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `bbbee_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_bbbee',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      equity_tier: tier,
      bbbee_target_pct: row.bbbee_target_pct,
      project_ref: row.project_ref,
      verification_year: row.verification_year,
      bbbee_score: updatedScore,
      bbbee_level: updatedLevel,
      agency_name: updatedAgency,
      certificate_expiry: updatedExpiry,
      reason: body.reason ?? null,
      notes: body.notes ?? null,
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

export default router;
