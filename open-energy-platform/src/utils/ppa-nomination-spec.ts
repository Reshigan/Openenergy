// ─────────────────────────────────────────────────────────────────────────
// Wave 87 — Offtaker PPA Scheduled-Energy Nomination & Deviation Settlement (P6)
//
// The daily/monthly operational pulse of any PPA. The offtaker submits a
// day-ahead (DA) energy nomination by hour, the seller confirms, intra-day
// (ID) revisions may be posted up to gate closure, delivery happens, meter
// data flows in, and any deviation between metered and nominated MWh is
// reconciled and SETTLED at the deviation tariff. Excused branches catch
// force-majeure / curtailment relief; dispute branch catches metering or
// tariff challenges that cross into the regulator.
//
// Distinct from the rest of the Offtaker book:
//   - [[project_wave7_offtaker_portal]]                generic monthly portal
//   - [[project_wave22_ppa_contract_chain]]            contract execution (front-end)
//   - [[project_wave32_take_or_pay_chain]]             ANNUAL minimum offtake (W87 is monthly)
//   - [[project_wave39_tariff_indexation_chain]]       annual CPI escalation
//   - [[project_wave46_curtailment_claim_chain]]       availability-side curtailment claim
//   - [[project_wave54_payment_security_chain]]        credit support backstop
//   - [[project_wave62_ppa_termination_chain]]         exit / early-termination
//   - [[project_wave70_rec_lifecycle_chain]]           attribute / green-certificate retirement
//   - [[project_wave78_ppa_change_in_law_chain]]       legal change-in-law relief
//   - [[project_wave13_dispatch_nominations]]          system-operator BRP nominations (grid-side)
//
// W13 is the SO/BRP-side grid nomination — W87 is the contractual offtake
// nomination between the offtaker and the seller, settled against the PPA at
// the deviation tariff. Daily/monthly heartbeat — every other Offtaker chain
// is an exception-handling chain.
//
// Forward path (clean period):
//   nomination_window_open → da_nominated → da_confirmed → delivery_in_progress
//   → delivery_complete → meter_data_received → reconciled → deviation_settled (terminal)
//
// Intra-day revision branch:
//   da_confirmed → submit_id_revision → id_revised → close_gate → delivery_in_progress
//
// Seller rejection (renomination loop):
//   da_nominated → reject_da → nomination_window_open
//
// Dispute branch:
//   reconciled → raise_dispute → dispute_raised → resolve_dispute → reconciled
//
// Excused branch (force-majeure / curtailment):
//   any non-terminal → excuse_period → excused (terminal)
//
// Cancel branch (pre-delivery):
//   nomination_window_open / da_nominated → cancel_nomination → cancelled (terminal)
//
// Tiers (4) RE-DERIVED on every transition from absolute deviation percentage:
//   minor    : |dev| < 5%   (well within tolerance)
//   standard : 5% <= |dev| < 10%   (loose tolerance band)
//   material : 10% <= |dev| < 20%  (off-spec — settlement load)
//   major    : |dev| >= 20%        (severe deviation — grid balance concern)
//
// SLA polarity URGENT — the LARGER the deviation, the TIGHTER every window.
// Same family as W34/W50/W67/W75/W84/W85/W86 — the day-operations URGENT band.
// Terminals (deviation_settled, excused, cancelled) carry no deadline.
//
// NOMINATION-INTEGRITY SIGNATURE (the W87 hard line) — disputes over balance
// settlements always cross into the regulator (NERSA grid-balance oversight,
// PPA dispute-resolution under ERA s30):
//   raise_dispute       → regulator EVERY tier (W87 hard line — disputes always
//                                                go to NERSA; sister of W66 complaints)
//   excuse_period       → material + major (large excused volumes are reportable)
//   settle_deviation    → material + major (large penalty settlements disclosed)
//   sla_breached        → material + major
//
// Write roles: {admin, offtaker}. Seller (IPP) contributes through confirm_da
// and reject_da (party=seller) but the route gates every action to the
// offtaker write set — sellers see case state through the read-side aggregate.
// actor_party tags whether the step represents the offtaker (buyer), the
// seller (IPP/generator), the system operator (gate closure), or an
// independent_meter (meter ingestion).
// ─────────────────────────────────────────────────────────────────────────

export type PnomStatus =
  | 'nomination_window_open'
  | 'da_nominated'
  | 'da_confirmed'
  | 'id_revised'
  | 'delivery_in_progress'
  | 'delivery_complete'
  | 'meter_data_received'
  | 'reconciled'
  | 'dispute_raised'
  | 'deviation_settled'
  | 'excused'
  | 'cancelled';

