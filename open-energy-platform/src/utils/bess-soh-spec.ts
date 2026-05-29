// ─────────────────────────────────────────────────────────────────────────
// Wave 88 — Esums BESS State-of-Health Monitoring & Capacity-Augmentation
//           Programme (P6)
//
// Every grid-connected battery storage system commissioned in South Africa
// today carries a contractual capacity guarantee — typically expressed as
// a state-of-health floor (e.g. ≥ 70% nameplate after 10 years, ≥ 60% after
// 15 years). Capacity fade happens through calendar ageing and cycling; once
// the SOH drops below the contracted floor, the operator owes either an
// AUGMENTATION (install fresh modules to top up to nameplate) or a financial
// make-good. Without a live, audited chain this becomes a multi-million-rand
// dispute every 18 months.
//
// W88 is the BESS health + augmentation lifecycle:
//   • Baseline capacity test on commissioning
//   • Continuous SOH ingestion (cycle + calendar fade)
//   • Drift detection vs contractual fade curve
//   • Engineering assessment (cycle / calendar / cell-imbalance / thermal)
//   • Augmentation requirement → planning → works → recommissioning
//   • Counterparty dispute branch on measurement methodology
//   • Decommissioning at end-of-life
//
// Distinct from the rest of the Esums book:
//   - [[project_wave12_site_commissioning]]                whole-site onboarding
//   - [[project_wave24_pr_chain]]                          PV performance ratio (energy yield)
//   - [[project_wave25_hse_incident_chain]]                safety incident response
//   - [[project_wave35_vendor_escalation_chain]]           consumer/vendor escalation
//   - [[project_wave51_availability_guarantee_chain]]      time-based uptime (not capacity)
//   - [[project_wave59_pm_compliance_chain]]               preventive maintenance schedule
//   - [[project_wave64_permit_to_work_chain]]              control-of-work LOTO
//   - [[project_wave71_asset_prognostics_chain]]           predictive RUL / fault fingerprinting
//   - [[project_wave79_generation_revenue_assurance_chain]] meter-vs-settlement reconciliation
//
// W51 is the TIME-availability guarantee (uptime %) — W88 is the CAPACITY
// guarantee (SOH %). W71 is the predictive PROGNOSTIC (will it fail?) —
// W88 is the contractual HEALTH (is it still in spec?). W12 is one-off
// commissioning — W88 is the continuous lifetime health programme.
//
// Beats Powin Stack OS / Tesla Megapack OS / Fluence Battery Management
// Suite / AES Advancion / Wärtsilä GEMS / Honeywell Experion BESS — every
// one of these surfaces SOH as a single number on a dashboard. W88 makes it
// a 12-state P6 chain with auto-tier, urgency-band SLA, augmentation NPV vs
// PPA capacity payment, warranty-recovery eligibility, and a regulator hard
// line on augmentation/decommission for grid-connected ≥ 50 MW BESS
// (NERSA Grid Code security-of-supply).
//
// Forward path (clean lifecycle):
//   baseline_set → monitoring_active → ... → decommissioned (terminal)
//
// Drift / augmentation branch:
//   monitoring_active → detect_drift → drift_detected → assess_cause
//   → assessment_pending → require_augmentation → augmentation_required
//   → plan_augmentation → augmentation_planned → start_works
//   → augmentation_in_progress → complete_works → augmentation_complete
//   → recommission → recommissioned (terminal)
//
// Dispute branch (counterparty challenges SOH methodology):
//   drift_detected / assessment_pending / augmentation_required
//   → raise_dispute → disputed → resolve_dispute → assessment_pending
//
// Decommissioning branch (irreversible end-of-life):
//   monitoring_active / drift_detected / assessment_pending
//   / augmentation_required / augmentation_planned
//   → decommission → decommissioned (terminal)
//
// Cancel branch (pre-monitoring only — wrong project / scope-out):
//   baseline_set → cancel_programme → cancelled (terminal)
//
// Tiers (4) RE-DERIVED on every transition from current_soh_pct vs the
// contractual floor_pct. KEY DESIGN: a programme can deteriorate from
// nominal to critical as cycles accrue, or recover to nominal after an
// augmentation lifts SOH back above floor+10. The matrix and every cascade
// / regulator / SLA decision keys off whatever soh_pct the row carries now.
//   nominal  : soh_pct >= floor + 10      (well in spec)
//   watch    : floor + 5 <= soh < floor + 10
//   material : floor <= soh < floor + 5   (close to breach)
//   critical : soh < floor                (contractual breach — owes make-good)
//
// SLA polarity URGENT — the LOWER the SOH band, the TIGHTER every window.
// Same family as W34/W50/W51/W67/W75/W84/W85/W86/W87 — security-of-supply
// URGENT band. Terminals (recommissioned, decommissioned, cancelled) carry
// no deadline.
//
// SECURITY-OF-SUPPLY SIGNATURE (the W88 hard line) — the BESS feeds the
// grid; once SOH drops past contractual floor, NERSA Grid Code security-of-
// supply applies for ≥ 50 MW installations:
//   require_augmentation → regulator EVERY tier when installed_capacity_mw
//                          >= 50 (W88 hard line — NERSA Grid Code threshold);
//                          material + critical otherwise
//   decommission         → regulator EVERY tier (loss of grid capacity is
//                          always reportable, irrespective of size)
//   raise_dispute        → material + critical only (small disputes stay
//                          commercial)
//   sla_breached         → material + critical
//
// Write roles: {admin, support}. The OEM contributes through start_works /
// complete_works (party=oem) but the route gates every action to the
// support write set — owners and OEMs see programme state through the
// read-side aggregate. actor_party tags whether the step represents the
// operator (Esums team), the OEM (manufacturer / works contractor), the
// owner (asset owner / IPP), or the regulator (NERSA, when a security-of-
// supply notice is issued).
// ─────────────────────────────────────────────────────────────────────────

