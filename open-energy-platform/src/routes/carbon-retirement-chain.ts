// ═══════════════════════════════════════════════════════════════════════════
// Wave 17 — Carbon credit retirement chain (P6 lifecycle on carbon_retirements).
//
// Mounted at /api/carbon/retirement-chain.
//
// 7-state machine: requested → validating → adjustment_pending → adjusted → retired
//                    ├─ rejected (from validating | adjustment_pending)
//                    └─ cancelled (from any non-terminal)
//
// Per-scope SLA windows: article6 / compliance / voluntary.
// Article6 finalize/reject + compliance reject cross into regulator inbox.
// Article6 + compliance SLA breaches cross into regulator inbox.
//
// Roles:
//   READ:  admin, carbon, regulator, lender
//   WRITE: admin, carbon
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  advance,
  slaDueAt,
  isTerminal,
  isScope,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  SLA_MINUTES,
  type RetirementStatus,
  type RetirementAction,
  type RetirementScope,
} from '../utils/retirement-chain-spec';

const READ_ROLES  = new Set(['admin', 'carbon', 'carbon_fund', 'regulator', 'lender', 'support']);
const WRITE_ROLES = new Set(['admin', 'carbon', 'carbon_fund']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface RetirementRow {
  id: string;
  participant_id: string;
  project_id: string;
  quantity: number;
  retirement_reason: string | null;
  certificate_number: string | null;
  beneficiary_name: string | null;
  beneficiary_country: string | null;
  retirement_date: string | null;
  created_by: string;
  created_at: string;
  chain_status: RetirementStatus;
  scope: RetirementScope;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  validation_notes: string | null;
  rejection_reason: string | null;
  certificate_hash: string | null;
}

interface EventRow {
  id: string;
  retirement_id: string;
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

function decorate(row: RetirementRow, now: Date) {
  const breach = row.sla_deadline_at ? new Date(row.sla_deadline_at).getTime() < now.getTime() : false;
  return {
    ...row,
    is_terminal: isTerminal(row.chain_status),
    minutes_until_sla: minutesUntil(row.sla_deadline_at, now),
    sla_breached: !isTerminal(row.chain_status) && breach,
  };
}

// ─── List retirements (+ filters) ─────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const sc = c.req.query('scope');
  const country = c.req.query('country');

  let sql = 'SELECT * FROM carbon_retirements WHERE 1=1';
  const params: unknown[] = [];
  if (cs)      { sql += ' AND chain_status = ?';        params.push(cs); }
  if (sc)      { sql += ' AND scope = ?';               params.push(sc); }
  if (country) { sql += ' AND beneficiary_country = ?'; params.push(country); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<RetirementRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  const by_scope:  Record<string, number> = {};
  let breached = 0;
  let article6_open = 0;
  let escalated = 0;
  let retired_count = 0;
  let total_tco2 = 0;
  for (const r of rows) {
    by_status[r.chain_status] = (by_status[r.chain_status] ?? 0) + 1;
    by_scope[r.scope]         = (by_scope[r.scope]         ?? 0) + 1;
    if (r.sla_breached) breached++;
    if (r.scope === 'article6' && !isTerminal(r.chain_status)) article6_open++;
    if (r.escalation_level > 0) escalated++;
    if (r.chain_status === 'retired') {
      retired_count++;
      total_tco2 += r.quantity || 0;
    }
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      by_scope,
      breached,
      article6_open,
      escalated,
      retired_count,
      total_tco2,
    },
  });
});

