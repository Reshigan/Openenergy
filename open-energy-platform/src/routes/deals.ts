// ═══════════════════════════════════════════════════════════════════════════
// Generalized cross-role deal engine — Phase 1 (CROSS_ROLE_DEAL_ENGINE_PLAN §6).
//
// One generic router drives offer→match→evaluate→accept→track for EVERY deal
// type purely from static in-code descriptors (src/utils/deal-registry.ts).
//
// SECURITY SPINE (non-negotiable):
//   • The `:type` URL param is ONLY ever resolved via getDealDescriptor(type).
//     A registry miss → 404 unknown_deal_type. The string is NEVER interpolated
//     into SQL — all table/column/status literals below are static. This makes
//     SQL injection through `:type` impossible.
//   • GET /options is a DELIBERATE scoped cross-tenant read (the marketplace
//     seam): it filters by deal_type + status only, NO tenant fence. Everything
//     downstream of accept is fenced to the demand party's tenant.
//   • Cross-tenant indicative prices are POPIA-banded at the route layer.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { AppError } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { getTenantId } from '../utils/tenant';
import { withLock, LockBusyError } from '../utils/locks';
import { fireCascade } from '../utils/cascade';
import { evaluateOrder, type RiskSnapshot } from '../utils/pre-trade-guards';
import {
  getDealDescriptor,
  listDealDescriptors,
  validateFields,
  parseTermSheet,
  valueSweeteners,
  type DealDescriptor,
  type Json,
  type OfferRow,
  type ScoredOption,
} from '../utils/deal-registry';

const deals = new Hono<HonoEnv>();
deals.use('*', authMiddleware);

// Registry miss → canonical 404 contract (the injection guard). Distinct class
// so onError emits `unknown_deal_type` as the error code verbatim.
class UnknownDealType extends Error {}

// Map AppError (thrown by authMiddleware / getCurrentUser) to its status code so
// the bare router returns clean 401/403/404 under the test `call()` harness and
// in production (where the top-level onError also catches these).
deals.onError((err, c) => {
  if (err instanceof UnknownDealType) {
    return c.json({ error: 'unknown_deal_type' }, 404);
  }
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.statusCode as 400 | 401 | 403 | 404 | 409 | 500);
  }
  return c.json({ error: 'internal_error', message: (err as Error).message }, 500);
});

const uuid = () => crypto.randomUUID();

// Resolve descriptor or throw the canonical 404. Centralised so every route
// shares the exact same registry-miss contract (the injection guard).
function resolveDescriptor(type: string): DealDescriptor {
  const d = getDealDescriptor(type);
  if (!d) throw new UnknownDealType('unknown_deal_type');
  return d;
}

// POPIA banding: round a cross-tenant indicative figure into an indicative band
// so a counterparty in another tenant never sees a verbatim price. Round to the
// nearest R50 (and never return exactly the unbanded value). null passes through.
function bandIndicative(value: number | null): number | null {
  if (value == null) return null;
  const banded = Math.round(value / 50) * 50;
  // Guarantee it differs from a verbatim figure even on an exact multiple of 50.
  return banded === value ? banded + 50 : banded;
}

// Build a minimal-but-valid passing RiskSnapshot for the deal accept gate. The
// notional is derived from the offer term sheet so a real credit/collateral
// breach could be modelled later; Phase 1 keeps headroom generous and lets the
// participant-status / market-state guards do the real gating.
function snapshotForAccept(
  participantStatus: RiskSnapshot['participant_status'],
  notionalZar: number,
  marketAccess: RiskSnapshot['participant_market_access'],
): RiskSnapshot {
  return {
    participant_status: participantStatus,
    credit_limit_zar: Math.max(notionalZar * 10, 1_000_000_000),
    open_exposure_zar: 0,
    free_collateral_zar: Math.max(notionalZar, 1_000_000_000),
    current_position_mwh: 0,
    position_limit_mwh: 0,
    market_state: 'open',
    mark_price_zar_mwh: 1000,
    mark_age_minutes: 0,
    price_band_pct: null,
    // Thread the real KYC market-access tier so evaluateOrder's authoritative
    // backstop also gates deal-accepts that are trades (read_only / unverified /
    // certificate_only -> MARKET_ACCESS_REQUIRED). Generous credit/collateral
    // headroom above is intentional; the gating signals are status + access.
    participant_market_access: marketAccess,
  };
}

async function gateStateForAccept(
  env: HonoEnv['Bindings'],
  pid: string,
): Promise<{ status: RiskSnapshot['participant_status']; market_access: RiskSnapshot['participant_market_access'] }> {
  const row = await env.DB.prepare('SELECT status, kyc_status, participant_market_access FROM participants WHERE id = ?')
    .bind(pid)
    .first<{ status: string | null; kyc_status: string | null; participant_market_access: string | null }>();
  if (!row) return { status: 'unknown', market_access: null };
  const market_access = (row.participant_market_access as RiskSnapshot['participant_market_access']) ?? null;
  let status: RiskSnapshot['participant_status'];
  if (row.status === 'suspended') status = 'suspended';
  else if (row.kyc_status && row.kyc_status !== 'approved') status = 'pending_kyc';
  else if (row.status === 'active') status = 'active';
  else status = 'unknown';
  return { status, market_access };
}

