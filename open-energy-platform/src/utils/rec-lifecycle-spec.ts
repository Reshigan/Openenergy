// ─────────────────────────────────────────────────────────────────────────
// Wave 70 — REC / Guarantee-of-Origin Certificate Lifecycle (P6)
//
// A best-in-class offtaker does not just buy electricity — it buys (and must be
// able to PROVE it owns and has CONSUMED) the renewable ATTRIBUTE of that
// electricity. The environmental attribute travels separately from the energy as
// a tradeable certificate, one per MWh of verified renewable generation:
//   - I-REC Standard certificates (the dominant instrument in the SA market)
//   - South African Renewable Energy Certificates (SAREC / AReP)
//   - EU Guarantee-of-Origin (GO) analogue for cross-border claims
// The offtaker RETIRES certificates to substantiate a renewable-consumption claim
// under the GHG Protocol Scope 2 market-based method (RE100 / CDP / carbon-tax
// offset substantiation). The integrity of that claim depends on a strict,
// auditable lifecycle that prevents DOUBLE COUNTING — the same MWh attribute can
// only be issued once, owned by one party at a time, and retired once.
//
// W70 is the ATTRIBUTE-CERTIFICATE lifecycle — distinct from the rest of the
// offtaker suite, which all govern the ENERGY / MONEY relationship:
//   - [[project-wave22-ppa-contract-chain]] executes the PPA itself
//   - [[project-wave32-take-or-pay-chain]] bills contracted-vs-delivered volume
//   - [[project-wave39-tariff-indexation-chain]] reprices the energy (CPI)
//   - [[project-wave46-curtailment-claim-chain]] pays for curtailed deemed-energy
//   - [[project-wave54-payment-security-chain]] backstops payment (LC / guarantee)
//   - [[project-wave62-ppa-termination-chain]] exits the offtake relationship
//   - W7 portal tracks contracted-vs-delivered MWh
// W70 governs the renewable ATTRIBUTE: who certified it, who owns it, and the
// retirement claim the offtaker ultimately makes against its carbon footprint.
//
// Forward path (requested → reviewed → issued → listed → transferred → allocated
// → retired):
//   issuance_requested → eligibility_review → issued → listed_for_transfer
//     → transferred → allocated → retired
//
// Eligibility failure (accreditation / vintage / metering does not check out):
//   eligibility_review → rejected
//
// Integrity-dispute branch (a post-issuance challenge — double counting, wrong
// vintage, metering error):
//   {transferred, allocated} → disputed
//   disputed → allocated (dismissed, restored) | clawed_back (upheld, revoked)
//
// Terminals:
//   allocated → retired (TERMINAL-good — renewable claim made)
//   {issuance_requested, issued, listed_for_transfer} → cancelled (voluntary)
//   eligibility_review → rejected (failed eligibility)
//   disputed → clawed_back (revoked on upheld integrity dispute)
//   {issued, listed_for_transfer, transferred, allocated} → expired (vintage lapse)
//
// Tiers (5) by MWh REPRESENTED (volume of certified renewable electricity), with a
// floor escalation for a certificate destined for a COMPLIANCE / regulatory claim
// (carbon-tax offset, mandated renewable obligation) — a compliance-bound
// certificate carries the same scrutiny as a large one regardless of volume:
//   minor <1k MWh / moderate <10k / material <50k / major <200k / critical >=200k
//
// SLA matrix is INVERTED — the LARGER the volume / the more it is a compliance
// claim, the MORE time each verification window allows (more metering data and
// registry scrutiny). Same flavour as [[project-wave65-carbon-erpa-chain]] / W53 /
// W43 / W33.
//
// Reportability — the W70 SIGNATURE is INTEGRITY-driven. A clawed-back certificate
// is a double-counting / fraud event for the registry and always notifiable:
//   claw_back crosses for EVERY tier — the distinctive "the integrity terminal is
//        always reportable" crossing (cf. W69 mark_lapsed, W68 declare_default,
//        W60 invoke_kill_switch).
//   reject_issuance crosses for the high tiers (major + critical) — a large
//        issuance failing eligibility is notifiable.
//   sla_breached crosses for the high tiers (major + critical).
//
// Two-party write: the ISSUER / REGISTRY (generator + registry operator) drives
// issuance, eligibility, listing, transfer, dispute resolution, claw-back and
// expiry; the HOLDER (offtaker) allocates consumption, retires the certificate and
// raises integrity disputes. actor_party tags each step, and the route gates the
// holder actions to the offtaker write set and everything else to the issuer set.
// ─────────────────────────────────────────────────────────────────────────

