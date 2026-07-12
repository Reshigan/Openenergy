// ═══════════════════════════════════════════════════════════════════════════
// /api/v2 — HTTP layer over the v2 domain engine.
//
// This module is a thin ADAPTER: it authenticates, maps the request user to an
// engine Actor, builds EngineDeps per request, and calls applyTransition /
// exportPack / sealPendingEvents. All state-machine authority, hashing, and
// settlement-honesty live in src/v2/domain/** — nothing here recomputes them.
//
// The domain purity ban (no Date.now / new Date / Math.random) applies only
// inside src/v2/domain/**. This is the adapter layer, so Date.now() is fine and
// is exactly where the injected Clock gets its wall time.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, type Context } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';

import { applyTransition, type EngineDeps } from '../v2/domain/engine';
import type { Actor, Clock, Command, IdSource, Json, ExportQuery } from '../v2/domain/types';
import { ConstraintViolation } from '../v2/domain/types';
import { ppaContract } from '../v2/domain/chains/ppa_contract';
import { drawdown } from '../v2/domain/chains/drawdown';
import { carbonRetirement } from '../v2/domain/chains/carbon_retirement';
import { licenceApplication } from '../v2/domain/chains/licence_application';
import { wo } from '../v2/domain/chains/wo';
import { permitToWork } from '../v2/domain/chains/permit_to_work';
import { algoCert } from '../v2/domain/chains/algo_cert';
import { bestExecution } from '../v2/domain/chains/best_execution';
import { capitalAdequacyReturn } from '../v2/domain/chains/capital_adequacy';
import { ccpAssessment } from '../v2/domain/chains/ccp_assessment';
import { counterpartyMargin } from '../v2/domain/chains/counterparty_margin';
import { creditInsurance } from '../v2/domain/chains/credit_insurance';
import { crossBorderTrade } from '../v2/domain/chains/cross_border_trade';
import { fscaCompliance } from '../v2/domain/chains/fsca_compliance';
import { fscaConductReport } from '../v2/domain/chains/fsca_conduct_report';
import { isdaAgreement } from '../v2/domain/chains/isda_agreement';
import { marketAbuse } from '../v2/domain/chains/market_abuse';
import { marketConductExam } from '../v2/domain/chains/market_conduct_exam';
import { ppaAnnualRecon } from '../v2/domain/chains/ppa_annual_recon';
import { ppaChangeInLaw } from '../v2/domain/chains/ppa_change_in_law';
import { settlementFail } from '../v2/domain/chains/settlement_fail';
import { tradeAllocation } from '../v2/domain/chains/trade_allocation';
import { tradeReporting } from '../v2/domain/chains/trade_reporting';
import { GUARDS } from '../v2/domain/guards/registry';
import { exportPack } from '../v2/domain/export';
import { sealPendingEvents } from '../v2/domain/merkle-seal';
// D1Store is authored in a parallel workstream (src/v2/store/d1.ts). Until it
// lands, tsc reports "cannot find module '../v2/store/d1'" — that error is
// EXPECTED-pending-integration, not a defect in this file.
import { D1Store } from '../v2/store/d1';

const v2 = new Hono<HonoEnv>();
v2.use('*', authMiddleware);

// Operator-class roles: platform staff / regulator who see across parties.
// ponytail: hard-coded set; move to an rbac table if the role list churns.
const OPERATOR_ROLES = ['admin', 'operator', 'regulator', 'support'];

// The chain registry lives inline in deps, chains-as-data. More chains get
// added to this Record as they are transcribed; there is no separate registry
// file by design.
const CHAINS = {
  ppa_contract: ppaContract,
  drawdown,
  carbon_retirement: carbonRetirement,
  licence_application: licenceApplication,
  wo,
  permit_to_work: permitToWork,
  algo_cert: algoCert,
  best_execution: bestExecution,
  capital_adequacy: capitalAdequacyReturn,
  ccp_assessment: ccpAssessment,
  counterparty_margin: counterpartyMargin,
  credit_insurance: creditInsurance,
  cross_border_trade: crossBorderTrade,
  fsca_compliance: fscaCompliance,
  fsca_conduct_report: fscaConductReport,
  isda_agreement: isdaAgreement,
  market_abuse: marketAbuse,
  market_conduct_exam: marketConductExam,
  ppa_annual_recon: ppaAnnualRecon,
  ppa_change_in_law: ppaChangeInLaw,
  settlement_fail: settlementFail,
  trade_allocation: tradeAllocation,
  trade_reporting: tradeReporting,
};

