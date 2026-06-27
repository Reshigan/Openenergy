// ═══════════════════════════════════════════════════════════════════════════
// Wave 229 — Virtual/Financial PPA Contract-for-Differences (CfD) Settlement
// Reconciliation
//
// Mounted at /api/offtaker/virtual-ppa-settlement
//
// Corporate offtakers increasingly buy renewable energy through synthetic
// ("virtual"/"sleeved") PPAs structured as financial Contracts-for-Differences:
// the generator sells its output into the wholesale pool at the floating
// reference price, and the two counterparties true up the gap against an
// agreed strike price every settlement period. This chain formalises that
// periodic financial reconciliation — the missing "money" layer underneath
// every physical-delivery PPA chain already on the platform (W22/W32/W39/
// W46/W54/W62).
//
// Forward path:
//   reference_price_pending → calculated → statement_issued → payment_pending
//     → settled
//
// Dispute path:
//   statement_issued|payment_pending → disputed → recalculating
//     → (escalate) isda_determination → confirm_recalculation → statement_issued (loop)
//
// Collection path (cron-driven):
//   payment_pending → overdue → partially_settled / write_off
//
// Admin exits: cancel (pre-settlement) / write_off (uncollectible)
//
// Tiers (INVERTED SLA — bigger differential = longest verification window):
//   minor (<R1m) — 5d · material (R1m-10m) — 10d
//   large (R10m-50m) — 15d · systemic (R50m+) — 21d
//
// Legal: FMA 19/2012 Ch.IV, FSCA Conduct Standard 1/2020, IFRS 9, ISDA MA
//
// Regulator/admin inbox:
//   escalate_to_isda / write_off — ALWAYS (binding determination, impairment)
//   dispute — large + systemic · cancel / record_payment — systemic only
//   sla_breached — large + systemic
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import { resolveNextStatus } from '../utils/chain-sla';
import {
  computeDifferential,
  deriveSettlementTier,
  slaDeadlineFor,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  SETTLEMENT_VALID_TRANSITIONS,
  SETTLEMENT_STATE_TRANSITIONS,
  SETTLEMENT_HARD_TERMINALS,
  ADMIN_ONLY_ACTIONS,
  type SettlementStatus,
  type SettlementAction,
  type SettlementTier,
  type ReferenceIndex,
  type PayingParty,
} from '../utils/virtual-ppa-settlement-spec';

