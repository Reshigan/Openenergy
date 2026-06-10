// ═══════════════════════════════════════════════════════════════════════════
// Wave 35 — Esums O&M Warranty Vendor-Side Escalation chain
//
// Mounted at /api/esums/vendor-escalation/chain.
//
// 11-state lifecycle for every supplier-defect escalation an Esums O&M operator
// files against a component vendor / OEM when a recurring defect is detected
// across the fleet. Distinct from W15 warranty/RMA (single-claim) and W24 PR
// (fleet performance) — this is the SUPPLIER-DEFECT side.
//
// Standards: Consumer Protection Act 2008 §56 (implied warranty of quality) +
// §61 (product liability); NRCS Act 2008 (recall powers for safety defects).
//
// Forward path:
//   filed → vendor_triage → vendor_decision → escalated_to_oem →
//   oem_field_investigation → oem_decision → remediation → closed
//
// Branch terminals:
//   recall_issued  — NRCS / manufacturer recall flagged
//   arbitration    — warranty-liability dispute escalated to arbitration
//   withdrawn      — operator withdrew before OEM stage
//
// Defect classes (URGENT SLA — more severe = TIGHTER deadline):
//   safety_recall (4h triage) / fleet_systemic / batch_defect / single_unit (7d)
//
// Reportability (NRCS / regulator inbox):
//   - issue_recall crosses for ALL classes (NRCS recall always notifiable)
//   - oem_decision crosses for safety_recall only (CPA §61)
//   - arbitration + close cross for safety_recall + fleet_systemic
//   - sla_breached crosses for safety_recall + fleet_systemic
//
// Write is open to admin / support / ipp_developer (the Esums O&M operators).
// Each transition is tagged with the contractual party (operator/vendor/oem)
// it represents via actor_party derived from the action.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  SLA_MINUTES,
  type VendorEscalationStatus,
  type VendorEscalationAction,
  type DefectClass,
} from '../utils/vendor-escalation-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer',
  'lender', 'esco',
]);

