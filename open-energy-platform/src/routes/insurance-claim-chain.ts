// ═══════════════════════════════════════════════════════════════════════════
// Wave 23 — Insurance claim chain (FSCA Section 38).
//
// Mounted at /api/insurance/claim-chain.
//
// 10-state machine — IPP (insured) submits; insurer + adjuster assess;
// regulator inbox on catastrophic-tier settle + decline + breach.
//
// State machine and tier classification live in
// utils/insurance-claim-chain-spec.ts; this file is the route + persistence.
//
// Roles:
//   READ:  admin, support, ipp, ipp_developer, wind, lender, regulator, oem
//   WRITE: admin, support, ipp, ipp_developer, wind, oem (all transitions)
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
  SLA_MINUTES,
  type InsuranceClaimStatus,
  type InsuranceClaimAction,
  type InsuranceClaimTier,
} from '../utils/insurance-claim-chain-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'ipp', 'ipp_developer', 'wind',
  'lender', 'funder', 'regulator', 'oem',
]);
const WRITE_ROLES = new Set([
  'admin', 'support',
  'ipp', 'ipp_developer', 'wind', 'oem',
]);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ClaimRow {
  id: string;
  claim_number: string;
  project_id: string | null;
  facility_id: string | null;
  participant_id: string;
  insurer_name: string;
  policy_number: string;
  cover_type: string;
  incident_type: string;
  incident_date: string;
  asset_description: string;
  claim_value_zar: number;
  claim_value_tier: InsuranceClaimTier;
  agreed_value_zar: number | null;
  settled_value_zar: number | null;
  excess_zar: number | null;
  loss_adjuster_name: string | null;
  loss_adjuster_ref: string | null;
  fsca_report_ref: string | null;
  reinsurance_layer: string | null;
  chain_status: InsuranceClaimStatus;
  notified_at: string | null;
  assessing_at: string | null;
  adjuster_assigned_at: string | null;
  quantum_proposed_at: string | null;
  quantum_agreed_at: string | null;
  disputed_at: string | null;
  resolved_at: string | null;
  settled_at: string | null;
  declined_at: string | null;
  closed_at: string | null;
  withdrawn_at: string | null;
  decline_reason: string | null;
  withdrawal_reason: string | null;
  dispute_notes: string | null;
  claim_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  claim_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<InsuranceClaimStatus, keyof ClaimRow | null> = {
  notified:          'notified_at',
  assessing:         'assessing_at',
  adjuster_assigned: 'adjuster_assigned_at',
  quantum_proposed:  'quantum_proposed_at',
  quantum_agreed:    'quantum_agreed_at',
  disputed:          'disputed_at',
  settled:           'settled_at',
  declined:          'declined_at',
  closed:            'closed_at',
  withdrawn:         'withdrawn_at',
};

function decorate(row: ClaimRow, now: Date) {
  const tier = row.claim_value_tier;
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
  };
}

function eventTypeFor(action: InsuranceClaimAction): string {
  switch (action) {
    case 'begin_assessment':  return 'assessment_started';
    case 'assign_adjuster':   return 'adjuster_assigned';
    case 'propose_quantum':   return 'quantum_proposed';
    case 'agree_quantum':     return 'quantum_agreed';
    case 'dispute':           return 'disputed';
    case 'resolve_dispute':   return 'dispute_resolved';
    case 'settle':            return 'settled';
    case 'decline':           return 'declined';
    case 'close':             return 'closed';
    case 'withdraw':          return 'withdrawn';
  }
}

function cascadeEventFor(action: InsuranceClaimAction): string {
  switch (action) {
    case 'begin_assessment':  return 'insurance_claim.assessing';
    case 'assign_adjuster':   return 'insurance_claim.adjuster_assigned';
    case 'propose_quantum':   return 'insurance_claim.quantum_proposed';
    case 'agree_quantum':     return 'insurance_claim.quantum_agreed';
    case 'dispute':           return 'insurance_claim.disputed';
    case 'resolve_dispute':   return 'insurance_claim.dispute_resolved';
    case 'settle':            return 'insurance_claim.settled';
    case 'decline':           return 'insurance_claim.declined';
    case 'close':             return 'insurance_claim.closed';
    case 'withdraw':          return 'insurance_claim.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier = c.req.query('tier');
  const status = c.req.query('status');
  const breached = c.req.query('breached');

  let sql = 'SELECT * FROM oe_insurance_claim_chain WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)   { sql += ' AND claim_value_tier = ?'; binds.push(tier); }
  if (status) { sql += ' AND chain_status = ?';     binds.push(status); }

  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ClaimRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.claim_value_tier] = (by_tier[i.claim_value_tier] || 0) + 1;
  }

  const catastrophic_open = items.filter(
    (i) => i.claim_value_tier === 'catastrophic' && !i.is_terminal,
  ).length;
  const total_claimed_zar = items.reduce((s, i) => s + (i.claim_value_zar || 0), 0);
  const total_settled_zar = items
    .filter((i) => i.chain_status === 'settled' || i.chain_status === 'closed')
    .reduce((s, i) => s + (i.settled_value_zar || i.agreed_value_zar || 0), 0);
  const open_count = items.filter((i) => !i.is_terminal).length;
  const breached_count = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const escalated_count = items.filter((i) => (i.escalation_level || 0) > 0).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      catastrophic_open,
      open_count,
      breached: breached_count,
      escalated: escalated_count,
      total_claimed_zar,
      total_settled_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_insurance_claim_chain WHERE id = ?').bind(id).first<ClaimRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_insurance_claim_chain_events WHERE claim_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      claim: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ProposeQuantumBody {
  agreed_value_zar: number;
  loss_adjuster_name?: string;
  loss_adjuster_ref?: string;
  fsca_report_ref?: string;
  notes?: string;
}

