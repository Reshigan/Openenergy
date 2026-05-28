// ═══════════════════════════════════════════════════════════════════════════
// Wave 63 — OEM-Support Warranty-Recovery / Supplier-Recovery Claim chain.
//
// Mounted at /api/warranty-recovery/chain.
//
// The COMMERCIAL cost-recovery counterpart to W15 (warranty / RMA): W15 processes
// the FIELD-side return (repair/replace) of a faulty deployed-asset component;
// W63 (this chain) recovers OUR cost from the manufacturer under the supply-
// agreement warranty. Completes the asset-warranty lifecycle — an RMA (W15)
// and/or a work-order repair (W16) generates a cost, then that cost is pursued
// against the OEM here.
//
// 12-state P6 lifecycle:
//   claim_drafted → submitted_to_oem → oem_acknowledged → under_assessment →
//     assessment_complete → approved → recovery_pending → recovered  (happy)
//   rejection:   assessment_complete → rejected
//   dispute:     assessment_complete | recovery_pending → disputed; then
//                resolve_dispute → approved  OR  write_off → written_off
//   withdraw:    any pre-approval operative state → withdrawn
//
// Write model — SINGLE-PARTY {admin, support} (same as W41 / W47 / W55). No OEM
// login role; the support desk records every party's action. actor_party
// (claimant / oem_supplier / assessor) records the contractual function per step,
// not the JWT role.
//
// Reportability (the W63 SIGNATURE is DEFECT-CLASS-driven, not size-driven):
//   complete_assessment crosses for EVERY tier when the classified defect is
//   SYSTEMIC {serial, safety}; a non-systemic defect crosses only for large tiers.
//   write_off + sla_breached cross for large tiers only.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForRecoveryZarM,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  SLA_MINUTES,
  type RecoveryStatus,
  type RecoveryAction,
  type RecoveryTier,
  type DefectClass,
} from '../utils/warranty-recovery-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'regulator',
  'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund',
]);

