// ═══════════════════════════════════════════════════════════════════════════
// Wave 39 — Offtaker PPA Tariff Indexation / CPI Escalation chain
//
// Mounted at /api/tariff-indexation/chain.
//
// The ANNUAL repricing backbone of every long-term PPA. Each contract fixes a
// base tariff (R/MWh) at financial close and escalates it on each anniversary
// by a published index (Stats SA CPI, PPI, or a CPI+forex blend). The seller
// publishes the reference index, calculates the escalation factor, issues an
// indexation notice, the offtaker reviews it, and the parties agree the new
// tariff before it is applied to invoicing. A disagreement routes through the
// dispute / recalculation / arbitration branches.
//
// Sits alongside the one-off W22 PPA contract-execution chain (which sets the
// base tariff) and the year-end W32 take-or-pay chain (which reconciles volume
// against it).
//
// Forward path:
//   indexation_due → index_published → escalation_calculated → notice_issued
//     → under_review → tariff_agreed → applied
//
// Dispute branch:
//   notice_issued|under_review → disputed → recalculated → notice_issued (reissue)
//                                         → arbitrated (NERSA / arbitration)
//   any active state → withdrawn
//
// Tiers (PPA scale): utility_scale / commercial / embedded.
//
// Frameworks: NERSA ERA 2006 §4 tariff oversight + IFRS 16 + PPA indexation.
//
// MIXED SLA — machinery windows uniform across tiers; dispute / recalculation
// windows materiality-graded with utility_scale TIGHTEST. Reportability:
//   - refer_arbitration crosses for EVERY tier (ERA §4 hard line)
//   - dispute declarations cross for utility_scale + commercial only
//   - sla_breached crosses for utility_scale + commercial only
//
// Two-party split write: the offtaker (offtaker) reviews / agrees / disputes /
// refers; the seller side (ipp_developer / admin / support) drives the
// indexation machinery. actor_party (seller / offtaker) derived from the action.
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
  isOfftakerAction,
  partyForAction,
  SLA_MINUTES,
  type TariffIdxStatus,
  type TariffIdxAction,
  type TariffIdxTier,
} from '../utils/tariff-indexation-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'offtaker',
  'ipp_developer',
  'regulator',
]);

