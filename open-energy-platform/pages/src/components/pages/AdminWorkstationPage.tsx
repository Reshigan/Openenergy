import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { AuditChainBlockTab } from '../audit/AuditChainBlockTab';
import { RegulatorExportPackTab } from '../regulatorExport/RegulatorExportPackTab';
import { ReconciliationAttestationTab } from '../reconciliation/ReconciliationAttestationTab';
import { ControlEnvironmentAuditTab } from '../controlEnvironment/ControlEnvironmentAuditTab';
import { StrateSwiftConnectorTab } from '../strateSwiftConnector/StrateSwiftConnectorTab';
import { SapOracleErpConnectorTab } from '../sapOracleErpConnector/SapOracleErpConnectorTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
import { AnomalyDetectionMlTab } from '../anomalyDetectionMl/AnomalyDetectionMlTab';
import RulPredictionMlTab from '../rulPredictionMl/RulPredictionMlTab';
import { FaultFingerprintMlTab } from '../faultFingerprintMl/FaultFingerprintMlTab';
import { api } from '../../lib/api';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { WizardSpec } from '../launch/WizardModal';
import type { TourDef } from '../launch/ProductTour';

const ADMIN_REPORTS: ReportConfig[] = [
  {
    title: 'Platform Events',
    endpoint: '/api/platform-events',
    columns: [
      { key: 'event', label: 'Event' },
      { key: 'chain_key', label: 'Chain' },
      { key: 'entity_type', label: 'Entity Type' },
      { key: 'actor_id', label: 'Actor' },
      { key: 'occurred_at', label: 'Occurred' },
    ],
    dateKey: 'occurred_at',
    pivotGroupBy: 'chain_key',
    mailSubject: 'Open Energy — Platform Events Report',
  },
  {
    title: 'Role Action Queue',
    endpoint: '/api/role-actions',
    columns: [
      { key: 'target_role', label: 'Role' },
      { key: 'title', label: 'Title' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'sla_due_at', label: 'SLA Due' },
    ],
    filters: [{ key: 'status', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'actioned', label: 'Actioned' }, { value: 'dismissed', label: 'Dismissed' }] }],
    pivotGroupBy: 'target_role',
    mailSubject: 'Open Energy — Role Action Queue Report',
  },
];

