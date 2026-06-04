// ═══════════════════════════════════════════════════════════════════════════
// Wave 179 — IPP REIPPPP Performance Security & Construction Guarantee Renewal
//
// REIPPPP Finance Documents (Schedule 6) require IPPs to procure and maintain
// performance securities throughout the construction phase. These include:
// contractor performance bonds, advance payment guarantees (APGs), retention
// guarantees, parent company guarantees (PCGs), and irrevocable letters of
// credit (LCs). Securities must be renewed annually or at key construction
// milestones. Failure to maintain or renew triggers a DMRE Default Notice
// under the PPA and constitutes an event of default under the Finance Docs.
//
// Mounted at /api/ipp-perf-securities.
//
// URGENT SLA: higher bond quantum = larger contractor exposure = more risk
// to the project lenders and the DMRE = TIGHTER renewal deadline.
// Major bonds (>R500M) must be renewed 14 days before expiry; micro bonds
// (<R5M) have 60 days.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  derivePsecBondTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-perf-security-spec';
import type { PsecStatus, PsecAction, PsecBondTier } from '../utils/ipp-perf-security-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippPerfSecuritySlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, bond_tier FROM oe_ipp_perf_securities
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; bond_tier: PsecBondTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_perf_securities SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_psec.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_psec',
      entity_id: row.id,
      data: {
        bond_tier: row.bond_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.bond_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.bond_tier),
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
    bond_tier,
    security_type,
    issuing_bank,
    beneficiary,
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
  if (chain_status)  { clauses.push('chain_status = ?');   binds.push(chain_status); }
  if (bond_tier)     { clauses.push('bond_tier = ?');      binds.push(bond_tier); }
  if (security_type) { clauses.push('security_type = ?');  binds.push(security_type); }
  if (issuing_bank)  { clauses.push('issuing_bank = ?');   binds.push(issuing_bank); }
  if (beneficiary)   { clauses.push('beneficiary = ?');    binds.push(beneficiary); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_perf_securities ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_perf_securities ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'security_confirmed' THEN 1 ELSE 0 END) as confirmed_count,
           SUM(CASE WHEN chain_status = 'security_rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'security_lapsed' THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_perf_securities ${where}`,
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

// ─── POST / — create a new performance security record ───────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    bond_quantum_zar: number;
    security_type?: string | null;
    expiry_date?: string | null;
    issuing_bank?: string | null;
    beneficiary?: string | null;
    bond_reference?: string | null;
    notes?: string | null;
  }>();

  if (!body.project_ref || body.bond_quantum_zar == null) {
    return c.json(
      {
        success: false,
        error: 'project_ref and bond_quantum_zar are required',
      },
      400,
    );
  }

  const tier = derivePsecBondTier(body.bond_quantum_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  const securityType = body.security_type ?? 'performance_bond';

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_perf_securities
         (id, project_ref, bond_reference, bond_quantum_zar, bond_tier,
          security_type, expiry_date, issuing_bank, beneficiary,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.bond_reference ?? null,
      body.bond_quantum_zar,
      tier,
      securityType,
      body.expiry_date ?? null,
      body.issuing_bank ?? null,
      body.beneficiary ?? null,
      'security_required',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_psec.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_psec',
    entity_id: id,
    data: {
      bond_tier: tier,
      project_ref: body.project_ref,
      bond_quantum_zar: body.bond_quantum_zar,
      security_type: securityType,
      expiry_date: body.expiry_date ?? null,
      issuing_bank: body.issuing_bank ?? null,
      beneficiary: body.beneficiary ?? null,
      bond_reference: body.bond_reference ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, bond_tier: tier } }, 201);
});

// ─── GET /:id — single row + is_reportable + audit trail ─────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_perf_securities WHERE id = ?')
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
       WHERE entity_type = 'ipp_psec' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as PsecAction,
        row.bond_tier as PsecBondTier,
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
    action: PsecAction;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_perf_securities WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as PsecStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const action = body.action as PsecAction;
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

  const tier = row.bond_tier as PsecBondTier;
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

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_perf_securities
       SET chain_status = ?, sla_due_date = ?, reason = ?, notes = ?,
           is_reportable = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nextSt, slaDueDate, body.reason ?? null, body.notes ?? null, reportable ? 1 : 0, nowIso, id)
    .run();

  await fireCascade({
    event: `psec_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_psec',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      bond_tier: tier,
      bond_quantum_zar: row.bond_quantum_zar,
      project_ref: row.project_ref,
      security_type: row.security_type ?? null,
      expiry_date: row.expiry_date ?? null,
      issuing_bank: row.issuing_bank ?? null,
      beneficiary: row.beneficiary ?? null,
      bond_reference: row.bond_reference ?? null,
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
