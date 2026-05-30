// ─────────────────────────────────────────────────────────────────────────
// Wave 102 — Esums Plant Soiling, Cleaning Authorisation & Recovery-Gain
//             Audit (P6)
//
// PV soiling — accumulated dust, pollen, bird droppings, agricultural film —
// is one of the single biggest controllable production losses on a South
// African solar plant. Typical Northern-Cape REIPPPP sites lose 4-12 % of
// monthly yield to soiling between rainfall events. Cleaning recovers that
// yield, but the cleaning programme has to balance water consumption,
// labour cost, panel-glass abrasion risk, and the rainfall forecast. Get
// it wrong and the operator either burns money cleaning panels that nature
// would have washed for free, OR forfeits R-millions of energy revenue
// while soiling sits past the economic threshold.
//
// W102 is the soiling audit + cleaning authorisation chain:
//   • Periodic soiling-ratio measurement (reference cell + dirty/clean pair)
//   • Inspection record (visual + IR + drone fly-over evidence)
//   • Economic assessment (lost MWh × tariff vs cleaning ZAR + water m³)
//   • Cleaning authorisation gate (water restrictions, neighbour notices,
//     environmental authorisation conditions)
//   • Field cleaning execution by contractor
//   • Post-clean PR-delta validation (did we actually recover what we
//     expected?)
//   • Settled audit ledger feeding W79 generation revenue assurance
//   • Counterparty dispute branch on measurement methodology
//
// Distinct from the rest of the Esums book:
//   - [[project_wave12_site_commissioning]]                whole-site onboarding (one-off)
//   - [[project_wave24_pr_chain]]                          aggregate PR underperformance (W102 is one driver)
//   - [[project_wave25_hse_incident_chain]]                safety incident response
//   - [[project_wave35_vendor_escalation_chain]]           consumer/vendor escalation
//   - [[project_wave51_availability_guarantee_chain]]      time-based uptime (not yield)
//   - [[project_wave59_pm_compliance_chain]]               preventive maintenance schedule
//   - [[project_wave64_permit_to_work_chain]]              control-of-work LOTO
//   - [[project_wave71_asset_prognostics_chain]]           predictive RUL / fault fingerprinting
//   - [[project_wave79_generation_revenue_assurance_chain]] meter-vs-settlement reconciliation
//   - [[project_wave88_bess_soh_chain]]                    BESS capacity guarantee
//
// W24 is the AGGREGATE underperformance signal (PR < expected) — W102 is
// the COMPONENT-LEVEL diagnostic that explains one major driver (soiling).
// W59 is the SCHEDULED preventive maintenance — W102 is the EVENT-driven
// cleaning audit triggered by soiling thresholds. W79 is the BACKWARD-
// LOOKING revenue reconciliation — W102 feeds it with recovered-ZAR and
// avoided-loss numbers.
//
// Beats NTT Data IoT Soiling Maps / Power Factors Drive Soiling Module /
// AlsoEnergy Soiling Loss Index / 3E SynaptiQ Soiling / Above Surveying
// drone IR / Heliolytics aerial PV / Atonometrics RSE-1 reference cell /
// DEWA-RTC soiling station / NREL/TP-5K00-71034 Soiling Probability Index /
// DroneDeploy thermography — every one of these surfaces soiling as a
// monitoring dashboard. W102 makes it a 12-state P6 chain with auto-tier,
// urgency-band SLA, water-restriction gate, cleaning-ROI ledger, regulator
// crossings on skipped-cleanings for ≥ 50 MW plants, and an auditor +
// counterparty signoff gate.
//
// Forward path (clean lifecycle):
//   soiling_period_open → inspection_scheduled → field_inspected
//   → soiling_measured → economic_assessment_done → cleaning_authorized
//   → cleaning_in_progress → post_clean_measured → gain_validated → settled
//
// Dispute branch:
//   soiling_measured / economic_assessment_done / gain_validated
//   → raise_dispute → disputed → resolve_dispute → economic_assessment_done
//
// Cancel branch (skip cleaning — wash forecast, frost, water restriction):
//   any non-terminal → cancel_audit → cancelled (terminal)
//
// "settled" is the rest state — periodic audits settle and feed W79; the
// next period opens a new W102 row.
//
// Tiers (4) RE-DERIVED on every transition from current soiling_ratio_pct.
// A period can deteriorate as the dry-season accumulates dust, or recover
// after a heavy rainfall event drops soiling back to nominal. Every cascade
// / regulator / SLA decision keys off whatever ratio the row carries now.
//   minor    : soiling_ratio < 2 %
//   standard : 2 % ≤ soiling_ratio < 4 %
//   material : 4 % ≤ soiling_ratio < 8 %
//   severe   : soiling_ratio ≥ 8 %
//
// FLOOR-AT-MATERIAL — even when the raw ratio sits in minor / standard, the
// effective tier is forced up to at least material when any of these flags
// is set:
//   - rainy_season_window_strict     (cleaning before rain wastes water)
//   - post_dust_storm_event          (signature SA agricultural-dust spike)
//   - neighbour_complaint_filed      (community / agricultural neighbour)
//   - water_restriction_active       (drought-zone WUL gate)
//
// SLA polarity URGENT — the HIGHER the soiling band, the TIGHTER every
// window. Same family as W34/W50/W51/W67/W75/W84/W85/W86/W87/W88 —
// production-loss + neighbour-impact URGENT band. Terminals (settled,
// cancelled) carry no deadline.
//
// REGULATOR-CROSSING SIGNATURE (the W102 hard line) — the soiling audit
// touches NERSA REIPPPP production reporting (every cleaning event affects
// the production schedule) and DFFE water-use licence (cleaning consumes
// water from a registered WUL):
//   raise_dispute        → regulator EVERY tier (production-loss dispute
//                          is always reportable — W102 signature)
//   cancel_audit         → regulator EVERY tier when soiling_ratio
//                          material+severe (skipping cleaning at material+
//                          severe soiling is a production-reporting event)
//   authorize_cleaning   → regulator EVERY tier when water_consumption_m3
//                          ≥ 100 (DFFE bulk-water threshold) OR plant
//                          capacity ≥ 50 MW (NERSA reporting threshold)
//   sla_breached         → regulator material + severe
//
// Write roles: {admin, support}. The cleaning contractor contributes through
// start_cleaning / complete_cleaning (party=cleaning_contractor) but the
// route gates every action to the support write set — owners and
// contractors see audit state through the read-side aggregate.
// ─────────────────────────────────────────────────────────────────────────

