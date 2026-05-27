// ═══════════════════════════════════════════════════════════════════════════
// Wave 19 — IPP procurement / RFP chain (REIPPPP-aligned transparency).
//
// Mounted at /api/ipp/procurement-chain.
//
// 12-state machine — the IPP issues the RFP and manages the lifecycle.
//   draft → published → bidding → bid_closed → evaluation
//     → shortlisted → awarded → contracted → delivered
//   reject_all (evaluation) → rejected
//   cancel — pre-contracted non-terminals + disputed (contract commit point)
//   dispute (any pre-delivered non-terminal except draft) → disputed
//   resolve (disputed) → contracted
//
// Capex tier (auto from capex_estimate_zar if invalid):
//   high ≥ R500m | medium ≥ R50m | low < R50m
//
// Per-tier SLA windows enforced by the 15-minute cron sweep. NB: bigger
// contracts get MORE time at every stage (more diligence required) — this
// inverts the pattern used by outage / WO chains.
//
// Regulator inbox crossings (REIPPPP transparency mandate):
//   • award       for high-tier  — public bid award visibility (DMRE)
//   • dispute     for high-tier  — bid-protest visibility
//   • sla_breached for high-tier
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
  tierFromCapex,
  SLA_MINUTES,
  type ProcurementStatus,
  type ProcurementAction,
  type ProcurementTier,
} from '../utils/procurement-chain-spec';

const READ_ROLES  = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'grid', 'grid_operator', 'regulator', 'lender']);
const WRITE_ROLES = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'wind']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface RfpRow {
  id: string;
  rfp_number: string;
  project_id: string | null;
  participant_id: string;
  title: string;
  description: string | null;
  category: string;
  capex_tier: ProcurementTier;
  capex_estimate_zar: number | null;
  currency: string;
  chain_status: ProcurementStatus;
  start_at: string | null;
  bid_open_at: string | null;
  bid_close_at: string | null;
  delivery_due_at: string | null;
  award_to: string | null;
  award_name: string | null;
  award_amount_zar: number | null;
  awarded_at: string | null;
  contracted_at: string | null;
  delivered_at: string | null;
  rejection_reason: string | null;
  dispute_notes: string | null;
  evaluation_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  rfp_id: string;
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

function decorate(row: RfpRow, now: Date) {
  const breach = row.sla_deadline_at ? new Date(row.sla_deadline_at).getTime() < now.getTime() : false;
  return {
    ...row,
    is_terminal: isTerminal(row.chain_status),
    minutes_until_sla: minutesUntil(row.sla_deadline_at, now),
    sla_breached: !isTerminal(row.chain_status) && breach,
  };
}

// ─── List RFPs (+ filters) ─────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const tier = c.req.query('capex_tier');
  const cat = c.req.query('category');
  const part = c.req.query('participant_id');

  let sql = 'SELECT * FROM oe_procurement_rfps WHERE 1=1';
  const params: unknown[] = [];
  if (cs)   { sql += ' AND chain_status = ?';   params.push(cs); }
  if (tier) { sql += ' AND capex_tier = ?';     params.push(tier); }
  if (cat)  { sql += ' AND category = ?';       params.push(cat); }
  if (part) { sql += ' AND participant_id = ?'; params.push(part); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<RfpRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  let breached = 0;
  let high_open = 0;
  let escalated = 0;
  let in_market = 0;            // published / bidding / bid_closed / evaluation / shortlisted
  let awarded_count = 0;
  let total_award_value_zar = 0;
  let post_award_due = 0;       // awarded but not yet contracted
  let disputed = 0;
  for (const r of rows) {
    by_status[r.chain_status] = (by_status[r.chain_status] ?? 0) + 1;
    by_tier[r.capex_tier]     = (by_tier[r.capex_tier]     ?? 0) + 1;
    if (r.sla_breached) breached++;
    if (r.capex_tier === 'high' && !isTerminal(r.chain_status)) high_open++;
    if (r.escalation_level > 0) escalated++;
    if (['published','bidding','bid_closed','evaluation','shortlisted'].includes(r.chain_status)) in_market++;
    if (r.chain_status === 'awarded') { awarded_count++; post_award_due++; }
    if (r.chain_status === 'contracted' || r.chain_status === 'delivered') {
      total_award_value_zar += r.award_amount_zar || 0;
    }
    if (r.chain_status === 'awarded' && r.award_amount_zar) {
      total_award_value_zar += r.award_amount_zar;
    }
    if (r.chain_status === 'disputed') disputed++;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      by_tier,
      breached,
      high_open,
      escalated,
      in_market,
      awarded_count,
      post_award_due,
      total_award_value_zar,
      disputed,
    },
  });
});

