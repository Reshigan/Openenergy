// ─────────────────────────────────────────────────────────────────────────
// Wave 54 — Offtaker PPA Payment Security / Credit Support Instrument chain (P6)
//
// The financial-assurance backbone of a bankable PPA. Under any REIPPPP /
// bilateral PPA, the BUYER (offtaker) must post and maintain a payment-security
// instrument — a letter of credit, on-demand bank guarantee, or parent-company
// guarantee — sized to its rolling payment exposure (typically 1-3 months of
// invoices). The instrument backstops the seller's (IPP's) revenue and, through
// it, the project's debt service. This chain governs the instrument's whole
// life: posting, verification, periodic adequacy review, drawdown on a payment
// default, mandatory replenishment, renewal before expiry, substitution, and
// release at PPA term.
//
// It is the BUYER-SIDE credit-support counterpart to the SELLER-SIDE bonds in
// [[project-wave10-ipp-bonds]] (the IPP posts performance / construction bonds;
// the offtaker posts payment security). It secures payment under the PPA set up
// by [[project-wave22-ppa-contract-chain]], at the tariff repriced by
// [[project-wave39-tariff-indexation-chain]]; a drawdown here is the security
// consequence of the buyer non-payment that [[project-wave32-take-or-pay-chain]]
// and [[project-wave7-offtaker-portal]] surface; and lenders treat a maintained
// instrument as a condition of the debt facility originated in
// [[project-wave53-credit-origination-chain]] and drawn in
// [[project-wave21-drawdown-chain]].
//
//   security_required → instrument_submitted → under_verification
//     → active → adequacy_review → active        (periodic adequacy loop)
//   active → release → released                  (PPA term reached — clean close)
//
// Drawdown branch (buyer payment default → call on the security):
//   active → drawdown_initiated → replenishment_pending
//     → submit_instrument (re-verify) → active   (security restored)
//     → forfeit → forfeited                       (failed to replenish)
//
// Expiry branch (time-driven countdown):
//   active → expiry_pending → submit_instrument (renewal re-verify) → active
//                           → forfeit → forfeited
//
// Substitution branch (exposure grew — bigger instrument required):
//   adequacy_review → require_increase → substitution_pending
//     → submit_instrument (replacement re-verify) → active
//     → forfeit → forfeited
//
// Verification failure:
//   under_verification → reject_instrument → rejected
//
// submit_instrument is the universal "post / re-post the instrument" action: it
// fires from security_required AND from replenishment_pending, expiry_pending
// and substitution_pending, routing every restore path back through
// instrument_submitted → under_verification → activate so any change to the
// security is always re-verified.
//
// Tiers (5) by the SECURED AMOUNT in ZAR millions — drive SLA + reportability:
//   minor <10 / moderate <50 / material <200 / major <1000 / critical >=1000
//
// SLA matrix is URGENT — the LARGER the secured exposure, the TIGHTER every
// window (a critical-tier instrument left un-replenished leaves a large IPP's
// debt service unsecured, so it must be cured fastest). Same flavour as
// [[project-wave46-curtailment-claim-chain]]; opposite of the INVERTED
// [[project-wave53-credit-origination-chain]].
//
// Reportability (the W54 signature) — forfeit crosses the regulator for EVERY
// tier: a forfeited PPA payment security is a security-of-supply red flag at any
// scale (the buyer can no longer assure payment, threatening the project's
// bankability — a universal hard line, like W45 write-off / W29 forced-liq).
//   - forfeit crosses for EVERY tier (the signature)
//   - initiate_drawdown (a call on the security = a material buyer payment
//     default) + reject_instrument (a critical PPA left unsecured) cross for the
//     large tiers (major + critical) only
//   - SLA breaches cross for major + critical only
//
// actor_party (offtaker / seller) is derived from the ACTION, not the JWT role
// — same model as [[project-wave46-curtailment-claim-chain]] /
// [[project-wave53-credit-origination-chain]]. The OFFTAKER (buyer) posts /
// replenishes / renews / substitutes the instrument (submit_instrument); the
// SELLER (IPP beneficiary, or facility agent) verifies, activates, runs adequacy
// review, draws down, forfeits, and releases. The offtaker-write set is guarded
// server-side.
// ─────────────────────────────────────────────────────────────────────────

