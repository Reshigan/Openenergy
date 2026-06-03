// ═══════════════════════════════════════════════════════════════════════════
// Grid operator suite — dispatch, ancillary services, connection applications,
// curtailment, outage management, loss factors / nodal zones.
// Statutory basis: ERA 2006, SA Grid Code (Network, System Operations,
// Metering), NERSA Grid Connection Code.
// Mounted at /api/grid-operator — distinct from /api/grid (existing
// connection/constraint CRUD) to avoid route conflicts.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { cachedAll } from '../utils/reference-cache';
import { appendAudit, getChainHead, verifyChain } from '../utils/audit-chain';

const gridOps = new Hono<HonoEnv>();
gridOps.use('*', authMiddleware);

function isGridOperator(role: string): boolean {
  return role === 'grid_operator' || role === 'admin';
}
function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Connection applications ───────────────────────────────────────────────
gridOps.get('/connection-applications', async (c) => {
  const user = getCurrentUser(c);
  const mine = c.req.query('mine') === 'true';
  const status = c.req.query('status');
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (mine || !isGridOperator(user.role)) {
    filters.push('applicant_participant_id = ?');
    binds.push(user.id);
  }
  if (status) { filters.push('status = ?'); binds.push(status); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rs = await c.env.DB.prepare(
    `SELECT * FROM grid_connection_applications ${where} ORDER BY created_at DESC LIMIT 500`,
  ).bind(...binds).all();
  return c.json({ success: true, data: rs.results || [] });
});

gridOps.post('/connection-applications', async (c) => {
  const user = getCurrentUser(c);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['application_number', 'substation', 'voltage_kv', 'requested_capacity_mw', 'connection_type']) {
    if (b[k] == null || b[k] === '') return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('gca');
  await c.env.DB.prepare(
    `INSERT INTO grid_connection_applications
       (id, application_number, applicant_participant_id, project_id, substation,
        voltage_kv, requested_capacity_mw, technology, connection_type, status,
        target_energisation_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'enquiry', ?)`,
  ).bind(
    id, b.application_number, user.id, b.project_id || null, b.substation,
    Number(b.voltage_kv), Number(b.requested_capacity_mw),
    b.technology || null, b.connection_type, b.target_energisation_date || null,
  ).run();
  await c.env.DB.prepare(
    `INSERT INTO grid_connection_events (id, application_id, event_type, event_date, description, actor_id)
     VALUES (?, ?, 'enquiry_submitted', datetime('now'), ?, ?)`,
  ).bind(genId('gce'), id, 'Enquiry submitted', user.id).run();
  const row = await c.env.DB.prepare('SELECT * FROM grid_connection_applications WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

gridOps.post('/connection-applications/:id/advance', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.status) return c.json({ success: false, error: 'status is required' }, 400);
  const allowed = [
    'screening', 'grid_study', 'cost_estimate', 'budget_quote',
    'cost_letter_issued', 'cost_letter_accepted', 'gca_drafted', 'gca_signed',
    'construction', 'commissioning', 'energised', 'rejected', 'withdrawn',
  ];
  if (!allowed.includes(String(b.status))) {
    return c.json({ success: false, error: `status must be one of: ${allowed.join(', ')}` }, 400);
  }
  const sets: string[] = ['status = ?', 'updated_at = datetime(\'now\')'];
  const binds: unknown[] = [b.status];
  for (const k of ['grid_study_fee_zar', 'connection_cost_estimate_zar', 'confirmed_capacity_mw',
                    'target_energisation_date', 'actual_energisation_date', 'assigned_engineer_id',
                    'rejection_reason'] as const) {
    if (k in b) { sets.push(`${k} = ?`); binds.push(b[k] == null ? null : (typeof b[k] === 'number' ? b[k] : String(b[k]))); }
  }
  binds.push(id);
  await c.env.DB.prepare(`UPDATE grid_connection_applications SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  await c.env.DB.prepare(
    `INSERT INTO grid_connection_events (id, application_id, event_type, event_date, description, document_r2_key, actor_id)
     VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`,
  ).bind(genId('gce'), id, String(b.status), (b.description as string) || null, b.document_r2_key || null, user.id).run();
  const row = await c.env.DB.prepare('SELECT * FROM grid_connection_applications WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

// ─── Dispatch schedules ────────────────────────────────────────────────────
gridOps.post('/dispatch/schedules', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['schedule_type', 'trading_day', 'gate_closure_at']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('ds');
  await c.env.DB.prepare(
    `INSERT INTO dispatch_schedules (id, schedule_type, trading_day, gate_closure_at, status, published_by)
     VALUES (?, ?, ?, ?, 'draft', ?)`,
  ).bind(id, b.schedule_type, b.trading_day, b.gate_closure_at, user.id).run();
  return c.json({
    success: true,
    data: await c.env.DB.prepare('SELECT * FROM dispatch_schedules WHERE id = ?').bind(id).first(),
  }, 201);
});

gridOps.post('/dispatch/schedules/:id/periods', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const scheduleId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as { periods?: Array<Record<string, unknown>> };
  if (!Array.isArray(b.periods) || b.periods.length === 0) {
    return c.json({ success: false, error: 'periods[] is required' }, 400);
  }
  let inserted = 0;
  for (const p of b.periods) {
    if (!p.period_start || !p.period_end || p.scheduled_mwh == null) continue;
    await c.env.DB.prepare(
      `INSERT INTO dispatch_schedule_periods
         (id, schedule_id, period_start, period_end, site_id, participant_id,
          scheduled_mwh, cleared_price_zar_mwh, zone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      genId('dsp'), scheduleId, p.period_start, p.period_end,
      p.site_id || null, p.participant_id || null,
      Number(p.scheduled_mwh),
      p.cleared_price_zar_mwh == null ? null : Number(p.cleared_price_zar_mwh),
      p.zone || null,
    ).run();
    inserted++;
  }
  // Sum total scheduled MWh for the schedule header.
  const total = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(scheduled_mwh), 0) AS total FROM dispatch_schedule_periods WHERE schedule_id = ?`,
  ).bind(scheduleId).first<{ total: number }>();
  await c.env.DB.prepare(
    `UPDATE dispatch_schedules SET total_scheduled_mwh = ? WHERE id = ?`,
  ).bind(total?.total || 0, scheduleId).run();
  return c.json({ success: true, data: { inserted, total_scheduled_mwh: total?.total || 0 } });
});

gridOps.post('/dispatch/schedules/:id/publish', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE dispatch_schedules
        SET status = 'published', published_at = datetime('now')
      WHERE id = ? AND status = 'draft'`,
  ).bind(id).run();
  const row = await c.env.DB.prepare('SELECT * FROM dispatch_schedules WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

gridOps.get('/dispatch/schedules', async (c) => {
  const day = c.req.query('trading_day');
  const sql = day
    ? `SELECT * FROM dispatch_schedules WHERE trading_day = ? ORDER BY gate_closure_at DESC LIMIT 100`
    : `SELECT * FROM dispatch_schedules ORDER BY trading_day DESC LIMIT 100`;
  const rs = day
    ? await c.env.DB.prepare(sql).bind(day).all()
    : await c.env.DB.prepare(sql).all();
  return c.json({ success: true, data: rs.results || [] });
});

gridOps.get('/dispatch/schedules/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM dispatch_schedules WHERE id = ?').bind(id).first();
  if (!row) return c.json({ success: false, error: 'Schedule not found' }, 404);
  const user = getCurrentUser(c);
  const periods = isGridOperator(user.role)
    ? await c.env.DB.prepare(
        'SELECT * FROM dispatch_schedule_periods WHERE schedule_id = ? ORDER BY period_start LIMIT 1000',
      ).bind(id).all()
    : await c.env.DB.prepare(
        'SELECT * FROM dispatch_schedule_periods WHERE schedule_id = ? AND participant_id = ? ORDER BY period_start LIMIT 1000',
      ).bind(id, user.id).all();
  return c.json({ success: true, data: { ...row, periods: periods.results || [] } });
});

// ─── Dispatch instructions ─────────────────────────────────────────────────
gridOps.post('/dispatch/instructions', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['instruction_number', 'participant_id', 'instruction_type', 'effective_from', 'reason']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('di');
  const issuedAt = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO dispatch_instructions
       (id, instruction_number, participant_id, site_id, instruction_type,
        issued_at, effective_from, effective_to, target_mw, reason, grid_constraint_id,
        status, issued_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)`,
  ).bind(
    id, b.instruction_number, b.participant_id, b.site_id || null,
    b.instruction_type, issuedAt, b.effective_from, b.effective_to || null,
    b.target_mw == null ? null : Number(b.target_mw),
    b.reason, b.grid_constraint_id || null, user.id,
  ).run();
  // Echo the inserted row directly — skips the re-SELECT round-trip.
  const row = {
    id,
    instruction_number: b.instruction_number,
    participant_id: b.participant_id,
    site_id: b.site_id || null,
    instruction_type: b.instruction_type,
    issued_at: issuedAt,
    effective_from: b.effective_from,
    effective_to: b.effective_to || null,
    target_mw: b.target_mw == null ? null : Number(b.target_mw),
    reason: b.reason,
    grid_constraint_id: b.grid_constraint_id || null,
    status: 'issued',
    issued_by: user.id,
    acknowledged_at: null,
    acknowledgement_by: null,
    compliance_evidence_r2_key: null,
    penalty_amount_zar: null,
  };
  await fireCascade({
    event: 'grid.instruction_issued',
    actor_id: user.id,
    entity_type: 'dispatch_instructions',
    entity_id: id,
    data: {
      participant_id: b.participant_id,
      instruction_type: b.instruction_type,
      instruction_number: b.instruction_number,
      target_mw: b.target_mw,
      effective_from: b.effective_from,
    },
    env: c.env,
    skipAudit: true,
  });

  await appendAudit({
    env: c.env, entity_type: 'grid', entity_id: id,
    event_type: 'dispatch.instruction_issued', actor_id: user.id,
    payload: {
      instruction_id: id, instruction_number: b.instruction_number,
      participant_id: b.participant_id, instruction_type: b.instruction_type,
      target_mw: b.target_mw == null ? null : Number(b.target_mw),
      effective_from: b.effective_from, reason: b.reason,
    },
  }).catch((e) => console.warn('audit_dispatch_failed', (e as Error).message));

  return c.json({ success: true, data: row }, 201);
});

gridOps.post('/dispatch/instructions/:id/acknowledge', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    'SELECT participant_id, status FROM dispatch_instructions WHERE id = ?',
  ).bind(id).first<{ participant_id: string; status: string }>();
  if (!existing) return c.json({ success: false, error: 'Instruction not found' }, 404);
  if (user.role !== 'admin' && existing.participant_id !== user.id) {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  await c.env.DB.prepare(
    `UPDATE dispatch_instructions
        SET status = 'acknowledged', acknowledged_at = datetime('now'), acknowledgement_by = ?
      WHERE id = ? AND status = 'issued'`,
  ).bind(user.id, id).run();
  const row = await c.env.DB.prepare('SELECT * FROM dispatch_instructions WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

gridOps.post('/dispatch/instructions/:id/compliance', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = b.compliant ? 'compliant' : 'non_compliant';
  await c.env.DB.prepare(
    `UPDATE dispatch_instructions
        SET status = ?, compliance_evidence_r2_key = ?, penalty_amount_zar = ?
      WHERE id = ?`,
  ).bind(
    status, b.evidence_r2_key || null,
    b.penalty_amount_zar == null ? null : Number(b.penalty_amount_zar),
    id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM dispatch_instructions WHERE id = ?').bind(id).first<{
    participant_id: string;
  }>();
  if (status === 'non_compliant') {
    await fireCascade({
      event: 'grid.instruction_non_compliant',
      actor_id: user.id,
      entity_type: 'dispatch_instructions',
      entity_id: id,
      data: {
        participant_id: row?.participant_id,
        penalty_amount_zar: b.penalty_amount_zar == null ? 0 : Number(b.penalty_amount_zar),
      },
      env: c.env,
      skipAudit: true,
    });
  }

  await appendAudit({
    env: c.env, entity_type: 'grid', entity_id: id,
    event_type: 'dispatch.compliance_recorded', actor_id: user.id,
    payload: {
      instruction_id: id, status,
      evidence_r2_key: b.evidence_r2_key || null,
      penalty_amount_zar: b.penalty_amount_zar == null ? null : Number(b.penalty_amount_zar),
    },
  }).catch((e) => console.warn('audit_compliance_failed', (e as Error).message));

  return c.json({ success: true, data: row });
});

gridOps.get('/dispatch/instructions', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (!isGridOperator(user.role)) {
    filters.push('participant_id = ?');
    binds.push(user.id);
  }
  if (status) { filters.push('status = ?'); binds.push(status); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rs = await c.env.DB.prepare(
    `SELECT * FROM dispatch_instructions ${where} ORDER BY issued_at DESC LIMIT 200`,
  ).bind(...binds).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Curtailment notices ───────────────────────────────────────────────────
gridOps.post('/curtailment-notices', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['notice_number', 'effective_from', 'reason']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('cn');
  const issuedAt = new Date().toISOString();
  const severity = (b.severity as string) || 'advisory';
  await c.env.DB.prepare(
    `INSERT INTO curtailment_notices
       (id, notice_number, issued_at, effective_from, effective_to, affected_zone,
        reason, curtailment_mw, severity, status, issued_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).bind(
    id, b.notice_number, issuedAt, b.effective_from, b.effective_to || null,
    b.affected_zone || null, b.reason,
    b.curtailment_mw == null ? null : Number(b.curtailment_mw),
    severity, user.id,
  ).run();
  // Echo inserted payload — saves the re-SELECT on a high-fan-out event.
  const row = {
    id,
    notice_number: b.notice_number,
    issued_at: issuedAt,
    effective_from: b.effective_from,
    effective_to: b.effective_to || null,
    affected_zone: b.affected_zone || null,
    reason: b.reason,
    curtailment_mw: b.curtailment_mw == null ? null : Number(b.curtailment_mw),
    severity,
    status: 'active',
    lifted_at: null,
    issued_by: user.id,
  };
  await fireCascade({
    event: 'grid.curtailment_issued',
    actor_id: user.id,
    entity_type: 'curtailment_notices',
    entity_id: id,
    data: {
      notice_number: b.notice_number,
      affected_zone: b.affected_zone,
      curtailment_mw: b.curtailment_mw,
      severity: b.severity || 'advisory',
      effective_from: b.effective_from,
    },
    env: c.env,
  });
  return c.json({ success: true, data: row }, 201);
});

