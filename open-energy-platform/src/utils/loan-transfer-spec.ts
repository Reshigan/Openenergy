// ═══════════════════════════════════════════════════════════════════════════
// Wave 61 — Lender Loan Transfer / Secondary Participation & Syndication
// (LMA Transfer Certificate) chain (pure spec).
//
// LMA Standard Terms & Conditions for secondary loan trading (Transfer
// Certificate / Assignment Agreement) + SARB Exchange Control Rulings (any
// transfer of a loan participation to a NON-RESIDENT lender requires
// exchange-control approval) + FIC Act 38 of 2001 (KYC / AML / sanctions
// screening of the incoming lender) + Banks Act large-exposure re-aggregation +
// Equator Principles (EPFI status of the transferee). 12-state P6 lifecycle for
// a SINGLE transfer of a loan participation from one lender (the transferor) to
// an incoming lender (the transferee), administered by the facility agent with
// the borrower (obligor) consenting.
//
// This is the SECONDARY-MARKET dimension of the Lender lifecycle: who HOLDS the
// loan, and how it changes hands AFTER the facility is originated
// (W53 credit-origination), drawn (W21 drawdown) and disbursed (W30
// disbursement). It is mechanically distinct from the borrower-compliance
// monitoring chains (W6 dunning, W38 covenant certificate) and the enforcement
// chain (W45 loan default): a transfer is a transaction, gated by KYC/sanctions
// screening, obligor consent and — for a non-resident transferee — SARB
// exchange-control approval, then executed by an LMA Transfer Certificate and
// settled.
//
// Forward (happy / completed) path:
//   transfer_requested → kyc_screening → consent_solicitation →
//   regulatory_review → transfer_approved → certificate_executed → settled →
//   completed
//
// KYC remediation loop (incoming-lender due-diligence gap):
//   kyc_screening → screening_remediation → kyc_screening (resubmit)
//
// Terminals:
//   completed  — Transfer Certificate effective, register updated, new lender
//                of record (from settled)
//   declined   — obligor refuses consent (from consent_solicitation)
//   rejected   — KYC / sanctions screening failure (from kyc_screening)
//   withdrawn  — transferor pulls the transfer (incl. when SARB will not
//                approve a non-resident transfer) (from any pre-completion
//                operative state)
//
// Transfer-size tiers (transferred participation, ZAR millions, lowest →
// highest): minor / moderate / material / major / systemic.
//
// INVERTED SLA matrix — the LARGER the transferred participation, the LONGER
// every screening / consent / regulatory / settlement window (deeper KYC,
// deeper SARB exchange-control + large-exposure scrutiny for bigger transfers),
// consistent with the other Lender credit-side chains (W21 / W30 / W53). The
// terminals carry no deadline.
//
// Reportability (SARB / FIC supervisor inbox crossings):
//   - approve_transfer to a NON-RESIDENT transferee crosses for EVERY tier —
//     SARB Exchange Control approval of a transfer to a non-resident is always
//     notifiable; the crossing is RESIDENCY-driven, not size-driven (the W61
//     signature).
//   - fail_screening crosses for EVERY tier — a KYC / sanctions hit on an
//     incoming lender is mandatorily FIC-reportable regardless of size.
//   - complete crosses for LARGE tiers (major + systemic) — a completed large
//     transfer re-aggregates a single-counterparty exposure (Banks Act large-
//     exposure notification).
//   - sla_breached crosses for LARGE tiers only.
//
// Two-party split write — the OBLIGOR (borrower) actively consents to (or
// refuses) the transfer (grant_consent / refuse_consent); the LENDER side
// (transferor + facility agent) drives everything else. actor_party
// (transferor / agent / obligor) records the post-event function per step
// (audit attribution only).
// ═══════════════════════════════════════════════════════════════════════════

