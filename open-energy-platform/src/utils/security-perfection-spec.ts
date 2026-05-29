// ─────────────────────────────────────────────────────────────────────────
// Wave 69 — Security / Collateral Perfection & Registration chain (P6)
//
// A best-in-class project-finance lender does not just advance money — it takes,
// PERFECTS and maintains a SECURITY PACKAGE that makes the debt enforceable and
// correctly ranked against everything else. In South African law a security
// interest only bites once it has been legally PERFECTED at the right registry:
//   - mortgage bonds over immovable property → Deeds Office (Deeds Registries Act
//     47/1937)
//   - special / general notarial bonds over movables → Deeds Office (Security by
//     Means of Movable Property Act 57/1993)
//   - pledge / cession of shares & uncertificated securities → Companies Act
//     71/2008 s126 + the CSDP / STRATE register (Financial Markets Act 19/2012)
//   - cession in securitatem debiti of rights (bank accounts, insurance proceeds,
//     project-agreement receivables) → contractual, perfected by notice
//   - security granted in favour of a non-resident lender → SARB Exchange Control
// The common-terms / facility agreement lists each item as a CONDITION PRECEDENT
// (must be perfected before first drawdown) or CONDITION SUBSEQUENT (perfected
// within a set window after close). The security agent drives each item from
// identification through document execution, lodgement, registration and a final
// perfection legal opinion — and chases anything that goes defective or overdue.
//
// W69 is the SECURITY-PERFECTION lifecycle — distinct from the rest of the
// lender book:
//   - [[project-wave21-drawdown-chain]] certifies and releases the FUNDS
//   - [[project-wave30-disbursement-chain]] reconciles the USE of proceeds
//   - [[project-wave38-covenant-certificate-chain]] tests periodic COVENANTS
//   - [[project-wave45-loan-default-chain]] ENFORCES on default / step-in
//   - [[project-wave53-credit-origination-chain]] APPROVES the credit up front
//   - [[project-wave61-loan-transfer-chain]] SELLS DOWN the loan in the secondary
//   - W6 dunning chases covenant breaches
// W69 governs whether the lender's SECURITY is actually good — taken, registered,
// ranked and enforceable — the foundation everything else relies on.
//
// Forward path (identified → documented → executed → lodged → registered →
// reviewed → perfected):
//   identified → documentation_pending → executed → lodged_for_registration
//     → registered → perfection_review → perfected
//
// Defect / re-lodge loop (the registry rejects the deed, or the legal opinion
// finds a perfection defect):
//   {lodged_for_registration, perfection_review} → defective
//   defective → lodged_for_registration (re-lodge after cure)
//
// Overdue / escalation branch (a CP / CS perfection deadline is missed):
//   {documentation_pending, executed, lodged_for_registration, defective}
//     → perfection_overdue → lodged_for_registration (cure) | lapsed
//
// Terminals:
//   perfected → released (discharged on repayment / substitution)
//   {perfection_overdue, defective} → lapsed (security lost — never perfected)
//   {identified, documentation_pending, executed} → withdrawn (item dropped)
//
// Tiers (5) by SECURED VALUE (ZAR), with a floor escalation for an item that is a
// CONDITION PRECEDENT to first drawdown (an unperfected CP blocks the whole
// facility regardless of the item's own value — like a SIFI in the margin chain):
//   minor <R10m / moderate <R100m / material <R500m / major <R2bn / critical >=R2bn
//
// SLA matrix is URGENT — the LARGER / more critical the security, the TIGHTER the
// perfection window. Same flavour as [[project-wave68-counterparty-margin-chain]]
// / W34 / W50 / W67.
//
// Reportability — the W69 SIGNATURE is SECURITY-LOSS-driven. A security item that
// LAPSES (never perfected, deadline blown) is always a material credit event for
// the lender — it changes the recoverable value and the ranking of the whole
// facility, and SARB / Prudential Authority impairment treatment follows:
//   mark_lapsed crosses for EVERY tier — the distinctive "the terminal failure is
//        always reportable" crossing (cf. W68 declare_default, W67
//        escalate_disconnection, W60 invoke_kill_switch).
//   flag_overdue crosses for the high tiers (major + critical) — a critical /
//        large item blowing its perfection deadline is notifiable.
//   reject_registration crosses for the critical tier only — the registry
//        rejecting a critical CP deed is reportable.
//   sla_breached crosses for the high tiers (major + critical).
//
// Two-party write: the SECURITY AGENT (lender) drives every step; the GRANTOR
// (borrower) executes the security document. actor_party tags whether a step
// represents the agent or the grantor, and the route gates execute_security to
// the grantor write set and every other action to the agent write set.
// ─────────────────────────────────────────────────────────────────────────