gridOps.post('/curtailment-notices/:id/lift', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE curtailment_notices SET status = 'lifted', lifted_at = datetime('now') WHERE id = ?`,
  ).bind(id).run();
  const row = await c.env.DB.prepare('SELECT * FROM curtailment_notices WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row });
});

gridOps.get('/curtailment-notices', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT * FROM curtailment_notices ORDER BY issued_at DESC LIMIT 200`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Ancillary services ────────────────────────────────────────────────────
gridOps.get('/ancillary/products', async (c) => {
  // Ancillary products change ≤ once per regulatory cycle. Cache in KV
  // for 1 hour so the tender-creation page doesn't hit D1 on every load.
  const rows = await cachedAll(
    c.env as unknown as { DB: HonoEnv['Bindings']['DB']; KV: HonoEnv['Bindings']['KV'] },
    'ancillary_products',
    `SELECT id, product_code, product_name, service_type, description,
            min_capacity_mw, product_duration_hours, enabled
       FROM ancillary_service_products WHERE enabled = 1 ORDER BY service_type`,
    { ttlSeconds: 3600 },
  );
  return c.json({ success: true, data: rows });
});

gridOps.post('/ancillary/tenders', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['tender_number', 'product_id', 'delivery_window_start', 'delivery_window_end',
                    'capacity_required_mw', 'gate_closure_at']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('tnd');
  await c.env.DB.prepare(
    `INSERT INTO ancillary_service_tenders
       (id, tender_number, product_id, delivery_window_start, delivery_window_end,
        capacity_required_mw, ceiling_price_zar_mw_h, gate_closure_at, status, notes, published_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  ).bind(
    id, b.tender_number, b.product_id, b.delivery_window_start, b.delivery_window_end,
    Number(b.capacity_required_mw),
    b.ceiling_price_zar_mw_h == null ? null : Number(b.ceiling_price_zar_mw_h),
    b.gate_closure_at, b.notes || null, user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM ancillary_service_tenders WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

gridOps.get('/ancillary/tenders', async (c) => {
  const status = c.req.query('status');
  const rs = status
    ? await c.env.DB.prepare(
        `SELECT t.*, p.product_name, p.service_type
           FROM ancillary_service_tenders t
           JOIN ancillary_service_products p ON p.id = t.product_id
          WHERE t.status = ? ORDER BY t.gate_closure_at ASC LIMIT 200`,
      ).bind(status).all()
    : await c.env.DB.prepare(
        `SELECT t.*, p.product_name, p.service_type
           FROM ancillary_service_tenders t
           JOIN ancillary_service_products p ON p.id = t.product_id
          ORDER BY t.created_at DESC LIMIT 200`,
      ).all();
  return c.json({ success: true, data: rs.results || [] });
});

gridOps.post('/ancillary/tenders/:id/bids', async (c) => {
  const user = getCurrentUser(c);
  const tenderId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.capacity_offered_mw == null || b.price_zar_mw_h == null) {
    return c.json({ success: false, error: 'capacity_offered_mw and price_zar_mw_h are required' }, 400);
  }
  const tender = await c.env.DB.prepare(
    `SELECT status, gate_closure_at FROM ancillary_service_tenders WHERE id = ?`,
  ).bind(tenderId).first<{ status: string; gate_closure_at: string }>();
  if (!tender) return c.json({ success: false, error: 'Tender not found' }, 404);
  if (tender.status !== 'open') {
    return c.json({ success: false, error: `Tender is ${tender.status}` }, 400);
  }
  if (new Date(tender.gate_closure_at).getTime() < Date.now()) {
    return c.json({ success: false, error: 'Gate closure passed' }, 400);
  }
  const id = genId('bid');
  await c.env.DB.prepare(
    `INSERT INTO ancillary_service_bids
       (id, tender_id, participant_id, capacity_offered_mw, price_zar_mw_h, site_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
  ).bind(id, tenderId, user.id, Number(b.capacity_offered_mw), Number(b.price_zar_mw_h), b.site_id || null).run();
  const row = await c.env.DB.prepare('SELECT * FROM ancillary_service_bids WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

gridOps.post('/ancillary/tenders/:id/clear', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const tenderId = c.req.param('id');
  const tender = await c.env.DB.prepare(
    `SELECT status, capacity_required_mw FROM ancillary_service_tenders WHERE id = ?`,
  ).bind(tenderId).first<{ status: string; capacity_required_mw: number }>();
  if (!tender) return c.json({ success: false, error: 'Tender not found' }, 404);
  if (tender.status !== 'open' && tender.status !== 'closed') {
    return c.json({ success: false, error: `Cannot clear tender in ${tender.status}` }, 400);
  }

  // Merit-order clearing: accept cheapest bids until capacity_required_mw is met.
  // Pay-as-cleared: all awarded bids receive the marginal (highest awarded) price.
  const bids = await c.env.DB.prepare(
    `SELECT id, capacity_offered_mw, price_zar_mw_h
       FROM ancillary_service_bids
      WHERE tender_id = ? AND status = 'submitted'
      ORDER BY price_zar_mw_h ASC, submitted_at ASC`,
  ).bind(tenderId).all<{ id: string; capacity_offered_mw: number; price_zar_mw_h: number }>();

  let needed = tender.capacity_required_mw;
  let clearingPrice = 0;
  const awards: Array<{ bid_id: string; awarded_capacity: number }> = [];
  for (const bid of bids.results || []) {
    if (needed <= 0) break;
    const awardedCap = Math.min(needed, bid.capacity_offered_mw);
    awards.push({ bid_id: bid.id, awarded_capacity: awardedCap });
    clearingPrice = bid.price_zar_mw_h;
    needed -= awardedCap;
  }

  if (awards.length === 0 || needed > 0.01) {
    // Insufficient bids to cover — leave status 'closed' with no awards. Operator
    // can choose to re-run with a higher ceiling.
    await c.env.DB.prepare(
      `UPDATE ancillary_service_tenders SET status = 'evaluated' WHERE id = ?`,
    ).bind(tenderId).run();
    return c.json({
      success: true,
      data: { awarded: [], shortfall_mw: Math.max(0, needed), clearing_price_zar_mw_h: null },
    });
  }

  for (const a of awards) {
    const awardId = genId('awd');
    await c.env.DB.prepare(
      `INSERT INTO ancillary_service_awards (id, tender_id, bid_id, awarded_capacity_mw, clearing_price_zar_mw_h, awarded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(awardId, tenderId, a.bid_id, a.awarded_capacity, clearingPrice, user.id).run();
    await c.env.DB.prepare(
      `UPDATE ancillary_service_bids
          SET status = CASE WHEN awarded_capacity_mw = (SELECT capacity_offered_mw FROM ancillary_service_bids WHERE id = ?) THEN 'awarded_full' ELSE 'awarded_partial' END,
              awarded_capacity_mw = ?,
              awarded_price_zar_mw_h = ?
        WHERE id = ?`,
    ).bind(a.bid_id, a.awarded_capacity, clearingPrice, a.bid_id).run();
  }
  await c.env.DB.prepare(
    `UPDATE ancillary_service_bids SET status = 'lost' WHERE tender_id = ? AND status = 'submitted'`,
  ).bind(tenderId).run();
  await c.env.DB.prepare(
    `UPDATE ancillary_service_tenders SET status = 'awarded' WHERE id = ?`,
  ).bind(tenderId).run();

  return c.json({
    success: true,
    data: {
      awarded: awards,
      shortfall_mw: 0,
      clearing_price_zar_mw_h: clearingPrice,
    },
  });
});

// ─── Outages ───────────────────────────────────────────────────────────────
gridOps.post('/outages', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['outage_number', 'outage_type', 'reported_at']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  const id = genId('out');
  await c.env.DB.prepare(
    `INSERT INTO grid_outages
       (id, outage_number, outage_type, severity, reported_at, started_at,
        estimated_restoration_at, affected_zone, affected_substations,
        affected_customers, affected_load_mw, cause, status, commander_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'open'), ?)`,
  ).bind(
    id, b.outage_number, b.outage_type, b.severity || null,
    b.reported_at, b.started_at || null, b.estimated_restoration_at || null,
    b.affected_zone || null,
    typeof b.affected_substations === 'object' ? JSON.stringify(b.affected_substations) : null,
    b.affected_customers == null ? null : Number(b.affected_customers),
    b.affected_load_mw == null ? null : Number(b.affected_load_mw),
    b.cause || null, b.status || null, user.id,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM grid_outages WHERE id = ?').bind(id).first();
  await fireCascade({
    event: 'grid.outage_reported',
    actor_id: user.id,
    entity_type: 'grid_outages',
    entity_id: id,
    data: {
      outage_number: b.outage_number,
      affected_load_mw: b.affected_load_mw,
      affected_customers: b.affected_customers,
      severity: b.severity,
    },
    env: c.env,
  });
  return c.json({ success: true, data: row }, 201);
});

gridOps.post('/outages/:id/updates', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const outageId = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.update_text) return c.json({ success: false, error: 'update_text is required' }, 400);
  await c.env.DB.prepare(
    `INSERT INTO grid_outage_updates (id, outage_id, update_text, affected_load_mw, restored_load_mw, posted_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    genId('ou'), outageId, b.update_text,
    b.affected_load_mw == null ? null : Number(b.affected_load_mw),
    b.restored_load_mw == null ? null : Number(b.restored_load_mw),
    user.id,
  ).run();
  const VALID_OUTAGE_STATUSES = ['open', 'in_progress', 'restored', 'closed', 'cancelled'];
  if (b.status && !VALID_OUTAGE_STATUSES.includes(b.status as string)) {
    return c.json({ success: false, error: 'invalid status value' }, 400);
  }
  if (b.status) {
    await c.env.DB.prepare('UPDATE grid_outages SET status = ? WHERE id = ?').bind(b.status, outageId).run();
  }
  if (b.status === 'restored' || b.status === 'closed') {
    await c.env.DB.prepare(
      `UPDATE grid_outages SET restored_at = COALESCE(restored_at, datetime('now')) WHERE id = ?`,
    ).bind(outageId).run();
  }
  const row = await c.env.DB.prepare('SELECT * FROM grid_outages WHERE id = ?').bind(outageId).first();
  return c.json({ success: true, data: row });
});

gridOps.get('/outages', async (c) => {
  const status = c.req.query('status');
  const rs = status
    ? await c.env.DB.prepare(
        `SELECT * FROM grid_outages WHERE status = ? ORDER BY reported_at DESC LIMIT 200`,
      ).bind(status).all()
    : await c.env.DB.prepare(
        `SELECT * FROM grid_outages ORDER BY reported_at DESC LIMIT 200`,
      ).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ─── Loss factors / nodal zones ────────────────────────────────────────────
gridOps.get('/zones', async (c) => {
  const rs = await c.env.DB.prepare(`SELECT * FROM nodal_zones ORDER BY code`).all();
  return c.json({ success: true, data: rs.results || [] });
});

gridOps.post('/zones', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const k of ['code', 'name', 'region']) {
    if (!b[k]) return c.json({ success: false, error: `${k} is required` }, 400);
  }
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO nodal_zones (code, name, region, voltage_class)
     VALUES (?, ?, ?, ?)`,
  ).bind(b.code, b.name, b.region, b.voltage_class || null).run();
  const row = await c.env.DB.prepare('SELECT * FROM nodal_zones WHERE code = ?').bind(b.code).first();
  return c.json({ success: true, data: row }, 201);
});

gridOps.post('/zones/:code/loss-factor', async (c) => {
  const user = getCurrentUser(c);
  if (!isGridOperator(user.role)) return c.json({ success: false, error: 'Not authorised' }, 403);
  const code = c.req.param('code');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.effective_month || b.loss_factor_pct == null) {
    return c.json({ success: false, error: 'effective_month and loss_factor_pct are required' }, 400);
  }
  const id = genId('zlf');
  await c.env.DB.prepare(
    `INSERT INTO zone_loss_factors (id, zone_code, effective_month, loss_factor_pct, methodology, approved, approved_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, code, b.effective_month, Number(b.loss_factor_pct),
    b.methodology || 'measured',
    b.approved ? 1 : 0, b.approved ? user.id : null,
  ).run();
  const row = await c.env.DB.prepare('SELECT * FROM zone_loss_factors WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

gridOps.get('/zones/:code/loss-factors', async (c) => {
  const code = c.req.param('code');
  const rs = await c.env.DB.prepare(
    `SELECT * FROM zone_loss_factors WHERE zone_code = ? ORDER BY effective_month DESC LIMIT 50`,
  ).bind(code).all();
  return c.json({ success: true, data: rs.results || [] });
});

// ────────────────────────────────────────────────────────────────────────
// L4 endpoints — curtailment events / outage responses / ancillary award
// events (migration 056). Adds workflow audit on top of the existing
// curtailment_notices + grid_outages + ancillary_service_awards tables.
// ────────────────────────────────────────────────────────────────────────

gridOps.post('/curtailment-events', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.curtailment_id || !body.event_type) {
    return c.json({ success: false, error: 'curtailment_id, event_type required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO grid_curtailment_events
       (id, curtailment_id, event_type, actor_id, notes, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, body.curtailment_id, body.event_type, user.id, body.notes || null, body.payload_json || null).run();
  return c.json({ success: true, data: { id } });
});

gridOps.get('/curtailment-events', async (c) => {
  const curtailmentId = c.req.query('curtailment_id');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (curtailmentId) { where.push('curtailment_id = ?'); binds.push(curtailmentId); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM grid_curtailment_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY occurred_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

gridOps.post('/outage-responses', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.outage_id || !body.response_type) {
    return c.json({ success: false, error: 'outage_id, response_type required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO grid_outage_responses
       (id, outage_id, responder_id, response_type, notes, eta_minutes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, body.outage_id, user.id, body.response_type, body.notes || null, body.eta_minutes ?? null).run();
  return c.json({ success: true, data: { id } });
});

gridOps.get('/outage-responses', async (c) => {
  const outageId = c.req.query('outage_id');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (outageId) { where.push('outage_id = ?'); binds.push(outageId); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM grid_outage_responses ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY responded_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

gridOps.post('/ancillary-events', async (c) => {
  const user = getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as any;
  if (!body.award_id || !body.event_type) {
    return c.json({ success: false, error: 'award_id, event_type required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO grid_ancillary_award_events (id, award_id, event_type, actor_id, notes)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, body.award_id, body.event_type, user.id, body.notes || null).run();
  return c.json({ success: true, data: { id } });
});

gridOps.get('/ancillary-events', async (c) => {
  const awardId = c.req.query('award_id');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (awardId) { where.push('award_id = ?'); binds.push(awardId); }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM grid_ancillary_award_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY occurred_at DESC LIMIT 200`,
  ).bind(...binds).all().catch(() => ({ results: [] } as any));
  return c.json({ success: true, data: rows.results || [] });
});

// ════════════════════════════════════════════════════════════════════════
// L5 — Tamper-evident audit, NRS-shape dispatch register, Eskom recon.
// ════════════════════════════════════════════════════════════════════════

gridOps.get('/audit/head', async (c) => {
  const head = await getChainHead(c.env, 'grid');
  return c.json({ success: true, data: head });
});

gridOps.get('/audit/events', async (c) => {
  const user = getCurrentUser(c);
  const limit = Math.min(200, Number(c.req.query('limit') || 50));
  const where: string[] = [`entity_type = 'grid'`];
  const binds: unknown[] = [];
  const isOfficer = user.role === 'admin' || user.role === 'regulator' || user.role === 'support';
  if (!isOfficer) { where.push('actor_id = ?'); binds.push(user.id); }
  const rs = await c.env.DB.prepare(
    `SELECT id, entity_id, event_type, actor_id, sequence_no, content_hash, prev_hash, created_at, payload_json
       FROM audit_events WHERE ${where.join(' AND ')}
      ORDER BY sequence_no DESC LIMIT ?`,
  ).bind(...binds, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

gridOps.post('/audit/verify', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const fromSeq = Number(c.req.query('from_seq') || 1) || 1;
  const result = await verifyChain(c.env, 'grid', fromSeq);
  return c.json({ success: result.ok, data: result });
});

// POST /grid-operator/audit/export — NRS 048-9 dispatch instruction register.
// One row per dispatch instruction. Per SA Grid Code Section 9 (System
// Operations Code).
gridOps.post('/audit/export', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator' && user.role !== 'grid_operator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = body.to || new Date().toISOString().slice(0, 10);

  const rows = await c.env.DB.prepare(
    `SELECT id, instruction_number, participant_id, instruction_type,
            issued_at, effective_from, effective_to, target_mw,
            reason, status, acknowledged_at, penalty_amount_zar
       FROM dispatch_instructions
      WHERE substr(issued_at, 1, 10) BETWEEN ? AND ?
      ORDER BY issued_at ASC`,
  ).bind(from, to).all<any>().catch(() => ({ results: [] } as any));
  const data = (rows.results || []) as Array<Record<string, any>>;

  const header = ['instruction_id','instruction_number','participant_id','type',
                  'issued_at','effective_from','effective_to','target_mw',
                  'reason','status','acknowledged_at','penalty_zar'].join(',');
  const csvLines = [header];
  for (const r of data) {
    csvLines.push([
      r.id, r.instruction_number, r.participant_id,
      r.instruction_type, r.issued_at, r.effective_from,
      r.effective_to || '', r.target_mw ?? '',
      csvEscape(r.reason || ''), r.status,
      r.acknowledged_at || '', r.penalty_amount_zar ?? '',
    ].join(','));
  }
  const csv = csvLines.join('\n') + '\n';
  const csvBytes = new TextEncoder().encode(csv);
  const csvSha = await sha256OfBytes(csvBytes);

  const head = await getChainHead(c.env, 'grid');
  const exportId = 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-exports/grid/${exportId}/dispatch-register.csv`;
  const manifestKey = `audit-exports/grid/${exportId}/manifest.json`;
  const manifest = {
    export_id: exportId, entity_type: 'grid', from, to,
    generated_at: new Date().toISOString(), generated_by: user.id, row_count: data.length,
    csv: { r2_key: csvKey, sha256: csvSha, bytes: csvBytes.byteLength },
    chain: {
      head_hash: head?.head_hash || null,
      head_sequence: head?.head_sequence || 0,
      last_verified_at: head?.last_verified_at || null,
    },
    format: { profile: 'SA Grid Code Sec 9 dispatch instruction register v1', encoding: 'utf-8' },
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

  try {
    await c.env.R2.put(csvKey, csvBytes, { httpMetadata: { contentType: 'text/csv' } });
    await c.env.R2.put(manifestKey, manifestBytes, { httpMetadata: { contentType: 'application/json' } });
  } catch (e) {
    return c.json({ success: false, error: 'R2 write failed', data: { detail: (e as Error).message } }, 502);
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_exports
       (id, entity_type, from_ts, to_ts, row_count,
        csv_r2_key, manifest_r2_key, chain_head_hash, generated_by, generated_at)
     VALUES (?, 'grid', ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(exportId, from, to, data.length, csvKey, manifestKey,
         head?.head_hash || '', user.id).run();

  await appendAudit({
    env: c.env, entity_type: 'grid', entity_id: exportId,
    event_type: 'audit.export_generated', actor_id: user.id,
    payload: { export_id: exportId, from, to, row_count: data.length, csv_sha256: csvSha },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { export_id: exportId, row_count: data.length, csv_r2_key: csvKey, manifest_r2_key: manifestKey, manifest },
  }, 201);
});

gridOps.get('/audit/exports', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, from_ts, to_ts, row_count, csv_r2_key, manifest_r2_key,
            chain_head_hash, generated_by, generated_at
       FROM audit_exports WHERE entity_type = 'grid'
      ORDER BY generated_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });

gridOps.get('/audit/exports/:id/manifest', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT manifest_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'grid'`,
  ).bind(id).first<{ manifest_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.manifest_r2_key);
  if (!obj) return c.json({ success: false, error: 'Manifest object missing in R2' }, 404);
  const text = await obj.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  return c.json({ success: true, data: parsed ?? { raw: text } });
});

gridOps.get('/audit/exports/:id/csv', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT csv_r2_key FROM audit_exports WHERE id = ? AND entity_type = 'grid'`,
  ).bind(id).first<{ csv_r2_key: string }>();
  if (!row) return c.json({ success: false, error: 'Export not found' }, 404);
  const obj = await c.env.R2.get(row.csv_r2_key);
  if (!obj) return c.json({ success: false, error: 'CSV object missing in R2' }, 404);
  return new Response(await obj.arrayBuffer(), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${id}.csv"`,
    },
  });
});
});

// POST /grid-operator/audit/recon — Eskom System Operator dispatch recon.
// CSV columns: instruction_number, effective_from, target_mw, participant_id
// Match against dispatch_instructions by instruction_number.
gridOps.post('/audit/recon', async (c) => {
  const user = getCurrentUser(c);
  if (user.role !== 'admin' && user.role !== 'regulator' && user.role !== 'grid_operator') {
    return c.json({ success: false, error: 'Not authorised' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { source?: string; csv?: string };
  const source = (body.source || 'eskom').toLowerCase();
  if (typeof body.csv !== 'string' || body.csv.length < 10) {
    return c.json({ success: false, error: 'csv body required' }, 400);
  }
  const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return c.json({ success: false, error: 'csv must have header + ≥1 row' }, 400);
  const headers = lines[0].split(',').map((h) => h.trim());
  const need = ['instruction_number','effective_from','target_mw','participant_id'];
  for (const k of need) {
    if (!headers.includes(k)) return c.json({ success: false, error: `csv missing column: ${k}` }, 400);
  }
  const idxOf = (k: string) => headers.indexOf(k);
  type TheirRow = { instruction_number: string; effective_from: string; target_mw: number; participant_id: string };
  const theirs: TheirRow[] = [];
  for (const ln of lines.slice(1)) {
    const cols = ln.split(',');
    theirs.push({
      instruction_number: (cols[idxOf('instruction_number')] || '').trim(),
      effective_from: (cols[idxOf('effective_from')] || '').trim(),
      target_mw: Number(cols[idxOf('target_mw')] || 0),
      participant_id: (cols[idxOf('participant_id')] || '').trim(),
    });
  }

  const runId = 'recon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const csvKey = `audit-recon/grid/${runId}/eskom.csv`;
  await c.env.R2.put(csvKey, new TextEncoder().encode(body.csv), {
    httpMetadata: { contentType: 'text/csv' },
  }).catch(() => null);

  const ours = await c.env.DB.prepare(
    `SELECT id, instruction_number, effective_from, target_mw, participant_id
       FROM dispatch_instructions`,
  ).all<{ id: string; instruction_number: string; effective_from: string; target_mw: number; participant_id: string }>().catch(() => ({ results: [] } as any));
  const ourByNumber = new Map<string, any>();
  for (const r of (ours.results || []) as any[]) ourByNumber.set(r.instruction_number, r);

  const matched = new Set<string>();
  type Break = { type: string; instruction_number: string | null; our: unknown; their: unknown; field: string | null };
  const breaks: Break[] = [];
  for (const t of theirs) {
    if (!t.instruction_number) {
      breaks.push({ type: 'missing_in_ours', instruction_number: null, our: null, their: t, field: null });
      continue;
    }
    const o = ourByNumber.get(t.instruction_number);
    if (!o) {
      breaks.push({ type: 'missing_in_ours', instruction_number: t.instruction_number, our: null, their: t, field: null });
      continue;
    }
    matched.add(t.instruction_number);
    if (Math.abs(Number(o.target_mw || 0) - Number(t.target_mw)) > 1e-3) {
      breaks.push({ type: 'field_mismatch', instruction_number: t.instruction_number, our: o, their: t, field: 'target_mw' });
    }
  }
  for (const [n, o] of ourByNumber.entries()) {
    if (!matched.has(n) && !theirs.some((t) => t.instruction_number === n)) {
      breaks.push({ type: 'missing_in_theirs', instruction_number: n, our: o, their: null, field: null });
    }
  }

  const matchedCount = theirs.length - breaks.filter((b) => b.type !== 'field_mismatch').length;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO audit_recon_runs
       (id, entity_type, source, uploaded_csv_r2_key, row_count,
        matched_count, break_count, status, started_at, finished_at, started_by)
     VALUES (?, 'grid', ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  ).bind(runId, source, csvKey, theirs.length, matchedCount,
         breaks.length, now, now, user.id).run();

  if (breaks.length > 0) {
    const inserts = breaks.map((b) => c.env.DB.prepare(
      `INSERT INTO audit_recon_breaks
         (id, run_id, break_type, external_ref, our_value, their_value, field, resolution)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    ).bind(
      'brk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      runId, b.type, b.instruction_number,
      b.our != null ? JSON.stringify(b.our) : null,
      b.their != null ? JSON.stringify(b.their) : null,
      b.field,
    ));
    await c.env.DB.batch(inserts);
  }

  await appendAudit({
    env: c.env, entity_type: 'grid', entity_id: runId,
    event_type: 'audit.recon_run', actor_id: user.id,
    payload: { run_id: runId, source, row_count: theirs.length, break_count: breaks.length },
  }).catch(() => {});

  return c.json({
    success: true,
    data: { run_id: runId, source, row_count: theirs.length, matched_count: matchedCount, break_count: breaks.length },
  }, 201);
});

gridOps.get('/audit/recon', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, source, row_count, matched_count, break_count, status,
            started_at, finished_at
       FROM audit_recon_runs WHERE entity_type = 'grid'
      ORDER BY started_at DESC LIMIT 50`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
async function sha256OfBytes(b: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export default gridOps;
