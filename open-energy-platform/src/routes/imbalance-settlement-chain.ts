// ═══════════════════════════════════════════════════════════════════════════
// Wave 105 — Grid Wholesale Imbalance Settlement & MTU Pricing Chain (P6).
// 10th Grid chain. Mounted at /api/grid/imbalance-settlement/chain.
//
// The financial settlement engine of the SO balancing mechanism. Sister
// of W13 dispatch nominations (the PRE side — nominated MWh per MTU) and
// W50 reserve activation (the SUPPLY side — instantaneous reserve
// products). W105 is the post-fact per-MTU settlement: actual vs
// nominated imbalance MWh × imbalance price × penalty multiplier, posted
// to BRPs, with dispute-window, settled.
//
// DISTINCTIVE move (beats PJM iMM / ERCOT QSE / CAISO / NEM AEMO /
// Nord Pool / ENTSO-E / National Grid ESO BSC / Hitachi Lumada /
// OATI / Powel Pulse — every one of these surfaces imbalance settlement
// as an after-the-fact CSV dump + dispute mailbox): LIVE battery on every
// row (imbalance direction, charge, penalty, total owed, completeness 0-130,
// urgency band, breach imminent flag, days to dispute window close,
// authority required ladder, regulator filing window hours, bridges to W13
// dispatch chain + W50 reserve chain, aged arrears bucket).
//
// Write {admin, grid_operator}. READ all 9 personas. actor_party derived
// from action: system_operator / settlement_admin / brp / reviewer /
// archiver.
//
// Reportability — W105 SIGNATURE crossings:
//   raise_dispute   crosses regulator EVERY tier when high_voltage_brp=TRUE
//                   (HV-imbalance disputes always reportable — W105 signature).
//   mark_settled    crosses regulator on material + systemic when
//                   penalty_zar > 0.
//   aged_arrears    crosses regulator EVERY tier when arrears_days >= 60
//                   (default risk to settlement system).
//   cancel_period   crosses regulator EVERY tier when imbalance_mwh != 0
//                   (cancellation with non-zero position is reportable).
//   sla_breached    crosses material + systemic.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaDeadlineFor,
  tierForQuantum,
  effectiveTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  imbalanceDirection,
  imbalancePriceApplied,
  imbalanceChargeZar,
  penaltyZar,
  totalOwedZar,
  settlementCompletenessIndex,
  slaDaysRemaining,
  urgencyBand,
  breachImminentFlag,
  daysToDisputeWindowClose,
  authorityRequired,
  regulatorFilingWindowHours,
  bridgesToDispatchChain,
  bridgesToReserveActivationChain,
  agedArrearsBucket,
  SLA_MINUTES,
  type ImbStatus,
  type ImbAction,
  type ImbTier,
} from '../utils/imbalance-settlement-spec';

const READ_ROLES = new Set([
  'admin', 'grid_operator',
  'ipp_developer', 'offtaker', 'trader', 'regulator', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'grid_operator']);