interface SettleBody {
  settled_value_zar: number;
  notes?: string;
}

interface DisputeBody {
  dispute_notes: string;
}

interface DeclineBody {
  decline_reason: string;
  notes?: string;
}

interface WithdrawBody {
  withdrawal_reason: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: InsuranceClaimAction,
  bodyHandler?: (row: ClaimRow, body: Record<string, unknown>) => Partial<ClaimRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_insurance_claim_chain WHERE id = ?').bind(id).first<ClaimRow>();
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
  const sla = slaDeadlineFor(to, row.claim_value_tier, now);
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
    `UPDATE oe_insurance_claim_chain SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `clm_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_insurance_claim_chain_events (id, claim_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = cascadeEventFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'insurance_claim',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.claim_value_tier),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_insurance_claim_chain WHERE id = ?').bind(id).first<ClaimRow>();
  return c.json({ success: true, data: { claim: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/begin-assessment', async (c) => transition(c, 'begin_assessment'));

app.post('/:id/assign-adjuster', async (c) => transition(c, 'assign_adjuster', (_row, body) => {
  const out: Partial<ClaimRow> = {};
  if (typeof body.loss_adjuster_name === 'string') out.loss_adjuster_name = body.loss_adjuster_name;
  if (typeof body.loss_adjuster_ref === 'string')  out.loss_adjuster_ref = body.loss_adjuster_ref;
  return out;
}));

app.post('/:id/propose-quantum', async (c) => transition(c, 'propose_quantum', (_row, body) => {
  const b = body as Partial<ProposeQuantumBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.agreed_value_zar === 'number') out.agreed_value_zar = b.agreed_value_zar;
  if (typeof b.loss_adjuster_name === 'string') out.loss_adjuster_name = b.loss_adjuster_name;
  if (typeof b.loss_adjuster_ref === 'string')  out.loss_adjuster_ref = b.loss_adjuster_ref;
  if (typeof b.fsca_report_ref === 'string')    out.fsca_report_ref = b.fsca_report_ref;
  return out;
}));

app.post('/:id/agree-quantum', async (c) => transition(c, 'agree_quantum'));

app.post('/:id/dispute', async (c) => transition(c, 'dispute', (_row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.dispute_notes === 'string') out.dispute_notes = b.dispute_notes;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, _body) => ({
  resolved_at: new Date().toISOString(),
})));

app.post('/:id/settle', async (c) => transition(c, 'settle', (row, body) => {
  const b = body as Partial<SettleBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.settled_value_zar === 'number') {
    out.settled_value_zar = b.settled_value_zar;
  } else if (row.agreed_value_zar != null) {
    out.settled_value_zar = row.agreed_value_zar;
  }
  return out;
}));

app.post('/:id/decline', async (c) => transition(c, 'decline', (_row, body) => {
  const b = body as Partial<DeclineBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.decline_reason === 'string') out.decline_reason = b.decline_reason;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close'));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<ClaimRow> = {};
  if (typeof b.withdrawal_reason === 'string') out.withdrawal_reason = b.withdrawal_reason;
  return out;
}));

export async function insuranceClaimSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_insurance_claim_chain
     WHERE chain_status NOT IN ('settled','declined','closed','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ClaimRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_insurance_claim_chain
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `clm_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_insurance_claim_chain_events (id, claim_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.claim_value_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.claim_value_tier)) {
      await fireCascade({
        event: 'insurance_claim.sla_breached',
        actor_id: 'system',
        entity_type: 'insurance_claim',
        entity_id: row.id,
        data: { ...row, sla_window: row.chain_status },
        env,
      });
    }

    breached++;
  }

  return { scanned: rows.length, breached };
}

export default app;
