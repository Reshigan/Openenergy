// Wave 139 — IPP Material Inspection Record (MIR)
// ISO 9001:2015 §8.6 + REIPPPP quality specs + Equator Principles EP4 + IE oversight.
// URGENT SLA: critical_structural 24h (tightest) → general 168h (loosest).
// SIGNATURE: reject_material EVERY tier when IE witnessed;
//            quarantine_material EVERY tier when floor_critical_safety.

import { Hono } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import { badDate, badEnum } from '../utils/validation';
import {
  nextStatus,
  isHardTerminal,
  SLA_HOURS,
  slaDeadlineFor,
  slaHoursRemaining,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  eventTypeFor,
  statusTsCol,
  type MirStatus,
  type MirAction,
  type MaterialTier,
} from '../utils/ipp-mir-spec';

const READ_ROLES = new Set([
  'admin', 'trader', 'ipp_developer', 'offtaker', 'grid_operator',
  'regulator', 'lender', 'support', 'carbon_fund',
]);
const WRITE_ROLES = new Set(['admin', 'ipp_developer', 'support']);

interface MirRow {
  id: string;
  project_id: string;
  project_name: string | null;
  mir_number: string | null;
  chain_status: MirStatus;
  material_description: string;
  material_category: string | null;
  material_tier: MaterialTier | null;
  supplier_name: string | null;
  manufacturer: string | null;
  batch_number: string | null;
  certificate_number: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  po_reference: string | null;
  scheduled_delivery_date: string | null;
  actual_delivery_date: string | null;
  delivery_note_ref: string | null;
  delivery_vehicle_ref: string | null;
  inspection_type: string | null;
  inspector_name: string | null;
  inspection_findings: string | null;
  dimensional_check_passed: number | null;
  quantity_check_passed: number | null;
  documentation_check_passed: number | null;
  visual_check_passed: number | null;
  test_required: number;
  lab_name: string | null;
  lab_sample_ref: string | null;
  test_results: string | null;
  test_passed: number | null;
  rejection_reason: string | null;
  quarantine_reason: string | null;
  conditional_notes: string | null;
  incorporated_to: string | null;
  incorporated_by: string | null;
  floor_ie_witnessed: number;
  floor_lender_hold_point: number;
  floor_nersa_material: number;
  floor_critical_safety: number;
  floor_manufacturer_warranty_at_risk: number;
  sla_target_hours: number | null;
  sla_deadline_at: string | null;
  sla_breached: number;
  sla_breach_count: number;
  is_reportable: number;
  regulator_ref: string | null;
  ncr_ref: string | null;
  submittal_ref: string | null;
  rfi_ref: string | null;
  change_order_ref: string | null;
  delivery_notified_at: string | null;
  delivered_at: string | null;
  initial_inspection_at: string | null;
  detailed_inspection_at: string | null;
  test_sampling_at: string | null;
  results_pending_at: string | null;
  approved_at: string | null;
  conditional_approval_at: string | null;
  incorporated_at: string | null;
  rejected_on_site_at: string | null;
  quarantined_at: string | null;
  returned_to_supplier_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES = new Set([
  'delivery_notified', 'delivered', 'initial_inspection', 'detailed_inspection',
  'test_sampling', 'results_pending', 'conditional_approval',
]);

const INSPECTION_STATUSES = new Set([
  'initial_inspection', 'detailed_inspection', 'test_sampling', 'results_pending',
]);

function decorateLiveFields(row: MirRow, now: Date) {
  const stateAt = (row as any)[statusTsCol(row.chain_status)] as string | null;
  const timeInState = stateAt
    ? Math.round((now.getTime() - new Date(stateAt).getTime()) / 3600000)
    : null;
  const isRejected = row.chain_status === 'rejected_on_site' || row.chain_status === 'quarantined';
  const isSignature = !!(
    (row.chain_status === 'rejected_on_site' && row.floor_ie_witnessed) ||
    (row.chain_status === 'quarantined' && row.floor_critical_safety)
  );
  return {
    ...row,
    time_in_state_hours_live: timeInState,
    sla_remaining_hours_live: slaHoursRemaining(row.sla_deadline_at, now),
    is_rejected_live: isRejected,
    is_signature_live: isSignature,
    in_inspection_live: INSPECTION_STATUSES.has(row.chain_status),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── GET /api/ipp-mir ─────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const rows = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_mirs ORDER BY created_at DESC'
  ).all<MirRow>();

  const now = new Date();
  const data = (rows.results ?? []).map(r => decorateLiveFields(r, now));

  const activeRows = data.filter(r => ACTIVE_STATUSES.has(r.chain_status));

  const dashboard = {
    mirs: {
      total_count:              data.length,
      in_inspection_count:      data.filter(r => r.in_inspection_live).length,
      approved_count:           data.filter(r => r.chain_status === 'approved' || r.chain_status === 'conditional_approval').length,
      rejected_count:           data.filter(r => r.chain_status === 'rejected_on_site').length,
      quarantined_count:        data.filter(r => r.chain_status === 'quarantined').length,
      sla_breached_count:       data.filter(r => r.sla_breached).length,
      critical_structural_count: activeRows.filter(r => r.material_tier === 'critical_structural').length,
    },
  };

  return c.json({ data, dashboard });
});

