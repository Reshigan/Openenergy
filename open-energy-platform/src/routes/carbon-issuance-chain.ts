// ═══════════════════════════════════════════════════════════════════════════
// Wave 82 — Carbon Credit Issuance & Serialization chain (P6).
//
// Mounted at /api/carbon-issuance/chain.
//
// The MINTING step of the carbon-credit lifecycle. After a monitoring period
// has been verified (W11) and the project is in good standing (W37/W56), the
// registry serializes the verified reductions into a unique serial-number
// block and credits the proponent's holding account. This chain governs that
// minting workflow — completeness screening, MRV cross-check, buffer-pool
// deduction (AFOLU), serial-number assignment, registry submission, and the
// final credit-into-account event.
//
// DISTINCTIVE move (beat Verra Registry on APX / Gold Standard Impact
// Registry / S&P Global Environmental Registry / Cercarbono / Puro.earth —
// all of which run essentially linear issuance workflows with manual
// integrity checks): live calculated integrity guards exposed on every
// record — serial-block transparency, buffer-pool maths, project+vintage
// cumulative headroom, double-issuance / over-issuance flags, and
// Article-6 corresponding-adjustment binding — all derived from the same
// inputs each transition.
//
// Write model — SINGLE carbon-fund desk {admin, carbon_fund} (same single-
// party model as every carbon chain). READ all nine personas. actor_party
// (proponent / registry / vvb / dna) records the functional owner per step,
// not the JWT role.
//
// Reportability (the W82 SIGNATURE is INTEGRITY-driven):
//   raise_dispute    crosses for EVERY tier — a serial / quantum dispute is
//                    always reportable to the registry oversight authority.
//   confirm_issuance crosses for EVERY tier when CA-required (Article 6);
//                    else for major+mega only.
//   reject + sla_breached cross for major+mega only.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForQuantity,
  requiresCorrespondingAdjustment,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  defaultBufferPctFor,
  bufferContributionTco2e,
  netIssuableTco2e,
  projectVintageHeadroomTco2e,
  isOverIssuance,
  serialBlockEnd,
  predictedIssuanceDays,
  SLA_MINUTES,
  type IssuanceStatus,
  type IssuanceAction,
  type IssuanceTier,
  type IssuanceTransferType,
  type IssuanceCategory,
} from '../utils/carbon-issuance-spec';

const READ_ROLES = new Set([
  'admin', 'carbon_fund',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'carbon_fund']);