export type SoilStatus =
  | 'soiling_period_open'
  | 'inspection_scheduled'
  | 'field_inspected'
  | 'soiling_measured'
  | 'economic_assessment_done'
  | 'cleaning_authorized'
  | 'cleaning_in_progress'
  | 'post_clean_measured'
  | 'gain_validated'
  | 'settled'
  | 'disputed'
  | 'cancelled';

export type SoilAction =
  | 'schedule_inspection'
  | 'record_inspection'
  | 'measure_soiling'
  | 'assess_economics'
  | 'authorize_cleaning'
  | 'start_cleaning'
  | 'complete_cleaning'
  | 'measure_post_clean'
  | 'validate_gain'
  | 'settle_audit'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'cancel_audit';

export type SoilTier = 'minor' | 'standard' | 'material' | 'severe';

export type SoilParty =
  | 'site_supervisor'
  | 'cleaning_contractor'
  | 'plant_owner'
  | 'regulator_observer';

export type SoilEvent =
  | 'soiling_audit.inspection_scheduled'
  | 'soiling_audit.field_inspected'
  | 'soiling_audit.soiling_measured'
  | 'soiling_audit.economics_assessed'
  | 'soiling_audit.cleaning_authorized'
  | 'soiling_audit.cleaning_started'
  | 'soiling_audit.cleaning_completed'
  | 'soiling_audit.post_clean_measured'
  | 'soiling_audit.gain_validated'
  | 'soiling_audit.settled'
  | 'soiling_audit.dispute_raised'
  | 'soiling_audit.dispute_resolved'
  | 'soiling_audit.cancelled'
  | 'soiling_audit.sla_breached';

const TERMINALS = new Set<SoilStatus>(['settled', 'cancelled']);

export function isTerminal(s: SoilStatus): boolean {
  return TERMINALS.has(s);
}

// Cancel-audit can fire from any non-terminal state — skip the cleaning
// (wash forecast, frost, drought, neighbour notice, contractor failed).
const CANCELLABLE_FROM: SoilStatus[] = [
  'soiling_period_open',
  'inspection_scheduled',
  'field_inspected',
  'soiling_measured',
  'economic_assessment_done',
  'cleaning_authorized',
  'cleaning_in_progress',
  'post_clean_measured',
  'gain_validated',
  'disputed',
];