export type RecStatus =
  | 'issuance_requested'
  | 'eligibility_review'
  | 'issued'
  | 'listed_for_transfer'
  | 'transferred'
  | 'allocated'
  | 'retired'
  | 'cancelled'
  | 'rejected'
  | 'disputed'
  | 'clawed_back'
  | 'expired';

export type RecAction =
  | 'begin_eligibility_review'
  | 'approve_issuance'
  | 'reject_issuance'
  | 'list_for_transfer'
  | 'transfer_certificate'
  | 'allocate_consumption'
  | 'retire_certificate'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'claw_back'
  | 'cancel_certificate'
  | 'expire_certificate';

export type RecTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

export type RecParty = 'issuer' | 'holder';

export type RecEvent =
  | 'rec_lifecycle.eligibility_review'
  | 'rec_lifecycle.issued'
  | 'rec_lifecycle.listed_for_transfer'
  | 'rec_lifecycle.transferred'
  | 'rec_lifecycle.allocated'
  | 'rec_lifecycle.retired'
  | 'rec_lifecycle.cancelled'
  | 'rec_lifecycle.rejected'
  | 'rec_lifecycle.disputed'
  | 'rec_lifecycle.clawed_back'
  | 'rec_lifecycle.expired'
  | 'rec_lifecycle.sla_breached';

const TERMINALS = new Set<RecStatus>(['retired', 'cancelled', 'rejected', 'clawed_back', 'expired']);

const WITHDRAWABLE = new Set<RecStatus>(['issuance_requested', 'issued', 'listed_for_transfer']);

