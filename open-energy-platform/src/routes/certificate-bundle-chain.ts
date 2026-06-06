// ═══════════════════════════════════════════════════════════════════════════════
// W226 — Certificate Bundle & Attestation Lifecycle
// CDP / JSE ESG / RE100 / SBTi cross-track disclosure attestation
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  BundleStatus, BundleAction, BundleTier,
  deriveBundleSla, BUNDLE_HARD_TERMINALS,
  BUNDLE_VALID_TRANSITIONS, BUNDLE_STATE_TRANSITIONS,
  bundleCrossesIntoRegulator, bundleSlaBreachCrossesIntoRegulator,
} from '../utils/certificate-bundle-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'carbon_fund', 'offtaker', 'ipp_developer', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function certBundleSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_certificate_bundles
              WHERE sla_breached = 0 AND sla_deadline < ? AND bundle_status NOT IN
              ('retired','expired','cancelled')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_certificate_bundles SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (bundleSlaBreachCrossesIntoRegulator(row.bundle_tier as BundleTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'certificate_bundle', row.id,
          'cert_bundle_sla_breach',
          `Certificate bundle SLA breached — ${row.bundle_tier} — ${row.bundle_type ?? '?'}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'cert_bundle_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'certificate_bundle', entity_id: row.id as string,
      data: { bundle_tier: row.bundle_tier, bundle_type: row.bundle_type },
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
    .prepare(`SELECT * FROM oe_certificate_bundles WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    assembling: all.filter(r => r.bundle_status === 'assembling').length,
    issued: all.filter(r => r.bundle_status === 'issued').length,
    applied: all.filter(r => r.bundle_status === 'applied').length,
    retired: all.filter(r => r.bundle_status === 'retired').length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_certificate_bundles WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'certificate_bundle' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    bundle_tier: BundleTier;
    bundle_type: string;
    participant_id?: string;
    rec_holding_ids?: string;
    vcm_holding_ids?: string;
    carbon_budget_reg_id?: string;
    scope3_disclosure_id?: string;
    reporting_framework?: string;
    reason?: string;
  }>();

  if (!body.bundle_tier) return c.json({ success: false, error: 'bundle_tier is required' }, 400);
  if (!body.bundle_type) return c.json({ success: false, error: 'bundle_type is required' }, 400);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const tier = body.bundle_tier;

  const now = new Date().toISOString();
  const slaMs = deriveBundleSla(tier) * 3600000;
  const slaDeadline = new Date(Date.now() + slaMs).toISOString();
  const id = crypto.randomUUID();
  const certificateNumber = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_certificate_bundles
      (id, participant_id, bundle_tier, bundle_type, certificate_number,
       rec_holding_ids, vcm_holding_ids, carbon_budget_reg_id, scope3_disclosure_id,
       reporting_framework, bundle_status, sla_deadline, sla_breached,
       regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'assembling',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier, body.bundle_type, certificateNumber,
      body.rec_holding_ids ?? null, body.vcm_holding_ids ?? null,
      body.carbon_budget_reg_id ?? null, body.scope3_disclosure_id ?? null,
      body.reporting_framework ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'cert_bundle_created' as EventType,
    actor_id: user.id, entity_type: 'certificate_bundle', entity_id: id,
    data: { bundle_tier: tier, bundle_type: body.bundle_type, certificate_number: certificateNumber },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_certificate_bundles WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: BundleAction;
    reason?: string;
    validation_notes?: string;
    pdf_r2_key?: string;
    scope3_disclosure_id?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_certificate_bundles WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'carbon_fund', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.bundle_status as BundleStatus;
  if (BUNDLE_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Bundle in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = BUNDLE_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = BUNDLE_STATE_TRANSITIONS[action];
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_certificate_bundles SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.validation_notes) { extra.push('validation_notes = ?'); eb.push(body.validation_notes); }
  if (body.pdf_r2_key) { extra.push('pdf_r2_key = ?'); eb.push(body.pdf_r2_key); }
  if (body.scope3_disclosure_id) { extra.push('scope3_disclosure_id = ?'); eb.push(body.scope3_disclosure_id); }
  if (action === 'issue_certificate') { extra.push('issued_at = ?'); eb.push(now); }

  const setClause = ['bundle_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_certificate_bundles SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (bundleCrossesIntoRegulator(action, row.bundle_tier as BundleTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'certificate_bundle', id,
        `cert_bundle_${action}`,
        `Certificate bundle ${action.replace(/_/g, ' ')} — ${row.bundle_tier} — ${row.bundle_type ?? '?'}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_certificate_bundles SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `cert_bundle_${action}` as EventType,
    actor_id: user.id, entity_type: 'certificate_bundle', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, bundle_tier: row.bundle_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_certificate_bundles WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await certBundleSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
