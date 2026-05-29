// ─────────────────────────────────────────────────────────────────────────
// Wave 82 — Carbon Credit Issuance & Serialization chain (P6)
//
// The MINTING step of the carbon-credit lifecycle. After a monitoring period
// has been verified (W11) and the project is in good standing (W37/W56), the
// registry serializes the verified reductions into a unique serial-number
// block and credits the proponent's holding account. THIS chain governs that
// minting workflow — completeness screening, MRV cross-check, buffer-pool
// deduction (AFOLU), serial-number assignment, registry submission, and the
// final credit-into-account event. It is the missing piece between MRV
// verification (W11) and retirement (W17):
//   [[project-wave37-carbon-registration-chain]] registers the project,
//   [[project-wave11-carbon-mrv-chain]] verifies a monitoring period,
//   [[project-wave56-crediting-renewal-chain]] re-validates the period,
//   [[project-wave42-carbon-reversal-chain]] handles buffer-pool reversals,
//   [[project-wave17-retirement-chain]] retires issued credits,
//   THIS chain ACTUALLY MINTS the credits into the registry between
//   verification and any post-issuance lifecycle.
//
// Clean path:
//   requested → screening → verification_check → serialization
//             → pending_registry → issued                          (terminal OK)
//
// Branches / terminals:
//   on_hold    — paused during screening / verification for an integrity flag
//                (double-issuance check, geographic overlap, registry suspense).
//                Resumes to screening.
//   returned   — deficiency found at verification_check or serialization
//                (e.g. MRV statement mismatch, missing CA letter). Goes back
//                to the proponent for correction, then resubmits to screening.
//   disputed   — serial / quantum dispute raised on a pending_registry batch
//                (e.g. duplicate serial, vintage clash). Resolves back to
//                serialization for re-cut.
//   rejected   — failed at screening / verification / serialization /
//                pending_registry / on_hold / returned / disputed. Terminal.
//   withdrawn  — proponent withdraws the request before it is issued. Terminal.
//   cancelled  — registry admin cancels the request before it is issued.
//                Terminal.
//
// Tiers (4) by REQUESTED QUANTITY (tCO2e) — drive SLA + reportability:
//   minor <10k / moderate <100k / major <500k / mega >=500k
// FLOOR: an Article 6 international-transfer issuance (ca_required) floors
// at 'major' regardless of raw quantity — the corresponding-adjustment
// integrity scrutiny band is always heightened.
//
// SLA matrix is INVERTED — the LARGER the issuance, the LONGER every window
// (a high-volume mint warrants deeper registry due diligence); a minor
// issuance gets the SHORTEST, fast-track window. Same flavour as the rest
// of the carbon family ([[project-wave73-poa-cpa-inclusion-chain]] /
// [[project-wave65-carbon-erpa-chain]] / [[project-wave56-crediting-renewal-chain]]).
// Terminals carry no deadline.
//
// Reportability — the W82 SIGNATURE is INTEGRITY-driven. The single hard
// market-integrity line of any registry is the serial-number ledger: any
// dispute on it is ALWAYS notifiable to the registry oversight authority
// (DFFE DNA for SA, or the Verra/Gold Standard board for voluntary):
//   raise_dispute       crosses for EVERY tier — the distinctive W82
//                       "a serial dispute is itself reportable" crossing.
//   confirm_issuance    crosses for EVERY tier when the issuance requires
//                       a corresponding adjustment (Article 6) — minting
//                       credits that count against a host-country NDC is
//                       always notifiable; else only for the large tiers
//                       (major + mega).
//   reject              crosses for the large tiers (major + mega).
//   sla_breached        crosses for the large tiers (major + mega).
//
// Single carbon-fund desk write {admin, carbon_fund} — the desk (acting as
// the registry coordinating entity) records the whole issuance lifecycle
// (same single-party model as every carbon chain). actor_party tags the
// function performing each step (proponent / registry / vvb / dna) for
// audit attribution only, NOT access.
// ─────────────────────────────────────────────────────────────────────────

export type IssuanceStatus =
  | 'requested'
  | 'screening'
  | 'verification_check'
  | 'serialization'
  | 'pending_registry'
  | 'issued'
  | 'on_hold'
  | 'returned'
  | 'disputed'
  | 'rejected'
  | 'withdrawn'
  | 'cancelled';

