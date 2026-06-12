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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Starts compliance assessment; borrower notified of receipt.' },
      { action: 'flag-breach', label: 'Declare breach',
        path: '/api/covenant-certificate/chain/:id/flag-breach',
        roles: ['admin', 'support', 'lender'], tone: 'oxide',
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Commits tranche; triggers SARB large-exposure disclosure for senior tranches and notifies IPP treasury.' },
      { action: 'reject', label: 'Reject', tone: 'oxide',
        path: '/api/lender/drawdown-chain/:id/reject',
        roles: ['admin', 'support', 'lender'],
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Records IE-certified UoP reconciliation as clean; releases hold on next tranche.' },
      { action: 'demand-clawback', label: 'Demand clawback', tone: 'oxide',
        path: '/api/disbursement/chain/:id/demand-clawback',
        roles: ['admin', 'support', 'lender'],
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Declares event of default and calls full outstanding balance; crosses into regulator inbox for senior_secured and mezzanine tiers.' },
      { action: 'write-off', label: 'Write off', tone: 'oxide',
        path: '/api/loan-default/chain/:id/write-off',
        roles: ['admin', 'support', 'lender'],
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Credit committee approval; fires facility-agreement issuance workflow and notifies applicant (IPP) of approval.' },
      { action: 'decline', label: 'Decline', tone: 'oxide',
        path: '/api/credit-origination/chain/:id/decline',
        roles: ['admin', 'support', 'lender'],
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
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Executes the LMA Transfer Certificate; crosses SARB Exchange Control inbox for every tier when the incoming lender is non-resident (W61 signature).' },
      { action: 'fail-screening', label: 'Fail KYC/AML screening', tone: 'oxide',
        path: '/api/loan-transfer/chain/:id/fail-screening',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Rejects incoming lender on FIC sanctions or AML grounds; crosses regulator inbox for every tier (FIC hard line).' },
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
        cascadeHint: 'Legal opinion accepted; security item marked perfected and unblocks first drawdown CP if this item is condition precedent.' },
      { action: 'mark-lapsed', label: 'Mark lapsed', tone: 'oxide',
        path: '/api/security-perfection/chain/:id/mark-lapsed',
        roles: ['admin', 'support', 'lender'],
        cascadeHint: 'Security interest lapses without registration; crosses regulator inbox for every tier (W69 universal security-loss signature).' },
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
        cascadeHint: 'Trader starts unwinding the breaching position toward the required reduction target.' },
      { action: 'issue-margin-call', label: 'Issue margin call',
        path: '/api/poslimit/chain/:id/issue-margin-call',
        roles: ['admin', 'support', 'compliance'],
        cascadeHint: 'Demands a ZAR collateral top-up from the trading member; crosses FSCA inbox for prop and market_maker tiers.' },
      { action: 'force-liquidate', label: 'Force liquidate', tone: 'oxide',
        path: '/api/poslimit/chain/:id/force-liquidate',
        roles: ['admin', 'support', 'compliance'],
        cascadeHint: 'Escalates to forced position liquidation; crosses regulator inbox for every tier (W29 universal hard line).' },
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
        cascadeHint: 'Compliance approves execution against the evaluated best quote; opens the hard market execution window.' },
      { action: 'escalate-exception', label: 'Escalate exception', tone: 'oxide',
        path: '/api/best-execution/chain/:id/escalate-exception',
        roles: ['admin', 'support', 'trader'],
        cascadeHint: 'Escalates a best-ex exception and closes the case adversely; crosses FSCA conduct inbox for every client tier.' },
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
        cascadeHint: 'Submits the UTI-tagged report to the trade repository and starts the acknowledgement clock toward the T+1 FMA deadline.' },
      { action: 'flag-break', label: 'Flag reconciliation break', tone: 'oxide',
        path: '/api/trade-reporting/chain/:id/flag-break',
        roles: ['admin', 'support', 'trader'],
        cascadeHint: 'Flags a TR reconciliation break; crosses FSCA supervisory inbox for otc_derivative class (systemic-risk product).' },
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
        cascadeHint: 'Closes the surveillance case as cleared after analysis; no enforcement, subject desk released from review.' },
      { action: 'file-stor', label: 'File STOR', tone: 'oxide',
        path: '/api/market-abuse/chain/:id/file-stor',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Files the suspicious-transaction report with the FSCA — the filing itself crosses the regulator inbox for every tier (W52 signature).' },
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
        cascadeHint: 'Authority certifies the system against RTS-6 pre-trade risk controls; unblocks the firm to deploy live.' },
      { action: 'invoke-kill-switch', label: 'Invoke kill-switch', tone: 'oxide',
        path: '/api/algo-cert/chain/:id/invoke-kill-switch',
        roles: ['admin', 'trader', 'regulator'],
        cascadeHint: 'Emergency-halts the live automated system; crosses regulator inbox for every tier (W60 signature — notifiable market event).' },
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
        cascadeHint: 'Issues the IM/VM margin call to the clearing member and arms the collateral-posting window.' },
      { action: 'declare-default', label: 'Declare default', tone: 'oxide',
        path: '/api/counterparty-margin/chain/:id/declare-default',
        roles: ['admin', 'trader'],
        cascadeHint: 'Declares counterparty default and opens the close-out waterfall; crosses regulator inbox for every tier (W68 signature).' },
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
        cascadeHint: 'Records counterparty affirmation; trade advances to matching and settlement instruction.' },
      { action: 'flag-break', label: 'Flag break', tone: 'oxide',
        path: '/api/trade-allocation/chain/:id/flag-break',
        roles: ['admin', 'trader'],
        cascadeHint: 'Flags an allocation/confirmation/settlement break for review; crosses regulator (FSCA/CSD) inbox for every notional tier (W76 signature).' },
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