const formatZAR = (v: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(v || 0);

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

const ADMIN_WIZARDS: WizardSpec[] = [
  {
    id: 'admin-complete-setup',
    title: 'Set up the Open Energy platform',
    subtitle: 'Configure tenant management, audit, compliance exports, and ML/AI workflows for the full platform',
    steps: [
      {
        title: 'Platform & tenants',
        description: 'Set up Tenant events, Platform billing, Subscription billing, Feature flags, KYC verifications, and POPIA data subject requests.',
        aiHint: 'Feature flags control which workflow chains are active per tenant. Turning off a chain for a specific tenant prevents them from using that workflow but does NOT delete their existing data. KYC verification is the gate for market access — pending KYC reviews block tenants from placing orders or executing contracts.',
        fields: [
          { key: 'default_features', label: 'Default features for new tenants', type: 'select', options: [{ value: 'all', label: 'All features enabled' }, { value: 'core_only', label: 'Core features only — advanced chains off' }, { value: 'manual', label: 'Manual configuration per tenant' }] },
          { key: 'kyc_provider', label: 'KYC verification provider', type: 'select', options: [{ value: 'manual', label: 'Manual in-house review' }, { value: 'lexisnexis', label: 'LexisNexis' }, { value: 'refinitiv', label: 'Refinitiv World-Check' }, { value: 'onfido', label: 'Onfido / Persona' }] },
          { key: 'billing_cycle', label: 'Platform billing cycle', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual (with discount)' }] },
        ],
      },
      {
        title: 'Audit & data integrity',
        description: 'Configure Settlement audit, Platform audit chain, PII access log, Tamper-evident audit, and Cascade DLQ (dead-letter queue).',
        aiHint: 'The Cascade DLQ captures failed event deliveries — review it daily for webhook failures. POPIA requires a PII access log with full traceability. The tamper-evident audit chain uses a hash-linked log that can be exported and certified for NERSA/FSCA. Set your data retention period to comply with your regulatory obligations.',
        fields: [
          { key: 'audit_retention_years', label: 'Audit data retention (years)', type: 'select', options: [{ value: '5', label: '5 years (POPIA minimum)' }, { value: '7', label: '7 years (FSCA requirement)' }, { value: '10', label: '10 years (project finance standard)' }] },
          { key: 'dlq_alert_email', label: 'DLQ alert email', type: 'text', placeholder: 'ops@openenergy.co.za' },
          { key: 'settlement_audit_frequency', label: 'Settlement reconciliation frequency', type: 'select', options: [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }] },
        ],
      },
      {
        title: 'Regulatory exports & attestation',
        description: 'Set up Regulator exports (NERSA/FSCA), Reconciliation attestation, and Control environment audit workflows.',
        aiHint: 'Regulatory export packs are generated on-demand and can be sent directly to NERSA, FSCA, or SARB. Each export is digitally signed with the platform\'s certificate. Reconciliation attestation requires a SARS-qualified signatory — set that contact now so the workflow routes approvals correctly.',
        fields: [
          { key: 'export_signing_authority', label: 'Regulatory export signing authority', type: 'text', placeholder: 'Name and designation (e.g. COO, Compliance Officer)' },
          { key: 'nersa_data_officer', label: 'NERSA data officer contact', type: 'text', placeholder: 'Name and email — your contact at NERSA' },
          { key: 'attestation_signatory', label: 'Reconciliation attestation signatory', type: 'text', placeholder: 'CA(SA) or RA signatory name' },
        ],
      },
      {
        title: 'ML & AI models',
        description: 'Configure Anomaly detection (ML), RUL prediction (ML), and Fault fingerprint (ML) model management.',
        aiHint: 'The three ML models (anomaly ensemble, RUL prediction, fault fingerprinting) run on Workers AI. They retrain weekly on new site telemetry. Set your sensitivity thresholds: high sensitivity = more alerts but also more false positives. The fault fingerprint model uses 12 physics-based signatures — calibrate it against your equipment OEM specs for best accuracy.',
        fields: [
          { key: 'anomaly_sensitivity', label: 'Anomaly detection sensitivity', type: 'select', options: [{ value: 'high', label: 'High (3σ threshold)' }, { value: 'medium', label: 'Medium (2.5σ threshold — recommended)' }, { value: 'low', label: 'Low (2σ threshold)' }] },
          { key: 'rul_alert_days', label: 'RUL alert threshold (days to failure)', type: 'number', placeholder: 'e.g. 90 — alert when < 90 days to predicted failure' },
          { key: 'ml_retraining_frequency', label: 'Model retraining frequency', type: 'select', options: [{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }] },
        ],
      },
    ],
    submitLabel: 'Save platform configuration',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/admin/platform-config', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'admin-onboard-tenant',
    title: 'Onboard a new tenant',
    subtitle: 'Multi-tenancy — create organisation and seed roles',
    steps: [
      {
        title: 'Organisation',
        description: 'Create the organisational record for the new participant.',
        aiHint: 'Each tenant is fully isolated at the data layer. KYC must be completed before the tenant can place orders or execute contracts on the platform.',
        fields: [
          { key: 'organisation_name', label: 'Organisation name', type: 'text', required: true, placeholder: 'e.g. Saldanha Wind Energy (Pty) Ltd' },
          { key: 'registration_number', label: 'CIPC registration number', type: 'text', required: true, placeholder: 'e.g. 2015/123456/07' },
          { key: 'primary_role', label: 'Primary market role', type: 'select', required: true, options: [{ value: 'ipp_developer', label: 'IPP developer' }, { value: 'trader', label: 'Trader / broker' }, { value: 'offtaker', label: 'Offtaker / buyer' }, { value: 'lender', label: 'Project finance lender' }, { value: 'grid_operator', label: 'Grid / network operator' }, { value: 'carbon_fund', label: 'Carbon fund manager' }, { value: 'regulator', label: 'Regulatory body' }] },
        ],
      },
      {
        title: 'Contact',
        description: 'Primary admin contact for this organisation.',
        aiHint: 'The primary admin email receives the invite link and initial password. They become the org admin and can invite additional users.',
        fields: [
          { key: 'admin_email', label: 'Primary admin email', type: 'text', required: true, placeholder: 'admin@organisation.co.za' },
          { key: 'admin_name', label: 'Admin contact name', type: 'text', placeholder: 'Full name' },
          { key: 'phone', label: 'Contact phone', type: 'text', placeholder: '+27 xx xxx xxxx' },
        ],
      },
      {
        title: 'Compliance tier',
        description: 'Set the regulatory classification for this participant.',
        aiHint: 'Compliance tier determines which workflows are activated for this tenant. A trading licence holder gets the full Trader workstation; a capacity participant gets IPP + Grid chains.',
        fields: [
          { key: 'compliance_tier', label: 'Compliance tier', type: 'select', options: [{ value: 'standard', label: 'Standard — basic FICA / POPIA' }, { value: 'regulated', label: 'Regulated entity — NERSA licence required' }, { value: 'fsca', label: 'FSCA authorised — FMA / FAIS compliance' }] },
          { key: 'kyc_required', label: 'Require KYC before activation?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes (recommended)' }, { value: 'no', label: 'No — activate immediately' }] },
        ],
      },
    ],
    submitLabel: 'Create tenant',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/admin/tenants', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Tenant creation failed'); }
    },
  },
  {
    id: 'admin-kyc',
    title: 'Complete a KYC review',
    subtitle: 'FICA 38 / POPIA — identity verification for market access',
    steps: [
      {
        title: 'Identity verification',
        description: 'Confirm the entity\'s identity documents have been verified.',
        aiHint: 'FICA requires verification of the entity\'s legal identity (CIPC registration), ultimate beneficial owners (UBOs), and proof of address. A KYC failure blocks trading access.',
        fields: [
          { key: 'tenant_id', label: 'Tenant reference', type: 'text', required: true, placeholder: 'Tenant ID or organisation name' },
          { key: 'cipc_verified', label: 'CIPC registration verified?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No — still pending' }] },
          { key: 'ubo_verified', label: 'UBO identity verified?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'na', label: 'N/A (listed company)' }] },
        ],
      },
      {
        title: 'Risk assessment',
        description: 'Assign a risk rating and record the KYC outcome.',
        aiHint: 'High-risk entities require enhanced due diligence (EDD) under FICA §21B. This includes source of funds verification and senior management sign-off.',
        fields: [
          { key: 'risk_rating', label: 'KYC risk rating', type: 'select', required: true, options: [{ value: 'low', label: 'Low risk' }, { value: 'medium', label: 'Medium risk' }, { value: 'high', label: 'High risk — EDD required' }] },
          { key: 'kyc_outcome', label: 'KYC outcome', type: 'select', required: true, options: [{ value: 'passed', label: 'Passed — activate market access' }, { value: 'pending_edd', label: 'Pending EDD — hold access' }, { value: 'failed', label: 'Failed — reject onboarding' }] },
          { key: 'reviewer_notes', label: 'Reviewer notes', type: 'textarea', placeholder: 'Key findings, concerns, or escalation reasons…' },
        ],
      },
    ],
    submitLabel: 'Record KYC outcome',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/admin/kyc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'KYC review failed'); }
    },
  },
  {
    id: 'admin-feature-flag',
    title: 'Configure a feature flag',
    subtitle: 'Platform configuration — enable or restrict functionality',
    steps: [
      {
        title: 'Flag configuration',
        description: 'Set a platform-wide or per-tenant feature flag.',
        aiHint: 'Feature flags allow gradual rollout of new chains or market rules. Turning off a flag for a specific tenant overrides the global setting for that organisation only.',
        fields: [
          { key: 'flag_name', label: 'Feature flag name', type: 'text', required: true, placeholder: 'e.g. enable_algo_trading, require_ep4_monitoring' },
          { key: 'flag_value', label: 'Value', type: 'select', required: true, options: [{ value: 'on', label: 'On (enabled globally)' }, { value: 'off', label: 'Off (disabled globally)' }, { value: 'tenant_override', label: 'Per-tenant override (set tenant below)' }] },
          { key: 'tenant_id', label: 'Tenant (leave blank for global)', type: 'text', placeholder: 'Tenant ID for per-tenant override' },
          { key: 'notes', label: 'Change reason', type: 'textarea', required: true, placeholder: 'Why this flag is being changed and when it should be reviewed…' },
        ],
      },
    ],
    submitLabel: 'Apply configuration',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/admin/features', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Feature flag update failed'); }
    },
  },
  {
    id: 'admin-onboard-participant',
    title: 'Onboard new participant',
    subtitle: 'Create user account and seed role access',
    steps: [
      {
        title: 'Identity',
        fields: [
          { key: 'email', label: 'Email', type: 'text', required: true, placeholder: 'user@organisation.co.za' },
          { key: 'full_name', label: 'Full name', type: 'text', required: true },
          { key: 'role', label: 'Role', type: 'select', required: true, options: [{ value: 'ipp_developer', label: 'IPP developer' }, { value: 'offtaker', label: 'Offtaker' }, { value: 'lender', label: 'Lender' }, { value: 'trader', label: 'Trader' }, { value: 'carbon_fund', label: 'Carbon fund' }, { value: 'grid_operator', label: 'Grid operator' }, { value: 'regulator', label: 'Regulator' }, { value: 'support', label: 'Support' }, { value: 'esco', label: 'ESCO' }, { value: 'epc_contractor', label: 'EPC contractor' }] },
          { key: 'company_name', label: 'Company name', type: 'text', required: true },
        ],
      },
      {
        title: 'Access',
        fields: [
          { key: 'kyc_status', label: 'KYC status', type: 'select', required: true, options: [{ value: 'verified', label: 'Verified' }, { value: 'pending', label: 'Pending' }, { value: 'not_required', label: 'Not required' }] },
          { key: 'tenant_id', label: 'Tenant ID', type: 'text', placeholder: 'default' },
          { key: 'initial_password', label: 'Initial password', type: 'text', required: true, placeholder: 'Temporary password — user must change on first login' },
        ],
      },
    ],
    submitLabel: 'Create participant',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/participants', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'admin-run-cron',
    title: 'Run cron manually',
    subtitle: 'Admin — dry-run or execute a scheduled job on demand',
    steps: [
      {
        title: 'Cron job',
        fields: [
          { key: 'schedule', label: 'Scheduled job', type: 'select', required: true, options: [{ value: '*/15_surveillance', label: '*/15 — Surveillance + DO depth snapshots' }, { value: '0h_vwap', label: '0h — VWAP mark prices' }, { value: '5_0_metering', label: '5:00 — Metering + ONA rollups' }, { value: '10_0_settlement', label: '10:00 — PPA settlement run' }, { value: '30_0_margin', label: '30:00 — Margin-call cycle' }, { value: '45_0_anomaly', label: '45:00 — Anomaly scan + maturity refresh' }, { value: '0_2_1_invoicing', label: '02:00 1st — Monthly invoice run' }] },
          { key: 'dry_run', label: 'Dry run?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes — simulate only, no side effects' }, { value: 'no', label: 'No — execute for real' }] },
        ],
      },
    ],
    submitLabel: 'Run job',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/admin/cron/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'admin-doc-template',
    title: 'Create document template',
    subtitle: 'Platform — legal document template library',
    steps: [
      {
        title: 'Template identity',
        fields: [
          { key: 'template_name', label: 'Template name', type: 'text', required: true, placeholder: 'e.g. Standard REIPPPP PPA v4' },
          { key: 'template_type', label: 'Template type', type: 'select', required: true, options: [{ value: 'ppa', label: 'PPA' }, { value: 'isda', label: 'ISDA' }, { value: 'service_agreement', label: 'Service agreement' }, { value: 'epc_contract', label: 'EPC contract' }, { value: 'gca', label: 'GCA' }, { value: 'om_agreement', label: 'O&M agreement' }, { value: 'wheeling_agreement', label: 'Wheeling agreement' }, { value: 'loan_agreement', label: 'Loan agreement' }, { value: 'carbon_erpa', label: 'Carbon ERPA' }] },
          { key: 'jurisdiction', label: 'Jurisdiction', type: 'select', required: true, options: [{ value: 'south_africa', label: 'South Africa' }, { value: 'namibia', label: 'Namibia' }, { value: 'botswana', label: 'Botswana' }, { value: 'zambia', label: 'Zambia' }] },
        ],
      },
      {
        title: 'Content',
        fields: [
          { key: 'template_ref', label: 'Document storage reference', type: 'text', required: true, placeholder: 'R2 key or document management reference' },
          { key: 'version', label: 'Version', type: 'text', required: true, placeholder: 'e.g. v4.1' },
          { key: 'effective_from', label: 'Effective from', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'Create template',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/documents/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'admin-role-action',
    title: 'Manage role action queue',
    subtitle: 'Admin — create a cross-role action for a participant',
    steps: [
      {
        title: 'Action',
        fields: [
          { key: 'target_role', label: 'Target role', type: 'select', required: true, options: [{ value: 'ipp_developer', label: 'IPP developer' }, { value: 'offtaker', label: 'Offtaker' }, { value: 'lender', label: 'Lender' }, { value: 'trader', label: 'Trader' }, { value: 'carbon_fund', label: 'Carbon fund' }, { value: 'grid_operator', label: 'Grid operator' }, { value: 'regulator', label: 'Regulator' }, { value: 'support', label: 'Support' }] },
          { key: 'title', label: 'Action title', type: 'text', required: true, placeholder: 'e.g. Review covenant breach — facility XYZ' },
          { key: 'priority', label: 'Priority', type: 'select', required: true, options: [{ value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }] },
        ],
      },
      {
        title: 'Details',
        fields: [
          { key: 'source_event', label: 'Source event', type: 'text', placeholder: 'e.g. covenant_breach_cycle_2' },
          { key: 'sla_due_at', label: 'SLA due at', type: 'date' },
          { key: 'cross_option_json', label: 'Cross options (JSON)', type: 'textarea', placeholder: '{"href": "/lender/covenants/123", "label": "View covenant"}' },
        ],
      },
    ],
    submitLabel: 'Create action',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/role-actions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
];

const ADMIN_TOUR: TourDef = {
  id: 'admin-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Platform admin workstation', body: 'Full platform administration — tenant onboarding, KYC, feature flags, billing, user management, system health, and audit exports.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Platform KPIs', body: 'Active tenants, pending KYC reviews, system health, and invoice collection rates. Platform health is your responsibility.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Admin tabs', body: 'Tenants, KYC, users, billing, features, connectors, and platform audit — each backed by live workflows with full audit trail.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Onboard a new tenant, complete a KYC review, or configure a feature flag with guided step-by-step workflows.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'See all admin actions including settlement configuration, rate-limit management, and regulatory export pack generation.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'KYC escalations, billing disputes, and system alerts from all roles surface here for your action.', placement: 'left' },
  ],
};

export function AdminWorkstationPage() {
  return (
    <WorkstationShell
      role="admin"
      wizards={ADMIN_WIZARDS}
      tour={ADMIN_TOUR}
      eyebrow="Admin · Workstation"
      title="Platform admin workstation"
      subtitle="Tenant lifecycle · Billing runs · Feature-flag overrides. Audit trail for every platform-level change."
      backHref="/admin-platform"
      backLabel="Admin platform"
      tabs={[
        { key: 'tenant_events', label: 'Tenant lifecycle', body: ({ onRefresh }) => <TenantTab onRefresh={onRefresh} /> },
        { key: 'billing', label: 'Billing runs', body: ({ onRefresh }) => <BillingTab onRefresh={onRefresh} /> },
        { key: 'flags', label: 'Flag overrides', body: ({ onRefresh }) => <FlagsTab onRefresh={onRefresh} /> },
        { key: 'settlement_audit', label: 'Settlement audit',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/settlement"
              reconHint="bank_ref,value_date,amount_zar,narrative"
              reconSourceOptions={['bank', 'absa', 'standard_bank', 'fnb', 'nedbank']}
              onChange={onRefresh}
            />
          ),
        },
        { key: 'platform_audit', label: 'Platform audit',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/admin-platform"
              reconHint="billing_run_id,tenant_id,amount_zar,period_end"
              reconSourceOptions={['billing_processor', 'stripe', 'paystack', 'manual']}
              onChange={onRefresh}
            />
          ),
        },
        { key: 'pii_access', label: 'PII access log',
          body: () => <PiiAccessTab />,
        },
        { key: 'audit-chain', label: 'Audit chain (W118)',
          chainKey: 'audit_chain_block',
          body: () => <AuditChainBlockTab />,
        },
        { key: 'regulator-exports', label: 'Regulator exports (W119)',
          chainKey: 'regulator_export_pack',
          body: () => <RegulatorExportPackTab />,
        },
        { key: 'reconciliation-attestation', label: 'Reconciliation attestation (W120)',
          chainKey: 'audit_recon_runs',
          body: () => <ReconciliationAttestationTab />,
        },
        { key: 'control-environment-audit', label: 'Control environment (W121)',
          chainKey: 'control_environment_audit',
          body: () => <ControlEnvironmentAuditTab />,
        },
        { key: 'strate-swift-connectors', label: 'Settlement rails (W124)',
          body: () => <StrateSwiftConnectorTab />,
        },
        { key: 'sap-oracle-erp-connectors', label: 'ERP connectors (W125)',
          body: () => <SapOracleErpConnectorTab />,
        },
        { key: 'government-filing-connectors', label: 'Filing connectors (W126)',
          body: () => <GovernmentFilingConnectorTab />,
        },
        { key: 'anomaly-detection-ml', label: 'Anomaly ML (W127)',
          body: () => <AnomalyDetectionMlTab />,
        },
        { key: 'rul-prediction-ml', label: 'RUL Prediction ML (W128)',
          body: () => <RulPredictionMlTab />,
        },
        { key: 'fault-fingerprint-ml', label: 'Fault Fingerprint ML (W129)',
          body: () => <FaultFingerprintMlTab />,
        },
        { key: 'kyc-verifications', label: 'KYC / FICA (W198)',
          chainKey: 'kyc_verification',
          body: ({ onRefresh }) => <KycVerificationsTab onRefresh={onRefresh} />,
        },
        { key: 'cascade-dlq', label: 'Cascade DLQ',
          body: () => <CascadeDlqTab />,
        },
        { key: 'subscription-billing', label: 'Subscription billing (W228)',
          body: () => <SubscriptionBillingTab />,
        },
        { key: 'data-subject-requests', label: 'POPIA data subject requests (W233)',
          body: ({ onRefresh }) => <DataSubjectRequestTab onRefresh={onRefresh} />,
        },
        { key: 'reports', label: 'Reports & Exports',
          body: () => (
            <div className="space-y-8">
              {ADMIN_REPORTS.map(cfg => (
                <div key={cfg.endpoint} className="space-y-2">
                  <p className="text-xs font-semibold text-[#4a5568] uppercase tracking-wide">{cfg.title}</p>
                  <ReportPanel config={cfg} />
                </div>
              ))}
            </div>
          ),
        },
      ]}
    />
  );
}

function TenantTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log tenant event" />
      <ListingTable
        endpoint="/admin-platform/tenant-events"
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin-platform/tenants/${r.tenant_id}`}
        empty={{ title: 'No tenant events yet', description: 'Provisioned / activated / KYC / suspended / offboarded / data-erased events for every tenant will appear here.' }}
        columns={[
          { key: 'tenant_id', label: 'Tenant', render: (r) => <span className="font-mono text-[11px]">{(r.tenant_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'activated' || r.event_type === 'reactivated' || r.event_type === 'kyc_approved' ? 'good' : r.event_type === 'suspended' || r.event_type === 'offboarded' || r.event_type === 'kyc_rejected' || r.event_type === 'data_erased' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 12)}…</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason || ''}>{r.reason || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log tenant lifecycle event"
          submitLabel="Log"
          fields={[
            { key: 'tenant_id', label: 'Tenant', required: true, type: 'lookup', lookupEndpoint: '/api/lookup/tenants', lookupAutoFill: { name: 'tenant_name' } },
            { key: 'event_type', label: 'Event', type: 'select', required: true, options: [
              { value: 'provisioned', label: 'Provisioned' },
              { value: 'activated', label: 'Activated' },
              { value: 'plan_changed', label: 'Plan changed' },
              { value: 'kyc_approved', label: 'KYC approved' },
              { value: 'kyc_rejected', label: 'KYC rejected' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'reactivated', label: 'Reactivated' },
              { value: 'offboarded', label: 'Offboarded' },
              { value: 'data_exported', label: 'Data exported' },
              { value: 'data_erased', label: 'Data erased' },
            ] },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/tenant-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function BillingTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Run billing" />
      <ListingTable
        endpoint="/admin-platform/billing-runs"
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin-platform/billing-runs/${r.id}`}
        empty={{ title: 'No billing runs', description: 'Monthly / adhoc / correction billing runs will appear here with outcome and total invoiced.' }}
        columns={[
          { key: 'run_type', label: 'Type', render: (r) => <Pill tone="info">{r.run_type}</Pill> },
          { key: 'period_start', label: 'Period', render: (r) => `${r.period_start} → ${r.period_end}` },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'completed' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'}>{r.status.replace(/_/g, ' ')}</Pill> },
          { key: 'tenants_billed', label: 'Tenants', align: 'right' },
          { key: 'total_zar', label: 'Total', align: 'right', render: (r) => formatZAR(r.total_zar) },
          { key: 'completed_at', label: 'Completed', render: (r) => r.completed_at ? new Date(r.completed_at).toLocaleString() : '—' },
        ]}
      />
      {filing && (
        <ActionModal
          title="Schedule billing run"
          submitLabel="Schedule"
          fields={[
            { key: 'run_type', label: 'Run type', type: 'select', required: true, options: [
              { value: 'monthly', label: 'Monthly' },
              { value: 'adhoc', label: 'Ad hoc' },
              { value: 'correction', label: 'Correction' },
            ] },
            { key: 'period_start', label: 'Period start', type: 'date', required: true },
            { key: 'period_end', label: 'Period end', type: 'date', required: true },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/billing-runs', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function FlagsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Override flag" />
      <ListingTable
        endpoint="/admin-platform/flag-overrides"
        rowKey={(r) => r.id}
        empty={{ title: 'No flag overrides', description: 'Every feature-flag override (global / tenant / user) is audit-logged here.' }}
        columns={[
          { key: 'flag_key', label: 'Flag', render: (r) => <span className="font-mono text-[11px]">{r.flag_key}</span> },
          { key: 'scope_type', label: 'Scope', render: (r) => <Pill tone="info">{r.scope_type}</Pill> },
          { key: 'previous_value', label: 'Was', render: (r) => r.previous_value || '—' },
          { key: 'new_value', label: 'Now' },
          { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason || ''}>{r.reason || '—'}</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
        ]}
      />
      {filing && (
        <ActionModal
          title="Override feature flag"
          submitLabel="Override"
          fields={[
            { key: 'flag_key', label: 'Flag key', required: true, placeholder: 'e.g. trade.allow_advanced_modifiers' },
            { key: 'scope_type', label: 'Scope', type: 'select', required: true, options: [
              { value: 'global', label: 'Global' },
              { value: 'tenant', label: 'Tenant' },
              { value: 'user', label: 'User' },
            ] },
            { key: 'scope_id', label: 'Scope ID (if tenant/user)' },
            { key: 'previous_value', label: 'Previous value' },
            { key: 'new_value', label: 'New value', required: true },
            { key: 'reason', label: 'Reason', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/admin-platform/flag-overrides', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function PiiAccessTab() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#dde4ec] bg-white p-4 text-[12px] text-[#3d4756]">
        Every cross-tenant read of personal information is logged here under
        POPIA s.18 (accountability) + s.19 (security safeguards). Each entry
        is also chained on the <span className="font-mono">admin</span> audit
        chain via the cascade hook, so this view is tamper-evident — a
        regulator can verify any row against the chain head.
      </div>
      <ListingTable
        endpoint="/popia/pii-access"
        rowKey={(r) => r.id}
        empty={{ title: 'No PII access logged', description: 'Cross-tenant data access by admins / support / regulators will appear here as it happens.' }}
        columns={[
          { key: 'created_at', label: 'When', render: (r) => new Date(r.created_at).toLocaleString() },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 16)}…</span> },
          { key: 'access_type', label: 'Type', render: (r) => <Pill tone={r.access_type === 'impersonation' ? 'bad' : 'info'}>{(r.access_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'subject_id', label: 'Subject', render: (r) => <span className="font-mono text-[11px]">{(r.subject_id || '').slice(0, 16)}…</span> },
          { key: 'justification', label: 'Justification', render: (r) => <span className="block truncate max-w-md" title={r.justification || ''}>{r.justification || '—'}</span> },
        ]}
      />
    </div>
  );
}

const RISK_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  standard: 'good', medium: 'info', high_risk: 'warn', pep: 'bad',
};
const KYC_STATUS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  verified: 'good', rejected: 'bad', lapsed: 'bad', suspended: 'warn',
  compliance_review: 'info', enhanced_due_diligence: 'warn',
};

const KYC_ACTIONS = [
  { value: 'submit_documents', label: 'Submit documents' },
  { value: 'request_more_documents', label: 'Request more documents' },
  { value: 'confirm_documents_received', label: 'Confirm documents received' },
  { value: 'run_screening', label: 'Run screening' },
  { value: 'trigger_edd', label: 'Trigger EDD' },
  { value: 'complete_edd', label: 'Complete EDD' },
  { value: 'start_review', label: 'Start review' },
  { value: 'approve_conditionally', label: 'Approve conditionally' },
  { value: 'lift_conditions', label: 'Lift conditions' },
  { value: 'verify', label: 'Verify' },
  { value: 'reject', label: 'Reject' },
  { value: 'suspend', label: 'Suspend' },
  { value: 'reinstate', label: 'Reinstate' },
  { value: 'mark_lapsed', label: 'Mark lapsed' },
];

function KycVerificationsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [actionRow, setActionRow] = useState<Record<string, unknown> | null>(null);

  const createFields: FieldSpec[] = [
    { key: 'participant_id', label: 'Participant', required: true, type: 'lookup', lookupEndpoint: '/api/lookup/participants', lookupAutoFill: { name: 'participant_name', email: 'participant_email' } },
    { key: 'entity_type', label: 'Entity type', type: 'select', options: [
      { value: 'company', label: 'Company' },
      { value: 'individual', label: 'Individual' },
      { value: 'trust', label: 'Trust' },
      { value: 'fund', label: 'Fund' },
      { value: 'foreign_entity', label: 'Foreign entity' },
    ]},
    { key: 'risk_level', label: 'Risk level', type: 'select', options: [
      { value: 'standard', label: 'Standard (5d SLA)' },
      { value: 'medium', label: 'Medium (10d SLA)' },
      { value: 'high_risk', label: 'High risk (20d SLA)' },
      { value: 'pep', label: 'PEP (30d SLA)' },
    ]},
  ];

  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Create KYC record" />
      {filing && (
        <ActionModal
          title="Open KYC verification"
          fields={createFields}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/kyc-verifications', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {actionRow && (
        <ActionModal
          title={`KYC action on ${String(actionRow.id || '').slice(0, 20)}…`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: KYC_ACTIONS },
            { key: 'reason', label: 'Reason / note', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setActionRow(null)}
          onSubmit={async (v) => {
            await api.post(`/kyc-verifications/${String(actionRow.id)}/action`, v);
            setActionRow(null); onRefresh();
          }}
        />
      )}
      <ListingTable
        endpoint="/kyc-verifications"
        rowKey={(r) => r.id}
        columns={[
          { key: 'id', label: 'ID', render: (r) => <span className="font-mono text-[11px]">{String(r.id || '').slice(0, 16)}…</span> },
          { key: 'participant_id', label: 'Participant', render: (r) => <span className="font-mono text-[11px]">{String(r.participant_id || '').slice(0, 16)}…</span> },
          { key: 'entity_type', label: 'Type', render: (r) => <Pill tone="info">{String(r.entity_type || '')}</Pill> },
          { key: 'risk_level', label: 'Risk', render: (r) => <Pill tone={RISK_TONE[String(r.risk_level)] ?? 'info'}>{String(r.risk_level || '')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={KYC_STATUS_TONE[String(r.chain_status)] ?? 'info'}>{String(r.chain_status || '').replace(/_/g, ' ')}</Pill> },
          { key: 'sla_deadline', label: 'SLA', render: (r) => r.sla_deadline ? String(r.sla_deadline) : '—' },
          { key: 'sla_breached', label: 'Breach', render: (r) => r.sla_breached ? <Pill tone="bad">BREACH</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'actions', label: '', render: (r) => (
            <button type="button" onClick={() => setActionRow(r)} className="text-[11px] text-[#1a3a5c] underline">Action</button>
          )},
        ]}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Cascade DLQ — the #1 admin AI card ("N items stuck in DLQ") lands here. The
// read view came from monitoring.ts; the retry/resolve endpoints are admin-
// gated on the admin router. Every cascade stage that fails 3× lands a row
// here, so this surface is where an operator drains the failed-automation
// backlog: REPLAY a stage (retry) or mark it handled out-of-band (resolve).
// Inline row actions — no modal hop. Resolve expands a one-row inline form
// (resolved/abandoned + optional note) right under the row it acts on.
// ───────────────────────────────────────────────────────────────────────────

type DlqRow = {
  id: string;
  event: string;
  entity_type: string;
  entity_id: string;
  stage: string;
  error_message: string;
  attempt_count: number;
  created_at: string;
  last_attempt_at: string;
};

const STAGE_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  audit: 'bad', commercial: 'warn', analytics: 'info',
  registry: 'info', notifications: 'info', webhooks: 'warn', special: 'warn',
};

function CascadeDlqTab() {
  const [rows, setRows] = useState<DlqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Per-row transient state: the id currently mid-request, the last replay
  // result, and the id whose inline resolve form is expanded.
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'abandoned' | 'resolved'>('abandoned');
  const [resolveNote, setResolveNote] = useState('');

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/admin/monitoring/cascade-dlq?status=pending&limit=200');
      setRows((res.data?.data as DlqRow[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function retry(id: string) {
    setBusy(id);
    setResult((m) => { const n = { ...m }; delete n[id]; return n; });
    try {
      const res = await api.post(`/admin/cascade-dlq/${id}/retry`);
      const ok = !!res.data?.ok;
      if (ok) {
        // Resolved server-side — drop it from the pending list immediately.
        setRows((rs) => rs.filter((r) => r.id !== id));
      } else {
        setResult((m) => ({ ...m, [id]: res.data?.error || 'Replay failed — left pending' }));
        await load();
      }
    } catch (e: unknown) {
      setResult((m) => ({ ...m, [id]: e instanceof Error ? e.message : 'Retry request failed' }));
    } finally {
      setBusy(null);
    }
  }

  function openResolve(id: string) {
    setResolving(id);
    setResolveStatus('abandoned');
    setResolveNote('');
  }

  async function submitResolve(id: string) {
    setBusy(id);
    try {
      await api.post(`/admin/cascade-dlq/${id}/resolve`, {
        status: resolveStatus,
        note: resolveNote.trim() || undefined,
      });
      setResolving(null);
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (e: unknown) {
      setResult((m) => ({ ...m, [id]: e instanceof Error ? e.message : 'Resolve request failed' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] leading-relaxed text-[#3d4756] max-w-2xl">
          Cascade stages that fail three retries dead-letter here. <strong>Retry</strong> replays
          the failed stage (audit / notifications / webhooks / registry / analytics / commercial);
          on success the row clears. <strong>Resolve</strong> marks a row handled out-of-band —
          choose <em>abandoned</em> (won't replay) or <em>resolved</em>, with an optional note for
          the audit trail. Both actions are admin-audited.
        </p>
        <button type="button"
          onClick={() => void load()}
          className="shrink-0 h-8 px-3 rounded-md border border-[#dde4ec] bg-white text-[12px] font-medium text-[#3d4756] hover:bg-[#f8fafc]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-6 text-[12px] text-[#6b7685]">Loading DLQ…</div>
      ) : err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] text-red-700">{err}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#dde4ec] bg-[#f8fafc] p-6 text-center">
          <div className="text-[13px] font-semibold text-[#0f1c2e]">DLQ is clear</div>
          <div className="text-[12px] text-[#6b7685] mt-1">No failed cascade stages pending. Nothing to drain.</div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto text-[#0f1c2e]">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Entity</th>
                <th className="px-4 py-2">Error</th>
                <th className="px-4 py-2 text-right">Attempts</th>
                <th className="px-4 py-2">First seen</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowBusy = busy === r.id;
                const isResolving = resolving === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-[#e5ebf2] align-top">
                      <td className="px-4 py-2 font-mono text-[11px]">{r.event}</td>
                      <td className="px-4 py-2"><Pill tone={STAGE_TONE[r.stage] ?? 'info'}>{r.stage}</Pill></td>
                      <td className="px-4 py-2 text-[11px] text-[#3d4756]">
                        {r.entity_type}<span className="text-[#9aa6b4]"> · </span>
                        <span className="font-mono">{(r.entity_id || '').slice(0, 14)}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="block truncate max-w-[260px] text-[11px] text-[#b4453a]" title={r.error_message}>
                          {r.error_message || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[12px]">{r.attempt_count}</td>
                      <td className="px-4 py-2 text-[11px] text-[#6b7685] whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                          <button type="button"
                            onClick={() => void retry(r.id)}
                            disabled={rowBusy}
                            className="text-[11px] font-semibold text-[#1a3a5c] hover:underline disabled:opacity-40"
                          >
                            {rowBusy && !isResolving ? 'Retrying…' : 'Retry'}
                          </button>
                          <button type="button"
                            onClick={() => (isResolving ? setResolving(null) : openResolve(r.id))}
                            disabled={rowBusy}
                            className="text-[11px] font-medium text-[#6b7685] hover:text-[#3d4756] hover:underline disabled:opacity-40"
                          >
                            {isResolving ? 'Cancel' : 'Resolve'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {result[r.id] && !isResolving && (
                      <tr className="border-t border-[#e5ebf2] bg-[#fdf6f5]">
                        <td colSpan={7} className="px-4 py-2 text-[11px] text-[#b4453a]">{result[r.id]}</td>
                      </tr>
                    )}
                    {isResolving && (
                      <tr className="border-t border-[#e5ebf2] bg-[#f8fafc]">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-[11px] uppercase tracking-wide text-[#6b7685]">Mark</span>
                            <div className="inline-flex rounded-md border border-[#dde4ec] overflow-hidden">
                              {(['abandoned', 'resolved'] as const).map((s) => (
                                <button type="button"
                                  key={s}
                                  onClick={() => setResolveStatus(s)}
                                  className={`px-3 h-8 text-[11px] font-medium ${resolveStatus === s ? 'bg-[#c2873a] text-white' : 'bg-white text-[#3d4756] hover:bg-[#eef2f7]'}`}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                            <input
                              value={resolveNote}
                              onChange={(e) => setResolveNote(e.target.value)}
                              placeholder="Optional note for the audit trail"
                              className="flex-1 min-w-[200px] h-8 px-2 rounded-md border border-[#dde4ec] bg-white text-[12px] text-[#0f1c2e] placeholder:text-[#9aa6b4]"
                            />
                            <button type="button"
                              onClick={() => void submitResolve(r.id)}
                              disabled={rowBusy}
                              className="h-8 px-3 rounded-md bg-[#c2873a] text-white text-[11px] font-semibold disabled:opacity-40"
                            >
                              {rowBusy ? 'Saving…' : 'Confirm'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── W228 Platform Subscription Billing oversight ─────────────────────────────
type SubInvoice = {
  id: string;
  participant_id: string;
  billing_period: string;
  subscription_tier: 'starter' | 'professional' | 'enterprise';
  net_payable_zar: number;
  chain_status: string;
  hours_until_sla: number | null;
  sla_breached: boolean | number;
  is_terminal: boolean;
  created_at: string;
};
type SubStats = {
  total: number;
  paid: number;
  overdue: number;
  suspended: number;
  arr_at_risk: number;
};

// Mirror of INVOICE_VALID_TRANSITIONS in src/utils/subscription-billing-spec.ts.
// Kept inline so the SPA does not import backend spec; keep in sync with W228.
const SUB_TRANSITIONS: Record<string, string[]> = {
  draft:           ['issue', 'cancel'],
  issued:          ['acknowledge', 'cancel'],
  payment_pending: ['record_payment', 'mark_overdue', 'waive', 'cancel'],
  paid:            [],
  overdue:         ['record_payment', 'send_dunning_1', 'waive', 'write_off'],
  dunning_1:       ['record_payment', 'send_dunning_2', 'waive', 'write_off'],
  dunning_2:       ['record_payment', 'suspend_account', 'waive', 'write_off'],
  suspended:       ['reactivate', 'write_off'],
  cancelled:       [],
  waived:          [],
  written_off:     [],
};
const SUB_ACTION_LABELS: Record<string, string> = {
  issue: 'Issue',
  acknowledge: 'Acknowledge',
  record_payment: 'Record payment',
  mark_overdue: 'Mark overdue',
  send_dunning_1: 'Send dunning 1',
  send_dunning_2: 'Send dunning 2',
  suspend_account: 'Suspend',
  reactivate: 'Reactivate',
  waive: 'Waive',
  write_off: 'Write off',
  cancel: 'Cancel',
};

function zar(n: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n || 0);
}
function subStatusTone(status: string): 'good' | 'bad' | 'info' | 'neutral' {
  if (status === 'paid') return 'good';
  if (['suspended', 'written_off', 'overdue', 'dunning_1', 'dunning_2'].includes(status)) return 'bad';
  if (['cancelled', 'waived'].includes(status)) return 'neutral';
  return 'info';
}

function SubscriptionBillingTab() {
  const [rows, setRows] = useState<SubInvoice[]>([]);
  const [stats, setStats] = useState<SubStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/subscription/billing?per_page=200');
      setRows((res.data?.data?.invoices as SubInvoice[]) || []);
      setStats((res.data?.data?.stats as SubStats) || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const act = React.useCallback(async (id: string, action: string) => {
    setBusy(id);
    setRowErr((m) => { const n = { ...m }; delete n[id]; return n; });
    try {
      await api.post(`/subscription/billing/${id}/action`, { action });
      await load();
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.error || (e instanceof Error ? e.message : 'action failed');
      setRowErr((m) => ({ ...m, [id]: msg }));
    } finally {
      setBusy(null);
    }
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] leading-relaxed text-[#3d4756] max-w-2xl">
          Monthly SaaS invoices run as a W228 chain: draft to issued to payment_pending to paid,
          with a cron dunning ladder (overdue, dunning_1, dunning_2, suspended). Admin exits are
          waive, write off, cancel and reactivate. Actions below are limited to those valid from
          each row's current state.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button"
            onClick={() => setGenerating(true)}
            className="h-8 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold hover:bg-[#a3702f]"
          >
            Generate invoice
          </button>
          <button type="button"
            onClick={() => void load()}
            className="h-8 px-3 rounded-md border border-[#dde4ec] bg-white text-[12px] font-medium text-[#3d4756] hover:bg-[#f8fafc]"
          >
            Refresh
          </button>
        </div>
      </div>

      {stats && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12px] text-[#3d4756]">
          <span><span className="text-[#6b7685]">Total</span> <span className="tabular-nums font-medium text-[#0f1c2e]">{stats.total}</span></span>
          <span><span className="text-[#6b7685]">Overdue</span> <span className="tabular-nums font-medium text-[#b4453a]">{stats.overdue}</span></span>
          <span><span className="text-[#6b7685]">Suspended</span> <span className="tabular-nums font-medium text-[#b4453a]">{stats.suspended}</span></span>
          <span><span className="text-[#6b7685]">ARR at risk</span> <span className="tabular-nums font-medium text-[#0f1c2e]">{zar(stats.arr_at_risk)}</span></span>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#dde4ec] bg-white p-6 text-[12px] text-[#6b7685]">Loading invoices…</div>
      ) : err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[12px] text-red-700">{err}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#dde4ec] bg-[#f8fafc] p-6 text-center">
          <div className="text-[13px] font-semibold text-[#0f1c2e]">No invoices yet</div>
          <div className="text-[12px] text-[#6b7685] mt-1">Generate a monthly subscription invoice to start the billing chain.</div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto text-[#0f1c2e]">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr>
                <th className="px-4 py-2">Participant</th>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2 text-right">Net payable</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">SLA</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowBusy = busy === r.id;
                const breached = r.sla_breached === true || r.sla_breached === 1;
                const actions = SUB_TRANSITIONS[r.chain_status] ?? [];
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-[#e5ebf2] align-top">
                      <td className="px-4 py-2 font-mono text-[11px]" title={r.participant_id}>{(r.participant_id || '').slice(0, 14)}</td>
                      <td className="px-4 py-2 text-[12px] tabular-nums">{r.billing_period}</td>
                      <td className="px-4 py-2"><Pill tone="info">{r.subscription_tier}</Pill></td>
                      <td className="px-4 py-2 text-right tabular-nums text-[12px]">{zar(r.net_payable_zar)}</td>
                      <td className="px-4 py-2"><Pill tone={subStatusTone(r.chain_status)}>{r.chain_status.replace(/_/g, ' ')}</Pill></td>
                      <td className="px-4 py-2 text-[11px] whitespace-nowrap">
                        {breached ? (
                          <span className="text-[#b4453a] font-medium">Breached</span>
                        ) : r.hours_until_sla != null ? (
                          <span className={r.hours_until_sla < 24 ? 'text-[#b4453a]' : 'text-[#6b7685]'}>{r.hours_until_sla}h left</span>
                        ) : (
                          <span className="text-[#9aa6b4]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[11px] text-[#6b7685] whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 whitespace-nowrap">
                          {actions.length === 0 ? (
                            <span className="text-[11px] text-[#9aa6b4]">Terminal</span>
                          ) : (
                            actions.map((a) => (
                              <button type="button"
                                key={a}
                                onClick={() => void act(r.id, a)}
                                disabled={rowBusy}
                                className={`text-[11px] font-medium hover:underline disabled:opacity-40 ${a === 'write_off' || a === 'suspend_account' || a === 'cancel' ? 'text-[#b4453a]' : 'text-[#1a3a5c]'}`}
                              >
                                {SUB_ACTION_LABELS[a] ?? a}
                              </button>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                    {rowErr[r.id] && (
                      <tr className="border-t border-[#e5ebf2] bg-[#fdf6f5]">
                        <td colSpan={8} className="px-4 py-2 text-[11px] text-[#b4453a]">{rowErr[r.id]}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {generating && (
        <ActionModal
          title="Generate subscription invoice"
          submitLabel="Generate"
          fields={[
            { key: 'participant_id', label: 'Participant', required: true, type: 'lookup', lookupEndpoint: '/api/lookup/participants', lookupAutoFill: { name: 'participant_name', email: 'participant_email' } },
            { key: 'billing_period', label: 'Billing period (YYYY-MM)', required: true },
            { key: 'subscription_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'starter', label: 'Starter' },
              { value: 'professional', label: 'Professional' },
              { value: 'enterprise', label: 'Enterprise' },
            ] },
          ] as FieldSpec[]}
          onClose={() => setGenerating(false)}
          onSubmit={async (v) => {
            try {
              await api.post('/subscription/billing/generate', v);
            } catch (e: unknown) {
              // Surface the server's reason (e.g. 409 "Invoice already exists
              // for 2026-06") instead of the generic axios status message.
              throw new Error((e as any)?.response?.data?.error || 'Failed to generate invoice');
            }
            setGenerating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ── W233: POPIA Data Subject Request Tab ─────────────────────────────────────

type DsrRow = {
  id: string;
  requester_name: string;
  requester_email: string;
  request_type: string;
  chain_status: string;
  sla_days: number;
  sla_deadline: string | null;
  ir_notified: number;
  response_ref: string | null;
  created_at: string;
};

type DsrStats = {
  total: number;
  open: number;
  fulfilled: number;
  refused: number;
  overdue: number;
};

const DSR_TRANSITIONS: Record<string, string[]> = {
  received: ['acknowledge', 'withdraw'],
  acknowledged: ['verify_identity', 'withdraw'],
  identity_verified: ['map_data', 'withdraw'],
  data_mapped: ['commence_legal_assessment'],
  legal_assessment: ['draft_response'],
  response_drafted: ['fulfill', 'partially_disclose', 'refuse', 'complete_erasure', 'uphold_objection'],
  fulfilled: [],
  partial_disclosure: [],
  refused: [],
  erasure_completed: [],
  objection_upheld: [],
  withdrawn: [],
};

const DSR_ACTION_LABELS: Record<string, string> = {
  acknowledge: 'Acknowledge receipt',
  verify_identity: 'Verify identity',
  map_data: 'Map data holdings',
  commence_legal_assessment: 'Commence legal assessment',
  draft_response: 'Draft response',
  fulfill: 'Fulfill — provide data',
  partially_disclose: 'Partially disclose',
  refuse: 'Refuse (with grounds)',
  complete_erasure: 'Complete erasure',
  uphold_objection: 'Uphold objection',
  withdraw: 'Withdraw',
};

const DSR_DESTRUCTIVE = new Set(['refuse', 'withdraw', 'partially_disclose']);

function dsrStatusTone(s: string): 'good' | 'bad' | 'warn' | 'info' | 'neutral' {
  if (s === 'fulfilled' || s === 'erasure_completed' || s === 'objection_upheld') return 'good';
  if (s === 'refused') return 'bad';
  if (s === 'partial_disclosure') return 'warn';
  if (s === 'withdrawn') return 'neutral';
  return 'info';
}

function DataSubjectRequestTab({ onRefresh }: { onRefresh?: () => void }) {
  const [data, setData] = React.useState<{ requests: DsrRow[]; stats: DsrStats } | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const [actionTarget, setActionTarget] = React.useState<DsrRow | null>(null);

  const bump = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/admin/dsr', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then((j: { data: { requests: DsrRow[]; stats: DsrStats } }) => setData(j.data))
      .catch(() => null);
  }, [refreshKey]);

  if (!data) return <div className="p-6 text-[13px] text-[var(--oe-outline)]">Loading…</div>;

  const { requests, stats } = data;

  const statCards = [
    { label: 'Total', value: stats.total },
    { label: 'Open', value: stats.open },
    { label: 'Fulfilled', value: stats.fulfilled },
    { label: 'Refused', value: stats.refused },
    { label: 'Overdue', value: stats.overdue },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        {statCards.map(s => (
          <div key={s.label} className="flex-1 min-w-[100px] rounded-xl border border-[var(--oe-surface-container)] bg-[var(--oe-surface-container-lowest)] px-4 py-3">
            <div className="text-[11px] text-[var(--oe-outline)] uppercase tracking-wide">{s.label}</div>
            <div className={`text-[22px] font-semibold ${s.label === 'Overdue' && s.value > 0 ? 'text-red-600' : 'text-[var(--oe-on-surface)]'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-lg bg-[var(--oe-primary)] text-white text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]"
        >
          + Log DSR
        </button>
      </div>

      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--oe-surface-container)]">
            {['Ref', 'Requester', 'Type', 'Status', 'SLA deadline', 'IR notified', ''].map(h => (
              <th key={h} className="text-left py-2 px-2 text-[var(--oe-outline)] font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requests.map(row => {
            const overdue = row.sla_deadline && row.sla_deadline < new Date().toISOString() && !['fulfilled','partial_disclosure','refused','erasure_completed','objection_upheld','withdrawn'].includes(row.chain_status);
            return (
              <tr key={row.id} className="border-b border-[var(--oe-surface-container-low)] hover:bg-[var(--oe-surface-container-lowest)]">
                <td className="py-2 px-2 font-mono text-[10px] text-[var(--oe-outline)]">{row.response_ref ?? row.id.slice(0, 8)}</td>
                <td className="py-2 px-2 text-[var(--oe-on-surface)]">
                  <div className="font-medium">{row.requester_name}</div>
                  <div className="text-[var(--oe-outline)] text-[10px]">{row.requester_email}</div>
                </td>
                <td className="py-2 px-2"><Pill tone="info">{row.request_type}</Pill></td>
                <td className="py-2 px-2"><Pill tone={dsrStatusTone(row.chain_status)}>{row.chain_status.replace(/_/g, ' ')}</Pill></td>
                <td className="py-2 px-2">
                  {row.sla_deadline
                    ? <span className={overdue ? 'text-red-600 font-medium' : 'text-[var(--oe-on-surface-variant)]'}>{new Date(row.sla_deadline).toLocaleDateString()}</span>
                    : <span className="text-[var(--oe-outline)]">—</span>}
                </td>
                <td className="py-2 px-2">{row.ir_notified ? <Pill tone="warn">Yes</Pill> : <span className="text-[var(--oe-outline)]">—</span>}</td>
                <td className="py-2 px-2">
                  {(DSR_TRANSITIONS[row.chain_status] ?? []).length > 0 && (
                    <button
                      onClick={() => setActionTarget(row)}
                      className="text-[var(--oe-primary)] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oe-primary)] rounded"
                    >
                      Action
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {requests.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center text-[var(--oe-outline)]">No data subject requests</td></tr>
          )}
        </tbody>
      </table>

      {creating && (
        <ActionModal
          title="Log Data Subject Request (POPIA)"
          fields={[
            { key: 'requester_name', label: 'Requester name', required: true },
            { key: 'requester_email', label: 'Requester email', required: true },
            { key: 'requester_id_number', label: 'SA ID / passport number' },
            { key: 'relationship', label: 'Relationship to data', type: 'select', required: true,
              options: [{ value: 'data_subject', label: 'Data subject' }, { value: 'authorised_representative', label: 'Authorised representative' }, { value: 'guardian', label: 'Guardian' }] },
            { key: 'request_type', label: 'Request type', type: 'select', required: true,
              options: ['access','correction','deletion','objection','portability','restriction'].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })) },
            { key: 'data_categories', label: 'Data categories (comma-separated)' },
          ]}
          submitLabel="Log request"
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            const cats = (v.data_categories as string)?.split(',').map((s: string) => s.trim()).filter(Boolean);
            const res = await fetch('/api/admin/dsr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, data_categories: cats?.length ? cats : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setCreating(false); bump();
          }}
        />
      )}

      {actionTarget && (
        <ActionModal
          title={`Action — ${actionTarget.requester_name} (${actionTarget.request_type})`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true,
              options: (DSR_TRANSITIONS[actionTarget.chain_status] ?? []).map(a => ({ value: a, label: DSR_ACTION_LABELS[a] ?? a })) },
            { key: 'legal_ground_for_refusal', label: 'Legal ground for refusal (POPIA §11)' },
            { key: 'reason_detail', label: 'Notes', type: 'textarea' },
          ]}
          submitLabel="Submit"
          cta={DSR_DESTRUCTIVE.has(actionTarget.chain_status) ? 'danger' : 'primary'}
          onClose={() => setActionTarget(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/admin/dsr/${actionTarget.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify(v),
            });
            if (!res.ok) throw new Error(await res.text());
            setActionTarget(null); bump();
          }}
        />
      )}
    </div>
  );
}
