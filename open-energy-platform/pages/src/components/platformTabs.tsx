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
  ];
  return tabs;
}