const clock: Clock = { now: () => ({ epoch_ms: Date.now(), zone: 'UTC' }) };
const ids: IdSource = { uuid: () => crypto.randomUUID() };

/** Build EngineDeps for one request. Store is per-request (bound to c.env.DB). */
function buildDeps(c: Context<HonoEnv>): EngineDeps {
  return { store: new D1Store(c.env.DB), clock, ids, chains: CHAINS, guards: GUARDS };
}

/** Map the authenticated user to the engine Actor.
 *  The JWT `sub` IS the participant_id (see JWTPayload in utils/types.ts), so
 *  user.id doubles as the participant. Delegation (on_behalf_of) is not modelled
 *  in the auth context, so it is always null here. */
function actorOf(user: ReturnType<typeof getCurrentUser>): Actor {
  return { id: user.id, kind: 'user', participant_id: user.id, on_behalf_of: null };
}

/** Result.code → HTTP status. Guard/domain rejections (SELF_DEALING, etc.)
 *  fall through to 422 carrying their own code in the body. */
function httpStatus(code: string): 400 | 403 | 404 | 409 | 422 | 500 {
  switch (code) {
    case 'BAD_INPUT':
    case 'UNKNOWN_EDGE':
      return 400;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'STALE':
    case 'CONFLICT':
    case 'CONTENTION':
    case 'ILLEGAL_TRANSITION':
      return 409;
    case 'INTERNAL':
      return 500;
    default:
      return 422;
  }
}

/** Run applyTransition and translate the outcome to an HTTP response.
 *  - ok            → 200
 *  - {ok:false}    → httpStatus(code) (400 bad input, 409 concurrency, 422 guard, …)
 *  - ConstraintViolation thrown → 409 (txn_seq / idempotency_key races the engine
 *    did not absorb)
 *  - any other throw → 500, log-shape only (never leak internals to the client). */
async function runCommand(c: Context<HonoEnv>, cmd: Command, extra?: Record<string, Json>) {
  try {
    const result = await applyTransition(cmd, buildDeps(c));
    const status = result.ok ? 200 : httpStatus(result.code);
    return c.json({ ...extra, ...result }, status);
  } catch (e) {
    if (e instanceof ConstraintViolation) {
      return c.json({ ...extra, ok: false, code: 'CONFLICT', constraint: e.constraint }, 409);
    }
    console.error('v2.applyTransition unexpected error', { edge: cmd.edge, chain: cmd.chain_key, name: (e as Error)?.name });
    return c.json({ ok: false, code: 'INTERNAL', message: 'internal error' }, 500);
  }
}

// ── POST /txn — initiate a chain (the @new edge) ────────────────────────────
// Body: { chain_key, edge, input, idempotency_key, reason_code?, reason_text? }
// The txn id is generated server-side and returned so the client can address
// the new txn. expected_seq is fixed to { [new_id]: -1 } (the initiating token).
v2.post('/txn', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.chain_key !== 'string' || typeof body.edge !== 'string' || typeof body.idempotency_key !== 'string') {
    return c.json({ ok: false, code: 'BAD_INPUT', message: 'chain_key, edge, idempotency_key are required' }, 400);
  }

  const txn_id = ids.uuid();
  const cmd: Command = {
    txn_id,
    chain_key: body.chain_key,
    edge: body.edge,
    actor: actorOf(user),
    input: (body.input ?? {}) as Record<string, Json>,
    expected_seq: { [txn_id]: -1 },
    idempotency_key: body.idempotency_key,
    reason_code: body.reason_code,
    reason_text: body.reason_text,
  };
  return runCommand(c, cmd, { txn_id });
});

