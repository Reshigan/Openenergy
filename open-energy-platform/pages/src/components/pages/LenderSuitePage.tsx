import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../SuitePage';
import { platformTabs } from '../platformTabs';
import { lenderCompletionTabs } from '../roleCompletionTabs';
import { LenderInsights } from '../widgets/LenderInsights';
import { DunningTab } from '../lender/DunningTab';
import { DrawdownChainTab } from '../lender/DrawdownChainTab';
import { DisbursementChainTab } from '../disbursement/DisbursementChainTab';
import { CovenantCertificateTab } from '../lender/CovenantCertificateTab';
import { LoanDefaultChainTab } from '../lender/LoanDefaultChainTab';

export function LenderSuitePage() {
  const tabs: TabSpec[] = [
    {
      key: 'drawdowns',
      label: 'Drawdowns',
      endpoint: '',
      description: 'Disbursement certification chain · IE + CP gate, SARB large-exposure on senior approvals, regulator inbox on senior breaches.',
      columns: [],
      customContent: <DrawdownChainTab />,
    },
    {
      key: 'disbursements',
      label: 'Disbursements',
      endpoint: '',
      description: 'UoP reconciliation chain · SARB Exchange Control + Equator Principles + IE certification; clawback for ALL tiers, SLA breach senior_a/b only.',
      columns: [],
      customContent: <DisbursementChainTab />,
    },
    {
      key: 'covenant-certificates',
      label: 'Covenant certificates',
      endpoint: '',
      description: 'Periodic LMA compliance certificate chain · DSCR/LLCR/gearing evidence, agent review, breach → waiver/cure/acceleration. URGENT tier SLA; acceleration crosses regulator for ALL tiers, breach + SLA breach senior/mezz only.',
      columns: [],
      customContent: <CovenantCertificateTab />,
    },
    {
      key: 'loan-defaults',
      label: 'Loan defaults',
      endpoint: '',
      description: 'LMA event-of-default → enforcement / step-in / restructure / write-off chain · picks up where covenant acceleration ends. URGENT tier SLA; write-off crosses regulator for ALL tiers, acceleration + enforcement + SLA breach senior/mezz only.',
      columns: [],
      customContent: <LoanDefaultChainTab />,
    },
    {
      key: 'dunning',
      label: 'Dunning queue',
      endpoint: '',
      description: 'Cycle 1/2/3 covenant dunning notices, watchlist tier escalation, regulator hand-off on cycle-3 expiry.',
      columns: [],
      customContent: <DunningTab />,
    },
    {
      key: 'insights',
      label: 'Insights',
      endpoint: '',
      description: 'Covenant headroom, debt-service waterfall, facility IRR sensitivity, recovery NPV, stress test, portfolio waterfall.',
      columns: [],
      customContent: <LenderInsights />,
    },
    {
      key: 'covenants',
      label: 'Covenants',
      endpoint: '/lender/covenants',
      description: 'DSCR, LLCR, availability, insurance and reporting covenants.',
      columns: [
        { key: 'covenant_code', label: 'Code' },
        { key: 'covenant_name', label: 'Name' },
        { key: 'covenant_type', label: 'Type' },
        { key: 'operator', label: 'Op' },
        { key: 'threshold', label: 'Threshold', align: 'right', number: true },
        { key: 'measurement_frequency', label: 'Frequency' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add covenant',
        endpoint: '/lender/covenants',
        fields: [
          { name: 'project_id', label: 'Project ID', type: 'text' },
          { name: 'covenant_code', label: 'Code', type: 'text', required: true, placeholder: 'DSCR_12M' },
          { name: 'covenant_name', label: 'Name', type: 'text', required: true },
          { name: 'covenant_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'financial', label: 'Financial' },
            { value: 'operational', label: 'Operational' },
            { value: 'insurance', label: 'Insurance' },
            { value: 'reporting', label: 'Reporting' },
            { value: 'legal', label: 'Legal' },
            { value: 'environmental', label: 'Environmental' },
            { value: 'governance', label: 'Governance' },
          ] },
          { name: 'operator', label: 'Operator', type: 'select', required: true, options: [
            { value: 'gte', label: '≥' },
            { value: 'gt', label: '>' },
            { value: 'lte', label: '≤' },
            { value: 'lt', label: '<' },
            { value: 'eq', label: '=' },
            { value: 'between', label: 'Between' },
          ] },
          { name: 'threshold', label: 'Threshold', type: 'number' },
          { name: 'threshold_upper', label: 'Upper (for "between")', type: 'number' },
          { name: 'measurement_frequency', label: 'Frequency', type: 'select', required: true, options: [
            { value: 'monthly', label: 'Monthly' },
            { value: 'quarterly', label: 'Quarterly' },
            { value: 'semi_annual', label: 'Semi-annual' },
            { value: 'annual', label: 'Annual' },
            { value: 'on_event', label: 'On event' },
          ] },
          { name: 'first_test_date', label: 'First test date', type: 'date' },
          { name: 'material_adverse_effect', label: 'Material adverse effect?', type: 'checkbox' },
          { name: 'waivable', label: 'Waivable?', type: 'checkbox', default: true },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
      rowActions: [
        { label: 'Test', tone: 'primary', endpoint: '/lender/covenants/{id}/test',
          form: { title: 'Record covenant test', endpoint: '', fields: [
            { name: 'test_period', label: 'Test period', type: 'text', required: true, placeholder: 'Q2-2026' },
            { name: 'test_date', label: 'Test date', type: 'date', required: true },
            { name: 'measured_value', label: 'Measured value', type: 'number' },
            { name: 'measured_value_text', label: 'Measured value (text)', type: 'text', help: 'For non-numeric covenants.' },
            { name: 'evidence_r2_key', label: 'Evidence R2 key', type: 'text' },
            { name: 'narrative', label: 'Narrative', type: 'textarea' },
          ] },
        },
        { label: 'Waive', endpoint: '/lender/covenants/{id}/waive',
          form: { title: 'Request waiver', endpoint: '', fields: [
            { name: 'reason', label: 'Reason', type: 'textarea', required: true },
            { name: 'requested_until', label: 'Requested until', type: 'date', required: true },
          ] },
        },
      ],
    },
    {
      key: 'ie',
      label: 'IE certifications',
      endpoint: '/lender/ie-certifications',
      description: 'Independent Engineer sign-offs gating drawdowns and milestones.',
      columns: [
        { key: 'cert_number', label: '#' },
        { key: 'cert_type', label: 'Type' },
        { key: 'period', label: 'Period' },
        { key: 'physical_progress_pct', label: 'Physical %', align: 'right', number: true },
        { key: 'financial_progress_pct', label: 'Financial %', align: 'right', number: true },
        { key: 'certified_amount_zar', label: 'Certified', align: 'right', currency: true },
        { key: 'cert_issue_date', label: 'Issued', date: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Submit IE certification',
        endpoint: '/lender/ie-certifications',
        fields: [
          { name: 'cert_number', label: 'Cert number', type: 'text', required: true },
          { name: 'project_id', label: 'Project ID', type: 'text', required: true },
          { name: 'disbursement_id', label: 'Linked disbursement ID', type: 'text' },
          { name: 'ie_participant_id', label: 'IE participant ID', type: 'text' },
          { name: 'cert_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'monthly_progress', label: 'Monthly progress' },
            { value: 'milestone_completion', label: 'Milestone completion' },
            { value: 'drawdown', label: 'Drawdown' },
            { value: 'commissioning', label: 'Commissioning' },
            { value: 'performance_test', label: 'Performance test' },
            { value: 'taking_over', label: 'Taking over' },
            { value: 'final', label: 'Final' },
          ] },
          { name: 'period', label: 'Period', type: 'text' },
          { name: 'physical_progress_pct', label: 'Physical %', type: 'number' },
          { name: 'financial_progress_pct', label: 'Financial %', type: 'number' },
          { name: 'recommended_drawdown_zar', label: 'Recommended drawdown', type: 'number' },
          { name: 'certified_amount_zar', label: 'Certified amount', type: 'number' },
          { name: 'qualifications', label: 'Qualifications', type: 'textarea' },
          { name: 'site_visit_date', label: 'Site visit date', type: 'date' },
          { name: 'cert_issue_date', label: 'Issue date', type: 'date', required: true },
          { name: 'document_r2_key', label: 'Document R2 key', type: 'text' },
        ],
      },
      rowActions: [
        { label: 'Decide', tone: 'primary', endpoint: '/lender/ie-certifications/{id}/decide',
          form: { title: 'Certification outcome', endpoint: '', fields: [
            { name: 'status', label: 'Status', type: 'select', required: true, options: [
              { value: 'certified', label: 'Certified (positive)' },
              { value: 'qualified', label: 'Qualified' },
              { value: 'rejected', label: 'Rejected' },
            ] },
          ] },
        },
      ],
    },
    {
      key: 'waterfalls',
      label: 'Waterfalls',
      endpoint: '/lender/reserves',  // no GET-list; reuse reserves as placeholder summary. Use "New" to create a waterfall.
      description:
        'Cash-flow waterfalls — priority tranches (opex, tax, interest, principal, DSRA, MRA, mezz, equity). Use New to configure a structure.',
      columns: [
        { key: 'reserve_type', label: 'Reserve (linked)' },
        { key: 'target_amount_zar', label: 'Target', align: 'right', currency: true },
        { key: 'current_balance_zar', label: 'Balance', align: 'right', currency: true },
      ],
      create: {
        title: 'New waterfall structure',
        endpoint: '/lender/waterfalls',
        fields: [
          { name: 'project_id', label: 'Project ID', type: 'text', required: true },
          { name: 'waterfall_name', label: 'Name', type: 'text', required: true },
          { name: 'effective_from', label: 'Effective from', type: 'date', required: true },
          { name: 'effective_to', label: 'Effective to', type: 'date' },
          { name: 'tranches', label: 'Tranches (JSON array)', type: 'json', required: true, default: [
            { priority: 1, tranche_name: 'Opex', tranche_type: 'opex' },
            { priority: 2, tranche_name: 'Tax', tranche_type: 'tax' },
            { priority: 3, tranche_name: 'Senior interest', tranche_type: 'senior_interest' },
            { priority: 4, tranche_name: 'Senior principal', tranche_type: 'senior_principal' },
            { priority: 5, tranche_name: 'DSRA top-up', tranche_type: 'dsra' },
            { priority: 6, tranche_name: 'MRA top-up', tranche_type: 'mra' },
            { priority: 7, tranche_name: 'Mezzanine', tranche_type: 'mezzanine' },
            { priority: 8, tranche_name: 'Equity distribution', tranche_type: 'equity_distribution' },
          ] as unknown as Record<string, unknown> },
        ],
      },
    },
    {
      key: 'reserves',
      label: 'Reserves',
      endpoint: '/lender/reserves',
      description: 'DSRA, MRA, O&M and tax reserves. Record movements (top-ups, draws, releases).',
      columns: [
        { key: 'reserve_type', label: 'Type' },
        { key: 'target_basis', label: 'Basis' },
        { key: 'target_amount_zar', label: 'Target', align: 'right', currency: true },
        { key: 'current_balance_zar', label: 'Balance', align: 'right', currency: true },
        { key: 'custodian', label: 'Custodian' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Open reserve account',
        endpoint: '/lender/reserves',
        fields: [
          { name: 'project_id', label: 'Project ID', type: 'text', required: true },
          { name: 'reserve_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'dsra', label: 'DSRA' },
            { value: 'mra', label: 'MRA' },
            { value: 'om_reserve', label: 'O&M reserve' },
            { value: 'tax_reserve', label: 'Tax reserve' },
            { value: 'insurance', label: 'Insurance' },
            { value: 'other', label: 'Other' },
          ] },
          { name: 'target_amount_zar', label: 'Target amount', type: 'number', required: true },
          { name: 'target_basis', label: 'Target basis', type: 'text', placeholder: 'next_6m_debt_service' },
          { name: 'current_balance_zar', label: 'Opening balance', type: 'number' },
          { name: 'custodian', label: 'Custodian', type: 'text' },
          { name: 'account_number', label: 'Account #', type: 'text' },
        ],
      },
      rowActions: [
        { label: 'Movement', endpoint: '/lender/reserves/{id}/movement',
          form: { title: 'Record reserve movement', endpoint: '', fields: [
            { name: 'movement_type', label: 'Type', type: 'select', required: true, options: [
              { value: 'top_up', label: 'Top-up' },
              { value: 'release', label: 'Release' },
              { value: 'draw', label: 'Draw' },
              { value: 'interest', label: 'Interest' },
              { value: 'transfer_in', label: 'Transfer in' },
              { value: 'transfer_out', label: 'Transfer out' },
            ] },
            { name: 'amount_zar', label: 'Amount (ZAR)', type: 'number', required: true },
            { name: 'waterfall_run_id', label: 'Waterfall run ID', type: 'text' },
            { name: 'reason', label: 'Reason', type: 'textarea' },
          ] },
        },
      ],
    },
    {
      key: 'stress_scenarios',
      label: 'Stress scenarios',
      endpoint: '/lender/stress/scenarios',
      description: 'Pre-loaded + custom scenarios. Use Run on a scenario to score a project.',
      columns: [
        { key: 'scenario_name', label: 'Scenario' },
        { key: 'description', label: 'Description' },
        { key: 'parameters_json', label: 'Params' },
      ],
      create: {
        title: 'New stress scenario',
        endpoint: '/lender/stress/scenarios',
        fields: [
          { name: 'scenario_name', label: 'Name', type: 'text', required: true },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'parameters', label: 'Parameters (JSON)', type: 'json', default: {
            tariff_delta_pct: 0, availability_delta_pct: 0, fx_delta_pct: 0, inflation_delta_pct: 0,
          } as Record<string, unknown> },
        ],
      },
      rowActions: [
        { label: 'Run on project', tone: 'primary', endpoint: '/lender/stress/run',
          form: { title: 'Run stress scenario', endpoint: '', fields: [
            { name: 'scenario_id', label: 'Scenario ID', type: 'text', required: true, help: 'Copy from the row id you clicked.' },
            { name: 'project_id', label: 'Project ID', type: 'text', required: true },
            { name: 'period', label: 'Period', type: 'text' },
            { name: 'notes', label: 'Notes', type: 'textarea' },
          ] },
        },
      ],
    },
    {
      key: 'financed_emissions',
      label: 'Financed emissions',
      endpoint: '/watershed/pcaf/financed',
      description: 'PCAF Part A asset-class-by-asset-class financed emissions inventory with attribution and data-quality scores.',
      columns: [
        { key: 'counterparty_name', label: 'Counterparty' },
        { key: 'asset_class', label: 'Asset class' },
        { key: 'reporting_year', label: 'Year' },
        { key: 'outstanding_amount_zar', label: 'Exposure', align: 'right', currency: true },
        { key: 'attribution_factor', label: 'Attribution', align: 'right', number: true },
        { key: 'financed_total_tco2e', label: 'Financed tCO₂e', align: 'right', number: true },
        { key: 'pcaf_data_quality_score', label: 'PCAF DQ', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Record financed exposure',
        endpoint: '/watershed/pcaf/financed',
        fields: [
          { name: 'reporting_year', label: 'Reporting year', type: 'number', required: true, default: new Date().getFullYear() },
          { name: 'asset_class', label: 'Asset class', type: 'select', required: true, options: [
            { value: 'listed_equity', label: 'Listed equity & corporate bonds' },
            { value: 'business_loans', label: 'Business loans & unlisted equity' },
            { value: 'project_finance', label: 'Project finance' },
            { value: 'commercial_real_estate', label: 'Commercial real estate' },
            { value: 'mortgages', label: 'Mortgages' },
            { value: 'motor_vehicle_loans', label: 'Motor vehicle loans' },
            { value: 'sovereign_debt', label: 'Sovereign debt' },
            { value: 'insurance_underwriting', label: 'Insurance-associated' },
          ] },
          { name: 'counterparty_name', label: 'Counterparty', type: 'text', required: true },
          { name: 'counterparty_country', label: 'Country', type: 'text' },
          { name: 'counterparty_sector_nace', label: 'NACE sector', type: 'text' },
          { name: 'counterparty_revenue_zar', label: 'Revenue (ZAR)', type: 'number' },
          { name: 'counterparty_evic_zar', label: 'EVIC (ZAR)', type: 'number' },
          { name: 'outstanding_amount_zar', label: 'Outstanding (ZAR)', type: 'number', required: true },
          { name: 'attribution_method', label: 'Attribution method', type: 'select', options: [
            { value: 'evic', label: 'EVIC' }, { value: 'revenue', label: 'Revenue' },
            { value: 'property_value', label: 'Property value' }, { value: 'asset_value', label: 'Asset value' },
            { value: 'vehicle_value', label: 'Vehicle value' }, { value: 'total_equity', label: 'Total equity' },
          ] },
          { name: 'counterparty_scope1_tco2e', label: 'Scope 1 (tCO₂e)', type: 'number' },
          { name: 'counterparty_scope2_tco2e', label: 'Scope 2 (tCO₂e)', type: 'number' },
          { name: 'counterparty_scope3_tco2e', label: 'Scope 3 (tCO₂e)', type: 'number' },
          { name: 'emissions_data_source', label: 'Data source', type: 'select', options: [
            { value: 'reported', label: 'Counterparty reported' }, { value: 'CDP', label: 'CDP' },
            { value: 'proxy', label: 'Proxy' }, { value: 'sector_average', label: 'Sector average' },
          ] },
          { name: 'pcaf_data_quality_score', label: 'PCAF DQ (1-5)', type: 'number' },
        ],
      },
    },
    {
      key: 'climate_scenarios',
      label: 'Climate scenarios',
      endpoint: '/watershed/scenarios/runs',
      description: 'NGFS / IEA scenario runs against the financed portfolio — emissions-at-risk and financial value-at-risk per sector.',
      columns: [
        { key: 'scenario_name', label: 'Scenario' },
        { key: 'family', label: 'Family' },
        { key: 'horizon_years', label: 'Horizon', align: 'right', number: true },
        { key: 'portfolio_emissions_base_tco2e', label: 'Base tCO₂e', align: 'right', number: true },
        { key: 'portfolio_emissions_target_tco2e', label: 'Target tCO₂e', align: 'right', number: true },
        { key: 'emissions_at_risk_tco2e', label: 'At risk', align: 'right', number: true },
        { key: 'financial_value_at_risk_zar', label: 'Financial VaR', align: 'right', currency: true },
        { key: 'worst_sector_nace', label: 'Worst sector' },
      ],
      create: {
        title: 'Run scenario',
        endpoint: '/watershed/scenarios/run',
        fields: [
          { name: 'scenario_code', label: 'Scenario', type: 'select', required: true, options: [
            { value: 'NGFS_NET_ZERO', label: 'NGFS Net Zero 2050' },
            { value: 'NGFS_BELOW_2C', label: 'NGFS Below 2°C' },
            { value: 'NGFS_DELAYED', label: 'NGFS Delayed Transition' },
            { value: 'NGFS_CURRENT', label: 'NGFS Current Policies' },
            { value: 'IEA_NZE_2050', label: 'IEA Net Zero 2050' },
            { value: 'IEA_APS', label: 'IEA Announced Pledges' },
            { value: 'IPCC_SSP1_19', label: 'IPCC SSP1-1.9' },
            { value: 'IPCC_SSP5_85', label: 'IPCC SSP5-8.5 (hot-house)' },
          ] },
          { name: 'horizon_years', label: 'Horizon (years)', type: 'number', default: 10 },
        ],
      },
    },
    {
      key: 'counterparty_requests',
      label: 'Counterparty data',
      endpoint: '/watershed/counterparties/requests',
      description: 'PCAF data-quality 1-2 sourcing via secure share-links sent to counterparties.',
      columns: [
        { key: 'counterparty_name', label: 'Counterparty' },
        { key: 'counterparty_email', label: 'Email' },
        { key: 'reporting_year', label: 'Year' },
        { key: 'scope_requested', label: 'Scope requested' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'submitted_at', label: 'Submitted', date: true },
      ],
      create: {
        title: 'Request counterparty data',
        endpoint: '/watershed/counterparties/requests',
        fields: [
          { name: 'counterparty_name', label: 'Counterparty name', type: 'text', required: true },
          { name: 'counterparty_email', label: 'Email', type: 'text' },
          { name: 'reporting_year', label: 'Reporting year', type: 'number', required: true, default: new Date().getFullYear() },
          { name: 'scope_requested', label: 'Scope requested', type: 'select', required: true, options: [
            { value: 'scope1_only', label: 'Scope 1 only' },
            { value: 'scope1_and_2', label: 'Scope 1 + 2' },
            { value: 'all_scopes', label: 'All scopes (1-3)' },
            { value: 'custom', label: 'Custom' },
          ] },
          { name: 'asset_class', label: 'Asset class', type: 'text' },
          { name: 'exposure_zar', label: 'Exposure (ZAR)', type: 'number' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
    ...lenderCompletionTabs(),
    ...platformTabs('lender_credit'),
  ];
  return (
    <SuitePage
      eyebrow="Lender · Suite"
      title="Lender workbench"
      subtitle="Covenant testing, IE certs, waterfalls, reserve accounts and stress scenarios."
      tabs={tabs}
      heroRole="lender"
      heroEyebrow="Lender · portfolio overview"
      heroTitle="Lender workbench"
      heroSubtitle="Covenants, IE certs, waterfalls, reserves and stress scenarios."
      aiBriefRole="lender"
      aiBriefAccent={{ from: '#1a8a5b', to: '#3b82c4' }}
    />
  );
}
