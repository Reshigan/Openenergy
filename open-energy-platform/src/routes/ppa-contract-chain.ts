// ═══════════════════════════════════════════════════════════════════════════
// Wave 22 — Offtaker PPA contract execution lifecycle.
//
// Mounted at /api/offtaker/ppa-contract-chain.
//
// 9-state machine — the offtaker drives lifecycle progress; IPP & lender
// observe; regulator inbox on strategic-tier execute + terminate + breach.
//
// State machine and tier classification live in
// utils/ppa-contract-chain-spec.ts; this file is the route + persistence.
//
// Roles:
//   READ:  admin, support, offtaker, ipp, ipp_developer, wind, regulator, lender
//   WRITE: admin, support, offtaker (all transitions)
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  advance,
  slaDueAt,
  isTerminal,
  isTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  tierFromMw,
  SLA_MINUTES,
  type PpaStatus,
  type PpaAction,
  type PpaTier,
} from '../utils/ppa-contract-chain-spec';

const READ_ROLES  = new Set(['admin', 'support', 'offtaker', 'ipp', 'ipp_developer', 'wind', 'regulator', 'lender']);
const WRITE_ROLES = new Set(['admin', 'support', 'offtaker']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface PpaRow {
  id: string;
  ppa_number: string;
  project_id: string | null;
  facility_id: string | null;
  participant_id: string;
  offtaker_id: string;
  project_name: string;
  offtaker_name: string;
  contract_term_years: number;
  capacity_mw: number;
  capacity_tier: PpaTier;
  tariff_zar_per_mwh: number | null;
  indexation: string | null;
  take_or_pay_pct: number | null;
  chain_status: PpaStatus;
  draft_at: string | null;
  negotiation_at: string | null;
  terms_locked_at: string | null;
  legal_signed_at: string | null;
  executed_at: string | null;
  in_force_at: string | null;
  dispute_at: string | null;
  resolved_at: string | null;
  terminated_at: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  nersa_section34_ref: string | null;
  legal_counterparty_ref: string | null;
  board_approval_ref: string | null;
  termination_reason: string | null;
  cancellation_reason: string | null;
  dispute_notes: string | null;
  contract_notes: string | null;
  expiry_date: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  ppa_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function minutesUntil(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  return Math.round((new Date(deadline).getTime() - now.getTime()) / 60000);
}

function decorate(row: PpaRow, now: Date) {
  const breach = row.sla_deadline_at ? new Date(row.sla_deadline_at).getTime() < now.getTime() : false;
  return {
    ...row,
    is_terminal: isTerminal(row.chain_status),
    minutes_until_sla: minutesUntil(row.sla_deadline_at, now),
    sla_breached: !isTerminal(row.chain_status) && breach,
  };
}

// ─── List PPAs (+ filters) ─────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const tier = c.req.query('capacity_tier');
  const off = c.req.query('offtaker_id');
  const part = c.req.query('participant_id');
  const proj = c.req.query('project_id');

  let sql = 'SELECT * FROM oe_ppa_contract_chain WHERE 1=1';
  const params: unknown[] = [];
  if (cs)   { sql += ' AND chain_status = ?';   params.push(cs); }
  if (tier) { sql += ' AND capacity_tier = ?';  params.push(tier); }
  if (off)  { sql += ' AND offtaker_id = ?';    params.push(off); }
  if (part) { sql += ' AND participant_id = ?'; params.push(part); }
  if (proj) { sql += ' AND project_id = ?';     params.push(proj); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<PpaRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  let breached = 0;
  let strategic_open = 0;
  let escalated = 0;
  let in_negotiation_count = 0;
  let executed_count = 0;
  let in_force_count = 0;
  let in_dispute_count = 0;
  let terminated_count = 0;
  let total_contracted_mw = 0;
  for (const r of rows) {
    by_status[r.chain_status] = (by_status[r.chain_status] ?? 0) + 1;
    by_tier[r.capacity_tier]  = (by_tier[r.capacity_tier]  ?? 0) + 1;
    if (r.sla_breached) breached++;
    if (r.capacity_tier === 'strategic' && !isTerminal(r.chain_status)) strategic_open++;
    if (r.escalation_level > 0) escalated++;
    if (['draft','in_negotiation','terms_locked','legal_signed'].includes(r.chain_status)) in_negotiation_count++;
    if (r.chain_status === 'executed') executed_count++;
    if (r.chain_status === 'in_force') {
      in_force_count++;
      total_contracted_mw += r.capacity_mw || 0;
    }
    if (r.chain_status === 'in_dispute') in_dispute_count++;
    if (r.chain_status === 'terminated') terminated_count++;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      by_tier,
      breached,
      strategic_open,
      escalated,
      in_negotiation_count,
      executed_count,
      in_force_count,
      in_dispute_count,
      terminated_count,
      total_contracted_mw,
    },
  });
});

// ─── Drill: PPA + audit ────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_contract_chain WHERE id = ?').bind(id).first<PpaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ppa_contract_chain_events WHERE ppa_id = ? ORDER BY datetime(created_at) ASC'
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      ppa: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ExecuteBody {
  nersa_section34_ref?: string;
  board_approval_ref?: string;
  legal_counterparty_ref?: string;
  notes?: string;
}

