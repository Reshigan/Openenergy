// ═══════════════════════════════════════════════════════════════════════════════
// W202 — IPP Green Bond Allocation & Climate Finance Report
// ICMA GBP 2021 + JSE Green Bond Segment Rules + CBI Climate Bonds Standard
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  GbrStatus, GbrAction, BondClass,
  deriveGbrSla, GBR_HARD_TERMINALS,
  GBR_VALID_TRANSITIONS, GBR_STATE_TRANSITIONS,
  gbrCrossesIntoRegulator, gbrSlaBreachCrossesIntoRegulator,
} from '../utils/green-bond-spec';
import { resolveNextStatus } from '../utils/chain-sla';
import { badEnum } from '../utils/validation';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function gbrSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_green_bond_reports
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('approved','published','rejected')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_green_bond_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (gbrSlaBreachCrossesIntoRegulator(row.issuance_size_zar as number)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'green_bond_report', row.id,
          'green_bond_sla_breach',
          `Green bond report SLA breached — ${row.report_year} — ISIN ${row.bond_isin ?? 'unknown'} — R${(row.issuance_size_zar as number / 1_000_000).toFixed(0)}m`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'green_bond_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'green_bond_report', entity_id: row.id as string,
      data: { report_year: row.report_year, bond_class: row.bond_class },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'support', 'regulator'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_green_bond_reports WHERE participant_id = ? ORDER BY report_year DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    published: all.filter(r => r.chain_status === 'published').length,
    pending: all.filter(r => !GBR_HARD_TERMINALS.has(r.chain_status as GbrStatus)).length,
    rejected: all.filter(r => r.chain_status === 'rejected').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_green_bond_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support', 'regulator'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'green_bond_report' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    bond_isin?: string;
    bond_class?: BondClass;
    report_year: number;
    issuance_size_zar: number;
    reporting_period_start: string;
    reporting_period_end: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const bondClassErr = badEnum('bond_class', body.bond_class, ['project', 'corporate', 'sovereign', 'securitised']);
  if (bondClassErr) return c.json({ success: false, error: bondClassErr }, 422);
  const bondClass = body.bond_class ?? 'project';
  const issuanceSize = body.issuance_size_zar ?? 0;
  const reportYear = body.report_year ?? new Date().getFullYear();

  const now = new Date().toISOString();
  const slaDeadline = new Date(Date.now() + deriveGbrSla(bondClass, issuanceSize) * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_green_bond_reports
      (id, participant_id, bond_isin, bond_class, report_year, issuance_size_zar,
       reporting_period_start, reporting_period_end,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,'period_open',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.bond_isin ?? null, bondClass,
      reportYear, issuanceSize,
      body.reporting_period_start ?? `${reportYear}-01-01`,
      body.reporting_period_end ?? `${reportYear}-12-31`,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'green_bond_report_created' as EventType,
    actor_id: user.id, entity_type: 'green_bond_report', entity_id: id,
    data: { report_year: reportYear, bond_class: bondClass, issuance_size_zar: issuanceSize },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_green_bond_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: GbrAction;
    reason?: string;
    external_reviewer?: string;
    review_type?: string;
    review_ref?: string;
    board_resolution_ref?: string;
    jse_submission_ref?: string;
    kwh_generated?: number;
    carbon_avoided_tco2e?: number;
    green_capex_deployed_zar?: number;
    deficiency_description?: string;
    rejection_reason?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_green_bond_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as GbrStatus;
  if (GBR_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Report in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = GBR_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const reviewTypeErr = badEnum('review_type', body.review_type, ['second_party', 'certification', 'verification', 'rating']);
  if (reviewTypeErr) return c.json({ success: false, error: reviewTypeErr }, 422);

  const nextStatus = resolveNextStatus(action, currentStatus, GBR_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  // Inline SLA breach check
  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_green_bond_reports SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  // Build update
  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.external_reviewer) { extra.push('external_reviewer = ?'); eb.push(body.external_reviewer); }
  if (body.review_type) { extra.push('review_type = ?'); eb.push(body.review_type); }
  if (body.review_ref) { extra.push('review_ref = ?'); eb.push(body.review_ref); }
  if (action === 'complete_external_review') { extra.push('review_completed_at = ?'); eb.push(now); }
  if (body.board_resolution_ref) { extra.push('board_resolution_ref = ?'); eb.push(body.board_resolution_ref); }
  if (action === 'board_approve') { extra.push('board_approved_at = ?'); eb.push(now); }
  if (body.jse_submission_ref) { extra.push('jse_submission_ref = ?'); eb.push(body.jse_submission_ref); }
  if (action === 'jse_approve') { extra.push('jse_approved_at = ?'); eb.push(now); }
  if (action === 'publish') { extra.push('published_at = ?'); eb.push(now); }
  if (body.kwh_generated != null) { extra.push('kwh_generated = ?'); eb.push(body.kwh_generated); }
  if (body.carbon_avoided_tco2e != null) { extra.push('carbon_avoided_tco2e = ?'); eb.push(body.carbon_avoided_tco2e); }
  if (body.green_capex_deployed_zar != null) { extra.push('green_capex_deployed_zar = ?'); eb.push(body.green_capex_deployed_zar); }
  if (action === 'jse_raises_queries') { extra.push('query_count = query_count + 1', 'last_query_at = ?'); eb.push(now); }
  if (action === 'respond_to_queries') { extra.push('last_response_at = ?'); eb.push(now); }
  if (body.deficiency_description) { extra.push('deficiency_description = ?'); eb.push(body.deficiency_description); }
  if (body.rejection_reason) { extra.push('rejection_reason = ?'); eb.push(body.rejection_reason); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_green_bond_reports SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  // Regulator crossing
  const issuanceSize = row.issuance_size_zar as number;
  if (gbrCrossesIntoRegulator(action, issuanceSize)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'green_bond_report', id,
        `green_bond_${action}`,
        `Green bond report ${action} — ${row.report_year} — ISIN ${row.bond_isin ?? 'unknown'} — R${(issuanceSize / 1_000_000).toFixed(0)}m`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_green_bond_reports SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `green_bond_${action}` as EventType,
    actor_id: user.id, entity_type: 'green_bond_report', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, report_year: row.report_year },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_green_bond_reports WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await gbrSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