const ADMIN_ROLES = new Set(['admin', 'support']);
const READ_ROLES  = new Set(['admin', 'support', 'offtaker', 'ipp_developer', 'regulator']);
// Counterparties can acknowledge, dispute and confirm payment on their own
// settlements; admin/support own the calculation, statement and dispute
// machinery (gated further per-action via ADMIN_ONLY_ACTIONS).
const WRITE_ROLES = new Set(['admin', 'support', 'offtaker', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface SettlementRow {
  id: string;
  contract_ref: string;
  generator_id: string;
  offtaker_id: string;
  settlement_period: string;
  reference_index: ReferenceIndex;
  notional_mwh: number;
  strike_price_zar_per_mwh: number;
  reference_price_zar_per_mwh: number | null;
  differential_zar_per_mwh: number | null;
  settlement_amount_zar: number | null;
  paying_party: PayingParty | null;
  settlement_tier: SettlementTier | null;
  payment_method: string | null;
  payment_ref: string | null;
  payment_date: string | null;
  payment_amount_zar: number | null;
  dispute_reason: string | null;
  recalculated_amount_zar: number | null;
  isda_determination_ref: string | null;
  write_off_reason: string | null;
  cancellation_reason: string | null;
  chain_status: SettlementStatus;
  sla_deadline: string | null;
  sla_breached: number;
  regulator_notified: number;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

function decorate(row: SettlementRow, now: Date) {
  const hoursUntilSla = row.sla_deadline
    ? (new Date(row.sla_deadline).getTime() - now.getTime()) / 3_600_000
    : null;
  return {
    ...row,
    is_terminal: SETTLEMENT_HARD_TERMINALS.has(row.chain_status),
    sla_breached: row.sla_breached === 1 || (hoursUntilSla != null && hoursUntilSla < 0),
    hours_until_sla: hoursUntilSla != null ? Math.round(hoursUntilSla) : null,
  };
}

// ── GET /api/offtaker/virtual-ppa-settlement ─────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const { status, tier, period, contract_ref, breached, page = '1', per_page = '50' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(per_page);
  const now = new Date();

  let whereClause = 'WHERE 1=1';
  const whereParams: (string | number)[] = [];

  if (status)       { whereClause += ' AND chain_status = ?';      whereParams.push(status); }
  if (tier)         { whereClause += ' AND settlement_tier = ?';   whereParams.push(tier); }
  if (period)       { whereClause += ' AND settlement_period = ?'; whereParams.push(period); }
  if (contract_ref) { whereClause += ' AND contract_ref = ?';      whereParams.push(contract_ref); }
  if (breached === 'true') { whereClause += ' AND sla_breached = 1'; }

  // Counterparties only ever see their own side of the book
  if (user.role === 'offtaker')      { whereClause += ' AND offtaker_id = ?';  whereParams.push(user.id); }
  if (user.role === 'ipp_developer') { whereClause += ' AND generator_id = ?'; whereParams.push(user.id); }

  const rs = await c.env.DB
    .prepare(`SELECT * FROM oe_virtual_ppa_settlements ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...whereParams, parseInt(per_page), offset)
    .all<SettlementRow>();
  const items = (rs.results || []).map(r => decorate(r, now));

  const aggRow = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN chain_status = 'settled' THEN 1 ELSE 0 END), 0) AS settled,
       COALESCE(SUM(CASE WHEN chain_status IN ('disputed','recalculating','isda_determination') THEN 1 ELSE 0 END), 0) AS in_dispute,
       COALESCE(SUM(CASE WHEN chain_status = 'overdue' THEN 1 ELSE 0 END), 0) AS overdue,
       COALESCE(SUM(CASE WHEN chain_status NOT IN ('settled','written_off','cancelled') THEN settlement_amount_zar ELSE 0 END), 0) AS outstanding_zar
     FROM oe_virtual_ppa_settlements ${whereClause}`,
  ).bind(...whereParams).first<{ total: number; settled: number; in_dispute: number; overdue: number; outstanding_zar: number }>();
  const stats = {
    total:           aggRow?.total ?? 0,
    settled:         aggRow?.settled ?? 0,
    in_dispute:      aggRow?.in_dispute ?? 0,
    overdue:         aggRow?.overdue ?? 0,
    outstanding_zar: aggRow?.outstanding_zar ?? 0,
  };

  return c.json({ success: true, data: { settlements: items, stats } });
});

// ── GET /api/offtaker/virtual-ppa-settlement/:id ─────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare('SELECT * FROM oe_virtual_ppa_settlements WHERE id = ?')
    .bind(c.req.param('id')).first<SettlementRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (user.role === 'offtaker' && row.offtaker_id !== user.id) return c.json({ success: false, error: 'Forbidden' }, 403);
  if (user.role === 'ipp_developer' && row.generator_id !== user.id) return c.json({ success: false, error: 'Forbidden' }, 403);

  return c.json({ success: true, data: { settlement: decorate(row, new Date()) } });
});

