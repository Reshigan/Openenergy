// ═══════════════════════════════════════════════════════════════════════════
// Wave 156 — IPP Change of Control & Ownership Notification chain (P6)
//
// Electricity Regulation Act 4 of 2006 §11 (NERSA must approve any change
// in effective control of a licensee before that change takes effect) +
// Companies Act 71 of 2008 §115 (fundamental transactions).
//
// Mounted at /api/ipp-change-of-control/chain.
//
// Write model — SINGLE-PARTY {admin, ipp_developer}. NERSA officers write
// regulatory evaluation stages via the same route with the regulator JWT role.
// READ all nine personas. actor_party (notifying_party / nersa_officer /
// appeal_body) is derived from the ACTION, not the JWT role.
//
// INVERTED SLA (larger capacity → more NERSA scrutiny → more time):
//   minor       <10 MW   →  30 days (notification_submitted stage)
//   moderate    <50 MW   →  60 days
//   significant <150 MW  →  90 days
//   major       <500 MW  → 150 days
//   material    ≥500 MW  → 210 days
//
// Signature reportability:
//   grant_approval   → EVERY tier
//   reject_change    → major + material only
//   file_appeal      → major + material only
//   impose_conditions → significant + major + material only
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { badEnum } from '../utils/validation';
import {
  type ChangeOfControlStatus,
  type ChangeOfControlAction,
  type OwnershipTier,
  deriveOwnershipTier,
  crossesIntoRegulator,
  partyForAction,
  HARD_TERMINALS,
  VALID_TRANSITIONS,
  SLA_DAYS,
} from '../utils/ipp-change-of-control-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer'];

// ─── SLA sweep ──────────────────────────────────────────────────────────────

export async function ippChangeOfControlSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const terminalList = HARD_TERMINALS.map(() => '?').join(',');
  const breaches = await env.DB
    .prepare(
      `SELECT id, ownership_tier FROM oe_ipp_change_of_control
       WHERE sla_due_at IS NOT NULL AND sla_breached = 0
         AND chain_status NOT IN (${terminalList})
         AND sla_due_at <= ?`,
    )
    .bind(...HARD_TERMINALS, now)
    .all<{ id: string; ownership_tier: string }>();

  for (const row of breaches.results ?? []) {
    await env.DB
      .prepare(`UPDATE oe_ipp_change_of_control SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();
    await fireCascade({
      event: 'ipp_coc.sla_breached',
      actor_id: 'system',
      entity_type: 'ipp_coc',
      entity_id: row.id,
      data: { ownership_tier: row.ownership_tier },
      env,
    });
  }
}

// ─── GET / — list + KPIs ───────────────────────────────────────────────────

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const {
    project_id,
    status,
    tier,
    foreign_ownership_flag,
    page = '1',
    per_page = '50',
  } = c.req.query();

  const offset = (parseInt(page) - 1) * parseInt(per_page);
  const clauses: string[] = [];
  const binds: unknown[] = [];

  // Non-admin/support/regulator sees only their own participant rows.
  if (!['admin', 'support', 'regulator'].includes(user.role)) {
    clauses.push('participant_id = ?');
    binds.push(user.id);
  }
  if (project_id) { clauses.push('project_id = ?'); binds.push(project_id); }
  if (status) { clauses.push('chain_status = ?'); binds.push(status); }
  if (tier) { clauses.push('ownership_tier = ?'); binds.push(tier); }
  if (foreign_ownership_flag) { clauses.push('foreign_ownership_flag = ?'); binds.push(foreign_ownership_flag); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const terminalPlaceholders = HARD_TERMINALS.map(() => '?').join(',');

  const [rows, totalRow, kpis] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT * FROM oe_ipp_change_of_control ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, parseInt(per_page), offset)
      .all<Record<string, unknown>>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as n FROM oe_ipp_change_of_control ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    c.env.DB
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN chain_status NOT IN (${terminalPlaceholders}) THEN 1 ELSE 0 END) as open_count,
           SUM(CASE WHEN chain_status = 'control_transferred' THEN 1 ELSE 0 END) as transferred_count,
           SUM(CASE WHEN chain_status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
           SUM(CASE WHEN chain_status = 'appeal_filed' THEN 1 ELSE 0 END) as appeal_count,
           SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) as breached_count,
           SUM(CASE WHEN foreign_ownership_flag != 'domestic' THEN 1 ELSE 0 END) as foreign_count
         FROM oe_ipp_change_of_control ${where}`,
      )
      .bind(...HARD_TERMINALS, ...binds)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    success: true,
    data: {
      items: rows.results ?? [],
      pagination: {
        page: parseInt(page),
        per_page: parseInt(per_page),
        total: totalRow?.n ?? 0,
      },
      kpis,
    },
  });
});