export type LoanTransferStatus =
  | 'transfer_requested'
  | 'kyc_screening'
  | 'screening_remediation'
  | 'consent_solicitation'
  | 'regulatory_review'
  | 'transfer_approved'
  | 'certificate_executed'
  | 'settled'
  | 'completed'
  | 'declined'
  | 'rejected'
  | 'withdrawn';

export type LoanTransferAction =
  | 'begin_screening'
  | 'request_remediation'
  | 'resubmit_screening'
  | 'fail_screening'
  | 'clear_screening'
  | 'refuse_consent'
  | 'grant_consent'
  | 'approve_transfer'
  | 'execute_certificate'
  | 'settle'
  | 'complete'
  | 'withdraw';

export type LoanTransferTier =
  | 'minor'
  | 'moderate'
  | 'material'
  | 'major'
  | 'systemic';

export type LoanTransferResidency = 'resident' | 'non_resident';

export type LoanTransferParty = 'transferor' | 'agent' | 'obligor';

interface TransitionRule {
  from: LoanTransferStatus[];
  to: LoanTransferStatus;
}

export const TRANSITIONS: Record<LoanTransferAction, TransitionRule> = {
  begin_screening:     { from: ['transfer_requested'], to: 'kyc_screening' },
  request_remediation: { from: ['kyc_screening'], to: 'screening_remediation' },
  resubmit_screening:  { from: ['screening_remediation'], to: 'kyc_screening' },
  fail_screening:      { from: ['kyc_screening'], to: 'rejected' },
  clear_screening:     { from: ['kyc_screening'], to: 'consent_solicitation' },
  refuse_consent:      { from: ['consent_solicitation'], to: 'declined' },
  grant_consent:       { from: ['consent_solicitation'], to: 'regulatory_review' },
  approve_transfer:    { from: ['regulatory_review'], to: 'transfer_approved' },
  execute_certificate: { from: ['transfer_approved'], to: 'certificate_executed' },
  settle:              { from: ['certificate_executed'], to: 'settled' },
  complete:            { from: ['settled'], to: 'completed' },
  withdraw:            {
    from: ['transfer_requested', 'kyc_screening', 'screening_remediation', 'consent_solicitation', 'regulatory_review', 'transfer_approved'],
    to: 'withdrawn',
  },
};

const TERMINALS = new Set<LoanTransferStatus>(['completed', 'declined', 'rejected', 'withdrawn']);

export function isTerminal(s: LoanTransferStatus): boolean {
  return TERMINALS.has(s);
}

export function nextStatus(
  current: LoanTransferStatus,
  action: LoanTransferAction,
): LoanTransferStatus | null {
  const rule = TRANSITIONS[action];
  if (!rule) return null;
  if (isTerminal(current)) return null;
  return rule.from.includes(current) ? rule.to : null;
}

export function allowedActions(current: LoanTransferStatus): LoanTransferAction[] {
  if (isTerminal(current)) return [];
  return (Object.keys(TRANSITIONS) as LoanTransferAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(current),
  );
}

// INVERTED SLA windows in minutes — the LARGER the transferred participation,
// the LONGER each screening / consent / regulatory / settlement window. The
// terminals carry no deadline.
export const SLA_MINUTES: Record<LoanTransferStatus, Record<LoanTransferTier, number>> = {
  transfer_requested: {
    minor: 2880, moderate: 4320, material: 5760, major: 8640, systemic: 11520,
  },
  kyc_screening: {
    minor: 4320, moderate: 5760, material: 8640, major: 11520, systemic: 14400,
  },
  screening_remediation: {
    minor: 5760, moderate: 7200, material: 10080, major: 14400, systemic: 20160,
  },
  consent_solicitation: {
    minor: 4320, moderate: 5760, material: 7200, major: 10080, systemic: 14400,
  },
  regulatory_review: {
    minor: 5760, moderate: 8640, material: 11520, major: 17280, systemic: 23040,
  },
  transfer_approved: {
    minor: 2880, moderate: 4320, material: 5760, major: 7200, systemic: 8640,
  },
  certificate_executed: {
    minor: 2880, moderate: 4320, material: 5760, major: 7200, systemic: 8640,
  },
  settled: {
    minor: 1440, moderate: 2880, material: 4320, major: 5760, systemic: 7200,
  },
  completed: { minor: 0, moderate: 0, material: 0, major: 0, systemic: 0 },
  declined:  { minor: 0, moderate: 0, material: 0, major: 0, systemic: 0 },
  rejected:  { minor: 0, moderate: 0, material: 0, major: 0, systemic: 0 },
  withdrawn: { minor: 0, moderate: 0, material: 0, major: 0, systemic: 0 },
};

