// ═══════════════════════════════════════════════════════════════════════════
// Wave 114 — IPP Document Control & Drawing Register chain.
// 9th IPP chain. THIRD Phase-A IPP wave (sibling of W112 schedule and
// W113 EVM cost-book). Mounted at /api/ipp/document-control/chain.
//
// Drawing-register engine that owns "where is every drawing right now, is
// it under review, has it been transmitted to the engineer of record, is
// anyone holding up an IFC-blocker, do we have a clean as-built record
// at archive time?" for every IPP project end-to-end.
//
// Beats Aconex / Procore Documents / Bluebeam Studio / Newforma / Asite /
// Oracle Aconex / Bentley ProjectWise / Autodesk Construction Cloud Docs
// / SharePoint AECOM / e-Builder.
//
// Standards: ISO 19650-1/2/3 + AECOOEM ED2-2024 + REIPPPP Schedule 2 +
// DMRE site-records + IEC 61355 + ENAA EPC + FIDIC Silver Book §6.
//
// Write {admin, ipp_developer}. READ all 9 personas. actor_party split:
//   doc_controller     : upload_drawing, index_metadata, open_revision,
//                        assign_IDC, transmit, hold, resume, archive
//   engineer_of_record : start_review, comment, revise, approve,
//                        issue_for_construction, finalise_as_built, reject
//   IPP_CEO            : withdraw
//
// SIGNATURE Phase-A IPP regulator crossings:
//   reject   -> EVERY tier when safety_critical OR ifc_blocking flag set
//                (W114 SIGNATURE DOCUMENT-REJECT-CRITICAL hard line —
//                 rejecting a safety/IFC-blocking drawing creates an as-
//                 built mismatch reportable to IE / IPPO)
//   withdraw -> EVERY tier when issued_for_construction state was reached
//                (post-IFC withdrawal = construction-record void)
//   approve  -> safety_critical only when hv_electrical OR commissioning_
//                critical_path
//   archive  -> no regulator
//   sla_breached -> safety_critical + electrical only
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaDeadlineFor,
  slaWindowHours,
  tierForDocumentClass,
  effectiveTier,
  countFloorFlags,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  idcStatusFor,
  bridgesToScheduleChain,
  bridgesToEvmChain,
  bridgesToProcurementChain,
  bridgesToCodChain,
  bridgesToPlannedOutageChain,
  documentCompletenessIndex,
  hashChainPositionFor,
  placeholderMerkleSegment,
  type IpdStatus,
  type IpdAction,
  type IpdTier,
} from '../utils/ipp-document-control-spec';

const READ_ROLES = new Set([
  'admin', 'ipp_developer',
  'trader', 'offtaker', 'grid_operator', 'regulator', 'lender', 'support', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'ipp_developer']);

interface IpdRow {
  id: string;
  document_number: string;

  project_id: string;
  project_name: string | null;
  project_capacity_mw: number;
  project_type: string | null;

  schedule_ref: string | null;
  evm_ref: string | null;
  procurement_ref: string | null;
  cod_ref: string | null;
  planned_outage_ref: string | null;

  document_class: string | null;
  document_type: string | null;
  discipline: string | null;
  package_code: string | null;
  drawing_number: string | null;
  drawing_title: string | null;
  iec_61355_code: string | null;

  current_revision: string | null;
  revisions_count: number;
  last_transmittal_number: string | null;
  last_transmittal_at: string | null;
  reviewer_name: string | null;
  reviewer_party: string | null;
  approver_name: string | null;
  approver_party: string | null;

  idc_status: string | null;
  idc_matrix_recomputed_at: string | null;

  hv_electrical: number;
  commissioning_critical_path: number;
  safety_signoff_required: number;
  ifc_blocking: number;
  regulatory_submittal: number;

  reached_ifc: number;

  current_tier: IpdTier;
  authority_required: string | null;
  urgency_band: string | null;
  doc_health_band: string | null;
  document_completeness_index: number;

