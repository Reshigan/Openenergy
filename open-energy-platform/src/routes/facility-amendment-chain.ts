// ═══════════════════════════════════════════════════════════════════════════
// Wave 194 — Lender Facility Amendment & Consent
//
// Mounted at /api/facility-amendments.
// INVERTED SLA: unanimous_consent (60d) > majority_consent (45d) >
// technical_amendment (30d) > administrative_amendment (21d) >
// clerical_correction (14d).
//
// Regulator crossings:
//   execute_amendment → major/systemic when security_variation = 1
//   refuse_amendment  → systemic only
//   sla_breached      → major/systemic
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  FacilityAmendmentStatus,
  FacilityAmendmentAction,
  AmendmentClass,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  deriveSla,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/facility-amendment-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'lender', 'ipp_developer'];

// ─── SLA sweep (exported — called by cron) ───────────────────────────────────

export async function facilityAmendmentSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, amendment_class, security_variation FROM oe_facility_amendments
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; amendment_class: AmendmentClass; security_variation: number }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = slaBreachCrossesIntoRegulator(row.amendment_class);

    await env.DB
      .prepare(
        `UPDATE oe_facility_amendments
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    if (reportable) {
      await env.DB
        .prepare(
          `INSERT INTO regulator_inbox
             (id, category, priority, subject, body, source_table, source_id,
              source_event, participant_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          `reg_fam_sla_${row.id}_${Date.now()}`,
          'facility_amendment',
          'medium',
          `Facility Amendment SLA Breached — ${row.amendment_class.replace(/_/g, ' ')}`,
          `Facility amendment ${row.id} (class: ${row.amendment_class}) has breached its SLA deadline without reaching a terminal state.`,
          'oe_facility_amendments',
          row.id,
          'fam_evt_sla_breached',
          null,
          now,
        )
        .run();
    }

    await fireCascade({
      event: 'fam_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'facility_amendment',
      entity_id: row.id,
      data: {
        amendment_class: row.amendment_class,
        security_variation: row.security_variation === 1,
        regulator_notified: reportable,
        crosses_into_regulator: reportable,
      },
      env,
    });
  }

  return { swept: rows.length };
}

// ─── GET / — list records + KPIs ─────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    status,
    amendment_class,
    sla_breached,
    facility_id,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('actor_id = ?');
    binds.push(user.id);
  }

  if (status)          { clauses.push('chain_status = ?');    binds.push(status); }
  if (amendment_class) { clauses.push('amendment_class = ?'); binds.push(amendment_class); }
  if (facility_id)     { clauses.push('facility_id = ?');     binds.push(facility_id); }
  if (sla_breached !== undefined && sla_breached !== '') {
    clauses.push('sla_breached = ?');
    binds.push(sla_breached === '1' || sla_breached === 'true' ? 1 : 0);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_facility_amendments ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_facility_amendments ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as pending_amendments,
           SUM(CASE WHEN chain_status = 'effective'  THEN 1 ELSE 0 END)  as consented_count,
           SUM(CASE WHEN chain_status = 'refused'    THEN 1 ELSE 0 END)  as refused_count,
           SUM(CASE WHEN chain_status = 'lapsed'     THEN 1 ELSE 0 END)  as lapsed_count,
           SUM(CASE WHEN chain_status IN ('unanimous_required') THEN 1 ELSE 0 END) as unanimous_pending,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached_count
         FROM oe_facility_amendments ${where}`,
      )
      .bind(...[...HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  const total = totalRow?.n ?? 0;

  return c.json({
    success: true,
    data: rows.results ?? [],
    kpis,
    pagination: {
      page: pageNum,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage),
    },
  });
});

// ─── POST / — create a new facility amendment record ─────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    facility_id: string;
    amendment_ref?: string | null;
    amendment_class: AmendmentClass;
    amendment_type?: string | null;
    majority_threshold_pct?: number | null;
    unanimous_required?: number;
    security_variation?: number;
    pricing_change_bps?: number | null;
    description?: string | null;
  }>();

  if (!body.facility_id || !body.amendment_class) {
    return c.json(
      { success: false, error: 'facility_id and amendment_class are required' },
      400,
    );
  }

  const validClasses: AmendmentClass[] = [
    'unanimous_consent',
    'majority_consent',
    'technical_amendment',
    'administrative_amendment',
    'clerical_correction',
  ];
  if (!validClasses.includes(body.amendment_class)) {
    return c.json(
      { success: false, error: `amendment_class must be one of: ${validClasses.join(', ')}` },
      400,
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const id = `fam_${crypto.randomUUID()}`;
  const amendmentRef = body.amendment_ref ?? `AMD-${Date.now()}`;

  const slaDays = deriveSla(body.amendment_class);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const unanimousRequired =
    body.unanimous_required ??
    (body.amendment_class === 'unanimous_consent' ? 1 : 0);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_facility_amendments
         (id, facility_id, amendment_ref, amendment_class, amendment_type,
          majority_threshold_pct, unanimous_required, security_variation,
          pricing_change_bps, description,
          chain_status, sla_deadline, sla_breached, regulator_notified,
          actor_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'amendment_requested',?,0,0,?,?,?)`,
    )
    .bind(
      id,
      body.facility_id,
      amendmentRef,
      body.amendment_class,
      body.amendment_type ?? null,
      body.majority_threshold_pct ?? null,
      unanimousRequired,
      body.security_variation ?? 0,
      body.pricing_change_bps ?? null,
      body.description ?? null,
      slaDeadline,
      user.id,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'fam_evt_amendment_requested' as EventType,
    actor_id: user.id,
    entity_type: 'facility_amendment',
    entity_id: id,
    data: {
      facility_id: body.facility_id,
      amendment_ref: amendmentRef,
      amendment_class: body.amendment_class,
      amendment_type: body.amendment_type ?? null,
      security_variation: (body.security_variation ?? 0) === 1,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json(
    {
      success: true,
      data: {
        id,
        amendment_ref: amendmentRef,
        amendment_class: body.amendment_class,
        sla_deadline: slaDeadline,
      },
    },
    201,
  );
});