export type IssuanceAction =
  | 'begin_screening'
  | 'verify_against_mrv'
  | 'assign_serials'
  | 'submit_to_registry'
  | 'confirm_issuance'
  | 'place_on_hold'
  | 'resume'
  | 'return_for_correction'
  | 'resubmit'
  | 'raise_dispute'
  | 'resolve_dispute'
  | 'reject'
  | 'withdraw'
  | 'cancel';

export type IssuanceTier = 'minor' | 'moderate' | 'major' | 'mega';

export type IssuanceParty = 'proponent' | 'registry' | 'vvb' | 'dna';

export type IssuanceTransferType = 'article6' | 'voluntary' | 'compliance';

// Methodology category — drives the default buffer-pool deduction.
// AFOLU activities have a non-reversal buffer pool (~20%); engineered
// removals (DAC, BECCS, biochar) and energy projects carry no buffer.
export type IssuanceCategory = 'afolu' | 'energy' | 'engineered' | 'waste';

export type IssuanceEvent =
  | 'carbon_issuance.screening'
  | 'carbon_issuance.verification_check'
  | 'carbon_issuance.serialization'
  | 'carbon_issuance.pending_registry'
  | 'carbon_issuance.issued'
  | 'carbon_issuance.on_hold'
  | 'carbon_issuance.returned'
  | 'carbon_issuance.disputed'
  | 'carbon_issuance.rejected'
  | 'carbon_issuance.withdrawn'
  | 'carbon_issuance.cancelled'
  | 'carbon_issuance.sla_breached';

const TERMINALS = new Set<IssuanceStatus>(['issued', 'rejected', 'withdrawn', 'cancelled']);

const PRE_ISSUED_CANCELLABLE = new Set<IssuanceStatus>([
  'requested',
  'screening',
  'verification_check',
  'serialization',
  'pending_registry',
  'on_hold',
  'returned',
  'disputed',
]);

export function isTerminal(s: IssuanceStatus): boolean {
  return TERMINALS.has(s);
}

export function isCancellable(s: IssuanceStatus): boolean {
  return PRE_ISSUED_CANCELLABLE.has(s);
}

export const TRANSITIONS: Record<IssuanceAction, { from: IssuanceStatus[]; to: IssuanceStatus }> = {
  begin_screening:       { from: ['requested'],                                                                                          to: 'screening' },
  verify_against_mrv:    { from: ['screening'],                                                                                          to: 'verification_check' },
  assign_serials:        { from: ['verification_check'],                                                                                 to: 'serialization' },
  submit_to_registry:    { from: ['serialization'],                                                                                      to: 'pending_registry' },
  confirm_issuance:      { from: ['pending_registry'],                                                                                   to: 'issued' },
  place_on_hold:         { from: ['screening', 'verification_check', 'serialization'],                                                   to: 'on_hold' },
  resume:                { from: ['on_hold'],                                                                                            to: 'screening' },
  return_for_correction: { from: ['verification_check', 'serialization'],                                                                to: 'returned' },
  resubmit:              { from: ['returned'],                                                                                           to: 'screening' },
  raise_dispute:         { from: ['pending_registry'],                                                                                   to: 'disputed' },
  resolve_dispute:       { from: ['disputed'],                                                                                           to: 'serialization' },
  reject:                { from: ['screening', 'verification_check', 'serialization', 'pending_registry', 'on_hold', 'returned', 'disputed'], to: 'rejected' },
  withdraw:              { from: ['requested', 'screening', 'verification_check', 'serialization', 'pending_registry', 'on_hold', 'returned', 'disputed'], to: 'withdrawn' },
  cancel:                { from: ['requested', 'screening', 'verification_check', 'serialization', 'pending_registry', 'on_hold', 'returned', 'disputed'], to: 'cancelled' },
};

