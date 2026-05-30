// ═══════════════════════════════════════════════════════════════════════════
// Wave 104 — Support ITIL Service Request Fulfilment Chain (P6). 11th
// OEM-Support chain. Mounted at /api/support/service-request/chain.
//
// The catalog + entitlement + fulfilment workflow distinct from W14 ticket
// (reactive triage), W41 problem (root-cause analysis), W47 change (RFC/CAB)
// and W55 patch (vulnerability). Service requests are catalog-driven,
// pre-approved, low-risk requests like rotate API key, provision substation
// read access, request a spare meter swap, request a site-visit window,
// audit-evidence pull. They flow off the W80 service-contract entitlement
// gate, route through approval (low-risk autonomic, configuration-change
// CAB-mandated via W47), assign to a fulfiller, run to fulfilled →
// verified → closed → archived, and feed first-time-fix and reopened
// metrics back into the service desk.
//
// DISTINCTIVE move (beats ServiceNow ITSM Service Catalog + BMC Helix
// Request + Jira SM Request + Atlassian Assist + Freshservice Request
// Catalog + Ivanti Neurons + SolarWinds SD + ManageEngine SDP + Cherwell
// SRC + TOPdesk — every one of these surfaces service requests as a queue +
// form, with entitlement and CAB as separate dashboards): LIVE battery on
// every row (entitlement_match_score 0-100, first_time_fix_rate_30d for the
// same catalog category, avg_fulfilment_time_hours, sla_days_remaining,
// urgency_band, breach_imminent_flag, catalog_completeness_index 0-130,
// regulator_filing_window_hours, authority_required 4-step ladder,
// bridges_to_change_chain, bridges_to_problem_chain). Tier RE-DERIVED on
// every transition from severity_zar with FLOOR-AT-MATERIAL on five flags
// and FLOOR-AT-CRITICAL on access_to_critical_system + oem_break_glass.
//
// Write model — SINGLE Support desk {admin, support}. READ all nine
// personas. actor_party (requester / approver / fulfiller / verifier /
// archiver) records the functional owner per step.
//
// Reportability — W104 SIGNATURE crossings:
//   reject           crosses regulator EVERY tier when regulator_relevant
//                    (rejection of a regulator-relevant request is
//                    reportable - W104 signature).
//   mark_fulfilled   crosses regulator on critical when grid_significant
//                    (security-of-supply ops change is reportable on
//                    fulfilment - second signature).
//   cancel_request   crosses regulator EVERY tier when entitlement_status
//                    = entitled AND regulator_relevant.
//   sla_breached     crosses material + critical.
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
  tierForSeverity,
  effectiveTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  requiresCabReview,
  entitlementMatchScore,
  firstTimeFixRate30d,
  avgFulfilmentTimeHours,
  slaDaysRemaining,
  urgencyBand,
  breachImminentFlag,
  catalogCompletenessIndex,
  regulatorFilingWindowHours,
  authorityRequired,
  bridgesToChangeChain,
  bridgesToProblemChain,
  isFirstTimeFix,
  SLA_MINUTES,
  type SrStatus,
  type SrAction,
  type SrTier,
} from '../utils/service-request-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'offtaker', 'trader', 'regulator', 'lender', 'grid_operator', 'carbon_fund',
]);

const WRITE_ROLES = new Set(['admin', 'support']);

