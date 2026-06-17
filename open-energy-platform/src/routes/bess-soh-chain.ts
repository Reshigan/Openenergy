// ═══════════════════════════════════════════════════════════════════════════
// Wave 88 — Esums BESS State-of-Health Monitoring & Capacity-Augmentation
//           Programme (P6).
// 10th Esums chain.
//
// Mounted at /api/bess-soh/chain.
//
// Every grid-connected BESS carries a contractual capacity guarantee
// (state-of-health floor). Calendar + cycle ageing erode SOH. When SOH drops
// below the contracted floor the operator owes an AUGMENTATION (install fresh
// modules to top up) or a financial make-good. W88 is the live 12-state P6
// chain for that lifecycle: baseline_set → monitoring_active → drift_detected
// → assessment_pending → augmentation_required → augmentation_planned →
// augmentation_in_progress → augmentation_complete → recommissioned, with a
// disputed branch (counterparty challenges SOH methodology) and a
// decommissioned terminal (irreversible end-of-life).
//
// DISTINCTIVE move (beats Powin Stack OS / Tesla Megapack OS / Fluence Battery
// Management Suite / AES Advancion / Wärtsilä GEMS / Honeywell Experion BESS —
// all surface SOH as a single dashboard number): LIVE health + augmentation
// economics battery on every record — soh headroom pct, annualised fade rate,
// equivalent full cycles, cycle-vs-calendar attribution, capacity shortfall
// MWh, augmentation CapEx ZAR, capacity-payment-at-risk ZAR, augmentation NPV
// ZAR, warranty-recovery eligibility, predicted decommission years, SLA days
// remaining, urgency band. Tier RE-DERIVED on every transition from
// current_soh_pct vs contractual_floor_pct so a clean programme can
// deteriorate from nominal to critical as cycles accrue, and an augmentation
// can recover a critical programme back to nominal.
//
// Write model — SINGLE Esums desk {admin, support}. READ all nine personas.
// actor_party (operator / oem / owner / regulator) tags the functional owner
// per step, not the JWT role.
//
// Reportability (SECURITY-OF-SUPPLY SIGNATURE — the W88 hard line):
//   require_augmentation → regulator EVERY tier when installed_capacity_mw
//                          >= 50 MW (NERSA Grid Code threshold); heavy tiers
//                          (material + critical) otherwise.
//   decommission         → regulator EVERY tier (loss of grid capacity is
//                          ALWAYS reportable, irrespective of size).
//   raise_dispute        → heavy tiers (material + critical) only.
//   sla_breached         → heavy tiers (material + critical).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierForSoh,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  sohHeadroomPct,
  annualisedFadeRatePct,
  equivalentFullCycles,
  cycleFadeAttributionPct,
  capacityShortfallMwh,
  augmentationCapexZar,
  capacityPaymentAtRiskZar,
  augmentationNpvZar,
  warrantyRecoveryEligible,
  predictedDecommissionYears,
  slaDaysRemaining,
  urgencyBand,
  SLA_MINUTES,
  type BsohStatus,
  type BsohAction,
  type BsohTier,
} from '../utils/bess-soh-spec';

const READ_ROLES = new Set([
  'admin', 'support',
  'ipp_developer', 'offtaker', 'trader', 'regulator', 'lender', 'grid_operator', 'carbon_fund', 'esco',
]);

// esco is the live Esums/O&M operator persona (seed 494); 'support' was the
// pre-persona placeholder. Both write so the laned esco Horizon is functional.
const WRITE_ROLES = new Set(['admin', 'support', 'esco']);

