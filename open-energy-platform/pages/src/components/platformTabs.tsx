// ═══════════════════════════════════════════════════════════════════════════
// Shared TabSpecs for the platform-wide infrastructure tabs.
//
// Each role's SuitePage can append these via `...platformTabs('trading')`
// to get the same Scenarios / Anomalies / AI / Audit tabs without
// duplicating field definitions across pages.
// ═══════════════════════════════════════════════════════════════════════════

import { StatusPill, TabSpec } from './SuitePage';
import React from 'react';

// Domain → scenario codes shown in the "Run scenario" dropdown.
const SCENARIO_OPTIONS: Record<string, { value: string; label: string }[]> = {
  trading: [
    { value: 'TR_PRICE_SHOCK_DOWN_20', label: 'Price shock -20%' },
    { value: 'TR_PRICE_SHOCK_DOWN_40', label: 'Price shock -40%' },
    { value: 'TR_PRICE_SHOCK_UP_30',   label: 'Price shock +30%' },
    { value: 'TR_VOL_DOUBLE',          label: 'Volatility doubles' },
    { value: 'TR_COUNTERPARTY_DEFAULT',label: 'Top-3 counterparty default' },
  ],
  grid: [
    { value: 'GR_N1_LARGEST_GEN',  label: 'N-1: largest generator trips' },
    { value: 'GR_N1_LINE_OUTAGE',  label: 'N-1: 400kV line outage' },
    { value: 'GR_N2_DOUBLE_OUTAGE',label: 'N-2: gen + line' },
    { value: 'GR_LOAD_SHED_STAGE6',label: 'Stage-6 load shedding' },
  ],
  ipp_project: [
    { value: 'IPP_TARIFF_DOWN_15',     label: 'Tariff -15%' },
    { value: 'IPP_AVAIL_DOWN_10',      label: 'Availability -10%' },
    { value: 'IPP_CAPEX_OVERRUN_25',   label: 'Capex +25%' },
    { value: 'IPP_FX_DEPRECIATE_30',   label: 'ZAR -30% vs USD' },
  ],
  regulator_tariff: [
    { value: 'REG_TARIFF_PATH_LOW',    label: 'Low tariff path (+4%/yr)' },
    { value: 'REG_TARIFF_PATH_HIGH',   label: 'High tariff path (+15%/yr)' },
  ],
  lender_credit: [
    { value: 'LD_DSCR_BREACH',         label: 'DSCR breach scenario' },
  ],
  offtaker_demand: [
    { value: 'OFF_DEMAND_DROP_20',     label: 'Demand -20%' },
  ],
};

const AI_DOMAIN_OPTIONS: Record<string, { value: string; label: string }[]> = {
  trading: [
    { value: 'trade',                label: 'Classify trade pattern' },
    { value: 'market_surveillance',  label: 'Market surveillance' },
    { value: 'counterparty',         label: 'Counterparty risk' },
  ],
  grid: [
    { value: 'grid_alarm',           label: 'SCADA alarm triage' },
  ],
  ipp_project: [
    { value: 'ipp_milestone',        label: 'Milestone status' },
    { value: 'contract',             label: 'Contract classification' },
  ],
  regulator_tariff: [
    { value: 'license',              label: 'License application' },
    { value: 'market_surveillance',  label: 'Market surveillance' },
  ],
  lender_credit: [
    { value: 'counterparty',         label: 'Counterparty risk' },
    { value: 'invoice',              label: 'Invoice classification' },
  ],
  offtaker_demand: [
    { value: 'contract',             label: 'Contract classification' },
    { value: 'invoice',              label: 'Invoice classification' },
  ],
};