export type PnomAction =
  | 'submit_da_nomination'
  | 'confirm_da'
  | 'reject_da'
  | 'submit_id_revision'
  | 'close_gate'
  | 'complete_delivery'
  | 'ingest_meter'
  | 'reconcile'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'settle_deviation'
  | 'excuse_period'
  | 'cancel_nomination';

export type PnomTier = 'minor' | 'standard' | 'material' | 'major';

export type PnomParty = 'offtaker' | 'seller' | 'system_operator' | 'independent_meter';

export type PnomExcuseReason = 'force_majeure' | 'curtailment' | 'grid_outage';

export type PnomEvent =
  | 'ppa_nomination.da_nominated'
  | 'ppa_nomination.da_confirmed'
  | 'ppa_nomination.da_rejected'
  | 'ppa_nomination.id_revised'
  | 'ppa_nomination.delivery_in_progress'
  | 'ppa_nomination.delivery_complete'
  | 'ppa_nomination.meter_data_received'
  | 'ppa_nomination.reconciled'
  | 'ppa_nomination.dispute_raised'
  | 'ppa_nomination.dispute_resolved'
  | 'ppa_nomination.deviation_settled'
  | 'ppa_nomination.excused'
  | 'ppa_nomination.cancelled'
  | 'ppa_nomination.sla_breached';

const TERMINALS = new Set<PnomStatus>(['deviation_settled', 'excused', 'cancelled']);

export function isTerminal(s: PnomStatus): boolean {
  return TERMINALS.has(s);
}

// Non-terminal sources for excuse_period — every operational state can be
// excused into the terminal excused bucket.
const EXCUSABLE_FROM: PnomStatus[] = [
  'nomination_window_open',
  'da_nominated',
  'da_confirmed',
  'id_revised',
  'delivery_in_progress',
  'delivery_complete',
  'meter_data_received',
  'reconciled',
  'dispute_raised',
];

export const TRANSITIONS: Record<PnomAction, { from: PnomStatus[]; to: PnomStatus }> = {
  submit_da_nomination: { from: ['nomination_window_open'],                              to: 'da_nominated' },
  confirm_da:           { from: ['da_nominated'],                                        to: 'da_confirmed' },
  reject_da:            { from: ['da_nominated'],                                        to: 'nomination_window_open' },
  submit_id_revision:   { from: ['da_confirmed', 'id_revised'],                          to: 'id_revised' },
  close_gate:           { from: ['da_confirmed', 'id_revised'],                          to: 'delivery_in_progress' },
  complete_delivery:    { from: ['delivery_in_progress'],                                to: 'delivery_complete' },
  ingest_meter:         { from: ['delivery_complete'],                                   to: 'meter_data_received' },
  reconcile:            { from: ['meter_data_received'],                                 to: 'reconciled' },
  raise_dispute:        { from: ['reconciled'],                                          to: 'dispute_raised' },
  resolve_dispute:      { from: ['dispute_raised'],                                      to: 'reconciled' },
  settle_deviation:     { from: ['reconciled'],                                          to: 'deviation_settled' },
  excuse_period:        { from: EXCUSABLE_FROM,                                          to: 'excused' },
  cancel_nomination:    { from: ['nomination_window_open', 'da_nominated'],              to: 'cancelled' },
};

