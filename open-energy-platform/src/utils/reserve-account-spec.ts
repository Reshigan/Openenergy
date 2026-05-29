// ─────────────────────────────────────────────────────────────────────────
// Wave 77 — Reserve-Account (DSRA / MRA) Funding, Drawdown, Cure & Release (P6)
//
// A project-finance facility agreement requires the borrower to fund and
// MAINTAIN one or more controlled reserve accounts — the Debt Service Reserve
// Account (DSRA, typically the next 6 months of debt service) and the
// Maintenance / Major-Maintenance Reserve Account (MRA). The account is a
// charged / controlled account: the borrower funds it (cash or an acceptable
// letter of credit), the agent bank monitors the target balance on every test
// date, and a shortfall must be CURED inside a contractual window. A legitimate
// DRAW (to meet debt service the project cashflow could not) must be REPLENISHED
// inside a top-up window. At final maturity, deleveraging or a contractual
// step-down the reserve is RELEASED back to the borrower. A failure to cure a
// shortfall or replenish a draw is an EVENT OF DEFAULT — always notifiable.
//
// This is the L4 deepening of the flat /lender/reserves CRUD surface — it turns
// a static balance record into a funding → shortfall → cure → release lifecycle.
// Distinct from the rest of the Lender book:
//   - [[project_wave21_drawdown_chain]] certifies LOAN drawdowns (money out to build)
//   - [[project_wave30_disbursement_chain]] reconciles USE OF PROCEEDS
//   - [[project_wave38_covenant_certificate_chain]] tests DSCR/LLCR covenants
//   - [[project_wave45_loan_default_chain]] runs enforcement once default is declared
//   - [[project_wave53_credit_origination_chain]] originates the FACILITY
//   - [[project_wave69_security_perfection_chain]] perfects the SECURITY package
// W77 governs the RESERVE-ACCOUNT funding / shortfall / cure / draw / release leg
// that keeps the debt-service and maintenance buffers whole — the Loan IQ / FIS
// reserve-account module, beaten with forward-looking target-balance computation,
// automated test-date shortfall detection, a graded cure-window countdown and an
// automatic regulator crossing the moment a reserve breach (event of default) is
// declared.
//
// Forward path (healthy life of a reserve obligation):
//   reserve_required → funding_scheduled → funding_in_progress → funded
//     → … (monitored) … → release_requested → released
//
// Shortfall branch (a test date shows balance < target — LC lapse, FX, missed sweep):
//   funded → shortfall_flagged → cure_pending → (replenish | waive) funded
//                                              → (declare_breach) breached
//
// Authorised-draw branch (reserve legitimately used to meet debt service):
//   funded → drawdown_authorized → drawn → (replenish | waive) funded
//                                         → (declare_breach) breached
//   (a draw may also be authorised straight out of a flagged shortfall:
//    shortfall_flagged → drawdown_authorized)
//
// Cancel (obligation falls away before funding — facility cancelled / refinanced):
//   {reserve_required, funding_scheduled, funding_in_progress} → cancelled
//
// Tiers (5) by reserve TARGET amount (ZAR):
//   small <R10m / medium <R50m / large <R250m / major <R1bn / systemic >=R1bn
// LARGE_TIERS = {major, systemic}.
//
// SLA matrix is URGENT — the LARGER the reserve target, the TIGHTER every window
// (a shortfall on a systemic-facility DSRA is a far more serious prudential signal
// demanding faster cure). Same flavour as [[project_wave69_security_perfection_chain]]
// / [[project_wave68_counterparty_margin_chain]]. The healthy steady state `funded`
// carries no deadline (it is not swept).
//
// Reportability — the W77 SIGNATURE is BREACH-DRIVEN. A failure to cure / replenish
// is an event of default:
//   declare_breach crosses for EVERY tier — the distinctive "a reserve breach is
//        always reportable" crossing (mirror of W45 write_off / W69 mark_lapsed /
//        W68 declare_default).
//   waive_requirement crosses for the LARGE tiers (major + systemic) — lender
//        forbearance on a systemic reserve is a prudential disclosure.
//   sla_breached crosses for the LARGE tiers (major + systemic).
//
// Single write — the agent / lender drives every step; the borrower funds and the
// account bank moves cash out-of-band. actor_party tags whether a step represents
// the lender (agent), the borrower or the account bank, for the audit trail. The
// route gates every action to the lender write set {admin, lender}.
// ─────────────────────────────────────────────────────────────────────────