export type PerfectionStatus =
  | 'identified'
  | 'documentation_pending'
  | 'executed'
  | 'lodged_for_registration'
  | 'registered'
  | 'perfection_review'
  | 'perfected'
  | 'defective'
  | 'perfection_overdue'
  | 'released'
  | 'lapsed'
  | 'withdrawn';

export type PerfectionAction =
  | 'begin_documentation'
  | 'execute_security'
  | 'lodge_registration'
  | 'confirm_registration'
  | 'reject_registration'
  | 'begin_perfection_review'
  | 'confirm_perfection'
  | 'flag_overdue'
  | 'cure_overdue'
  | 'release_security'
  | 'mark_lapsed'
  | 'withdraw';

export type PerfectionTier = 'minor' | 'moderate' | 'material' | 'major' | 'critical';

export type PerfectionParty = 'security_agent' | 'grantor';

export type PerfectionEvent =
  | 'security_perfection.documentation_pending'
  | 'security_perfection.executed'
  | 'security_perfection.lodged_for_registration'
  | 'security_perfection.registered'
  | 'security_perfection.perfection_review'
  | 'security_perfection.perfected'
  | 'security_perfection.defective'
  | 'security_perfection.perfection_overdue'
  | 'security_perfection.released'
  | 'security_perfection.lapsed'
  | 'security_perfection.withdrawn'
  | 'security_perfection.sla_breached';

const TERMINALS = new Set<PerfectionStatus>(['released', 'lapsed', 'withdrawn']);

const WITHDRAWABLE = new Set<PerfectionStatus>(['identified', 'documentation_pending', 'executed']);

export function isTerminal(s: PerfectionStatus): boolean {
  return TERMINALS.has(s);
}

export function isWithdrawable(s: PerfectionStatus): boolean {
  return WITHDRAWABLE.has(s);
}

export const TRANSITIONS: Record<PerfectionAction, { from: PerfectionStatus[]; to: PerfectionStatus }> = {
  begin_documentation:    { from: ['identified'],                                                          to: 'documentation_pending' },
  execute_security:       { from: ['documentation_pending'],                                               to: 'executed' },
  lodge_registration:     { from: ['executed', 'defective'],                                               to: 'lodged_for_registration' },
  confirm_registration:   { from: ['lodged_for_registration'],                                             to: 'registered' },
  reject_registration:    { from: ['lodged_for_registration', 'perfection_review'],                        to: 'defective' },
  begin_perfection_review:{ from: ['registered'],                                                          to: 'perfection_review' },
  confirm_perfection:     { from: ['perfection_review'],                                                   to: 'perfected' },
  flag_overdue:           { from: ['documentation_pending', 'executed', 'lodged_for_registration', 'defective'], to: 'perfection_overdue' },
  cure_overdue:           { from: ['perfection_overdue'],                                                  to: 'lodged_for_registration' },
  release_security:       { from: ['perfected'],                                                           to: 'released' },
  mark_lapsed:            { from: ['perfection_overdue', 'defective'],                                     to: 'lapsed' },
  withdraw:               { from: ['identified', 'documentation_pending', 'executed'],                     to: 'withdrawn' },
};