// SINGLE-PARTY write — the support / O&M desk owns the whole record. There is no
// access split (contrast the two-party chains); actor_party is functional only.
const WRITE_ROLES = new Set(['admin', 'support']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface RecoveryRow {
  id: string;
  case_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  claimant_party_id: string;
  claimant_party_name: string;
  oem_party_id: string;
  oem_party_name: string;
  assessor_party_id: string | null;
  assessor_party_name: string | null;
  asset_name: string | null;
  component_type: string | null;
  oem_name: string | null;
  product_model: string | null;
  serial_or_batch_ref: string | null;
  warranty_ref: string | null;
  warranty_expiry: string | null;
  defect_class: DefectClass;
  defect_description: string | null;
  failure_mode: string | null;
  units_affected: number | null;
  fleet_size: number | null;
  repair_cost_zar_m: number | null;
  replacement_cost_zar_m: number | null;
  lost_generation_zar_m: number | null;
  claimed_zar_m: number | null;
  recovery_zar_m: number;
  recovered_zar_m: number | null;
  recovery_method: string | null;
  recovery_tier: RecoveryTier;
  submitted_flag: number;
  acknowledged_flag: number;
  assessment_complete_flag: number;
  approved_flag: number;
  dispute_raised: number;
  dispute_resolved: number;
  recovered_flag: number;
  draft_ref: string | null;
  submission_ref: string | null;
  acknowledgement_ref: string | null;
  assessment_ref: string | null;
  approval_ref: string | null;
  rejection_ref: string | null;
  dispute_ref: string | null;
  resolution_ref: string | null;
  recovery_ref: string | null;
  confirmation_ref: string | null;
  writeoff_ref: string | null;
  withdrawal_ref: string | null;
  regulator_ref: string | null;
  draft_basis: string | null;
  submission_basis: string | null;
  acknowledgement_basis: string | null;
  assessment_basis: string | null;
  approval_basis: string | null;
  rejection_basis: string | null;
  dispute_basis: string | null;
  resolution_basis: string | null;
  recovery_basis: string | null;
  writeoff_basis: string | null;
  withdrawal_basis: string | null;
  reason_code: string | null;
  notes: string | null;
  dispute_round: number;
  chain_status: RecoveryStatus;
  claim_drafted_at: string;
  submitted_to_oem_at: string | null;
  oem_acknowledged_at: string | null;
  under_assessment_at: string | null;
  assessment_complete_at: string | null;
  approved_at: string | null;
  disputed_at: string | null;
  recovery_pending_at: string | null;
  recovered_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  written_off_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface RecoveryEventRow {
  id: string;
  recovery_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<RecoveryStatus, keyof RecoveryRow | null> = {
  claim_drafted:       null,
  submitted_to_oem:    'submitted_to_oem_at',
  oem_acknowledged:    'oem_acknowledged_at',
  under_assessment:    'under_assessment_at',
  assessment_complete: 'assessment_complete_at',
  approved:            'approved_at',
  disputed:            'disputed_at',
  recovery_pending:    'recovery_pending_at',
  recovered:           'recovered_at',
  rejected:            'rejected_at',
  withdrawn:           'withdrawn_at',
  written_off:         'written_off_at',
};

function decorate(row: RecoveryRow, now: Date) {
  const tier = row.recovery_tier;
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

// resolve_dispute and approve_recovery both land in 'approved', so they share the
// 'warranty_recovery.approved' event name; the inbox cases gate on tier/defect.
function eventTypeFor(action: RecoveryAction): string {
  switch (action) {
    case 'submit_claim':        return 'warranty_recovery.submitted_to_oem';
    case 'acknowledge':         return 'warranty_recovery.oem_acknowledged';
    case 'begin_assessment':    return 'warranty_recovery.under_assessment';
    case 'complete_assessment': return 'warranty_recovery.assessment_complete';
    case 'approve_recovery':    return 'warranty_recovery.approved';
    case 'resolve_dispute':     return 'warranty_recovery.approved';
    case 'reject_claim':        return 'warranty_recovery.rejected';
    case 'dispute':             return 'warranty_recovery.disputed';
    case 'initiate_recovery':   return 'warranty_recovery.recovery_pending';
    case 'confirm_recovery':    return 'warranty_recovery.recovered';
    case 'write_off':           return 'warranty_recovery.written_off';
    case 'withdraw':            return 'warranty_recovery.withdrawn';
  }
}

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const recovery_tier = c.req.query('recovery_tier');
  const status        = c.req.query('status');
  const defect_class  = c.req.query('defect_class');
  const breached      = c.req.query('breached');
  const oem_party_id  = c.req.query('oem_party_id');
  const reportable    = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_warranty_recoveries WHERE 1=1';
  const binds: unknown[] = [];
  if (recovery_tier) { sql += ' AND recovery_tier = ?'; binds.push(recovery_tier); }
  if (status)        { sql += ' AND chain_status = ?'; binds.push(status); }
  if (defect_class)  { sql += ' AND defect_class = ?'; binds.push(defect_class); }
  if (oem_party_id)  { sql += ' AND oem_party_id = ?'; binds.push(oem_party_id); }

  sql += ' ORDER BY datetime(claim_drafted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<RecoveryRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_defect: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.recovery_tier] = (by_tier[i.recovery_tier] || 0) + 1;
    by_defect[i.defect_class] = (by_defect[i.defect_class] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const recovered_count     = items.filter((i) => i.chain_status === 'recovered').length;
  const in_assessment_count = items.filter((i) => i.chain_status === 'under_assessment').length;
  const in_dispute_count    = items.filter((i) => i.chain_status === 'disputed').length;
  const written_off_count   = items.filter((i) => i.chain_status === 'written_off').length;
  const rejected_count      = items.filter((i) => i.chain_status === 'rejected').length;
  const breached_count      = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;
  const systemic_total      = items.filter((i) => i.defect_class === 'serial' || i.defect_class === 'safety').length;
  const large_tier_open     = items.filter((i) => !i.is_terminal && (i.recovery_tier === 'major' || i.recovery_tier === 'critical')).length;
  const total_recovery_zar_m = items.reduce((sum, i) => sum + (i.recovery_zar_m || 0), 0);
  const recovered_zar_m      = items.reduce((sum, i) => sum + (i.recovered_zar_m || 0), 0);

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_defect,
      open_count,
      recovered_count,
      in_assessment_count,
      in_dispute_count,
      written_off_count,
      rejected_count,
      breached: breached_count,
      reportable_total,
      systemic_total,
      large_tier_open,
      total_recovery_zar_m,
      recovered_zar_m,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_warranty_recoveries WHERE id = ?').bind(id).first<RecoveryRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_warranty_recoveries_events WHERE recovery_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<RecoveryEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface SubmitBody {
  submission_basis?: string;
  submission_ref?: string;
  claimed_zar_m?: number;
  recovery_zar_m?: number;
  notes?: string;
}
interface AcknowledgeBody {
  acknowledgement_basis?: string;
  acknowledgement_ref?: string;
  notes?: string;
}
interface BeginAssessmentBody {
  assessment_basis?: string;
  assessor_party_id?: string;
  assessor_party_name?: string;
  notes?: string;
}
interface CompleteAssessmentBody {
  assessment_basis?: string;
  assessment_ref?: string;
  defect_class?: DefectClass;
  defect_description?: string;
  failure_mode?: string;
  units_affected?: number;
  fleet_size?: number;
  recovery_zar_m?: number;
  notes?: string;
}
interface ApproveBody {
  approval_basis?: string;
  approval_ref?: string;
  recovery_zar_m?: number;
  recovery_method?: string;
  notes?: string;
}
interface RejectBody {
  rejection_basis?: string;
  rejection_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface DisputeBody {
  dispute_basis?: string;
  dispute_ref?: string;
  reason_code?: string;
  notes?: string;
}
interface ResolveBody {
  resolution_basis?: string;
  resolution_ref?: string;
  recovery_zar_m?: number;
  notes?: string;
}
interface InitiateBody {
  recovery_basis?: string;
  recovery_ref?: string;
  recovery_method?: string;
  notes?: string;
}
interface ConfirmBody {
  confirmation_ref?: string;
  recovered_zar_m?: number;
  recovery_method?: string;
  notes?: string;
}
interface WriteOffBody {
  writeoff_basis?: string;
  writeoff_ref?: string;
  reason_code?: string;
  regulator_ref?: string;
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
  action: RecoveryAction,
  bodyHandler?: (row: RecoveryRow, body: Record<string, unknown>) => Partial<RecoveryRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_warranty_recoveries WHERE id = ?').bind(id).first<RecoveryRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // The tier may have been re-derived from the assessed/approved recovery amount;
  // the SLA window and regulator crossings must track the CURRENT tier. The defect
  // class may be finalised at complete_assessment.
  const tier = (overrides.recovery_tier as RecoveryTier | undefined) ?? row.recovery_tier;
  const defectClass = (overrides.defect_class as DefectClass | undefined) ?? row.defect_class;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier, defectClass);
  // is_reportable is a property of the case (systemic OR large) and is locked in
  // once the defect class is classified at complete_assessment.
  if (action === 'complete_assessment') {
    overrides.is_reportable = isReportable(tier, defectClass) ? 1 : 0;
  } else if (crosses) {
    overrides.is_reportable = 1;
  }

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
    `UPDATE oe_warranty_recoveries SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `wrec_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_warranty_recoveries_events (id, recovery_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'warranty_recovery',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      recovery_tier: tier,
      defect_class: defectClass,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_warranty_recoveries WHERE id = ?').bind(id).first<RecoveryRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/submit-claim', async (c) => transition(c, 'submit_claim', (_row, body) => {
  const b = body as Partial<SubmitBody>;
  const out: Partial<RecoveryRow> = { submitted_flag: 1 };
  if (typeof b.submission_basis === 'string') out.submission_basis = b.submission_basis;
  if (typeof b.submission_ref === 'string')   out.submission_ref = b.submission_ref;
  if (typeof b.claimed_zar_m === 'number')    out.claimed_zar_m = b.claimed_zar_m;
  if (typeof b.recovery_zar_m === 'number') {
    out.recovery_zar_m = b.recovery_zar_m;
    out.recovery_tier = tierForRecoveryZarM(b.recovery_zar_m);
  }
  return out;
}));

app.post('/:id/acknowledge', async (c) => transition(c, 'acknowledge', (_row, body) => {
  const b = body as Partial<AcknowledgeBody>;
  const out: Partial<RecoveryRow> = { acknowledged_flag: 1 };
  if (typeof b.acknowledgement_basis === 'string') out.acknowledgement_basis = b.acknowledgement_basis;
  if (typeof b.acknowledgement_ref === 'string')   out.acknowledgement_ref = b.acknowledgement_ref;
  return out;
}));

app.post('/:id/begin-assessment', async (c) => transition(c, 'begin_assessment', (_row, body) => {
  const b = body as Partial<BeginAssessmentBody>;
  const out: Partial<RecoveryRow> = {};
  if (typeof b.assessment_basis === 'string')     out.assessment_basis = b.assessment_basis;
  if (typeof b.assessor_party_id === 'string')    out.assessor_party_id = b.assessor_party_id;
  if (typeof b.assessor_party_name === 'string')  out.assessor_party_name = b.assessor_party_name;
  return out;
}));

app.post('/:id/complete-assessment', async (c) => transition(c, 'complete_assessment', (_row, body) => {
  const b = body as Partial<CompleteAssessmentBody>;
  const out: Partial<RecoveryRow> = { assessment_complete_flag: 1 };
  if (typeof b.assessment_basis === 'string')    out.assessment_basis = b.assessment_basis;
  if (typeof b.assessment_ref === 'string')      out.assessment_ref = b.assessment_ref;
  if (typeof b.defect_class === 'string')        out.defect_class = b.defect_class;
  if (typeof b.defect_description === 'string')  out.defect_description = b.defect_description;
  if (typeof b.failure_mode === 'string')        out.failure_mode = b.failure_mode;
  if (typeof b.units_affected === 'number')      out.units_affected = b.units_affected;
  if (typeof b.fleet_size === 'number')          out.fleet_size = b.fleet_size;
  // The assessment determines the recoverable amount; re-derive the tier live.
  if (typeof b.recovery_zar_m === 'number') {
    out.recovery_zar_m = b.recovery_zar_m;
    out.recovery_tier = tierForRecoveryZarM(b.recovery_zar_m);
  }
  return out;
}));

app.post('/:id/approve-recovery', async (c) => transition(c, 'approve_recovery', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<RecoveryRow> = { approved_flag: 1 };
  if (typeof b.approval_basis === 'string')   out.approval_basis = b.approval_basis;
  if (typeof b.approval_ref === 'string')     out.approval_ref = b.approval_ref;
  if (typeof b.recovery_method === 'string')  out.recovery_method = b.recovery_method;
  if (typeof b.recovery_zar_m === 'number') {
    out.recovery_zar_m = b.recovery_zar_m;
    out.recovery_tier = tierForRecoveryZarM(b.recovery_zar_m);
  }
  return out;
}));

app.post('/:id/reject-claim', async (c) => transition(c, 'reject_claim', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<RecoveryRow> = {};
  if (typeof b.rejection_basis === 'string') out.rejection_basis = b.rejection_basis;
  if (typeof b.rejection_ref === 'string')   out.rejection_ref = b.rejection_ref;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/dispute', async (c) => transition(c, 'dispute', (row, body) => {
  const b = body as Partial<DisputeBody>;
  const out: Partial<RecoveryRow> = {
    dispute_raised: 1,
    dispute_round: (row.dispute_round || 0) + 1,
    escalation_level: (row.escalation_level || 0) + 1,
  };
  if (typeof b.dispute_basis === 'string') out.dispute_basis = b.dispute_basis;
  if (typeof b.dispute_ref === 'string')   out.dispute_ref = b.dispute_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveBody>;
  const out: Partial<RecoveryRow> = { dispute_resolved: 1 };
  if (typeof b.resolution_basis === 'string') out.resolution_basis = b.resolution_basis;
  if (typeof b.resolution_ref === 'string')   out.resolution_ref = b.resolution_ref;
  if (typeof b.recovery_zar_m === 'number') {
    out.recovery_zar_m = b.recovery_zar_m;
    out.recovery_tier = tierForRecoveryZarM(b.recovery_zar_m);
  }
  return out;
}));

app.post('/:id/initiate-recovery', async (c) => transition(c, 'initiate_recovery', (_row, body) => {
  const b = body as Partial<InitiateBody>;
  const out: Partial<RecoveryRow> = {};
  if (typeof b.recovery_basis === 'string')  out.recovery_basis = b.recovery_basis;
  if (typeof b.recovery_ref === 'string')    out.recovery_ref = b.recovery_ref;
  if (typeof b.recovery_method === 'string') out.recovery_method = b.recovery_method;
  return out;
}));

app.post('/:id/confirm-recovery', async (c) => transition(c, 'confirm_recovery', (row, body) => {
  const b = body as Partial<ConfirmBody>;
  const out: Partial<RecoveryRow> = { recovered_flag: 1 };
  if (typeof b.confirmation_ref === 'string') out.confirmation_ref = b.confirmation_ref;
  if (typeof b.recovery_method === 'string')  out.recovery_method = b.recovery_method;
  out.recovered_zar_m = typeof b.recovered_zar_m === 'number' ? b.recovered_zar_m : row.recovery_zar_m;
  return out;
}));

app.post('/:id/write-off', async (c) => transition(c, 'write_off', (_row, body) => {
  const b = body as Partial<WriteOffBody>;
  const out: Partial<RecoveryRow> = {};
  if (typeof b.writeoff_basis === 'string') out.writeoff_basis = b.writeoff_basis;
  if (typeof b.writeoff_ref === 'string')   out.writeoff_ref = b.writeoff_ref;
  if (typeof b.reason_code === 'string')    out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')  out.regulator_ref = b.regulator_ref;
  return out;
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<RecoveryRow> = {};
  if (typeof b.withdrawal_basis === 'string') out.withdrawal_basis = b.withdrawal_basis;
  if (typeof b.withdrawal_ref === 'string')   out.withdrawal_ref = b.withdrawal_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

export async function warrantyRecoverySlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_warranty_recoveries
     WHERE chain_status NOT IN ('recovered','rejected','withdrawn','written_off')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<RecoveryRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_warranty_recoveries
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `wrec_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_warranty_recoveries_events (id, recovery_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'warranty_recovery.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.recovery_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.recovery_tier)) {
      await fireCascade({
        event: 'warranty_recovery.sla_breached',
        actor_id: 'system',
        entity_type: 'warranty_recovery',
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