export type PaymentSecurityStatus =
  | 'security_required'
  | 'instrument_submitted'
  | 'under_verification'
  | 'active'
  | 'adequacy_review'
  | 'drawdown_initiated'
  | 'replenishment_pending'
  | 'expiry_pending'
  | 'substitution_pending'
  | 'released'
  | 'forfeited'
  | 'rejected';

export type PaymentSecurityAction =
  | 'submit_instrument'
  | 'begin_verification'
  | 'activate'
  | 'reject_instrument'
  | 'open_adequacy_review'
  | 'confirm_adequate'
  | 'require_increase'
  | 'initiate_drawdown'
  | 'open_replenishment'
  | 'flag_expiry'
  | 'forfeit'
  | 'release';

export type PaymentSecurityTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

export type PaymentSecurityEvent =
  | 'payment_security.instrument_submitted'
  | 'payment_security.under_verification'
  | 'payment_security.active'
  | 'payment_security.rejected'
  | 'payment_security.adequacy_review'
  | 'payment_security.substitution_pending'
  | 'payment_security.drawdown_initiated'
  | 'payment_security.replenishment_pending'
  | 'payment_security.expiry_pending'
  | 'payment_security.released'
  | 'payment_security.forfeited'
  | 'payment_security.sla_breached';

const TERMINALS = new Set<PaymentSecurityStatus>([
  'released', 'forfeited', 'rejected',
]);

export function isTerminal(s: PaymentSecurityStatus): boolean {
  return TERMINALS.has(s);
}

// The four source states from which the offtaker (re-)posts an instrument: the
// initial requirement, plus the three restore paths (replenish / renew /
// substitute) that all route back through verification.
const SUBMIT_FROM = new Set<PaymentSecurityStatus>([
  'security_required', 'replenishment_pending', 'expiry_pending', 'substitution_pending',
]);

export const TRANSITIONS: Record<PaymentSecurityAction, { from: PaymentSecurityStatus[]; to: PaymentSecurityStatus }> = {
  submit_instrument:   { from: [...SUBMIT_FROM],              to: 'instrument_submitted' },
  begin_verification:  { from: ['instrument_submitted'],      to: 'under_verification' },
  activate:            { from: ['under_verification'],        to: 'active' },
  reject_instrument:   { from: ['under_verification'],        to: 'rejected' },
  open_adequacy_review:{ from: ['active'],                    to: 'adequacy_review' },
  confirm_adequate:    { from: ['adequacy_review'],           to: 'active' },
  require_increase:    { from: ['adequacy_review'],           to: 'substitution_pending' },
  initiate_drawdown:   { from: ['active'],                    to: 'drawdown_initiated' },
  open_replenishment:  { from: ['drawdown_initiated'],        to: 'replenishment_pending' },
  flag_expiry:         { from: ['active'],                    to: 'expiry_pending' },
  forfeit:             { from: ['replenishment_pending', 'expiry_pending', 'substitution_pending'], to: 'forfeited' },
  release:             { from: ['active'],                    to: 'released' },
};

