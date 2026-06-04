// ═══════════════════════════════════════════════════════════════════════════
// Wave 162 — IPP Lender's Technical Advisor (LTA) Drawdown Certificate chain (P6)
//
// REIPPPP PPA Schedule 5 (Lender Requirements) + LMA construction-finance
// model (LTA/Independent Technical Monitor clause) + SARB Reg.23 project
// finance monitoring. The LTA certificate is the technical gate condition
// that unblocks each drawdown request (W21). An LTA is appointed by the
// lenders to independently certify construction progress and cost adequacy
// before each drawdown instalment is released.
//
// Mounted at /api/ipp-lta-certificate.
//
// INVERTED SLA: larger drawdown request → higher lender scrutiny → MORE time.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  type LtaCertificateStatus,
  type LtaCertificateAction,
  type DrawdownTier,
  type CertificateCategory,
  deriveDrawdownTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-lta-certificate-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ──────────────────────────────────────────────────────────────

export async function ippLtaCertificateSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, drawdown_tier FROM oe_ipp_lta_certificates
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; drawdown_tier: DrawdownTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_lta_certificates SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'ipp_lta.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_lta',
      entity_id: row.id,
      data: {
        drawdown_tier: row.drawdown_tier,
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.drawdown_tier),
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
  if (project_id) { clauses.push('project_id = ?');    binds.push(project_id); }
  if (status)     { clauses.push('chain_status = ?');   binds.push(status); }
  if (tier)       { clauses.push('drawdown_tier = ?');  binds.push(tier); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_lta_certificates ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_lta_certificates ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status IN ('certificate_approved','conditions_resolved') THEN 1 ELSE 0 END) as approved_count,
           SUM(CASE WHEN chain_status = 'certificate_refused' THEN 1 ELSE 0 END) as refused_count,
           SUM(CASE WHEN chain_status IN ('appeal_raised','appeal_determined') THEN 1 ELSE 0 END) as appeal_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(CASE WHEN chain_status IN ('certificate_approved','conditions_resolved') THEN drawdown_amount_zar ELSE 0 END) as total_approved_zar
         FROM oe_ipp_lta_certificates ${where}`,
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
    .prepare('SELECT * FROM oe_ipp_lta_certificates WHERE id = ?')
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
       WHERE entity_type = 'ipp_lta' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new LTA drawdown certificate record ────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    drawdown_amount_zar: number;
    certificate_category: CertificateCategory;
    drawdown_reference?: string;
    lta_firm_name?: string;
  }>();

  if (
    !body.project_id ||
    body.drawdown_amount_zar == null ||
    !body.certificate_category
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, drawdown_amount_zar, certificate_category are required',
      },
      400,
    );
  }

  const tier = deriveDrawdownTier(body.drawdown_amount_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = `ipp_lta_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 18 columns exactly:
  // id, participant_id, project_id, drawdown_amount_zar, drawdown_tier,
  // certificate_category, drawdown_reference, lta_firm_name, chain_status,
  // sla_due_at, sla_breached, site_inspection_at, draft_issued_at,
  // final_issued_at, certificate_approved_at, certificate_refused_at,
  // created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_lta_certificates
         (id, participant_id, project_id, drawdown_amount_zar, drawdown_tier,
          certificate_category, drawdown_reference, lta_firm_name, chain_status,
          sla_due_at, sla_breached, site_inspection_at, draft_issued_at,
          final_issued_at, certificate_approved_at, certificate_refused_at,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0, NULL,NULL,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.drawdown_amount_zar,
      tier,
      body.certificate_category,
      body.drawdown_reference ?? null,
      body.lta_firm_name ?? null,
      'certificate_requested',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_lta.created',
    actor_id: user.id,
    entity_type: 'ipp_lta',
    entity_id: id,
    data: {
      tier,
      drawdown_amount_zar: body.drawdown_amount_zar,
      certificate_category: body.certificate_category,
      drawdown_reference: body.drawdown_reference ?? null,
      lta_firm_name: body.lta_firm_name ?? null,
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
    action: LtaCertificateAction | 'flag_sla_breach';
    notes?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_lta_certificates WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as LtaCertificateStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.drawdown_tier as DrawdownTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  type AnyAction = LtaCertificateAction | 'flag_sla_breach';
  const ACTION_STATE_MAP: Record<AnyAction, LtaCertificateStatus> = {
    schedule_site_inspection:  'site_inspection_in_progress',
    complete_site_inspection:  'progress_assessment',
    issue_draft_certificate:   'draft_certificate_issued',
    submit_borrower_comments:  'borrower_comments_submitted',
    issue_final_certificate:   'final_certificate_in_review',
    approve_certificate:       'certificate_approved',
    qualify_certificate:       'certificate_qualified',
    resolve_conditions:        'conditions_resolved',
    refuse_certificate:        'certificate_refused',
    raise_appeal:              'appeal_raised',
    determine_appeal:          'appeal_determined',
    flag_sla_breach:           current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as LtaCertificateAction];
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

  if (action === 'complete_site_inspection') extraCols.site_inspection_at = nowIso;
  if (action === 'issue_draft_certificate')  extraCols.draft_issued_at = nowIso;
  if (action === 'issue_final_certificate')  extraCols.final_issued_at = nowIso;
  if (action === 'approve_certificate')      extraCols.certificate_approved_at = nowIso;
  if (action === 'resolve_conditions')       extraCols.certificate_approved_at = nowIso;
  if (action === 'refuse_certificate')       extraCols.certificate_refused_at = nowIso;
  if (action === 'flag_sla_breach')          extraCols.sla_breached = 1;

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
    ? crossesIntoRegulator(body.action as LtaCertificateAction, tier)
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
    .prepare(`UPDATE oe_ipp_lta_certificates SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `lta_evt_${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_lta',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      drawdown_amount_zar: row.drawdown_amount_zar,
      certificate_category: row.certificate_category,
      drawdown_reference: row.drawdown_reference ?? null,
      lta_firm_name: row.lta_firm_name ?? null,
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