// ─── Drill: retirement + audit chain ───────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM carbon_retirements WHERE id = ?').bind(id).first<RetirementRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_retirement_chain_events WHERE retirement_id = ? ORDER BY datetime(created_at) ASC'
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      retirement: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Transition helper ─────────────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  id: string,
  action: RetirementAction,
  eventType: string,
  notes?: string,
  rejectionReason?: string,
): Promise<Response> {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB.prepare('SELECT * FROM carbon_retirements WHERE id = ?').bind(id).first<RetirementRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  if (!isScope(row.scope)) return c.json({ success: false, error: `Invalid scope ${row.scope}` }, 422);

  let next: RetirementStatus;
  try { next = advance(row.chain_status, action); }
  catch { return c.json({ success: false, error: 'invalid_transition' }, 409); }

  const now = new Date();
  const sla = slaDueAt(next, row.scope, now);

  const updates: string[] = ['chain_status = ?', 'sla_deadline_at = ?'];
  const bindings: unknown[] = [next, sla || null];

  if (action === 'finalize') {
    updates.push('retirement_date = ?');
    bindings.push(now.toISOString());
    // mint a certificate hash on finalize
    const hash = `cert_${row.id}_${now.getTime().toString(36)}`;
    updates.push('certificate_hash = ?');
    bindings.push(hash);
  }
  if (action === 'reject' && rejectionReason) {
    updates.push('rejection_reason = ?');
    bindings.push(rejectionReason);
  }
  if (notes) {
    updates.push('validation_notes = COALESCE(validation_notes, \'\') || ? ');
    bindings.push(`\n[${now.toISOString()}] ${notes}`);
  }

  bindings.push(id);
  await c.env.DB.prepare(
    `UPDATE carbon_retirements SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  const evtId = newId('ret_evt');
  await c.env.DB.prepare(
    'INSERT INTO oe_retirement_chain_events (id, retirement_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(evtId, id, eventType, row.chain_status, next, user.id, notes ?? null, '{}', now.toISOString()).run();

  await fireCascade({
    event: `carbon.retirement.${eventType}` as never,
    actor_id: user.id,
    entity_type: 'carbon_retirement',
    entity_id: id,
    data: {
      scope: row.scope,
      quantity: row.quantity,
      beneficiary_name: row.beneficiary_name,
      beneficiary_country: row.beneficiary_country,
      certificate_number: row.certificate_number,
      rejection_reason: rejectionReason ?? row.rejection_reason ?? null,
      from_status: row.chain_status,
      to_status: next,
      crosses_to_regulator: crossesIntoRegulator(action, row.scope),
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, chain_status: next, sla_deadline_at: sla } });
}

// Transition endpoints
app.post('/:id/begin-validation', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'begin_validation', 'validation_started', body.notes);
});
app.post('/:id/mark-adjustment-pending', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'mark_adjustment_pending', 'adjustment_pending', body.notes);
});
app.post('/:id/mark-adjusted', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'mark_adjusted', 'adjusted', body.notes);
});
app.post('/:id/finalize', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'finalize', 'retired', body.notes);
});
app.post('/:id/reject', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { reason?: string; notes?: string };
  return transition(c, c.req.param('id'), 'reject', 'rejected', body.notes, body.reason);
});
app.post('/:id/cancel', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'cancel', 'cancelled', body.notes);
});

// ─── 15-minute SLA sweep ───────────────────────────────────────────────────
export async function carbonRetirementSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM carbon_retirements
       WHERE chain_status NOT IN ('retired', 'rejected', 'cancelled')
         AND sla_deadline_at IS NOT NULL
         AND datetime(sla_deadline_at) < datetime('now')
         AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(?))`
  ).bind(oneHourAgo).all<RetirementRow>();

  let breached = 0;
  for (const row of (rs.results || [])) {
    if (!isScope(row.scope)) continue;

    await env.DB.prepare(
      'UPDATE carbon_retirements SET last_sla_breach_at = ?, escalation_level = escalation_level + 1 WHERE id = ?'
    ).bind(now.toISOString(), row.id).run();

    const slaMins = SLA_MINUTES[row.chain_status]?.[row.scope] ?? 0;
    const evtId = newId('ret_evt');
    await env.DB.prepare(
      'INSERT INTO oe_retirement_chain_events (id, retirement_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evtId, row.id, 'sla_breached', row.chain_status, row.chain_status, 'system', `Breached ${slaMins}m SLA`, '{}', now.toISOString()).run();

    await fireCascade({
      event: 'carbon.retirement.sla_breached',
      actor_id: 'system',
      entity_type: 'carbon_retirement',
      entity_id: row.id,
      data: {
        scope: row.scope,
        beneficiary_name: row.beneficiary_name,
        chain_status: row.chain_status,
        sla_window: `${slaMins}m`,
        crosses_to_regulator: slaBreachCrossesIntoRegulator(row.scope),
      },
      env,
    });
    breached++;
  }

  return { scanned: (rs.results || []).length, breached };
}

export default app;
