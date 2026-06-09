// Role-keyed capability index — powers the CapabilityPalette "What can I do?" overlay.
// Each href deep-links to the actual workstation tab using ?tab=<tabKey>.

export interface Capability {
  id: string;
  label: string;
  description: string;
  href: string;
  group: string;
  depth: 'core' | 'advanced';
}

const COMMON: Capability[] = [
  { id: 'settings', label: 'Account & security settings', description: 'Manage your profile, password, and 2FA.', href: '/settings', group: 'Account', depth: 'core' },
];

const IPP = '/ipp-lifecycle/workstation';
const TRADER = '/trader-risk/workstation';
const LENDER = '/lender-suite/workstation';
const OFFTAKER = '/offtaker-suite/workstation';
const GRID = '/grid-operator/workstation';
const CARBON = '/carbon-registry/workstation';
const REGULATOR = '/regulator-suite/workstation';
const ADMIN = '/admin-platform/workstation';
const SUPPORT = '/support/workstation';

export const CAPABILITY_MAP: Record<string, Capability[]> = {
  ipp_developer: [
    // Project Controls
    { id: 'projects', label: 'Projects overview', description: 'View and manage all IPP development projects.', href: `${IPP}?tab=projects`, group: 'Project Controls', depth: 'core' },
    { id: 'milestones', label: 'Milestones', description: 'Track and update project milestones.', href: `${IPP}?tab=milestones`, group: 'Project Controls', depth: 'core' },
    { id: 'schedule', label: 'Programme schedule', description: 'CPM/Gantt view of the project schedule.', href: `${IPP}?tab=schedule`, group: 'Project Controls', depth: 'core' },
    { id: 'wbs_schedule', label: 'WBS schedule', description: 'Work breakdown structure + schedule integration.', href: `${IPP}?tab=wbs_schedule`, group: 'Project Controls', depth: 'advanced' },
    { id: 'cost_evm', label: 'Cost & earned value', description: 'EVM performance indices (SPI, CPI, EAC).', href: `${IPP}?tab=cost-evm`, group: 'Project Controls', depth: 'advanced' },
    { id: 'stage_gates', label: 'Stage gates', description: 'REIPPPP stage-gate reviews (DG0–DG4).', href: `${IPP}?tab=stage-gates`, group: 'Project Controls', depth: 'core' },
    { id: 'issues_log', label: 'Issues log', description: 'Track and resolve project issues.', href: `${IPP}?tab=issues-log`, group: 'Project Controls', depth: 'core' },
    { id: 'risk_register', label: 'Risk register', description: 'Project risk identification and response tracking.', href: `${IPP}?tab=risk-register`, group: 'Project Controls', depth: 'core' },
    { id: 'milestone_variance', label: 'Milestone variance', description: 'Flag critical delays against REIPPPP schedule.', href: `${IPP}?tab=milestone-variance`, group: 'Project Controls', depth: 'advanced' },
    // Document Control
    { id: 'document_control', label: 'Document control', description: 'Manage and version project documents.', href: `${IPP}?tab=document-control`, group: 'Document Control', depth: 'core' },
    { id: 'submittals', label: 'Submittals', description: 'Engineer/contractor submittal review workflow.', href: `${IPP}?tab=submittals`, group: 'Document Control', depth: 'core' },
    { id: 'rfis', label: 'RFIs', description: 'Requests for information from contractors.', href: `${IPP}?tab=rfis`, group: 'Document Control', depth: 'core' },
    { id: 'change_orders', label: 'Change orders', description: 'Manage scope and cost change orders.', href: `${IPP}?tab=change-orders`, group: 'Document Control', depth: 'core' },
    { id: 'technical_queries', label: 'Technical queries', description: 'Engineering technical query register.', href: `${IPP}?tab=technical-queries`, group: 'Document Control', depth: 'advanced' },
    // Construction
    { id: 'site_diary', label: 'Site diary', description: 'Daily site progress records.', href: `${IPP}?tab=site_diary`, group: 'Construction', depth: 'core' },
    { id: 'punch_list', label: 'Punch list', description: 'Pre-commissioning defect punch list.', href: `${IPP}?tab=punch_list`, group: 'Construction', depth: 'core' },
    { id: 'itp', label: 'Inspection test plans', description: 'ITP hold-point and witness-point register.', href: `${IPP}?tab=itp`, group: 'Construction', depth: 'core' },
    { id: 'method_statements', label: 'Method statements', description: 'Construction method statement register.', href: `${IPP}?tab=method-statements`, group: 'Construction', depth: 'advanced' },
    { id: 'ncr', label: 'Non-conformance reports', description: 'NCR issue and close-out workflow.', href: `${IPP}?tab=ncr`, group: 'Construction', depth: 'advanced' },
    { id: 'cod', label: 'COD milestone', description: 'NERSA §C-5 commercial operation date chain.', href: `${IPP}?tab=cod`, group: 'Construction', depth: 'core' },
    // Finance
    { id: 'progress_claims', label: 'Progress claims', description: 'Contractor payment certificate chain.', href: `${IPP}?tab=progress-claims`, group: 'Finance', depth: 'core' },
    { id: 'dscr_reports', label: 'DSCR reports', description: 'REIPPPP Sch.2 + DFI covenant DSCR reporting.', href: `${IPP}?tab=dscr-reports`, group: 'Finance', depth: 'advanced' },
    { id: 'green_bond_reports', label: 'Green bond reports', description: 'CBI/ICMA green bond reporting and verification.', href: `${IPP}?tab=green-bond-reports`, group: 'Finance', depth: 'advanced' },
    { id: 'insurance', label: 'Insurance management', description: 'Policy tracking and claim lifecycle.', href: `${IPP}?tab=insurance`, group: 'Finance', depth: 'core' },
    { id: 'credit_insurance', label: 'Credit insurance', description: 'ECIC/ATIDI/Lloyd\'s offtake credit insurance chain.', href: `${IPP}?tab=credit_insurance`, group: 'Finance', depth: 'advanced' },
    { id: 'bonds', label: 'Bonds', description: 'Performance and bid bond expiry / cure windows.', href: `${IPP}?tab=bonds`, group: 'Finance', depth: 'core' },
    // Regulatory
    { id: 'procurement', label: 'REIPPPP procurement', description: '12-state RFP and procurement lifecycle.', href: `${IPP}?tab=procurement`, group: 'Regulatory', depth: 'core' },
    { id: 'hse_chain', label: 'HSE incidents', description: 'OHSA §24 + NEMA §30 HSE incident lifecycle.', href: `${IPP}?tab=hse_chain`, group: 'Regulatory', depth: 'core' },
    { id: 'planned_outages', label: 'Planned outages', description: 'NERSA Grid Code 12-state outage lifecycle.', href: `${IPP}?tab=planned_outages`, group: 'Regulatory', depth: 'core' },
    { id: 'gca_chain', label: 'Grid connection agreement', description: 'NERSA Grid Code C-1 GCA lifecycle.', href: `${IPP}?tab=gca_chain`, group: 'Regulatory', depth: 'advanced' },
    { id: 'connection_energization', label: 'Connection energization', description: 'Physical go-live and COD energization chain.', href: `${IPP}?tab=connection_energization_ipp`, group: 'Regulatory', depth: 'advanced' },
    { id: 'ed_chain', label: 'ED commitment', description: 'REIPPPP economic-development commitment lifecycle.', href: `${IPP}?tab=ed_chain`, group: 'Regulatory', depth: 'advanced' },
    { id: 'take_or_pay', label: 'Take-or-pay claims', description: 'Generator-side take-or-pay shortfall claims.', href: `${IPP}?tab=take-or-pay-claims`, group: 'Regulatory', depth: 'advanced' },
    // Audit & AI
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all transitions.', href: `${IPP}?tab=audit`, group: 'Compliance', depth: 'advanced' },
    { id: 'anomaly_ml', label: 'Anomaly detection (ML)', description: 'Real-time ensemble anomaly detection on site telemetry.', href: `${IPP}?tab=anomaly-detection-ml`, group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],

  trader: [
    // Trading
    { id: 'orders', label: 'Order book', description: 'Submit bids/offers and monitor the order book.', href: `${TRADER}?tab=orders`, group: 'Trading', depth: 'core' },
    { id: 'rejections', label: 'Order rejections', description: 'Review pre-trade rejection reasons and credit state.', href: `${TRADER}?tab=rejections`, group: 'Trading', depth: 'core' },
    { id: 'pretrade_credit', label: 'Pre-trade credit', description: 'Credit checks, exposure limits, mark-age controls.', href: `${TRADER}?tab=pretrade-credit`, group: 'Trading', depth: 'core' },
    { id: 'best_ex', label: 'Best-execution RFQ', description: 'FSCA Conduct Standard 1/2020 best-execution workflow.', href: `${TRADER}?tab=best-ex`, group: 'Trading', depth: 'advanced' },
    { id: 'trade_allocation', label: 'Trade allocation', description: 'Post-execution block allocation and affirmation.', href: `${TRADER}?tab=trade-allocation`, group: 'Trading', depth: 'advanced' },
    // Risk
    { id: 'risk', label: 'Risk dashboard', description: 'Daily VaR, scenarios, and limit utilisation.', href: `${TRADER}?tab=risk`, group: 'Risk', depth: 'core' },
    { id: 'margin', label: 'Margin management', description: 'Initial and variation margin cycle.', href: `${TRADER}?tab=margin`, group: 'Risk', depth: 'core' },
    { id: 'pnl_attribution', label: 'P&L attribution', description: 'Daily trading P&L broken down by strategy.', href: `${TRADER}?tab=pnl-attribution`, group: 'Risk', depth: 'advanced' },
    { id: 'poslimit', label: 'Position limits', description: 'FSCA §41 position limit breach lifecycle.', href: `${TRADER}?tab=poslimit`, group: 'Risk', depth: 'advanced' },
    { id: 'counterparty_margin', label: 'Counterparty margin', description: 'Counterparty credit waterfall and default management.', href: `${TRADER}?tab=counterparty-margin`, group: 'Risk', depth: 'advanced' },
    // Compliance
    { id: 'market_abuse', label: 'Market abuse surveillance', description: 'FMA Ch.X STOR workflow and surveillance alerts.', href: `${TRADER}?tab=market-abuse`, group: 'Compliance', depth: 'core' },
    { id: 'algo_cert', label: 'Algo certification', description: 'FMA/FSCA/MiFID RTS6 algo-trading certification.', href: `${TRADER}?tab=algo-cert`, group: 'Compliance', depth: 'advanced' },
    { id: 'trade_reporting', label: 'Trade repository reporting', description: 'FMA 2012 + FSCA post-trade recon chain.', href: `${TRADER}?tab=trade-reporting`, group: 'Compliance', depth: 'advanced' },
    { id: 'fsca_conduct_reports', label: 'FSCA conduct reports', description: 'Periodic conduct reporting to FSCA.', href: `${TRADER}?tab=fsca_conduct_reports`, group: 'Compliance', depth: 'advanced' },
    { id: 'mm_compliance', label: 'Market-maker compliance', description: 'Consecutive-miss breach machine (none→breach→escalated).', href: `${TRADER}?tab=mm-compliance`, group: 'Compliance', depth: 'advanced' },
    { id: 'cross_border', label: 'Cross-border trades', description: 'FMA §17 + SARB ExCon pre-approval lifecycle.', href: `${TRADER}?tab=cross_border_trades`, group: 'Compliance', depth: 'advanced' },
    { id: 'isda', label: 'ISDA agreements', description: 'ISDA master agreement register and CSA.', href: `${TRADER}?tab=isda_agreements`, group: 'Compliance', depth: 'advanced' },
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all trading events.', href: `${TRADER}?tab=audit`, group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],

  lender: [
    // Credit
    { id: 'facilities', label: 'Facility register', description: 'View all active credit facilities.', href: `${LENDER}?tab=facilities`, group: 'Credit', depth: 'core' },
    { id: 'credit_origination', label: 'Credit origination', description: 'NCA/Basel III/SARB facility origination and credit approval.', href: `${LENDER}?tab=credit_origination`, group: 'Credit', depth: 'core' },
    { id: 'cp_clearances', label: 'CP clearances', description: 'LMA conditions precedent clearance lifecycle.', href: `${LENDER}?tab=cp_clearances`, group: 'Credit', depth: 'core' },
    { id: 'drawdown', label: 'Drawdown management', description: 'IE + CP gate drawdown lifecycle.', href: `${LENDER}?tab=drawdown`, group: 'Credit', depth: 'core' },
    { id: 'loan_transfer', label: 'Loan transfer', description: 'LMA secondary-trading and participation.', href: `${LENDER}?tab=loan_transfer`, group: 'Credit', depth: 'advanced' },
    // Monitoring
    { id: 'covenant_cert', label: 'Covenant certificates', description: 'LMA + Equator covenant certificate chain.', href: `${LENDER}?tab=covenant_cert`, group: 'Monitoring', depth: 'core' },
    { id: 'dscr_monitoring', label: 'DSCR monitoring', description: 'Debt-service coverage ratio surveillance.', href: `${LENDER}?tab=dscr_monitoring`, group: 'Monitoring', depth: 'core' },
    { id: 'sll_kpi', label: 'SLL KPIs', description: 'Sustainability-linked loan KPI ratchet.', href: `${LENDER}?tab=sll_kpi`, group: 'Monitoring', depth: 'advanced' },
    { id: 'construction_cost', label: 'Construction cost reports', description: 'IE-certified construction cost progress reports.', href: `${LENDER}?tab=construction_cost_report`, group: 'Monitoring', depth: 'core' },
    { id: 'esap_monitoring', label: 'ESAP monitoring', description: 'Equator Principles IV corrective action lifecycle.', href: `${LENDER}?tab=esap_monitoring_chain`, group: 'Monitoring', depth: 'advanced' },
    { id: 'security_perfection', label: 'Security perfection', description: 'Deeds/Movable-Property/STRATE security registration.', href: `${LENDER}?tab=security_perfection`, group: 'Monitoring', depth: 'advanced' },
    // Default Management
    { id: 'dunning', label: 'Dunning cycles', description: 'Invoice → final demand → enforcement dunning.', href: `${LENDER}?tab=dunning`, group: 'Default Management', depth: 'core' },
    { id: 'loan_default', label: 'Loan default & step-in', description: 'LMA event-of-default enforcement lifecycle.', href: `${LENDER}?tab=loan_default`, group: 'Default Management', depth: 'core' },
    { id: 'loan_restructure', label: 'Loan restructure', description: 'Restructuring and forbearance management.', href: `${LENDER}?tab=loan_restructure`, group: 'Default Management', depth: 'advanced' },
    { id: 'stage_gates', label: 'Stage gates', description: 'Financial close stage-gate review register.', href: `${LENDER}?tab=stage-gates`, group: 'Compliance', depth: 'advanced' },
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all credit events.', href: `${LENDER}?tab=audit`, group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],

  offtaker: [
    // Contracts
    { id: 'ppa_contract', label: 'PPA contracts', description: 'NERSA §34 PPA contract execution and management.', href: `${OFFTAKER}?tab=ppa_contract`, group: 'Contracts', depth: 'core' },
    { id: 'tariff_indexation', label: 'Tariff indexation', description: 'NERSA ERA §4 + IFRS 16 annual CPI repricing.', href: `${OFFTAKER}?tab=tariff_indexation`, group: 'Contracts', depth: 'core' },
    { id: 'change_in_law', label: 'Change in law', description: 'PPA change-in-law adjustment lifecycle.', href: `${OFFTAKER}?tab=change_in_law`, group: 'Contracts', depth: 'advanced' },
    { id: 'ppa_termination', label: 'PPA termination', description: 'NERSA §34 + IFRS 9/16 early-termination amount.', href: `${OFFTAKER}?tab=ppa_termination`, group: 'Contracts', depth: 'advanced' },
    { id: 'payment_security', label: 'Payment security', description: 'Guarantee/LC/PCG credit-support instrument lifecycle.', href: `${OFFTAKER}?tab=payment_security`, group: 'Contracts', depth: 'advanced' },
    { id: 'wheeling_access', label: 'Wheeling access', description: 'NERSA Grid Code §10 third-party access agreement.', href: `${OFFTAKER}?tab=wheeling_access`, group: 'Contracts', depth: 'advanced' },
    // Operations
    { id: 'ppa_nomination', label: 'PPA nominations', description: 'Day-ahead and intraday delivery nominations.', href: `${OFFTAKER}?tab=ppa_nomination`, group: 'Operations', depth: 'core' },
    { id: 'ppa_annual_recon', label: 'Annual reconciliation', description: 'PPA contracted-vs-delivered reconciliation.', href: `${OFFTAKER}?tab=ppa_annual_recon`, group: 'Operations', depth: 'core' },
    { id: 'sites', label: 'Consumption sites', description: 'Manage your registered consumption sites.', href: `${OFFTAKER}?tab=sites`, group: 'Operations', depth: 'core' },
    { id: 'bills', label: 'Energy bills', description: 'View and dispute energy bills.', href: `${OFFTAKER}?tab=bills`, group: 'Operations', depth: 'core' },
    { id: 'curtailment_claim', label: 'Curtailment claims', description: 'PPA curtailment deemed-energy compensation chain.', href: `${OFFTAKER}?tab=curtailment_claim`, group: 'Operations', depth: 'advanced' },
    { id: 'take_or_pay', label: 'Take-or-pay', description: 'IFRS 16 + NERSA §34 take-or-pay shortfall lifecycle.', href: `${OFFTAKER}?tab=take_or_pay`, group: 'Operations', depth: 'advanced' },
    { id: 'wheeling_charges', label: 'Wheeling charges', description: 'Monthly transmission charge dispute lifecycle.', href: `${OFFTAKER}?tab=wheeling_charges`, group: 'Operations', depth: 'advanced' },
    // Compliance
    { id: 'recs', label: 'RECs & GoOs', description: 'I-REC/SAREC renewable attribute certificate lifecycle.', href: `${OFFTAKER}?tab=recs`, group: 'Compliance', depth: 'core' },
    { id: 'scope2', label: 'Scope 2 reporting', description: 'GHG Protocol Scope 2 emission disclosure.', href: `${OFFTAKER}?tab=scope2`, group: 'Compliance', depth: 'advanced' },
    { id: 'green_tariff', label: 'Green tariff disclosure', description: 'GHG Protocol Scope 2 + I-REC + CDP/SBTi labelling.', href: `${OFFTAKER}?tab=green_tariff`, group: 'Compliance', depth: 'advanced' },
    { id: 'slb_kpi', label: 'SLB KPIs', description: 'Sustainability-linked bond KPI ratchet monitoring.', href: `${OFFTAKER}?tab=slb_kpi`, group: 'Compliance', depth: 'advanced' },
    { id: 'rec_lifecycle', label: 'REC lifecycle', description: 'Full issuance → trade → retirement certificate chain.', href: `${OFFTAKER}?tab=rec_lifecycle`, group: 'Compliance', depth: 'advanced' },
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all offtaker events.', href: `${OFFTAKER}?tab=audit`, group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],

  grid_operator: [
    // Operations
    { id: 'dispatch_nomination', label: 'Dispatch nominations', description: '10-state BRP→SO accept→activate→performance→settle.', href: `${GRID}?tab=dispatch_nomination`, group: 'Operations', depth: 'core' },
    { id: 'ancillary', label: 'Ancillary services', description: 'Reserve activation and settlement lifecycle.', href: `${GRID}?tab=ancillary`, group: 'Operations', depth: 'core' },
    { id: 'curtailment', label: 'Curtailment management', description: 'Generation curtailment instruction and compensation.', href: `${GRID}?tab=curtailment`, group: 'Operations', depth: 'core' },
    { id: 'demand_response', label: 'Demand response', description: 'NERSA Grid Code CSC demand-response programme.', href: `${GRID}?tab=demand_response`, group: 'Operations', depth: 'advanced' },
    { id: 'load_curtailments', label: 'Load curtailments', description: 'NERSA CSC-1 11-state load curtailment chain.', href: `${GRID}?tab=load_curtailments`, group: 'Operations', depth: 'advanced' },
    { id: 'eop_activations', label: 'EOP activations', description: 'NERSA Grid Code §G.4 emergency operating procedures.', href: `${GRID}?tab=eop_activations`, group: 'Operations', depth: 'advanced' },
    // Infrastructure
    { id: 'outage', label: 'Outage management', description: 'Unplanned outage response and recovery.', href: `${GRID}?tab=outage`, group: 'Infrastructure', depth: 'core' },
    { id: 'planned_outage', label: 'Planned outages', description: 'NERSA Grid Code 12-state planned outage lifecycle.', href: `${GRID}?tab=planned_outage`, group: 'Infrastructure', depth: 'core' },
    { id: 'transmission_outage', label: 'Transmission outages', description: 'Transmission outage scheduling and coordination.', href: `${GRID}?tab=transmission-outage`, group: 'Infrastructure', depth: 'core' },
    { id: 'substation_assets', label: 'Substation assets', description: 'IEC 60076 + NRS 048-2 substation asset lifecycle.', href: `${GRID}?tab=substation-assets`, group: 'Infrastructure', depth: 'advanced' },
    { id: 'smart_meter_assets', label: 'Smart meter assets', description: 'Smart meter asset register and lifecycle.', href: `${GRID}?tab=smart-meter-assets`, group: 'Infrastructure', depth: 'advanced' },
    // Commercial
    { id: 'wheeling_charges', label: 'Wheeling charges', description: 'Monthly transmission charge calculation and disputes.', href: `${GRID}?tab=wheeling_charges`, group: 'Commercial', depth: 'core' },
    { id: 'imbalance_settlement', label: 'Imbalance settlement', description: 'BRP imbalance position settlement.', href: `${GRID}?tab=imbalance-settlement`, group: 'Commercial', depth: 'advanced' },
    { id: 'rez_capacity', label: 'REZ capacity', description: 'Renewable Energy Zone capacity allocation queue.', href: `${GRID}?tab=rez_capacity`, group: 'Commercial', depth: 'advanced' },
    // Regulatory
    { id: 'grid_capacity_allocations', label: 'Grid capacity allocations', description: 'NTCSA 2024 Capacity Rules queue management.', href: `${GRID}?tab=grid_capacity_allocations`, group: 'Regulatory', depth: 'advanced' },
    { id: 'grid_code_compliance', label: 'Grid code compliance', description: 'NERSA Grid Code / NRS 097 conformance monitoring.', href: `${GRID}?tab=grid_code_compliance`, group: 'Regulatory', depth: 'advanced' },
    { id: 'connection_energization', label: 'Connection energization', description: 'Physical go-live and commissioning chain.', href: `${GRID}?tab=connection_energization`, group: 'Regulatory', depth: 'advanced' },
    { id: 'interconnector_schedules', label: 'Interconnector schedules', description: 'Cross-border interconnector scheduling.', href: `${GRID}?tab=interconnector_schedules`, group: 'Regulatory', depth: 'advanced' },
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all grid events.', href: `${GRID}?tab=audit`, group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],

  carbon_fund: [
    // Registry
    { id: 'vintages', label: 'Credit vintages', description: 'Carbon credit vintage register and status.', href: `${CARBON}?tab=vintages`, group: 'Registry', depth: 'core' },
    { id: 'certificates', label: 'Certificates', description: 'Certificate issuance and bundle management.', href: `${CARBON}?tab=certificates`, group: 'Registry', depth: 'core' },
    { id: 'registry_transfers', label: 'Registry transfers', description: 'UNFCCC Art 6.2 + Verra international registry transfers.', href: `${CARBON}?tab=registry_transfers`, group: 'Registry', depth: 'advanced' },
    // Verification
    { id: 'mrv', label: 'MRV verification', description: '14-state UNFCCC verification: validation → site audit → CRA → issuance.', href: `${CARBON}?tab=mrv`, group: 'Verification', depth: 'core' },
    { id: 'mrv_chain', label: 'MRV chain', description: 'Full MRV workflow chain management.', href: `${CARBON}?tab=mrv_chain`, group: 'Verification', depth: 'core' },
    { id: 'registration_chain', label: 'Project registration', description: 'Gold Standard + Verra + Art 6.4 project PDD registration.', href: `${CARBON}?tab=registration_chain`, group: 'Verification', depth: 'core' },
    { id: 'methodology_amendments', label: 'Methodology amendments', description: 'Verra/GS/Art 6.4 methodology deviation and amendment chain.', href: `${CARBON}?tab=methodology_amendments`, group: 'Verification', depth: 'advanced' },
    { id: 'crediting_renewal_chain', label: 'Crediting period renewal', description: 'Verra/GS periodic re-validation at period expiry.', href: `${CARBON}?tab=crediting_renewal_chain`, group: 'Verification', depth: 'advanced' },
    // Transactions
    { id: 'retirement_chain', label: 'Credit retirements', description: 'Per-scope SLA retirement chain (Art6 24h / compliance 72h).', href: `${CARBON}?tab=retirement_chain`, group: 'Transactions', depth: 'core' },
    { id: 'article6', label: 'Article 6 ITMO', description: 'UNFCCC ITMO corresponding-adjustment ledger.', href: `${CARBON}?tab=article6`, group: 'Transactions', depth: 'advanced' },
    { id: 'erpa_chain', label: 'ERPA forward delivery', description: 'Carbon forward-delivery and make-good lifecycle.', href: `${CARBON}?tab=erpa_chain`, group: 'Transactions', depth: 'advanced' },
    { id: 'poa_cpa_inclusion_chain', label: 'PoA/CPA inclusion', description: 'CDM-PoA / GS4GG grouped programme inclusion.', href: `${CARBON}?tab=poa_cpa_inclusion_chain`, group: 'Transactions', depth: 'advanced' },
    // Integrity
    { id: 'reversal_chain', label: 'Carbon reversals', description: 'Verra + GS + Art 6.4 buffer-pool reversal integrity chain.', href: `${CARBON}?tab=reversal_chain`, group: 'Integrity', depth: 'advanced' },
    { id: 'offset_claim_chain', label: 'Carbon offset claims', description: 'Carbon Tax Act §13 offset claim against carbon-tax liability.', href: `${CARBON}?tab=offset_claim_chain`, group: 'Integrity', depth: 'advanced' },
    { id: 'carbon_tax_returns', label: 'Carbon tax returns', description: 'SARS carbon tax return filing lifecycle.', href: `${CARBON}?tab=carbon_tax_returns`, group: 'Integrity', depth: 'advanced' },
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all carbon events.', href: `${CARBON}?tab=audit`, group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],

  regulator: [
    // Inbox & Notices
    { id: 'inbox', label: 'Regulatory inbox', description: 'Materialised cross-role regulatory inbox.', href: `${REGULATOR}?tab=inbox`, group: 'Inbox', depth: 'core' },
    { id: 'notices', label: 'Notices', description: 'Issue and manage regulatory notices.', href: `${REGULATOR}?tab=notices`, group: 'Inbox', depth: 'core' },
    { id: 'surveillance', label: 'Surveillance', description: 'Real-time market surveillance scan.', href: `${REGULATOR}?tab=surveillance`, group: 'Inbox', depth: 'core' },
    // Licensing
    { id: 'licences', label: 'Licence register', description: 'Active licence register and renewal tracking.', href: `${REGULATOR}?tab=licences`, group: 'Licensing', depth: 'core' },
    { id: 'licence_applications', label: 'Licence applications', description: 'ERA ss.8-11 licence-grant adjudication.', href: `${REGULATOR}?tab=licence_applications`, group: 'Licensing', depth: 'core' },
    { id: 'licence_renewals', label: 'Licence renewals', description: 'NERSA §14-16 licence renewal lifecycle.', href: `${REGULATOR}?tab=licence_renewals`, group: 'Licensing', depth: 'core' },
    { id: 'sseg_registrations', label: 'SSEG registrations', description: 'ERA Sch 2 embedded-generation registration.', href: `${REGULATOR}?tab=sseg_registrations`, group: 'Licensing', depth: 'advanced' },
    // Enforcement
    { id: 'enforcement', label: 'Enforcement actions', description: 'ERA §34/§35 enforcement action lifecycle.', href: `${REGULATOR}?tab=enforcement`, group: 'Enforcement', depth: 'core' },
    { id: 'compliance_inspections', label: 'Compliance inspections', description: 'NERSA §10 proactive compliance inspection chain.', href: `${REGULATOR}?tab=compliance_inspections`, group: 'Enforcement', depth: 'core' },
    { id: 'complaint_resolution', label: 'Complaint resolution', description: 'ERA §30 external-party complaint chain.', href: `${REGULATOR}?tab=complaint_resolution`, group: 'Enforcement', depth: 'core' },
    { id: 'dispositions', label: 'Dispositions', description: 'NERSA §10 11-state final disposition workflow.', href: `${REGULATOR}?tab=dispositions`, group: 'Enforcement', depth: 'advanced' },
    // Economics
    { id: 'tariff_determinations', label: 'Tariff determinations', description: 'NERSA §15-16 + MYPD price-control determination.', href: `${REGULATOR}?tab=tariff_determinations`, group: 'Economics', depth: 'advanced' },
    { id: 'levy_assessments', label: 'Levy assessments', description: 'NERA §5B licensee levy assessment and collection.', href: `${REGULATOR}?tab=levy_assessments`, group: 'Economics', depth: 'advanced' },
    { id: 'public_consultations', label: 'Public consultations', description: 'ERA §10 + PAJA stakeholder engagement.', href: `${REGULATOR}?tab=public_consultations`, group: 'Economics', depth: 'advanced' },
    { id: 'market_conduct_exams', label: 'Market conduct exams', description: 'FSCA Conduct Standard 1/2020 examination lifecycle.', href: `${REGULATOR}?tab=market_conduct_exams`, group: 'Economics', depth: 'advanced' },
    // Exports
    { id: 'regulator_exports', label: 'NERSA exports', description: 'Certified regulatory exports for NERSA/EMIR/FSCA.', href: `${REGULATOR}?tab=regulator-exports`, group: 'Exports', depth: 'advanced' },
    { id: 'esg_disclosure', label: 'ESG disclosure', description: 'Regulator ESG disclosure chain.', href: `${REGULATOR}?tab=esg-disclosure`, group: 'Exports', depth: 'advanced' },
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all regulatory events.', href: `${REGULATOR}?tab=audit`, group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],

  admin: [
    // Platform
    { id: 'tenant_events', label: 'Tenant events', description: 'Platform-wide tenant event stream.', href: `${ADMIN}?tab=tenant_events`, group: 'Platform', depth: 'core' },
    { id: 'billing', label: 'Platform billing', description: 'Tenant billing and subscription management.', href: `${ADMIN}?tab=billing`, group: 'Platform', depth: 'core' },
    { id: 'subscription_billing', label: 'Subscription billing', description: 'Recurring subscription billing chain.', href: `${ADMIN}?tab=subscription-billing`, group: 'Platform', depth: 'core' },
    { id: 'flags', label: 'Feature flags', description: 'Manage platform feature flag overrides.', href: `${ADMIN}?tab=flags`, group: 'Platform', depth: 'core' },
    { id: 'kyc_verifications', label: 'KYC verifications', description: 'KYC identity verification queue and status.', href: `${ADMIN}?tab=kyc-verifications`, group: 'Platform', depth: 'core' },
    { id: 'data_subject_requests', label: 'Data subject requests', description: 'POPIA DSAR management queue.', href: `${ADMIN}?tab=data-subject-requests`, group: 'Platform', depth: 'core' },
    // Audit
    { id: 'settlement_audit', label: 'Settlement audit', description: 'Cross-settlement audit and reconciliation.', href: `${ADMIN}?tab=settlement_audit`, group: 'Audit', depth: 'advanced' },
    { id: 'platform_audit', label: 'Platform audit', description: 'Full platform event audit chain.', href: `${ADMIN}?tab=platform_audit`, group: 'Audit', depth: 'advanced' },
    { id: 'pii_access', label: 'PII access log', description: 'POPIA PII access audit trail.', href: `${ADMIN}?tab=pii_access`, group: 'Audit', depth: 'advanced' },
    { id: 'audit_chain', label: 'Audit chain', description: 'Tamper-evident audit chain for admin actions.', href: `${ADMIN}?tab=audit-chain`, group: 'Audit', depth: 'advanced' },
    { id: 'cascade_dlq', label: 'Cascade DLQ', description: 'Cascade dead-letter queue — inspect and replay failed events.', href: `${ADMIN}?tab=cascade-dlq`, group: 'Audit', depth: 'advanced' },
    // Compliance
    { id: 'regulator_exports', label: 'Regulator exports', description: 'Generate certified platform exports.', href: `${ADMIN}?tab=regulator-exports`, group: 'Compliance', depth: 'advanced' },
    { id: 'reconciliation_attestation', label: 'Reconciliation attestation', description: 'End-of-period reconciliation attestation.', href: `${ADMIN}?tab=reconciliation-attestation`, group: 'Compliance', depth: 'advanced' },
    { id: 'control_environment_audit', label: 'Control environment audit', description: 'Internal control environment audit report.', href: `${ADMIN}?tab=control-environment-audit`, group: 'Compliance', depth: 'advanced' },
    // ML
    { id: 'anomaly_ml', label: 'Anomaly detection (ML)', description: 'Platform-wide anomaly detection model management.', href: `${ADMIN}?tab=anomaly-detection-ml`, group: 'ML & AI', depth: 'advanced' },
    { id: 'rul_ml', label: 'RUL prediction (ML)', description: 'Remaining useful life prediction model management.', href: `${ADMIN}?tab=rul-prediction-ml`, group: 'ML & AI', depth: 'advanced' },
    { id: 'fault_ml', label: 'Fault fingerprint (ML)', description: 'Physics-based fault fingerprint model management.', href: `${ADMIN}?tab=fault-fingerprint-ml`, group: 'ML & AI', depth: 'advanced' },
    ...COMMON,
  ],

  support: [
    // Tickets
    { id: 'tickets', label: 'Support tickets', description: 'Manage and resolve customer support requests.', href: `${SUPPORT}?tab=tickets`, group: 'Tickets', depth: 'core' },
    { id: 'ticket_chain', label: 'Ticket lifecycle', description: 'P1-P4 tiered SLA ticket state machine.', href: `${SUPPORT}?tab=ticket_chain`, group: 'Tickets', depth: 'core' },
    { id: 'escalations', label: 'Escalations', description: 'Escalated issue register and response tracking.', href: `${SUPPORT}?tab=escalations`, group: 'Tickets', depth: 'core' },
    { id: 'csat', label: 'SLA & CSAT monitoring', description: 'ITIL 4 CSM SLA adherence and customer satisfaction.', href: `${SUPPORT}?tab=csat`, group: 'Tickets', depth: 'core' },
    { id: 'sla_performance', label: 'SLA performance reports', description: 'ITIL 4 SLM + ISO 20000-1 SLA performance reporting.', href: `${SUPPORT}?tab=sla_performance_reports`, group: 'Tickets', depth: 'advanced' },
    // ITIL Chains
    { id: 'problem_chain', label: 'Problem management', description: 'ITIL 4 + ISO 20000-1 root-cause problem chain.', href: `${SUPPORT}?tab=problem_chain`, group: 'ITIL Chains', depth: 'advanced' },
    { id: 'change_chain', label: 'Change enablement', description: 'ITIL RFC lifecycle with CAB and ECAB fast-path.', href: `${SUPPORT}?tab=change_chain`, group: 'ITIL Chains', depth: 'advanced' },
    { id: 'security_remediation', label: 'Security remediations', description: 'OT/CVSS-tiered vulnerability remediation chain.', href: `${SUPPORT}?tab=security_remediation`, group: 'ITIL Chains', depth: 'advanced' },
    // OEM
    { id: 'warranty_recovery', label: 'Warranty recovery', description: 'OEM warranty cost-recovery claim lifecycle.', href: `${SUPPORT}?tab=warranty_recovery`, group: 'OEM', depth: 'advanced' },
    { id: 'spare_parts', label: 'Spare parts', description: 'SANS/IEC 62402 + VED criticality spare parts provisioning.', href: `${SUPPORT}?tab=spare_parts`, group: 'OEM', depth: 'advanced' },
    { id: 'service_contracts', label: 'Service contracts', description: 'O&M service contract register.', href: `${SUPPORT}?tab=service_contracts`, group: 'OEM', depth: 'core' },
    { id: 'oem_fco', label: 'OEM FCOs', description: 'Field change order register from OEMs.', href: `${SUPPORT}?tab=oem_fco`, group: 'OEM', depth: 'advanced' },
    // Cross-tenant
    { id: 'cross_tenant', label: 'Cross-tenant', description: 'Cross-tenant support delegation and management.', href: `${SUPPORT}?tab=cross_tenant`, group: 'Platform', depth: 'advanced' },
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all support events.', href: `${SUPPORT}?tab=audit`, group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],

  esums_owner: [
    { id: 'commission_site', label: 'Commission a site', description: 'Take a site from planned to in-O&M through the commissioning chain.', href: '/esums?tab=commissioning', group: 'Onboarding', depth: 'core' },
    { id: 'add_meter', label: 'Add a smart meter', description: 'Register and commission a smart meter on one of your sites.', href: '/esums?tab=smart_meter', group: 'Onboarding', depth: 'core' },
    { id: 'predictive_health', label: 'Predictive asset health', description: 'Review anomaly, RUL, and fault-fingerprint predictions for your fleet.', href: '/esums?tab=prognostics', group: 'Operations', depth: 'advanced' },
    { id: 'opportunities', label: 'Monetisable opportunities', description: 'Rule-based scan of the fleet for performance upside, each quantified in ZAR.', href: '/esums?tab=opportunities', group: 'Operations', depth: 'advanced' },
    ...COMMON,
  ],

  esco: [
    // Portfolio
    { id: 'service_contracts', label: 'Service contracts', description: 'O&M service contract register — link clients to SLA tiers and availability obligations.', href: '/esco/workstation?tab=service-contracts', group: 'Portfolio', depth: 'core' },
    { id: 'sites_portfolio', label: 'Sites under management', description: 'Multi-client site portfolio — all commissioned sites and their operational status.', href: '/esco/workstation?tab=sites-portfolio', group: 'Portfolio', depth: 'core' },
    // Operations
    { id: 'work_orders', label: 'Work orders (W16)', description: 'Emergency, corrective, and preventive work order dispatch and tracking.', href: '/esco/workstation?tab=work-orders', group: 'Operations', depth: 'core' },
    { id: 'pm_compliance', label: 'PM compliance (W59)', description: 'IEC 62446 + RCM preventive maintenance schedule compliance chain.', href: '/esco/workstation?tab=pm-compliance', group: 'Operations', depth: 'core' },
    { id: 'permit_to_work', label: 'Permit-to-work / LOTO (W64)', description: 'OHSA + SANS 10142 control-of-work permit chain for electrical and confined-space work.', href: '/esco/workstation?tab=permit-to-work', group: 'Operations', depth: 'core' },
    { id: 'commissioning', label: 'Site commissioning (W12)', description: 'NERSA §C-5 9-state commissioning chain from planned to in-O&M.', href: '/esco/workstation?tab=commissioning', group: 'Operations', depth: 'core' },
    // Asset Health
    { id: 'prognostics', label: 'Asset prognostics (W71)', description: '6-method anomaly ensemble + RUL + 12-mode physics fault fingerprinting — NTT-beating predictive O&M.', href: '/esco/workstation?tab=prognostics', group: 'Asset Health', depth: 'advanced' },
    { id: 'availability', label: 'Availability guarantees (W51)', description: 'IEC 61724 time-based uptime guarantee tracking — liquidated damages chain on breach.', href: '/esco/workstation?tab=availability', group: 'Asset Health', depth: 'core' },
    // Supply Chain
    { id: 'spare_parts', label: 'Spare parts provisioning (W72)', description: 'SANS/IEC 62402 + VED criticality spare parts requisition and stock management.', href: '/esco/workstation?tab=spare-parts', group: 'Supply Chain', depth: 'advanced' },
    { id: 'vendor_escalation', label: 'Vendor escalation (W35)', description: 'CPA §56/§61 equipment defect dispute chain against OEM suppliers.', href: '/esco/workstation?tab=vendor-escalation', group: 'Supply Chain', depth: 'advanced' },
    { id: 'warranty_claims', label: 'Warranty claims (W15)', description: '10-state OEM warranty claim and RMA lifecycle.', href: '/esco/workstation?tab=warranty-claims', group: 'Supply Chain', depth: 'core' },
    { id: 'warranty_recovery', label: 'Warranty recovery (W63)', description: 'Cost-recovery claim against OEM for warranty repair costs.', href: '/esco/workstation?tab=warranty-recovery', group: 'Supply Chain', depth: 'advanced' },
    // Safety
    { id: 'hse', label: 'HSE incidents (W25)', description: 'OHSA §24 + NEMA §30 health, safety, and environmental incident lifecycle.', href: '/esco/workstation?tab=hse', group: 'Safety', depth: 'core' },
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all O&M events.', href: '/esco/workstation?tab=audit', group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],

  epc_contractor: [
    // Document Control
    { id: 'submittals', label: 'Submittals', description: 'Document submittal register — shop drawings, specifications, and vendor docs for client review.', href: '/epc/workstation?tab=submittals', group: 'Document Control', depth: 'core' },
    { id: 'rfis', label: 'RFIs', description: 'Requests for information — contractual queries to the client requiring formal response.', href: '/epc/workstation?tab=rfis', group: 'Document Control', depth: 'core' },
    { id: 'change_orders', label: 'Change orders', description: 'Scope and cost change order register — tracks agreed variations to the EPC contract.', href: '/epc/workstation?tab=change-orders', group: 'Document Control', depth: 'core' },
    { id: 'technical_queries', label: 'Technical queries', description: 'Engineering technical query register for design clarifications.', href: '/epc/workstation?tab=technical-queries', group: 'Document Control', depth: 'advanced' },
    // Quality
    { id: 'itps', label: 'Inspection test plans (ITPs)', description: 'ITP hold-point and witness-point register — mandatory sign-off before work advances.', href: '/epc/workstation?tab=itps', group: 'Quality', depth: 'core' },
    { id: 'ncrs', label: 'Non-conformance reports (NCRs)', description: 'ISO 9001 defect identification and corrective action close-out workflow.', href: '/epc/workstation?tab=ncrs', group: 'Quality', depth: 'core' },
    { id: 'punch_list', label: 'Punch list', description: 'Pre-commissioning defect punch list — categories A (hard stop) and B (cosmetic).', href: '/epc/workstation?tab=punch-list', group: 'Quality', depth: 'core' },
    { id: 'method_statements', label: 'Method statements', description: 'High-risk work method statements — client approval required before commencement.', href: '/epc/workstation?tab=method-statements', group: 'Quality', depth: 'advanced' },
    // Site
    { id: 'site_diary', label: 'Site diary', description: 'Daily site progress records — workforce, weather, progress summary.', href: '/epc/workstation?tab=site-diary', group: 'Site', depth: 'core' },
    // Safety
    { id: 'hse', label: 'HSE incidents (W25)', description: 'OHSA §24 + NEMA §30 construction HSE incident reporting chain.', href: '/epc/workstation?tab=hse', group: 'Safety', depth: 'core' },
    { id: 'audit', label: 'Audit trail', description: 'Tamper-evident audit log for all EPC document control events.', href: '/epc/workstation?tab=audit', group: 'Compliance', depth: 'advanced' },
    ...COMMON,
  ],
};

export function capabilitiesForRole(role: string): Capability[] {
  return CAPABILITY_MAP[role] ?? COMMON;
}