interface SrRow {
  id: string;
  request_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  catalog_item_id: string | null;
  catalog_item_label: string | null;
  catalog_category: string | null;
  requested_for_party_id: string | null;
  requested_for_party_label: string | null;
  requested_by_actor_id: string | null;
  requested_by_actor_role: string | null;
  business_justification: string | null;
  urgency_requested: string | null;
  entitlement_status: string | null;
  entitlement_contract_id: string | null;
  entitlement_overage_units: number | null;
  requires_cab_review: number;
  cab_change_id: string | null;
  approver_actor_id: string | null;
  approver_actor_role: string | null;
  approval_decision: string | null;
  approval_conditions_text: string | null;
  auto_fulfil_eligible: number;
  auto_fulfil_playbook_ref: string | null;
  fulfiller_actor_id: string | null;
  assignee_team: string | null;
  assigned_at: string | null;
  fulfilment_started_at: string | null;
  fulfilled_at: string | null;
  first_response_at: string | null;
  closed_at: string | null;
  first_time_fix: number;
  reopened_count: number;
  reopen_reason_text: string | null;
  customer_satisfaction_csat: number | null;
  failure_reason_code: string | null;
  regulator_relevant: number;
  regulator_reason_text: string | null;
  is_reportable: number;
  severity_zar: number;
  request_floor_flag_access_to_critical_system: number;
  request_floor_flag_data_export_popia: number;
  request_floor_flag_grid_significant: number;
  request_floor_flag_oem_break_glass: number;
  request_floor_flag_sla_premium_contract: number;
  current_tier: SrTier;
  authority_required: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  reject_reason: string | null;
  cancelled_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  chain_status: SrStatus;
  submitted_at: string | null;
  entitlement_checked_at: string | null;
  approval_pending_at: string | null;
  approved_at: string | null;
  awaiting_user_at: string | null;
  user_responded_at: string | null;
  verified_at: string | null;
  archived_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  regulator_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  sla_breached: number;
  escalation_level: number;
  tenant_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface SrEventRow {
  id: string;
  request_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<SrStatus, keyof SrRow | null> = {
  submitted:              'submitted_at',
  entitlement_checked:    'entitlement_checked_at',
  approval_pending:       'approval_pending_at',
  approved:               'approved_at',
  assigned:               'assigned_at',
  fulfilment_in_progress: 'fulfilment_started_at',
  awaiting_user:          'awaiting_user_at',
  user_responded:         'user_responded_at',
  fulfilled:              'fulfilled_at',
  verified:               'verified_at',
  closed:                 'closed_at',
  archived:               'archived_at',
  rejected:               'rejected_at',
  cancelled:              'cancelled_at',
};

function statusEnteredAt(row: SrRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.submitted_at ? new Date(row.submitted_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.submitted_at ? new Date(row.submitted_at) : null);
}

interface CategoryAggregate {
  fulfilled_count: number;
  first_time_fix_count: number;
  avg_hours: number;
}

async function categoryAggregates(env: HonoEnv['Bindings'], category: string | null): Promise<CategoryAggregate> {
  if (!category) return { fulfilled_count: 0, first_time_fix_count: 0, avg_hours: 0 };
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const r = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN first_time_fix = 1 THEN 1 ELSE 0 END) AS first_time_fix_count,
       AVG(
         CASE
           WHEN fulfilled_at IS NOT NULL AND submitted_at IS NOT NULL
           THEN (julianday(fulfilled_at) - julianday(submitted_at)) * 24.0
           ELSE NULL
         END
       ) AS avg_hours
     FROM oe_service_request_chain
     WHERE catalog_category = ?
       AND fulfilled_at IS NOT NULL
       AND fulfilled_at >= ?`,
  ).bind(category, since).first<{ total: number | null; first_time_fix_count: number | null; avg_hours: number | null }>();
  return {
    fulfilled_count: Number(r?.total ?? 0),
    first_time_fix_count: Number(r?.first_time_fix_count ?? 0),
    avg_hours: r?.avg_hours != null ? Math.round(Number(r.avg_hours) * 10) / 10 : 0,
  };
}

function decorate(row: SrRow, now: Date, agg: CategoryAggregate) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const entitlementScore = entitlementMatchScore({
    entitlement_status: row.entitlement_status,
    entitlement_contract_id: row.entitlement_contract_id,
    entitlement_overage_units: row.entitlement_overage_units,
  });

  const completeness = catalogCompletenessIndex({
    entitlement_checked: !!row.entitlement_checked_at,
    approval_resolved: !!row.approved_at || !!row.rejected_at,
    assigned: !!row.assigned_at,
    fulfilment_started: !!row.fulfilment_started_at,
    fulfilled: !!row.fulfilled_at,
    verified: !!row.verified_at,
    closed: !!row.closed_at,
    archived: !!row.archived_at,
    first_time_fix_bonus: !!row.first_time_fix,
    csat_collected: row.customer_satisfaction_csat != null,
  });

  const ftf = firstTimeFixRate30d(agg.first_time_fix_count, agg.fulfilled_count);
  const entered = statusEnteredAt(row);
  const slaLeft = slaDaysRemaining(status, tier, entered, now);
  const urgency = urgencyBand(tier, slaLeft);
  const authority = authorityRequired(tier);
  const breachImminent = breachImminentFlag(slaLeft);
  const regFilingHours = regulatorFilingWindowHours(tier);

  return {
    ...row,
    is_terminal: isTerminal(status),
    is_hard_terminal: isHardTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached_live: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    entitlement_match_score_live: entitlementScore,
    first_time_fix_rate_30d_live: ftf,
    avg_fulfilment_time_hours_live: agg.avg_hours,
    sla_days_remaining_live: slaLeft,
    urgency_band_live: urgency,
    breach_imminent_flag_live: breachImminent,
    catalog_completeness_index_live: completeness,
    regulator_filing_window_hours_live: regFilingHours,
    authority_required_live: authority,
    bridges_to_change_chain_live: bridgesToChangeChain(row.cab_change_id),
    bridges_to_problem_chain_live: bridgesToProblemChain(row.reopened_count),
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier         = c.req.query('tier');
  const status       = c.req.query('status');
  const category     = c.req.query('category');
  const breached     = c.req.query('breached');
  const reportable   = c.req.query('reportable');
  const reg_relevant = c.req.query('regulator_relevant');

  let sql = 'SELECT * FROM oe_service_request_chain WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)         { sql += ' AND current_tier = ?';      binds.push(tier); }
  if (status)       { sql += ' AND chain_status = ?';      binds.push(status); }
  if (category)     { sql += ' AND catalog_category = ?';  binds.push(category); }
  if (reg_relevant) { sql += ' AND regulator_relevant = ?'; binds.push(reg_relevant === 'true' ? 1 : 0); }
  sql += ' ORDER BY datetime(submitted_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<SrRow>();
  const now = new Date();
  // Aggregate per-category roll-ups in one pass.
  const categories = new Set<string>();
  for (const r of rs.results || []) {
    if (r.catalog_category) categories.add(r.catalog_category);
  }
  const aggByCategory: Record<string, CategoryAggregate> = {};
  for (const cat of categories) {
    aggByCategory[cat] = await categoryAggregates(c.env, cat);
  }
  let items = (rs.results || []).map((r) => decorate(
    r,
    now,
    r.catalog_category ? (aggByCategory[r.catalog_category] || { fulfilled_count: 0, first_time_fix_count: 0, avg_hours: 0 }) : { fulfilled_count: 0, first_time_fix_count: 0, avg_hours: 0 },
  ));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_live);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_category: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    if (i.catalog_category) by_category[i.catalog_category] = (by_category[i.catalog_category] || 0) + 1;
  }

  const active_count       = items.filter((i) => !i.is_terminal).length;
  const approval_pending   = items.filter((i) => i.chain_status === 'approval_pending').length;
  const awaiting_user      = items.filter((i) => i.chain_status === 'awaiting_user').length;
  const fulfilled_count    = items.filter((i) => i.chain_status === 'fulfilled' || !!i.fulfilled_at).length;
  const reopened_count     = items.filter((i) => (i.reopened_count || 0) > 0).length;
  const critical_count     = items.filter((i) => i.current_tier === 'critical').length;
  const breached_count     = items.filter((i) => i.sla_breached_live && !i.is_terminal).length;
  const reportable_total   = items.filter((i) => i.is_reportable_flag).length;
  const cab_bridged_count  = items.filter((i) => i.bridges_to_change_chain_live).length;
  const problem_bridged    = items.filter((i) => i.bridges_to_problem_chain_live).length;

  const totalFtfSamples = Object.values(aggByCategory).reduce((s, a) => s + a.fulfilled_count, 0);
  const totalFtfHits = Object.values(aggByCategory).reduce((s, a) => s + a.first_time_fix_count, 0);
  const platformFtfRate = firstTimeFixRate30d(totalFtfHits, totalFtfSamples);
  const platformAvgHours = avgFulfilmentTimeHours(
    Object.values(aggByCategory).filter((a) => a.avg_hours > 0).map((a) => a.avg_hours),
  );

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_category,
      active_count,
      approval_pending,
      awaiting_user,
      fulfilled_count,
      reopened_count,
      critical_count,
      breached: breached_count,
      reportable_total,
      cab_bridged_count,
      problem_bridged,
      platform_first_time_fix_rate_30d: platformFtfRate,
      platform_avg_fulfilment_time_hours: platformAvgHours,
    },
  });
});

app.get('/aggregate', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const rs = await c.env.DB.prepare(
    `SELECT chain_status, current_tier, regulator_relevant, sla_breached, catalog_category, COUNT(*) as n
     FROM oe_service_request_chain GROUP BY chain_status, current_tier, regulator_relevant, sla_breached, catalog_category`,
  ).all<{
    chain_status: string; current_tier: string;
    regulator_relevant: number; sla_breached: number;
    catalog_category: string | null; n: number;
  }>();
  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_regulator_relevant: Record<string, number> = {};
  const by_sla_breached: Record<string, number> = {};
  const by_category: Record<string, number> = {};
  for (const r of rs.results || []) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + r.n;
    by_tier[r.current_tier] = (by_tier[r.current_tier] || 0) + r.n;
    by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] =
      (by_regulator_relevant[r.regulator_relevant ? 'true' : 'false'] || 0) + r.n;
    by_sla_breached[r.sla_breached ? 'true' : 'false'] =
      (by_sla_breached[r.sla_breached ? 'true' : 'false'] || 0) + r.n;
    if (r.catalog_category) by_category[r.catalog_category] = (by_category[r.catalog_category] || 0) + r.n;
  }
  const total = (rs.results || []).reduce((s, r) => s + r.n, 0);
  return c.json({ success: true, data: { total, by_status, by_tier, by_regulator_relevant, by_sla_breached, by_category } });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_service_request_chain WHERE id = ?').bind(id).first<SrRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);
  const agg = await categoryAggregates(c.env, row.catalog_category);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_service_request_chain_events WHERE request_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<SrEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date(), agg),
      events: ev.results || [],
    },
  });
});

interface CommonBody {
  notes?: string;
  reason_code?: string;
  regulator_ref?: string;
  title?: string;
  narrative?: string;
  result_text?: string;
}

interface CreateBody extends CommonBody {
  catalog_item_id?: string;
  catalog_item_label?: string;
  catalog_category?: string;
  requested_for_party_id?: string;
  requested_for_party_label?: string;
  requested_by_actor_id?: string;
  requested_by_actor_role?: string;
  business_justification?: string;
  urgency_requested?: string;
  severity_zar?: number;
  regulator_relevant?: boolean | number;
  regulator_reason_text?: string;
  request_floor_flag_access_to_critical_system?: boolean | number;
  request_floor_flag_data_export_popia?: boolean | number;
  request_floor_flag_grid_significant?: boolean | number;
  request_floor_flag_oem_break_glass?: boolean | number;
  request_floor_flag_sla_premium_contract?: boolean | number;
  tenant_id?: string;
  source_event?: string;
  source_entity_type?: string;
  source_entity_id?: string;
  source_wave?: string;
}

interface CheckEntitlementBody extends CommonBody {
  entitlement_status?: string;
  entitlement_contract_id?: string;
  entitlement_overage_units?: number;
  auto_fulfil_eligible?: boolean | number;
  auto_fulfil_playbook_ref?: string;
}
interface RequestApprovalBody extends CommonBody {
  approver_actor_id?: string;
  approver_actor_role?: string;
  requires_cab_review?: boolean | number;
  cab_change_id?: string;
}
interface ApproveBody extends CommonBody {
  approval_decision?: string;
  approval_conditions_text?: string;
  approver_actor_id?: string;
}
interface RejectBody extends CommonBody {
  reject_reason?: string;
  approver_actor_id?: string;
}
interface AssignBody extends CommonBody {
  fulfiller_actor_id?: string;
  assignee_team?: string;
}
interface StartFulfilmentBody extends CommonBody {}
interface RequestUserInfoBody extends CommonBody {}
interface ReceiveUserResponseBody extends CommonBody {}
interface MarkFulfilledBody extends CommonBody {
  result_text?: string;
  failure_reason_code?: string;
}
interface VerifyBody extends CommonBody {
  customer_satisfaction_csat?: number;
}
interface CloseBody extends CommonBody {}
interface ArchiveBody extends CommonBody {}
interface CancelBody extends CommonBody {
  cancelled_reason?: string;
}
interface ReopenBody extends CommonBody {
  reopen_reason_text?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<SrRow>): Partial<SrRow> {
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string') out.regulator_ref = b.regulator_ref;
  if (typeof b.title === 'string')         out.title = b.title;
  if (typeof b.narrative === 'string')     out.narrative = b.narrative;
  if (typeof b.result_text === 'string')   out.result_text = b.result_text;
  return out;
}

function toFlag(v: unknown): number | undefined {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  return undefined;
}

// ─── Create (submit) endpoint ────────────────────────────────────────────
app.post('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Partial<CreateBody>;
  const id = `sr-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  const num = body.catalog_item_id
    ? `SR-${new Date().getUTCFullYear()}-${id.slice(3, 9).toUpperCase()}`
    : `SR-${Date.now()}`;

  const flags = {
    request_floor_flag_access_to_critical_system: toFlag(body.request_floor_flag_access_to_critical_system) ?? 0,
    request_floor_flag_data_export_popia:         toFlag(body.request_floor_flag_data_export_popia) ?? 0,
    request_floor_flag_grid_significant:          toFlag(body.request_floor_flag_grid_significant) ?? 0,
    request_floor_flag_oem_break_glass:           toFlag(body.request_floor_flag_oem_break_glass) ?? 0,
    request_floor_flag_sla_premium_contract:      toFlag(body.request_floor_flag_sla_premium_contract) ?? 0,
  };
  const severity = Number(body.severity_zar ?? 0);
  const rawTier = tierForSeverity(severity);
  const tier = effectiveTier(rawTier, flags);
  const cab = requiresCabReview(body.catalog_category, body.urgency_requested) ? 1 : 0;
  const regRelevant = toFlag(body.regulator_relevant) ?? 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor('submitted', tier, now);

  await c.env.DB.prepare(
    `INSERT INTO oe_service_request_chain (
      id, request_number,
      source_event, source_entity_type, source_entity_id, source_wave,
      catalog_item_id, catalog_item_label, catalog_category,
      requested_for_party_id, requested_for_party_label,
      requested_by_actor_id, requested_by_actor_role,
      business_justification, urgency_requested,
      requires_cab_review,
      regulator_relevant, regulator_reason_text,
      severity_zar,
      request_floor_flag_access_to_critical_system,
      request_floor_flag_data_export_popia,
      request_floor_flag_grid_significant,
      request_floor_flag_oem_break_glass,
      request_floor_flag_sla_premium_contract,
      current_tier, authority_required,
      title, narrative,
      chain_status, submitted_at,
      is_reportable, sla_deadline_at, sla_breached, escalation_level,
      tenant_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, num,
    body.source_event ?? null, body.source_entity_type ?? null, body.source_entity_id ?? null, body.source_wave ?? null,
    body.catalog_item_id ?? null, body.catalog_item_label ?? null, body.catalog_category ?? null,
    body.requested_for_party_id ?? null, body.requested_for_party_label ?? null,
    body.requested_by_actor_id ?? user.id, body.requested_by_actor_role ?? 'end_user',
    body.business_justification ?? null, body.urgency_requested ?? 'normal',
    cab,
    regRelevant, body.regulator_reason_text ?? null,
    severity,
    flags.request_floor_flag_access_to_critical_system,
    flags.request_floor_flag_data_export_popia,
    flags.request_floor_flag_grid_significant,
    flags.request_floor_flag_oem_break_glass,
    flags.request_floor_flag_sla_premium_contract,
    tier, authorityRequired(tier),
    body.title ?? null, body.narrative ?? null,
    'submitted', nowIso,
    isReportable(tier) ? 1 : 0, sla ? sla.toISOString() : null, 0, 0,
    body.tenant_id ?? null, user.id, nowIso, nowIso,
  ).run();

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_service_request_chain WHERE id = ?').bind(id).first<SrRow>();
  const agg = await categoryAggregates(c.env, body.catalog_category ?? null);
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now, agg) : null } });
});

async function transition(
  c: Context<HonoEnv>,
  action: SrAction,
  bodyHandler?: (row: SrRow, body: Record<string, unknown>) => Partial<SrRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_service_request_chain WHERE id = ?').bind(id).first<SrRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from current severity + 5 floor flags (may have been
  // updated in this transition's body).
  const severity = (overrides.severity_zar as number | undefined) ?? row.severity_zar;
  const rawTier = tierForSeverity(severity);
  const floorFlags = {
    request_floor_flag_access_to_critical_system:
      (overrides.request_floor_flag_access_to_critical_system as number | undefined) ?? row.request_floor_flag_access_to_critical_system,
    request_floor_flag_data_export_popia:
      (overrides.request_floor_flag_data_export_popia as number | undefined) ?? row.request_floor_flag_data_export_popia,
    request_floor_flag_grid_significant:
      (overrides.request_floor_flag_grid_significant as number | undefined) ?? row.request_floor_flag_grid_significant,
    request_floor_flag_oem_break_glass:
      (overrides.request_floor_flag_oem_break_glass as number | undefined) ?? row.request_floor_flag_oem_break_glass,
    request_floor_flag_sla_premium_contract:
      (overrides.request_floor_flag_sla_premium_contract as number | undefined) ?? row.request_floor_flag_sla_premium_contract,
  };
  const tier = effectiveTier(rawTier, floorFlags);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  // Reopen handling — bump counter, set reason, recompute first_time_fix.
  if (action === 'reopen_request') {
    overrides.reopened_count = (row.reopened_count || 0) + 1;
    overrides.first_time_fix = 0;
  }
  // First-time-fix awarded on mark_fulfilled iff zero reopens at fulfilment.
  if (action === 'mark_fulfilled') {
    overrides.first_time_fix = isFirstTimeFix(row.reopened_count, nowIso) ? 1 : 0;
    overrides.fulfilled_at = nowIso;
  }
  if (action === 'start_fulfilment' && !row.first_response_at) {
    overrides.first_response_at = nowIso;
  }

  const regRelevant = !!(row.regulator_relevant || (overrides.regulator_relevant as number | undefined));
  const entStatus = (overrides.entitlement_status as string | undefined) ?? row.entitlement_status;
  const gridSig = floorFlags.request_floor_flag_grid_significant;

  const crosses = crossesIntoRegulator(action, tier, {
    regulator_relevant: regRelevant,
    entitlement_status: entStatus,
    request_floor_flag_grid_significant: gridSig,
  });
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

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
    `UPDATE oe_service_request_chain SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `service_request_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_service_request_chain_events (id, request_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'service_request',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_service_request_chain WHERE id = ?').bind(id).first<SrRow>();
  const agg = await categoryAggregates(c.env, row.catalog_category);
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now, agg) : null } });
}

// ─── Action endpoints ────────────────────────────────────────────────────
app.post('/:id/check-entitlement', async (c) => transition(c, 'check_entitlement', (_row, body) => {
  const b = body as Partial<CheckEntitlementBody>;
  const out: Partial<SrRow> = {};
  if (typeof b.entitlement_status === 'string')      out.entitlement_status = b.entitlement_status;
  if (typeof b.entitlement_contract_id === 'string') out.entitlement_contract_id = b.entitlement_contract_id;
  if (typeof b.entitlement_overage_units === 'number') out.entitlement_overage_units = b.entitlement_overage_units;
  const af = toFlag(b.auto_fulfil_eligible); if (af !== undefined) out.auto_fulfil_eligible = af;
  if (typeof b.auto_fulfil_playbook_ref === 'string') out.auto_fulfil_playbook_ref = b.auto_fulfil_playbook_ref;
  return applyCommon(b, out);
}));

app.post('/:id/request-approval', async (c) => transition(c, 'request_approval', (_row, body) => {
  const b = body as Partial<RequestApprovalBody>;
  const out: Partial<SrRow> = {};
  if (typeof b.approver_actor_id === 'string')   out.approver_actor_id = b.approver_actor_id;
  if (typeof b.approver_actor_role === 'string') out.approver_actor_role = b.approver_actor_role;
  const cab = toFlag(b.requires_cab_review); if (cab !== undefined) out.requires_cab_review = cab;
  if (typeof b.cab_change_id === 'string') out.cab_change_id = b.cab_change_id;
  return applyCommon(b, out);
}));

app.post('/:id/approve', async (c) => transition(c, 'approve', (_row, body) => {
  const b = body as Partial<ApproveBody>;
  const out: Partial<SrRow> = {};
  out.approval_decision = b.approval_decision ?? 'approved';
  if (typeof b.approval_conditions_text === 'string') out.approval_conditions_text = b.approval_conditions_text;
  if (typeof b.approver_actor_id === 'string')        out.approver_actor_id = b.approver_actor_id;
  return applyCommon(b, out);
}));

app.post('/:id/reject', async (c) => transition(c, 'reject', (_row, body) => {
  const b = body as Partial<RejectBody>;
  const out: Partial<SrRow> = {};
  out.approval_decision = 'rejected';
  if (typeof b.reject_reason === 'string')      out.reject_reason = b.reject_reason;
  if (typeof b.approver_actor_id === 'string')  out.approver_actor_id = b.approver_actor_id;
  return applyCommon(b, out);
}));

app.post('/:id/assign', async (c) => transition(c, 'assign', (_row, body) => {
  const b = body as Partial<AssignBody>;
  const out: Partial<SrRow> = {};
  if (typeof b.fulfiller_actor_id === 'string') out.fulfiller_actor_id = b.fulfiller_actor_id;
  if (typeof b.assignee_team === 'string')      out.assignee_team = b.assignee_team;
  return applyCommon(b, out);
}));

app.post('/:id/start-fulfilment', async (c) => transition(c, 'start_fulfilment', (_row, body) =>
  applyCommon(body as Partial<StartFulfilmentBody>, {}),
));

app.post('/:id/request-user-info', async (c) => transition(c, 'request_user_info', (_row, body) =>
  applyCommon(body as Partial<RequestUserInfoBody>, {}),
));

app.post('/:id/receive-user-response', async (c) => transition(c, 'receive_user_response', (_row, body) =>
  applyCommon(body as Partial<ReceiveUserResponseBody>, {}),
));

app.post('/:id/mark-fulfilled', async (c) => transition(c, 'mark_fulfilled', (_row, body) => {
  const b = body as Partial<MarkFulfilledBody>;
  const out: Partial<SrRow> = {};
  if (typeof b.result_text === 'string')         out.result_text = b.result_text;
  if (typeof b.failure_reason_code === 'string') out.failure_reason_code = b.failure_reason_code;
  return applyCommon(b, out);
}));

app.post('/:id/verify', async (c) => transition(c, 'verify', (_row, body) => {
  const b = body as Partial<VerifyBody>;
  const out: Partial<SrRow> = {};
  if (typeof b.customer_satisfaction_csat === 'number') {
    out.customer_satisfaction_csat = Math.min(5, Math.max(1, Math.floor(b.customer_satisfaction_csat)));
  }
  return applyCommon(b, out);
}));

app.post('/:id/close', async (c) => transition(c, 'close', (_row, body) =>
  applyCommon(body as Partial<CloseBody>, {}),
));

app.post('/:id/archive-request', async (c) => transition(c, 'archive_request', (_row, body) =>
  applyCommon(body as Partial<ArchiveBody>, {}),
));

app.post('/:id/cancel-request', async (c) => transition(c, 'cancel_request', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<SrRow> = {};
  if (typeof b.cancelled_reason === 'string') out.cancelled_reason = b.cancelled_reason;
  return applyCommon(b, out);
}));

app.post('/:id/reopen-request', async (c) => transition(c, 'reopen_request', (_row, body) => {
  const b = body as Partial<ReopenBody>;
  const out: Partial<SrRow> = {};
  if (typeof b.reopen_reason_text === 'string') out.reopen_reason_text = b.reopen_reason_text;
  return applyCommon(b, out);
}));

// ─── Cron: SLA sweep (15-min) + entitlement-window countdown (nightly) ───
export async function serviceRequestSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_service_request_chain
     WHERE chain_status NOT IN ('closed','archived','rejected','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<SrRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_service_request_chain
       SET last_sla_breach_at = ?, sla_breached = 1,
           escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `service_request_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_service_request_chain_events (id, request_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'service_request.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'fulfiller',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'service_request.sla_breached',
        actor_id: 'system',
        entity_type: 'service_request',
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

// Nightly entitlement-window countdown — flips entitlement_status to
// 'contract_expired' on requests whose linked W80 service contract has
// expired and is not renewed. Lets the catalog reflect coverage drift even
// when the request sits in approval_pending for weeks.
export async function serviceRequestEntitlementWindowSweep(env: HonoEnv['Bindings']): Promise<{ expired: number }> {
  const nowIso = new Date().toISOString();
  let expired = 0;
  try {
    const rs = await env.DB.prepare(
      `SELECT sr.id AS id, sc.chain_status AS svc_status
       FROM oe_service_request_chain sr
       JOIN oe_service_contracts sc ON sc.id = sr.entitlement_contract_id
       WHERE sr.entitlement_status = 'entitled'
         AND sr.chain_status NOT IN ('closed','archived','rejected','cancelled','fulfilled','verified')
         AND sc.chain_status IN ('expired','cancelled')`,
    ).all<{ id: string; svc_status: string }>();
    for (const r of rs.results || []) {
      await env.DB.prepare(
        `UPDATE oe_service_request_chain
         SET entitlement_status = 'contract_expired', updated_at = ?
         WHERE id = ?`,
      ).bind(nowIso, r.id).run();
      expired++;
    }
  } catch {
    // W80 may not exist yet on fresh DBs — silently skip.
  }
  return { expired };
}

export default app;
