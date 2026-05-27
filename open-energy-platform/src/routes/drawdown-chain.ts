// ═══════════════════════════════════════════════════════════════════════════
// Wave 21 — Lender drawdown / disbursement certification chain.
//
// Mounted at /api/lender/drawdown-chain.
//
// 10-state machine — the IPP requests, the lender + IE certify, treasury funds.
//   requested → documents_submitted → ie_review → cp_checklist
//     → approved → funded → closed
//   query (ie_review|cp_checklist) → on_hold → cp_checklist (resume)
//   reject (any pre-approved) → rejected
//   cancel (any pre-funded non-terminal) → cancelled
//
// Tranche tier (auto from amount_zar if invalid):
//   senior ≥R500m | mezz ≥R100m | equity <R100m
//
// Per-tier SLA windows enforced by the 15-minute cron sweep. Bigger tranches
// need MORE diligence time (senior ie_review 30d vs equity 5d) — inverted
// from outage/WO patterns, same as Wave 19/20.
//
// Regulator inbox crossings (SARB + DMRE):
//   • approve  for senior — SARB large-exposure disclosure
//   • reject   for senior — IPP financing-failure visibility
//   • sla_breached for senior — delivery risk
//
// Roles (split write — IPP owns submit/query response, lender owns review/approve):
//   READ:  admin, support, ipp, ipp_developer, wind, lender, regulator
//   IPP_WRITE:    admin, support, ipp, ipp_developer, wind  (submit_documents, resume, cancel)
//   LENDER_WRITE: admin, support, lender  (begin_ie_review, pass_to_cp, query, approve, fund, close, reject)
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
  tierFromZar,
  SLA_MINUTES,
  type DrawdownStatus,
  type DrawdownAction,
  type DrawdownTier,
} from '../utils/drawdown-chain-spec';

const READ_ROLES        = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'lender', 'regulator']);
const IPP_WRITE_ROLES   = new Set(['admin', 'support', 'ipp', 'ipp_developer', 'wind']);
const LENDER_WRITE_ROLES = new Set(['admin', 'support', 'lender']);