export type ReserveStatus =
  | 'reserve_required'
  | 'funding_scheduled'
  | 'funding_in_progress'
  | 'funded'
  | 'shortfall_flagged'
  | 'cure_pending'
  | 'drawdown_authorized'
  | 'drawn'
  | 'release_requested'
  | 'released'
  | 'breached'
  | 'cancelled';

export type ReserveAction =
  | 'schedule_funding'
  | 'commence_funding'
  | 'confirm_funding'
  | 'flag_shortfall'
  | 'open_cure'
  | 'authorize_drawdown'
  | 'execute_drawdown'
  | 'replenish_reserve'
  | 'waive_requirement'
  | 'declare_breach'
  | 'request_release'
  | 'release_reserve'
  | 'cancel_reserve';

export type ReserveTier = 'small' | 'medium' | 'large' | 'major' | 'systemic';

export type ReserveParty = 'lender' | 'borrower' | 'account_bank';

export type ReserveEvent =
  | 'reserve_account.funding_scheduled'
  | 'reserve_account.funding_in_progress'
  | 'reserve_account.funded'
  | 'reserve_account.shortfall_flagged'
  | 'reserve_account.cure_pending'
  | 'reserve_account.drawdown_authorized'
  | 'reserve_account.drawn'
  | 'reserve_account.release_requested'
  | 'reserve_account.released'
  | 'reserve_account.breached'
  | 'reserve_account.cancelled'
  | 'reserve_account.sla_breached';

const TERMINALS = new Set<ReserveStatus>(['released', 'breached', 'cancelled']);

// States from which the reserve obligation can still be cancelled — only before
// it has been funded. Once funded, the buffer is live and exits via release.
const CANCELLABLE = new Set<ReserveStatus>([
  'reserve_required',
  'funding_scheduled',
  'funding_in_progress',
]);

export function isTerminal(s: ReserveStatus): boolean {
  return TERMINALS.has(s);
}

export function isCancellable(s: ReserveStatus): boolean {
  return CANCELLABLE.has(s);
}

export const TRANSITIONS: Record<ReserveAction, { from: ReserveStatus[]; to: ReserveStatus }> = {
  schedule_funding:   { from: ['reserve_required'],                              to: 'funding_scheduled' },
  commence_funding:   { from: ['funding_scheduled'],                             to: 'funding_in_progress' },
  confirm_funding:    { from: ['funding_in_progress'],                           to: 'funded' },
  flag_shortfall:     { from: ['funded'],                                        to: 'shortfall_flagged' },
  open_cure:          { from: ['shortfall_flagged'],                             to: 'cure_pending' },
  authorize_drawdown: { from: ['funded', 'shortfall_flagged'],                   to: 'drawdown_authorized' },
  execute_drawdown:   { from: ['drawdown_authorized'],                           to: 'drawn' },
  replenish_reserve:  { from: ['cure_pending', 'drawn'],                         to: 'funded' },
  waive_requirement:  { from: ['cure_pending', 'drawn'],                         to: 'funded' },
  declare_breach:     { from: ['cure_pending', 'drawn'],                         to: 'breached' },
  request_release:    { from: ['funded'],                                        to: 'release_requested' },
  release_reserve:    { from: ['release_requested'],                             to: 'released' },
  cancel_reserve:     { from: ['reserve_required', 'funding_scheduled', 'funding_in_progress'], to: 'cancelled' },
};