interface ImbRow {
  id: string;
  settlement_number: string;
  brp_id: string;
  brp_label: string | null;
  brp_voltage_class: string | null;
  market_zone: string | null;
  market_time_unit_minutes: number;
  settlement_period_start_at: string;
  settlement_period_end_at: string;
  nominated_mwh: number;
  metered_mwh: number;
  imbalance_mwh: number;
  imbalance_direction: string | null;
  long_price_zar_per_mwh: number;
  short_price_zar_per_mwh: number;
  price_applied_zar_per_mwh: number;
  penalty_multiplier: number;
  imbalance_charge_zar: number;
  penalty_zar: number;
  total_owed_zar: number;
  amount_paid_zar: number;
  amount_outstanding_zar: number;
  imbalance_quantum_zar: number;
  dispatch_nomination_ref: string | null;
  reserve_activation_ref: string | null;
  invoice_number: string | null;
  invoice_issued_at: string | null;
  invoice_due_at: string | null;
  invoice_revised_count: number;
  dispute_window_close_at: string | null;
  dispute_reason_code: string | null;
  dispute_narrative: string | null;
  dispute_resolution_text: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_received_at: string | null;
  arrears_days: number;
  arrears_bucket: string | null;
  aged_arrears_at: string | null;
  imbalance_floor_flag_high_voltage_brp: number;
  imbalance_floor_flag_system_critical_period: number;
  imbalance_floor_flag_regulator_audit_period: number;
  imbalance_floor_flag_market_suspension_active: number;
  imbalance_floor_flag_repeated_breach_5plus: number;
  current_tier: ImbTier;
  authority_required: string | null;
  urgency_band: string | null;
  title: string | null;
  narrative: string | null;
  cancel_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  chain_status: ImbStatus;
  period_opened_at: string | null;
  meter_data_received_at: string | null;
  nominations_reconciled_at: string | null;
  imbalance_computed_at: string | null;
  priced_at: string | null;
  invoice_acknowledged_at: string | null;
  dispute_window_opened_at: string | null;
  disputed_at: string | null;
  resolved_dispute_at: string | null;
  invoice_revised_at: string | null;
  payment_pending_at: string | null;
  settled_at: string | null;
  archived_at: string | null;
  cancelled_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ImbEventRow {
  id: string;
  settlement_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ImbStatus, keyof ImbRow | null> = {
  period_open:            'period_opened_at',
  meter_data_received:    'meter_data_received_at',
  nominations_reconciled: 'nominations_reconciled_at',
  imbalance_computed:     'imbalance_computed_at',
  priced:                 'priced_at',
  invoice_issued:         'invoice_issued_at',
  invoice_acknowledged:   'invoice_acknowledged_at',
  dispute_window_open:    'dispute_window_opened_at',
  disputed:               'disputed_at',
  resolved_dispute:       'resolved_dispute_at',
  invoice_revised:        'invoice_revised_at',
  payment_pending:        'payment_pending_at',
  settled:                'settled_at',
  archived:               'archived_at',
  cancelled:              'cancelled_at',
  aged_arrears:           'aged_arrears_at',
};

function statusEnteredAt(row: ImbRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.period_opened_at ? new Date(row.period_opened_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.period_opened_at ? new Date(row.period_opened_at) : null);
}

function arrearsDaysSince(invoiceDueAt: string | null, paymentReceivedAt: string | null, now: Date): number {
  if (!invoiceDueAt) return 0;
  if (paymentReceivedAt) return 0;
  const due = new Date(invoiceDueAt);
  if (isNaN(due.getTime())) return 0;
  const ms = now.getTime() - due.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (24 * 3600 * 1000));
}

function decorate(row: ImbRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const direction = imbalanceDirection(row.imbalance_mwh);
  const priceApplied = imbalancePriceApplied(direction, row.long_price_zar_per_mwh, row.short_price_zar_per_mwh);
  const chargeZar = imbalanceChargeZar(row.imbalance_mwh, priceApplied);
  const pen = penaltyZar(chargeZar, row.penalty_multiplier);
  const owed = totalOwedZar(chargeZar, pen);
  const arrears = arrearsDaysSince(row.invoice_due_at, row.payment_received_at, now);
  const arrearsBucketLive = agedArrearsBucket(arrears);

  const completeness = settlementCompletenessIndex({
    meter_data_received:       !!row.meter_data_received_at,
    nominations_reconciled:    !!row.nominations_reconciled_at,
    imbalance_computed:        !!row.imbalance_computed_at,
    priced:                    !!row.priced_at,
    invoice_issued:            !!row.invoice_issued_at,
    invoice_acknowledged:      !!row.invoice_acknowledged_at,
    dispute_resolved_or_skip:  !!row.resolved_dispute_at || !row.disputed_at,
    payment_received:          !!row.payment_received_at,
    archived:                  !!row.archived_at,
    first_cycle_settle_bonus:  (row.invoice_revised_count || 0) === 0 && !!row.settled_at,
    no_aged_arrears_bonus:     !row.aged_arrears_at && arrears === 0,
  });

  const entered = statusEnteredAt(row);
  const slaLeft = slaDaysRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaLeft);
  const authority = authorityRequired(tier);
  const breachImminent = breachImminentFlag(slaLeft);
  const regFilingHours = regulatorFilingWindowHours(tier);
  const daysToDisputeClose = daysToDisputeWindowClose(row.dispute_window_close_at, now);

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    imbalance_direction_live: direction,
    price_applied_zar_per_mwh_live: priceApplied,
    imbalance_charge_zar_live: chargeZar,
    penalty_zar_live: pen,
    total_owed_zar_live: owed,
    arrears_days_live: arrears,
    arrears_bucket_live: arrearsBucketLive,
    settlement_completeness_index_live: completeness,
    sla_days_remaining_live: slaLeft,
    urgency_band_live: urgency,
    breach_imminent_flag_live: breachImminent,
    regulator_filing_window_hours_live: regFilingHours,
    authority_required_live: authority,
    days_to_dispute_window_close_live: daysToDisputeClose,
    bridges_to_dispatch_chain_live: bridgesToDispatchChain(row.dispatch_nomination_ref),
    bridges_to_reserve_activation_chain_live: bridgesToReserveActivationChain(row.reserve_activation_ref),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier         = c.req.query('tier');
  const status       = c.req.query('status');
  const brp          = c.req.query('brp_id');
  const breached     = c.req.query('breached');
  const reportable   = c.req.query('reportable');
  const zone         = c.req.query('market_zone');