export function slaWindowMinutes(state: LoanTransferStatus, tier: LoanTransferTier): number {
  return SLA_MINUTES[state]?.[tier] ?? 0;
}

export function slaDeadlineFor(
  state: LoanTransferStatus,
  tier: LoanTransferTier,
  enteredAt: Date,
): Date | null {
  if (isTerminal(state)) return null;
  const minutes = slaWindowMinutes(state, tier);
  if (!minutes) return null;
  return new Date(enteredAt.getTime() + minutes * 60_000);
}

// Large tiers — major/systemic transferred participation; the size-driven
// reportable line.
const LARGE_TIERS = new Set<LoanTransferTier>(['major', 'systemic']);

export function isLargeTier(tier: LoanTransferTier): boolean {
  return LARGE_TIERS.has(tier);
}

// approve_transfer to a NON-RESIDENT transferee crosses for EVERY tier (SARB
// Exchange Control approval — the RESIDENCY-driven W61 signature). fail_screening
// (KYC / sanctions hit) crosses for EVERY tier (FIC). complete crosses for large
// tiers (Banks Act large-exposure re-aggregation on a completed big transfer).
export function crossesIntoRegulator(
  action: LoanTransferAction,
  tier: LoanTransferTier,
  residency: LoanTransferResidency,
): boolean {
  if (action === 'approve_transfer') return residency === 'non_resident';
  if (action === 'fail_screening') return true;
  if (action === 'complete') return isLargeTier(tier);
  return false;
}

// sla_breached crosses for large tiers only — an overdue screening / consent /
// regulatory / settlement window on a major/systemic transfer is itself a
// supervisory concern.
export function slaBreachCrossesIntoRegulator(tier: LoanTransferTier): boolean {
  return isLargeTier(tier);
}

// Row-level reportable flag (drives the reportable dot): any non-resident
// transfer (exchange-control) OR any large transfer (large-exposure).
export function isReportable(tier: LoanTransferTier, residency: LoanTransferResidency): boolean {
  return residency === 'non_resident' || isLargeTier(tier);
}

export const ACTION_PARTY: Record<LoanTransferAction, LoanTransferParty> = {
  begin_screening:     'agent',
  request_remediation: 'agent',
  resubmit_screening:  'transferor',
  fail_screening:      'agent',
  clear_screening:     'agent',
  refuse_consent:      'obligor',
  grant_consent:       'obligor',
  approve_transfer:    'agent',
  execute_certificate: 'agent',
  settle:              'transferor',
  complete:            'agent',
  withdraw:            'transferor',
};

export function partyForAction(action: LoanTransferAction): LoanTransferParty {
  return ACTION_PARTY[action];
}

// The OBLIGOR (borrower) consent actions — the meaningful two-party-split write.
// Everything else is driven by the lender side (transferor + facility agent).
export function isObligorAction(action: LoanTransferAction): boolean {
  return action === 'grant_consent' || action === 'refuse_consent';
}

// Classify a transfer by the transferred participation amount (ZAR millions).
export function tierForTransferZarM(transferZarM: number): LoanTransferTier {
  if (transferZarM < 100) return 'minor';
  if (transferZarM < 500) return 'moderate';
  if (transferZarM < 2000) return 'material';
  if (transferZarM < 10000) return 'major';
  return 'systemic';
}
