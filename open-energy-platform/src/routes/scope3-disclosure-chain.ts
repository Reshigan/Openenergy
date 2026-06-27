// ═══════════════════════════════════════════════════════════════════════════════
// W225 — Carbon Scope 3 Value Chain Emission Calculation & Third-Party Assurance
// TCFD + ISSB IFRS S2 + GHG Protocol Scope 3 + CDP
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  S3Status, S3Action, S3Tier,
  deriveS3Sla, S3_HARD_TERMINALS,
  S3_VALID_TRANSITIONS, S3_STATE_TRANSITIONS,
  s3CrossesIntoRegulator, s3SlaBreachCrossesIntoRegulator,
} from '../utils/scope3-disclosure-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'carbon_fund', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function s3SlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_carbon_scope3_disclosures
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('disclosure_filed','assurance_qualified','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_carbon_scope3_disclosures SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (s3SlaBreachCrossesIntoRegulator(row.s3_tier as S3Tier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'carbon_scope3_disclosure', row.id,
          's3_sla_breach',
          `Scope 3 disclosure SLA breached — ${row.s3_tier} — ${(row.entity_name as string) ?? (row.id as string).slice(0, 8)} — FY${row.reporting_year ?? '?'}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 's3_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'carbon_scope3_disclosure', entity_id: row.id as string,
      data: { s3_tier: row.s3_tier, reporting_year: row.reporting_year },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_scope3_disclosures WHERE participant_id = ? ORDER BY reporting_year DESC, created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    in_progress: all.filter(r => !['disclosure_filed','assurance_qualified','withdrawn'].includes(r.chain_status as string)).length,
    filed: all.filter(r => r.chain_status === 'disclosure_filed').length,
    qualified: all.filter(r => r.chain_status === 'assurance_qualified').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_scope3_disclosures WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'carbon_scope3_disclosure' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    s3_tier?: S3Tier;
    reporting_year?: number;
    entity_name?: string;
    reporting_framework?: string;
    category_count?: number;
    category_list?: string;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.s3_tier ?? 'standard';

  const now = new Date().toISOString();
  const slaDays = deriveS3Sla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_carbon_scope3_disclosures
      (id, participant_id, s3_tier, reporting_year, entity_name, reporting_framework,
       category_count, category_list,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,'scope3_initiated',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier,
      body.reporting_year ?? new Date().getFullYear(),
      body.entity_name ?? null, body.reporting_framework ?? null,
      body.category_count ?? null, body.category_list ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 's3_created' as EventType,
    actor_id: user.id, entity_type: 'carbon_scope3_disclosure', entity_id: id,
    data: { s3_tier: tier, reporting_year: body.reporting_year },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_scope3_disclosures WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: S3Action;
    reason?: string;
    category_count?: number;
    category_list?: string;
    primary_data_coverage_pct?: number;
    scope3_total_tco2e?: number;
    assurance_provider?: string;
    assurance_standard?: string;
    assurance_type?: string;
    qualified_opinion_reason?: string;
    filing_platform?: string;
    filing_ref?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_scope3_disclosures WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as S3Status;
  if (S3_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Disclosure in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = S3_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, S3_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_carbon_scope3_disclosures SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'set_categories') {
    extra.push('categories_set_at = ?', 'category_count = ?', 'category_list = ?');
    eb.push(now, body.category_count ?? null, body.category_list ?? null);
  }
  if (action === 'open_data_collection') { extra.push('data_collection_opened_at = ?'); eb.push(now); }
  if (action === 'close_data_collection') {
    extra.push('data_collection_closed_at = ?', 'primary_data_coverage_pct = ?');
    eb.push(now, body.primary_data_coverage_pct ?? null);
  }
  if (action === 'run_calculations') { extra.push('calculations_completed_at = ?'); eb.push(now); }
  if (action === 'complete_internal_review') {
    extra.push('review_completed_at = ?', 'scope3_total_tco2e = ?');
    eb.push(now, body.scope3_total_tco2e ?? null);
  }
  if (action === 'submit_for_assurance') {
    extra.push('assurance_provider = ?', 'assurance_standard = ?');
    eb.push(body.assurance_provider ?? null, body.assurance_standard ?? null);
  }
  if (action === 'issue_limited_assurance' || action === 'issue_reasonable_assurance') {
    extra.push('assurance_type = ?', 'assurance_completed_at = ?');
    eb.push(action === 'issue_limited_assurance' ? 'limited' : 'reasonable', now);
  }
  if (action === 'file_disclosure') {
    extra.push('filing_platform = ?', 'filing_ref = ?', 'filing_submitted_at = ?');
    eb.push(body.filing_platform ?? null, body.filing_ref ?? null, now);
  }
  if (action === 'qualify_assurance') {
    extra.push('qualified_opinion_reason = ?');
    eb.push(body.qualified_opinion_reason ?? null);
  }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_carbon_scope3_disclosures SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (s3CrossesIntoRegulator(action, row.s3_tier as S3Tier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'carbon_scope3_disclosure', id,
        `s3_${action}`,
        `Scope 3 disclosure ${action.replace(/_/g, ' ')} — ${row.s3_tier} — ${(row.entity_name as string) ?? (row.id as string).slice(0, 8)} — FY${row.reporting_year ?? '?'}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_carbon_scope3_disclosures SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `s3_${action}` as EventType,
    actor_id: user.id, entity_type: 'carbon_scope3_disclosure', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, s3_tier: row.s3_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_carbon_scope3_disclosures WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'carbon_fund', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await s3SlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
