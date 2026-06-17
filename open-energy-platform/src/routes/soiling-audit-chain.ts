// ═══════════════════════════════════════════════════════════════════════════
// Wave 102 — Esums Plant Soiling, Cleaning Authorisation & Recovery-Gain
// Audit (P6). 11th Esums chain.
//
// Mounted at /api/esums/soiling-audit/chain.
//
// PV soiling — dust, pollen, bird droppings, agricultural film — is one of
// the single biggest controllable production losses on a SA solar plant.
// W102 is the soiling audit + cleaning authorisation chain. Periodic
// soiling-ratio measurement → inspection → economic assessment → cleaning
// authorisation gate (water-restriction + DFFE conditions + neighbour
// notice) → field cleaning by contractor → post-clean PR-delta validation
// → settled audit ledger feeding W79 generation revenue assurance →
// counterparty dispute branch on measurement methodology.
//
// DISTINCTIVE move (beats NTT Data Soiling Maps + Power Factors Drive
// Soiling + AlsoEnergy Soiling Loss Index + 3E SynaptiQ Soiling + Above
// Surveying drone IR + Heliolytics aerial PV + Atonometrics RSE-1 +
// DEWA-RTC + DroneDeploy — all run as static dashboards/reports): LIVE
// soiling + cleaning-economics battery on every record (pr_loss_pct,
// mwh_loss_per_day, zar_loss_per_day, zar_loss_to_date, cleaning_roi_ratio,
// days_to_breakeven, soiling_velocity_pct_per_day, predicted_next_clean_date,
// recovered_zar, soiling_compliance_index 0-130, sla_days_remaining,
// urgency_band, authority_required (site_supervisor→plant_manager→
// asset_director→cfo)). Tier RE-DERIVED on every transition from current
// soiling_ratio_pct with FLOOR-AT-MATERIAL on rainy_season_window_strict /
// post_dust_storm_event / neighbour_complaint_filed / water_restriction_active.
//
// Write model — SINGLE Esums desk {admin, support}. READ all nine personas.
// actor_party (site_supervisor / cleaning_contractor / plant_owner /
// regulator_observer) records the functional owner per step.
//
// Reportability — W102 PRODUCTION-LOSS SIGNATURE (NERSA REIPPPP + DFFE):
//   raise_dispute        crosses EVERY tier — production-loss disputes
//                        always reportable (W102 signature).
//   cancel_audit         crosses EVERY tier on material+severe — skipping
//                        a needed clean is a production-reporting event.
//   authorize_cleaning   crosses EVERY tier when installed_capacity_mw ≥ 50
//                        (NERSA reporting threshold) OR water_consumption_m3
//                        ≥ 100 (DFFE bulk-water threshold).
//   sla_breached         crosses material + severe.
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForSoilingRatio,
  floorAtMaterial,
  effectiveTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  prLossPct,
  mwhLossPerDay,
  zarLossPerDay,
  zarLossToDate,
  cleaningRoiRatio,
  daysToBreakeven,
  soilingVelocityPctPerDay,
  predictedNextCleanDate,
  recoveredZar,
  soilingComplianceIndex,
  slaDaysRemaining,
  urgencyBand,
  authorityRequired,
  SLA_MINUTES,
  type SoilStatus,
  type SoilAction,
  type SoilTier,
} from '../utils/soiling-audit-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'offtaker', 'trader', 'regulator', 'lender', 'grid_operator', 'carbon_fund', 'esco',
]);

// esco is the live Esums/O&M operator persona (seed 494); 'support' was the
// pre-persona placeholder. Both write so the laned esco Horizon is functional.
const WRITE_ROLES = new Set(['admin', 'support', 'esco']);

