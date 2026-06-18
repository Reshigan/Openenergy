// Complete per-role domain + feature data for the Launchpad Nav prototype.
// Every feature maps 1:1 to a real workstation tab — derived from the journey audit
// and all 9 workstation page grep outputs.

export type Feature = {
  key: string;
  label: string;
  chainKey?: string;
  // Non-chain feature that has a real standalone page already mounted in App.tsx.
  // Atlas links here instead of /surface/:key (which would need a registry entry).
  route?: string;
  description: string;
  mockState?: string;
  mockStates?: readonly string[];
};

export type Domain = {
  key: string;
  label: string;
  icon: string;
  color: string;
  features: Feature[];
};

export type RoleConfig = {
  role: string;
  label: string;
  suitePath: string;
  workstationPath: string;
  domains: Domain[];
};

// ─── IPP Developer ───────────────────────────────────────────────────────────

const ippDomains: Domain[] = [
  {
    key: 'project_controls',
    label: 'Project Controls',
    icon: '◈',
    color: 'oklch(0.46 0.13 270)',
    features: [
      { key: 'projects', label: 'My projects', description: 'Active project portfolio — status, phase, health KPIs.' },
      { key: 'milestones', label: 'Milestones', description: 'Project milestone tracking with variance analysis.' },
      { key: 'schedule', label: 'Schedule pulse', description: 'Critical path summary and schedule health.' },
      { key: 'wbs_schedule', label: 'WBS & Gantt', chainKey: 'ipp_schedule', description: 'Work breakdown structure with CPM Gantt.', mockStates: ['draft','planned','in_progress','delayed','completed'], mockState: 'in_progress' },
      { key: 'cost_evm', label: 'Cost & EVM', chainKey: 'ipp_evm', description: 'Earned value management — CPI, SPI, EAC.', mockStates: ['draft','approved','monitoring','variance_review','closed'], mockState: 'monitoring' },
      { key: 'milestone_variance', label: 'Milestone variance', chainKey: 'milestone_variance_report', description: 'Formal milestone variance reports (W207).' },
    ],
  },
  {
    key: 'construction',
    label: 'Construction',
    icon: '⬡',
    color: 'oklch(0.50 0.14 55)',
    features: [
      { key: 'procurement', label: 'Procurement / RFPs', chainKey: 'procurement_rfp', description: 'REIPPPP RFP and procurement chain.', mockStates: ['draft','issued','evaluation','awarded','completed','cancelled'], mockState: 'evaluation' },
      { key: 'cod', label: 'Construction / COD', chainKey: 'cod_chain', description: 'NERSA §C-5 construction and COD workflow.', mockStates: ['design','procurement','construction','mechanical_completion','commissioning','cod','post_cod'], mockState: 'commissioning' },
      { key: 'subcontractors', label: 'Subcontractors', chainKey: 'ipp_subcontractor', description: 'Subcontractor register and compliance.' },
      { key: 'dfr', label: 'Daily field report', chainKey: 'dfr', description: 'Construction daily field reports.' },
      { key: 'site_diary', label: 'Site diary', chainKey: 'ipp_construction_diary', description: 'Site diary and inspection records (W143).' },
      { key: 'punch_list', label: 'Punch list', chainKey: 'punch_list', description: 'Pre-COD punch list items and closure.' },
      { key: 'mir', label: 'Material inspections', chainKey: 'ipp_mir', description: 'Material inspection request records.' },
      { key: 'handover_dossier', label: 'Handover dossier', chainKey: 'handover_dossier', description: 'O&M handover documentation package.' },
      { key: 'project_change_order', label: 'Change orders', chainKey: 'project_change_order', description: 'Project change-order / variation control (W81).' },
      { key: 'submittal_rfi', label: 'Submittals / RFIs', chainKey: 'submittal_rfi', description: 'EPC submittal and RFI document control (W96).' },
    ],
  },
  {
    key: 'documents',
    label: 'Documents',
    icon: '▤',
    color: 'oklch(0.48 0.10 200)',
    features: [
      { key: 'document_control', label: 'Document control', chainKey: 'ipp_doc_control', description: 'Project document register and revision control.', mockStates: ['submitted','under_review','approved','superseded','rejected'], mockState: 'under_review' },
      { key: 'submittals', label: 'Submittals', chainKey: 'ipp_submittal', description: 'EPC submittal register.' },
      { key: 'rfis', label: 'RFIs', chainKey: 'ipp_rfi', description: 'Requests for information.' },
      { key: 'change_orders', label: 'Change orders', chainKey: 'project_change_order', description: 'Project change order log.' },
      { key: 'technical_queries', label: 'Technical queries', chainKey: 'ipp_tq', description: 'Engineering technical query register.' },
      { key: 'site_instructions', label: 'Site instructions', chainKey: 'site_instruction', description: 'Engineer site instructions (W144).' },
      { key: 'dlp_defects', label: 'DLP defects', chainKey: 'dlp_defect', description: 'Defects liability period tracking (W145).' },
      { key: 'variation_orders', label: 'Variation orders', chainKey: 'variation_order', description: 'Variation order chain (W146).' },
      { key: 'payment_certs', label: 'Payment certificates', chainKey: 'ipp_payment_cert', description: 'Progress payment certificates (W147).' },
      { key: 'final_completion', label: 'Final completion', chainKey: 'ipp_final_completion', description: 'Final completion certificate (W148).' },
      { key: 'om_handover', label: 'O&M handover', chainKey: 'ipp_om_handover', description: 'O&M handover package (W149).' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: '◎',
    color: 'oklch(0.42 0.12 140)',
    features: [
      { key: 'insurance', label: 'Insurance', description: 'Active insurance policies register.' },
      { key: 'insurance_claims', label: 'Insurance claims', chainKey: 'insurance_claim', description: 'FSCA Section 38 insurance claim workflow.', mockStates: ['submitted','under_review','investigating','settled','rejected','closed'], mockState: 'investigating' },
      { key: 'bonds', label: 'Bonds', chainKey: 'ipp_performance_bonds', description: 'Performance bonds and expiry countdown.' },
      { key: 'progress_claims', label: 'Progress claims', chainKey: 'ipp_progress_claim', description: 'Progress claim certification chain.' },
      { key: 'cp_tracker', label: 'Conditions Precedent', chainKey: 'cp_tracker', description: 'Financial close CP tracker (W192).' },
      { key: 'drawdown_request', label: 'Drawdown requests', chainKey: 'drawdown', description: 'SARB IE-gated drawdown chain (W21).', mockStates: ['draft','ie_review','lender_review','approved','disbursed','rejected'], mockState: 'lender_review' },
      { key: 'green_bond_reports', label: 'Green bond reports', chainKey: 'green_bond_report', description: 'Green bond framework reports (W202).' },
      { key: 'dscr_reports', label: 'DSCR reports', chainKey: 'dscr_report', description: 'Debt service coverage ratio reports (W212).' },
      { key: 'credit_insurance', label: 'Credit insurance', chainKey: 'credit_insurance', description: 'Credit insurance facility (W218).' },
      { key: 'take_or_pay', label: 'Take-or-pay claims', chainKey: 'curtailment_claim', description: 'Generator take-or-pay claim chain.' },
    ],
  },
  {
    key: 'risk_quality',
    label: 'Risk & Quality',
    icon: '◩',
    color: 'oklch(0.48 0.14 30)',
    features: [
      { key: 'stage_gates', label: 'Stage gates', chainKey: 'stage_gate', description: 'DG0–DG4 development gate reviews.', mockStates: ['dg0_pending','dg1_pending','dg2_pending','dg3_pending','dg4_pending','approved','rejected'], mockState: 'dg2_pending' },
      { key: 'risk_register', label: 'Risk register', description: 'Project risk register — severity × likelihood.' },
      { key: 'issues_log', label: 'Issues log', description: 'Open issues log and resolution tracking.' },
      { key: 'stakeholder_register', label: 'Stakeholder register', description: 'Stakeholder map and engagement log.' },
      { key: 'itp', label: 'ITP / Quality plan', chainKey: 'itp', description: 'Inspection and test plan.' },
      { key: 'project_risk', label: 'Risk analysis (EMV)', chainKey: 'project_risk', description: 'Quantitative risk EMV/SRA analysis.' },
      { key: 'ncr', label: 'Non-conformance', chainKey: 'ncr', description: 'NCR log and corrective actions.' },
      { key: 'lessons_learned', label: 'Lessons learned', description: 'Project lessons learned register.' },
      // E2.7 — non-chain report/audit surfaces extracted from the IppWorkstationPage husk
      // (registered as ipp_developer:* in meridian/surfaces.tsx). annual_report backs W159
      // IppAnnualReportTab, whose chainKey ipp_acr is NOT in MERIDIAN_CHAINS (Bucket E).
      { key: 'reports', label: 'Reports & exports', description: 'REIPPPP, milestone-variance, DSCR and generation reports with pivots and certified exports.' },
      { key: 'annual_report', label: 'Annual compliance report', description: 'NERSA annual compliance report (W159) with CSV / PDF export.' },
      { key: 'audit', label: 'Audit & compliance', description: 'Tamper-evident audit chain, certified exports and milestone-evidence reconciliation.' },
    ],
  },
  {
    key: 'regulatory_risk',
    label: 'Regulatory Compliance',
    icon: '⬓',
    color: 'oklch(0.44 0.10 320)',
    features: [
      { key: 'licence_obligations', label: 'Licence obligations', chainKey: 'licence_obligation', description: 'NERSA licence obligation register (W193).' },
      { key: 'ed_chain', label: 'ED commitments', chainKey: 'ed_commitment', description: 'REIPPPP economic development commitments (W27).', mockStates: ['scheduled','active','under_review','compliant','breach','cure','dmre_penalty'], mockState: 'active' },
      { key: 'lc_report', label: 'Local content & SED', chainKey: 'ipp_lcr', description: 'Local content and SED compliance (W174).' },
      { key: 'bbbee_verification', label: 'BBBEE verification', chainKey: 'ipp_bbbee', description: 'Annual BBBEE verification (W182).' },
      { key: 'reipppp_reports', label: 'REIPPPP progress report', chainKey: 'ipp_rpr', description: 'Annual REIPPPP progress report (W185).' },
      { key: 'licence_returns', label: 'NERSA licence return', chainKey: 'ipp_anr', description: 'Annual NERSA licence return (W184).' },
      { key: 'annual_audit', label: 'Annual audit', chainKey: 'ipp_aud', description: 'Financial statements and audit (W189).' },
      { key: 'cbt_sed_report', label: 'CBT/SED DMRE report', chainKey: 'cbt_sed_report', description: 'CBT/SED DMRE report review (W230).' },
    ],
  },
  {
    key: 'safety_grid',
    label: 'Safety & Grid',
    icon: '⬡',
    color: 'oklch(0.46 0.14 155)',
    features: [
      { key: 'hse_chain', label: 'HSE incidents', chainKey: 'hse_incident', description: 'OHSA s24/NEMA s30 incident chain (W25).', mockStates: ['reported','investigating','authority_notified','remediation','closed'], mockState: 'investigating' },
      { key: 'cyber_chain', label: 'Cyber incidents', chainKey: 'cyber_incident', description: 'POPIA s22 cyber incident chain (W26).' },
      { key: 'planned_outages', label: 'Planned outages', chainKey: 'planned_outage', description: 'NERSA Grid Code planned outage chain (W18).' },
      { key: 'gca_chain', label: 'Grid connection', chainKey: 'gca_connection', description: 'NERSA Grid Code C-1 connection agreement (W28).' },
      { key: 'method_statements', label: 'Method statements', chainKey: 'ipp_method_statement', description: 'Construction method statement register.' },
      { key: 'warranty_claims', label: 'Warranty / RMA', chainKey: 'warranty_claim', description: 'OEM warranty and RMA claims (W15).' },
      { key: 'export_curtailments', label: 'Grid export curtailments', chainKey: 'export_curtailment', description: 'Grid export curtailment claims (W221).' },
      // E2.7 — non-chain inline surfaces extracted from the IppWorkstationPage husk.
      { key: 'gtia', label: 'GTIA', description: 'Grid Technical Interface Agreement — protection and SCADA settings with the network operator (W224).' },
      { key: 'community', label: 'Community', description: 'Per-project ED/SED commitments, stakeholder register and engagement log.' },
    ],
  },
  {
    key: 'predictive_ml',
    label: 'Predictive ML',
    icon: '◇',
    color: 'oklch(0.46 0.16 290)',
    // E2.7 — shared connector + ML tabs (NOT chains) registered as ipp_developer:* in
    // meridian/surfaces.tsx via the connector/ML trio adapters. These feature keys carry the
    // slugs the registry expects so Atlas routes them to /surface (no chainKey).
    features: [
      { key: 'scada', label: 'SCADA connectors', description: 'SCADA telemetry connector — real-time plant measurement ingestion.' },
      { key: 'mqtt-opcua', label: 'MQTT / OPC-UA', description: 'Industrial MQTT / OPC-UA telemetry connector configuration.' },
      { key: 'anomaly-detection', label: 'Anomaly detection', description: 'Predictive anomaly-detection ML on plant telemetry.' },
      { key: 'rul-prediction', label: 'RUL prediction', description: 'Remaining-useful-life prediction for plant assets.' },
      { key: 'fault-fingerprint', label: 'Fault fingerprint', description: 'Physics-based fault-fingerprint ML diagnostics.' },
      { key: 'invite_partners', label: 'Invite partners', description: 'Invite lenders, offtakers and carbon funds to your projects via a direct registration link.' },
    ],
  },
  {
    key: 'environmental',
    label: 'Environmental',
    icon: '◉',
    color: 'oklch(0.46 0.12 165)',
    features: [
      { key: 'ea_amendment', label: 'EA amendment', chainKey: 'ipp_eam', description: 'Environmental authorisation amendment (W169).' },
      { key: 'wul', label: 'Water use licence', chainKey: 'ipp_wul', description: 'DWAF water use licence (W170).' },
      { key: 'hra', label: 'Heritage assessment', chainKey: 'ipp_hra', description: 'SAHRA heritage resources assessment (W171).' },
      { key: 'ael', label: 'Atmospheric emission', chainKey: 'ipp_ael', description: 'DEA atmospheric emission licence (W172).' },
      { key: 'env_monitoring', label: 'Environmental monitoring', chainKey: 'ipp_env_monitoring', description: 'EMP compliance monitoring reports.' },
    ],
  },
];

// ─── Trader ──────────────────────────────────────────────────────────────────

const traderDomains: Domain[] = [
  {
    key: 'active_trading',
    label: 'Active Trading',
    icon: '◈',
    color: 'oklch(0.46 0.16 55)',
    features: [
      { key: 'orders', label: 'Open orders', description: 'Live order book — GTC/IOC/FOK orders.' },
      { key: 'positions', label: 'Positions', description: 'Real-time position marks across energy types.' },
      { key: 'trades', label: 'Trade blotter', description: 'Executed trades with P&L attribution.' },
      { key: 'rejections', label: 'Rejections', description: 'Pre-trade guard rejections with explainer.' },
    ],
  },
  {
    key: 'risk_margin',
    label: 'Risk & Margin',
    icon: '◩',
    color: 'oklch(0.46 0.14 30)',
    features: [
      { key: 'risk', label: 'Risk dashboard', description: 'Daily VaR, scenarios, exposure limits.' },
      { key: 'margin', label: 'Margin calls', description: 'IM/VM margin call lifecycle.', mockStates: ['issued','acknowledged','disputed','met','defaulted'], mockState: 'issued' },
      { key: 'poslimit_case', label: 'Position limits', chainKey: 'poslimit_case', description: 'FSCA s41 position limit breach machine (W29).', mockStates: ['compliant','warning','breach','escalated','forced_liquidation'], mockState: 'warning' },
      { key: 'counterparty_margin', label: 'Counterparty margin', chainKey: 'counterparty_margin', description: 'CPMI-IOSCO counterparty margin & default (W68).', mockStates: ['monitoring','margin_call','default_declared','close_out','default_fund_draw'], mockState: 'monitoring' },
      { key: 'benchmark_transition', label: 'Benchmark transition', chainKey: 'benchmark_transition', description: 'LIBOR/JIBAR to ZARONIA migration.' },
    ],
  },
  {
    key: 'post_trade',
    label: 'Post-trade & Settlement',
    icon: '◎',
    color: 'oklch(0.42 0.12 140)',
    features: [
      { key: 'settlement', label: 'Settlement', chainKey: 'settlement_fail', description: 'Daily settlement runs and breaks.' },
      { key: 'trade_allocation', label: 'Trade allocation', chainKey: 'trade_allocation', description: 'DTCC-style block→per-account allocation (W76).', mockStates: ['executed','pending_allocation','allocated','affirmed','matched','settled'], mockState: 'allocated' },
      { key: 'trade_report', label: 'Trade reporting', chainKey: 'trade_report', description: 'FMA post-trade repository reporting (W44).', mockStates: ['draft','submitted','acknowledged','accepted','rejected','resubmitted'], mockState: 'submitted' },
      { key: 'best_execution', label: 'Best-execution / RFQ', chainKey: 'best_execution', description: 'FSCA Conduct Standard RFQ chain (W36).', mockStates: ['rfq_sent','quotes_received','quote_selected','executed','confirmed'], mockState: 'quotes_received' },
      { key: 'exceptions', label: 'Post-trade exceptions', description: 'Post-trade mismatches (price, volume, settlement) triage and resolution.' },
      { key: 'imbalance', label: 'Imbalance settlement', chainKey: 'imbalance_settlement', description: 'Grid imbalance cash-out settlement.' },
      { key: 'black_start', label: 'Black start', chainKey: 'black_start', description: 'NETSO black-start cost recovery.' },
      { key: 'benchmark_transition', label: 'Benchmark transition', chainKey: 'benchmark_transition', description: 'JIBAR cessation / benchmark fallback transition (W90).' },
    ],
  },
  {
    key: 'compliance_reporting',
    label: 'Compliance & Reporting',
    icon: '⬓',
    color: 'oklch(0.44 0.10 320)',
    features: [
      { key: 'market_abuse_case', label: 'Market surveillance', chainKey: 'market_abuse_case', description: 'FMA Ch.X market abuse STOR machine (W52).', mockStates: ['monitoring','alert_raised','investigation','file_stor','cleared','dismissed'], mockState: 'monitoring' },
      // W9 MM compliance is a chain widget but oe_mm_obligations is deliberately excluded from
      // MERIDIAN_CHAINS ("not a case-list model"), so it has NO chainKey here — Atlas routes it
      // to /surface/oe_mm_obligations (registered trader:oe_mm_obligations) not /ledger (E2.3).
      { key: 'oe_mm_obligations', label: 'MM compliance', description: 'Market-making consecutive-miss breach (W9).', mockStates: ['none','warning','breach','escalated'], mockState: 'none' },
      { key: 'algo_certification', label: 'Algo certification', chainKey: 'algo_certification', description: 'FMA/FSCA MiFID RTS6 algo cert gate (W60).', mockStates: ['submitted','testing','review','approved','deployed_live','suspended'], mockState: 'testing' },
      { key: 'esg_reports', label: 'ESG / sustainability', route: '/esg', description: 'ESG disclosure and Scope 3 reports.' },
      { key: 'article6', label: 'Article 6 ITMO', chainKey: 'article6_adjustment', description: 'UNFCCC corresponding-adjustment ledger (W4).' },
      { key: 'black_start_chain', label: 'Black start chain', chainKey: 'black_start', description: 'NERSA black-start compliance.' },
      // Connectors (shared) + report/audit surfaces — added in E2.3 so Atlas can reach the
      // trader:* surfaces registered in meridian/surfaces.tsx (the husk tabs had no roleData feature).
      { key: 'strate-swift', label: 'Settlement rails (W124)', description: 'STRATE/SWIFT settlement connectors.' },
      { key: 'sap-oracle-erp', label: 'ERP connectors (W125)', description: 'SAP/Oracle ERP integration.' },
      { key: 'government-filing', label: 'Filing connectors (W126)', description: 'NERSA/SARS government filing connectors.' },
      { key: 'reports', label: 'Reports & exports', description: 'Trade settlement, best-execution and FSCA trade reports with pivots and exports.' },
      { key: 'audit', label: 'Audit & compliance', description: 'Tamper-evident audit chain, certified exports and trade reconciliation.' },
    ],
  },
];

// ─── Lender ──────────────────────────────────────────────────────────────────

const lenderDomains: Domain[] = [
  {
    key: 'origination',
    label: 'Origination',
    icon: '◈',
    color: 'oklch(0.46 0.12 200)',
    features: [
      { key: 'credit_facility_application', label: 'Credit origination', chainKey: 'credit_facility_application', description: 'NCA/Basel III credit facility origination (W53).', mockStates: ['submitted','credit_review','committee','approved','declined','activated'], mockState: 'credit_review' },
      { key: 'facilities', label: 'Facilities', description: 'Active credit facilities portfolio.' },
      { key: 'loan_transfer', label: 'Loan transfer / secondary', chainKey: 'loan_transfer', description: 'LMA secondary-market loan participation (W61).', mockStates: ['submitted','due_diligence','sarb_notification','approved','settled'], mockState: 'due_diligence' },
    ],
  },
  {
    key: 'monitoring',
    label: 'Monitoring',
    icon: '◩',
    color: 'oklch(0.46 0.14 155)',
    features: [
      { key: 'drawdown', label: 'Drawdowns / UoP', chainKey: 'drawdown', description: 'IE+CP gated drawdown and use-of-proceeds (W30).', mockStates: ['draft','ie_review','approved','disbursed','clawback_triggered'], mockState: 'ie_review' },
      { key: 'covenant_certificate', label: 'Covenant certificates', chainKey: 'covenant_certificate', description: 'LMA covenant compliance certificates (W38).', mockStates: ['requested','submitted','under_review','waiver_requested','compliant','breach','acceleration'], mockState: 'under_review' },
      { key: 'security_perfection', label: 'Security perfection', chainKey: 'security_perfection', description: 'Deeds/STRATE security registration (W69).', mockStates: ['draft','filed','cession_registered','perfected','lapsed'], mockState: 'cession_registered' },
      { key: 'dscr_monitoring', label: 'DSCR monitoring', chainKey: 'dscr_monitoring', description: 'Quarterly DSCR/LLCR covenant testing with cure lifecycle (W86).', mockStates: ['period_open','computed','watch','breach_recorded','lock_up','cure_in_progress','certified_clean','accelerated'], mockState: 'computed' },
      { key: 'reserve_account', label: 'Reserve accounts', chainKey: 'reserve_account', description: 'DSRA/MRA funding, drawdown, cure and release (W77).', mockStates: ['reserve_required','funding_in_progress','funded','shortfall_flagged','cure_pending','drawn','released','breached'], mockState: 'funded' },
      { key: 'portfolio', label: 'Portfolio overview', description: 'Portfolio NAV, exposure, and sector map.' },
      { key: 'lender_risk', label: 'Risk dashboard', description: 'Concentration, covenant breach, watch-list.' },
    ],
  },
  {
    key: 'enforcement',
    label: 'Enforcement',
    icon: '⬓',
    color: 'oklch(0.44 0.15 30)',
    features: [
      { key: 'loan_default', label: 'Default & enforcement', chainKey: 'loan_default', description: 'LMA event-of-default enforcement/step-in (W45).', mockStates: ['performing','watchlist','event_of_default','standstill','enforcement','step_in','restructure','write_off'], mockState: 'watchlist' },
      { key: 'loan_restructure', label: 'Restructure & A&E', chainKey: 'loan_restructure', description: 'LMA Amend & Extend / forbearance with credit-committee gate (W108).', mockStates: ['trigger_event','restructure_proposal_drafted','lender_credit_committee_review','term_sheet_signed','effective_date','completed','escalated_to_default'], mockState: 'lender_credit_committee_review' },
      { key: 'dunning', label: 'Dunning queue', description: 'Cycle 1/2/3 borrower observation notices with cure deadlines and escalation (W6).' },
    ],
  },
  {
    key: 'risk_lender',
    label: 'Risk',
    icon: '◎',
    color: 'oklch(0.46 0.14 55)',
    features: [
      { key: 'sll_kpi', label: 'SLL KPI & ratchet', chainKey: 'sll_kpi', description: 'Sustainability-linked KPI compliance with margin ratchet (W95).', mockStates: ['baseline_set','kpi_period_open','independent_verification','kpi_attested','ratchet_computed','breach_recorded','cure_period','margin_amended','cure_failed'], mockState: 'kpi_attested' },
      { key: 'esg_lender', label: 'ESG / DFI monitoring', route: '/esg', description: 'Equator Principles E&S monitoring.' },
      { key: 'benchmark_lender', label: 'Benchmark transition', description: 'JIBAR→ZARONIA credit facility resets.' },
      { key: 'concentrations', label: 'Large-exposure concentration', description: 'SARB large-exposure limits monitoring.' },
    ],
  },
  {
    key: 'reporting_lender',
    label: 'Reporting',
    icon: '▤',
    color: 'oklch(0.42 0.08 250)',
    features: [
      { key: 'ie_certifications', label: 'IE certifications', description: 'Independent engineer sign-off register.' },
      { key: 'facility_reports', label: 'Facility reports', description: 'Periodic facility utilisation reports.' },
      { key: 'covenant_reports', label: 'Covenant summary', description: 'Cross-facility covenant status dashboard.' },
      { key: 'carbon_lender', label: 'ESG carbon reports', description: 'Carbon accounting for DFI portfolios.' },
      { key: 'reports', label: 'Reports & exports', description: 'Covenant certificates, DSCR, drawdown and EP IV ESAP reports with pivots and exports.' },
      { key: 'strate-swift', label: 'Settlement rails (W124)', description: 'STRATE/SWIFT settlement connectors.' },
      { key: 'sap-oracle-erp', label: 'ERP connectors (W125)', description: 'SAP/Oracle ERP integration.' },
      { key: 'government-filing', label: 'Filing connectors (W126)', description: 'NERSA/SARS government filing connectors.' },
      { key: 'audit', label: 'Audit & compliance', description: 'Tamper-evident audit chain, certified exports and facility reconciliation.' },
    ],
  },
];

// ─── Offtaker ─────────────────────────────────────────────────────────────────

const offtakerDomains: Domain[] = [
  {
    key: 'contracts',
    label: 'Contracts',
    icon: '▤',
    color: 'oklch(0.46 0.12 200)',
    features: [
      { key: 'ppa_contract_chain', label: 'PPA contracts', chainKey: 'ppa_contract_chain', description: 'NERSA s34 PPA execution chain (W22).', mockStates: ['draft','negotiation','legal_review','signed','active','expired','terminated'], mockState: 'active' },
      { key: 'tariff_indexation', label: 'Tariff indexation', chainKey: 'tariff_indexation', description: 'IFRS 16 / NERSA s4 annual CPI repricing (W39).', mockStates: ['scheduled','notice_issued','disputed','agreed','applied'], mockState: 'scheduled' },
      { key: 'ppa_termination', label: 'PPA termination', chainKey: 'ppa_termination', description: 'NERSA s34 + IFRS 16 ETA buy-out (W62).', mockStates: ['notice_given','valuation','agreed','disputed','terminated'], mockState: 'notice_given' },
      { key: 'rec_lifecycle', label: 'REC / GO lifecycle', chainKey: 'rec_lifecycle', description: 'I-REC/SAREC attribute certificate (W70).', mockStates: ['device_registered','metered','issued','transferred','retired','clawed_back'], mockState: 'issued' },
      { key: 'change_in_law', label: 'Change-in-law relief', chainKey: 'ppa_change_in_law', description: 'Qualifying-change cost pass-through & relief, arbitration branch (W78).', mockStates: ['event_logged','eligibility_review','claim_submitted','negotiation','in_arbitration','relief_granted','implemented'], mockState: 'negotiation' },
      { key: 'wheeling_access', label: 'Wheeling access', chainKey: 'wheeling_access', description: 'Third-party transmission access agreement (W219).', mockStates: ['requested','study','offered','accepted','active','terminated'], mockState: 'active' },
      { key: 'virtual_ppa_settlement', label: 'Virtual PPA / CfD', chainKey: 'virtual_ppa_settlement', description: 'Contract-for-difference financial PPA settlement (W229).', mockStates: ['period_open','strike_set','settled','disputed','reconciled'], mockState: 'settled' },
      { key: 'slb_kpi', label: 'SLB KPI ratchet', chainKey: 'slb_kpi_ratchet', description: 'Sustainability-linked-bond KPI margin ratchet (W204).', mockStates: ['target_set','measured','verified','ratchet_applied','disputed'], mockState: 'measured' },
      { key: 'procurement_options', label: 'Procurement options', route: '/procurement', description: 'Active RFP responses and LOI pipeline.' },
      { key: 'ppa_variations', label: 'PPA variations', description: 'Signed PPA amendment register.' },
    ],
  },
  {
    key: 'operations_offtaker',
    label: 'Operations',
    icon: '◈',
    color: 'oklch(0.46 0.14 155)',
    features: [
      { key: 'take_or_pay', label: 'Take-or-pay obligations', chainKey: 'ppa_take_or_pay', description: 'IFRS 16 + NERSA s34 ToP machine (W32).', mockStates: ['contracted','delivered','shortfall','cure_window','disputed','settled'], mockState: 'contracted' },
      { key: 'curtailment_claim', label: 'Curtailment claims', chainKey: 'curtailment_claim', description: 'Deemed-energy compensation chain (W46).', mockStates: ['claim_lodged','validated','quantum_agreed','settled','disputed','arbitration'], mockState: 'validated' },
      { key: 'ppa_nomination', label: 'Energy nominations', chainKey: 'ppa_nomination', description: 'Day-ahead nomination & deviation settlement at the deviation tariff (W87).', mockStates: ['nomination_window_open','da_nominated','da_confirmed','delivery_complete','reconciled','dispute_raised','deviation_settled'], mockState: 'reconciled' },
      { key: 'annual_recon', label: 'Annual reconciliation', chainKey: 'ppa_annual_recon', description: 'IFRS 15 / NERSA s34 annual true-up & financial close (W101).', mockStates: ['year_opened','data_collected','reconciled','signed_off','invoiced','settled','restated'], mockState: 'reconciled' },
      { key: 'unserved_energy_claims', label: 'Unserved-energy claims', chainKey: 'unserved_energy_claim', description: 'Use-of-system unserved-energy claim chain.', mockStates: ['claim_lodged','validated','quantum_agreed','settled','disputed'], mockState: 'validated' },
      { key: 'delivery_reports', label: 'Delivery reports', description: 'Monthly MWh contracted vs delivered.' },
      { key: 'billing', label: 'Billing & payments', description: 'Invoice register and payment status.' },
      { key: 'metering', label: 'Metering & reconciliation', description: 'Smart meter reconciliation data.' },
      { key: 'wheeling', label: 'Wheeling statements', description: 'Third-party access wheeling charges.' },
      { key: 'sites', label: 'Sites & groups', description: 'Delivery-point and site-group register.' },
      { key: 'tariffs', label: 'Tariffs', description: 'Tariff schedule and TOU rate register.' },
      { key: 'budgets', label: 'Budget vs actual', description: 'Per-period energy budget vs actual consumption.' },
      { key: 'bills', label: 'Bill upload & AI', description: 'AI bill analyser, PPA-mix optimiser and LOI drafter.' },
    ],
  },
  {
    key: 'security_offtaker',
    label: 'Payment Security',
    icon: '◉',
    color: 'oklch(0.44 0.14 30)',
    features: [
      { key: 'ppa_payment_security', label: 'Payment security', chainKey: 'ppa_payment_security', description: 'Guarantee/LC/PCG bankability backstop (W54).', mockStates: ['issued','active','expiry_warning','renewed','forfeited'], mockState: 'active' },
      { key: 'credit_support', label: 'Credit support docs', description: 'LC, PCG and guarantee register.' },
      { key: 'obligations', label: 'Obligations register', description: 'Payment-security and contractual obligation register.' },
    ],
  },
  {
    key: 'compliance_offtaker',
    label: 'Compliance',
    icon: '⬓',
    color: 'oklch(0.44 0.10 320)',
    features: [
      { key: 'esg_disclosure', label: 'ESG disclosure', chainKey: 'esg_disclosure', description: 'ESG disclosure and assurance chain.' },
      { key: 'scope3', label: 'Scope 3 value-chain', chainKey: 'carbon_scope3_disclosure', description: 'Value-chain Scope 3 emission disclosure.' },
      { key: 'carbon_offset', label: 'Carbon offsets', chainKey: 'carbon_offset_claim', description: 'Carbon Tax Act offset claim management.' },
      { key: 'rec_retirement', label: 'REC retirement', description: 'Scope-2 zero-carbon claim certificates.' },
      { key: 'green_tariff', label: 'Green tariff disclosure', chainKey: 'green_tariff_disclosure', description: 'Green-tariff / RE100 disclosure chain (W210).', mockStates: ['draft','submitted','verified','published','disputed'], mockState: 'submitted' },
      { key: 'scope2', label: 'Scope 2 emissions', description: 'Annual location/market-based Scope 2 disclosures.' },
      { key: 'popia_data', label: 'POPIA data rights', route: '/popia', description: 'Data subject access and correction log.' },
      { key: 'annual_reports', label: 'Sustainability reports', description: 'Annual sustainability and GRI reports.' },
      { key: 'strate-swift', label: 'Settlement rails', description: 'STRATE / SWIFT settlement-rail connector.' },
      { key: 'sap-oracle-erp', label: 'ERP connectors', description: 'SAP / Oracle ERP integration connector.' },
      { key: 'government-filing', label: 'Filing connectors', description: 'Government statutory-filing connector.' },
      { key: 'audit', label: 'Audit & compliance', description: 'Tamper-evident audit log, REC reconciliation and certified exports.' },
    ],
  },
  {
    key: 'reporting_offtaker',
    label: 'Reporting',
    icon: '▤',
    color: 'oklch(0.42 0.08 250)',
    features: [
      { key: 'ppa_portfolio', label: 'PPA portfolio', description: 'Portfolio summary — MW, cost, term.' },
      { key: 'energy_cost', label: 'Energy cost analysis', description: 'Blended tariff and cost-per-MWh trends.' },
      { key: 'reports', label: 'Reports & exports', description: 'PPA, statutory, green-tariff and Scope 2 report exports.' },
    ],
  },
];

// ─── Carbon Fund ─────────────────────────────────────────────────────────────

const carbonDomains: Domain[] = [
  {
    key: 'project_pipeline',
    label: 'Project Pipeline',
    icon: '◈',
    color: 'oklch(0.46 0.12 165)',
    features: [
      { key: 'registration_chain', label: 'Project registration', chainKey: 'carbon_registration', description: 'Gold Standard / Verra / Art 6.4 registration (W37).', mockStates: ['pdd_draft','validation','public_comment','dna_loa','registered','rejected'], mockState: 'validation' },
      { key: 'crediting_renewal_chain', label: 'Crediting renewal', chainKey: 'crediting_period_renewal', description: 'Verra/GS crediting-period renewal (W56).', mockStates: ['scheduled','baseline_reassessment','validation','approved','renewed','refused'], mockState: 'baseline_reassessment' },
      { key: 'poa_cpa_inclusion_chain', label: 'PoA / CPA inclusion', chainKey: 'poa_cpa_inclusion', description: 'CDM-PoA grouped programme inclusion (W73).', mockStates: ['screening','eligibility','methodology_check','loa_gate','included','excluded'], mockState: 'eligibility' },
      { key: 'vintages', label: 'Vintage workflow', description: 'Credit vintage pipeline — status by year.' },
      { key: 'vcm_project_development', label: 'VCM project development', chainKey: 'vcm_project_development', description: 'Voluntary carbon market development pipeline.' },
    ],
  },
  {
    key: 'mrv_verification',
    label: 'MRV & Verification',
    icon: '◩',
    color: 'oklch(0.48 0.10 200)',
    features: [
      { key: 'mrv_chain', label: 'Verification chain', chainKey: 'mrv_submissions', description: '14-state UNFCCC MRV verification (W11).', mockStates: ['validation','site_audit','cra_review','issuance_pending','issued','rejected'], mockState: 'site_audit' },
      { key: 'mrv', label: 'MRV submissions', description: 'Monitoring, reporting and verification records.' },
      { key: 'ccp_assessment_chain', label: 'CCP eligibility', chainKey: 'ccp_assessment', description: 'Calyx Global CCP-eligibility assessment.' },
      { key: 'methodology_amendments', label: 'Methodology amendments', chainKey: 'methodology_amendment', description: 'Approved methodology change register.' },
    ],
  },
  {
    key: 'issuance_registry',
    label: 'Issuance & Registry',
    icon: '◎',
    color: 'oklch(0.42 0.12 140)',
    features: [
      { key: 'carbon_issuance_chain', label: 'Credit issuance', chainKey: 'carbon_issuance', description: 'Carbon credit issuance chain.' },
      { key: 'certificates', label: 'Retirement certificates', description: 'Issued retirement certificates registry.' },
      { key: 'certificate_bundle', label: 'Certificate bundles', chainKey: 'certificate_bundle', description: 'Bundled credit registry for bulk transfers.' },
    ],
  },
  {
    key: 'article6_compliance',
    label: 'Article 6 & Compliance',
    icon: '⬓',
    color: 'oklch(0.44 0.10 320)',
    features: [
      { key: 'article6', label: 'Article 6 ITMO', chainKey: 'article6_adjustment', description: 'UNFCCC ITMO corresponding-adjustment ledger (W4).', mockStates: ['pending_transfer','under_review','adjusted','retired','disputed'], mockState: 'under_review' },
      { key: 'esg_disclosure_chain', label: 'ESG disclosure', chainKey: 'esg_disclosure', description: 'ESG disclosure and third-party assurance.' },
      { key: 'scope3_disclosure_chain', label: 'Scope 3 disclosure', chainKey: 'carbon_scope3_disclosure', description: 'Value-chain Scope 3 emission disclosure.' },
      { key: 'reports', label: 'Reports & exports', description: 'Issuance, retirement and offset-claim reports with pivots and exports.' },
      { key: 'audit', label: 'Audit & compliance', description: 'Tamper-evident audit chain, certified exports and registry reconciliation.' },
    ],
  },
  {
    key: 'retirement_offset',
    label: 'Retirement & Offset',
    icon: '⬡',
    color: 'oklch(0.46 0.14 55)',
    features: [
      { key: 'retirement_chain', label: 'Retirement chain', chainKey: 'carbon_retirement', description: 'Per-scope SLA retirement chain (W17).', mockStates: ['requested','validation','retired','cancelled'], mockState: 'requested' },
      { key: 'reversal_chain', label: 'Reversals', chainKey: 'carbon_reversal', description: 'Verra/GS buffer-pool reversal chain (W42).' },
      { key: 'offset_claim_chain', label: 'Tax offset claims', chainKey: 'carbon_offset_claim', description: 'Carbon Tax Act §13 offset claim (W48).', mockStates: ['submitted','sars_review','under_audit','grant','reject','clawback'], mockState: 'sars_review' },
      { key: 'carbon_tax_returns', label: 'Carbon tax returns', chainKey: 'carbon_tax_return', description: 'Carbon Tax Act returns filing (W200).' },
      { key: 'carbon_budget', label: 'Carbon budget', chainKey: 'carbon_budget', description: 'Annual carbon budget allocation.' },
    ],
  },
  {
    key: 'trading_markets',
    label: 'Trading & Markets',
    icon: '◈',
    color: 'oklch(0.46 0.13 270)',
    features: [
      { key: 'erpa_chain', label: 'Forward ERPA delivery', chainKey: 'carbon_erpa', description: 'Carbon forward delivery / make-good (W65).', mockStates: ['execution','monitoring','delivery_window','delivery_verified','settled','make_good'], mockState: 'monitoring' },
      { key: 'credit_rating_chain', label: 'Credit quality rating', chainKey: 'carbon_credit_rating', description: 'Third-party carbon credit quality rating.' },
      { key: 'carbon_trading', label: 'OTC carbon trading', chainKey: 'carbon_registry_transfer', description: 'Spot and forward carbon credit OTC book.' },
    ],
  },
];

// ─── Grid Operator ───────────────────────────────────────────────────────────

const gridDomains: Domain[] = [
  {
    key: 'operations_grid',
    label: 'Grid Operations',
    icon: '◈',
    color: 'oklch(0.46 0.14 155)',
    features: [
      { key: 'dispatch_nominations', label: 'Dispatch nominations', chainKey: 'oe_dispatch_nominations', description: 'BRP→SO 10-state dispatch chain (W13).', mockStates: ['submitted','so_review','accepted','scheduled','activated','metered','settled','disputed'], mockState: 'activated' },
      { key: 'curtailment', label: 'Curtailment events', description: 'Load curtailment CSC-1 events log.', mockStates: ['instruction_issued','acknowledged','implemented','metered','compensated'], mockState: 'implemented' },
      { key: 'ancillary', label: 'Ancillary service events', description: 'Ancillary award acceptance / delivery / failure / settlement event log.' },
      { key: 'reserve_activation', label: 'Ancillary services', chainKey: 'reserve_activation', description: 'NTCSA reserve activation settlement (W50).', mockStates: ['activated','metered','validated','settled','disputed','settle_penalty'], mockState: 'metered' },
      { key: 'demand_response', label: 'Demand response (W205)', chainKey: 'demand_response_event', description: 'DR programme activation, metering and incentive settlement chain.', mockStates: ['notified','acknowledged','activated','load_shed','metered','performance_verified','settled','non_performance'], mockState: 'activated' },
      { key: 'interconnector_schedules', label: 'SAPP interconnector schedules (W234)', chainKey: 'interconnector_schedule', description: 'Cross-border SAPP interconnector schedule negotiation and delivery chain.', mockStates: ['schedule_draft','submitted_to_sapp','agreed','operating','completed','dispute'], mockState: 'operating' },
      { key: 'eop_activations', label: 'EOP activations (W215)', chainKey: 'eop_activation', description: 'Emergency Operations Plan contingency activation and post-event review chain.', mockStates: ['activated','restoration_in_progress','load_shedding_assessed','per_outstanding','per_completed','escalated_to_regulator'], mockState: 'restoration_in_progress' },
      { key: 'outage', label: 'Outage responses', description: 'Crew acknowledgement, dispatch, rerouting and restoration response log.' },
      { key: 'imbalance_settlement', label: 'Imbalance settlement', chainKey: 'imbalance_settlement', description: 'Real-time imbalance cash-out.' },
      { key: 'planned_outage_grid', label: 'Planned outages', chainKey: 'planned_outage', description: 'NERSA Grid Code planned outage log (W18).' },
      { key: 'load_curtailment', label: 'Load curtailment', chainKey: 'load_curtailment', description: 'NERSA §CSC-1 urgent curtailment (W34).' },
      { key: 'black_start_grid', label: 'Black start', chainKey: 'black_start', description: 'Black-start event log and cost recovery.' },
      { key: 'transmission_outage', label: 'Transmission outage', chainKey: 'transmission_outage', description: 'EHV/HV outage coordination with N-1 security assessment (W110).' },
      { key: 'grid_code_compliance', label: 'Grid code compliance', chainKey: 'grid_code_compliance', description: 'NRS 097 non-conformance monitoring (W67).', mockStates: ['monitoring','non_conformance','investigation','remediation','escalate_disconnection','closed'], mockState: 'monitoring' },
    ],
  },
  {
    key: 'connections',
    label: 'Connection Queue',
    icon: '⬡',
    color: 'oklch(0.46 0.12 200)',
    features: [
      { key: 'gca_grid', label: 'Connection agreements', chainKey: 'gca_connection', description: 'NERSA Grid Code C-1 GCA chain (W28).', mockStates: ['application','technical_evaluation','offer_issued','accepted','executed','lapsed'], mockState: 'technical_evaluation' },
      { key: 'rez_capacity', label: 'REZ capacity allocation', chainKey: 'rez_capacity', description: 'NTCSA 2024 capacity rules queue (W58).', mockStates: ['applied','queue_assessed','conditionally_allocated','allocated','rejected','lapsed'], mockState: 'queue_assessed' },
      { key: 'connection_energization', label: 'Connection energization', chainKey: 'connection_energization', description: 'Physical go-live COD commissioning (W75).', mockStates: ['connection_ready','protection_tested','energization_authorized','energized','commercial_operation','suspended'], mockState: 'energization_authorized' },
    ],
  },
  {
    key: 'compliance_grid',
    label: 'Compliance',
    icon: '⬓',
    color: 'oklch(0.44 0.10 320)',
    features: [
      { key: 'grid_code_ncr', label: 'Grid code NCRs', chainKey: 'gcc_ncr', description: 'Formal non-conformance notifications.' },
      { key: 'wheeling_charges', label: 'Wheeling & TPA charges', description: 'Monthly transmission use-of-system invoices.' },
      { key: 'nersa_reporting', label: 'NERSA statutory reporting', description: 'System operator annual statutory reports.' },
      { key: 'interconnection', label: 'Interconnection studies', description: 'Fault-level and thermal capacity studies.' },
      { key: 'availability_guarantee', label: 'Availability guarantees', chainKey: 'availability_guarantee', description: 'IEC 61724 O&M uptime guarantee (W51).' },
      { key: 'levy_compliance', label: 'Levy compliance', chainKey: 'levy_assessment', description: 'NERSA levy assessment register.' },
      { key: 'market_rules', label: 'Market rule changes', description: 'NERSA market rule consultation log.' },
      { key: 'smart_meter_asset', label: 'Smart meter assets (W199)', chainKey: 'smart_meter_asset', description: 'Smart-meter asset commissioning, data-quality and lifecycle chain.', mockStates: ['commissioning','data_quality_pass','operational','fault_detected','replacement_pending','decommissioned'], mockState: 'operational' },
      { key: 'substation_asset', label: 'Substation assets (W211)', chainKey: 'substation_asset', description: 'Substation/transformer asset condition, refurbishment and decommission chain.', mockStates: ['commissioning','energised','assessment','refurbishment','out_of_service','failed'], mockState: 'energised' },
      { key: 'scada', label: 'SCADA data', description: 'SCADA telemetry connector — real-time grid measurement ingestion.' },
      { key: 'mqtt-opcua', label: 'MQTT / OPC-UA connectors', description: 'Industrial MQTT / OPC-UA telemetry connector configuration.' },
      { key: 'reports', label: 'Reports & exports', description: 'Wheeling charges, dispatch nominations and grid-code compliance report exports.' },
      { key: 'audit', label: 'Audit & compliance', description: 'Tamper-evident grid-operator audit chain, certified exports and external reconciliation.' },
    ],
  },
];

// ─── Support / OEM ───────────────────────────────────────────────────────────

const supportDomains: Domain[] = [
  {
    key: 'itil_service_mgmt',
    label: 'ITIL Service Mgmt',
    icon: '◈',
    color: 'oklch(0.46 0.12 250)',
    features: [
      { key: 'tickets', label: 'Tickets', description: 'P1-P4 incident ticket queue with SLA timers.', mockStates: ['open','in_progress','waiting_on_customer','resolved','closed'], mockState: 'in_progress' },
      { key: 'ticket_chain', label: 'Ticket chain (W14)', chainKey: 'support_tickets', description: 'ITIL incident lifecycle P1–P4 chain.', mockStates: ['open','in_progress','resolved','closed'], mockState: 'open' },
      { key: 'service_request', label: 'Service requests', chainKey: 'service_request', description: 'ITIL service-request fulfilment chain (W104).' },
      { key: 'problem_chain', label: 'Problem management', chainKey: 'problem_record', description: 'ITIL 4 root-cause problem management (W41).', mockStates: ['raised','investigation','root_cause_identified','workaround','resolved','closed'], mockState: 'investigation' },
      { key: 'change_chain', label: 'Change enablement', chainKey: 'change_request', description: 'ITIL CAB/ECAB change RFC lifecycle (W47).', mockStates: ['requested','assessment','cab_review','approved','scheduled','implementing','implemented','pir','closed'], mockState: 'cab_review' },
      { key: 'escalations', label: 'Escalations', description: 'Tickets escalated to engineering/management.' },
      { key: 'csat', label: 'CSAT lifecycle', chainKey: 'csat_record', description: 'Customer satisfaction survey chain (W208).' },
      { key: 'sla_performance_reports', label: 'SLA performance', chainKey: 'sla_performance_report', description: 'SLA adherence reports (W217).' },
      { key: 'cyber_incident', label: 'Cyber incident', chainKey: 'cyber_incident', description: 'POPIA s22 / Cybercrimes Act breach response (W26).' },
    ],
  },
  {
    key: 'field_operations',
    label: 'Field Operations',
    icon: '⬡',
    color: 'oklch(0.46 0.14 55)',
    features: [
      { key: 'work_orders', label: 'Work orders', chainKey: 'work_order', description: 'P6 field work-order dispatch chain (W16).', mockStates: ['planned','assigned','parts_requested','travelling','on_site','completed','verified'], mockState: 'on_site' },
      { key: 'warranty_claims', label: 'Warranty / RMA', chainKey: 'warranty_claim', description: 'OEM 10-state warranty claim chain (W15).', mockStates: ['submitted','oem_review','parts_order','repair','close_out'], mockState: 'oem_review' },
      { key: 'pm_compliance', label: 'PM schedule compliance', chainKey: 'pm_compliance', description: 'IEC 62446 PM deferral compliance (W59).', mockStates: ['scheduled','due','work_assigned','completed','deferred','skip_review'], mockState: 'due' },
    ],
  },
  {
    key: 'oem_supply_chain',
    label: 'OEM & Supply Chain',
    icon: '◩',
    color: 'oklch(0.46 0.14 30)',
    features: [
      { key: 'spare_parts', label: 'Spare parts', chainKey: 'spare_parts_provisioning', description: 'VED-critical spare parts replenishment (W72).', mockStates: ['requisition','po_issued','backorder','in_transit','received','qc_gate','stocked','reserved','issued'], mockState: 'in_transit' },
      { key: 'warranty_recovery', label: 'Warranty recovery', chainKey: 'warranty_recovery', description: 'OEM cost-recovery claim chain (W63).' },
      { key: 'security_remediation', label: 'Vuln remediation', chainKey: 'security_remediation', description: 'CVSS-tiered OT security patching (W55).', mockStates: ['triage','patch_available','change_raised','testing','deployed','verified','risk_accepted'], mockState: 'patch_available' },
      { key: 'oem_fco', label: 'OEM FCO/ECN', chainKey: 'oem_fco', description: 'Field change order and engineering change notifications.' },
    ],
  },
  {
    key: 'platform_ops',
    label: 'Platform Ops',
    icon: '◎',
    color: 'oklch(0.44 0.08 250)',
    features: [
      { key: 'mqtt_opcua', label: 'MQTT/OPC-UA connectors', description: 'OT protocol connector health (W123).' },
      { key: 'anomaly_ml', label: 'Anomaly ML (W127)', description: '6-method ensemble anomaly detection.' },
      { key: 'rul_ml', label: 'RUL prediction (W128)', description: 'Remaining useful life prediction.' },
      { key: 'fault_ml', label: 'Fault fingerprint (W129)', description: '12-mode physics fault classification.' },
      { key: 'cross_tenant', label: 'Cross-tenant access', description: 'POPIA-logged cross-tenant access log.' },
      { key: 'service_contracts', label: 'Service contracts', chainKey: 'service_contract', description: 'O&M service contract register.' },
      { key: 'reports', label: 'Reports & exports', description: 'SLA performance, CSAT and problem-record reports with pivots and exports.' },
      { key: 'audit', label: 'Audit & compliance', description: 'Tamper-evident audit chain, certified exports and cross-tenant access reconciliation.' },
    ],
  },
];

// ─── Regulator ───────────────────────────────────────────────────────────────

const regulatorDomains: Domain[] = [
  {
    key: 'licensing',
    label: 'Licensing',
    icon: '◈',
    color: 'oklch(0.44 0.10 320)',
    features: [
      { key: 'licence_applications', label: 'Licence applications', chainKey: 'licence_application', description: 'ERA ss.8-11 initial licence adjudication (W49).', mockStates: ['received','completeness_check','public_participation','technical_evaluation','council_decision','granted','refused'], mockState: 'technical_evaluation' },
      { key: 'licences', label: 'Licence actions', description: 'Active licences — conditions, renewals, cancellations.' },
      { key: 'licence_renewals', label: 'Licence renewals', chainKey: 'licence_renewal', description: 'NERSA s14-16 renewal chain (W33).', mockStates: ['renewal_notice','application_received','technical_review','public_participation','council_decision','renewed','refused'], mockState: 'technical_review' },
      { key: 'sseg_registration', label: 'SSEG registration', chainKey: 'sseg_registration', description: 'ERA Sch 2 embedded-gen registration (W57).' },
    ],
  },
  {
    key: 'enforcement_regulator',
    label: 'Enforcement',
    icon: '⬓',
    color: 'oklch(0.46 0.15 30)',
    features: [
      { key: 'surveillance', label: 'Surveillance triage', description: 'Market surveillance alerts and STOR inbox.' },
      { key: 'enforcement', label: 'Enforcement events', description: 'Enforcement action log — notices, fines, sanctions.' },
      { key: 'enforcement_action', label: 'Enforcement actions (ERA s35)', chainKey: 'enforcement_action', description: 'ERA s35 formal enforcement chain.' },
      { key: 'compliance_inspections', label: 'Compliance inspections', chainKey: 'compliance_inspection', description: 'NERSA §10/§34 on-site inspections (W40).', mockStates: ['scheduled','notice_issued','on_site','preliminary_findings','response_period','final_report','enforcement_action','closed_satisfactory'], mockState: 'on_site' },
      { key: 'dispositions', label: 'Dispositions', chainKey: 'disposition', description: 'NERSA §10 regulatory disposition (W31).' },
      { key: 'complaint_resolution', label: 'Complaint resolution', chainKey: 'complaint_resolution', description: 'ERA s30 external complaint chain (W66).', mockStates: ['lodged','acknowledged','investigation','consultation','determination','lodge_appeal','closed'], mockState: 'investigation' },
    ],
  },
  {
    key: 'tariff_determinations',
    label: 'Tariff & Determinations',
    icon: '◎',
    color: 'oklch(0.42 0.12 140)',
    features: [
      { key: 'notices', label: 'Compliance notices', description: 'Outstanding compliance notice register.' },
      { key: 'public_consultations', label: 'Public consultations', chainKey: 'public_consultation', description: 'NERSA Gazette public consultation chain (W209).' },
      { key: 'tariff_determination', label: 'MYPD tariff determination', chainKey: 'tariff_determination', description: 'NERSA MYPD §15-16 tariff review (W43).', mockStates: ['application','completeness','public_participation','technical_analysis','panel_review','determination','appeal','gazette'], mockState: 'technical_analysis' },
      { key: 'market_conduct_exams', label: 'Market conduct exams', chainKey: 'market_conduct_exam', description: 'FSCA s41 market conduct examination (W220).' },
    ],
  },
  {
    key: 'levies',
    label: 'Levies & Finance',
    icon: '◉',
    color: 'oklch(0.46 0.12 200)',
    features: [
      { key: 'levy_assessments', label: 'Levy assessments', chainKey: 'levy_assessment', description: 'NERA Act §5B levy assessment chain (W74).', mockStates: ['assessed','invoice_issued','final_demand','enforcement','paid','write_off'], mockState: 'invoice_issued' },
      { key: 'regulator_exports', label: 'Regulatory exports', chainKey: 'regulator_export_pack', description: 'Certified export packages (W119).' },
      { key: 'icfr_attestations', label: 'ICFR attestations', description: 'Reconciliation attestation packs (W120).' },
    ],
  },
  {
    key: 'data_reporting',
    label: 'Data & Reporting',
    icon: '▤',
    color: 'oklch(0.42 0.08 250)',
    features: [
      { key: 'inbox', label: 'Regulatory inbox', description: 'Cross-chain regulatory inbox — escalated items.' },
      { key: 'government_filing', label: 'Filing connectors', description: 'NERSA/FSCA government filing connectors (W126).' },
      { key: 'stage_gates_view', label: 'Stage gates (read)', chainKey: 'stage_gate', description: 'Platform-wide DG gate view (W131).' },
      { key: 'external_controls', label: 'External controls', chainKey: 'control_environment_audit', description: 'Control environment audit (W121).' },
      { key: 'esg_disclosure_view', label: 'ESG disclosure (read)', chainKey: 'esg_disclosure', description: 'ESG disclosure read-only view.' },
      { key: 'reports', label: 'Reports & exports', description: 'Statutory submissions, levy assessments and disposition reports with pivots and exports.' },
      { key: 'audit', label: 'Audit & compliance', description: 'Tamper-evident audit chain, certified exports and licence reconciliation.' },
    ],
  },
];

// ─── Admin ────────────────────────────────────────────────────────────────────

const adminDomains: Domain[] = [
  {
    key: 'tenants_users',
    label: 'Tenants & Users',
    icon: '◈',
    color: 'oklch(0.46 0.13 270)',
    features: [
      { key: 'tenant_events', label: 'Tenant lifecycle', description: 'Onboard, KYC, activate, suspend tenants.' },
      { key: 'users', label: 'Users', description: 'User accounts across all tenants.' },
      { key: 'flags', label: 'Feature flags', description: 'Global and per-tenant feature flag overrides.' },
      { key: 'kyc_verifications', label: 'KYC / FICA', chainKey: 'kyc_verification', description: 'KYC verification queue (W198).' },
      { key: 'popia', label: 'POPIA rights', description: 'Data subject access and erasure requests.' },
      { key: 'pii_access', label: 'PII access log', description: 'POPIA s.18/s.19 cross-tenant PII access audit log.' },
    ],
  },
  {
    key: 'platform_admin',
    label: 'Platform',
    icon: '⬡',
    color: 'oklch(0.42 0.12 140)',
    features: [
      { key: 'billing', label: 'Billing runs', description: 'Monthly subscription billing and invoicing.' },
      { key: 'subscription_billing', label: 'Subscription billing (W228)', description: 'Platform SaaS-invoice oversight with dunning ladder.' },
      { key: 'settlement_audit', label: 'Settlement audit', description: 'Settlement reconciliation and break review.' },
      { key: 'platform_audit', label: 'Platform audit', description: 'Full platform audit log (cascade events).' },
      { key: 'cron', label: 'Cron jobs', description: 'Manual cron job trigger and dry-run.' },
      { key: 'monitoring', label: 'Monitoring', description: 'DLQ, cascade errors, system health.' },
      { key: 'revenue', label: 'Revenue dashboard', route: '/admin/revenue', description: 'Platform fee revenue by tenant (W-commercial).' },
      { key: 'reports', label: 'Reports & exports', description: 'Platform events and role-action-queue reports with pivots and exports.' },
    ],
  },
  {
    key: 'trading_admin',
    label: 'Trading Ops',
    icon: '◩',
    color: 'oklch(0.46 0.14 55)',
    features: [
      { key: 'trading', label: 'Trading operations', route: '/ops/depth', description: 'Order book health, circuit breakers.' },
      { key: 'settlement_admin', label: 'Settlement operations', route: '/settlement-ops', description: 'Settlement run triggers and reconciliation.' },
      { key: 'market_halt', label: 'Market halt controls', description: 'NERSA-authorised market halt controls.' },
    ],
  },
  {
    key: 'compliance_admin',
    label: 'Compliance & Audit',
    icon: '⬓',
    color: 'oklch(0.44 0.10 320)',
    features: [
      { key: 'audit_chain', label: 'Audit chain (W118)', chainKey: 'audit_chain_block', description: 'Tamper-evident Merkle audit chain.' },
      { key: 'regulator_exports_admin', label: 'Regulator exports (W119)', chainKey: 'regulator_export_pack', description: 'Certified regulatory export packs.' },
      { key: 'reconciliation_attestation', label: 'Reconciliation attestation (W120)', description: 'CA(SA)-signed reconciliation packs.' },
      { key: 'control_environment', label: 'Control environment (W121)', chainKey: 'control_environment_audit', description: 'Annual internal control audit cycle.' },
      { key: 'esg_admin', label: 'ESG reporting', route: '/esg', description: 'Platform-wide ESG aggregate reports.' },
      { key: 'contracts_admin', label: 'Contract templates', description: 'Platform contract template registry.' },
    ],
  },
  {
    key: 'platform_intelligence',
    label: 'Intelligence',
    icon: '◈',
    color: 'oklch(0.46 0.12 200)',
    features: [
      { key: 'dashboard', label: 'Executive dashboard', route: '/dashboard', description: 'CEO/COO platform KPI dashboard.' },
      { key: 'intelligence', label: 'AI intelligence', route: '/intelligence', description: 'Platform AI decision audit trail.' },
      { key: 'briefing', label: 'Briefing', route: '/briefing', description: 'Daily AI briefings per role.' },
      { key: 'anomaly_admin', label: 'Anomaly detection (W127)', description: 'Platform anomaly ML monitoring.' },
      { key: 'rul_prediction_admin', label: 'RUL prediction (W128)', description: 'Platform remaining-useful-life ML monitoring.' },
      { key: 'fault_fingerprint_admin', label: 'Fault fingerprint (W129)', description: 'Platform fault-fingerprint ML monitoring.' },
    ],
  },
  {
    key: 'integrations',
    label: 'Integrations',
    icon: '◎',
    color: 'oklch(0.42 0.08 250)',
    features: [
      { key: 'settlement_rails', label: 'Settlement rails (W124)', description: 'STRATE/SWIFT settlement connectors.' },
      { key: 'erp_connectors', label: 'ERP connectors (W125)', description: 'SAP/Oracle ERP integration.' },
      { key: 'filing_connectors', label: 'Filing connectors (W126)', description: 'NERSA/SARS government filing.' },
      { key: 'marketplace', label: 'Marketplace', route: '/marketplace', description: 'Connector and service marketplace.' },
    ],
  },
];

// ─── ESCO / O&M Operator ─────────────────────────────────────────────────────

const esumsDomains: Domain[] = [
  {
    key: 'operations',
    label: 'Operations',
    icon: '◎',
    color: 'oklch(0.45 0.13 165)',
    features: [
      { key: 'cockpit', label: 'Cockpit', description: 'Live fleet revenue ticker, fault register, fleet health grid and AI briefing.' },
      { key: 'opportunities', label: 'Opportunities', description: 'Rule-based scan of the fleet for monetisable performance improvements.' },
      { key: 'sites', label: 'Sites', description: 'Generation sites with live KPIs.' },
      { key: 'devices', label: 'Devices', description: 'Inverters, meters, batteries and sensors across all sites.' },
      { key: 'faults', label: 'Faults', description: 'Live fault register with Revenue Impact Engine.' },
      { key: 'workorders', label: 'Work orders', description: '12-state WO lifecycle with parts, photos and SLA tracking.' },
      { key: 'technicians', label: 'Team', description: 'Field technicians — skills, certifications, availability.' },
      { key: 'maintenance', label: 'Maintenance', description: 'Scheduled preventive maintenance auto-creating work orders.' },
      { key: 'projects', label: 'Projects', description: 'Portfolio-level project grouping (IPP-linked or standalone).' },
      { key: 'alerts', label: 'Alerts', description: 'All alerts fired across the fleet in the last 7 days.' },
    ],
  },
  {
    key: 'site_portfolio',
    label: 'Site Portfolio',
    icon: '◉',
    color: 'oklch(0.45 0.13 165)',
    features: [
      { key: 'service-contracts', label: 'Service contracts', chainKey: 'service_contract', description: 'O&M service contract management.' },
      { key: 'sites-portfolio', label: 'Sites portfolio', description: 'Full site portfolio — status, health, capacity.' },
    ],
  },
  {
    key: 'work_orders',
    label: 'Work Orders',
    icon: '⚙',
    color: 'oklch(0.46 0.16 55)',
    features: [
      { key: 'work-orders', label: 'Work orders', chainKey: 'om_work_order', description: '12-state P6 WO dispatch chain.', mockStates: ['draft','assigned','in_progress','on_hold','completed','cancelled'], mockState: 'in_progress' },
      { key: 'pm-compliance', label: 'PM compliance', chainKey: 'pm_compliance', description: 'IEC 62446 preventive-maintenance compliance.', mockStates: ['scheduled','overdue','in_progress','completed','deferred'], mockState: 'scheduled' },
      { key: 'permit-to-work', label: 'Permit-to-work', chainKey: 'permit_to_work', description: 'OHSA + SANS 10142 control-of-work gate.', mockStates: ['requested','under_review','issued','active','closed','revoked'], mockState: 'active' },
      { key: 'commissioning', label: 'Commissioning', chainKey: 'commissioning', description: 'Site commissioning and energization workflow.' },
    ],
  },
  {
    key: 'asset_health',
    label: 'Asset Health & AI',
    icon: '◈',
    color: 'oklch(0.42 0.15 270)',
    features: [
      { key: 'prognostics', label: 'Asset prognostics', chainKey: 'asset_prognostics', description: 'Predictive O&M — anomaly, RUL, fault fingerprint.', mockStates: ['nominal','anomaly_detected','degrading','maintenance_due','failed'], mockState: 'nominal' },
      { key: 'availability', label: 'Availability guarantee', chainKey: 'availability_guarantee', description: 'IEC 61724 uptime contract and LD tracking.', mockStates: ['active','under_review','breach','cure','settled','waived'], mockState: 'active' },
      { key: 'bess-soh', label: 'BESS state-of-health', chainKey: 'bess_soh', description: 'Battery degradation tracking and augmentation programme.', mockStates: ['monitoring','augmentation_required','works_in_progress','recommissioned','decommissioned'], mockState: 'monitoring' },
      { key: 'soiling-audit', label: 'Soiling audit', chainKey: 'soiling_audit', description: 'IEC 61724 soiling losses and cleaning economics.', mockStates: ['measured','economics_assessed','cleaning_authorized','post_clean_measured','settled'], mockState: 'measured' },
      { key: 'predictions', label: 'Predictive', description: 'AI-derived predictive maintenance signals surfaced weeks ahead.' },
    ],
  },
  {
    key: 'supply_chain',
    label: 'Supply Chain',
    icon: '⬡',
    color: 'oklch(0.44 0.14 25)',
    features: [
      { key: 'spare-parts', label: 'Spare parts', chainKey: 'spare_parts_provisioning', description: 'VED criticality — requisition → QA → stock → issue.', mockStates: ['requisitioned','po_issued','in_transit','received','in_stock','reserved','issued'], mockState: 'in_stock' },
      { key: 'parts', label: 'Parts catalogue', description: 'Parts catalogue and stock with low-stock reorder flags.' },
      { key: 'vendor-escalation', label: 'Vendor escalation', chainKey: 'vendor_escalation', description: 'CPA §56/§61 vendor claim chain.', mockStates: ['open','escalated','under_review','resolved','closed'], mockState: 'open' },
      { key: 'warranty-claims', label: 'Warranty claims', chainKey: 'warranty_claim', description: 'OEM 10-state RMA workflow.', mockStates: ['submitted','accepted','in_repair','shipped','closed'], mockState: 'submitted' },
      { key: 'warranty-recovery', label: 'Warranty recovery', chainKey: 'warranty_recovery', description: 'Supplier cost-recovery against warranty defects.', mockStates: ['initiated','assessment','settlement','completed'], mockState: 'initiated' },
    ],
  },
  {
    key: 'safety',
    label: 'Safety & Permits',
    icon: '⚠',
    color: 'oklch(0.46 0.18 25)',
    features: [
      { key: 'hse', label: 'HSE incidents', chainKey: 'hse_incident', description: 'OHSA s24 + NEMA s30 incident chain.', mockStates: ['reported','under_investigation','closed','escalated'], mockState: 'reported' },
      { key: 'protection-relay-tests', label: 'Protection tests', description: 'NRS 097-2-3 + NERSA Grid Code protection relay and anti-islanding compliance tests.' },
    ],
  },
  {
    key: 'data_integrations',
    label: 'Data & Integrations',
    icon: '⇄',
    color: 'oklch(0.44 0.12 200)',
    features: [
      { key: 'ingestion', label: 'Ingestion', description: 'OEM connections (FusionSolar, SolarEdge, SMA, Sungrow, Modbus, Eskom AMR) with last-poll status.' },
      { key: 'integrations', label: 'Integrations', description: 'Connect inverters and generation assets — credentials, live telemetry, custom adapters.' },
      { key: 'data-sources', label: 'Data sources', description: 'Sensor connections and data-ingest APIs — Modbus, SunSpec, MQTT, REST, OPC-UA.' },
      { key: 'participant-links', label: 'Participant links', description: 'Two-party onboarding handshake linking stations to downstream participant modules.' },
    ],
  },
  {
    key: 'reporting',
    label: 'Reporting',
    icon: '▤',
    color: 'oklch(0.42 0.10 250)',
    features: [
      { key: 'audit', label: 'Audit log', description: 'Tamper-evident audit chain and evidence log.' },
      { key: 'generation-revenue-assurance', label: 'Revenue assurance', chainKey: 'generation_revenue_assurance', description: 'Settlement-vs-expected reconciliation and recovery.', mockStates: ['reconciling','variance_flagged','recovery_claimed','recovered','written_off'], mockState: 'reconciling' },
      { key: 'accruals', label: 'Accruals', description: 'Real-time generation accrual ledger from inverter data.' },
      { key: 'settlement-invoices', label: 'Invoices', description: 'Monthly settlement invoices derived from the accruals ledger.' },
      { key: 'carbon-credits', label: 'Carbon credits', description: 'Monthly carbon credit records auto-minted from the accruals ledger.' },
    ],
  },
];

// ─── EPC Contractor ───────────────────────────────────────────────────────────

const epcDomains: Domain[] = [
  {
    key: 'document_control',
    label: 'Document Control',
    icon: '▤',
    color: 'oklch(0.42 0.10 250)',
    features: [
      { key: 'submittals', label: 'Submittals', chainKey: 'ipp_submittal', description: 'Drawing and document submittal register.' },
      { key: 'rfis', label: 'RFIs', description: 'Request for information log and responses.' },
      { key: 'change-orders', label: 'Change orders', chainKey: 'project_change_order', description: 'Contract change order management.' },
      { key: 'technical-queries', label: 'Technical queries', description: 'Technical query register and resolution.' },
    ],
  },
  {
    key: 'quality',
    label: 'Quality Management',
    icon: '◈',
    color: 'oklch(0.45 0.13 165)',
    features: [
      { key: 'itps', label: 'ITPs', chainKey: 'itp', description: 'Inspection and test plans.', mockStates: ['draft','approved','in_progress','completed'], mockState: 'in_progress' },
      { key: 'ncrs', label: 'NCRs', chainKey: 'ncr', description: 'Non-conformance reports and corrective action.', mockStates: ['open','under_review','corrective_action','closed'], mockState: 'open' },
      { key: 'punch-list', label: 'Punch list', chainKey: 'punch_list', description: 'Pre-COD punch list items and closure.', mockStates: ['open','in_progress','closed'], mockState: 'open' },
      { key: 'method-statements', label: 'Method statements', chainKey: 'ipp_method_statement', description: 'Construction method statement approvals.' },
    ],
  },
  {
    key: 'site_setup',
    label: 'Site Setup',
    icon: '⬡',
    color: 'oklch(0.50 0.14 55)',
    features: [
      { key: 'site-diary', label: 'Site diary', chainKey: 'ipp_construction_diary', description: 'Daily construction diary and inspection records.' },
    ],
  },
  {
    key: 'safety',
    label: 'Safety & HSE',
    icon: '⚠',
    color: 'oklch(0.46 0.18 25)',
    features: [
      { key: 'hse', label: 'HSE incidents', chainKey: 'hse_incident', description: 'OHSA s24 + NEMA s30 incident chain.', mockStates: ['reported','under_investigation','closed','escalated'], mockState: 'reported' },
    ],
  },
  {
    key: 'handover',
    label: 'Handover',
    icon: '◉',
    color: 'oklch(0.42 0.15 270)',
    features: [
      { key: 'audit', label: 'Audit log', description: 'Handover documentation and evidence chain.' },
    ],
  },
];

// ─── Role registry ────────────────────────────────────────────────────────────

export const ROLES: RoleConfig[] = [
  {
    role: 'ipp_developer',
    label: 'IPP Developer',
    suitePath: '/ipp-lifecycle',
    workstationPath: '/ipp-lifecycle/workstation',
    domains: ippDomains,
  },
  {
    role: 'trader',
    label: 'Trader',
    suitePath: '/trader-risk',
    workstationPath: '/trader-risk/workstation',
    domains: traderDomains,
  },
  {
    role: 'lender',
    label: 'Lender',
    suitePath: '/lender-suite',
    workstationPath: '/lender-suite/workstation',
    domains: lenderDomains,
  },
  {
    role: 'offtaker',
    label: 'Offtaker',
    suitePath: '/offtaker-suite',
    workstationPath: '/offtaker-suite/workstation',
    domains: offtakerDomains,
  },
  {
    role: 'carbon_fund',
    label: 'Carbon Fund',
    suitePath: '/carbon-registry',
    workstationPath: '/carbon-registry/workstation',
    domains: carbonDomains,
  },
  {
    role: 'grid_operator',
    label: 'Grid Operator',
    suitePath: '/grid-operator',
    workstationPath: '/grid-operator/workstation',
    domains: gridDomains,
  },
  {
    role: 'support',
    label: 'Support / OEM',
    suitePath: '/support',
    workstationPath: '/support/workstation',
    domains: supportDomains,
  },
  {
    role: 'regulator',
    label: 'Regulator',
    suitePath: '/regulator-suite',
    workstationPath: '/regulator-suite/workstation',
    domains: regulatorDomains,
  },
  {
    role: 'admin',
    label: 'Platform Admin',
    suitePath: '/admin',
    workstationPath: '/admin-platform/workstation',
    domains: adminDomains,
  },
  {
    role: 'esums_owner',
    label: 'ESCO / O&M',
    suitePath: '/esco',
    workstationPath: '/esco/workstation',
    domains: esumsDomains,
  },
  {
    role: 'esco',
    label: 'ESCO / O&M',
    suitePath: '/esco',
    workstationPath: '/esco/workstation',
    domains: esumsDomains,
  },
  {
    role: 'epc_contractor',
    label: 'EPC Contractor',
    suitePath: '/epc',
    workstationPath: '/epc/workstation',
    domains: epcDomains,
  },
];

export function getRoleConfig(role: string): RoleConfig | undefined {
  return ROLES.find((r) => r.role === role);
}

export function getDomain(role: string, domainKey: string): Domain | undefined {
  return getRoleConfig(role)?.domains.find((d) => d.key === domainKey);
}

export function getFeature(role: string, domainKey: string, featureKey: string): Feature | undefined {
  return getDomain(role, domainKey)?.features.find((f) => f.key === featureKey);
}
