import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../SuitePage';

export function LenderSuitePage() {
  const tabs: TabSpec[] = [
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
  ];
  return (
    <SuitePage
      title="Lender workbench"
      subtitle="Covenant testing, IE certs, waterfalls, reserve accounts and stress scenarios."
      tabs={tabs}
    />
  );
}
