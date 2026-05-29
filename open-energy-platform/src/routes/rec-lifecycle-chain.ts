// ═══════════════════════════════════════════════════════════════════════════
// Wave 70 — REC / Guarantee-of-Origin Certificate Lifecycle chain (P6)
//
// Mounted at /api/rec-lifecycle/chain.
//
// A best-in-class offtaker buys (and must be able to PROVE it owns and has
// CONSUMED) the renewable ATTRIBUTE of its electricity. The attribute travels
// separately from the energy as a tradeable certificate — one per MWh of verified
// renewable generation (I-REC, SAREC / AReP, EU Guarantee-of-Origin). The offtaker
// RETIRES the certificate to substantiate a renewable-consumption claim under the
// GHG Protocol Scope 2 market-based method (RE100 / CDP / carbon-tax offset). The
// lifecycle integrity prevents DOUBLE COUNTING — one MWh attribute is issued once,
// owned by one party at a time, and retired once. See
// src/utils/rec-lifecycle-spec.ts for the full state-machine, tiering and
// reportability rationale.
//
//   issuance_requested → eligibility_review → issued → listed_for_transfer
//     → transferred → allocated → retired
//   eligibility fail:  eligibility_review → rejected
//   dispute:   {transferred, allocated} → disputed → allocated (dismissed)
//                                                  | clawed_back (upheld)
//   cancel:    {issuance_requested, issued, listed_for_transfer} → cancelled
//   expiry:    {issued, listed_for_transfer, transferred, allocated} → expired
//
// Two-party write: the ISSUER / REGISTRY (generator + registry operator) drives
// issuance, eligibility, listing, transfer, dispute resolution, claw-back, cancel
// and expiry; the HOLDER (offtaker) allocates consumption, retires the certificate
// and raises integrity disputes. partyForAction tags each step for the audit trail.
//
// Reportability (the W70 signature, INTEGRITY-driven): claw_back crosses for EVERY
// tier (a revoked certificate is always a double-counting / integrity event);
// reject_issuance and SLA breaches cross for the high tiers (major + critical).
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
  partyForAction,
  isHolderAction,
  tierForCertificate,
  SLA_MINUTES,
  type RecStatus,
  type RecAction,
  type RecTier,
} from '../utils/rec-lifecycle-spec';

// All nine personas may read the REC register.
const READ_ROLES = new Set([
  'admin',
  'offtaker', 'ipp_developer', 'carbon_fund', 'regulator', 'grid_operator', 'lender', 'trader', 'support',
]);