// ── POST /txn/:id/act — advance an existing txn ─────────────────────────────
// Body: { chain_key, edge, input, expected_seq?, idempotency_key, reason_code?, reason_text? }
// expected_seq may be a number (the txn's seq token) or a full {[id]:seq} map.
// When omitted, the current seq is read from the store as the optimistic token.
v2.post('/txn/:id/act', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.chain_key !== 'string' || typeof body.edge !== 'string' || typeof body.idempotency_key !== 'string') {
    return c.json({ ok: false, code: 'BAD_INPUT', message: 'chain_key, edge, idempotency_key are required' }, 400);
  }

  // Resolve the optimistic-concurrency token.
  let expected_seq: Record<string, number>;
  if (typeof body.expected_seq === 'number') {
    expected_seq = { [id]: body.expected_seq };
  } else if (body.expected_seq && typeof body.expected_seq === 'object') {
    expected_seq = body.expected_seq as Record<string, number>;
  } else {
    const bundle = await buildDeps(c).store.getTxn(id);
    if (!bundle) return c.json({ ok: false, code: 'NOT_FOUND', message: `txn ${id} not found` }, 404);
    expected_seq = { [id]: bundle.txn.seq };
  }

  const cmd: Command = {
    txn_id: id,
    chain_key: body.chain_key,
    edge: body.edge,
    actor: actorOf(user),
    input: (body.input ?? {}) as Record<string, Json>,
    expected_seq,
    idempotency_key: body.idempotency_key,
    reason_code: body.reason_code,
    reason_text: body.reason_text,
  };
  return runCommand(c, cmd);
});

// ── GET /txn/:id — read a txn + its parties + event log ─────────────────────
// Visibility: operator-class roles see any txn; otherwise the caller must be a
// live party, or the chain must be publicly visible.
// ponytail: 'owner' visibility should narrow to the owner-role party only; here
// it is gated to party-or-operator. Tighten when a chain declares owner
// visibility and the owner role is distinguished from other parties.
v2.get('/txn/:id', async (c) => {
  const user = getCurrentUser(c);
  const bundle = await buildDeps(c).store.getTxn(c.req.param('id'));
  if (!bundle) return c.json({ success: false, error: 'not found' }, 404);

  const isOperator = OPERATOR_ROLES.includes(user.role);
  const isParty = bundle.parties.some((p) => p.until_event_id === null && p.participant_id === user.id);
  const isPublic = bundle.txn.visibility === 'public';
  if (!isOperator && !isParty && !isPublic) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }

  return c.json({ success: true, data: bundle });
});

// ── GET /export — L6 regulator export pack (pure read over the event log) ────
// Query: ?chain_keys=a,b&from=<iso>&to=<iso>&participant_ids=x,y
// Non-operator callers are scoped to their own participant id, so the export
// can never leak another party's log. The custody notice for settles:false
// chains is stamped inside exportPack and passed straight through — never
// stripped or altered here.
v2.get('/export', async (c) => {
  const user = getCurrentUser(c);
  const csv = (s: string | undefined) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

  const chain_keys = csv(c.req.query('chain_keys'));
  if (chain_keys.length === 0) {
    return c.json({ success: false, error: 'chain_keys is required' }, 400);
  }
  const unknown = chain_keys.filter((k) => !(k in CHAINS));
  if (unknown.length) {
    return c.json({ success: false, error: `unknown chain_keys: ${unknown.join(',')}` }, 400);
  }

  const isOperator = OPERATOR_ROLES.includes(user.role);
  // Honest visibility gate: non-operators may only export their own party's log.
  // ponytail: no party-scoped multi-participant export yet; add when a caller
  // legitimately needs several participants they are a party to.
  const participant_ids = isOperator ? csv(c.req.query('participant_ids')) : [user.id];

  const query: ExportQuery = {
    chain_keys,
    from: c.req.query('from') || undefined,
    to: c.req.query('to') || undefined,
    participant_ids: participant_ids.length ? participant_ids : undefined,
  };

  const pack = await exportPack(query, {
    store: buildDeps(c).store,
    chains: CHAINS,
    generated_at: new Date().toISOString(),
    generated_by: user.id,
  });
  return c.json(pack);
  // ponytail: no export pagination — a single query returns the full window.
  // Add cursor/limit when a real regulator pull exceeds the response budget.
});

// ── POST /seal — manual/dev trigger of the nightly merkle seal ──────────────
// Gated to admin/operator. The nightly cron calls sealPendingEvents directly;
// this is the manual seam. Returns the new root row, or { sealed: null } when
// there is nothing pending.
v2.post('/seal', async (c) => {
  const user = getCurrentUser(c);
  if (!['admin', 'operator'].includes(user.role)) {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const row = await sealPendingEvents(buildDeps(c).store, clock);
  return c.json({ sealed: row });
});

export default v2;