// ─── Drill: RFP + audit chain ──────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM oe_procurement_rfps WHERE id = ?').bind(id).first<RfpRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_procurement_chain_events WHERE rfp_id = ? ORDER BY datetime(created_at) ASC'
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      rfp: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface AwardBody {
  award_to?: string;
  award_name?: string;
  award_amount_zar?: number;
  notes?: string;
}

// ─── Transition helper ─────────────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  id: string,
  action: ProcurementAction,
  eventType: string,
  notes?: string,
  rejectionReason?: string,
  disputeNotes?: string,
  award?: AwardBody,
): Promise<Response> {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB.prepare('SELECT * FROM oe_procurement_rfps WHERE id = ?').bind(id).first<RfpRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const tier: ProcurementTier = isTier(row.capex_tier)
    ? row.capex_tier
    : tierFromCapex(row.capex_estimate_zar ?? 0);

  let next: ProcurementStatus;
  try { next = advance(row.chain_status, action); }
  catch (err) { return c.json({ success: false, error: (err as Error).message }, 409); }

  const now = new Date();
  const sla = slaDueAt(next, tier, now);

  const updates: string[] = ['chain_status = ?', 'sla_deadline_at = ?', 'updated_at = ?'];
  const bindings: unknown[] = [next, sla || null, now.toISOString()];

  if (action === 'award') {
    if (award?.award_to)         { updates.push('award_to = ?');         bindings.push(award.award_to); }
    if (award?.award_name)       { updates.push('award_name = ?');       bindings.push(award.award_name); }
    if (award?.award_amount_zar) { updates.push('award_amount_zar = ?'); bindings.push(award.award_amount_zar); }
    updates.push('awarded_at = ?');
    bindings.push(now.toISOString());
  }
  if (action === 'sign_contract')  { updates.push('contracted_at = ?'); bindings.push(now.toISOString()); }
  if (action === 'mark_delivered') { updates.push('delivered_at = ?');  bindings.push(now.toISOString()); }
  if ((action === 'reject_all' || action === 'cancel') && rejectionReason) {
    updates.push('rejection_reason = ?');
    bindings.push(rejectionReason);
  }
  if (action === 'dispute' && disputeNotes) {
    updates.push('dispute_notes = COALESCE(dispute_notes, \'\') || ?');
    bindings.push(`\n[${now.toISOString()}] ${disputeNotes}`);
  }
  if (notes) {
    updates.push('evaluation_notes = COALESCE(evaluation_notes, \'\') || ?');
    bindings.push(`\n[${now.toISOString()}] ${notes}`);
  }

  bindings.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_procurement_rfps SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  const evtId = newId('proc_evt');
  const payload = action === 'award'
    ? JSON.stringify({
        vendor: award?.award_name ?? row.award_name ?? null,
        amount_zar: award?.award_amount_zar ?? row.award_amount_zar ?? null,
        crosses_to_regulator: crossesIntoRegulator(action, tier),
      })
    : '{}';
  await c.env.DB.prepare(
    'INSERT INTO oe_procurement_chain_events (id, rfp_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(evtId, id, eventType, row.chain_status, next, user.id, notes ?? null, payload, now.toISOString()).run();

  await fireCascade({
    event: `procurement.${eventType}` as never,
    actor_id: user.id,
    entity_type: 'procurement_rfp',
    entity_id: id,
    data: {
      rfp_number: row.rfp_number,
      title: row.title,
      participant_id: row.participant_id,
      project_id: row.project_id,
      capex_tier: tier,
      capex_estimate_zar: row.capex_estimate_zar,
      award_name: award?.award_name ?? row.award_name ?? null,
      award_amount_zar: award?.award_amount_zar ?? row.award_amount_zar ?? null,
      rejection_reason: rejectionReason ?? row.rejection_reason ?? null,
      dispute_notes: disputeNotes ?? row.dispute_notes ?? null,
      from_status: row.chain_status,
      to_status: next,
      crosses_to_regulator: crossesIntoRegulator(action, tier),
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, chain_status: next, sla_deadline_at: sla } });
}

// ─── Transitions ───────────────────────────────────────────────────────────
app.post('/:id/publish', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'publish', 'published', body.notes);
});
app.post('/:id/open-bids', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'open_bids', 'bid_opened', body.notes);
});
app.post('/:id/close-bids', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'close_bids', 'bid_closed', body.notes);
});
app.post('/:id/begin-evaluation', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'begin_evaluation', 'evaluation_started', body.notes);
});
app.post('/:id/shortlist', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'shortlist', 'shortlisted', body.notes);
});
app.post('/:id/reject-all', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { reason?: string; notes?: string };
  return transition(c, c.req.param('id'), 'reject_all', 'rejected', body.notes, body.reason);
});
app.post('/:id/award', async (c) => {
  const body = await c.req.json().catch(() => ({})) as AwardBody;
  return transition(c, c.req.param('id'), 'award', 'awarded', body.notes, undefined, undefined, body);
});
app.post('/:id/sign-contract', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'sign_contract', 'contracted', body.notes);
});
app.post('/:id/mark-delivered', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'mark_delivered', 'delivered', body.notes);
});
app.post('/:id/cancel', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { reason?: string; notes?: string };
  return transition(c, c.req.param('id'), 'cancel', 'cancelled', body.notes, body.reason);
});
app.post('/:id/dispute', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { dispute_notes?: string; notes?: string };
  return transition(c, c.req.param('id'), 'dispute', 'disputed', body.notes, undefined, body.dispute_notes);
});
app.post('/:id/resolve', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'resolve', 'resolved', body.notes);
});