export type BsohStatus =
  | 'baseline_set'
  | 'monitoring_active'
  | 'drift_detected'
  | 'assessment_pending'
  | 'augmentation_required'
  | 'augmentation_planned'
  | 'augmentation_in_progress'
  | 'augmentation_complete'
  | 'recommissioned'
  | 'disputed'
  | 'decommissioned'
  | 'cancelled';

export type BsohAction =
  | 'activate_monitoring'
  | 'detect_drift'
  | 'assess_cause'
  | 'require_augmentation'
  | 'plan_augmentation'
  | 'start_works'
  | 'complete_works'
  | 'recommission'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'decommission'
  | 'cancel_programme';

export type BsohTier = 'nominal' | 'watch' | 'material' | 'critical';

export type BsohParty = 'operator' | 'oem' | 'owner' | 'regulator';

export type BsohEvent =
  | 'bess_soh.monitoring_activated'
  | 'bess_soh.drift_detected'
  | 'bess_soh.assessment_pending'
  | 'bess_soh.augmentation_required'
  | 'bess_soh.augmentation_planned'
  | 'bess_soh.works_started'
  | 'bess_soh.works_completed'
  | 'bess_soh.recommissioned'
  | 'bess_soh.dispute_raised'
  | 'bess_soh.dispute_resolved'
  | 'bess_soh.decommissioned'
  | 'bess_soh.cancelled'
  | 'bess_soh.sla_breached';

const TERMINALS = new Set<BsohStatus>(['recommissioned', 'decommissioned', 'cancelled']);

export function isTerminal(s: BsohStatus): boolean {
  return TERMINALS.has(s);
}

// Decommission can be triggered from any active state — EoL is always allowed.
const DECOMMISSIONABLE_FROM: BsohStatus[] = [
  'monitoring_active',
  'drift_detected',
  'assessment_pending',
  'augmentation_required',
  'augmentation_planned',
  'augmentation_in_progress',
  'augmentation_complete',
  'disputed',
];

// Dispute can be raised at any decision-point that turns on the SOH number.
const DISPUTABLE_FROM: BsohStatus[] = [
  'drift_detected',
  'assessment_pending',
  'augmentation_required',
];