// ─── GET /api/ipp-mir/:id ─────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!READ_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_mirs WHERE id = ?'
  ).bind(c.req.param('id')).first<MirRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const events = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_mir_events WHERE mir_id = ? ORDER BY created_at ASC'
  ).bind(row.id).all();

  return c.json({
    data: {
      mir: decorateLiveFields(row, new Date()),
      events: events.results ?? [],
    },
  });
});

// ─── POST /api/ipp-mir ────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as {
    project_id?: string;
    project_name?: string;
    mir_number?: string;
    material_description?: string;
    material_category?: string;
    material_tier?: MaterialTier;
    supplier_name?: string;
    manufacturer?: string;
    batch_number?: string;
    certificate_number?: string;
    quantity?: number;
    quantity_unit?: string;
    po_reference?: string;
    scheduled_delivery_date?: string;
    floor_ie_witnessed?: number;
    floor_lender_hold_point?: number;
    floor_nersa_material?: number;
    floor_critical_safety?: number;
    floor_manufacturer_warranty_at_risk?: number;
    ncr_ref?: string;
    submittal_ref?: string;
    rfi_ref?: string;
    change_order_ref?: string;
    [k: string]: unknown;
  };

  if (!body.material_description || !body.project_id || !body.material_category || !body.material_tier) {
    return c.json({ error: 'material_description, project_id, material_category, and material_tier are required' }, 400);
  }

  const enumErr = badEnum('material_tier', body.material_tier, ['critical_structural', 'electrical_mechanical', 'civil', 'general']);
  if (enumErr) return c.json({ error: enumErr }, 400);

  const dateErr = badDate('scheduled_delivery_date', body.scheduled_delivery_date);
  if (dateErr) return c.json({ error: dateErr }, 400);

  const tier = body.material_tier as MaterialTier;
  const now = new Date();
  const slaHrs = SLA_HOURS[tier];
  const slaDeadline = slaDeadlineFor(tier, now);

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM oe_ipp_mirs'
  ).first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;
  const id = `mir-${String(cnt + 1).padStart(3, '0')}`;

  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_mirs (
      id, project_id, project_name, mir_number, chain_status,
      material_description, material_category, material_tier,
      supplier_name, manufacturer, batch_number, certificate_number,
      quantity, quantity_unit, po_reference, scheduled_delivery_date,
      floor_ie_witnessed, floor_lender_hold_point, floor_nersa_material,
      floor_critical_safety, floor_manufacturer_warranty_at_risk,
      ncr_ref, submittal_ref, rfi_ref, change_order_ref,
      sla_target_hours, sla_deadline_at,
      sla_breached, sla_breach_count, is_reportable,
      delivery_notified_at, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 'delivery_notified',
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      0, 0, 0,
      ?, ?, ?, ?
    )
  `).bind(
    id, body.project_id, body.project_name ?? null, body.mir_number ?? null,
    body.material_description, body.material_category, tier,
    body.supplier_name ?? null, body.manufacturer ?? null,
    body.batch_number ?? null, body.certificate_number ?? null,
    body.quantity ?? null, body.quantity_unit ?? null,
    body.po_reference ?? null, body.scheduled_delivery_date ?? null,
    Number(body.floor_ie_witnessed ?? 0), Number(body.floor_lender_hold_point ?? 0),
    Number(body.floor_nersa_material ?? 0), Number(body.floor_critical_safety ?? 0),
    Number(body.floor_manufacturer_warranty_at_risk ?? 0),
    body.ncr_ref ?? null, body.submittal_ref ?? null,
    body.rfi_ref ?? null, body.change_order_ref ?? null,
    slaHrs, slaDeadline.toISOString(),
    now.toISOString(), user.id, now.toISOString(), now.toISOString(),
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_mirs WHERE id = ?'
  ).bind(id).first<MirRow>();

  await fireCascade({
    event: 'ipp_mir.record_delivery' as any,
    actor_id: user.id,
    entity_type: 'ipp_mir',
    entity_id: id,
    data: {
      action: 'create',
      material_description: body.material_description,
      material_category: body.material_category,
      material_tier: tier,
      project_id: body.project_id,
      floor_ie_witnessed: Number(body.floor_ie_witnessed ?? 0),
      floor_critical_safety: Number(body.floor_critical_safety ?? 0),
      floor_nersa_material: Number(body.floor_nersa_material ?? 0),
    },
    env: c.env,
  });

  return c.json({ data: decorateLiveFields(created!, new Date()) }, 201);
});

// ─── POST /api/ipp-mir/:id/:action ───────────────────────────────────────────
app.post('/:id/:action', async (c) => {
  const user = getCurrentUser(c);
  if (!WRITE_ROLES.has(user.role)) return c.json({ error: 'Forbidden' }, 403);

  const { id, action } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    notes?: string;
    rejection_reason?: string;
    quarantine_reason?: string;
    conditional_notes?: string;
    incorporated_to?: string;
    incorporated_by?: string;
    actual_delivery_date?: string;
    delivery_note_ref?: string;
    delivery_vehicle_ref?: string;
    inspection_type?: string;
    inspector_name?: string;
    inspection_findings?: string;
    dimensional_check_passed?: number;
    quantity_check_passed?: number;
    documentation_check_passed?: number;
    visual_check_passed?: number;
    lab_name?: string;
    lab_sample_ref?: string;
    test_results?: string;
    test_passed?: number;
    [k: string]: unknown;
  };

  const row = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_mirs WHERE id = ?'
  ).bind(id).first<MirRow>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  if (isHardTerminal(row.chain_status)) {
    return c.json({ error: `MIR is in terminal state: ${row.chain_status}` }, 409);
  }

  const mirAction = action as MirAction;
  const toStatus = nextStatus(row.chain_status, mirAction);
  if (toStatus === null) {
    return c.json({ error: `Action '${action}' not allowed from '${row.chain_status}'` }, 422);
  }

  const now = new Date();

  const regulatorCrossed = crossesIntoRegulator(mirAction, {
    floor_ie_witnessed: row.floor_ie_witnessed,
    floor_critical_safety: row.floor_critical_safety,
    floor_nersa_material: row.floor_nersa_material,
    floor_lender_hold_point: row.floor_lender_hold_point,
  });

  const updates: string[] = ['chain_status = ?', 'updated_at = ?'];
  const vals: unknown[] = [toStatus, now.toISOString()];

  // Record state timestamp
  const tsCol = statusTsCol(toStatus);
  updates.push(`${tsCol} = ?`);
  vals.push(now.toISOString());

  if (regulatorCrossed) {
    updates.push('is_reportable = 1');
    if (!row.regulator_ref) {
      const tierPart = (row.material_tier ?? 'general').toUpperCase();
      const ref = `W139-MIR-${tierPart}-${now.getFullYear()}-${id.replace('mir-', '').toUpperCase()}`;
      updates.push('regulator_ref = ?');
      vals.push(ref);
    }
  }

  // Optional field updates based on action
  if (body.rejection_reason)        { updates.push('rejection_reason = ?');       vals.push(body.rejection_reason); }
  if (body.quarantine_reason)        { updates.push('quarantine_reason = ?');       vals.push(body.quarantine_reason); }
  if (body.conditional_notes)        { updates.push('conditional_notes = ?');       vals.push(body.conditional_notes); }
  if (body.incorporated_to)          { updates.push('incorporated_to = ?');         vals.push(body.incorporated_to); }
  if (body.incorporated_by)          { updates.push('incorporated_by = ?');         vals.push(body.incorporated_by); }
  if (body.actual_delivery_date)     { updates.push('actual_delivery_date = ?');    vals.push(body.actual_delivery_date); }
  if (body.delivery_note_ref)        { updates.push('delivery_note_ref = ?');       vals.push(body.delivery_note_ref); }
  if (body.delivery_vehicle_ref)     { updates.push('delivery_vehicle_ref = ?');    vals.push(body.delivery_vehicle_ref); }
  if (body.inspection_type)          { updates.push('inspection_type = ?');         vals.push(body.inspection_type); }
  if (body.inspector_name)           { updates.push('inspector_name = ?');          vals.push(body.inspector_name); }
  if (body.inspection_findings)      { updates.push('inspection_findings = ?');     vals.push(body.inspection_findings); }
  if (body.dimensional_check_passed != null) { updates.push('dimensional_check_passed = ?'); vals.push(body.dimensional_check_passed); }
  if (body.quantity_check_passed    != null) { updates.push('quantity_check_passed = ?');    vals.push(body.quantity_check_passed); }
  if (body.documentation_check_passed != null) { updates.push('documentation_check_passed = ?'); vals.push(body.documentation_check_passed); }
  if (body.visual_check_passed      != null) { updates.push('visual_check_passed = ?');      vals.push(body.visual_check_passed); }
  if (body.lab_name)                 { updates.push('lab_name = ?');                vals.push(body.lab_name); }
  if (body.lab_sample_ref)           { updates.push('lab_sample_ref = ?');          vals.push(body.lab_sample_ref); }
  if (body.test_results)             { updates.push('test_results = ?');            vals.push(body.test_results); }
  if (body.test_passed != null)      { updates.push('test_passed = ?');             vals.push(body.test_passed); }

  vals.push(id);
  await c.env.DB.prepare(
    `UPDATE oe_ipp_mirs SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  // Write event row
  const eventId = `mirevt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventTypeFor(mirAction);
  await c.env.DB.prepare(`
    INSERT INTO oe_ipp_mir_events
      (id, mir_id, action, from_status, to_status, actor_id, actor_role, notes, regulator_crossed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId, id, mirAction,
    row.chain_status, toStatus,
    user.id, user.role,
    body.notes ?? body.rejection_reason ?? body.quarantine_reason ?? null,
    regulatorCrossed ? 1 : 0,
    now.toISOString(),
  ).run();

  await fireCascade({
    event: eventType as any,
    actor_id: user.id,
    entity_type: 'ipp_mir',
    entity_id: id,
    data: {
      action: mirAction,
      from_status: row.chain_status,
      to_status: toStatus,
      material_tier: row.material_tier,
      material_category: row.material_category,
      floor_ie_witnessed: row.floor_ie_witnessed,
      floor_critical_safety: row.floor_critical_safety,
      floor_nersa_material: row.floor_nersa_material,
      floor_lender_hold_point: row.floor_lender_hold_point,
      regulator_crossed: regulatorCrossed,
      is_reportable: regulatorCrossed,
    },
    env: c.env,
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_mirs WHERE id = ?'
  ).bind(id).first<MirRow>();

  return c.json({ data: decorateLiveFields(updated!, new Date()) });
});

