// src/utils/chain-registry-meridian.ts
// Meridian chain registry: one descriptor per state-machine chain.
// Feeds /api/horizon/:role and /api/thread/:chainKey/:id.
// Adding a wave = adding one entry here; zero frontend changes.

export type HorizonBucket = 'breached' | 'h2' | 'today' | 'h48' | 'week' | 'later';

export interface ChainActionHint {
  action: string;            // POST action segment on the existing chain route
  label: string;             // button label
  path: string;              // e.g. '/api/covenant-certificate/chain/:id/escalate'
  roles: string[];           // JWT roles allowed (suffixed forms: ipp_developer, grid_operator, carbon_fund)
  cascadeHint: string;       // Law 3 preview, e.g. 'Notifies borrower (IPP) and arms 14d cure window'
  tone?: 'primary' | 'ghost' | 'oxide';
}

export interface ChainDescriptor {
  key: string;               // 'covenant_certificate' — matches roleData Feature.chainKey
  wave: number;
  table: string;             // 'oe_covenant_certificates'
  title: string;             // 'Covenant certificate'
  refCol: string;            // human ref column; fall back to 'id'
  titleCol: string | null;   // descriptive column (counterparty/project name)
  quantumCol: string | null; // ZAR-at-risk column
  statusCol: string;         // 'chain_status' everywhere (verified)
  deadlineCol: string;       // 'sla_deadline_at' everywhere (verified)
  terminal: string[];        // statuses hidden from Horizon
  counterpartyCol: string | null;
  lanes: Record<string, string>; // role -> lane key (mirrors roleData domain keys)
  eventsTable: string | null;    // per-chain event table; null = Thread hides timeline (v1 ok)
  eventsFk: string | null;
  actions: ChainActionHint[];    // v1: top 2-3 decisive transitions only
}

const HOUR = 3600_000;

export function bucketFor(deadlineIso: string | null, now: number): HorizonBucket {
  if (!deadlineIso) return 'later';
  const t = Date.parse(deadlineIso);
  if (Number.isNaN(t)) return 'later';
  const hrs = (t - now) / HOUR;
  if (hrs < 0) return 'breached';
  if (hrs < 2) return 'h2';
  if (hrs < 24) return 'today';
  if (hrs < 48) return 'h48';
  if (hrs < 168) return 'week';
  return 'later';
}

// Law 2: log10(ZAR) × 1/hours-remaining. Breach gets an absolute floor above any live score.
export function attentionScore(zar: number | null, deadlineIso: string | null, now: number): number {
  const money = Math.log10(Math.max(zar ?? 1, 1) + 1);
  if (!deadlineIso) return money / 1000;
  const t = Date.parse(deadlineIso);
  if (Number.isNaN(t)) return money / 1000;
  const hrs = (t - now) / HOUR;
  if (hrs < 0) return 1_000_000 + money;        // breached: always on top, money breaks ties
  return money / Math.max(hrs, 0.25);
}