// No dedicated vendor/OEM login — the Esums O&M operators record every party's
// action; the contractual party is captured separately via actor_party.
const WRITE_ROLES = new Set(['admin', 'support', 'ipp_developer', 'esco']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface EscalationRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  operator_party_id: string;
  operator_party_name: string;
  vendor_party_id: string;
  vendor_party_name: string;
  oem_party_id: string | null;
  oem_party_name: string | null;
  component_type: string;
  component_model: string | null;
  serial_range: string | null;
  fleet_units_affected: number;
  fleet_units_total: number;
  fleet_fraction: number | null;
  site_name: string | null;
  site_province: string | null;
  defect_class: DefectClass;
  safety_critical: number;
  warranty_clause: string | null;
  filing_ref: string | null;
  vendor_decision_ref: string | null;
  oem_decision_ref: string | null;
  remediation_ref: string | null;
  recall_ref: string | null;
  arbitration_case_ref: string | null;
  withdrawal_ref: string | null;
  claim_value_zar: number | null;
  liability_accepted: number | null;
  remedy_type: string | null;
  remedy_cost_zar: number | null;
  defect_summary: string | null;
  vendor_decision_basis: string | null;
  oem_decision_basis: string | null;
  remediation_plan: string | null;
  recall_basis: string | null;
  arbitration_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  rod_notes: string | null;
  chain_status: VendorEscalationStatus;
  filed_at: string;
  vendor_triage_at: string | null;
  vendor_decision_at: string | null;
  escalated_to_oem_at: string | null;
  oem_investigation_at: string | null;
  oem_decision_at: string | null;
  remediation_at: string | null;
  closed_at: string | null;
  recall_issued_at: string | null;
  arbitration_at: string | null;
  withdrawn_at: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EscalationEventRow {
  id: string;
  escalation_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<VendorEscalationStatus, keyof EscalationRow | null> = {
  filed:                   null,
  vendor_triage:           'vendor_triage_at',
  vendor_decision:         'vendor_decision_at',
  escalated_to_oem:        'escalated_to_oem_at',
  oem_field_investigation: 'oem_investigation_at',
  oem_decision:            'oem_decision_at',
  remediation:             'remediation_at',
  closed:                  'closed_at',
  recall_issued:           'recall_issued_at',
  arbitration:             'arbitration_at',
  withdrawn:               'withdrawn_at',
};

function decorate(row: EscalationRow, now: Date) {
  const cls = row.defect_class;
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
    sla_window_minutes: SLA_MINUTES[status]?.[cls] ?? 0,
    is_reportable: isReportable(cls),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(cls),
  };
}

function eventTypeFor(action: VendorEscalationAction): string {
  switch (action) {
    case 'triage':                  return 'vendor_triage';
    case 'vendor_decide':           return 'vendor_decision';
    case 'escalate_to_oem':         return 'escalated_to_oem';
    case 'oem_investigate':         return 'oem_field_investigation';
    case 'oem_decide':              return 'oem_decision';
    case 'start_remediation':       return 'remediation';
    case 'close':                   return 'closed';
    case 'issue_recall':            return 'recall_issued';
    case 'escalate_to_arbitration': return 'arbitration';
    case 'withdraw':                return 'withdrawn';
  }
}

function cascadeEventFor(action: VendorEscalationAction): string {
  switch (action) {
    case 'triage':                  return 'vendor_escalation.vendor_triage';
    case 'vendor_decide':           return 'vendor_escalation.vendor_decision';
    case 'escalate_to_oem':         return 'vendor_escalation.escalated_to_oem';
    case 'oem_investigate':         return 'vendor_escalation.oem_field_investigation';
    case 'oem_decide':              return 'vendor_escalation.oem_decision';
    case 'start_remediation':       return 'vendor_escalation.remediation';
    case 'close':                   return 'vendor_escalation.closed';
    case 'issue_recall':            return 'vendor_escalation.recall_issued';
    case 'escalate_to_arbitration': return 'vendor_escalation.arbitration';
    case 'withdraw':                return 'vendor_escalation.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const defect_class      = c.req.query('defect_class');
  const status            = c.req.query('status');
  const breached          = c.req.query('breached');
  const vendor_party_id   = c.req.query('vendor_party_id');
  const operator_party_id = c.req.query('operator_party_id');

  let sql = 'SELECT * FROM oe_vendor_escalation WHERE 1=1';
  const binds: unknown[] = [];
  if (defect_class)      { sql += ' AND defect_class = ?';      binds.push(defect_class); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (vendor_party_id)   { sql += ' AND vendor_party_id = ?';   binds.push(vendor_party_id); }
  if (operator_party_id) { sql += ' AND operator_party_id = ?'; binds.push(operator_party_id); }

  sql += ' ORDER BY datetime(filed_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<EscalationRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true') items = items.filter((r) => r.sla_breached);

  const by_status: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status]  = (by_status[i.chain_status] || 0) + 1;
    by_class[i.defect_class]   = (by_class[i.defect_class] || 0) + 1;
  }

  const open_count        = items.filter((i) => !i.is_terminal).length;
  const closed_count      = items.filter((i) => i.chain_status === 'closed').length;
  const recall_count      = items.filter((i) => i.chain_status === 'recall_issued').length;
  const arbitration_count = items.filter((i) => i.chain_status === 'arbitration').length;
  const withdrawn_count   = items.filter((i) => i.chain_status === 'withdrawn').length;
  const breached_count    = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total  = items.filter((i) => i.is_reportable).length;
  const safety_open       = items.filter(
    (i) => !i.is_terminal && i.defect_class === 'safety_recall',
  ).length;
  const systemic_open     = items.filter(
    (i) => !i.is_terminal && i.defect_class === 'fleet_systemic',
  ).length;
  const total_units_affected = items.reduce((sum, i) => sum + (i.fleet_units_affected || 0), 0);
  const total_claim_zar      = items.reduce((sum, i) => sum + (i.claim_value_zar || 0), 0);
  const total_remedy_zar     = items.reduce((sum, i) => sum + (i.remedy_cost_zar || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_class,
      open_count,
      closed_count,
      recall_count,
      arbitration_count,
      withdrawn_count,
      breached: breached_count,
      reportable_total,
      safety_open,
      systemic_open,
      total_units_affected,
      total_claim_zar,
      total_remedy_zar,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_vendor_escalation WHERE id = ?').bind(id).first<EscalationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_vendor_escalation_events WHERE escalation_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<EscalationEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface TriageBody {
  vendor_party_id?: string;
  vendor_party_name?: string;
  notes?: string;
}

interface VendorDecideBody {
  liability_accepted?: boolean;
  vendor_decision_ref?: string;
  vendor_decision_basis?: string;
  claim_value_zar?: number;
  notes?: string;
}

interface EscalateOemBody {
  oem_party_id?: string;
  oem_party_name?: string;
  notes?: string;
}

interface OemDecideBody {
  liability_accepted?: boolean;
  oem_decision_ref?: string;
  oem_decision_basis?: string;
  remedy_type?: string;
  notes?: string;
}

interface RemediationBody {
  remediation_ref?: string;
  remediation_plan?: string;
  remedy_type?: string;
  remedy_cost_zar?: number;
  notes?: string;
}

interface CloseBody {
  remedy_type?: string;
  remedy_cost_zar?: number;
  reason_code?: string;
  rod_notes?: string;
  notes?: string;
}

interface RecallBody {
  recall_ref?: string;
  recall_basis?: string;
  remedy_cost_zar?: number;
  reason_code?: string;
  notes?: string;
}

interface ArbitrationBody {
  arbitration_case_ref?: string;
  arbitration_basis?: string;
  claim_value_zar?: number;
  reason_code?: string;
  notes?: string;
}

interface WithdrawBody {
  withdrawal_basis?: string;
  withdrawal_ref?: string;
  reason_code?: string;
  notes?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: VendorEscalationAction,
  bodyHandler?: (row: EscalationRow, body: Record<string, unknown>) => Partial<EscalationRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_vendor_escalation WHERE id = ?').bind(id).first<EscalationRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, row.defect_class, now);
  const slaIso = sla ? sla.toISOString() : null;

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
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
    `UPDATE oe_vendor_escalation SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `vee_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify(overrides),
    nowIso,
  ).run();

  const eventName = cascadeEventFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'vendor_escalation',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      chain_status: to,
      from_status: row.chain_status,
      crosses_into_regulator: crossesIntoRegulator(action, row.defect_class),
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_vendor_escalation WHERE id = ?').bind(id).first<EscalationRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/triage', async (c) => transition(c, 'triage', (_row, body) => {
  const b = body as Partial<TriageBody>;
  const out: Partial<EscalationRow> = {};
  if (typeof b.vendor_party_id === 'string')   out.vendor_party_id = b.vendor_party_id;
  if (typeof b.vendor_party_name === 'string') out.vendor_party_name = b.vendor_party_name;
  return out;
}));

app.post('/:id/vendor-decide', async (c) => transition(c, 'vendor_decide', (_row, body) => {
  const b = body as Partial<VendorDecideBody>;
  const out: Partial<EscalationRow> = {};
  if (typeof b.liability_accepted === 'boolean')  out.liability_accepted = b.liability_accepted ? 1 : 0;
  if (typeof b.vendor_decision_ref === 'string')  out.vendor_decision_ref = b.vendor_decision_ref;
  if (typeof b.vendor_decision_basis === 'string') out.vendor_decision_basis = b.vendor_decision_basis;
  if (typeof b.claim_value_zar === 'number')      out.claim_value_zar = b.claim_value_zar;
  return out;
}));

app.post('/:id/escalate-to-oem', async (c) => transition(c, 'escalate_to_oem', (_row, body) => {
  const b = body as Partial<EscalateOemBody>;
  const out: Partial<EscalationRow> = {};
  if (typeof b.oem_party_id === 'string')   out.oem_party_id = b.oem_party_id;
  if (typeof b.oem_party_name === 'string') out.oem_party_name = b.oem_party_name;
  return out;
}));

app.post('/:id/oem-investigate', async (c) => transition(c, 'oem_investigate', (_row, _body) => {
  return {};
}));

app.post('/:id/oem-decide', async (c) => transition(c, 'oem_decide', (_row, body) => {
  const b = body as Partial<OemDecideBody>;
  const out: Partial<EscalationRow> = {};
  if (typeof b.liability_accepted === 'boolean') out.liability_accepted = b.liability_accepted ? 1 : 0;
  if (typeof b.oem_decision_ref === 'string')    out.oem_decision_ref = b.oem_decision_ref;
  if (typeof b.oem_decision_basis === 'string')  out.oem_decision_basis = b.oem_decision_basis;
  if (typeof b.remedy_type === 'string')         out.remedy_type = b.remedy_type;
  return out;
}));

app.post('/:id/start-remediation', async (c) => transition(c, 'start_remediation', (_row, body) => {
  const b = body as Partial<RemediationBody>;
  const out: Partial<EscalationRow> = {};
  if (typeof b.remediation_ref === 'string')  out.remediation_ref = b.remediation_ref;
  if (typeof b.remediation_plan === 'string') out.remediation_plan = b.remediation_plan;
  if (typeof b.remedy_type === 'string')      out.remedy_type = b.remedy_type;
  if (typeof b.remedy_cost_zar === 'number')  out.remedy_cost_zar = b.remedy_cost_zar;
  return out;
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) => {
  const b = body as Partial<CloseBody>;
  const out: Partial<EscalationRow> = {};
  if (typeof b.remedy_type === 'string')     out.remedy_type = b.remedy_type;
  if (typeof b.remedy_cost_zar === 'number') out.remedy_cost_zar = b.remedy_cost_zar;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  if (typeof b.rod_notes === 'string')       out.rod_notes = b.rod_notes;
  return out;
}));

app.post('/:id/issue-recall', async (c) => transition(c, 'issue_recall', (_row, body) => {
  const b = body as Partial<RecallBody>;
  const out: Partial<EscalationRow> = {};
  if (typeof b.recall_ref === 'string')      out.recall_ref = b.recall_ref;
  if (typeof b.recall_basis === 'string')    out.recall_basis = b.recall_basis;
  if (typeof b.remedy_cost_zar === 'number') out.remedy_cost_zar = b.remedy_cost_zar;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/escalate-to-arbitration', async (c) => transition(c, 'escalate_to_arbitration', (_row, body) => {
  const b = body as Partial<ArbitrationBody>;
  const out: Partial<EscalationRow> = {};
  if (typeof b.arbitration_case_ref === 'string') out.arbitration_case_ref = b.arbitration_case_ref;
  if (typeof b.arbitration_basis === 'string')    out.arbitration_basis = b.arbitration_basis;
  if (typeof b.claim_value_zar === 'number')      out.claim_value_zar = b.claim_value_zar;
  if (typeof b.reason_code === 'string')          out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<EscalationRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

export async function vendorEscalationSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_vendor_escalation
     WHERE chain_status NOT IN ('closed','recall_issued','arbitration','withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<EscalationRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_vendor_escalation
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `vee_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_vendor_escalation_events (id, escalation_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (class ${row.defect_class})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.defect_class)) {
      await fireCascade({
        event: 'vendor_escalation.sla_breached',
        actor_id: 'system',
        entity_type: 'vendor_escalation',
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