// Two-party split write. The offtaker side reviews / agrees / disputes / refers;
// the seller side (the IPP = ipp_developer) drives the indexation machinery
// (publish / calculate / notice / apply / recalculate / reissue / withdraw).
const SELLER_WRITE_ROLES   = new Set(['admin', 'support', 'ipp_developer']);
const OFFTAKER_WRITE_ROLES = new Set(['admin', 'support', 'offtaker']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface TariffIdxRow {
  id: string;
  indexation_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  seller_party_id: string;
  seller_party_name: string;
  offtaker_party_id: string;
  offtaker_party_name: string;
  ppa_ref: string | null;
  project_name: string;
  contract_tier: TariffIdxTier;
  contract_year: number | null;
  base_tariff_zar_mwh: number | null;
  index_type: string | null;
  index_reference_period: string | null;
  index_value: number | null;
  escalation_factor: number | null;
  proposed_tariff_zar_mwh: number | null;
  agreed_tariff_zar_mwh: number | null;
  annual_contract_value_zar: number | null;
  disputed_amount_zar: number | null;
  index_ref: string | null;
  notice_ref: string | null;
  dispute_ref: string | null;
  recalc_ref: string | null;
  arbitration_ref: string | null;
  calculation_basis: string | null;
  notice_basis: string | null;
  review_basis: string | null;
  dispute_basis: string | null;
  recalc_basis: string | null;
  arbitration_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: TariffIdxStatus;
  indexation_due_at: string;
  index_published_at: string | null;
  escalation_calculated_at: string | null;
  notice_issued_at: string | null;
  under_review_at: string | null;
  tariff_agreed_at: string | null;
  applied_at: string | null;
  disputed_at: string | null;
  recalculated_at: string | null;
  arbitrated_at: string | null;
  withdrawn_at: string | null;
  dispute_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface TariffIdxEventRow {
  id: string;
  indexation_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<TariffIdxStatus, keyof TariffIdxRow | null> = {
  indexation_due:        null,
  index_published:       'index_published_at',
  escalation_calculated: 'escalation_calculated_at',
  notice_issued:         'notice_issued_at',
  under_review:          'under_review_at',
  tariff_agreed:         'tariff_agreed_at',
  applied:               'applied_at',
  disputed:              'disputed_at',
  recalculated:          'recalculated_at',
  arbitrated:            'arbitrated_at',
  withdrawn:             'withdrawn_at',
};

const DISPUTE_PATH = new Set<TariffIdxStatus>(['disputed', 'recalculated', 'arbitrated']);
const ACTIVE_DISPUTE = new Set<TariffIdxStatus>(['disputed', 'recalculated']);

function decorate(row: TariffIdxRow, now: Date) {
  const tier = row.contract_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  const inDispute = DISPUTE_PATH.has(status);
  // Reportable: any dispute on a reportable tier, or any arbitration (universal).
  const isReportable = status === 'arbitrated' || (inDispute && isReportableTier(tier));
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable: isReportable,
    in_dispute: inDispute,
    dispute_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: TariffIdxAction): string {
  switch (action) {
    case 'publish_index':        return 'tariff_indexation.index_published';
    case 'calculate_escalation': return 'tariff_indexation.escalation_calculated';
    case 'issue_notice':         return 'tariff_indexation.notice_issued';
    case 'reissue_notice':       return 'tariff_indexation.notice_issued';
    case 'begin_review':         return 'tariff_indexation.under_review';
    case 'agree_tariff':         return 'tariff_indexation.tariff_agreed';
    case 'apply_tariff':         return 'tariff_indexation.applied';
    case 'raise_dispute':        return 'tariff_indexation.disputed';
    case 'recalculate':          return 'tariff_indexation.recalculated';
    case 'refer_arbitration':    return 'tariff_indexation.arbitrated';
    case 'withdraw':             return 'tariff_indexation.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const contract_tier     = c.req.query('contract_tier');
  const status            = c.req.query('status');
  const breached          = c.req.query('breached');
  const offtaker_party_id = c.req.query('offtaker_party_id');
  const seller_party_id   = c.req.query('seller_party_id');

  let sql = 'SELECT * FROM oe_tariff_indexation WHERE 1=1';
  const binds: unknown[] = [];
  if (contract_tier)     { sql += ' AND contract_tier = ?';     binds.push(contract_tier); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (offtaker_party_id) { sql += ' AND offtaker_party_id = ?'; binds.push(offtaker_party_id); }
  if (seller_party_id)   { sql += ' AND seller_party_id = ?';   binds.push(seller_party_id); }

  sql += ' ORDER BY datetime(indexation_due_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<TariffIdxRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.contract_tier]  = (by_tier[i.contract_tier] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const applied_count      = items.filter((i) => i.chain_status === 'applied').length;
  const active_dispute_count = items.filter((i) => ACTIVE_DISPUTE.has(i.chain_status)).length;
  const arbitrated_count  = items.filter((i) => i.chain_status === 'arbitrated').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const utility_open      = items.filter((i) => !i.is_terminal && i.contract_tier === 'utility_scale').length;
  const total_acv         = items.reduce((sum, i) => sum + (i.annual_contract_value_zar || 0), 0);
  const total_disputed    = items.reduce((sum, i) => sum + (i.disputed_amount_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      open_count,
      applied_count,
      active_dispute_count,
      arbitrated_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      utility_open,
      total_acv,
      total_disputed,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_tariff_indexation WHERE id = ?').bind(id).first<TariffIdxRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_tariff_indexation_events WHERE indexation_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<TariffIdxEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface PublishBody {
  index_ref?: string;
  index_value?: number;
  index_type?: string;
  index_reference_period?: string;
  notes?: string;
}

interface CalculateBody {
  escalation_factor?: number;
  proposed_tariff_zar_mwh?: number;
  calculation_basis?: string;
  notes?: string;
}

interface NoticeBody {
  notice_ref?: string;
  notice_basis?: string;
  annual_contract_value_zar?: number;
  notes?: string;
}

interface ReviewBody {
  review_basis?: string;
  notes?: string;
}

interface AgreeBody {
  agreed_tariff_zar_mwh?: number;
  reason_code?: string;
  review_basis?: string;
  notes?: string;
}

interface ApplyBody {
  agreed_tariff_zar_mwh?: number;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface DisputeBody {
  dispute_ref?: string;
  dispute_basis?: string;
  disputed_amount_zar?: number;
  reason_code?: string;
  notes?: string;
}

interface RecalcBody {
  recalc_ref?: string;
  recalc_basis?: string;
  escalation_factor?: number;
  proposed_tariff_zar_mwh?: number;
  notes?: string;
}

interface ArbitrationBody {
  arbitration_ref?: string;
  arbitration_basis?: string;
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
  action: TariffIdxAction,
  bodyHandler?: (row: TariffIdxRow, body: Record<string, unknown>) => Partial<TariffIdxRow>,
) {
  const user = getCurrentUser(c);
  const allowed = isOfftakerAction(action) ? OFFTAKER_WRITE_ROLES : SELLER_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_tariff_indexation WHERE id = ?').bind(id).first<TariffIdxRow>();
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
  const sla = slaDeadlineFor(to, row.contract_tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
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
    `UPDATE oe_tariff_indexation SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `tidx_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'tariff_indexation',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crossesIntoRegulator(action, row.contract_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_tariff_indexation WHERE id = ?').bind(id).first<TariffIdxRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/publish-index', async (c) => transition(c, 'publish_index', (_row, body) => {
  const b = body as Partial<PublishBody>;
  const out: Partial<TariffIdxRow> = {};
  if (typeof b.index_ref === 'string')              out.index_ref = b.index_ref;
  if (typeof b.index_value === 'number')            out.index_value = b.index_value;
  if (typeof b.index_type === 'string')             out.index_type = b.index_type;
  if (typeof b.index_reference_period === 'string') out.index_reference_period = b.index_reference_period;
  return out;
}));

app.post('/:id/calculate-escalation', async (c) => transition(c, 'calculate_escalation', (_row, body) => {
  const b = body as Partial<CalculateBody>;
  const out: Partial<TariffIdxRow> = {};
  if (typeof b.escalation_factor === 'number')       out.escalation_factor = b.escalation_factor;
  if (typeof b.proposed_tariff_zar_mwh === 'number') out.proposed_tariff_zar_mwh = b.proposed_tariff_zar_mwh;
  if (typeof b.calculation_basis === 'string')       out.calculation_basis = b.calculation_basis;
  return out;
}));

app.post('/:id/issue-notice', async (c) => transition(c, 'issue_notice', (_row, body) => {
  const b = body as Partial<NoticeBody>;
  const out: Partial<TariffIdxRow> = {};
  if (typeof b.notice_ref === 'string')                 out.notice_ref = b.notice_ref;
  if (typeof b.notice_basis === 'string')               out.notice_basis = b.notice_basis;
  if (typeof b.annual_contract_value_zar === 'number')  out.annual_contract_value_zar = b.annual_contract_value_zar;
  return out;
}));

app.post('/:id/reissue-notice', async (c) => transition(c, 'reissue_notice', (_row, body) => {
  const b = body as Partial<NoticeBody>;
  const out: Partial<TariffIdxRow> = {};
  if (typeof b.notice_ref === 'string')   out.notice_ref = b.notice_ref;
  if (typeof b.notice_basis === 'string') out.notice_basis = b.notice_basis;
  return out;
}));

app.post('/:id/begin-review', async (c) => transition(c, 'begin_review', (_row, body) => {
  const b = body as Partial<ReviewBody>;
  const out: Partial<TariffIdxRow> = {};
  if (typeof b.review_basis === 'string') out.review_basis = b.review_basis;
  return out;
}));

app.post('/:id/agree-tariff', async (c) => transition(c, 'agree_tariff', (row, body) => {
  const b = body as Partial<AgreeBody>;
  const out: Partial<TariffIdxRow> = {};
  out.agreed_tariff_zar_mwh = typeof b.agreed_tariff_zar_mwh === 'number'
    ? b.agreed_tariff_zar_mwh
    : (row.proposed_tariff_zar_mwh ?? null) as number;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  if (typeof b.review_basis === 'string') out.review_basis = b.review_basis;
  return out;
}));

app.post('/:id/apply-tariff', async (c) => transition(c, 'apply_tariff', (row, body) => {
  const b = body as Partial<ApplyBody>;
  const out: Partial<TariffIdxRow> = {};
  if (typeof b.agreed_tariff_zar_mwh === 'number') out.agreed_tariff_zar_mwh = b.agreed_tariff_zar_mwh;
  else if (row.agreed_tariff_zar_mwh == null && row.proposed_tariff_zar_mwh != null) out.agreed_tariff_zar_mwh = row.proposed_tariff_zar_mwh;
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<TariffIdxRow> = { dispute_round: (row.dispute_round || 0) + 1 };
  if (typeof b.dispute_ref === 'string')         out.dispute_ref = b.dispute_ref;
  if (typeof b.dispute_basis === 'string')       out.dispute_basis = b.dispute_basis;
  if (typeof b.disputed_amount_zar === 'number') out.disputed_amount_zar = b.disputed_amount_zar;
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/recalculate', async (c) => transition(c, 'recalculate', (_row, body) => {
  const b = body as Partial<RecalcBody>;
  const out: Partial<TariffIdxRow> = {};
  if (typeof b.recalc_ref === 'string')              out.recalc_ref = b.recalc_ref;
  if (typeof b.recalc_basis === 'string')            out.recalc_basis = b.recalc_basis;
  if (typeof b.escalation_factor === 'number')       out.escalation_factor = b.escalation_factor;
  if (typeof b.proposed_tariff_zar_mwh === 'number') out.proposed_tariff_zar_mwh = b.proposed_tariff_zar_mwh;
  return out;
}));

app.post('/:id/refer-arbitration', async (c) => transition(c, 'refer_arbitration', (_row, body) => {
  const b = body as Partial<ArbitrationBody>;
  const out: Partial<TariffIdxRow> = {};
  if (typeof b.arbitration_ref === 'string')   out.arbitration_ref = b.arbitration_ref;
  if (typeof b.arbitration_basis === 'string') out.arbitration_basis = b.arbitration_basis;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')         out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<TariffIdxRow> = {};
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')   out.rod_notes = b.rod_notes;
  return out;
}));

export async function tariffIndexationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_tariff_indexation
     WHERE chain_status NOT IN ('applied','arbitrated','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<TariffIdxRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_tariff_indexation
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `tidx_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'tariff_indexation.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.contract_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.contract_tier)) {
      await fireCascade({
        event: 'tariff_indexation.sla_breached',
        actor_id: 'system',
        entity_type: 'tariff_indexation',
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