interface IssuanceRow {
  id: string;
  issuance_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  project_id: string;
  project_name: string | null;
  registry_standard: string | null;
  methodology_id: string | null;
  proponent_party_id: string | null;
  proponent_party_name: string | null;
  registry_account_id: string | null;
  vvb_name: string | null;
  dna_name: string | null;
  host_country: string | null;
  transfer_type: IssuanceTransferType;
  category: IssuanceCategory;
  issuance_tier: IssuanceTier;
  requested_tco2e: number;
  requires_corresponding_adjustment: number;
  corresponding_adjustment_ref: string | null;
  ca_applied_flag: number;
  vintage_year: number | null;
  monitoring_period_start: string | null;
  monitoring_period_end: string | null;
  vintage_monitoring_key: string | null;
  verified_tco2e: number | null;
  already_issued_tco2e: number | null;
  buffer_pct: number | null;
  buffer_contribution_tco2e: number | null;
  net_issuable_tco2e: number | null;
  project_vintage_headroom_tco2e: number | null;
  over_issuance_flag: number;
  double_issuance_guard_ok: number;
  predicted_issuance_days: number | null;
  serial_block_start: number | null;
  serial_block_end: number | null;
  serial_block_size: number | null;
  serial_number_prefix: string | null;
  screened_flag: number;
  verification_check_ok_flag: number;
  serials_assigned_flag: number;
  submitted_to_registry_flag: number;
  issued_flag: number;
  request_ref: string | null;
  screening_ref: string | null;
  verification_check_ref: string | null;
  serialization_ref: string | null;
  registry_submission_ref: string | null;
  issuance_ref: string | null;
  hold_ref: string | null;
  return_ref: string | null;
  dispute_ref: string | null;
  rejection_ref: string | null;
  withdrawal_ref: string | null;
  cancellation_ref: string | null;
  regulator_ref: string | null;
  request_basis: string | null;
  screening_basis: string | null;
  verification_check_basis: string | null;
  serialization_basis: string | null;
  registry_submission_basis: string | null;
  issuance_basis: string | null;
  hold_basis: string | null;
  return_basis: string | null;
  dispute_basis: string | null;
  rejection_basis: string | null;
  withdrawal_basis: string | null;
  cancellation_basis: string | null;
  reason_code: string | null;
  issuance_summary: string | null;
  chain_status: IssuanceStatus;
  requested_at: string;
  screening_at: string | null;
  verification_check_at: string | null;
  serialization_at: string | null;
  pending_registry_at: string | null;
  issued_at: string | null;
  on_hold_at: string | null;
  returned_at: string | null;
  disputed_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface IssuanceEventRow {
  id: string;
  issuance_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<IssuanceStatus, keyof IssuanceRow | null> = {
  requested:          null,
  screening:          'screening_at',
  verification_check: 'verification_check_at',
  serialization:      'serialization_at',
  pending_registry:   'pending_registry_at',
  issued:             'issued_at',
  on_hold:            'on_hold_at',
  returned:           'returned_at',
  disputed:           'disputed_at',
  rejected:           'rejected_at',
  withdrawn:          'withdrawn_at',
  cancelled:          'cancelled_at',
};

// resume re-enters screening and resubmit also lands in screening, so both
// share the 'carbon_issuance.screening' event name. resolve_dispute lands
// back in serialization.
function eventTypeFor(action: IssuanceAction): string {
  switch (action) {
    case 'begin_screening':       return 'carbon_issuance.screening';
    case 'verify_against_mrv':    return 'carbon_issuance.verification_check';
    case 'assign_serials':        return 'carbon_issuance.serialization';
    case 'submit_to_registry':    return 'carbon_issuance.pending_registry';
    case 'confirm_issuance':      return 'carbon_issuance.issued';
    case 'place_on_hold':         return 'carbon_issuance.on_hold';
    case 'resume':                return 'carbon_issuance.screening';
    case 'return_for_correction': return 'carbon_issuance.returned';
    case 'resubmit':              return 'carbon_issuance.screening';
    case 'raise_dispute':         return 'carbon_issuance.disputed';
    case 'resolve_dispute':       return 'carbon_issuance.serialization';
    case 'reject':                return 'carbon_issuance.rejected';
    case 'withdraw':              return 'carbon_issuance.withdrawn';
    case 'cancel':                return 'carbon_issuance.cancelled';
  }
}

function decorate(row: IssuanceRow, now: Date) {
  const tier = row.issuance_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  const requiresCA = !!row.requires_corresponding_adjustment;
  // Live integrity battery — derived from the same inputs every record so the
  // numbers match across transitions. This is what beats the linear registry
  // workflows of Verra/GS/IHS/Cercarbono/Puro.
  const requested = row.requested_tco2e || 0;
  const verified  = row.verified_tco2e ?? 0;
  const already   = row.already_issued_tco2e ?? 0;
  const bufferPct = row.buffer_pct ?? defaultBufferPctFor(row.category);
  const bufferLive = bufferContributionTco2e(requested, bufferPct);
  const netIssuableLive = netIssuableTco2e(requested, bufferPct);
  const headroomLive = projectVintageHeadroomTco2e(verified, already, netIssuableLive);
  const overIssuanceLive = isOverIssuance(verified, already, netIssuableLive);
  const serialEndLive = row.serial_block_start != null
    ? serialBlockEnd(row.serial_block_start, netIssuableLive)
    : null;
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    requires_corresponding_adjustment_flag: requiresCA,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    buffer_pct_live: bufferPct,
    buffer_contribution_tco2e_live: bufferLive,
    net_issuable_tco2e_live: netIssuableLive,
    project_vintage_headroom_tco2e_live: headroomLive,
    over_issuance_flag_live: overIssuanceLive,
    serial_block_end_live: serialEndLive,
    predicted_issuance_days_live: predictedIssuanceDays(tier),
    double_issuance_guard_ok_flag: !!row.double_issuance_guard_ok,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const issuance_tier  = c.req.query('issuance_tier');
  const status         = c.req.query('status');
  const transfer_type  = c.req.query('transfer_type');
  const category       = c.req.query('category');
  const project_id     = c.req.query('project_id');
  const breached       = c.req.query('breached');
  const reportable     = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_carbon_issuances WHERE 1=1';
  const binds: unknown[] = [];
  if (issuance_tier) { sql += ' AND issuance_tier = ?'; binds.push(issuance_tier); }
  if (status)        { sql += ' AND chain_status = ?';  binds.push(status); }
  if (transfer_type) { sql += ' AND transfer_type = ?'; binds.push(transfer_type); }
  if (category)      { sql += ' AND category = ?';      binds.push(category); }
  if (project_id)    { sql += ' AND project_id = ?';    binds.push(project_id); }

  sql += ' ORDER BY datetime(requested_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<IssuanceRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_transfer_type: Record<string, number> = {};
  const by_category: Record<string, number> = {};
  const by_project: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.issuance_tier] = (by_tier[i.issuance_tier] || 0) + 1;
    by_transfer_type[i.transfer_type] = (by_transfer_type[i.transfer_type] || 0) + 1;
    by_category[i.category] = (by_category[i.category] || 0) + 1;
    by_project[i.project_id] = (by_project[i.project_id] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const issued_count     = items.filter((i) => i.chain_status === 'issued').length;
  const on_hold_count    = items.filter((i) => i.chain_status === 'on_hold').length;
  const returned_count   = items.filter((i) => i.chain_status === 'returned').length;
  const disputed_count   = items.filter((i) => i.chain_status === 'disputed').length;
  const rejected_count   = items.filter((i) => i.chain_status === 'rejected').length;
  const withdrawn_count  = items.filter((i) => i.chain_status === 'withdrawn').length;
  const cancelled_count  = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count   = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total = items.filter((i) => i.is_reportable_flag).length;
  const article6_count   = items.filter((i) => i.transfer_type === 'article6').length;
  const afolu_count      = items.filter((i) => i.category === 'afolu').length;
  const over_issuance_count = items.filter((i) => i.over_issuance_flag_live).length;
  const total_requested_tco2e = items.reduce((sum, i) => sum + (i.requested_tco2e || 0), 0);
  const total_net_issuable_tco2e = items.reduce((sum, i) => sum + (i.net_issuable_tco2e_live || 0), 0);
  const issued_tco2e = items
    .filter((i) => i.chain_status === 'issued')
    .reduce((sum, i) => sum + (i.net_issuable_tco2e_live || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_transfer_type,
      by_category,
      by_project,
      open_count,
      issued_count,
      on_hold_count,
      returned_count,
      disputed_count,
      rejected_count,
      withdrawn_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      article6_count,
      afolu_count,
      over_issuance_count,
      total_requested_tco2e,
      total_net_issuable_tco2e,
      issued_tco2e,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_issuances WHERE id = ?').bind(id).first<IssuanceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_carbon_issuances_events WHERE issuance_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<IssuanceEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ScreenBody  { screening_basis?: string; screening_ref?: string; notes?: string; }
interface VerifyMrvBody {
  verification_check_basis?: string;
  verification_check_ref?: string;
  verified_tco2e?: number;
  already_issued_tco2e?: number;
  vintage_monitoring_key?: string;
  notes?: string;
}
interface AssignSerialsBody {
  serialization_basis?: string;
  serialization_ref?: string;
  serial_block_start?: number;
  serial_number_prefix?: string;
  buffer_pct?: number;
  notes?: string;
}
interface SubmitBody { registry_submission_basis?: string; registry_submission_ref?: string; notes?: string; }
interface ConfirmBody {
  issuance_basis?: string;
  issuance_ref?: string;
  ca_applied_flag?: boolean | number;
  corresponding_adjustment_ref?: string;
  regulator_ref?: string;
  notes?: string;
}
interface HoldBody { hold_basis?: string; hold_ref?: string; reason_code?: string; notes?: string; }
interface ReturnBody { return_basis?: string; return_ref?: string; reason_code?: string; notes?: string; }
interface DisputeBody {
  dispute_basis?: string;
  dispute_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface RejectBody {
  rejection_basis?: string;
  rejection_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}
interface WithdrawBody { withdrawal_basis?: string; withdrawal_ref?: string; reason_code?: string; notes?: string; }
interface CancelBody { cancellation_basis?: string; cancellation_ref?: string; reason_code?: string; notes?: string; }

async function transition(
  c: Context<HonoEnv>,
  action: IssuanceAction,
  bodyHandler?: (row: IssuanceRow, body: Record<string, unknown>) => Partial<IssuanceRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_carbon_issuances WHERE id = ?').bind(id).first<IssuanceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier is RE-DERIVED on every transition from |requested_tco2e| + Article 6
  // floor, so the SLA window and regulator-crossing decision track the CURRENT
  // tier (same family as W19/W20/W43/W49/W56/W65/W70/W73/W81 INVERTED-SLA
  // chains).
  const transferType = (overrides.transfer_type as IssuanceTransferType | undefined) ?? row.transfer_type;
  const requested = (overrides.requested_tco2e as number | undefined) ?? row.requested_tco2e;
  const tier = tierForQuantity(requested, transferType);
  overrides.issuance_tier = tier;
  const requiresCA = requiresCorrespondingAdjustment(transferType);
  overrides.requires_corresponding_adjustment = requiresCA ? 1 : 0;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier, requiresCA);
  overrides.is_reportable = (isReportable(tier, requiresCA) || crosses) ? 1 : 0;

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
    `UPDATE oe_carbon_issuances SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `cis_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_carbon_issuances_events (id, issuance_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'carbon_issuance',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      issuance_tier: tier,
      transfer_type: transferType,
      requires_corresponding_adjustment: requiresCA ? 1 : 0,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_carbon_issuances WHERE id = ?').bind(id).first<IssuanceRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-screening', async (c) => transition(c, 'begin_screening', (row, body) => {
  const b = body as Partial<ScreenBody>;
  const out: Partial<IssuanceRow> = { screened_flag: 1 };
  if (typeof b.screening_basis === 'string') out.screening_basis = b.screening_basis;
  if (typeof b.screening_ref === 'string')   out.screening_ref = b.screening_ref;
  // Pre-compute the predicted turnaround at screening — the registry can quote
  // a realistic mint date the moment the request enters the desk.
  out.predicted_issuance_days = predictedIssuanceDays(
    tierForQuantity(row.requested_tco2e, row.transfer_type),
  );
  return out;
}));

app.post('/:id/verify-against-mrv', async (c) => transition(c, 'verify_against_mrv', (row, body) => {
  const b = body as Partial<VerifyMrvBody>;
  const out: Partial<IssuanceRow> = { verification_check_ok_flag: 1 };
  if (typeof b.verification_check_basis === 'string') out.verification_check_basis = b.verification_check_basis;
  if (typeof b.verification_check_ref === 'string')   out.verification_check_ref = b.verification_check_ref;
  if (typeof b.vintage_monitoring_key === 'string')   out.vintage_monitoring_key = b.vintage_monitoring_key;
  // Recompute integrity battery from the MRV statement inputs — buffer-pool
  // deduction, net issuable, project+vintage headroom, over-issuance flag.
  const verified = typeof b.verified_tco2e === 'number' ? b.verified_tco2e : (row.verified_tco2e ?? 0);
  const already  = typeof b.already_issued_tco2e === 'number' ? b.already_issued_tco2e : (row.already_issued_tco2e ?? 0);
  const bufferPct = row.buffer_pct ?? defaultBufferPctFor(row.category);
  const bufferContribution = bufferContributionTco2e(row.requested_tco2e, bufferPct);
  const netIssuable = netIssuableTco2e(row.requested_tco2e, bufferPct);
  const headroom = projectVintageHeadroomTco2e(verified, already, netIssuable);
  out.verified_tco2e = verified;
  out.already_issued_tco2e = already;
  out.buffer_pct = bufferPct;
  out.buffer_contribution_tco2e = bufferContribution;
  out.net_issuable_tco2e = netIssuable;
  out.project_vintage_headroom_tco2e = headroom;
  out.over_issuance_flag = isOverIssuance(verified, already, netIssuable) ? 1 : 0;
  return out;
}));

app.post('/:id/assign-serials', async (c) => transition(c, 'assign_serials', (row, body) => {
  const b = body as Partial<AssignSerialsBody>;
  const out: Partial<IssuanceRow> = { serials_assigned_flag: 1 };
  if (typeof b.serialization_basis === 'string') out.serialization_basis = b.serialization_basis;
  if (typeof b.serialization_ref === 'string')   out.serialization_ref = b.serialization_ref;
  if (typeof b.serial_number_prefix === 'string') out.serial_number_prefix = b.serial_number_prefix;
  if (typeof b.buffer_pct === 'number') out.buffer_pct = b.buffer_pct;
  const bufferPct = (typeof b.buffer_pct === 'number') ? b.buffer_pct : (row.buffer_pct ?? defaultBufferPctFor(row.category));
  const netIssuable = netIssuableTco2e(row.requested_tco2e, bufferPct);
  out.buffer_pct = bufferPct;
  out.buffer_contribution_tco2e = bufferContributionTco2e(row.requested_tco2e, bufferPct);
  out.net_issuable_tco2e = netIssuable;
  if (typeof b.serial_block_start === 'number' && netIssuable > 0) {
    const start = b.serial_block_start;
    const end = serialBlockEnd(start, netIssuable);
    out.serial_block_start = start;
    out.serial_block_end = end;
    out.serial_block_size = end - start + 1;
  }
  return out;
}));

app.post('/:id/submit-to-registry', async (c) => transition(c, 'submit_to_registry', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<IssuanceRow> = { submitted_to_registry_flag: 1 };
  if (typeof b.registry_submission_basis === 'string') out.registry_submission_basis = b.registry_submission_basis;
  if (typeof b.registry_submission_ref === 'string')   out.registry_submission_ref = b.registry_submission_ref;
  return out;
}));

app.post('/:id/confirm-issuance', async (c) => transition(c, 'confirm_issuance', (_row, body) => {
  const b = body as Partial<ConfirmBody>;
  const out: Partial<IssuanceRow> = { issued_flag: 1 };
  if (typeof b.issuance_basis === 'string') out.issuance_basis = b.issuance_basis;
  if (typeof b.issuance_ref === 'string')   out.issuance_ref = b.issuance_ref;
  if (typeof b.corresponding_adjustment_ref === 'string') out.corresponding_adjustment_ref = b.corresponding_adjustment_ref;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  if (typeof b.ca_applied_flag !== 'undefined') {
    out.ca_applied_flag = b.ca_applied_flag ? 1 : 0;
  }
  return out;
}));

app.post('/:id/place-on-hold', async (c) => transition(c, 'place_on_hold', (row, body) => {
  const b = body as Partial<HoldBody>;
  const out: Partial<IssuanceRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof b.hold_basis === 'string') out.hold_basis = b.hold_basis;
  if (typeof b.hold_ref === 'string')   out.hold_ref = b.hold_ref;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resume', async (c) => transition(c, 'resume'));

app.post('/:id/return-for-correction', async (c) => transition(c, 'return_for_correction', (_row, body) => {
  const b = body as Partial<ReturnBody>;
  const out: Partial<IssuanceRow> = {};
  if (typeof b.return_basis === 'string') out.return_basis = b.return_basis;
  if (typeof b.return_ref === 'string')   out.return_ref = b.return_ref;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resubmit', async (c) => transition(c, 'resubmit'));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<IssuanceRow> = { escalation_level: (row.escalation_level || 0) + 1 };
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.dispute_ref === 'string')   out.dispute_ref = b.dispute_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute'));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<IssuanceRow> = {};
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.rejection_ref === 'string')   out.rejection_ref = b.rejection_ref;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')   out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<IssuanceRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<IssuanceRow> = {};
  if (typeof b.cancellation_basis === 'string') out.cancellation_basis = b.cancellation_basis;
  if (typeof b.cancellation_ref === 'string')   out.cancellation_ref = b.cancellation_ref;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  return out;
}));

export async function carbonIssuanceSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_carbon_issuances
     WHERE chain_status NOT IN ('issued','rejected','withdrawn','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<IssuanceRow>();

  const rows = rs.results || [];
  // Collect per-row UPDATE + event INSERT into one atomic batch; fireCascade runs
  // afterwards in its own loop (it is a multi-stage fan-out, not a D1 statement).
  const stmts: D1PreparedStatement[] = [];
  const toCascade: IssuanceRow[] = [];
  for (const row of rows) {
    stmts.push(env.DB.prepare(
      `UPDATE oe_carbon_issuances
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id));

    const evtId = `cis_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    stmts.push(env.DB.prepare(
      'INSERT INTO oe_carbon_issuances_events (id, issuance_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'carbon_issuance.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.issuance_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ));

    if (slaBreachCrossesIntoRegulator(row.issuance_tier)) toCascade.push(row);
  }

  if (stmts.length) await env.DB.batch(stmts);

  for (const row of toCascade) {
    await fireCascade({
      event: 'carbon_issuance.sla_breached',
      actor_id: 'system',
      entity_type: 'carbon_issuance',
      entity_id: row.id,
      data: {
        ...row,
        crosses_into_regulator: true,
      },
      env,
    });
  }

  return { scanned: rows.length, breached: rows.length };
}

export default app;