interface BsohRow {
  id: string;
  programme_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  bess_id: string;
  bess_reference: string;
  site_id: string;
  site_name: string;
  owner_id: string;
  owner_name: string;
  operator_id: string;
  operator_name: string;
  oem_id: string | null;
  oem_name: string | null;
  installed_capacity_mw: number;
  nameplate_energy_mwh: number;
  duration_hours: number;
  chemistry: string | null;
  commissioning_date: string;
  years_in_service: number;
  baseline_soh_pct: number;
  current_soh_pct: number;
  contractual_floor_pct: number;
  end_of_life_threshold_pct: number;
  warranty_end_date: string | null;
  warranty_years_remaining: number;
  total_throughput_mwh: number;
  equivalent_full_cycles: number;
  avg_depth_of_discharge_pct: number;
  avg_c_rate: number;
  avg_cell_temperature_c: number;
  cycle_fade_attribution_pct: number;
  annualised_fade_rate_pct: number;
  capacity_shortfall_mwh: number;
  augmentation_capex_per_kwh: number;
  augmentation_capex_zar: number;
  capacity_rate_per_mw_year: number;
  capacity_payment_at_risk_zar: number;
  discount_rate_pct: number;
  residual_warranty_years: number;
  augmentation_npv_zar: number;
  augmentation_works_ref: string | null;
  augmentation_completed_mwh: number | null;
  dispute_ground: string | null;
  dispute_resolution_ref: string | null;
  warranty_recovery_eligible: number;
  warranty_recovery_amount_zar: number | null;
  soh_tier: BsohTier;
  monitoring_active_flag: number;
  drift_detected_flag: number;
  assessment_flag: number;
  augmentation_required_flag: number;
  augmentation_planned_flag: number;
  works_started_flag: number;
  works_completed_flag: number;
  recommissioned_flag: number;
  dispute_flag: number;
  decommissioned_flag: number;
  cancelled_flag: number;
  last_action_ref: string | null;
  regulator_ref: string | null;
  programme_basis: string | null;
  reason_code: string | null;
  programme_summary: string | null;
  chain_status: BsohStatus;
  baseline_set_at: string;
  monitoring_active_at: string | null;
  drift_detected_at: string | null;
  assessment_pending_at: string | null;
  augmentation_required_at: string | null;
  augmentation_planned_at: string | null;
  augmentation_in_progress_at: string | null;
  augmentation_complete_at: string | null;
  recommissioned_at: string | null;
  disputed_at: string | null;
  decommissioned_at: string | null;
  cancelled_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface BsohEventRow {
  id: string;
  programme_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<BsohStatus, keyof BsohRow | null> = {
  baseline_set:             null,
  monitoring_active:        'monitoring_active_at',
  drift_detected:           'drift_detected_at',
  assessment_pending:       'assessment_pending_at',
  augmentation_required:    'augmentation_required_at',
  augmentation_planned:     'augmentation_planned_at',
  augmentation_in_progress: 'augmentation_in_progress_at',
  augmentation_complete:    'augmentation_complete_at',
  recommissioned:           'recommissioned_at',
  disputed:                 'disputed_at',
  decommissioned:           'decommissioned_at',
  cancelled:                'cancelled_at',
};

function eventTypeFor(action: BsohAction): string {
  switch (action) {
    case 'activate_monitoring':   return 'bess_soh.monitoring_activated';
    case 'detect_drift':          return 'bess_soh.drift_detected';
    case 'assess_cause':          return 'bess_soh.assessment_pending';
    case 'require_augmentation':  return 'bess_soh.augmentation_required';
    case 'plan_augmentation':     return 'bess_soh.augmentation_planned';
    case 'start_works':           return 'bess_soh.works_started';
    case 'complete_works':        return 'bess_soh.works_completed';
    case 'recommission':          return 'bess_soh.recommissioned';
    case 'raise_dispute':         return 'bess_soh.dispute_raised';
    case 'resolve_dispute':       return 'bess_soh.dispute_resolved';
    case 'decommission':          return 'bess_soh.decommissioned';
    case 'cancel_programme':      return 'bess_soh.cancelled';
  }
}

function statusEnteredAt(row: BsohRow): Date | null {
  const col = TIMESTAMP_COLUMN[row.chain_status];
  if (!col) return new Date(row.baseline_set_at);
  const iso = row[col] as string | null;
  return iso ? new Date(iso) : null;
}

function decorate(row: BsohRow, now: Date) {
  const tier = row.soh_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const headroom = sohHeadroomPct(row.current_soh_pct, row.contractual_floor_pct);
  const fadeRate = annualisedFadeRatePct(row.current_soh_pct, row.baseline_soh_pct, row.years_in_service);
  const efc = equivalentFullCycles(row.total_throughput_mwh, row.nameplate_energy_mwh);
  const cycleAttribution = cycleFadeAttributionPct(efc, row.years_in_service);
  const shortfall = capacityShortfallMwh(row.current_soh_pct, row.contractual_floor_pct, row.nameplate_energy_mwh);
  const capex = augmentationCapexZar(shortfall, row.augmentation_capex_per_kwh);
  const capacityAtRisk = capacityPaymentAtRiskZar(shortfall, row.capacity_rate_per_mw_year);
  const npv = augmentationNpvZar(capacityAtRisk, capex, row.residual_warranty_years, row.discount_rate_pct);
  const warrantyRecovery = warrantyRecoveryEligible(
    row.current_soh_pct,
    row.contractual_floor_pct,
    row.warranty_years_remaining,
    cycleAttribution,
  );
  const predictedEol = predictedDecommissionYears(row.current_soh_pct, fadeRate, row.end_of_life_threshold_pct);
  const enteredAt = statusEnteredAt(row);
  const daysRemaining = slaDaysRemaining(status, tier, enteredAt, now);
  const urgency = urgencyBand(headroom, daysRemaining);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    is_reportable_flag: !!row.is_reportable,
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(tier),
    soh_headroom_pct_live: headroom,
    annualised_fade_rate_pct_live: fadeRate,
    equivalent_full_cycles_live: efc,
    cycle_fade_attribution_pct_live: cycleAttribution,
    capacity_shortfall_mwh_live: shortfall,
    augmentation_capex_zar_live: capex,
    capacity_payment_at_risk_zar_live: capacityAtRisk,
    augmentation_npv_zar_live: npv,
    warranty_recovery_eligible_live: warrantyRecovery,
    predicted_decommission_years_live: predictedEol,
    sla_days_remaining_live: daysRemaining,
    urgency_band_live: urgency,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const soh_tier    = c.req.query('soh_tier');
  const status      = c.req.query('status');
  const bess_id     = c.req.query('bess_id');
  const site_id     = c.req.query('site_id');
  const owner_id    = c.req.query('owner_id');
  const operator_id = c.req.query('operator_id');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_bess_soh WHERE 1=1';
  const binds: unknown[] = [];
  if (soh_tier)    { sql += ' AND soh_tier = ?';    binds.push(soh_tier); }
  if (status)      { sql += ' AND chain_status = ?'; binds.push(status); }
  if (bess_id)     { sql += ' AND bess_id = ?';     binds.push(bess_id); }
  if (site_id)     { sql += ' AND site_id = ?';     binds.push(site_id); }
  if (owner_id)    { sql += ' AND owner_id = ?';    binds.push(owner_id); }
  if (operator_id) { sql += ' AND operator_id = ?'; binds.push(operator_id); }

  sql += ' ORDER BY datetime(baseline_set_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<BsohRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_site: Record<string, number> = {};
  for (const i of items) {
    by_status[i.chain_status]      = (by_status[i.chain_status] || 0) + 1;
    by_tier[i.soh_tier]            = (by_tier[i.soh_tier] || 0) + 1;
    by_urgency[i.urgency_band_live] = (by_urgency[i.urgency_band_live] || 0) + 1;
    by_site[i.site_id]             = (by_site[i.site_id] || 0) + 1;
  }

  const open_count                  = items.filter((i) => !i.is_terminal).length;
  const monitoring_count            = items.filter((i) => i.chain_status === 'monitoring_active').length;
  const drift_count                 = items.filter((i) => i.chain_status === 'drift_detected').length;
  const assessment_count            = items.filter((i) => i.chain_status === 'assessment_pending').length;
  const augmentation_required_count = items.filter((i) => i.chain_status === 'augmentation_required').length;
  const augmentation_planned_count  = items.filter((i) => i.chain_status === 'augmentation_planned').length;
  const augmentation_in_progress_count = items.filter((i) => i.chain_status === 'augmentation_in_progress').length;
  const augmentation_complete_count = items.filter((i) => i.chain_status === 'augmentation_complete').length;
  const recommissioned_count        = items.filter((i) => i.chain_status === 'recommissioned').length;
  const disputed_count              = items.filter((i) => i.chain_status === 'disputed').length;
  const decommissioned_count        = items.filter((i) => i.chain_status === 'decommissioned').length;
  const cancelled_count             = items.filter((i) => i.chain_status === 'cancelled').length;
  const breached_count              = items.filter((i) => i.sla_breached && !i.is_terminal).length;
  const reportable_total            = items.filter((i) => i.is_reportable_flag).length;
  const total_installed_capacity_mw = items.reduce((s, i) => s + (i.installed_capacity_mw || 0), 0);
  const total_nameplate_energy_mwh  = items.reduce((s, i) => s + (i.nameplate_energy_mwh || 0), 0);
  const total_capacity_shortfall_mwh = items.reduce((s, i) => s + (i.capacity_shortfall_mwh_live || 0), 0);
  const total_augmentation_capex_zar = items.reduce((s, i) => s + (i.augmentation_capex_zar_live || 0), 0);
  const total_capacity_at_risk_zar  = items.reduce((s, i) => s + (i.capacity_payment_at_risk_zar_live || 0), 0);
  const total_augmentation_npv_zar  = items.reduce((s, i) => s + (i.augmentation_npv_zar_live || 0), 0);
  const warranty_eligible_count     = items.filter((i) => i.warranty_recovery_eligible_live).length;
  const critical_urgency_count      = items.filter((i) => i.urgency_band_live === 'critical').length;
  const critical_tier_count         = items.filter((i) => i.soh_tier === 'critical').length;
  const material_tier_count         = items.filter((i) => i.soh_tier === 'material').length;
  const ge_50mw_count               = items.filter((i) => (i.installed_capacity_mw || 0) >= 50).length;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_urgency,
      by_site,
      open_count,
      monitoring_count,
      drift_count,
      assessment_count,
      augmentation_required_count,
      augmentation_planned_count,
      augmentation_in_progress_count,
      augmentation_complete_count,
      recommissioned_count,
      disputed_count,
      decommissioned_count,
      cancelled_count,
      breached: breached_count,
      reportable_total,
      total_installed_capacity_mw,
      total_nameplate_energy_mwh,
      total_capacity_shortfall_mwh,
      total_augmentation_capex_zar,
      total_capacity_at_risk_zar,
      total_augmentation_npv_zar,
      warranty_eligible_count,
      critical_urgency_count,
      critical_tier_count,
      material_tier_count,
      ge_50mw_count,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_bess_soh WHERE id = ?').bind(id).first<BsohRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_bess_soh_events WHERE programme_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<BsohEventRow>();

  return c.json({
    success: true,
    data: {
      case: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface CommonBody { programme_basis?: string; last_action_ref?: string; reason_code?: string; regulator_ref?: string; notes?: string; programme_summary?: string; }
interface ActivateMonitoringBody extends CommonBody { current_soh_pct?: number; total_throughput_mwh?: number; }
interface DetectDriftBody extends CommonBody { current_soh_pct?: number; total_throughput_mwh?: number; }
interface AssessCauseBody extends CommonBody { current_soh_pct?: number; cycle_fade_attribution_pct?: number; }
interface RequireAugmentationBody extends CommonBody { current_soh_pct?: number; augmentation_capex_per_kwh?: number; capacity_rate_per_mw_year?: number; residual_warranty_years?: number; discount_rate_pct?: number; }
interface PlanAugmentationBody extends CommonBody { augmentation_works_ref?: string; augmentation_capex_per_kwh?: number; }
interface StartWorksBody extends CommonBody { augmentation_works_ref?: string; }
interface CompleteWorksBody extends CommonBody { augmentation_completed_mwh?: number; current_soh_pct?: number; }
interface RecommissionBody extends CommonBody { current_soh_pct?: number; }
interface RaiseDisputeBody extends CommonBody { dispute_ground?: string; }
interface ResolveDisputeBody extends CommonBody { dispute_resolution_ref?: string; current_soh_pct?: number; }
interface DecommissionBody extends CommonBody { current_soh_pct?: number; }
interface CancelProgrammeBody extends CommonBody {}

async function transition(
  c: Context<HonoEnv>,
  action: BsohAction,
  bodyHandler?: (row: BsohRow, body: Record<string, unknown>) => Partial<BsohRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_bess_soh WHERE id = ?').bind(id).first<BsohRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive SOH analytics from the freshest scalars.
  const soh        = (overrides.current_soh_pct as number | undefined) ?? row.current_soh_pct;
  const floor      = (overrides.contractual_floor_pct as number | undefined) ?? row.contractual_floor_pct;
  const baseline   = (overrides.baseline_soh_pct as number | undefined) ?? row.baseline_soh_pct;
  const years      = (overrides.years_in_service as number | undefined) ?? row.years_in_service;
  const throughput = (overrides.total_throughput_mwh as number | undefined) ?? row.total_throughput_mwh;
  const nameplate  = (overrides.nameplate_energy_mwh as number | undefined) ?? row.nameplate_energy_mwh;
  const capacityMw = (overrides.installed_capacity_mw as number | undefined) ?? row.installed_capacity_mw;
  const capexPerKwh = (overrides.augmentation_capex_per_kwh as number | undefined) ?? row.augmentation_capex_per_kwh;
  const rateMwYr   = (overrides.capacity_rate_per_mw_year as number | undefined) ?? row.capacity_rate_per_mw_year;
  const warrYrs    = (overrides.residual_warranty_years as number | undefined) ?? row.residual_warranty_years;
  const discount   = (overrides.discount_rate_pct as number | undefined) ?? row.discount_rate_pct;
  const warrLeft   = (overrides.warranty_years_remaining as number | undefined) ?? row.warranty_years_remaining;
  const eolThresh  = (overrides.end_of_life_threshold_pct as number | undefined) ?? row.end_of_life_threshold_pct;

  const fadeRate = annualisedFadeRatePct(soh, baseline, years);
  const efc = equivalentFullCycles(throughput, nameplate);
  const cycleAttribution = (overrides.cycle_fade_attribution_pct as number | undefined)
    ?? cycleFadeAttributionPct(efc, years);
  const shortfall = capacityShortfallMwh(soh, floor, nameplate);
  const capex = augmentationCapexZar(shortfall, capexPerKwh);
  const capacityAtRisk = capacityPaymentAtRiskZar(shortfall, rateMwYr);
  const npv = augmentationNpvZar(capacityAtRisk, capex, warrYrs, discount);
  const warrEligible = warrantyRecoveryEligible(soh, floor, warrLeft, cycleAttribution);
  // predicted EOL years (unused on the row but referenced for parity with decorate)
  predictedDecommissionYears(soh, fadeRate, eolThresh);

  overrides.annualised_fade_rate_pct = fadeRate;
  overrides.equivalent_full_cycles = efc;
  overrides.cycle_fade_attribution_pct = cycleAttribution;
  overrides.capacity_shortfall_mwh = shortfall;
  overrides.augmentation_capex_zar = capex;
  overrides.capacity_payment_at_risk_zar = capacityAtRisk;
  overrides.augmentation_npv_zar = npv;
  overrides.warranty_recovery_eligible = warrEligible ? 1 : 0;

  // Tier RE-DERIVED on every transition from current SOH vs contractual floor.
  const tier = tierForSoh(soh, floor);
  overrides.soh_tier = tier;

  const now = new Date();
  const tsCol = TIMESTAMP_COLUMN[to];
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, tier, capacityMw);
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  // Gate flags.
  if (to === 'monitoring_active')        overrides.monitoring_active_flag = 1;
  if (to === 'drift_detected')           overrides.drift_detected_flag = 1;
  if (to === 'assessment_pending')       overrides.assessment_flag = 1;
  if (to === 'augmentation_required')    overrides.augmentation_required_flag = 1;
  if (to === 'augmentation_planned')     overrides.augmentation_planned_flag = 1;
  if (to === 'augmentation_in_progress') overrides.works_started_flag = 1;
  if (to === 'augmentation_complete')    overrides.works_completed_flag = 1;
  if (to === 'recommissioned')           overrides.recommissioned_flag = 1;
  if (to === 'disputed')                 overrides.dispute_flag = 1;
  if (to === 'decommissioned')           overrides.decommissioned_flag = 1;
  if (to === 'cancelled')                overrides.cancelled_flag = 1;
  if (action === 'raise_dispute')        overrides.escalation_level = (row.escalation_level || 0) + 1;

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
    `UPDATE oe_bess_soh SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `bsoh_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_bess_soh_events (id, programme_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    entity_type: 'bess_soh',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      soh_tier: tier,
      chain_status: to,
      from_status: row.chain_status,
      action,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_bess_soh WHERE id = ?').bind(id).first<BsohRow>();
  return c.json({ success: true, data: { case: refreshed ? decorate(refreshed, now) : null } });
}

function applyCommon<B extends CommonBody>(b: Partial<B>, out: Partial<BsohRow>): Partial<BsohRow> {
  if (typeof b.programme_basis === 'string')    out.programme_basis = b.programme_basis;
  if (typeof b.last_action_ref === 'string')    out.last_action_ref = b.last_action_ref;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  if (typeof b.regulator_ref === 'string')      out.regulator_ref = b.regulator_ref;
  if (typeof b.programme_summary === 'string')  out.programme_summary = b.programme_summary;
  return out;
}

app.post('/:id/activate-monitoring', async (c) => transition(c, 'activate_monitoring', (_row, body) => {
  const b = body as Partial<ActivateMonitoringBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.current_soh_pct === 'number')      out.current_soh_pct = b.current_soh_pct;
  if (typeof b.total_throughput_mwh === 'number') out.total_throughput_mwh = b.total_throughput_mwh;
  return applyCommon(b, out);
}));

app.post('/:id/detect-drift', async (c) => transition(c, 'detect_drift', (_row, body) => {
  const b = body as Partial<DetectDriftBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.current_soh_pct === 'number')      out.current_soh_pct = b.current_soh_pct;
  if (typeof b.total_throughput_mwh === 'number') out.total_throughput_mwh = b.total_throughput_mwh;
  return applyCommon(b, out);
}));

app.post('/:id/assess-cause', async (c) => transition(c, 'assess_cause', (_row, body) => {
  const b = body as Partial<AssessCauseBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.current_soh_pct === 'number')             out.current_soh_pct = b.current_soh_pct;
  if (typeof b.cycle_fade_attribution_pct === 'number')  out.cycle_fade_attribution_pct = b.cycle_fade_attribution_pct;
  return applyCommon(b, out);
}));

app.post('/:id/require-augmentation', async (c) => transition(c, 'require_augmentation', (_row, body) => {
  const b = body as Partial<RequireAugmentationBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.current_soh_pct === 'number')             out.current_soh_pct = b.current_soh_pct;
  if (typeof b.augmentation_capex_per_kwh === 'number')  out.augmentation_capex_per_kwh = b.augmentation_capex_per_kwh;
  if (typeof b.capacity_rate_per_mw_year === 'number')   out.capacity_rate_per_mw_year = b.capacity_rate_per_mw_year;
  if (typeof b.residual_warranty_years === 'number')     out.residual_warranty_years = b.residual_warranty_years;
  if (typeof b.discount_rate_pct === 'number')           out.discount_rate_pct = b.discount_rate_pct;
  return applyCommon(b, out);
}));

app.post('/:id/plan-augmentation', async (c) => transition(c, 'plan_augmentation', (_row, body) => {
  const b = body as Partial<PlanAugmentationBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.augmentation_works_ref === 'string')     out.augmentation_works_ref = b.augmentation_works_ref;
  if (typeof b.augmentation_capex_per_kwh === 'number') out.augmentation_capex_per_kwh = b.augmentation_capex_per_kwh;
  return applyCommon(b, out);
}));

app.post('/:id/start-works', async (c) => transition(c, 'start_works', (_row, body) => {
  const b = body as Partial<StartWorksBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.augmentation_works_ref === 'string') out.augmentation_works_ref = b.augmentation_works_ref;
  return applyCommon(b, out);
}));