// ─── GET /:id — single row + audit trail ───────────────────────────────────

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const { id } = c.req.param();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_change_of_control WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);

  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const audit = await c.env.DB
    .prepare(
      `SELECT * FROM audit_events
       WHERE entity_type = 'ipp_coc' AND entity_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: { ...row, audit_trail: audit.results ?? [] },
  });
});

// ─── POST / — create notification ─────────────────────────────────────────

app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    project_id: string;
    capacity_mw: number;
    transaction_type: string;
    acquirer_name: string;
    foreign_ownership_flag?: string;
    transferor_name?: string;
    acquirer_ownership_pct?: number;
    description?: string;
  }>();

  if (!body.project_id || body.capacity_mw == null || !body.transaction_type || !body.acquirer_name) {
    return c.json({ error: 'project_id, capacity_mw, transaction_type, acquirer_name required' }, 400);
  }

  const enumErr =
    badEnum('transaction_type', body.transaction_type, ['share_transfer', 'asset_acquisition', 'merger_scheme_of_arrangement', 'management_buyout', 'fund_recycling', 'change_of_lender_step_in'])
    ?? badEnum('foreign_ownership_flag', body.foreign_ownership_flag, ['domestic', 'sadc_resident', 'non_sadc_foreign']);
  if (enumErr) return c.json({ error: enumErr }, 400);

  const tier = deriveOwnershipTier(body.capacity_mw);
  const now = new Date().toISOString();
  const id = `ipp_coc_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const initialStatus: ChangeOfControlStatus = 'notification_submitted';
  const slaDays = SLA_DAYS[initialStatus][tier];
  const slaAt = new Date(Date.now() + slaDays * 24 * 3_600_000).toISOString();
  const foreignFlag = body.foreign_ownership_flag ?? 'domestic';

  await c.env.DB
    .prepare(
      `INSERT INTO oe_ipp_change_of_control
         (id, participant_id, project_id, capacity_mw, ownership_tier,
          transaction_type, acquirer_name, foreign_ownership_flag,
          transferor_name, acquirer_ownership_pct, description,
          chain_status, sla_due_at, sla_breached,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'notification_submitted',?,0,?,?)`,
    )
    .bind(
      id,
      user.id,
      body.project_id,
      body.capacity_mw,
      tier,
      body.transaction_type,
      body.acquirer_name,
      foreignFlag,
      body.transferor_name ?? null,
      body.acquirer_ownership_pct ?? null,
      body.description ?? null,
      slaAt,
      now,
      now,
    )
    .run();

  await fireCascade({
    event: 'ipp_coc.created',
    actor_id: user.id,
    entity_type: 'ipp_coc',
    entity_id: id,
    data: { tier, capacity_mw: body.capacity_mw, transaction_type: body.transaction_type },
    env: c.env,
  });

  return c.json({ success: true, data: { id, tier } }, 201);
});

// ─── PUT /:id/action — state machine dispatch ──────────────────────────────