// ─── 15-minute SLA sweep ───────────────────────────────────────────────────
export async function procurementSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_procurement_rfps
       WHERE chain_status NOT IN ('delivered', 'rejected', 'cancelled')
         AND sla_deadline_at IS NOT NULL
         AND datetime(sla_deadline_at) < datetime('now')
         AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(?))`
  ).bind(oneHourAgo).all<RfpRow>();

  let breached = 0;
  for (const row of (rs.results || [])) {
    const tier: ProcurementTier = isTier(row.capex_tier)
      ? row.capex_tier
      : tierFromCapex(row.capex_estimate_zar ?? 0);

    await env.DB.prepare(
      'UPDATE oe_procurement_rfps SET last_sla_breach_at = ?, escalation_level = escalation_level + 1 WHERE id = ?'
    ).bind(now.toISOString(), row.id).run();

    const slaMins = SLA_MINUTES[row.chain_status]?.[tier] ?? 0;
    const evtId = newId('proc_evt');
    await env.DB.prepare(
      'INSERT INTO oe_procurement_chain_events (id, rfp_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evtId, row.id, 'sla_breached', row.chain_status, row.chain_status, 'system', `Breached ${slaMins}m SLA`, '{}', now.toISOString()).run();

    await fireCascade({
      event: 'procurement.sla_breached',
      actor_id: 'system',
      entity_type: 'procurement_rfp',
      entity_id: row.id,
      data: {
        rfp_number: row.rfp_number,
        title: row.title,
        capex_tier: tier,
        capex_estimate_zar: row.capex_estimate_zar,
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
