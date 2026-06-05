// ═══════════════════════════════════════════════════════════════════════════
// Wave 200 — Carbon Tax Quarterly Return & SARS Filing
// Mounted at /api/carbon-tax-returns
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  CtrStatus, CtrAction, TaxClass,
  deriveCtrSla, CTR_HARD_TERMINALS,
  CTR_VALID_TRANSITIONS, CTR_STATE_TRANSITIONS,
  ctrCrossesIntoRegulator, ctrSlaBreachCrossesIntoRegulator,
} from '../utils/carbon-tax-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'carbon_fund'];

export async function ctrSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...CTR_HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, tax_class FROM oe_carbon_tax_returns
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...CTR_HARD_TERMINALS, now)
    .all<{ id: string; tax_class: TaxClass }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = ctrSlaBreachCrossesIntoRegulator(row.tax_class);

    await env.DB
      .prepare(
        `UPDATE oe_carbon_tax_returns
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
          `ctr_sla_${row.id}_${Date.now()}`,
          'carbon_tax_return',
          'high',
          `Carbon Tax Return SLA Breach — ${row.tax_class}`,
          `Carbon tax return ${row.id} (${row.tax_class}) has breached its filing SLA deadline.`,
          'oe_carbon_tax_returns',
          row.id,
          'ctr_evt_sla_breached',
          row.id,
          now,
        )
        .run();
    }

    await fireCascade({
      event: 'ctr_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'carbon_tax_return',
      entity_id: row.id,
      data: { tax_class: row.tax_class, regulator_notified: reportable },
      env,
    });
  }

  return { swept: rows.length };
}

// ─── GET / — list ────────────────────────────────────────────────────────────

router.get('/', async (c) => {
  const user = getCurrentUser(c);
  const {
    status, tax_class, tax_period, fiscal_year,
    participant_id: qParticipant, page = '1', per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (!['admin', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  } else {
    if (qParticipant) { clauses.push('participant_id = ?'); binds.push(qParticipant); }
    if (status)       { clauses.push('chain_status = ?');   binds.push(status); }
    if (tax_class)    { clauses.push('tax_class = ?');      binds.push(tax_class); }
    if (tax_period)   { clauses.push('tax_period = ?');     binds.push(tax_period); }
    if (fiscal_year)  { clauses.push('fiscal_year = ?');    binds.push(parseInt(fiscal_year)); }
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPh = [...CTR_HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(`SELECT * FROM oe_carbon_tax_returns ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_carbon_tax_returns ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           SUM(CASE WHEN chain_status NOT IN (${terminalPh}) THEN 1 ELSE 0 END) as open,
           SUM(CASE WHEN chain_status = 'payment_made' THEN 1 ELSE 0 END) as paid,
           SUM(CASE WHEN chain_status = 'disputed' THEN 1 ELSE 0 END) as disputed,
           SUM(CASE WHEN chain_status = 'under_sars_review' THEN 1 ELSE 0 END) as under_review,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           SUM(net_tax_payable) as total_net_payable
         FROM oe_carbon_tax_returns ${where}`,
      )
      .bind(...[...CTR_HARD_TERMINALS], ...binds)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: rows.results ?? [],
    kpis: {
      open:         kpis?.open         ?? 0,
      paid:         kpis?.paid         ?? 0,
      disputed:     kpis?.disputed     ?? 0,
      under_review: kpis?.under_review ?? 0,
      sla_breached: kpis?.sla_breached ?? 0,
      total_net_payable: kpis?.total_net_payable ?? 0,
    },
    pagination: {
      page: pageNum, per_page: perPage,
      total: totalRow?.n ?? 0,
      total_pages: Math.ceil((totalRow?.n ?? 0) / perPage),
    },
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_carbon_tax_returns WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'carbon_tax_return' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: { ...row, timeline: timeline.results ?? [] } });
});

// ─── POST / — open a new tax return period ───────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    participant_id: string;
    tax_class?: TaxClass;
    tax_period: string;
    fiscal_year: number;
    scope1_tco2e?: number;
    scope2_tco2e?: number;
    process_emissions_tco2e?: number;
  }>();

  if (!body.participant_id || !body.tax_period || !body.fiscal_year) {
    return c.json({ success: false, error: 'participant_id, tax_period, and fiscal_year are required' }, 400);
  }

  const existing = await c.env.DB
    .prepare(
      `SELECT id FROM oe_carbon_tax_returns
       WHERE participant_id = ? AND tax_period = ? AND fiscal_year = ?`,
    )
    .bind(body.participant_id, body.tax_period, body.fiscal_year).first();
  if (existing) {
    return c.json({ success: false, error: 'Return already exists for this period' }, 409);
  }

  const taxClass  = (body.tax_class ?? 'standard') as TaxClass;
  const now       = new Date();
  const nowIso    = now.toISOString();
  const id        = `ctr_${crypto.randomUUID()}`;
  const slaDays   = deriveCtrSla(taxClass);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000).toISOString().slice(0, 10);

  const scope1    = body.scope1_tco2e ?? 0;
  const scope2    = body.scope2_tco2e ?? 0;
  const process   = body.process_emissions_tco2e ?? 0;
  const total     = scope1 + scope2 + process;

  await c.env.DB
    .prepare(
      `INSERT INTO oe_carbon_tax_returns
         (id, participant_id, tax_class, tax_period, fiscal_year,
          scope1_tco2e, scope2_tco2e, process_emissions_tco2e, total_emissions_tco2e,
          chain_status, sla_deadline, sla_breached, regulator_notified,
          actor_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,'period_open',?,0,0,?,?,?)`,
    )
    .bind(
      id, body.participant_id, taxClass, body.tax_period, body.fiscal_year,
      scope1, scope2, process, total,
      slaDeadline, user.id, nowIso, nowIso,
    )
    .run();

  await fireCascade({
    event: 'ctr_evt_created' as EventType,
    actor_id: user.id,
    entity_type: 'carbon_tax_return',
    entity_id: id,
    data: { participant_id: body.participant_id, tax_class: taxClass, tax_period: body.tax_period, fiscal_year: body.fiscal_year, sla_deadline: slaDeadline },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tax_class: taxClass, sla_deadline: slaDeadline } }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const body = await c.req.json<{
    action: CtrAction;
    reason?: string | null;
    scope1_tco2e?: number | null;
    scope2_tco2e?: number | null;
    process_emissions_tco2e?: number | null;
    total_emissions_tco2e?: number | null;
    basic_allowance_pct?: number | null;
    offset_allowance_pct?: number | null;
    total_allowance_pct?: number | null;
    gross_tax_liability?: number | null;
    allowances_value?: number | null;
    net_tax_payable?: number | null;
    tax_rate_per_tco2?: number | null;
    payment_reference?: string | null;
    paid_amount?: number | null;
    sars_submission_ref?: string | null;
    sars_assessment_ref?: string | null;
    assessment_amount?: number | null;
    dispute_reason?: string | null;
  }>();

  if (!body.action) return c.json({ success: false, error: 'action is required' }, 400);

  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_carbon_tax_returns WHERE id = ?')
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const current  = row.chain_status as CtrStatus;
  const action   = body.action as CtrAction;
  const taxClass = row.tax_class as TaxClass;

  if (CTR_HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 400);
  }

  const rule = CTR_VALID_TRANSITIONS[action];
  if (!rule) return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  if (!rule.from.includes(current)) {
    return c.json({ success: false, error: `Cannot apply '${action}' from '${current}'` }, 400);
  }

  const nextStatus = CTR_STATE_TRANSITIONS[action];
  const now        = new Date();
  const nowIso     = now.toISOString();
  const reportable = ctrCrossesIntoRegulator(action, taxClass);

  const slaDeadline     = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached       = alreadyBreached ? 1 : 0;
  let regulatorNotified = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached       = 1;
    regulatorNotified = 1;
  }

  // Recalculate total emissions if any scope field supplied
  let totalEmissions = row.total_emissions_tco2e as number;
  if (body.total_emissions_tco2e != null) {
    totalEmissions = body.total_emissions_tco2e;
  } else if (body.scope1_tco2e != null || body.scope2_tco2e != null || body.process_emissions_tco2e != null) {
    totalEmissions =
      (body.scope1_tco2e ?? (row.scope1_tco2e as number)) +
      (body.scope2_tco2e ?? (row.scope2_tco2e as number)) +
      (body.process_emissions_tco2e ?? (row.process_emissions_tco2e as number));
  }

  const paidAt = (nextStatus === 'payment_made') ? nowIso : (row.paid_at as string | null);

  await c.env.DB
    .prepare(
      `UPDATE oe_carbon_tax_returns
       SET chain_status = ?, reason = ?, actor_id = ?,
           sla_breached = ?, regulator_notified = ?,
           scope1_tco2e = COALESCE(?, scope1_tco2e),
           scope2_tco2e = COALESCE(?, scope2_tco2e),
           process_emissions_tco2e = COALESCE(?, process_emissions_tco2e),
           total_emissions_tco2e = ?,
           basic_allowance_pct = COALESCE(?, basic_allowance_pct),
           offset_allowance_pct = COALESCE(?, offset_allowance_pct),
           total_allowance_pct = COALESCE(?, total_allowance_pct),
           tax_rate_per_tco2 = COALESCE(?, tax_rate_per_tco2),
           gross_tax_liability = COALESCE(?, gross_tax_liability),
           allowances_value = COALESCE(?, allowances_value),
           net_tax_payable = COALESCE(?, net_tax_payable),
           payment_reference = COALESCE(?, payment_reference),
           paid_amount = COALESCE(?, paid_amount),
           paid_at = ?,
           sars_submission_ref = COALESCE(?, sars_submission_ref),
           sars_assessment_ref = COALESCE(?, sars_assessment_ref),
           assessment_amount = COALESCE(?, assessment_amount),
           dispute_reason = COALESCE(?, dispute_reason),
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus, body.reason ?? null, user.id,
      slaBreached, regulatorNotified,
      body.scope1_tco2e ?? null,
      body.scope2_tco2e ?? null,
      body.process_emissions_tco2e ?? null,
      totalEmissions,
      body.basic_allowance_pct ?? null,
      body.offset_allowance_pct ?? null,
      body.total_allowance_pct ?? null,
      body.tax_rate_per_tco2 ?? null,
      body.gross_tax_liability ?? null,
      body.allowances_value ?? null,
      body.net_tax_payable ?? null,
      body.payment_reference ?? null,
      body.paid_amount ?? null,
      paidAt,
      body.sars_submission_ref ?? null,
      body.sars_assessment_ref ?? null,
      body.assessment_amount ?? null,
      body.dispute_reason ?? null,
      nowIso,
      id,
    )
    .run();

  if (reportable) {
    await c.env.DB
      .prepare(
        `INSERT INTO regulator_inbox
           (id, category, priority, subject, body, source_table, source_id,
            source_event, participant_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        `ctr_reg_${id}_${action}_${Date.now()}`,
        'carbon_tax_return',
        (action === 'raise_dispute') ? 'medium' : 'high',
        `Carbon Tax — ${action.replace(/_/g, ' ')} — ${taxClass}`,
        `Carbon tax return ${id} (${taxClass}) reached '${nextStatus}' via '${action}'.`,
        'oe_carbon_tax_returns', id, `ctr_evt_${action}`,
        row.participant_id as string, nowIso,
      )
      .run();
  }

  await fireCascade({
    event: `ctr_evt_${action}` as EventType,
    actor_id: user.id,
    entity_type: 'carbon_tax_return',
    entity_id: id,
    data: {
      action, from_status: current, to_status: nextStatus,
      tax_class: taxClass, reason: body.reason ?? null,
      regulator_notified: reportable, crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, status: nextStatus, regulator_notified: regulatorNotified === 1 } });
});

router.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin') return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await ctrSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const carbonTaxRoutes = router;
export default router;
