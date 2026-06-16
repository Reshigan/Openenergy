import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  IsdaStatus,
  IsdaAction,
  ISDA_VALID_TRANSITIONS,
  ISDA_STATE_TRANSITIONS,
  ISDA_HARD_TERMINALS,
  crossesIsdaIntoRegulator,
  deriveCounterpartyTier,
  deriveIsdaSlaWindowDays,
} from '../utils/isda-agreement-spec';
import { badEnum } from '../utils/validation';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = new Set(['admin', 'trader']);

function slaDeadline(tier: ReturnType<typeof deriveCounterpartyTier>): string {
  const d = new Date();
  d.setDate(d.getDate() + deriveIsdaSlaWindowDays(tier));
  return d.toISOString();
}

// GET / — list with stats
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM oe_isda_agreements WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 200`
  ).bind(user.tenant_id).all();

  const rows = results as Record<string, unknown>[];
  const stats = {
    total: rows.length,
    active: rows.filter(r => r.chain_status === 'active').length,
    negotiating: rows.filter(r => ['negotiation', 'counterparty_review', 'credit_terms_agreed', 'legal_review'].includes(r.chain_status as string)).length,
    terminated: rows.filter(r => r.chain_status === 'terminated').length,
    sla_breached: 0,
  };

  const now = new Date().toISOString();
  for (const r of rows) {
    if (r.sla_deadline && (r.sla_deadline as string) < now && !ISDA_HARD_TERMINALS.has(r.chain_status as IsdaStatus)) {
      stats.sla_breached++;
    }
  }

  return c.json({ data: { agreements: rows, stats } });
});

// GET /:id
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_isda_agreements WHERE id = ? AND tenant_id = ?`
  ).bind(c.req.param('id'), user.tenant_id).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: row });
});

// POST / — open new agreement
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json() as Record<string, unknown>;
  const {
    counterparty_id, counterparty_name, counterparty_type, agreement_type,
    base_currency = 'ZAR', vm_csa_included = 0, vm_threshold_zar, vm_mta_zar,
    eligible_collateral, umr_applicable = 0, average_notional_zar,
    netting_opinion_obtained = 0, netting_opinion_date, netting_opinion_counsel,
    fic_fica_confirmed = 0,
  } = body;

  if (!counterparty_id || !counterparty_name || !counterparty_type || !agreement_type) {
    return c.json({ error: 'counterparty_id, counterparty_name, counterparty_type, agreement_type required' }, 400);
  }

  const enumErr = badEnum('counterparty_type', counterparty_type, ['domestic_bank', 'foreign_bank', 'broker_dealer', 'ccpcentral', 'corporate', 'sfp']);
  if (enumErr) return c.json({ error: enumErr }, 400);

  const tier = deriveCounterpartyTier(Number(average_notional_zar ?? 0));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO oe_isda_agreements
      (id,tenant_id,initiator_id,counterparty_id,counterparty_name,counterparty_type,
       agreement_type,counterparty_tier,base_currency,vm_csa_included,vm_threshold_zar,
       vm_mta_zar,eligible_collateral,umr_applicable,average_notional_zar,
       netting_opinion_obtained,netting_opinion_date,netting_opinion_counsel,
       fic_fica_confirmed,chain_status,sla_deadline,actor_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)
  `).bind(
    id, user.tenant_id, user.id,
    counterparty_id, counterparty_name, counterparty_type, agreement_type,
    tier, base_currency,
    vm_csa_included ? 1 : 0,
    vm_threshold_zar ?? null, vm_mta_zar ?? null,
    eligible_collateral ? JSON.stringify(eligible_collateral) : null,
    umr_applicable ? 1 : 0,
    average_notional_zar ?? null,
    netting_opinion_obtained ? 1 : 0,
    netting_opinion_date ?? null,
    netting_opinion_counsel ?? null,
    fic_fica_confirmed ? 1 : 0,
    slaDeadline(tier),
    user.id, now, now,
  ).run();

  await fireCascade({
    event: 'isda_evt_opened',
    actor_id: user.id,
    entity_type: 'isda_agreement',
    entity_id: id,
    data: { counterparty_name, tier, agreement_type },
    env: c.env,
  });

  return c.json({ data: { id } }, 201);
});

// POST /:id/action
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_isda_agreements WHERE id = ? AND tenant_id = ?`
  ).bind(c.req.param('id'), user.tenant_id).first() as Record<string, unknown> | null;
  if (!row) return c.json({ error: 'Not found' }, 404);

  const { action, reason_code, reason_detail } = await c.req.json() as {
    action: IsdaAction;
    reason_code?: string;
    reason_detail?: string;
  };

  const currentStatus = row.chain_status as IsdaStatus;
  const allowed = ISDA_VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(action)) {
    return c.json({ error: `Action ${action} not allowed from ${currentStatus}` }, 400);
  }

  const newStatus = ISDA_STATE_TRANSITIONS[action];
  const tier = row.counterparty_tier as ReturnType<typeof deriveCounterpartyTier>;
  const now = new Date().toISOString();

  let amendmentNumber = Number(row.amendment_number ?? 0);
  if (action === 'request_amendment') amendmentNumber++;

  await c.env.DB.prepare(`
    UPDATE oe_isda_agreements
    SET chain_status=?, reason_code=?, reason_detail=?, actor_id=?,
        amendment_number=?, updated_at=?
    WHERE id=?
  `).bind(newStatus, reason_code ?? null, reason_detail ?? null, user.id, amendmentNumber, now, row.id).run();

  const eventKey = {
    issue_term_sheet: 'isda_evt_term_sheet_issued',
    submit_for_counterparty_review: 'isda_evt_counterparty_review',
    open_negotiation: 'isda_evt_negotiation_opened',
    agree_credit_terms: 'isda_evt_credit_terms_agreed',
    submit_for_legal_review: 'isda_evt_legal_review',
    notify_regulators: 'isda_evt_regulatory_notification',
    execute_agreement: 'isda_evt_executed',
    activate: 'isda_evt_activated',
    request_amendment: 'isda_evt_amendment_requested',
    approve_amendment: 'isda_evt_amendment_approved',
    terminate: 'isda_evt_terminated',
    suspend: 'isda_evt_suspended',
  } as const;

  await fireCascade({
    event: eventKey[action],
    actor_id: user.id,
    entity_type: 'isda_agreement',
    entity_id: row.id as string,
    data: {
      counterparty_name: row.counterparty_name,
      tier,
      prev_status: currentStatus,
      new_status: newStatus,
      crosses_regulator: crossesIsdaIntoRegulator(action, tier),
    },
    env: c.env,
  });

  return c.json({ data: { id: row.id, status: newStatus } });
});

// SLA sweep — called by cron */15
export async function isdaAgreementSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(`
    SELECT id, tenant_id, counterparty_tier, chain_status, sla_deadline
    FROM oe_isda_agreements
    WHERE chain_status NOT IN ('executed','active','terminated','suspended')
      AND sla_deadline IS NOT NULL AND sla_deadline < ?
  `).bind(now).all();

  for (const row of results as Record<string, unknown>[]) {
    await env.DB.prepare(`
      UPDATE oe_isda_agreements SET chain_status='terminated', reason_code='sla_breach',
      updated_at=? WHERE id=?
    `).bind(now, row.id).run();
    await fireCascade({
      event: 'isda_evt_sla_breach',
      actor_id: 'system',
      entity_type: 'isda_agreement',
      entity_id: row.id as string,
      data: { tier: row.counterparty_tier, status_at_breach: row.chain_status },
      env,
    });
  }
}

export default app;