export default app;

// ─── Cron: SLA sweep (runs in */15 shared slot) ──────────────────────────────
export async function ippMirSlaSweep(env: HonoEnv['Bindings']): Promise<{ swept: number; crossed: number }> {
  const now = new Date();
  const openRows = await env.DB.prepare(`
    SELECT * FROM oe_ipp_mirs
    WHERE sla_breached = 0
      AND sla_deadline_at IS NOT NULL
      AND chain_status NOT IN ('incorporated', 'returned_to_supplier')
  `).all<MirRow>();

  let swept = 0;
  let crossed = 0;

  for (const row of (openRows.results ?? [])) {
    if (!row.sla_deadline_at) continue;
    if (new Date(row.sla_deadline_at) <= now) {
      swept++;
      const tier = (row.material_tier ?? 'general') as MaterialTier;
      const reg = slaBreachCrossesIntoRegulator(tier, {
        floor_ie_witnessed: !!row.floor_ie_witnessed,
        floor_nersa_material: !!row.floor_nersa_material,
      });
      if (reg) crossed++;

      await env.DB.prepare(`
        UPDATE oe_ipp_mirs
        SET sla_breached = 1,
            sla_breach_count = sla_breach_count + 1,
            ${reg ? 'is_reportable = 1,' : ''}
            updated_at = ?
        WHERE id = ?
      `).bind(now.toISOString(), row.id).run();

      await fireCascade({
        event: 'ipp_mir.flag_overdue' as any,
        actor_id: 'cron',
        entity_type: 'ipp_mir',
        entity_id: row.id,
        data: {
          action: 'sla_breached',
          material_tier: row.material_tier,
          material_category: row.material_category,
          floor_ie_witnessed: row.floor_ie_witnessed,
          floor_nersa_material: row.floor_nersa_material,
          floor_critical_safety: row.floor_critical_safety,
          regulator_crossed: reg,
        },
        env,
      });
    }
  }

  return { swept, crossed };
}
