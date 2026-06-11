import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';
import { Article6Tab } from '../carbon/Article6Tab';
import { RegistrationChainTab } from '../carbon/RegistrationChainTab';
import { MrvChainTab } from '../carbon/MrvChainTab';
import { RetirementChainTab } from '../carbon/RetirementChainTab';
import { CarbonReversalChainTab } from '../carbon/CarbonReversalChainTab';
import { CarbonOffsetClaimChainTab } from '../carbon/CarbonOffsetClaimChainTab';
import { CreditingRenewalChainTab } from '../carbon/CreditingRenewalChainTab';
import { CarbonErpaChainTab } from '../carbon/CarbonErpaChainTab';
import { PoaCpaInclusionChainTab } from '../carbon/PoaCpaInclusionChainTab';
import { CarbonIssuanceChainTab } from '../carbon/CarbonIssuanceChainTab';
import { CcpAssessmentChainTab } from '../carbon/CcpAssessmentChainTab';
import { EsgDisclosureChainTab } from '../carbon/EsgDisclosureChainTab';
import { Scope3DisclosureChainTab } from '../carbon/Scope3DisclosureChainTab';
import { CreditRatingChainTab } from '../carbon/CreditRatingChainTab';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { WizardSpec } from '../launch/WizardModal';
import type { TourDef } from '../launch/ProductTour';