export function nextStatus(current: ReserveStatus, action: ReserveAction): ReserveStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: ReserveStatus): ReserveAction[] {
  const acts: ReserveAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [ReserveAction, typeof TRANSITIONS[ReserveAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER the reserve target, the TIGHTER every window. Strictly
// decreasing small → systemic per graded state. The healthy steady state `funded`
// and the terminals carry no deadline (not swept).
export const SLA_MINUTES: Record<ReserveStatus, Record<ReserveTier, number>> = {
  reserve_required: {
    small: 30 * DAY, medium: 21 * DAY, large: 14 * DAY, major: 10 * DAY, systemic: 7 * DAY,
  },
  funding_scheduled: {
    small: 21 * DAY, medium: 14 * DAY, large: 10 * DAY, major: 7 * DAY, systemic: 5 * DAY,
  },
  funding_in_progress: {
    small: 14 * DAY, medium: 10 * DAY, large: 7 * DAY, major: 5 * DAY, systemic: 3 * DAY,
  },
  funded: {
    small: 0, medium: 0, large: 0, major: 0, systemic: 0,
  },
  shortfall_flagged: {
    small: 7 * DAY, medium: 5 * DAY, large: 3 * DAY, major: 2 * DAY, systemic: 24 * HOUR,
  },
  cure_pending: {
    small: 30 * DAY, medium: 21 * DAY, large: 14 * DAY, major: 10 * DAY, systemic: 7 * DAY,
  },
  drawdown_authorized: {
    small: 7 * DAY, medium: 5 * DAY, large: 3 * DAY, major: 2 * DAY, systemic: 24 * HOUR,
  },
  drawn: {
    small: 60 * DAY, medium: 45 * DAY, large: 30 * DAY, major: 21 * DAY, systemic: 14 * DAY,
  },
  release_requested: {
    small: 21 * DAY, medium: 14 * DAY, large: 10 * DAY, major: 7 * DAY, systemic: 5 * DAY,
  },
  released:  { small: 0, medium: 0, large: 0, major: 0, systemic: 0 },
  breached:  { small: 0, medium: 0, large: 0, major: 0, systemic: 0 },
  cancelled: { small: 0, medium: 0, large: 0, major: 0, systemic: 0 },
};

export function slaWindowMinutes(status: ReserveStatus, tier: ReserveTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: ReserveStatus, tier: ReserveTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// Base tier from the reserve TARGET amount (ZAR).
export function tierForTargetZar(zar: number): ReserveTier {
  if (zar < 10000000) return 'small';
  if (zar < 50000000) return 'medium';
  if (zar < 250000000) return 'large';
  if (zar < 1000000000) return 'major';
  return 'systemic';
}

// The LARGE tiers — reportability for waivers and SLA breaches attaches here.
const LARGE_TIERS = new Set<ReserveTier>(['major', 'systemic']);

export function isLargeTier(tier: ReserveTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix (the W77 signature):
//   - declare_breach crosses for EVERY tier — a failure to cure / replenish is an
//     event of default and always notifiable (SARB prudential / impairment).
//   - waive_requirement crosses for the LARGE tiers (major + systemic) — lender
//     forbearance on a systemic reserve is a prudential disclosure.
export function crossesIntoRegulator(action: ReserveAction, tier: ReserveTier): boolean {
  if (action === 'declare_breach')    return true;
  if (action === 'waive_requirement') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: ReserveTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for the
// LARGE tiers (major + systemic).
export function isReportable(tier: ReserveTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party each action represents. The agent / lender drives the machinery; the
// borrower funds, replenishes, requests release and cancels; the account bank
// confirms balances and moves cash on a draw / release. Audit attribution only —
// the route gates every action to the lender write set.
const ACTION_PARTY: Record<ReserveAction, ReserveParty> = {
  schedule_funding:   'lender',
  commence_funding:   'borrower',
  confirm_funding:    'account_bank',
  flag_shortfall:     'lender',
  open_cure:          'lender',
  authorize_drawdown: 'lender',
  execute_drawdown:   'account_bank',
  replenish_reserve:  'borrower',
  waive_requirement:  'lender',
  declare_breach:     'lender',
  request_release:    'borrower',
  release_reserve:    'account_bank',
  cancel_reserve:     'lender',
};

export function partyForAction(action: ReserveAction): ReserveParty {
  return ACTION_PARTY[action];
}
