// ═══════════════════════════════════════════════════════════════════════════
// Wave 173 — IPP Force Majeure Declaration & Relief Claim (P6)
//
// REIPPPP Power Purchase Agreement (PPPA) Force Majeure clauses + FIDIC
// Silver Book (EPC turnkey) FM provisions + NERSA Grid Code s.8.7
// (extended grid unavailability). IPP projects must issue a formal FM
// notice within the contractual deadline (typically 5–14 days of the FM
// event) and prosecute the relief claim through the Independent Engineer.
//
// Mounted at /api/ipp-force-majeure.
//
// URGENT SLA: higher severity FM events require FASTER resolution to
// preserve PPPA rights and prevent deadline forfeit.
// WRITE: admin | ipp_developer
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── Types ───────────────────────────────────────────────────────────────────

type FmStatus =
  | 'fm_identified'
  | 'fm_notice_issued'
  | 'counterparty_acknowledgment'
  | 'ie_assessment_requested'
  | 'ie_assessment_in_progress'
  | 'ie_report_issued'
  | 'relief_quantified'
  | 'negotiation_in_progress'
  | 'relief_agreed'
  | 'relief_refused'
  | 'arbitration_commenced';

type FmAction =
  | 'issue_fm_notice'
  | 'receive_acknowledgment'
  | 'request_ie_assessment'
  | 'commence_ie_assessment'
  | 'issue_ie_report'
  | 'quantify_relief'
  | 'commence_negotiation'
  | 'confirm_relief'
  | 'refuse_relief'
  | 'declare_arbitration';

type FmSeverityTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

type FmCategory =
  | 'natural_disaster'
  | 'grid_unavailability'
  | 'political_event'
  | 'change_in_law'
  | 'pandemic'
  | 'civil_unrest';

type FmReliefType =
  | 'time_extension'
  | 'cost_relief'
  | 'time_and_cost'
  | 'tariff_adjustment'
  | 'termination_right';

type AnyAction = FmAction | 'flag_sla_breach';

// ─── Tier derivation ─────────────────────────────────────────────────────────

function deriveFmSeverityTier(relief_zar: number): FmSeverityTier {
  if (relief_zar < 1_000_000)   return 'minor';
  if (relief_zar < 10_000_000)  return 'moderate';
  if (relief_zar < 50_000_000)  return 'material';
  if (relief_zar < 200_000_000) return 'major';
  return 'critical';
}

// ─── SLA constants (URGENT — higher severity = LESS time) ────────────────────

