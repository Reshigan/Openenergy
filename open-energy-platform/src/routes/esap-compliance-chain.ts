// ═══════════════════════════════════════════════════════════════════════════
// Wave 195 — ESAP Compliance Monitoring
//
// IFC Performance Standards 2012 + Equator Principles 4 + SARB + OHSA s8
// environmental and social action plan (ESAP) compliance lifecycle.
//
// Mounted at /api/esap-compliance.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  EsapComplianceStatus,
  EsapComplianceAction,
  CommitmentTier,
  deriveEsapSla,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  STATE_TRANSITIONS,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
} from '../utils/esap-compliance-spec';

const router = new Hono<HonoEnv>();
router.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'lender', 'ipp_developer'];
// Read audience: oversight (admin/support/regulator) + the chain's
// counterparties (lender/ipp_developer). oe_esap_compliance has no owner
// column to scope by, so reads are role-gated like other chain ledgers
// (cf. READ_ROLES in take-or-pay-chain.ts).
const READ_ROLES = new Set(['admin', 'support', 'regulator', 'lender', 'ipp_developer']);

// ─── SLA sweep (exported — called by cron) ───────────────────────────────────

export async function esapComplianceSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ swept: number }> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, commitment_tier FROM oe_esap_compliance
       WHERE sla_deadline IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_deadline <= ?`,
    )
    .bind(...[...HARD_TERMINALS], now)
    .all<{ id: string; commitment_tier: CommitmentTier }>();

  const rows = breaches.results ?? [];

  for (const row of rows) {
    const reportable = slaBreachCrossesIntoRegulator(row.commitment_tier);

    await env.DB
      .prepare(
        `UPDATE oe_esap_compliance
         SET sla_breached = 1,
             regulator_notified = CASE WHEN ? = 1 THEN 1 ELSE regulator_notified END,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(reportable ? 1 : 0, now, row.id)
      .run();

    if (reportable) {
      const inboxId = `reg_esap_sla_${row.id}_${Date.now()}`;
      await env.DB
        .prepare(
          `INSERT INTO regulator_inbox
             (id, category, priority, subject, body, source_table, source_id,
              source_event, participant_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          inboxId,
          'esap_compliance',
          'high',
          `ESAP SLA Breach — ${row.id}`,
          `ESAP compliance record ${row.id} (tier: ${row.commitment_tier}) has exceeded its SLA deadline. Regulatory notification required under SARB prudential guidance.`,
          'oe_esap_compliance',
          row.id,
          'esap_evt_sla_breached',
          'system',
          now,
        )
        .run();
    }

    await fireCascade({
      event: 'esap_evt_sla_breached' as EventType,
      actor_id: 'system',
      entity_type: 'esap_compliance',
      entity_id: row.id,
      data: {
        commitment_tier: row.commitment_tier,
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
  if (!READ_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const {
    status,
    commitment_tier,
    project_id,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(per_page) || 50));
  const pageNum = Math.max(1, parseInt(page) || 1);
  const off     = (pageNum - 1) * perPage;

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  if (status)          { clauses.push('chain_status = ?');      binds.push(status); }
  if (commitment_tier) { clauses.push('commitment_tier = ?');   binds.push(commitment_tier); }
  if (project_id)      { clauses.push('project_id = ?');        binds.push(project_id); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_esap_compliance ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_esap_compliance ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as open_periods,
           SUM(CASE WHEN chain_status = 'major_findings' OR chain_status = 'action_plan_required' THEN 1 ELSE 0 END) as major_findings_count,
           SUM(CASE WHEN chain_status = 'breach_declared' THEN 1 ELSE 0 END) as breach_declared_count,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as in_progress,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached_count,
           SUM(CASE WHEN chain_status = 'accepted' OR chain_status = 'verified' THEN 1 ELSE 0 END) as closed_clean
         FROM oe_esap_compliance`,
      )
      .bind(...[...HARD_TERMINALS])
      .first<Record<string, unknown>>(),
  ]);

  const total = totalRow?.n ?? 0;

  return c.json({
    success: true,
    data: rows.results ?? [],
    kpis: kpis ?? {},
    pagination: {
      page: pageNum,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage),
    },
  });
});

// ─── GET /:id — single record + timeline ──────────────────────────────────────

router.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_esap_compliance WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const timeline = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'esap_compliance' AND entity_id = ?
       ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, timeline: timeline.results ?? [] },
  });
});

// ─── POST / — create new monitoring period ────────────────────────────────────

router.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    reporting_period: string;
    commitment_tier: CommitmentTier;
    es_monitor_id?: string | null;
    finding_count_minor?: number | null;
    finding_count_major?: number | null;
    remediation_deadline?: string | null;
    breach_basis?: string | null;
    reason?: string | null;
  }>();

  if (!body.project_id || !body.reporting_period || !body.commitment_tier) {
    return c.json(
      {
        success: false,
        error: 'project_id, reporting_period, and commitment_tier are required',
      },
      400,
    );
  }

  const validTiers: CommitmentTier[] = ['systemic', 'major', 'significant', 'minor', 'routine'];
  if (!validTiers.includes(body.commitment_tier)) {
    return c.json(
      { success: false, error: `commitment_tier must be one of: ${validTiers.join(', ')}` },
      400,
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const id = `esap_${crypto.randomUUID()}`;

  const slaDays = deriveEsapSla(body.commitment_tier);
  const slaDeadline = new Date(now.getTime() + slaDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await c.env.DB
    .prepare(
      `INSERT INTO oe_esap_compliance
         (id, chain_status, project_id, reporting_period, commitment_tier,
          es_monitor_id, finding_count_minor, finding_count_major,
          remediation_deadline, breach_basis,
          sla_deadline, sla_breached, regulator_notified,
          actor_id, reason, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?)`,
    )
    .bind(
      id,
      'monitoring_period_open',
      body.project_id,
      body.reporting_period,
      body.commitment_tier,
      body.es_monitor_id ?? null,
      body.finding_count_minor ?? 0,
      body.finding_count_major ?? 0,
      body.remediation_deadline ?? null,
      body.breach_basis ?? null,
      slaDeadline,
      user.id,
      body.reason ?? null,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'esap_evt_monitoring_period_opened' as EventType,
    actor_id: user.id,
    entity_type: 'esap_compliance',
    entity_id: id,
    data: {
      project_id: body.project_id,
      reporting_period: body.reporting_period,
      commitment_tier: body.commitment_tier,
      sla_deadline: slaDeadline,
    },
    env: c.env,
  });

  return c.json(
    {
      success: true,
      data: {
        id,
        chain_status: 'monitoring_period_open',
        commitment_tier: body.commitment_tier,
        sla_deadline: slaDeadline,
      },
    },
    201,
  );
});