interface DisputeBody {
  dispute_notes?: string;
  notes?: string;
}

interface TerminateBody {
  reason?: string;
  notes?: string;
}

// Per-action timestamp column.
const TIMESTAMP_COLUMN: Partial<Record<PpaAction, string>> = {
  begin_negotiation: 'negotiation_at',
  lock_terms:        'terms_locked_at',
  legal_sign:        'legal_signed_at',
  execute:           'executed_at',
  commence:          'in_force_at',
  dispute:           'dispute_at',
  resolve:           'resolved_at',
  terminate:         'terminated_at',
  expire:            'expired_at',
  cancel:            'cancelled_at',
};

// ─── Transition helper ─────────────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  id: string,
  action: PpaAction,
  eventType: string,
  notes?: string,
  execute?: ExecuteBody,
  dispute?: DisputeBody,
  terminate?: TerminateBody,
  cancelReason?: string,
): Promise<Response> {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB.prepare('SELECT * FROM oe_ppa_contract_chain WHERE id = ?').bind(id).first<PpaRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const tier: PpaTier = isTier(row.capacity_tier)
    ? row.capacity_tier
    : tierFromMw(row.capacity_mw ?? 0);

  let next: PpaStatus;
  try { next = advance(row.chain_status, action); }
  catch (err) { return c.json({ success: false, error: (err as Error).message }, 409); }

  const now = new Date();
  const sla = slaDueAt(now, next, tier);

  const updates: string[] = ['chain_status = ?', 'sla_deadline_at = ?', 'updated_at = ?'];
  const bindings: unknown[] = [next, sla || null, now.toISOString()];

  const tsCol = TIMESTAMP_COLUMN[action];
  if (tsCol) {
    updates.push(`${tsCol} = ?`);
    bindings.push(now.toISOString());
  }

  if (action === 'execute') {
    if (execute?.nersa_section34_ref)    { updates.push('nersa_section34_ref = ?');    bindings.push(execute.nersa_section34_ref); }
    if (execute?.board_approval_ref)     { updates.push('board_approval_ref = ?');     bindings.push(execute.board_approval_ref); }
    if (execute?.legal_counterparty_ref) { updates.push('legal_counterparty_ref = ?'); bindings.push(execute.legal_counterparty_ref); }
  }

  if (action === 'commence') {
    if (row.executed_at && row.contract_term_years) {
      const exec = new Date(row.executed_at);
      const exp = new Date(exec.getFullYear() + row.contract_term_years, exec.getMonth(), exec.getDate());
      updates.push('expiry_date = ?');
      bindings.push(exp.toISOString().slice(0, 10));
    }
  }

  if (action === 'dispute' && dispute?.dispute_notes) {
    updates.push('dispute_notes = ?');
    bindings.push(dispute.dispute_notes);
  }

  if (action === 'terminate' && terminate?.reason) {
    updates.push('termination_reason = ?');
    bindings.push(terminate.reason);
  }

  if (action === 'cancel' && cancelReason) {
    updates.push('cancellation_reason = ?');
    bindings.push(cancelReason);
  }

  if (notes) {
    updates.push('contract_notes = COALESCE(contract_notes, \'\') || ?');
    bindings.push(`\n[${now.toISOString()}] ${notes}`);
  }

  bindings.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ppa_contract_chain SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  const evtId = newId('ppa_evt');
  const payload: Record<string, unknown> = {
    capacity_mw: row.capacity_mw,
    capacity_tier: tier,
    offtaker_name: row.offtaker_name,
    crosses_to_regulator: crossesIntoRegulator(action, tier),
  };
  if (action === 'execute' && execute) {
    payload.nersa_section34_ref = execute.nersa_section34_ref ?? row.nersa_section34_ref ?? null;
    payload.board_approval_ref = execute.board_approval_ref ?? row.board_approval_ref ?? null;
  }
  if (action === 'terminate' && terminate?.reason) {
    payload.termination_reason = terminate.reason;
  }
  if (action === 'dispute' && dispute?.dispute_notes) {
    payload.dispute_notes = dispute.dispute_notes;
  }
  if (action === 'cancel' && cancelReason) {
    payload.cancellation_reason = cancelReason;
  }

  await c.env.DB.prepare(
    'INSERT INTO oe_ppa_contract_chain_events (id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(evtId, id, eventType, row.chain_status, next, user.id, notes ?? null, JSON.stringify(payload), now.toISOString()).run();

  await fireCascade({
    event: `ppa_contract.${eventType}` as never,
    actor_id: user.id,
    entity_type: 'ppa_contract_chain',
    entity_id: id,
    data: {
      ppa_number: row.ppa_number,
      project_name: row.project_name,
      offtaker_name: row.offtaker_name,
      participant_id: row.participant_id,
      offtaker_id: row.offtaker_id,
      project_id: row.project_id,
      capacity_mw: row.capacity_mw,
      capacity_tier: tier,
      nersa_section34_ref: execute?.nersa_section34_ref ?? row.nersa_section34_ref ?? null,
      termination_reason: terminate?.reason ?? row.termination_reason ?? null,
      from_status: row.chain_status,
      to_status: next,
      crosses_to_regulator: crossesIntoRegulator(action, tier),
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, chain_status: next, sla_deadline_at: sla } });
}

// ─── Transitions ───────────────────────────────────────────────────────────
app.post('/:id/begin-negotiation', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'begin_negotiation', 'negotiation_started', body.notes);
});
app.post('/:id/lock-terms', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'lock_terms', 'terms_locked', body.notes);
});
app.post('/:id/legal-sign', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'legal_sign', 'legal_signed', body.notes);
});
app.post('/:id/execute', async (c) => {
  const body = await c.req.json().catch(() => ({})) as ExecuteBody;
  return transition(c, c.req.param('id'), 'execute', 'executed', body.notes, body);
});
app.post('/:id/commence', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'commence', 'commenced', body.notes);
});
app.post('/:id/dispute', async (c) => {
  const body = await c.req.json().catch(() => ({})) as DisputeBody;
  return transition(c, c.req.param('id'), 'dispute', 'disputed', body.notes, undefined, body);
});
app.post('/:id/resolve', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'resolve', 'resolved', body.notes);
});
app.post('/:id/terminate', async (c) => {
  const body = await c.req.json().catch(() => ({})) as TerminateBody;
  return transition(c, c.req.param('id'), 'terminate', 'terminated', body.notes, undefined, undefined, body);
});
app.post('/:id/expire', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'expire', 'expired', body.notes);
});
app.post('/:id/cancel', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { reason?: string; notes?: string };
  return transition(c, c.req.param('id'), 'cancel', 'cancelled', body.notes, undefined, undefined, undefined, body.reason);
});