// Two-party write. The issuer / registry (generator side) drives issuance, listing,
// transfer, dispute resolution, claw-back, cancel and expiry; the holder (offtaker)
// allocates consumption, retires and raises integrity disputes.
const ISSUER_ROLES = new Set(['admin', 'ipp_developer']);
const HOLDER_ROLES = new Set(['admin', 'offtaker']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface RecRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  generator_id: string | null;
  generator_name: string | null;
  project_id: string | null;
  project_name: string | null;
  offtaker_id: string;
  offtaker_name: string;
  certificate_standard: string;
  energy_source: string | null;
  certificate_serial: string | null;
  vintage_year: number | null;
  generation_period_start: string | null;
  generation_period_end: string | null;
  mwh_represented: number | null;
  registry: string | null;
  claim_purpose: string | null;
  compliance_critical: number;
  double_counting_checked: number;
  severity_tier: RecTier;
  issuer_id: string | null;
  issuer_name: string | null;
  holder_id: string | null;
  holder_name: string | null;
  issuance_ref: string | null;
  eligibility_ref: string | null;
  transfer_ref: string | null;
  allocation_ref: string | null;
  retirement_ref: string | null;
  dispute_ref: string | null;
  claim_certificate_number: string | null;
  eligibility_basis: string | null;
  issuance_basis: string | null;
  transfer_basis: string | null;
  allocation_basis: string | null;
  retirement_basis: string | null;
  dispute_basis: string | null;
  clawback_basis: string | null;
  rejection_basis: string | null;
  reason_code: string | null;
  resolution_summary: string | null;
  chain_status: RecStatus;
  issuance_requested_at: string;
  eligibility_review_at: string | null;
  issued_at: string | null;
  listed_for_transfer_at: string | null;
  transferred_at: string | null;
  allocated_at: string | null;
  retired_at: string | null;
  cancelled_at: string | null;
  rejected_at: string | null;
  disputed_at: string | null;
  clawed_back_at: string | null;
  expired_at: string | null;
  vintage_expiry_at: string | null;
  dispute_round: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  is_reportable: number;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface RecEventRow {
  id: string;
  rec_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<RecStatus, keyof RecRow | null> = {
  issuance_requested:  'issuance_requested_at',
  eligibility_review:  'eligibility_review_at',
  issued:              'issued_at',
  listed_for_transfer: 'listed_for_transfer_at',
  transferred:         'transferred_at',
  allocated:           'allocated_at',
  retired:             'retired_at',
  cancelled:           'cancelled_at',
  rejected:            'rejected_at',
  disputed:            'disputed_at',
  clawed_back:         'clawed_back_at',
  expired:             'expired_at',
};

function decorate(row: RecRow, now: Date) {
  const tier = row.severity_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

function eventTypeFor(action: RecAction): string {
  switch (action) {
    case 'begin_eligibility_review': return 'rec_lifecycle.eligibility_review';
    case 'approve_issuance':         return 'rec_lifecycle.issued';
    case 'reject_issuance':          return 'rec_lifecycle.rejected';
    case 'list_for_transfer':        return 'rec_lifecycle.listed_for_transfer';
    case 'transfer_certificate':     return 'rec_lifecycle.transferred';
    case 'allocate_consumption':     return 'rec_lifecycle.allocated';
    case 'retire_certificate':       return 'rec_lifecycle.retired';
    case 'raise_dispute':            return 'rec_lifecycle.disputed';
    case 'resolve_dispute':          return 'rec_lifecycle.allocated';
    case 'claw_back':                return 'rec_lifecycle.clawed_back';
    case 'cancel_certificate':       return 'rec_lifecycle.cancelled';
    case 'expire_certificate':       return 'rec_lifecycle.expired';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const severity_tier        = c.req.query('severity_tier');
  const certificate_standard = c.req.query('certificate_standard');
  const registry             = c.req.query('registry');
  const status               = c.req.query('status');
  const breached             = c.req.query('breached');
  const reportable           = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_rec_lifecycle WHERE 1=1';
  const binds: unknown[] = [];
  if (severity_tier)        { sql += ' AND severity_tier = ?';        binds.push(severity_tier); }
  if (certificate_standard) { sql += ' AND certificate_standard = ?'; binds.push(certificate_standard); }
  if (registry)             { sql += ' AND registry = ?';             binds.push(registry); }
  if (status)               { sql += ' AND chain_status = ?';         binds.push(status); }

  sql += ' ORDER BY datetime(issuance_requested_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RecRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_certificate_standard: Record<string, number> = {};
  const by_registry: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.severity_tier] = (by_tier[i.severity_tier] || 0) + 1;
    if (i.certificate_standard) by_certificate_standard[i.certificate_standard] = (by_certificate_standard[i.certificate_standard] || 0) + 1;
    if (i.registry) by_registry[i.registry] = (by_registry[i.registry] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const issued_count      = items.filter((i) => i.chain_status === 'issued').length;
  const retired_count     = items.filter((i) => i.chain_status === 'retired').length;
  const disputed_count    = items.filter((i) => i.chain_status === 'disputed').length;
  const clawed_back_count = items.filter((i) => i.chain_status === 'clawed_back').length;
  const rejected_count    = items.filter((i) => i.chain_status === 'rejected').length;
  const expired_count     = items.filter((i) => i.chain_status === 'expired').length;
  const cancelled_count   = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const compliance_open   = items.filter((i) => !i.is_terminal && i.compliance_critical).length;
  const high_open         = items.filter((i) =>
    !i.is_terminal && (i.severity_tier === 'major' || i.severity_tier === 'critical')).length;
  const total_mwh = items.reduce((sum, i) => sum + (i.mwh_represented || 0), 0);
  const retired_mwh = items
    .filter((i) => i.chain_status === 'retired')
    .reduce((sum, i) => sum + (i.mwh_represented || 0), 0);
  const clawed_back_mwh = items
    .filter((i) => i.chain_status === 'clawed_back')
    .reduce((sum, i) => sum + (i.mwh_represented || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_certificate_standard,
      by_registry,
      open_count,
      issued_count,
      retired_count,
      disputed_count,
      clawed_back_count,
      rejected_count,
      expired_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      compliance_open,
      high_open,
      total_mwh,
      retired_mwh,
      clawed_back_mwh,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_rec_lifecycle WHERE id = ?').bind(id).first<RecRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_rec_lifecycle_events WHERE rec_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RecEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface EligibilityBody {
  eligibility_basis?: string;
  eligibility_ref?: string;
  mwh_represented?: number;
  compliance_critical?: boolean;
  notes?: string;
}
interface IssueBody {
  issuance_basis?: string;
  issuance_ref?: string;
  certificate_serial?: string;
  notes?: string;
}
interface RejectBody {
  rejection_basis?: string;
  reason_code?: string;
  notes?: string;
}
interface ListBody {
  transfer_basis?: string;
  notes?: string;
}
interface TransferBody {
  transfer_basis?: string;
  transfer_ref?: string;
  holder_id?: string;
  holder_name?: string;
  notes?: string;
}
interface AllocateBody {
  allocation_basis?: string;
  allocation_ref?: string;
  notes?: string;
}
interface RetireBody {
  retirement_basis?: string;
  retirement_ref?: string;
  claim_certificate_number?: string;
  resolution_summary?: string;
  notes?: string;
}
interface DisputeBody {
  dispute_basis?: string;
  dispute_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface ResolveBody {
  dispute_basis?: string;
  resolution_summary?: string;
  notes?: string;
}
interface ClawbackBody {
  clawback_basis?: string;
  reason_code?: string;
  resolution_summary?: string;
  notes?: string;
}
interface CancelBody {
  reason_code?: string;
  resolution_summary?: string;
  notes?: string;
}
interface ExpireBody {
  reason_code?: string;
  resolution_summary?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: RecAction,
  bodyHandler?: (row: RecRow, body: Record<string, unknown>) => Partial<RecRow>,
) {
  const user = getCurrentUser(c);
  const allowedRoles = isHolderAction(action) ? HOLDER_ROLES : ISSUER_ROLES;
  if (!user || !allowedRoles.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_rec_lifecycle WHERE id = ?').bind(id).first<RecRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier can be re-derived when eligibility review restates the certified volume or
  // the compliance-claim flag; otherwise the row's recorded severity stands.
  const effectiveMwh = (overrides.mwh_represented ?? row.mwh_represented) ?? 0;
  const effectiveCritical = (overrides.compliance_critical ?? row.compliance_critical) ? true : false;
  let effectiveTier: RecTier = row.severity_tier;
  if (overrides.mwh_represented != null || overrides.compliance_critical != null) {
    effectiveTier = tierForCertificate(effectiveMwh, effectiveCritical);
    overrides.severity_tier = effectiveTier;
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier);
  if (crosses) overrides.is_reportable = 1;

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
    `UPDATE oe_rec_lifecycle SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `rec_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_rec_lifecycle_events (id, rec_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'rec_lifecycle',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      severity_tier: effectiveTier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_rec_lifecycle WHERE id = ?').bind(id).first<RecRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-eligibility-review', async (c) => transition(c, 'begin_eligibility_review', (_row, body) => {
  const b = body as Partial<EligibilityBody>;
  const out: Partial<RecRow> = {};
  if (typeof b.eligibility_basis === 'string')   out.eligibility_basis = b.eligibility_basis;
  if (typeof b.eligibility_ref === 'string')     out.eligibility_ref = b.eligibility_ref;
  if (typeof b.mwh_represented === 'number')     out.mwh_represented = b.mwh_represented;
  if (typeof b.compliance_critical === 'boolean') out.compliance_critical = b.compliance_critical ? 1 : 0;
  if (typeof b.compliance_critical === 'boolean') out.double_counting_checked = 1;
  return out;
}));

app.post('/:id/approve-issuance', async (c) => transition(c, 'approve_issuance', (_row, body) => {
  const b = body as Partial<IssueBody>;
  const out: Partial<RecRow> = {};
  if (typeof b.issuance_basis === 'string')     out.issuance_basis = b.issuance_basis;
  if (typeof b.issuance_ref === 'string')       out.issuance_ref = b.issuance_ref;
  if (typeof b.certificate_serial === 'string') out.certificate_serial = b.certificate_serial;
  return out;
}));

app.post('/:id/reject-issuance', async (c) => transition(c, 'reject_issuance', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<RecRow> = { escalation_level: 1 };
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/list-for-transfer', async (c) => transition(c, 'list_for_transfer', (_row, body) => {
  const b = body as Partial<ListBody>;
  const out: Partial<RecRow> = {};
  if (typeof b.transfer_basis === 'string') out.transfer_basis = b.transfer_basis;
  return out;
}));

app.post('/:id/transfer-certificate', async (c) => transition(c, 'transfer_certificate', (_row, body) => {
  const b = body as Partial<TransferBody>;
  const out: Partial<RecRow> = {};
  if (typeof b.transfer_basis === 'string') out.transfer_basis = b.transfer_basis;
  if (typeof b.transfer_ref === 'string')   out.transfer_ref = b.transfer_ref;
  if (typeof b.holder_id === 'string')      out.holder_id = b.holder_id;
  if (typeof b.holder_name === 'string')    out.holder_name = b.holder_name;
  return out;
}));

app.post('/:id/allocate-consumption', async (c) => transition(c, 'allocate_consumption', (_row, body) => {
  const b = body as Partial<AllocateBody>;
  const out: Partial<RecRow> = {};
  if (typeof b.allocation_basis === 'string') out.allocation_basis = b.allocation_basis;
  if (typeof b.allocation_ref === 'string')   out.allocation_ref = b.allocation_ref;
  return out;
}));

app.post('/:id/retire-certificate', async (c) => transition(c, 'retire_certificate', (_row, body) => {
  const b = body as Partial<RetireBody>;
  const out: Partial<RecRow> = {};
  if (typeof b.retirement_basis === 'string')          out.retirement_basis = b.retirement_basis;
  if (typeof b.retirement_ref === 'string')            out.retirement_ref = b.retirement_ref;
  if (typeof b.claim_certificate_number === 'string')  out.claim_certificate_number = b.claim_certificate_number;
  if (typeof b.resolution_summary === 'string')        out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<RecRow> = { dispute_round: (row.dispute_round || 0) + 1, escalation_level: 1 };
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.dispute_ref === 'string')   out.dispute_ref = b.dispute_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveBody>;
  const out: Partial<RecRow> = { escalation_level: 0 };
  if (typeof b.dispute_basis === 'string')      out.dispute_basis = b.dispute_basis;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/claw-back', async (c) => transition(c, 'claw_back', (_row, body) => {
  const b = body as Partial<ClawbackBody>;
  const out: Partial<RecRow> = { escalation_level: 2 };
  if (typeof b.clawback_basis === 'string')     out.clawback_basis = b.clawback_basis;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/cancel-certificate', async (c) => transition(c, 'cancel_certificate', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<RecRow> = {};
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

app.post('/:id/expire-certificate', async (c) => transition(c, 'expire_certificate', (_row, body) => {
  const b = body as Partial<ExpireBody>;
  const out: Partial<RecRow> = {};
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.resolution_summary === 'string') out.resolution_summary = b.resolution_summary;
  return out;
}));

// SLA sweep: record an SLA breach on any non-terminal case past its deadline,
// crossing to the regulator for the high tiers (major + critical).
export async function recLifecycleSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_rec_lifecycle
     WHERE chain_status NOT IN ('retired','cancelled','rejected','clawed_back','expired')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RecRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_rec_lifecycle
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `rec_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_rec_lifecycle_events (id, rec_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'rec_lifecycle.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.severity_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.severity_tier)) {
      await env.DB.prepare('UPDATE oe_rec_lifecycle SET is_reportable = 1 WHERE id = ?').bind(row.id).run();
      await fireCascade({
        event: 'rec_lifecycle.sla_breached',
        actor_id: 'system',
        entity_type: 'rec_lifecycle',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }

    breached++;
  }

  return { scanned: rows.length, breached };
}

export default app;
