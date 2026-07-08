// ═══════════════════════════════════════════════════════════════════════════════
// W210 — Offtaker Green Tariff / PPA Labelling & Disclosure
// GHG Protocol Scope 2 + I-REC Standard + CDP/SBTi + NERSA Green Energy Tariff
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  GtStatus, GtAction, GreenTariffClass,
  deriveGtSla, GT_HARD_TERMINALS,
  GT_VALID_TRANSITIONS, GT_STATE_TRANSITIONS,
  gtCrossesIntoRegulator, gtSlaBreachCrossesIntoRegulator,
  GT_CLASSES,
} from '../utils/green-tariff-spec';
import { resolveNextStatus } from '../utils/chain-sla';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'offtaker', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function gtSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_green_tariff_disclosures
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN ('disclosed','rejected','withdrawn')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_green_tariff_disclosures SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();

    if (gtSlaBreachCrossesIntoRegulator(row.green_tariff_class as GreenTariffClass)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'green_tariff_disclosure', row.id,
          'gt_sla_breach',
          `Green tariff disclosure SLA breached — ${row.green_tariff_class} — ${row.disclosure_period}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'gt_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'green_tariff_disclosure', entity_id: row.id as string,
      data: { green_tariff_class: row.green_tariff_class, disclosure_period: row.disclosure_period },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'offtaker', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_green_tariff_disclosures WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    disclosed: all.filter(r => r.chain_status === 'disclosed').length,
    in_progress: all.filter(r => !['disclosed', 'rejected', 'withdrawn'].includes(r.chain_status as string)).length,
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
    .prepare(`SELECT * FROM oe_green_tariff_disclosures WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'offtaker', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'green_tariff_disclosure' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    ppa_ref?: string;
    tariff_contract_number?: string;
    green_tariff_class?: GreenTariffClass;
    disclosure_period: string;
    consumption_mwh?: number;
    contracted_green_mwh?: number;
    generation_technology?: string;
    additionality_claim?: boolean;
    reason?: string;
  }>();

  if (!body.disclosure_period) return c.json({ success: false, error: 'disclosure_period required' }, 422);

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const cls = body.green_tariff_class ?? 'voluntary';
  if (!GT_CLASSES.includes(cls)) {
    return c.json({ success: false, error: `green_tariff_class must be one of: ${GT_CLASSES.join(', ')}` }, 422);
  }

  const now = new Date().toISOString();
  const slaDays = deriveGtSla(cls);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_green_tariff_disclosures
      (id, participant_id, ppa_ref, tariff_contract_number, green_tariff_class,
       disclosure_period, consumption_mwh, contracted_green_mwh, generation_technology, additionality_claim,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'application_received',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, body.ppa_ref ?? null, body.tariff_contract_number ?? null, cls,
      body.disclosure_period,
      body.consumption_mwh ?? null, body.contracted_green_mwh ?? null,
      body.generation_technology ?? null,
      body.additionality_claim ? 1 : 0,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'gt_created' as EventType,
    actor_id: user.id, entity_type: 'green_tariff_disclosure', entity_id: id,
    data: { green_tariff_class: cls, disclosure_period: body.disclosure_period },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_green_tariff_disclosures WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: GtAction;
    reason?: string;
    matched_rec_mwh?: number;
    match_percentage?: number;
    rec_serial_from?: string;
    rec_serial_to?: string;
    irec_registry?: string;
    reviewer_name?: string;
    reviewer_ref?: string;
    label_certificate_number?: string;
    label_valid_until?: string;
    cdp_submission_ref?: string;
    sbti_target_ref?: string;
    disclosure_date?: string;
    rejection_reason?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_green_tariff_disclosures WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as GtStatus;
  if (GT_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Disclosure in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = GT_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, GT_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && row.sla_deadline < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_green_tariff_disclosures SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (body.matched_rec_mwh != null) { extra.push('matched_rec_mwh = ?'); eb.push(body.matched_rec_mwh); }
  if (body.match_percentage != null) { extra.push('match_percentage = ?'); eb.push(body.match_percentage); }
  if (body.rec_serial_from) { extra.push('rec_serial_from = ?'); eb.push(body.rec_serial_from); }
  if (body.rec_serial_to) { extra.push('rec_serial_to = ?'); eb.push(body.rec_serial_to); }
  if (body.irec_registry) { extra.push('irec_registry = ?'); eb.push(body.irec_registry); }
  if (body.reviewer_name) { extra.push('reviewer_name = ?'); eb.push(body.reviewer_name); }
  if (body.reviewer_ref) { extra.push('reviewer_ref = ?'); eb.push(body.reviewer_ref); }
  if (action === 'approve_review') { extra.push('review_approved_at = ?'); eb.push(now); }
  if (action === 'issue_label') { extra.push('label_issued_at = ?'); eb.push(now); }
  if (body.label_certificate_number) { extra.push('label_certificate_number = ?'); eb.push(body.label_certificate_number); }
  if (body.label_valid_until) { extra.push('label_valid_until = ?'); eb.push(body.label_valid_until); }
  if (body.cdp_submission_ref) { extra.push('cdp_submission_ref = ?'); eb.push(body.cdp_submission_ref); }
  if (body.sbti_target_ref) { extra.push('sbti_target_ref = ?'); eb.push(body.sbti_target_ref); }
  if (action === 'submit_to_cdp') { extra.push('cdp_submitted_at = ?'); eb.push(now); }
  if (action === 'complete_disclosure') { extra.push('disclosure_date = ?'); eb.push(body.disclosure_date ?? now); }
  if (body.rejection_reason) { extra.push('rejection_reason = ?'); eb.push(body.rejection_reason); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_green_tariff_disclosures SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (gtCrossesIntoRegulator(action, row.green_tariff_class as GreenTariffClass)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'green_tariff_disclosure', id,
        `gt_${action}`,
        `Green tariff ${action.replace(/_/g, ' ')} — ${row.green_tariff_class} — ${row.disclosure_period}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_green_tariff_disclosures SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `gt_${action}` as EventType,
    actor_id: user.id, entity_type: 'green_tariff_disclosure', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, green_tariff_class: row.green_tariff_class },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_green_tariff_disclosures WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'support'].includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const result = await gtSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
