// ═══════════════════════════════════════════════════════════════════════════
// Wave 54 — Offtaker PPA Payment Security / Credit Support Instrument chain
//
// Mounted at /api/payment-security/chain.
//
// The financial-assurance backbone of a bankable PPA. The BUYER (offtaker) must
// post and maintain a payment-security instrument (letter of credit, on-demand
// bank guarantee, or parent-company guarantee) sized to its rolling payment
// exposure; the SELLER (IPP beneficiary, or facility agent) verifies it,
// activates it, runs periodic adequacy review, draws down on a buyer payment
// default, forfeits an un-replenished instrument, and releases it at PPA term.
//
// The buyer-side credit-support counterpart to the seller-side bonds in W10. It
// secures payment under the W22 PPA at the W39 tariff; a drawdown is the security
// consequence of the buyer non-payment that W32 / W7 surface; lenders (W53 / W21)
// treat a maintained instrument as a condition of the debt facility.
//
// Frameworks: REIPPPP / bilateral PPA payment-security regime + NERSA Section 34
// PPA bankability + LMA-style credit-support terms.
//
// SLA matrix is URGENT — the larger the secured exposure, the TIGHTER every
// window. Reportability (the W54 signature):
//   - forfeit crosses the regulator for EVERY tier (a forfeited payment security
//     is a security-of-supply red flag at any scale)
//   - initiate_drawdown + reject_instrument cross for major + critical only
//   - sla_breached crosses for major + critical only
//
// Two-party split write: the offtaker (buyer) posts / re-posts the instrument
// (submit_instrument); the seller administers everything else. actor_party
// (offtaker / seller) is derived from the action, not the JWT role.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForSecurityZarM,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isLargeTier,
  isOfftakerAction,
  partyForAction,
  SLA_MINUTES,
  type PaymentSecurityStatus,
  type PaymentSecurityAction,
  type PaymentSecurityTier,
} from '../utils/payment-security-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'offtaker',
  'ipp_developer',
  'lender',
  'regulator',
]);