// ─── 15-minute SLA sweep ───────────────────────────────────────────────────
export async function ppaContractSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number; expired: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ppa_contract_chain
       WHERE chain_status NOT IN ('terminated', 'expired', 'cancelled', 'in_force')
         AND sla_deadline_at IS NOT NULL
         AND datetime(sla_deadline_at) < datetime('now')
         AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(?))`
  ).bind(oneHourAgo).all<PpaRow>();

  let breached = 0;
  for (const row of (rs.results || [])) {
    const tier: PpaTier = isTier(row.capacity_tier)
      ? row.capacity_tier
      : tierFromMw(row.capacity_mw ?? 0);

    await env.DB.prepare(
      'UPDATE oe_ppa_contract_chain SET last_sla_breach_at = ?, escalation_level = escalation_level + 1 WHERE id = ?'
    ).bind(now.toISOString(), row.id).run();

    const slaMins = SLA_MINUTES[row.chain_status]?.[tier] ?? 0;
    const evtId = newId('ppa_evt');
    await env.DB.prepare(
      'INSERT INTO oe_ppa_contract_chain_events (id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evtId, row.id, 'sla_breached', row.chain_status, row.chain_status, 'system', `Breached ${slaMins}m SLA`, '{}', now.toISOString()).run();

    await fireCascade({
      event: 'ppa_contract.sla_breached',
      actor_id: 'system',
      entity_type: 'ppa_contract_chain',
      entity_id: row.id,
      data: {
        ppa_number: row.ppa_number,
        project_name: row.project_name,
        offtaker_name: row.offtaker_name,
        capacity_tier: tier,
        capacity_mw: row.capacity_mw,
        chain_status: row.chain_status,
        sla_window: `${slaMins}m`,
        crosses_to_regulator: slaBreachCrossesIntoRegulator(tier),
      },
      env,
    });
    breached++;
  }

  // Auto-expire in_force contracts past their expiry_date.
  const exps = await env.DB.prepare(
    `SELECT * FROM oe_ppa_contract_chain
       WHERE chain_status = 'in_force'
         AND expiry_date IS NOT NULL
         AND date(expiry_date) < date('now')`
  ).all<PpaRow>();

  let expired = 0;
  for (const row of (exps.results || [])) {
    await env.DB.prepare(
      `UPDATE oe_ppa_contract_chain SET chain_status = 'expired', expired_at = ?, updated_at = ?, sla_deadline_at = NULL WHERE id = ?`
    ).bind(now.toISOString(), now.toISOString(), row.id).run();

    const evtId = newId('ppa_evt');
    await env.DB.prepare(
      'INSERT INTO oe_ppa_contract_chain_events (id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evtId, row.id, 'expired', 'in_force', 'expired', 'system', `Auto-expired at end of ${row.contract_term_years}-year term`, '{}', now.toISOString()).run();

    await fireCascade({
      event: 'ppa_contract.expired',
      actor_id: 'system',
      entity_type: 'ppa_contract_chain',
      entity_id: row.id,
      data: {
        ppa_number: row.ppa_number,
        project_name: row.project_name,
        offtaker_name: row.offtaker_name,
        capacity_tier: row.capacity_tier,
        capacity_mw: row.capacity_mw,
        from_status: 'in_force',
        to_status: 'expired',
      },
      env,
    });
    expired++;
  }

  return { scanned: (rs.results || []).length, breached, expired };
}

export default app;