export const TRANSITIONS: Record<BsohAction, { from: BsohStatus[]; to: BsohStatus }> = {
  activate_monitoring:   { from: ['baseline_set'],                          to: 'monitoring_active' },
  detect_drift:          { from: ['monitoring_active'],                     to: 'drift_detected' },
  assess_cause:          { from: ['drift_detected', 'disputed'],            to: 'assessment_pending' },
  require_augmentation:  { from: ['assessment_pending'],                    to: 'augmentation_required' },
  plan_augmentation:     { from: ['augmentation_required'],                 to: 'augmentation_planned' },
  start_works:           { from: ['augmentation_planned'],                  to: 'augmentation_in_progress' },
  complete_works:        { from: ['augmentation_in_progress'],              to: 'augmentation_complete' },
  recommission:          { from: ['augmentation_complete'],                 to: 'recommissioned' },
  raise_dispute:         { from: DISPUTABLE_FROM,                           to: 'disputed' },
  resolve_dispute:       { from: ['disputed'],                              to: 'assessment_pending' },
  decommission:          { from: DECOMMISSIONABLE_FROM,                     to: 'decommissioned' },
  cancel_programme:      { from: ['baseline_set'],                          to: 'cancelled' },
};

export function nextStatus(current: BsohStatus, action: BsohAction): BsohStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: BsohStatus): BsohAction[] {
  const acts: BsohAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [BsohAction, typeof TRANSITIONS[BsohAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LOWER the SOH band, the TIGHTER every window.
// Strictly decreasing nominal → critical per graded state. Terminals carry
// no deadline.
export const SLA_MINUTES: Record<BsohStatus, Record<BsohTier, number>> = {
  baseline_set:             { nominal: 30 * DAY, watch: 14 * DAY, material: 7 * DAY,  critical: 3 * DAY },
  monitoring_active:        { nominal: 90 * DAY, watch: 30 * DAY, material: 14 * DAY, critical: 7 * DAY },
  drift_detected:           { nominal: 21 * DAY, watch: 14 * DAY, material: 7 * DAY,  critical: 3 * DAY },
  assessment_pending:       { nominal: 30 * DAY, watch: 21 * DAY, material: 14 * DAY, critical: 7 * DAY },
  augmentation_required:    { nominal: 60 * DAY, watch: 45 * DAY, material: 30 * DAY, critical: 14 * DAY },
  augmentation_planned:     { nominal: 90 * DAY, watch: 60 * DAY, material: 45 * DAY, critical: 30 * DAY },
  augmentation_in_progress: { nominal: 180 * DAY, watch: 120 * DAY, material: 90 * DAY, critical: 60 * DAY },
  augmentation_complete:    { nominal: 14 * DAY, watch: 10 * DAY, material: 7 * DAY,  critical: 3 * DAY },
  disputed:                 { nominal: 60 * DAY, watch: 45 * DAY, material: 30 * DAY, critical: 14 * DAY },
  recommissioned:           { nominal: 0,        watch: 0,        material: 0,        critical: 0 },
  decommissioned:           { nominal: 0,        watch: 0,        material: 0,        critical: 0 },
  cancelled:                { nominal: 0,        watch: 0,        material: 0,        critical: 0 },
};

export function slaWindowMinutes(status: BsohStatus, tier: BsohTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: BsohStatus, tier: BsohTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Tier RE-DERIVED on every transition from current SOH % vs contractual floor.
// KEY DESIGN: SOH can deteriorate (nominal → critical) as cycles accrue, or
// recover (critical → nominal) after augmentation lifts modules above floor.
// The matrix and every cascade / regulator / SLA decision keys off whatever
// soh_pct the row carries right now.
export function tierForSoh(
  sohPct: number | null | undefined,
  floorPct: number | null | undefined,
): BsohTier {
  const soh = Number(sohPct ?? 0);
  const floor = Number(floorPct ?? 0);
  if (!isFinite(soh) || soh <= 0 || floor <= 0) return 'nominal';
  if (soh < floor) return 'critical';
  if (soh < floor + 5) return 'material';
  if (soh < floor + 10) return 'watch';
  return 'nominal';
}

// The HEAVY tiers — where reportability and regulator crossings attach.
const HEAVY_TIERS = new Set<BsohTier>(['material', 'critical']);

export function isHeavyTier(tier: BsohTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// SECURITY-OF-SUPPLY signature — the W88 hard line.
//   require_augmentation → regulator EVERY tier when capacity >= 50 MW
//                          (NERSA Grid Code threshold); material + critical
//                          otherwise
//   decommission         → regulator EVERY tier (loss of grid capacity is
//                          always reportable)
//   raise_dispute        → material + critical only
export function crossesIntoRegulator(
  action: BsohAction,
  tier: BsohTier,
  installedCapacityMw: number | null | undefined,
): boolean {
  if (action === 'decommission') return true;
  if (action === 'require_augmentation') {
    const cap = Number(installedCapacityMw ?? 0);
    if (cap >= 50) return true;
    return HEAVY_TIERS.has(tier);
  }
  if (action === 'raise_dispute') return HEAVY_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: BsohTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for
// the HEAVY tiers (material + critical).
export function isReportable(tier: BsohTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Party each action represents. The operator drives monitoring + assessment +
// augmentation decisions + dispute; the OEM executes the works; the owner
// authorises CapEx + recommissioning; the regulator only appears on the
// security-of-supply crossings.
const ACTION_PARTY: Record<BsohAction, BsohParty> = {
  activate_monitoring:  'operator',
  detect_drift:         'operator',
  assess_cause:         'operator',
  require_augmentation: 'operator',
  plan_augmentation:    'owner',
  start_works:          'oem',
  complete_works:       'oem',
  recommission:         'owner',
  raise_dispute:        'owner',
  resolve_dispute:      'operator',
  decommission:         'owner',
  cancel_programme:     'operator',
};

export function partyForAction(action: BsohAction): BsohParty {
  return ACTION_PARTY[action];
}

// ─── Live SOH battery — beats Powin Stack OS / Tesla Megapack OS / Fluence
//     BMS / AES Advancion / Wärtsilä GEMS / Honeywell Experion BESS by
//     surfacing every health + augmentation economics metric LIVE on the row,
//     not as a static dashboard tile. Each helper takes scalars + (where
//     relevant) a `now` clock and returns a number; the route's decorate()
//     composes them.

// SOH headroom to contractual floor — positive means in spec, negative means
// breach. Rounded to one decimal.
export function sohHeadroomPct(
  sohPct: number | null | undefined,
  floorPct: number | null | undefined,
): number {
  const soh = Number(sohPct ?? 0);
  const floor = Number(floorPct ?? 0);
  return Math.round((soh - floor) * 10) / 10;
}

// Annualised fade rate over the elapsed monitoring window — (1 - soh/baseline)
// scaled per year. Inputs in fractional years.
export function annualisedFadeRatePct(
  sohPct: number | null | undefined,
  baselinePct: number | null | undefined,
  yearsInService: number | null | undefined,
): number {
  const soh = Number(sohPct ?? 0);
  const base = Number(baselinePct ?? 0);
  const years = Number(yearsInService ?? 0);
  if (base <= 0 || years <= 0) return 0;
  const fade = ((base - soh) / base) * 100;
  return Math.round((fade / years) * 100) / 100;
}

// Equivalent full cycles — total throughput in MWh ÷ nameplate energy capacity.
// Captures cycle stress separately from calendar ageing.
export function equivalentFullCycles(
  totalThroughputMwh: number | null | undefined,
  nameplateEnergyMwh: number | null | undefined,
): number {
  const t = Number(totalThroughputMwh ?? 0);
  const n = Number(nameplateEnergyMwh ?? 0);
  if (n <= 0) return 0;
  return Math.round((t / n) * 10) / 10;
}

// Cycle vs calendar attribution — the proportion of total fade explained by
// cycle stress vs calendar ageing. Returns cycle pct (0-100) of total fade.
// Uses a simple 50/50 baseline when cycle count is null.
export function cycleFadeAttributionPct(
  equivalentFullCycles: number,
  yearsInService: number | null | undefined,
): number {
  const years = Number(yearsInService ?? 0);
  if (years <= 0 || equivalentFullCycles <= 0) return 50;
  // Roughly: 1 EFC ≈ 0.02% fade; 1 year calendar ≈ 1.5% fade. So cycle
  // contribution = 0.02 × EFC vs calendar contribution = 1.5 × years.
  const cycle = 0.02 * equivalentFullCycles;
  const calendar = 1.5 * years;
  const total = cycle + calendar;
  if (total <= 0) return 50;
  return Math.round((cycle / total) * 1000) / 10;
}

// Capacity shortfall in MWh — (floor - soh)/100 × nameplate. Positive means
// the BESS is short of its contracted capacity at the current SOH.
export function capacityShortfallMwh(
  sohPct: number | null | undefined,
  floorPct: number | null | undefined,
  nameplateEnergyMwh: number | null | undefined,
): number {
  const soh = Number(sohPct ?? 0);
  const floor = Number(floorPct ?? 0);
  const nameplate = Number(nameplateEnergyMwh ?? 0);
  if (nameplate <= 0) return 0;
  const shortPct = floor - soh;
  if (shortPct <= 0) return 0;
  return Math.round((shortPct / 100) * nameplate * 100) / 100;
}

// Augmentation CapEx — typical SA market rate ~ R 6,500 / kWh installed for
// lithium ion modules at utility scale (2026 prices). The route can override
// per-vendor.
export function augmentationCapexZar(
  shortfallMwh: number,
  capexPerKwh: number | null | undefined,
): number {
  const rate = Number(capexPerKwh ?? 6500);
  return Math.round(shortfallMwh * 1000 * rate);
}

// Annual PPA capacity payment at risk — the operator forfeits the capacity
// payment on the missing MWh band. PPA capacity rates in SA REIPPPP BESS
// allocations sit around R 1,200,000 / MW-year.
export function capacityPaymentAtRiskZar(
  shortfallMwh: number,
  capacityRatePerMwYear: number | null | undefined,
): number {
  const rate = Number(capacityRatePerMwYear ?? 1_200_000);
  // 4-hour BESS → MW = MWh / 4 (round-trip equivalent). The route may pass
  // a different power conversion; default 4.
  const mw = shortfallMwh / 4;
  return Math.round(mw * rate);
}

// Augmentation NPV — capacity payment recovery over warranty residual years
// minus CapEx. Positive means augmentation is economic.
export function augmentationNpvZar(
  capacityPaymentAtRiskPerYear: number,
  augmentationCapex: number,
  residualWarrantyYears: number | null | undefined,
  discountRatePct: number | null | undefined,
): number {
  const years = Number(residualWarrantyYears ?? 0);
  const r = Number(discountRatePct ?? 12) / 100;
  if (years <= 0) return -augmentationCapex;
  let pv = 0;
  for (let y = 1; y <= Math.floor(years); y++) {
    pv += capacityPaymentAtRiskPerYear / Math.pow(1 + r, y);
  }
  return Math.round(pv - augmentationCapex);
}

// Warranty recovery eligibility — true when SOH dropped below floor BEFORE
// the warranty end date AND fade is cycle-dominated (cycle attribution > 60%).
// Calendar-dominated fade is typically excluded from OEM warranties.
export function warrantyRecoveryEligible(
  sohPct: number | null | undefined,
  floorPct: number | null | undefined,
  warrantyYearsRemaining: number | null | undefined,
  cycleAttributionPct: number,
): boolean {
  const soh = Number(sohPct ?? 0);
  const floor = Number(floorPct ?? 0);
  const yr = Number(warrantyYearsRemaining ?? 0);
  if (soh >= floor) return false;
  if (yr <= 0) return false;
  if (cycleAttributionPct <= 60) return false;
  return true;
}

// Predicted decommission year — extrapolates current fade rate to a hard
// end-of-life threshold (default 50% SOH — modules generally retired before
// this point). Returns 0 if soh already below threshold.
export function predictedDecommissionYears(
  sohPct: number | null | undefined,
  fadeRatePctPerYear: number,
  endOfLifeThreshold: number | null | undefined,
): number {
  const soh = Number(sohPct ?? 0);
  const eol = Number(endOfLifeThreshold ?? 50);
  if (soh <= eol) return 0;
  if (fadeRatePctPerYear <= 0) return 99;
  const years = (soh - eol) / fadeRatePctPerYear;
  return Math.round(years * 10) / 10;
}

// Days remaining in the current state's SLA window.
export function slaDaysRemaining(
  status: BsohStatus,
  tier: BsohTier,
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

// Urgency band derived from SOH headroom + SLA days remaining. Mirrors W87.
//   critical : soh < floor OR days_remaining < 1
//   high     : headroom < 5 OR days_remaining < 3
//   medium   : headroom < 10 OR days_remaining < 7
//   low      : everything else
export type BsohUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(headroomPct: number, daysRemaining: number): BsohUrgency {
  if (headroomPct < 0 || (daysRemaining > 0 && daysRemaining < 1)) return 'critical';
  if (headroomPct < 5 || (daysRemaining > 0 && daysRemaining < 3)) return 'high';
  if (headroomPct < 10 || (daysRemaining > 0 && daysRemaining < 7)) return 'medium';
  return 'low';
}
