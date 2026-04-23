import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../SuitePage';

export function CarbonRegistryPage() {
  const tabs: TabSpec[] = [
    {
      key: 'registries',
      label: 'Registries',
      endpoint: '/carbon-registry/registries',
      description:
        'External carbon registries we sync with — Verra, Gold Standard, CDM, SA-REDD. Registry-eligible credits can be applied to SA Carbon Tax offsets.',
      columns: [
        { key: 'registry_code', label: 'Code' },
        { key: 'registry_name', label: 'Name' },
        { key: 'registry_type', label: 'Type' },
        { key: 'sa_carbon_tax_eligible', label: 'SA Tax eligible', render: (r) => <span>{r.sa_carbon_tax_eligible ? 'Yes' : 'No'}</span> },
      ],
      create: {
        title: 'Request registry sync',
        endpoint: '/carbon-registry/registries/sync',
        submitLabel: 'Queue sync',
        fields: [
          { name: 'registry_id', label: 'Registry ID', type: 'text', required: true, help: 'Copy from row.' },
          { name: 'sync_type', label: 'Sync type', type: 'select', required: true, options: [
            { value: 'project_metadata', label: 'Project metadata' },
            { value: 'credit_issuance', label: 'Credit issuance' },
            { value: 'retirement_push', label: 'Retirement push' },
          ] },
          { name: 'external_ref', label: 'External reference', type: 'text' },
          { name: 'payload', label: 'Payload (JSON)', type: 'json' },
        ],
      },
    },
    {
      key: 'vintages',
      label: 'Vintages',
      endpoint: '/carbon-registry/vintages/{project_id}',
      description:
        'Per-vintage issuance — one contiguous serial range per (project, registry, year). Overlaps are rejected at write time.',
      columns: [
        { key: 'vintage_year', label: 'Year', align: 'right', number: true },
        { key: 'registry_name', label: 'Registry' },
        { key: 'serial_prefix', label: 'Prefix' },
        { key: 'serial_start', label: 'Start', align: 'right', number: true },
        { key: 'serial_end', label: 'End', align: 'right', number: true },
        { key: 'credits_issued', label: 'Issued', align: 'right', number: true },
        { key: 'credits_retired', label: 'Retired', align: 'right', number: true },
        { key: 'methodology', label: 'Methodology' },
        { key: 'sa_carbon_tax_eligible', label: 'SA Tax', render: (r) => <span>{r.sa_carbon_tax_eligible ? 'Yes' : 'No'}</span> },
      ],
      create: {
        title: 'Issue new vintage',
        endpoint: '/carbon-registry/vintages',
        fields: [
          { name: 'project_id', label: 'Project ID', type: 'text', required: true },
          { name: 'registry_id', label: 'Registry ID', type: 'text', required: true },
          { name: 'vintage_year', label: 'Vintage year', type: 'number', required: true },
          { name: 'serial_prefix', label: 'Serial prefix', type: 'text', required: true, placeholder: 'ZA-VCS-2026-' },
          { name: 'serial_start', label: 'Serial start', type: 'number', required: true },
          { name: 'serial_end', label: 'Serial end', type: 'number', required: true },
          { name: 'methodology', label: 'Methodology', type: 'text', placeholder: 'VCS-ACM0002' },
          { name: 'issuance_date', label: 'Issuance date', type: 'date', required: true },
          { name: 'sa_carbon_tax_eligible', label: 'SA Carbon Tax eligible?', type: 'checkbox' },
          { name: 'verification_id', label: 'MRV verification ID', type: 'text' },
        ],
      },
    },
    {
      key: 'mrv',
      label: 'MRV submissions',
      endpoint: '/carbon-registry/mrv/submissions',
      description:
        'Measurement-Reporting-Verification. Submit claimed reductions; verifier issues opinion (positive/qualified/adverse/disclaimer).',
      columns: [
        { key: 'reporting_period_start', label: 'From', date: true },
        { key: 'reporting_period_end', label: 'To', date: true },
        { key: 'claimed_reductions_tco2e', label: 'Claimed tCO2e', align: 'right', number: true },
        { key: 'verified_reductions_tco2e', label: 'Verified tCO2e', align: 'right', number: true },
        { key: 'baseline_emissions_tco2e', label: 'Baseline', align: 'right', number: true },
        { key: 'project_emissions_tco2e', label: 'Project', align: 'right', number: true },
        { key: 'leakage_tco2e', label: 'Leakage', align: 'right', number: true },
        { key: 'opinion', label: 'Opinion', render: (r) => r.opinion ? <StatusPill status={String(r.opinion)} /> : <span>—</span> },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Submit MRV for verification',
        endpoint: '/carbon-registry/mrv/submissions',
        fields: [
          { name: 'project_id', label: 'Project ID', type: 'text', required: true },
          { name: 'reporting_period_start', label: 'Reporting from', type: 'date', required: true },
          { name: 'reporting_period_end', label: 'Reporting to', type: 'date', required: true },
          { name: 'claimed_reductions_tco2e', label: 'Claimed reductions (tCO2e)', type: 'number', required: true },
          { name: 'monitoring_methodology', label: 'Monitoring methodology', type: 'text' },
          { name: 'baseline_methodology', label: 'Baseline methodology', type: 'text' },
          { name: 'baseline_emissions_tco2e', label: 'Baseline emissions', type: 'number' },
          { name: 'project_emissions_tco2e', label: 'Project emissions', type: 'number' },
          { name: 'leakage_tco2e', label: 'Leakage', type: 'number', default: 0 },
          { name: 'monitoring_plan_r2_key', label: 'Monitoring plan R2 key', type: 'text' },
          { name: 'activity_data_r2_key', label: 'Activity data R2 key', type: 'text' },
          { name: 'emission_factors', label: 'Emission factors (JSON)', type: 'json' },
        ],
      },
      rowActions: [
        { label: 'Verify', tone: 'primary', endpoint: '/carbon-registry/mrv/submissions/{id}/verify',
          form: { title: 'Issue verification opinion (auditor)', endpoint: '', fields: [
            { name: 'opinion', label: 'Opinion', type: 'select', required: true, options: [
              { value: 'positive', label: 'Positive' },
              { value: 'qualified', label: 'Qualified' },
              { value: 'adverse', label: 'Adverse' },
              { value: 'disclaimer', label: 'Disclaimer' },
            ] },
            { name: 'verification_date', label: 'Verification date', type: 'date', required: true },
            { name: 'verifier_accreditation', label: 'Accreditation', type: 'select', options: [
              { value: 'ISO 14065', label: 'ISO 14065' },
              { value: 'UNFCCC DOE', label: 'UNFCCC DOE' },
              { value: 'DFFE-accredited', label: 'DFFE-accredited' },
            ] },
            { name: 'site_visit_date', label: 'Site visit date', type: 'date' },
            { name: 'desk_review_date', label: 'Desk review date', type: 'date' },
            { name: 'verified_reductions_tco2e', label: 'Verified reductions (tCO2e)', type: 'number' },
            { name: 'qualifications', label: 'Qualifications', type: 'textarea' },
            { name: 'verification_report_r2_key', label: 'Report R2 key', type: 'text' },
          ] },
        },
      ],
    },
    {
      key: 'tax',
      label: 'Carbon Tax claims',
      endpoint: '/carbon-registry/tax-claims',
      description:
        'SA Carbon Tax Act s.13 offsets — 5% (general) / 10% (annex-2) of liability. Cap is automatic.',
      columns: [
        { key: 'tax_year', label: 'Year', align: 'right', number: true },
        { key: 'gross_tax_liability_zar', label: 'Gross tax', align: 'right', currency: true },
        { key: 'offset_limit_pct', label: 'Limit %', align: 'right', number: true },
        { key: 'offset_limit_zar', label: 'Cap', align: 'right', currency: true },
        { key: 'credits_applied_tco2e', label: 'Credits used', align: 'right', number: true },
        { key: 'offset_value_zar', label: 'Offset value', align: 'right', currency: true },
        { key: 'net_tax_liability_zar', label: 'Net tax', align: 'right', currency: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Compute / file Carbon Tax offset claim',
        endpoint: '/carbon-registry/tax-claims',
        fields: [
          { name: 'taxpayer_participant_id', label: 'Taxpayer participant ID', type: 'text', required: true },
          { name: 'tax_year', label: 'Tax year', type: 'number', required: true, default: new Date().getFullYear() },
          { name: 'gross_tax_liability_zar', label: 'Gross liability (ZAR)', type: 'number', required: true },
          { name: 'industry_group', label: 'Industry group', type: 'select', required: true, options: [
            { value: 'general', label: 'General (5% cap)' },
            { value: 'annex_2', label: 'Annex 2 (10% cap, mining/petroleum)' },
          ], default: 'general' },
          { name: 'credits_tco2e', label: 'Credits (tCO2e)', type: 'number' },
          { name: 'tax_rate_zar_per_tco2e', label: 'Tax rate (R/tCO2e)', type: 'number', required: true, default: 190 },
        ],
      },
      rowActions: [
        { label: 'Attach retirement', endpoint: '/carbon-registry/tax-claims/{id}/attach-retirement',
          form: { title: 'Attach carbon retirement to claim', endpoint: '', fields: [
            { name: 'retirement_id', label: 'Retirement ID', type: 'text', required: true },
            { name: 'credits_applied_tco2e', label: 'Credits applied (tCO2e)', type: 'number', required: true },
          ] },
        },
        { label: 'Submit to SARS', tone: 'primary', endpoint: '/carbon-registry/tax-claims/{id}/submit',
          show: (r) => r.status === 'draft',
          form: { title: 'Submit to SARS', endpoint: '', fields: [
            { name: 'sars_reference', label: 'SARS reference', type: 'text' },
          ] },
        },
      ],
    },
  ];
  return (
    <SuitePage
      title="Carbon registry console"
      subtitle="Registry sync, vintages with serial tracking, MRV workflow, and Carbon Tax Act offset claims."
      tabs={tabs}
      aiBriefRole="carbon_fund"
      aiBriefAccent={{ from: '#107e3e', to: '#5d36ff' }}
    />
  );
}
