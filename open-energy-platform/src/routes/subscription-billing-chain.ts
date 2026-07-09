// ═══════════════════════════════════════════════════════════════════════════
// Wave 228 — Platform Subscription Billing & Invoice Lifecycle
//
// Mounted at /api/subscription/billing
//
// Formalises the monthly SaaS billing cycle into a P6 chain with proper
// state machine, dunning automation, and admin oversight.
//
// Forward path:
//   draft → issued → payment_pending → paid
//
// Dunning path (cron-driven):
//   payment_pending → overdue → dunning_1 → dunning_2 → suspended
//
// Admin exits:
//   waive (any open state) / write_off (suspended) / cancel (pre-payment)
//   reactivate (suspended → issued)
//
// Tiers (INVERTED SLA — enterprise gets longest window):
//   starter R12,500/mo excl VAT — 7-day payment window
//   professional R45,000/mo excl VAT — 14-day window
//   enterprise R150,000/mo excl VAT — 21-day window (largest = most scrutiny)
//
// Legal: CPA §16-17, ECT Act §46-50, IFRS 15, POPIA §19
//
// Regulator/admin inbox:
//   suspend_account / write_off — ALL tiers (revenue impact, admin oversight)
//   reactivate — enterprise only
//   mark_overdue — enterprise only (early flag for large ARR at risk)
//   sla_breached — ALL tiers
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import { resolveNextStatus } from '../utils/chain-sla';
import { badEnum } from '../utils/validation';
import {
  computeInvoiceAmounts,
  slaDeadlineFor,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  INVOICE_VALID_TRANSITIONS,
  INVOICE_STATE_TRANSITIONS,
  INVOICE_HARD_TERMINALS,
  ADMIN_ONLY_ACTIONS,
  SUBSCRIPTION_AMOUNTS_ZAR,
  type InvoiceStatus,
  type InvoiceAction,
  type SubscriptionTier,
} from '../utils/subscription-billing-spec';

const ADMIN_ROLES = new Set(['admin', 'support']);
const READ_ROLES  = new Set(['admin', 'support']);
// Participants can acknowledge and record payment on their own invoices;
// admin/support handle all other transitions
const WRITE_ROLES = new Set(['admin', 'support']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface InvoiceRow {
  id: string;
  participant_id: string;
  billing_period: string;
  subscription_tier: SubscriptionTier;
  amount_zar: number;
  vat_zar: number;
  total_zar: number;
  discount_zar: number;
  net_payable_zar: number;
  line_items: string;
  payment_method: string | null;
  payment_ref: string | null;
  payment_date: string | null;
  payment_amount_zar: number | null;
  bank_reference: string | null;
  dunning_notices_sent: number;
  suspension_reason: string | null;
  waiver_reason: string | null;
  write_off_reason: string | null;
  chain_status: InvoiceStatus;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

function decorate(row: InvoiceRow, now: Date) {
  const hoursUntilSla = row.sla_deadline
    ? (new Date(row.sla_deadline).getTime() - now.getTime()) / 3_600_000
    : null;
  return {
    ...row,
    is_terminal: INVOICE_HARD_TERMINALS.has(row.chain_status),
    sla_breached: row.sla_breached === 1 || (hoursUntilSla != null && hoursUntilSla < 0),
    hours_until_sla: hoursUntilSla != null ? Math.round(hoursUntilSla) : null,
    line_items: (() => { try { return JSON.parse(row.line_items); } catch { return []; } })(),
  };
}

// ── GET /api/subscription/billing ───────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const { status, tier, period, breached, page = '1', per_page = '50' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(per_page);
  const now = new Date();

  let whereClause = 'WHERE 1=1';
  const whereParams: (string | number)[] = [];

  if (status)  { whereClause += ' AND chain_status = ?';      whereParams.push(status); }
  if (tier)    { whereClause += ' AND subscription_tier = ?'; whereParams.push(tier); }
  if (period)  { whereClause += ' AND billing_period = ?';    whereParams.push(period); }
  if (breached === 'true') { whereClause += ' AND sla_breached = 1'; }

  const rs = await c.env.DB
    .prepare(`SELECT * FROM oe_subscription_invoices ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...whereParams, parseInt(per_page), offset)
    .all<InvoiceRow>();
  const items = (rs.results || []).map(r => decorate(r, now));

  // Stats span the full filtered set (every page), not just this page's rows,
  // so an admin reading page 1 of a large tenant sees true totals.
  const aggRow = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN chain_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
       COALESCE(SUM(CASE WHEN chain_status IN ('overdue','dunning_1','dunning_2') THEN 1 ELSE 0 END), 0) AS overdue,
       COALESCE(SUM(CASE WHEN chain_status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspended,
       COALESCE(SUM(CASE WHEN chain_status IN ('overdue','dunning_1','dunning_2') THEN net_payable_zar * 12 ELSE 0 END), 0) AS arr_at_risk
     FROM oe_subscription_invoices ${whereClause}`,
  ).bind(...whereParams).first<{ total: number; paid: number; overdue: number; suspended: number; arr_at_risk: number }>();
  const stats = {
    total:       aggRow?.total ?? 0,
    paid:        aggRow?.paid ?? 0,
    overdue:     aggRow?.overdue ?? 0,
    suspended:   aggRow?.suspended ?? 0,
    arr_at_risk: aggRow?.arr_at_risk ?? 0,
  };

  return c.json({ success: true, data: { invoices: items, stats } });
});