export function nextStatus(current: PnomStatus, action: PnomAction): PnomStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: PnomStatus): PnomAction[] {
  const acts: PnomAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [PnomAction, typeof TRANSITIONS[PnomAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER the deviation %, the TIGHTER every window.
// Strictly decreasing minor → major per graded state. Terminals carry no
// deadline.
export const SLA_MINUTES: Record<PnomStatus, Record<PnomTier, number>> = {
  nomination_window_open: { minor: 7 * DAY,  standard: 5 * DAY,  material: 3 * DAY,  major: 1 * DAY },
  da_nominated:           { minor: 3 * DAY,  standard: 2 * DAY,  material: 1 * DAY,  major: 12 * HOUR },
  da_confirmed:           { minor: 5 * DAY,  standard: 3 * DAY,  material: 1 * DAY,  major: 12 * HOUR },
  id_revised:             { minor: 1 * DAY,  standard: 12 * HOUR, material: 6 * HOUR, major: 2 * HOUR },
  delivery_in_progress:   { minor: 31 * DAY, standard: 31 * DAY, material: 31 * DAY, major: 31 * DAY },
  delivery_complete:      { minor: 3 * DAY,  standard: 2 * DAY,  material: 1 * DAY,  major: 12 * HOUR },
  meter_data_received:    { minor: 5 * DAY,  standard: 3 * DAY,  material: 2 * DAY,  major: 1 * DAY },
  reconciled:             { minor: 10 * DAY, standard: 7 * DAY,  material: 5 * DAY,  major: 3 * DAY },
  dispute_raised:         { minor: 30 * DAY, standard: 21 * DAY, material: 14 * DAY, major: 7 * DAY },
  deviation_settled:      { minor: 0,        standard: 0,        material: 0,        major: 0 },
  excused:                { minor: 0,        standard: 0,        material: 0,        major: 0 },
  cancelled:              { minor: 0,        standard: 0,        material: 0,        major: 0 },
};

export function slaWindowMinutes(status: PnomStatus, tier: PnomTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: PnomStatus, tier: PnomTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Tier RE-DERIVED on every transition from the current absolute deviation
// percentage. KEY DESIGN: a period that starts at minor can deteriorate into
// major as meter ingestion brings real numbers; a dispute resolution can bring
// a major period back to minor. The matrix and every cascade / regulator / SLA
// decision keys off whatever deviation_pct the row carries right now.
export function tierForDeviationPct(devPct: number | null | undefined): PnomTier {
  if (devPct == null || !isFinite(devPct)) return 'minor';
  const abs = Math.abs(devPct);
  if (abs < 5) return 'minor';
  if (abs < 10) return 'standard';
  if (abs < 20) return 'material';
  return 'major';
}

// The HEAVY tiers — where reportability and regulator crossings attach.
const HEAVY_TIERS = new Set<PnomTier>(['material', 'major']);

export function isHeavyTier(tier: PnomTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// NOMINATION-INTEGRITY signature — the W87 hard line.
//   raise_dispute    → regulator EVERY tier (PPA disputes go to NERSA s30)
//   excuse_period    → material + major (large excused volumes reportable)
//   settle_deviation → material + major (large penalty settlements disclosed)
export function crossesIntoRegulator(action: PnomAction, tier: PnomTier): boolean {
  if (action === 'raise_dispute') return true;
  if (action === 'excuse_period') return HEAVY_TIERS.has(tier);
  if (action === 'settle_deviation') return HEAVY_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: PnomTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for
// the HEAVY tiers (material + major).
export function isReportable(tier: PnomTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// Party each action represents. The offtaker drives nomination + reconciliation
// + dispute; the seller confirms / rejects DA; the system operator closes the
// gate; the independent meter ingests metering data. Audit attribution only —
// the route gates every action to the offtaker write set.
const ACTION_PARTY: Record<PnomAction, PnomParty> = {
  submit_da_nomination: 'offtaker',
  confirm_da:           'seller',
  reject_da:            'seller',
  submit_id_revision:   'offtaker',
  close_gate:           'system_operator',
  complete_delivery:    'seller',
  ingest_meter:         'independent_meter',
  reconcile:            'offtaker',
  raise_dispute:        'offtaker',
  resolve_dispute:      'offtaker',
  settle_deviation:     'offtaker',
  excuse_period:        'offtaker',
  cancel_nomination:    'offtaker',
};

export function partyForAction(action: PnomAction): PnomParty {
  return ACTION_PARTY[action];
}

// ─── Live nomination-integrity battery — beats Mott MacDonald PPA Manager /
//     KPMG PPA Operations / Power Advocate PPA Monitor / Open Energi VPP /
//     Schneider EcoStruxure Energy / SAP IS-U / Oracle Utilities CC&B by
//     surfacing every nomination + deviation metric LIVE on the row, not in a
//     static Excel reconciliation. Each helper takes scalars + (where
//     relevant) a `now` clock and returns a number; the route's decorate()
//     composes them.

// Absolute deviation in MWh — gates on null and forces non-negative.
export function absoluteDeviationMwh(
  metered: number | null | undefined,
  nominated: number | null | undefined,
): number {
  const m = Number(metered ?? 0);
  const n = Number(nominated ?? 0);
  return Math.round(Math.abs(m - n) * 100) / 100;
}

// Absolute deviation as percentage of nominated. Returns 0 when nominated is 0
// (avoids divide-by-zero and treats no-nom as no-deviation).
export function absoluteDeviationPct(
  metered: number | null | undefined,
  nominated: number | null | undefined,
): number {
  const n = Number(nominated ?? 0);
  if (n === 0) return 0;
  const m = Number(metered ?? 0);
  return Math.round((Math.abs(m - n) / Math.abs(n)) * 1000) / 10;
}

// Signed deviation in MWh — positive means under-delivery, negative means
// over-delivery. Used by penalty calc and the deviation badge.
export function signedDeviationMwh(
  metered: number | null | undefined,
  nominated: number | null | undefined,
): number {
  const m = Number(metered ?? 0);
  const n = Number(nominated ?? 0);
  return Math.round((n - m) * 100) / 100;
}

// Deviation value in ZAR — abs MWh × deviation tariff. The route supplies the
// deviation tariff (typically PPA tariff × 1.05 to 1.25 for penalty band).
export function deviationValueZar(
  absDeviationMwh: number,
  deviationTariffZarPerMwh: number | null | undefined,
): number {
  const tariff = Number(deviationTariffZarPerMwh ?? 0);
  if (tariff <= 0) return 0;
  return Math.round(absDeviationMwh * tariff);
}

// Predicted penalty — abs deviation × tariff × penalty multiplier (1.0 when
// within standard tolerance; 1.5 for material; 2.0 for major). Mirrors typical
// PPA deviation-band structure.
export function predictedPenaltyZar(absDevPct: number, deviationValue: number): number {
  let multiplier = 1.0;
  if (absDevPct >= 20) multiplier = 2.0;
  else if (absDevPct >= 10) multiplier = 1.5;
  else if (absDevPct >= 5) multiplier = 1.2;
  return Math.round(deviationValue * multiplier);
}

// Capacity factor realized — metered MWh ÷ (installed capacity MW × period
// hours). Compares actual generation against nameplate over the period.
export function capacityFactorRealized(
  meteredMwh: number | null | undefined,
  installedCapacityMw: number | null | undefined,
  periodHours: number,
): number {
  const m = Number(meteredMwh ?? 0);
  const cap = Number(installedCapacityMw ?? 0);
  if (cap <= 0 || periodHours <= 0) return 0;
  const max = cap * periodHours;
  return Math.round((m / max) * 1000) / 10;
}

// Forecast accuracy — 1 - |dev|/nominated, capped at 0 and 100. A clean
// nomination is 100; a 30% deviation is 70.
export function forecastAccuracyPct(absDevPct: number): number {
  const acc = 100 - absDevPct;
  if (acc <= 0) return 0;
  if (acc >= 100) return 100;
  return Math.round(acc * 10) / 10;
}

// Weather-normalised deviation — strips out weather-attributable deviation
// (irradiance / wind shortfall vs P50). Returns the residual deviation pct
// after weather normalisation. A negative number means weather "explains" more
// than 100% of the observed deviation.
export function weatherNormalizedDeviation(
  absDevPct: number,
  weatherAttributablePct: number | null | undefined,
): number {
  const wx = Number(weatherAttributablePct ?? 0);
  return Math.round((absDevPct - wx) * 10) / 10;
}

// Deviation trend over the trailing 3 periods (rolling mean). The route
// supplies the three prior period deviation pcts; this just guards against
// nulls and rounds.
export function deviationTrend3Period(
  d1: number | null | undefined,
  d2: number | null | undefined,
  d3: number | null | undefined,
): number {
  const values = [d1, d2, d3].map((v) => Number(v ?? 0));
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / 3) * 10) / 10;
}

// Predicted resolution days remaining — based on current state and tier.
// Returns the SLA window in days; 0 for terminals or no deadline.
export function predictedResolutionDays(status: PnomStatus, tier: PnomTier): number {
  const minutes = SLA_MINUTES[status]?.[tier] ?? 0;
  return Math.round((minutes / (60 * 24)) * 10) / 10;
}

// Days remaining in the current state's SLA window.
export function slaDaysRemaining(
  status: PnomStatus,
  tier: PnomTier,
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

// Urgency band derived from absolute deviation pct + SLA days remaining.
// Mirrors W86 urgency band: critical / high / medium / low.
//   critical : |dev| >= 20% OR days_remaining < 1
//   high     : |dev| >= 10% OR days_remaining < 3
//   medium   : |dev| >= 5%  OR days_remaining < 7
//   low      : everything else
export type PnomUrgency = 'critical' | 'high' | 'medium' | 'low';

export function urgencyBand(absDevPct: number, daysRemaining: number): PnomUrgency {
  if (absDevPct >= 20 || (daysRemaining > 0 && daysRemaining < 1)) return 'critical';
  if (absDevPct >= 10 || (daysRemaining > 0 && daysRemaining < 3)) return 'high';
  if (absDevPct >= 5 || (daysRemaining > 0 && daysRemaining < 7)) return 'medium';
  return 'low';
}
