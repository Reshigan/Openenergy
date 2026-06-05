// ═══════════════════════════════════════════════════════════════════════════
// Wave 188 — IPP Annual Grid Code Compliance Self-Assessment
//
// Mounted at /api/ipp-annual-compliance-assessments.
// INVERTED SLA: larger plant = more technical systems = more measurement
// data = more time required for rigorous documentation and SO review.
// Flagship plants (> 200 MW) receive 90 days from the annual trigger date.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  AcsStatus,
  AcsAction,
  AcsCapacityTier,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  SLA_DAYS,
  deriveAcsCapacityTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/ipp-annual-compliance-assessment-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippAnnualComplianceAssessmentSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, capacity_tier FROM oe_ipp_annual_compliance_assessments
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; capacity_tier: AcsCapacityTier }>();

  for (const row of breaches.results ?? []) {
    const reportable = slaBreachCrossesIntoRegulator(row.capacity_tier);

    await env.DB
      .prepare(
        `UPDATE oe_ipp_annual_compliance_assessments
         SET sla_breached = 1, updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_acs.sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_acs',
      entity_id: row.id,
      data: {
        capacity_tier: row.capacity_tier,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });

    await fireCascade({
      event: 'acs_evt_flag_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_acs',
      entity_id: row.id,
      data: {
        capacity_tier: row.capacity_tier,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }
}

// ─── GET / — list all records + KPIs ─────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    capacity_tier,
    assessment_year,
    limit = '50',
    offset = '0',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const off     = Math.max(0, parseInt(offset) || 0);

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  }

  if (status)          { clauses.push('chain_status = ?');    binds.push(status); }
  if (capacity_tier)   { clauses.push('capacity_tier = ?');   binds.push(capacity_tier); }
  if (assessment_year) { clauses.push('assessment_year = ?'); binds.push(parseInt(assessment_year)); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_annual_compliance_assessments ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(
        `SELECT COUNT(*) as n FROM oe_ipp_annual_compliance_assessments ${where}`,
      )
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(CASE WHEN chain_status = 'assessment_accepted'  THEN 1 ELSE 0 END) as accepted_count,
           SUM(CASE WHEN chain_status = 'assessment_deficient' THEN 1 ELSE 0 END) as deficient_count,
           SUM(CASE WHEN chain_status = 'assessment_lapsed'    THEN 1 ELSE 0 END) as lapsed_count
         FROM oe_ipp_annual_compliance_assessments ${where}`,
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

// ─── POST / — create a new annual compliance assessment record ────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id?: string | null;
    assessment_year: number;
    plant_name?: string | null;
    plant_mw: number;
    grid_connection_voltage_kv?: number | null;
    protection_systems_score?: number | null;
    metering_scada_score?: number | null;
    reactive_power_score?: number | null;
    frequency_response_score?: number | null;
    frt_pq_score?: number | null;
    deficiency_domains?: unknown[] | null;
    actor_party?: string | null;
    notes?: string | null;
  }>();

  if (body.assessment_year == null || body.plant_mw == null) {
    return c.json(
      {
        success: false,
        error: 'assessment_year and plant_mw are required',
      },
      400,
    );
  }

  const tier = deriveAcsCapacityTier(body.plant_mw);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_acs_${crypto.randomUUID()}`;

  const slaDays = SLA_DAYS[tier];
  const slaDeadline = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // Compute overall compliance score as average of provided scores
  const protScore  = body.protection_systems_score  ?? 0;
  const metScore   = body.metering_scada_score       ?? 0;
  const reactScore = body.reactive_power_score       ?? 0;
  const freqScore  = body.frequency_response_score   ?? 0;
  const frtScore   = body.frt_pq_score               ?? 0;
  const overallScore = (protScore + metScore + reactScore + freqScore + frtScore) / 5;

  const deficiencyDomainsJson = body.deficiency_domains
    ? JSON.stringify(body.deficiency_domains)
    : null;

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_annual_compliance_assessments
         (id, participant_id, project_id, assessment_year,
          plant_name, plant_mw, grid_connection_voltage_kv,
          protection_systems_score, metering_scada_score,
          reactive_power_score, frequency_response_score, frt_pq_score,
          overall_compliance_score, deficiency_domains,
          capacity_tier, chain_status,
          sla_days, sla_deadline, sla_breached,
          actor_id, actor_party, notes,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id ?? null,
      body.assessment_year,
      body.plant_name ?? null,
      body.plant_mw,
      body.grid_connection_voltage_kv ?? 0,
      protScore,
      metScore,
      reactScore,
      freqScore,
      frtScore,
      overallScore,
      deficiencyDomainsJson,
      tier,
      'assessment_triggered',
      slaDays,
      slaDeadline,
      user.id,
      body.actor_party ?? null,
      body.notes ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_acs.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_acs',
    entity_id: id,
    data: {
      capacity_tier: tier,
      assessment_year: body.assessment_year,
      plant_name: body.plant_name ?? null,
      plant_mw: body.plant_mw,
      grid_connection_voltage_kv: body.grid_connection_voltage_kv ?? 0,
      protection_systems_score: protScore,
      metering_scada_score: metScore,
      reactive_power_score: reactScore,
      frequency_response_score: freqScore,
      frt_pq_score: frtScore,
      overall_compliance_score: overallScore,
      deficiency_domains: body.deficiency_domains ?? [],
      sla_days: slaDays,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, capacity_tier: tier } }, 201);
});

// ─── GET /:id — single record + audit trail ──────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_annual_compliance_assessments WHERE id = ?')
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
       WHERE entity_type = 'ipp_acs' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── PUT /:id/action — state machine transition ───────────────────────────────

router.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: AcsAction;
    notes?: string | null;
    actor_party?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_annual_compliance_assessments WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as AcsStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status ${current} is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const action = body.action as AcsAction;

  const rule = VALID_TRANSITIONS[action];
  if (!rule) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  if (!rule.from.includes(current)) {
    return c.json(
      {
        success: false,
        error: `Cannot apply action '${action}' from status '${current}'`,
      },
      400,
    );
  }

  const nextSt = STATE_TRANSITIONS[action];
  const tier = row.capacity_tier as AcsCapacityTier;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, tier);

  await c.env.DB
    .prepare(
      `UPDATE oe_ipp_annual_compliance_assessments
       SET chain_status = ?, notes = ?,
           actor_id = ?, actor_party = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextSt,
      body.notes ?? row.notes ?? null,
      user.id,
      body.actor_party ?? row.actor_party ?? null,
      nowIso,
      id,
    )
    .run();

  await fireCascade({
    event: `acs_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_acs',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      capacity_tier: tier,
      assessment_year: row.assessment_year,
      plant_name: row.plant_name,
      plant_mw: row.plant_mw,
      grid_connection_voltage_kv: row.grid_connection_voltage_kv,
      protection_systems_score: row.protection_systems_score,
      metering_scada_score: row.metering_scada_score,
      reactive_power_score: row.reactive_power_score,
      frequency_response_score: row.frequency_response_score,
      frt_pq_score: row.frt_pq_score,
      overall_compliance_score: row.overall_compliance_score,
      deficiency_domains: row.deficiency_domains,
      notes: body.notes ?? null,
      regulator_notified: reportable,
      crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: { id, status: nextSt, regulator_notified: reportable },
  });
});

// ─── POST /sla-sweep — internal admin-only sweep ─────────────────────────────

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden — admin only' }, 403);
  }

  await ippAnnualComplianceAssessmentSlaSweep(c.env);
  return c.json({ success: true, data: { swept: true } });
});

export default router;