export function nextStatus(current: PaymentSecurityStatus, action: PaymentSecurityAction): PaymentSecurityStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: PaymentSecurityStatus): PaymentSecurityAction[] {
  const acts: PaymentSecurityAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [PaymentSecurityAction, typeof TRANSITIONS[PaymentSecurityAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the larger the secured exposure, the TIGHTER every window.
// Strictly decreasing minor → critical per graded state. `active` is a healthy
// steady state with no action-forcing deadline (0 = no countdown); terminals 0.
export const SLA_MINUTES: Record<PaymentSecurityStatus, Record<PaymentSecurityTier, number>> = {
  security_required: {
    minor: 20 * DAY, moderate: 15 * DAY, material: 10 * DAY, major: 7 * DAY, critical: 5 * DAY,
  },
  instrument_submitted: {
    minor: 7 * DAY, moderate: 5 * DAY, material: 4 * DAY, major: 3 * DAY, critical: 2 * DAY,
  },
  under_verification: {
    minor: 15 * DAY, moderate: 10 * DAY, material: 7 * DAY, major: 5 * DAY, critical: 3 * DAY,
  },
  adequacy_review: {
    minor: 20 * DAY, moderate: 15 * DAY, material: 10 * DAY, major: 7 * DAY, critical: 5 * DAY,
  },
  drawdown_initiated: {
    minor: 5 * DAY, moderate: 4 * DAY, material: 3 * DAY, major: 2 * DAY, critical: 1 * DAY,
  },
  replenishment_pending: {
    minor: 10 * DAY, moderate: 7 * DAY, material: 5 * DAY, major: 3 * DAY, critical: 2 * DAY,
  },
  expiry_pending: {
    minor: 15 * DAY, moderate: 10 * DAY, material: 7 * DAY, major: 5 * DAY, critical: 3 * DAY,
  },
  substitution_pending: {
    minor: 15 * DAY, moderate: 10 * DAY, material: 7 * DAY, major: 5 * DAY, critical: 3 * DAY,
  },
  active:    { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  released:  { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  forfeited: { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  rejected:  { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
};

export function slaWindowMinutes(status: PaymentSecurityStatus, tier: PaymentSecurityTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: PaymentSecurityStatus, tier: PaymentSecurityTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// 5 tiers by the secured amount in ZAR millions.
export function tierForSecurityZarM(amountZarM: number): PaymentSecurityTier {
  if (amountZarM < 10) return 'minor';
  if (amountZarM < 50) return 'moderate';
  if (amountZarM < 200) return 'material';
  if (amountZarM < 1000) return 'major';
  return 'critical';
}

// The large-exposure tiers — material reportability for drawdowns, rejections
// and SLA breaches attaches here (smaller tiers sit below the NERSA threshold).
const LARGE_TIERS = new Set<PaymentSecurityTier>(['major', 'critical']);

export function isLargeTier(tier: PaymentSecurityTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Reportability matrix (the W54 signature):
//   - forfeit crosses for EVERY tier — a forfeited PPA payment security is a
//     security-of-supply red flag at any scale (the universal hard line)
//   - initiate_drawdown (a call on the security = a material buyer payment
//     default) + reject_instrument (a critical PPA left unsecured) cross for the
//     large tiers (major + critical) only
export function crossesIntoRegulator(action: PaymentSecurityAction, tier: PaymentSecurityTier): boolean {
  if (action === 'forfeit') return true;
  if (action === 'initiate_drawdown' || action === 'reject_instrument') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: PaymentSecurityTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Party each action represents (contractual function), not the login role. The
// OFFTAKER (buyer) posts / replenishes / renews / substitutes the instrument;
// the SELLER (IPP beneficiary or facility agent) verifies, activates, runs
// adequacy review, draws down, forfeits and releases.
const ACTION_PARTY: Record<PaymentSecurityAction, 'offtaker' | 'seller'> = {
  submit_instrument:    'offtaker',
  begin_verification:   'seller',
  activate:             'seller',
  reject_instrument:    'seller',
  open_adequacy_review: 'seller',
  confirm_adequate:     'seller',
  require_increase:     'seller',
  initiate_drawdown:    'seller',
  open_replenishment:   'seller',
  flag_expiry:          'seller',
  forfeit:              'seller',
  release:              'seller',
};

export function partyForAction(action: PaymentSecurityAction): 'offtaker' | 'seller' {
  return ACTION_PARTY[action];
}

// Offtaker-side write set (guarded server-side via the two-party split). The
// offtaker's sole obligation through the lifecycle is to post / re-post the
// instrument — everything else is administered by the seller (beneficiary).
const OFFTAKER_ACTIONS = new Set<PaymentSecurityAction>(['submit_instrument']);

export function isOfftakerAction(action: PaymentSecurityAction): boolean {
  return OFFTAKER_ACTIONS.has(action);
}