// Dispute can be raised at any decision-point that turns on the soiling
// number or on the recovered-gain validation.
const DISPUTABLE_FROM: SoilStatus[] = [
  'soiling_measured',
  'economic_assessment_done',
  'gain_validated',
];

export const TRANSITIONS: Record<SoilAction, { from: SoilStatus[]; to: SoilStatus }> = {
  schedule_inspection: { from: ['soiling_period_open'],                   to: 'inspection_scheduled' },
  record_inspection:   { from: ['inspection_scheduled'],                  to: 'field_inspected' },
  measure_soiling:     { from: ['field_inspected'],                       to: 'soiling_measured' },
  assess_economics:    { from: ['soiling_measured', 'disputed'],          to: 'economic_assessment_done' },
  authorize_cleaning:  { from: ['economic_assessment_done'],              to: 'cleaning_authorized' },
  start_cleaning:      { from: ['cleaning_authorized'],                   to: 'cleaning_in_progress' },
  complete_cleaning:   { from: ['cleaning_in_progress'],                  to: 'post_clean_measured' },
  measure_post_clean:  { from: ['post_clean_measured'],                   to: 'gain_validated' },
  validate_gain:       { from: ['gain_validated'],                        to: 'settled' },
  settle_audit:        { from: ['gain_validated'],                        to: 'settled' },
  raise_dispute:       { from: DISPUTABLE_FROM,                           to: 'disputed' },
  resolve_dispute:     { from: ['disputed'],                              to: 'economic_assessment_done' },
  cancel_audit:        { from: CANCELLABLE_FROM,                          to: 'cancelled' },
};

