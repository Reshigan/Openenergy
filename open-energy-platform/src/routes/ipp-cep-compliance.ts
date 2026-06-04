// ═══════════════════════════════════════════════════════════════════════════
// Wave 180 — IPP REIPPPP Community Equity Participation (CEP) Compliance
//
// REIPPPP Bid Conditions require projects above 5MW to include community
// equity participation — typically a Community Trust (CT) or Non-Profit
// Company (NPC) holding a minimum 5% equity stake, with DMRE targets of up
// to 40% community + BBBEE combined. Annual compliance reports must be filed
// with the DMRE IPP Office and lenders confirming:
//   (a) annual cash distributions were made to community beneficiaries,
//   (b) community development spend targets were met,
//   (c) community shareholding structure remains intact.
// Failure to file or non-compliance triggers a DMRE Default Notice under
// the PPA. Persistent non-compliance is a REIPPPP disqualification event.
//
// Mounted at /api/ipp-cep-compliance.
//
// INVERTED SLA: larger projects have larger community obligations, more
// beneficiaries to identify, larger distribution pools, and more complex
// documentation requirements — warranting more time.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  deriveCepProjectTier,
  SLA_DAYS,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-cep-compliance-spec';
import type { CepStatus, CepAction, CepProjectTier } from '../utils/ipp-cep-compliance-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippCepComplianceSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, project_tier FROM oe_ipp_cep_compliance
       WHERE sla_due_date IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_date <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; project_tier: CepProjectTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_cep_compliance SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_cep.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_cep',
      entity_id: row.id,
      data: {
        project_tier: row.project_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.project_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.project_tier),
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
    project_tier,
    structure_type,
    compliance_year,
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
  if (chain_status)     { clauses.push('chain_status = ?');     binds.push(chain_status); }
  if (project_tier)     { clauses.push('project_tier = ?');     binds.push(project_tier); }
  if (structure_type)   { clauses.push('structure_type = ?');   binds.push(structure_type); }
  if (compliance_year)  { clauses.push('compliance_year = ?');  binds.push(parseInt(compliance_year)); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_cep_compliance ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_cep_compliance ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'cep_compliant' THEN 1 ELSE 0 END) as compliant_count,
           SUM(CASE WHEN chain_status = 'cep_non_compliant' THEN 1 ELSE 0 END) as non_compliant_count,
           SUM(CASE WHEN chain_status = 'cep_lapsed' THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_cep_compliance ${where}`,
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

// ─── POST / — create a new CEP compliance record ─────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_ref: string;
    compliance_year: number;
    project_mw: number;
    cep_equity_pct?: number | null;
    structure_type?: string | null;
    distribution_amount_zar?: number | null;
    community_dev_spend_zar?: number | null;
    trustee_name?: string | null;
    notes?: string | null;
  }>();

  if (!body.project_ref || body.project_mw == null || body.compliance_year == null) {
    return c.json(
      {
        success: false,
        error: 'project_ref, project_mw, and compliance_year are required',
      },
      400,
    );
  }

  const tier = deriveCepProjectTier(body.project_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaDueDate = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  const structureType = body.structure_type ?? 'community_trust';

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_cep_compliance
         (id, project_ref, compliance_year, project_mw, project_tier,
          cep_equity_pct, structure_type, distribution_amount_zar,
          community_dev_spend_zar, trustee_name,
          chain_status, sla_due_date, sla_breached, is_reportable,
          actor_party, reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,NULL,?,?,?)`,
    )
    .bind(
      id,
      body.project_ref,
      body.compliance_year,
      body.project_mw,
      tier,
      body.cep_equity_pct ?? null,
      structureType,
      body.distribution_amount_zar ?? null,
      body.community_dev_spend_zar ?? null,
      body.trustee_name ?? null,
      'cep_triggered',
      slaDueDate,
      user.id,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_cep.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_cep',
    entity_id: id,
    data: {
      project_tier: tier,
      project_ref: body.project_ref,
      compliance_year: body.compliance_year,
      project_mw: body.project_mw,
      cep_equity_pct: body.cep_equity_pct ?? null,
      structure_type: structureType,
      distribution_amount_zar: body.distribution_amount_zar ?? null,
      community_dev_spend_zar: body.community_dev_spend_zar ?? null,
      trustee_name: body.trustee_name ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, project_tier: tier } }, 201);
});

// ─── GET /:id — single row + is_reportable + audit trail ─────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_cep_compliance WHERE id = ?')
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
       WHERE entity_type = 'ipp_cep' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  const lastAction = (audit.results ?? []).at(-1);
  const isReportable = lastAction
    ? crossesIntoRegulator(
        lastAction.action as CepAction,
        row.project_tier as CepProjectTier,
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
    action: CepAction;
    reason?: string;
    notes?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_cep_compliance WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_party !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as CepStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const action = body.action as CepAction;
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

  const tier = row.project_tier as CepProjectTier;
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
      `UPDATE oe_ipp_cep_compliance
       SET chain_status = ?, sla_due_date = ?, reason = ?, notes = ?,
           is_reportable = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nextSt, slaDueDate, body.reason ?? null, body.notes ?? null, reportable ? 1 : 0, nowIso, id)
    .run();

  await fireCascade({
    event: `cep_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_cep',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      project_tier: tier,
      project_mw: row.project_mw,
      project_ref: row.project_ref,
      compliance_year: row.compliance_year,
      cep_equity_pct: row.cep_equity_pct ?? null,
      structure_type: row.structure_type ?? null,
      distribution_amount_zar: row.distribution_amount_zar ?? null,
      community_dev_spend_zar: row.community_dev_spend_zar ?? null,
      trustee_name: row.trustee_name ?? null,
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
