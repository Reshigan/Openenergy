// ═══════════════════════════════════════════════════════════════════════════
// Wave 46 — Offtaker PPA Curtailment / Deemed-Energy Compensation chain
//
// Mounted at /api/curtailment-claim/chain.
//
// When the buyer or the System Operator curtails an AVAILABLE plant for economic,
// system-security, or grid-constraint reasons NOT attributable to the IPP, the PPA
// compensates the seller for "deemed energy": the MWh the plant WOULD have
// generated had it not been curtailed, valued at the PPA tariff. This is the
// SUPPLY-side mirror of W32 take-or-pay (a take-or-pay shortfall is the buyer
// failing to OFFTAKE contracted volume on the DEMAND side; a curtailment claim is
// the buyer/SO preventing the seller from DELIVERING energy it could produce).
//
// Settles against the W22 PPA at the W39-escalated tariff, triggered by the same
// dispatch / load-shed instructions that drive W34 (the SO's INSTRUCTION to shed;
// W46 is the buyer's deemed-energy COMPENSATION settlement that follows).
//
// Forward path + classification gate + dispute branch:
//   curtailment_logged → classification_review → claim_prepared
//     → claim_submitted → validation_underway → quantum_proposed
//     → quantum_agreed → compensation_settled                  (paid)
//   classification gate: classification_review → non_compensable (IPP-fault / FM / scheduled)
//   dispute: quantum_proposed|quantum_agreed → disputed
//            disputed → quantum_proposed (recalculate) / arbitrated (referred)
//   any active → withdrawn                                     (seller withdraws)
//
// Tiers (facility scale): utility_scale / commercial / embedded.
//
// SLA matrix is URGENT — utility_scale gets the TIGHTEST windows (a large IPP's
// debt service depends on the deemed-energy cash flow). Reportability:
//   - refer_arbitration crosses for EVERY tier (universal hard line)
//   - reject_non_compensable + settle_compensation cross for utility + commercial
//   - sla_breached crosses for utility + commercial only
//
// Seller-write split: the seller (IPP = ipp_developer) prepares + submits the
// claim, disputes the buyer's quantum, and may withdraw; the buyer (offtaker)
// classifies, validates, proposes/recalculates/agrees quantum, and settles; an
// arbitration referral moves the matter to the arbiter. actor_party (seller /
// buyer / arbiter) is derived from the action, not the JWT role.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportableTier,
  isSellerAction,
  partyForAction,
  SLA_MINUTES,
  type CurtailmentStatus,
  type CurtailmentAction,
  type CurtailmentTier,
} from '../utils/curtailment-claim-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'offtaker',
  'ipp_developer',
  'regulator',
]);