export function nextStatus(current: IssuanceStatus, action: IssuanceAction): IssuanceStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: IssuanceStatus): IssuanceAction[] {
  const acts: IssuanceAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [IssuanceAction, typeof TRANSITIONS[IssuanceAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const DAY = 24 * 60 * MIN;

// INVERTED matrix — the LARGER the issuance, the LONGER every window. Strictly
// increasing minor → mega per graded state. Terminals carry no deadline.
export const SLA_MINUTES: Record<IssuanceStatus, Record<IssuanceTier, number>> = {
  requested:          { minor: 2 * DAY,  moderate: 3 * DAY,  major: 5 * DAY,  mega: 7 * DAY },
  screening:          { minor: 3 * DAY,  moderate: 5 * DAY,  major: 7 * DAY,  mega: 10 * DAY },
  verification_check: { minor: 5 * DAY,  moderate: 7 * DAY,  major: 10 * DAY, mega: 14 * DAY },
  serialization:      { minor: 2 * DAY,  moderate: 3 * DAY,  major: 5 * DAY,  mega: 7 * DAY },
  pending_registry:   { minor: 5 * DAY,  moderate: 7 * DAY,  major: 10 * DAY, mega: 14 * DAY },
  on_hold:            { minor: 10 * DAY, moderate: 14 * DAY, major: 21 * DAY, mega: 30 * DAY },
  returned:           { minor: 14 * DAY, moderate: 21 * DAY, major: 30 * DAY, mega: 45 * DAY },
  disputed:           { minor: 14 * DAY, moderate: 21 * DAY, major: 30 * DAY, mega: 45 * DAY },
  issued:             { minor: 0, moderate: 0, major: 0, mega: 0 },
  rejected:           { minor: 0, moderate: 0, major: 0, mega: 0 },
  withdrawn:          { minor: 0, moderate: 0, major: 0, mega: 0 },
  cancelled:          { minor: 0, moderate: 0, major: 0, mega: 0 },
};

export function slaWindowMinutes(status: IssuanceStatus, tier: IssuanceTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: IssuanceStatus, tier: IssuanceTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

// An Article 6.2 / 6.4 international transfer requires a CORRESPONDING
// ADJUSTMENT to the host-country NDC accounting — the double-counting
// safeguard. Voluntary and compliance-domestic issuances do not.
export function requiresCorrespondingAdjustment(transferType: IssuanceTransferType): boolean {
  return transferType === 'article6';
}

const TIER_RANK: Record<IssuanceTier, number> = { minor: 0, moderate: 1, major: 2, mega: 3 };
const LARGE_TIERS = new Set<IssuanceTier>(['major', 'mega']);

export function isLargeTier(tier: IssuanceTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Base tier by requested quantity (tCO2e).
export function baseTierForQuantity(tco2e: number): IssuanceTier {
  if (tco2e < 10000) return 'minor';
  if (tco2e < 100000) return 'moderate';
  if (tco2e < 500000) return 'major';
  return 'mega';
}

// Effective tier — base tier raised to the Article-6 floor ('major') when
// the issuance requires a corresponding adjustment.
export function tierForQuantity(tco2e: number, transferType: IssuanceTransferType): IssuanceTier {
  const base = baseTierForQuantity(tco2e);
  if (requiresCorrespondingAdjustment(transferType) && TIER_RANK[base] < TIER_RANK['major']) {
    return 'major';
  }
  return base;
}

// Reportability matrix (the W82 SIGNATURE is INTEGRITY-driven):
//   - raise_dispute crosses for EVERY tier — a serial / quantum dispute is
//     ALWAYS reportable to the registry oversight authority.
//   - confirm_issuance crosses for EVERY tier when the issuance requires a
//     corresponding adjustment (Article 6); else for the large tiers only.
//   - reject crosses for the large tiers only.
export function crossesIntoRegulator(action: IssuanceAction, tier: IssuanceTier, requiresCA = false): boolean {
  if (action === 'raise_dispute') return true;
  if (action === 'confirm_issuance') return requiresCA || LARGE_TIERS.has(tier);
  if (action === 'reject') return LARGE_TIERS.has(tier);
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: IssuanceTier): boolean {
  return LARGE_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true
// when the issuance requires a corresponding adjustment OR its volume is
// large.
export function isReportable(tier: IssuanceTier, requiresCA: boolean): boolean {
  return requiresCA || LARGE_TIERS.has(tier);
}

// Party each action represents (functional role around the registry).
// PROPONENT lodges / resubmits / withdraws; REGISTRY does the registry-
// side handling; VVB cross-checks the verification; DNA represents the
// host-country authority for Article 6 corresponding adjustments. Audit
// attribution only.
const ACTION_PARTY: Record<IssuanceAction, IssuanceParty> = {
  begin_screening:       'registry',
  verify_against_mrv:    'vvb',
  assign_serials:        'registry',
  submit_to_registry:    'registry',
  confirm_issuance:      'registry',
  place_on_hold:         'registry',
  resume:                'registry',
  return_for_correction: 'registry',
  resubmit:              'proponent',
  raise_dispute:         'registry',
  resolve_dispute:       'registry',
  reject:                'registry',
  withdraw:              'proponent',
  cancel:                'registry',
};

export function partyForAction(action: IssuanceAction): IssuanceParty {
  return ACTION_PARTY[action];
}

// ── "Beat best-in-class" decision helpers ─────────────────────────────────
// Verra Registry (APX), Gold Standard Impact Registry, S&P Global
// Environmental Registry, Cercarbono and Puro.earth all run essentially
// linear issuance workflows with manual integrity checks. The platform's
// edge is live, calculated integrity guards exposed on every record:
// serial-block transparency, buffer-pool maths, project+vintage cumulative
// headroom, double-issuance / over-issuance flags, and CA binding — all
// derived from the same inputs each transition.

// Buffer-pool percentage by methodology category. AFOLU (forestry, land use)
// has a non-reversal buffer pool (~20%). Engineered removals (DAC, BECCS,
// biochar), energy and waste projects carry no buffer. The desk can override
// per project; this is the safe default.
export function defaultBufferPctFor(category: IssuanceCategory): number {
  if (category === 'afolu') return 0.20;
  return 0;
}

// Buffer contribution in tCO2e. clamped >= 0.
export function bufferContributionTco2e(quantity: number, bufferPct: number): number {
  if (!isFinite(quantity) || !isFinite(bufferPct)) return 0;
  const pct = Math.max(0, Math.min(1, bufferPct));
  return Math.max(0, Math.round(quantity * pct));
}

// Net issuable after buffer deduction (the credits actually serialised into
// the holding account).
export function netIssuableTco2e(quantity: number, bufferPct: number): number {
  return Math.max(0, quantity - bufferContributionTco2e(quantity, bufferPct));
}

// Remaining headroom (tCO2e) under the project + vintage's verified ceiling
// once this issuance's NET quantity is added to the cumulative already-issued
// total. Negative => over-issuance and the request must be held.
export function projectVintageHeadroomTco2e(
  verifiedTco2e: number,
  alreadyIssuedTco2e: number,
  netRequestedTco2e: number,
): number {
  return verifiedTco2e - (alreadyIssuedTco2e + netRequestedTco2e);
}

// Whether issuing this request would over-issue against the verified
// ceiling for the project + vintage.
export function isOverIssuance(
  verifiedTco2e: number,
  alreadyIssuedTco2e: number,
  netRequestedTco2e: number,
): boolean {
  return projectVintageHeadroomTco2e(verifiedTco2e, alreadyIssuedTco2e, netRequestedTco2e) < 0;
}

// Double-issuance guard — true (= SAFE) when the project + vintage +
// monitoring-period combination has not already been credited. False (=
// FLAGGED) means another issuance has already serialised credits for the
// same vintage / monitoring period and the desk must place this on hold.
export function doubleIssuanceGuardOk(
  vintageMonitoringKey: string,
  existingKeys: string[],
): boolean {
  if (!vintageMonitoringKey) return true;
  return !existingKeys.includes(vintageMonitoringKey);
}

// Serial-block end given the start and the net issuable quantity. Each
// serial number represents 1 tCO2e (the registry convention).
export function serialBlockEnd(start: number, netIssuable: number): number {
  if (!isFinite(start) || !isFinite(netIssuable) || netIssuable <= 0) return start;
  return start + Math.max(0, Math.round(netIssuable) - 1);
}

// Predicted issuance turnaround (days) — the sum of the forward-path SLA
// windows for the tier, from requested through to confirm_issuance. Lets
// the registry quote a realistic mint date up front (beats the
// open-ended manual process).
export function predictedIssuanceDays(tier: IssuanceTier): number {
  const forward: IssuanceStatus[] = [
    'requested',
    'screening',
    'verification_check',
    'serialization',
    'pending_registry',
  ];
  const minutes = forward.reduce((sum, s) => sum + (SLA_MINUTES[s]?.[tier] ?? 0), 0);
  return Math.round(minutes / DAY);
}