export function isTerminal(s: RecStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: RecStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export const TRANSITIONS: Record<RecAction, { from: RecStatus[]; to: RecStatus }> = {
  begin_eligibility_review: { from: ['issuance_requested'],                                          to: 'eligibility_review' },
  approve_issuance:         { from: ['eligibility_review'],                                          to: 'issued' },
  reject_issuance:          { from: ['eligibility_review'],                                          to: 'rejected' },
  list_for_transfer:        { from: ['issued'],                                                      to: 'listed_for_transfer' },
  transfer_certificate:     { from: ['listed_for_transfer'],                                         to: 'transferred' },
  allocate_consumption:     { from: ['transferred'],                                                 to: 'allocated' },
  retire_certificate:       { from: ['allocated'],                                                   to: 'retired' },
  raise_dispute:            { from: ['transferred', 'allocated'],                                    to: 'disputed' },
  resolve_dispute:          { from: ['disputed'],                                                    to: 'allocated' },
  claw_back:                { from: ['disputed'],                                                    to: 'clawed_back' },
  cancel_certificate:       { from: ['issuance_requested', 'issued', 'listed_for_transfer'],         to: 'cancelled' },
  expire_certificate:       { from: ['issued', 'listed_for_transfer', 'transferred', 'allocated'],   to: 'expired' },
};

export function nextStatus(current: RecStatus, action: RecAction): RecStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: RecStatus): RecAction[] {
  const acts: RecAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [RecAction, typeof TRANSITIONS[RecAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// INVERTED matrix — the LARGER the volume / the more it is a compliance claim, the
// MORE time each verification window allows. Strictly increasing minor → critical
// per graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<RecStatus, Record<RecTier, number>> = {
  issuance_requested: {
    minor: 3 * DAY, moderate: 5 * DAY, material: 7 * DAY, major: 10 * DAY, critical: 14 * DAY,
  },
  eligibility_review: {
    minor: 5 * DAY, moderate: 7 * DAY, material: 14 * DAY, major: 21 * DAY, critical: 30 * DAY,
  },
  issued: {
    minor: 30 * DAY, moderate: 45 * DAY, material: 60 * DAY, major: 90 * DAY, critical: 120 * DAY,
  },
  listed_for_transfer: {
    minor: 14 * DAY, moderate: 21 * DAY, material: 30 * DAY, major: 45 * DAY, critical: 60 * DAY,
  },
  transferred: {
    minor: 30 * DAY, moderate: 45 * DAY, material: 60 * DAY, major: 90 * DAY, critical: 120 * DAY,
  },
  allocated: {
    minor: 30 * DAY, moderate: 45 * DAY, material: 60 * DAY, major: 90 * DAY, critical: 120 * DAY,
  },
  disputed: {
    minor: 7 * DAY, moderate: 10 * DAY, material: 14 * DAY, major: 21 * DAY, critical: 30 * DAY,
  },
  retired:     { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  cancelled:   { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  rejected:    { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  clawed_back: { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  expired:     { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
};

export function slaWindowMinutes(status: RecStatus, tier: RecTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: RecStatus, tier: RecTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const TIER_RANK: Record<RecTier, number> = {
  minor: 0, moderate: 1, material: 2, major: 3, critical: 4,
};

const RANK_TIER: RecTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];

// Base tier from the certified volume (MWh represented).
export function tierForMwh(mwh: number): RecTier {
  if (mwh < 1000) return 'minor';
  if (mwh < 10000) return 'moderate';
  if (mwh < 50000) return 'material';
  if (mwh < 200000) return 'major';
  return 'critical';
}

// A certificate destined for a COMPLIANCE / regulatory claim (carbon-tax offset,
// mandated renewable obligation) carries heightened scrutiny — floor its tier at
// 'major' regardless of volume.
export function complianceFloor(complianceCritical: boolean): RecTier {
  return complianceCritical ? 'major' : 'minor';
}

// Effective tier = the higher of the volume-based tier and the compliance floor.
export function tierForCertificate(mwh: number, complianceCritical: boolean): RecTier {
  const base = tierForMwh(mwh);
  const floor = complianceFloor(complianceCritical);
  const rank = Math.max(TIER_RANK[base], TIER_RANK[floor]);
  return RANK_TIER[rank];
}

// The high tiers — reportability for rejected issuances and SLA breaches attaches here.
const HIGH_TIERS = new Set<RecTier>(['major', 'critical']);

export function isHighTier(tier: RecTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Reportability matrix (the W70 signature):
//   - claw_back crosses for EVERY tier — a revoked certificate is always a
//     double-counting / integrity event for the registry.
//   - reject_issuance crosses for the high tiers (major + critical).
export function crossesIntoRegulator(action: RecAction, tier: RecTier): boolean {
  if (action === 'claw_back')       return true;
  if (action === 'reject_issuance') return HIGH_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: RecTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for the
// high tiers (major + critical).
export function isReportable(tier: RecTier): boolean {
  return HIGH_TIERS.has(tier);
}

// The holder (offtaker) allocates consumption, retires the certificate and raises
// integrity disputes; the issuer / registry drives everything else.
const HOLDER_ACTIONS = new Set<RecAction>(['allocate_consumption', 'retire_certificate', 'raise_dispute']);

export function isHolderAction(action: RecAction): boolean {
  return HOLDER_ACTIONS.has(action);
}

export function partyForAction(action: RecAction): RecParty {
  return HOLDER_ACTIONS.has(action) ? 'holder' : 'issuer';
}
