import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import {
  DsrStatus,
  DsrAction,
  DSR_VALID_TRANSITIONS,
  DSR_STATE_TRANSITIONS,
  DSR_HARD_TERMINALS,
  crossesDsrIntoRegulator,
  deriveDsrSlaDays,
  RequestType,
} from '../utils/data-subject-request-spec';

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

const WRITE_ROLES = new Set(['admin']);

function slaDeadline(request_type: RequestType): string {
  const d = new Date();
  d.setDate(d.getDate() + deriveDsrSlaDays(request_type));
  return d.toISOString();
}

// GET / — list with stats
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM oe_data_subject_requests WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200`
  ).bind(user.tenant_id).all();

  const rows = results as Record<string, unknown>[];
  const now = new Date().toISOString();
  const stats = {
    total: rows.length,
    open: rows.filter(r => !DSR_HARD_TERMINALS.has(r.chain_status as DsrStatus)).length,
    fulfilled: rows.filter(r => r.chain_status === 'fulfilled' || r.chain_status === 'erasure_completed' || r.chain_status === 'objection_upheld').length,
    refused: rows.filter(r => r.chain_status === 'refused' || r.chain_status === 'partial_disclosure').length,
    overdue: rows.filter(r => r.sla_deadline && (r.sla_deadline as string) < now && !DSR_HARD_TERMINALS.has(r.chain_status as DsrStatus)).length,
  };

  return c.json({ data: { requests: rows, stats } });
});

// GET /:id
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);
  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_data_subject_requests WHERE id = ? AND tenant_id = ?`
  ).bind(c.req.param('id'), user.tenant_id).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ data: row });
});

// POST / — open new DSR
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json() as Record<string, unknown>;
  const {
    requester_name, requester_email, requester_id_number,
    relationship = 'data_subject', request_type,
    data_categories, systems_involved,
  } = body;

  if (!requester_name || !requester_email || !request_type) {
    return c.json({ error: 'requester_name, requester_email, request_type required' }, 400);
  }

  const rt = request_type as RequestType;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const ref = `DSR-${Date.now().toString(36).toUpperCase()}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_data_subject_requests
      (id,tenant_id,requester_name,requester_email,requester_id_number,relationship,
       request_type,sla_days,data_categories,systems_involved,chain_status,
       response_ref,sla_deadline,actor_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,'received',?,?,?,?,?)
  `).bind(
    id, user.tenant_id, requester_name, requester_email, requester_id_number ?? null,
    relationship, rt, deriveDsrSlaDays(rt),
    data_categories ? JSON.stringify(data_categories) : null,
    systems_involved ? JSON.stringify(systems_involved) : null,
    ref, slaDeadline(rt), user.id, now, now,
  ).run();

  await fireCascade({
    event: 'dsr_evt_received',
    actor_id: user.id,
    entity_type: 'data_subject_request',
    entity_id: id,
    data: { request_type: rt, requester_email, ref },
    env: c.env,
  });

  return c.json({ data: { id, ref } }, 201);
});

// POST /:id/action
app.post('/:id/action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    `SELECT * FROM oe_data_subject_requests WHERE id = ? AND tenant_id = ?`
  ).bind(c.req.param('id'), user.tenant_id).first() as Record<string, unknown> | null;
  if (!row) return c.json({ error: 'Not found' }, 404);

  const { action, reason_code, reason_detail, legal_ground_for_refusal, partial_disclosure_rationale } = await c.req.json() as {
    action: DsrAction;
    reason_code?: string;
    reason_detail?: string;
    legal_ground_for_refusal?: string;
    partial_disclosure_rationale?: string;
  };

  const currentStatus = row.chain_status as DsrStatus;
  const allowed = DSR_VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(action)) {
    return c.json({ error: `Action ${action} not allowed from ${currentStatus}` }, 400);
  }

  const newStatus = DSR_STATE_TRANSITIONS[action];
  const rt = row.request_type as RequestType;
  const now = new Date().toISOString();

  const crossesRegulator = crossesDsrIntoRegulator(action, rt);

  await c.env.DB.prepare(`
    UPDATE oe_data_subject_requests
    SET chain_status=?, reason_code=?, reason_detail=?,
        legal_ground_for_refusal=COALESCE(?,legal_ground_for_refusal),
        partial_disclosure_rationale=COALESCE(?,partial_disclosure_rationale),
        ir_notified=CASE WHEN ? THEN 1 ELSE ir_notified END,
        actor_id=?, updated_at=?
    WHERE id=?
  `).bind(
    newStatus, reason_code ?? null, reason_detail ?? null,
    legal_ground_for_refusal ?? null, partial_disclosure_rationale ?? null,
    crossesRegulator ? 1 : 0,
    user.id, now, row.id,
  ).run();

  const eventKey: Record<DsrAction, string> = {
    acknowledge: 'dsr_evt_acknowledged',
    verify_identity: 'dsr_evt_identity_verified',
    map_data: 'dsr_evt_data_mapped',
    commence_legal_assessment: 'dsr_evt_legal_assessment',
    draft_response: 'dsr_evt_response_drafted',
    fulfill: 'dsr_evt_fulfilled',
    partially_disclose: 'dsr_evt_partial_disclosure',
    refuse: 'dsr_evt_refused',
    complete_erasure: 'dsr_evt_erasure_completed',
    uphold_objection: 'dsr_evt_objection_upheld',
    withdraw: 'dsr_evt_withdrawn',
  };

  await fireCascade({
    event: eventKey[action] as Parameters<typeof fireCascade>[0]['event'],
    actor_id: user.id,
    entity_type: 'data_subject_request',
    entity_id: row.id as string,
    data: {
      request_type: rt,
      prev_status: currentStatus,
      new_status: newStatus,
      crosses_regulator: crossesRegulator,
    },
    env: c.env,
  });

  return c.json({ data: { id: row.id, status: newStatus } });
});

// SLA sweep
export async function dataSubjectRequestSlaSweep(env: HonoEnv['Bindings']): Promise<void> {
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(`
    SELECT id, tenant_id, request_type
    FROM oe_data_subject_requests
    WHERE chain_status NOT IN ('fulfilled','partial_disclosure','refused','erasure_completed','objection_upheld','withdrawn')
      AND sla_deadline IS NOT NULL AND sla_deadline < ?
  `).bind(now).all();

  for (const row of results as Record<string, unknown>[]) {
    await env.DB.prepare(`
      UPDATE oe_data_subject_requests SET chain_status='refused', reason_code='sla_breach',
      updated_at=? WHERE id=?
    `).bind(now, row.id).run();
    await fireCascade({
      event: 'dsr_evt_sla_breach',
      actor_id: 'system',
      entity_type: 'data_subject_request',
      entity_id: row.id as string,
      data: { request_type: row.request_type },
      env,
    });
  }
}

export default app;