export function nextStatus(current: PerfectionStatus, action: PerfectionAction): PerfectionStatus | null {
  if (TERMINALS.has(current)) return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: PerfectionStatus): PerfectionAction[] {
  const acts: PerfectionAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [PerfectionAction, typeof TRANSITIONS[PerfectionAction]][]) {
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// URGENT matrix — the LARGER / more critical the security, the TIGHTER every
// window. Strictly decreasing minor → critical per graded state. Terminals carry
// no deadline.
export const SLA_MINUTES: Record<PerfectionStatus, Record<PerfectionTier, number>> = {
  identified: {
    minor: 30 * DAY, moderate: 21 * DAY, material: 14 * DAY, major: 7 * DAY, critical: 3 * DAY,
  },
  documentation_pending: {
    minor: 30 * DAY, moderate: 21 * DAY, material: 14 * DAY, major: 7 * DAY, critical: 3 * DAY,
  },
  executed: {
    minor: 21 * DAY, moderate: 14 * DAY, material: 10 * DAY, major: 5 * DAY, critical: 2 * DAY,
  },
  lodged_for_registration: {
    minor: 60 * DAY, moderate: 45 * DAY, material: 30 * DAY, major: 21 * DAY, critical: 14 * DAY,
  },
  registered: {
    minor: 14 * DAY, moderate: 10 * DAY, material: 7 * DAY, major: 3 * DAY, critical: 24 * HOUR,
  },
  perfection_review: {
    minor: 10 * DAY, moderate: 7 * DAY, material: 5 * DAY, major: 3 * DAY, critical: 24 * HOUR,
  },
  defective: {
    minor: 14 * DAY, moderate: 10 * DAY, material: 5 * DAY, major: 3 * DAY, critical: 24 * HOUR,
  },
  perfection_overdue: {
    minor: 7 * DAY, moderate: 5 * DAY, material: 3 * DAY, major: 24 * HOUR, critical: 8 * HOUR,
  },
  perfected: {
    minor: 0, moderate: 0, material: 0, major: 0, critical: 0,
  },
  released:  { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  lapsed:    { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
  withdrawn: { minor: 0, moderate: 0, material: 0, major: 0, critical: 0 },
};

export function slaWindowMinutes(status: PerfectionStatus, tier: PerfectionTier): number {
  return SLA_MINUTES[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: PerfectionStatus, tier: PerfectionTier, enteredAt: Date): Date | null {
  const minutes = SLA_MINUTES[status]?.[tier];
  if (!minutes) return null;
  const t = new Date(enteredAt.getTime());
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t;
}

const TIER_RANK: Record<PerfectionTier, number> = {
  minor: 0, moderate: 1, material: 2, major: 3, critical: 4,
};

const RANK_TIER: PerfectionTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];

// Base tier from the secured value (ZAR).
export function tierForSecuredValueZar(zar: number): PerfectionTier {
  if (zar < 10000000) return 'minor';
  if (zar < 100000000) return 'moderate';
  if (zar < 500000000) return 'material';
  if (zar < 2000000000) return 'major';
  return 'critical';
}

// An item that is a CONDITION PRECEDENT to first drawdown blocks the whole
// facility if not perfected — floor its tier at 'major' regardless of value.
export function criticalFloor(perfectionCritical: boolean): PerfectionTier {
  return perfectionCritical ? 'major' : 'minor';
}

// Effective tier = the higher of the value-based tier and the CP floor.
export function tierForSecuredValue(zar: number, perfectionCritical: boolean): PerfectionTier {
  const base = tierForSecuredValueZar(zar);
  const floor = criticalFloor(perfectionCritical);
  const rank = Math.max(TIER_RANK[base], TIER_RANK[floor]);
  return RANK_TIER[rank];
}

// The high tiers — reportability for overdue flags and SLA breaches attaches here.
const HIGH_TIERS = new Set<PerfectionTier>(['major', 'critical']);

export function isHighTier(tier: PerfectionTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Reportability matrix (the W69 signature):
//   - mark_lapsed crosses for EVERY tier — a security item lapsing is always a
//     material credit / impairment event.
//   - flag_overdue crosses for the high tiers (major + critical).
//   - reject_registration crosses for the critical tier only.
export function crossesIntoRegulator(action: PerfectionAction, tier: PerfectionTier): boolean {
  if (action === 'mark_lapsed')         return true;
  if (action === 'flag_overdue')        return HIGH_TIERS.has(tier);
  if (action === 'reject_registration') return tier === 'critical';
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: PerfectionTier): boolean {
  return HIGH_TIERS.has(tier);
}

// Whether a case is reportable irrespective of the current action — true for the
// high tiers (major + critical).
export function isReportable(tier: PerfectionTier): boolean {
  return HIGH_TIERS.has(tier);
}

// The grantor (borrower) executes the security document; the security agent
// (lender) drives everything else.
const GRANTOR_ACTIONS = new Set<PerfectionAction>(['execute_security']);

export function isGrantorAction(action: PerfectionAction): boolean {
  return GRANTOR_ACTIONS.has(action);
}

export function partyForAction(action: PerfectionAction): PerfectionParty {
  return GRANTOR_ACTIONS.has(action) ? 'grantor' : 'security_agent';
}
