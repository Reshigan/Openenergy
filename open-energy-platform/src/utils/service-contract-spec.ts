// ═══════════════════════════════════════════════════════════════════════════
// Wave 80 — OEM-Support Service-Contract / AMC Renewal, Entitlement & Coverage
// (pure spec).
//
// The COMMERCIAL GATE of the OEM-Support profile: the contract that decides
// whether a deployed asset can get manufacturer support at all, at what
// response-time service level, and within what entitlement limits. Every other
// OEM-Support chain runs UNDER a service contract — a ticket (W14) is answered
// to the contract's response-time SLA, an RMA (W15) draws on its parts
// allowance, a spare (W72) is provisioned against its coverage — but none of
// those manage the contract itself: its quote, activation, the annual renewal
// loop, suspension for non-payment, the grace buffer, and the coverage gap that
// opens when it lapses. W80 is that missing layer.
//
// The DISTINCTIVE move (the "beat best-in-class" target — ServiceMax /
// SAP Service Cloud / Salesforce Field Service entitlements / IFS): the
// entitlement is LIVE-WIRED into the rest of the platform as a real coverage
// gate (isEventCovered), the renewal urgency is COVERAGE-GAP-aware (a mission-
// critical contract is chased fastest because a gap on critical grid assets is a
// reliability event), and a lapse on important coverage crosses to the regulator
// as a security-of-supply concern. Best-in-class systems manage entitlements in
// a silo, disconnected from asset-health and grid-reliability; W80 does not.
//
// Standards / contractual framing:
//   - OEM service-level / AMC (Annual Maintenance Contract): guaranteed response
//     time and included entitlements (preventive visits, parts allowance) per
//     coverage tier.
//   - NERSA Grid Code / security-of-supply: a coverage gap on premium / mission-
//     critical OEM support for grid-connected generation is a reliability /
//     security-of-supply concern, reportable when coverage lapses, is suspended,
//     or is abandoned on important assets.
//
// Forward path:
//   draft → quoted → pending_activation → active → renewal_due →
//     renewal_quoted → negotiating → renewed
//
// Renewal can also close early: renewal_due / renewal_quoted / negotiating /
//   in_grace → renewed (confirm_renewal).
// Grace: renewal_due / renewal_quoted / negotiating → in_grace (term end reached
//   while still in renewal — conditional grace coverage runs) → renewed (late
//   renewal) OR expired (grace blown — COVERAGE GAP, terminal).
// Suspension: active → suspended (non-payment / breach) → active (reinstate) OR
//   expired (terminated) OR cancelled.
// Cancel: any pre-renewed planning / in-force state → cancelled.
//
// Tiers — COVERAGE TIER (explicit contract attribute, not a derived number):
//   basic / standard / premium / mission_critical. The coverage tier drives the
//   response-time SLA ENTITLEMENT owed to the customer, the renewal-window
//   urgency, and the reportability hard line. HIGH = {premium, mission_critical}.
//
// URGENT SLA — a higher coverage tier gets a TIGHTER renewal-window at every
//   active state (same family as W64/W67/W68/W69/W71/W72). The more critical the
//   coverage, the faster the desk must move the contract forward to avoid a
//   coverage gap. Terminals 0.
//
// Reportability (regulator inbox crossings) — the W80 SIGNATURE is COVERAGE-GAP-
// driven (distinct from W72's availability-risk, W63's defect-class, W55's CVSS):
//   - expire_coverage crosses for HIGH tiers (premium / mission_critical) — a
//     coverage gap on important OEM-supported grid assets is notifiable.
//   - suspend_coverage crosses for mission_critical only — suspending mission-
//     critical coverage, even temporarily, is notifiable.
//   - cancel_contract crosses for mission_critical only — abandoning mission-
//     critical coverage is notifiable.
//   - sla_breached crosses for HIGH tiers only.
//   isReportable(tier) = isHighTier(tier).
//
// Write model — SINGLE-PARTY {admin, support} (same as W41/W47/W55/W63/W72).
// READ all nine personas (the fleet coverage register is platform-wide). Each
// event is tagged with the functional party that owns the action (account_manager
// / service_desk / finance) for audit attribution — NOT an access-control split.
// ═══════════════════════════════════════════════════════════════════════════

