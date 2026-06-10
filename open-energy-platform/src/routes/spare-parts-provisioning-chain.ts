// ═══════════════════════════════════════════════════════════════════════════
// Wave 72 — OEM-Support Spare-Parts Provisioning & Replenishment chain.
//
// Mounted at /api/spare-parts-provisioning/chain.
//
// The SERVICE-PARTS-PLANNING brain of the OEM-Support profile: puts the right
// spare in the right warehouse BEFORE the asset needs it, then runs the
// requisition → purchase → receive → stock → issue lifecycle for a single
// provisioning line. The materials backbone under every other support chain —
// W16 consumes a part, W15 returns one, W63 chases its cost — but none plan or
// replenish inventory; W72 is that layer.
//
// DISTINCTIVE move (beat Syncron / Baxter / SAP SPP / Servigistics): demand is
// PREDICTIVE. The W71 predictive-asset-health engine produces RUL + ranked
// failure modes; a line is raised PRE-FAILURE off that signal
// (demand_source = 'predictive_rul') so the part is pre-positioned before the
// breakdown. Criticality-tiered URGENT SLAs with auto-expedite, a reverse-
// logistics incoming-QA gate, and a quantified stockout-avoidance / working-
// capital ledger complete the differentiation.
//
// Write model — SINGLE-PARTY {admin, support} (same as W41 / W47 / W55 / W63).
// READ all nine personas. actor_party (planner / buyer / warehouse / supplier)
// records the functional owner per step, not the JWT role.
//
// Reportability (the W72 SIGNATURE is AVAILABILITY-RISK-driven):
//   flag_backorder crosses when (vital AND HIGH) OR catastrophic;
//   cancel_provisioning crosses when (vital AND HIGH); sla_breached crosses HIGH.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  provisioningTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  SLA_MINUTES,
  type ProvisioningStatus,
  type ProvisioningAction,
  type ProvisioningTier,
  type Criticality,
} from '../utils/spare-parts-provisioning-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund', 'esco',
]);

