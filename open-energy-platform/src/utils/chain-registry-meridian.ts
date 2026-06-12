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

  // ───────── IPP DEVELOPER ─────────
  // Skipped: W1 IPP project management (project_activities/project_schedule_state are
  // CPM scheduling tables, ipp_projects has no chain_status/sla_deadline_at — no single
  // case-list table with a status + sla_deadline_at pair);
  // W10 bond/insurance expiry (ipp_performance_bonds tracks status + expiry_status
  // cycles but has no sla_deadline_at column — countdown lives on expiry_at, not a
  // Meridian-shaped SLA column).

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
        cascadeHint: 'Awards the RFP to the selected bidder; fires award notification to vendor and (for high-capex tier) REIPPPP transparency crossing.' },
      { action: 'sign-contract', label: 'Sign contract',
        path: '/api/ipp/procurement-chain/:id/sign-contract',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Executes the contract with the awarded vendor and arms the delivery-due SLA window.' },
      { action: 'cancel', label: 'Cancel RFP', tone: 'oxide',
        path: '/api/ipp/procurement-chain/:id/cancel',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Cancels the procurement; notifies all bidders and closes the case adversely.' },
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
        cascadeHint: 'IE-certified commercial operation date; fires NERSA SCADA registration crossing and unlocks PPA billing start.' },
      { action: 'cancel', label: 'Cancel project', tone: 'oxide',
        path: '/api/ipp/cod-chain/:id/cancel',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Abandons the construction programme before COD; fires cancellation cascade to lenders and offtaker.' },
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
        cascadeHint: 'Disputes the proposed quantum; for catastrophic tier the dispute crosses the FSCA Section 38 large-loss inbox.' },
      { action: 'settle', label: 'Record settlement',
        path: '/api/insurance/claim-chain/:id/settle',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'oem'],
        cascadeHint: 'Records the insurer payout against the agreed quantum and notifies lender security agents of proceeds.' },
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
        cascadeHint: 'Files the IPPO cure plan for the under-performing commitment and starts the cure-execution clock.' },
      { action: 'verify-compliance', label: 'Verify compliant',
        path: '/api/ed/commitment-chain/:id/verify-compliance',
        roles: ['admin', 'support', 'compliance', 'ipp_developer'],
        cascadeHint: 'Confirms the commitment is back within the variance threshold after cure execution.' },
      { action: 'issue-penalty', label: 'Issue penalty', tone: 'oxide',
        path: '/api/ed/commitment-chain/:id/issue-penalty',
        roles: ['admin', 'support', 'compliance', 'ipp_developer'],
        cascadeHint: 'Records the DMRE penalty for the failed cure; crosses the regulator inbox and may escalate to DTI.' },
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
        cascadeHint: 'IPP accepts the connection cost estimate; SO proceeds to draft the UNGCA.' },
      { action: 'execute-agreement', label: 'Execute agreement',
        path: '/api/gca/connection-chain/:id/execute-agreement',
        roles: ['admin', 'support', 'compliance', 'ipp_developer'],
        cascadeHint: 'IPP executes the UNGCA; unlocks connection construction and feeds the W20 COD energisation gate.' },
      { action: 'energise', label: 'Energise connection',
        path: '/api/gca/connection-chain/:id/energise',
        roles: ['admin', 'support', 'compliance', 'grid_operator'],
        cascadeHint: 'SO energises the point of connection after construction; arms commissioning toward in-service.' },
      { action: 'reject', label: 'Reject application', tone: 'oxide',
        path: '/api/gca/connection-chain/:id/reject',
        roles: ['admin', 'support', 'compliance', 'grid_operator'],
        cascadeHint: 'SO denies the connection on grid-stability or load grounds; closes the case and notifies NERSA for transmission tier.' },
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
        cascadeHint: 'SO rejects the outage window on system-security grounds; closes the request and notifies the submitting IPP.' },
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
        cascadeHint: 'Facility files the corrective-action plan against the non-conformance; SO review clock starts.' },
      { action: 'approve-cap', label: 'Approve CAP',
        path: '/api/grid-code-compliance/chain/:id/approve-cap',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO approves the corrective-action plan; facility proceeds to remediation under the tier SLA.' },
      { action: 'escalate-disconnection', label: 'Escalate to disconnection', tone: 'oxide',
        path: '/api/grid-code-compliance/chain/:id/escalate-disconnection',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Disconnects the non-conforming licensed facility; crosses regulator inbox for every tier (W67 signature).' },
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
        cascadeHint: 'Facility files the witnessed hold-point commissioning programme for SO review.' },
      { action: 'authorize-energization', label: 'Authorize energization',
        path: '/api/connection-energization/chain/:id/authorize-energization',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO authorizes first energization after pre-energization inspection; crosses regulator inbox for transmission and bulk tiers.' },
      { action: 'issue-cod', label: 'Issue COD', tone: 'primary',
        path: '/api/connection-energization/chain/:id/issue-cod',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO issues the commercial-operation certificate; crosses regulator inbox for every tier (W75 signature — NERSA generation register).' },
      { action: 'suspend-commissioning', label: 'Suspend commissioning', tone: 'oxide',
        path: '/api/connection-energization/chain/:id/suspend-commissioning',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO suspends the commissioning programme on safety or protection grounds; crosses regulator inbox for transmission and bulk tiers.' },
    ],
  },

  // ───────── OFFTAKER ─────────
  // Skipped: W7 PPA delivery obligations (oe_offtaker_ppa_obligations has a plain
  // `status` column + `cure_deadline_at` — no chain_status/sla_deadline_at pair).

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
        cascadeHint: 'Executes the signed PPA into force; fires the NERSA Section 34 registration crossing and arms the commencement window.' },
      { action: 'commence', label: 'Commence delivery',
        path: '/api/offtaker/ppa-contract-chain/:id/commence',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Marks first contracted delivery under the executed PPA; opens monthly contracted-vs-delivered billing (feeds W32).' },
      { action: 'terminate', label: 'Terminate PPA', tone: 'oxide',
        path: '/api/offtaker/ppa-contract-chain/:id/terminate',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Terminates the PPA for unresolved breach; closes the contract adversely and notifies seller and lenders.' },
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
        cascadeHint: 'Offtaker proposes the take-or-pay quantum from the contracted-vs-delivered statement; IPP acceptance clock starts.' },
      { action: 'accept-quantum', label: 'Accept quantum',
        path: '/api/take-or-pay/chain/:id/accept-quantum',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'IPP accepts the proposed take-or-pay quantum; opens the settlement payment window.' },
      { action: 'settle', label: 'Settle', tone: 'primary',
        path: '/api/take-or-pay/chain/:id/settle',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Records take-or-pay settlement against the agreed quantum and closes the contract-year true-up.' },
      { action: 'dispute', label: 'Dispute', tone: 'oxide',
        path: '/api/take-or-pay/chain/:id/dispute',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'IPP disputes the proposed quantum; the case terminates disputed and crosses the regulator inbox.' },
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
        cascadeHint: 'Offtaker agrees the escalated tariff from the published index; seller proceeds to apply the new rate.' },
      { action: 'apply-tariff', label: 'Apply tariff',
        path: '/api/tariff-indexation/chain/:id/apply-tariff',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller applies the agreed tariff to billing from the effective date; closes the annual repricing cycle.' },
      { action: 'raise-dispute', label: 'Raise dispute', tone: 'oxide',
        path: '/api/tariff-indexation/chain/:id/raise-dispute',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Offtaker disputes the escalation calculation; opens the recalculation loop and may refer to arbitration.' },
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
        cascadeHint: 'Seller files the deemed-energy claim for the curtailment event; buyer classification clock starts.' },
      { action: 'confirm-compensable', label: 'Confirm compensable',
        path: '/api/curtailment-claim/chain/:id/confirm-compensable',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Buyer classifies the curtailment as compensable under the PPA; advances to quantum validation.' },
      { action: 'settle-compensation', label: 'Settle compensation', tone: 'primary',
        path: '/api/curtailment-claim/chain/:id/settle-compensation',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Pays the agreed deemed-energy quantum at the W39-indexed tariff and closes the claim.' },
      { action: 'dispute', label: 'Dispute', tone: 'oxide',
        path: '/api/curtailment-claim/chain/:id/dispute',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller disputes the classification or quantum; opens recalculation and may refer to arbitration (crosses regulator for every tier).' },
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
        cascadeHint: 'Offtaker lodges the guarantee/LC/PCG/cash instrument; seller verification clock starts.' },
      { action: 'activate', label: 'Activate security',
        path: '/api/payment-security/chain/:id/activate',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller activates the verified instrument as live PPA credit support; arms adequacy-review and expiry monitoring.' },
      { action: 'initiate-drawdown', label: 'Initiate drawdown',
        path: '/api/payment-security/chain/:id/initiate-drawdown',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller draws on the security for unpaid invoices; opens the replenishment obligation against the offtaker.' },
      { action: 'forfeit', label: 'Forfeit security', tone: 'oxide',
        path: '/api/payment-security/chain/:id/forfeit',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Forfeits the instrument for unremedied default; crosses the regulator inbox for every tier (W54 signature).' },
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
        cascadeHint: 'Serves the termination notice on the seller and opens the cause-dependent cure window.' },
      { action: 'confirm-termination', label: 'Confirm termination', tone: 'oxide',
        path: '/api/ppa-termination/chain/:id/confirm-termination',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Confirms termination after a failed cure; crosses the regulator inbox for every tier when involuntary (W62 signature).' },
      { action: 'agree-eta', label: 'Agree ETA', tone: 'primary',
        path: '/api/ppa-termination/chain/:id/agree-eta',
        roles: ['admin', 'support', 'offtaker'],
        cascadeHint: 'Agrees the early-termination amount on the cause-driven buy-out basis; opens settlement.' },
      { action: 'dispute-eta', label: 'Dispute ETA', tone: 'oxide',
        path: '/api/ppa-termination/chain/:id/dispute-eta',
        roles: ['admin', 'support', 'ipp_developer'],
        cascadeHint: 'Seller disputes the early-termination amount; opens the ETA dispute-resolution loop.' },
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
        cascadeHint: 'Issuer approves certificate issuance after eligibility review; one MWh attribute enters the registry once.' },
      { action: 'allocate-consumption', label: 'Allocate consumption',
        path: '/api/rec-lifecycle/chain/:id/allocate-consumption',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Holder allocates the certificate to a consumption period ahead of the Scope-2 market-based claim.' },
      { action: 'retire-certificate', label: 'Retire certificate', tone: 'primary',
        path: '/api/rec-lifecycle/chain/:id/retire-certificate',
        roles: ['admin', 'offtaker'],
        cascadeHint: 'Retires the certificate to substantiate the renewable-consumption claim; the attribute can never be used again.' },
      { action: 'claw-back', label: 'Claw back', tone: 'oxide',
        path: '/api/rec-lifecycle/chain/:id/claw-back',
        roles: ['admin', 'ipp_developer'],
        cascadeHint: 'Revokes the certificate on an upheld integrity dispute; crosses the regulator inbox for every tier (W70 double-counting signature).' },
    ],
  },

  // ───────── CARBON FUND ─────────
  // Skipped: W4 Article 6 corresponding adjustments (oe_article6_adjustments uses
  // `ca_status`, no sla_deadline_at); W11 carbon MRV chain (mrv_submissions has
  // chain_status but no sla_deadline_at — deadlines live on doe_due_at/cra_due_at);
  // W17 carbon retirement (carbon_retirements predates the oe_ table convention and
  // its chain columns arrive via ALTER in migration 124, not the CREATE TABLE DDL —
  // fails the registry shape contract on both counts).

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
        cascadeHint: 'Submits the PDD to the VVB for validation; the standard-tiered validation SLA starts.' },
      { action: 'register', label: 'Register project', tone: 'primary',
        path: '/api/carbon-registration/chain/:id/register',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Registers the validated project with the standard registry; unlocks crediting activation and downstream MRV.' },
      { action: 'reject', label: 'Reject', tone: 'oxide',
        path: '/api/carbon-registration/chain/:id/reject',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Rejects the project at validation or registration review; closes the pipeline case adversely.' },
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
        cascadeHint: 'Opens loss assessment of the reported reversal event; quantification clock starts.' },
      { action: 'cancel-buffer', label: 'Cancel buffer credits', tone: 'primary',
        path: '/api/carbon-reversal/chain/:id/cancel-buffer',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Cancels buffer-pool credits to cover the quantified reversal; preserves the integrity of issued units.' },
      { action: 'escalate', label: 'Escalate', tone: 'oxide',
        path: '/api/carbon-reversal/chain/:id/escalate',
        roles: ['admin', 'support', 'carbon_fund'],
        cascadeHint: 'Escalates an uncured or avoidable reversal to the registry/regulator; terminates the case escalated.' },
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
        cascadeHint: 'Files the offset claim of retired credits against the carbon-tax liability; SARS review clock starts.' },
      { action: 'grant-allowance', label: 'Grant allowance',
        path: '/api/carbon-offset-claim/chain/:id/grant-allowance',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Records the granted offset allowance within the 10%/5% cap; advances to the tax-return application.' },
      { action: 'claw-back', label: 'Claw back', tone: 'oxide',
        path: '/api/carbon-offset-claim/chain/:id/claw-back',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Reverses a granted allowance on audit; crosses the regulator inbox for every tier (W48 signature).' },
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
        cascadeHint: 'Files the renewal application ahead of crediting-period expiry; completeness-check clock starts.' },
      { action: 'renew', label: 'Renew crediting period', tone: 'primary',
        path: '/api/crediting-renewal/chain/:id/renew',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Renews the crediting period on the reassessed baseline; crosses the regulator inbox when the baseline cut is 30% or more.' },
      { action: 'refuse', label: 'Refuse renewal', tone: 'oxide',
        path: '/api/crediting-renewal/chain/:id/refuse',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Refuses renewal on failed re-validation; the project stops issuing at period end.' },
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
        cascadeHint: 'Verifies the delivered vintage against the contracted schedule; crosses the regulator inbox for Article 6 or large contracts.' },
      { action: 'flag-shortfall', label: 'Flag shortfall', tone: 'oxide',
        path: '/api/carbon-erpa/chain/:id/flag-shortfall',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Flags an under-delivery against the schedule; opens the make-good obligation on the seller.' },
      { action: 'settle', label: 'Settle delivery',
        path: '/api/carbon-erpa/chain/:id/settle',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Settles payment for the verified delivery; advances the ERPA toward completion or the next scheduled vintage.' },
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
        cascadeHint: 'Runs the automated eligibility score, programme-cap headroom and geographic-overlap double-counting guard.' },
      { action: 'approve-inclusion', label: 'Approve inclusion', tone: 'primary',
        path: '/api/poa-inclusion/chain/:id/approve-inclusion',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Includes the CPA in the registered programme; crosses the regulator inbox when a corresponding adjustment is required (else large+mega).' },
      { action: 'exclude-cpa', label: 'Exclude CPA', tone: 'oxide',
        path: '/api/poa-inclusion/chain/:id/exclude-cpa',
        roles: ['admin', 'carbon_fund'],
        cascadeHint: 'Delists the CPA for non-conformance; crosses the regulator inbox for every tier (W73 signature).' },
    ],
  },

  // ───────── GRID OPERATOR ─────────
  // Two-party grid waves W18 (planned outage), W28 (GCA), W67 (grid code
  // compliance) and W75 (connection energization) are registered above in the
  // IPP DEVELOPER section with grid_operator lanes — not repeated here.
  // Skipped: W8 wheeling charges (oe_grid_wheeling_charges has a plain `status`
  // column + `dispute_deadline_at` — no chain_status/sla_deadline_at pair);
  // W13 dispatch nominations (oe_dispatch_nominations uses `nomination_status`
  // + `next_sla_due_at` — fails the registry shape contract).

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
        cascadeHint: 'Customer acknowledges the curtailment instruction; the stage-tiered response SLA starts running.' },
      { action: 'lift-instruction', label: 'Lift instruction',
        path: '/api/load-curtailment/chain/:id/lift-instruction',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO lifts the curtailment as system conditions recover; arms reconciliation of curtailed MWh.' },
      { action: 'refuse', label: 'Refuse instruction', tone: 'oxide',
        path: '/api/load-curtailment/chain/:id/refuse',
        roles: ['admin', 'support', 'ipp_developer', 'grid_operator', 'trader', 'carbon_fund', 'offtaker'],
        cascadeHint: 'Customer refuses the lawful curtailment instruction; closes the case adversely and exposes the customer to CSC-1 penalties.' },
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
        cascadeHint: 'Provider acknowledges the dispatch instruction; the reserve-tier ramp clock starts.' },
      { action: 'settle', label: 'Settle activation', tone: 'primary',
        path: '/api/reserve-activation/chain/:id/settle',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO settles verified delivery — utilisation + availability payments to the provider; terminates the activation settled.' },
      { action: 'flag-non-performance', label: 'Flag non-performance', tone: 'oxide',
        path: '/api/reserve-activation/chain/:id/flag-non-performance',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'SO flags failed delivery against the activation; settlement proceeds on the penalty leg with non-performance charges and still closes the activation settled.' },
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
        cascadeHint: 'Allocation committee issues the capacity offer off the queue position; the applicant acceptance window starts.' },
      { action: 'accept-offer', label: 'Accept offer',
        path: '/api/grid-capacity/chain/:id/accept-offer',
        roles: ['admin', 'support', 'ipp_developer', 'offtaker', 'lender', 'trader', 'carbon_fund'],
        cascadeHint: 'Applicant accepts the offer; capacity is reserved pending project milestones.' },
      { action: 'allocate-capacity', label: 'Allocate capacity', tone: 'primary',
        path: '/api/grid-capacity/chain/:id/allocate-capacity',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Operator firms up the reserved capacity; feeds the W28 Grid Connection Agreement handoff (gca_ref).' },
      { action: 'reject-application', label: 'Reject application', tone: 'oxide',
        path: '/api/grid-capacity/chain/:id/reject-application',
        roles: ['admin', 'support', 'grid_operator'],
        cascadeHint: 'Committee denies grid access at assessment or queueing; crosses the regulator inbox for every tier (W58 signature).' },
    ],
  },

  // ───────── REGULATOR ─────────
  // Regulator lanes on cross-referred chains (W33/W38/W40/W43/W49/W57/W74 etc.)
  // also appear on entries above/below via the lanes map.
  // Skipped: W5 regulator inbox (oe_regulator_inbox is a triage inbox with
  // `ack_status` + `sla_due_at` — not the chain_status/sla_deadline_at model;
  // its matters land here via the W31 disposition chain instead).

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
        cascadeHint: 'Triages the cross-referred matter and sets the severity tier; the tier SLA starts running.' },
      { action: 'require-action', label: 'Require corrective action',
        path: '/api/disposition/chain/:id/require-action',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Directs the licensee to take corrective action; opens the compliance window on the source party.' },
      { action: 'escalate', label: 'Escalate', tone: 'oxide',
        path: '/api/disposition/chain/:id/escalate',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Escalates the matter to formal enforcement; terminates the disposition escalated.' },
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
        cascadeHint: 'Licensee files the renewal application against the expiry notice; the completeness-check clock starts.' },
      { action: 'grant', label: 'Grant renewal', tone: 'primary',
        path: '/api/licence/renewal/chain/:id/grant',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council grants the renewed licence; the licensee continues operating under the renewed term.' },
      { action: 'refuse', label: 'Refuse renewal', tone: 'oxide',
        path: '/api/licence/renewal/chain/:id/refuse',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council refuses the renewal; the licensee loses the right to operate at licence expiry.' },
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
        cascadeHint: 'Officer issues the inspection findings to the respondent; the remediation directive window opens.' },
      { action: 'begin-remediation', label: 'Begin remediation',
        path: '/api/compliance-inspection/chain/:id/begin-remediation',
        roles: ['admin', 'support', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund'],
        cascadeHint: 'Respondent licensee starts remediating the directive; the verification clock keeps running.' },
      { action: 'close-compliant', label: 'Close compliant', tone: 'primary',
        path: '/api/compliance-inspection/chain/:id/close-compliant',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Officer verifies remediation and closes the inspection clean — the no-enforcement terminal.' },
      { action: 'impose-penalty', label: 'Impose penalty', tone: 'oxide',
        path: '/api/compliance-inspection/chain/:id/impose-penalty',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Imposes the §34/§35 financial penalty for failed remediation; opens the respondent appeal window.' },
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
        cascadeHint: 'Opens the statutory public-consultation window on the revenue application.' },
      { action: 'issue-determination', label: 'Issue determination', tone: 'primary',
        path: '/api/tariff-determination/chain/:id/issue-determination',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council issues the allowed-revenue determination; gazetting and implementation follow.' },
      { action: 'request-reconsideration', label: 'Request reconsideration',
        path: '/api/tariff-determination/chain/:id/request-reconsideration',
        roles: ['admin', 'support', 'ipp_developer', 'grid_operator', 'offtaker', 'lender', 'trader', 'carbon_fund'],
        cascadeHint: 'Applicant licensee asks Council to reconsider the issued determination before implementation.' },
      { action: 'reject', label: 'Reject application', tone: 'oxide',
        path: '/api/tariff-determination/chain/:id/reject',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council rejects the revenue application; the licensee remains on the prior tariff.' },
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
        cascadeHint: 'Applicant answers the information request; the application returns to completeness review.' },
      { action: 'open-participation', label: 'Open public participation',
        path: '/api/licence-application/chain/:id/open-participation',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Opens the s.10 public-participation window on the accepted application.' },
      { action: 'grant-licence', label: 'Grant licence', tone: 'primary',
        path: '/api/licence-application/chain/:id/grant-licence',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council grants the licence; crosses the regulator oversight queue for the major class only.' },
      { action: 'refuse-licence', label: 'Refuse licence', tone: 'oxide',
        path: '/api/licence-application/chain/:id/refuse-licence',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Council refuses market entry; crosses the regulator oversight queue for every class (W49 signature).' },
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
        cascadeHint: 'Committee approves the Schedule 2 registration; certificate issuance follows.' },
      { action: 'refer-to-licensing', label: 'Refer to licensing',
        path: '/api/sseg-registration/chain/:id/refer-to-licensing',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Hands a non-Schedule-2 facility up to the full W49 licence-application chain.' },
      { action: 'refuse-registration', label: 'Refuse registration', tone: 'oxide',
        path: '/api/sseg-registration/chain/:id/refuse-registration',
        roles: ['admin', 'support', 'regulator'],
        cascadeHint: 'Committee refuses the registration on failed verification; the facility may not lawfully operate.' },
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
        cascadeHint: 'Screens jurisdiction and merit; admissible complaints are referred to the respondent licensee first.' },
      { action: 'issue-ruling', label: 'Issue ruling', tone: 'primary',
        path: '/api/complaints/chain/:id/issue-ruling',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Issues the binding adjudication ruling; crosses the Council oversight queue for major and systemic tiers.' },
      { action: 'lodge-appeal', label: 'Record appeal', tone: 'oxide',
        path: '/api/complaints/chain/:id/lodge-appeal',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Records a judicial-review appeal against the ruling; crosses the Council oversight queue for every tier (W66 signature).' },
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
        cascadeHint: 'Issues the levy notice to the licensee; the payment window and arrears aging start.' },
      { action: 'record-settlement', label: 'Record settlement', tone: 'primary',
        path: '/api/levy-assessment/chain/:id/record-settlement',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Records payment in full; terminates the assessment settled and restores licence good standing.' },
      { action: 'escalate-enforcement', label: 'Escalate to enforcement', tone: 'oxide',
        path: '/api/levy-assessment/chain/:id/escalate-enforcement',
        roles: ['admin', 'regulator'],
        cascadeHint: 'Escalates the uncollected debt to enforcement — a licence good-standing matter; crosses the Council oversight queue for every tier (W74 signature).' },
    ],
  },

  // ── SUPPORT (OEM-Support family) ────────────────────────────────────────────
  // W14 support tickets skipped: support_tickets has no oe_ prefix and uses next_sla_due_at (mig 118)
  // W15 warranty/RMA claim skipped: oe_warranty_claims uses next_sla_due_at (mig 120)
  // W16 WO dispatch skipped: om_work_orders has no oe_ prefix (mig 058)

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
        cascadeHint: 'Categorizes and prioritizes the raised problem; the investigation SLA clock starts.' },
      { action: 'begin-investigation', label: 'Begin investigation',
        path: '/api/problem-management/chain/:id/begin-investigation',
        roles: ['admin', 'support'],
        cascadeHint: 'Opens the root-cause investigation on the categorized problem.' },
      { action: 'identify-rca', label: 'Identify root cause',
        path: '/api/problem-management/chain/:id/identify-rca',
        roles: ['admin', 'support'],
        cascadeHint: 'Records the identified root cause; known-error logging and fix proposal follow.' },
      { action: 'raise-change', label: 'Raise change (RFC)', tone: 'primary',
        path: '/api/problem-management/chain/:id/raise-change',
        roles: ['admin', 'support'],
        cascadeHint: 'Hands the proposed fix to the W47 change-enablement chain as a linked RFC.' },
      { action: 'escalate', label: 'Escalate', tone: 'oxide',
        path: '/api/problem-management/chain/:id/escalate',
        roles: ['admin', 'support'],
        cascadeHint: 'Escalates a major problem out of the desk; crosses the regulator queue for major problems only.' },
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
        cascadeHint: 'Completes the risk/impact assessment on the requested change ahead of CAB review.' },
      { action: 'submit-to-cab', label: 'Submit to CAB',
        path: '/api/change-enablement/chain/:id/submit-to-cab',
        roles: ['admin', 'support'],
        cascadeHint: 'Puts the assessed RFC in front of the Change Advisory Board.' },
      { action: 'approve', label: 'Approve change', tone: 'primary',
        path: '/api/change-enablement/chain/:id/approve',
        roles: ['admin', 'support'],
        cascadeHint: 'CAB approves the RFC; scheduling and implementation follow.' },
      { action: 'emergency-approve', label: 'Emergency approve (ECAB)',
        path: '/api/change-enablement/chain/:id/emergency-approve',
        roles: ['admin', 'support'],
        cascadeHint: 'ECAB fast-path approval for an emergency change; crosses the regulator queue for the emergency class.' },
      { action: 'roll-back', label: 'Roll back', tone: 'oxide',
        path: '/api/change-enablement/chain/:id/roll-back',
        roles: ['admin', 'support'],
        cascadeHint: 'Backs out a failed implementation to the rolled_back terminal; crosses the regulator queue for emergency and normal classes.' },
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
        cascadeHint: 'Triages the advisory and re-derives the CVSS tier; the remediation SLA clock starts.' },
      { action: 'approve-remediation', label: 'Approve remediation',
        path: '/api/security-remediation/chain/:id/approve-remediation',
        roles: ['admin', 'support'],
        cascadeHint: 'Approves the tested patch plan for fleet rollout.' },
      { action: 'complete-rollout', label: 'Complete rollout', tone: 'primary',
        path: '/api/security-remediation/chain/:id/complete-rollout',
        roles: ['admin', 'support'],
        cascadeHint: 'Marks the fleet rollout complete; post-deployment verification follows.' },
      { action: 'accept-risk', label: 'Accept risk', tone: 'oxide',
        path: '/api/security-remediation/chain/:id/accept-risk',
        roles: ['admin', 'support'],
        cascadeHint: 'Closes the vulnerability unpatched as accepted risk; crosses the regulator queue for critical and high tiers.' },
      { action: 'roll-back', label: 'Roll back patch', tone: 'oxide',
        path: '/api/security-remediation/chain/:id/roll-back',
        roles: ['admin', 'support'],
        cascadeHint: 'Backs out a failed patch to the rolled_back terminal; crosses the regulator queue for critical and high tiers.' },
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
        cascadeHint: 'Submits the cost-recovery claim to the OEM; the acknowledgement window opens.' },
      { action: 'complete-assessment', label: 'Complete assessment',
        path: '/api/warranty-recovery/chain/:id/complete-assessment',
        roles: ['admin', 'support'],
        cascadeHint: 'Records the OEM defect assessment; crosses the regulator queue for every tier when the defect class is systemic (W63 signature).' },
      { action: 'approve-recovery', label: 'Approve recovery',
        path: '/api/warranty-recovery/chain/:id/approve-recovery',
        roles: ['admin', 'support'],
        cascadeHint: 'OEM accepts liability for the claim; recovery initiation follows.' },
      { action: 'confirm-recovery', label: 'Confirm recovery', tone: 'primary',
        path: '/api/warranty-recovery/chain/:id/confirm-recovery',
        roles: ['admin', 'support'],
        cascadeHint: 'Confirms the recovered amount received — the happy-path recovered terminal.' },
      { action: 'write-off', label: 'Write off', tone: 'oxide',
        path: '/api/warranty-recovery/chain/:id/write-off',
        roles: ['admin', 'support'],
        cascadeHint: 'Abandons the claim as uncollectable to the written_off terminal.' },
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
        cascadeHint: 'Raises the parts requisition from demand; approval and PO issue follow.' },
      { action: 'issue-po', label: 'Issue PO',
        path: '/api/spare-parts-provisioning/chain/:id/issue-po',
        roles: ['admin', 'support'],
        cascadeHint: 'Issues the purchase order to the supplier; the lead-time clock starts.' },
      { action: 'receive-goods', label: 'Receive goods',
        path: '/api/spare-parts-provisioning/chain/:id/receive-goods',
        roles: ['admin', 'support'],
        cascadeHint: 'Books the delivery in at the warehouse; the QA inspection gate opens.' },
      { action: 'issue-part', label: 'Issue part', tone: 'primary',
        path: '/api/spare-parts-provisioning/chain/:id/issue-part',
        roles: ['admin', 'support'],
        cascadeHint: 'Issues the reserved part to the work order — the happy-path issued terminal.' },
      { action: 'cancel-provisioning', label: 'Cancel provisioning', tone: 'oxide',
        path: '/api/spare-parts-provisioning/chain/:id/cancel-provisioning',
        roles: ['admin', 'support'],
        cascadeHint: 'Cancels the provisioning line; crosses the regulator queue for vital parts at high or catastrophic stockout impact.' },
    ],
  },

  // ── ESUMS / ESCO (O&M operator family) ──────────────────────────────────────
  // W12 site commissioning skipped: om_sites uses commissioning_status / commissioning_due_at (mig 114)
  // W71 asset prognostics skipped: oe_asset_prognostics uses status + sla_deadline (mig 232)

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
        cascadeHint: 'Dispatches the corrective O&M intervention against the identified root cause.' },
      { action: 'verify-recovery', label: 'Verify recovery', tone: 'primary',
        path: '/api/esums/pr-chain/:id/verify-recovery',
        roles: ['admin', 'support', 'esums', 'esums_om', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Verifies the PR has recovered above threshold; closure follows.' },
      { action: 'escalate', label: 'Escalate', tone: 'oxide',
        path: '/api/esums/pr-chain/:id/escalate',
        roles: ['admin', 'support', 'esums', 'esums_om', 'ipp', 'ipp_developer', 'wind'],
        cascadeHint: 'Escalates a non-recovering case out of routine O&M handling.' },
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
    lanes: { esco: 'safety', ipp_developer: 'safety_grid' },
    eventsTable: 'oe_hse_incident_events', eventsFk: 'incident_id',
    actions: [
      { action: 'triage', label: 'Triage incident',
        path: '/api/hse/incident-chain/:id/triage',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Classifies severity and statutory reportability; the OHSA s24 notification clock starts.' },
      { action: 'notify-authority', label: 'Notify authority',
        path: '/api/hse/incident-chain/:id/notify-authority',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Records the statutory OHSA s24 / NEMA s30 authority notification — the regulator crossing for reportable incidents.' },
      { action: 'begin-investigation', label: 'Begin investigation',
        path: '/api/hse/incident-chain/:id/begin-investigation',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Opens the incident investigation and root-cause analysis.' },
      { action: 'dispatch-corrective', label: 'Dispatch corrective',
        path: '/api/hse/incident-chain/:id/dispatch-corrective',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Dispatches corrective actions against the identified root cause.' },
      { action: 'close', label: 'Close incident', tone: 'primary',
        path: '/api/hse/incident-chain/:id/close',
        roles: ['admin', 'support', 'ipp', 'ipp_developer', 'wind', 'esums', 'esums_om', 'esco'],
        cascadeHint: 'Closes the incident after verified corrective actions and the evidence chain.' },
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
        cascadeHint: 'Vendor triages the filed defect escalation; the decision SLA clock starts.' },
      { action: 'vendor-decide', label: 'Record vendor decision',
        path: '/api/esums/vendor-escalation/chain/:id/vendor-decide',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Records whether the vendor accepts liability or the case escalates to the OEM.' },
      { action: 'escalate-to-oem', label: 'Escalate to OEM',
        path: '/api/esums/vendor-escalation/chain/:id/escalate-to-oem',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Escalates the defect past the vendor to the manufacturer for field investigation.' },
      { action: 'oem-decide', label: 'Record OEM decision',
        path: '/api/esums/vendor-escalation/chain/:id/oem-decide',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Records the OEM liability decision; remediation or recall follows.' },
      { action: 'issue-recall', label: 'Issue recall', tone: 'oxide',
        path: '/api/esums/vendor-escalation/chain/:id/issue-recall',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Issues the NRCS safety recall — the safety-defect terminal that crosses the regulator queue.' },
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
        cascadeHint: 'Submits the measured period availability for reconciliation against the guarantee.' },
      { action: 'flag-shortfall', label: 'Flag shortfall', tone: 'oxide',
        path: '/api/availability-guarantee/chain/:id/flag-shortfall',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Flags reconciled availability below the guaranteed floor; the LD assessment window opens.' },
      { action: 'assess-ld', label: 'Assess LDs',
        path: '/api/availability-guarantee/chain/:id/assess-ld',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Assesses the liquidated damages owed for the availability shortfall.' },
      { action: 'settle', label: 'Settle', tone: 'primary',
        path: '/api/availability-guarantee/chain/:id/settle',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Settles the assessed LDs to the settled terminal.' },
      { action: 'waive-ld', label: 'Waive LDs',
        path: '/api/availability-guarantee/chain/:id/waive-ld',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Waives the assessed LDs by commercial agreement; the guarantee case still closes settled.' },
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
        cascadeHint: 'Assigns the due PM task to the contractor crew; the completion window opens.' },
      { action: 'complete-work', label: 'Complete work',
        path: '/api/pm-compliance/chain/:id/complete-work',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Records the completed PM work with evidence; verification follows.' },
      { action: 'close-pm', label: 'Close PM', tone: 'primary',
        path: '/api/pm-compliance/chain/:id/close-pm',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Closes the verified PM task compliant — the happy-path terminal.' },
      { action: 'approve-deferral', label: 'Approve deferral',
        path: '/api/pm-compliance/chain/:id/approve-deferral',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Approves the requested deferral with a re-baselined due date.' },
      { action: 'skip-pm', label: 'Skip PM', tone: 'oxide',
        path: '/api/pm-compliance/chain/:id/skip-pm',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Skips the PM task outright; crosses the regulator queue for critical and safety RCM tiers.' },
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
        cascadeHint: 'Verifies the LOTO isolation in the field against the approved isolation plan.' },
      { action: 'issue-permit', label: 'Issue permit',
        path: '/api/permit-to-work/chain/:id/issue-permit',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Issues the permit to the holder; crosses the regulator queue for every tier when the work is live-electrical or confined-space.' },
      { action: 'complete-work', label: 'Complete work',
        path: '/api/permit-to-work/chain/:id/complete-work',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Holder declares the permitted work complete; de-isolation and close-out follow.' },
      { action: 'close-permit', label: 'Close permit', tone: 'primary',
        path: '/api/permit-to-work/chain/:id/close-permit',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Closes the permit after verified de-isolation — the happy-path terminal.' },
      { action: 'revoke-permit', label: 'Revoke permit', tone: 'oxide',
        path: '/api/permit-to-work/chain/:id/revoke-permit',
        roles: ['admin', 'support', 'ipp_developer', 'esco'],
        cascadeHint: 'Revokes a live permit on a safety breach; always crosses the regulator queue (W64 signature).' },
    ],
  },
];

export function chainsForRole(role: string): ChainDescriptor[] {
  return MERIDIAN_CHAINS.filter(d => role in d.lanes);
}

export function getChain(key: string): ChainDescriptor | undefined {
  return MERIDIAN_CHAINS.find(d => d.key === key);
}