export type ContractStatus =
  | 'draft'
  | 'quoted'
  | 'pending_activation'
  | 'active'
  | 'renewal_due'
  | 'renewal_quoted'
  | 'negotiating'
  | 'in_grace'
  | 'suspended'
  | 'renewed'
  | 'expired'
  | 'cancelled';

export type ContractAction =
  | 'issue_quote'
  | 'accept_quote'
  | 'activate_coverage'
  | 'open_renewal'
  | 'issue_renewal_quote'
  | 'begin_negotiation'
  | 'confirm_renewal'
  | 'enter_grace'
  | 'suspend_coverage'
  | 'reinstate_coverage'
  | 'expire_coverage'
  | 'cancel_contract';

// Coverage tier — explicit contract attribute. Drives the response-time SLA
// entitlement, the renewal-window urgency, and the reportability hard line.
export type CoverageTier =
  | 'basic'
  | 'standard'
  | 'premium'
  | 'mission_critical';

// Functional party that owns each action (recorded as actor_party — functional
// attribution for audit, NOT a write-access split).
export type ContractParty =
  | 'account_manager'
  | 'service_desk'
  | 'finance';

interface TransitionRule {
  next: ContractStatus;
}

export const TRANSITIONS: Record<
  ContractStatus,
  Partial<Record<ContractAction, TransitionRule>>
> = {
  draft: {
    issue_quote:    { next: 'quoted' },
    cancel_contract: { next: 'cancelled' },
  },
  quoted: {
    accept_quote:   { next: 'pending_activation' },
    cancel_contract: { next: 'cancelled' },
  },
  pending_activation: {
    activate_coverage: { next: 'active' },
    cancel_contract:   { next: 'cancelled' },
  },
  active: {
    open_renewal:    { next: 'renewal_due' },
    suspend_coverage: { next: 'suspended' },
    cancel_contract:  { next: 'cancelled' },
  },
  renewal_due: {
    issue_renewal_quote: { next: 'renewal_quoted' },
    confirm_renewal:     { next: 'renewed' },
    enter_grace:         { next: 'in_grace' },
    cancel_contract:     { next: 'cancelled' },
  },
  renewal_quoted: {
    begin_negotiation: { next: 'negotiating' },
    confirm_renewal:   { next: 'renewed' },
    enter_grace:       { next: 'in_grace' },
    cancel_contract:   { next: 'cancelled' },
  },
  negotiating: {
    confirm_renewal: { next: 'renewed' },
    enter_grace:     { next: 'in_grace' },
    cancel_contract: { next: 'cancelled' },
  },
  in_grace: {
    confirm_renewal: { next: 'renewed' },
    expire_coverage: { next: 'expired' },
  },
  suspended: {
    reinstate_coverage: { next: 'active' },
    expire_coverage:    { next: 'expired' },
    cancel_contract:    { next: 'cancelled' },
  },
  renewed:   {},
  expired:   {},
  cancelled: {},
};

const TERMINALS = new Set<ContractStatus>(['renewed', 'expired', 'cancelled']);

export function isTerminal(s: ContractStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: ContractStatus,
  action: ContractAction,
): ContractStatus | null {
  return TRANSITIONS[current]?.[action]?.next ?? null;
}

export function allowedActions(current: ContractStatus): ContractAction[] {
  return Object.keys(TRANSITIONS[current] || {}) as ContractAction[];
}

export function isCancellable(s: ContractStatus): boolean {
  return TRANSITIONS[s]?.cancel_contract != null;
}

