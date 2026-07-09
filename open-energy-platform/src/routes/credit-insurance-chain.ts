// ═══════════════════════════════════════════════════════════════════════════════
// W218 — IPP Offtake Credit Insurance Lifecycle
// ECIC / ATIDI / Lloyd's / World Bank MIGA political risk + credit insurance
// Routes: GET /, GET /:id, POST /, POST /:id/action, POST /sla-sweep
// ═══════════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import type { EventType } from '../utils/cascade';
import {
  CiStatus, CiAction, CiTier,
  deriveCiSla, CI_HARD_TERMINALS,
  CI_VALID_TRANSITIONS, CI_STATE_TRANSITIONS,
  ciCrossesIntoRegulator, ciSlaBreachCrossesIntoRegulator,
} from '../utils/credit-insurance-spec';
import { resolveNextStatus } from '../utils/chain-sla';
import { badEnum } from '../utils/validation';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = ['admin', 'ipp_developer', 'lender', 'support'];

// ─── SLA sweep ────────────────────────────────────────────────────────────────
export async function ciSlaSweep(env: any) {
  const now = new Date().toISOString();
  const overdue = await (env.DB as D1Database)
    .prepare(`SELECT * FROM oe_credit_insurance
              WHERE sla_breached = 0 AND sla_deadline < ? AND chain_status NOT IN
              ('claim_paid','lapsed','cancelled','declined')`)
    .bind(now)
    .all<Record<string, unknown>>();

  for (const row of overdue.results ?? []) {
    await (env.DB as D1Database)
      .prepare(`UPDATE oe_credit_insurance SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, row.id).run();

    if (ciSlaBreachCrossesIntoRegulator(row.insurance_tier as CiTier)) {
      await (env.DB as D1Database)
        .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), 'credit_insurance', row.id,
          'ci_sla_breach',
          `Credit insurance SLA breached — ${row.insurance_tier} — ${row.insurer_name ?? row.policy_ref}`,
          row.participant_id, now,
        ).run().catch(() => {});
    }

    await fireCascade({
      event: 'ci_sla_breach' as EventType,
      actor_id: 'system', entity_type: 'credit_insurance', entity_id: row.id as string,
      data: { insurance_tier: row.insurance_tier, project_ref: row.project_ref },
      env: env as any,
    }).catch(() => {});
  }
  return { swept: overdue.results?.length ?? 0 };
}

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const isAdmin = ['admin', 'ipp_developer', 'lender', 'support'].includes(user.role);
  const participantId = c.req.query('participant_id');
  const resolved = isAdmin && participantId ? participantId : user.id;

  const rows = await c.env.DB
    .prepare(`SELECT * FROM oe_credit_insurance WHERE participant_id = ? ORDER BY created_at DESC`)
    .bind(resolved)
    .all<Record<string, unknown>>();

  const all = rows.results ?? [];
  const kpis = {
    total: all.length,
    active: all.filter(r => r.chain_status === 'active').length,
    claims_in_progress: all.filter(r => ['claim_lodged', 'claim_assessed'].includes(r.chain_status as string)).length,
    lapsed_or_cancelled: all.filter(r => ['lapsed', 'cancelled', 'declined'].includes(r.chain_status as string)).length,
    sla_breached: all.filter(r => r.sla_breached).length,
  };

  return c.json({ success: true, data: all, kpis });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_credit_insurance WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'ipp_developer', 'lender', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const timeline = await c.env.DB
    .prepare(`SELECT * FROM audit_events WHERE entity_type = 'credit_insurance' AND entity_id = ? ORDER BY created_at ASC`)
    .bind(id).all<Record<string, unknown>>();

  return c.json({ success: true, data: row, timeline: timeline.results ?? [] });
});

// ─── POST / ──────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id?: string;
    insurance_tier?: CiTier;
    insurance_type?: string;
    insurer_name?: string;
    project_ref?: string;
    ppa_ref?: string;
    facility_ref?: string;
    cover_amount_zar?: number;
    cover_period_years?: number;
    reason?: string;
  }>();

  const isAdmin = ['admin', 'support'].includes(user.role);
  const participantId = isAdmin && body.participant_id ? body.participant_id : user.id;
  const insuranceTierErr = badEnum('insurance_tier', body.insurance_tier, ['short_term', 'medium_term', 'long_term', 'project_finance']);
  if (insuranceTierErr) return c.json({ success: false, error: insuranceTierErr }, 422);
  const insuranceTypeErr = badEnum('insurance_type', body.insurance_type, ['political_risk', 'credit_risk', 'comprehensive', 'miga_guarantee', 'ecic_cover', 'atidi_cover', 'lloyds_syndicate']);
  if (insuranceTypeErr) return c.json({ success: false, error: insuranceTypeErr }, 422);
  const tier = body.insurance_tier ?? 'long_term';

  const now = new Date().toISOString();
  const slaDays = deriveCiSla(tier);
  const slaDeadline = new Date(Date.now() + slaDays * 86400000).toISOString();
  const id = crypto.randomUUID();

  await c.env.DB
    .prepare(`INSERT INTO oe_credit_insurance
      (id, participant_id, insurance_tier, insurance_type, insurer_name,
       project_ref, ppa_ref, facility_ref, cover_amount_zar, cover_period_years,
       chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'application',?,0,0,?,?,?,?)`)
    .bind(
      id, participantId, tier, body.insurance_type ?? null, body.insurer_name ?? null,
      body.project_ref ?? null, body.ppa_ref ?? null, body.facility_ref ?? null,
      body.cover_amount_zar ?? null, body.cover_period_years ?? null,
      slaDeadline, user.id, body.reason ?? null, now, now,
    ).run();

  await fireCascade({
    event: 'ci_created' as EventType,
    actor_id: user.id, entity_type: 'credit_insurance', entity_id: id,
    data: { insurance_tier: tier, project_ref: body.project_ref },
    env: c.env,
  }).catch(() => {});

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_credit_insurance WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: row }, 201);
});

// ─── POST /:id/action ─────────────────────────────────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.includes(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json<{
    action: CiAction;
    reason?: string;
    terms_ref?: string;
    policy_ref?: string;
    premium_rate_pct?: number;
    annual_premium_zar?: number;
    cover_amount_zar?: number;
    policy_inception?: string;
    policy_expiry?: string;
    renewal_due_date?: string;
    claim_event?: string;
    claim_amount_zar?: number;
    claim_paid_amount_zar?: number;
    claim_decline_reason?: string;
  }>();
  const { action, reason } = body;

  const row = await c.env.DB
    .prepare(`SELECT * FROM oe_credit_insurance WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const isAdmin = ['admin', 'support'].includes(user.role);
  if (!isAdmin && row.participant_id !== user.id) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const currentStatus = row.chain_status as CiStatus;
  if (CI_HARD_TERMINALS.has(currentStatus)) {
    return c.json({ success: false, error: `Policy in terminal state '${currentStatus}'` }, 422);
  }

  const allowed = CI_VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not valid from '${currentStatus}'` }, 422);
  }

  const nextStatus = resolveNextStatus(action, currentStatus, CI_STATE_TRANSITIONS);
  const now = new Date().toISOString();

  if (row.sla_deadline && (row.sla_deadline as string) < now && !row.sla_breached) {
    await c.env.DB.prepare(`UPDATE oe_credit_insurance SET sla_breached = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  const extra: string[] = [];
  const eb: (string | number | null)[] = [];

  if (action === 'commence_underwriting') { extra.push('underwriting_started_at = ?'); eb.push(now); }
  if (action === 'issue_terms') { extra.push('terms_issued_at = ?'); eb.push(now); }
  if (body.terms_ref) { extra.push('terms_ref = ?'); eb.push(body.terms_ref); }
  if (action === 'commence_negotiation') { extra.push('negotiation_started_at = ?'); eb.push(now); }
  if (action === 'bind_policy') { extra.push('bound_at = ?'); eb.push(now); }
  if (body.policy_ref) { extra.push('policy_ref = ?'); eb.push(body.policy_ref); }
  if (body.premium_rate_pct != null) { extra.push('premium_rate_pct = ?'); eb.push(body.premium_rate_pct); }
  if (body.annual_premium_zar != null) { extra.push('annual_premium_zar = ?'); eb.push(body.annual_premium_zar); }
  if (body.cover_amount_zar != null) { extra.push('cover_amount_zar = ?'); eb.push(body.cover_amount_zar); }
  if (body.policy_inception) { extra.push('policy_inception = ?'); eb.push(body.policy_inception); }
  if (body.policy_expiry) { extra.push('policy_expiry = ?'); eb.push(body.policy_expiry); }
  if (body.renewal_due_date) { extra.push('renewal_due_date = ?'); eb.push(body.renewal_due_date); }
  if (action === 'activate' && !row.renewed_at) { /* first activation */ }
  if (action === 'activate' && row.renewal_due_date) { extra.push('renewed_at = ?'); eb.push(now); }
  if (body.claim_event) { extra.push('claim_event = ?'); eb.push(body.claim_event); }
  if (body.claim_amount_zar != null) { extra.push('claim_amount_zar = ?'); eb.push(body.claim_amount_zar); }
  if (action === 'lodge_claim') { extra.push('claim_lodged_at = ?'); eb.push(now); }
  if (action === 'complete_assessment') { extra.push('claim_assessed_at = ?'); eb.push(now); }
  if (action === 'pay_claim') { extra.push('claim_paid_at = ?'); eb.push(now); }
  if (body.claim_paid_amount_zar != null) { extra.push('claim_paid_amount_zar = ?'); eb.push(body.claim_paid_amount_zar); }
  if (body.claim_decline_reason) { extra.push('claim_decline_reason = ?'); eb.push(body.claim_decline_reason); }

  const setClause = ['chain_status = ?', 'actor_id = ?', 'reason = ?', 'updated_at = ?', ...extra].join(', ');
  await c.env.DB
    .prepare(`UPDATE oe_credit_insurance SET ${setClause} WHERE id = ?`)
    .bind(nextStatus, user.id, reason ?? null, now, ...eb, id)
    .run();

  if (ciCrossesIntoRegulator(action, row.insurance_tier as CiTier)) {
    await c.env.DB
      .prepare(`INSERT INTO regulator_inbox (id,entity_type,entity_id,event_type,summary,participant_id,created_at)
                VALUES (?,?,?,?,?,?,?)`)
      .bind(
        crypto.randomUUID(), 'credit_insurance', id,
        `ci_${action}`,
        `Credit insurance ${action.replace(/_/g, ' ')} — ${row.insurance_tier} — ${row.insurer_name ?? row.policy_ref}`,
        row.participant_id, now,
      ).run().catch(() => {});
    await c.env.DB
      .prepare(`UPDATE oe_credit_insurance SET regulator_notified = 1, updated_at = ? WHERE id = ?`)
      .bind(now, id).run();
  }

  await fireCascade({
    event: `ci_${action}` as EventType,
    actor_id: user.id, entity_type: 'credit_insurance', entity_id: id,
    data: { action, from_status: currentStatus, to_status: nextStatus, insurance_tier: row.insurance_tier },
    env: c.env,
  }).catch(() => {});

  const updated = await c.env.DB
    .prepare(`SELECT * FROM oe_credit_insurance WHERE id = ?`)
    .bind(id).first<Record<string, unknown>>();
  return c.json({ success: true, data: updated });
});

// ─── POST /sla-sweep ──────────────────────────────────────────────────────────
app.post('/sla-sweep', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'ipp_developer', 'lender', 'support'].includes(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const result = await ciSlaSweep(c.env);
  return c.json({ success: true, data: result });
});

export default app;