// ── POST /api/offtaker/virtual-ppa-settlement/open ───────────────────────────
// Admin opens a new settlement period for a virtual PPA / CfD contract
app.post('/open', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !ADMIN_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    contract_ref: string;
    generator_id: string;
    offtaker_id: string;
    settlement_period: string;
    reference_index: ReferenceIndex;
    notional_mwh: number;
    strike_price_zar_per_mwh: number;
  }>();

  if (!body.contract_ref || !body.generator_id || !body.offtaker_id || !body.settlement_period
    || !body.reference_index || !body.notional_mwh || !body.strike_price_zar_per_mwh) {
    return c.json({ success: false, error: 'contract_ref, generator_id, offtaker_id, settlement_period, reference_index, notional_mwh, strike_price_zar_per_mwh required' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM oe_virtual_ppa_settlements WHERE contract_ref = ? AND settlement_period = ? AND chain_status NOT IN ('cancelled')`,
  ).bind(body.contract_ref, body.settlement_period).first<{ id: string }>();
  if (existing) return c.json({ success: false, error: `Settlement already open for ${body.settlement_period}`, existing_id: existing.id }, 409);

  const nowIso = new Date().toISOString();
  const id = `vppa_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

  await c.env.DB.prepare(
    `INSERT INTO oe_virtual_ppa_settlements
     (id, contract_ref, generator_id, offtaker_id, settlement_period, reference_index,
      notional_mwh, strike_price_zar_per_mwh, chain_status, actor_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reference_price_pending', ?, ?, ?)`,
  ).bind(
    id, body.contract_ref, body.generator_id, body.offtaker_id, body.settlement_period, body.reference_index,
    body.notional_mwh, body.strike_price_zar_per_mwh, user.id, nowIso, nowIso,
  ).run();

  await fireCascade({
    event: 'vppa_evt_opened',
    actor_id: user.id,
    entity_type: 'virtual_ppa_settlement',
    entity_id: id,
    data: { contract_ref: body.contract_ref, generator_id: body.generator_id, offtaker_id: body.offtaker_id, settlement_period: body.settlement_period, notional_mwh: body.notional_mwh, strike_price_zar_per_mwh: body.strike_price_zar_per_mwh },
    env: c.env,
  });

  const row = await c.env.DB.prepare('SELECT * FROM oe_virtual_ppa_settlements WHERE id = ?').bind(id).first<SettlementRow>();
  return c.json({ success: true, data: { settlement: row ? decorate(row, new Date()) : null } }, 201);
});

// ── POST /api/offtaker/virtual-ppa-settlement/:id/action ─────────────────────
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const { action, ...body } = await c.req.json<{
    action: SettlementAction;
    reason?: string;
    reference_price_zar_per_mwh?: number;
    payment_method?: string;
    payment_ref?: string;
    payment_date?: string;
    payment_amount_zar?: number;
    dispute_reason?: string;
    recalculated_amount_zar?: number;
    isda_determination_ref?: string;
    write_off_reason?: string;
    cancellation_reason?: string;
  }>();

  const row = await c.env.DB.prepare('SELECT * FROM oe_virtual_ppa_settlements WHERE id = ?')
    .bind(c.req.param('id')).first<SettlementRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (user.role === 'offtaker' && row.offtaker_id !== user.id) return c.json({ success: false, error: 'Forbidden' }, 403);
  if (user.role === 'ipp_developer' && row.generator_id !== user.id) return c.json({ success: false, error: 'Forbidden' }, 403);

  if (SETTLEMENT_HARD_TERMINALS.has(row.chain_status)) {
    return c.json({ success: false, error: `Settlement is terminal (${row.chain_status})` }, 409);
  }

  const allowed = SETTLEMENT_VALID_TRANSITIONS[row.chain_status] ?? [];
  if (!allowed.includes(action)) {
    return c.json({ success: false, error: `Action '${action}' not allowed from '${row.chain_status}'` }, 409);
  }

  if (ADMIN_ONLY_ACTIONS.has(action) && !ADMIN_ROLES.has(user.role)) {
    return c.json({ success: false, error: `Action '${action}' requires admin or support` }, 403);
  }

  if (action === 'publish_reference_price' && !body.reference_price_zar_per_mwh) {
    return c.json({ success: false, error: 'reference_price_zar_per_mwh required to publish the reference index' }, 400);
  }

  const to = resolveNextStatus(action, row.chain_status as SettlementStatus, SETTLEMENT_STATE_TRANSITIONS);
  const nowIso = new Date().toISOString();

  // Compute the differential when the reference price is published — this is
  // what derives settlement_tier and therefore the SLA window for everything
  // downstream.
  let referencePrice = row.reference_price_zar_per_mwh;
  let differential = row.differential_zar_per_mwh;
  let settlementAmount = row.settlement_amount_zar;
  let payingParty = row.paying_party;
  let tier = row.settlement_tier;

  if (action === 'publish_reference_price' && body.reference_price_zar_per_mwh) {
    referencePrice = body.reference_price_zar_per_mwh;
    const computed = computeDifferential(row.notional_mwh, row.strike_price_zar_per_mwh, referencePrice);
    differential = computed.differential_zar_per_mwh;
    settlementAmount = computed.settlement_amount_zar;
    payingParty = computed.paying_party;
    tier = deriveSettlementTier(settlementAmount);
  }

  // The tier governing this settlement's SLA/regulator rules — fall back to
  // 'minor' only for the not-yet-calculated edge (e.g. cancelling pre-calc).
  const effectiveTier: SettlementTier = tier ?? 'minor';

  const overrides: Partial<SettlementRow> = {};
  if (body.payment_method)           overrides.payment_method = body.payment_method;
  if (body.payment_ref)              overrides.payment_ref = body.payment_ref;
  if (body.payment_date)             overrides.payment_date = body.payment_date;
  if (body.payment_amount_zar)       overrides.payment_amount_zar = body.payment_amount_zar;
  if (body.dispute_reason)           overrides.dispute_reason = body.dispute_reason;
  if (body.recalculated_amount_zar)  overrides.recalculated_amount_zar = body.recalculated_amount_zar;
  if (body.isda_determination_ref)   overrides.isda_determination_ref = body.isda_determination_ref;
  if (body.write_off_reason)         overrides.write_off_reason = body.write_off_reason;
  if (body.cancellation_reason)      overrides.cancellation_reason = body.cancellation_reason;

  // A confirmed recalculation replaces the working settlement amount before
  // the revised statement is reissued.
  if (action === 'confirm_recalculation' && body.recalculated_amount_zar) {
    settlementAmount = body.recalculated_amount_zar;
    tier = deriveSettlementTier(settlementAmount);
  }

  // Set SLA deadline when the counterparty acknowledges (payment clock starts)
  let newSla = row.sla_deadline;
  if (action === 'acknowledge') {
    newSla = slaDeadlineFor(effectiveTier, nowIso);
  }

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'actor_id = ?'];
  const setParams: (string | number | null)[] = [to, nowIso, user.id];

  if (referencePrice !== row.reference_price_zar_per_mwh)   { setClauses.push('reference_price_zar_per_mwh = ?'); setParams.push(referencePrice); }
  if (differential !== row.differential_zar_per_mwh)        { setClauses.push('differential_zar_per_mwh = ?');    setParams.push(differential); }
  if (settlementAmount !== row.settlement_amount_zar)       { setClauses.push('settlement_amount_zar = ?');      setParams.push(settlementAmount); }
  if (payingParty !== row.paying_party)                     { setClauses.push('paying_party = ?');               setParams.push(payingParty); }
  if (tier !== row.settlement_tier)                         { setClauses.push('settlement_tier = ?');            setParams.push(tier); }
  if (newSla !== row.sla_deadline)                          { setClauses.push('sla_deadline = ?');               setParams.push(newSla); }
  if (body.reason)                                          { setClauses.push('reason = ?');                     setParams.push(body.reason); }

  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setParams.push(v as string | number | null);
  }

  if (crossesIntoRegulator(action, effectiveTier)) {
    setClauses.push('regulator_notified = 1');
  }

  await c.env.DB.prepare(
    `UPDATE oe_virtual_ppa_settlements SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setParams, row.id).run();

  const eventName = `vppa_evt_${action}` as const;
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'virtual_ppa_settlement',
    entity_id: row.id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      reference_price_zar_per_mwh: referencePrice,
      differential_zar_per_mwh: differential,
      settlement_amount_zar: settlementAmount,
      paying_party: payingParty,
      settlement_tier: tier,
      crosses_into_regulator: crossesIntoRegulator(action, effectiveTier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_virtual_ppa_settlements WHERE id = ?')
    .bind(row.id).first<SettlementRow>();
  return c.json({ success: true, data: { settlement: refreshed ? decorate(refreshed, new Date()) : null } });
});

// ── SLA sweep (exported for cron wiring) ─────────────────────────────────────
export async function virtualPpaSettlementSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const nowIso = new Date().toISOString();

  const overdueRs = await env.DB.prepare(
    `SELECT * FROM oe_virtual_ppa_settlements
     WHERE chain_status = 'payment_pending'
       AND sla_deadline IS NOT NULL
       AND datetime(sla_deadline) < datetime(?)
       AND sla_breached = 0`,
  ).bind(nowIso).all<SettlementRow>();

  let breached = 0;
  for (const row of overdueRs.results || []) {
    const tier: SettlementTier = row.settlement_tier ?? 'minor';

    await env.DB.prepare(
      `UPDATE oe_virtual_ppa_settlements SET chain_status = 'overdue', sla_breached = 1, updated_at = ? WHERE id = ?`,
    ).bind(nowIso, row.id).run();

    const crosses = slaBreachCrossesIntoRegulator(tier);
    if (crosses) {
      await env.DB.prepare(
        `UPDATE oe_virtual_ppa_settlements SET regulator_notified = 1 WHERE id = ?`,
      ).bind(row.id).run();
    }

    await fireCascade({
      event: 'vppa_evt_sla_breach',
      actor_id: 'system',
      entity_type: 'virtual_ppa_settlement',
      entity_id: row.id,
      data: { ...row, chain_status: 'overdue', crosses_into_regulator: crosses },
      env,
    });

    breached++;
  }

  return { scanned: (overdueRs.results || []).length, breached };
}

export default app;