  title: string | null;
  narrative: string | null;
  reason_code: string | null;
  reject_reason: string | null;
  withdraw_reason: string | null;
  hold_reason: string | null;
  comments_summary: string | null;

  current_ball_in_court_party: string | null;
  last_responder_party: string | null;

  is_reportable: number;
  regulator_relevant: number;
  regulator_reason_text: string | null;

  chain_status: IpdStatus;
  draft_uploaded_at: string | null;
  metadata_indexed_at: string | null;
  revision_open_at: string | null;
  idc_assigned_at: string | null;
  transmitted_at: string | null;
  reviewed_at: string | null;
  commented_at: string | null;
  revised_at: string | null;
  approved_at: string | null;
  issued_for_construction_at: string | null;
  as_built_finalised_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  hold_at: string | null;
  resumed_at: string | null;
  signoff_at: string | null;

  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;

  sla_target_hours: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;

  hash_chain_position: number;
  merkle_root_segment: string | null;

  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface IpdEventRow {
  id: string;
  document_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

// Map each status to its primary timestamp column.
const TIMESTAMP_COLUMN: Record<IpdStatus, keyof IpdRow | null> = {
  draft_uploaded:          'draft_uploaded_at',
  metadata_indexed:        'metadata_indexed_at',
  revision_open:           'revision_open_at',
  IDC_assigned:            'idc_assigned_at',
  transmitted:             'transmitted_at',
  reviewed:                'reviewed_at',
  commented:               'commented_at',
  revised:                 'revised_at',
  approved:                'approved_at',
  issued_for_construction: 'issued_for_construction_at',
  as_built_finalised:      'as_built_finalised_at',
  archived:                'archived_at',
  rejected:                'rejected_at',
  withdrawn:               'withdrawn_at',
  hold:                    'hold_at',
};

function statusEnteredAt(row: IpdRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.draft_uploaded_at ? new Date(row.draft_uploaded_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.draft_uploaded_at ? new Date(row.draft_uploaded_at) : null);
}

// Document health band — green/amber/red/critical from completeness +
// rejected/withdrawn + SLA. Inert if archived (closed clean).
function docHealthBand(
  status: IpdStatus,
  completeness: number,
  slaBreached: boolean,
  rejected: boolean,
  withdrawn: boolean,
): 'green' | 'amber' | 'red' | 'critical' {
  if (rejected || withdrawn) return 'critical';
  if (status === 'archived') return 'green';
  if (slaBreached) return 'red';
  if (completeness < 30) return 'amber';
  if (completeness < 60) return 'amber';
  if (completeness < 90) return 'amber';
  return 'green';
}

function decorate(row: IpdRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const entered = statusEnteredAt(row);
  const slaHrs = slaHoursRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaHrs);
  const authority = authorityRequired(tier);
  const regFilingHours = regulatorFilingWindowHours(tier);

  const floorFlags = countFloorFlags({
    hv_electrical:               row.hv_electrical,
    commissioning_critical_path: row.commissioning_critical_path,
    safety_signoff_required:     row.safety_signoff_required,
    ifc_blocking:                row.ifc_blocking,
    regulatory_submittal:        row.regulatory_submittal,
  });

  const idcLive = idcStatusFor(status);

  const completenessLive = documentCompletenessIndex({
    draft_uploaded:          !!row.draft_uploaded_at,
    metadata_indexed:        !!row.metadata_indexed_at,
    revision_open:           !!row.revision_open_at,
    IDC_assigned:            !!row.idc_assigned_at,
    transmitted:             !!row.transmitted_at,
    reviewed:                !!row.reviewed_at,
    commented:               !!row.commented_at,
    revised:                 !!row.revised_at,
    approved:                !!row.approved_at,
    issued_for_construction: !!row.issued_for_construction_at,
    as_built_finalised:      !!row.as_built_finalised_at,
    archived:                !!row.archived_at,
    clean_archive_bonus:     status === 'archived' && !row.rejected_at && !row.withdrawn_at,
  });

  const healthBand = row.doc_health_band
    ? row.doc_health_band
    : docHealthBand(
        status,
        completenessLive,
        minutesUntilSla != null && minutesUntilSla < 0,
        !!row.rejected_at,
        !!row.withdrawn_at,
      );

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_hours: slaWindowHours(status, tier),
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    sla_hours_remaining_live: slaHrs,
    urgency_band_live: urgency,
    authority_required_live: authority,
    regulator_filing_window_hours_live: regFilingHours,
    floor_flag_count_live: floorFlags,
    idc_status_live: idcLive,
    document_completeness_index_live: completenessLive,
    doc_health_band_live: healthBand,
    bridges_to_schedule_chain_live: bridgesToScheduleChain(row.schedule_ref),
    bridges_to_evm_chain_live: bridgesToEvmChain(row.evm_ref),
    bridges_to_procurement_chain_live: bridgesToProcurementChain(row.procurement_ref),
    bridges_to_cod_chain_live: bridgesToCodChain(row.cod_ref),
    bridges_to_planned_outage_chain_live: bridgesToPlannedOutageChain(row.planned_outage_ref),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

// ─── List ────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier       = c.req.query('tier');
  const status     = c.req.query('status');
  const project    = c.req.query('project_id');
  const health     = c.req.query('doc_health_band');
  const idcStatus  = c.req.query('idc_status');
  const breached   = c.req.query('breached');
  const reportable = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_ipp_document_control WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)      { sql += ' AND current_tier = ?'; binds.push(tier); }
  if (status)    { sql += ' AND chain_status = ?'; binds.push(status); }
  if (project)   { sql += ' AND project_id = ?';   binds.push(project); }
  if (health)    { sql += ' AND doc_health_band = ?'; binds.push(health); }
  if (idcStatus) { sql += ' AND idc_status = ?'; binds.push(idcStatus); }
  sql += ' ORDER BY datetime(updated_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<IpdRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_idc: Record<string, number> = {};
  const by_project: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_health[i.doc_health_band_live] = (by_health[i.doc_health_band_live] || 0) + 1;
    by_idc[i.idc_status_live] = (by_idc[i.idc_status_live] || 0) + 1;
    by_project[i.project_id] = (by_project[i.project_id] || 0) + 1;
  }

  const active_count             = items.filter((i) => !i.is_terminal).length;
  const draft_count              = items.filter((i) => i.chain_status === 'draft_uploaded').length;
  const indexed_count            = items.filter((i) => i.chain_status === 'metadata_indexed').length;
  const idc_assigned_count       = items.filter((i) => i.chain_status === 'IDC_assigned').length;
  const transmitted_count        = items.filter((i) => i.chain_status === 'transmitted').length;
  const review_phase_count       = items.filter((i) =>
    i.chain_status === 'reviewed' ||
    i.chain_status === 'commented' ||
    i.chain_status === 'revised'
  ).length;
  const approved_count           = items.filter((i) => i.chain_status === 'approved').length;
  const ifc_count                = items.filter((i) => i.chain_status === 'issued_for_construction').length;
  const as_built_count           = items.filter((i) => i.chain_status === 'as_built_finalised').length;
  const archived_count           = items.filter((i) => i.chain_status === 'archived').length;
  const rejected_count           = items.filter((i) => i.chain_status === 'rejected').length;
  const withdrawn_count          = items.filter((i) => i.chain_status === 'withdrawn').length;
  const hold_count               = items.filter((i) => i.chain_status === 'hold').length;
  const safety_critical_count    = items.filter((i) => i.current_tier === 'safety_critical').length;
  const breached_count           = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total         = items.filter((i) => i.is_reportable_flag).length;
  const reached_ifc_count        = items.filter((i) => i.reached_ifc).length;
  const hv_electrical_count      = items.filter((i) => i.hv_electrical).length;
  const ifc_blocking_count       = items.filter((i) => i.ifc_blocking).length;
  const ccp_count                = items.filter((i) => i.commissioning_critical_path).length;
  const schedule_bridged         = items.filter((i) => i.bridges_to_schedule_chain_live).length;
  const evm_bridged              = items.filter((i) => i.bridges_to_evm_chain_live).length;
  const procurement_bridged      = items.filter((i) => i.bridges_to_procurement_chain_live).length;
  const cod_bridged              = items.filter((i) => i.bridges_to_cod_chain_live).length;
  const planned_outage_bridged   = items.filter((i) => i.bridges_to_planned_outage_chain_live).length;
  const revisions_total          = items.reduce((s, i) => s + (i.revisions_count || 0), 0);
  const completeness_avg         = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.document_completeness_index_live || 0), 0) / items.length)
    : 0;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_health,
      by_idc,
      by_project,
      active_count,
      draft_count,
      indexed_count,
      idc_assigned_count,
      transmitted_count,
      review_phase_count,
      approved_count,
      ifc_count,
      as_built_count,
      archived_count,
      rejected_count,
      withdrawn_count,
      hold_count,
      safety_critical_count,
      breached: breached_count,
      reportable_total,
      reached_ifc_count,
      hv_electrical_count,
      ifc_blocking_count,
      ccp_count,
      schedule_bridged_count: schedule_bridged,
      evm_bridged_count: evm_bridged,
      procurement_bridged_count: procurement_bridged,
      cod_bridged_count: cod_bridged,
      planned_outage_bridged_count: planned_outage_bridged,
      revisions_total,
      completeness_avg,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, doc_health_band, idc_status, regulator_relevant, sla_breached, COUNT(*) as n
     FROM oe_ipp_document_control GROUP BY chain_status, current_tier, doc_health_band, idc_status, regulator_relevant, sla_breached`,
  ).all<{
    chain_status: string; current_tier: string; doc_health_band: string | null;
    idc_status: string | null;
    regulator_relevant: number; sla_breached: number; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_health: Record<string, number> = {};
  const by_idc: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    if (r.doc_health_band) by_health[r.doc_health_band] = (by_health[r.doc_health_band] || 0) + r.n;
    if (r.idc_status) by_idc[r.idc_status] = (by_idc[r.idc_status] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_health, by_idc, by_regulator_relevant, by_sla_breached } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_document_control WHERE id = ?').bind(id).first<IpdRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_ipp_document_control_events WHERE document_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<IpdEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

// ─── Body interfaces ──────────────────────────────────────────────────────
interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  title?: string;
  narrative?: string;
}

interface CreateBody extends CommonBody {
  project_id?: string;
  project_name?: string;
  project_capacity_mw?: number;
  project_type?: string;
  schedule_ref?: string;
  evm_ref?: string;
  procurement_ref?: string;
  cod_ref?: string;
  planned_outage_ref?: string;
  document_class?: string;
  document_type?: string;
  discipline?: string;
  package_code?: string;
  drawing_number?: string;
  drawing_title?: string;
  iec_61355_code?: string;
  current_revision?: string;
  hv_electrical?: boolean | number;
  commissioning_critical_path?: boolean | number;
  safety_signoff_required?: boolean | number;
  ifc_blocking?: boolean | number;
  regulatory_submittal?: boolean | number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  tenant_id?: string;
}

interface IndexMetadataBody extends CommonBody {
  document_class?: string;
  document_type?: string;
  discipline?: string;
  package_code?: string;
  iec_61355_code?: string;
  drawing_title?: string;
}

interface OpenRevisionBody extends CommonBody {
  current_revision?: string;
}

interface AssignIdcBody extends CommonBody {
  reviewer_name?: string;
  reviewer_party?: string;
}

interface TransmitBody extends CommonBody {
  last_transmittal_number?: string;
}

interface StartReviewBody extends CommonBody {}

interface CommentBody extends CommonBody {
  comments_summary?: string;
}

interface ReviseBody extends CommonBody {
  current_revision?: string;
}

interface ApproveBody extends CommonBody {
  approver_name?: string;
  approver_party?: string;
}

interface IssueForConstructionBody extends CommonBody {}
interface FinaliseAsBuiltBody extends CommonBody {}
interface ArchiveBody extends CommonBody {}

interface RejectBody extends CommonBody {
  reject_reason?: string;
}

interface WithdrawBody extends CommonBody {
  withdraw_reason?: string;
}

interface HoldBody extends CommonBody {
  hold_reason?: string;
}

interface ResumeBody extends CommonBody {}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<IpdRow>): Partial<IpdRow> {
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.title === 'string')         out.title = b.title;
  if (typeof b.narrative === 'string')     out.narrative = b.narrative;
  return out;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

// ─── Create endpoint (upload_drawing) ────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `idc-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = `IDC-${new Date().getUTCFullYear()}-${id.slice(4, 10).toUpperCase()}`;

  const documentClass = body.document_class ?? 'civil';
  const flags = {
    hv_electrical:               toFlag(body.hv_electrical) ?? 0,
    commissioning_critical_path: toFlag(body.commissioning_critical_path) ?? 0,
    safety_signoff_required:     toFlag(body.safety_signoff_required) ?? 0,
    ifc_blocking:                toFlag(body.ifc_blocking) ?? 0,
    regulatory_submittal:        toFlag(body.regulatory_submittal) ?? 0,
  };
  const rawTier = tierForDocumentClass(documentClass);
  const tier = effectiveTier(rawTier, flags);
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('draft_uploaded', tier, now);
  const slaHrs = slaWindowHours('draft_uploaded', tier);
  const hashPos = hashChainPositionFor(0);
  const merkleSeg = placeholderMerkleSegment(id, hashPos);

  await c.env.DB.prepare(
    `INSERT INTO oe_ipp_document_control (
      id, document_number,
      project_id, project_name, project_capacity_mw, project_type,
      schedule_ref, evm_ref, procurement_ref, cod_ref, planned_outage_ref,
      document_class, document_type, discipline, package_code,
      drawing_number, drawing_title, iec_61355_code,
      current_revision, revisions_count,
      idc_status,
      hv_electrical, commissioning_critical_path, safety_signoff_required,
      ifc_blocking, regulatory_submittal,
      reached_ifc,
      current_tier, authority_required, urgency_band, document_completeness_index,
      title, narrative,
      is_reportable, regulator_relevant, regulator_reason_text,
      chain_status, draft_uploaded_at,
      sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
      hash_chain_position, merkle_root_segment,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.project_id ?? 'project-unknown', body.project_name ?? null,
    Number(body.project_capacity_mw ?? 0), body.project_type ?? null,
    body.schedule_ref ?? null, body.evm_ref ?? null,
    body.procurement_ref ?? null, body.cod_ref ?? null, body.planned_outage_ref ?? null,
    documentClass, body.document_type ?? null, body.discipline ?? null, body.package_code ?? null,
    body.drawing_number ?? null, body.drawing_title ?? null, body.iec_61355_code ?? null,
    body.current_revision ?? 'A', 1,
    'open',
    flags.hv_electrical, flags.commissioning_critical_path, flags.safety_signoff_required,
    flags.ifc_blocking, flags.regulatory_submittal,
    0,
    tier, authorityRequired(tier), urgencyBand(tier, slaHrs), 8,
    body.title ?? null, body.narrative ?? null,
    isReportable(tier) ? 1 : 0, regRelevant, body.regulator_reason_text ?? null,
    'draft_uploaded', nowIso,
    slaHrs, sla ? sla.toISOString() : null, 0, 0,
    hashPos, merkleSeg,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const evtId = `ipp_doc_control_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_document_control_events (id, document_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId, id, 'ipp_doc_control_uploaded',
    null, 'draft_uploaded', user.id, partyForAction('upload_drawing'),
    null, JSON.stringify({ tier, document_class: documentClass, project_id: body.project_id }), nowIso,
  ).run();

  await fireCascade({
    event: 'ipp_doc_control_uploaded',
    actor_id: user.id,
    entity_type: 'ipp_doc_control',
    entity_id: id,
    data: {
      tier, document_class: documentClass, project_id: body.project_id,
      chain_status: 'draft_uploaded',
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_document_control WHERE id = ?').bind(id).first<IpdRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
});

// ─── Generic transition helper ────────────────────────────────────────────
async function transition(
  c: Context<HonoEnv>,
  action: IpdAction,
  bodyHandler?: (row: IpdRow, body: Record<string, unknown>) => Partial<IpdRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_ipp_document_control WHERE id = ?').bind(id).first<IpdRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current document_class + 5 floor flags.
  const documentClass = (overrides.document_class as string | undefined) ?? row.document_class;
  const rawTier = tierForDocumentClass(documentClass);
  const floorFlags = {
    hv_electrical:
      (overrides.hv_electrical as number | undefined) ?? row.hv_electrical,
    commissioning_critical_path:
      (overrides.commissioning_critical_path as number | undefined) ?? row.commissioning_critical_path,
    safety_signoff_required:
      (overrides.safety_signoff_required as number | undefined) ?? row.safety_signoff_required,
    ifc_blocking:
      (overrides.ifc_blocking as number | undefined) ?? row.ifc_blocking,
    regulatory_submittal:
      (overrides.regulatory_submittal as number | undefined) ?? row.regulatory_submittal,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;
  const slaHrs = slaWindowHours(to, tier);
  overrides.sla_target_hours = slaHrs;

  // Action-specific bookkeeping.
  if (action === 'open_revision') {
    overrides.revisions_count = (row.revisions_count || 0) + 1;
  }
  if (action === 'revise') {
    overrides.revisions_count = (row.revisions_count || 0) + 1;
  }
  if (action === 'transmit') {
    overrides.last_transmittal_at = nowIso;
  }
  if (action === 'assign_IDC') {
    overrides.idc_matrix_recomputed_at = nowIso;
  }
  if (action === 'archive') {
    overrides.signoff_at = nowIso;
  }
  if (action === 'issue_for_construction') {
    overrides.reached_ifc = 1;
  }
  if (action === 'resume') {
    overrides.resumed_at = nowIso;
  }

  // IDC status re-derived from new status.
  overrides.idc_status = idcStatusFor(to);

  // Re-compute completeness on each transition.
  const willSetTs = (col: keyof IpdRow): boolean => {
    if (TIMESTAMP_COLUMN[to] === col) return true;
    return !!row[col];
  };
  const completeness = documentCompletenessIndex({
    draft_uploaded:          willSetTs('draft_uploaded_at'),
    metadata_indexed:        willSetTs('metadata_indexed_at'),
    revision_open:           willSetTs('revision_open_at'),
    IDC_assigned:            willSetTs('idc_assigned_at'),
    transmitted:             willSetTs('transmitted_at'),
    reviewed:                willSetTs('reviewed_at'),
    commented:               willSetTs('commented_at'),
    revised:                 willSetTs('revised_at'),
    approved:                willSetTs('approved_at'),
    issued_for_construction: willSetTs('issued_for_construction_at'),
    as_built_finalised:      willSetTs('as_built_finalised_at'),
    archived:                willSetTs('archived_at'),
    clean_archive_bonus:     to === 'archived' && !row.rejected_at && !row.withdrawn_at,
  });
  overrides.document_completeness_index = completeness;

  // Re-derive doc_health_band from new completeness + sticky markers.
  const rejectedNow = to === 'rejected' || !!row.rejected_at;
  const withdrawnNow = to === 'withdrawn' || !!row.withdrawn_at;
  overrides.doc_health_band = docHealthBand(
    to,
    completeness,
    !!row.sla_breached,
    rejectedNow,
    withdrawnNow,
  );

  // SIGNATURE crossings — reach_ifc sticky marker drives withdraw crossing.
  const reachedIfc = to === 'issued_for_construction' || !!row.reached_ifc || !!row.issued_for_construction_at;
  const crosses = crossesIntoRegulator(action, tier, {
    flags: floorFlags,
    reached_ifc: reachedIfc,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  overrides.urgency_band = urgencyBand(tier, slaHrs);

  // Hash-chain pre-stage (W118 backfill).
  const newHashPos = hashChainPositionFor(row.hash_chain_position);
  overrides.hash_chain_position = newHashPos;
  overrides.merkle_root_segment = placeholderMerkleSegment(id, newHashPos);

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol && to !== row.chain_status) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_ipp_document_control SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `ipp_doc_control_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_ipp_document_control_events (id, document_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventName,
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action }),
    nowIso,
  ).run();

  if (eventName) {
    const cascadeName = eventName as Parameters<typeof fireCascade>[0]['event'];
    await fireCascade({
      event: cascadeName,
      actor_id: user.id,
      entity_type: 'ipp_doc_control',
      entity_id: id,
      data: {
        ...row,
        ...overrides,
        current_tier: tier,
        chain_status: to,
        from_status: row.chain_status,
        action,
        crosses_into_regulator: crosses,
      },
      env: c.env,
    });
  }

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_ipp_document_control WHERE id = ?').bind(id).first<IpdRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

// ─── Action endpoints (15 transitions; upload_drawing handled by POST /) ──
app.post('/:id/index-metadata', async (c) => transition(c, 'index_metadata', (_row, body) => {
  const b = body as Partial<IndexMetadataBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.document_class === 'string')  out.document_class = b.document_class;
  if (typeof b.document_type === 'string')   out.document_type = b.document_type;
  if (typeof b.discipline === 'string')      out.discipline = b.discipline;
  if (typeof b.package_code === 'string')    out.package_code = b.package_code;
  if (typeof b.iec_61355_code === 'string')  out.iec_61355_code = b.iec_61355_code;
  if (typeof b.drawing_title === 'string')   out.drawing_title = b.drawing_title;
  return applyCommon(b, out);
}));

app.post('/:id/open-revision', async (c) => transition(c, 'open_revision', (_row, body) => {
  const b = body as Partial<OpenRevisionBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.current_revision === 'string') out.current_revision = b.current_revision;
  return applyCommon(b, out);
}));

app.post('/:id/assign-idc', async (c) => transition(c, 'assign_IDC', (_row, body) => {
  const b = body as Partial<AssignIdcBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.reviewer_name === 'string')  out.reviewer_name = b.reviewer_name;
  if (typeof b.reviewer_party === 'string') out.reviewer_party = b.reviewer_party;
  return applyCommon(b, out);
}));

app.post('/:id/transmit', async (c) => transition(c, 'transmit', (_row, body) => {
  const b = body as Partial<TransmitBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.last_transmittal_number === 'string') out.last_transmittal_number = b.last_transmittal_number;
  return applyCommon(b, out);
}));

app.post('/:id/start-review', async (c) => transition(c, 'start_review', (_row, body) =>
  applyCommon(body as Partial<StartReviewBody>, {}),
));

app.post('/:id/comment', async (c) => transition(c, 'comment', (_row, body) => {
  const b = body as Partial<CommentBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.comments_summary === 'string') out.comments_summary = b.comments_summary;
  return applyCommon(b, out);
}));

app.post('/:id/revise', async (c) => transition(c, 'revise', (_row, body) => {
  const b = body as Partial<ReviseBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.current_revision === 'string') out.current_revision = b.current_revision;
  return applyCommon(b, out);
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.approver_name === 'string')  out.approver_name = b.approver_name;
  if (typeof b.approver_party === 'string') out.approver_party = b.approver_party;
  return applyCommon(b, out);
}));

app.post('/:id/issue-for-construction', async (c) => transition(c, 'issue_for_construction', (_row, body) =>
  applyCommon(body as Partial<IssueForConstructionBody>, {}),
));

app.post('/:id/finalise-as-built', async (c) => transition(c, 'finalise_as_built', (_row, body) =>
  applyCommon(body as Partial<FinaliseAsBuiltBody>, {}),
));

app.post('/:id/archive', async (c) => transition(c, 'archive', (_row, body) =>
  applyCommon(body as Partial<ArchiveBody>, {}),
));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.reject_reason === 'string') out.reject_reason = b.reject_reason;
  return applyCommon(b, out);
}));

app.post('/:id/withdraw', async (c) => transition(c, 'withdraw', (_row, body) => {
  const b = body as Partial<WithdrawBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.withdraw_reason === 'string') out.withdraw_reason = b.withdraw_reason;
  return applyCommon(b, out);
}));

app.post('/:id/hold', async (c) => transition(c, 'hold', (_row, body) => {
  const b = body as Partial<HoldBody>;
  const out: Partial<IpdRow> = {};
  if (typeof b.hold_reason === 'string') out.hold_reason = b.hold_reason;
  return applyCommon(b, out);
}));

app.post('/:id/resume', async (c) => transition(c, 'resume', (_row, body) =>
  applyCommon(body as Partial<ResumeBody>, {}),
));

// ─── Cron: SLA sweep (15-min) ─────────────────────────────────────────────
//
// Walks every active doc-control row whose sla_deadline_at has elapsed,
// flips sla_breached=1, bumps escalation_level, fires
// ipp_doc_control_sla_breached. Breach crosses regulator on
// safety_critical + electrical (heavy tiers).
export async function ippDocControlSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_document_control
     WHERE chain_status NOT IN ('archived', 'rejected', 'withdrawn')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<IpdRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_ipp_document_control
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `ipp_doc_control_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_ipp_document_control_events (id, document_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'ipp_doc_control_sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'doc_controller',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'ipp_doc_control_sla_breached',
        actor_id: 'system',
        entity_type: 'ipp_doc_control',
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

// ─── Cron: nightly IDC matrix recompute (00:25 UTC) ───────────────────────
//
// Walks every active doc-control row and refreshes idc_status from the
// current chain_status WITHOUT auto-transitioning. Document decisions are
// never moved by cron — only the LIVE IDC matrix is refreshed so the SPA
// + dashboards reflect the current state of every reviewer's inbox.
export async function ippDocControlIdcMatrixRecompute(
  env: HonoEnv['Bindings'],
): Promise<{ scanned: number; updated: number }> {
  const nowIso = new Date().toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_ipp_document_control
     WHERE chain_status NOT IN ('archived', 'rejected', 'withdrawn')`,
  ).all<IpdRow>();

  const rows = rs.results || [];
  let updated = 0;
  for (const row of rows) {
    const idc = idcStatusFor(row.chain_status);
    const completeness = documentCompletenessIndex({
      draft_uploaded:          !!row.draft_uploaded_at,
      metadata_indexed:        !!row.metadata_indexed_at,
      revision_open:           !!row.revision_open_at,
      IDC_assigned:            !!row.idc_assigned_at,
      transmitted:             !!row.transmitted_at,
      reviewed:                !!row.reviewed_at,
      commented:               !!row.commented_at,
      revised:                 !!row.revised_at,
      approved:                !!row.approved_at,
      issued_for_construction: !!row.issued_for_construction_at,
      as_built_finalised:      !!row.as_built_finalised_at,
      archived:                !!row.archived_at,
      clean_archive_bonus:     row.chain_status === 'archived' && !row.rejected_at && !row.withdrawn_at,
    });
    const health = docHealthBand(
      row.chain_status,
      completeness,
      !!row.sla_breached,
      !!row.rejected_at,
      !!row.withdrawn_at,
    );

    await env.DB.prepare(
      `UPDATE oe_ipp_document_control
       SET idc_status = ?, idc_matrix_recomputed_at = ?,
           document_completeness_index = ?,
           doc_health_band = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(idc, nowIso, completeness, health, nowIso, row.id).run();
    updated++;
  }
  return { scanned: rows.length, updated };
}

export default app;