// ─── POST /:id/action — state machine transition ──────────────────────────────

router.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: EsapComplianceAction;
    reason?: string | null;
    actor_id?: string | null;
    finding_count_minor?: number | null;
    finding_count_major?: number | null;
    remediation_deadline?: string | null;
    breach_basis?: string | null;
  }>();

  if (!body.action) {
    return c.json({ success: false, error: 'action is required' }, 400);
  }

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_esap_compliance WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const current = row.chain_status as EsapComplianceStatus;

  if (HARD_TERMINALS.has(current)) {
    return c.json(
      {
        success: false,
        error: `Status '${current}' is terminal — no further transitions allowed`,
      },
      400,
    );
  }

  const action = body.action as EsapComplianceAction;
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
  const tier       = row.commitment_tier as CommitmentTier;
  const now        = new Date();
  const nowIso     = now.toISOString();

  const reportable = crossesIntoRegulator(action, tier);

  // SLA breach detection
  const slaDeadline     = row.sla_deadline as string | null;
  const alreadyBreached = (row.sla_breached as number) === 1;
  let slaBreached        = alreadyBreached ? 1 : 0;
  let regulatorNotified  = (row.regulator_notified as number) === 1 ? 1 : (reportable ? 1 : 0);

  if (slaDeadline && !alreadyBreached && nowIso > slaDeadline) {
    slaBreached = 1;
    if (slaBreachCrossesIntoRegulator(tier)) {
      regulatorNotified = 1;
    }
  }

  // Merge optional numeric updates
  const findingMinor = body.finding_count_minor != null
    ? body.finding_count_minor
    : (row.finding_count_minor as number | null);
  const findingMajor = body.finding_count_major != null
    ? body.finding_count_major
    : (row.finding_count_major as number | null);
  const remediationDeadline = body.remediation_deadline != null
    ? body.remediation_deadline
    : (row.remediation_deadline as string | null);
  const breachBasis = body.breach_basis != null
    ? body.breach_basis
    : (row.breach_basis as string | null);

  await c.env.DB
    .prepare(
      `UPDATE oe_esap_compliance
       SET chain_status = ?,
           reason = ?,
           actor_id = ?,
           sla_breached = ?,
           regulator_notified = ?,
           finding_count_minor = ?,
           finding_count_major = ?,
           remediation_deadline = ?,
           breach_basis = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextStatus,
      body.reason ?? null,
      body.actor_id ?? user.id,
      slaBreached,
      regulatorNotified,
      findingMinor,
      findingMajor,
      remediationDeadline,
      breachBasis,
      nowIso,
      id,
    )
    .run();

  if (reportable) {
    const inboxId = `reg_esap_${action}_${id}_${Date.now()}`;
    const priority =
      action === 'declare_breach' ? 'critical' :
      action === 'flag_major_findings' ? 'high' : 'medium';
    const subject =
      action === 'declare_breach'
        ? `ESAP Breach Declared — ${row.project_id} (${tier})`
        : `ESAP Major Findings — ${row.project_id} (${tier})`;
    const bodyText =
      action === 'declare_breach'
        ? `ESAP compliance breach declared for project ${row.project_id}, reporting period ${row.reporting_period}. Tier: ${tier}. Basis: ${breachBasis ?? 'N/A'}. Regulatory notification required under SARB prudential guidance, NERSA licence conditions, and IFC Performance Standards.`
        : `Major ESAP findings flagged for project ${row.project_id}, reporting period ${row.reporting_period}. Tier: ${tier}. Major findings count: ${findingMajor ?? 0}. Action plan required within lender-agreed timeframe.`;

    await c.env.DB
      .prepare(
        `INSERT INTO regulator_inbox
           (id, category, priority, subject, body, source_table, source_id,
            source_event, participant_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        inboxId,
        'esap_compliance',
        priority,
        subject,
        bodyText,
        'oe_esap_compliance',
        id,
        `esap_evt_${action}`,
        body.actor_id ?? user.id,
        nowIso,
      )
      .run();
  }

  await fireCascade({
    event: `esap_evt_${action}` as EventType,
    actor_id: body.actor_id ?? user.id,
    entity_type: 'esap_compliance',
    entity_id: id,
    data: {
      action,
      from_status: current,
      to_status: nextStatus,
      reason: body.reason ?? null,
      commitment_tier: tier,
      project_id: row.project_id,
      reporting_period: row.reporting_period,
      finding_count_minor: findingMinor,
      finding_count_major: findingMajor,
      regulator_notified: reportable,
      crosses_into_regulator: reportable,
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

  const result = await esapComplianceSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export const esapComplianceRoutes = router;
export default router;