app.put('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role) && user.role !== 'regulator') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { id } = c.req.param();
  const body = await c.req.json<{
    action: ChangeOfControlAction | 'flag_sla_breach';
    notes?: string;
    conditions_text?: string;
    appeal_grounds?: string;
    reason?: string;
  }>();

  const row = await c.env.DB
    .prepare('SELECT * FROM oe_ipp_change_of_control WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'Not found' }, 404);

  // Non-privileged users may only act on their own records.
  if (
    !['admin', 'support', 'regulator'].includes(user.role) &&
    row.participant_id !== user.id
  ) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const current = row.chain_status as ChangeOfControlStatus;
  if (HARD_TERMINALS.includes(current)) {
    return c.json({ error: `Status ${current} is terminal` }, 409);
  }

  const tier = row.ownership_tier as OwnershipTier;

  const ACTION_STATE_MAP: Partial<Record<ChangeOfControlAction | 'flag_sla_breach', ChangeOfControlStatus>> = {
    commence_completeness:      'completeness_check',
    submit_foreign_screen:      'foreign_ownership_screen',
    commence_competition:       'competition_screen',
    commence_technical:         'technical_assessment',
    open_public_participation:  'public_participation',
    close_public_participation: 'nersa_evaluation',
    issue_evaluation:           'nersa_evaluation',       // self-loop: note only
    grant_approval:             'conditional_approval',
    impose_conditions:          'conditional_approval',   // self-loop: sets conditions
    transfer_control:           'control_transferred',
    reject_change:              'rejected',
    file_appeal:                'appeal_filed',
    determine_appeal:           'appeal_determined',
    withdraw:                   'withdrawn',
    flag_sla_breach:            current,                  // self-loop: marks breach
  };

  const nextSt = ACTION_STATE_MAP[body.action];
  if (!nextSt) return c.json({ error: `Unknown action: ${body.action}` }, 400);

  // Validate transition (skip check for self-loops).
  if (nextSt !== current && !VALID_TRANSITIONS[current]?.includes(nextSt)) {
    return c.json({ error: `Cannot transition ${current} → ${nextSt}` }, 409);
  }

  const now = new Date().toISOString();
  const extraCols: Record<string, unknown> = {};

  // Timestamp columns per action.
  if (body.action === 'grant_approval') extraCols.approval_granted_at = now;
  if (body.action === 'transfer_control') extraCols.control_transferred_at = now;
  if (body.action === 'reject_change') extraCols.rejected_at = now;
  if (body.action === 'determine_appeal') extraCols.appeal_determined_at = now;

  // Payload columns per action.
  if (body.action === 'impose_conditions' && body.conditions_text) {
    extraCols.conditions_text = body.conditions_text;
  }
  if (body.action === 'file_appeal' && body.appeal_grounds) {
    extraCols.appeal_grounds = body.appeal_grounds;
  }
  if (body.action === 'flag_sla_breach') {
    extraCols.sla_breached = 1;
  }

  // Recompute SLA deadline for the new state (0-budget states → NULL).
  let slaAt: string | null = null;
  if (!HARD_TERMINALS.includes(nextSt) && nextSt !== current) {
    const slaDays = SLA_DAYS[nextSt]?.[tier] ?? 0;
    if (slaDays > 0) {
      slaAt = new Date(Date.now() + slaDays * 24 * 3_600_000).toISOString();
    }
  }

  const setCols = [
    'chain_status = ?',
    'updated_at = ?',
    'sla_due_at = ?',
    ...Object.keys(extraCols).map((k) => `${k} = ?`),
  ];

  await c.env.DB
    .prepare(`UPDATE oe_ipp_change_of_control SET ${setCols.join(', ')} WHERE id = ?`)
    .bind(nextSt, now, slaAt, ...Object.values(extraCols), id)
    .run();

  const reportable = crossesIntoRegulator(body.action as ChangeOfControlAction, tier);
  await fireCascade({
    event: `ipp_coc.${body.action}` as never,
    actor_id: user.id,
    entity_type: 'ipp_coc',
    entity_id: id,
    data: {
      from: current,
      to: nextSt,
      tier,
      notes: body.notes ?? null,
      actor_party: partyForAction(body.action as ChangeOfControlAction),
      is_reportable: reportable,
      crosses_into_regulator: reportable,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, status: nextSt, is_reportable: reportable } });
});

export default app;
