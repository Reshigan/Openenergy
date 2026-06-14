// src/utils/chain-registry-meridian.ts
// Meridian chain registry: one descriptor per state-machine chain.
// Feeds /api/horizon/:role and /api/thread/:chainKey/:id.
// Adding a wave = adding one entry here; zero frontend changes.

export type HorizonBucket = 'breached' | 'h2' | 'today' | 'h48' | 'week' | 'later';

export interface ActionFieldSpec {
  key: string;
  label: string;
  type: 'number' | 'string' | 'date' | 'enum' | 'boolean' | 'evidence';
  required?: boolean;
  unit?: string;
  options?: string[];      // type 'enum'
  placeholder?: string;
  defaultFrom?: string;    // prefill from a case raw-record column
}

export interface ChainInitiation {
  label: string;
  path: string;            // POST endpoint, must start with /api/
  fields: ActionFieldSpec[];
}

export interface ChainFilterSpec { key: string; label: string; statuses: string[]; }
export interface ChainKpiSpec { key: string; label: string; compute: 'count' | 'count_breached' | 'sum_quantum'; }

export interface ChainActionHint {
  action: string;            // POST action segment on the existing chain route
  label: string;             // button label
  path: string;              // e.g. '/api/covenant-certificate/chain/:id/escalate'
  roles: string[];           // JWT roles allowed (suffixed forms: ipp_developer, grid_operator, carbon_fund)
  cascadeHint: string;       // Law 3 preview, e.g. 'Notifies borrower (IPP) and arms 14d cure window'
  tone?: 'primary' | 'ghost' | 'oxide';
  fields?: ActionFieldSpec[];
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
  actions: ChainActionHint[];    // decisive transitions (typically 3-6 per chain)
  initiation?: ChainInitiation | null;
  filters?: ChainFilterSpec[];
  kpis?: ChainKpiSpec[];
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
// Deadline-less rows score in a band strictly below BREACH_FLOOR so a dormant
// case — however large its quantum — can never tie or outrank a real breach.
const BREACH_FLOOR = 1_000_000;

export function attentionScore(zar: number | null, deadlineIso: string | null, now: number): number {
  const money = Math.log10(Math.max(zar ?? 1, 1) + 1);
  const dormant = Math.min(money / 1000, BREACH_FLOOR - 1); // no deadline: never reaches the breach floor
  if (!deadlineIso) return dormant;
  const t = Date.parse(deadlineIso);
  if (Number.isNaN(t)) return dormant;
  const hrs = (t - now) / HOUR;
  if (hrs < 0) return BREACH_FLOOR + money;     // breached: always on top, money breaks ties
  return money / Math.max(hrs, 0.25);
}

// Quantum columns are stored in mixed units: most are raw ZAR, but `*_zar_m`
// columns hold ZAR-millions. Normalise to ZAR here so attentionScore weights
// a R450m facility as 450_000_000, not 450.
export function quantumZar(chain: ChainDescriptor, row: Record<string, unknown>): number | null {
  if (!chain.quantumCol) return null;
  const raw = row[chain.quantumCol];
  const n = Number(raw);
  if (raw == null || Number.isNaN(n)) return null;
  return chain.quantumCol.endsWith('_zar_m') ? n * 1_000_000 : n;
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
    // ipp_developer lane: borrower is a write party on the route
    // (BORROWER_WRITE_ROLES = {admin, support, ipp_developer} gates submit-certificate / request-waiver).
    lanes: { lender: 'monitoring', ipp_developer: 'finance', regulator: 'enforcement_regulator' },
    eventsTable: 'oe_covenant_certificate_events', eventsFk: 'certificate_id',
    actions: [
      { action: 'begin-review', label: 'Begin review',
        path: '/api/covenant-certificate/chain/:id/begin-review',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Starts compliance assessment; borrower notified of receipt.' },
      { action: 'flag-breach', label: 'Declare breach',
        path: '/api/covenant-certificate/chain/:id/flag-breach',
        roles: ['admin', 'support', 'lender'], tone: 'oxide',
        cascadeHint: 'Notifies borrower (IPP), opens cure window, adds facility to watchlist (W6).',
        fields: [
          { key: 'reason_code', label: 'Breach type', type: 'enum', required: true,
            options: ['dscr_breach', 'llcr_breach', 'gearing_breach', 'reporting_failure'] },
          { key: 'breached_covenants', label: 'Breached covenants', type: 'string', required: true,
            placeholder: 'e.g. DSCR < 1.20x for Q2' },
          { key: 'breach_basis', label: 'Evidence / basis', type: 'evidence', required: true },
        ],
      },
    ],
    filters: [
      { key: 'active_breach', label: 'Active breach', statuses: ['breach_identified', 'waiver_requested', 'cure_period'] },
      { key: 'under_review', label: 'Under review', statuses: ['under_review', 'ratios_verified'] },
      { key: 'awaiting', label: 'Awaiting submission', statuses: ['certificate_due', 'certificate_submitted'] },
      { key: 'resolved', label: 'Resolved', statuses: ['compliant', 'waiver_granted', 'cured', 'accelerated'] },
    ],
    kpis: [
      { key: 'total', label: 'Certificates', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Outstanding', compute: 'sum_quantum' },
    ],
    initiation: null,
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Commits tranche; triggers SARB large-exposure disclosure for senior tranches and notifies IPP treasury.',
        fields: [
          { key: 'cp_evidence_ref', label: 'CP evidence ref', type: 'evidence' },
          { key: 'sarb_disclosure_ref', label: 'SARB large-exposure disclosure ref', type: 'evidence' },
        ],
      },
      { action: 'reject', label: 'Reject', tone: 'oxide',
        path: '/api/lender/drawdown-chain/:id/reject',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Closes the drawdown request; fires rejection cascade to IPP financing pipeline and (for senior tier) regulator inbox.',
        fields: [
          { key: 'reason', label: 'Rejection reason', type: 'string', required: true,
            placeholder: 'Why the tranche is rejected' },
        ],
      },
    ],
    filters: [
      { key: 'in_review', label: 'In review', statuses: ['documents_submitted', 'ie_review', 'cp_checklist'] },
      { key: 'on_hold', label: 'On hold', statuses: ['on_hold'] },
      { key: 'awaiting_docs', label: 'Awaiting documents', statuses: ['requested'] },
      { key: 'approved', label: 'Approved / funded', statuses: ['approved', 'funded'] },
      { key: 'resolved', label: 'Resolved', statuses: ['closed', 'rejected', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Drawdowns', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Committed', compute: 'sum_quantum' },
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Records IE-certified UoP reconciliation as clean; releases hold on next tranche.',
        fields: [
          { key: 'reconciled_amount_zar', label: 'Reconciled amount', type: 'number', unit: 'ZAR' },
          { key: 'sarb_exchange_control_ref', label: 'SARB Exchange Control ref', type: 'evidence' },
        ],
      },
      { action: 'demand-clawback', label: 'Demand clawback', tone: 'oxide',
        path: '/api/disbursement/chain/:id/demand-clawback',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Fires clawback demand cascade to borrower (IPP), notifies regulator for every tier (W30 universal signature).',
        fields: [
          { key: 'clawback_amount_zar', label: 'Clawback amount', type: 'number', unit: 'ZAR', required: true },
          { key: 'reason_code', label: 'Reason', type: 'string', required: true,
            placeholder: 'e.g. ineligible UoP category' },
          { key: 'sarb_exchange_control_ref', label: 'SARB Exchange Control ref', type: 'evidence' },
          { key: 'equator_principles_ref', label: 'Equator Principles ref', type: 'evidence' },
          { key: 'rod_notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'awaiting_invoices', label: 'Awaiting invoices', statuses: ['tranche_released', 'invoices_pending'] },
      { key: 'validating', label: 'Validating', statuses: ['invoices_submitted', 'bank_validating', 'ie_certifying'] },
      { key: 'certified', label: 'UoP certified', statuses: ['uop_certified'] },
      { key: 'resolved', label: 'Resolved', statuses: ['reconciled', 'clawback_executed', 'waived'] },
    ],
    kpis: [
      { key: 'total', label: 'Disbursements', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Tranche value', compute: 'sum_quantum' },
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Declares event of default and calls full outstanding balance; crosses into regulator inbox for senior_secured and mezzanine tiers.',
        fields: [
          { key: 'accelerated_amount', label: 'Accelerated amount', type: 'number', unit: 'ZAR', required: true },
          { key: 'acceleration_ref', label: 'Acceleration notice ref', type: 'evidence' },
          { key: 'acceleration_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'reason_code', label: 'Reason', type: 'string',
            placeholder: 'e.g. payment_default' },
          { key: 'rod_notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'write-off', label: 'Write off', tone: 'oxide',
        path: '/api/loan-default/chain/:id/write-off',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Crystallises credit loss and records SARB impairment; crosses regulator inbox for every tier (W45 universal hard line).',
        fields: [
          { key: 'write_off_amount', label: 'Write-off amount', type: 'number', unit: 'ZAR', required: true },
          { key: 'recovery_amount', label: 'Recovery amount', type: 'number', unit: 'ZAR' },
          { key: 'reason_code', label: 'Reason', type: 'string',
            placeholder: 'e.g. unrecoverable' },
          { key: 'rod_notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'active', label: 'Active default', statuses: ['default_flagged', 'under_review', 'reservation_of_rights', 'default_notice_issued'] },
      { key: 'cure', label: 'Cure period', statuses: ['cure_period'] },
      { key: 'enforcement', label: 'Enforcement', statuses: ['accelerated', 'standstill', 'enforcement_commenced'] },
      { key: 'resolved', label: 'Resolved', statuses: ['cured', 'restructured', 'enforced_closed', 'written_off'] },
    ],
    kpis: [
      { key: 'total', label: 'Defaults', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Outstanding', compute: 'sum_quantum' },
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Credit committee approval; fires facility-agreement issuance workflow and notifies applicant (IPP) of approval.',
        fields: [
          { key: 'approved_amount_zar_m', label: 'Approved facility limit', type: 'number', unit: 'ZAR' },
          { key: 'approval_ref', label: 'Approval / committee minute ref', type: 'evidence' },
          { key: 'approval_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'reason_code', label: 'Reason', type: 'string',
            placeholder: 'e.g. within risk appetite' },
          { key: 'decision_notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'decline', label: 'Decline', tone: 'oxide',
        path: '/api/credit-origination/chain/:id/decline',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Closes application; fires decline notification to applicant and (for systemic tier) crosses into SARB large-exposure regulator inbox.',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', required: true,
            placeholder: 'e.g. insufficient_dscr' },
          { key: 'decline_ref', label: 'Decline notice ref', type: 'evidence' },
          { key: 'decline_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'intake', label: 'Intake & screening', statuses: ['application_received', 'screening'] },
      { key: 'assessment', label: 'Assessment', statuses: ['credit_assessment', 'committee_review', 'referred_back'] },
      { key: 'approved', label: 'Approved / CP', statuses: ['conditions_pending', 'approved', 'agreement_issued', 'cp_satisfied'] },
      { key: 'resolved', label: 'Resolved', statuses: ['facility_available', 'declined', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Applications', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Facility limit', compute: 'sum_quantum' },
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Executes the LMA Transfer Certificate; crosses SARB Exchange Control inbox for every tier when the incoming lender is non-resident (W61 signature).',
        fields: [
          { key: 'approval_ref', label: 'Approval ref', type: 'evidence' },
          { key: 'approval_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'regulator_ref', label: 'SARB Exchange Control ref', type: 'evidence' },
        ],
      },
      { action: 'fail-screening', label: 'Fail KYC/AML screening', tone: 'oxide',
        path: '/api/loan-transfer/chain/:id/fail-screening',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Rejects incoming lender on FIC sanctions or AML grounds; crosses regulator inbox for every tier (FIC hard line).',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', required: true,
            placeholder: 'e.g. sanctions_hit' },
          { key: 'rejection_ref', label: 'Rejection notice ref', type: 'evidence' },
          { key: 'rejection_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'regulator_ref', label: 'FIC / regulator ref', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'screening', label: 'Screening', statuses: ['transfer_requested', 'kyc_screening', 'screening_remediation'] },
      { key: 'consent', label: 'Consent & review', statuses: ['consent_solicitation', 'regulatory_review'] },
      { key: 'executing', label: 'Executing', statuses: ['transfer_approved', 'certificate_executed', 'settled'] },
      { key: 'resolved', label: 'Resolved', statuses: ['completed', 'declined', 'rejected', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Transfers', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Transfer value', compute: 'sum_quantum' },
    ],
  },

  // W69 — Security perfection (Deeds/STRATE registration; URGENT SLA)
  {
    key: 'security_perfection', wave: 69, table: 'oe_security_perfection',
    title: 'Security perfection', refCol: 'case_number', titleCol: 'facility_name',
    quantumCol: 'secured_value_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['released', 'lapsed', 'withdrawn'],
    counterpartyCol: 'borrower_name',
    lanes: { lender: 'monitoring', ipp_developer: 'finance' },
    eventsTable: 'oe_security_perfection_events', eventsFk: 'perfection_id',
    actions: [
      { action: 'confirm-perfection', label: 'Confirm perfected',
        path: '/api/security-perfection/chain/:id/confirm-perfection',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Legal opinion accepted; security item marked perfected and unblocks first drawdown CP if this item is condition precedent.',
        fields: [
          { key: 'perfection_ref', label: 'Perfection ref', type: 'evidence' },
          { key: 'legal_opinion_ref', label: 'Legal opinion ref', type: 'evidence' },
          { key: 'perfection_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'mark-lapsed', label: 'Mark lapsed', tone: 'oxide',
        path: '/api/security-perfection/chain/:id/mark-lapsed',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Security interest lapses without registration; crosses regulator inbox for every tier (W69 universal security-loss signature).',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', required: true,
            placeholder: 'e.g. registration_window_expired' },
          { key: 'lapse_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'resolution_summary', label: 'Resolution summary', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'documenting', label: 'Documenting', statuses: ['identified', 'documentation_pending', 'executed'] },
      { key: 'registering', label: 'Registering', statuses: ['lodged_for_registration', 'registered', 'perfection_review'] },
      { key: 'attention', label: 'Needs attention', statuses: ['defective', 'perfection_overdue'] },
      { key: 'resolved', label: 'Resolved', statuses: ['perfected', 'released', 'lapsed', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Security items', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Secured value', compute: 'sum_quantum' },
    ],
  },

  // ───────── TRADER ─────────
  // Skipped: W2 trading risk (VaR snapshot tables, no chain_status/sla_deadline_at);
  // W9 MM compliance (breach_status lives on oe_mm_obligations, no sla_deadline_at —
  // not a case-list model).

  // W29 — Position limit chain (FSCA s41; forced liquidation crosses every tier)
  {
    key: 'poslimit_case', wave: 29, table: 'oe_poslimit_cases',
    title: 'Position limit', refCol: 'case_number', titleCol: 'instrument',
    quantumCol: 'cap_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['cured', 'escalated', 'false_alarm'],
    counterpartyCol: 'trader_party',
    lanes: { trader: 'risk_margin' },
    eventsTable: 'oe_poslimit_events', eventsFk: 'poslimit_id',
    actions: [
      { action: 'begin-reduction', label: 'Begin reduction',
        path: '/api/poslimit/chain/:id/begin-reduction',
        roles: ['admin', 'support', 'compliance', 'trader', 'marketmaker'],
        cascadeHint: 'Trader starts unwinding the breaching position toward the required reduction target.',
        fields: [
          { key: 'reduction_achieved_mw', label: 'Reduction achieved', type: 'number', unit: 'MW' },
        ] },
      { action: 'issue-margin-call', label: 'Issue margin call',
        path: '/api/poslimit/chain/:id/issue-margin-call',
        roles: ['admin', 'support', 'compliance'],
        cascadeHint: 'Demands a ZAR collateral top-up from the trading member; crosses FSCA inbox for prop and market_maker tiers.',
        fields: [
          { key: 'margin_called_zar', label: 'Margin called', type: 'number', unit: 'ZAR' },
          { key: 'fsca_ref', label: 'FSCA ref', type: 'evidence' },
        ] },
      { action: 'force-liquidate', label: 'Force liquidate', tone: 'oxide',
        path: '/api/poslimit/chain/:id/force-liquidate',
        roles: ['admin', 'support', 'compliance'],
        cascadeHint: 'Escalates to forced position liquidation; crosses regulator inbox for every tier (W29 universal hard line).',
        fields: [
          { key: 'liquidation_order_ref', label: 'Liquidation order ref', type: 'evidence' },
          { key: 'rod_notes', label: 'Notes', type: 'string' },
        ] },
    ],
    filters: [
      { key: 'warning', label: 'Warning', statuses: ['warning'] },
      { key: 'breach', label: 'Breach', statuses: ['soft_breach', 'hard_breach'] },
      { key: 'margin_call', label: 'Margin call', statuses: ['margin_call_issued'] },
      { key: 'reduction', label: 'Reduction', statuses: ['reduction_required', 'reduction_executing'] },
      { key: 'resolved', label: 'Resolved', statuses: ['cured', 'escalated', 'false_alarm'] },
    ],
    kpis: [
      { key: 'total', label: 'Cases', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Cap', compute: 'sum_quantum' },
    ],
  },

  // W36 — Best-execution / RFQ (FSCA Conduct Standard 1/2020; MIXED SLA)
  {
    key: 'best_execution', wave: 36, table: 'oe_best_execution',
    title: 'Best execution', refCol: 'rfq_number', titleCol: 'instrument',
    quantumCol: 'notional_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'exception_escalated', 'rfq_expired'],
    counterpartyCol: 'client_party_name',
    lanes: { trader: 'post_trade' },
    eventsTable: 'oe_best_execution_events', eventsFk: 'rfq_id',
    actions: [
      { action: 'approve', label: 'Approve execution',
        path: '/api/best-execution/chain/:id/approve',
        roles: ['admin', 'support', 'trader'],
        cascadeHint: 'Compliance approves execution against the evaluated best quote; opens the hard market execution window.',
        fields: [
          { key: 'approval_ref', label: 'Approval ref', type: 'evidence' },
          { key: 'approval_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'escalate-exception', label: 'Escalate exception', tone: 'oxide',
        path: '/api/best-execution/chain/:id/escalate-exception',
        roles: ['admin', 'support', 'trader'],
        cascadeHint: 'Escalates a best-ex exception and closes the case adversely; crosses FSCA conduct inbox for every client tier.',
        fields: [
          { key: 'exception_ref', label: 'Exception ref', type: 'evidence' },
          { key: 'exception_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'reason_code', label: 'Reason', type: 'string',
            placeholder: 'e.g. price_outside_tolerance' },
          { key: 'rod_notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'rfq_open', label: 'RFQ open', statuses: ['rfq_received', 'quotes_solicited', 'quotes_received'] },
      { key: 'evaluating', label: 'Evaluating', statuses: ['best_ex_evaluated', 'execution_approved'] },
      { key: 'executed', label: 'Executed', statuses: ['executed', 'override_executed', 'tca_reviewed'] },
      { key: 'resolved', label: 'Resolved', statuses: ['closed', 'exception_escalated', 'rfq_expired'] },
    ],
    kpis: [
      { key: 'total', label: 'RFQs', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'notional', label: 'Notional', compute: 'sum_quantum' },
    ],
  },

  // W44 — OTC trade-repository reporting (FMA 2012; SLA breach IS the violation)
  {
    key: 'trade_report', wave: 44, table: 'oe_trade_reports',
    title: 'Trade report', refCol: 'report_number', titleCol: 'product',
    quantumCol: 'notional_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['confirmed_complete', 'exempted', 'cancelled'],
    counterpartyCol: 'counterparty_name',
    lanes: { trader: 'post_trade' },
    eventsTable: 'oe_trade_reports_events', eventsFk: 'report_id',
    actions: [
      { action: 'submit', label: 'Submit to repository',
        path: '/api/trade-reporting/chain/:id/submit',
        roles: ['admin', 'support', 'trader'],
        cascadeHint: 'Submits the UTI-tagged report to the trade repository and starts the acknowledgement clock toward the T+1 FMA deadline.',
        fields: [
          { key: 'submission_ref', label: 'Submission ref', type: 'evidence' },
          { key: 'submission_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'flag-break', label: 'Flag reconciliation break', tone: 'oxide',
        path: '/api/trade-reporting/chain/:id/flag-break',
        roles: ['admin', 'support', 'trader'],
        cascadeHint: 'Flags a TR reconciliation break; crosses FSCA supervisory inbox for otc_derivative class (systemic-risk product).',
        fields: [
          { key: 'break_ref', label: 'Break ref', type: 'evidence' },
          { key: 'break_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'reason_code', label: 'Reason', type: 'string',
            placeholder: 'e.g. notional_mismatch' },
        ],
      },
    ],
    filters: [
      { key: 'pre_submission', label: 'Pre-submission', statuses: ['report_due', 'report_generated'] },
      { key: 'in_flight', label: 'In flight', statuses: ['submitted_to_tr', 'tr_acknowledged', 'reconciled'] },
      { key: 'break', label: 'Break', statuses: ['break_identified', 'break_resolved', 'corrected', 'tr_rejected'] },
      { key: 'resolved', label: 'Resolved', statuses: ['confirmed_complete', 'exempted', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Reports', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'notional', label: 'Notional', compute: 'sum_quantum' },
    ],
  },

  // W52 — Market abuse / STOR (FMA Ch.X; subject trader is read-only — WRITE {admin, regulator})
  {
    key: 'market_abuse_case', wave: 52, table: 'oe_market_abuse_cases',
    title: 'Market abuse case', refCol: 'case_number', titleCol: 'typology',
    quantumCol: 'suspect_value_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['cleared', 'sanctioned', 'dispute_resolved'],
    counterpartyCol: 'subject_party_name',
    // trader lane is read-only visibility (route READ_ROLES include the subject trader);
    // write access is per-action below — no action lists trader, so Thread shows no buttons.
    lanes: { trader: 'compliance_reporting', regulator: 'enforcement_regulator' },
    eventsTable: 'oe_market_abuse_cases_events', eventsFk: 'case_id',
    actions: [
      { action: 'clear', label: 'Clear case',
        path: '/api/market-abuse/chain/:id/clear',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Closes the surveillance case as cleared after analysis; no enforcement, subject desk released from review.',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string',
            placeholder: 'e.g. no_abuse_found' },
          { key: 'resolution_notes', label: 'Resolution notes', type: 'string' },
        ],
      },
      { action: 'file-stor', label: 'File STOR', tone: 'oxide',
        path: '/api/market-abuse/chain/:id/file-stor',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Files the suspicious-transaction report with the FSCA — the filing itself crosses the regulator inbox for every tier (W52 signature).',
        fields: [
          { key: 'stor_ref', label: 'STOR ref', type: 'evidence' },
          { key: 'stor_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'regulator_ref', label: 'FSCA / regulator ref', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'intake', label: 'Intake', statuses: ['alert_raised', 'triaged'] },
      { key: 'investigating', label: 'Investigating', statuses: ['under_investigation', 'evidence_review', 'analysis_complete'] },
      { key: 'enforcement', label: 'Enforcement', statuses: ['stor_filed', 'regulator_referred', 'enforcement_action', 'disputed'] },
      { key: 'resolved', label: 'Resolved', statuses: ['cleared', 'sanctioned', 'dispute_resolved'] },
    ],
    kpis: [
      { key: 'total', label: 'Cases', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'suspect', label: 'Suspect value', compute: 'sum_quantum' },
    ],
  },

  // W60 — Algo certification & kill-switch (FMA/FSCA, MiFID RTS-6; pre-deployment gate)
  {
    key: 'algo_certification', wave: 60, table: 'oe_algo_certifications',
    title: 'Algo certification', refCol: 'case_number', titleCol: 'system_name',
    quantumCol: 'authorised_notional_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['rejected', 'decommissioned'],
    counterpartyCol: 'firm_party_name',
    lanes: { trader: 'compliance_reporting', regulator: 'licensing' },
    eventsTable: 'oe_algo_certifications_events', eventsFk: 'cert_id',
    actions: [
      { action: 'grant-certification', label: 'Grant certification',
        path: '/api/algo-cert/chain/:id/grant-certification',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Authority certifies the system against RTS-6 pre-trade risk controls; unblocks the firm to deploy live.',
        fields: [
          { key: 'certification_ref', label: 'Certification ref', type: 'evidence' },
          { key: 'certification_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'invoke-kill-switch', label: 'Invoke kill-switch', tone: 'oxide',
        path: '/api/algo-cert/chain/:id/invoke-kill-switch',
        roles: ['admin', 'trader', 'regulator'],
        cascadeHint: 'Emergency-halts the live automated system; crosses regulator inbox for every tier (W60 signature — notifiable market event).',
        fields: [
          { key: 'kill_switch_ref', label: 'Kill-switch ref', type: 'evidence' },
          { key: 'kill_switch_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'reason_code', label: 'Reason', type: 'string',
            placeholder: 'e.g. runaway_order_rate' },
        ],
      },
    ],
    filters: [
      { key: 'intake', label: 'Intake', statuses: ['registration_submitted', 'documentation_review'] },
      { key: 'in_review', label: 'In review', statuses: ['conformance_testing', 'risk_controls_validation', 'certification_review', 'recertification_review'] },
      { key: 'live', label: 'Live / certified', statuses: ['certified', 'deployed'] },
      { key: 'suspended', label: 'Suspended', statuses: ['suspended', 'remediation_required'] },
      { key: 'resolved', label: 'Resolved', statuses: ['rejected', 'decommissioned'] },
    ],
    kpis: [
      { key: 'total', label: 'Systems', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'notional', label: 'Authorised notional', compute: 'sum_quantum' },
    ],
  },

  // W68 — Counterparty margin & default management (CPMI-IOSCO PFMI waterfall)
  {
    key: 'counterparty_margin', wave: 68, table: 'oe_counterparty_margin',
    title: 'Counterparty margin', refCol: 'case_number', titleCol: 'counterparty_name',
    quantumCol: 'exposure_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['recovered', 'written_off', 'withdrawn'],
    counterpartyCol: 'counterparty_name',
    lanes: { trader: 'risk_margin' },
    eventsTable: 'oe_counterparty_margin_events', eventsFk: 'margin_id',
    actions: [
      { action: 'issue-margin-call', label: 'Issue margin call',
        path: '/api/counterparty-margin/chain/:id/issue-margin-call',
        roles: ['admin', 'trader'],
        cascadeHint: 'Issues the IM/VM margin call to the clearing member and arms the collateral-posting window.',
        fields: [
          { key: 'margin_call_zar', label: 'Margin call amount', type: 'number', unit: 'ZAR' },
          { key: 'margin_call_ref', label: 'Margin call ref', type: 'evidence' },
          { key: 'margin_call_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'declare-default', label: 'Declare default', tone: 'oxide',
        path: '/api/counterparty-margin/chain/:id/declare-default',
        roles: ['admin', 'trader'],
        cascadeHint: 'Declares counterparty default and opens the close-out waterfall; crosses regulator inbox for every tier (W68 signature).',
        fields: [
          { key: 'shortfall_zar', label: 'Shortfall amount', type: 'number', unit: 'ZAR' },
          { key: 'default_ref', label: 'Default notice ref', type: 'evidence' },
          { key: 'default_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'reason_code', label: 'Reason', type: 'string',
            placeholder: 'e.g. failure_to_meet_call' },
        ],
      },
    ],
    filters: [
      { key: 'active', label: 'Active', statuses: ['limit_active', 'exposure_warning'] },
      { key: 'call', label: 'Margin call', statuses: ['margin_call_issued', 'collateral_received', 'position_restriction', 'cure_period'] },
      { key: 'default', label: 'Default', statuses: ['default_declared', 'close_out', 'default_fund_draw'] },
      { key: 'resolved', label: 'Resolved', statuses: ['recovered', 'written_off', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Counterparties', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Exposure', compute: 'sum_quantum' },
    ],
  },

  // W76 — Trade allocation / give-up / confirmation (DTCC-style post-execution; break-driven crossings)
  {
    key: 'trade_allocation', wave: 76, table: 'oe_trade_allocations',
    title: 'Trade allocation', refCol: 'allocation_number', titleCol: 'instrument',
    quantumCol: 'notional_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['settled', 'cancelled'],
    counterpartyCol: 'counterparty_name',
    lanes: { trader: 'post_trade' },
    eventsTable: 'oe_trade_allocation_events', eventsFk: 'allocation_id',
    actions: [
      { action: 'affirm-confirmation', label: 'Affirm confirmation',
        path: '/api/trade-allocation/chain/:id/affirm-confirmation',
        roles: ['admin', 'trader'],
        cascadeHint: 'Records counterparty affirmation; trade advances to matching and settlement instruction.',
        fields: [
          { key: 'affirmation_ref', label: 'Affirmation ref', type: 'evidence' },
          { key: 'affirmation_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'flag-break', label: 'Flag break', tone: 'oxide',
        path: '/api/trade-allocation/chain/:id/flag-break',
        roles: ['admin', 'trader'],
        cascadeHint: 'Flags an allocation/confirmation/settlement break for review; crosses regulator (FSCA/CSD) inbox for every notional tier (W76 signature).',
        fields: [
          { key: 'break_reason_code', label: 'Break type', type: 'string',
            placeholder: 'e.g. economic_mismatch' },
          { key: 'break_ref', label: 'Break ref', type: 'evidence' },
          { key: 'break_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'reason_code', label: 'Reason', type: 'string',
            placeholder: 'e.g. ssi_missing' },
        ],
      },
    ],
    filters: [
      { key: 'allocating', label: 'Allocating', statuses: ['executed', 'allocation_pending', 'allocated'] },
      { key: 'give_up', label: 'Give-up', statuses: ['give_up_pending', 'give_up_accepted'] },
      { key: 'confirming', label: 'Confirming', statuses: ['confirmation_issued', 'affirmed', 'matched', 'settlement_instructed'] },
      { key: 'break', label: 'Break', statuses: ['break_review'] },
      { key: 'resolved', label: 'Resolved', statuses: ['settled', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Allocations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'notional', label: 'Notional', compute: 'sum_quantum' },
    ],
  },

  // ───────── IPP DEVELOPER ─────────
  // Skipped: W1 IPP project management (project_activities/project_schedule_state are
  // CPM scheduling tables, ipp_projects has no chain_status/sla_deadline_at — no single
  // case-list table with a status + sla_deadline_at pair);
  // W10 bond/insurance expiry (ipp_performance_bonds tracks status + expiry_status
  // cycles but has no sla_deadline_at column — countdown lives on expiry_at, not a
  // Meridian-shaped SLA column).

  // W131 — Stage gate DG0–DG4 (Phase-E Wave 1 IPP-PM completeness; INVERTED
  // tier SLA; SIGNATURE reject_gate from any non-terminal state; gate_deferred
  // and gate_conditional_pass are SOFT pauses that re-enter the forward chain).
  // Actions hit the generic POST /:id/:action route — underscore segments.
  {
    key: 'stage_gate', wave: 131, table: 'oe_stage_gates',
    title: 'Stage gate', refCol: 'id', titleCol: 'title',
    quantumCol: 'capex_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['archived', 'gate_rejected', 'gate_withdrawn'],
    counterpartyCol: null, // sponsor-side governance record; no contractual counterparty column
    lanes: { ipp_developer: 'construction' },
    eventsTable: 'oe_stage_gate_events', eventsFk: 'gate_id',
    actions: [
      { action: 'record_decision', label: 'Record decision',
        path: '/api/stage-gate/:id/record_decision',
        roles: ['admin', 'ipp_developer'],
        cascadeHint: 'Records the gate decision; at DG3+ this sets the FID-committed floor and tightens the effective tier downstream.',
        fields: [
          { key: 'decision', label: 'Decision', type: 'string',
            placeholder: 'e.g. Conditional pass — DG3 financial close' },
          { key: 'conditions_payload', label: 'Conditions', type: 'evidence',
            placeholder: 'Conditions attached to the decision' },
          { key: 'evidence_payload', label: 'Evidence / basis', type: 'evidence' },
        ],
      },
      { action: 'pass_gate', label: 'Pass gate', tone: 'primary',
        path: '/api/stage-gate/:id/pass_gate',
        roles: ['admin', 'ipp_developer'],
        cascadeHint: 'Passes the gate; downstream notification to the linked W19/W20/W21 bridges follows.' },
      { action: 'reject_gate', label: 'Reject gate', tone: 'oxide',
        path: '/api/stage-gate/:id/reject_gate',
        roles: ['admin', 'ipp_developer'],
        cascadeHint: 'Kills the project at the gate from any non-terminal state — hard-terminal close, reportable per the tier floor rules.',
        fields: [
          { key: 'reason_code', label: 'Rejection reason', type: 'string',
            placeholder: 'e.g. IE found unmitigated geotechnical risk' },
          { key: 'evidence_payload', label: 'Evidence / basis', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'in_review', label: 'In review', statuses: ['gate_proposed', 'evidence_compiled', 'ie_reviewed', 'lender_reviewed', 'board_briefing_circulated', 'cab_held'] },
      { key: 'decisioning', label: 'Decisioning', statuses: ['conditions_set', 'decision_recorded', 'conditions_satisfied', 'gate_conditional_pass', 'gate_deferred'] },
      { key: 'passed', label: 'Passed', statuses: ['gate_passed', 'notified_downstream'] },
      { key: 'closed', label: 'Closed', statuses: ['archived', 'gate_rejected', 'gate_withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Gates', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'capex', label: 'Capex', compute: 'sum_quantum' },
    ],
  },

  // W19 — Procurement / RFP chain (REIPPPP transparency; tier by capex)
  {
    key: 'procurement_rfp', wave: 19, table: 'oe_procurement_rfps',
    title: 'Procurement RFP', refCol: 'rfp_number', titleCol: 'title',
    quantumCol: 'capex_estimate_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['delivered', 'rejected', 'cancelled'],
    counterpartyCol: 'award_name',
    lanes: { ipp_developer: 'construction' },
    eventsTable: 'oe_procurement_chain_events', eventsFk: 'rfp_id',
    actions: [
      { action: 'award', label: 'Award RFP', tone: 'primary',
        path: '/api/ipp/procurement-chain/:id/award',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Awards the RFP to the selected bidder; fires award notification to vendor and (for high-capex tier) REIPPPP transparency crossing.',
        fields: [
          { key: 'award_name', label: 'Awarded bidder', type: 'string', required: true,
            placeholder: 'e.g. Mainstream Renewable Power' },
          { key: 'award_to', label: 'Bidder reference', type: 'string',
            placeholder: 'Bidder / vendor id' },
          { key: 'award_amount_zar', label: 'Award amount', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'sign-contract', label: 'Sign contract',
        path: '/api/ipp/procurement-chain/:id/sign-contract',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Executes the contract with the awarded vendor and arms the delivery-due SLA window.' },
      { action: 'cancel', label: 'Cancel RFP', tone: 'oxide',
        path: '/api/ipp/procurement-chain/:id/cancel',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Cancels the procurement; notifies all bidders and closes the case adversely.',
        fields: [
          { key: 'reason', label: 'Cancellation reason', type: 'string', required: true,
            placeholder: 'e.g. Budget withdrawn — programme deferred' },
        ],
      },
    ],
    filters: [
      { key: 'open', label: 'Open', statuses: ['draft', 'published', 'bidding', 'bid_closed'] },
      { key: 'evaluating', label: 'Evaluating', statuses: ['evaluation', 'shortlisted', 'disputed'] },
      { key: 'awarded', label: 'Awarded', statuses: ['awarded', 'contracted'] },
      { key: 'closed', label: 'Closed', statuses: ['delivered', 'rejected', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'RFPs', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'capex', label: 'Capex estimate', compute: 'sum_quantum' },
    ],
  },

  // W20 — Construction → COD certification (NERSA §C-5 + DMRE; IE certification gate)
  {
    key: 'cod_chain', wave: 20, table: 'oe_cod_chain',
    title: 'Construction / COD', refCol: 'cod_number', titleCol: 'project_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['cod_certified', 'cancelled'],
    counterpartyCol: 'epc_contractor_name',
    lanes: { ipp_developer: 'construction' },
    eventsTable: 'oe_cod_chain_events', eventsFk: 'cod_id',
    actions: [
      { action: 'grid-synchronize', label: 'Grid synchronize',
        path: '/api/ipp/cod-chain/:id/grid-synchronize',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Records first grid synchronisation; arms the reliability-run window toward COD certification.' },
      { action: 'certify-cod', label: 'Certify COD', tone: 'primary',
        path: '/api/ipp/cod-chain/:id/certify-cod',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'IE-certified commercial operation date; fires NERSA SCADA registration crossing and unlocks PPA billing start.',
        fields: [
          { key: 'ie_certifier', label: 'IE certifier', type: 'string',
            placeholder: 'Independent engineer name' },
          { key: 'ie_cert_doc_ref', label: 'IE certificate ref', type: 'evidence' },
          { key: 'actual_cod_date', label: 'Actual COD date', type: 'date' },
          { key: 'nersa_scada_ref', label: 'NERSA SCADA ref', type: 'evidence' },
        ],
      },
      { action: 'cancel', label: 'Cancel project', tone: 'oxide',
        path: '/api/ipp/cod-chain/:id/cancel',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Abandons the construction programme before COD; fires cancellation cascade to lenders and offtaker.',
        fields: [
          { key: 'reason', label: 'Cancellation reason', type: 'string', required: true,
            placeholder: 'e.g. EPC default — programme abandoned' },
        ],
      },
    ],
    filters: [
      { key: 'construction', label: 'In construction', statuses: ['draft', 'epc_signed', 'ntp_issued', 'mobilization', 'mechanical_complete'] },
      { key: 'commissioning', label: 'Commissioning', statuses: ['cold_commissioning', 'grid_synchronized', 'reliability_run'] },
      { key: 'certified', label: 'Certified', statuses: ['cod_certified'] },
      { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Projects', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
    ],
  },

  // W23 — Insurance claim (FSCA Section 38; MIXED tier SLA)
  {
    key: 'insurance_claim', wave: 23, table: 'oe_insurance_claim_chain',
    title: 'Insurance claim', refCol: 'claim_number', titleCol: 'asset_description',
    quantumCol: 'claim_value_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['settled', 'declined', 'closed', 'withdrawn'],
    counterpartyCol: 'insurer_name',
    lanes: { ipp_developer: 'finance' },
    eventsTable: 'oe_insurance_claim_chain_events', eventsFk: 'claim_id',
    actions: [
      { action: 'agree-quantum', label: 'Agree quantum', tone: 'primary',
        path: '/api/insurance/claim-chain/:id/agree-quantum',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'oem'],
        cascadeHint: 'Accepts the loss-adjuster quantum; opens the settlement payment window with the insurer.' },
      { action: 'dispute', label: 'Dispute quantum', tone: 'oxide',
        path: '/api/insurance/claim-chain/:id/dispute',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'oem'],
        cascadeHint: 'Disputes the proposed quantum; for catastrophic tier the dispute crosses the FSCA Section 38 large-loss inbox.',
        fields: [
          { key: 'dispute_notes', label: 'Dispute basis', type: 'evidence', required: true,
            placeholder: 'Why the proposed quantum is contested' },
        ],
      },
      { action: 'settle', label: 'Record settlement',
        path: '/api/insurance/claim-chain/:id/settle',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'oem'],
        cascadeHint: 'Records the insurer payout against the agreed quantum and notifies lender security agents of proceeds.',
        fields: [
          { key: 'settled_value_zar', label: 'Settled value', type: 'number', unit: 'ZAR' },
        ],
      },
    ],
    filters: [
      { key: 'assessing', label: 'Assessing', statuses: ['notified', 'assessing', 'adjuster_assigned', 'quantum_proposed'] },
      { key: 'disputed', label: 'Disputed', statuses: ['disputed'] },
      { key: 'agreed', label: 'Agreed', statuses: ['quantum_agreed'] },
      { key: 'closed', label: 'Closed', statuses: ['settled', 'declined', 'closed', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Claims', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'claimed', label: 'Claimed value', compute: 'sum_quantum' },
    ],
  },

  // W27 — REIPPPP ED commitment (IPPO/DMRE/DTI; cure plan + penalty branch)
  {
    key: 'ed_commitment', wave: 27, table: 'oe_ed_commitments',
    title: 'ED commitment', refCol: 'case_number', titleCol: 'commitment_label',
    quantumCol: 'penalty_amount_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed'],
    counterpartyCol: 'regulator_authority',
    lanes: { ipp_developer: 'regulatory_risk' },
    eventsTable: 'oe_ed_commitment_events', eventsFk: 'commitment_id',
    actions: [
      { action: 'submit-cure-plan', label: 'Submit cure plan', tone: 'primary',
        path: '/api/ed/commitment-chain/:id/submit-cure-plan',
        roles: ['admin', 'support', 'compliance', 'ipp_developer'],
        cascadeHint: 'Files the IPPO cure plan for the under-performing commitment and starts the cure-execution clock.',
        fields: [
          { key: 'cure_plan_summary', label: 'Cure plan', type: 'evidence', required: true,
            placeholder: 'Remediation actions and target dates' },
        ],
      },
      { action: 'verify-compliance', label: 'Verify compliant',
        path: '/api/ed/commitment-chain/:id/verify-compliance',
        roles: ['admin', 'support', 'compliance', 'ipp_developer'],
        cascadeHint: 'Confirms the commitment is back within the variance threshold after cure execution.',
        fields: [
          { key: 'remediation_summary', label: 'Remediation summary', type: 'evidence' },
          { key: 'current_value', label: 'Current value', type: 'number' },
          { key: 'variance_pct', label: 'Variance %', type: 'number' },
        ],
      },
      { action: 'issue-penalty', label: 'Issue penalty', tone: 'oxide',
        path: '/api/ed/commitment-chain/:id/issue-penalty',
        roles: ['admin', 'support', 'compliance', 'ipp_developer'],
        cascadeHint: 'Records the DMRE penalty for the failed cure; crosses the regulator inbox and may escalate to DTI.',
        fields: [
          { key: 'penalty_amount_zar', label: 'Penalty amount', type: 'number', unit: 'ZAR', required: true },
          { key: 'penalty_ref', label: 'Penalty reference', type: 'evidence' },
          { key: 'regulator_authority', label: 'Regulator authority', type: 'string',
            placeholder: 'e.g. DMRE / IPPO' },
        ],
      },
    ],
    filters: [
      { key: 'monitoring', label: 'Monitoring', statuses: ['baseline_locked', 'monitoring'] },
      { key: 'cure', label: 'In cure', statuses: ['variance_flagged', 'cure_plan_required', 'cure_plan_submitted', 'cure_executing'] },
      { key: 'penalty', label: 'Penalty / escalated', statuses: ['penalty_issued', 'escalated'] },
      { key: 'closed', label: 'Closed', statuses: ['verified_compliant', 'closed', 'false_alarm'] },
    ],
    kpis: [
      { key: 'total', label: 'Commitments', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'penalty', label: 'Penalty exposure', compute: 'sum_quantum' },
    ],
  },

  // W28 — Grid Connection Agreement / UNGCA (NERSA Grid Code C-1; TWO-PARTY IPP ↔ SO)
  {
    key: 'gca_connection', wave: 28, table: 'oe_gca_connections',
    title: 'Grid connection agreement', refCol: 'case_number', titleCol: 'project_name',
    quantumCol: 'cost_estimate_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['in_service', 'rejected', 'withdrawn'],
    counterpartyCol: 'network_party',
    lanes: { ipp_developer: 'safety_grid', grid_operator: 'connections' },
    eventsTable: 'oe_gca_events', eventsFk: 'gca_id',
    actions: [
      { action: 'accept-cost', label: 'Accept cost estimate', tone: 'primary',
        path: '/api/gca/connection-chain/:id/accept-cost',
        roles: ['admin', 'support', 'compliance', 'ipp_developer'],
        cascadeHint: 'IPP accepts the connection cost estimate; SO proceeds to draft the UNGCA.',
        fields: [
          { key: 'cost_accepted_zar', label: 'Accepted cost', type: 'number', unit: 'ZAR', required: true,
            placeholder: 'Typically matches the issued estimate' },
        ],
      },
      { action: 'execute-agreement', label: 'Execute agreement',
        path: '/api/gca/connection-chain/:id/execute-agreement',
        roles: ['admin', 'support', 'compliance', 'ipp_developer'],
        cascadeHint: 'IPP executes the UNGCA; unlocks connection construction and feeds the W20 COD energisation gate.',
        fields: [
          { key: 'ungca_ref', label: 'UNGCA reference', type: 'evidence', required: true,
            placeholder: 'e.g. UNGCA-ESK-2026-0017' },
          { key: 'regulator_authority', label: 'Regulator authority', type: 'string',
            placeholder: 'NERSA for transmission tier' },
          { key: 'regulator_ref', label: 'NERSA C-1 acknowledgement ref', type: 'evidence' },
        ],
      },
      { action: 'energise', label: 'Energise connection',
        path: '/api/gca/connection-chain/:id/energise',
        roles: ['admin', 'support', 'compliance', 'grid_operator'],
        cascadeHint: 'SO energises the point of connection after construction; arms commissioning toward in-service.',
        fields: [
          { key: 'energisation_date_actual', label: 'Actual energisation date', type: 'date',
            placeholder: 'Defaults to now if blank' },
        ],
      },
      { action: 'reject', label: 'Reject application', tone: 'oxide',
        path: '/api/gca/connection-chain/:id/reject',
        roles: ['admin', 'support', 'compliance', 'grid_operator'],
        cascadeHint: 'SO denies the connection on grid-stability or load grounds; closes the case and notifies NERSA for transmission tier.',
        fields: [
          { key: 'rod_reason', label: 'Reason for rejection', type: 'evidence', required: true,
            placeholder: 'Grid stability / load / phasing grounds' },
        ],
      },
    ],
    filters: [
      { key: 'studies', label: 'Studies', statuses: ['application_filed', 'studies_required', 'studies_executing'] },
      { key: 'cost', label: 'Cost & agreement', statuses: ['cost_estimate_issued', 'cost_accepted', 'connection_agreement_drafted'] },
      { key: 'build', label: 'Build & energise', statuses: ['executed', 'construction', 'energised'] },
      { key: 'closed', label: 'Closed', statuses: ['in_service', 'rejected', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Connections', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'cost', label: 'Cost exposure', compute: 'sum_quantum' },
    ],
  },

  // W18 — Planned outage (NERSA Grid Code; TWO-PARTY — IPP submits, grid approves/runs)
  {
    key: 'planned_outage', wave: 18, table: 'oe_planned_outages',
    title: 'Planned outage', refCol: 'outage_number', titleCol: 'asset_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['rejected', 'closed', 'cancelled'],
    counterpartyCol: 'participant_id',
    lanes: { ipp_developer: 'safety_grid', grid_operator: 'operations_grid' },
    eventsTable: 'oe_planned_outage_events', eventsFk: 'outage_id',
    actions: [
      { action: 'submit', label: 'Submit for review', tone: 'primary',
        path: '/api/grid/planned-outages/:id/submit',
        roles: ['admin', 'grid', 'grid_operator', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Submits the outage request to the System Operator and starts the severity-tiered review SLA.' },
      { action: 'approve', label: 'Approve outage',
        path: '/api/grid/planned-outages/:id/approve',
        roles: ['admin', 'grid', 'grid_operator'],
        cascadeHint: 'SO approves the maintenance window against the N-1 contingency assessment; arms the notification step.' },
      { action: 'reject', label: 'Reject outage', tone: 'oxide',
        path: '/api/grid/planned-outages/:id/reject',
        roles: ['admin', 'grid', 'grid_operator'],
        cascadeHint: 'SO rejects the outage window on system-security grounds; closes the request and notifies the submitting IPP.',
        fields: [
          { key: 'reason', label: 'Reason for rejection', type: 'evidence', required: true,
            placeholder: 'System-security grounds' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'review', label: 'Review', statuses: ['draft', 'submitted', 'under_review', 'rescheduled'] },
      { key: 'approved', label: 'Approved', statuses: ['approved', 'notified'] },
      { key: 'running', label: 'Running', statuses: ['in_progress', 'restoring', 'restored'] },
      { key: 'closed', label: 'Closed', statuses: ['rejected', 'closed', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Outages', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
    ],
  },

  // W67 — Grid code compliance / non-conformance (NRS 048; TWO-PARTY split write —
  // SO drives the machinery, facility submits CAP + remediates)
  {
    key: 'grid_code_compliance', wave: 67, table: 'oe_grid_code_compliance',
    title: 'Grid code compliance', refCol: 'case_number', titleCol: 'facility_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['compliant_closed', 'disconnection_issued', 'withdrawn'],
    counterpartyCol: 'facility_party_name',
    lanes: { ipp_developer: 'safety_grid', grid_operator: 'operations_grid' },
    eventsTable: 'oe_grid_code_compliance_events', eventsFk: 'compliance_id',
    actions: [
      { action: 'submit-cap', label: 'Submit corrective-action plan', tone: 'primary',
        path: '/api/grid-code-compliance/chain/:id/submit-cap',
        roles: ['admin', 'ipp_developer'],
        cascadeHint: 'Facility files the corrective-action plan against the non-conformance; SO review clock starts.',
        fields: [
          { key: 'cap_basis', label: 'CAP basis', type: 'evidence', required: true,
            placeholder: 'The corrective-action plan the facility proposes' },
          { key: 'cap_ref', label: 'CAP reference', type: 'evidence',
            placeholder: 'e.g. CAP-2026-0011' },
        ],
      },
      { action: 'approve-cap', label: 'Approve CAP',
        path: '/api/grid-code-compliance/chain/:id/approve-cap',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO approves the corrective-action plan; facility proceeds to remediation under the tier SLA.',
        fields: [
          { key: 'approval_basis', label: 'Approval basis', type: 'evidence', required: true,
            placeholder: 'SO acceptance of the corrective-action plan' },
        ],
      },
      { action: 'escalate-disconnection', label: 'Escalate to disconnection', tone: 'oxide',
        path: '/api/grid-code-compliance/chain/:id/escalate-disconnection',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Disconnects the non-conforming licensed facility; crosses regulator inbox for every tier (W67 signature).',
        fields: [
          { key: 'disconnection_basis', label: 'Disconnection basis', type: 'evidence', required: true,
            placeholder: 'Why the connection is being disconnected' },
          { key: 'disconnection_ref', label: 'Disconnection reference', type: 'evidence',
            placeholder: 'e.g. DISC-2026-0011' },
          { key: 'reason_code', label: 'Reason code', type: 'string',
            placeholder: 'e.g. stability_risk / observability_loss / no_cap' },
        ],
      },
    ],
    filters: [
      { key: 'monitoring', label: 'Monitoring', statuses: ['monitoring', 'non_conformance_raised', 'under_assessment'] },
      { key: 'remediation', label: 'Remediation', statuses: ['corrective_action_required', 'cap_submitted', 'cap_approved', 'remediation_in_progress', 'compliance_retest'] },
      { key: 'restricted', label: 'Restricted', statuses: ['operating_restriction'] },
      { key: 'closed', label: 'Closed', statuses: ['compliant_closed', 'disconnection_issued', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Cases', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
    ],
  },

  // W75 — Connection energization & commissioning (post-W28 physical go-live;
  // TWO-PARTY split write — facility commissions, SO witnesses + authorizes)
  {
    key: 'connection_energization', wave: 75, table: 'oe_connection_energization',
    title: 'Connection energization', refCol: 'energization_number', titleCol: 'facility_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['commercial_operation', 'connection_withdrawn'],
    counterpartyCol: 'network_operator',
    lanes: { ipp_developer: 'safety_grid', grid_operator: 'connections' },
    eventsTable: 'oe_connection_energization_events', eventsFk: 'energization_id',
    actions: [
      { action: 'submit-program', label: 'Submit commissioning programme',
        path: '/api/connection-energization/chain/:id/submit-program',
        roles: ['admin', 'ipp_developer'],
        cascadeHint: 'Facility files the witnessed hold-point commissioning programme for SO review.',
        fields: [
          { key: 'program_basis', label: 'Programme basis', type: 'evidence', required: true,
            placeholder: 'The commissioning & energization programme' },
          { key: 'program_ref', label: 'Programme reference', type: 'evidence',
            placeholder: 'e.g. PROG-2026-0007' },
          { key: 'connection_capacity_mw', label: 'Restate connection capacity', type: 'number', unit: 'MW',
            placeholder: 'Blank to keep recorded capacity' },
        ],
      },
      { action: 'authorize-energization', label: 'Authorize energization',
        path: '/api/connection-energization/chain/:id/authorize-energization',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO authorizes first energization after pre-energization inspection; crosses regulator inbox for transmission and bulk tiers.',
        fields: [
          { key: 'energization_basis', label: 'Energization basis', type: 'evidence', required: true,
            placeholder: 'SO authorizes back-energization of the connection' },
          { key: 'energization_ref', label: 'Energization authorization ref', type: 'evidence',
            placeholder: 'e.g. EAUTH-2026-0007' },
        ],
      },
      { action: 'issue-cod', label: 'Issue COD', tone: 'primary',
        path: '/api/connection-energization/chain/:id/issue-cod',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO issues the commercial-operation certificate; crosses regulator inbox for every tier (W75 signature — NERSA generation register).',
        fields: [
          { key: 'cod_basis', label: 'COD basis', type: 'evidence', required: true,
            placeholder: 'Commercial Operation Date certified; the plant may now sell energy' },
          { key: 'cod_certificate_no', label: 'COD certificate number', type: 'string',
            placeholder: 'e.g. COD-2026-0007' },
          { key: 'cod_date', label: 'COD date', type: 'date' },
        ],
      },
      { action: 'suspend-commissioning', label: 'Suspend commissioning', tone: 'oxide',
        path: '/api/connection-energization/chain/:id/suspend-commissioning',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO suspends the commissioning programme on safety or protection grounds; crosses regulator inbox for transmission and bulk tiers.',
        fields: [
          { key: 'suspension_basis', label: 'Suspension basis', type: 'evidence', required: true,
            placeholder: 'A hold-point failed / safety concern' },
          { key: 'suspension_ref', label: 'Suspension reference', type: 'evidence',
            placeholder: 'e.g. SUSP-2026-0007' },
          { key: 'reason_code', label: 'Reason code', type: 'string',
            placeholder: 'e.g. protection_failure / safety_nonconformance' },
        ],
      },
    ],
    filters: [
      { key: 'program', label: 'Programme', statuses: ['connection_ready', 'program_review', 'program_approved'] },
      { key: 'commissioning', label: 'Commissioning', statuses: ['pre_energization_inspection', 'energization_authorized', 'cold_commissioning', 'synchronized', 'trial_operation', 'compliance_testing'] },
      { key: 'suspended', label: 'Suspended', statuses: ['commissioning_suspended'] },
      { key: 'closed', label: 'Closed', statuses: ['commercial_operation', 'connection_withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Energizations', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
    ],
  },

  // ───────── OFFTAKER ─────────

  // W7 — Monthly PPA delivery obligation (contracted-vs-delivered per period;
  // cure window on shortfall; take-or-pay computed at cure expiry feeds the
  // regulator inbox). Non-standard columns: plain `status` + `cure_deadline_at`
  // (mig 104) — absorbed by the per-entry statusCol/deadlineCol fields.
  {
    key: 'ppa_obligation', wave: 7, table: 'oe_offtaker_ppa_obligations',
    title: 'PPA delivery obligation', refCol: 'id', titleCol: 'period_month',
    quantumCol: 'take_or_pay_amount_zar', statusCol: 'status',
    deadlineCol: 'cure_deadline_at',
    terminal: ['delivered', 'cured', 'take_or_pay'],
    counterpartyCol: 'counterparty_id',
    lanes: { offtaker: 'operations_offtaker' },
    // oe_offtaker_delivery_verification holds meter-reading verifications, not a
    // transition log — Thread hides the timeline.
    eventsTable: null, eventsFk: null,
    // The only obligation-level POST on the route is /:id/cure (reading
    // verify/reject act on reading ids, not the obligation id).
    actions: [
      { action: 'cure', label: 'Accept cure plan', tone: 'primary',
        path: '/api/offtaker/obligations/:id/cure',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Accepts cure evidence on a shortfall month; fires the obligation-cured cascade and stands down take-or-pay escalation.',
        fields: [
          { key: 'evidence_r2_key', label: 'Cure evidence', type: 'evidence', required: true },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'shortfall', label: 'In shortfall', statuses: ['shortfall'] },
      { key: 'pending', label: 'Pending', statuses: ['pending'] },
      { key: 'resolved', label: 'Resolved', statuses: ['delivered', 'cured', 'take_or_pay'] },
    ],
    kpis: [
      { key: 'total', label: 'Obligations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'top_exposure', label: 'Take-or-pay exposure', compute: 'sum_quantum' },
    ],
  },

  // W22 — PPA contract execution (NERSA Section 34; single-party offtaker write)
  {
    key: 'ppa_contract_chain', wave: 22, table: 'oe_ppa_contract_chain',
    title: 'PPA contract', refCol: 'ppa_number', titleCol: 'project_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['terminated', 'expired', 'cancelled'],
    // DDL has no seller-name column (participant_id is an id; offtaker_name is the
    // viewing party itself) — project_name in titleCol already identifies the deal.
    counterpartyCol: null,
    lanes: { offtaker: 'contracts' },
    eventsTable: 'oe_ppa_contract_chain_events', eventsFk: 'ppa_id',
    actions: [
      { action: 'execute', label: 'Execute PPA', tone: 'primary',
        path: '/api/offtaker/ppa-contract-chain/:id/execute',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Executes the signed PPA into force; fires the NERSA Section 34 registration crossing and arms the commencement window.',
        fields: [
          { key: 'nersa_section34_ref', label: 'NERSA Section 34 ref', type: 'evidence' },
          { key: 'board_approval_ref', label: 'Board approval ref', type: 'evidence', required: true },
          { key: 'legal_counterparty_ref', label: 'Legal counterparty ref', type: 'evidence', required: true },
        ],
      },
      { action: 'commence', label: 'Commence delivery',
        path: '/api/offtaker/ppa-contract-chain/:id/commence',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Marks first contracted delivery under the executed PPA; opens monthly contracted-vs-delivered billing (feeds W32).' },
      { action: 'terminate', label: 'Terminate PPA', tone: 'oxide',
        path: '/api/offtaker/ppa-contract-chain/:id/terminate',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Terminates the PPA for unresolved breach; closes the contract adversely and notifies seller and lenders.',
        fields: [
          { key: 'reason', label: 'Termination reason', type: 'string', required: true,
            placeholder: 'e.g. unremedied seller default — failure to reach COD' },
        ],
      },
    ],
    filters: [
      { key: 'in_force', label: 'In force', statuses: ['in_force'] },
      { key: 'in_dispute', label: 'In dispute', statuses: ['in_dispute'] },
      { key: 'pre_execution', label: 'Pre-execution', statuses: ['draft', 'in_negotiation', 'terms_locked', 'legal_signed', 'executed'] },
      { key: 'closed', label: 'Closed', statuses: ['terminated', 'expired', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'PPAs', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W32 — Take-or-pay annual true-up (IFRS 16 + NERSA s34; TWO-PARTY — offtaker
  // drives statement/quantum/settle, IPP submits evidence + accepts/disputes)
  {
    key: 'ppa_take_or_pay', wave: 32, table: 'oe_top_cases',
    title: 'Take-or-pay case', refCol: 'case_number', titleCol: 'ipp_party_name',
    quantumCol: 'top_amount_proposed', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['settled', 'disputed', 'waived'],
    counterpartyCol: 'ipp_party_name',
    lanes: { offtaker: 'operations_offtaker', ipp_developer: 'finance' },
    eventsTable: 'oe_top_events', eventsFk: 'top_id',
    actions: [
      { action: 'propose-quantum', label: 'Propose quantum',
        path: '/api/take-or-pay/chain/:id/propose-quantum',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Offtaker proposes the take-or-pay quantum from the contracted-vs-delivered statement; IPP acceptance clock starts.',
        fields: [
          { key: 'top_amount_proposed', label: 'Proposed quantum', type: 'number', unit: 'ZAR' },
          { key: 'quantum_proposal_ref', label: 'Proposal basis / ref', type: 'evidence' },
        ],
      },
      { action: 'accept-quantum', label: 'Accept quantum',
        path: '/api/take-or-pay/chain/:id/accept-quantum',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'IPP accepts the proposed take-or-pay quantum; opens the settlement payment window.',
        fields: [
          { key: 'top_amount_agreed', label: 'Agreed quantum', type: 'number', unit: 'ZAR' },
          { key: 'quantum_acceptance_ref', label: 'Acceptance basis / ref', type: 'evidence' },
        ],
      },
      { action: 'settle', label: 'Settle', tone: 'primary',
        path: '/api/take-or-pay/chain/:id/settle',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Records take-or-pay settlement against the agreed quantum and closes the contract-year true-up.',
        fields: [
          { key: 'top_amount_settled', label: 'Settled amount', type: 'number', unit: 'ZAR' },
          { key: 'settlement_ref', label: 'Settlement ref', type: 'evidence' },
          { key: 'nersa_top_return_ref', label: 'NERSA TOP return ref', type: 'evidence' },
        ],
      },
      { action: 'dispute', label: 'Dispute', tone: 'oxide',
        path: '/api/take-or-pay/chain/:id/dispute',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'IPP disputes the proposed quantum; the case terminates disputed and crosses the regulator inbox.',
        fields: [
          { key: 'reason_code', label: 'Dispute reason', type: 'string',
            placeholder: 'e.g. delivered volume understated' },
          { key: 'dispute_panel_ref', label: 'Dispute panel ref', type: 'evidence' },
          { key: 'section34_filing_ref', label: 'Section 34 filing ref', type: 'evidence' },
          { key: 'rod_notes', label: 'Record-of-decision notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'open', label: 'Open', statuses: ['accrual_open', 'year_end', 'statement_issued', 'evidence_required', 'evidence_submitted'] },
      { key: 'quantum', label: 'Quantum stage', statuses: ['quantum_proposed', 'quantum_agreed'] },
      { key: 'resolved', label: 'Resolved', statuses: ['settled', 'disputed', 'waived'] },
    ],
    kpis: [
      { key: 'total', label: 'TOP cases', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'quantum', label: 'Proposed quantum', compute: 'sum_quantum' },
    ],
  },

  // W39 — PPA tariff indexation / CPI repricing (NERSA ERA §4 + IFRS 16; TWO-PARTY —
  // seller publishes index + issues notice + applies, offtaker reviews/agrees/disputes)
  {
    key: 'tariff_indexation', wave: 39, table: 'oe_tariff_indexation',
    title: 'Tariff indexation', refCol: 'indexation_number', titleCol: 'project_name',
    quantumCol: 'annual_contract_value_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['applied', 'arbitrated', 'withdrawn'],
    counterpartyCol: 'seller_party_name',
    lanes: { offtaker: 'contracts', ipp_developer: 'finance' },
    eventsTable: 'oe_tariff_indexation_events', eventsFk: 'indexation_id',
    actions: [
      { action: 'agree-tariff', label: 'Agree tariff', tone: 'primary',
        path: '/api/tariff-indexation/chain/:id/agree-tariff',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Offtaker agrees the escalated tariff from the published index; seller proceeds to apply the new rate.',
        fields: [
          { key: 'agreed_tariff_zar_mwh', label: 'Agreed tariff (ZAR/MWh)', type: 'number', unit: 'ZAR' },
          { key: 'reason_code', label: 'Reason', type: 'string' },
          { key: 'review_basis', label: 'Review basis', type: 'evidence' },
        ],
      },
      { action: 'apply-tariff', label: 'Apply tariff',
        path: '/api/tariff-indexation/chain/:id/apply-tariff',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller applies the agreed tariff to billing from the effective date; closes the annual repricing cycle.',
        fields: [
          { key: 'agreed_tariff_zar_mwh', label: 'Agreed tariff (ZAR/MWh)', type: 'number', unit: 'ZAR' },
          { key: 'reason_code', label: 'Reason', type: 'string' },
          { key: 'rod_notes', label: 'Record-of-decision notes', type: 'string' },
        ],
      },
      { action: 'raise-dispute', label: 'Raise dispute', tone: 'oxide',
        path: '/api/tariff-indexation/chain/:id/raise-dispute',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Offtaker disputes the escalation calculation; opens the recalculation loop and may refer to arbitration.',
        fields: [
          { key: 'dispute_basis', label: 'Dispute basis', type: 'evidence' },
          { key: 'dispute_ref', label: 'Dispute ref', type: 'evidence' },
          { key: 'disputed_amount_zar', label: 'Disputed amount', type: 'number', unit: 'ZAR' },
          { key: 'reason_code', label: 'Reason', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'in_progress', label: 'In progress', statuses: ['indexation_due', 'index_published', 'escalation_calculated', 'notice_issued', 'under_review', 'tariff_agreed'] },
      { key: 'in_dispute', label: 'In dispute', statuses: ['disputed', 'recalculated'] },
      { key: 'resolved', label: 'Resolved', statuses: ['applied', 'arbitrated', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Indexations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'contract_value', label: 'Annual contract value', compute: 'sum_quantum' },
    ],
  },

  // W46 — Curtailment / deemed-energy compensation claim (TWO-PARTY — seller IPP
  // submits + disputes, buyer offtaker classifies/validates/settles)
  {
    key: 'curtailment_claim', wave: 46, table: 'oe_curtailment_claims',
    title: 'Curtailment claim', refCol: 'claim_number', titleCol: 'facility_name',
    quantumCol: 'claimed_amount', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['compensation_settled', 'arbitrated', 'non_compensable', 'withdrawn'],
    counterpartyCol: 'seller_party_name',
    lanes: { offtaker: 'operations_offtaker', ipp_developer: 'finance' },
    eventsTable: 'oe_curtailment_claims_events', eventsFk: 'claim_id',
    actions: [
      { action: 'submit-claim', label: 'Submit claim', tone: 'primary',
        path: '/api/curtailment-claim/chain/:id/submit-claim',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller files the deemed-energy claim for the curtailment event; buyer classification clock starts.',
        fields: [
          { key: 'claim_basis', label: 'Claim basis', type: 'evidence' },
          { key: 'claim_ref', label: 'Claim ref', type: 'evidence', required: true },
          { key: 'deemed_energy_mwh', label: 'Deemed energy', type: 'number', unit: 'MWh', required: true },
          { key: 'claimed_amount', label: 'Claimed amount', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'confirm-compensable', label: 'Confirm compensable',
        path: '/api/curtailment-claim/chain/:id/confirm-compensable',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Buyer classifies the curtailment as compensable under the PPA; advances to quantum validation.',
        fields: [
          { key: 'classification_basis', label: 'Classification basis', type: 'evidence' },
        ],
      },
      { action: 'settle-compensation', label: 'Settle compensation', tone: 'primary',
        path: '/api/curtailment-claim/chain/:id/settle-compensation',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Pays the agreed deemed-energy quantum at the W39-indexed tariff and closes the claim.',
        fields: [
          { key: 'settlement_basis', label: 'Settlement basis', type: 'evidence' },
          { key: 'settlement_ref', label: 'Settlement ref', type: 'evidence' },
          { key: 'settled_amount', label: 'Settled amount', type: 'number', unit: 'ZAR' },
          { key: 'reason_code', label: 'Reason', type: 'string' },
          { key: 'rod_notes', label: 'Record-of-decision notes', type: 'string' },
        ],
      },
      { action: 'dispute', label: 'Dispute', tone: 'oxide',
        path: '/api/curtailment-claim/chain/:id/dispute',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller disputes the classification or quantum; opens recalculation and may refer to arbitration (crosses regulator for every tier).',
        fields: [
          { key: 'dispute_basis', label: 'Dispute basis', type: 'evidence' },
          { key: 'dispute_ref', label: 'Dispute ref', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'classification', label: 'Classification', statuses: ['curtailment_logged', 'classification_review', 'claim_prepared', 'claim_submitted'] },
      { key: 'validation', label: 'Validation', statuses: ['validation_underway', 'quantum_proposed', 'quantum_agreed'] },
      { key: 'in_dispute', label: 'In dispute', statuses: ['disputed'] },
      { key: 'closed', label: 'Closed', statuses: ['compensation_settled', 'arbitrated', 'non_compensable', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Claims', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'claimed', label: 'Claimed amount', compute: 'sum_quantum' },
    ],
  },

  // W54 — PPA payment security / credit-support instrument (TWO-PARTY — offtaker
  // submits the instrument, seller verifies/activates/draws/forfeits/releases)
  {
    key: 'ppa_payment_security', wave: 54, table: 'oe_ppa_payment_securities',
    title: 'Payment security', refCol: 'security_number', titleCol: 'instrument_name',
    quantumCol: 'secured_amount_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['released', 'forfeited', 'rejected'],
    counterpartyCol: 'seller_party_name',
    lanes: { offtaker: 'security_offtaker', ipp_developer: 'finance' },
    eventsTable: 'oe_ppa_payment_securities_events', eventsFk: 'security_id',
    actions: [
      { action: 'submit-instrument', label: 'Submit instrument', tone: 'primary',
        path: '/api/payment-security/chain/:id/submit-instrument',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Offtaker lodges the guarantee/LC/PCG/cash instrument; seller verification clock starts.',
        fields: [
          { key: 'instrument_name', label: 'Instrument name', type: 'string' },
          { key: 'instrument_type', label: 'Instrument type', type: 'string',
            placeholder: 'e.g. bank_guarantee / letter_of_credit / pcg / cash' },
          { key: 'issuer_name', label: 'Issuer name', type: 'string' },
          { key: 'issuer_rating', label: 'Issuer rating', type: 'string' },
          { key: 'secured_amount_zar_m', label: 'Secured amount (R millions)', type: 'number', unit: 'ZAR' },
          { key: 'required_amount_zar_m', label: 'Required amount (R millions)', type: 'number', unit: 'ZAR' },
          { key: 'cover_months', label: 'Cover (months)', type: 'number' },
          { key: 'expiry_date', label: 'Expiry date', type: 'date' },
          { key: 'submission_ref', label: 'Submission ref', type: 'evidence' },
          { key: 'submission_basis', label: 'Submission basis', type: 'evidence' },
        ],
      },
      { action: 'activate', label: 'Activate security',
        path: '/api/payment-security/chain/:id/activate',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller activates the verified instrument as live PPA credit support; arms adequacy-review and expiry monitoring.',
        fields: [
          { key: 'activation_ref', label: 'Activation ref', type: 'evidence' },
          { key: 'activation_basis', label: 'Activation basis', type: 'evidence' },
        ],
      },
      { action: 'initiate-drawdown', label: 'Initiate drawdown',
        path: '/api/payment-security/chain/:id/initiate-drawdown',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller draws on the security for unpaid invoices; opens the replenishment obligation against the offtaker.',
        fields: [
          { key: 'drawn_amount_zar_m', label: 'Drawn amount (R millions)', type: 'number', unit: 'ZAR' },
          { key: 'outstanding_invoice_zar_m', label: 'Outstanding invoice (R millions)', type: 'number', unit: 'ZAR' },
          { key: 'replenishment_due_zar_m', label: 'Replenishment due (R millions)', type: 'number', unit: 'ZAR' },
          { key: 'drawdown_ref', label: 'Drawdown ref', type: 'evidence' },
          { key: 'drawdown_basis', label: 'Drawdown basis', type: 'evidence' },
          { key: 'regulator_ref', label: 'Regulator ref', type: 'evidence' },
        ],
      },
      { action: 'forfeit', label: 'Forfeit security', tone: 'oxide',
        path: '/api/payment-security/chain/:id/forfeit',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Forfeits the instrument for unremedied default; crosses the regulator inbox for every tier (W54 signature).',
        fields: [
          { key: 'reason_code', label: 'Forfeit reason', type: 'string' },
          { key: 'forfeit_basis', label: 'Forfeit basis', type: 'evidence' },
          { key: 'forfeit_ref', label: 'Forfeit ref', type: 'evidence' },
          { key: 'regulator_ref', label: 'Regulator ref', type: 'evidence' },
          { key: 'decision_notes', label: 'Decision notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'verification', label: 'Verification', statuses: ['security_required', 'instrument_submitted', 'under_verification'] },
      { key: 'active', label: 'Active', statuses: ['active', 'adequacy_review', 'drawdown_initiated', 'replenishment_pending', 'expiry_pending', 'substitution_pending'] },
      { key: 'closed', label: 'Closed', statuses: ['released', 'forfeited', 'rejected'] },
    ],
    kpis: [
      { key: 'total', label: 'Securities', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'secured', label: 'Secured amount', compute: 'sum_quantum' },
    ],
  },

  // W62 — PPA termination & early-termination amount (TWO-PARTY — offtaker drives
  // notice/cure/ETA/settlement, IPP counterparty may dispute the ETA)
  {
    key: 'ppa_termination', wave: 62, table: 'oe_ppa_terminations',
    title: 'PPA termination', refCol: 'case_number', titleCol: 'ppa_name',
    quantumCol: 'buyout_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'reinstated', 'withdrawn'],
    counterpartyCol: 'seller_party_name',
    lanes: { offtaker: 'contracts', ipp_developer: 'finance' },
    eventsTable: 'oe_ppa_terminations_events', eventsFk: 'termination_id',
    actions: [
      { action: 'serve-notice', label: 'Serve notice',
        path: '/api/ppa-termination/chain/:id/serve-notice',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Serves the termination notice on the seller and opens the cause-dependent cure window.',
        fields: [
          { key: 'reason_code', label: 'Termination cause', type: 'string',
            placeholder: 'seller_default / buyer_default / no_fault / change_in_law / prolonged_force_majeure' },
          { key: 'notice_ref', label: 'Notice ref', type: 'evidence' },
          { key: 'notice_basis', label: 'Notice basis', type: 'evidence' },
        ],
      },
      { action: 'confirm-termination', label: 'Confirm termination', tone: 'oxide',
        path: '/api/ppa-termination/chain/:id/confirm-termination',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Confirms termination after a failed cure; crosses the regulator inbox for every tier when involuntary (W62 signature).',
        fields: [
          { key: 'confirmation_ref', label: 'Confirmation ref', type: 'evidence' },
          { key: 'confirmation_basis', label: 'Confirmation basis', type: 'evidence' },
          { key: 'regulator_ref', label: 'Regulator ref', type: 'evidence' },
        ],
      },
      { action: 'agree-eta', label: 'Agree ETA', tone: 'primary',
        path: '/api/ppa-termination/chain/:id/agree-eta',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Agrees the early-termination amount on the cause-driven buy-out basis; opens settlement.',
        fields: [
          { key: 'buyout_zar_m', label: 'Buy-out amount (R millions)', type: 'number', unit: 'ZAR' },
          { key: 'debt_outstanding_zar_m', label: 'Debt outstanding (R millions)', type: 'number', unit: 'ZAR' },
          { key: 'equity_makewhole_zar_m', label: 'Equity make-whole (R millions)', type: 'number', unit: 'ZAR' },
          { key: 'agreement_ref', label: 'Agreement ref', type: 'evidence' },
          { key: 'agreement_basis', label: 'Agreement basis', type: 'evidence' },
        ],
      },
      { action: 'dispute-eta', label: 'Dispute ETA', tone: 'oxide',
        path: '/api/ppa-termination/chain/:id/dispute-eta',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller disputes the early-termination amount; opens the ETA dispute-resolution loop.',
        fields: [
          { key: 'reason_code', label: 'Dispute reason', type: 'string' },
          { key: 'dispute_ref', label: 'Dispute ref', type: 'evidence' },
          { key: 'dispute_basis', label: 'Dispute basis', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'notice', label: 'Notice / cure', statuses: ['termination_triggered', 'notice_served', 'cure_period', 'termination_review'] },
      { key: 'eta', label: 'ETA stage', statuses: ['termination_confirmed', 'eta_assessment', 'eta_agreed', 'settlement_pending'] },
      { key: 'in_dispute', label: 'In dispute', statuses: ['disputed'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'reinstated', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Terminations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'buyout', label: 'Buy-out exposure', compute: 'sum_quantum' },
    ],
  },

  // W70 — REC / guarantee-of-origin certificate lifecycle (TWO-PARTY — issuer
  // {admin, ipp_developer} drives issuance/claw-back, holder {admin, offtaker}
  // allocates + retires; note: 'support' is NOT a write role on this chain)
  {
    key: 'rec_lifecycle', wave: 70, table: 'oe_rec_lifecycle',
    title: 'REC certificate', refCol: 'case_number', titleCol: 'project_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['retired', 'cancelled', 'rejected', 'clawed_back', 'expired'],
    counterpartyCol: 'issuer_name',
    lanes: { offtaker: 'contracts', ipp_developer: 'finance' },
    eventsTable: 'oe_rec_lifecycle_events', eventsFk: 'rec_id',
    actions: [
      { action: 'approve-issuance', label: 'Approve issuance',
        path: '/api/rec-lifecycle/chain/:id/approve-issuance',
        roles: ['admin', 'ipp_developer'],
        cascadeHint: 'Issuer approves certificate issuance after eligibility review; one MWh attribute enters the registry once.',
        fields: [
          { key: 'certificate_serial', label: 'Certificate serial', type: 'string' },
          { key: 'issuance_ref', label: 'Issuance ref', type: 'evidence' },
          { key: 'issuance_basis', label: 'Issuance basis', type: 'evidence' },
        ],
      },
      { action: 'allocate-consumption', label: 'Allocate consumption',
        path: '/api/rec-lifecycle/chain/:id/allocate-consumption',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Holder allocates the certificate to a consumption period ahead of the Scope-2 market-based claim.',
        fields: [
          { key: 'allocation_ref', label: 'Allocation ref', type: 'evidence' },
          { key: 'allocation_basis', label: 'Allocation basis', type: 'evidence' },
        ],
      },
      { action: 'retire-certificate', label: 'Retire certificate', tone: 'primary',
        path: '/api/rec-lifecycle/chain/:id/retire-certificate',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Retires the certificate to substantiate the renewable-consumption claim; the attribute can never be used again.',
        fields: [
          { key: 'claim_certificate_number', label: 'Claim certificate number', type: 'string' },
          { key: 'retirement_ref', label: 'Retirement ref', type: 'evidence' },
          { key: 'retirement_basis', label: 'Retirement basis', type: 'evidence' },
          { key: 'resolution_summary', label: 'Resolution summary', type: 'string' },
        ],
      },
      { action: 'claw-back', label: 'Claw back', tone: 'oxide',
        path: '/api/rec-lifecycle/chain/:id/claw-back',
        roles: ['admin', 'ipp_developer'],
        cascadeHint: 'Revokes the certificate on an upheld integrity dispute; crosses the regulator inbox for every tier (W70 double-counting signature).',
        fields: [
          { key: 'reason_code', label: 'Claw-back reason', type: 'string' },
          { key: 'clawback_basis', label: 'Claw-back basis', type: 'evidence' },
          { key: 'resolution_summary', label: 'Resolution summary', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'issuance', label: 'Issuance', statuses: ['issuance_requested', 'eligibility_review', 'issued'] },
      { key: 'in_market', label: 'In market', statuses: ['listed_for_transfer', 'transferred', 'allocated'] },
      { key: 'in_dispute', label: 'In dispute', statuses: ['disputed'] },
      { key: 'closed', label: 'Closed', statuses: ['retired', 'cancelled', 'rejected', 'clawed_back', 'expired'] },
    ],
    kpis: [
      { key: 'total', label: 'Certificates', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // ───────── CARBON FUND ─────────
  // Skipped: W4 Article 6 corresponding adjustments (oe_article6_adjustments uses
  // `ca_status`, no sla_deadline_at); W11 carbon MRV chain (mrv_submissions has
  // chain_status but no sla_deadline_at — deadlines live on doe_due_at/cra_due_at).
  // (W17 carbon retirement now lands in the parity batch below — it does expose
  // chain_status + sla_deadline_at + an events table, contrary to the old skip note.)

  // ───────── CARBON (parity batch) ─────────
  // Six carbon chains that were never migrated to the registry. Each renders
  // through the generic Ledger/Thread surfaces. Action paths are full segments
  // (these routes are segment-per-transition, not POST /:id/action).

  // W82 — Carbon credit issuance (registry serialization + buffer-pool integrity)
  {
    key: 'carbon_issuance', wave: 82, table: 'oe_carbon_issuances',
    title: 'Credit issuance', refCol: 'issuance_number', titleCol: 'project_name',
    quantumCol: 'requested_tco2e', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['issued', 'rejected', 'withdrawn', 'cancelled'],
    counterpartyCol: 'proponent_party_name',
    lanes: { carbon_fund: 'issuance_registry' },
    eventsTable: 'oe_carbon_issuances_events', eventsFk: 'issuance_id',
    actions: [
      { action: 'begin-screening', label: 'Begin screening',
        path: '/api/carbon-issuance/chain/:id/begin-screening',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Opens desk screening of the issuance request; predicts a realistic mint date.',
        fields: [
          { key: 'screening_ref', label: 'Screening ref', type: 'evidence' },
          { key: 'screening_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'verify-against-mrv', label: 'Verify against MRV',
        path: '/api/carbon-issuance/chain/:id/verify-against-mrv',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Recomputes the integrity battery — buffer deduction, net issuable, headroom, over-issuance flag.',
        fields: [
          { key: 'verified_tco2e', label: 'Verified', type: 'number', unit: 'tCO2e' },
          { key: 'already_issued_tco2e', label: 'Already issued', type: 'number', unit: 'tCO2e' },
          { key: 'verification_check_ref', label: 'Verification ref', type: 'evidence' },
          { key: 'verification_check_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'confirm-issuance', label: 'Confirm issuance', tone: 'primary',
        path: '/api/carbon-issuance/chain/:id/confirm-issuance',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Mints the serialised credits to the registry; closes the case issued.',
        fields: [
          { key: 'issuance_ref', label: 'Issuance ref', type: 'evidence' },
          { key: 'corresponding_adjustment_ref', label: 'Corresponding-adjustment ref', type: 'evidence' },
          { key: 'issuance_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'reject', label: 'Reject', tone: 'oxide',
        path: '/api/carbon-issuance/chain/:id/reject',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Rejects the issuance request; closes the case adversely.',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', placeholder: 'e.g. over_issuance' },
          { key: 'rejection_ref', label: 'Rejection notice ref', type: 'evidence' },
          { key: 'rejection_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'regulator_ref', label: 'Regulator ref', type: 'evidence' },
        ],
      },
    ],
    kpis: [
      { key: 'total', label: 'Issuances', compute: 'count' },
      { key: 'requested', label: 'Requested', compute: 'sum_quantum' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W91 — CCP eligibility assessment (Calyx Global / ICVCM Core Carbon Principles)
  {
    key: 'ccp_assessment', wave: 91, table: 'oe_ccp_assessments',
    title: 'CCP assessment', refCol: 'assessment_number', titleCol: 'project_name',
    quantumCol: 'assessed_annual_tco2e', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['ccp_label_granted', 'ccp_label_denied', 'withdrawn'],
    counterpartyCol: 'proponent_party_name',
    lanes: { carbon_fund: 'mrv_verification' },
    eventsTable: 'oe_ccp_assessments_events', eventsFk: 'assessment_id',
    actions: [
      { action: 'begin-assessment', label: 'Begin assessment',
        path: '/api/ccp-assessment/chain/:id/begin-assessment',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Opens the 10-criterion CCP assessment; the live aggregate/weakest/gap battery re-derives from the scores.',
        fields: [
          { key: 'assessment_ref', label: 'Assessment ref', type: 'evidence' },
          { key: 'assessment_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'submit-for-decision', label: 'Submit for decision',
        path: '/api/ccp-assessment/chain/:id/submit-for-decision',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Submits the completed assessment for the CCP label decision.',
        fields: [
          { key: 'decision_ref', label: 'Decision ref', type: 'evidence' },
          { key: 'decision_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'grant-ccp-label', label: 'Grant CCP label', tone: 'primary',
        path: '/api/ccp-assessment/chain/:id/grant-ccp-label',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Grants the CCP label (optionally conditional); closes the assessment as eligible.',
        fields: [
          { key: 'conditional_grant_conditions', label: 'Conditions (if conditional)', type: 'string' },
          { key: 'corsia_eligibility_ref', label: 'CORSIA eligibility ref', type: 'evidence' },
          { key: 'grant_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'deny-ccp-label', label: 'Deny CCP label', tone: 'oxide',
        path: '/api/ccp-assessment/chain/:id/deny-ccp-label',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Denies the CCP label — crosses to the integrity regulator on every tier.',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', placeholder: 'e.g. additionality_gap' },
          { key: 'denial_ref', label: 'Denial notice ref', type: 'evidence' },
          { key: 'denial_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'regulator_ref', label: 'Regulator ref', type: 'evidence' },
        ],
      },
    ],
    kpis: [
      { key: 'total', label: 'Assessments', compute: 'count' },
      { key: 'assessed', label: 'Assessed', compute: 'sum_quantum' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W109 — Carbon credit quality rating (third-party rater; methodology→additionality→permanence→leakage→cobenefits)
  {
    key: 'carbon_credit_rating', wave: 109, table: 'oe_carbon_credit_rating',
    title: 'Credit quality rating', refCol: 'rating_number', titleCol: 'project_name',
    quantumCol: 'scope_scale_tonnes', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['re_rated', 'withdrawn', 'escalated_to_integrity', 'downgraded'],
    counterpartyCol: 'issuer_name',
    lanes: { carbon_fund: 'trading_markets' },
    eventsTable: 'oe_carbon_credit_rating_events', eventsFk: 'rating_id',
    initiation: {
      label: 'Request rating',
      path: '/api/carbon/credit-rating/chain',
      fields: [
        { key: 'project_name', label: 'Project', type: 'string' },
        { key: 'issuer_name', label: 'Issuer', type: 'string' },
        { key: 'scope_scale_tonnes', label: 'Scope / scale', type: 'number', unit: 'tCO2e' },
        { key: 'methodology_name', label: 'Methodology', type: 'string' },
        { key: 'credit_vintage_year', label: 'Vintage year', type: 'number' },
        { key: 'narrative', label: 'Narrative', type: 'string' },
      ],
    },
    actions: [
      { action: 'start-desk-review', label: 'Start desk review',
        path: '/api/carbon/credit-rating/chain/:id/start-desk-review',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Opens the rating desk review; the five sub-scores can then be entered.',
        fields: [
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'compute-composite', label: 'Compute composite',
        path: '/api/carbon/credit-rating/chain/:id/compute-composite',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Computes the weighted composite rating from the five sub-scores.',
        fields: [
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'publish-rating', label: 'Publish rating', tone: 'primary',
        path: '/api/carbon/credit-rating/chain/:id/publish-rating',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Publishes the rating and moves the case into ongoing monitoring.',
        fields: [
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'escalate-to-integrity', label: 'Escalate to integrity', tone: 'oxide',
        path: '/api/carbon/credit-rating/chain/:id/escalate-to-integrity',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Escalates an integrity concern to the registry/regulator; hard-terminates the rating.',
        fields: [
          { key: 'integrity_reason', label: 'Integrity reason', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator ref', type: 'evidence' },
        ],
      },
    ],
    kpis: [
      { key: 'total', label: 'Ratings', compute: 'count' },
      { key: 'scope', label: 'Scope', compute: 'sum_quantum' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W103 — ESG disclosure & third-party assurance (JSE-SRL / IFRS S1-S2 / DFFE)
  {
    key: 'esg_disclosure', wave: 103, table: 'oe_esg_disclosure',
    title: 'ESG disclosure', refCol: 'disclosure_number', titleCol: 'reporting_entity_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['archived', 'cancelled'],
    counterpartyCol: 'reporting_entity_name',
    lanes: { carbon_fund: 'article6_compliance' },
    eventsTable: 'oe_esg_disclosure_events', eventsFk: 'disclosure_id',
    actions: [
      { action: 'engage-assurance', label: 'Engage assurance',
        path: '/api/carbon/esg-disclosure/chain/:id/engage-assurance',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Engages an external assurance provider against the compiled disclosure.',
        fields: [
          { key: 'assurance_level', label: 'Assurance level', type: 'enum', options: ['limited', 'reasonable'] },
          { key: 'assurance_provider', label: 'Provider', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'complete-assurance', label: 'Complete assurance',
        path: '/api/carbon/esg-disclosure/chain/:id/complete-assurance',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Records the assurance opinion and clears the disclosure for publication.',
        fields: [
          { key: 'assurance_opinion', label: 'Opinion', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'file-regulator', label: 'File with regulator', tone: 'primary',
        path: '/api/carbon/esg-disclosure/chain/:id/file-regulator',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Files the published disclosure with JSE SENS / CIPC / DFFE / SARS.',
        fields: [
          { key: 'jse_sens_ref', label: 'JSE SENS ref', type: 'evidence' },
          { key: 'cipc_ref', label: 'CIPC ref', type: 'evidence' },
          { key: 'dffe_ref', label: 'DFFE ref', type: 'evidence' },
        ],
      },
      { action: 'restate-disclosure', label: 'Restate', tone: 'oxide',
        path: '/api/carbon/esg-disclosure/chain/:id/restate-disclosure',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Restates a published disclosure — crosses to the regulator on every tier.',
        fields: [
          { key: 'restated_reason', label: 'Restatement reason', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    kpis: [
      { key: 'total', label: 'Disclosures', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W225 — Scope 3 value-chain emission calc & third-party assurance (TCFD / IFRS S2 / GHG Protocol / CDP)
  // NOTE: status col is chain_status but the SLA deadline col on this table is `sla_deadline`
  // (no _at suffix); events live in the shared audit_events table, not a per-chain oe_*_events.
  {
    key: 'carbon_scope3_disclosure', wave: 225, table: 'oe_carbon_scope3_disclosures',
    title: 'Scope 3 disclosure', refCol: 'id', titleCol: 'entity_name',
    quantumCol: 'scope3_total_tco2e', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline',
    terminal: ['disclosure_filed', 'assurance_qualified', 'withdrawn'],
    counterpartyCol: 'entity_name',
    lanes: { carbon_fund: 'article6_compliance' },
    eventsTable: null, eventsFk: null,
    initiation: {
      label: 'Open Scope 3 disclosure',
      path: '/api/carbon/scope3-disclosure/chain',
      fields: [
        { key: 'entity_name', label: 'Reporting entity', type: 'string' },
        { key: 's3_tier', label: 'Tier', type: 'enum', options: ['standard', 'enhanced', 'comprehensive'] },
        { key: 'reporting_year', label: 'Reporting year', type: 'number' },
        { key: 'reporting_framework', label: 'Framework', type: 'string', placeholder: 'e.g. IFRS S2 / CDP' },
        { key: 'category_count', label: 'Category count', type: 'number' },
      ],
    },
    actions: [
      { action: 'close-data-collection', label: 'Close data collection',
        path: '/api/carbon/scope3-disclosure/chain/:id/action',
        roles: ['admin', 'carbon_fund', 'support'],
        cascadeHint: 'Closes value-chain data collection and records primary-data coverage.',
        fields: [
          { key: 'action', label: 'Action', type: 'string', required: true, placeholder: 'close_data_collection' },
          { key: 'primary_data_coverage_pct', label: 'Primary-data coverage', type: 'number', unit: '%' },
        ],
      },
      { action: 'complete-internal-review', label: 'Complete review',
        path: '/api/carbon/scope3-disclosure/chain/:id/action',
        roles: ['admin', 'carbon_fund', 'support'],
        cascadeHint: 'Closes internal review and records the total Scope 3 footprint.',
        fields: [
          { key: 'action', label: 'Action', type: 'string', required: true, placeholder: 'complete_internal_review' },
          { key: 'scope3_total_tco2e', label: 'Scope 3 total', type: 'number', unit: 'tCO2e' },
        ],
      },
      { action: 'issue-reasonable-assurance', label: 'Issue assurance', tone: 'primary',
        path: '/api/carbon/scope3-disclosure/chain/:id/action',
        roles: ['admin', 'carbon_fund', 'support'],
        cascadeHint: 'Records reasonable third-party assurance over the Scope 3 inventory.',
        fields: [
          { key: 'action', label: 'Action', type: 'string', required: true, placeholder: 'issue_reasonable_assurance' },
          { key: 'assurance_provider', label: 'Provider', type: 'string' },
          { key: 'assurance_standard', label: 'Standard', type: 'string', placeholder: 'e.g. ISAE 3410' },
        ],
      },
      { action: 'file-disclosure', label: 'File disclosure', tone: 'primary',
        path: '/api/carbon/scope3-disclosure/chain/:id/action',
        roles: ['admin', 'carbon_fund', 'support'],
        cascadeHint: 'Files the assured Scope 3 disclosure with the platform/registry; closes the case.',
        fields: [
          { key: 'action', label: 'Action', type: 'string', required: true, placeholder: 'file_disclosure' },
          { key: 'filing_platform', label: 'Platform', type: 'string' },
          { key: 'filing_ref', label: 'Filing ref', type: 'evidence' },
        ],
      },
    ],
    kpis: [
      { key: 'total', label: 'Disclosures', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W17 — Carbon credit retirement (per-scope SLA; article6 / compliance / voluntary)
  // NOTE: table is `carbon_retirements` (pre-oe_ convention) — still exposes chain_status +
  // sla_deadline_at + an events table, so it satisfies the registry shape contract.
  {
    key: 'carbon_retirement', wave: 17, table: 'carbon_retirements',
    title: 'Credit retirement', refCol: 'certificate_number', titleCol: 'beneficiary_name',
    quantumCol: 'quantity', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['retired', 'rejected', 'cancelled'],
    counterpartyCol: 'beneficiary_name',
    lanes: { carbon_fund: 'retirement_offset' },
    eventsTable: 'oe_retirement_chain_events', eventsFk: 'retirement_id',
    actions: [
      { action: 'begin-validation', label: 'Begin validation',
        path: '/api/carbon/retirement-chain/:id/begin-validation',
        roles: ['admin', 'carbon', 'carbon_fund'],
        cascadeHint: 'Opens validation of the retirement request; the per-scope SLA starts.',
        fields: [
          { key: 'notes', label: 'Validation notes', type: 'string' },
        ],
      },
      { action: 'finalize', label: 'Finalize retirement', tone: 'primary',
        path: '/api/carbon/retirement-chain/:id/finalize',
        roles: ['admin', 'carbon', 'carbon_fund'],
        cascadeHint: 'Retires the credits and mints the retirement certificate hash; closes the case.',
        fields: [
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'reject', label: 'Reject', tone: 'oxide',
        path: '/api/carbon/retirement-chain/:id/reject',
        roles: ['admin', 'carbon', 'carbon_fund'],
        cascadeHint: 'Rejects the retirement at validation; Article 6 / compliance rejections cross to the regulator.',
        fields: [
          { key: 'reason', label: 'Rejection reason', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    kpis: [
      { key: 'total', label: 'Retirements', compute: 'count' },
      { key: 'quantity', label: 'Volume', compute: 'sum_quantum' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W37 — Carbon project registration / PDD (Gold Standard + Verra + Art 6.4 + DFFE DNA)
  {
    key: 'carbon_registration', wave: 37, table: 'oe_carbon_registration',
    title: 'Project registration', refCol: 'project_number', titleCol: 'project_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['crediting_active', 'rejected', 'withdrawn'],
    counterpartyCol: 'developer_party_name',
    lanes: { carbon_fund: 'project_pipeline' },
    eventsTable: 'oe_carbon_registration_events', eventsFk: 'project_id',
    actions: [
      { action: 'submit-validation', label: 'Submit for validation',
        path: '/api/carbon-registration/chain/:id/submit-validation',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Submits the PDD to the VVB for validation; the standard-tiered validation SLA starts.',
        fields: [
          { key: 'validation_ref', label: 'Validation engagement ref', type: 'evidence' },
          { key: 'vvb_name', label: 'VVB name', type: 'string', placeholder: 'e.g. SGS / DNV' },
          { key: 'validation_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'register', label: 'Register project', tone: 'primary',
        path: '/api/carbon-registration/chain/:id/register',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Registers the validated project with the standard registry; unlocks crediting activation and downstream MRV.',
        fields: [
          { key: 'registered_serial_block', label: 'Registered serial block', type: 'string', placeholder: 'e.g. ZA-0001-0010000' },
          { key: 'registration_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'reject', label: 'Reject', tone: 'oxide',
        path: '/api/carbon-registration/chain/:id/reject',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Rejects the project at validation or registration review; closes the pipeline case adversely.',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', placeholder: 'e.g. additionality_failed' },
          { key: 'rejection_ref', label: 'Rejection notice ref', type: 'evidence' },
          { key: 'rejection_basis', label: 'Basis / evidence', type: 'evidence' },
          { key: 'rod_notes', label: 'Record-of-decision notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'in_validation', label: 'In validation', statuses: ['pdd_drafted', 'validation_underway', 'corrections_required'] },
      { key: 'in_registration', label: 'In registration', statuses: ['public_consultation', 'dna_authorization', 'registration_requested', 'registered'] },
      { key: 'awaiting', label: 'Awaiting submission', statuses: ['pin_submitted'] },
      { key: 'resolved', label: 'Resolved', statuses: ['crediting_active', 'rejected', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Projects', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W42 — Carbon reversal / buffer-pool integrity (Verra + GS + Art 6.4; AFOLU only)
  {
    key: 'carbon_reversal', wave: 42, table: 'oe_carbon_reversals',
    title: 'Carbon reversal', refCol: 'reversal_number', titleCol: 'project_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'escalated', 'false_alarm'],
    counterpartyCol: 'project_party_name',
    lanes: { carbon_fund: 'retirement_offset' },
    eventsTable: 'oe_carbon_reversals_events', eventsFk: 'reversal_id',
    actions: [
      { action: 'begin-assessment', label: 'Begin assessment',
        path: '/api/carbon-reversal/chain/:id/begin-assessment',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Opens loss assessment of the reported reversal event; quantification clock starts.',
        fields: [
          { key: 'assessment_basis', label: 'Assessment basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'cancel-buffer', label: 'Cancel buffer credits', tone: 'primary',
        path: '/api/carbon-reversal/chain/:id/cancel-buffer',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Cancels buffer-pool credits to cover the quantified reversal; preserves the integrity of issued units.',
        fields: [
          { key: 'buffer_cancelled_tco2e', label: 'Buffer credits cancelled', type: 'number', unit: 'tCO2e' },
          { key: 'buffer_pool_ref', label: 'Buffer pool ref', type: 'evidence' },
          { key: 'buffer_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'escalate', label: 'Escalate', tone: 'oxide',
        path: '/api/carbon-reversal/chain/:id/escalate',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Escalates an uncured or avoidable reversal to the registry/regulator; terminates the case escalated.',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', placeholder: 'e.g. avoidable_reversal' },
          { key: 'regulator_ref', label: 'Regulator ref', type: 'evidence' },
          { key: 'closure_notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'assessing', label: 'Assessing', statuses: ['reversal_reported', 'under_assessment', 'loss_quantified'] },
      { key: 'buffer_action', label: 'Buffer action', statuses: ['buffer_cancellation_proposed', 'buffer_cancelled'] },
      { key: 'replacement', label: 'Replacement', statuses: ['remediation_verified', 'replacement_required', 'replacement_submitted', 'replacement_verified'] },
      { key: 'resolved', label: 'Resolved', statuses: ['closed', 'escalated', 'false_alarm'] },
    ],
    kpis: [
      { key: 'total', label: 'Reversals', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W48 — Carbon tax offset claim & allowance (Carbon Tax Act §13; SARS-facing)
  {
    key: 'carbon_offset_claim', wave: 48, table: 'oe_carbon_offset_claims',
    title: 'Carbon offset claim', refCol: 'claim_number', titleCol: 'taxpayer_party_name',
    quantumCol: 'offset_value_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['reconciled', 'rejected', 'clawed_back', 'withdrawn'],
    counterpartyCol: 'sars_office_name',
    lanes: { carbon_fund: 'retirement_offset' },
    eventsTable: 'oe_carbon_offset_claims_events', eventsFk: 'claim_id',
    actions: [
      { action: 'submit-claim', label: 'Submit claim', tone: 'primary',
        path: '/api/carbon-offset-claim/chain/:id/submit-claim',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Files the offset claim of retired credits against the carbon-tax liability; SARS review clock starts.',
        fields: [
          { key: 'sars_reference', label: 'SARS reference', type: 'evidence' },
          { key: 'gross_tax_liability_zar', label: 'Gross tax liability', type: 'number', unit: 'ZAR' },
          { key: 'offset_limit_pct', label: 'Offset limit', type: 'number', unit: '%' },
          { key: 'offset_limit_zar', label: 'Offset limit value', type: 'number', unit: 'ZAR' },
          { key: 'ct_rate_zar_per_tco2e', label: 'Carbon-tax rate', type: 'number', unit: 'ZAR/tCO2e' },
          { key: 'offset_value_zar', label: 'Offset value claimed', type: 'number', unit: 'ZAR' },
          { key: 'net_tax_liability_zar', label: 'Net tax liability', type: 'number', unit: 'ZAR' },
          { key: 'credits_unused_tco2e', label: 'Credits unused', type: 'number', unit: 'tCO2e' },
          { key: 'submission_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'grant-allowance', label: 'Grant allowance',
        path: '/api/carbon-offset-claim/chain/:id/grant-allowance',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Records the granted offset allowance within the 10%/5% cap; advances to the tax-return application.',
        fields: [
          { key: 'allowance_ref', label: 'Allowance ref', type: 'evidence' },
          { key: 'offset_value_zar', label: 'Allowed offset value', type: 'number', unit: 'ZAR' },
          { key: 'net_tax_liability_zar', label: 'Net tax liability', type: 'number', unit: 'ZAR' },
          { key: 'allowance_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'claw-back', label: 'Claw back', tone: 'oxide',
        path: '/api/carbon-offset-claim/chain/:id/claw-back',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Reverses a granted allowance on audit; crosses the regulator inbox for every tier (W48 signature).',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', placeholder: 'e.g. credits_double_counted' },
          { key: 'clawback_ref', label: 'Clawback ref', type: 'evidence' },
          { key: 'reversal_ref', label: 'Credit reversal ref', type: 'evidence' },
          { key: 'clawback_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'pre_submission', label: 'Pre-submission', statuses: ['claim_drafted', 'eligibility_screening', 'credits_earmarked'] },
      { key: 'sars_review', label: 'SARS review', statuses: ['claim_submitted', 'sars_review', 'sars_query'] },
      { key: 'granted', label: 'Granted', statuses: ['allowance_granted', 'applied_to_return'] },
      { key: 'resolved', label: 'Resolved', statuses: ['reconciled', 'rejected', 'clawed_back', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Claims', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'offset_value', label: 'Offset value', compute: 'sum_quantum' },
    ],
  },

  // W56 — Crediting-period renewal & baseline reassessment (Verra/GS/Art 6.4)
  {
    key: 'crediting_period_renewal', wave: 56, table: 'oe_crediting_period_renewals',
    title: 'Crediting renewal', refCol: 'renewal_number', titleCol: 'project_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['renewed', 'refused', 'withdrawn', 'lapsed'],
    counterpartyCol: 'vvb_name',
    lanes: { carbon_fund: 'project_pipeline' },
    eventsTable: 'oe_crediting_period_renewals_events', eventsFk: 'renewal_id',
    actions: [
      { action: 'submit-application', label: 'Submit application',
        path: '/api/crediting-renewal/chain/:id/submit-application',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Files the renewal application ahead of crediting-period expiry; completeness-check clock starts.',
        fields: [
          { key: 'application_ref', label: 'Application ref', type: 'evidence' },
          { key: 'methodology_id', label: 'Methodology', type: 'string', placeholder: 'e.g. VM0042' },
          { key: 'vvb_name', label: 'VVB name', type: 'string' },
          { key: 'crediting_period_number', label: 'Crediting period #', type: 'number' },
          { key: 'annual_issuance_tco2e', label: 'Annual issuance', type: 'number', unit: 'tCO2e' },
          { key: 'submission_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'renew', label: 'Renew crediting period', tone: 'primary',
        path: '/api/crediting-renewal/chain/:id/renew',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Renews the crediting period on the reassessed baseline; crosses the regulator inbox when the baseline cut is 30% or more.',
        fields: [
          { key: 'decision_ref', label: 'Decision ref', type: 'evidence' },
          { key: 'renewed_period_start', label: 'Renewed period start', type: 'date' },
          { key: 'renewed_period_end', label: 'Renewed period end', type: 'date' },
          { key: 'revised_baseline_tco2e', label: 'Revised baseline', type: 'number', unit: 'tCO2e' },
          { key: 'renewal_summary', label: 'Renewal summary', type: 'string' },
          { key: 'decision_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'refuse', label: 'Refuse renewal', tone: 'oxide',
        path: '/api/crediting-renewal/chain/:id/refuse',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Refuses renewal on failed re-validation; the project stops issuing at period end.',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', placeholder: 'e.g. revalidation_failed' },
          { key: 'refusal_ref', label: 'Refusal ref', type: 'evidence' },
          { key: 'decision_ref', label: 'Decision ref', type: 'evidence' },
          { key: 'refusal_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'in_review', label: 'In review', statuses: ['renewal_due', 'application_submitted', 'completeness_check', 'revision_requested'] },
      { key: 'reassessment', label: 'Reassessment', statuses: ['baseline_reassessment', 'additionality_retest', 'vvb_validation', 'standard_review'] },
      { key: 'resolved', label: 'Resolved', statuses: ['renewed', 'refused', 'withdrawn', 'lapsed'] },
    ],
    kpis: [
      { key: 'total', label: 'Renewals', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W65 — Carbon ERPA forward delivery & make-good
  {
    key: 'carbon_erpa', wave: 65, table: 'oe_carbon_erpas',
    title: 'Carbon ERPA', refCol: 'erpa_number', titleCol: 'project_name',
    quantumCol: 'contract_value', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['completed', 'terminated', 'withdrawn'],
    counterpartyCol: 'buyer_party_name',
    lanes: { carbon_fund: 'trading_markets' },
    eventsTable: 'oe_carbon_erpas_events', eventsFk: 'erpa_id',
    actions: [
      { action: 'verify-delivery', label: 'Verify delivery', tone: 'primary',
        path: '/api/carbon-erpa/chain/:id/verify-delivery',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Verifies the delivered vintage against the contracted schedule; crosses the regulator inbox for Article 6 or large contracts.',
        fields: [
          { key: 'verification_ref', label: 'Verification ref', type: 'evidence' },
          { key: 'delivered_volume_tco2e', label: 'Delivered volume', type: 'number', unit: 'tCO2e' },
          { key: 'corresponding_adjustment_ref', label: 'Corresponding-adjustment ref', type: 'evidence' },
          { key: 'verification_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'flag-shortfall', label: 'Flag shortfall', tone: 'oxide',
        path: '/api/carbon-erpa/chain/:id/flag-shortfall',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Flags an under-delivery against the schedule; opens the make-good obligation on the seller.',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', placeholder: 'e.g. under_generation' },
          { key: 'delivered_volume_tco2e', label: 'Delivered volume', type: 'number', unit: 'tCO2e' },
          { key: 'shortfall_volume_tco2e', label: 'Shortfall volume', type: 'number', unit: 'tCO2e' },
          { key: 'shortfall_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'settle', label: 'Settle delivery',
        path: '/api/carbon-erpa/chain/:id/settle',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Settles payment for the verified delivery; advances the ERPA toward completion or the next scheduled vintage.',
        fields: [
          { key: 'settlement_ref', label: 'Settlement ref', type: 'evidence' },
          { key: 'erpa_summary', label: 'ERPA summary', type: 'string' },
          { key: 'settlement_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'pre_delivery', label: 'Pre-delivery', statuses: ['erpa_drafted', 'erpa_executed', 'delivery_scheduled', 'delivery_initiated'] },
      { key: 'delivery', label: 'Delivery', statuses: ['delivery_verified', 'shortfall_flagged', 'make_good_pending', 'settled'] },
      { key: 'disputed', label: 'Disputed', statuses: ['disputed'] },
      { key: 'resolved', label: 'Resolved', statuses: ['completed', 'terminated', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'ERPAs', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'contract_value', label: 'Contract value', compute: 'sum_quantum' },
    ],
  },

  // W73 — PoA / CPA inclusion & conformance (CDM PoA / GS4GG / Verra grouped)
  {
    key: 'poa_cpa_inclusion', wave: 73, table: 'oe_poa_cpa_inclusions',
    title: 'CPA inclusion', refCol: 'cpa_number', titleCol: 'cpa_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['rejected', 'excluded', 'withdrawn', 'completed'],
    counterpartyCol: 'coordinating_entity_name',
    lanes: { carbon_fund: 'project_pipeline' },
    eventsTable: 'oe_poa_cpa_inclusions_events', eventsFk: 'inclusion_id',
    actions: [
      { action: 'screen-eligibility', label: 'Screen eligibility',
        path: '/api/poa-inclusion/chain/:id/screen-eligibility',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Runs the automated eligibility score, programme-cap headroom and geographic-overlap double-counting guard.',
        fields: [
          { key: 'geo_key', label: 'Geographic key', type: 'string', placeholder: 'e.g. ZA-EC-0123' },
          { key: 'methodology_applicability', label: 'Methodology applicability (0–1)', type: 'number' },
          { key: 'additionality_strength', label: 'Additionality strength (0–1)', type: 'number' },
          { key: 'monitoring_readiness', label: 'Monitoring readiness (0–1)', type: 'number' },
          { key: 'loa_confidence', label: 'LoA confidence (0–1)', type: 'number' },
          { key: 'screening_ref', label: 'Screening ref', type: 'evidence' },
          { key: 'screening_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'approve-inclusion', label: 'Approve inclusion', tone: 'primary',
        path: '/api/poa-inclusion/chain/:id/approve-inclusion',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Includes the CPA in the registered programme; crosses the regulator inbox when a corresponding adjustment is required (else large+mega).',
        fields: [
          { key: 'inclusion_ref', label: 'Inclusion ref', type: 'evidence' },
          { key: 'included_er_tco2e', label: 'Included programme ER', type: 'number', unit: 'tCO2e' },
          { key: 'regulator_ref', label: 'Regulator ref', type: 'evidence' },
          { key: 'inclusion_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
      { action: 'exclude-cpa', label: 'Exclude CPA', tone: 'oxide',
        path: '/api/poa-inclusion/chain/:id/exclude-cpa',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Delists the CPA for non-conformance; crosses the regulator inbox for every tier (W73 signature).',
        fields: [
          { key: 'reason_code', label: 'Reason', type: 'string', placeholder: 'e.g. non_conformance' },
          { key: 'exclusion_ref', label: 'Exclusion ref', type: 'evidence' },
          { key: 'regulator_ref', label: 'Regulator ref', type: 'evidence' },
          { key: 'exclusion_basis', label: 'Basis / evidence', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'screening', label: 'Screening', statuses: ['cpa_proposed', 'eligibility_screening', 'methodology_check', 'loa_pending', 'inclusion_review'] },
      { key: 'monitoring', label: 'Monitoring', statuses: ['included', 'monitoring', 'verified'] },
      { key: 'resolved', label: 'Resolved', statuses: ['rejected', 'excluded', 'withdrawn', 'completed'] },
    ],
    kpis: [
      { key: 'total', label: 'CPAs', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // ───────── GRID OPERATOR ─────────
  // Two-party grid waves W18 (planned outage), W28 (GCA), W67 (grid code
  // compliance) and W75 (connection energization) are registered above in the
  // IPP DEVELOPER section with grid_operator lanes — not repeated here.
  // Skipped: W8 wheeling charges (oe_grid_wheeling_charges has a plain `status`
  // column + `dispute_deadline_at` — no chain_status/sla_deadline_at pair).

  // W13 — Dispatch nomination (NERSA System Operations Code; BRP nominates,
  // SO accepts/activates/settles; dispute branch; minute-grade per-stage SLAs).
  // Non-standard columns: `nomination_status` + `next_sla_due_at` (mig 116) —
  // absorbed by the per-entry statusCol/deadlineCol fields. No human ref
  // column; trading_day identifies the case.
  {
    key: 'dispatch_nomination', wave: 13, table: 'oe_dispatch_nominations',
    title: 'Dispatch nomination', refCol: 'id', titleCol: 'trading_day',
    quantumCol: 'charge_zar', statusCol: 'nomination_status',
    deadlineCol: 'next_sla_due_at',
    terminal: ['closed', 'nomination_rejected', 'closed_disputed'],
    counterpartyCol: 'participant_id',
    lanes: { grid_operator: 'operations_grid' },
    eventsTable: 'oe_dispatch_nomination_events', eventsFk: 'nomination_id',
    actions: [
      { action: 'accept', label: 'Accept nomination',
        path: '/api/grid/dispatch-nominations/:id/accept',
        roles: ['admin', 'support', 'grid', 'grid_operator'],
        cascadeHint: 'SO accepts the BRP nomination inside the 15-minute ACK window; the pre-gate-closure activation clock starts.' },
      { action: 'settle', label: 'Settle imbalance', tone: 'primary',
        path: '/api/grid/dispatch-nominations/:id/settle',
        roles: ['admin', 'support', 'grid', 'grid_operator'],
        cascadeHint: 'Settles the imbalance charge against recorded performance; the 15-day dispute window toward close opens.',
        fields: [
          { key: 'charge_zar', label: 'Imbalance charge', type: 'number', unit: 'ZAR', required: true },
          { key: 'notes', label: 'Settlement note', type: 'string' },
        ],
      },
      { action: 'raise-dispute', label: 'Raise dispute', tone: 'oxide',
        path: '/api/grid/dispatch-nominations/:id/raise-dispute',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'trader'],
        cascadeHint: 'Participant disputes the settlement; the 10-day dispute-resolution SLA arms.',
        fields: [
          { key: 'reason', label: 'Dispute reason', type: 'string', required: true,
            placeholder: 'Grounds for disputing the settlement' },
        ],
      },
    ],
    filters: [
      { key: 'awaiting_so', label: 'Awaiting SO', statuses: ['nominated', 'accepted'] },
      { key: 'in_delivery', label: 'In delivery', statuses: ['activated', 'performance_recorded'] },
      { key: 'settled', label: 'Settled', statuses: ['settled'] },
      { key: 'disputed', label: 'Disputed', statuses: ['disputed', 'dispute_resolved'] },
      { key: 'resolved', label: 'Resolved', statuses: ['closed', 'nomination_rejected', 'closed_disputed'] },
    ],
    kpis: [
      { key: 'total', label: 'Nominations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'charge', label: 'Imbalance charge', compute: 'sum_quantum' },
    ],
  },

  // W34 — Load curtailment CSC-1 (NERSA §CSC-1; URGENT — higher load-shed stage
  // = tighter SLA; TWO-PARTY split write — SO instructs, customer responds)
  {
    key: 'load_curtailment', wave: 34, table: 'oe_load_curtailment',
    title: 'Load curtailment', refCol: 'case_number', titleCol: 'facility_name',
    quantumCol: 'penalty_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'refused', 'withdrawn'],
    counterpartyCol: 'customer_party_name',
    lanes: { grid_operator: 'operations_grid', ipp_developer: 'safety_grid' },
    eventsTable: 'oe_load_curtailment_events', eventsFk: 'curtailment_id',
    actions: [
      { action: 'acknowledge', label: 'Acknowledge instruction', tone: 'primary',
        path: '/api/load-curtailment/chain/:id/acknowledge',
        roles: ['admin', 'support', 'ipp_developer', 'grid_operator', 'trader', 'carbon_fund', 'offtaker'],
        cascadeHint: 'Customer acknowledges the curtailment instruction; the stage-tiered response SLA starts running.',
        fields: [
          { key: 'acknowledgement_ref', label: 'Acknowledgement reference', type: 'evidence' },
        ],
      },
      { action: 'lift-instruction', label: 'Lift instruction',
        path: '/api/load-curtailment/chain/:id/lift-instruction',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO lifts the curtailment as system conditions recover; arms reconciliation of curtailed MWh.' },
      { action: 'refuse', label: 'Refuse instruction', tone: 'oxide',
        path: '/api/load-curtailment/chain/:id/refuse',
        roles: ['admin', 'support', 'ipp_developer', 'grid_operator', 'trader', 'carbon_fund', 'offtaker'],
        cascadeHint: 'Customer refuses the lawful curtailment instruction; closes the case adversely and exposes the customer to CSC-1 penalties.',
        fields: [
          { key: 'refusal_grounds', label: 'Grounds for refusal', type: 'evidence', required: true },
          { key: 'refusal_ref', label: 'Refusal reference', type: 'evidence' },
          { key: 'tribunal_case_ref', label: 'Tribunal case reference', type: 'string' },
          { key: 'penalty_zar', label: 'CSC-1 penalty', type: 'number', unit: 'ZAR' },
          { key: 'penalty_basis', label: 'Penalty basis', type: 'evidence' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'awaiting_ack', label: 'Awaiting acknowledgement', statuses: ['instruction_issued'] },
      { key: 'in_curtailment', label: 'In curtailment', statuses: ['acknowledged', 'curtailment_started'] },
      { key: 'achieved', label: 'Achieved / lifted', statuses: ['target_achieved', 'instruction_lifted', 'reconciled', 'post_mortem'] },
      { key: 'non_compliant', label: 'Non-compliant', statuses: ['partial_compliance', 'refused'] },
      { key: 'resolved', label: 'Resolved', statuses: ['closed', 'refused', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Curtailments', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'penalty', label: 'Penalty exposure', compute: 'sum_quantum' },
    ],
  },

  // W50 — Ancillary services reserve activation & settlement (Grid Code/SOC;
  // URGENT — faster reserve product = tighter SLA; TWO-PARTY SO ↔ provider)
  {
    key: 'reserve_activation', wave: 50, table: 'oe_reserve_activations',
    title: 'Reserve activation', refCol: 'activation_number', titleCol: 'service_name',
    quantumCol: 'utilisation_payment_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['settled', 'dispute_resolved', 'withdrawn'],
    counterpartyCol: 'provider_party_name',
    lanes: { grid_operator: 'operations_grid', ipp_developer: 'safety_grid' },
    eventsTable: 'oe_reserve_activations_events', eventsFk: 'activation_id',
    actions: [
      { action: 'acknowledge', label: 'Acknowledge activation',
        path: '/api/reserve-activation/chain/:id/acknowledge',
        roles: ['admin', 'support', 'ipp_developer', 'offtaker', 'lender', 'trader', 'carbon_fund'],
        cascadeHint: 'Provider acknowledges the dispatch instruction; the reserve-tier ramp clock starts.',
        fields: [
          { key: 'acknowledgement_ref', label: 'Acknowledgement reference', type: 'evidence' },
          { key: 'response_basis', label: 'Response basis', type: 'evidence' },
        ],
      },
      { action: 'settle', label: 'Settle activation', tone: 'primary',
        path: '/api/reserve-activation/chain/:id/settle',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO settles verified delivery — utilisation + availability payments to the provider; terminates the activation settled.',
        fields: [
          { key: 'utilisation_payment_zar', label: 'Utilisation payment', type: 'number', unit: 'ZAR' },
          { key: 'availability_payment_zar', label: 'Availability payment', type: 'number', unit: 'ZAR' },
          { key: 'settlement_ref', label: 'Settlement reference', type: 'evidence' },
          { key: 'settlement_basis', label: 'Settlement basis', type: 'evidence' },
        ],
      },
      { action: 'flag-non-performance', label: 'Flag non-performance', tone: 'oxide',
        path: '/api/reserve-activation/chain/:id/flag-non-performance',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO flags failed delivery against the activation; settlement proceeds on the penalty leg with non-performance charges and still closes the activation settled.',
        fields: [
          { key: 'non_performance_basis', label: 'Non-performance basis', type: 'evidence', required: true },
          { key: 'penalty_zar', label: 'Penalty', type: 'number', unit: 'ZAR' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'awaiting_ack', label: 'Awaiting acknowledgement', statuses: ['activation_issued'] },
      { key: 'delivering', label: 'Delivering', statuses: ['acknowledged', 'ramping', 'sustaining', 'released'] },
      { key: 'in_review', label: 'In review', statuses: ['performance_review', 'verified'] },
      { key: 'non_performance', label: 'Non-performance / dispute', statuses: ['non_performance', 'disputed'] },
      { key: 'resolved', label: 'Resolved', statuses: ['settled', 'dispute_resolved', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Activations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'utilisation', label: 'Utilisation payments', compute: 'sum_quantum' },
    ],
  },

  // W58 — Grid connection capacity allocation & queue (NTCSA 2024 Capacity
  // Rules; INVERTED SLA — bigger connection more study time; TWO-PARTY split
  // write — operator/committee drive the queue, applicant files + accepts).
  // quantumCol is R millions (estimated connection capex), not absolute ZAR.
  {
    key: 'rez_capacity', wave: 58, table: 'oe_grid_capacity_allocations',
    title: 'Capacity allocation', refCol: 'allocation_number', titleCol: 'project_name',
    quantumCol: 'estimated_capex_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['capacity_allocated', 'rejected', 'lapsed', 'relinquished', 'withdrawn'],
    counterpartyCol: 'applicant_party_name',
    lanes: { grid_operator: 'connections', ipp_developer: 'safety_grid' },
    eventsTable: 'oe_grid_capacity_allocations_events', eventsFk: 'allocation_id',
    actions: [
      { action: 'issue-offer', label: 'Issue capacity offer',
        path: '/api/grid-capacity/chain/:id/issue-offer',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Allocation committee issues the capacity offer off the queue position; the applicant acceptance window starts.',
        fields: [
          { key: 'granted_capacity_mw', label: 'Offered capacity', type: 'number', unit: 'MW' },
          { key: 'offer_ref', label: 'Offer reference', type: 'evidence' },
          { key: 'offer_basis', label: 'Offer basis', type: 'evidence' },
        ],
      },
      { action: 'accept-offer', label: 'Accept offer',
        path: '/api/grid-capacity/chain/:id/accept-offer',
        roles: ['admin', 'support', 'ipp_developer', 'offtaker', 'lender', 'trader', 'carbon_fund'],
        cascadeHint: 'Applicant accepts the offer; capacity is reserved pending project milestones.',
        fields: [
          { key: 'reservation_ref', label: 'Reservation reference', type: 'evidence' },
          { key: 'reservation_basis', label: 'Reservation basis', type: 'evidence' },
        ],
      },
      { action: 'allocate-capacity', label: 'Allocate capacity', tone: 'primary',
        path: '/api/grid-capacity/chain/:id/allocate-capacity',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Operator firms up the reserved capacity; feeds the W28 Grid Connection Agreement handoff (gca_ref).',
        fields: [
          { key: 'granted_capacity_mw', label: 'Allocated capacity', type: 'number', unit: 'MW' },
          { key: 'gca_ref', label: 'GCA reference (W28 handoff)', type: 'string' },
          { key: 'allocation_ref', label: 'Allocation reference', type: 'evidence' },
          { key: 'allocation_basis', label: 'Allocation basis', type: 'evidence' },
          { key: 'decision_notes', label: 'Decision notes', type: 'string' },
        ],
      },
      { action: 'reject-application', label: 'Reject application', tone: 'oxide',
        path: '/api/grid-capacity/chain/:id/reject-application',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Committee denies grid access at assessment or queueing; crosses the regulator inbox for every tier (W58 signature).',
        fields: [
          { key: 'rejection_basis', label: 'Rejection basis', type: 'evidence', required: true },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
          { key: 'decision_notes', label: 'Decision notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'intake', label: 'Intake', statuses: ['application_received', 'completeness_screening', 'information_requested'] },
      { key: 'assessment', label: 'Assessment / queue', statuses: ['capacity_assessment', 'queue_positioned'] },
      { key: 'offer', label: 'Offer / reserved', statuses: ['offer_issued', 'capacity_reserved'] },
      { key: 'allocated', label: 'Allocated', statuses: ['capacity_allocated'] },
      { key: 'resolved', label: 'Closed', statuses: ['rejected', 'lapsed', 'relinquished', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Applications', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'capex', label: 'Est. capex (Rm)', compute: 'sum_quantum' },
    ],
  },

  // ───────── GRID (parity batch) ─────────
  // Three Grid state-machine chains never migrated to the registry. Single-desk
  // SO write {admin, grid_operator} (+ support for black-start). Regulator is
  // read-only + cascade-driven, so no regulator lane.

  // W105 — Imbalance settlement (Grid wholesale MTU pricing; per-MTU actual-vs-
  // nominated imbalance × price × penalty, posted to BRPs; dispute window; URGENT)
  {
    key: 'imbalance_settlement', wave: 105, table: 'oe_imbalance_settlement',
    title: 'Imbalance settlement', refCol: 'settlement_number', titleCol: 'brp_label',
    quantumCol: 'total_owed_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['settled', 'archived', 'cancelled'],
    counterpartyCol: 'brp_id',
    lanes: { grid_operator: 'operations_grid' },
    eventsTable: 'oe_imbalance_settlement_events', eventsFk: 'settlement_id',
    actions: [
      { action: 'compute-imbalance', label: 'Compute imbalance', tone: 'primary',
        path: '/api/grid/imbalance-settlement/chain/:id/compute-imbalance',
        roles: ['admin', 'grid_operator'],
        cascadeHint: 'Computes the per-MTU imbalance MWh (metered − nominated); arms the pricing step.',
        fields: [
          { key: 'imbalance_mwh', label: 'Imbalance', type: 'number', unit: 'MWh' },
          { key: 'imbalance_quantum_zar', label: 'Imbalance quantum', type: 'number', unit: 'ZAR' },
          { key: 'notes', label: 'Note', type: 'string' },
        ],
      },
      { action: 'price-imbalance', label: 'Price imbalance',
        path: '/api/grid/imbalance-settlement/chain/:id/price-imbalance',
        roles: ['admin', 'grid_operator'],
        cascadeHint: 'Applies long/short imbalance price and penalty multiplier; recomputes charge, penalty and total owed.',
        fields: [
          { key: 'long_price_zar_per_mwh', label: 'Long price', type: 'number', unit: 'ZAR' },
          { key: 'short_price_zar_per_mwh', label: 'Short price', type: 'number', unit: 'ZAR' },
          { key: 'penalty_multiplier', label: 'Penalty multiplier', type: 'number' },
        ],
      },
      { action: 'raise-dispute', label: 'Raise dispute', tone: 'oxide',
        path: '/api/grid/imbalance-settlement/chain/:id/raise-dispute',
        roles: ['admin', 'grid_operator'],
        cascadeHint: 'Opens a settlement dispute; for HV BRPs crosses every tier into the regulator inbox (W105 signature).',
        fields: [
          { key: 'dispute_reason_code', label: 'Dispute reason code', type: 'string', required: true },
          { key: 'dispute_narrative', label: 'Dispute narrative', type: 'evidence' },
        ],
      },
      { action: 'mark-settled', label: 'Mark settled', tone: 'primary',
        path: '/api/grid/imbalance-settlement/chain/:id/mark-settled',
        roles: ['admin', 'grid_operator'],
        cascadeHint: 'Closes the settlement period; zeroes outstanding and (with non-zero penalty on material/systemic tiers) crosses into the regulator inbox.',
        fields: [
          { key: 'narrative', label: 'Settlement note', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'pricing', label: 'In pricing', statuses: ['meter_data_received', 'nominations_reconciled', 'imbalance_computed', 'priced'] },
      { key: 'invoicing', label: 'Invoicing', statuses: ['invoice_issued', 'invoice_acknowledged', 'invoice_revised', 'payment_pending'] },
      { key: 'dispute', label: 'Dispute', statuses: ['dispute_window_open', 'disputed', 'resolved_dispute'] },
      { key: 'arrears', label: 'Aged arrears', statuses: ['aged_arrears'] },
      { key: 'resolved', label: 'Resolved', statuses: ['settled', 'archived', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Settlements', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'owed', label: 'Total owed', compute: 'sum_quantum' },
    ],
    initiation: null,
  },

  // W84 — Black-start capability (SA Grid Code OC-1/OC-12 restoration; annual
  // witnessed drill; solicit → award → execute → drill → recertify; URGENT)
  {
    key: 'black_start', wave: 84, table: 'oe_black_start_capabilities',
    title: 'Black-start capability', refCol: 'capability_number', titleCol: 'facility_name',
    quantumCol: 'contract_value_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['recertified', 'contract_terminated'],
    counterpartyCol: 'bsc_provider_name',
    lanes: { grid_operator: 'operations_grid' },
    eventsTable: 'oe_black_start_capabilities_events', eventsFk: 'capability_id',
    actions: [
      { action: 'award-contract', label: 'Award contract', tone: 'primary',
        path: '/api/black-start/chain/:id/award-contract',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Awards the BSC contract to the selected provider; arms contract execution.',
        fields: [
          { key: 'bsc_provider_id', label: 'BSC provider ID', type: 'string' },
          { key: 'bsc_provider_name', label: 'BSC provider', type: 'string' },
          { key: 'contract_ref', label: 'Contract reference', type: 'evidence' },
          { key: 'contract_value_zar', label: 'Contract value', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'complete-drill', label: 'Complete drill',
        path: '/api/black-start/chain/:id/complete-drill',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Records the witnessed restoration drill outcome against the six hold-point flags; arms recertification.',
        fields: [
          { key: 'cranking_source_confirmed_flag', label: 'Cranking source confirmed (1=yes, 0=no)', type: 'number' },
          { key: 'dead_bus_energisation_flag', label: 'Dead-bus energisation (1=yes, 0=no)', type: 'number' },
          { key: 'frequency_hold_flag', label: 'Frequency hold (1=yes, 0=no)', type: 'number' },
          { key: 'voltage_hold_flag', label: 'Voltage hold (1=yes, 0=no)', type: 'number' },
          { key: 'auxiliary_load_pickup_flag', label: 'Auxiliary load pickup (1=yes, 0=no)', type: 'number' },
          { key: 'backfeed_within_sla_flag', label: 'Backfeed within SLA (1=yes, 0=no)', type: 'number' },
        ],
      },
      { action: 'recertify', label: 'Recertify capability', tone: 'primary',
        path: '/api/black-start/chain/:id/recertify',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Recertifies the BSC unit as restoration-ready; resets the drill clock and crosses into the regulator inbox for material/island-critical tiers.',
        fields: [
          { key: 'last_action_ref', label: 'Certification reference', type: 'evidence' },
        ],
      },
      { action: 'fail-drill', label: 'Fail drill', tone: 'oxide',
        path: '/api/black-start/chain/:id/fail-drill',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Records a failed restoration drill; crosses into the regulator inbox for EVERY tier (W84 reliability hard line).',
        fields: [
          { key: 'reason_code', label: 'Failure reason code', type: 'string', required: true },
          { key: 'chain_basis', label: 'Failure basis', type: 'evidence' },
        ],
      },
      { action: 'terminate-contract', label: 'Terminate contract', tone: 'oxide',
        path: '/api/black-start/chain/:id/terminate-contract',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Terminates the BSC contract; loss of restoration capability crosses into the regulator inbox for EVERY tier.',
        fields: [
          { key: 'reason_code', label: 'Termination reason code', type: 'string', required: true },
          { key: 'chain_basis', label: 'Termination basis', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'procurement', label: 'Procurement', statuses: ['needs_assessed', 'solicitation_issued', 'bid_evaluation', 'contract_awarded', 'contract_executed'] },
      { key: 'drill', label: 'Drill cycle', statuses: ['drill_scheduled', 'drill_in_progress', 'drill_completed'] },
      { key: 'failed', label: 'Failed / remediation', statuses: ['drill_failed', 'remediation_required'] },
      { key: 'resolved', label: 'Resolved', statuses: ['recertified', 'contract_terminated'] },
    ],
    kpis: [
      { key: 'total', label: 'Capabilities', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'contract', label: 'Contract value', compute: 'sum_quantum' },
    ],
    initiation: null,
  },

  // W110 — Transmission outage (NERSA Grid Code C-3 + NTCSA Outage Coordination;
  // SO-driven EHV/HV outage windows with N-1 security assessment; URGENT)
  {
    key: 'transmission_outage', wave: 110, table: 'oe_transmission_outage',
    title: 'Transmission outage', refCol: 'outage_number', titleCol: 'corridor_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['archived', 'rejected', 'withdrawn', 'emergency_cancelled'],
    counterpartyCol: 'asset_label',
    lanes: { grid_operator: 'operations_grid' },
    eventsTable: 'oe_transmission_outage_events', eventsFk: 'outage_id',
    actions: [
      { action: 'approve-outage', label: 'Approve outage', tone: 'primary',
        path: '/api/grid/transmission-outage/chain/:id/approve-outage',
        roles: ['admin', 'grid_operator'],
        cascadeHint: 'Reliability committee approves the outage window; for backbone 400kV+ corridors crosses into the regulator inbox.',
        fields: [
          { key: 'notes', label: 'Approval note', type: 'string' },
        ],
      },
      { action: 'commence-outage', label: 'Commence outage',
        path: '/api/grid/transmission-outage/chain/:id/commence-outage',
        roles: ['admin', 'grid_operator'],
        cascadeHint: 'SO opens the live outage; starts the in-progress supervision clock.',
        fields: [
          { key: 'actual_start_at', label: 'Actual start', type: 'date' },
        ],
      },
      { action: 'verify-return-to-service', label: 'Verify return to service', tone: 'primary',
        path: '/api/grid/transmission-outage/chain/:id/verify-return-to-service',
        roles: ['admin', 'grid_operator'],
        cascadeHint: 'Verifies the corridor is re-energised and the RTS test passed; arms post-outage review.',
        fields: [
          { key: 'rts_test_passed', label: 'RTS test passed', type: 'boolean' },
        ],
      },
      { action: 'emergency-cancel', label: 'Emergency cancel', tone: 'oxide',
        path: '/api/grid/transmission-outage/chain/:id/emergency-cancel',
        roles: ['admin', 'grid_operator'],
        cascadeHint: 'Forced cancellation of an approved outage; crosses into the regulator inbox for EVERY tier (W110 signature security event).',
        fields: [
          { key: 'emergency_cancel_reason', label: 'Emergency cancel reason', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'assessment', label: 'Assessment', statuses: ['outage_requested', 'security_assessment', 'n1_contingency_run', 'reliability_committee_review'] },
      { key: 'approved', label: 'Approved / scheduled', statuses: ['outage_approved', 'outage_window_open'] },
      { key: 'in_progress', label: 'In progress', statuses: ['outage_in_progress', 'extended', 'suspended'] },
      { key: 'restoring', label: 'Restoring', statuses: ['outage_completed', 'return_to_service', 'post_outage_review'] },
      { key: 'resolved', label: 'Resolved', statuses: ['archived', 'rejected', 'withdrawn', 'emergency_cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Outages', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'in_progress', label: 'Active', compute: 'count' },
    ],
    initiation: {
      label: 'Request transmission outage',
      path: '/api/grid/transmission-outage/chain',
      fields: [
        { key: 'asset_id', label: 'Asset', type: 'string', required: true },
        { key: 'asset_label', label: 'Asset label', type: 'string' },
        { key: 'transmission_voltage_kv', label: 'Voltage', type: 'number' },
        { key: 'corridor_name', label: 'Corridor', type: 'string' },
        { key: 'substation_a', label: 'Substation A', type: 'string' },
        { key: 'substation_b', label: 'Substation B', type: 'string' },
        { key: 'outage_reason', label: 'Outage reason', type: 'string' },
        { key: 'scheduled_start_at', label: 'Scheduled start', type: 'date' },
        { key: 'scheduled_end_at', label: 'Scheduled end', type: 'date' },
      ],
    },
  },

  // ───────── LENDER (parity batch) ─────────
  // Four Lender state-machine chains never migrated to the registry. Single
  // lender-desk write {admin, lender}; READ all nine personas; regulator is
  // cascade-driven (read-only) so no regulator lane.

  // W86 — DSCR monitoring (LMA covenant schedule + SARB IFRS 9 Stage 2/3;
  // quarterly coverage testing with 12-state cure lifecycle; URGENT SLA)
  {
    key: 'dscr_monitoring', wave: 86, table: 'oe_dscr_monitoring',
    title: 'DSCR monitoring', refCol: 'monitoring_number', titleCol: 'project_name',
    quantumCol: 'outstanding_debt_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['certified_clean', 'accelerated', 'waived'],
    counterpartyCol: 'borrower_name',
    lanes: { lender: 'monitoring', ipp_developer: 'finance' },
    eventsTable: 'oe_dscr_monitoring_events', eventsFk: 'monitoring_id',
    actions: [
      { action: 'compute-ratios', label: 'Compute ratios', tone: 'primary',
        path: '/api/dscr-monitoring/chain/:id/compute-ratios',
        roles: ['admin', 'lender'],
        cascadeHint: 'Computes DSCR/LLCR/PLCR for the test period; tier is re-derived from the measured DSCR.',
        fields: [
          { key: 'current_dscr', label: 'Current DSCR', type: 'number' },
          { key: 'forward_dscr_p12m', label: 'Forward DSCR (12m)', type: 'number' },
          { key: 'llcr_value', label: 'LLCR', type: 'number' },
          { key: 'plcr_value', label: 'PLCR', type: 'number' },
          { key: 'monitoring_summary', label: 'Summary', type: 'evidence' },
        ],
      },
      { action: 'record-breach', label: 'Record breach', tone: 'oxide',
        path: '/api/dscr-monitoring/chain/:id/record-breach',
        roles: ['admin', 'lender'],
        cascadeHint: 'Records a covenant breach; opens the cure runway and arms lock-up/cure transitions.',
        fields: [
          { key: 'reason_code', label: 'Breach reason code', type: 'enum',
            options: ['dscr_breach', 'llcr_breach', 'plcr_breach', 'reporting_failure'] },
          { key: 'chain_basis', label: 'Breach basis', type: 'evidence' },
        ],
      },
      { action: 'enter-lock-up', label: 'Enter lock-up', tone: 'oxide',
        path: '/api/dscr-monitoring/chain/:id/enter-lock-up',
        roles: ['admin', 'lender'],
        cascadeHint: 'Triggers distribution lock-up; crosses into regulator inbox for material + severe tiers.',
        fields: [
          { key: 'chain_basis', label: 'Lock-up basis', type: 'evidence' },
        ],
      },
      { action: 'declare-acceleration', label: 'Declare acceleration', tone: 'oxide',
        path: '/api/dscr-monitoring/chain/:id/declare-acceleration',
        roles: ['admin', 'lender'],
        cascadeHint: 'IFRS 9 Stage 3 trigger — feeds W45 default; crosses into the regulator inbox for EVERY tier (W86 signature).',
        fields: [
          { key: 'regulator_ref', label: 'Regulator reference', type: 'evidence' },
          { key: 'monitoring_summary', label: 'Acceleration note', type: 'evidence' },
        ],
      },
      { action: 'waive-breach', label: 'Waive breach',
        path: '/api/dscr-monitoring/chain/:id/waive-breach',
        roles: ['admin', 'lender'],
        cascadeHint: 'Grants forbearance; crosses into the regulator inbox for material + severe tiers.',
        fields: [
          { key: 'reason_code', label: 'Waiver reason code', type: 'string' },
          { key: 'chain_basis', label: 'Waiver basis', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'active_breach', label: 'Active breach', statuses: ['breach_recorded', 'lock_up'] },
      { key: 'cure', label: 'In cure', statuses: ['cure_proposed', 'cure_in_progress', 'cure_validated'] },
      { key: 'watch', label: 'On watch', statuses: ['watch'] },
      { key: 'testing', label: 'Testing', statuses: ['period_open', 'data_collected', 'computed'] },
      { key: 'resolved', label: 'Resolved', statuses: ['certified_clean', 'accelerated', 'waived'] },
    ],
    kpis: [
      { key: 'total', label: 'Tests', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Outstanding', compute: 'sum_quantum' },
    ],
    initiation: null,
  },

  // W77 — Reserve account (DSRA/MRA funding, drawdown, cure & release;
  // URGENT SLA; breach is always an event of default)
  {
    key: 'reserve_account', wave: 77, table: 'oe_reserve_account_chain',
    title: 'Reserve account (DSRA/MRA)', refCol: 'reserve_number', titleCol: 'borrower_name',
    quantumCol: 'target_amount_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['released', 'breached', 'cancelled'],
    counterpartyCol: 'borrower_name',
    lanes: { lender: 'monitoring', ipp_developer: 'finance' },
    eventsTable: 'oe_reserve_account_chain_events', eventsFk: 'reserve_account_id',
    actions: [
      { action: 'confirm-funding', label: 'Confirm funding', tone: 'primary',
        path: '/api/reserve-account/chain/:id/confirm-funding',
        roles: ['admin', 'lender'],
        cascadeHint: 'Confirms the reserve is funded to target; arms monitoring of the next test date.',
        fields: [
          { key: 'current_balance_zar', label: 'Current balance', type: 'number', unit: 'ZAR' },
          { key: 'next_test_date', label: 'Next test date', type: 'date' },
          { key: 'funding_basis', label: 'Funding basis', type: 'evidence' },
        ],
      },
      { action: 'flag-shortfall', label: 'Flag shortfall', tone: 'oxide',
        path: '/api/reserve-account/chain/:id/flag-shortfall',
        roles: ['admin', 'lender'],
        cascadeHint: 'Records a balance shortfall against target; arms the cure window.',
        fields: [
          { key: 'shortfall_amount_zar', label: 'Shortfall amount', type: 'number', unit: 'ZAR' },
          { key: 'current_balance_zar', label: 'Current balance', type: 'number', unit: 'ZAR' },
          { key: 'shortfall_reason_code', label: 'Shortfall reason code', type: 'string' },
          { key: 'shortfall_basis', label: 'Shortfall basis', type: 'evidence' },
        ],
      },
      { action: 'replenish-reserve', label: 'Replenish reserve', tone: 'primary',
        path: '/api/reserve-account/chain/:id/replenish-reserve',
        roles: ['admin', 'lender'],
        cascadeHint: 'Records a top-up back to target; returns the reserve to funded.',
        fields: [
          { key: 'current_balance_zar', label: 'Current balance', type: 'number', unit: 'ZAR' },
          { key: 'replenishment_basis', label: 'Replenishment basis', type: 'evidence' },
        ],
      },
      { action: 'declare-breach', label: 'Declare breach', tone: 'oxide',
        path: '/api/reserve-account/chain/:id/declare-breach',
        roles: ['admin', 'lender'],
        cascadeHint: 'A failure to cure or replenish — always an event of default; crosses into the regulator inbox for EVERY tier (W77 signature).',
        fields: [
          { key: 'reason_code', label: 'Breach reason code', type: 'string' },
          { key: 'breach_basis', label: 'Breach basis', type: 'evidence' },
        ],
      },
      { action: 'waive-requirement', label: 'Waive requirement',
        path: '/api/reserve-account/chain/:id/waive-requirement',
        roles: ['admin', 'lender'],
        cascadeHint: 'Waives the shortfall/draw cure; returns the reserve to funded. Crosses regulator for major + systemic tiers.',
        fields: [
          { key: 'reason_code', label: 'Waiver reason code', type: 'string' },
          { key: 'waiver_basis', label: 'Waiver basis', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'shortfall', label: 'Shortfall / cure', statuses: ['shortfall_flagged', 'cure_pending'] },
      { key: 'drawn', label: 'Drawn', statuses: ['drawdown_authorized', 'drawn'] },
      { key: 'funding', label: 'Funding', statuses: ['reserve_required', 'funding_scheduled', 'funding_in_progress'] },
      { key: 'funded', label: 'Funded', statuses: ['funded'] },
      { key: 'resolved', label: 'Resolved', statuses: ['released', 'breached', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Reserves', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'target', label: 'Total target', compute: 'sum_quantum' },
    ],
    initiation: null,
  },

  // W95 — SLL KPI compliance & margin ratchet (LMA SLL Principles + SA Green
  // Finance Taxonomy 2025; ESG-driven contractual margin step-up/step-down)
  {
    key: 'sll_kpi', wave: 95, table: 'oe_sll_kpi_compliance',
    title: 'SLL KPI compliance', refCol: 'compliance_number', titleCol: 'kpi_name',
    quantumCol: 'outstanding_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['margin_amended', 'cure_failed', 'cancelled', 'sustainability_event'],
    counterpartyCol: 'borrower_party_name',
    lanes: { lender: 'risk_lender', ipp_developer: 'finance' },
    eventsTable: 'oe_sll_kpi_events', eventsFk: 'compliance_id',
    actions: [
      { action: 'attest-kpi', label: 'Attest KPI', tone: 'primary',
        path: '/api/lender/sll-kpi/chain/:id/attest-kpi',
        roles: ['admin', 'lender'],
        cascadeHint: 'Records the independently-verified KPI attestation; crosses regulator on climate/safety/disclosure classes or severe variance.',
        fields: [
          { key: 'sbti_pathway', label: 'SBTi pathway', type: 'string' },
          { key: 'emissions_reduction_pct_per_year', label: 'Emissions reduction /yr', type: 'number' },
          { key: 'taxonomy_eligible_zar', label: 'Taxonomy-eligible', type: 'number', unit: 'ZAR' },
          { key: 'total_financing_zar', label: 'Total financing', type: 'number', unit: 'ZAR' },
          { key: 'attestation_basis', label: 'Attestation basis', type: 'evidence' },
        ],
      },
      { action: 'compute-ratchet', label: 'Compute ratchet', tone: 'primary',
        path: '/api/lender/sll-kpi/chain/:id/compute-ratchet',
        roles: ['admin', 'lender'],
        cascadeHint: 'Computes the margin step-up/step-down bps from the effective variance and tier; updates the cumulative ratchet.',
        fields: [
          { key: 'ratchet_bps_this_period', label: 'Ratchet (bps, override)', type: 'number' },
          { key: 'ratchet_ref', label: 'Ratchet reference', type: 'evidence' },
        ],
      },
      { action: 'amend-margin', label: 'Amend margin',
        path: '/api/lender/sll-kpi/chain/:id/amend-margin',
        roles: ['admin', 'lender'],
        cascadeHint: 'Applies the ratchet to the facility margin (terminal); crosses regulator on severe tier (material price change).',
        fields: [
          { key: 'amendment_ref', label: 'Amendment reference', type: 'evidence' },
        ],
      },
      { action: 'record-breach', label: 'Record KPI breach', tone: 'oxide',
        path: '/api/lender/sll-kpi/chain/:id/record-breach',
        roles: ['admin', 'lender'],
        cascadeHint: 'Records an ESG KPI miss; crosses into the regulator inbox for EVERY tier (W95 signature).',
        fields: [
          { key: 'reason_code', label: 'Breach reason code', type: 'string' },
          { key: 'breach_basis', label: 'Breach basis', type: 'evidence' },
        ],
      },
      { action: 'fail-cure', label: 'Fail cure', tone: 'oxide',
        path: '/api/lender/sll-kpi/chain/:id/fail-cure',
        roles: ['admin', 'lender'],
        cascadeHint: 'Cure window missed — stacks the penalty bps and crosses into the regulator inbox for EVERY tier (mandatory disclosure).',
        fields: [
          { key: 'reason_code', label: 'Failure reason code', type: 'string' },
          { key: 'fail_basis', label: 'Failure basis', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'breach', label: 'Breach / cure', statuses: ['breach_recorded', 'cure_period'] },
      { key: 'verification', label: 'Verification', statuses: ['measurement_collected', 'independent_verification', 'kpi_attested'] },
      { key: 'ratchet', label: 'Ratchet', statuses: ['ratchet_computed'] },
      { key: 'open', label: 'Period open', statuses: ['kpi_period_open', 'baseline_set'] },
      { key: 'resolved', label: 'Resolved', statuses: ['margin_amended', 'cure_failed', 'cancelled', 'sustainability_event'] },
    ],
    kpis: [
      { key: 'total', label: 'KPIs', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'exposure', label: 'Outstanding', compute: 'sum_quantum' },
    ],
    initiation: null,
  },

  // W108 — Loan restructure & A&E / forbearance (LMA "Amend & Extend" +
  // Basel III IFRS 9 + SARB Banks Act §61; INVERTED SLA — systemic = longest)
  {
    key: 'loan_restructure', wave: 108, table: 'oe_loan_restructure',
    title: 'Loan restructure', refCol: 'restructure_number', titleCol: 'project_name',
    quantumCol: 'facility_amount_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['completed', 'rejected_by_committee', 'abandoned', 'escalated_to_default'],
    counterpartyCol: 'borrower_name',
    lanes: { lender: 'enforcement', ipp_developer: 'finance' },
    eventsTable: 'oe_loan_restructure_events', eventsFk: 'restructure_id',
    actions: [
      { action: 'draft-proposal', label: 'Draft proposal', tone: 'primary',
        path: '/api/lender/loan-restructure/chain/:id/draft-proposal',
        roles: ['admin', 'lender'],
        cascadeHint: 'Drafts the restructure terms (relief, reschedule, extension); recomputes proposed relief and consent threshold.',
        fields: [
          { key: 'forbearance_period_months', label: 'Forbearance period (months)', type: 'number' },
          { key: 'principal_reschedule_zar', label: 'Principal rescheduled', type: 'number', unit: 'ZAR' },
          { key: 'maturity_extension_months', label: 'Maturity extension (months)', type: 'number' },
          { key: 'equity_cure_quantum_zar', label: 'Equity cure quantum', type: 'number', unit: 'ZAR' },
          { key: 'consent_severity', label: 'Consent severity', type: 'enum',
            options: ['simple_majority', 'special_majority', 'unanimous'] },
        ],
      },
      { action: 'submit-to-credit-committee', label: 'Submit to committee', tone: 'primary',
        path: '/api/lender/loan-restructure/chain/:id/submit-to-credit-committee',
        roles: ['admin', 'lender'],
        cascadeHint: 'Sends the proposal to credit committee; crosses regulator on systemic or IFRS 9 Stage 3 (Companies Act s.155).',
        fields: [
          { key: 'narrative', label: 'Committee note', type: 'evidence' },
        ],
      },
      { action: 'mark-effective', label: 'Mark effective',
        path: '/api/lender/loan-restructure/chain/:id/mark-effective',
        roles: ['admin', 'lender'],
        cascadeHint: 'Amendment becomes effective; crosses regulator on material + systemic (SARB Banks Act §61 disclosure).',
        fields: [
          { key: 'regulator_ref', label: 'Regulator reference', type: 'evidence' },
        ],
      },
      { action: 'escalate-to-default', label: 'Escalate to default', tone: 'oxide',
        path: '/api/lender/loan-restructure/chain/:id/escalate-to-default',
        roles: ['admin', 'lender'],
        cascadeHint: 'Failed restructure feeds W45 default enforcement; crosses into the regulator inbox for EVERY tier (W108 signature).',
        fields: [
          { key: 'escalation_reason', label: 'Escalation reason', type: 'evidence' },
          { key: 'default_chain_ref', label: 'Default chain reference', type: 'string' },
        ],
      },
      { action: 'abandon', label: 'Abandon', tone: 'oxide',
        path: '/api/lender/loan-restructure/chain/:id/abandon',
        roles: ['admin', 'lender'],
        cascadeHint: 'Borrower withdraws — terminal; closes the restructure runway.',
        fields: [
          { key: 'abandon_reason', label: 'Abandon reason', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'negotiation', label: 'Negotiation', statuses: ['restructure_proposal_drafted', 'lender_credit_committee_review', 'borrower_term_sheet_negotiation', 'term_sheet_signed'] },
      { key: 'documentation', label: 'Documentation', statuses: ['legal_documentation_drafted', 'consent_solicitation', 'signing'] },
      { key: 'triggered', label: 'Triggered', statuses: ['trigger_event', 'preliminary_assessment'] },
      { key: 'effective', label: 'Effective / monitoring', statuses: ['effective_date', 'monitoring_period'] },
      { key: 'resolved', label: 'Resolved', statuses: ['completed', 'rejected_by_committee', 'abandoned', 'escalated_to_default'] },
    ],
    kpis: [
      { key: 'total', label: 'Restructures', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'facility', label: 'Facility', compute: 'sum_quantum' },
    ],
    initiation: {
      label: 'Trigger restructure',
      path: '/api/lender/loan-restructure/chain',
      fields: [
        { key: 'facility_id', label: 'Facility', type: 'string' },
        { key: 'facility_name', label: 'Facility name', type: 'string' },
        { key: 'borrower_id', label: 'Borrower', type: 'string' },
        { key: 'borrower_name', label: 'Borrower name', type: 'string' },
        { key: 'project_id', label: 'Project ID', type: 'string' },
        { key: 'project_name', label: 'Project', type: 'string' },
        { key: 'facility_amount_zar', label: 'Facility amount', type: 'number', unit: 'ZAR' },
        { key: 'outstanding_debt_zar', label: 'Outstanding debt', type: 'number', unit: 'ZAR' },
        { key: 'debt_service_per_month_zar', label: 'Debt service / month', type: 'number', unit: 'ZAR' },
        { key: 'syndicate_size', label: 'Syndicate size', type: 'number' },
        { key: 'trigger_reason_code', label: 'Trigger reason code', type: 'string' },
        { key: 'trigger_narrative', label: 'Trigger narrative', type: 'evidence' },
        { key: 'covenant_breach_ref', label: 'Covenant breach ref (W38)', type: 'string' },
        { key: 'dscr_shortfall_ref', label: 'DSCR shortfall ref (W86)', type: 'string' },
        { key: 'cross_border_syndicate', label: 'Cross-border syndicate', type: 'boolean' },
        { key: 'sustainability_linked_loan', label: 'Sustainability-linked loan', type: 'boolean' },
        { key: 'public_bondholder_consent_required', label: 'Public bondholder consent required', type: 'boolean' },
        { key: 'ifrs9_stage_3_at_trigger', label: 'IFRS 9 Stage 3 at trigger', type: 'boolean' },
        { key: 'sarb_large_exposure_threshold', label: 'SARB large-exposure threshold', type: 'boolean' },
      ],
    },
  },

  // ───────── OFFTAKER (parity batch) ─────────
  // Three Offtaker PPA state-machine chains never migrated to the registry.
  // Single offtaker-desk write {admin, offtaker}; READ all nine personas;
  // regulator is cascade-driven (read-only) so no regulator lane. actor_party
  // records the contractual function per step (claimant / counterparty /
  // arbitrator / settlement_analyst etc.), not the JWT role.

  // W101 — PPA annual reconciliation & true-up (IFRS 15 + NERSA s34; the annual
  // financial-close gate; restate-after-settlement door; INVERTED authority
  // ladder; FINANCIAL-CLOSE SIGNATURE — restate/dispute always to regulator)
  {
    key: 'ppa_annual_recon', wave: 101, table: 'oe_ppa_annual_recon',
    title: 'PPA annual reconciliation', refCol: 'recon_number', titleCol: 'ppa_name',
    quantumCol: 'top_residual_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['settled', 'restated', 'cancelled'],
    counterpartyCol: 'seller_party_name',
    lanes: { offtaker: 'operations_offtaker', ipp_developer: 'finance' },
    eventsTable: 'oe_ppa_annual_recon_events', eventsFk: 'recon_id',
    actions: [
      { action: 'reconcile', label: 'Reconcile year', tone: 'primary',
        path: '/api/offtaker/ppa-annual-recon/chain/:id/reconcile',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Posts the net cash position for the closed year; arms auditor + counterparty signoff.',
        fields: [
          { key: 'net_cash_position_zar', label: 'Net cash position', type: 'number', unit: 'ZAR' },
          { key: 'narrative', label: 'Reconciliation note', type: 'evidence' },
        ],
      },
      { action: 'sign-off', label: 'Sign off', tone: 'primary',
        path: '/api/offtaker/ppa-annual-recon/chain/:id/sign-off',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Auditor + counterparty signoff on the closed year; crosses into the regulator inbox for material + major tiers.',
        fields: [
          { key: 'auditor_party', label: 'Auditor', type: 'string' },
          { key: 'counterparty_party', label: 'Counterparty', type: 'string' },
        ],
      },
      { action: 'settle', label: 'Settle', tone: 'primary',
        path: '/api/offtaker/ppa-annual-recon/chain/:id/settle',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Records payment against the invoiced true-up; closes the reconciliation year.',
        fields: [
          { key: 'payment_ref', label: 'Payment reference', type: 'evidence' },
        ],
      },
      { action: 'raise-dispute', label: 'Raise dispute', tone: 'oxide',
        path: '/api/offtaker/ppa-annual-recon/chain/:id/raise-dispute',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Opens a reconciliation dispute; crosses into the regulator inbox for EVERY tier (NERSA s30 — W101 signature).',
        fields: [
          { key: 'disputed_reason', label: 'Dispute reason', type: 'evidence' },
        ],
      },
      { action: 'restate-year', label: 'Restate year', tone: 'oxide',
        path: '/api/offtaker/ppa-annual-recon/chain/:id/restate-year',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Post-signoff restatement of a closed year; crosses into the regulator inbox for EVERY tier (IFRS 15 — W101 signature).',
        fields: [
          { key: 'restated_reason', label: 'Restatement reason', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'signoff_pending', label: 'Signoff pending', statuses: ['reconciled', 'disputed'] },
      { key: 'dispute', label: 'Disputed', statuses: ['disputed'] },
      { key: 'computing', label: 'Computing', statuses: ['year_opened', 'data_collected', 'variance_classified', 'top_residual_computed', 'cpi_capacity_applied'] },
      { key: 'closing', label: 'Closing', statuses: ['signed_off', 'invoiced'] },
      { key: 'resolved', label: 'Resolved', statuses: ['settled', 'restated', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Reconciliations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'residual', label: 'Top residual', compute: 'sum_quantum' },
    ],
    initiation: null,
  },

  // W78 — PPA change-in-law / qualifying-change relief (cost pass-through on a
  // statute/tax/regulation change after financial close; arbitration branch;
  // INVERTED quantum tiering; SIGNATURE — arbitration referral always reportable)
  {
    key: 'ppa_change_in_law', wave: 78, table: 'oe_ppa_change_in_law',
    title: 'PPA change-in-law', refCol: 'cil_number', titleCol: 'generator_name',
    quantumCol: 'claim_quantum_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['implemented', 'rejected', 'withdrawn'],
    counterpartyCol: 'generator_name',
    lanes: { offtaker: 'contracts', ipp_developer: 'finance' },
    eventsTable: 'oe_ppa_change_in_law_events', eventsFk: 'change_in_law_id',
    actions: [
      { action: 'submit-claim', label: 'Submit claim', tone: 'primary',
        path: '/api/ppa-change-in-law/chain/:id/submit-claim',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Submits the assessed relief claim; tier is re-derived from the claimed quantum and arms counterparty review.',
        fields: [
          { key: 'claim_quantum_zar_m', label: 'Claim quantum', type: 'number', unit: 'ZAR' },
          { key: 'assessed_quantum_zar_m', label: 'Assessed quantum', type: 'number', unit: 'ZAR' },
          { key: 'relief_mechanism', label: 'Relief mechanism', type: 'string' },
          { key: 'assessment_basis', label: 'Assessment basis', type: 'evidence' },
          { key: 'assessment_ref', label: 'Assessment reference', type: 'evidence' },
          { key: 'claim_ref', label: 'Claim reference', type: 'evidence' },
        ],
      },
      { action: 'issue-determination', label: 'Issue determination', tone: 'primary',
        path: '/api/ppa-change-in-law/chain/:id/issue-determination',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Grants relief on a negotiated determination; crosses into the regulator inbox for material+ tiers on governmental changes.',
        fields: [
          { key: 'granted_quantum_zar_m', label: 'Granted quantum', type: 'number', unit: 'ZAR' },
          { key: 'relief_mechanism', label: 'Relief mechanism', type: 'string' },
          { key: 'determination_basis', label: 'Determination basis', type: 'evidence' },
        ],
      },
      { action: 'refer-to-arbitration', label: 'Refer to arbitration', tone: 'oxide',
        path: '/api/ppa-change-in-law/chain/:id/refer-to-arbitration',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Refers a contested claim to arbitration; crosses into the regulator inbox for EVERY tier (W78 signature).',
        fields: [
          { key: 'arbitrator_name', label: 'Arbitrator', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'arbitration_basis', label: 'Arbitration basis', type: 'evidence' },
        ],
      },
      { action: 'implement-relief', label: 'Implement relief', tone: 'primary',
        path: '/api/ppa-change-in-law/chain/:id/implement-relief',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Implements the granted relief into the PPA (terminal); closes the change-in-law claim.',
        fields: [
          { key: 'implementation_basis', label: 'Implementation basis', type: 'evidence' },
        ],
      },
      { action: 'withdraw-claim', label: 'Withdraw claim', tone: 'oxide',
        path: '/api/ppa-change-in-law/chain/:id/withdraw-claim',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Claimant withdraws the claim (terminal); closes the change-in-law runway.',
        fields: [
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'withdrawal_basis', label: 'Withdrawal basis', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'arbitration', label: 'In arbitration', statuses: ['in_arbitration'] },
      { key: 'negotiation', label: 'Negotiation', statuses: ['claim_submitted', 'counterparty_review', 'negotiation', 'determination_pending'] },
      { key: 'assessment', label: 'Assessment', statuses: ['event_logged', 'eligibility_review', 'impact_assessment'] },
      { key: 'granted', label: 'Relief granted', statuses: ['relief_granted'] },
      { key: 'resolved', label: 'Resolved', statuses: ['implemented', 'rejected', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Claims', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'claimed', label: 'Claim quantum', compute: 'sum_quantum' },
    ],
    initiation: null,
  },

  // W87 — PPA scheduled-energy nomination & deviation settlement (day-ahead
  // nominate → confirm → gate → deliver → meter → reconcile → settle at the
  // deviation tariff; tier RE-DERIVED from absolute deviation %; NOMINATION-
  // INTEGRITY SIGNATURE — disputes always to NERSA s30)
  {
    key: 'ppa_nomination', wave: 87, table: 'oe_ppa_nominations',
    title: 'PPA nomination', refCol: 'nomination_number', titleCol: 'ppa_reference',
    quantumCol: 'predicted_penalty_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['deviation_settled', 'excused', 'cancelled'],
    counterpartyCol: 'seller_name',
    lanes: { offtaker: 'operations_offtaker', ipp_developer: 'finance' },
    eventsTable: 'oe_ppa_nomination_events', eventsFk: 'nomination_id',
    actions: [
      { action: 'submit-da-nomination', label: 'Submit DA nomination', tone: 'primary',
        path: '/api/ppa-nomination/chain/:id/submit-da-nomination',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Submits the day-ahead nominated energy; arms confirmation against the seller schedule.',
        fields: [
          { key: 'da_nominated_mwh', label: 'Day-ahead nominated', type: 'number', unit: 'MWh' },
          { key: 'effective_nominated_mwh', label: 'Effective nominated', type: 'number', unit: 'MWh' },
          { key: 'ppa_tariff_zar_per_mwh', label: 'PPA tariff', type: 'number', unit: 'ZAR' },
          { key: 'deviation_tariff_zar_per_mwh', label: 'Deviation tariff', type: 'number', unit: 'ZAR' },
          { key: 'penalty_tariff_zar_per_mwh', label: 'Penalty tariff', type: 'number', unit: 'ZAR' },
          { key: 'installed_capacity_mw', label: 'Installed capacity', type: 'number', unit: 'MW' },
          { key: 'weather_attributable_pct', label: 'Weather-attributable', type: 'number' },
        ],
      },
      { action: 'ingest-meter', label: 'Ingest meter', tone: 'primary',
        path: '/api/ppa-nomination/chain/:id/ingest-meter',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Ingests metered delivery; deviation analytics and tier are re-derived from the metered MWh.',
        fields: [
          { key: 'metered_mwh', label: 'Metered', type: 'number', unit: 'MWh' },
        ],
      },
      { action: 'reconcile', label: 'Reconcile', tone: 'primary',
        path: '/api/ppa-nomination/chain/:id/reconcile',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Reconciles metered vs nominated; weather-normalises the residual and arms settlement.',
        fields: [
          { key: 'metered_mwh', label: 'Metered', type: 'number', unit: 'MWh' },
          { key: 'weather_attributable_pct', label: 'Weather-attributable', type: 'number' },
        ],
      },
      { action: 'settle-deviation', label: 'Settle deviation', tone: 'primary',
        path: '/api/ppa-nomination/chain/:id/settle-deviation',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Settles the deviation at the penalty tariff; crosses into the regulator inbox for material + major tiers.',
        fields: [
          { key: 'settled_amount_zar', label: 'Settled amount', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'raise-dispute', label: 'Raise dispute', tone: 'oxide',
        path: '/api/ppa-nomination/chain/:id/raise-dispute',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Opens a deviation dispute; crosses into the regulator inbox for EVERY tier (NERSA s30 — W87 signature).',
        fields: [
          { key: 'dispute_ground', label: 'Dispute ground', type: 'evidence' },
        ],
      },
    ],
    filters: [
      { key: 'dispute', label: 'Disputed', statuses: ['dispute_raised'] },
      { key: 'reconciling', label: 'Reconciling', statuses: ['meter_data_received', 'reconciled'] },
      { key: 'delivery', label: 'In delivery', statuses: ['delivery_in_progress', 'delivery_complete'] },
      { key: 'nominating', label: 'Nominating', statuses: ['nomination_window_open', 'da_nominated', 'da_confirmed', 'id_revised'] },
      { key: 'resolved', label: 'Resolved', statuses: ['deviation_settled', 'excused', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Nominations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'penalty', label: 'Predicted penalty', compute: 'sum_quantum' },
    ],
    initiation: null,
  },

  // ───────── REGULATOR ─────────
  // Regulator lanes on cross-referred chains (W33/W38/W40/W43/W49/W57/W74 etc.)
  // also appear on entries above/below via the lanes map.
  // W5 — Regulator inbox triage (materialized crossings from every wave's
  // fireCascade; ack / escalate / dismiss; escalate can open an enforcement
  // case). Non-standard columns: `ack_status` + `sla_due_at` (mig 100) —
  // absorbed by the per-entry statusCol/deadlineCol fields. No event table —
  // the inbox row is itself the audit record of the crossing.
  {
    key: 'regulator_inbox', wave: 5, table: 'oe_regulator_inbox',
    title: 'Regulator inbox item', refCol: 'id', titleCol: 'title',
    quantumCol: null, statusCol: 'ack_status',
    deadlineCol: 'sla_due_at',
    // escalated stays LIVE: route allows ack from escalated (regulator-inbox.ts:159)
    terminal: ['acknowledged', 'dismissed'],
    counterpartyCol: null, // crossing record; the source entity carries the counterparty
    lanes: { regulator: 'enforcement_regulator' },
    eventsTable: null, eventsFk: null,
    actions: [
      { action: 'ack', label: 'Acknowledge', tone: 'primary',
        path: '/api/regulator/inbox/:id/ack',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Marks the crossing triaged; fires the surveillance-alert-resolved cascade.' },
      { action: 'escalate', label: 'Escalate', tone: 'oxide',
        path: '/api/regulator/inbox/:id/escalate',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Escalates the alert out of triage — optionally opening an enforcement case — and fires the surveillance-escalated cascade.',
        fields: [
          { key: 'reason', label: 'Escalation reason', type: 'string',
            placeholder: 'e.g. recurring pattern across counterparty' },
          { key: 'open_case', label: 'Open enforcement case', type: 'boolean' },
        ],
      },
      { action: 'dismiss', label: 'Dismiss', tone: 'ghost',
        path: '/api/regulator/inbox/:id/dismiss',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Dismisses a false-positive crossing; the item closes without enforcement follow-up.' },
    ],
    filters: [
      { key: 'pending', label: 'Pending', statuses: ['pending'] },
      { key: 'escalated', label: 'Escalated', statuses: ['escalated'] },
      { key: 'resolved', label: 'Resolved', statuses: ['acknowledged', 'dismissed'] },
    ],
    kpis: [
      { key: 'total', label: 'Inbox items', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
    ],
  },

  // W5 — Compliance notice (issued by the regulator desk against a licensee;
  // remedy deadline; licensee acknowledges, regulator satisfies/withdraws).
  // Non-standard columns: plain `status` + `remedy_deadline_at` (mig 100);
  // no penalty ZAR column on the notice itself.
  {
    key: 'compliance_notice', wave: 5, table: 'oe_compliance_notices',
    title: 'Compliance notice', refCol: 'id', titleCol: 'title',
    quantumCol: null, statusCol: 'status',
    deadlineCol: 'remedy_deadline_at',
    terminal: ['satisfied', 'withdrawn'],
    counterpartyCol: 'licensee_user_id',
    lanes: { regulator: 'enforcement_regulator' },
    eventsTable: null, eventsFk: null,
    actions: [
      { action: 'ack', label: 'Acknowledge notice',
        path: '/api/regulator/inbox/compliance-notices/:id/ack',
        roles: ['admin', 'support', 'regulator', 'carbon_fund', 'ipp_developer', 'offtaker', 'trader', 'lender'],
        cascadeHint: 'Licensee acknowledges receipt of the notice; the remedy deadline keeps running.' },
      { action: 'satisfy', label: 'Mark satisfied', tone: 'primary',
        path: '/api/regulator/inbox/compliance-notices/:id/satisfy',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Regulator confirms the remedy evidence and closes the notice satisfied.',
        fields: [
          { key: 'satisfied_evidence', label: 'Remedy evidence', type: 'evidence' },
        ],
      },
      { action: 'withdraw', label: 'Withdraw notice', tone: 'oxide',
        path: '/api/regulator/inbox/compliance-notices/:id/withdraw',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Withdraws a notice issued in error or superseded; closes without enforcement.' },
    ],
    filters: [
      { key: 'open', label: 'Open', statuses: ['issued', 'overdue', 'acknowledged'] },
      { key: 'resolved', label: 'Resolved', statuses: ['satisfied', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Notices', compute: 'count' },
      { key: 'breached', label: 'Overdue', compute: 'count_breached' },
    ],
  },

  // W31 — Regulatory disposition (NERSA §10; INVERTED SLA; fed by every prior
  // wave's regulator crossings; single regulator-desk write)
  {
    key: 'disposition', wave: 31, table: 'oe_disposition_cases',
    title: 'Disposition case', refCol: 'case_number', titleCol: 'notice_subject',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'escalated', 'dismissed', 'referred'],
    counterpartyCol: 'source_party',
    lanes: { regulator: 'enforcement_regulator' },
    eventsTable: 'oe_disposition_events', eventsFk: 'disposition_id',
    actions: [
      { action: 'triage', label: 'Triage case', tone: 'primary',
        path: '/api/disposition/chain/:id/triage',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Triages the cross-referred matter and sets the severity tier; the tier SLA starts running.',
        fields: [
          { key: 'severity_tier', label: 'Severity tier', type: 'enum',
            options: ['critical', 'high', 'medium', 'low'] },
        ],
      },
      { action: 'require-action', label: 'Require corrective action',
        path: '/api/disposition/chain/:id/require-action',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Directs the licensee to take corrective action; opens the compliance window on the source party.',
        fields: [
          { key: 'investigation_findings', label: 'Investigation findings', type: 'evidence', required: true },
          { key: 'required_action', label: 'Required action', type: 'string', required: true,
            placeholder: 'directive / order / corrective plan' },
        ],
      },
      { action: 'escalate', label: 'Escalate', tone: 'oxide',
        path: '/api/disposition/chain/:id/escalate',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Escalates the matter to formal enforcement; terminates the disposition escalated.',
        fields: [
          { key: 'council_panel_ref', label: 'Council panel reference', type: 'string', required: true,
            placeholder: 'COUNCIL-PANEL-2026-0044' },
          { key: 'council_minute_ref', label: 'Council minute reference', type: 'string' },
          { key: 'section10_report_ref', label: '§10 monthly report reference', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string',
            placeholder: 'SYSTEMIC_RISK / FATAL_SAFETY / S10_OVERDUE' },
          { key: 'rod_notes', label: 'ROD notes (escalation rationale)', type: 'evidence', required: true },
        ],
      },
    ],
    filters: [
      { key: 'intake', label: 'Intake', statuses: ['received', 'triaged', 'assigned'] },
      { key: 'investigating', label: 'Investigating', statuses: ['investigating', 'action_required', 'action_in_progress', 'action_completed'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'escalated', 'dismissed', 'referred'] },
    ],
    kpis: [
      { key: 'total', label: 'Cases', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
    ],
  },

  // W33 — Licence renewal (NERSA ss.14-16; INVERTED SLA — bigger class more
  // time; TWO-PARTY — officer drives, applicant files + withdraws)
  {
    key: 'licence_renewal', wave: 33, table: 'oe_licence_renewals',
    title: 'Licence renewal', refCol: 'case_number', titleCol: 'facility_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['granted', 'amended', 'refused', 'withdrawn'],
    counterpartyCol: 'applicant_party_name',
    lanes: { regulator: 'licensing', ipp_developer: 'regulatory_risk' },
    eventsTable: 'oe_licence_renewal_events', eventsFk: 'renewal_id',
    actions: [
      { action: 'file-application', label: 'File renewal application',
        path: '/api/licence/renewal/chain/:id/file-application',
        roles: ['admin', 'support', 'ipp_developer', 'grid_operator', 'trader', 'carbon_fund', 'offtaker'],
        cascadeHint: 'Licensee files the renewal application against the expiry notice; the completeness-check clock starts.',
        fields: [
          { key: 'application_pack_ref', label: 'Application pack reference', type: 'string', required: true,
            placeholder: 'APP-PACK-KSL-U6-2026' },
          { key: 'requested_expiry_date', label: 'Requested expiry date', type: 'date' },
        ],
      },
      { action: 'grant', label: 'Grant renewal', tone: 'primary',
        path: '/api/licence/renewal/chain/:id/grant',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council grants the renewed licence; the licensee continues operating under the renewed term.',
        fields: [
          { key: 'granted_expiry_date', label: 'Granted expiry date', type: 'date', required: true },
        ],
      },
      { action: 'refuse', label: 'Refuse renewal', tone: 'oxide',
        path: '/api/licence/renewal/chain/:id/refuse',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council refuses the renewal; the licensee loses the right to operate at licence expiry.',
        fields: [
          { key: 'refusal_grounds', label: 'Refusal grounds (Council motivation)', type: 'evidence', required: true },
          { key: 'appeal_filing_ref', label: 'Appeal filing reference', type: 'string' },
          { key: 'tribunal_case_ref', label: 'Tribunal case reference', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'rod_notes', label: 'ROD notes (full refusal rationale)', type: 'evidence', required: true },
        ],
      },
    ],
    filters: [
      { key: 'filing', label: 'Filing', statuses: ['renewal_initiated', 'application_filed', 'completeness_check'] },
      { key: 'in_review', label: 'In review', statuses: ['public_consultation', 'evaluation', 'decision_drafted', 'council_voted'] },
      { key: 'closed', label: 'Closed', statuses: ['granted', 'amended', 'refused', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Renewals', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
    ],
  },

  // W40 — Compliance inspection & enforcement (NERSA §10 + §34/§35; PROACTIVE;
  // URGENT SLA; TWO-PARTY — officer drives, respondent remediates + appeals)
  {
    key: 'compliance_inspection', wave: 40, table: 'oe_compliance_inspections',
    title: 'Compliance inspection', refCol: 'inspection_number', titleCol: 'facility_name',
    quantumCol: 'penalty_amount_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['compliant_closed', 'enforcement_closed', 'withdrawn'],
    counterpartyCol: 'respondent_party_name',
    lanes: { regulator: 'enforcement_regulator', ipp_developer: 'regulatory_risk' },
    eventsTable: 'oe_compliance_inspections_events', eventsFk: 'inspection_id',
    actions: [
      { action: 'issue-findings', label: 'Issue findings',
        path: '/api/compliance-inspection/chain/:id/issue-findings',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Officer issues the inspection findings to the respondent; the remediation directive window opens.',
        fields: [
          { key: 'findings_ref', label: 'Findings document reference', type: 'string', required: true,
            placeholder: 'FIND-INSP-2026-0042' },
          { key: 'findings_basis', label: 'Findings basis (non-conformance detail)', type: 'evidence', required: true },
        ],
      },
      { action: 'begin-remediation', label: 'Begin remediation',
        path: '/api/compliance-inspection/chain/:id/begin-remediation',
        roles: ['admin', 'support', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund'],
        cascadeHint: 'Respondent licensee starts remediating the directive; the verification clock keeps running.',
        fields: [
          { key: 'remediation_basis', label: 'Remediation plan basis', type: 'evidence', required: true },
          { key: 'remediation_cost_zar', label: 'Remediation cost', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'close-compliant', label: 'Close compliant', tone: 'primary',
        path: '/api/compliance-inspection/chain/:id/close-compliant',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Officer verifies remediation and closes the inspection clean — the no-enforcement terminal.',
        fields: [
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'rod_notes', label: 'ROD notes (verification rationale)', type: 'evidence', required: true },
        ],
      },
      { action: 'impose-penalty', label: 'Impose penalty', tone: 'oxide',
        path: '/api/compliance-inspection/chain/:id/impose-penalty',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Imposes the §34/§35 financial penalty for failed remediation; opens the respondent appeal window.',
        fields: [
          { key: 'penalty_ref', label: 'Penalty notice reference', type: 'string', required: true,
            placeholder: 'PEN-2026-0042' },
          { key: 'penalty_basis', label: 'Penalty basis (§34/§35 grounds)', type: 'evidence', required: true },
          { key: 'penalty_amount_zar', label: 'Penalty amount', type: 'number', unit: 'ZAR', required: true },
          { key: 'daily_penalty_zar', label: 'Daily penalty', type: 'number', unit: 'ZAR' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'inspecting', label: 'Inspecting', statuses: ['inspection_scheduled', 'inspection_in_progress', 'findings_drafted'] },
      { key: 'remediation', label: 'Remediation', statuses: ['findings_issued', 'directive_issued', 'remediation_underway', 'remediation_verified'] },
      { key: 'enforcement', label: 'Enforcement', statuses: ['penalty_imposed', 'appealed'] },
      { key: 'closed', label: 'Closed', statuses: ['compliant_closed', 'enforcement_closed', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Inspections', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'penalties', label: 'Penalties (ZAR)', compute: 'sum_quantum' },
    ],
  },

  // W43 — MYPD tariff determination (NERSA §15-16; INVERTED SLA; TWO-PARTY —
  // regulator determines, applicant licensee files + seeks reconsideration).
  // quantumCol is R millions (requested allowed revenue), not absolute ZAR.
  {
    key: 'tariff_determination', wave: 43, table: 'oe_tariff_determinations',
    title: 'Tariff determination', refCol: 'determination_number', titleCol: 'tariff_entity',
    quantumCol: 'requested_revenue_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['implemented', 'remitted', 'rejected', 'withdrawn'],
    counterpartyCol: 'applicant_party_name',
    lanes: { regulator: 'tariff_determinations', grid_operator: 'compliance_grid' },
    eventsTable: 'oe_tariff_determinations_events', eventsFk: 'determination_id',
    actions: [
      { action: 'open-consultation', label: 'Open public consultation',
        path: '/api/tariff-determination/chain/:id/open-consultation',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Opens the statutory public-consultation window on the revenue application.',
        fields: [
          { key: 'consultation_ref', label: 'Consultation notice reference', type: 'string', required: true,
            placeholder: 'CONS-MYPD-2026-01' },
          { key: 'consultation_basis', label: 'Consultation basis', type: 'evidence' },
        ],
      },
      { action: 'issue-determination', label: 'Issue determination', tone: 'primary',
        path: '/api/tariff-determination/chain/:id/issue-determination',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council issues the allowed-revenue determination; gazetting and implementation follow.',
        fields: [
          { key: 'determination_ref', label: 'Determination reference', type: 'string', required: true,
            placeholder: 'DET-MYPD-2026-01' },
          { key: 'determination_basis', label: 'Determination basis (Council reasons)', type: 'evidence', required: true },
          { key: 'allowed_revenue_zar_m', label: 'Allowed revenue (R millions)', type: 'number', unit: 'ZAR', required: true },
          { key: 'allowed_tariff_zar_kwh', label: 'Allowed tariff (ZAR/kWh)', type: 'number', unit: 'ZAR' },
          { key: 'tariff_increase_pct', label: 'Tariff increase (%)', type: 'number' },
          { key: 'x_factor', label: 'X-factor', type: 'number' },
          { key: 'gazette_ref', label: 'Gazette reference', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
        ],
      },
      { action: 'request-reconsideration', label: 'Request reconsideration',
        path: '/api/tariff-determination/chain/:id/request-reconsideration',
        roles: ['admin', 'support', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund'],
        cascadeHint: 'Applicant licensee asks Council to reconsider the issued determination before implementation.',
        fields: [
          { key: 'reconsideration_ref', label: 'Reconsideration reference', type: 'string', required: true,
            placeholder: 'RECON-2026-01' },
          { key: 'reconsideration_basis', label: 'Reconsideration grounds', type: 'evidence', required: true },
        ],
      },
      { action: 'reject', label: 'Reject application', tone: 'oxide',
        path: '/api/tariff-determination/chain/:id/reject',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council rejects the revenue application; the licensee remains on the prior tariff.',
        fields: [
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'rod_notes', label: 'ROD notes (rejection rationale)', type: 'evidence', required: true },
        ],
      },
    ],
    filters: [
      { key: 'review', label: 'Review', statuses: ['application_received', 'completeness_review', 'public_consultation', 'revenue_analysis'] },
      { key: 'decision', label: 'Decision', statuses: ['draft_determination', 'council_deliberation', 'determination_issued', 'reconsideration_requested'] },
      { key: 'closed', label: 'Closed', statuses: ['implemented', 'remitted', 'rejected', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Determinations', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'revenue', label: 'Requested revenue (Rm)', compute: 'sum_quantum' },
    ],
  },

  // W49 — Initial licence application & adjudication (ERA ss.8-11; market-entry
  // gate ahead of W33 renewal; INVERTED SLA; TWO-PARTY — regulator adjudicates,
  // applicant files + supplies info). quantumCol is R millions (project capex).
  {
    key: 'licence_application', wave: 49, table: 'oe_licence_applications',
    title: 'Licence application', refCol: 'application_number', titleCol: 'facility_name',
    quantumCol: 'estimated_capex_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['licence_issued', 'refused', 'withdrawn', 'lapsed'],
    counterpartyCol: 'applicant_party_name',
    lanes: { regulator: 'licensing', ipp_developer: 'regulatory_risk' },
    eventsTable: 'oe_licence_applications_events', eventsFk: 'application_id',
    actions: [
      { action: 'submit-info', label: 'Submit information',
        path: '/api/licence-application/chain/:id/submit-info',
        roles: ['admin', 'support', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund'],
        cascadeHint: 'Applicant answers the information request; the application returns to completeness review.',
        fields: [
          { key: 'notes', label: 'Information supplied', type: 'evidence', required: true },
        ],
      },
      { action: 'open-participation', label: 'Open public participation',
        path: '/api/licence-application/chain/:id/open-participation',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Opens the s.10 public-participation window on the accepted application.',
        fields: [
          { key: 'participation_ref', label: 'Participation notice reference', type: 'string', required: true,
            placeholder: 'PART-2026-0042' },
          { key: 'participation_basis', label: 'Participation basis', type: 'evidence' },
        ],
      },
      { action: 'grant-licence', label: 'Grant licence', tone: 'primary',
        path: '/api/licence-application/chain/:id/grant-licence',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council grants the licence; crosses the regulator oversight queue for the major class only.',
        fields: [
          { key: 'grant_basis', label: 'Grant basis (Council reasons)', type: 'evidence', required: true },
          { key: 'council_ref', label: 'Council decision reference', type: 'string' },
        ],
      },
      { action: 'refuse-licence', label: 'Refuse licence', tone: 'oxide',
        path: '/api/licence-application/chain/:id/refuse-licence',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council refuses market entry; crosses the regulator oversight queue for every class (W49 signature).',
        fields: [
          { key: 'refusal_basis', label: 'Refusal basis (Council reasons)', type: 'evidence', required: true },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'rod_notes', label: 'ROD notes (full refusal rationale)', type: 'evidence', required: true },
        ],
      },
    ],
    filters: [
      { key: 'intake', label: 'Intake', statuses: ['application_received', 'completeness_review', 'additional_info_requested', 'accepted'] },
      { key: 'adjudication', label: 'Adjudication', statuses: ['public_participation', 'technical_evaluation', 'council_decision', 'licence_granted'] },
      { key: 'closed', label: 'Closed', statuses: ['licence_issued', 'refused', 'withdrawn', 'lapsed'] },
    ],
    kpis: [
      { key: 'total', label: 'Applications', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'capex', label: 'Est. capex (Rm)', compute: 'sum_quantum' },
    ],
  },

  // W57 — SSEG / Schedule 2 embedded-generation registration (ERA Sch 2;
  // light-touch sibling of W49; INVERTED SLA; TWO-PARTY — registry drives,
  // applicant files + satisfies conditions). quantumCol is R millions.
  {
    key: 'sseg_registration', wave: 57, table: 'oe_sseg_registrations',
    title: 'SSEG registration', refCol: 'registration_number', titleCol: 'facility_name',
    quantumCol: 'estimated_capex_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['registered', 'referred_to_licensing', 'refused', 'withdrawn', 'lapsed'],
    counterpartyCol: 'applicant_party_name',
    lanes: { regulator: 'licensing', ipp_developer: 'regulatory_risk' },
    eventsTable: 'oe_sseg_registrations_events', eventsFk: 'registration_id',
    actions: [
      { action: 'approve-registration', label: 'Approve registration', tone: 'primary',
        path: '/api/sseg-registration/chain/:id/approve-registration',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Committee approves the Schedule 2 registration; certificate issuance follows.',
        fields: [
          { key: 'approval_basis', label: 'Approval basis', type: 'evidence', required: true },
        ],
      },
      { action: 'refer-to-licensing', label: 'Refer to licensing',
        path: '/api/sseg-registration/chain/:id/refer-to-licensing',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Hands a non-Schedule-2 facility up to the full W49 licence-application chain.',
        fields: [
          { key: 'licensing_referral_ref', label: 'Licensing referral reference', type: 'string', required: true,
            placeholder: 'REF-LIC-2026-0042' },
          { key: 'referral_basis', label: 'Referral basis (why non-Schedule-2)', type: 'evidence', required: true },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
          { key: 'rod_notes', label: 'ROD notes', type: 'evidence' },
        ],
      },
      { action: 'refuse-registration', label: 'Refuse registration', tone: 'oxide',
        path: '/api/sseg-registration/chain/:id/refuse-registration',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Committee refuses the registration on failed verification; the facility may not lawfully operate.',
        fields: [
          { key: 'refusal_basis', label: 'Refusal basis', type: 'evidence', required: true },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'rod_notes', label: 'ROD notes (full refusal rationale)', type: 'evidence', required: true },
        ],
      },
    ],
    filters: [
      { key: 'screening', label: 'Screening', statuses: ['registration_received', 'eligibility_screening', 'information_requested', 'technical_verification'] },
      { key: 'determination', label: 'Determination', statuses: ['exemption_determination', 'conditions_pending', 'registration_approved'] },
      { key: 'closed', label: 'Closed', statuses: ['registered', 'referred_to_licensing', 'refused', 'withdrawn', 'lapsed'] },
    ],
    kpis: [
      { key: 'total', label: 'Registrations', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'capex', label: 'Est. capex (Rm)', compute: 'sum_quantum' },
    ],
  },

  // W66 — Complaints & dispute resolution (ERA s30; REACTIVE external intake;
  // URGENT SLA; single NERSA-desk write {admin, regulator} — no support)
  {
    key: 'complaint_resolution', wave: 66, table: 'oe_regulator_complaints',
    title: 'Complaint resolution', refCol: 'complaint_number', titleCol: 'respondent_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['resolved', 'dismissed', 'appealed', 'withdrawn'],
    counterpartyCol: 'complainant_name',
    lanes: { regulator: 'enforcement_regulator' },
    eventsTable: 'oe_regulator_complaints_events', eventsFk: 'complaint_id',
    actions: [
      { action: 'screen-admissibility', label: 'Screen admissibility',
        path: '/api/complaints/chain/:id/screen-admissibility',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Screens jurisdiction and merit; admissible complaints are referred to the respondent licensee first.',
        fields: [
          { key: 'admissibility_basis', label: 'Admissibility basis', type: 'evidence', required: true },
          { key: 'jurisdiction_basis', label: 'Jurisdiction basis', type: 'evidence' },
          { key: 'affected_customers', label: 'Affected customers', type: 'number' },
        ],
      },
      { action: 'issue-ruling', label: 'Issue ruling', tone: 'primary',
        path: '/api/complaints/chain/:id/issue-ruling',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Issues the binding adjudication ruling; crosses the Council oversight queue for major and systemic tiers.',
        fields: [
          { key: 'ruling_basis', label: 'Ruling basis (reasons)', type: 'evidence', required: true },
          { key: 'ruling_ref', label: 'Ruling reference', type: 'string' },
          { key: 'remedy_directed', label: 'Remedy directed', type: 'string' },
        ],
      },
      { action: 'lodge-appeal', label: 'Record appeal', tone: 'oxide',
        path: '/api/complaints/chain/:id/lodge-appeal',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Records a judicial-review appeal against the ruling; crosses the Council oversight queue for every tier (W66 signature).',
        fields: [
          { key: 'appeal_basis', label: 'Appeal grounds', type: 'evidence', required: true },
          { key: 'appeal_ref', label: 'Appeal reference', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'intake', label: 'Intake', statuses: ['complaint_lodged', 'admissibility_review', 'referred_to_licensee'] },
      { key: 'adjudication', label: 'Adjudication', statuses: ['under_investigation', 'mediation', 'adjudication_hearing', 'ruling_issued', 'remedy_monitoring'] },
      { key: 'closed', label: 'Closed', statuses: ['resolved', 'dismissed', 'appealed', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Complaints', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
    ],
  },

  // W74 — NERSA levy assessment & collection (NERA Act §5B; URGENT SLA —
  // bigger levy tighter; single NERSA levy-desk write {admin, regulator})
  {
    key: 'levy_assessment', wave: 74, table: 'oe_regulator_levies',
    title: 'Levy assessment', refCol: 'levy_number', titleCol: 'licensee_name',
    quantumCol: 'outstanding_amount', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['settled', 'written_off', 'withdrawn'],
    counterpartyCol: null, // regulator-originated; the levied licensee is already the title
    lanes: { regulator: 'levies', grid_operator: 'compliance_grid' },
    eventsTable: 'oe_regulator_levies_events', eventsFk: 'levy_id',
    actions: [
      { action: 'issue-invoice', label: 'Issue levy invoice',
        path: '/api/levy-assessment/chain/:id/issue-invoice',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Issues the levy notice to the licensee; the payment window and arrears aging start.',
        fields: [
          { key: 'invoice_ref', label: 'Invoice reference', type: 'string', required: true,
            placeholder: 'LEVY-INV-2026-0042' },
          { key: 'invoice_basis', label: 'Invoice basis (assessment method)', type: 'evidence' },
          { key: 'due_date', label: 'Payment due date', type: 'date' },
        ],
      },
      { action: 'record-settlement', label: 'Record settlement', tone: 'primary',
        path: '/api/levy-assessment/chain/:id/record-settlement',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Records payment in full; terminates the assessment settled and restores licence good standing.',
        fields: [
          { key: 'settlement_ref', label: 'Settlement reference', type: 'string', required: true,
            placeholder: 'PAY-2026-0042' },
          { key: 'payment_amount', label: 'Payment amount', type: 'number', unit: 'ZAR' },
          { key: 'settlement_basis', label: 'Settlement basis', type: 'evidence' },
        ],
      },
      { action: 'escalate-enforcement', label: 'Escalate to enforcement', tone: 'oxide',
        path: '/api/levy-assessment/chain/:id/escalate-enforcement',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Escalates the uncollected debt to enforcement — a licence good-standing matter; crosses the Council oversight queue for every tier (W74 signature).',
        fields: [
          { key: 'enforcement_ref', label: 'Enforcement reference', type: 'string', required: true,
            placeholder: 'ENF-2026-0042' },
          { key: 'enforcement_basis', label: 'Enforcement basis', type: 'evidence', required: true },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'assessment', label: 'Assessment', statuses: ['levy_assessed', 'assessment_review', 'invoiced', 'objection_review'] },
      { key: 'collection', label: 'Collection', statuses: ['payment_pending', 'partially_paid', 'in_arrears', 'final_demand', 'enforcement'] },
      { key: 'closed', label: 'Closed', statuses: ['settled', 'written_off', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Levies', compute: 'count' },
      { key: 'breached', label: 'SLA breached', compute: 'count_breached' },
      { key: 'outstanding', label: 'Outstanding (ZAR)', compute: 'sum_quantum' },
    ],
  },

  // ── SUPPORT (OEM-Support family) ────────────────────────────────────────────
  // W14 support tickets skipped: support_tickets has no oe_/om_ prefix (mig 118)

  // W15 — OEM warranty / RMA claim (severity-tiered SLA windows per stage;
  // safety severity crosses the regulator inbox on dispute/denial/breach;
  // denied is NON-terminal — the claimant may dispute back to review).
  // Non-standard deadline column: `next_sla_due_at` (mig 120).
  {
    key: 'warranty_claim', wave: 15, table: 'oe_warranty_claims',
    title: 'Warranty claim', refCol: 'claim_number', titleCol: 'subject',
    quantumCol: 'recovery_zar', statusCol: 'chain_status',
    deadlineCol: 'next_sla_due_at',
    // fulfilled stays LIVE: warranty-claim-spec TERMINAL=['closed'], close acts from fulfilled
    terminal: ['closed'],
    counterpartyCol: 'oem_name',
    lanes: { support: 'oem_supply_chain' },
    eventsTable: 'oe_warranty_claim_events', eventsFk: 'claim_id',
    actions: [
      { action: 'submit', label: 'Submit to OEM',
        path: '/api/esums/warranty-claims/:id/submit',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'om', 'esums'],
        cascadeHint: 'Submits the triaged claim to the OEM; the severity-tiered acknowledgement SLA arms.',
        fields: [
          { key: 'rma_number', label: 'RMA number', type: 'string', placeholder: 'OEM return-material authorisation reference' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'approve', label: 'Approve claim', tone: 'primary',
        path: '/api/esums/warranty-claims/:id/approve',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'om', 'esums'],
        cascadeHint: 'Records OEM approval; the fulfilment window toward parts/credit recovery arms.' },
      { action: 'deny', label: 'Deny claim', tone: 'oxide',
        path: '/api/esums/warranty-claims/:id/deny',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'om', 'esums'],
        cascadeHint: 'Records OEM denial; the claimant may dispute, and safety-severity denials cross the regulator inbox.',
        fields: [
          { key: 'denial_reason', label: 'Denial reason', type: 'string', required: true,
            placeholder: 'e.g. damage outside warranty scope' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'in_flight', label: 'In flight', statuses: ['opened', 'triaged', 'submitted', 'acknowledged', 'under_review'] },
      { key: 'approved', label: 'Approved', statuses: ['approved', 'fulfilled'] },
      { key: 'contested', label: 'Contested', statuses: ['denied', 'disputed'] },
      { key: 'closed', label: 'Closed', statuses: ['closed'] },
    ],
    kpis: [
      { key: 'total', label: 'Claims', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'recovery', label: 'Recovery value', compute: 'sum_quantum' },
    ],
  },

  // W16 — O&M work-order dispatch (12-state field workflow; critical-only
  // regulator crossings; the one om_-prefixed chain table). Non-standard
  // columns: `chain_status` (ALTER-added by mig 122; plain `status` is the
  // legacy pre-chain column) + `sla_deadline` (mig 058). om_wo_events keys its
  // timeline on occurred_at, not created_at — the Thread route orders by
  // created_at, so eventsTable stays null until that's reconciled.
  {
    key: 'om_work_order', wave: 16, table: 'om_work_orders',
    title: 'Work order', refCol: 'wo_number', titleCol: 'title',
    quantumCol: 'total_cost_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline',
    terminal: ['closed', 'cancelled'],
    counterpartyCol: null, // assigned_to is a technician id, not a contractual counterparty
    lanes: { support: 'field_operations' },
    eventsTable: null, eventsFk: null,
    actions: [
      { action: 'assign', label: 'Assign technician',
        path: '/api/esums/wo-chain/:id/assign',
        roles: ['admin', 'support', 'om', 'esums', 'esco'],
        cascadeHint: 'Assigns the work order to a technician; the response SLA clock starts.' },
      { action: 'verify', label: 'Verify completion', tone: 'primary',
        path: '/api/esums/wo-chain/:id/verify',
        roles: ['admin', 'support', 'om', 'esums', 'esco'],
        cascadeHint: 'Verifies completed work against the reported fault; closure follows.' },
      { action: 'cancel', label: 'Cancel work order', tone: 'oxide',
        path: '/api/esums/wo-chain/:id/cancel',
        roles: ['admin', 'support', 'om', 'esums', 'esco'],
        cascadeHint: 'Cancels the dispatch; the underlying fault stays open for re-dispatch.' },
    ],
    filters: [
      { key: 'unassigned', label: 'Unassigned', statuses: ['created'] },
      { key: 'in_field', label: 'In field', statuses: ['assigned', 'acknowledged', 'en_route', 'on_site', 'diagnosing', 'repairing', 'testing'] },
      { key: 'completed', label: 'Completed', statuses: ['completed', 'verified'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Work orders', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'cost', label: 'Total cost', compute: 'sum_quantum' },
    ],
  },

  // W41 — ITIL problem management (ITIL 4 + ISO 20000-1; SINGLE-PARTY — the
  // support problem-management function owns the whole record)
  {
    key: 'problem_record', wave: 41, table: 'oe_problem_records',
    title: 'Problem record', refCol: 'problem_number', titleCol: 'service_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'escalated', 'cancelled'],
    counterpartyCol: null, // single-party desk record; no contractual counterparty column
    lanes: { support: 'itil_service_mgmt' },
    eventsTable: 'oe_problem_records_events', eventsFk: 'problem_id',
    actions: [
      { action: 'categorize', label: 'Categorize problem',
        path: '/api/problem-management/chain/:id/categorize',
        roles: ['admin', 'support'],
        cascadeHint: 'Categorizes and prioritizes the raised problem; the investigation SLA clock starts.',
        fields: [
          { key: 'problem_category', label: 'Problem category', type: 'string', placeholder: 'e.g. inverter firmware' },
          { key: 'problem_summary', label: 'Problem summary', type: 'string' },
        ],
      },
      { action: 'begin-investigation', label: 'Begin investigation',
        path: '/api/problem-management/chain/:id/begin-investigation',
        roles: ['admin', 'support'],
        cascadeHint: 'Opens the root-cause investigation on the categorized problem.',
        fields: [
          { key: 'investigation_basis', label: 'Investigation basis', type: 'evidence' },
        ],
      },
      { action: 'identify-rca', label: 'Identify root cause',
        path: '/api/problem-management/chain/:id/identify-rca',
        roles: ['admin', 'support'],
        cascadeHint: 'Records the identified root cause; known-error logging and fix proposal follow.',
        fields: [
          { key: 'rca_basis', label: 'Root-cause basis', type: 'evidence' },
        ],
      },
      { action: 'raise-change', label: 'Raise change (RFC)', tone: 'primary',
        path: '/api/problem-management/chain/:id/raise-change',
        roles: ['admin', 'support'],
        cascadeHint: 'Hands the proposed fix to the W47 change-enablement chain as a linked RFC.',
        fields: [
          { key: 'change_basis', label: 'Change basis', type: 'evidence' },
          { key: 'change_request_ref', label: 'Linked RFC reference', type: 'string', placeholder: 'W47 change number' },
        ],
      },
      { action: 'escalate', label: 'Escalate', tone: 'oxide',
        path: '/api/problem-management/chain/:id/escalate',
        roles: ['admin', 'support'],
        cascadeHint: 'Escalates a major problem out of the desk; crosses the regulator queue for major problems only.',
        fields: [
          { key: 'reason_code', label: 'Escalation reason', type: 'string', placeholder: 'why this problem escalates' },
          { key: 'major_problem_ref', label: 'Major-problem reference', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
          { key: 'closure_notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'open_desk', label: 'On the desk', statuses: ['problem_logged', 'categorized', 'investigating', 'rca_identified', 'known_error', 'fix_proposed'] },
      { key: 'in_change', label: 'In change', statuses: ['change_raised', 'fix_deployed', 'resolution_verified'] },
      { key: 'escalated', label: 'Escalated', statuses: ['escalated'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Problems', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W47 — ITIL change enablement / RFC lifecycle (CAB/ECAB; receives W41
  // raise_change handoff; URGENT SLA — emergency class tightest; SINGLE-PARTY)
  {
    key: 'change_request', wave: 47, table: 'oe_change_requests',
    title: 'Change request (RFC)', refCol: 'change_number', titleCol: 'service_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'rejected', 'rolled_back', 'cancelled'],
    counterpartyCol: null, // single-party desk record; no contractual counterparty column
    lanes: { support: 'itil_service_mgmt' },
    eventsTable: 'oe_change_requests_events', eventsFk: 'change_id',
    actions: [
      { action: 'assess', label: 'Assess change',
        path: '/api/change-enablement/chain/:id/assess',
        roles: ['admin', 'support'],
        cascadeHint: 'Completes the risk/impact assessment on the requested change ahead of CAB review.',
        fields: [
          { key: 'assessment_basis', label: 'Assessment basis', type: 'evidence' },
          { key: 'change_category', label: 'Change category', type: 'string', placeholder: 'e.g. standard / normal / emergency' },
          { key: 'change_summary', label: 'Change summary', type: 'string' },
          { key: 'affected_ci_count', label: 'Affected CI count', type: 'number' },
        ],
      },
      { action: 'submit-to-cab', label: 'Submit to CAB',
        path: '/api/change-enablement/chain/:id/submit-to-cab',
        roles: ['admin', 'support'],
        cascadeHint: 'Puts the assessed RFC in front of the Change Advisory Board.',
        fields: [
          { key: 'cab_basis', label: 'CAB basis', type: 'evidence' },
          { key: 'cab_ref', label: 'CAB reference', type: 'string' },
        ],
      },
      { action: 'approve', label: 'Approve change', tone: 'primary',
        path: '/api/change-enablement/chain/:id/approve',
        roles: ['admin', 'support'],
        cascadeHint: 'CAB approves the RFC; scheduling and implementation follow.',
        fields: [
          { key: 'approval_basis', label: 'Approval basis', type: 'evidence' },
          { key: 'cab_ref', label: 'CAB reference', type: 'string' },
        ],
      },
      { action: 'emergency-approve', label: 'Emergency approve (ECAB)',
        path: '/api/change-enablement/chain/:id/emergency-approve',
        roles: ['admin', 'support'],
        cascadeHint: 'ECAB fast-path approval for an emergency change; crosses the regulator queue for the emergency class.',
        fields: [
          { key: 'approval_basis', label: 'Approval basis', type: 'evidence' },
          { key: 'cab_ref', label: 'CAB / ECAB reference', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
        ],
      },
      { action: 'roll-back', label: 'Roll back', tone: 'oxide',
        path: '/api/change-enablement/chain/:id/roll-back',
        roles: ['admin', 'support'],
        cascadeHint: 'Backs out a failed implementation to the rolled_back terminal; crosses the regulator queue for emergency and normal classes.',
        fields: [
          { key: 'reason_code', label: 'Roll-back reason', type: 'string', placeholder: 'why the implementation was backed out' },
          { key: 'rollback_basis', label: 'Roll-back basis', type: 'evidence' },
          { key: 'rollback_ref', label: 'Roll-back reference', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
          { key: 'closure_notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'pre_cab', label: 'Pre-CAB', statuses: ['change_requested', 'assessment', 'cab_review'] },
      { key: 'in_flight', label: 'In flight', statuses: ['approved', 'scheduled', 'implementing', 'implemented', 'pir'] },
      { key: 'rejected', label: 'Rejected / rolled back', statuses: ['rejected', 'rolled_back'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Change requests', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W55 — OT firmware/security-patch & vulnerability remediation (CVSS-tiered;
  // URGENT SLA — critical tightest; SINGLE-PARTY support security desk)
  {
    key: 'security_remediation', wave: 55, table: 'oe_security_remediations',
    title: 'Security remediation', refCol: 'remediation_number', titleCol: 'cve_id',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['resolved', 'not_affected', 'risk_accepted', 'rolled_back'],
    counterpartyCol: null, // single-party desk record; no contractual counterparty column
    lanes: { support: 'oem_supply_chain' },
    eventsTable: 'oe_security_remediations_events', eventsFk: 'remediation_id',
    actions: [
      { action: 'triage', label: 'Triage vulnerability',
        path: '/api/security-remediation/chain/:id/triage',
        roles: ['admin', 'support'],
        cascadeHint: 'Triages the advisory and re-derives the CVSS tier; the remediation SLA clock starts.',
        fields: [
          { key: 'triage_basis', label: 'Triage basis', type: 'evidence' },
          { key: 'cvss_score', label: 'CVSS base score', type: 'number', placeholder: '0.0 – 10.0' },
          { key: 'cvss_vector', label: 'CVSS vector', type: 'string' },
          { key: 'cve_id', label: 'CVE id', type: 'string' },
          { key: 'advisory_source', label: 'Advisory source', type: 'string' },
          { key: 'ci_type', label: 'CI type', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
        ],
      },
      { action: 'approve-remediation', label: 'Approve remediation',
        path: '/api/security-remediation/chain/:id/approve-remediation',
        roles: ['admin', 'support'],
        cascadeHint: 'Approves the tested patch plan for fleet rollout.',
        fields: [
          { key: 'approval_basis', label: 'Approval basis', type: 'evidence' },
          { key: 'patch_package_ref', label: 'Patch-package reference', type: 'string' },
          { key: 'backout_plan_ref', label: 'Backout-plan reference', type: 'string' },
          { key: 'fixed_version', label: 'Fixed version', type: 'string' },
        ],
      },
      { action: 'complete-rollout', label: 'Complete rollout', tone: 'primary',
        path: '/api/security-remediation/chain/:id/complete-rollout',
        roles: ['admin', 'support'],
        cascadeHint: 'Marks the fleet rollout complete; post-deployment verification follows.',
        fields: [
          { key: 'rollout_basis', label: 'Rollout basis', type: 'evidence' },
          { key: 'patched_ci_count', label: 'Patched CI count', type: 'number' },
        ],
      },
      { action: 'accept-risk', label: 'Accept risk', tone: 'oxide',
        path: '/api/security-remediation/chain/:id/accept-risk',
        roles: ['admin', 'support'],
        cascadeHint: 'Closes the vulnerability unpatched as accepted risk; crosses the regulator queue for critical and high tiers.',
        fields: [
          { key: 'residual_risk_basis', label: 'Residual-risk basis', type: 'evidence' },
          { key: 'risk_acceptance_basis', label: 'Risk-acceptance basis', type: 'evidence' },
          { key: 'compensating_control', label: 'Compensating control', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
        ],
      },
      { action: 'roll-back', label: 'Roll back patch', tone: 'oxide',
        path: '/api/security-remediation/chain/:id/roll-back',
        roles: ['admin', 'support'],
        cascadeHint: 'Backs out a failed patch to the rolled_back terminal; crosses the regulator queue for critical and high tiers.',
        fields: [
          { key: 'backout_basis', label: 'Backout basis', type: 'evidence' },
          { key: 'backout_ref', label: 'Backout reference', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'pre_approval', label: 'Pre-approval', statuses: ['advisory_received', 'triaged', 'impact_assessment', 'mitigation_applied', 'fleet_scoped'] },
      { key: 'rolling_out', label: 'Rolling out', statuses: ['remediation_approved', 'rollout_in_progress', 'verification'] },
      { key: 'resolved', label: 'Resolved', statuses: ['resolved', 'not_affected'] },
      { key: 'unpatched', label: 'Risk-accepted / rolled back', statuses: ['risk_accepted', 'rolled_back'] },
    ],
    kpis: [
      { key: 'total', label: 'Remediations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W63 — Warranty cost-recovery / supplier-recovery claim (commercial counterpart
  // of W15 RMA; MIXED SLA; SINGLE-PARTY support desk vs the OEM counterparty).
  // quantumCol is R millions (recovery amount), so attentionScore under-weights it.
  {
    key: 'warranty_recovery', wave: 63, table: 'oe_warranty_recoveries',
    title: 'Warranty recovery', refCol: 'case_number', titleCol: 'asset_name',
    quantumCol: 'recovery_zar_m', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['recovered', 'rejected', 'withdrawn', 'written_off'],
    counterpartyCol: 'oem_party_name',
    lanes: { support: 'oem_supply_chain', esco: 'supply_chain' },
    eventsTable: 'oe_warranty_recoveries_events', eventsFk: 'recovery_id',
    actions: [
      { action: 'submit-claim', label: 'Submit claim',
        path: '/api/warranty-recovery/chain/:id/submit-claim',
        roles: ['admin', 'support'],
        cascadeHint: 'Submits the cost-recovery claim to the OEM; the acknowledgement window opens.',
        fields: [
          { key: 'submission_basis', label: 'Submission basis', type: 'evidence' },
          { key: 'submission_ref', label: 'Submission reference', type: 'string' },
          { key: 'claimed_zar_m', label: 'Claimed amount (R millions)', type: 'number', unit: 'ZAR' },
          { key: 'recovery_zar_m', label: 'Expected recovery (R millions)', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'complete-assessment', label: 'Complete assessment',
        path: '/api/warranty-recovery/chain/:id/complete-assessment',
        roles: ['admin', 'support'],
        cascadeHint: 'Records the OEM defect assessment; crosses the regulator queue for every tier when the defect class is systemic (W63 signature).',
        fields: [
          { key: 'assessment_basis', label: 'Assessment basis', type: 'evidence' },
          { key: 'assessment_ref', label: 'Assessment reference', type: 'string' },
          { key: 'defect_class', label: 'Defect class', type: 'string', placeholder: 'e.g. systemic / isolated' },
          { key: 'defect_description', label: 'Defect description', type: 'string' },
          { key: 'failure_mode', label: 'Failure mode', type: 'string' },
          { key: 'units_affected', label: 'Units affected', type: 'number' },
          { key: 'fleet_size', label: 'Fleet size', type: 'number' },
          { key: 'recovery_zar_m', label: 'Recoverable amount (R millions)', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'approve-recovery', label: 'Approve recovery',
        path: '/api/warranty-recovery/chain/:id/approve-recovery',
        roles: ['admin', 'support'],
        cascadeHint: 'OEM accepts liability for the claim; recovery initiation follows.',
        fields: [
          { key: 'approval_basis', label: 'Approval basis', type: 'evidence' },
          { key: 'approval_ref', label: 'Approval reference', type: 'string' },
          { key: 'recovery_method', label: 'Recovery method', type: 'string', placeholder: 'e.g. credit note / parts / cash' },
          { key: 'recovery_zar_m', label: 'Approved recovery (R millions)', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'confirm-recovery', label: 'Confirm recovery', tone: 'primary',
        path: '/api/warranty-recovery/chain/:id/confirm-recovery',
        roles: ['admin', 'support'],
        cascadeHint: 'Confirms the recovered amount received — the happy-path recovered terminal.',
        fields: [
          { key: 'confirmation_ref', label: 'Confirmation reference', type: 'string' },
          { key: 'recovery_method', label: 'Recovery method', type: 'string' },
          { key: 'recovered_zar_m', label: 'Recovered amount (R millions)', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'write-off', label: 'Write off', tone: 'oxide',
        path: '/api/warranty-recovery/chain/:id/write-off',
        roles: ['admin', 'support'],
        cascadeHint: 'Abandons the claim as uncollectable to the written_off terminal.',
        fields: [
          { key: 'writeoff_basis', label: 'Write-off basis', type: 'evidence' },
          { key: 'writeoff_ref', label: 'Write-off reference', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'in_assessment', label: 'In assessment', statuses: ['claim_drafted', 'submitted_to_oem', 'oem_acknowledged', 'under_assessment', 'assessment_complete'] },
      { key: 'recovering', label: 'Recovering', statuses: ['approved', 'recovery_pending'] },
      { key: 'disputed', label: 'Disputed', statuses: ['disputed'] },
      { key: 'closed', label: 'Closed', statuses: ['recovered', 'rejected', 'withdrawn', 'written_off'] },
    ],
    kpis: [
      { key: 'total', label: 'Recovery claims', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'recovery', label: 'Recovery value', compute: 'sum_quantum' },
    ],
  },

  // W72 — Spare-parts provisioning & replenishment (VED criticality; predictive
  // demand from W71 RUL; URGENT SLA — bigger stockout impact tighter; SINGLE-PARTY)
  {
    key: 'spare_parts_provisioning', wave: 72, table: 'oe_spare_parts_provisioning',
    title: 'Spare-parts provisioning', refCol: 'line_number', titleCol: 'part_number',
    quantumCol: 'stockout_impact_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['issued', 'returned', 'cancelled'],
    counterpartyCol: 'supplier_party_name',
    lanes: { support: 'oem_supply_chain', esco: 'supply_chain' },
    eventsTable: 'oe_spare_parts_provisioning_events', eventsFk: 'provisioning_id',
    actions: [
      { action: 'raise-requisition', label: 'Raise requisition',
        path: '/api/spare-parts-provisioning/chain/:id/raise-requisition',
        roles: ['admin', 'support'],
        cascadeHint: 'Raises the parts requisition from demand; approval and PO issue follow.',
        fields: [
          { key: 'requisition_basis', label: 'Requisition basis', type: 'evidence' },
          { key: 'requisition_ref', label: 'Requisition reference', type: 'string' },
          { key: 'qty_required', label: 'Quantity required', type: 'number' },
        ],
      },
      { action: 'issue-po', label: 'Issue PO',
        path: '/api/spare-parts-provisioning/chain/:id/issue-po',
        roles: ['admin', 'support'],
        cascadeHint: 'Issues the purchase order to the supplier; the lead-time clock starts.',
        fields: [
          { key: 'po_basis', label: 'PO basis', type: 'evidence' },
          { key: 'po_ref', label: 'PO reference', type: 'string' },
          { key: 'qty_ordered', label: 'Quantity ordered', type: 'number' },
          { key: 'unit_cost_zar', label: 'Unit cost', type: 'number', unit: 'ZAR' },
          { key: 'supplier_party_id', label: 'Supplier party id', type: 'string' },
          { key: 'supplier_party_name', label: 'Supplier party name', type: 'string' },
        ],
      },
      { action: 'receive-goods', label: 'Receive goods',
        path: '/api/spare-parts-provisioning/chain/:id/receive-goods',
        roles: ['admin', 'support'],
        cascadeHint: 'Books the delivery in at the warehouse; the QA inspection gate opens.',
        fields: [
          { key: 'receipt_ref', label: 'Receipt reference', type: 'string' },
          { key: 'qty_received', label: 'Quantity received', type: 'number' },
        ],
      },
      { action: 'issue-part', label: 'Issue part', tone: 'primary',
        path: '/api/spare-parts-provisioning/chain/:id/issue-part',
        roles: ['admin', 'support'],
        cascadeHint: 'Issues the reserved part to the work order — the happy-path issued terminal.',
        fields: [
          { key: 'issue_basis', label: 'Issue basis', type: 'evidence' },
          { key: 'issue_ref', label: 'Issue reference', type: 'string' },
        ],
      },
      { action: 'cancel-provisioning', label: 'Cancel provisioning', tone: 'oxide',
        path: '/api/spare-parts-provisioning/chain/:id/cancel-provisioning',
        roles: ['admin', 'support'],
        cascadeHint: 'Cancels the provisioning line; crosses the regulator queue for vital parts at high or catastrophic stockout impact.',
        fields: [
          { key: 'cancellation_basis', label: 'Cancellation basis', type: 'evidence' },
          { key: 'cancellation_ref', label: 'Cancellation reference', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'procuring', label: 'Procuring', statuses: ['demand_identified', 'requisition_raised', 'requisition_approved', 'po_issued', 'backordered'] },
      { key: 'inbound', label: 'Inbound', statuses: ['in_transit', 'received'] },
      { key: 'on_hand', label: 'On hand', statuses: ['stocked', 'reserved'] },
      { key: 'closed', label: 'Closed', statuses: ['issued', 'returned', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'Provisioning lines', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'stockout', label: 'Stockout exposure', compute: 'sum_quantum' },
    ],
  },

  // ── ESUMS / ESCO (O&M operator family) ──────────────────────────────────────

  // W12 — Site commissioning onboarding (9-state planned → in_om on om_sites;
  // participant drives the forward chain; mark-failed/decommission are
  // regulator-desk writes; commissioning_failed crosses the regulator inbox).
  // Non-standard columns: `commissioning_status` + `commissioning_due_at`,
  // added by per-column ALTERs in mig 114.
  {
    key: 'site_commissioning', wave: 12, table: 'om_sites',
    title: 'Site commissioning', refCol: 'id', titleCol: 'name',
    quantumCol: null, statusCol: 'commissioning_status',
    deadlineCol: 'commissioning_due_at',
    terminal: ['in_om', 'commissioning_failed', 'decommissioned'],
    counterpartyCol: null, // the operator's own site record; no contractual counterparty column
    lanes: { support: 'field_operations' },
    eventsTable: 'oe_site_commissioning_events', eventsFk: 'site_id',
    actions: [
      { action: 'energise', label: 'Energise site',
        path: '/api/esums/commissioning/:id/energise',
        roles: ['admin', 'support', 'ipp', 'ipp_developer'],
        cascadeHint: 'Records site energisation and flips construction sites operational; the O&M handover window arms.',
        fields: [
          { key: 'evidence_r2_key', label: 'Evidence / energisation record', type: 'evidence' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'handover-om', label: 'Hand over to O&M', tone: 'primary',
        path: '/api/esums/commissioning/:id/handover-om',
        roles: ['admin', 'support', 'ipp', 'ipp_developer'],
        cascadeHint: 'Completes onboarding into steady-state O&M; the commissioning chain closes in_om.',
        fields: [
          { key: 'evidence_r2_key', label: 'Evidence / handover record', type: 'evidence' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'mark-failed', label: 'Mark failed', tone: 'oxide',
        path: '/api/esums/commissioning/:id/mark-failed',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Records commissioning failure; crosses the regulator inbox — owner and regulator both see the failed onboarding.',
        fields: [
          { key: 'reason', label: 'Failure reason', type: 'string', required: true,
            placeholder: 'Why commissioning failed' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'onboarding', label: 'Onboarding', statuses: ['planned', 'site_registered', 'devices_registered', 'ingestion_wired'] },
      { key: 'energising', label: 'Energising', statuses: ['first_telemetry_ok', 'energised'] },
      { key: 'operational', label: 'Operational', statuses: ['in_om'] },
      { key: 'closed', label: 'Failed / decommissioned', statuses: ['commissioning_failed', 'decommissioned'] },
    ],
    kpis: [
      { key: 'total', label: 'Sites', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W71 — Predictive asset health & prognostics (anomaly ensemble + RUL +
  // fault fingerprinting; POST /compute is the predictive brain; revenue-
  // weighted tiers). Non-standard columns: plain `status` + `sla_deadline`
  // (mig 232). No human ref column; asset_label identifies the prediction.
  {
    key: 'asset_prognostic', wave: 71, table: 'oe_asset_prognostics',
    title: 'Asset prognostic', refCol: 'id', titleCol: 'asset_label',
    quantumCol: 'revenue_at_risk_zar', statusCol: 'status',
    deadlineCol: 'sla_deadline',
    terminal: ['resolved', 'dismissed', 'auto_suppressed', 'expired', 'confirmed_failure'],
    counterpartyCol: null, // operator-side prediction record; no contractual counterparty column
    lanes: { support: 'field_operations' },
    eventsTable: 'oe_asset_prognostics_events', eventsFk: 'prognostic_id',
    actions: [
      { action: 'triage-prediction', label: 'Triage prediction',
        path: '/api/asset-prognostics/chain/:id/triage-prediction',
        roles: ['admin', 'support', 'esco'],
        cascadeHint: 'Confirms the prediction as actionable; the diagnosis SLA arms on the revenue-weighted tier.',
        fields: [
          { key: 'fault_mode', label: 'Fault mode', type: 'string', placeholder: 'e.g. bearing wear / IGBT degradation' },
          { key: 'fault_mode_confidence', label: 'Fault-mode confidence (0–1)', type: 'number' },
          { key: 'revenue_at_risk_zar', label: 'Revenue at risk', type: 'number', unit: 'ZAR' },
          { key: 'safety_implicated', label: 'Safety implicated', type: 'boolean' },
          { key: 'predicted_failure_at', label: 'Predicted failure date', type: 'date' },
          { key: 'assigned_to', label: 'Assigned to', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'raise-work-order', label: 'Raise work order', tone: 'primary',
        path: '/api/asset-prognostics/chain/:id/raise-work-order',
        roles: ['admin', 'support', 'esco'],
        cascadeHint: 'Hands the planned intervention to the W16 work-order dispatch chain as a linked WO.',
        fields: [
          { key: 'work_order_id', label: 'Linked work-order id', type: 'string' },
          { key: 'assigned_to', label: 'Assigned to', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'record-failure', label: 'Record failure', tone: 'oxide',
        path: '/api/asset-prognostics/chain/:id/record-failure',
        roles: ['admin', 'support', 'esco'],
        cascadeHint: 'Records that the predicted failure occurred; crosses the regulator queue for safety/high tiers and closes confirmed_failure.',
        fields: [
          { key: 'fault_mode', label: 'Confirmed fault mode', type: 'string' },
          { key: 'revenue_at_risk_zar', label: 'Revenue at risk', type: 'number', unit: 'ZAR' },
          { key: 'safety_implicated', label: 'Safety implicated', type: 'boolean' },
          { key: 'predicted_failure_at', label: 'Failure date', type: 'date' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'open', label: 'Open', statuses: ['predicted', 'triaged', 'diagnosed', 'action_planned'] },
      { key: 'in_flight', label: 'In flight', statuses: ['wo_raised', 'monitoring', 'escalated'] },
      { key: 'resolved', label: 'Resolved', statuses: ['resolved', 'dismissed', 'auto_suppressed', 'expired'] },
      { key: 'failed', label: 'Confirmed failure', statuses: ['confirmed_failure'] },
    ],
    kpis: [
      { key: 'total', label: 'Predictions', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'at_risk', label: 'Revenue at risk', compute: 'sum_quantum' },
    ],
  },

  // W24 — Sustained PR underperformance (IEC 61724 performance-ratio chain;
  // MIXED tier SLA; operator-side O&M write). No launchpad feature carries this
  // chainKey yet — surfaced via the Horizon lane only.
  {
    key: 'pr_underperformance', wave: 24, table: 'oe_pr_chain',
    title: 'PR underperformance', refCol: 'case_number', titleCol: 'site_name',
    quantumCol: 'revenue_loss_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed'],
    counterpartyCol: null, // operator-recorded fleet case; no contractual counterparty column
    // esco lane intentionally absent: pr-chain READ_ROLES (src/routes/pr-chain.ts)
    // exclude esco — the route would 403 it. support has READ + WRITE.
    lanes: { support: 'field_operations' },
    eventsTable: 'oe_pr_chain_events', eventsFk: 'case_id',
    actions: [
      { action: 'start-warning', label: 'Start warning',
        path: '/api/esums/pr-chain/:id/start-warning',
        roles: ['admin', 'support', 'esums', 'esums_om', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Opens the sustained-PR warning window; the investigation SLA clock starts.' },
      { action: 'begin-investigation', label: 'Begin investigation',
        path: '/api/esums/pr-chain/:id/begin-investigation',
        roles: ['admin', 'support', 'esums', 'esums_om', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Opens the root-cause investigation on the underperforming site.' },
      { action: 'dispatch-intervention', label: 'Dispatch intervention',
        path: '/api/esums/pr-chain/:id/dispatch-intervention',
        roles: ['admin', 'support', 'esums', 'esums_om', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Dispatches the corrective O&M intervention against the identified root cause.',
        fields: [
          { key: 'linked_wo_id', label: 'Linked work-order id', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'verify-recovery', label: 'Verify recovery', tone: 'primary',
        path: '/api/esums/pr-chain/:id/verify-recovery',
        roles: ['admin', 'support', 'esums', 'esums_om', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Verifies the PR has recovered above threshold; closure follows.',
        fields: [
          { key: 'observed_pr', label: 'Observed PR', type: 'number' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'escalate', label: 'Escalate', tone: 'oxide',
        path: '/api/esums/pr-chain/:id/escalate',
        roles: ['admin', 'support', 'esums', 'esums_om', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Escalates a non-recovering case out of routine O&M handling.',
        fields: [
          { key: 'linked_warranty_claim_id', label: 'Linked warranty-claim id', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'monitoring', label: 'Monitoring', statuses: ['monitoring', 'warning'] },
      { key: 'investigating', label: 'Investigating', statuses: ['investigating', 'intervention_planned', 'intervention_executing'] },
      { key: 'escalated', label: 'Escalated', statuses: ['escalated'] },
      { key: 'resolved', label: 'Resolved', statuses: ['verified', 'closed', 'false_alarm'] },
    ],
    kpis: [
      { key: 'total', label: 'Cases', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'loss', label: 'Revenue loss', compute: 'sum_quantum' },
    ],
  },

  // W25 — HSE / SHEQ incident (OHSA s24 + NEMA s30; CROSS-ROLE — Esums O&M and
  // IPP both write; authority notification is the regulatory crossing)
  {
    key: 'hse_incident', wave: 25, table: 'oe_hse_incidents',
    title: 'HSE incident', refCol: 'case_number', titleCol: 'site_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed'],
    counterpartyCol: null, // site-incident record; no contractual counterparty column
    lanes: { esco: 'safety', ipp_developer: 'safety_grid', epc_contractor: 'safety' },
    eventsTable: 'oe_hse_incident_events', eventsFk: 'incident_id',
    actions: [
      { action: 'triage', label: 'Triage incident',
        path: '/api/hse/incident-chain/:id/triage',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Classifies severity and statutory reportability; the OHSA s24 notification clock starts.' },
      { action: 'notify-authority', label: 'Notify authority',
        path: '/api/hse/incident-chain/:id/notify-authority',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Records the statutory OHSA s24 / NEMA s30 authority notification — the regulator crossing for reportable incidents.',
        fields: [
          { key: 'authority', label: 'Authority notified', type: 'string', placeholder: 'e.g. DEL / DFFE' },
          { key: 'authority_ref', label: 'Authority reference', type: 'evidence' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'begin-investigation', label: 'Begin investigation',
        path: '/api/hse/incident-chain/:id/begin-investigation',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Opens the incident investigation and root-cause analysis.' },
      { action: 'dispatch-corrective', label: 'Dispatch corrective',
        path: '/api/hse/incident-chain/:id/dispatch-corrective',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Dispatches corrective actions against the identified root cause.',
        fields: [
          { key: 'linked_wo_id', label: 'Linked work-order id', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'close', label: 'Close incident', tone: 'primary',
        path: '/api/hse/incident-chain/:id/close',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Closes the incident after verified corrective actions and the evidence chain.',
        fields: [
          { key: 'closure_notes', label: 'Closure notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'open', label: 'Open', statuses: ['reported', 'triaged'] },
      { key: 'investigating', label: 'Investigating', statuses: ['notified_authority', 'investigating'] },
      { key: 'corrective', label: 'Corrective', statuses: ['corrective_actions_planned', 'corrective_actions_executing', 'escalated'] },
      { key: 'closed', label: 'Closed', statuses: ['verified', 'closed', 'false_alarm'] },
    ],
    kpis: [
      { key: 'total', label: 'Incidents', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W35 — Vendor / supplier-defect escalation (CPA §56/§61 + NRCS recall;
  // URGENT SLA — safety_recall tightest; operator records every party's action,
  // contractual party captured via actor_party)
  {
    key: 'vendor_escalation', wave: 35, table: 'oe_vendor_escalation',
    title: 'Vendor escalation', refCol: 'case_number', titleCol: 'component_type',
    quantumCol: 'claim_value_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'recall_issued', 'arbitration', 'withdrawn'],
    counterpartyCol: 'vendor_party_name',
    lanes: { esco: 'supply_chain' },
    eventsTable: 'oe_vendor_escalation_events', eventsFk: 'escalation_id',
    actions: [
      { action: 'triage', label: 'Vendor triage',
        path: '/api/esums/vendor-escalation/chain/:id/triage',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Vendor triages the filed defect escalation; the decision SLA clock starts.',
        fields: [
          { key: 'vendor_party_id', label: 'Vendor party id', type: 'string' },
          { key: 'vendor_party_name', label: 'Vendor party name', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'vendor-decide', label: 'Record vendor decision',
        path: '/api/esums/vendor-escalation/chain/:id/vendor-decide',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Records whether the vendor accepts liability or the case escalates to the OEM.',
        fields: [
          { key: 'liability_accepted', label: 'Liability accepted', type: 'boolean' },
          { key: 'vendor_decision_ref', label: 'Vendor decision reference', type: 'evidence' },
          { key: 'vendor_decision_basis', label: 'Vendor decision basis', type: 'evidence' },
          { key: 'claim_value_zar', label: 'Claim value', type: 'number', unit: 'ZAR' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'escalate-to-oem', label: 'Escalate to OEM',
        path: '/api/esums/vendor-escalation/chain/:id/escalate-to-oem',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Escalates the defect past the vendor to the manufacturer for field investigation.',
        fields: [
          { key: 'oem_party_id', label: 'OEM party id', type: 'string' },
          { key: 'oem_party_name', label: 'OEM party name', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'oem-decide', label: 'Record OEM decision',
        path: '/api/esums/vendor-escalation/chain/:id/oem-decide',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Records the OEM liability decision; remediation or recall follows.',
        fields: [
          { key: 'liability_accepted', label: 'Liability accepted', type: 'boolean' },
          { key: 'oem_decision_ref', label: 'OEM decision reference', type: 'evidence' },
          { key: 'oem_decision_basis', label: 'OEM decision basis', type: 'evidence' },
          { key: 'remedy_type', label: 'Remedy type', type: 'string', placeholder: 'e.g. repair / replace / credit' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'issue-recall', label: 'Issue recall', tone: 'oxide',
        path: '/api/esums/vendor-escalation/chain/:id/issue-recall',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Issues the NRCS safety recall — the safety-defect terminal that crosses the regulator queue.',
        fields: [
          { key: 'recall_ref', label: 'Recall reference', type: 'evidence' },
          { key: 'recall_basis', label: 'Recall basis', type: 'evidence' },
          { key: 'remedy_cost_zar', label: 'Remedy cost', type: 'number', unit: 'ZAR' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'vendor', label: 'With vendor', statuses: ['filed', 'vendor_triage', 'vendor_decision'] },
      { key: 'oem', label: 'With OEM', statuses: ['escalated_to_oem', 'oem_field_investigation', 'oem_decision'] },
      { key: 'remediation', label: 'Remediation', statuses: ['remediation'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'recall_issued', 'arbitration', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Escalations', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'claim', label: 'Claim value', compute: 'sum_quantum' },
    ],
  },

  // W51 — O&M availability guarantee & liquidated damages (IEC 61724; time-based
  // uptime counterpart of W24 PR; URGENT SLA; operator vs O&M contractor)
  {
    key: 'availability_guarantee', wave: 51, table: 'oe_availability_guarantees',
    title: 'Availability guarantee', refCol: 'case_number', titleCol: 'site_name',
    quantumCol: 'ld_assessed_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['settled', 'dispute_resolved', 'withdrawn'],
    counterpartyCol: 'contractor_party_name',
    lanes: { esco: 'asset_health' },
    eventsTable: 'oe_availability_guarantee_events', eventsFk: 'guarantee_id',
    actions: [
      { action: 'submit-measurement', label: 'Submit measurement',
        path: '/api/availability-guarantee/chain/:id/submit-measurement',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Submits the measured period availability for reconciliation against the guarantee.',
        fields: [
          { key: 'measurement_ref', label: 'Measurement reference', type: 'evidence' },
          { key: 'measured_availability_pct', label: 'Measured availability (%)', type: 'number' },
          { key: 'excused_downtime_hours', label: 'Excused downtime (hours)', type: 'number' },
          { key: 'measurement_basis', label: 'Measurement basis', type: 'evidence' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'flag-shortfall', label: 'Flag shortfall', tone: 'oxide',
        path: '/api/availability-guarantee/chain/:id/flag-shortfall',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Flags reconciled availability below the guaranteed floor; the LD assessment window opens.',
        fields: [
          { key: 'shortfall_pp', label: 'Shortfall (percentage points)', type: 'number' },
          { key: 'shortfall_tier', label: 'Shortfall tier', type: 'string', placeholder: 'e.g. minor / material / critical shortfall' },
          { key: 'shortfall_basis', label: 'Shortfall basis', type: 'evidence' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'assess-ld', label: 'Assess LDs',
        path: '/api/availability-guarantee/chain/:id/assess-ld',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Assesses the liquidated damages owed for the availability shortfall.',
        fields: [
          { key: 'ld_assessment_ref', label: 'LD assessment reference', type: 'evidence' },
          { key: 'ld_assessed_zar', label: 'LD assessed', type: 'number', unit: 'ZAR' },
          { key: 'ld_basis', label: 'LD basis', type: 'evidence' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'settle', label: 'Settle', tone: 'primary',
        path: '/api/availability-guarantee/chain/:id/settle',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Settles the assessed LDs to the settled terminal.',
        fields: [
          { key: 'settlement_ref', label: 'Settlement reference', type: 'evidence' },
          { key: 'settlement_basis', label: 'Settlement basis', type: 'evidence' },
          { key: 'settlement_zar', label: 'Settlement amount', type: 'number', unit: 'ZAR' },
          { key: 'bonus_zar', label: 'Bonus amount', type: 'number', unit: 'ZAR' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'waive-ld', label: 'Waive LDs',
        path: '/api/availability-guarantee/chain/:id/waive-ld',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Waives the assessed LDs by commercial agreement; the guarantee case still closes settled.',
        fields: [
          { key: 'settlement_ref', label: 'Settlement reference', type: 'evidence' },
          { key: 'settlement_basis', label: 'Settlement basis', type: 'evidence' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'measuring', label: 'Measuring', statuses: ['period_open', 'measurement_submitted', 'adjustment_review', 'reconciled'] },
      { key: 'meets', label: 'Meets guarantee', statuses: ['meets_guarantee'] },
      { key: 'shortfall', label: 'Shortfall', statuses: ['shortfall_flagged', 'ld_assessed', 'cure_period', 'disputed'] },
      { key: 'closed', label: 'Closed', statuses: ['settled', 'dispute_resolved', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Guarantees', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'ld', label: 'LD assessed', compute: 'sum_quantum' },
    ],
  },

  // W59 — Preventive-maintenance schedule compliance & deferral (IEC 62446 + RCM
  // tiers; PROACTIVE upstream of W51 + W24; URGENT SLA; cross-lane support + esco)
  {
    key: 'pm_compliance', wave: 59, table: 'oe_pm_compliance',
    title: 'PM compliance', refCol: 'case_number', titleCol: 'pm_title',
    quantumCol: 'estimated_cost_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'deferred', 'skipped', 'cancelled'],
    counterpartyCol: 'contractor_party_name',
    lanes: { support: 'field_operations', esco: 'work_orders' },
    eventsTable: 'oe_pm_compliance_events', eventsFk: 'pm_id',
    actions: [
      { action: 'assign-work', label: 'Assign work',
        path: '/api/pm-compliance/chain/:id/assign-work',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Assigns the due PM task to the contractor crew; the completion window opens.',
        fields: [
          { key: 'assignment_ref', label: 'Assignment reference', type: 'evidence' },
          { key: 'assignment_basis', label: 'Assignment basis', type: 'evidence' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'complete-work', label: 'Complete work',
        path: '/api/pm-compliance/chain/:id/complete-work',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Records the completed PM work with evidence; verification follows.',
        fields: [
          { key: 'completion_ref', label: 'Completion reference', type: 'evidence' },
          { key: 'completion_basis', label: 'Completion basis', type: 'evidence' },
          { key: 'checklist_total_items', label: 'Checklist total items', type: 'number' },
          { key: 'checklist_passed_items', label: 'Checklist passed items', type: 'number' },
          { key: 'labour_hours', label: 'Labour hours', type: 'number' },
          { key: 'actual_cost_zar', label: 'Actual cost', type: 'number', unit: 'ZAR' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'close-pm', label: 'Close PM', tone: 'primary',
        path: '/api/pm-compliance/chain/:id/close-pm',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Closes the verified PM task compliant — the happy-path terminal.',
        fields: [
          { key: 'verification_ref', label: 'Verification reference', type: 'evidence' },
          { key: 'verification_basis', label: 'Verification basis', type: 'evidence' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'approve-deferral', label: 'Approve deferral',
        path: '/api/pm-compliance/chain/:id/approve-deferral',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Approves the requested deferral with a re-baselined due date.',
        fields: [
          { key: 'deferred_to_date', label: 'Deferred to date', type: 'date' },
          { key: 'deferral_basis', label: 'Deferral basis', type: 'evidence' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'skip-pm', label: 'Skip PM', tone: 'oxide',
        path: '/api/pm-compliance/chain/:id/skip-pm',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Skips the PM task outright; crosses the regulator queue for critical and safety RCM tiers.',
        fields: [
          { key: 'skip_ref', label: 'Skip reference', type: 'evidence' },
          { key: 'skip_basis', label: 'Skip basis', type: 'evidence' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'scheduled', label: 'Scheduled', statuses: ['pm_scheduled', 'work_assigned'] },
      { key: 'in_progress', label: 'In progress', statuses: ['in_progress', 'on_hold', 'completed', 'verification_pending', 'rework_required'] },
      { key: 'deferral', label: 'Deferral requested', statuses: ['deferral_requested'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'deferred', 'skipped', 'cancelled'] },
    ],
    kpis: [
      { key: 'total', label: 'PM tasks', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'cost', label: 'Estimated cost', compute: 'sum_quantum' },
    ],
  },

  // W64 — Permit-to-work / LOTO control-of-work (OHSA + SANS 10142; gate upstream
  // of W16 WO dispatch + W59 PM; URGENT SLA; issuer vs permit holder)
  {
    key: 'permit_to_work', wave: 64, table: 'oe_permit_to_work',
    title: 'Permit to work', refCol: 'permit_number', titleCol: 'asset_name',
    quantumCol: null, statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['permit_closed', 'permit_rejected', 'permit_revoked', 'withdrawn'],
    counterpartyCol: 'holder_party_name',
    lanes: { esco: 'work_orders' },
    eventsTable: 'oe_permit_to_work_events', eventsFk: 'permit_id',
    actions: [
      { action: 'verify-isolation', label: 'Verify isolation',
        path: '/api/permit-to-work/chain/:id/verify-isolation',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Verifies the LOTO isolation in the field against the approved isolation plan.',
        fields: [
          { key: 'isolation_cert_ref', label: 'Isolation certificate reference', type: 'evidence' },
          { key: 'isolation_basis', label: 'Isolation basis', type: 'evidence' },
          { key: 'isolating_authority_name', label: 'Isolating authority', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'issue-permit', label: 'Issue permit',
        path: '/api/permit-to-work/chain/:id/issue-permit',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Issues the permit to the holder; crosses the regulator queue for every tier when the work is live-electrical or confined-space.',
        fields: [
          { key: 'permit_ref', label: 'Permit reference', type: 'evidence' },
          { key: 'issue_basis', label: 'Issue basis', type: 'evidence' },
          { key: 'permit_validity_hours', label: 'Permit validity (hours)', type: 'number' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'complete-work', label: 'Complete work',
        path: '/api/permit-to-work/chain/:id/complete-work',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Holder declares the permitted work complete; de-isolation and close-out follow.',
        fields: [
          { key: 'completion_ref', label: 'Completion reference', type: 'evidence' },
          { key: 'completion_basis', label: 'Completion basis', type: 'evidence' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'close-permit', label: 'Close permit', tone: 'primary',
        path: '/api/permit-to-work/chain/:id/close-permit',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Closes the permit after verified de-isolation — the happy-path terminal.',
        fields: [
          { key: 'closure_ref', label: 'Closure reference', type: 'evidence' },
          { key: 'closure_basis', label: 'Closure basis', type: 'evidence' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
      { action: 'revoke-permit', label: 'Revoke permit', tone: 'oxide',
        path: '/api/permit-to-work/chain/:id/revoke-permit',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Revokes a live permit on a safety breach; always crosses the regulator queue (W64 signature).',
        fields: [
          { key: 'revocation_ref', label: 'Revocation reference', type: 'evidence' },
          { key: 'revocation_basis', label: 'Revocation basis', type: 'evidence' },
          { key: 'regulator_ref', label: 'Regulator reference', type: 'string' },
          { key: 'reason_code', label: 'Reason code', type: 'string' },
          { key: 'notes', label: 'Notes', type: 'string' },
        ],
      },
    ],
    filters: [
      { key: 'pre_issue', label: 'Pre-issue', statuses: ['permit_requested', 'hazard_assessment', 'isolation_pending', 'isolation_confirmed'] },
      { key: 'live', label: 'Live', statuses: ['permit_issued', 'work_in_progress', 'suspended'] },
      { key: 'complete', label: 'Work complete', statuses: ['work_complete'] },
      { key: 'closed', label: 'Closed', statuses: ['permit_closed', 'permit_rejected', 'permit_revoked', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Permits', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // ───────── CONSTRUCTION QUALITY (EPC contractor surface) ─────────
  //
  // epc_contractor has a read-only grant on these chains (plus hse_incident
  // above); lanes key to its roleData domains (quality / site_setup / safety).
  // Write actions remain ipp/support-side.

  // W99 — Inspection & test plan (NERSA §C-5 + OHSA s24 + IEC 61508 hold-point
  // quality gate ahead of COD; URGENT SLA — safety/COD blockers tightest)
  {
    key: 'itp', wave: 99, table: 'oe_itp_inspection',
    title: 'Inspection & test plan', refCol: 'itp_number', titleCol: 'title',
    quantumCol: 'rework_cost_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['archived', 'rejected', 'withdrawn', 'voided'],
    counterpartyCol: 'contractor_name',
    lanes: { ipp_developer: 'risk_quality', epc_contractor: 'quality' },
    eventsTable: 'oe_itp_inspection_events', eventsFk: 'itp_id',
    actions: [
      { action: 'submit', label: 'Submit ITP',
        path: '/api/ipp/itp/chain/:id/submit',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Submits the drafted ITP for review; safety-critical test plans also cross the regulator queue.',
        fields: [
          { key: 'title', label: 'ITP title', type: 'string',
            placeholder: 'e.g. MV transformer insulation resistance test' },
          { key: 'construction_stage', label: 'Construction stage', type: 'string' },
          { key: 'narrative', label: 'Scope / narrative', type: 'evidence' },
          { key: 'hold_point_ref', label: 'Hold-point reference', type: 'evidence' },
          { key: 'drawing_ref', label: 'Drawing reference', type: 'evidence' },
          { key: 'specification_ref', label: 'Specification reference', type: 'evidence' },
          { key: 'acceptance_criteria', label: 'Acceptance criteria', type: 'evidence' },
        ],
      },
      { action: 'approve', label: 'Approve ITP',
        path: '/api/ipp/itp/chain/:id/approve',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Approves the ITP for release to site; plans gating commercial operation cross the regulator queue.',
        fields: [
          { key: 'inspection_cost_zar', label: 'Inspection cost', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'schedule-inspection', label: 'Schedule inspection',
        path: '/api/ipp/itp/chain/:id/schedule-inspection',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Books the hold-point inspection slot and notifies the witness parties.',
        fields: [
          { key: 'witness_party', label: 'Witness party', type: 'string',
            placeholder: 'e.g. independent engineer / NERSA witness' },
        ],
      },
      { action: 'record-result', label: 'Record result', tone: 'primary',
        path: '/api/ipp/itp/chain/:id/record-result',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Records the inspection outcome; a failed safety-critical or COD-gating test crosses the regulator queue.',
        fields: [
          { key: 'result_text', label: 'Result', type: 'evidence',
            placeholder: 'Inspection outcome — include "fail" to mark a failed result' },
          { key: 'photo_evidence_count', label: 'Photo evidence count', type: 'number' },
        ],
      },
      { action: 'reject', label: 'Reject ITP', tone: 'oxide',
        path: '/api/ipp/itp/chain/:id/reject',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Rejects the submitted plan back to the contractor; a fresh ITP must be drafted.',
        fields: [
          { key: 'rejected_reason', label: 'Rejection reason', type: 'string', required: true,
            placeholder: 'Why the ITP is rejected' },
        ],
      },
    ],
    filters: [
      { key: 'in_review', label: 'In review', statuses: ['submitted', 'under_review'] },
      { key: 'on_site', label: 'On site', statuses: ['approved', 'released_to_site', 'inspection_scheduled', 'in_inspection'] },
      { key: 'in_test', label: 'In test', statuses: ['witness_attended', 'result_recorded', 'failed', 'corrective_action'] },
      { key: 'passed', label: 'Passed / released', statuses: ['passed', 'released_for_use'] },
      { key: 'closed', label: 'Closed', statuses: ['archived', 'rejected', 'withdrawn', 'voided'] },
    ],
    kpis: [
      { key: 'total', label: 'ITPs', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'rework', label: 'Rework cost', compute: 'sum_quantum' },
    ],
  },

  // W98 — Punch list / COD snag handover (NERSA §C-5 + REIPPPP COD; URGENT SLA —
  // COD-blocking items tightest)
  {
    key: 'punch_list', wave: 98, table: 'oe_punch_list',
    title: 'Punch list item', refCol: 'punch_number', titleCol: 'title',
    quantumCol: 'remediation_cost_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'voided', 'withdrawn'],
    counterpartyCol: 'contractor_name',
    lanes: { ipp_developer: 'construction', epc_contractor: 'quality' },
    eventsTable: 'oe_punch_list_events', eventsFk: 'punch_id',
    actions: [
      { action: 'assess', label: 'Assess item',
        path: '/api/ipp/punch-list/chain/:id/assess',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Assesses the identified deficiency and confirms its severity and ownership.',
        fields: [
          { key: 'title', label: 'Item title', type: 'string',
            placeholder: 'e.g. Cable gland not torqued — inverter station 3' },
          { key: 'narrative', label: 'Description', type: 'evidence' },
          { key: 'identified_location', label: 'Location', type: 'string' },
          { key: 'identified_drawing_ref', label: 'Drawing reference', type: 'evidence' },
          { key: 'identified_specification_ref', label: 'Specification reference', type: 'evidence' },
        ],
      },
      { action: 'assign', label: 'Assign remediation',
        path: '/api/ipp/punch-list/chain/:id/assign',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Assigns the item to the responsible contractor crew; the remediation window opens.',
        fields: [
          { key: 'contractor_name', label: 'Contractor', type: 'string' },
          { key: 'remediation_cost_zar', label: 'Remediation cost', type: 'number', unit: 'ZAR' },
        ],
      },
      { action: 'request-reinspection', label: 'Request re-inspection',
        path: '/api/ipp/punch-list/chain/:id/request-reinspection',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Declares the remediation done and calls for re-inspection of the work.',
        fields: [
          { key: 'response_text', label: 'Remediation response', type: 'evidence' },
          { key: 'photo_evidence_count', label: 'Photo evidence count', type: 'number' },
        ],
      },
      { action: 'accept', label: 'Accept work',
        path: '/api/ipp/punch-list/chain/:id/accept',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Accepts the re-inspected work; life-safety items cross the regulator queue on acceptance.',
        fields: [
          { key: 'response_text', label: 'Acceptance note', type: 'evidence' },
        ],
      },
      { action: 'close', label: 'Close item', tone: 'primary',
        path: '/api/ipp/punch-list/chain/:id/close',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Closes the punch item; items blocking commercial operation or life-safety cross the regulator queue.' },
      { action: 'void', label: 'Void item', tone: 'oxide',
        path: '/api/ipp/punch-list/chain/:id/void',
        roles: ['admin', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Voids the item as raised in error; handover-blocking and life-safety voids cross the regulator queue.',
        fields: [
          { key: 'voided_reason', label: 'Void reason', type: 'string', required: true,
            placeholder: 'Why the item is voided' },
        ],
      },
    ],
    filters: [
      { key: 'open', label: 'Open', statuses: ['identified', 'assessed', 'assigned'] },
      { key: 'in_remediation', label: 'In remediation', statuses: ['in_remediation', 'reinspect_requested', 'reinspected'] },
      { key: 'on_hold', label: 'On hold', statuses: ['on_hold'] },
      { key: 'accepted', label: 'Accepted', statuses: ['accepted'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'voided', 'withdrawn'] },
    ],
    kpis: [
      { key: 'total', label: 'Punch items', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'remediation', label: 'Remediation cost', compute: 'sum_quantum' },
    ],
  },

  // W136 — Non-conformance report (ISO 9001 §8.7 + REIPPPP quality; URGENT SLA —
  // safety-critical tightest)
  {
    key: 'ncr', wave: 136, table: 'oe_ipp_ncrs',
    title: 'Non-conformance report', refCol: 'ncr_number', titleCol: 'project_name',
    quantumCol: 'rework_cost_zar', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['closed', 'accepted_as_is', 'rejected_escalated', 'voided'],
    counterpartyCol: null, // no contractual counterparty column in oe_ipp_ncrs DDL (mig 362)
    // ipp_developer roleData has an 'ncr' feature in risk_quality (no chainKey
    // wired yet); lane key mirrors that domain.
    lanes: { ipp_developer: 'risk_quality', epc_contractor: 'quality' },
    eventsTable: 'oe_ipp_ncr_events', eventsFk: 'ncr_id',
    actions: [
      { action: 'acknowledge_ncr', label: 'Acknowledge NCR',
        path: '/api/ipp-ncr/:id/acknowledge_ncr',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Acknowledges the raised non-conformance; the investigation clock starts.' },
      { action: 'start_investigation', label: 'Start investigation',
        path: '/api/ipp-ncr/:id/start_investigation',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Opens the root-cause investigation into the defect.',
        fields: [
          { key: 'rca_method', label: 'Root-cause method', type: 'string',
            placeholder: 'e.g. 5-Why, fishbone, fault-tree' },
          { key: 'root_cause', label: 'Root cause', type: 'evidence' },
        ],
      },
      { action: 'propose_disposition', label: 'Propose disposition',
        path: '/api/ipp-ncr/:id/propose_disposition',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Proposes how the defect is dealt with — rework, repair, replace, scrap or accept as-is.',
        fields: [
          { key: 'disposition', label: 'Disposition', type: 'string',
            placeholder: 'rework / repair / replace / scrap / accept as-is' },
          { key: 'disposition_justification', label: 'Justification', type: 'evidence' },
          { key: 'rework_scope', label: 'Rework scope', type: 'evidence' },
          { key: 'rework_cost_zar', label: 'Rework cost', type: 'number', unit: 'ZAR' },
          { key: 'schedule_impact_days', label: 'Schedule impact (days)', type: 'number' },
        ],
      },
      { action: 'review_disposition', label: 'Review disposition',
        path: '/api/ipp-ncr/:id/review_disposition',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Reviews the proposed disposition; rework, acceptance as-is or escalation follows.',
        fields: [
          { key: 'ie_comments', label: 'IE comments', type: 'evidence' },
        ],
      },
      { action: 'close_ncr', label: 'Close NCR', tone: 'primary',
        path: '/api/ipp-ncr/:id/close_ncr',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Closes the NCR once corrective and preventive actions are planned and verified.',
        fields: [
          { key: 'corrective_action', label: 'Corrective action', type: 'evidence' },
          { key: 'preventive_action', label: 'Preventive action', type: 'evidence' },
          { key: 'closure_notes', label: 'Closure notes', type: 'evidence' },
        ],
      },
      { action: 'reject_escalate', label: 'Reject & escalate', tone: 'oxide',
        path: '/api/ipp-ncr/:id/reject_escalate',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Rejects the disposition and escalates; every escalated NCR crosses the regulator queue.',
        fields: [
          { key: 'reason_code', label: 'Escalation reason', type: 'string',
            placeholder: 'Why the disposition is rejected and escalated' },
        ],
      },
    ],
    filters: [
      { key: 'open', label: 'Open', statuses: ['raised', 'acknowledged', 'under_investigation'] },
      { key: 'disposition', label: 'Disposition', statuses: ['disposition_proposed', 'disposition_reviewed'] },
      { key: 'rework', label: 'Rework / re-inspection', statuses: ['rework_in_progress', 'reinspection', 'corrective_action_planned'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'accepted_as_is'] },
      { key: 'escalated', label: 'Escalated / voided', statuses: ['rejected_escalated', 'voided'] },
    ],
    kpis: [
      { key: 'total', label: 'NCRs', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
      { key: 'rework', label: 'Rework cost', compute: 'sum_quantum' },
    ],
  },

  // W137 — Method statement / SWMS (OHSA Construction Regs 2014 Reg.7; planning
  // companion to W64 permit-to-work; URGENT SLA — high-risk work tightest)
  {
    key: 'ipp_method_statement', wave: 137, table: 'oe_ipp_method_statements',
    title: 'Method statement', refCol: 'ms_number', titleCol: 'ms_title',
    quantumCol: null, // no ZAR-denominated column in oe_ipp_method_statements DDL (mig 364)
    statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['rejected', 'superseded', 'archived'], // spec HARD_TERMINALS; 'closed' stays visible pending archive_ms
    counterpartyCol: null, // planning document; no counterparty column in DDL (mig 364)
    lanes: { ipp_developer: 'safety_grid', epc_contractor: 'quality' },
    eventsTable: 'oe_ipp_ms_events', eventsFk: 'ms_id',
    actions: [
      { action: 'submit_for_review', label: 'Submit for review',
        path: '/api/ipp-method-statement/:id/submit_for_review',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Submits the drafted method statement for safety review.',
        fields: [
          { key: 'work_sequence', label: 'Work sequence', type: 'evidence' },
          { key: 'resources_personnel', label: 'Resources / personnel', type: 'evidence' },
          { key: 'plant_equipment', label: 'Plant & equipment', type: 'evidence' },
        ],
      },
      { action: 'complete_risk_assessment', label: 'Complete risk assessment',
        path: '/api/ipp-method-statement/:id/complete_risk_assessment',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Completes the hazard and risk assessment ahead of approval.',
        fields: [
          { key: 'hazard_register', label: 'Hazard register', type: 'evidence' },
          { key: 'ppe_requirements', label: 'PPE requirements', type: 'evidence' },
          { key: 'emergency_procedure', label: 'Emergency procedure', type: 'evidence' },
          { key: 'environmental_controls', label: 'Environmental controls', type: 'evidence' },
        ],
      },
      { action: 'approve_ms', label: 'Approve', tone: 'primary',
        path: '/api/ipp-method-statement/:id/approve_ms',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Approves the method statement for execution; critical-lift, confined-space and live-electrical work crosses the regulator queue.' },
      { action: 'conduct_toolbox_talk', label: 'Record toolbox talk',
        path: '/api/ipp-method-statement/:id/conduct_toolbox_talk',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Records the toolbox briefing of the work crew before work commences.',
        fields: [
          { key: 'toolbox_talk_notes', label: 'Toolbox talk notes', type: 'evidence' },
        ],
      },
      { action: 'suspend_work', label: 'Suspend work', tone: 'oxide',
        path: '/api/ipp-method-statement/:id/suspend_work',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Suspends active work under this statement; cases needing statutory notification cross the regulator queue.',
        fields: [
          { key: 'suspension_reason', label: 'Suspension reason', type: 'string',
            placeholder: 'Why work is being suspended' },
        ],
      },
      { action: 'reject_ms', label: 'Reject', tone: 'oxide',
        path: '/api/ipp-method-statement/:id/reject_ms',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Rejects the method statement; a revised statement must be drafted as a new revision.',
        fields: [
          { key: 'reason_code', label: 'Rejection reason', type: 'string',
            placeholder: 'Why the method statement is rejected' },
        ],
      },
    ],
    filters: [
      { key: 'in_review', label: 'In review', statuses: ['drafted', 'reviewed', 'risk_assessed'] },
      { key: 'approved', label: 'Approved / briefed', statuses: ['approved', 'toolbox_briefed'] },
      { key: 'active', label: 'Active', statuses: ['active', 'work_completed'] },
      { key: 'suspended', label: 'Suspended', statuses: ['suspended'] },
      { key: 'closed', label: 'Closed', statuses: ['closed', 'rejected', 'superseded', 'archived'] },
    ],
    kpis: [
      { key: 'total', label: 'Method statements', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },

  // W143 — Daily construction diary (JBCC 6.2 cl.8.13 + NEC4 cl.25; URGENT SLA —
  // critical-delay days tightest)
  {
    key: 'ipp_construction_diary', wave: 143, table: 'oe_ipp_construction_diary',
    title: 'Site diary', refCol: 'diary_ref', titleCol: 'project_name',
    quantumCol: null, // no ZAR-denominated column in oe_ipp_construction_diary DDL (mig 386)
    statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['archived', 'missed', 'voided'],
    counterpartyCol: 'contractor_signatory', // contractor side signs the diary; IPP/employer is the registry viewer
    lanes: { ipp_developer: 'construction', epc_contractor: 'site_setup' },
    eventsTable: null, eventsFk: null, // mig 386 defines no diary events table — Thread hides timeline
    actions: [
      { action: 'submit_diary', label: 'Submit diary',
        path: '/api/ipp-diary/:id/submit_diary',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Submits the day\'s record for employer review; days with a safety incident cross the regulator queue.',
        fields: [
          { key: 'progress_narrative', label: 'Progress narrative', type: 'evidence' },
          { key: 'safety_observations', label: 'Safety observations', type: 'evidence' },
          { key: 'delay_description', label: 'Delay description', type: 'evidence' },
          { key: 'delay_duration_hours', label: 'Delay duration (hours)', type: 'number' },
          { key: 'contractor_signatory', label: 'Contractor signatory', type: 'string' },
        ],
      },
      { action: 'note_receipt', label: 'Note receipt',
        path: '/api/ipp-diary/:id/note_receipt',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Employer notes receipt of the submitted diary.',
        fields: [
          { key: 'employer_signatory', label: 'Employer signatory', type: 'string' },
        ],
      },
      { action: 'ie_review', label: 'Independent engineer review',
        path: '/api/ipp-diary/:id/ie_review',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Independent engineer reviews the diary entries.',
        fields: [
          { key: 'ie_reviewer', label: 'IE reviewer', type: 'string' },
        ],
      },
      { action: 'countersign', label: 'Countersign', tone: 'primary',
        path: '/api/ipp-diary/:id/countersign',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Employer countersigns the diary, locking it in as the contractual daily record.',
        fields: [
          { key: 'employer_signatory', label: 'Employer signatory', type: 'string' },
        ],
      },
      { action: 'dispute_diary', label: 'Dispute entries', tone: 'oxide',
        path: '/api/ipp-diary/:id/dispute_diary',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Disputes the diary\'s delay or record entries; critical-delay disputes cross the regulator queue.',
        fields: [
          { key: 'dispute_reason', label: 'Dispute reason', type: 'string', required: true,
            placeholder: 'What in the diary is disputed' },
        ],
      },
      { action: 'archive_diary', label: 'Archive diary',
        path: '/api/ipp-diary/:id/archive_diary',
        roles: ['admin', 'ipp_developer', 'support'],
        cascadeHint: 'Archives the countersigned diary into the permanent project record.' },
    ],
    filters: [
      { key: 'open', label: 'Open', statuses: ['open', 'submitted', 'late_submission'] },
      { key: 'in_review', label: 'In review', statuses: ['employer_noted', 'ie_reviewed'] },
      { key: 'disputed', label: 'Disputed', statuses: ['disputed', 'resolution_pending', 'correction_accepted'] },
      { key: 'signed', label: 'Countersigned', statuses: ['countersigned'] },
      { key: 'closed', label: 'Closed', statuses: ['archived', 'missed', 'voided'] },
    ],
    kpis: [
      { key: 'total', label: 'Diary entries', compute: 'count' },
      { key: 'breached', label: 'Breached', compute: 'count_breached' },
    ],
  },
];

export function chainsForRole(role: string): ChainDescriptor[] {
  return MERIDIAN_CHAINS.filter(d => role in d.lanes);
}

export function getChain(key: string): ChainDescriptor | undefined {
  return MERIDIAN_CHAINS.find(d => d.key === key);
}