interface SoilRow {
  id: string;
  audit_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  facility_id: string;
  facility_name: string | null;
  plant_owner_party_id: string | null;
  plant_owner_party_name: string | null;
  installed_capacity_mw: number | null;
  technology: string | null;
  site_region: string | null;
  period_opened_at: string | null;
  period_label: string | null;
  inspection_method: string | null;
  evidence_photo_uploaded: number;
  soiling_ratio_pct: number;
  baseline_ratio_pct: number | null;
  days_since_baseline: number | null;
  soiling_velocity_pct_per_day: number | null;
  expected_pr_clean_pct: number | null;
  current_pr_dirty_pct: number | null;
  pr_loss_pct: number | null;
  peak_sun_hours_per_day: number | null;
  mwh_loss_per_day: number | null;
  tariff_zar_per_mwh: number | null;
  zar_loss_per_day: number | null;
  zar_loss_to_date: number | null;
  cleaning_method: string | null;
  cleaning_cost_zar: number | null;
  water_consumption_m3: number | null;
  recovery_horizon_days: number | null;
  cleaning_roi_ratio: number | null;
  days_to_breakeven: number | null;
  post_clean_pr_pct: number | null;
  recovered_zar: number | null;
  recovery_documented: number;
  rainy_season_window_strict: number;
  post_dust_storm_event: number;
  neighbour_complaint_filed: number;
  water_restriction_active: number;
  current_tier: SoilTier;
  authority_required: string | null;
  dispute_count: number;
  cancel_count: number;
  parent_audit_id: string | null;
  prior_audit_id: string | null;
  regulator_ref: string | null;
  cleaning_contractor_id: string | null;
  cleaning_contractor_name: string | null;
  wul_licence_ref: string | null;
  title: string | null;
  narrative: string | null;
  result_text: string | null;
  disputed_reason: string | null;
  cancelled_reason: string | null;
  reason_code: string | null;
  current_ball_in_court_party: string | null;
  last_responder_party: string | null;
  supervisor_party: string | null;
  contractor_party: string | null;
  owner_party: string | null;
  chain_status: SoilStatus;
  soiling_period_opened_at: string | null;
  inspection_scheduled_at: string | null;
  field_inspected_at: string | null;
  soiling_measured_at: string | null;
  economic_assessment_done_at: string | null;
  cleaning_authorized_at: string | null;
  cleaning_in_progress_at: string | null;
  post_clean_measured_at: string | null;
  gain_validated_at: string | null;
  settled_at: string | null;
  disputed_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  regulator_crossed_at: string | null;
  regulator_inbox_ref: string | null;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface SoilEventRow {
  id: string;
  audit_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<SoilStatus, keyof SoilRow | null> = {
  soiling_period_open:      'soiling_period_opened_at',
  inspection_scheduled:     'inspection_scheduled_at',
  field_inspected:          'field_inspected_at',
  soiling_measured:         'soiling_measured_at',
  economic_assessment_done: 'economic_assessment_done_at',
  cleaning_authorized:      'cleaning_authorized_at',
  cleaning_in_progress:     'cleaning_in_progress_at',
  post_clean_measured:      'post_clean_measured_at',
  gain_validated:           'gain_validated_at',
  settled:                  'settled_at',
  disputed:                 'disputed_at',
  cancelled:                'cancelled_at',
};

function statusEnteredAt(row: SoilRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return row.soiling_period_opened_at ? new Date(row.soiling_period_opened_at) : null;
  const iso = row[col] as string | null;
  return iso
    ? new Date(iso)
    : (row.soiling_period_opened_at ? new Date(row.soiling_period_opened_at) : null);
}

function daysInCourt(row: SoilRow, now: Date): number {
  const entered = statusEnteredAt(row);
  if (!entered) return 0;
  const ms = now.getTime() - entered.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function decorate(row: SoilRow, now: Date) {
  const tier = row.current_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  // LIVE battery — composes raw inputs into derived metrics on every fetch.
  const prLoss = prLossPct(row.expected_pr_clean_pct, row.current_pr_dirty_pct);
  const mwhLoss = mwhLossPerDay(row.installed_capacity_mw, prLoss, row.peak_sun_hours_per_day);
  const zarPerDay = zarLossPerDay(mwhLoss, row.tariff_zar_per_mwh);
  const periodOpenedAt = row.soiling_period_opened_at ? new Date(row.soiling_period_opened_at) : null;
  const zarToDate = zarLossToDate(zarPerDay, periodOpenedAt, now);
  const roi = cleaningRoiRatio(zarPerDay, row.recovery_horizon_days, row.cleaning_cost_zar);
  const breakeven = daysToBreakeven(row.cleaning_cost_zar, zarPerDay);
  const velocity = soilingVelocityPctPerDay(row.soiling_ratio_pct, row.baseline_ratio_pct, row.days_since_baseline);
  const nextClean = predictedNextCleanDate(row.soiling_ratio_pct, velocity, now);
  const recovered = recoveredZar(
    row.post_clean_pr_pct,
    row.current_pr_dirty_pct,
    row.installed_capacity_mw,
    row.peak_sun_hours_per_day,
    row.recovery_horizon_days,
    row.tariff_zar_per_mwh,
  );

  const floorFlag = floorAtMaterial({
    rainy_season_window_strict: row.rainy_season_window_strict,
    post_dust_storm_event: row.post_dust_storm_event,
    neighbour_complaint_filed: row.neighbour_complaint_filed,
    water_restriction_active: row.water_restriction_active,
  });

  const completeness = soilingComplianceIndex({
    inspection_recent: !!row.field_inspected_at,
    measurement_recent: !!row.soiling_measured_at,
    economics_documented: !!row.economic_assessment_done_at,
    water_restriction_checked: !!row.water_restriction_active || !!row.wul_licence_ref,
    neighbour_notice_logged: !!row.neighbour_complaint_filed || !!row.disputed_reason,
    evidence_photo_uploaded: !!row.evidence_photo_uploaded,
    post_clean_measured: !!row.post_clean_measured_at,
    gain_validated: !!row.gain_validated_at,
    recovery_documented: !!row.recovery_documented,
  });

  const enteredAt = statusEnteredAt(row);
  const remaining = slaDaysRemaining(status, tier, enteredAt, now);
  const urgency = urgencyBand(tier, breakeven, remaining);
  const authority = authorityRequired(tier);
  const dic = daysInCourt(row, now);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    floor_at_material_flag: floorFlag,
    pr_loss_pct_live: prLoss,
    mwh_loss_per_day_live: mwhLoss,
    zar_loss_per_day_live: zarPerDay,
    zar_loss_to_date_live: zarToDate,
    cleaning_roi_ratio_live: roi,
    days_to_breakeven_live: breakeven,
    soiling_velocity_pct_per_day_live: velocity,
    predicted_next_clean_date_live: nextClean,
    recovered_zar_live: recovered,
    soiling_compliance_index_live: completeness,
    sla_days_remaining_live: remaining,
    urgency_band_live: urgency,
    authority_required_live: authority,
    days_in_court_live: dic,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier        = c.req.query('tier');
  const status      = c.req.query('status');
  const facility_id = c.req.query('facility_id');
  const owner_id    = c.req.query('owner_id');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_soiling_audit WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)        { sql += ' AND current_tier = ?';            binds.push(tier); }
  if (status)      { sql += ' AND chain_status = ?';            binds.push(status); }
  if (facility_id) { sql += ' AND facility_id = ?';             binds.push(facility_id); }
  if (owner_id)    { sql += ' AND plant_owner_party_id = ?';    binds.push(owner_id); }

  sql += ' ORDER BY datetime(soiling_period_opened_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<SoilRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_facility: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status] = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.current_tier] = (by_tier[i.current_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_facility[i.facility_id] = (by_facility[i.facility_id] || 0) + 1;
  }

  const open_count          = items.filter((i) => !i.is_terminal).length;
  const settled_count       = items.filter((i) => i.chain_status === 'settled').length;
  const cleaning_live_count = items.filter((i) => i.chain_status === 'cleaning_in_progress').length;
  const authorised_count    = items.filter((i) => i.chain_status === 'cleaning_authorized').length;
  const measured_count      = items.filter((i) => i.chain_status === 'soiling_measured').length;
  const disputed_count      = items.filter((i) => i.chain_status === 'disputed').length;
  const cancelled_count     = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count      = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total    = items.filter((i) => i.is_reportable_flag).length;

  const total_mwh_loss_per_day   = Math.round(items.reduce((s, i) => s + (i.mwh_loss_per_day_live || 0), 0) * 100) / 100;
  const total_zar_loss_per_day   = items.reduce((s, i) => s + (i.zar_loss_per_day_live || 0), 0);
  const total_zar_loss_to_date   = items.reduce((s, i) => s + (i.zar_loss_to_date_live || 0), 0);
  const total_recovered_zar      = items.reduce((s, i) => s + (i.recovered_zar_live || 0), 0);
  const avg_soiling_ratio_pct    = items.length
    ? Math.round((items.reduce((s, i) => s + (i.soiling_ratio_pct || 0), 0) / items.length) * 100) / 100
    : 0;
  const avg_compliance_index     = items.length
    ? Math.round((items.reduce((s, i) => s + (i.soiling_compliance_index_live || 0), 0) / items.length) * 10) / 10
    : 0;

  const critical_urgency_count  = items.filter((i) => i.urgency_band_live === 'critical').length;
  const severe_tier_count       = items.filter((i) => i.current_tier === 'severe').length;
  const material_tier_count     = items.filter((i) => i.current_tier === 'material').length;
  const floor_at_material_count = items.filter((i) => i.floor_at_material_flag).length;
  const water_restricted_count  = items.filter((i) => !!i.water_restriction_active).length;
  const post_dust_storm_count   = items.filter((i) => !!i.post_dust_storm_event).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_facility,
      open_count,
      settled_count,
      cleaning_live_count,
      authorised_count,
      measured_count,
      disputed_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      total_mwh_loss_per_day,
      total_zar_loss_per_day,
      total_zar_loss_to_date,
      total_recovered_zar,
      avg_soiling_ratio_pct,
      avg_compliance_index,
      critical_urgency_count,
      severe_tier_count,
      material_tier_count,
      floor_at_material_count,
      water_restricted_count,
      post_dust_storm_count,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_soiling_audit WHERE id = ?').bind(id).first<SoilRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_soiling_audit_events WHERE audit_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<SoilEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
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
interface ScheduleInspectionBody extends CommonBody {
  inspection_method?: string;
}
interface RecordInspectionBody extends CommonBody {
  evidence_photo_uploaded?: boolean | number;
  inspection_method?: string;
}
interface MeasureSoilingBody extends CommonBody {
  soiling_ratio_pct?: number;
  baseline_ratio_pct?: number;
  days_since_baseline?: number;
  expected_pr_clean_pct?: number;
  current_pr_dirty_pct?: number;
  peak_sun_hours_per_day?: number;
  rainy_season_window_strict?: boolean | number;
  post_dust_storm_event?: boolean | number;
  neighbour_complaint_filed?: boolean | number;
  water_restriction_active?: boolean | number;
}
interface AssessEconomicsBody extends CommonBody {
  cleaning_method?: string;
  cleaning_cost_zar?: number;
  water_consumption_m3?: number;
  recovery_horizon_days?: number;
  tariff_zar_per_mwh?: number;
}
interface AuthorizeCleaningBody extends CommonBody {
  cleaning_contractor_id?: string;
  cleaning_contractor_name?: string;
  wul_licence_ref?: string;
}
interface StartCleaningBody extends CommonBody {}
interface CompleteCleaningBody extends CommonBody {
  water_consumption_m3?: number;
}
interface MeasurePostCleanBody extends CommonBody {
  post_clean_pr_pct?: number;
}
interface ValidateGainBody extends CommonBody {
  recovery_documented?: boolean | number;
}
interface SettleAuditBody extends CommonBody {}
interface RaiseDisputeBody extends CommonBody {
  disputed_reason?: string;
}
interface ResolveDisputeBody extends CommonBody {}
interface CancelAuditBody extends CommonBody {
  cancelled_reason?: string;
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<SoilRow>): Partial<SoilRow> {
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

async function transition(
  c: Context<HonoEnv>,
  action: SoilAction,
  bodyHandler?: (row: SoilRow, body: Record<string, unknown>) => Partial<SoilRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_soiling_audit WHERE id = ?').bind(id).first<SoilRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier from freshest soiling_ratio_pct + 4 floor flags.
  const ratio = (overrides.soiling_ratio_pct as number | undefined) ?? row.soiling_ratio_pct;
  const rawTier = tierForSoilingRatio(ratio);
  const floorFlags = {
    rainy_season_window_strict: (overrides.rainy_season_window_strict as number | undefined) ?? row.rainy_season_window_strict,
    post_dust_storm_event:      (overrides.post_dust_storm_event as number | undefined)      ?? row.post_dust_storm_event,
    neighbour_complaint_filed:  (overrides.neighbour_complaint_filed as number | undefined)  ?? row.neighbour_complaint_filed,
    water_restriction_active:   (overrides.water_restriction_active as number | undefined)   ?? row.water_restriction_active,
  };
  const floor = floorAtMaterial(floorFlags);
  const tier = effectiveTier(rawTier, floor);
  overrides.current_tier = tier;
  overrides.authority_required = authorityRequired(tier);

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const capMw = (overrides.installed_capacity_mw as number | undefined) ?? row.installed_capacity_mw;
  const waterM3 = (overrides.water_consumption_m3 as number | undefined) ?? row.water_consumption_m3;
  const crosses = crossesIntoRegulator(action, tier, capMw, waterM3);
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;
  if (crosses) overrides.regulator_crossed_at = nowIso;

  if (action === 'raise_dispute') overrides.dispute_count = (row.dispute_count || 0) + 1;
  if (action === 'cancel_audit')  overrides.cancel_count  = (row.cancel_count  || 0) + 1;

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
    `UPDATE oe_soiling_audit SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const eventName = eventTypeFor(action);
  const evtId = `soiling_audit_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_soiling_audit_events (id, audit_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      entity_type: 'soiling_audit',
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

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_soiling_audit WHERE id = ?').bind(id).first<SoilRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

app.post('/:id/schedule-inspection', async (c) => transition(c, 'schedule_inspection', (_row, body) => {
  const b = body as Partial<ScheduleInspectionBody>;
  const out: Partial<SoilRow> = {};
  if (typeof b.inspection_method === 'string') out.inspection_method = b.inspection_method;
  return applyCommon(b, out);
}));

app.post('/:id/record-inspection', async (c) => transition(c, 'record_inspection', (_row, body) => {
  const b = body as Partial<RecordInspectionBody>;
  const out: Partial<SoilRow> = {};
  const ep = toFlag(b.evidence_photo_uploaded);
  if (ep !== undefined) out.evidence_photo_uploaded = ep;
  if (typeof b.inspection_method === 'string') out.inspection_method = b.inspection_method;
  return applyCommon(b, out);
}));

app.post('/:id/measure-soiling', async (c) => transition(c, 'measure_soiling', (_row, body) => {
  const b = body as Partial<MeasureSoilingBody>;
  const out: Partial<SoilRow> = {};
  if (typeof b.soiling_ratio_pct === 'number')      out.soiling_ratio_pct = b.soiling_ratio_pct;
  if (typeof b.baseline_ratio_pct === 'number')     out.baseline_ratio_pct = b.baseline_ratio_pct;
  if (typeof b.days_since_baseline === 'number')    out.days_since_baseline = b.days_since_baseline;
  if (typeof b.expected_pr_clean_pct === 'number')  out.expected_pr_clean_pct = b.expected_pr_clean_pct;
  if (typeof b.current_pr_dirty_pct === 'number')   out.current_pr_dirty_pct = b.current_pr_dirty_pct;
  if (typeof b.peak_sun_hours_per_day === 'number') out.peak_sun_hours_per_day = b.peak_sun_hours_per_day;
  const r = toFlag(b.rainy_season_window_strict); if (r !== undefined) out.rainy_season_window_strict = r;
  const d = toFlag(b.post_dust_storm_event);     if (d !== undefined) out.post_dust_storm_event = d;
  const n = toFlag(b.neighbour_complaint_filed); if (n !== undefined) out.neighbour_complaint_filed = n;
  const w = toFlag(b.water_restriction_active);  if (w !== undefined) out.water_restriction_active = w;
  return applyCommon(b, out);
}));

app.post('/:id/assess-economics', async (c) => transition(c, 'assess_economics', (_row, body) => {
  const b = body as Partial<AssessEconomicsBody>;
  const out: Partial<SoilRow> = {};
  if (typeof b.cleaning_method === 'string')       out.cleaning_method = b.cleaning_method;
  if (typeof b.cleaning_cost_zar === 'number')     out.cleaning_cost_zar = b.cleaning_cost_zar;
  if (typeof b.water_consumption_m3 === 'number')  out.water_consumption_m3 = b.water_consumption_m3;
  if (typeof b.recovery_horizon_days === 'number') out.recovery_horizon_days = b.recovery_horizon_days;
  if (typeof b.tariff_zar_per_mwh === 'number')    out.tariff_zar_per_mwh = b.tariff_zar_per_mwh;
  return applyCommon(b, out);
}));

app.post('/:id/authorize-cleaning', async (c) => transition(c, 'authorize_cleaning', (_row, body) => {
  const b = body as Partial<AuthorizeCleaningBody>;
  const out: Partial<SoilRow> = {};
  if (typeof b.cleaning_contractor_id === 'string')   out.cleaning_contractor_id = b.cleaning_contractor_id;
  if (typeof b.cleaning_contractor_name === 'string') out.cleaning_contractor_name = b.cleaning_contractor_name;
  if (typeof b.wul_licence_ref === 'string')          out.wul_licence_ref = b.wul_licence_ref;
  return applyCommon(b, out);
}));

app.post('/:id/start-cleaning', async (c) => transition(c, 'start_cleaning', (_row, body) =>
  applyCommon(body as Partial<StartCleaningBody>, {}),
));

app.post('/:id/complete-cleaning', async (c) => transition(c, 'complete_cleaning', (_row, body) => {
  const b = body as Partial<CompleteCleaningBody>;
  const out: Partial<SoilRow> = {};
  if (typeof b.water_consumption_m3 === 'number') out.water_consumption_m3 = b.water_consumption_m3;
  return applyCommon(b, out);
}));

app.post('/:id/measure-post-clean', async (c) => transition(c, 'measure_post_clean', (_row, body) => {
  const b = body as Partial<MeasurePostCleanBody>;
  const out: Partial<SoilRow> = {};
  if (typeof b.post_clean_pr_pct === 'number') out.post_clean_pr_pct = b.post_clean_pr_pct;
  return applyCommon(b, out);
}));

app.post('/:id/validate-gain', async (c) => transition(c, 'validate_gain', (_row, body) => {
  const b = body as Partial<ValidateGainBody>;
  const out: Partial<SoilRow> = {};
  const rd = toFlag(b.recovery_documented); if (rd !== undefined) out.recovery_documented = rd;
  return applyCommon(b, out);
}));

app.post('/:id/settle-audit', async (c) => transition(c, 'settle_audit', (_row, body) =>
  applyCommon(body as Partial<SettleAuditBody>, {}),
));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) => {
  const b = body as Partial<RaiseDisputeBody>;
  const out: Partial<SoilRow> = {};
  if (typeof b.disputed_reason === 'string') out.disputed_reason = b.disputed_reason;
  return applyCommon(b, out);
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) =>
  applyCommon(body as Partial<ResolveDisputeBody>, {}),
));

app.post('/:id/cancel-audit', async (c) => transition(c, 'cancel_audit', (_row, body) => {
  const b = body as Partial<CancelAuditBody>;
  const out: Partial<SoilRow> = {};
  if (typeof b.cancelled_reason === 'string') out.cancelled_reason = b.cancelled_reason;
  return applyCommon(b, out);
}));

export async function soilingAuditSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_soiling_audit
     WHERE chain_status NOT IN ('settled','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<SoilRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_soiling_audit
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `soiling_audit_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_soiling_audit_events (id, audit_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'soiling_audit.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'regulator_observer',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.current_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.current_tier)) {
      await fireCascade({
        event: 'soiling_audit.sla_breached',
        actor_id: 'system',
        entity_type: 'soiling_audit',
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