export function nextStatus(current: SoilStatus, action: SoilAction): SoilStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: SoilStatus): SoilAction[] {
  const acts: SoilAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [SoilAction, typeof TRANSITIONS[SoilAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the HIGHER the soiling band, the TIGHTER every window.
// Strictly decreasing minor → severe per graded state. Terminals carry no
// deadline. Production-loss + neighbour-impact URGENT family (W34/W50/W51/
// W67/W75/W84/W85/W86/W87/W88).
export const SLA_MINUTES: Record<SoilStatus, Record<SoilTier, number>> = {
  soiling_period_open:       { minor: 14 * DAY, standard: 7 * DAY,  material: 3 * DAY,  severe: 1 * DAY },
  inspection_scheduled:      { minor: 10 * DAY, standard: 5 * DAY,  material: 2 * DAY,  severe: 12 * HOUR },
  field_inspected:           { minor: 7 * DAY,  standard: 3 * DAY,  material: 1 * DAY,  severe: 6 * HOUR },
  soiling_measured:          { minor: 5 * DAY,  standard: 3 * DAY,  material: 1 * DAY,  severe: 6 * HOUR },
  economic_assessment_done:  { minor: 7 * DAY,  standard: 3 * DAY,  material: 2 * DAY,  severe: 1 * DAY },
  cleaning_authorized:       { minor: 14 * DAY, standard: 7 * DAY,  material: 3 * DAY,  severe: 1 * DAY },
  cleaning_in_progress:      { minor: 10 * DAY, standard: 7 * DAY,  material: 5 * DAY,  severe: 3 * DAY },
  post_clean_measured:       { minor: 3 * DAY,  standard: 2 * DAY,  material: 1 * DAY,  severe: 12 * HOUR },
  gain_validated:            { minor: 5 * DAY,  standard: 3 * DAY,  material: 2 * DAY,  severe: 1 * DAY },
  disputed:                  { minor: 21 * DAY, standard: 14 * DAY, material: 7 * DAY,  severe: 3 * DAY },
  settled:                   { minor: 0,        standard: 0,        material: 0,        severe: 0 },
  cancelled:                 { minor: 0,        standard: 0,        material: 0,        severe: 0 },
};

export function slaWindowMinutes(status: SoilStatus, tier: SoilTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: SoilStatus, tier: SoilTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Tier RE-DERIVED from current soiling_ratio_pct.
export function tierForSoilingRatio(soilingRatioPct: number | null | undefined): SoilTier {
  const r = Number(soilingRatioPct ?? 0);
  if (!isFinite(r) || r < 0) return 'minor';
  if (r >= 8) return 'severe';
  if (r >= 4) return 'material';
  if (r >= 2) return 'standard';
  return 'minor';
}

// FLOOR-AT-MATERIAL — any of these flags forces the effective tier up to at
// least material, regardless of the raw soiling ratio. Captures contextual
// risk that raw ratio doesn't.
export function floorAtMaterial(args: {
  rainy_season_window_strict?: boolean | number | null;
  post_dust_storm_event?: boolean | number | null;
  neighbour_complaint_filed?: boolean | number | null;
  water_restriction_active?: boolean | number | null;
}): boolean {
  const truthy = (v: boolean | number | null | undefined): boolean => Boolean(v);
  return (
    truthy(args.rainy_season_window_strict) ||
    truthy(args.post_dust_storm_event) ||
    truthy(args.neighbour_complaint_filed) ||
    truthy(args.water_restriction_active)
  );
}

// Compose raw-tier + floor-at-material into the effective tier used by every
// downstream decision.
export function effectiveTier(rawTier: SoilTier, floor: boolean): SoilTier {
  if (!floor) return rawTier;
  // Promote to at least material when floor applies.
  if (rawTier === 'minor' || rawTier === 'standard') return 'material';
  return rawTier;
}

// The HEAVY tiers — where reportability and regulator crossings attach.
const HEAVY_TIERS = new Set<SoilTier>(['material', 'severe']);

export function isHeavyTier(tier: SoilTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// W102 hard line — production reporting + DFFE water-use:
//   raise_dispute        → regulator EVERY tier (signature)
//   cancel_audit         → regulator EVERY tier when soiling_ratio material+
//                          severe (skipping a needed clean is reportable)
//   authorize_cleaning   → regulator EVERY tier when water_consumption_m3
//                          ≥ 100 (DFFE bulk-water threshold) OR plant
//                          capacity_mw ≥ 50 (NERSA reporting threshold)
//   sla_breached         → material + severe
export function crossesIntoRegulator(
  action: SoilAction,
  tier: SoilTier,
  installedCapacityMw: number | null | undefined,
  waterConsumptionM3: number | null | undefined,
): boolean {
  if (action === 'raise_dispute') return true;
  if (action === 'cancel_audit') return HEAVY_TIERS.has(tier);
  if (action === 'authorize_cleaning') {
    const cap = Number(installedCapacityMw ?? 0);
    const water = Number(waterConsumptionM3 ?? 0);
    return cap >= 50 || water >= 100;
  }
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: SoilTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: SoilTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Party each action represents. The site supervisor drives inspection +
// measurement + assessment; the cleaning contractor executes the works; the
// plant owner authorises cleaning + settlement; the regulator only appears
// on the production-reporting + water-use crossings.
const ACTION_PARTY: Record<SoilAction, SoilParty> = {
  schedule_inspection: 'site_supervisor',
  record_inspection:   'site_supervisor',
  measure_soiling:     'site_supervisor',
  assess_economics:    'site_supervisor',
  authorize_cleaning:  'plant_owner',
  start_cleaning:      'cleaning_contractor',
  complete_cleaning:   'cleaning_contractor',
  measure_post_clean:  'site_supervisor',
  validate_gain:       'site_supervisor',
  settle_audit:        'plant_owner',
  raise_dispute:       'plant_owner',
  resolve_dispute:     'site_supervisor',
  cancel_audit:        'site_supervisor',
};

export function partyForAction(action: SoilAction): SoilParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: SoilAction): SoilEvent | null {
  switch (action) {
    case 'schedule_inspection': return 'soiling_audit.inspection_scheduled';
    case 'record_inspection':   return 'soiling_audit.field_inspected';
    case 'measure_soiling':     return 'soiling_audit.soiling_measured';
    case 'assess_economics':    return 'soiling_audit.economics_assessed';
    case 'authorize_cleaning':  return 'soiling_audit.cleaning_authorized';
    case 'start_cleaning':      return 'soiling_audit.cleaning_started';
    case 'complete_cleaning':   return 'soiling_audit.cleaning_completed';
    case 'measure_post_clean':  return 'soiling_audit.post_clean_measured';
    case 'validate_gain':       return 'soiling_audit.gain_validated';
    case 'settle_audit':        return 'soiling_audit.settled';
    case 'raise_dispute':       return 'soiling_audit.dispute_raised';
    case 'resolve_dispute':     return 'soiling_audit.dispute_resolved';
    case 'cancel_audit':        return 'soiling_audit.cancelled';
  }
}

// ─── Live soiling battery — beats NTT Soiling Maps / Power Factors Drive /
//     AlsoEnergy Soiling Index / 3E SynaptiQ Soiling / Above Surveying /
//     Heliolytics / Atonometrics / DEWA-RTC by surfacing every yield-loss
//     and cleaning-economics metric LIVE on the row, not as a static
//     dashboard tile.

// PR loss attributable to current soiling — difference between expected
// (clean) PR and currently-observed dirty PR, in percentage points.
export function prLossPct(
  expectedPrCleanPct: number | null | undefined,
  currentPrDirtyPct: number | null | undefined,
): number {
  const exp = Number(expectedPrCleanPct ?? 0);
  const dirt = Number(currentPrDirtyPct ?? 0);
  if (exp <= 0 || dirt <= 0) return 0;
  return Math.round((exp - dirt) * 100) / 100;
}

// Daily MWh loss = installed capacity × daily energy yield × pr_loss / 100.
// Defaults: 5 peak-sun hours/day (SA Northern Cape).
export function mwhLossPerDay(
  installedCapacityMw: number | null | undefined,
  prLoss: number,
  peakSunHoursPerDay: number | null | undefined,
): number {
  const cap = Number(installedCapacityMw ?? 0);
  const hrs = Number(peakSunHoursPerDay ?? 5);
  if (cap <= 0 || prLoss <= 0 || hrs <= 0) return 0;
  return Math.round(cap * hrs * (prLoss / 100) * 100) / 100;
}

// Daily ZAR loss = daily MWh loss × PPA tariff.
export function zarLossPerDay(
  mwhPerDay: number,
  tariffZarPerMwh: number | null | undefined,
): number {
  const tariff = Number(tariffZarPerMwh ?? 1150);
  if (mwhPerDay <= 0) return 0;
  return Math.round(mwhPerDay * tariff);
}

// Cumulative ZAR loss since soiling period opened — daily loss × days
// elapsed.
export function zarLossToDate(
  zarPerDay: number,
  periodOpenedAt: Date | null,
  now: Date,
): number {
  if (!periodOpenedAt) return 0;
  const days = Math.max(0, (now.getTime() - periodOpenedAt.getTime()) / (1000 * 60 * 60 * 24));
  return Math.round(zarPerDay * days);
}

// Cleaning ROI — expected recovery (over recovery horizon days) ÷ cleaning
// cost. Ratio > 1.0 means cleaning pays back.
export function cleaningRoiRatio(
  zarPerDay: number,
  recoveryHorizonDays: number | null | undefined,
  cleaningCostZar: number | null | undefined,
): number {
  const horizon = Number(recoveryHorizonDays ?? 30);
  const cost = Number(cleaningCostZar ?? 0);
  if (cost <= 0 || zarPerDay <= 0) return 0;
  const recovery = zarPerDay * horizon;
  return Math.round((recovery / cost) * 100) / 100;
}

// Days to breakeven — cleaning cost ÷ daily loss recovery. Lower is better.
export function daysToBreakeven(
  cleaningCostZar: number | null | undefined,
  zarPerDay: number,
): number {
  const cost = Number(cleaningCostZar ?? 0);
  if (zarPerDay <= 0) return 99;
  if (cost <= 0) return 0;
  return Math.round((cost / zarPerDay) * 10) / 10;
}

// Soiling velocity — how fast soiling is accumulating, in percentage points
// per day. Positive = getting worse, negative = recovering (rainfall).
export function soilingVelocityPctPerDay(
  currentRatioPct: number | null | undefined,
  baselineRatioPct: number | null | undefined,
  daysSinceBaseline: number | null | undefined,
): number {
  const curr = Number(currentRatioPct ?? 0);
  const base = Number(baselineRatioPct ?? 0);
  const days = Number(daysSinceBaseline ?? 0);
  if (days <= 0) return 0;
  return Math.round(((curr - base) / days) * 100) / 100;
}

// Predicted next-clean date — extrapolates current velocity to next material
// threshold (4 %). Returns null if not accumulating.
export function predictedNextCleanDate(
  currentRatioPct: number | null | undefined,
  velocityPctPerDay: number,
  now: Date,
): string | null {
  const curr = Number(currentRatioPct ?? 0);
  if (velocityPctPerDay <= 0) return null;
  if (curr >= 4) return now.toISOString().slice(0, 10);
  const daysToMaterial = (4 - curr) / velocityPctPerDay;
  if (!isFinite(daysToMaterial) || daysToMaterial > 365) return null;
  const target = new Date(now.getTime() + daysToMaterial * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

// Recovered ZAR — post-clean MWh gain × tariff. Used to validate that the
// audit actually delivered.
export function recoveredZar(
  postCleanPrPct: number | null | undefined,
  prePrPct: number | null | undefined,
  installedCapacityMw: number | null | undefined,
  peakSunHoursPerDay: number | null | undefined,
  recoveryHorizonDays: number | null | undefined,
  tariffZarPerMwh: number | null | undefined,
): number {
  const gain = Number(postCleanPrPct ?? 0) - Number(prePrPct ?? 0);
  if (gain <= 0) return 0;
  const cap = Number(installedCapacityMw ?? 0);
  const hrs = Number(peakSunHoursPerDay ?? 5);
  const horizon = Number(recoveryHorizonDays ?? 30);
  const tariff = Number(tariffZarPerMwh ?? 1150);
  if (cap <= 0) return 0;
  const mwhGain = cap * hrs * (gain / 100) * horizon;
  return Math.round(mwhGain * tariff);
}

// Soiling compliance index 0-130 — composes coverage flags into a single
// score that drives the dashboard headline. Component scoring (each
// contributes up to its weight if present + non-stale):
//   inspection_recent         20
//   measurement_recent        20
//   economics_documented      15
//   water_restriction_checked 10
//   neighbour_notice_logged   10
//   evidence_photo_uploaded   15
//   post_clean_measured       15
//   gain_validated            15
//   recovery_documented       10
// Capped at 130 (bonus when settled + gain-validated cleanly above
// expectations).
export function soilingComplianceIndex(args: {
  inspection_recent?: boolean | number | null;
  measurement_recent?: boolean | number | null;
  economics_documented?: boolean | number | null;
  water_restriction_checked?: boolean | number | null;
  neighbour_notice_logged?: boolean | number | null;
  evidence_photo_uploaded?: boolean | number | null;
  post_clean_measured?: boolean | number | null;
  gain_validated?: boolean | number | null;
  recovery_documented?: boolean | number | null;
  cleanly_settled_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.inspection_recent) * 20;
  score += t(args.measurement_recent) * 20;
  score += t(args.economics_documented) * 15;
  score += t(args.water_restriction_checked) * 10;
  score += t(args.neighbour_notice_logged) * 10;
  score += t(args.evidence_photo_uploaded) * 15;
  score += t(args.post_clean_measured) * 15;
  score += t(args.gain_validated) * 15;
  score += t(args.recovery_documented) * 10;
  score += t(args.cleanly_settled_bonus) * 0; // baseline ladder up to 130
  if (score > 130) score = 130;
  return score;
}

// Days remaining in the current state's SLA window.
export function slaDaysRemaining(
  status: SoilStatus,
  tier: SoilTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) return 0;
  return Math.round(remainingMs / (1000 * 60 * 60 * 24) * 10) / 10;
}

// Cleaning urgency band — composes soiling tier + days_to_breakeven + SLA
// days remaining into a single critical/high/medium/low signal that drives
// the UI ribbon.
export type SoilUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(
  tier: SoilTier,
  daysToBreakeven: number,
  slaDaysLeft: number,
): SoilUrgency {
  if (tier === 'severe' || (slaDaysLeft > 0 && slaDaysLeft < 1)) return 'critical';
  if (tier === 'material' || daysToBreakeven < 7 || (slaDaysLeft > 0 && slaDaysLeft < 3)) return 'high';
  if (tier === 'standard' || daysToBreakeven < 14 || (slaDaysLeft > 0 && slaDaysLeft < 7)) return 'medium';
  return 'low';
}

// Authority ladder driven by effective tier — who has to sign off
// authorisation + settlement on this row.
export type SoilAuthority =
  | 'site_supervisor'
  | 'plant_manager'
  | 'asset_director'
  | 'cfo';

export function authorityRequired(tier: SoilTier): SoilAuthority {
  switch (tier) {
    case 'minor':    return 'site_supervisor';
    case 'standard': return 'plant_manager';
    case 'material': return 'asset_director';
    case 'severe':   return 'cfo';
  }
}
