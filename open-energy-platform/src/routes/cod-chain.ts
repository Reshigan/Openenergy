// ═══════════════════════════════════════════════════════════════════════════
// Wave 20 — IPP construction → COD certification chain (NERSA §C-5 + DMRE).
//
// Mounted at /api/ipp/cod-chain.
//
// 10-state machine — the IPP project's construction-to-COD lifecycle.
//   draft → epc_signed → ntp_issued → mobilization → mechanical_complete
//     → cold_commissioning → grid_synchronized → reliability_run → cod_certified
//   cancel — any pre-cod_certified non-terminal → cancelled
//
// Capacity tier (auto from capacity_mw if invalid):
//   large ≥ 100MW | medium ≥ 10MW | small < 10MW
//
// Per-tier SLA windows enforced by the 15-minute cron sweep. Bigger projects
// get MORE time at every stage (real construction durations: 18mo for large
// vs 6mo for small at the longest stage — mobilization).
//
// Regulator inbox crossings (NERSA Grid Code §C-5 + DMRE registry):
//   • certify_cod for large-tier — NERSA SCADA + DMRE generation registry
//   • cancel      for large-tier — bid-window allocation surrender
//   • sla_breached for large-tier — delivery risk to NERSA grid-planning
//
// Roles:
//   READ:  admin, support, ipp, ipp_developer, wind, grid, grid_operator, regulator, lender
//   WRITE: admin, support, ipp, ipp_developer, wind
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
  type CodStatus,
  type CodAction,
  type CodTier,
} from '../utils/cod-chain-spec';

const READ_ROLES  = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'grid', 'grid_operator', 'regulator', 'lender']);
const WRITE_ROLES = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'wind']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface CodRow {
  id: string;
  cod_number: string;
  project_id: string | null;
  participant_id: string;
  project_name: string;
  epc_contract_id: string | null;
  epc_contractor_name: string | null;
  capacity_mw: number;
  capacity_tier: CodTier;
  chain_status: CodStatus;
  target_cod_date: string | null;
  actual_cod_date: string | null;
  epc_signed_at: string | null;
  ntp_issued_at: string | null;
  mobilization_at: string | null;
  mechanical_complete_at: string | null;
  cold_comm_at: string | null;
  grid_sync_at: string | null;
  reliability_run_at: string | null;
  cod_certified_at: string | null;
  ie_certifier: string | null;
  ie_cert_doc_ref: string | null;
  nersa_scada_ref: string | null;
  cancellation_reason: string | null;
  construction_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  cod_id: string;
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

function decorate(row: CodRow, now: Date) {
  const breach = row.sla_deadline_at ? new Date(row.sla_deadline_at).getTime() < now.getTime() : false;
  return {
    ...row,
    is_terminal: isTerminal(row.chain_status),
    minutes_until_sla: minutesUntil(row.sla_deadline_at, now),
    sla_breached: !isTerminal(row.chain_status) && breach,
  };
}

// ─── List COD chains (+ filters) ───────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const tier = c.req.query('capacity_tier');
  const part = c.req.query('participant_id');
  const proj = c.req.query('project_id');

  let sql = 'SELECT * FROM oe_cod_chain WHERE 1=1';
  const params: unknown[] = [];
  if (cs)   { sql += ' AND chain_status = ?';   params.push(cs); }
  if (tier) { sql += ' AND capacity_tier = ?';  params.push(tier); }
  if (part) { sql += ' AND participant_id = ?'; params.push(part); }
  if (proj) { sql += ' AND project_id = ?';     params.push(proj); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<CodRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  let breached = 0;
  let large_open = 0;
  let escalated = 0;
  let in_construction = 0;     // ntp_issued / mobilization / mechanical_complete
  let in_commissioning = 0;    // cold_commissioning / grid_synchronized / reliability_run
  let cod_certified_count = 0;
  let cancelled_count = 0;
  let total_capacity_mw_certified = 0;
  for (const r of rows) {
    by_status[r.chain_status] = (by_status[r.chain_status] ?? 0) + 1;
    by_tier[r.capacity_tier]  = (by_tier[r.capacity_tier]  ?? 0) + 1;
    if (r.sla_breached) breached++;
    if (r.capacity_tier === 'large' && !isTerminal(r.chain_status)) large_open++;
    if (r.escalation_level > 0) escalated++;
    if (['ntp_issued','mobilization','mechanical_complete'].includes(r.chain_status)) in_construction++;
    if (['cold_commissioning','grid_synchronized','reliability_run'].includes(r.chain_status)) in_commissioning++;
    if (r.chain_status === 'cod_certified') {
      cod_certified_count++;
      total_capacity_mw_certified += r.capacity_mw || 0;
    }
    if (r.chain_status === 'cancelled') cancelled_count++;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      by_tier,
      breached,
      large_open,
      escalated,
      in_construction,
      in_commissioning,
      cod_certified_count,
      cancelled_count,
      total_capacity_mw_certified,
    },
  });
});