// ─── GET /:id — single record + audit trail ───────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_facility_amendments WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'facility_amendment' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 20`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, timeline: audit.results ?? [] },
  });
});

// ─── POST /:id/action — state machine transition ──────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: FacilityAmendmentAction;
    reason?: string | null;
    consent_deadline?: string | null;
    effective_date?: string | null;
  }>();

  if (!body.action) {
    return c.json({ success: false, error: 'action is required' }, 400);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_facility_amendments WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.actor_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as FacilityAmendmentStatus;

  if (HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status '${current}' is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const action = body.action as FacilityAmendmentAction;
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

  const nextStatus = STATE_TRANSITIONS[action];
  const amendmentClass = row.amendment_class as AmendmentClass;
  const securityVariation = (row.security_variation as number) === 1;
  const now = new Date();
  const nowIso = now.toISOString();

  const reportable = crossesIntoRegulator(action, amendmentClass, securityVariation);

  // SLA breach detection on transition
  const slaDeadline     = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached        = alreadyBreached ? 1 : 0;
  let regulatorNotified  = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached = 1;
    if (slaBreachCrossesIntoRegulator(amendmentClass)) {
      regulatorNotified = 1;
    }
  }

  // Build update fields
  const consentDeadline = body.consent_deadline ?? (row.consent_deadline as string | null);
  const effectiveDate   = action === 'record_effective_date'
    ? (body.effective_date ?? nowIso.slice(0, 10))
    : (row.effective_date as string | null);

  await c.env.DB
    .prepare(
      `UPDATE oe_facility_amendments
       SET chain_status = ?,
           reason = ?,
           actor_id = ?,
           sla_breached = ?,
           regulator_notified = ?,
           consent_deadline = ?,
           effective_date = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus,
      body.reason ?? null,
      user.id,
      slaBreached,
      regulatorNotified,
      consentDeadline,
      effectiveDate,
      nowIso,
      id,
    )
    .run();

  // Insert regulator inbox record if this crosses into regulator
  if (reportable) {
    const priority =
      amendmentClass === 'unanimous_consent' ? 'high' :
      amendmentClass === 'majority_consent'  ? 'medium' : 'low';

    await c.env.DB
      .prepare(
        `INSERT INTO regulator_inbox
           (id, category, priority, subject, body, source_table, source_id,
            source_event, participant_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        `reg_fam_${action}_${id}_${Date.now()}`,
        'facility_amendment',
        priority,
        `Facility Amendment — ${action.replace(/_/g, ' ')} (${amendmentClass.replace(/_/g, ' ')})`,
        `Facility amendment ${row.amendment_ref ?? id} on facility ${row.facility_id} has reached action '${action}'. Security variation: ${securityVariation ? 'Yes' : 'No'}. Amendment class: ${amendmentClass}.`,
        'oe_facility_amendments',
        id,
        `fam_evt_${action}`,
        row.actor_id as string | null,
        nowIso,
      )
      .run();
  }

  await fireCascade({
    event: `fam_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'facility_amendment',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus,
      reason: body.reason ?? null,
      amendment_class: amendmentClass,
      amendment_ref: row.amendment_ref ?? null,
      facility_id: row.facility_id,
      security_variation: securityVariation,
      regulator_notified: reportable,
      crosses_into_regulator: reportable,
      effective_date: effectiveDate,
    },
    env: c.env,
  });

  return c.json({
    success: true,
    data: {
      id,
      status: nextStatus,
      regulator_notified: regulatorNotified === 1,
    },
  });
});

// ─── POST /sla-sweep — internal cron endpoint ────────────────────────────────

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden — admin only' }, 403);
  }

  const result = await facilityAmendmentSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const facilityAmendmentRoutes = router;
export default router;