const SLA_DAYS: Record<FmSeverityTier, number> = {
  minor:    90,
  moderate: 60,
  material: 45,
  major:    30,
  critical: 21,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

const HARD_TERMINALS = new Set<FmStatus>([
  'relief_agreed',
  'relief_refused',
  'arbitration_commenced',
]);

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<FmAction, { from: FmStatus[] }> = {
  issue_fm_notice:        { from: ['fm_identified'] },
  receive_acknowledgment: { from: ['fm_notice_issued'] },
  request_ie_assessment:  { from: ['counterparty_acknowledgment'] },
  commence_ie_assessment: { from: ['ie_assessment_requested'] },
  issue_ie_report:        { from: ['ie_assessment_in_progress'] },
  quantify_relief:        { from: ['ie_report_issued'] },
  commence_negotiation:   { from: ['relief_quantified'] },
  confirm_relief:         { from: ['negotiation_in_progress'] },
  refuse_relief:          { from: ['negotiation_in_progress'] },
  declare_arbitration:    { from: ['counterparty_acknowledgment', 'negotiation_in_progress', 'relief_refused'] },
};

// ─── Regulator crossings ─────────────────────────────────────────────────────

const ALL_TIERS = new Set<FmSeverityTier>(['minor', 'moderate', 'material', 'major', 'critical']);
const MAJOR_PLUS = new Set<FmSeverityTier>(['major', 'critical']);

function crossesIntoRegulator(action: FmAction, tier: FmSeverityTier): boolean {
  if (action === 'declare_arbitration') return ALL_TIERS.has(tier);
  if (action === 'refuse_relief')       return ALL_TIERS.has(tier);
  if (action === 'confirm_relief')      return MAJOR_PLUS.has(tier);
  return false;
}

function slaBreachCrossesIntoRegulator(tier: FmSeverityTier): boolean {
  return MAJOR_PLUS.has(tier);
}

// ─── SLA sweep ───────────────────────────────────────────────────────────────

export async function ippForceMajeureSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = [...HARD_TERMINALS].map(() => '?').join(',');

  const breaches = await env.DB
    .prepare(
      `SELECT id, fm_severity_tier FROM oe_ipp_force_majeure
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; fm_severity_tier: FmSeverityTier }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_force_majeure SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    await fireCascade({
      event: 'fmr_evt_flag_sla_breach' as EventType,
      actor_id: 'system',
      entity_type: 'ipp_fmr',
      entity_id: row.id,
      data: {
        fm_severity_tier: row.fm_severity_tier,
        is_reportable: slaBreachCrossesIntoRegulator(row.fm_severity_tier),
        crosses_into_regulator: slaBreachCrossesIntoRegulator(row.fm_severity_tier),
      },
      env,
    });
  }
}

// ─── GET / — paginated list + KPIs ───────────────────────────────────────────

app.get('/', async (c) => {
  const user = getCurrentUser(c);

  const {
    participant_id,
    chain_status,
    fm_severity_tier,
    fm_category,
    limit = '50',
    offset = '0',
  } = c.req.query();

  const perPage = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const off     = Math.max(0, parseInt(offset) || 0);

  const clauses: string[] = [];
  const binds: unknown[]  = [];

  // Non-admin/support/regulator sees only their own rows.
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  } else if (participant_id) {
    clauses.push('participant_id = ?');
    binds.push(participant_id);
  }
  if (chain_status)     { clauses.push('chain_status = ?');      binds.push(chain_status); }
  if (fm_severity_tier) { clauses.push('fm_severity_tier = ?');  binds.push(fm_severity_tier); }
  if (fm_category)      { clauses.push('fm_category = ?');       binds.push(fm_category); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = [...HARD_TERMINALS].map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_force_majeure ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, perPage, off)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_force_majeure ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as sla_breached,
           ROUND(
             100.0 * SUM(CASE WHEN chain_status = 'relief_agreed' THEN 1 ELSE 0 END)
               / NULLIF(COUNT(*), 0),
             2
           ) as agreed_pct,
           SUM(CASE WHEN chain_status = 'arbitration_commenced' THEN 1 ELSE 0 END) as arbitration_count
         FROM oe_ipp_force_majeure ${where}`,
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

// ─── GET /:id — single row + audit trail ─────────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_force_majeure WHERE id = ?')
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
       WHERE entity_type = 'ipp_fmr' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create a new FM claim record ────────────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{
    project_id: string;
    fm_category: FmCategory;
    relief_type: FmReliefType;
    estimated_relief_zar: number;
    counterparty_name?: string | null;
    ie_firm_name?: string | null;
  }>();

  if (
    !body.project_id ||
    !body.fm_category ||
    !body.relief_type ||
    body.estimated_relief_zar == null
  ) {
    return c.json(
      {
        success: false,
        error: 'project_id, fm_category, relief_type, estimated_relief_zar are required',
      },
      400,
    );
  }

  const tier = deriveFmSeverityTier(body.estimated_relief_zar);
  const now = new Date();
  const nowIso = now.toISOString();
  const id = crypto.randomUUID();

  const slaDays = SLA_DAYS[tier];
  const slaAt = new Date(now.getTime() + slaDays * 24 * 3_600_000).toISOString();

  // 17 columns exactly:
  // id, participant_id, project_id, fm_category, relief_type,
  // estimated_relief_zar, fm_severity_tier, counterparty_name, ie_firm_name,
  // chain_status, sla_due_at, sla_breached, fm_notice_issued_at,
  // ie_report_issued_at, fm_resolved_at, created_at, updated_at
  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_force_majeure
         (id, participant_id, project_id, fm_category, relief_type,
          estimated_relief_zar, fm_severity_tier, counterparty_name, ie_firm_name,
          chain_status, sla_due_at, sla_breached, fm_notice_issued_at,
          ie_report_issued_at, fm_resolved_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,NULL,NULL,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.fm_category,
      body.relief_type,
      body.estimated_relief_zar,
      tier,
      body.counterparty_name ?? null,
      body.ie_firm_name ?? null,
      'fm_identified',
      slaAt,
      nowIso,
      nowIso,
    )
    .run();

  await fireCascade({
    event: 'ipp_fmr.created' as EventType,
    actor_id: user.id,
    entity_type: 'ipp_fmr',
    entity_id: id,
    data: {
      tier,
      fm_category: body.fm_category,
      relief_type: body.relief_type,
      estimated_relief_zar: body.estimated_relief_zar,
      counterparty_name: body.counterparty_name ?? null,
      ie_firm_name: body.ie_firm_name ?? null,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ─── PUT /:id/action — state machine dispatch ─────────────────────────────────

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: AnyAction;
    notes?: string;
    reason?: string;
    counterparty_name?: string | null;
    ie_firm_name?: string | null;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_force_majeure WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as FmStatus;
  if (HARD_TERMINALS.has(current)) {
    return c.json({ success: false, error: `Status '${current}' is terminal` }, 409);
  }

  const tier = row.fm_severity_tier as FmSeverityTier;

  // ACTION_STATE_MAP: each action maps to its target status.
  // flag_sla_breach is a self-loop (fires event, stays on current status).
  const ACTION_STATE_MAP: Record<AnyAction, FmStatus> = {
    issue_fm_notice:        'fm_notice_issued',
    receive_acknowledgment: 'counterparty_acknowledgment',
    request_ie_assessment:  'ie_assessment_requested',
    commence_ie_assessment: 'ie_assessment_in_progress',
    issue_ie_report:        'ie_report_issued',
    quantify_relief:        'relief_quantified',
    commence_negotiation:   'negotiation_in_progress',
    confirm_relief:         'relief_agreed',
    refuse_relief:          'relief_refused',
    declare_arbitration:    'arbitration_commenced',
    flag_sla_breach:        current, // self-loop
  };

  const action = body.action as AnyAction;

  const nextSt = ACTION_STATE_MAP[action];
  if (nextSt === undefined) {
    return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
  }

  // Validate non-self-loop transitions.
  if (nextSt !== current) {
    const rule = VALID_TRANSITIONS[body.action as FmAction];
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

  // Timestamp side-effects
  if (action === 'issue_fm_notice')   extraCols.fm_notice_issued_at = nowIso;
  if (action === 'issue_ie_report')   extraCols.ie_report_issued_at = nowIso;
  if (action === 'confirm_relief')    extraCols.fm_resolved_at      = nowIso;
  if (action === 'refuse_relief')     extraCols.fm_resolved_at      = nowIso;
  if (action === 'declare_arbitration') extraCols.fm_resolved_at    = nowIso;
  if (action === 'flag_sla_breach')   extraCols.sla_breached        = 1;

  // Allow updating counterparty and IE firm at any non-terminal point.
  if (body.counterparty_name != null) extraCols.counterparty_name = body.counterparty_name;
  if (body.ie_firm_name != null)      extraCols.ie_firm_name      = body.ie_firm_name;

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
    ? crossesIntoRegulator(body.action as FmAction, tier)
    : slaBreachCrossesIntoRegulator(tier);

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
    .prepare(`UPDATE oe_ipp_force_majeure SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(...setValues, id)
    .run();

  await fireCascade({
    event: `fm_evt_${body.action}` as EventType,
    actor_id: user.id,
    entity_type: 'ipp_fmr',
    entity_id: id,
    data: {
      action,
      previous_status: current,
      new_status: nextSt,
      fm_category: row.fm_category,
      relief_type: row.relief_type,
      fm_severity_tier: tier,
      estimated_relief_zar: row.estimated_relief_zar,
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