// ─── Drill: COD chain + audit ──────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM oe_cod_chain WHERE id = ?').bind(id).first<CodRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_cod_chain_events WHERE cod_id = ? ORDER BY datetime(created_at) ASC'
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      cod: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CertifyBody {
  ie_certifier?: string;
  ie_cert_doc_ref?: string;
  actual_cod_date?: string;
  nersa_scada_ref?: string;
  notes?: string;
}

// Per-action timestamp column. cod_certified_at handled separately (also writes actual_cod_date).
const TIMESTAMP_COLUMN: Partial<Record<CodAction, string>> = {
  sign_epc: 'epc_signed_at',
  issue_ntp: 'ntp_issued_at',
  mobilize: 'mobilization_at',
  mechanical_complete: 'mechanical_complete_at',
  cold_commission: 'cold_comm_at',
  grid_synchronize: 'grid_sync_at',
  begin_reliability_run: 'reliability_run_at',
  certify_cod: 'cod_certified_at',
};

// ─── Transition helper ─────────────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  id: string,
  action: CodAction,
  eventType: string,
  notes?: string,
  cancelReason?: string,
  certify?: CertifyBody,
): Promise<Response> {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB.prepare('SELECT * FROM oe_cod_chain WHERE id = ?').bind(id).first<CodRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const tier: CodTier = isTier(row.capacity_tier)
    ? row.capacity_tier
    : tierFromMw(row.capacity_mw ?? 0);

  let next: CodStatus;
  try { next = advance(row.chain_status, action); }
  catch { return c.json({ success: false, error: 'invalid_transition' }, 409); }

  const now = new Date();
  const sla = slaDueAt(next, tier, now);

  const updates: string[] = ['chain_status = ?', 'sla_deadline_at = ?', 'updated_at = ?'];
  const bindings: unknown[] = [next, sla || null, now.toISOString()];

  const tsCol = TIMESTAMP_COLUMN[action];
  if (tsCol) {
    updates.push(`${tsCol} = ?`);
    bindings.push(now.toISOString());
  }

  if (action === 'certify_cod') {
    if (certify?.ie_certifier)    { updates.push('ie_certifier = ?');    bindings.push(certify.ie_certifier); }
    if (certify?.ie_cert_doc_ref) { updates.push('ie_cert_doc_ref = ?'); bindings.push(certify.ie_cert_doc_ref); }
    if (certify?.nersa_scada_ref) { updates.push('nersa_scada_ref = ?'); bindings.push(certify.nersa_scada_ref); }
    updates.push('actual_cod_date = ?');
    bindings.push(certify?.actual_cod_date || now.toISOString().slice(0, 10));
  }

  if (action === 'cancel' && cancelReason) {
    updates.push('cancellation_reason = ?');
    bindings.push(cancelReason);
  }

  if (notes) {
    updates.push('construction_notes = COALESCE(construction_notes, \'\') || ?');
    bindings.push(`\n[${now.toISOString()}] ${notes}`);
  }

  bindings.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_cod_chain SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  const evtId = newId('cod_evt');
  const payload = action === 'certify_cod'
    ? JSON.stringify({
        ie_certifier: certify?.ie_certifier ?? row.ie_certifier ?? null,
        ie_cert_doc_ref: certify?.ie_cert_doc_ref ?? row.ie_cert_doc_ref ?? null,
        nersa_scada_ref: certify?.nersa_scada_ref ?? row.nersa_scada_ref ?? null,
        actual_cod_date: certify?.actual_cod_date ?? null,
        capacity_mw: row.capacity_mw,
        crosses_to_regulator: crossesIntoRegulator(action, tier),
      })
    : action === 'cancel'
      ? JSON.stringify({
          cancellation_reason: cancelReason ?? row.cancellation_reason ?? null,
          capacity_mw: row.capacity_mw,
          crosses_to_regulator: crossesIntoRegulator(action, tier),
        })
      : '{}';
  await c.env.DB.prepare(
    'INSERT INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(evtId, id, eventType, row.chain_status, next, user.id, notes ?? null, payload, now.toISOString()).run();

  await fireCascade({
    event: `cod.${eventType}` as never,
    actor_id: user.id,
    entity_type: 'cod_chain',
    entity_id: id,
    data: {
      cod_number: row.cod_number,
      project_name: row.project_name,
      participant_id: row.participant_id,
      project_id: row.project_id,
      capacity_mw: row.capacity_mw,
      capacity_tier: tier,
      ie_certifier: certify?.ie_certifier ?? row.ie_certifier ?? null,
      cancellation_reason: cancelReason ?? row.cancellation_reason ?? null,
      from_status: row.chain_status,
      to_status: next,
      crosses_to_regulator: crossesIntoRegulator(action, tier),
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, chain_status: next, sla_deadline_at: sla } });
}

// ─── Transitions ───────────────────────────────────────────────────────────
app.post('/:id/sign-epc', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'sign_epc', 'epc_signed', body.notes);
});
app.post('/:id/issue-ntp', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'issue_ntp', 'ntp_issued', body.notes);
});
app.post('/:id/mobilize', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'mobilize', 'mobilized', body.notes);
});
app.post('/:id/mechanical-complete', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'mechanical_complete', 'mechanical_complete', body.notes);
});
app.post('/:id/cold-commission', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'cold_commission', 'cold_commissioned', body.notes);
});
app.post('/:id/grid-synchronize', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'grid_synchronize', 'grid_synchronized', body.notes);
});
app.post('/:id/begin-reliability-run', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'begin_reliability_run', 'reliability_started', body.notes);
});
app.post('/:id/certify-cod', async (c) => {
  const body = await c.req.json().catch(() => ({})) as CertifyBody;
  return transition(c, c.req.param('id'), 'certify_cod', 'cod_certified', body.notes, undefined, body);
});
app.post('/:id/cancel', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { reason?: string; notes?: string };
  return transition(c, c.req.param('id'), 'cancel', 'cancelled', body.notes, body.reason);
});