// Action → write-role-set. The route enforces this in the transition helper.
const ACTION_ACTOR: Record<DrawdownAction, 'ipp' | 'lender'> = {
  submit_documents: 'ipp',
  begin_ie_review:  'lender',
  pass_to_cp:       'lender',
  query:            'lender',
  resume:           'ipp',
  approve:          'lender',
  fund:             'lender',
  close:            'lender',
  reject:           'lender',
  cancel:           'ipp',
};

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface DrawdownRow {
  id: string;
  drawdown_number: string;
  facility_id: string | null;
  project_id: string | null;
  participant_id: string;
  lender_id: string;
  project_name: string;
  facility_name: string | null;
  tranche_label: string;
  amount_zar: number;
  tranche_tier: DrawdownTier;
  chain_status: DrawdownStatus;
  requested_at: string | null;
  documents_at: string | null;
  ie_review_at: string | null;
  cp_started_at: string | null;
  on_hold_at: string | null;
  approved_at: string | null;
  funded_at: string | null;
  closed_at: string | null;
  ie_certifier: string | null;
  ie_cert_doc_ref: string | null;
  cp_evidence_ref: string | null;
  sarb_disclosure_ref: string | null;
  query_notes: string | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  funding_account_ref: string | null;
  drawdown_notes: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  drawdown_id: string;
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

function decorate(row: DrawdownRow, now: Date) {
  const breach = row.sla_deadline_at ? new Date(row.sla_deadline_at).getTime() < now.getTime() : false;
  return {
    ...row,
    is_terminal: isTerminal(row.chain_status),
    minutes_until_sla: minutesUntil(row.sla_deadline_at, now),
    sla_breached: !isTerminal(row.chain_status) && breach,
  };
}

// ─── List drawdowns (+ filters) ────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const tier = c.req.query('tranche_tier');
  const part = c.req.query('participant_id');
  const lender = c.req.query('lender_id');
  const proj = c.req.query('project_id');

  let sql = 'SELECT * FROM oe_drawdown_chain WHERE 1=1';
  const params: unknown[] = [];
  if (cs)     { sql += ' AND chain_status = ?';   params.push(cs); }
  if (tier)   { sql += ' AND tranche_tier = ?';   params.push(tier); }
  if (part)   { sql += ' AND participant_id = ?'; params.push(part); }
  if (lender) { sql += ' AND lender_id = ?';      params.push(lender); }
  if (proj)   { sql += ' AND project_id = ?';     params.push(proj); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<DrawdownRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  let breached = 0;
  let senior_open = 0;
  let escalated = 0;
  let in_diligence = 0;        // documents_submitted | ie_review | cp_checklist | on_hold
  let approved_open = 0;
  let funded_count = 0;
  let total_funded_zar = 0;
  let total_pipeline_zar = 0;
  let rejected_count = 0;
  for (const r of rows) {
    by_status[r.chain_status] = (by_status[r.chain_status] ?? 0) + 1;
    by_tier[r.tranche_tier]   = (by_tier[r.tranche_tier]   ?? 0) + 1;
    if (r.sla_breached) breached++;
    if (r.tranche_tier === 'senior' && !isTerminal(r.chain_status)) senior_open++;
    if (r.escalation_level > 0) escalated++;
    if (['documents_submitted','ie_review','cp_checklist','on_hold'].includes(r.chain_status)) {
      in_diligence++;
      total_pipeline_zar += r.amount_zar || 0;
    }
    if (r.chain_status === 'approved') {
      approved_open++;
      total_pipeline_zar += r.amount_zar || 0;
    }
    if (r.chain_status === 'funded' || r.chain_status === 'closed') {
      funded_count++;
      total_funded_zar += r.amount_zar || 0;
    }
    if (r.chain_status === 'rejected') rejected_count++;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      by_tier,
      breached,
      senior_open,
      escalated,
      in_diligence,
      approved_open,
      funded_count,
      total_funded_zar,
      total_pipeline_zar,
      rejected_count,
    },
  });
});