const CARBON_REPORTS: ReportConfig[] = [
  {
    title: 'Carbon Issuances',
    endpoint: '/api/carbon/issuances',
    columns: [
      { key: 'issuance_ref', label: 'Reference' },
      { key: 'quantity_tco2e', label: 'tCO₂e', numeric: true },
      { key: 'vintage_year', label: 'Vintage' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Issued' },
    ],
    filters: [{ key: 'status', label: 'Status', type: 'select', options: [{ value: 'issued', label: 'Issued' }, { value: 'retired', label: 'Retired' }, { value: 'cancelled', label: 'Cancelled' }] }],
    pivotGroupBy: 'vintage_year',
    mailSubject: 'Open Energy — Carbon Issuances Report',
  },
  {
    title: 'Retirement Statements',
    endpoint: '/api/carbon/retirements',
    columns: [
      { key: 'retirement_ref', label: 'Reference' },
      { key: 'quantity_tco2e', label: 'tCO₂e', numeric: true },
      { key: 'beneficiary_name', label: 'Beneficiary' },
      { key: 'retired_at', label: 'Date' },
    ],
    dateKey: 'retired_at',
    pivotGroupBy: 'beneficiary_name',
    mailSubject: 'Open Energy — Carbon Retirements Report',
  },
  {
    title: 'Carbon Tax Offset Claims',
    endpoint: '/api/carbon/offset-claims',
    columns: [
      { key: 'claim_ref', label: 'Reference' },
      { key: 'offset_quantity_tco2e', label: 'tCO₂e', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'chain_status',
    mailSubject: 'Open Energy — Carbon Offset Claims Report',
  },
];

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

const STAGE_OPTIONS = [
  { value: 'validated', label: 'Validated' },
  { value: 'listed', label: 'Listed' },
  { value: 'traded', label: 'Traded' },
  { value: 'retired_partial', label: 'Retired (partial)' },
  { value: 'retired_full', label: 'Retired (full)' },
  { value: 'expired', label: 'Expired' },
];

const MRV_TRANSITIONS = [
  { value: 'submitted', label: 'Submit' },
  { value: 'under_verification', label: 'Send for verification' },
  { value: 'verified', label: 'Mark verified' },
  { value: 'rejected', label: 'Reject' },
  { value: 'published', label: 'Publish' },
];

const CARBON_WIZARDS: WizardSpec[] = [
  {
    id: 'carbon-complete-setup',
    title: 'Set up your carbon fund workstation',
    subtitle: 'Configure all registry, verification, transaction, and carbon integrity workflows',
    steps: [
      {
        title: 'Credit registry',
        description: 'Set up Credit vintages, Certificate management, and Registry transfers (UNFCCC Art 6.2 + Verra).',
        aiHint: 'Each crediting standard has its own registry. Verra VCS uses the VERRA registry; Gold Standard uses the GSF registry; Article 6.4 uses the UNFCCC Article 6.4 Supervisory Body registry. Registry transfers (Wave W206) require AML/KYC checks on receiving entities — the platform runs these automatically.',
        fields: [
          { key: 'primary_standard', label: 'Primary crediting standard', type: 'select', required: true, options: [{ value: 'verra_vcs', label: 'Verra VCS' }, { value: 'gold_standard', label: 'Gold Standard for the Goals' }, { value: 'article_6_4', label: 'UN Article 6.4' }, { value: 'multiple', label: 'Multiple standards' }] },
          { key: 'registry_account_id', label: 'Registry account ID', type: 'text', placeholder: 'Verra/GS/UNFCCC account reference' },
          { key: 'annual_credit_target_tco2', label: 'Annual issuance target (tCO₂e)', type: 'number', placeholder: 'e.g. 500000' },
        ],
      },
      {
        title: 'MRV & verification',
        description: 'Configure MRV verification, Full MRV workflow, Project registration (PDD), Methodology amendments, and Crediting period renewal.',
        aiHint: 'MRV verification (Wave W11) follows the 14-state UNFCCC cycle: validation → site audit → CRA → issuance. Methodology amendments (Wave W213) require DNA notification for Article 6 projects — the platform auto-drafts the DFFE notification. Set your VVB partner here so the workflow auto-assigns site audit tasks.',
        fields: [
          { key: 'vvb_partner', label: 'Approved VVB / verifier partner', type: 'text', placeholder: 'e.g. Bureau Veritas, SGS, DNV, TÜV SÜD' },
          { key: 'monitoring_frequency', label: 'Monitoring data reporting frequency', type: 'select', options: [{ value: 'monthly', label: 'Monthly (real-time SCADA)' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'annual', label: 'Annual MRV cycle' }] },
          { key: 'crediting_period_years', label: 'Crediting period length (years)', type: 'select', options: [{ value: '7', label: '7 years (renewable ×2)' }, { value: '10', label: '10 years (fixed)' }, { value: '21', label: '21 years (AFOLU renewable ×2)' }] },
        ],
      },
      {
        title: 'Transactions & forward delivery',
        description: 'Set up Credit retirements, Article 6 ITMO ledger, ERPA forward delivery, and PoA/CPA inclusion workflows.',
        aiHint: 'Article 6 ITMO transfers require a Corresponding Adjustment in both host country and acquiring country NDC registries. The platform auto-files the CA notification to DFFE (host country). ERPAs (Wave W65) allow you to forward-sell credits before issuance — the make-good provision is automatically calculated from your MRV pipeline.',
        fields: [
          { key: 'article6_eligible', label: 'Do your projects qualify for Article 6?', type: 'select', options: [{ value: 'yes', label: 'Yes — DNA authorisation obtained' }, { value: 'pending', label: 'Pending — LoA application in progress' }, { value: 'no', label: 'No — voluntary market only' }] },
          { key: 'erpa_buyer_count', label: 'Number of ERPA buyers', type: 'number', placeholder: '0 if spot market only' },
          { key: 'poa_programmes', label: 'PoA programme names (if applicable)', type: 'text', placeholder: 'e.g. SA Rural Cookstove PoA — leave blank if not applicable' },
        ],
      },
      {
        title: 'Carbon integrity',
        description: 'Configure Carbon reversals / buffer pool, Carbon offset claims (Carbon Tax Act §13), and SARS carbon tax returns.',
        aiHint: 'Carbon Tax Act §13 allows you to offset up to 10% of your carbon tax liability with retired VCUs/VERs. The platform calculates your offset cap automatically from your annual tax liability. Buffer pool contributions (Wave W42) are deducted at issuance — Verra requires 10–20% contribution depending on project risk score.',
        fields: [
          { key: 'buffer_pool_pct', label: 'Buffer pool contribution (%)', type: 'number', placeholder: 'e.g. 15 — from your Verra risk rating' },
          { key: 'carbon_tax_applicable', label: 'Subject to South African Carbon Tax?', type: 'select', options: [{ value: 'yes', label: 'Yes — annual SARS return required' }, { value: 'no', label: 'No — below threshold or exempt' }] },
          { key: 'reversal_insurance', label: 'Reversal insurance in place?', type: 'select', options: [{ value: 'yes', label: 'Yes — policy reference registered' }, { value: 'no', label: 'No — relying on buffer pool only' }] },
        ],
      },
    ],
    submitLabel: 'Save carbon fund setup',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: 'carbon_fund', ...values }) }).catch(() => {});
    },
  },
  {
    id: 'carbon-register-project',
    title: 'Register a carbon project',
    subtitle: 'Verra / Gold Standard / Article 6 — project design document',
    steps: [
      {
        title: 'Project type',
        description: 'Classify your carbon project and select the crediting standard.',
        aiHint: 'Article 6 projects require DNA authorisation from DFFE and generate ITMOs. Verra VCS generates VCUs; Gold Standard generates VERs. Choose based on your buyer\'s market preference.',
        fields: [
          { key: 'project_name', label: 'Project name', type: 'text', required: true, placeholder: 'e.g. Saldanha 140MW Wind Carbon Project' },
          { key: 'standard', label: 'Crediting standard', type: 'select', required: true, options: [{ value: 'verra_vcs', label: 'Verra VCS' }, { value: 'gold_standard', label: 'Gold Standard for the Goals' }, { value: 'article_6_4', label: 'Article 6.4 (UN Paris Agreement)' }, { value: 'corsia', label: 'CORSIA (aviation sector)' }] },
          { key: 'project_type', label: 'Project type / sector', type: 'select', required: true, options: [{ value: 'renewable_energy', label: 'Renewable energy' }, { value: 'afolu', label: 'AFOLU (land use)' }, { value: 'energy_efficiency', label: 'Energy efficiency' }, { value: 'cookstoves', label: 'Clean cookstoves' }, { value: 'methane', label: 'Methane avoidance' }] },
        ],
      },
      {
        title: 'Methodology',
        description: 'Select the approved methodology for emission reductions.',
        aiHint: 'The methodology determines how baseline emissions and project emissions are calculated. Renewable energy projects in South Africa typically use ACM0002 (grid-connected electricity).',
        fields: [
          { key: 'methodology', label: 'Methodology', type: 'text', required: true, placeholder: 'e.g. ACM0002 v17, VM0038, GS-RE-001' },
          { key: 'crediting_period_start', label: 'Crediting period start', type: 'date', required: true },
          { key: 'crediting_period_years', label: 'Crediting period (years)', type: 'number', placeholder: 'e.g. 7 or 10' },
        ],
      },
      {
        title: 'Emission reductions',
        description: 'Baseline emission factor and annual reduction estimate.',
        aiHint: 'South Africa\'s grid emission factor (ESKOM) is approximately 0.94 tCO₂e/MWh. The actual value used must come from the most recent DFFE published grid factor.',
        fields: [
          { key: 'baseline_emission_factor', label: 'Grid emission factor (tCO₂e/MWh)', type: 'number', placeholder: 'e.g. 0.94' },
          { key: 'annual_er_estimate_tco2', label: 'Annual ER estimate (tCO₂e/year)', type: 'number', placeholder: 'e.g. 125000' },
        ],
      },
      {
        title: 'DNA authorisation',
        description: 'For Article 6 projects, provide the DFFE DNA letter details.',
        aiHint: 'Article 6 projects MUST have a Letter of Authorisation from DFFE (South Africa\'s Designated National Authority) before the project can be registered at the UN level.',
        fields: [
          { key: 'dna_reference', label: 'DFFE LoA reference (Article 6 only)', type: 'text', placeholder: 'DFFE-LoA-2026-XXX' },
          { key: 'dna_date', label: 'LoA issue date', type: 'date' },
          { key: 'notes', label: 'Additional notes', type: 'textarea', placeholder: 'Buffer pool contribution, safeguards requirements…' },
        ],
      },
    ],
    submitLabel: 'Register project',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/carbon/registration', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Project registration failed'); }
    },
  },
  {
    id: 'carbon-mrv',
    title: 'File an MRV report',
    subtitle: 'Verra / Gold Standard — monitoring, reporting, verification',
    steps: [
      {
        title: 'Report period',
        description: 'Specify the project and monitoring period.',
        aiHint: 'MRV reports are typically filed annually. The data is the basis for credit issuance — inaccurate monitoring can result in issuance suspension under Verra Rule 4.1.4.',
        fields: [
          { key: 'project_id', label: 'Project reference', type: 'text', required: true, placeholder: 'Verra/GS project ID or internal reference' },
          { key: 'monitoring_period_start', label: 'Monitoring period start', type: 'date', required: true },
          { key: 'monitoring_period_end', label: 'Monitoring period end', type: 'date', required: true },
        ],
      },
      {
        title: 'Generation data',
        description: 'Report the verified generation and emission reductions for the period.',
        aiHint: 'Data must come from metering that meets IEC 62053-22 or equivalent. Satellite-derived data is acceptable for AFOLU projects only.',
        fields: [
          { key: 'metered_mwh', label: 'Metered generation (MWh)', type: 'number', required: true, placeholder: 'e.g. 246500' },
          { key: 'verified_er_tco2', label: 'Verified emission reductions (tCO₂e)', type: 'number', required: true, placeholder: 'e.g. 231710' },
          { key: 'verifier_name', label: 'Approved VVB / verifier', type: 'text', placeholder: 'e.g. Bureau Veritas, SGS, DNV' },
        ],
      },
      {
        title: 'Submission',
        description: 'Confirm verification completion and submit for credit issuance.',
        fields: [
          { key: 'verification_report_ref', label: 'Verification report reference', type: 'text', required: true, placeholder: 'Verifier report number' },
          { key: 'verification_date', label: 'Verification completion date', type: 'date', required: true },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Deviations from monitoring plan, conservative estimates applied…' },
        ],
      },
    ],
    submitLabel: 'Submit MRV report',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/carbon/mrv', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'MRV submission failed'); }
    },
  },
  {
    id: 'carbon-retire',
    title: 'Retire carbon credits',
    subtitle: 'Verra / GS / Article 6 — permanent retirement for offsetting',
    steps: [
      {
        title: 'Retirement details',
        description: 'Specify the credits to retire and the retirement purpose.',
        aiHint: 'Retirement is permanent and irreversible. Double-check the serial number range before confirming. Article 6 retirements also trigger a Corresponding Adjustment in the UNFCCC registry.',
        fields: [
          { key: 'serial_number_start', label: 'Serial number range (start)', type: 'text', required: true, placeholder: 'e.g. ZA-1-V0001-000001' },
          { key: 'serial_number_end', label: 'Serial number range (end)', type: 'text', required: true, placeholder: 'e.g. ZA-1-V0001-010000' },
          { key: 'quantity_tco2', label: 'Quantity (tCO₂e)', type: 'number', required: true, placeholder: 'e.g. 10000' },
          { key: 'retirement_purpose', label: 'Retirement purpose', type: 'select', required: true, options: [{ value: 'voluntary_offset', label: 'Voluntary offset (net-zero claim)' }, { value: 'compliance_carbon_tax', label: 'Compliance — Carbon Tax Act §13' }, { value: 'compliance_ets', label: 'Compliance — ETS allowance' }, { value: 'corsia', label: 'CORSIA aviation offset' }] },
        ],
      },
      {
        title: 'Beneficiary',
        description: 'Who is receiving credit for this retirement?',
        fields: [
          { key: 'beneficiary_name', label: 'Beneficiary entity', type: 'text', required: true, placeholder: 'Company or country claiming the offset' },
          { key: 'beneficiary_country', label: 'Beneficiary country', type: 'text', placeholder: 'ISO 2-letter country code, e.g. ZA' },
          { key: 'retirement_year', label: 'Compliance/offset year', type: 'select', required: true, options: [{ value: '2024', label: '2024' }, { value: '2025', label: '2025' }, { value: '2026', label: '2026' }] },
        ],
      },
    ],
    submitLabel: 'Retire credits',
    cta: 'danger',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/carbon/retirement', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Retirement failed'); }
    },
  },
  {
    id: 'carbon-register-project-new',
    title: 'Register carbon project',
    subtitle: 'Wave W37 — Gold Standard / Verra / Article 6 project design',
    steps: [
      {
        title: 'Project identity',
        fields: [
          { key: 'project_name', label: 'Project name', type: 'text', required: true, placeholder: 'e.g. SA Rural Cookstove Programme' },
          { key: 'methodology', label: 'Methodology', type: 'select', required: true, options: [{ value: 'vm0038_cookstoves', label: 'VM0038 — Cookstoves' }, { value: 'vm0007_redd_plus', label: 'VM0007 — REDD+' }, { value: 'ams_i_d_solar', label: 'AMS-I.D — Solar' }, { value: 'ams_iii_bk_biogas', label: 'AMS-III.BK — Biogas' }, { value: 'acm0002_grid_renewables', label: 'ACM0002 — Grid renewables' }] },
          { key: 'registry', label: 'Registry', type: 'select', required: true, options: [{ value: 'verra_vcs', label: 'Verra VCS' }, { value: 'gold_standard', label: 'Gold Standard' }, { value: 'cdm', label: 'CDM' }, { value: 'art_trees', label: 'ART TREES' }, { value: 'article_6_4', label: 'Article 6.4' }] },
        ],
      },
      {
        title: 'Project details',
        fields: [
          { key: 'country_code', label: 'Country code', type: 'text', required: true, placeholder: 'e.g. ZA' },
          { key: 'project_start_date', label: 'Project start date', type: 'date', required: true },
          { key: 'expected_credits_tco2e_pa', label: 'Expected credits (tCO₂e/year)', type: 'number', required: true },
          { key: 'dna_contact', label: 'DNA contact (Article 6 only)', type: 'text', placeholder: 'DFFE contact name and email' },
        ],
      },
    ],
    submitLabel: 'Register project',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/carbon/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'carbon-mrv-new',
    title: 'Submit MRV verification',
    subtitle: 'Wave W11 — monitoring, reporting, verification cycle',
    steps: [
      {
        title: 'Monitoring period',
        fields: [
          { key: 'project_id', label: 'Project reference', type: 'text', required: true },
          { key: 'monitoring_period_start', label: 'Monitoring period start', type: 'date', required: true },
          { key: 'monitoring_period_end', label: 'Monitoring period end', type: 'date', required: true },
          { key: 'monitoring_approach', label: 'Monitoring approach', type: 'select', required: true, options: [{ value: 'activity_data', label: 'Activity data' }, { value: 'continuous_metering', label: 'Continuous metering' }, { value: 'sampling', label: 'Sampling' }, { value: 'satellite_remote_sensing', label: 'Satellite remote sensing' }] },
        ],
      },
      {
        title: 'Verification details',
        fields: [
          { key: 'auditor_name', label: 'Auditor / VVB name', type: 'text', required: true, placeholder: 'e.g. Bureau Veritas, DNV, SGS' },
          { key: 'audit_date', label: 'Audit date', type: 'date', required: true },
          { key: 'gross_emissions_reduction_tco2e', label: 'Gross emissions reduction (tCO₂e)', type: 'number', required: true },
          { key: 'net_credits_tco2e', label: 'Net credits (tCO₂e)', type: 'number', required: true },
        ],
      },
    ],
    submitLabel: 'Submit MRV',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/carbon/verifications', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'carbon-retire-new',
    title: 'Retire carbon credits',
    subtitle: 'Wave W17 — permanent retirement for compliance or voluntary offset',
    steps: [
      {
        title: 'Retirement details',
        fields: [
          { key: 'serial_id_from', label: 'Serial number (from)', type: 'text', required: true, placeholder: 'e.g. ZA-1-V0001-000001' },
          { key: 'quantity_tco2e', label: 'Quantity (tCO₂e)', type: 'number', required: true },
          { key: 'retirement_reason', label: 'Retirement reason', type: 'select', required: true, options: [{ value: 'voluntary_offset', label: 'Voluntary offset' }, { value: 'compliance_cap_and_trade', label: 'Compliance — cap and trade' }, { value: 'carbon_tax_offset', label: 'Carbon Tax Act §13 offset' }, { value: 'contribution_to_ndc', label: 'Contribution to NDC' }, { value: 'article6_itmo', label: 'Article 6 ITMO' }] },
        ],
      },
      {
        title: 'Beneficiary',
        fields: [
          { key: 'beneficiary_name', label: 'Beneficiary name', type: 'text', required: true },
          { key: 'beneficiary_country', label: 'Beneficiary country', type: 'text', required: true, placeholder: 'ISO 2-letter code, e.g. ZA' },
          { key: 'vintage_year', label: 'Vintage year', type: 'number', required: true, placeholder: 'e.g. 2025' },
          { key: 'retirement_note', label: 'Retirement note', type: 'textarea', placeholder: 'Optional reference for registry…' },
        ],
      },
    ],
    submitLabel: 'Retire credits',
    cta: 'danger',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/carbon/retirements', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'carbon-erpa',
    title: 'File Article 6 ERPA',
    subtitle: 'Wave W65 — carbon forward-delivery agreement',
    steps: [
      {
        title: 'ERPA terms',
        fields: [
          { key: 'buyer_country', label: 'Buyer country', type: 'text', required: true, placeholder: 'ISO 2-letter code, e.g. JP' },
          { key: 'seller_id', label: 'Seller ID', type: 'text', required: true, placeholder: 'Your tenant or project ID' },
          { key: 'itmo_quantity_tco2e', label: 'ITMO quantity (tCO₂e)', type: 'number', required: true },
          { key: 'price_usd_per_tco2e', label: 'Price (USD/tCO₂e)', type: 'number', required: true },
        ],
      },
      {
        title: 'Transfer mechanics',
        fields: [
          { key: 'corresponding_adjustment_required', label: 'Corresponding adjustment required?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes — Article 6 transfer' }, { value: 'no', label: 'No — voluntary only' }] },
          { key: 'transfer_registry', label: 'Transfer registry', type: 'select', required: true, options: [{ value: 'itmo_registry', label: 'ITMO Registry' }, { value: 'verra', label: 'Verra' }, { value: 'gold_standard', label: 'Gold Standard' }, { value: 'article6_4_hub', label: 'Article 6.4 Hub' }] },
          { key: 'delivery_date', label: 'Delivery date', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'File ERPA',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/carbon/erpas', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
];

const CARBON_TOUR: TourDef = {
  id: 'carbon-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Carbon fund workstation', body: 'Manage the full carbon credit lifecycle — from project registration and MRV through to trading, retirement, and Article 6 ITMO corresponding adjustments.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Carbon portfolio KPIs', body: 'Credits issued, retired, in MRV pipeline, and under verification. Track your Article 6 corresponding adjustment balance separately.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Carbon lifecycle tabs', body: 'Registration, MRV verification, retirement, Article 6 ITMO, crediting period renewal, and PoA/CPA programme management — all state-machine workflows.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Register a new carbon project, file an MRV monitoring report, or retire credits for compliance — step-by-step with AI hints at each stage.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'All carbon fund actions: ERPA forward delivery, carbon tax offset claims, reversal/buffer-pool management, methodology amendments.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'DNA authorisation requests, verifier queries, and buyer retirement instructions appear here for your action.', placement: 'left' },
  ],
};