// SECURITY: table/column/status values below are interpolated into SQL identifiers
// by the horizon/thread routes. They MUST be static literals in this file — never
// derived from request input.
export const MERIDIAN_CHAINS: ChainDescriptor[] = [
  // ───────── LENDER ─────────

  // W38 — Covenant certificate (LMA compliance gate; URGENT SLA)
  {
    key: 'covenant_certificate', wave: 38, table: 'oe_covenant_certificates',
    title: 'Covenant certificate', refCol: 'certificate_number', titleCol: 'facility_name',
    quantumCol: 'outstanding_principal', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['compliant', 'waiver_granted', 'cured', 'accelerated'],
    counterpartyCol: 'borrower_party_name',
    lanes: { lender: 'monitoring', regulator: 'enforcement_regulator' },
    eventsTable: 'oe_covenant_certificate_events', eventsFk: 'certificate_id',
    actions: [
      { action: 'begin-review', label: 'Begin review',
        path: '/api/covenant-certificate/chain/:id/begin-review',
        roles: ['admin', 'lender'],
        cascadeHint: 'Starts compliance assessment; borrower notified of receipt.' },
      { action: 'flag-breach', label: 'Declare breach',
        path: '/api/covenant-certificate/chain/:id/flag-breach',
        roles: ['admin', 'lender'], tone: 'oxide',
        cascadeHint: 'Notifies borrower (IPP), opens cure window, adds facility to watchlist (W6).' },
    ],
  },

  // W21 — Drawdown chain (IE + CP gated; INVERTED SLA — bigger tranche more time)
  {
    key: 'drawdown', wave: 21, table: 'oe_drawdown_chain',
    title: 'Drawdown', refCol: 'drawdown_number', titleCol: 'project_name',
    quantumCol: 'amount_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'rejected', 'cancelled'],
    counterpartyCol: 'lender_id',
    lanes: { lender: 'monitoring', ipp_developer: 'finance' },
    eventsTable: 'oe_drawdown_chain_events', eventsFk: 'drawdown_id',
    actions: [
      { action: 'approve', label: 'Approve drawdown',
        path: '/api/lender/drawdown-chain/:id/approve',
        roles: ['admin', 'lender'],
        cascadeHint: 'Commits tranche; triggers SARB large-exposure disclosure for senior tranches and notifies IPP treasury.' },
      { action: 'reject', label: 'Reject', tone: 'oxide',
        path: '/api/lender/drawdown-chain/:id/reject',
        roles: ['admin', 'lender'],
        cascadeHint: 'Closes the drawdown request; fires rejection cascade to IPP financing pipeline and (for senior tier) regulator inbox.' },
    ],
  },

  // W30 — Disbursement UoP reconciliation (SARB + Equator; INVERTED SLA)
  {
    key: 'disbursement_case', wave: 30, table: 'oe_disbursement_cases',
    title: 'Disbursement UoP', refCol: 'case_number', titleCol: 'project_name',
    quantumCol: 'tranche_amount_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['reconciled', 'clawback_executed', 'waived'],
    counterpartyCol: 'borrower_party',
    lanes: { lender: 'monitoring', ipp_developer: 'finance' },
    eventsTable: 'oe_disbursement_events', eventsFk: 'disbursement_id',
    actions: [
      { action: 'close-reconciliation', label: 'Close reconciliation',
        path: '/api/disbursement/chain/:id/close-reconciliation',
        roles: ['admin', 'lender'],
        cascadeHint: 'Records IE-certified UoP reconciliation as clean; releases hold on next tranche.' },
      { action: 'demand-clawback', label: 'Demand clawback', tone: 'oxide',
        path: '/api/disbursement/chain/:id/demand-clawback',
        roles: ['admin', 'lender'],
        cascadeHint: 'Fires clawback demand cascade to borrower (IPP), notifies regulator for every tier (W30 universal signature).' },
    ],
  },

  // W45 — Loan default & enforcement (LMA EoD → step-in; URGENT SLA)
  {
    key: 'loan_default', wave: 45, table: 'oe_loan_defaults',
    title: 'Loan default', refCol: 'default_number', titleCol: 'facility_name',
    quantumCol: 'outstanding_principal', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['cured', 'restructured', 'enforced_closed', 'written_off'],
    counterpartyCol: 'borrower_party_name',
    lanes: { lender: 'enforcement', ipp_developer: 'finance' },
    eventsTable: 'oe_loan_defaults_events', eventsFk: 'default_id',
    actions: [
      { action: 'accelerate', label: 'Accelerate facility', tone: 'oxide',
        path: '/api/loan-default/chain/:id/accelerate',
        roles: ['admin', 'lender'],
        cascadeHint: 'Declares event of default and calls full outstanding balance; crosses into regulator inbox for senior_secured and mezzanine tiers.' },
      { action: 'write-off', label: 'Write off', tone: 'oxide',
        path: '/api/loan-default/chain/:id/write-off',
        roles: ['admin', 'lender'],
        cascadeHint: 'Crystallises credit loss and records SARB impairment; crosses regulator inbox for every tier (W45 universal hard line).' },
    ],
  },

  // W53 — Credit facility origination (NCA/Basel III; INVERTED SLA)
  {
    key: 'credit_facility_application', wave: 53, table: 'oe_credit_facility_applications',
    title: 'Credit origination', refCol: 'application_number', titleCol: 'facility_name',
    quantumCol: 'facility_limit_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['facility_available', 'declined', 'withdrawn'],
    counterpartyCol: 'applicant_party_name',
    lanes: { lender: 'origination', ipp_developer: 'finance' },
    eventsTable: 'oe_credit_facility_applications_events', eventsFk: 'application_id',
    actions: [
      { action: 'approve', label: 'Approve facility',
        path: '/api/credit-origination/chain/:id/approve',
        roles: ['admin', 'lender'],
        cascadeHint: 'Credit committee approval; fires facility-agreement issuance workflow and notifies applicant (IPP) of approval.' },
      { action: 'decline', label: 'Decline', tone: 'oxide',
        path: '/api/credit-origination/chain/:id/decline',
        roles: ['admin', 'lender'],
        cascadeHint: 'Closes application; fires decline notification to applicant and (for systemic tier) crosses into SARB large-exposure regulator inbox.' },
    ],
  },

  // W61 — Loan transfer / secondary participation (LMA Transfer Certificate; INVERTED SLA)
  {
    key: 'loan_transfer', wave: 61, table: 'oe_loan_transfers',
    title: 'Loan transfer', refCol: 'case_number', titleCol: 'facility_name',
    quantumCol: 'transfer_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['completed', 'declined', 'rejected', 'withdrawn'],
    counterpartyCol: 'obligor_party_name',
    lanes: { lender: 'origination', ipp_developer: 'finance' },
    eventsTable: 'oe_loan_transfers_events', eventsFk: 'transfer_id',
    actions: [
      { action: 'approve-transfer', label: 'Approve transfer',
        path: '/api/loan-transfer/chain/:id/approve-transfer',
        roles: ['admin', 'lender'],
        cascadeHint: 'Executes the LMA Transfer Certificate; crosses SARB Exchange Control inbox for every tier when the incoming lender is non-resident (W61 signature).' },
      { action: 'fail-screening', label: 'Fail KYC/AML screening', tone: 'oxide',
        path: '/api/loan-transfer/chain/:id/fail-screening',
        roles: ['admin', 'lender'],
        cascadeHint: 'Rejects incoming lender on FIC sanctions or AML grounds; crosses regulator inbox for every tier (FIC hard line).' },
    ],
  },

  // W69 — Security perfection (Deeds/STRATE registration; URGENT SLA)
  {
    key: 'security_perfection', wave: 69, table: 'oe_security_perfection',
    title: 'Security perfection', refCol: 'case_number', titleCol: 'facility_name',
    quantumCol: 'secured_value_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['perfected', 'released', 'lapsed', 'withdrawn'],
    counterpartyCol: 'borrower_name',
    lanes: { lender: 'monitoring', ipp_developer: 'finance' },
    eventsTable: 'oe_security_perfection_events', eventsFk: 'perfection_id',
    actions: [
      { action: 'confirm-perfection', label: 'Confirm perfected',
        path: '/api/security-perfection/chain/:id/confirm-perfection',
        roles: ['admin', 'lender'],
        cascadeHint: 'Legal opinion accepted; security item marked perfected and unblocks first drawdown CP if this item is condition precedent.' },
      { action: 'mark-lapsed', label: 'Mark lapsed', tone: 'oxide',
        path: '/api/security-perfection/chain/:id/mark-lapsed',
        roles: ['admin', 'lender'],
        cascadeHint: 'Security interest lapses without registration; crosses regulator inbox for every tier (W69 universal security-loss signature).' },
    ],
  },

  // Other roles registered in later tasks.
];

export function chainsForRole(role: string): ChainDescriptor[] {
  return MERIDIAN_CHAINS.filter(d => role in d.lanes);
}

export function getChain(key: string): ChainDescriptor | undefined {
  return MERIDIAN_CHAINS.find(d => d.key === key);
}