// ─── Drill: drawdown + audit ───────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM oe_drawdown_chain WHERE id = ?').bind(id).first<DrawdownRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_drawdown_chain_events WHERE drawdown_id = ? ORDER BY datetime(created_at) ASC'
  ).bind(id).all<EventRow>();

  return c.json({
    success: true,
    data: {
      drawdown: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface ApproveBody {
  ie_certifier?: string;
  ie_cert_doc_ref?: string;
  cp_evidence_ref?: string;
  sarb_disclosure_ref?: string;
  notes?: string;
}

interface FundBody {
  funding_account_ref?: string;
  notes?: string;
}

interface QueryBody {
  query_notes?: string;
  notes?: string;
}

// Per-action timestamp column.
const TIMESTAMP_COLUMN: Partial<Record<DrawdownAction, string>> = {
  submit_documents: 'documents_at',
  begin_ie_review:  'ie_review_at',
  pass_to_cp:       'cp_started_at',
  query:            'on_hold_at',
  approve:          'approved_at',
  fund:             'funded_at',
  close:            'closed_at',
};

// ─── Transition helper ─────────────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  id: string,
  action: DrawdownAction,
  eventType: string,
  notes?: string,
  rejectionReason?: string,
  cancellationReason?: string,
  approve?: ApproveBody,
  fund?: FundBody,
  query?: QueryBody,
): Promise<Response> {
  const user = getCurrentUser(c);
  const actor = ACTION_ACTOR[action];
  const allowed = actor === 'ipp' ? IPP_WRITE_ROLES : LENDER_WRITE_ROLES;
  if (!user || !allowed.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const row = await c.env.DB.prepare('SELECT * FROM oe_drawdown_chain WHERE id = ?').bind(id).first<DrawdownRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const tier: DrawdownTier = isTier(row.tranche_tier)
    ? row.tranche_tier
    : tierFromZar(row.amount_zar ?? 0);

  let next: DrawdownStatus;
  try { next = advance(row.chain_status, action); }
  catch (err) { return c.json({ success: false, error: (err as Error).message }, 409); }

  const now = new Date();
  const sla = slaDueAt(next, tier, now);

  const updates: string[] = ['chain_status = ?', 'sla_deadline_at = ?', 'updated_at = ?'];
  const bindings: unknown[] = [next, sla || null, now.toISOString()];

  const tsCol = TIMESTAMP_COLUMN[action];
  if (tsCol) {
    updates.push(`${tsCol} = ?`);
    bindings.push(now.toISOString());
  }

  if (action === 'begin_ie_review' && approve?.ie_certifier) {
    updates.push('ie_certifier = ?');
    bindings.push(approve.ie_certifier);
  }
  if (action === 'pass_to_cp' && approve?.ie_cert_doc_ref) {
    updates.push('ie_cert_doc_ref = ?');
    bindings.push(approve.ie_cert_doc_ref);
  }
  if (action === 'approve') {
    if (approve?.cp_evidence_ref)     { updates.push('cp_evidence_ref = ?');     bindings.push(approve.cp_evidence_ref); }
    if (approve?.sarb_disclosure_ref) { updates.push('sarb_disclosure_ref = ?'); bindings.push(approve.sarb_disclosure_ref); }
  }
  if (action === 'fund' && fund?.funding_account_ref) {
    updates.push('funding_account_ref = ?');
    bindings.push(fund.funding_account_ref);
  }
  if (action === 'query' && query?.query_notes) {
    updates.push('query_notes = COALESCE(query_notes, \'\') || ?');
    bindings.push(`\n[${now.toISOString()}] ${query.query_notes}`);
  }
  if (action === 'reject' && rejectionReason) {
    updates.push('rejection_reason = ?');
    bindings.push(rejectionReason);
  }
  if (action === 'cancel' && cancellationReason) {
    updates.push('cancellation_reason = ?');
    bindings.push(cancellationReason);
  }
  if (notes) {
    updates.push('drawdown_notes = COALESCE(drawdown_notes, \'\') || ?');
    bindings.push(`\n[${now.toISOString()}] ${notes}`);
  }

  bindings.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_drawdown_chain SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  const evtId = newId('dd_evt');
  let payload = '{}';
  if (action === 'approve') {
    payload = JSON.stringify({
      amount_zar: row.amount_zar,
      cp_evidence_ref: approve?.cp_evidence_ref ?? row.cp_evidence_ref ?? null,
      sarb_disclosure_ref: approve?.sarb_disclosure_ref ?? row.sarb_disclosure_ref ?? null,
      crosses_to_regulator: crossesIntoRegulator(action, tier),
    });
  } else if (action === 'reject') {
    payload = JSON.stringify({
      rejection_reason: rejectionReason ?? row.rejection_reason ?? null,
      amount_zar: row.amount_zar,
      crosses_to_regulator: crossesIntoRegulator(action, tier),
    });
  } else if (action === 'fund') {
    payload = JSON.stringify({ funding_account_ref: fund?.funding_account_ref ?? row.funding_account_ref ?? null });
  } else if (action === 'query') {
    payload = JSON.stringify({ query_notes: query?.query_notes ?? null });
  } else if (action === 'cancel') {
    payload = JSON.stringify({ cancellation_reason: cancellationReason ?? row.cancellation_reason ?? null });
  }
  await c.env.DB.prepare(
    'INSERT INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(evtId, id, eventType, row.chain_status, next, user.id, notes ?? null, payload, now.toISOString()).run();

  await fireCascade({
    event: `drawdown.${eventType}` as never,
    actor_id: user.id,
    entity_type: 'drawdown',
    entity_id: id,
    data: {
      drawdown_number: row.drawdown_number,
      project_name: row.project_name,
      participant_id: row.participant_id,
      lender_id: row.lender_id,
      project_id: row.project_id,
      amount_zar: row.amount_zar,
      tranche_tier: tier,
      rejection_reason: rejectionReason ?? row.rejection_reason ?? null,
      cancellation_reason: cancellationReason ?? row.cancellation_reason ?? null,
      sarb_disclosure_ref: approve?.sarb_disclosure_ref ?? row.sarb_disclosure_ref ?? null,
      from_status: row.chain_status,
      to_status: next,
      crosses_to_regulator: crossesIntoRegulator(action, tier),
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id, chain_status: next, sla_deadline_at: sla } });
}

// ─── Transitions ───────────────────────────────────────────────────────────
app.post('/:id/submit-documents', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'submit_documents', 'documents_submitted', body.notes);
});
app.post('/:id/begin-ie-review', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { ie_certifier?: string; notes?: string };
  return transition(c, c.req.param('id'), 'begin_ie_review', 'ie_review_started', body.notes, undefined, undefined, { ie_certifier: body.ie_certifier });
});
app.post('/:id/pass-to-cp', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { ie_cert_doc_ref?: string; notes?: string };
  return transition(c, c.req.param('id'), 'pass_to_cp', 'cp_passed', body.notes, undefined, undefined, { ie_cert_doc_ref: body.ie_cert_doc_ref });
});
app.post('/:id/query', async (c) => {
  const body = await c.req.json().catch(() => ({})) as QueryBody;
  return transition(c, c.req.param('id'), 'query', 'queried', body.notes, undefined, undefined, undefined, undefined, body);
});
app.post('/:id/resume', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'resume', 'resumed', body.notes);
});
app.post('/:id/approve', async (c) => {
  const body = await c.req.json().catch(() => ({})) as ApproveBody;
  return transition(c, c.req.param('id'), 'approve', 'approved', body.notes, undefined, undefined, body);
});
app.post('/:id/fund', async (c) => {
  const body = await c.req.json().catch(() => ({})) as FundBody;
  return transition(c, c.req.param('id'), 'fund', 'funded', body.notes, undefined, undefined, undefined, body);
});
app.post('/:id/close', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { notes?: string };
  return transition(c, c.req.param('id'), 'close', 'closed', body.notes);
});
app.post('/:id/reject', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { reason?: string; notes?: string };
  return transition(c, c.req.param('id'), 'reject', 'rejected', body.notes, body.reason);
});
app.post('/:id/cancel', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { reason?: string; notes?: string };
  return transition(c, c.req.param('id'), 'cancel', 'cancelled', body.notes, undefined, body.reason);
});