export function CarbonWorkstationPage() {
  const kpis = useWorkstationKpis('carbon_fund');
  const vintagesPanel = useWorkstationPanel('Active vintages', '/carbon-registry/vintages', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">{r.stage || r.status || '—'}</span>,
    text: <span>{r.project_name || r.name || r.serial_number} · {r.tco2e ? `${Number(r.tco2e).toLocaleString()} tCO₂e` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.vintage_year || ''}</span>,
  }), 'No vintages yet.');
  const mrvPanel = useWorkstationPanel('Open MRV submissions', '/carbon-registry/mrv', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fff4d6] text-[#a06200]">{r.status || 'pending'}</span>,
    text: <span>{r.project_name || r.title} · {r.tco2e_claimed ? `${Math.round(r.tco2e_claimed).toLocaleString()} tCO₂e` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No MRV submissions.');
  const panels = [vintagesPanel, mrvPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="carbon_fund"
      eyebrow="Carbon fund · Workstation"
      wizards={CARBON_WIZARDS}
      tour={CARBON_TOUR}
      title="Carbon workstation"
      subtitle="Project registration → MRV & verification → Issuance → Trading → Retirement & Article 6 compliance"
      backHref="/carbon-registry"
      backLabel="Carbon registry"
      kpis={kpis}
      panels={panels}
      tabs={[
        {
          key: 'vintages',
          label: 'Vintage workflow',
          group: 'Project pipeline',
          body: ({ onRefresh }) => <VintagesTab onRefresh={onRefresh} />,
        },
        {
          key: 'mrv',
          label: 'MRV submissions',
          group: 'MRV & verification',
          body: ({ onRefresh }) => <MrvTab onRefresh={onRefresh} />,
        },
        {
          key: 'certificates',
          label: 'Retirement certificates',
          group: 'Issuance & registry',
          body: ({ onRefresh }) => <CertificatesTab onRefresh={onRefresh} />,
        },
        {
          key: 'article6',
          label: 'Article 6 ITMO',
          group: 'Article 6 & compliance',
          chainKey: 'article6_adjustment',
          body: () => <Article6Tab />,
        },
        {
          key: 'registration_chain',
          label: 'Project registration',
          group: 'Project pipeline',
          chainKey: 'carbon_registration',
          body: () => <RegistrationChainTab />,
        },
        {
          key: 'mrv_chain',
          label: 'Verification chain',
          group: 'MRV & verification',
          chainKey: 'mrv_submissions',
          body: () => <MrvChainTab />,
        },
        {
          key: 'retirement_chain',
          label: 'Retirement chain',
          group: 'Retirement & offset',
          chainKey: 'carbon_retirement',
          body: () => <RetirementChainTab />,
        },
        {
          key: 'reversal_chain',
          label: 'Reversals',
          group: 'Retirement & offset',
          chainKey: 'carbon_reversal',
          body: () => <CarbonReversalChainTab />,
        },
        {
          key: 'offset_claim_chain',
          label: 'Tax offset claims',
          group: 'Retirement & offset',
          chainKey: 'carbon_offset_claim',
          body: () => <CarbonOffsetClaimChainTab />,
        },
        {
          key: 'crediting_renewal_chain',
          label: 'Crediting renewal',
          group: 'Project pipeline',
          chainKey: 'crediting_period_renewal',
          body: () => <CreditingRenewalChainTab />,
        },
        {
          key: 'erpa_chain',
          label: 'Forward ERPA delivery',
          group: 'Trading & markets',
          chainKey: 'carbon_erpa',
          body: () => <CarbonErpaChainTab />,
        },
        {
          key: 'poa_cpa_inclusion_chain',
          label: 'PoA / CPA inclusion',
          group: 'Project pipeline',
          chainKey: 'poa_cpa_inclusion',
          body: () => <PoaCpaInclusionChainTab />,
        },
        {
          key: 'carbon_issuance_chain',
          label: 'Credit issuance',
          group: 'Issuance & registry',
          chainKey: 'carbon_issuance',
          body: () => <CarbonIssuanceChainTab />,
        },
        {
          key: 'ccp_assessment_chain',
          label: 'CCP-eligibility assessment',
          group: 'MRV & verification',
          chainKey: 'ccp_assessment',
          body: () => <CcpAssessmentChainTab />,
        },
        {
          key: 'credit_rating_chain',
          label: 'Credit quality rating',
          group: 'Trading & markets',
          chainKey: 'carbon_credit_rating',
          body: () => <CreditRatingChainTab />,
        },
        {
          key: 'esg_disclosure_chain',
          label: 'ESG disclosure & assurance',
          group: 'Article 6 & compliance',
          chainKey: 'esg_disclosure',
          body: () => <EsgDisclosureChainTab />,
        },
        {
          key: 'scope3_disclosure_chain',
          label: 'Scope 3 value-chain disclosure',
          group: 'Article 6 & compliance',
          chainKey: 'carbon_scope3_disclosure',
          body: () => <Scope3DisclosureChainTab />,
        },
        {
          key: 'carbon_tax_returns',
          label: 'Carbon tax returns (W200)',
          group: 'Retirement & offset',
          chainKey: 'carbon_tax_return',
          body: ({ onRefresh }) => <CarbonTaxReturnsTab onRefresh={onRefresh} />,
        },
        {
          key: 'carbon_budget',
          label: 'Carbon budget',
          group: 'Retirement & offset',
          chainKey: 'carbon_budget',
          body: () => (
            <ListingTable
              endpoint="/carbon/budget"
              rowKey={(r) => r.id}
              empty={{ title: 'No carbon budgets', description: 'Annual carbon budget allocations will appear here.' }}
              columns={[
                { key: 'fiscal_year', label: 'Year' },
                { key: 'budget_tco2e', label: 'Budget (tCO₂e)', render: (r) => r.budget_tco2e != null ? Number(r.budget_tco2e).toLocaleString() : '—' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['approved'].includes(r.chain_status) ? 'good' : ['exceeded','breached'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Filed', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'vcm_project_development',
          label: 'VCM project development',
          group: 'Project pipeline',
          chainKey: 'vcm_project_development',
          body: () => (
            <ListingTable
              endpoint="/carbon/vcm-projects"
              rowKey={(r) => r.id}
              empty={{ title: 'No VCM projects', description: 'Voluntary carbon market project development cases will appear here.' }}
              columns={[
                { key: 'project_name', label: 'Project' },
                { key: 'methodology_id', label: 'Methodology' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['validated','registered'].includes(r.chain_status) ? 'good' : ['rejected','withdrawn'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Created', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'certificate_bundle',
          label: 'Certificate bundles',
          group: 'Issuance & registry',
          chainKey: 'certificate_bundle',
          body: () => (
            <ListingTable
              endpoint="/certificate-track/bundle"
              rowKey={(r) => r.id}
              empty={{ title: 'No certificate bundles', description: 'I-REC/SAREC certificate bundles will appear here.' }}
              columns={[
                { key: 'volume_mwh', label: 'Volume (MWh)', render: (r) => r.volume_mwh != null ? `${Number(r.volume_mwh).toLocaleString()} MWh` : '—' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['issued'].includes(r.chain_status) ? 'good' : ['cancelled'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Created', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'registry_transfers',
          label: 'Registry transfers (W206)',
          group: 'Trading & markets',
          chainKey: 'carbon_registry_transfer',
          body: ({ onRefresh }) => <CarbonRegistryTransferTab onRefresh={onRefresh} />,
        },
        {
          key: 'methodology_amendments',
          label: 'Methodology amendments (W213)',
          group: 'Article 6 & compliance',
          chainKey: 'methodology_amendment',
          body: ({ onRefresh }) => <MethodologyAmendmentTab onRefresh={onRefresh} />,
        },
        {
          key: 'reports',
          label: 'Reports & Exports',
          group: 'Article 6 & compliance',
          body: () => (
            <div className="space-y-8">
              {CARBON_REPORTS.map(cfg => (
                <div key={cfg.endpoint} className="space-y-2">
                  <p className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide">{cfg.title}</p>
                  <ReportPanel config={cfg} />
                </div>
              ))}
            </div>
          ),
        },
        {
          key: 'audit',
          label: 'Audit & compliance',
          group: 'Article 6 & compliance',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/carbon-registry"
              reconHint="serial_id,retirement_ref,quantity_tco2e,retired_at"
              reconSourceOptions={['verra', 'gold_standard', 'cdm', 'sa_redd']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function VintagesTab({ onRefresh }: { onRefresh: () => void }) {
  const [advancing, setAdvancing] = useState<any | null>(null);
  return (
    <div>
      <ListingTable
        endpoint="/carbon-registry/vintage-workflow"
        rowKey={(r) => r.id}
        rowHref={(r) => `/carbon-registry/vintages/${r.id}`}
        empty={{ title: 'No vintages in workflow', description: 'Vintage cohorts will appear here as they progress through issued → validated → listed → traded → retired.' }}
        columns={[
          { key: 'vintage_id', label: 'Vintage', render: (r) => <span className="font-mono text-[11px]">{(r.vintage_id || '').slice(0, 12)}…</span> },
          { key: 'current_stage', label: 'Stage', render: (r) => <Pill tone={r.current_stage === 'retired_full' ? 'good' : 'info'}>{r.current_stage.replace(/_/g, ' ')}</Pill> },
          { key: 'retired_volume_tco2e', label: 'Retired tCO₂e', align: 'right', render: (r) => Number(r.retired_volume_tco2e || 0).toFixed(1) },
          { key: 'outstanding_tco2e', label: 'Outstanding tCO₂e', align: 'right', render: (r) => Number(r.outstanding_tco2e || 0).toFixed(1) },
          { key: 'updated_at', label: 'Updated', render: (r) => new Date(r.updated_at).toLocaleDateString() },
          { key: '_actions', label: '', render: (r) => (
            <button type="button" onClick={() => setAdvancing(r)} className="px-2 py-1 text-[11px] bg-[#c2873a] text-white rounded">Advance</button>
          ) },
        ]}
      />
      {advancing && (
        <ActionModal
          title={`Advance vintage stage · current: ${advancing.current_stage}`}
          submitLabel="Advance"
          fields={[
            { key: 'to_stage', label: 'Next stage', type: 'select', required: true, options: STAGE_OPTIONS },
          ] as FieldSpec[]}
          onClose={() => setAdvancing(null)}
          onSubmit={async (v) => {
            await api.post(`/carbon-registry/vintage-workflow/${advancing.id}/advance`, { to_stage: v.to_stage });
            setAdvancing(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function MrvTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="New MRV submission" />
      <ListingTable
        endpoint="/carbon-registry/mrv-submissions"
        rowKey={(r) => r.id}
        empty={{ title: 'No MRV submissions', description: 'Measurement-Reporting-Verification cycles will land here as they are drafted, submitted, verified, and published.' }}
        columns={[
          { key: 'project_id', label: 'Project', render: (r) => <span className="font-mono text-[11px]">{(r.project_id || '').slice(0, 12)}…</span> },
          { key: 'period_start', label: 'Period', render: (r) => `${r.period_start} → ${r.period_end}` },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'verified' || r.status === 'published' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status.replace(/_/g, ' ')}</Pill> },
          { key: 'reduction_tco2e', label: 'Reduction tCO₂e', align: 'right', render: (r) => r.reduction_tco2e != null ? Number(r.reduction_tco2e).toFixed(1) : '—' },
          { key: 'verified_at', label: 'Verified', render: (r) => r.verified_at ? new Date(r.verified_at).toLocaleDateString() : '—' },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'published' && r.status !== 'rejected' && (
              <button type="button" onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[#c2873a] text-white rounded">Transition</button>
            )
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="New MRV submission"
          submitLabel="File"
          fields={[
            { key: 'project_id', label: 'Project', type: 'lookup', required: true, lookupEndpoint: '/api/lookup/carbon_projects', lookupAutoFill: { methodology_id: 'methodology_id' } },
            { key: 'period_start', label: 'Period start', type: 'date', required: true },
            { key: 'period_end', label: 'Period end', type: 'date', required: true },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-registry/mrv-submissions', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title={`MRV transition · current: ${transitioning.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: MRV_TRANSITIONS },
            { key: 'reduction_tco2e', label: 'Reduction tCO₂e (verification only)', type: 'number' },
            { key: 'rejection_reason', label: 'Rejection reason (rejected only)', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(null)}
          onSubmit={async (v) => {
            const body: any = { to: v.to };
            if (v.reduction_tco2e) body.reduction_tco2e = Number(v.reduction_tco2e);
            if (v.rejection_reason) body.rejection_reason = v.rejection_reason;
            await api.post(`/carbon-registry/mrv-submissions/${transitioning.id}/transition`, body);
            setTransitioning(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function CertificatesTab({ onRefresh }: { onRefresh: () => void }) {
  const [issuing, setIssuing] = useState(false);
  return (
    <div>
      <Header onCreate={() => setIssuing(true)} label="Issue certificate" />
      <ListingTable
        endpoint="/carbon-registry/retirement-certificates"
        rowKey={(r) => r.id}
        empty={{ title: 'No retirement certificates', description: 'Certificates issued for retired tCO₂e on behalf of buyers will appear here.' }}
        columns={[
          { key: 'certificate_number', label: 'Certificate', render: (r) => <span className="font-mono text-[11px]">{r.certificate_number}</span> },
          { key: 'beneficiary_name', label: 'Beneficiary' },
          { key: 'retired_volume_tco2e', label: 'tCO₂e', align: 'right', render: (r) => Number(r.retired_volume_tco2e || 0).toFixed(1) },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'delivered' ? 'good' : r.status === 'revoked' ? 'bad' : 'info'}>{r.status}</Pill> },
          { key: 'issued_at', label: 'Issued', render: (r) => r.issued_at ? new Date(r.issued_at).toLocaleDateString() : '—' },
        ]}
      />
      {issuing && (
        <ActionModal
          title="Issue retirement certificate"
          submitLabel="Issue"
          fields={[
            { key: 'retirement_id', label: 'Retirement ID', required: true, placeholder: 'retirement_…' },
            { key: 'retired_volume_tco2e', label: 'Retired tCO₂e', type: 'number', required: true },
            { key: 'beneficiary_name', label: 'Beneficiary name' },
            { key: 'beneficiary_email', label: 'Beneficiary email' },
          ] as FieldSpec[]}
          onClose={() => setIssuing(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-registry/retirement-certificates/issue', {
              retirement_id: v.retirement_id,
              retired_volume_tco2e: Number(v.retired_volume_tco2e),
              beneficiary_name: v.beneficiary_name || undefined,
              beneficiary_email: v.beneficiary_email || undefined,
            });
            setIssuing(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

const CTR_STATUS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  payment_made: 'good', submitted: 'good',
  disputed: 'bad', under_sars_review: 'warn',
  assessment_issued: 'warn', period_open: 'info',
};
const TAX_CLASS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  micro: 'good', standard: 'info', large: 'warn', major: 'bad',
};
const CTR_ACTIONS = [
  { value: 'open_data_collection', label: 'Open data collection' },
  { value: 'calculate_emissions', label: 'Calculate emissions' },
  { value: 'apply_allowances', label: 'Apply allowances' },
  { value: 'prepare_return', label: 'Prepare return' },
  { value: 'approve_internally', label: 'Approve internally' },
  { value: 'submit_to_sars', label: 'Submit to SARS' },
  { value: 'acknowledge_receipt', label: 'Acknowledge receipt' },
  { value: 'commence_review', label: 'Commence review' },
  { value: 'issue_assessment', label: 'Issue assessment' },
  { value: 'record_payment', label: 'Record payment' },
  { value: 'raise_dispute', label: 'Raise dispute' },
];

function CarbonTaxReturnsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [actionRow, setActionRow] = useState<Record<string, unknown> | null>(null);

  const createFields: FieldSpec[] = [
    { key: 'participant_id', label: 'Participant', type: 'lookup', required: true, lookupEndpoint: '/api/lookup/participants' },
    { key: 'tax_class', label: 'Tax class', type: 'select', options: [
      { value: 'micro', label: 'Micro <25k tCO2e (14d SLA)' },
      { value: 'standard', label: 'Standard <100k tCO2e (30d SLA)' },
      { value: 'large', label: 'Large <500k tCO2e (60d SLA)' },
      { value: 'major', label: 'Major ≥500k tCO2e (90d SLA)' },
    ]},
    { key: 'tax_period', label: 'Tax period', required: true, placeholder: 'Q1-2025' },
    { key: 'fiscal_year', label: 'Fiscal year', type: 'number', required: true },
    { key: 'scope1_tco2e', label: 'Scope 1 (tCO2e)', type: 'number' },
    { key: 'scope2_tco2e', label: 'Scope 2 (tCO2e)', type: 'number' },
    { key: 'process_emissions_tco2e', label: 'Process emissions (tCO2e)', type: 'number' },
  ];

  const formatZAR = (v: unknown) =>
    v != null ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(v)) : '—';

  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Open return period" />
      {filing && (
        <ActionModal
          title="Open carbon tax return period"
          fields={createFields}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-tax-returns', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {actionRow && (
        <ActionModal
          title={`Return action: ${String(actionRow.tax_period || '')} (${String(actionRow.tax_class || '')})`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: CTR_ACTIONS },
            { key: 'sars_submission_ref', label: 'SARS submission ref' },
            { key: 'sars_assessment_ref', label: 'SARS assessment ref' },
            { key: 'assessment_amount', label: 'Assessment amount (ZAR)', type: 'number' },
            { key: 'net_tax_payable', label: 'Net tax payable (ZAR)', type: 'number' },
            { key: 'payment_reference', label: 'Payment reference' },
            { key: 'paid_amount', label: 'Paid amount (ZAR)', type: 'number' },
            { key: 'dispute_reason', label: 'Dispute reason', type: 'textarea' },
            { key: 'reason', label: 'Reason / note', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setActionRow(null)}
          onSubmit={async (v) => {
            await api.post(`/carbon-tax-returns/${String(actionRow.id)}/action`, v);
            setActionRow(null); onRefresh();
          }}
        />
      )}
      <ListingTable
        endpoint="/carbon-tax-returns"
        rowKey={(r) => r.id}
        columns={[
          { key: 'tax_period', label: 'Period', render: (r) => <span className="font-mono text-[11px]">{String(r.tax_period || '')} FY{r.fiscal_year}</span> },
          { key: 'tax_class', label: 'Class', render: (r) => <Pill tone={TAX_CLASS_TONE[String(r.tax_class)] ?? 'info'}>{String(r.tax_class || '')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={CTR_STATUS_TONE[String(r.chain_status)] ?? 'info'}>{String(r.chain_status || '').replace(/_/g, ' ')}</Pill> },
          { key: 'total_emissions_tco2e', label: 'tCO2e', align: 'right' as const, render: (r) => r.total_emissions_tco2e != null ? Number(r.total_emissions_tco2e).toFixed(1) : '—' },
          { key: 'net_tax_payable', label: 'Net payable', align: 'right' as const, render: (r) => formatZAR(r.net_tax_payable) },
          { key: 'sla_deadline', label: 'SLA', render: (r) => r.sla_deadline ? String(r.sla_deadline) : '—' },
          { key: 'sla_breached', label: 'Breach', render: (r) => r.sla_breached ? <Pill tone="bad">BREACH</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'actions', label: '', render: (r) => (
            <button type="button" onClick={() => setActionRow(r)} className="text-[11px] text-[oklch(0.46_0.16_55)] underline">Action</button>
          )},
        ]}
      />
    </div>
  );
}

// ─── W206: Carbon Registry Transfer ───────────────────────────────────────────
type CrtModalMode = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function CarbonRegistryTransferTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<CrtModalMode>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  const statusTone = (s: string) => {
    if (['ca_notified', 'completed'].includes(s)) return 'good' as const;
    if (['aml_rejected', 'registry_rejected'].includes(s)) return 'bad' as const;
    if (['ca_notation_required', 'transfer_in_flight'].includes(s)) return 'warn' as const;
    return 'neutral' as const;
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button"
          className="px-3 py-1.5 rounded bg-[#c2873a] text-white text-sm font-medium hover:bg-[#a3702f]"
          onClick={() => setModal('create')}
        >
          + New transfer
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/carbon-registry-transfers"
        rowKey={(r) => r.id}
        empty={{ title: 'No registry transfers', description: 'Initiate a carbon credit registry transfer (domestic or international Art 6).' }}
        columns={[
          { key: 'transfer_type', label: 'Type', render: (r) => <Pill tone="info">{String(r.transfer_type).replace(/_/g, ' ')}</Pill> },
          { key: 'quantity_tco2e', label: 'Quantity (tCO₂e)', align: 'right', render: (r) => r.quantity_tco2e != null ? Number(r.quantity_tco2e).toLocaleString() : '—' },
          { key: 'source_registry', label: 'From', render: (r) => r.source_registry || '—' },
          { key: 'destination_registry', label: 'To', render: (r) => r.destination_registry || '—' },
          { key: 'vintage_year', label: 'Vintage', render: (r) => r.vintage_year || '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New carbon registry transfer"
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/carbon-registry-transfers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                transfer_type: v.transfer_type,
                quantity_tco2e: parseFloat(v.quantity_tco2e),
                vintage_year: v.vintage_year ? parseInt(v.vintage_year, 10) : undefined,
                source_registry: v.source_registry || undefined,
                destination_registry: v.destination_registry || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            {
              key: 'transfer_type', label: 'Transfer type', type: 'select', required: true, defaultValue: 'domestic',
              options: [
                { value: 'domestic', label: 'Domestic (7d SLA)' },
                { value: 'voluntary_crossregistry', label: 'Voluntary cross-registry (14d)' },
                { value: 'corsia', label: 'CORSIA (21d)' },
                { value: 'international_art6', label: 'International Art 6.2 (30d)' },
              ],
            },
            { key: 'quantity_tco2e', label: 'Quantity (tCO₂e)', type: 'number', required: true },
            { key: 'vintage_year', label: 'Vintage year', type: 'number', required: false },
            { key: 'source_registry', label: 'Source registry', type: 'select', required: false, options: [{ value: 'verra_vcs', label: 'Verra VCS' }, { value: 'gold_standard', label: 'Gold Standard' }, { value: 'article_6_4', label: 'Article 6.4' }, { value: 'cdm', label: 'CDM' }, { value: 'sarec', label: 'SAREC' }, { value: 'corsia', label: 'CORSIA' }] },
            { key: 'destination_registry', label: 'Destination registry', type: 'select', required: false, options: [{ value: 'verra_vcs', label: 'Verra VCS' }, { value: 'gold_standard', label: 'Gold Standard' }, { value: 'article_6_4', label: 'Article 6.4' }, { value: 'cdm', label: 'CDM' }, { value: 'sarec', label: 'SAREC' }, { value: 'corsia', label: 'CORSIA' }] },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Advance transfer — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/carbon-registry-transfers/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                reason: v.reason || undefined,
                aml_check_ref: v.aml_check_ref || undefined,
                registry_auth_ref: v.registry_auth_ref || undefined,
                transfer_certificate_ref: v.transfer_certificate_ref || undefined,
                unfccc_notification_ref: v.unfccc_notification_ref || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'submit_aml_kyc', label: 'Submit AML/KYC check' },
                { value: 'pass_aml_kyc', label: 'AML/KYC passed' },
                { value: 'fail_aml_kyc', label: 'AML/KYC failed (reject)' },
                { value: 'submit_registry_review', label: 'Submit to source registry' },
                { value: 'authorize', label: 'Registry authorizes transfer' },
                { value: 'reject_registry', label: 'Registry rejects transfer' },
                { value: 'initiate_transfer', label: 'Initiate transfer (units in flight)' },
                { value: 'confirm_receipt', label: 'Destination registry confirms receipt' },
                { value: 'flag_ca_required', label: 'Flag: corresponding adjustment required' },
                { value: 'notify_ca', label: 'Notify UNFCCC / DNA (CA notified)' },
                { value: 'complete_domestic', label: 'Complete domestic transfer' },
                { value: 'cancel', label: 'Cancel transfer' },
              ],
            },
            { key: 'aml_check_ref', label: 'AML/KYC check reference', required: false },
            { key: 'registry_auth_ref', label: 'Registry authorization reference', required: false },
            { key: 'transfer_certificate_ref', label: 'Transfer certificate reference', required: false },
            { key: 'unfccc_notification_ref', label: 'UNFCCC notification reference', required: false },
            { key: 'reason', label: 'Notes / reason', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ─── W213: Carbon Methodology Amendment ───────────────────────────────────────
const MA_TIER_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good' | 'neutral'> = {
  minor_parameter: 'info',
  moderate_change: 'warn',
  major_change: 'bad',
  article6_itmo: 'bad',
};

function statusToneMA(s: string): 'info' | 'warn' | 'bad' | 'good' | 'neutral' {
  if (s === 'amendment_approved') return 'good';
  if (s === 'amendment_rejected' || s === 'withdrawn') return 'bad';
  if (s === 'revalidation' || s === 'major_deviation') return 'warn';
  return 'info';
}

function MethodologyAmendmentTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<null | 'create' | { type: 'action'; id: string; currentStatus: string }>(null);
  const [refresh, setRefresh] = useState(0);
  const bump = () => { setRefresh(r => r + 1); onRefresh(); };

  return (
    <div>
      <Header onCreate={() => setModal('create')} label="Report deviation" />
      <ListingTable
        endpoint="/methodology-amendments"
        key={refresh}
        rowKey={(r) => r.id}
        empty={{ title: 'No methodology amendments', description: 'Deviations from approved methodologies will appear here.' }}
        columns={[
          { key: 'methodology_id', label: 'Methodology', render: (r) => <span className="font-mono text-[11px]">{r.methodology_id}</span> },
          { key: 'amendment_tier', label: 'Tier', render: (r) => <Pill tone={MA_TIER_TONE[r.amendment_tier] ?? 'neutral'}>{String(r.amendment_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusToneMA(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'estimated_impact_tco2e', label: 'Impact tCO₂e', align: 'right', render: (r) => r.estimated_impact_tco2e ? Number(r.estimated_impact_tco2e).toFixed(1) : '—' },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'created_at', label: 'Reported', render: (r) => new Date(r.created_at).toLocaleDateString() },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Report methodology deviation"
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/methodology-amendments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                methodology_id: v.methodology_id,
                methodology_version: v.methodology_version || undefined,
                amendment_tier: v.amendment_tier,
                deviation_type: v.deviation_type || undefined,
                deviation_description: v.deviation_description,
                estimated_impact_tco2e: v.estimated_impact_tco2e ? parseFloat(v.estimated_impact_tco2e) : undefined,
                project_ref: v.project_ref || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            bump();
          }}
          fields={[
            { key: 'methodology_id', label: 'Methodology', type: 'select', required: true, options: [{ value: 'vm0038', label: 'VM0038 (AFOLU)' }, { value: 'acm0002', label: 'ACM0002 (Grid)' }, { value: 'am0067', label: 'AM0067 (Transport)' }, { value: 'ams_iii_h', label: 'AMS-III.H (Biogas)' }, { value: 'gs_ve', label: 'GS VE' }] },
            { key: 'methodology_version', label: 'Methodology version', required: false, placeholder: '3.0' },
            {
              key: 'amendment_tier', label: 'Amendment tier', type: 'select', required: true, defaultValue: 'moderate_change',
              options: [
                { value: 'minor_parameter', label: 'Minor parameter (14d SLA)' },
                { value: 'moderate_change', label: 'Moderate change (30d SLA)' },
                { value: 'major_change', label: 'Major change (60d SLA)' },
                { value: 'article6_itmo', label: 'Article 6 ITMO (90d SLA)' },
              ],
            },
            {
              key: 'deviation_type', label: 'Deviation type', type: 'select', required: false,
              options: [
                { value: 'emission_factor', label: 'Emission factor' },
                { value: 'additionality_condition', label: 'Additionality condition' },
                { value: 'technology_change', label: 'Technology change' },
                { value: 'monitoring_parameter', label: 'Monitoring parameter' },
                { value: 'baseline_revision', label: 'Baseline revision' },
                { value: 'geographic_boundary', label: 'Geographic boundary' },
              ],
            },
            { key: 'deviation_description', label: 'Deviation description', type: 'textarea', required: true },
            { key: 'estimated_impact_tco2e', label: 'Estimated impact (tCO₂e)', type: 'number', required: false },
            { key: 'project_ref', label: 'Project reference (W37)', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ] as FieldSpec[]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Advance amendment — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/methodology-amendments/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                materiality_rationale: v.materiality_rationale || undefined,
                is_material: v.is_material === 'true' ? true : v.is_material === 'false' ? false : undefined,
                amendment_description: v.amendment_description || undefined,
                new_methodology_version: v.new_methodology_version || undefined,
                dna_name: v.dna_name || undefined,
                dna_notification_ref: v.dna_notification_ref || undefined,
                validator_name: v.validator_name || undefined,
                validator_ref: v.validator_ref || undefined,
                validator_findings: v.validator_findings || undefined,
                rejection_reason: v.rejection_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            bump();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'start_materiality', label: 'Start materiality assessment' },
                { value: 'classify_minor', label: 'Classify — minor (non-material)' },
                { value: 'classify_major', label: 'Classify — major (material)' },
                { value: 'submit_amendment', label: 'Submit amendment to standard body' },
                { value: 'notify_dna', label: 'Notify DNA (Article 6)' },
                { value: 'assign_validator', label: 'Assign validator' },
                { value: 'start_revalidation', label: 'Start re-validation' },
                { value: 'approve_amendment', label: 'Approve amendment' },
                { value: 'reject_amendment', label: 'Reject amendment' },
                { value: 'withdraw', label: 'Withdraw deviation' },
              ],
            },
            { key: 'materiality_rationale', label: 'Materiality rationale', type: 'textarea', required: false },
            { key: 'is_material', label: 'Is material?', type: 'select', required: false, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
            { key: 'amendment_description', label: 'Amendment description', type: 'textarea', required: false },
            { key: 'new_methodology_version', label: 'New methodology version', required: false },
            { key: 'dna_name', label: 'DNA name', required: false },
            { key: 'dna_notification_ref', label: 'DNA notification reference', required: false },
            { key: 'validator_name', label: 'Validator name', required: false },
            { key: 'validator_ref', label: 'Validator reference', required: false },
            { key: 'validator_findings', label: 'Validator findings', type: 'textarea', required: false },
            { key: 'rejection_reason', label: 'Rejection reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ] as FieldSpec[]}
        />
      )}
    </div>
  );
}
