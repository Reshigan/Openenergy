// ═══════════════════════════════════════════════════════════════════════════
// Wave 186 — IPP SPV Equity Transfer & NERSA Consent
//
// Mounted at /api/ipp-equity-transfer.
// URGENT SLA: larger equity quantum = more counterparties watching = faster
// execution required to meet transfer completion date in the sale agreement.
// Flagship transactions (>R2B equity) must complete within 45 days of trigger;
// micro transactions (<R50M) have 90 days.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  EqtStatus,
  EqtAction,
  EqtEquityTier,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  SLA_DAYS,
  deriveEqtEquityTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-equity-transfer-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

async function ippEquityTransferSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, equity_tier FROM oe_ipp_equity_transfers
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; equity_tier: EqtEquityTier }>();

  for (const row of breaches.results ?? []) {
    const reportable = slaBreachCrossesIntoRegulator(row.equity_tier);

    await env.DB
      .prepare(
        `UPDATE oe_ipp_equity_transfers
         SET sla_breached = 1, is_reportable = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_eqt.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_eqt',
      entity_id: row.id,
      data: {
        equity_tier: row.equity_tier,
        is_reportable: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });

    await fireCascade({
      event: 'eqt_evt_flag_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_eqt',
      entity_id: row.id,
      data: {
        equity_tier: row.equity_tier,
        is_reportable: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }
}

// ─── GET / — list all + KPIs ─────────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    equity_tier,
    transfer_type,
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
  }

  if (status)        { clauses.push('chain_status = ?');   binds.push(status); }
  if (equity_tier)   { clauses.push('equity_tier = ?');    binds.push(equity_tier); }
  if (transfer_type) { clauses.push('transfer_type = ?');  binds.push(transfer_type); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_equity_transfers ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_equity_transfers ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'transfer_completed' THEN 1 ELSE 0 END) as completed_count,
           SUM(CASE WHEN chain_status = 'transfer_rejected'  THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'transfer_lapsed'    THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_equity_transfers ${where}`,
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

// ─── POST / — create a new equity transfer record ────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    transfer_type: string;
    transferor_name?: string | null;
    transferee_name?: string | null;
    equity_quantum_zar: number;
    equity_pct?: number | null;
    notes?: string | null;
  }>();

  if (!body.project_ref || !body.transfer_type || body.equity_quantum_zar == null) {
    return c.json(
      {
        success: false,
        error: 'project_ref, transfer_type, and equity_quantum_zar are required',
      },
      400,
    );
  }

  const tier = deriveEqtEquityTier(body.equity_quantum_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `eqt_${crypto.randomUUID()}`;

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_equity_transfers
         (id, project_ref, transfer_type, transferor_name, transferee_name,
          equity_quantum_zar, equity_pct, equity_tier,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.transfer_type,
      body.transferor_name ?? null,
      body.transferee_name ?? null,
      body.equity_quantum_zar,
      body.equity_pct ?? null,
      tier,
      'transfer_initiated',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_eqt.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_eqt',
    entity_id: id,
    data: {
      equity_tier: tier,
      project_ref: body.project_ref,
      transfer_type: body.transfer_type,
      equity_quantum_zar: body.equity_quantum_zar,
      equity_pct: body.equity_pct ?? null,
      transferor_name: body.transferor_name ?? null,
      transferee_name: body.transferee_name ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, equity_tier: tier } }, 201);
});

// ─── GET /:id — single row + audit trail ─────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_equity_transfers WHERE id = ?')
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
       WHERE entity_type = 'ipp_eqt' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as EqtAction,
        row.equity_tier as EqtEquityTier,
      )
    : false;

  return c.json({
    success: true,
    data: { ...row, is_reportable: isReportable ? 1 : 0, audit_trail: audit.results ?? [] },
  });
});

// ─── POST /:id/action — state machine dispatch ────────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: EqtAction;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_equity_transfers WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as EqtStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status ${current} is terminal` }, 409);
  }

  const action = body.action as EqtAction;
  const nextSt = STATE_TRANSITIONS[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  const rule = VALID_TRANSITIONS[action];
  if (!rule || !rule.from.includes(current)) {
    return c.json(
      { success: false, error: `Cannot transition ${current} to ${action}` },
      409,
    );
  }

  const tier = row.equity_tier as EqtEquityTier;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, tier);

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_equity_transfers
       SET chain_status = ?, reason = ?, notes = ?,
           is_reportable = ?, actor_party = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextSt,
      body.reason ?? null,
      body.notes ?? null,
      reportable ? 1 : 0,
      user.id,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `eqt_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_eqt',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      equity_tier: tier,
      equity_quantum_zar: row.equity_quantum_zar,
      equity_pct: row.equity_pct ?? null,
      project_ref: row.project_ref,
      transfer_type: row.transfer_type,
      transferor_name: row.transferor_name ?? null,
      transferee_name: row.transferee_name ?? null,
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

export { ippEquityTransferSlaSweep };
export default router;