// ─── 15-minute SLA sweep ───────────────────────────────────────────────────
export async function drawdownSlaSweep(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_drawdown_chain
       WHERE chain_status NOT IN ('closed', 'rejected', 'cancelled')
         AND sla_deadline_at IS NOT NULL
         AND datetime(sla_deadline_at) < datetime('now')
         AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(?))`
  ).bind(oneHourAgo).all<DrawdownRow>();

  let breached = 0;
  for (const row of (rs.results || [])) {
    const tier: DrawdownTier = isTier(row.tranche_tier)
      ? row.tranche_tier
      : tierFromZar(row.amount_zar ?? 0);

    await env.DB.prepare(
      'UPDATE oe_drawdown_chain SET last_sla_breach_at = ?, escalation_level = escalation_level + 1 WHERE id = ?'
    ).bind(now.toISOString(), row.id).run();

    const slaMins = SLA_MINUTES[row.chain_status]?.[tier] ?? 0;
    const evtId = newId('dd_evt');
    await env.DB.prepare(
      'INSERT INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(evtId, row.id, 'sla_breached', row.chain_status, row.chain_status, 'system', `Breached ${slaMins}m SLA`, '{}', now.toISOString()).run();

    await fireCascade({
      event: 'drawdown.sla_breached',
      actor_id: 'system',
      entity_type: 'drawdown',
      entity_id: row.id,
      data: {
        drawdown_number: row.drawdown_number,
        project_name: row.project_name,
        tranche_tier: tier,
        amount_zar: row.amount_zar,
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
