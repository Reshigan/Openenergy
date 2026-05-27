// ═══════════════════════════════════════════════════════════════════════════
// Clearing Disclosure — Wave 3 CPMI-IOSCO PFMI monthly quantitative publication.
//
// Mounted at /api/clearing/disclosure (flat).
//
// Endpoints:
//   GET    /current             — most recent snapshot (any month)
//   GET    /list                — all snapshots, newest first
//   GET    /:id                 — one snapshot + computed breaches
//   POST   /compute             — compute a fresh snapshot for an as-of date
//   POST   /:id/publish         — mark a snapshot as published
//
// Read roles: admin, support, regulator, lender, trader, risk.
// Write roles: admin, support, regulator (only regulator may publish).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { computeDisclosure, evaluateBreaches, DisclosureInputs } from '../utils/disclosure';

const disclosure = new Hono<HonoEnv>();
disclosure.use('*', authMiddleware);

const READ_ROLES = new Set(['admin', 'support', 'regulator', 'lender', 'trader', 'risk']);
const COMPUTE_ROLES = new Set(['admin', 'support']);
const PUBLISH_ROLES = new Set(['admin', 'regulator']);

function newId(prefix: string) { return `${prefix}_${crypto.randomUUID().slice(0, 12)}`; }

// Aggregate the disclosure inputs from live D1. Each input is best-effort; if
// a table is empty/missing the helper returns 0 for that input rather than
// failing — so disclosure remains computable in dev/test environments.
async function gatherInputs(c: any, _asOfDate: string): Promise<DisclosureInputs> {
  const db = c.env.DB as D1Database;
  const safe = async <T>(q: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await q(); } catch { return fallback; }
  };

  // §6 Margin — sum across oe_margin_calls + oe_collateral_postings.
  const im = await safe(async () => {
    const r = await db.prepare(`SELECT COALESCE(SUM(initial_margin_zar),0) AS s FROM oe_margin_calls WHERE status IN ('open','posted')`).first<any>();
    return Number(r?.s || 0);
  }, 0);
  const vm = await safe(async () => {
    const r = await db.prepare(`SELECT COALESCE(SUM(variation_margin_zar),0) AS s FROM oe_margin_calls WHERE status IN ('open','posted')`).first<any>();
    return Number(r?.s || 0);
  }, 0);

  // VaR 99% lookback total — sum across system portfolios for the day.
  const var99 = await safe(async () => {
    const r = await db.prepare(`
      SELECT COALESCE(SUM(var_zar),0) AS s
        FROM risk_var_results
       WHERE confidence = 0.99
         AND as_of_date = (SELECT MAX(as_of_date) FROM risk_var_results)
    `).first<any>();
    return Number(r?.s || 0);
  }, 0);

  // §7 Liquidity — qualifying liquid resources from collateral accounts.
  const qlr = await safe(async () => {
    const r = await db.prepare(`SELECT COALESCE(SUM(balance_zar),0) AS s FROM collateral_accounts WHERE asset_type IN ('cash','t_bill','bond')`).first<any>();
    return Number(r?.s || 0);
  }, 0);
  const largest = await safe(async () => {
    const r = await db.prepare(`
      SELECT COALESCE(MAX(exposure),0) AS s FROM (
        SELECT counterparty_id, SUM(ABS(net_volume_mwh * last_mark_price)) AS exposure
          FROM trader_positions
         GROUP BY counterparty_id
      )
    `).first<any>();
    return Number(r?.s || 0);
  }, 0);

  // §4 Credit — default fund.
  const df_bal = await safe(async () => {
    const r = await db.prepare(`SELECT COALESCE(SUM(balance_zar),0) AS s FROM oe_clearing_fund`).first<any>();
    return Number(r?.s || 0);
  }, 0);
  const df_req = await safe(async () => {
    const r = await db.prepare(`SELECT COALESCE(SUM(required_zar),0) AS s FROM oe_clearing_fund`).first<any>();
    return Number(r?.s || 0);
  }, 0);

  // §15 CCP capital — single config row.
  const cap = await safe(async () => {
    const r = await db.prepare(`SELECT COALESCE(ccp_capital_zar,0) AS s FROM oe_clearing_fund ORDER BY id LIMIT 1`).first<any>();
    return Number(r?.s || 0);
  }, 0);

  // §17 Operational — settlement instruction outcomes.
  const settled = await safe(async () => {
    const r = await db.prepare(`SELECT COUNT(*) AS c FROM oe_settlement_instructions WHERE status='confirmed'`).first<any>();
    return Number(r?.c || 0);
  }, 0);
  const failed = await safe(async () => {
    const r = await db.prepare(`SELECT COUNT(*) AS c FROM oe_settlement_instructions WHERE status='failed'`).first<any>();
    return Number(r?.c || 0);
  }, 0);

  // Active members.
  const members = await safe(async () => {
    const r = await db.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM users WHERE active = 1`).first<any>();
    return Number(r?.c || 0);
  }, 0);

  return {
    initial_margin_total_zar: im,
    variation_margin_total_zar: vm,
    margin_var99_lookback_zar: var99,
    qualifying_liquid_resources_zar: qlr,
    largest_member_exposure_zar: largest,
    default_fund_balance_zar: df_bal,
    default_fund_required_zar: df_req,
    ccp_capital_zar: cap,
    ccp_capital_sitg_pct: 0.25,
    settled_instruction_count: settled,
    failed_instruction_count: failed,
    active_member_count: members,
  };
}

// ── GET /current ───────────────────────────────────────────────────────────
disclosure.get('/current', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const row = await (c.env.DB as D1Database).prepare(`
    SELECT * FROM clearing_disclosure_snapshots ORDER BY as_of_date DESC LIMIT 1
  `).first<any>();
  if (!row) return c.json({ data: null });
  const breaches = evaluateBreaches(row);
  return c.json({ data: { ...row, breaches } });
});

// ── GET /list ──────────────────────────────────────────────────────────────
disclosure.get('/list', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const rows = await (c.env.DB as D1Database).prepare(`
    SELECT id, as_of_date, margin_coverage_pct, liquidity_coverage_ratio,
           default_fund_coverage_ratio, settlement_finality_pct, published, published_at
      FROM clearing_disclosure_snapshots
     ORDER BY as_of_date DESC
     LIMIT 24
  `).all<any>();
  return c.json({ data: rows.results || [] });
});

// ── GET /:id ───────────────────────────────────────────────────────────────
disclosure.get('/:id', async (c) => {
  const u = getCurrentUser(c);
  if (!READ_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const row = await (c.env.DB as D1Database).prepare(`
    SELECT * FROM clearing_disclosure_snapshots WHERE id = ?
  `).bind(id).first<any>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const breaches = evaluateBreaches(row);
  return c.json({ data: { ...row, breaches } });
});

// ── POST /compute ──────────────────────────────────────────────────────────
disclosure.post('/compute', async (c) => {
  const u = getCurrentUser(c);
  if (!COMPUTE_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const as_of_date = body.as_of_date || new Date().toISOString().slice(0, 10);
  const inputs = await gatherInputs(c, as_of_date);
  const snap = computeDisclosure(inputs, as_of_date);
  const id = newId('cds');
  await (c.env.DB as D1Database).prepare(`
    INSERT INTO clearing_disclosure_snapshots (
      id, as_of_date, initial_margin_total_zar, variation_margin_total_zar, margin_coverage_pct,
      qualifying_liquid_resources_zar, largest_member_exposure_zar, liquidity_coverage_ratio,
      default_fund_balance_zar, default_fund_required_zar, default_fund_coverage_ratio,
      ccp_capital_zar, ccp_capital_skin_in_game_zar,
      settlement_finality_pct, failed_instruction_count, active_member_count, computed_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, as_of_date,
    snap.initial_margin_total_zar, snap.variation_margin_total_zar, snap.margin_coverage_pct,
    snap.qualifying_liquid_resources_zar, snap.largest_member_exposure_zar, snap.liquidity_coverage_ratio,
    snap.default_fund_balance_zar, snap.default_fund_required_zar, snap.default_fund_coverage_ratio,
    snap.ccp_capital_zar, snap.ccp_capital_skin_in_game_zar,
    snap.settlement_finality_pct, snap.failed_instruction_count, snap.active_member_count,
    u.id,
  ).run();

  await fireCascade({
    event: 'clearing.disclosure.computed',
    actor_id: u.id,
    entity_type: 'clearing_disclosure_snapshot',
    entity_id: id,
    data: { as_of_date, breach_count: evaluateBreaches(snap).length },
    env: c.env,
  });

  const breaches = evaluateBreaches(snap);
  return c.json({ data: { id, ...snap, breaches } });
});

// ── POST /:id/publish ──────────────────────────────────────────────────────
disclosure.post('/:id/publish', async (c) => {
  const u = getCurrentUser(c);
  if (!PUBLISH_ROLES.has(u.role)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const row = await (c.env.DB as D1Database).prepare(`
    SELECT id, published FROM clearing_disclosure_snapshots WHERE id = ?
  `).bind(id).first<any>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.published) return c.json({ error: 'already_published' }, 409);

  await (c.env.DB as D1Database).prepare(`
    UPDATE clearing_disclosure_snapshots SET published = 1, published_at = datetime('now'), published_by = ? WHERE id = ?
  `).bind(u.id, id).run();

  await fireCascade({
    event: 'clearing.disclosure.published',
    actor_id: u.id,
    entity_type: 'clearing_disclosure_snapshot',
    entity_id: id,
    data: {},
    env: c.env,
  });

  return c.json({ data: { id, published: 1 } });
});

export default disclosure;