function termSheetNumber(ts: Json, key: string): number {
  const v = ts[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 0a. GET /mine — Deal Desk: requests I authored + offers I published.
//
// Registered BEFORE the /:type/* param routes so the literal /mine segment can
// never be shadowed by :type matching (a /:type miss would 404 unknown_deal_type).
// Identity- AND tenant-fenced (demand_id+tenant for requests, provider_id+tenant
// for offers) — this is NOT the cross-tenant marketplace seam. RAW envelope.
// ─────────────────────────────────────────────────────────────────────────────
deals.get('/mine', async (c) => {
  const user = getCurrentUser(c);
  const tenant = getTenantId(c);

  const reqRes = await c.env.DB.prepare(
    `SELECT r.id, r.deal_type, r.need, r.status, r.target_amount_zar, r.bid_window_close, r.clearing_rule,
            r.selected_offer_id, r.dispatched_chain_key, r.dispatched_case_id, r.created_at,
            (SELECT COUNT(*) FROM oe_deal_offers o WHERE o.request_id = r.id) AS offer_count
       FROM oe_deal_requests r
      WHERE r.demand_id = ? AND r.tenant_id = ?
      ORDER BY r.created_at DESC`,
  ).bind(user.id, tenant).all<Record<string, unknown> & { need: string }>();
  const requests = (reqRes.results ?? []).map((r) => {
    let need: Json = {};
    try { need = JSON.parse(r.need) as Json; } catch { need = {}; }
    return { ...r, need };
  });

  const offRes = await c.env.DB.prepare(
    `SELECT id, deal_type, title, status, request_id, bid_amount_zar, committed_amount_zar,
            term_sheet, expiry, created_at
       FROM oe_deal_offers
      WHERE provider_id = ? AND tenant_id = ?
      ORDER BY created_at DESC`,
  ).bind(user.id, tenant).all<Record<string, unknown> & { term_sheet: string }>();
  const offers = (offRes.results ?? []).map((o) => {
    let term_sheet: Json = {};
    try { term_sheet = JSON.parse(o.term_sheet) as Json; } catch { term_sheet = {}; }
    return { ...o, term_sheet };
  });

  return c.json({ requests, offers });
});

// ─────────────────────────────────────────────────────────────────────────────
// 0b. GET /types — Deal Desk: deal types the caller's role can transact.
//
// Registered BEFORE the /:type/* param routes (same shadowing concern as /mine).
// Pure registry read (static descriptors); no SQL. admin can do everything. RAW.
// ─────────────────────────────────────────────────────────────────────────────
deals.get('/types', async (c) => {
  const user = getCurrentUser(c);
  const role = user.role;
  const types: Record<string, unknown>[] = [];
  for (const d of listDealDescriptors()) {
    const can_offer = d.provider_roles.includes(role) || role === 'admin';
    const can_request = d.demand_roles.includes(role) || role === 'admin';
    if (!(can_offer || can_request)) continue;
    types.push({
      deal_type: d.deal_type,
      kind: d.kind,
      initiator: d.initiator,
      event_prefix: d.event_prefix,
      can_offer,
      can_request,
      term_sheet_schema: d.term_sheet_schema,
      need_schema: d.need_schema,
      provider_roles: d.provider_roles,
      demand_roles: d.demand_roles,
    });
  }
  return c.json({ types });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. POST /:type/offer — provider publishes an offer (or a bid).
// ─────────────────────────────────────────────────────────────────────────────
deals.post('/:type/offer', async (c) => {
  const d = resolveDescriptor(c.req.param('type'));
  const user = getCurrentUser(c);
  if (!d.provider_roles.includes(user.role) && user.role !== 'admin') {
    return c.json({ error: 'forbidden', message: `Requires provider role: ${d.provider_roles.join(', ')}` }, 403);
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const termSheet = (body.term_sheet ?? {}) as Json;
  const errs = validateFields(d.term_sheet_schema, termSheet);
  if (errs.length) return c.json({ error: 'validation_failed', detail: errs }, 400);

  const id = `deal_offer_${uuid()}`;
  const tenant = getTenantId(c);
  await c.env.DB.prepare(
    `INSERT INTO oe_deal_offers
       (id, deal_type, provider_id, provider_role, tenant_id, title, term_sheet, request_id,
        bid_amount_zar, bid_quantity, committed_amount_zar, syndicate_role, syndicate_id, tranche_pct, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
  ).bind(
    id,
    d.deal_type,
    user.id,
    user.role,
    tenant,
    String(body.title ?? d.deal_type),
    JSON.stringify(termSheet),
    (body.request_id as string) ?? null,
    typeof body.bid_amount_zar === 'number' ? body.bid_amount_zar : null,
    typeof body.bid_quantity === 'number' ? body.bid_quantity : null,
    typeof body.committed_amount_zar === 'number' ? body.committed_amount_zar : null,
    (body.syndicate_role as string) ?? null,
    (body.syndicate_id as string) ?? null,
    typeof body.tranche_pct === 'number' ? body.tranche_pct : null,
  ).run();

  await fireCascade({
    event: 'deal.offer.published',
    actor_id: user.id,
    entity_type: 'deal_offer',
    entity_id: id,
    data: { deal_type: d.deal_type, kind: d.kind, request_id: body.request_id ?? null },
    env: c.env,
  });
  return c.json({ offer_id: id });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. POST /:type/request — demand party publishes a need (or opens auction/syndication).
// ─────────────────────────────────────────────────────────────────────────────
deals.post('/:type/request', async (c) => {
  const d = resolveDescriptor(c.req.param('type'));
  const user = getCurrentUser(c);
  // marketplace/negotiation → demand_roles open it.
  // auction/syndication → the opener is the initiating side (demand_roles when
  // initiator==='demand', else provider_roles). Keep it simple per §6.
  const allowDemand = d.demand_roles.includes(user.role);
  const allowProvider =
    (d.kind === 'auction' || d.kind === 'syndication') && d.provider_roles.includes(user.role);
  if (!allowDemand && !allowProvider && user.role !== 'admin') {
    return c.json({ error: 'forbidden', message: `Requires role: ${[...d.demand_roles].join(', ')}` }, 403);
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const need = (body.need ?? {}) as Json;
  const errs = validateFields(d.need_schema, need);
  if (errs.length) return c.json({ error: 'validation_failed', detail: errs }, 400);

  const id = `deal_request_${uuid()}`;
  const tenant = getTenantId(c);
  await c.env.DB.prepare(
    `INSERT INTO oe_deal_requests
       (id, deal_type, demand_id, demand_role, tenant_id, need, target_amount_zar, clearing_rule,
        bid_window_close, objective_id, stack_layer, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
  ).bind(
    id,
    d.deal_type,
    user.id,
    user.role,
    tenant,
    JSON.stringify(need),
    typeof body.target_amount_zar === 'number' ? body.target_amount_zar : null,
    d.clearing?.rule ?? null,
    (body.bid_window_close as string) ?? null,
    (body.objective_id as string) ?? null,
    (body.stack_layer as string) ?? null,
  ).run();

  await fireCascade({
    event: 'deal.request.published',
    actor_id: user.id,
    entity_type: 'deal_request',
    entity_id: id,
    data: { deal_type: d.deal_type, kind: d.kind },
    env: c.env,
  });
  return c.json({ request_id: id });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /:type/options?request_id=… — marketplace seam (cross-tenant read).
// ─────────────────────────────────────────────────────────────────────────────
deals.get('/:type/options', async (c) => {
  const d = resolveDescriptor(c.req.param('type'));
  const user = getCurrentUser(c);
  const callerTenant = getTenantId(c);
  const requestId = c.req.query('request_id');
  if (!requestId) return c.json({ error: 'request_id required' }, 400);

  // Tenant-fence the request: the buyer's need profile belongs to the demand
  // party's tenant. A caller in another tenant must not read it or enumerate
  // request IDs — same 404 contract as a genuine miss. (The OFFERS read below
  // is the DELIBERATE cross-tenant marketplace seam and stays unfenced.)
  const reqRow = await c.env.DB.prepare(
    `SELECT id, need, tenant_id FROM oe_deal_requests WHERE id = ? AND deal_type = ? AND tenant_id = ?`,
  ).bind(requestId, d.deal_type, callerTenant).first<{ id: string; need: string; tenant_id: string }>();
  if (!reqRow) return c.json({ error: 'request_not_found' }, 404);

  let need: Json = {};
  try { need = JSON.parse(reqRow.need) as Json; } catch { need = {}; }

  // DELIBERATE cross-tenant read — the seam. deal_type + open/published only.
  const offersRes = await c.env.DB.prepare(
    `SELECT * FROM oe_deal_offers WHERE deal_type = ? AND status IN ('published','open')`,
  ).bind(d.deal_type).all<OfferRow>();
  const candidates = offersRes.results ?? [];

  const matched = await d.matcher(need, candidates, c.env);

  const options: ScoredOption[] = [];
  for (const offer of matched) {
    const scored = d.scorer(need, offer);
    const sweet = await valueSweeteners(d, offer, need, c.env);
    let est = scored.est_value_zar;
    if (sweet.sweetener_value_zar > 0 && est != null) est = est + sweet.sweetener_value_zar;

    // POPIA band cross-tenant indicative prices (verbatim only for own-tenant
    // or price_basis 'listed'). Band both the headline metric and est value.
    const crossTenant = offer.tenant_id !== callerTenant;
    let primary = scored.primary_metric;
    if (crossTenant && scored.price_basis === 'indicative') {
      primary = bandIndicative(primary);
      est = bandIndicative(est);
    }
    options.push({
      ...scored,
      primary_metric: primary,
      est_value_zar: est,
      sweetener_value_zar: sweet.sweetener_value_zar,
      rationale: sweet.lines.length ? `${scored.rationale} · ${sweet.lines.join(' · ')}` : scored.rationale,
    });
  }

  // Sort by est_value_zar desc, nulls last.
  options.sort((a, b) => {
    const av = a.est_value_zar ?? -Infinity;
    const bv = b.est_value_zar ?? -Infinity;
    return bv - av;
  });

  await fireCascade({
    event: 'deal.options.viewed',
    actor_id: user.id,
    entity_type: 'deal_request',
    entity_id: requestId,
    data: { deal_type: d.deal_type, count: options.length },
    env: c.env,
  });
  return c.json({ options });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inbound condition_precedent link gate. Returns true if accept is BLOCKED.
// A CP link targeting this offer or request whose status != 'met' blocks accept.
// ─────────────────────────────────────────────────────────────────────────────
async function conditionPrecedentUnmet(env: HonoEnv['Bindings'], offerId: string, requestId: string): Promise<boolean> {
  const res = await env.DB.prepare(
    `SELECT id, status FROM oe_deal_links
      WHERE link_kind = 'condition_precedent'
        AND ((to_kind = 'offer' AND to_id = ?) OR (to_kind = 'request' AND to_id = ?))`,
  ).bind(offerId, requestId).all<{ id: string; status: string }>();
  return (res.results ?? []).some((l) => l.status !== 'met');
}

// Advance the parent objective when a child request carrying objective_id is
// accepted. Idempotent-by-offer (won't double-count the same accepted offer).
async function advanceObjective(
  env: HonoEnv['Bindings'],
  d: DealDescriptor,
  requestId: string,
  offerId: string,
  actorId: string,
): Promise<void> {
  if (!d.funds_objective) return;
  const reqRow = await env.DB.prepare('SELECT objective_id, need FROM oe_deal_requests WHERE id = ?')
    .bind(requestId).first<{ objective_id: string | null; need: string }>();
  if (!reqRow?.objective_id) return;
  const objRow = await env.DB.prepare('SELECT id, funding_target_zar, committed_zar, status FROM oe_deal_objectives WHERE id = ?')
    .bind(reqRow.objective_id).first<{ id: string; funding_target_zar: number; committed_zar: number; status: string }>();
  if (!objRow) return;
  const offRow = await env.DB.prepare('SELECT committed_amount_zar, term_sheet FROM oe_deal_offers WHERE id = ?')
    .bind(offerId).first<{ committed_amount_zar: number | null; term_sheet: string }>();
  let quantum = offRow?.committed_amount_zar ?? 0;
  if (!quantum && offRow) {
    let ts: Json = {};
    // A malformed term_sheet here means this leg contributes 0 to the
    // objective until corrected — keep the {} fallback (must not break accept),
    // but surface the skip so the funding stall is observable, not silent.
    try { ts = JSON.parse(offRow.term_sheet) as Json; }
    catch (e) { console.warn('deal_term_sheet_parse_failed', offerId, (e as Error).message); }
    quantum = termSheetNumber(ts, d.funds_objective.quantum_field);
  }
  if (!quantum) return;
  const newCommitted = objRow.committed_zar + quantum;
  await env.DB.prepare('UPDATE oe_deal_objectives SET committed_zar = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(newCommitted, objRow.id).run();
  if (objRow.status === 'forming' && newCommitted >= objRow.funding_target_zar) {
    await env.DB.prepare("UPDATE oe_deal_objectives SET status = 'subscribed', updated_at = datetime('now') WHERE id = ?")
      .bind(objRow.id).run();
    await fireCascade({
      event: 'objective.subscribed',
      actor_id: actorId,
      entity_type: 'deal_objective',
      entity_id: objRow.id,
      data: { committed_zar: newCommitted, funding_target_zar: objRow.funding_target_zar },
      commercial: { entity_value: newCommitted, participant_id: actorId },
      env,
    });
  }
}

// Clear an auction request pay_as_bid: cheapest bids first up to the request
// target, then fire deal.cleared. Shared by POST /accept (manual close) and the
// timer sweep (window-close auto-clear) so both paths behave identically.
// Caller is responsible for holding the `deal:request:<id>` lock.
async function clearAuction(
  env: HonoEnv['Bindings'],
  d: DealDescriptor,
  requestId: string,
  actorId: string,
): Promise<{ clearedCount: number; spent: number }> {
  const reqRow = await env.DB.prepare('SELECT target_amount_zar FROM oe_deal_requests WHERE id = ?')
    .bind(requestId).first<{ target_amount_zar: number | null }>();
  if (!reqRow) return { clearedCount: 0, spent: 0 }; // unreachable: callers pre-check existence
  const bidsRes = await env.DB.prepare(
    `SELECT * FROM oe_deal_offers WHERE request_id = ? AND status IN ('published','open') ORDER BY bid_amount_zar ASC`,
  ).bind(requestId).all<OfferRow>();
  const bids = bidsRes.results ?? [];
  const target = reqRow.target_amount_zar ?? Infinity;
  let spent = 0;
  let clearedCount = 0;
  for (const bid of bids) {
    const cost = bid.bid_amount_zar ?? 0;
    if (spent + cost > target) break;
    spent += cost;
    clearedCount++;
    await env.DB.prepare(
      `UPDATE oe_deal_offers SET clearing_status = 'cleared', cleared_quantity = ?, cleared_price_zar = ?, status = 'accepted', updated_at = datetime('now') WHERE id = ?`,
    ).bind(bid.bid_quantity ?? null, bid.bid_amount_zar ?? null, bid.id).run();
  }
  await env.DB.prepare(
    `UPDATE oe_deal_requests SET status = 'cleared', clearing_price_zar = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(spent, requestId).run();
  await fireCascade({
    event: 'deal.cleared', actor_id: actorId, entity_type: 'deal_request', entity_id: requestId,
    data: { deal_type: d.deal_type, cleared_count: clearedCount, clearing_rule: d.clearing?.rule ?? 'pay_as_bid' },
    commercial: { entity_value: spent, participant_id: actorId }, env,
  });
  return { clearedCount, spent };
}

// Timer-driven housekeeping run by the */15 cron (scheduled() in index.ts):
//   1. Expire stale offers (status published/open, expiry passed → 'expired').
//   2. Auto-clear timer auctions whose bid window has closed. Only descriptors
//      with kind='auction' AND clearing.window_close='timer' are swept — the
//      descriptor (static, never request-derived) is the authority, so a
//      marketplace / manual-close / unknown deal_type request is skipped even
//      with a past window. Per-request lock; a busy lock skips, not fails.
export async function runDealSweep(
  env: HonoEnv['Bindings'],
): Promise<{ offersExpired: number; auctionsCleared: number }> {
  const expired = await env.DB.prepare(
    `UPDATE oe_deal_offers SET status = 'expired', updated_at = datetime('now')
       WHERE status IN ('published','open') AND expiry IS NOT NULL AND expiry <= datetime('now')`,
  ).run();
  const offersExpired = expired.meta?.changes ?? 0;

  const dueRes = await env.DB.prepare(
    `SELECT id, deal_type FROM oe_deal_requests
       WHERE status = 'open' AND bid_window_close IS NOT NULL AND bid_window_close <= datetime('now')`,
  ).all<{ id: string; deal_type: string }>();
  let auctionsCleared = 0;
  for (const row of dueRes.results ?? []) {
    const d = getDealDescriptor(row.deal_type);
    if (!d || d.kind !== 'auction' || d.clearing?.window_close !== 'timer') continue;
    try {
      await withLock(env, `deal:request:${row.id}`, 'deal_sweep', () => clearAuction(env, d, row.id, 'deal_sweep'));
      auctionsCleared++;
    } catch (e) {
      if (e instanceof LockBusyError) continue; // another writer holds it — next sweep retries
      throw e;
    }
  }
  return { offersExpired, auctionsCleared };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /:type/accept — branches on descriptor.kind.
// ─────────────────────────────────────────────────────────────────────────────
deals.post('/:type/accept', async (c) => {
  const d = resolveDescriptor(c.req.param('type'));
  const user = getCurrentUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const requestId = body.request_id as string | undefined;
  const offerId = body.offer_id as string | undefined;

  // ── Authorization gate (before the kind-branch lock/dispatch logic) ──────
  // The platform JWT roles are suffixed and the registry stores the suffixed
  // forms, so match user.role directly against the registry lists.
  if (d.kind === 'marketplace' || d.kind === 'negotiation') {
    // The acceptor is the DEMAND party.
    if (!d.demand_roles.includes(user.role)) {
      return c.json({ error: 'forbidden' }, 403);
    }
    // When a request is supplied, it must belong to the demand party's own
    // tenant — this establishes the fence the rest of accept relies on.
    if (requestId) {
      const owner = await c.env.DB.prepare(
        'SELECT tenant_id FROM oe_deal_requests WHERE id = ? AND deal_type = ?',
      ).bind(requestId, d.deal_type).first<{ tenant_id: string }>();
      if (!owner || owner.tenant_id !== getTenantId(c)) {
        return c.json({ error: 'forbidden' }, 403);
      }
    }
  } else if (d.kind === 'auction' || d.kind === 'syndication') {
    // The caller must be a participant on either side.
    if (!d.provider_roles.includes(user.role) && !d.demand_roles.includes(user.role)) {
      return c.json({ error: 'forbidden' }, 403);
    }
  }

  try {
    if (d.kind === 'marketplace' || d.kind === 'negotiation') {
      if (!offerId) return c.json({ error: 'offer_id required' }, 400);
      return await withLock(c.env, `deal:offer:${offerId}`, user.id, async () => {
        const offer = await c.env.DB.prepare('SELECT * FROM oe_deal_offers WHERE id = ?')
          .bind(offerId).first<OfferRow>();
        if (!offer) return c.json({ error: 'offer_unavailable' }, 409);
        if (!['published', 'matched'].includes(offer.status)) {
          return c.json({ error: 'offer_unavailable' }, 409);
        }
        // CP link gate.
        if (await conditionPrecedentUnmet(c.env, offerId, requestId ?? '')) {
          return c.json({ error: 'condition_precedent_unmet' }, 409);
        }

        const ts = parseTermSheet(offer);
        const dealValue = termSheetNumber(ts, 'offered_annual_mwh') * termSheetNumber(ts, 'blended_price_zar_per_mwh');

        // Pre-trade gate when the accept IS a trade.
        if (d.dispatch_is_trade) {
          const gate = await gateStateForAccept(c.env, user.id);
          const guard = evaluateOrder(
            {
              side: 'buy',
              energy_type: 'electricity',
              volume_mwh: Math.max(termSheetNumber(ts, 'offered_annual_mwh'), 1),
              price_zar_mwh: termSheetNumber(ts, 'blended_price_zar_per_mwh') || null,
              delivery_date: null,
            },
            snapshotForAccept(gate.status, dealValue, gate.market_access),
          );
          if (!guard.ok) {
            return c.json({ error: 'guard_rejected', reason_code: guard.reason_code, detail: guard.detail }, 409);
          }
        }

        const live = ts.availability === 'now';
        if (live) {
          const caseId = `deal_case_${uuid()}`;
          const chainKey = d.accept_dispatch.live.chain_key;
          await c.env.DB.prepare("UPDATE oe_deal_offers SET status = 'accepted', updated_at = datetime('now') WHERE id = ?")
            .bind(offerId).run();
          if (requestId) {
            await c.env.DB.prepare(
              `UPDATE oe_deal_requests SET selected_offer_id = ?, dispatched_chain_key = ?, dispatched_case_id = ?, status = 'dispatched', updated_at = datetime('now') WHERE id = ?`,
            ).bind(offerId, chainKey, caseId, requestId).run();
            await advanceObjective(c.env, d, requestId, offerId, user.id);
          }
          await fireCascade({
            event: 'deal.accepted',
            actor_id: user.id,
            entity_type: 'deal_offer',
            entity_id: offerId,
            chain_key: chainKey,
            data: { deal_type: d.deal_type, request_id: requestId ?? null, chain_key: chainKey, dispatched_case_id: caseId },
            commercial: { entity_value: dealValue, participant_id: user.id },
            env: c.env,
          });
          return c.json({ status: 'dispatched', dispatched_chain_key: chainKey, dispatched_case_id: caseId });
        }

        // upcoming → LOI draft
        if (!d.accept_dispatch.upcoming?.loi) {
          return c.json({ error: 'no_upcoming_dispatch' }, 409);
        }
        const loiId = `loi_${uuid()}`;
        const demandId = requestId
          ? (await c.env.DB.prepare('SELECT demand_id FROM oe_deal_requests WHERE id = ?').bind(requestId).first<{ demand_id: string }>())?.demand_id ?? user.id
          : user.id;
        await c.env.DB.prepare(
          `INSERT INTO loi_drafts (id, from_participant_id, to_participant_id, project_id, mix_json, status, annual_mwh, blended_price, created_at)
           VALUES (?, ?, ?, NULL, ?, 'drafted', ?, ?, datetime('now'))`,
        ).bind(
          loiId,
          demandId,
          offer.provider_id,
          JSON.stringify(ts),
          termSheetNumber(ts, 'offered_annual_mwh') || null,
          termSheetNumber(ts, 'blended_price_zar_per_mwh') || null,
        ).run();
        await c.env.DB.prepare("UPDATE oe_deal_offers SET status = 'accepted', updated_at = datetime('now') WHERE id = ?")
          .bind(offerId).run();
        if (requestId) {
          // Advance the request to the 'track' stage: an LOI is a chain-less
          // case, so we key the track link off the synthetic 'loi' chain and
          // point dispatched_case_id at the LOI id (the Deal Desk renders this
          // as "Open LOI" → /lois/:id; dealStage() needs dispatched_chain_key).
          await c.env.DB.prepare(
            `UPDATE oe_deal_requests SET selected_offer_id = ?, dispatched_chain_key = 'loi', dispatched_case_id = ?, status = 'dispatched', updated_at = datetime('now') WHERE id = ?`,
          ).bind(offerId, loiId, requestId).run();
          await advanceObjective(c.env, d, requestId, offerId, user.id);
        }
        await fireCascade({
          event: 'contract.created', actor_id: user.id, entity_type: 'loi_draft', entity_id: loiId,
          data: { source: 'deal_engine', deal_type: d.deal_type }, env: c.env,
        });
        await fireCascade({
          event: 'deal.accepted', actor_id: user.id, entity_type: 'deal_offer', entity_id: offerId,
          data: { deal_type: d.deal_type, request_id: requestId ?? null, loi_id: loiId },
          commercial: { entity_value: dealValue, participant_id: user.id }, env: c.env,
        });
        return c.json({ status: 'loi_drafted', loi_id: loiId });
      });
    }

    if (d.kind === 'auction') {
      if (!requestId) return c.json({ error: 'request_id required' }, 400);
      return await withLock(c.env, `deal:request:${requestId}`, user.id, async () => {
        const exists = await c.env.DB.prepare('SELECT 1 FROM oe_deal_requests WHERE id = ?')
          .bind(requestId).first();
        if (!exists) return c.json({ error: 'request_not_found' }, 404);
        const { clearedCount, spent } = await clearAuction(c.env, d, requestId, user.id);
        return c.json({ status: 'cleared', cleared_count: clearedCount, clearing_total_zar: spent });
      });
    }

    if (d.kind === 'syndication') {
      if (!requestId || !offerId) return c.json({ error: 'request_id and offer_id required' }, 400);
      return await withLock(c.env, `deal:request:${requestId}`, user.id, async () => {
        const reqRow = await c.env.DB.prepare('SELECT * FROM oe_deal_requests WHERE id = ?')
          .bind(requestId).first<{ target_amount_zar: number | null; filled_amount_zar: number | null }>();
        if (!reqRow) return c.json({ error: 'request_not_found' }, 404);
        const offer = await c.env.DB.prepare('SELECT * FROM oe_deal_offers WHERE id = ?')
          .bind(offerId).first<OfferRow>();
        if (!offer || !['published', 'open'].includes(offer.status)) {
          return c.json({ error: 'offer_unavailable' }, 409);
        }
        const target = reqRow.target_amount_zar ?? Infinity;
        const filled = reqRow.filled_amount_zar ?? 0;
        const commit = offer.committed_amount_zar ?? 0;
        if (filled + commit > target) {
          return c.json({ error: 'oversubscribed' }, 409);
        }
        const newFilled = filled + commit;
        await c.env.DB.prepare("UPDATE oe_deal_offers SET status = 'accepted', updated_at = datetime('now') WHERE id = ?")
          .bind(offerId).run();
        const filledStatus = newFilled >= target ? 'filled' : 'open';
        await c.env.DB.prepare(
          `UPDATE oe_deal_requests SET filled_amount_zar = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
        ).bind(newFilled, filledStatus, requestId).run();
        await fireCascade({
          event: 'deal.subscribed', actor_id: user.id, entity_type: 'deal_request', entity_id: requestId,
          data: { deal_type: d.deal_type, offer_id: offerId, filled_amount_zar: newFilled, target_amount_zar: target === Infinity ? null : target },
          commercial: { entity_value: commit, participant_id: user.id }, env: c.env,
        });
        await advanceObjective(c.env, d, requestId, offerId, user.id);
        return c.json({ status: filledStatus === 'filled' ? 'filled' : 'subscribed', filled_amount_zar: newFilled });
      });
    }

    return c.json({ error: 'unsupported_kind', detail: d.kind }, 400);
  } catch (e) {
    if (e instanceof LockBusyError) return c.json({ error: 'offer_unavailable' }, 409);
    throw e;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /:type/decline — set offer declined with a structured reason.
// (explainRejection wiring is a follow-up — it calls the AI binding, so Phase 1
//  stores a structured { code, detail } reason and leaves the AI explanation to
//  the surface layer that already has the AI binding wired.)
// ─────────────────────────────────────────────────────────────────────────────
deals.post('/:type/decline', async (c) => {
  const d = resolveDescriptor(c.req.param('type'));
  const user = getCurrentUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const offerId = body.offer_id as string | undefined;
  if (!offerId) return c.json({ error: 'offer_id required' }, 400);
  const reason = JSON.stringify({ code: 'declined_by_demand', detail: String(body.reason ?? '') });
  const res = await c.env.DB.prepare(
    `UPDATE oe_deal_offers SET status = 'declined', decline_reason = ?, updated_at = datetime('now')
      WHERE id = ? AND deal_type = ?`,
  ).bind(reason, offerId, d.deal_type).run();
  if (!res.meta?.changes) return c.json({ error: 'offer_not_found' }, 404);
  await fireCascade({
    event: 'deal.declined', actor_id: user.id, entity_type: 'deal_offer', entity_id: offerId,
    data: { deal_type: d.deal_type, reason }, env: c.env,
  });
  return c.json({ status: 'declined' });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. POST /objective — create a capital-stack objective.
// ─────────────────────────────────────────────────────────────────────────────
deals.post('/objective', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  if (typeof body.funding_target_zar !== 'number') return c.json({ error: 'funding_target_zar required' }, 400);
  const id = `deal_obj_${uuid()}`;
  await c.env.DB.prepare(
    `INSERT INTO oe_deal_objectives (id, owner_id, owner_role, tenant_id, project_ref, title, funding_target_zar, stack_plan, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'forming')`,
  ).bind(
    id, user.id, user.role, getTenantId(c),
    (body.project_ref as string) ?? null,
    String(body.title ?? 'Objective'),
    body.funding_target_zar,
    body.stack_plan ? JSON.stringify(body.stack_plan) : null,
  ).run();
  return c.json({ objective_id: id });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /objective/:oid/leg — link a request to an objective.
// ─────────────────────────────────────────────────────────────────────────────
deals.post('/objective/:oid/leg', async (c) => {
  const user = getCurrentUser(c);
  const oid = c.req.param('oid');
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const requestId = body.request_id as string | undefined;
  if (!requestId) return c.json({ error: 'request_id required' }, 400);

  // Tenant-fence the objective.
  const obj = await c.env.DB.prepare('SELECT tenant_id FROM oe_deal_objectives WHERE id = ?')
    .bind(oid).first<{ tenant_id: string }>();
  if (!obj) return c.json({ error: 'objective_not_found' }, 404);
  if (user.role !== 'admin' && obj.tenant_id !== getTenantId(c)) return c.json({ error: 'forbidden' }, 403);

  const res = await c.env.DB.prepare(
    `UPDATE oe_deal_requests SET objective_id = ?, updated_at = datetime('now') WHERE id = ?`,
  ).bind(oid, requestId).run();
  if (!res.meta?.changes) return c.json({ error: 'request_not_found' }, 404);
  return c.json({ status: 'linked', objective_id: oid, request_id: requestId });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET /objective/:oid — objective + its legs. Tenant-fenced.
// ─────────────────────────────────────────────────────────────────────────────
deals.get('/objective/:oid', async (c) => {
  const user = getCurrentUser(c);
  const oid = c.req.param('oid');
  const obj = await c.env.DB.prepare('SELECT * FROM oe_deal_objectives WHERE id = ?').bind(oid).first<Record<string, unknown> & { tenant_id: string }>();
  if (!obj) return c.json({ error: 'objective_not_found' }, 404);
  if (user.role !== 'admin' && obj.tenant_id !== getTenantId(c)) return c.json({ error: 'forbidden' }, 403);
  const legs = await c.env.DB.prepare('SELECT * FROM oe_deal_requests WHERE objective_id = ?').bind(oid).all<Record<string, unknown>>();
  return c.json({ objective: obj, legs: legs.results ?? [] });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. POST /link — create a deal link.
// ─────────────────────────────────────────────────────────────────────────────
deals.post('/link', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  if (!body.link_kind || !body.from_kind || !body.from_id || !body.to_kind || !body.to_id) {
    return c.json({ error: 'link_kind, from/to kind+id required' }, 400);
  }
  const id = `deal_link_${uuid()}`;
  await c.env.DB.prepare(
    `INSERT INTO oe_deal_links (id, tenant_id, link_kind, link_group_id, from_kind, from_id, to_kind, to_id, condition_state, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
  ).bind(
    id, getTenantId(c),
    String(body.link_kind),
    (body.link_group_id as string) ?? null,
    String(body.from_kind), String(body.from_id),
    String(body.to_kind), String(body.to_id),
    (body.condition_state as string) ?? null,
  ).run();
  await fireCascade({
    event: 'deal.link.created', actor_id: user.id, entity_type: 'deal_link', entity_id: id,
    data: { link_kind: body.link_kind, from_id: body.from_id, to_id: body.to_id }, env: c.env,
  });
  return c.json({ link_id: id });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. GET /link?from=&to=&group= — query links. Tenant-fenced.
// ─────────────────────────────────────────────────────────────────────────────
deals.get('/link', async (c) => {
  const tenant = getTenantId(c);
  const from = c.req.query('from');
  const to = c.req.query('to');
  const group = c.req.query('group');
  const where: string[] = [];
  const binds: string[] = [];
  if (getCurrentUser(c).role !== 'admin') { where.push('tenant_id = ?'); binds.push(tenant); }
  if (from) { where.push('from_id = ?'); binds.push(from); }
  if (to) { where.push('to_id = ?'); binds.push(to); }
  if (group) { where.push('link_group_id = ?'); binds.push(group); }
  const sql = `SELECT * FROM oe_deal_links${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  const res = await c.env.DB.prepare(sql).bind(...binds).all<any>();
  return c.json({ links: res.results ?? [] });
});

export default deals;