// URGENT SLA windows in minutes, keyed by the deadline to take the NEXT action
// out of each state. The higher the coverage tier, the TIGHTER the window — a
// mission-critical contract is chased fastest to avoid a coverage gap on critical
// assets. Strictly decreasing basic → mission_critical at every graded state.
// Terminals 0.
export const SLA_MINUTES: Record<ContractStatus, Record<CoverageTier, number>> = {
  // draft → issue_quote / cancel
  draft: {
    basic: 20160, standard: 10080, premium: 5040, mission_critical: 2880,
  },
  // quoted → accept_quote (await customer)
  quoted: {
    basic: 20160, standard: 10080, premium: 5040, mission_critical: 2880,
  },
  // pending_activation → activate_coverage
  pending_activation: {
    basic: 14400, standard: 7200, premium: 2880, mission_critical: 1440,
  },
  // active → open_renewal (open the renewal before this elapses; a contract left
  // in force without a renewal opened is a lapse risk)
  active: {
    basic: 43200, standard: 28800, premium: 14400, mission_critical: 7200,
  },
  // renewal_due → issue_renewal_quote / confirm_renewal / enter_grace
  renewal_due: {
    basic: 20160, standard: 10080, premium: 4320, mission_critical: 1440,
  },
  // renewal_quoted → begin_negotiation / confirm_renewal
  renewal_quoted: {
    basic: 14400, standard: 7200, premium: 2880, mission_critical: 1440,
  },
  // negotiating → confirm_renewal / enter_grace
  negotiating: {
    basic: 14400, standard: 7200, premium: 2880, mission_critical: 1440,
  },
  // in_grace → confirm_renewal / expire_coverage (tightest pre-gap window)
  in_grace: {
    basic: 10080, standard: 4320, premium: 1440, mission_critical: 480,
  },
  // suspended → reinstate_coverage / expire_coverage
  suspended: {
    basic: 14400, standard: 7200, premium: 2880, mission_critical: 1440,
  },
  renewed:   { basic: 0, standard: 0, premium: 0, mission_critical: 0 },
  expired:   { basic: 0, standard: 0, premium: 0, mission_critical: 0 },
  cancelled: { basic: 0, standard: 0, premium: 0, mission_critical: 0 },
};