// Two-party split write. The offtaker (buyer) posts / re-posts the instrument
// (submit_instrument is the sole offtaker obligation); the seller side (IPP
// beneficiary / facility agent = ipp_developer) verifies, activates, runs
// adequacy review, draws down, forfeits and releases.
const OFFTAKER_WRITE_ROLES = new Set(['admin', 'support', 'offtaker']);
const SELLER_WRITE_ROLES   = new Set(['admin', 'support', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface PaymentSecurityRow {
  id: string;
  security_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  offtaker_party_id: string;
  offtaker_party_name: string;
  seller_party_name: string | null;
  agent_name: string | null;
  security_tier: PaymentSecurityTier;
  instrument_name: string;
  instrument_type: string | null;
  issuer_name: string | null;
  issuer_rating: string | null;
  secured_amount_zar_m: number | null;
  required_amount_zar_m: number | null;
  cover_months: number | null;
  ppa_id: string | null;
  ppa_reference: string | null;
  project_id: string | null;
  project_name: string | null;
  sector: string | null;
  expiry_date: string | null;
  drawn_amount_zar_m: number | null;
  outstanding_invoice_zar_m: number | null;
  replenishment_due_zar_m: number | null;
  adequacy_shortfall_zar_m: number | null;
  drawdown_count: number;
  submission_ref: string | null;
  verification_ref: string | null;
  activation_ref: string | null;
  adequacy_ref: string | null;
  drawdown_ref: string | null;
  replenishment_ref: string | null;
  expiry_ref: string | null;
  release_ref: string | null;
  forfeit_ref: string | null;
  reject_ref: string | null;
  regulator_ref: string | null;
  submission_basis: string | null;
  verification_basis: string | null;
  activation_basis: string | null;
  adequacy_basis: string | null;
  drawdown_basis: string | null;
  replenishment_basis: string | null;
  expiry_basis: string | null;
  release_basis: string | null;
  forfeit_basis: string | null;
  reason_code: string | null;
  decision_notes: string | null;
  notes: string | null;
  chain_status: PaymentSecurityStatus;
  security_required_at: string;
  instrument_submitted_at: string | null;
  under_verification_at: string | null;
  active_at: string | null;
  adequacy_review_at: string | null;
  drawdown_initiated_at: string | null;
  replenishment_pending_at: string | null;
  expiry_pending_at: string | null;
  substitution_pending_at: string | null;
  released_at: string | null;
  forfeited_at: string | null;
  rejected_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PaymentSecurityEventRow {
  id: string;
  security_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<PaymentSecurityStatus, keyof PaymentSecurityRow | null> = {
  security_required:     null,
  instrument_submitted:  'instrument_submitted_at',
  under_verification:    'under_verification_at',
  active:                'active_at',
  adequacy_review:       'adequacy_review_at',
  drawdown_initiated:    'drawdown_initiated_at',
  replenishment_pending: 'replenishment_pending_at',
  expiry_pending:        'expiry_pending_at',
  substitution_pending:  'substitution_pending_at',
  released:              'released_at',
  forfeited:             'forfeited_at',
  rejected:              'rejected_at',
};

function decorate(row: PaymentSecurityRow, now: Date) {
  const tier = row.security_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  // forfeit crosses at every tier; drawdown / reject crossings materialise at
  // the large tiers only (the reporting flag is set at the crossing itself).
  const isReportable =
    status === 'forfeited'
    || (status === 'drawdown_initiated' && isLargeTier(tier))
    || (status === 'rejected' && isLargeTier(tier));
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable: isReportable,
    is_large_tier: isLargeTier(tier),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: PaymentSecurityAction): string {
  switch (action) {
    case 'submit_instrument':    return 'payment_security.instrument_submitted';
    case 'begin_verification':   return 'payment_security.under_verification';
    case 'activate':             return 'payment_security.active';
    case 'reject_instrument':    return 'payment_security.rejected';
    case 'open_adequacy_review': return 'payment_security.adequacy_review';
    case 'confirm_adequate':     return 'payment_security.active';
    case 'require_increase':     return 'payment_security.substitution_pending';
    case 'initiate_drawdown':    return 'payment_security.drawdown_initiated';
    case 'open_replenishment':   return 'payment_security.replenishment_pending';
    case 'flag_expiry':          return 'payment_security.expiry_pending';
    case 'forfeit':              return 'payment_security.forfeited';
    case 'release':              return 'payment_security.released';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const security_tier     = c.req.query('security_tier');
  const status            = c.req.query('status');
  const breached          = c.req.query('breached');
  const offtaker_party_id = c.req.query('offtaker_party_id');
  const sector            = c.req.query('sector');

  let sql = 'SELECT * FROM oe_ppa_payment_securities WHERE 1=1';
  const binds: unknown[] = [];
  if (security_tier)     { sql += ' AND security_tier = ?';     binds.push(security_tier); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (offtaker_party_id) { sql += ' AND offtaker_party_id = ?'; binds.push(offtaker_party_id); }
  if (sector)            { sql += ' AND sector = ?';            binds.push(sector); }

  sql += ' ORDER BY datetime(security_required_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PaymentSecurityRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.security_tier]  = (by_tier[i.security_tier] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const active_count         = items.filter((i) => i.chain_status === 'active').length;
  const released_count       = items.filter((i) => i.chain_status === 'released').length;
  const forfeited_count      = items.filter((i) => i.chain_status === 'forfeited').length;
  const rejected_count       = items.filter((i) => i.chain_status === 'rejected').length;
  const drawdown_open_count  = items.filter((i) => i.chain_status === 'drawdown_initiated' || i.chain_status === 'replenishment_pending').length;
  const breached_count       = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total     = items.filter((i) => i.is_reportable).length;
  const large_exposure_open  = items.filter((i) => !i.is_terminal && i.is_large_tier).length;
  const total_secured_zar_m  = items.reduce((sum, i) => sum + (i.secured_amount_zar_m || 0), 0);
  const total_required_zar_m = items.reduce((sum, i) => sum + (i.required_amount_zar_m || 0), 0);
  const active_secured_zar_m = items
    .filter((i) => i.chain_status === 'active')
    .reduce((sum, i) => sum + (i.secured_amount_zar_m || 0), 0);
  const total_drawn_zar_m    = items.reduce((sum, i) => sum + (i.drawn_amount_zar_m || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      active_count,
      released_count,
      forfeited_count,
      rejected_count,
      drawdown_open_count,
      breached: breached_count,
      reportable_total,
      large_exposure_open,
      total_secured_zar_m,
      total_required_zar_m,
      active_secured_zar_m,
      total_drawn_zar_m,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_payment_securities WHERE id = ?').bind(id).first<PaymentSecurityRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ppa_payment_securities_events WHERE security_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PaymentSecurityEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface SubmitInstrumentBody {
  submission_ref?: string;
  submission_basis?: string;
  instrument_name?: string;
  instrument_type?: string;
  issuer_name?: string;
  issuer_rating?: string;
  secured_amount_zar_m?: number;
  required_amount_zar_m?: number;
  cover_months?: number;
  expiry_date?: string;
  notes?: string;
}

interface BeginVerificationBody {
  verification_ref?: string;
  verification_basis?: string;
  notes?: string;
}

interface ActivateBody {
  activation_ref?: string;
  activation_basis?: string;
  notes?: string;
}

interface RejectInstrumentBody {
  reject_ref?: string;
  verification_basis?: string;
  reason_code?: string;
  decision_notes?: string;
  regulator_ref?: string;
  notes?: string;
}

interface OpenAdequacyReviewBody {
  adequacy_ref?: string;
  adequacy_basis?: string;
  notes?: string;
}

interface ConfirmAdequateBody {
  adequacy_basis?: string;
  notes?: string;
}

interface RequireIncreaseBody {
  adequacy_basis?: string;
  adequacy_shortfall_zar_m?: number;
  required_amount_zar_m?: number;
  reason_code?: string;
  decision_notes?: string;
  notes?: string;
}

interface InitiateDrawdownBody {
  drawdown_ref?: string;
  drawdown_basis?: string;
  drawn_amount_zar_m?: number;
  outstanding_invoice_zar_m?: number;
  replenishment_due_zar_m?: number;
  regulator_ref?: string;
  notes?: string;
}

interface OpenReplenishmentBody {
  replenishment_ref?: string;
  replenishment_basis?: string;
  replenishment_due_zar_m?: number;
  notes?: string;
}

interface FlagExpiryBody {
  expiry_ref?: string;
  expiry_basis?: string;
  expiry_date?: string;
  notes?: string;
}

interface ForfeitBody {
  forfeit_ref?: string;
  forfeit_basis?: string;
  reason_code?: string;
  decision_notes?: string;
  regulator_ref?: string;
  notes?: string;
}

interface ReleaseBody {
  release_ref?: string;
  release_basis?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: PaymentSecurityAction,
  bodyHandler?: (row: PaymentSecurityRow, body: Record<string, unknown>) => Partial<PaymentSecurityRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isOfftakerAction(action) ? OFFTAKER_WRITE_ROLES : SELLER_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_payment_securities WHERE id = ?').bind(id).first<PaymentSecurityRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // A new instrument posting can change the secured amount (notably a
  // substitution = a bigger instrument) — re-derive the tier so SLA + crossings
  // track the live exposure rather than the originally-required cover.
  if (action === 'submit_instrument' && typeof overrides.secured_amount_zar_m === 'number') {
    overrides.security_tier = tierForSecurityZarM(overrides.secured_amount_zar_m);
  }
  // A drawdown is one call on the instrument — count it.
  if (action === 'initiate_drawdown') {
    overrides.drawdown_count = (row.drawdown_count || 0) + 1;
  }

  const effectiveTier = (overrides.security_tier ?? row.security_tier) as PaymentSecurityTier;

  const now = new Date();
  const nowIso = now.toISOString();
  const tsCol = TIMESTAMP_COLUMN[to];
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  // Reportability flag is set when the crossing actually materialises.
  if (crossesIntoRegulator(action, effectiveTier)) {
    overrides.is_reportable = 1;
  }

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_ppa_payment_securities SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `ps_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ppa_payment_securities_events (id, security_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'ppa_payment_security',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      action,
      security_tier: effectiveTier,
      crosses_into_regulator: crossesIntoRegulator(action, effectiveTier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ppa_payment_securities WHERE id = ?').bind(id).first<PaymentSecurityRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/submit-instrument', async (c) => transition(c, 'submit_instrument', (_row, body) => {
  const b = body as Partial<SubmitInstrumentBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.submission_ref === 'string')        out.submission_ref = b.submission_ref;
  if (typeof b.submission_basis === 'string')      out.submission_basis = b.submission_basis;
  if (typeof b.instrument_name === 'string')       out.instrument_name = b.instrument_name;
  if (typeof b.instrument_type === 'string')       out.instrument_type = b.instrument_type;
  if (typeof b.issuer_name === 'string')           out.issuer_name = b.issuer_name;
  if (typeof b.issuer_rating === 'string')         out.issuer_rating = b.issuer_rating;
  if (typeof b.secured_amount_zar_m === 'number')  out.secured_amount_zar_m = b.secured_amount_zar_m;
  if (typeof b.required_amount_zar_m === 'number') out.required_amount_zar_m = b.required_amount_zar_m;
  if (typeof b.cover_months === 'number')          out.cover_months = b.cover_months;
  if (typeof b.expiry_date === 'string')           out.expiry_date = b.expiry_date;
  return out;
}));

app.post('/:id/begin-verification', async (c) => transition(c, 'begin_verification', (_row, body) => {
  const b = body as Partial<BeginVerificationBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.verification_ref === 'string')   out.verification_ref = b.verification_ref;
  if (typeof b.verification_basis === 'string') out.verification_basis = b.verification_basis;
  return out;
}));

app.post('/:id/activate', async (c) => transition(c, 'activate', (_row, body) => {
  const b = body as Partial<ActivateBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.activation_ref === 'string')   out.activation_ref = b.activation_ref;
  if (typeof b.activation_basis === 'string') out.activation_basis = b.activation_basis;
  return out;
}));

app.post('/:id/reject-instrument', async (c) => transition(c, 'reject_instrument', (_row, body) => {
  const b = body as Partial<RejectInstrumentBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.reject_ref === 'string')          out.reject_ref = b.reject_ref;
  if (typeof b.verification_basis === 'string')  out.verification_basis = b.verification_basis;
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string')      out.decision_notes = b.decision_notes;
  if (typeof b.regulator_ref === 'string')       out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/open-adequacy-review', async (c) => transition(c, 'open_adequacy_review', (_row, body) => {
  const b = body as Partial<OpenAdequacyReviewBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.adequacy_ref === 'string')   out.adequacy_ref = b.adequacy_ref;
  if (typeof b.adequacy_basis === 'string') out.adequacy_basis = b.adequacy_basis;
  return out;
}));

app.post('/:id/confirm-adequate', async (c) => transition(c, 'confirm_adequate', (_row, body) => {
  const b = body as Partial<ConfirmAdequateBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.adequacy_basis === 'string') out.adequacy_basis = b.adequacy_basis;
  return out;
}));

app.post('/:id/require-increase', async (c) => transition(c, 'require_increase', (_row, body) => {
  const b = body as Partial<RequireIncreaseBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.adequacy_basis === 'string')            out.adequacy_basis = b.adequacy_basis;
  if (typeof b.adequacy_shortfall_zar_m === 'number')  out.adequacy_shortfall_zar_m = b.adequacy_shortfall_zar_m;
  if (typeof b.required_amount_zar_m === 'number')     out.required_amount_zar_m = b.required_amount_zar_m;
  if (typeof b.reason_code === 'string')               out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string')            out.decision_notes = b.decision_notes;
  return out;
}));

app.post('/:id/initiate-drawdown', async (c) => transition(c, 'initiate_drawdown', (_row, body) => {
  const b = body as Partial<InitiateDrawdownBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.drawdown_ref === 'string')               out.drawdown_ref = b.drawdown_ref;
  if (typeof b.drawdown_basis === 'string')             out.drawdown_basis = b.drawdown_basis;
  if (typeof b.drawn_amount_zar_m === 'number')         out.drawn_amount_zar_m = b.drawn_amount_zar_m;
  if (typeof b.outstanding_invoice_zar_m === 'number')  out.outstanding_invoice_zar_m = b.outstanding_invoice_zar_m;
  if (typeof b.replenishment_due_zar_m === 'number')    out.replenishment_due_zar_m = b.replenishment_due_zar_m;
  if (typeof b.regulator_ref === 'string')              out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/open-replenishment', async (c) => transition(c, 'open_replenishment', (_row, body) => {
  const b = body as Partial<OpenReplenishmentBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.replenishment_ref === 'string')         out.replenishment_ref = b.replenishment_ref;
  if (typeof b.replenishment_basis === 'string')       out.replenishment_basis = b.replenishment_basis;
  if (typeof b.replenishment_due_zar_m === 'number')   out.replenishment_due_zar_m = b.replenishment_due_zar_m;
  return out;
}));

app.post('/:id/flag-expiry', async (c) => transition(c, 'flag_expiry', (_row, body) => {
  const b = body as Partial<FlagExpiryBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.expiry_ref === 'string')   out.expiry_ref = b.expiry_ref;
  if (typeof b.expiry_basis === 'string') out.expiry_basis = b.expiry_basis;
  if (typeof b.expiry_date === 'string')  out.expiry_date = b.expiry_date;
  return out;
}));

app.post('/:id/forfeit', async (c) => transition(c, 'forfeit', (_row, body) => {
  const b = body as Partial<ForfeitBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.forfeit_ref === 'string')    out.forfeit_ref = b.forfeit_ref;
  if (typeof b.forfeit_basis === 'string')  out.forfeit_basis = b.forfeit_basis;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.decision_notes === 'string') out.decision_notes = b.decision_notes;
  if (typeof b.regulator_ref === 'string')  out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/release', async (c) => transition(c, 'release', (_row, body) => {
  const b = body as Partial<ReleaseBody>;
  const out: Partial<PaymentSecurityRow> = {};
  if (typeof b.release_ref === 'string')   out.release_ref = b.release_ref;
  if (typeof b.release_basis === 'string') out.release_basis = b.release_basis;
  return out;
}));

export async function paymentSecuritySlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ppa_payment_securities
     WHERE chain_status NOT IN ('released','forfeited','rejected')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<PaymentSecurityRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ppa_payment_securities
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ps_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ppa_payment_securities_events (id, security_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'payment_security.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.security_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.security_tier)) {
      await fireCascade({
        event: 'payment_security.sla_breached',
        actor_id: 'system',
        entity_type: 'ppa_payment_security',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_regulator: true,
        },
        env,
      });
    }

    breached++;
  }
  return { scanned: rows.length, breached };
}

export default app;
