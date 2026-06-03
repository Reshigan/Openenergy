// ═══════════════════════════════════════════════════════════════════════════
// Wave 15 — OEM warranty / RMA claim chain routes.
//
// Mounted at /api/esums/warranty-claims.
//
// Severity-tiered SLAs (safety/performance/cosmetic) on a 10-state chain:
//   opened → triaged → submitted → acknowledged → under_review
//                                                  ↓        ↘
//                                                approved   denied
//                                                  ↓          ↓
//                                                fulfilled  disputed → {approved | closed}
//                                                  ↓
//                                                closed
//
// Safety severity crosses into regulator inbox on denial, dispute, or
// any SLA breach.
//
// Roles:
//   READ:  admin, support, regulator, ipp, om (Esums O&M lead)
//   WRITE: admin, ipp, om (asset owner + ops own warranty workflow)
//
// 15-minute cron sweep records SLA breaches.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  advance,
  slaDueAt,
  slaWindowFor,
  minutesUntilDeadline,
  isSlaBreached,
  isTerminal,
  hasSlaWindow,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  STATUS_LABEL,
  SEVERITY_LABEL,
  type ClaimStatus,
  type ClaimAction,
  type ClaimSeverity,
} from '../utils/warranty-claim-spec';

const READ_ROLES  = new Set(['admin', 'support', 'regulator', 'ipp', 'om', 'esums']);
const WRITE_ROLES = new Set(['admin', 'ipp', 'om', 'esums']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ClaimRow {
  id: string;
  claim_number: string;
  tenant_id: string | null;
  asset_id: string | null;
  asset_label: string;
  oem_id: string | null;
  oem_name: string;
  site_id: string | null;
  reported_by: string;
  subject: string;
  description: string | null;
  severity: ClaimSeverity;
  fault_code: string | null;
  failure_mode: string | null;
  warranty_ref: string | null;
  rma_number: string | null;
  chain_status: ClaimStatus;
  triaged_at: string | null;
  submitted_at: string | null;
  acknowledged_at: string | null;
  review_started_at: string | null;
  approved_at: string | null;
  denied_at: string | null;
  disputed_at: string | null;
  fulfilled_at: string | null;
  closed_at: string | null;
  triaged_by: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  denied_by: string | null;
  closed_by: string | null;
  next_sla_due_at: string | null;
  next_sla_window: string | null;
  last_sla_breach_at: string | null;
  sla_breach_count: number;
  resolution: string | null;
  denial_reason: string | null;
  dispute_reason: string | null;
  recovery_zar: number | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  claim_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  sla_window: string | null;
  actor_id: string | null;
  notes: string | null;
  payload_json: string | null;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function decorate(row: ClaimRow, now: Date) {
  const cs = row.chain_status;
  const deadlineStr = hasSlaWindow(cs) ? row.next_sla_due_at : null;
  const deadline = deadlineStr ? new Date(deadlineStr) : null;
  return {
    ...row,
    chain_status_label: STATUS_LABEL[cs] ?? cs,
    severity_label: SEVERITY_LABEL[row.severity] ?? row.severity,
    is_terminal: isTerminal(cs),
    has_sla_window: hasSlaWindow(cs),
    sla_window: slaWindowFor(cs),
    sla_deadline_at: deadlineStr,
    minutes_until_sla: deadline ? minutesUntilDeadline(deadline, now) : null,
    sla_breached: isSlaBreached(deadline, now),
  };
}

// ─── List claims (+ filters) ─────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const cs = c.req.query('chain_status');
  const sev = c.req.query('severity');
  const oem = c.req.query('oem_id');
  const site = c.req.query('site_id');

  let sql = 'SELECT * FROM oe_warranty_claims WHERE 1=1';
  const params: unknown[] = [];
  if (cs)   { sql += ' AND chain_status = ?'; params.push(cs); }
  if (sev)  { sql += ' AND severity = ?';     params.push(sev); }
  if (oem)  { sql += ' AND oem_id = ?';       params.push(oem); }
  if (site) { sql += ' AND site_id = ?';      params.push(site); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';

  const now = new Date();
  const rs = await c.env.DB.prepare(sql).bind(...params).all<ClaimRow>();
  const rows = (rs.results || []).map((r) => decorate(r, now));

  const by_status: Record<string, number> = {};
  const by_severity: Record<string, number> = {};
  let breached = 0;
  let denied_or_disputed = 0;
  let safety_open = 0;
  let total_recovery_zar = 0;
  for (const r of rows) {
    by_status[r.chain_status]   = (by_status[r.chain_status]   ?? 0) + 1;
    by_severity[r.severity]     = (by_severity[r.severity]     ?? 0) + 1;
    if (r.sla_breached) breached++;
    if (r.chain_status === 'denied' || r.chain_status === 'disputed') denied_or_disputed++;
    if (r.severity === 'safety' && !isTerminal(r.chain_status)) safety_open++;
    if (r.recovery_zar) total_recovery_zar += r.recovery_zar;
  }

  return c.json({
    success: true,
    data: {
      items: rows,
      total: rows.length,
      by_status,
      by_severity,
      breached,
      denied_or_disputed,
      safety_open,
      total_recovery_zar,
    },
  });
});

// ─── Drill: claim + event history ────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const id = c.req.param('id');
  const claim = await c.env.DB
    .prepare('SELECT * FROM oe_warranty_claims WHERE id = ?')
    .bind(id)
    .first<ClaimRow>();
  if (!claim) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB
    .prepare('SELECT * FROM oe_warranty_claim_events WHERE claim_id = ? ORDER BY datetime(created_at) DESC LIMIT 200')
    .bind(id)
    .all<EventRow>();

  return c.json({
    success: true,
    data: {
      claim: decorate(claim, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Create a new claim ──────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  type CreateBody = {
    asset_label?: string; oem_name?: string; subject?: string;
    severity?: ClaimSeverity; description?: string;
    asset_id?: string; oem_id?: string; site_id?: string;
    fault_code?: string; failure_mode?: string; warranty_ref?: string;
    tenant_id?: string;
  };
  const body = await c.req.json<CreateBody>().catch((): CreateBody => ({}));

  if (!body.asset_label || !body.oem_name || !body.subject || !body.severity) {
    return c.json({ success: false, error: 'asset_label, oem_name, subject, severity required' }, 400);
  }
  if (!['safety','performance','cosmetic'].includes(body.severity)) {
    return c.json({ success: false, error: 'severity must be safety|performance|cosmetic' }, 400);
  }

  const id = newId('warr_clm');
  const claimNumber = `WC-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const nowIso = new Date().toISOString();
  const dueAt = slaDueAt('opened', body.severity, new Date())?.toISOString() ?? null;

  await c.env.DB.prepare(`
    INSERT INTO oe_warranty_claims (
      id, claim_number, tenant_id, asset_id, asset_label,
      oem_id, oem_name, site_id, reported_by, subject, description,
      severity, fault_code, failure_mode, warranty_ref,
      chain_status, next_sla_due_at, next_sla_window,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'opened', ?, 'triage', ?, ?)
  `).bind(
    id, claimNumber, body.tenant_id ?? null, body.asset_id ?? null, body.asset_label,
    body.oem_id ?? null, body.oem_name, body.site_id ?? null, user.id, body.subject, body.description ?? null,
    body.severity, body.fault_code ?? null, body.failure_mode ?? null, body.warranty_ref ?? null,
    dueAt, nowIso, nowIso,
  ).run();

  const evId = newId('warr_clm_evt');
  await c.env.DB.prepare(`
    INSERT INTO oe_warranty_claim_events (
      id, claim_id, event_type, from_status, to_status, sla_window, actor_id, notes
    ) VALUES (?, ?, 'opened', NULL, 'opened', 'triage', ?, ?)
  `).bind(evId, id, user.id, `Claim opened — ${body.subject}`).run();

  await fireCascade({
    event: 'warranty.claim_opened' as never,
    actor_id: user.id,
    entity_type: 'oe_warranty_claims',
    entity_id: id,
    data: {
      claim_number: claimNumber,
      severity: body.severity,
      oem_name: body.oem_name,
      asset_label: body.asset_label,
      sla_due_at: dueAt,
    },
    env: c.env as never,
  });

  return c.json({
    success: true,
    data: { id, claim_number: claimNumber, chain_status: 'opened', sla_deadline_at: dueAt },
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────
async function loadClaim(env: HonoEnv['Bindings'], id: string): Promise<ClaimRow | null> {
  const row = await env.DB
    .prepare('SELECT * FROM oe_warranty_claims WHERE id = ?')
    .bind(id)
    .first<ClaimRow>();
  return row ?? null;
}

async function parseBody<T extends object>(req: { json: <U>() => Promise<U> }): Promise<Partial<T>> {
  return req.json<Partial<T>>().catch(() => ({} as Partial<T>));
}

interface TransitionOpts {
  env: HonoEnv['Bindings'];
  claimId: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  eventType: string;
  slaWindow?: string | null;
  actorId: string;
  notes?: string | null;
  payload?: Record<string, unknown> | null;
  cascadeEvent: string;
  cascadeData: Record<string, unknown>;
}

async function recordTransition(opts: TransitionOpts): Promise<void> {
  const id = newId('warr_clm_evt');
  await opts.env.DB.prepare(`
    INSERT INTO oe_warranty_claim_events (
      id, claim_id, event_type, from_status, to_status,
      sla_window, actor_id, notes, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, opts.claimId, opts.eventType, opts.fromStatus, opts.toStatus,
    opts.slaWindow ?? null,
    opts.actorId, opts.notes ?? null,
    opts.payload ? JSON.stringify(opts.payload) : null,
  ).run();

  await fireCascade({
    event: opts.cascadeEvent as never,
    actor_id: opts.actorId,
    entity_type: 'oe_warranty_claims',
    entity_id: opts.claimId,
    data: opts.cascadeData,
    env: opts.env as never,
  });
}

interface AdvanceOpts {
  action: ClaimAction;
  eventType: string;
  cascadeEvent: string;
  tsColumn?: keyof ClaimRow & string;
  extraSql?: string;
  extraBinds?: unknown[];
  extraCascade?: Record<string, unknown>;
}

async function applyAdvance(
  c: { env: HonoEnv['Bindings']; req: { param: (k: string) => string; json: <U>() => Promise<U> } },
  user: { id: string; role: string },
  opts: AdvanceOpts,
) {
  const id = c.req.param('id');
  const body = await parseBody<{ notes?: string }>(c.req);
  const row = await loadClaim(c.env, id);
  if (!row) return { kind: 'not_found' as const };

  let r;
  try {
    r = advance(row.chain_status, opts.action);
  } catch (err) {
    return { kind: 'invalid' as const };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const dueAt = r.setNextSla ? slaDueAt(r.next, row.severity, now)?.toISOString() ?? null : null;
  const window = slaWindowFor(r.next);
  const clearDue = r.clearNextSla;

  const sets: string[] = ['chain_status = ?'];
  const binds: unknown[] = [r.next];
  if (opts.tsColumn) { sets.push(`${opts.tsColumn} = ?`); binds.push(nowIso); }
  if (dueAt) {
    sets.push('next_sla_due_at = ?', 'next_sla_window = ?');
    binds.push(dueAt, window);
  }
  if (clearDue) {
    sets.push('next_sla_due_at = NULL', 'next_sla_window = NULL');
  }
  sets.push('updated_at = ?');
  binds.push(nowIso);
  if (opts.extraSql) {
    sets.push(opts.extraSql);
    if (opts.extraBinds) binds.push(...opts.extraBinds);
  }
  binds.push(id);
  await c.env.DB.prepare(`UPDATE oe_warranty_claims SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds).run();

  const crossed = crossesIntoRegulator(opts.action, row.severity);
  await recordTransition({
    env: c.env, claimId: id,
    fromStatus: row.chain_status, toStatus: r.next,
    eventType: opts.eventType, slaWindow: window,
    actorId: user.id, notes: body.notes ?? null,
    payload: { severity: row.severity, oem_name: row.oem_name, ...(opts.extraCascade ?? {}) },
    cascadeEvent: opts.cascadeEvent,
    cascadeData: {
      claim_number: row.claim_number,
      severity: row.severity,
      oem_name: row.oem_name,
      asset_label: row.asset_label,
      chain_status: r.next,
      sla_due_at: dueAt,
      sla_window: window,
      crossed_into_regulator: crossed,
      ...(opts.extraCascade ?? {}),
    },
  });

  return {
    kind: 'ok' as const,
    id,
    chain_status: r.next,
    sla_deadline_at: dueAt,
    sla_window: window,
    crossed_into_regulator: crossed,
  };
}

// ─── POST /:id/triage ────────────────────────────────────────────────────
app.post('/:id/triage', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'triage', eventType: 'triaged', cascadeEvent: 'warranty.claim_triaged',
    tsColumn: 'triaged_at',
    extraSql: 'triaged_by = ?', extraBinds: [user.id],
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/submit { rma_number? } ────────────────────────────────────
app.post('/:id/submit', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const body = await parseBody<{ rma_number?: string; notes?: string }>(c.req);
  const row = await loadClaim(c.env, id);
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  let r;
  try { r = advance(row.chain_status, 'submit'); }
  catch { return c.json({ success: false, error: 'invalid_transition' }, 409); }

  const nowIso = new Date().toISOString();
  const dueAt = slaDueAt(r.next, row.severity, new Date())?.toISOString() ?? null;

  await c.env.DB.prepare(`
    UPDATE oe_warranty_claims
       SET chain_status = ?, submitted_at = ?, submitted_by = ?,
           rma_number = COALESCE(?, rma_number),
           next_sla_due_at = ?, next_sla_window = 'ack',
           updated_at = ?
     WHERE id = ?
  `).bind(r.next, nowIso, user.id, body.rma_number ?? null, dueAt, nowIso, id).run();

  await recordTransition({
    env: c.env, claimId: id,
    fromStatus: row.chain_status, toStatus: r.next,
    eventType: 'submitted', slaWindow: 'ack',
    actorId: user.id, notes: body.notes ?? null,
    payload: { rma_number: body.rma_number ?? null },
    cascadeEvent: 'warranty.claim_submitted',
    cascadeData: {
      claim_number: row.claim_number, severity: row.severity, oem_name: row.oem_name,
      asset_label: row.asset_label, chain_status: r.next,
      rma_number: body.rma_number ?? row.rma_number,
      sla_due_at: dueAt, sla_window: 'ack',
    },
  });

  return c.json({ success: true, data: { id, chain_status: r.next, sla_deadline_at: dueAt, rma_number: body.rma_number ?? row.rma_number } });
});

// ─── POST /:id/acknowledge ───────────────────────────────────────────────
app.post('/:id/acknowledge', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'acknowledge', eventType: 'acknowledged',
    cascadeEvent: 'warranty.claim_acknowledged',
    tsColumn: 'acknowledged_at',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/begin-review ──────────────────────────────────────────────
app.post('/:id/begin-review', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'begin_review', eventType: 'review_started',
    cascadeEvent: 'warranty.claim_review_started',
    tsColumn: 'review_started_at',
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/approve ───────────────────────────────────────────────────
app.post('/:id/approve', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'approve', eventType: 'approved',
    cascadeEvent: 'warranty.claim_approved',
    tsColumn: 'approved_at',
    extraSql: 'approved_by = ?', extraBinds: [user.id],
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/deny  { denial_reason } ───────────────────────────────────
app.post('/:id/deny', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const body = await parseBody<{ denial_reason?: string; notes?: string }>(c.req);
  if (!body.denial_reason) return c.json({ success: false, error: 'denial_reason required' }, 400);

  const out = await applyAdvance(c, user, {
    action: 'deny', eventType: 'denied',
    cascadeEvent: 'warranty.claim_denied',
    tsColumn: 'denied_at',
    extraSql: 'denied_by = ?, denial_reason = ?',
    extraBinds: [user.id, body.denial_reason],
    extraCascade: { denial_reason: body.denial_reason },
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/dispute  { dispute_reason } ───────────────────────────────
app.post('/:id/dispute', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const body = await parseBody<{ dispute_reason?: string; notes?: string }>(c.req);
  if (!body.dispute_reason) return c.json({ success: false, error: 'dispute_reason required' }, 400);

  const out = await applyAdvance(c, user, {
    action: 'dispute', eventType: 'disputed',
    cascadeEvent: 'warranty.claim_disputed',
    tsColumn: 'disputed_at',
    extraSql: 'dispute_reason = ?', extraBinds: [body.dispute_reason],
    extraCascade: { dispute_reason: body.dispute_reason },
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/uphold-denial ─────────────────────────────────────────────
app.post('/:id/uphold-denial', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'uphold_denial', eventType: 'closed',
    cascadeEvent: 'warranty.claim_closed',
    tsColumn: 'closed_at',
    extraSql: 'closed_by = ?', extraBinds: [user.id],
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/fulfill  { recovery_zar?, resolution? } ───────────────────
app.post('/:id/fulfill', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const body = await parseBody<{ recovery_zar?: number; resolution?: string; notes?: string }>(c.req);

  const out = await applyAdvance(c, user, {
    action: 'fulfill', eventType: 'fulfilled',
    cascadeEvent: 'warranty.claim_fulfilled',
    tsColumn: 'fulfilled_at',
    extraSql: 'recovery_zar = COALESCE(?, recovery_zar), resolution = COALESCE(?, resolution)',
    extraBinds: [body.recovery_zar ?? null, body.resolution ?? null],
    extraCascade: { recovery_zar: body.recovery_zar ?? null },
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── POST /:id/close ─────────────────────────────────────────────────────
app.post('/:id/close', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) return c.json({ success: false, error: 'Forbidden' }, 403);
  const out = await applyAdvance(c, user, {
    action: 'close', eventType: 'closed',
    cascadeEvent: 'warranty.claim_closed',
    tsColumn: 'closed_at',
    extraSql: 'closed_by = ?', extraBinds: [user.id],
  });
  if (out.kind === 'not_found') return c.json({ success: false, error: 'Not found' }, 404);
  if (out.kind === 'invalid')   return c.json({ success: false, error: 'invalid_transition' }, 409);
  return c.json({ success: true, data: out });
});

// ─── 15-minute cron: SLA breach sweep across active claims ───────────────
export async function warrantyClaimSlaSweep(env: HonoEnv['Bindings']): Promise<{
  evaluated: number; breached: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  let breached = 0;

  const rs = await env.DB.prepare(`
    SELECT * FROM oe_warranty_claims
     WHERE chain_status IN ('opened','triaged','submitted','acknowledged','under_review','approved','disputed')
       AND next_sla_due_at IS NOT NULL
       AND (last_sla_breach_at IS NULL
            OR datetime(last_sla_breach_at) < datetime(?, '-1 hour'))
  `).bind(nowIso).all<ClaimRow>();
  const rows = rs.results || [];

  for (const r of rows) {
    const deadline = r.next_sla_due_at ? new Date(r.next_sla_due_at) : null;
    if (!isSlaBreached(deadline, now)) continue;

    await env.DB.prepare(`
      UPDATE oe_warranty_claims
         SET last_sla_breach_at = ?,
             sla_breach_count   = sla_breach_count + 1,
             updated_at         = ?
       WHERE id = ?
    `).bind(nowIso, nowIso, r.id).run();

    const window = r.next_sla_window ?? slaWindowFor(r.chain_status);
    const minutesOverdue = deadline ? -minutesUntilDeadline(deadline, now) : null;

    const evId = newId('warr_clm_evt');
    await env.DB.prepare(`
      INSERT INTO oe_warranty_claim_events (
        id, claim_id, event_type, from_status, to_status,
        sla_window, actor_id, notes, payload_json
      ) VALUES (?, ?, 'sla_breached', ?, ?, ?, 'system', ?, ?)
    `).bind(
      evId, r.id, r.chain_status, r.chain_status, window,
      `SLA breached in ${r.chain_status} (window=${window ?? '?'}, deadline ${r.next_sla_due_at ?? '?'})`,
      JSON.stringify({ window, deadline: r.next_sla_due_at, minutes_overdue: minutesOverdue }),
    ).run();

    const crossed = slaBreachCrossesIntoRegulator(r.severity);
    await fireCascade({
      event: 'warranty.claim_sla_breached' as never,
      actor_id: 'system',
      entity_type: 'oe_warranty_claims',
      entity_id: r.id,
      data: {
        claim_number: r.claim_number,
        severity: r.severity,
        oem_name: r.oem_name,
        asset_label: r.asset_label,
        chain_status: r.chain_status,
        sla_window: window,
        deadline: r.next_sla_due_at,
        minutes_overdue: minutesOverdue,
        crossed_into_regulator: crossed,
      },
      env: env as never,
    });
    breached++;
  }

  return { evaluated: rows.length, breached };
}

export default app;