export function slaDeadlineFor(
  state: ContractStatus,
  tier: CoverageTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = SLA_MINUTES[state]?.[tier];
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

const TIER_RANK: Record<CoverageTier, number> = {
  basic: 0, standard: 1, premium: 2, mission_critical: 3,
};

const HIGH_TIERS = new Set<CoverageTier>(['premium', 'mission_critical']);

export function isHighTier(tier: CoverageTier): boolean {
  return HIGH_TIERS.has(tier);
}

export function tierRank(tier: CoverageTier): number {
  return TIER_RANK[tier];
}

// ── Entitlement & coverage (the distinctive layer) ───────────────────────────

// The response-time SLA the customer is OWED when raising a support event under
// this contract, by coverage tier. This is the entitlement the rest of the
// platform (W14 tickets) honours — distinct from the renewal-window SLA above.
export function entitlementResponseSlaMinutes(tier: CoverageTier): number {
  switch (tier) {
    case 'mission_critical': return 240;  // 4h
    case 'premium':          return 480;  // 8h
    case 'standard':         return 1440; // 24h
    case 'basic':            return 4320; // 72h
  }
}

// Statuses where coverage is LIVE (a covered event is honoured): the contract is
// in force, mid-renewal, or in the conditional grace buffer.
const COVERAGE_LIVE = new Set<ContractStatus>([
  'active', 'renewal_due', 'renewal_quoted', 'negotiating', 'in_grace',
]);

// Statuses where an asset that SHOULD be covered is NOT (the coverage gap).
const COVERAGE_GAP = new Set<ContractStatus>(['suspended', 'expired']);

export function isCoverageLive(status: ContractStatus): boolean {
  return COVERAGE_LIVE.has(status);
}

export function isCoverageGap(status: ContractStatus): boolean {
  return COVERAGE_GAP.has(status);
}

// The live coverage gate the rest of the platform calls: is THIS support event
// covered by THIS contract right now? Requires live coverage, a covered fault
// class, and a covered asset. 'all' / empty lists are wildcards.
export function isEventCovered(opts: {
  status: ContractStatus;
  coveredFaultClasses: string[];
  faultClass: string;
  coveredAssets?: string[];
  assetId?: string;
}): boolean {
  if (!isCoverageLive(opts.status)) return false;

  const faultOk =
    opts.coveredFaultClasses.includes('all') ||
    opts.coveredFaultClasses.includes(opts.faultClass);
  if (!faultOk) return false;

  const assets = opts.coveredAssets ?? [];
  const assetOk =
    assets.length === 0 ||
    assets.includes('all') ||
    (opts.assetId != null && assets.includes(opts.assetId));
  return assetOk;
}

export function visitsRemaining(included: number, consumed: number): number {
  return Math.max(0, included - consumed);
}

export function partsAllowanceRemainingZar(allowanceZar: number, consumedZar: number): number {
  return Math.max(0, allowanceZar - consumedZar);
}

// Fraction of an entitlement consumed (0..1). Returns 0 when nothing is included.
export function coverageUtilization(consumed: number, included: number): number {
  if (included <= 0) return 0;
  return Math.min(1, Math.max(0, consumed / included));
}

export function isEntitlementExhausted(included: number, consumed: number): boolean {
  if (included <= 0) return false;
  return consumed >= included;
}

// ── Renewal & contract economics ─────────────────────────────────────────────

// Whole days from now to the term end (negative = already past term end).
export function daysToExpiry(termEnd: Date, now: Date): number {
  return Math.ceil((termEnd.getTime() - now.getTime()) / 86_400_000);
}

// Is the contract inside its renewal window (term end within renewalWindowDays)?
// Drives the cron-driven auto open_renewal.
export function isWithinRenewalWindow(
  termEnd: Date,
  now: Date,
  renewalWindowDays: number,
): boolean {
  const d = daysToExpiry(termEnd, now);
  return d <= renewalWindowDays && d > -1;
}

// Renewal annual value after an uplift percentage (e.g. CPI escalation).
export function renewalUpliftZar(currentAcvZar: number, upliftPct: number): number {
  return Math.round(currentAcvZar * (1 + upliftPct / 100));
}

// Pro-rated refund of the unused term on early cancellation. Clamped ≥ 0.
export function proratedRefundZar(
  annualValueZar: number,
  daysRemaining: number,
  termDays: number,
): number {
  if (termDays <= 0 || daysRemaining <= 0) return 0;
  const frac = Math.min(1, Math.max(0, daysRemaining / termDays));
  return Math.round(annualValueZar * frac);
}

// ── Reportability (the W80 SIGNATURE is COVERAGE-GAP-driven) ──────────────────
//   expire_coverage  → crosses for HIGH tiers (coverage gap on important assets);
//   suspend_coverage → crosses for mission_critical only;
//   cancel_contract  → crosses for mission_critical only.
export function crossesIntoRegulator(action: ContractAction, tier: CoverageTier): boolean {
  if (action === 'expire_coverage')  return isHighTier(tier);
  if (action === 'suspend_coverage') return tier === 'mission_critical';
  if (action === 'cancel_contract')  return tier === 'mission_critical';
  return false;
}

// sla_breached crosses for HIGH tiers only.
export function slaBreachCrossesIntoRegulator(tier: CoverageTier): boolean {
  return isHighTier(tier);
}

// A premium / mission-critical contract is reliability-relevant: its coverage gap
// matters to security of supply.
export function isReportable(tier: CoverageTier): boolean {
  return isHighTier(tier);
}

// Functional party that owns each action.
const ACTION_PARTY: Record<ContractAction, ContractParty> = {
  issue_quote:         'account_manager',
  accept_quote:        'account_manager',
  activate_coverage:   'service_desk',
  open_renewal:        'service_desk',
  issue_renewal_quote: 'account_manager',
  begin_negotiation:   'account_manager',
  confirm_renewal:     'account_manager',
  enter_grace:         'service_desk',
  suspend_coverage:    'finance',
  reinstate_coverage:  'finance',
  expire_coverage:     'service_desk',
  cancel_contract:     'account_manager',
};

export function partyForAction(action: ContractAction): ContractParty {
  return ACTION_PARTY[action];
}