// Seller-write split. The seller side (the IPP / generator = ipp_developer)
// submits its claim, disputes the buyer's quantum, and may withdraw; the buyer
// side (offtaker / admin / support) classifies, validates, proposes / agrees
// quantum, settles, and refers to arbitration.
const BUYER_WRITE_ROLES  = new Set(['admin', 'support', 'offtaker']);
const SELLER_WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface CurtailmentRow {
  id: string;
  claim_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  seller_party_id: string;
  seller_party_name: string;
  buyer_party_name: string | null;
  arbiter_name: string | null;
  ppa_ref: string | null;
  facility_name: string;
  facility_tier: CurtailmentTier;
  contracted_capacity_mw: number | null;
  tariff_per_mwh: number | null;
  curtailment_type: string | null;
  curtailment_event: string | null;
  curtailment_hours: number | null;
  deemed_energy_mwh: number | null;
  claimed_amount: number | null;
  proposed_amount: number | null;
  agreed_amount: number | null;
  settled_amount: number | null;
  log_ref: string | null;
  classification_ref: string | null;
  claim_ref: string | null;
  validation_ref: string | null;
  quantum_ref: string | null;
  settlement_ref: string | null;
  dispute_ref: string | null;
  arbitration_ref: string | null;
  log_basis: string | null;
  classification_basis: string | null;
  claim_basis: string | null;
  validation_basis: string | null;
  quantum_basis: string | null;
  settlement_basis: string | null;
  dispute_basis: string | null;
  arbitration_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: CurtailmentStatus;
  curtailment_logged_at: string;
  classification_review_at: string | null;
  claim_prepared_at: string | null;
  claim_submitted_at: string | null;
  validation_underway_at: string | null;
  quantum_proposed_at: string | null;
  quantum_agreed_at: string | null;
  compensation_settled_at: string | null;
  disputed_at: string | null;
  arbitrated_at: string | null;
  non_compensable_at: string | null;
  withdrawn_at: string | null;
  dispute_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CurtailmentEventRow {
  id: string;
  claim_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<CurtailmentStatus, keyof CurtailmentRow | null> = {
  curtailment_logged:    null,
  classification_review: 'classification_review_at',
  claim_prepared:        'claim_prepared_at',
  claim_submitted:       'claim_submitted_at',
  validation_underway:   'validation_underway_at',
  quantum_proposed:      'quantum_proposed_at',
  quantum_agreed:        'quantum_agreed_at',
  compensation_settled:  'compensation_settled_at',
  disputed:              'disputed_at',
  arbitrated:            'arbitrated_at',
  non_compensable:       'non_compensable_at',
  withdrawn:             'withdrawn_at',
};

// Resolving actions that may touch the regulator (denied claim / settlement /
// arbitration referral), keyed by the status they land in.
const RESOLUTION_STATUS = new Set<CurtailmentStatus>([
  'non_compensable', 'compensation_settled', 'arbitrated',
]);

function decorate(row: CurtailmentRow, now: Date) {
  const tier = row.facility_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  // arbitrated crosses for every tier (universal hard line); a denied claim or a
  // settlement crosses only for the reportable tiers.
  const isReportable = status === 'arbitrated'
    || (RESOLUTION_STATUS.has(status) && isReportableTier(tier));
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable: isReportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(to: CurtailmentStatus): string {
  // recalculate re-loops back to quantum_proposed; everything else maps 1:1 to
  // its landing status. The event name is derived from the landing status.
  return `curtailment_claim.${to}`;
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const facility_tier    = c.req.query('facility_tier');
  const status           = c.req.query('status');
  const breached         = c.req.query('breached');
  const seller_party_id  = c.req.query('seller_party_id');
  const curtailment_type = c.req.query('curtailment_type');

  let sql = 'SELECT * FROM oe_curtailment_claims WHERE 1=1';
  const binds: unknown[] = [];
  if (facility_tier)    { sql += ' AND facility_tier = ?';    binds.push(facility_tier); }
  if (status)           { sql += ' AND chain_status = ?';     binds.push(status); }
  if (seller_party_id)  { sql += ' AND seller_party_id = ?';  binds.push(seller_party_id); }
  if (curtailment_type) { sql += ' AND curtailment_type = ?'; binds.push(curtailment_type); }

  sql += ' ORDER BY datetime(curtailment_logged_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<CurtailmentRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.facility_tier]  = (by_tier[i.facility_tier] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const settled_count       = items.filter((i) => i.chain_status === 'compensation_settled').length;
  const non_compensable_count = items.filter((i) => i.chain_status === 'non_compensable').length;
  const arbitrated_count    = items.filter((i) => i.chain_status === 'arbitrated').length;
  const withdrawn_count     = items.filter((i) => i.chain_status === 'withdrawn').length;
  const disputed_count      = items.filter((i) => i.chain_status === 'disputed').length;
  const breached_count      = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable).length;
  const utility_open        = items.filter((i) => !i.is_terminal && i.facility_tier === 'utility_scale').length;
  const total_claimed       = items.reduce((sum, i) => sum + (i.claimed_amount || 0), 0);
  const total_proposed      = items.reduce((sum, i) => sum + (i.proposed_amount || 0), 0);
  const total_agreed        = items.reduce((sum, i) => sum + (i.agreed_amount || 0), 0);
  const total_settled       = items.reduce((sum, i) => sum + (i.settled_amount || 0), 0);
  const total_deemed_mwh    = items.reduce((sum, i) => sum + (i.deemed_energy_mwh || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      settled_count,
      non_compensable_count,
      arbitrated_count,
      withdrawn_count,
      disputed_count,
      breached: breached_count,
      reportable_total,
      utility_open,
      total_claimed,
      total_proposed,
      total_agreed,
      total_settled,
      total_deemed_mwh,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_curtailment_claims WHERE id = ?').bind(id).first<CurtailmentRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_curtailment_claims_events WHERE claim_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<CurtailmentEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ClassifyBody {
  classification_ref?: string;
  classification_basis?: string;
  curtailment_type?: string;
  curtailment_event?: string;
  notes?: string;
}

interface ConfirmBody {
  classification_basis?: string;
  notes?: string;
}

interface RejectBody {
  classification_basis?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface SubmitBody {
  claim_ref?: string;
  claim_basis?: string;
  deemed_energy_mwh?: number;
  claimed_amount?: number;
  notes?: string;
}

interface ValidateBody {
  validation_ref?: string;
  validation_basis?: string;
  notes?: string;
}

interface ProposeBody {
  quantum_ref?: string;
  quantum_basis?: string;
  proposed_amount?: number;
  notes?: string;
}

interface AgreeBody {
  quantum_basis?: string;
  agreed_amount?: number;
  notes?: string;
}

interface SettleBody {
  settlement_ref?: string;
  settlement_basis?: string;
  settled_amount?: number;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface DisputeBody {
  dispute_ref?: string;
  dispute_basis?: string;
  notes?: string;
}

interface ArbitrationBody {
  arbitration_ref?: string;
  arbitration_basis?: string;
  arbiter_name?: string;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface WithdrawBody {
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: CurtailmentAction,
  bodyHandler?: (row: CurtailmentRow, body: Record<string, unknown>) => Partial<CurtailmentRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isSellerAction(action) ? SELLER_WRITE_ROLES : BUYER_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_curtailment_claims WHERE id = ?').bind(id).first<CurtailmentRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, row.facility_tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // A dispute re-loop (recalculate / dispute) bumps the dispute round.
  if (action === 'dispute' || action === 'recalculate') {
    overrides.dispute_round = (row.dispute_round || 0) + 1;
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
    `UPDATE oe_curtailment_claims SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cclaim_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(to),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = eventTypeFor(to) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'curtailment_claim',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crossesIntoRegulator(action, row.facility_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_curtailment_claims WHERE id = ?').bind(id).first<CurtailmentRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-classification', async (c) => transition(c, 'begin_classification', (_row, body) => {
  const b = body as Partial<ClassifyBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.classification_ref === 'string')   out.classification_ref = b.classification_ref;
  if (typeof b.classification_basis === 'string') out.classification_basis = b.classification_basis;
  if (typeof b.curtailment_type === 'string')     out.curtailment_type = b.curtailment_type;
  if (typeof b.curtailment_event === 'string')    out.curtailment_event = b.curtailment_event;
  return out;
}));

app.post('/:id/confirm-compensable', async (c) => transition(c, 'confirm_compensable', (_row, body) => {
  const b = body as Partial<ConfirmBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.classification_basis === 'string') out.classification_basis = b.classification_basis;
  return out;
}));

app.post('/:id/reject-non-compensable', async (c) => transition(c, 'reject_non_compensable', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.classification_basis === 'string') out.classification_basis = b.classification_basis;
  if (typeof b.reason_code === 'string')          out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')            out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/submit-claim', async (c) => transition(c, 'submit_claim', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.claim_ref === 'string')          out.claim_ref = b.claim_ref;
  if (typeof b.claim_basis === 'string')        out.claim_basis = b.claim_basis;
  if (typeof b.deemed_energy_mwh === 'number')  out.deemed_energy_mwh = b.deemed_energy_mwh;
  if (typeof b.claimed_amount === 'number')     out.claimed_amount = b.claimed_amount;
  return out;
}));

app.post('/:id/begin-validation', async (c) => transition(c, 'begin_validation', (_row, body) => {
  const b = body as Partial<ValidateBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.validation_ref === 'string')   out.validation_ref = b.validation_ref;
  if (typeof b.validation_basis === 'string') out.validation_basis = b.validation_basis;
  return out;
}));

app.post('/:id/propose-quantum', async (c) => transition(c, 'propose_quantum', (_row, body) => {
  const b = body as Partial<ProposeBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.quantum_ref === 'string')      out.quantum_ref = b.quantum_ref;
  if (typeof b.quantum_basis === 'string')    out.quantum_basis = b.quantum_basis;
  if (typeof b.proposed_amount === 'number')  out.proposed_amount = b.proposed_amount;
  return out;
}));

app.post('/:id/agree-quantum', async (c) => transition(c, 'agree_quantum', (_row, body) => {
  const b = body as Partial<AgreeBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.quantum_basis === 'string')   out.quantum_basis = b.quantum_basis;
  if (typeof b.agreed_amount === 'number')   out.agreed_amount = b.agreed_amount;
  return out;
}));

app.post('/:id/settle-compensation', async (c) => transition(c, 'settle_compensation', (_row, body) => {
  const b = body as Partial<SettleBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.settlement_ref === 'string')   out.settlement_ref = b.settlement_ref;
  if (typeof b.settlement_basis === 'string') out.settlement_basis = b.settlement_basis;
  if (typeof b.settled_amount === 'number')   out.settled_amount = b.settled_amount;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')        out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/dispute', async (c) => transition(c, 'dispute', (_row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.dispute_ref === 'string')   out.dispute_ref = b.dispute_ref;
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  return out;
}));

app.post('/:id/recalculate', async (c) => transition(c, 'recalculate', (_row, body) => {
  const b = body as Partial<ProposeBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.quantum_ref === 'string')      out.quantum_ref = b.quantum_ref;
  if (typeof b.quantum_basis === 'string')    out.quantum_basis = b.quantum_basis;
  if (typeof b.proposed_amount === 'number')  out.proposed_amount = b.proposed_amount;
  return out;
}));

app.post('/:id/refer-arbitration', async (c) => transition(c, 'refer_arbitration', (_row, body) => {
  const b = body as Partial<ArbitrationBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.arbitration_ref === 'string')   out.arbitration_ref = b.arbitration_ref;
  if (typeof b.arbitration_basis === 'string') out.arbitration_basis = b.arbitration_basis;
  if (typeof b.arbiter_name === 'string')      out.arbiter_name = b.arbiter_name;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')         out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<CurtailmentRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

export async function curtailmentClaimSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_curtailment_claims
     WHERE chain_status NOT IN ('compensation_settled','arbitrated','non_compensable','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<CurtailmentRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_curtailment_claims
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `cclaim_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'curtailment_claim.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.facility_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.facility_tier)) {
      await fireCascade({
        event: 'curtailment_claim.sla_breached',
        actor_id: 'system',
        entity_type: 'curtailment_claim',
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