  let sql = 'SELECT * FROM oe_imbalance_settlement WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)   { sql += ' AND current_tier = ?';                binds.push(tier); }
  if (status) { sql += ' AND chain_status = ?';                binds.push(status); }
  if (brp)    { sql += ' AND brp_id = ?';                      binds.push(brp); }
  if (zone)   { sql += ' AND market_zone = ?';                 binds.push(zone); }
  sql += ' ORDER BY datetime(settlement_period_start_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ImbRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_zone: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    if (i.market_zone) by_zone[i.market_zone] = (by_zone[i.market_zone] || 0) + 1;
  }

  const active_count        = items.filter((i) => !i.is_terminal).length;
  const dispute_open_count  = items.filter((i) => i.chain_status === 'dispute_window_open' || i.chain_status === 'disputed').length;
  const aged_arrears_count  = items.filter((i) => i.chain_status === 'aged_arrears' || i.arrears_days_live >= 30).length;
  const systemic_count      = items.filter((i) => i.current_tier === 'systemic').length;
  const breached_count      = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const dispatch_bridged    = items.filter((i) => i.bridges_to_dispatch_chain_live).length;
  const reserve_bridged     = items.filter((i) => i.bridges_to_reserve_activation_chain_live).length;
  const total_owed_zar      = items.reduce((s, i) => s + (i.total_owed_zar_live || 0), 0);
  const total_outstanding_zar = items.reduce((s, i) => s + (i.amount_outstanding_zar || 0), 0);
  const settledDurations: number[] = [];
  for (const i of items) {
    if (i.settled_at && i.period_opened_at) {
      const ms = new Date(i.settled_at).getTime() - new Date(i.period_opened_at).getTime();
      if (ms > 0) settledDurations.push(ms / (3600 * 1000));
    }
  }
  const avg_settlement_hours = settledDurations.length
    ? Math.round((settledDurations.reduce((s, h) => s + h, 0) / settledDurations.length) * 10) / 10
    : 0;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_zone,
      active_count,
      dispute_open_count,
      aged_arrears_count,
      systemic_count,
      breached: breached_count,
      reportable_total,
      dispatch_bridged_count: dispatch_bridged,
      reserve_bridged_count: reserve_bridged,
      total_owed_zar,
      total_outstanding_zar,
      avg_settlement_hours,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, regulator_relevant, sla_breached, market_zone, COUNT(*) as n
     FROM oe_imbalance_settlement GROUP BY chain_status, current_tier, regulator_relevant, sla_breached, market_zone`,
  ).all<{
    chain_status: string; current_tier: string;
    regulator_relevant: number; sla_breached: number;
    market_zone: string | null; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  const by_zone: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
    if (r.market_zone) by_zone[r.market_zone] = (by_zone[r.market_zone] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_regulator_relevant, by_sla_breached, by_zone } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_imbalance_settlement WHERE id = ?').bind(id).first<ImbRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_imbalance_settlement_events WHERE settlement_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ImbEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  title?: string;
  narrative?: string;
}

interface CreateBody extends CommonBody {
  brp_id?: string;
  brp_label?: string;
  brp_voltage_class?: string;
  market_zone?: string;
  market_time_unit_minutes?: number;
  settlement_period_start_at?: string;
  settlement_period_end_at?: string;
  nominated_mwh?: number;
  long_price_zar_per_mwh?: number;
  short_price_zar_per_mwh?: number;
  penalty_multiplier?: number;
  imbalance_quantum_zar?: number;
  dispatch_nomination_ref?: string;
  reserve_activation_ref?: string;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  imbalance_floor_flag_high_voltage_brp?: boolean | number;
  imbalance_floor_flag_system_critical_period?: boolean | number;
  imbalance_floor_flag_regulator_audit_period?: boolean | number;
  imbalance_floor_flag_market_suspension_active?: boolean | number;
  imbalance_floor_flag_repeated_breach_5plus?: boolean | number;
  tenant_id?: string;
}

interface ReceiveMeterBody extends CommonBody { metered_mwh?: number; }
interface ReconcileBody extends CommonBody {}
interface ComputeBody extends CommonBody {
  imbalance_mwh?: number;
  imbalance_quantum_zar?: number;
}
interface PriceBody extends CommonBody {
  long_price_zar_per_mwh?: number;
  short_price_zar_per_mwh?: number;
  price_applied_zar_per_mwh?: number;
  penalty_multiplier?: number;
}
interface IssueInvoiceBody extends CommonBody {
  invoice_number?: string;
  invoice_due_at?: string;
}
interface AckInvoiceBody extends CommonBody {}
interface OpenWindowBody extends CommonBody {
  dispute_window_close_at?: string;
}
interface RaiseDisputeBody extends CommonBody {
  dispute_reason_code?: string;
  dispute_narrative?: string;
}
interface ResolveDisputeBody extends CommonBody {
  dispute_resolution_text?: string;
}
interface ReviseInvoiceBody extends CommonBody {
  long_price_zar_per_mwh?: number;
  short_price_zar_per_mwh?: number;
  imbalance_quantum_zar?: number;
}
interface RecordPaymentBody extends CommonBody {
  payment_method?: string;
  payment_reference?: string;
  amount_paid_zar?: number;
}
interface MarkSettledBody extends CommonBody {}
interface ArchiveBody extends CommonBody {}
interface CancelBody extends CommonBody { cancel_reason?: string; }

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<ImbRow>): Partial<ImbRow> {
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.title === 'string')         out.title = b.title;
  if (typeof b.narrative === 'string')     out.narrative = b.narrative;
  return out;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

// ─── Create endpoint ─────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `imb-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `IMB-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const flags = {
    imbalance_floor_flag_high_voltage_brp:          toFlag(body.imbalance_floor_flag_high_voltage_brp) ?? 0,
    imbalance_floor_flag_system_critical_period:    toFlag(body.imbalance_floor_flag_system_critical_period) ?? 0,
    imbalance_floor_flag_regulator_audit_period:    toFlag(body.imbalance_floor_flag_regulator_audit_period) ?? 0,
    imbalance_floor_flag_market_suspension_active:  toFlag(body.imbalance_floor_flag_market_suspension_active) ?? 0,
    imbalance_floor_flag_repeated_breach_5plus:     toFlag(body.imbalance_floor_flag_repeated_breach_5plus) ?? 0,
  };
  const quantum = Number(body.imbalance_quantum_zar ?? 0);
  const rawTier = tierForQuantum(quantum);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('period_open', tier, now);

  const periodStart = body.settlement_period_start_at ?? nowIso;
  const periodEnd   = body.settlement_period_end_at   ?? nowIso;

  await c.env.DB.prepare(
    `INSERT INTO oe_imbalance_settlement (
      id, settlement_number,
      brp_id, brp_label, brp_voltage_class,
      market_zone, market_time_unit_minutes,
      settlement_period_start_at, settlement_period_end_at,
      nominated_mwh, metered_mwh, imbalance_mwh, imbalance_direction,
      long_price_zar_per_mwh, short_price_zar_per_mwh,
      price_applied_zar_per_mwh, penalty_multiplier,
      imbalance_charge_zar, penalty_zar, total_owed_zar,
      amount_paid_zar, amount_outstanding_zar,
      imbalance_quantum_zar,
      dispatch_nomination_ref, reserve_activation_ref,
      invoice_revised_count,
      arrears_days, arrears_bucket,
      imbalance_floor_flag_high_voltage_brp,
      imbalance_floor_flag_system_critical_period,
      imbalance_floor_flag_regulator_audit_period,
      imbalance_floor_flag_market_suspension_active,
      imbalance_floor_flag_repeated_breach_5plus,
      current_tier, authority_required, urgency_band,
      title, narrative,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, period_opened_at,
      sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.brp_id ?? 'brp-unknown', body.brp_label ?? null, body.brp_voltage_class ?? null,
    body.market_zone ?? null, Number(body.market_time_unit_minutes ?? 60),
    periodStart, periodEnd,
    Number(body.nominated_mwh ?? 0), 0, 0, null,
    Number(body.long_price_zar_per_mwh ?? 0), Number(body.short_price_zar_per_mwh ?? 0),
    0, Number(body.penalty_multiplier ?? 1),
    0, 0, 0,
    0, 0,
    quantum,
    body.dispatch_nomination_ref ?? null, body.reserve_activation_ref ?? null,
    0,
    0, 'current',
    flags.imbalance_floor_flag_high_voltage_brp,
    flags.imbalance_floor_flag_system_critical_period,
    flags.imbalance_floor_flag_regulator_audit_period,
    flags.imbalance_floor_flag_market_suspension_active,
    flags.imbalance_floor_flag_repeated_breach_5plus,
    tier, authorityRequired(tier), urgencyBand(tier, 14),
    body.title ?? null, body.narrative ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'period_open', nowIso,
    sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_imbalance_settlement WHERE id = ?').bind(id).first<ImbRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

async function transition(
  c: Context<HonoEnv>,
  action: ImbAction,
  bodyHandler?: (row: ImbRow, body: Record<string, unknown>) => Partial<ImbRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_imbalance_settlement WHERE id = ?').bind(id).first<ImbRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current quantum + 5 floor flags (may have been
  // updated in this transition's body).
  const quantum = (overrides.imbalance_quantum_zar as number | undefined) ?? row.imbalance_quantum_zar;
  const rawTier = tierForQuantum(quantum);
  const floorFlags = {
    imbalance_floor_flag_high_voltage_brp:
      (overrides.imbalance_floor_flag_high_voltage_brp as number | undefined) ?? row.imbalance_floor_flag_high_voltage_brp,
    imbalance_floor_flag_system_critical_period:
      (overrides.imbalance_floor_flag_system_critical_period as number | undefined) ?? row.imbalance_floor_flag_system_critical_period,
    imbalance_floor_flag_regulator_audit_period:
      (overrides.imbalance_floor_flag_regulator_audit_period as number | undefined) ?? row.imbalance_floor_flag_regulator_audit_period,
    imbalance_floor_flag_market_suspension_active:
      (overrides.imbalance_floor_flag_market_suspension_active as number | undefined) ?? row.imbalance_floor_flag_market_suspension_active,
    imbalance_floor_flag_repeated_breach_5plus:
      (overrides.imbalance_floor_flag_repeated_breach_5plus as number | undefined) ?? row.imbalance_floor_flag_repeated_breach_5plus,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  // Re-derive direction + charge + penalty + total + outstanding on every
  // transition (handles compute / price / pay / revise).
  const imbalanceMwh = (overrides.imbalance_mwh as number | undefined) ?? row.imbalance_mwh;
  const longPrice = (overrides.long_price_zar_per_mwh as number | undefined) ?? row.long_price_zar_per_mwh;
  const shortPrice = (overrides.short_price_zar_per_mwh as number | undefined) ?? row.short_price_zar_per_mwh;
  const penMult = (overrides.penalty_multiplier as number | undefined) ?? row.penalty_multiplier;
  const direction = imbalanceDirection(imbalanceMwh);
  const priceApplied = imbalancePriceApplied(direction, longPrice, shortPrice);
  const chargeZ = imbalanceChargeZar(imbalanceMwh, priceApplied);
  const penZ = penaltyZar(chargeZ, penMult);
  const owedZ = totalOwedZar(chargeZ, penZ);
  const paidZ = (overrides.amount_paid_zar as number | undefined) ?? row.amount_paid_zar;
  overrides.imbalance_direction = direction;
  overrides.price_applied_zar_per_mwh = priceApplied;
  overrides.imbalance_charge_zar = chargeZ;
  overrides.penalty_zar = penZ;
  overrides.total_owed_zar = owedZ;
  overrides.amount_outstanding_zar = Math.max(owedZ - paidZ, 0);

  if (action === 'mark_settled') {
    overrides.payment_received_at = overrides.payment_received_at ?? row.payment_received_at ?? nowIso;
    overrides.amount_outstanding_zar = 0;
  }

  if (action === 'revise_invoice') {
    overrides.invoice_revised_count = (row.invoice_revised_count || 0) + 1;
  }

  const arrears = arrearsDaysSince(
    (overrides.invoice_due_at as string | null | undefined) ?? row.invoice_due_at,
    (overrides.payment_received_at as string | null | undefined) ?? row.payment_received_at,
    now,
  );
  overrides.arrears_days = arrears;
  overrides.arrears_bucket = agedArrearsBucket(arrears);

  // SIGNATURE crossings.
  const crosses = crossesIntoRegulator(action, tier, {
    imbalance_floor_flag_high_voltage_brp: floorFlags.imbalance_floor_flag_high_voltage_brp,
    penalty_zar: penZ,
    arrears_days: arrears,
    imbalance_mwh: imbalanceMwh,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, slaDaysRemaining(to, tier, now, now));

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol && to !== row.chain_status) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_imbalance_settlement SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `imbalance_settlement_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_imbalance_settlement_events (id, settlement_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventName,
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'imbalance_settlement',
      entity_id: id,
      data: {
        ...row,
        ...overrides,
        current_tier: tier,
        chain_status: to,
        from_status: row.chain_status,
        action,
        crosses_into_regulator: crosses,
      },
      env: c.env,
    });
  }

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_imbalance_settlement WHERE id = ?').bind(id).first<ImbRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (14) ────────────────────────────────────────────────
app.post('/:id/receive-meter-data', async (c) => transition(c, 'receive_meter_data', (_row, body) => {
  const b = body as Partial<ReceiveMeterBody>;
  const out: Partial<ImbRow> = {};
  if (typeof b.metered_mwh === 'number') out.metered_mwh = b.metered_mwh;
  return applyCommon(b, out);
}));

app.post('/:id/reconcile-nominations', async (c) => transition(c, 'reconcile_nominations', (_row, body) =>
  applyCommon(body as Partial<ReconcileBody>, {}),
));

app.post('/:id/compute-imbalance', async (c) => transition(c, 'compute_imbalance', (row, body) => {
  const b = body as Partial<ComputeBody>;
  const out: Partial<ImbRow> = {};
  if (typeof b.imbalance_mwh === 'number') {
    out.imbalance_mwh = b.imbalance_mwh;
  } else {
    out.imbalance_mwh = (row.metered_mwh || 0) - (row.nominated_mwh || 0);
  }
  if (typeof b.imbalance_quantum_zar === 'number') out.imbalance_quantum_zar = b.imbalance_quantum_zar;
  return applyCommon(b, out);
}));

app.post('/:id/price-imbalance', async (c) => transition(c, 'price_imbalance', (_row, body) => {
  const b = body as Partial<PriceBody>;
  const out: Partial<ImbRow> = {};
  if (typeof b.long_price_zar_per_mwh === 'number')  out.long_price_zar_per_mwh = b.long_price_zar_per_mwh;
  if (typeof b.short_price_zar_per_mwh === 'number') out.short_price_zar_per_mwh = b.short_price_zar_per_mwh;
  if (typeof b.penalty_multiplier === 'number')      out.penalty_multiplier = b.penalty_multiplier;
  return applyCommon(b, out);
}));

app.post('/:id/issue-invoice', async (c) => transition(c, 'issue_invoice', (_row, body) => {
  const b = body as Partial<IssueInvoiceBody>;
  const out: Partial<ImbRow> = {};
  out.invoice_number = b.invoice_number ?? `INV-${Date.now()}`;
  out.invoice_issued_at = new Date().toISOString();
  if (typeof b.invoice_due_at === 'string') out.invoice_due_at = b.invoice_due_at;
  return applyCommon(b, out);
}));

app.post('/:id/acknowledge-invoice', async (c) => transition(c, 'acknowledge_invoice', (_row, body) =>
  applyCommon(body as Partial<AckInvoiceBody>, {}),
));

app.post('/:id/open-dispute-window', async (c) => transition(c, 'open_dispute_window', (_row, body) => {
  const b = body as Partial<OpenWindowBody>;
  const out: Partial<ImbRow> = {};
  if (typeof b.dispute_window_close_at === 'string') out.dispute_window_close_at = b.dispute_window_close_at;
  else {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + 7);
    out.dispute_window_close_at = t.toISOString();
  }
  return applyCommon(b, out);
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) => {
  const b = body as Partial<RaiseDisputeBody>;
  const out: Partial<ImbRow> = {};
  if (typeof b.dispute_reason_code === 'string') out.dispute_reason_code = b.dispute_reason_code;
  if (typeof b.dispute_narrative === 'string')   out.dispute_narrative = b.dispute_narrative;
  return applyCommon(b, out);
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveDisputeBody>;
  const out: Partial<ImbRow> = {};
  if (typeof b.dispute_resolution_text === 'string') out.dispute_resolution_text = b.dispute_resolution_text;
  return applyCommon(b, out);
}));

app.post('/:id/revise-invoice', async (c) => transition(c, 'revise_invoice', (_row, body) => {
  const b = body as Partial<ReviseInvoiceBody>;
  const out: Partial<ImbRow> = {};
  if (typeof b.long_price_zar_per_mwh === 'number')  out.long_price_zar_per_mwh = b.long_price_zar_per_mwh;
  if (typeof b.short_price_zar_per_mwh === 'number') out.short_price_zar_per_mwh = b.short_price_zar_per_mwh;
  if (typeof b.imbalance_quantum_zar === 'number')   out.imbalance_quantum_zar = b.imbalance_quantum_zar;
  return applyCommon(b, out);
}));

app.post('/:id/record-payment', async (c) => transition(c, 'record_payment', (row, body) => {
  const b = body as Partial<RecordPaymentBody>;
  const out: Partial<ImbRow> = {};
  if (typeof b.payment_method === 'string')    out.payment_method = b.payment_method;
  if (typeof b.payment_reference === 'string') out.payment_reference = b.payment_reference;
  if (typeof b.amount_paid_zar === 'number') {
    out.amount_paid_zar = (row.amount_paid_zar || 0) + b.amount_paid_zar;
  }
  out.payment_received_at = new Date().toISOString();
  return applyCommon(b, out);
}));

app.post('/:id/mark-settled', async (c) => transition(c, 'mark_settled', (_row, body) =>
  applyCommon(body as Partial<MarkSettledBody>, {}),
));

app.post('/:id/archive-period', async (c) => transition(c, 'archive_period', (_row, body) =>
  applyCommon(body as Partial<ArchiveBody>, {}),
));

app.post('/:id/cancel-period', async (c) => transition(c, 'cancel_period', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<ImbRow> = {};
  if (typeof b.cancel_reason === 'string') out.cancel_reason = b.cancel_reason;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
export async function imbalanceSettlementSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_imbalance_settlement
     WHERE chain_status NOT IN ('settled','archived','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ImbRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_imbalance_settlement
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `imbalance_settlement_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_imbalance_settlement_events (id, settlement_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'imbalance_settlement.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'settlement_admin',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'imbalance_settlement.sla_breached',
        actor_id: 'system',
        entity_type: 'imbalance_settlement',
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

// ─── Cron: Aged-arrears sweep (nightly 05:00) ─────────────────────────────
//
// Walks every invoice_issued / invoice_acknowledged / payment_pending row
// past invoice_due_at, computes arrears_days from invoice_due_at, sets
// arrears_bucket, and flips chain_status to 'aged_arrears' once the row
// is >=30 days past due AND has no payment recorded. Crosses regulator
// at >=60 days per W105 signature.
export async function imbalanceSettlementArrearsSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; aged: number; regulator_crossed: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_imbalance_settlement
     WHERE chain_status IN ('invoice_issued','invoice_acknowledged','payment_pending','aged_arrears')
       AND invoice_due_at IS NOT NULL
       AND payment_received_at IS NULL
       AND datetime(invoice_due_at) < datetime(?)`,
  ).bind(nowIso).all<ImbRow>();

  const rows = rs.results || [];
  let aged = 0;
  let regulatorCrossed = 0;
  for (const row of rows) {
    const arrears = arrearsDaysSince(row.invoice_due_at, row.payment_received_at, now);
    const bucket = agedArrearsBucket(arrears);
    const shouldAge = arrears >= 30 && row.chain_status !== 'aged_arrears';
    const crosses = crossesIntoRegulator('aged_arrears', row.current_tier, {
      imbalance_floor_flag_high_voltage_brp: row.imbalance_floor_flag_high_voltage_brp,
      penalty_zar: row.penalty_zar,
      arrears_days: arrears,
      imbalance_mwh: row.imbalance_mwh,
    });

    const setParts: string[] = ['arrears_days = ?', 'arrears_bucket = ?', 'updated_at = ?'];
    const setBinds: unknown[] = [arrears, bucket, nowIso];
    if (shouldAge) {
      setParts.push('chain_status = ?', 'aged_arrears_at = ?');
      setBinds.push('aged_arrears', nowIso);
    }
    if (crosses) {
      setParts.push('regulator_crossed_at = ?', 'is_reportable = ?');
      setBinds.push(nowIso, 1);
      regulatorCrossed++;
    }
    setBinds.push(row.id);

    await env.DB.prepare(
      `UPDATE oe_imbalance_settlement SET ${setParts.join(', ')} WHERE id = ?`,
    ).bind(...setBinds).run();

    if (shouldAge) {
      aged++;
      const evtId = `imbalance_settlement_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      await env.DB.prepare(
        'INSERT INTO oe_imbalance_settlement_events (id, settlement_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        evtId,
        row.id,
        'imbalance_settlement.aged_arrears',
        row.chain_status,
        'aged_arrears',
        'system',
        'settlement_admin',
        `Auto-aged: ${arrears} days past invoice due (tier ${row.current_tier})`,
        JSON.stringify({ arrears_days: arrears, bucket }),
        nowIso,
      ).run();

      if (crosses) {
        await fireCascade({
          event: 'imbalance_settlement.aged_arrears',
          actor_id: 'system',
          entity_type: 'imbalance_settlement',
          entity_id: row.id,
          data: {
            ...row,
            arrears_days: arrears,
            arrears_bucket: bucket,
            crosses_into_regulator: true,
          },
          env,
        });
      }
    }
  }
  return { scanned: rows.length, aged, regulator_crossed: regulatorCrossed };
}

export default app;