app.post('/:id/complete-works', async (c) => transition(c, 'complete_works', (_row, body) => {
  const b = body as Partial<CompleteWorksBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.augmentation_completed_mwh === 'number') out.augmentation_completed_mwh = b.augmentation_completed_mwh;
  if (typeof b.current_soh_pct === 'number')            out.current_soh_pct = b.current_soh_pct;
  return applyCommon(b, out);
}));

app.post('/:id/recommission', async (c) => transition(c, 'recommission', (_row, body) => {
  const b = body as Partial<RecommissionBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.current_soh_pct === 'number') out.current_soh_pct = b.current_soh_pct;
  return applyCommon(b, out);
}));

app.post('/:id/raise-dispute', async (c) => transition(c, 'raise_dispute', (_row, body) => {
  const b = body as Partial<RaiseDisputeBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.dispute_ground === 'string') out.dispute_ground = b.dispute_ground;
  return applyCommon(b, out);
}));

app.post('/:id/resolve-dispute', async (c) => transition(c, 'resolve_dispute', (_row, body) => {
  const b = body as Partial<ResolveDisputeBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.dispute_resolution_ref === 'string') out.dispute_resolution_ref = b.dispute_resolution_ref;
  if (typeof b.current_soh_pct === 'number')        out.current_soh_pct = b.current_soh_pct;
  return applyCommon(b, out);
}));

app.post('/:id/decommission', async (c) => transition(c, 'decommission', (_row, body) => {
  const b = body as Partial<DecommissionBody>;
  const out: Partial<BsohRow> = {};
  if (typeof b.current_soh_pct === 'number') out.current_soh_pct = b.current_soh_pct;
  return applyCommon(b, out);
}));

app.post('/:id/cancel-programme', async (c) => transition(c, 'cancel_programme', (_row, body) =>
  applyCommon(body as Partial<CancelProgrammeBody>, {}),
));

export async function bessSohSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_bess_soh
     WHERE chain_status NOT IN ('recommissioned','decommissioned','cancelled')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<BsohRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_bess_soh
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `bsoh_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_bess_soh_events (id, programme_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'bess_soh.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'operator',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.soh_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.soh_tier)) {
      await fireCascade({
        event: 'bess_soh.sla_breached',
        actor_id: 'system',
        entity_type: 'bess_soh',
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