export function platformTabs(domain: string): TabSpec[] {
  const scenarioOpts = SCENARIO_OPTIONS[domain] || [];
  const aiOpts = AI_DOMAIN_OPTIONS[domain] || [{ value: 'generic', label: 'Generic' }];

  const tabs: TabSpec[] = [
    {
      key: `${domain}_scenarios`,
      label: 'Scenarios',
      endpoint: `/platform/scenarios/runs?domain=${domain}`,
      description: `Scenario analysis for the ${domain.replace('_',' ')} domain. Run NGFS-style shocks against your portfolio and review per-entity impact.`,
      columns: [
        { key: 'scenario_name', label: 'Scenario' },
        { key: 'scenario_severity', label: 'Severity', render: (r) => <StatusPill label={String(r.scenario_severity || '—')} tone={r.scenario_severity === 'extreme' ? 'critical' : r.scenario_severity === 'severe' ? 'critical' : r.scenario_severity === 'moderate' ? 'warn' : 'info'} /> },
        { key: 'horizon_value', label: 'Horizon', align: 'right', number: true },
        { key: 'base_value_zar', label: 'Base value', align: 'right', currency: true },
        { key: 'shocked_value_zar', label: 'Shocked', align: 'right', currency: true },
        { key: 'value_at_risk_zar', label: 'VaR', align: 'right', currency: true },
        { key: 'pct_change', label: '% Δ', align: 'right', number: true },
        { key: 'worst_entity', label: 'Worst hit' },
      ],
      create: {
        title: 'Run scenario',
        endpoint: '/platform/scenarios/run',
        fields: [
          { name: 'scenario_code', label: 'Scenario', type: 'select', required: true, options: scenarioOpts },
          { name: 'horizon_unit',  label: 'Horizon unit', type: 'select', options: [
            { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' },
            { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' },
          ], default: domain === 'trading' || domain === 'grid' ? 'day' : 'year' },
          { name: 'horizon_value', label: 'Horizon value', type: 'number', default: 1 },
        ],
      },
    },
    {
      key: `${domain}_anomalies`,
      label: 'Anomalies',
      endpoint: `/platform/anomalies?domain=${domain === 'ipp_project' ? 'ipp_milestone' : domain === 'regulator_tariff' ? 'market_surveillance' : domain}`,
      description: 'Open anomalies detected by heuristic + AI rules. Use the scan button on the Scenarios tab to run detection.',
      columns: [
        { key: 'rule', label: 'Rule' },
        { key: 'severity', label: 'Severity', render: (r) => <StatusPill label={String(r.severity)} tone={r.severity === 'critical' ? 'critical' : r.severity === 'high' ? 'warn' : 'info'} /> },
        { key: 'entity_table', label: 'Entity' },
        { key: 'entity_id', label: 'Record' },
        { key: 'detail', label: 'Detail' },
        { key: 'observed_value', label: 'Observed', align: 'right', number: true },
        { key: 'detected_at', label: 'Detected', date: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      rowActions: [
        { label: 'Resolve', endpoint: '/platform/anomalies/{id}', method: 'PATCH', tone: 'primary',
          form: { title: 'Resolve anomaly', endpoint: '', fields: [
            { name: 'status', label: 'Status', type: 'select', required: true, options: [
              { value: 'resolved', label: 'Resolved' },
              { value: 'dismissed', label: 'Dismissed' },
              { value: 'investigating', label: 'Investigating' },
            ] },
          ] },
        },
      ],
    },
    {
      key: `${domain}_ai`,
      label: 'AI classify',
      endpoint: `/platform/ai/classify?domain=${aiOpts[0].value}`,
      description: 'LLM-backed classification (Workers AI Llama 3.1). Submit text to get a label, confidence, and one-sentence reasoning.',
      columns: [
        { key: 'created_at', label: 'When', date: true },
        { key: 'domain', label: 'Domain' },
        { key: 'input_text', label: 'Input' },
        { key: 'output_label', label: 'Suggested label' },
        { key: 'confidence', label: 'Confidence', align: 'right', number: true },
        { key: 'reasoning', label: 'Reasoning' },
        { key: 'user_accepted', label: 'Accepted', render: (r) => r.user_accepted ? <StatusPill label="Accepted" tone="good" /> : <span className="text-[#6b7685] text-[12px]">pending</span> },
      ],
      create: {
        title: 'Classify',
        endpoint: '/platform/ai/classify',
        fields: [
          { name: 'domain', label: 'Domain', type: 'select', required: true, options: aiOpts, default: aiOpts[0].value },
          { name: 'input', label: 'Input', type: 'textarea', required: true, placeholder: 'Paste the text to classify…' },
        ],
      },
    },
    {
      key: `${domain}_audit`,
      label: 'Audit chain',
      endpoint: `/platform/audit-chain?domain=${domain}&limit=100`,
      description: 'SHA-256 hash-chained audit trail for this module — tamper-evident, externally verifiable.',
      columns: [
        { key: 'sequence_no', label: 'Seq', align: 'right', number: true },
        { key: 'entity_table', label: 'Table' },
        { key: 'entity_id', label: 'Record' },
        { key: 'operation', label: 'Op' },
        { key: 'this_hash', label: 'Hash', render: (r) => <span className="font-mono text-[10px] text-[#6b7685]">{String(r.this_hash || '').slice(0, 12)}…</span> },
        { key: 'created_at', label: 'When', date: true },
      ],
    },
    {
      key: `${domain}_pathways`,
      label: 'Pathways',
      endpoint: `/platform/pathways?domain=${domain}`,
      description: 'Reference pathways relevant to this domain — REIPPPP awards, SA demand growth, NPL ratio, tariff path, JSE listings, carbon-price trajectory.',
      columns: [
        { key: 'pathway_code', label: 'Pathway' },
        { key: 'series_name', label: 'Series' },
        { key: 'year', label: 'Year', align: 'right', number: true },
        { key: 'value', label: 'Value', align: 'right', number: true },
        { key: 'unit', label: 'Unit' },
        { key: 'source', label: 'Source' },
      ],
    },
    {
      key: `${domain}_filings`,
      label: 'Regulatory filings',
      endpoint: '/platform/filings',
      description: 'Regulatory filings across all bodies — JSE, FSCA, SARB, SARS, NERSA, DFFE, DWS, NCR, Information Regulator, B-BBEE.',
      columns: [
        { key: 'body_name', label: 'Body' },
        { key: 'kind', label: 'Kind' },
        { key: 'jurisdiction', label: 'Jurisdiction' },
        { key: 'reporting_period', label: 'Period' },
        { key: 'frequency', label: 'Frequency' },
        { key: 'due_date', label: 'Due', date: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'submitted_at', label: 'Submitted', date: true },
        { key: 'external_reference', label: 'Reference' },
      ],
      create: {
        title: 'New filing',
        endpoint: '/platform/filings',
        fields: [
          { name: 'body_code', label: 'Regulatory body', type: 'select', required: true, options: [
            { value: 'JSE_LISTINGS_RULES',  label: 'JSE Listings Requirements' },
            { value: 'JSE_DEBT_LISTING',    label: 'JSE Debt Listings' },
            { value: 'FSCA_CONDUCT',        label: 'FSCA Conduct of Business' },
            { value: 'SARB_BA200',          label: 'SARB BA 200 (capital adequacy)' },
            { value: 'SARB_BA700',          label: 'SARB BA 700 (liquidity)' },
            { value: 'SARB_BA325',          label: 'SARB BA 325 (credit risk)' },
            { value: 'NCR_RETURNS',         label: 'NCR consumer credit returns' },
            { value: 'CIPC_AR',             label: 'CIPC Annual Return' },
            { value: 'NERSA_QUARTERLY',     label: 'NERSA quarterly' },
            { value: 'NERSA_ANNUAL',        label: 'NERSA annual' },
            { value: 'NERSA_LICENCE_VAR',   label: 'NERSA licence variation' },
            { value: 'SAPP_SO',             label: 'SAPP System Operator' },
            { value: 'NTCSA_GRID_CODE',     label: 'NTCSA Grid Code compliance' },
            { value: 'DFFE_AEL',            label: 'DFFE Air Emissions Licence' },
            { value: 'DWS_WUL',             label: 'DWS Water Use Licence' },
            { value: 'DFFE_EA',             label: 'DFFE Environmental Authorisation' },
            { value: 'DFFE_GHG',            label: 'DFFE GHG Emissions Report' },
            { value: 'SARS_VAT201',         label: 'SARS VAT 201' },
            { value: 'SARS_IT14',           label: 'SARS IT14 (Income Tax)' },
            { value: 'SARS_CARBON_TAX',     label: 'SARS Carbon Tax' },
            { value: 'SARS_PAYE',           label: 'SARS PAYE / UIF / SDL' },
            { value: 'DOL_EE_EA2',          label: 'DOL Employment Equity' },
            { value: 'DOL_WSP',             label: 'DOL Workplace Skills Plan' },
            { value: 'INFO_REG_POPIA',      label: 'Information Regulator (POPIA)' },
            { value: 'COMP_COMMISSION',     label: 'Competition Commission' },
            { value: 'BEE_SANAS',           label: 'B-BBEE Certificate (SANAS)' },
            { value: 'OHS_REGS',            label: 'OHS Act' },
          ] },
          { name: 'reporting_period', label: 'Reporting period', type: 'text', required: true, placeholder: '2026-Q1 / 2026-05 / 2026' },
          { name: 'due_date',         label: 'Due date',         type: 'date' },
          { name: 'notes',            label: 'Notes',            type: 'textarea' },
        ],
      },
      rowActions: [
        { label: 'Submit', tone: 'primary', endpoint: '/platform/filings/{id}/submit',
          form: { title: 'Mark as submitted', endpoint: '', fields: [
            { name: 'external_reference', label: 'External reference', type: 'text' },
            { name: 'filing_pack_r2_key', label: 'Filing pack R2 key', type: 'text' },
          ] },
        },
      ],
    },
    {
      key: `${domain}_categories`,
      label: 'Categories',
      endpoint: `/platform/categories?domain=${domain}`,
      description: 'Reference category catalogue for this domain — instrument classes, connection types, technology mix, licence classes, facility types.',
      columns: [
        { key: 'code',          label: 'Code' },
        { key: 'category_name', label: 'Name' },
        { key: 'description',   label: 'Description' },
        { key: 'display_order', label: 'Order', align: 'right', number: true },
      ],
    },
  ];
  return tabs;
}