// ── GET /api/subscription/billing/:id ───────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare('SELECT * FROM oe_subscription_invoices WHERE id = ?')
    .bind(c.req.param('id')).first<InvoiceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  return c.json({ success: true, data: { invoice: decorate(row, new Date()) } });
});

// ── POST /api/subscription/billing/generate ─────────────────────────────────
// Admin generates a new monthly invoice for a participant
app.post('/generate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !ADMIN_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    participant_id: string;
    billing_period: string;
    subscription_tier: SubscriptionTier;
    discount_zar?: number;
    line_items?: { description: string; qty: number; unit_price_zar: number }[];
  }>();

  if (!body.participant_id || !body.billing_period || !body.subscription_tier) {
    return c.json({ success: false, error: 'participant_id, billing_period, subscription_tier required' }, 400);
  }
  const tierErr = badEnum('subscription_tier', body.subscription_tier, ['starter','professional','enterprise']);
  if (tierErr) return c.json({ success: false, error: tierErr }, 400);

  // Prevent duplicate invoice for same participant + period
  const existing = await c.env.DB.prepare(
    `SELECT id FROM oe_subscription_invoices WHERE participant_id = ? AND billing_period = ? AND chain_status NOT IN ('cancelled')`,
  ).bind(body.participant_id, body.billing_period).first<{ id: string }>();
  if (existing) return c.json({ success: false, error: `Invoice already exists for ${body.billing_period}`, existing_id: existing.id }, 409);

  const discount = body.discount_zar ?? 0;
  const amounts = computeInvoiceAmounts(body.subscription_tier, discount);
  const nowIso = new Date().toISOString();
  const id = `sinv_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

  const defaultLineItems = [{
    description: `${body.subscription_tier.charAt(0).toUpperCase() + body.subscription_tier.slice(1)} plan — ${body.billing_period}`,
    qty: 1,
    unit_price_zar: SUBSCRIPTION_AMOUNTS_ZAR[body.subscription_tier],
  }];
  const lineItems = body.line_items && body.line_items.length > 0 ? body.line_items : defaultLineItems;

  await c.env.DB.prepare(
    `INSERT INTO oe_subscription_invoices
     (id, participant_id, billing_period, subscription_tier,
      amount_zar, vat_zar, total_zar, discount_zar, net_payable_zar,
      line_items, dunning_notices_sent, chain_status, actor_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'draft', ?, ?, ?)`,
  ).bind(
    id, body.participant_id, body.billing_period, body.subscription_tier,
    amounts.amount_zar, amounts.vat_zar, amounts.total_zar, discount, amounts.net_payable_zar,
    JSON.stringify(lineItems), user.id, nowIso, nowIso,
  ).run();

  await fireCascade({
    event: 'billing_evt_generated',
    actor_id: user.id,
    entity_type: 'subscription_invoice',
    entity_id: id,
    data: { participant_id: body.participant_id, billing_period: body.billing_period, tier: body.subscription_tier, ...amounts },
    env: c.env,
  });

  const row = await c.env.DB.prepare('SELECT * FROM oe_subscription_invoices WHERE id = ?').bind(id).first<InvoiceRow>();
  return c.json({ success: true, data: { invoice: row ? decorate(row, new Date()) : null } }, 201);
});

// ── POST /api/subscription/billing/:id/action ───────────────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const { action, ...body } = await c.req.json<{
    action: InvoiceAction;
    reason?: string;
    payment_method?: string;
    payment_ref?: string;
    payment_date?: string;
    payment_amount_zar?: number;
    bank_reference?: string;
    suspension_reason?: string;
    waiver_reason?: string;
    write_off_reason?: string;
  }>();

  const row = await c.env.DB.prepare('SELECT * FROM oe_subscription_invoices WHERE id = ?')
    .bind(c.req.param('id')).first<InvoiceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  if (INVOICE_HARD_TERMINALS.has(row.chain_status)) {
    return c.json({ success: false, error: `Invoice is terminal (${row.chain_status})` }, 409);
  }

  const allowed = INVOICE_VALID_TRANSITIONS[row.chain_status] ?? [];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not allowed from '${row.chain_status}'` }, 409);
  }

  // Admin-only gate
  if (ADMIN_ONLY_ACTIONS.has(action) && !ADMIN_ROLES.has(user.role)) {
    return c.json({ success: false, error: `Action '${action}' requires admin or support` }, 403);
  }

  // sla_breach is an escalation marker — it holds position and raises the flag,
  // never rewinds (real dunning runs through send_dunning_1/2 in the cron sweep).
  const to = resolveNextStatus(action, row.chain_status, INVOICE_STATE_TRANSITIONS);
  const nowIso = new Date().toISOString();

  const overrides: Partial<InvoiceRow> = {};
  if (body.payment_method)      overrides.payment_method = body.payment_method;
  if (body.payment_ref)         overrides.payment_ref = body.payment_ref;
  if (body.payment_date)        overrides.payment_date = body.payment_date;
  if (body.payment_amount_zar)  overrides.payment_amount_zar = body.payment_amount_zar;
  if (body.bank_reference)      overrides.bank_reference = body.bank_reference;
  if (body.suspension_reason)   overrides.suspension_reason = body.suspension_reason;
  if (body.waiver_reason)       overrides.waiver_reason = body.waiver_reason;
  if (body.write_off_reason)    overrides.write_off_reason = body.write_off_reason;

  // Set SLA deadline when transitioning to payment_pending
  let newSla = row.sla_deadline;
  if (action === 'acknowledge' || action === 'reactivate') {
    newSla = slaDeadlineFor(row.subscription_tier, nowIso);
  }

  // Track dunning notices
  let dunning = row.dunning_notices_sent;
  if (action === 'send_dunning_1') dunning = 1;
  if (action === 'send_dunning_2') dunning = 2;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'actor_id = ?'];
  const setParams: (string | number | null)[] = [to, nowIso, user.id];

  if (action === 'sla_breach' && !row.sla_breached) { setClauses.push('sla_breached = ?'); setParams.push(1); }
  if (newSla !== row.sla_deadline) { setClauses.push('sla_deadline = ?'); setParams.push(newSla); }
  if (dunning !== row.dunning_notices_sent) { setClauses.push('dunning_notices_sent = ?'); setParams.push(dunning); }
  if (body.reason) { setClauses.push('reason = ?'); setParams.push(body.reason); }

  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setParams.push(v as string | number | null);
  }

  if (crossesIntoRegulator(action, row.subscription_tier)) {
    setClauses.push('regulator_notified = 1');
  }

  await c.env.DB.prepare(
    `UPDATE oe_subscription_invoices SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setParams, row.id).run();

  const eventName = `billing_evt_${action}` as const;
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'subscription_invoice',
    entity_id: row.id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.subscription_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_subscription_invoices WHERE id = ?')
    .bind(row.id).first<InvoiceRow>();
  return c.json({ success: true, data: { invoice: refreshed ? decorate(refreshed, new Date()) : null } });
});

// ── Monthly sweep (exported for cron wiring) ─────────────────────────────────
// Enumerates active, billable participants and inserts a draft subscription
// invoice per (participant_id, billing_period). Idempotent on the existing
// (participant_id, billing_period) uniqueness — a second call for the same
// period skips every participant and generates nothing. Free-tier, suspended
// and rejected participants are excluded. Defaults periodYyyyMm to the current
// month (YYYY-MM) when omitted.
export async function runMonthlySubscriptionBilling(
  env: HonoEnv['Bindings'],
  periodYyyyMm?: string,
): Promise<{ generated: number; skipped: number }> {
  const period = periodYyyyMm ?? new Date().toISOString().slice(0, 7);
  const nowIso = new Date().toISOString();

  // Active participants on a billable tier (free is excluded — no charge).
  const rs = await env.DB.prepare(
    `SELECT id, subscription_tier FROM participants
     WHERE status = 'active'
       AND subscription_tier IN ('starter','professional','enterprise')`,
  ).all<{ id: string; subscription_tier: SubscriptionTier }>();

  let generated = 0;
  let skipped = 0;

  for (const p of rs.results || []) {
    // Idempotent: skip if a non-cancelled invoice already exists for this
    // participant + period. A cancelled invoice does not block regeneration
    // (matches the admin POST /generate semantics).
    const existing = await env.DB.prepare(
      `SELECT id FROM oe_subscription_invoices
       WHERE participant_id = ? AND billing_period = ? AND chain_status != 'cancelled'`,
    ).bind(p.id, period).first<{ id: string }>();
    if (existing) { skipped++; continue; }

    const amounts = computeInvoiceAmounts(p.subscription_tier, 0);
    const id = `sinv_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    const lineItems = [{
      description: `${p.subscription_tier.charAt(0).toUpperCase() + p.subscription_tier.slice(1)} plan — ${period}`,
      qty: 1,
      unit_price_zar: SUBSCRIPTION_AMOUNTS_ZAR[p.subscription_tier],
    }];

    await env.DB.prepare(
      `INSERT INTO oe_subscription_invoices
       (id, participant_id, billing_period, subscription_tier,
        amount_zar, vat_zar, total_zar, discount_zar, net_payable_zar,
        line_items, dunning_notices_sent, chain_status, actor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 'draft', 'system', ?, ?)`,
    ).bind(
      id, p.id, period, p.subscription_tier,
      amounts.amount_zar, amounts.vat_zar, amounts.total_zar, amounts.net_payable_zar,
      JSON.stringify(lineItems), nowIso, nowIso,
    ).run();

    await fireCascade({
      event: 'billing_evt_generated',
      actor_id: 'system',
      entity_type: 'subscription_invoice',
      entity_id: id,
      data: { participant_id: p.id, billing_period: period, tier: p.subscription_tier, ...amounts },
      env,
    });
    generated++;
  }

  return { generated, skipped };
}