// ─── 15-minute SLA sweep ───────────────────────────────────────────────────
export async function codSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_cod_chain
       WHERE chain_status NOT IN ('cod_certified', 'cancelled')
         AND sla_deadline_at IS NOT NULL
         AND datetime(sla_deadline_at) < datetime('now')
         AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(?))`
  ).bind(oneHourAgo).all<CodRow>();

  let breached = 0;
  for (const row of (rs.results || [])) {
    const tier: CodTier = isTier(row.capacity_tier)
      ? row.capacity_tier
      : tierFromMw(row.capacity_mw ?? 0);

    await env.DB.prepare(
      'UPDATE oe_cod_chain SET last_sla_breach_at = ?, escalation_level = escalation_level + 1 WHERE id = ?'
    ).bind(now.toISOString(), row.id).run();

    const slaMins = SLA_MINUTES[row.chain_status]?.[tier] ?? 0;
    const evtId = newId('cod_evt');
    await env.DB.prepare(
      'INSERT INTO oe_cod_chain_events (id, cod_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evtId, row.id, 'sla_breached', row.chain_status, row.chain_status, 'system', `Breached ${slaMins}m SLA`, '{}', now.toISOString()).run();

    await fireCascade({
      event: 'cod.sla_breached',
      actor_id: 'system',
      entity_type: 'cod_chain',
      entity_id: row.id,
      data: {
        cod_number: row.cod_number,
        project_name: row.project_name,
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

  return { scanned: (rs.results || []).length, breached };
}

export default app;