// SINGLE-PARTY write — the support / O&M desk owns the whole record. actor_party
// is functional attribution only (planner / buyer / warehouse / supplier).
const WRITE_ROLES = new Set(['admin', 'support']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface ProvisioningRow {
  id: string;
  line_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  demand_source: string;
  part_number: string;
  part_description: string | null;
  oem_name: string | null;
  asset_name: string | null;
  site_name: string | null;
  warehouse: string | null;
  supplier_party_id: string | null;
  supplier_party_name: string | null;
  criticality: Criticality;
  qty_required: number;
  qty_ordered: number | null;
  qty_received: number | null;
  qty_on_hand: number;
  unit_cost_zar: number | null;
  daily_demand: number | null;
  demand_std_dev: number | null;
  lead_time_days: number;
  service_z_factor: number | null;
  reorder_point: number | null;
  safety_stock: number | null;
  rul_days: number | null;
  predictive_lead_days: number | null;
  downtime_cost_per_hour_zar: number | null;
  stockout_impact_zar: number;
  stockout_avoidance_zar: number | null;
  carried_inventory_zar: number | null;
  working_capital_efficiency: number | null;
  fill_rate: number | null;
  provisioning_tier: ProvisioningTier;
  requisition_raised_flag: number;
  approved_flag: number;
  po_issued_flag: number;
  backordered_flag: number;
  shipped_flag: number;
  received_flag: number;
  inspected_flag: number;
  reserved_flag: number;
  issued_flag: number;
  requisition_ref: string | null;
  approval_ref: string | null;
  po_ref: string | null;
  backorder_ref: string | null;
  expedite_ref: string | null;
  shipment_ref: string | null;
  receipt_ref: string | null;
  inspection_ref: string | null;
  rejection_ref: string | null;
  reservation_ref: string | null;
  issue_ref: string | null;
  cancellation_ref: string | null;
  regulator_ref: string | null;
  demand_basis: string | null;
  requisition_basis: string | null;
  approval_basis: string | null;
  po_basis: string | null;
  backorder_basis: string | null;
  expedite_basis: string | null;
  shipment_basis: string | null;
  inspection_basis: string | null;
  rejection_basis: string | null;
  reservation_basis: string | null;
  issue_basis: string | null;
  cancellation_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  reserved_for_wo: string | null;
  backorder_round: number;
  chain_status: ProvisioningStatus;
  demand_identified_at: string;
  requisition_raised_at: string | null;
  requisition_approved_at: string | null;
  po_issued_at: string | null;
  backordered_at: string | null;
  in_transit_at: string | null;
  received_at: string | null;
  stocked_at: string | null;
  reserved_at: string | null;
  issued_at: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ProvisioningEventRow {
  id: string;
  provisioning_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<ProvisioningStatus, keyof ProvisioningRow | null> = {
  demand_identified:    null,
  requisition_raised:   'requisition_raised_at',
  requisition_approved: 'requisition_approved_at',
  po_issued:            'po_issued_at',
  backordered:          'backordered_at',
  in_transit:           'in_transit_at',
  received:             'received_at',
  stocked:              'stocked_at',
  reserved:             'reserved_at',
  issued:               'issued_at',
  returned:             'returned_at',
  cancelled:            'cancelled_at',
};

function decorate(row: ProvisioningRow, now: Date) {
  const tier = row.provisioning_tier;
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
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
  };
}

// confirm_shipment and expedite_backorder both land in 'in_transit', so they
// share the 'spare_parts_provisioning.in_transit' event name.
function eventTypeFor(action: ProvisioningAction): string {
  switch (action) {
    case 'raise_requisition':   return 'spare_parts_provisioning.requisition_raised';
    case 'approve_requisition': return 'spare_parts_provisioning.requisition_approved';
    case 'issue_po':            return 'spare_parts_provisioning.po_issued';
    case 'flag_backorder':      return 'spare_parts_provisioning.backordered';
    case 'confirm_shipment':    return 'spare_parts_provisioning.in_transit';
    case 'expedite_backorder':  return 'spare_parts_provisioning.in_transit';
    case 'receive_goods':       return 'spare_parts_provisioning.received';
    case 'pass_inspection':     return 'spare_parts_provisioning.stocked';
    case 'reject_inspection':   return 'spare_parts_provisioning.returned';
    case 'reserve_stock':       return 'spare_parts_provisioning.reserved';
    case 'issue_part':          return 'spare_parts_provisioning.issued';
    case 'cancel_provisioning': return 'spare_parts_provisioning.cancelled';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const provisioning_tier = c.req.query('provisioning_tier');
  const status            = c.req.query('status');
  const criticality       = c.req.query('criticality');
  const demand_source     = c.req.query('demand_source');
  const supplier_party_id = c.req.query('supplier_party_id');
  const breached          = c.req.query('breached');
  const reportable        = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_spare_parts_provisioning WHERE 1=1';
  const binds: unknown[] = [];
  if (provisioning_tier) { sql += ' AND provisioning_tier = ?'; binds.push(provisioning_tier); }
  if (status)            { sql += ' AND chain_status = ?'; binds.push(status); }
  if (criticality)       { sql += ' AND criticality = ?'; binds.push(criticality); }
  if (demand_source)     { sql += ' AND demand_source = ?'; binds.push(demand_source); }
  if (supplier_party_id) { sql += ' AND supplier_party_id = ?'; binds.push(supplier_party_id); }

  sql += ' ORDER BY datetime(demand_identified_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<ProvisioningRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_criticality: Record<string, number> = {};
  const by_demand_source: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.provisioning_tier] = (by_tier[i.provisioning_tier] || 0) + 1;
    by_criticality[i.criticality] = (by_criticality[i.criticality] || 0) + 1;
    by_demand_source[i.demand_source] = (by_demand_source[i.demand_source] || 0) + 1;
  }

  const open_count       = items.filter((i) => !i.is_terminal).length;
  const backordered_count = items.filter((i) => i.chain_status === 'backordered').length;
  const in_transit_count  = items.filter((i) => i.chain_status === 'in_transit').length;
  const issued_count      = items.filter((i) => i.chain_status === 'issued').length;
  const returned_count    = items.filter((i) => i.chain_status === 'returned').length;
  const cancelled_count   = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable_flag).length;
  const vital_open        = items.filter((i) => !i.is_terminal && i.criticality === 'vital').length;
  const predictive_count  = items.filter((i) => i.demand_source === 'predictive_rul').length;
  const total_stockout_impact_zar = items.reduce((sum, i) => sum + (i.stockout_impact_zar || 0), 0);
  const total_stockout_avoidance_zar = items.reduce((sum, i) => sum + (i.stockout_avoidance_zar || 0), 0);
  const total_carried_inventory_zar = items.reduce((sum, i) => sum + (i.carried_inventory_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_criticality,
      by_demand_source,
      open_count,
      backordered_count,
      in_transit_count,
      issued_count,
      returned_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      vital_open,
      predictive_count,
      total_stockout_impact_zar,
      total_stockout_avoidance_zar,
      total_carried_inventory_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_spare_parts_provisioning WHERE id = ?').bind(id).first<ProvisioningRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_spare_parts_provisioning_events WHERE provisioning_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<ProvisioningEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface RaiseBody {
  requisition_basis?: string;
  requisition_ref?: string;
  qty_required?: number;
  notes?: string;
}
interface ApproveBody {
  approval_basis?: string;
  approval_ref?: string;
  notes?: string;
}
interface PoBody {
  po_basis?: string;
  po_ref?: string;
  qty_ordered?: number;
  unit_cost_zar?: number;
  supplier_party_id?: string;
  supplier_party_name?: string;
  notes?: string;
}
interface BackorderBody {
  backorder_basis?: string;
  backorder_ref?: string;
  stockout_impact_zar?: number;
  reason_code?: string;
  notes?: string;
}
interface ExpediteBody {
  expedite_basis?: string;
  expedite_ref?: string;
  notes?: string;
}
interface ShipmentBody {
  shipment_basis?: string;
  shipment_ref?: string;
  notes?: string;
}
interface ReceiveBody {
  receipt_ref?: string;
  qty_received?: number;
  notes?: string;
}
interface InspectionBody {
  inspection_basis?: string;
  inspection_ref?: string;
  qty_on_hand?: number;
  notes?: string;
}
interface RejectInspectionBody {
  rejection_basis?: string;
  rejection_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface ReserveBody {
  reservation_basis?: string;
  reservation_ref?: string;
  reserved_for_wo?: string;
  notes?: string;
}
interface IssueBody {
  issue_basis?: string;
  issue_ref?: string;
  notes?: string;
}
interface CancelBody {
  cancellation_basis?: string;
  cancellation_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: ProvisioningAction,
  bodyHandler?: (row: ProvisioningRow, body: Record<string, unknown>) => Partial<ProvisioningRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_spare_parts_provisioning WHERE id = ?').bind(id).first<ProvisioningRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // The tier is a function of stockout impact + criticality; re-derive it live so
  // the SLA window and regulator crossings track the CURRENT tier (a backorder
  // can escalate the impact figure).
  const stockoutImpact = (overrides.stockout_impact_zar as number | undefined) ?? row.stockout_impact_zar;
  const criticality = (overrides.criticality as Criticality | undefined) ?? row.criticality;
  const tier = provisioningTier(stockoutImpact, criticality);
  overrides.provisioning_tier = tier;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier, criticality);
  // is_reportable is a stable property of the line (catastrophic OR vital&HIGH);
  // recompute it each transition and force it on when an action crosses.
  overrides.is_reportable = (isReportable(tier, criticality) || crosses) ? 1 : 0;

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
    `UPDATE oe_spare_parts_provisioning SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `spp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_spare_parts_provisioning_events (id, provisioning_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'spare_parts_provisioning',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      provisioning_tier: tier,
      criticality,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_spare_parts_provisioning WHERE id = ?').bind(id).first<ProvisioningRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/raise-requisition', async (c) => transition(c, 'raise_requisition', (_row, body) => {
  const b = body as Partial<RaiseBody>;
  const out: Partial<ProvisioningRow> = { requisition_raised_flag: 1 };
  if (typeof b.requisition_basis === 'string') out.requisition_basis = b.requisition_basis;
  if (typeof b.requisition_ref === 'string')   out.requisition_ref = b.requisition_ref;
  if (typeof b.qty_required === 'number')       out.qty_required = b.qty_required;
  return out;
}));

app.post('/:id/approve-requisition', async (c) => transition(c, 'approve_requisition', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<ProvisioningRow> = { approved_flag: 1 };
  if (typeof b.approval_basis === 'string') out.approval_basis = b.approval_basis;
  if (typeof b.approval_ref === 'string')   out.approval_ref = b.approval_ref;
  return out;
}));

app.post('/:id/issue-po', async (c) => transition(c, 'issue_po', (_row, body) => {
  const b = body as Partial<PoBody>;
  const out: Partial<ProvisioningRow> = { po_issued_flag: 1 };
  if (typeof b.po_basis === 'string')            out.po_basis = b.po_basis;
  if (typeof b.po_ref === 'string')              out.po_ref = b.po_ref;
  if (typeof b.qty_ordered === 'number')         out.qty_ordered = b.qty_ordered;
  if (typeof b.unit_cost_zar === 'number')       out.unit_cost_zar = b.unit_cost_zar;
  if (typeof b.supplier_party_id === 'string')   out.supplier_party_id = b.supplier_party_id;
  if (typeof b.supplier_party_name === 'string') out.supplier_party_name = b.supplier_party_name;
  return out;
}));

app.post('/:id/flag-backorder', async (c) => transition(c, 'flag_backorder', (row, body) => {
  const b = body as Partial<BackorderBody>;
  const out: Partial<ProvisioningRow> = {
    backordered_flag: 1,
    backorder_round: (row.backorder_round || 0) + 1,
    escalation_level: (row.escalation_level || 0) + 1,
  };
  if (typeof b.backorder_basis === 'string')     out.backorder_basis = b.backorder_basis;
  if (typeof b.backorder_ref === 'string')       out.backorder_ref = b.backorder_ref;
  if (typeof b.stockout_impact_zar === 'number') out.stockout_impact_zar = b.stockout_impact_zar;
  if (typeof b.reason_code === 'string')         out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/expedite-backorder', async (c) => transition(c, 'expedite_backorder', (_row, body) => {
  const b = body as Partial<ExpediteBody>;
  const out: Partial<ProvisioningRow> = { shipped_flag: 1 };
  if (typeof b.expedite_basis === 'string') out.expedite_basis = b.expedite_basis;
  if (typeof b.expedite_ref === 'string')   out.expedite_ref = b.expedite_ref;
  return out;
}));

app.post('/:id/confirm-shipment', async (c) => transition(c, 'confirm_shipment', (_row, body) => {
  const b = body as Partial<ShipmentBody>;
  const out: Partial<ProvisioningRow> = { shipped_flag: 1 };
  if (typeof b.shipment_basis === 'string') out.shipment_basis = b.shipment_basis;
  if (typeof b.shipment_ref === 'string')   out.shipment_ref = b.shipment_ref;
  return out;
}));

app.post('/:id/receive-goods', async (c) => transition(c, 'receive_goods', (row, body) => {
  const b = body as Partial<ReceiveBody>;
  const out: Partial<ProvisioningRow> = { received_flag: 1 };
  if (typeof b.receipt_ref === 'string') out.receipt_ref = b.receipt_ref;
  out.qty_received = typeof b.qty_received === 'number' ? b.qty_received : (row.qty_ordered ?? row.qty_required);
  return out;
}));

app.post('/:id/pass-inspection', async (c) => transition(c, 'pass_inspection', (row, body) => {
  const b = body as Partial<InspectionBody>;
  const out: Partial<ProvisioningRow> = { inspected_flag: 1 };
  if (typeof b.inspection_basis === 'string') out.inspection_basis = b.inspection_basis;
  if (typeof b.inspection_ref === 'string')   out.inspection_ref = b.inspection_ref;
  // Stock lands on hand on a passed incoming-QA.
  out.qty_on_hand = typeof b.qty_on_hand === 'number'
    ? b.qty_on_hand
    : (row.qty_on_hand || 0) + (row.qty_received ?? 0);
  return out;
}));

app.post('/:id/reject-inspection', async (c) => transition(c, 'reject_inspection', (_row, body) => {
  const b = body as Partial<RejectInspectionBody>;
  const out: Partial<ProvisioningRow> = { inspected_flag: 1 };
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.rejection_ref === 'string')   out.rejection_ref = b.rejection_ref;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/reserve-stock', async (c) => transition(c, 'reserve_stock', (_row, body) => {
  const b = body as Partial<ReserveBody>;
  const out: Partial<ProvisioningRow> = { reserved_flag: 1 };
  if (typeof b.reservation_basis === 'string') out.reservation_basis = b.reservation_basis;
  if (typeof b.reservation_ref === 'string')   out.reservation_ref = b.reservation_ref;
  if (typeof b.reserved_for_wo === 'string')   out.reserved_for_wo = b.reserved_for_wo;
  return out;
}));

app.post('/:id/issue-part', async (c) => transition(c, 'issue_part', (row, body) => {
  const b = body as Partial<IssueBody>;
  const out: Partial<ProvisioningRow> = { issued_flag: 1 };
  if (typeof b.issue_basis === 'string') out.issue_basis = b.issue_basis;
  if (typeof b.issue_ref === 'string')   out.issue_ref = b.issue_ref;
  // The reserved unit leaves stock on issue.
  out.qty_on_hand = Math.max(0, (row.qty_on_hand || 0) - 1);
  return out;
}));

app.post('/:id/cancel-provisioning', async (c) => transition(c, 'cancel_provisioning', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<ProvisioningRow> = {};
  if (typeof b.cancellation_basis === 'string') out.cancellation_basis = b.cancellation_basis;
  if (typeof b.cancellation_ref === 'string')   out.cancellation_ref = b.cancellation_ref;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')      out.regulator_ref = b.regulator_ref;
  return out;
}));

export async function sparePartsProvisioningSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_spare_parts_provisioning
     WHERE chain_status NOT IN ('issued','returned','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<ProvisioningRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_spare_parts_provisioning
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `spp_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_spare_parts_provisioning_events (id, provisioning_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'spare_parts_provisioning.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.provisioning_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.provisioning_tier)) {
      await fireCascade({
        event: 'spare_parts_provisioning.sla_breached',
        actor_id: 'system',
        entity_type: 'spare_parts_provisioning',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_regulator: true,
        },
        env,
      });
    }

    breached++;
  }
  return { scanned: rows.length, breached };
}

export default app;