// ── SLA sweep (exported for cron wiring) ────────────────────────────────────
export async function subscriptionBillingSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const nowIso = new Date().toISOString();

  // 1. Mark overdue: payment_pending past sla_deadline
  const overdueRs = await env.DB.prepare(
    `SELECT * FROM oe_subscription_invoices
     WHERE chain_status = 'payment_pending'
       AND sla_deadline IS NOT NULL
       AND datetime(sla_deadline) < datetime(?)
       AND sla_breached = 0`,
  ).bind(nowIso).all<InvoiceRow>();

  for (const row of overdueRs.results || []) {
    await env.DB.prepare(
      `UPDATE oe_subscription_invoices SET chain_status = 'overdue', sla_breached = 1, updated_at = ? WHERE id = ?`,
    ).bind(nowIso, row.id).run();

    if (slaBreachCrossesIntoRegulator(row.subscription_tier)) {
      await fireCascade({
        event: 'billing_evt_sla_breach',
        actor_id: 'system',
        entity_type: 'subscription_invoice',
        entity_id: row.id,
        data: { ...row, chain_status: 'overdue', crosses_into_regulator: true },
        env,
      });
    }
  }

  // 2. Auto-dunning progression (cron escalation every 3 days past overdue)
  const threeDaysAgo = new Date(nowIso);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysIso = threeDaysAgo.toISOString();

  const dunningRs = await env.DB.prepare(
    `SELECT * FROM oe_subscription_invoices
     WHERE chain_status IN ('overdue', 'dunning_1')
       AND datetime(updated_at) < datetime(?)`,
  ).bind(threeDaysIso).all<InvoiceRow>();

  let breached = (overdueRs.results || []).length;

  for (const row of dunningRs.results || []) {
    const nextAction: InvoiceAction = row.chain_status === 'overdue' ? 'send_dunning_1' : 'send_dunning_2';
    const nextState = INVOICE_STATE_TRANSITIONS[nextAction];
    const newDunning = row.dunning_notices_sent + 1;

    await env.DB.prepare(
      `UPDATE oe_subscription_invoices
       SET chain_status = ?, dunning_notices_sent = ?, sla_breached = 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nextState, newDunning, nowIso, row.id).run();

    await fireCascade({
      event: `billing_evt_${nextAction}` as const,
      actor_id: 'system',
      entity_type: 'subscription_invoice',
      entity_id: row.id,
      data: {
        ...row,
        chain_status: nextState,
        from_status: row.chain_status,
        crosses_into_regulator: crossesIntoRegulator(nextAction, row.subscription_tier),
      },
      env,
    });

    breached++;
  }

  return { scanned: (overdueRs.results?.length ?? 0) + (dunningRs.results?.length ?? 0), breached };
}

export default app;
