import React, { useState } from 'react';
import { api } from '../../lib/api';
import { WorkstationShell, ListingTable, Pill, ActionModal } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { CovenantCertificateTab } from '../lender/CovenantCertificateTab';
import { CreditOriginationChainTab } from '../lender/CreditOriginationChainTab';
import { DrawdownChainTab } from '../lender/DrawdownChainTab';
import { DscrMonitoringChainTab } from '../lender/DscrMonitoringChainTab';
import { DunningTab } from '../lender/DunningTab';
import { LoanDefaultChainTab } from '../lender/LoanDefaultChainTab';
import { LoanRestructureChainTab } from '../lender/LoanRestructureChainTab';
import { LoanTransferChainTab } from '../lender/LoanTransferChainTab';
import { ReserveAccountChainTab } from '../lender/ReserveAccountChainTab';
import { SecurityPerfectionChainTab } from '../lender/SecurityPerfectionChainTab';
import { SllKpiChainTab } from '../lender/SllKpiChainTab';
import { StrateSwiftConnectorTab } from '../strateSwiftConnector/StrateSwiftConnectorTab';
import { SapOracleErpConnectorTab } from '../sapOracleErpConnector/SapOracleErpConnectorTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
import StageGateTab from '../stageGate/StageGateTab';
import { LenderEsapTab } from '../lender/LenderEsapTab';
import { LenderFacilityAmendmentTab } from '../lender/LenderFacilityAmendmentTab';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { WizardSpec } from '../launch/WizardModal';
import type { TourDef } from '../launch/ProductTour';

const LENDER_REPORTS: ReportConfig[] = [
  {
    title: 'Covenant Certificates',
    endpoint: '/api/lender/covenant-certs',
    columns: [
      { key: 'cert_ref', label: 'Reference' },
      { key: 'borrower_id', label: 'Borrower' },
      { key: 'reporting_period', label: 'Period' },
      { key: 'chain_status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Lender Covenant Certificates Report',
  },
  {
    title: 'DSCR Monitoring',
    endpoint: '/api/lender/dscr-monitoring',
    columns: [
      { key: 'facility_ref', label: 'Facility' },
      { key: 'reporting_period', label: 'Period' },
      { key: 'dscr_ratio', label: 'DSCR', numeric: true },
      { key: 'dscr_covenant', label: 'Covenant', numeric: true },
      { key: 'breach_status', label: 'Breach' },
    ],
    pivotGroupBy: 'breach_status',
    mailSubject: 'CEC — DSCR Monitoring Report',
  },
  {
    title: 'Drawdown Records',
    endpoint: '/api/lender/drawdowns',
    columns: [
      { key: 'drawdown_ref', label: 'Reference' },
      { key: 'facility_ref', label: 'Facility' },
      { key: 'amount_zar', label: 'Amount ZAR', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'disbursed_at', label: 'Disbursed' },
    ],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Lender Drawdown Report',
  },
  {
    title: 'EP IV ESAP Monitoring',
    endpoint: '/api/lender/esap-monitoring',
    columns: [
      { key: 'esap_ref', label: 'Reference' },
      { key: 'ep_category', label: 'EP Category' },
      { key: 'ps_standard', label: 'PS Standard' },
      { key: 'chain_status', label: 'Status' },
      { key: 'review_due', label: 'Due' },
    ],
    pivotGroupBy: 'ep_category',
    mailSubject: 'CEC — EP IV ESAP Report',
  },
];

const LENDER_WIZARDS: WizardSpec[] = [
  {
    id: 'lender-complete-setup',
    title: 'Set up your lender workstation',
    subtitle: 'Configure credit origination, monitoring, default management, and all Equator Principles workflows',
    steps: [
      {
        title: 'Credit portfolio',
        description: 'Configure Facility register, Credit origination (NCA/Basel III), CP clearances, Drawdown management, and Loan transfer workflows.',
        aiHint: 'Credit origination (Wave W53) is the upstream gate — every facility starts here before drawdowns can be approved. CP clearance (Wave W223) blocks drawdown until all conditions precedent are cleared. For SARB large-exposure reporting (> R2bn), the system files automatically at activation.',
        fields: [
          { key: 'lending_types', label: 'Types of facilities you offer', type: 'select', options: [{ value: 'project_finance', label: 'Project finance (non-recourse)' }, { value: 'corporate', label: 'Corporate lending' }, { value: 'both', label: 'Both' }] },
          { key: 'sarb_reporting_required', label: 'SARB large-exposure reporting?', type: 'select', options: [{ value: 'yes', label: 'Yes — registered SARB reporting bank' }, { value: 'no', label: 'No — below threshold' }] },
          { key: 'max_single_exposure_zar', label: 'Single-borrower concentration limit (ZAR)', type: 'number', placeholder: 'e.g. 2000000000' },
        ],
      },
      {
        title: 'Covenant monitoring',
        description: 'Set up Covenant certificates, DSCR monitoring, SLL KPIs, Construction cost reports, ESAP monitoring, and Security perfection workflows.',
        aiHint: 'DSCR monitoring (Wave W12/W212) compares reported DSCR against the covenant minimum — breach triggers the dunning cycle automatically. ESAP monitoring (Wave W214) is mandatory for Equator Principles Category A projects. Security perfection (Wave W69) ensures your bonds are registered in the Deeds Registry and STRATE before drawdown.',
        fields: [
          { key: 'default_min_dscr', label: 'Default minimum DSCR covenant', type: 'number', placeholder: 'e.g. 1.20' },
          { key: 'ep_categories', label: 'Equator Principles categories you lend to', type: 'select', options: [{ value: 'abc', label: 'A, B, and C' }, { value: 'bc', label: 'B and C only' }, { value: 'c', label: 'C only (minimal impact)' }] },
          { key: 'covenant_review_frequency', label: 'Covenant reporting frequency', type: 'select', options: [{ value: 'quarterly', label: 'Quarterly' }, { value: 'semi_annual', label: 'Semi-annual' }, { value: 'annual', label: 'Annual' }] },
        ],
      },
      {
        title: 'Default & enforcement',
        description: 'Configure Dunning cycles, Loan default & step-in, and Loan restructure workflows.',
        aiHint: 'The dunning cycle runs: Cycle 1 (cure period) → Cycle 2 (standstill) → Cycle 3 (escalation to NERSA/SARB regulator inbox). Cycle-3 escalation is automatic when the cure deadline passes without resolution. Step-in rights (Wave W45) allow you to take over project operation during a default — ensure your facility agreements reference the IP address of the NERSA notification API.',
        fields: [
          { key: 'cure_period_days', label: 'Default cure period (days)', type: 'number', placeholder: 'e.g. 30 — set per your LMA facility template' },
          { key: 'step_in_rights_enabled', label: 'Step-in rights in your facilities?', type: 'select', options: [{ value: 'yes', label: 'Yes — Wave W45 enforcement chain active' }, { value: 'no', label: 'No — covenant-only enforcement' }] },
          { key: 'default_contact', label: 'Default management contact (name & email)', type: 'text', placeholder: 'Special situations team contact' },
        ],
      },
    ],
    submitLabel: 'Save lender setup',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: 'lender', ...values }) }).catch(() => {});
    },
  },
  {
    id: 'lender-credit-facility',
    title: 'Originate a credit facility',
    subtitle: 'NCA / Basel III / SARB — new loan application',
    steps: [
      {
        title: 'Borrower',
        description: 'Identify the borrower and the project being financed.',
        aiHint: 'Credit facility origination triggers SARB large-exposure reporting at > R2bn. The system will flag this automatically based on the facility amount you enter.',
        fields: [
          { key: 'borrower_name', label: 'Borrower (IPP entity)', type: 'text', required: true, placeholder: 'e.g. Saldanha Wind Energy (Pty) Ltd' },
          { key: 'project_name', label: 'Project name', type: 'text', required: true, placeholder: 'e.g. Saldanha Wind Farm Phase 2' },
          { key: 'facility_type', label: 'Facility type', type: 'select', required: true, options: [{ value: 'project_finance', label: 'Project finance (non-recourse)' }, { value: 'corporate', label: 'Corporate lending' }, { value: 'revolving', label: 'Revolving credit facility' }, { value: 'bridge', label: 'Bridge / construction finance' }] },
        ],
      },
      {
        title: 'Financial terms',
        description: 'Key financial parameters.',
        aiHint: 'DSCR covenant monitoring starts automatically once you set the min_dscr. The chain will flag breach if the IPP reports below this threshold.',
        fields: [
          { key: 'facility_amount_zar', label: 'Facility amount (ZAR)', type: 'number', required: true, placeholder: 'e.g. 1750000000' },
          { key: 'tenor_years', label: 'Tenor (years)', type: 'number', placeholder: 'e.g. 15' },
          { key: 'interest_rate_type', label: 'Interest rate type', type: 'select', options: [{ value: 'fixed', label: 'Fixed' }, { value: 'jibar_linked', label: 'JIBAR-linked floating' }, { value: 'prime_linked', label: 'Prime-linked' }] },
          { key: 'min_dscr', label: 'Minimum DSCR covenant', type: 'number', placeholder: 'e.g. 1.20' },
        ],
      },
      {
        title: 'Equator Principles',
        description: 'Classify the project under Equator Principles IV.',
        aiHint: 'EP Category A (significant adverse impact) requires an independent ESAP and regular ESAP monitoring reports (Wave W214). Category B (limited impact) requires basic monitoring.',
        fields: [
          { key: 'ep_category', label: 'EP category', type: 'select', required: true, options: [{ value: 'category_a', label: 'Category A — significant adverse impact' }, { value: 'category_b', label: 'Category B — limited impact' }, { value: 'category_c', label: 'Category C — minimal impact' }] },
          { key: 'ep_date', label: 'EP assessment date', type: 'date' },
        ],
      },
      {
        title: 'Conditions precedent',
        description: 'Key CPs that must be cleared before first drawdown.',
        aiHint: 'Each CP you list here creates a tracking record in the CP clearance workflow (W223). The drawdown is blocked until all CPs are cleared.',
        fields: [
          { key: 'cp_list', label: 'Key conditions precedent', type: 'textarea', placeholder: 'List main CPs, one per line (e.g. Signed PPA, NERSA licence, insurance confirmation)…' },
          { key: 'target_financial_close', label: 'Target financial close date', type: 'date' },
        ],
      },
    ],
    submitLabel: 'Create facility application',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/credit-facility-applications', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Facility creation failed'); }
    },
  },
  {
    id: 'lender-drawdown',
    title: 'Initiate a drawdown',
    subtitle: 'IE + CP gate — request disbursement of funds',
    steps: [
      {
        title: 'Drawdown details',
        description: 'Specify the drawdown amount and purpose.',
        aiHint: 'Drawdowns require the IE to certify completion of the relevant construction milestone. The workflow will block approval until the IE certificate is attached.',
        fields: [
          { key: 'facility_id', label: 'Facility reference', type: 'text', required: true, placeholder: 'Facility ID or reference number' },
          { key: 'drawdown_amount_zar', label: 'Drawdown amount (ZAR)', type: 'number', required: true, placeholder: 'e.g. 250000000' },
          { key: 'drawdown_purpose', label: 'Purpose', type: 'select', required: true, options: [{ value: 'construction', label: 'Construction costs' }, { value: 'equipment', label: 'Equipment procurement' }, { value: 'land', label: 'Land acquisition' }, { value: 'professional', label: 'Professional fees' }, { value: 'contingency', label: 'Contingency drawdown' }] },
        ],
      },
      {
        title: 'Certification',
        description: 'Confirm milestones met and CPs cleared for this tranche.',
        fields: [
          { key: 'ie_certificate_ref', label: 'IE certificate reference', type: 'text', required: true, placeholder: 'e.g. WSP-SA-2026-0042-DD3' },
          { key: 'cp_clearance_ref', label: 'CP clearance certificate reference', type: 'text', placeholder: 'Lender legal reference for CP clearance' },
          { key: 'requested_value_date', label: 'Requested value date', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'Submit drawdown request',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/lender/drawdown-chain', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Drawdown request failed'); }
    },
  },
  {
    id: 'lender-covenant-breach',
    title: 'Flag a covenant breach',
    subtitle: 'LMA — initiate the watchlist and dunning cycle',
    steps: [
      {
        title: 'Breach details',
        description: 'Identify the covenant that has been breached.',
        aiHint: 'Filing a covenant breach starts the dunning cycle: Cycle 1 (cure period) → Cycle 2 (standstill) → Cycle 3 (escalation to regulator). The SLA timer starts when you save this record.',
        fields: [
          { key: 'facility_id', label: 'Facility reference', type: 'text', required: true, placeholder: 'Facility ID' },
          { key: 'covenant_type', label: 'Covenant breached', type: 'select', required: true, options: [{ value: 'dscr', label: 'DSCR below minimum' }, { value: 'llcr', label: 'LLCR below minimum' }, { value: 'interest_cover', label: 'Interest cover ratio' }, { value: 'equity_commitment', label: 'Equity commitment' }, { value: 'information', label: 'Information covenant (late reporting)' }, { value: 'cross_default', label: 'Cross-default' }] },
          { key: 'breach_date', label: 'Breach identification date', type: 'date', required: true },
        ],
      },
      {
        title: 'Breach assessment',
        description: 'Quantify the breach and set the cure window.',
        fields: [
          { key: 'reported_value', label: 'Reported covenant value', type: 'number', placeholder: 'e.g. 1.08 for DSCR' },
          { key: 'minimum_required', label: 'Required covenant level', type: 'number', placeholder: 'e.g. 1.20' },
          { key: 'cure_deadline', label: 'Cure window deadline', type: 'date' },
          { key: 'breach_narrative', label: 'Breach narrative', type: 'textarea', placeholder: 'Describe the cause of the breach and borrower\'s proposed remediation plan…' },
        ],
      },
    ],
    submitLabel: 'Record covenant breach',
    cta: 'danger',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/covenant-certificate/chain', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Covenant breach recording failed'); }
    },
  },
  {
    id: 'lender-credit-facility-new',
    title: 'Originate credit facility',
    subtitle: 'Wave W53 — NCA / Basel III / SARB credit approval',
    steps: [
      {
        title: 'Facility basics',
        fields: [
          { key: 'facility_name', label: 'Facility name', type: 'text', required: true, placeholder: 'e.g. Saldanha Wind Phase 2 — Project Finance Facility' },
          { key: 'borrower_id', label: 'Borrower ID', type: 'text', required: true, placeholder: 'Tenant ID or entity reference' },
          { key: 'facility_type', label: 'Facility type', type: 'select', required: true, options: [{ value: 'project_finance', label: 'Project finance' }, { value: 'construction_loan', label: 'Construction loan' }, { value: 'revolving_credit', label: 'Revolving credit' }, { value: 'bridge_loan', label: 'Bridge loan' }] },
          { key: 'committed_amount_zar', label: 'Committed amount (ZAR)', type: 'number', required: true },
        ],
      },
      {
        title: 'Structure',
        fields: [
          { key: 'tenor_years', label: 'Tenor (years)', type: 'number', required: true, placeholder: 'e.g. 15' },
          { key: 'base_rate', label: 'Base rate', type: 'select', required: true, options: [{ value: 'prime', label: 'Prime' }, { value: 'jibar_3m', label: 'JIBAR 3M' }, { value: 'jibar_6m', label: 'JIBAR 6M' }] },
          { key: 'margin_bps', label: 'Margin (bps)', type: 'number', required: true, placeholder: 'e.g. 250' },
          { key: 'security_type', label: 'Security type', type: 'select', required: true, options: [{ value: 'mortgage', label: 'Mortgage' }, { value: 'cession_of_contract_rights', label: 'Cession of contract rights' }, { value: 'pledge_of_shares', label: 'Pledge of shares' }, { value: 'combination', label: 'Combination' }] },
        ],
      },
    ],
    submitLabel: 'Create facility',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/lender/credit-facilities', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'lender-drawdown-new',
    title: 'Process drawdown request',
    subtitle: 'Wave W21 — IE + CP gate disbursement',
    steps: [
      {
        title: 'Drawdown details',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'drawdown_amount_zar', label: 'Drawdown amount (ZAR)', type: 'number', required: true },
          { key: 'purpose', label: 'Purpose', type: 'select', required: true, options: [{ value: 'construction_costs', label: 'Construction costs' }, { value: 'equipment_purchase', label: 'Equipment purchase' }, { value: 'working_capital', label: 'Working capital' }, { value: 'refinancing', label: 'Refinancing' }] },
        ],
      },
      {
        title: 'Conditions precedent',
        fields: [
          { key: 'all_cps_met', label: 'All CPs met?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes — all conditions cleared' }, { value: 'no_waiver_required', label: 'No — waiver required' }] },
          { key: 'ie_certificate_attached', label: 'IE certificate attached?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No — pending' }] },
          { key: 'drawdown_date', label: 'Requested drawdown date', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'Submit drawdown',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/lender/drawdown-chain', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'lender-esap',
    title: 'File EP IV ESAP item',
    subtitle: 'Equator Principles IV — environmental & social action plan',
    steps: [
      {
        title: 'PS standard',
        fields: [
          { key: 'ps_standard', label: 'Performance standard', type: 'select', required: true, options: [{ value: 'ps1_assessment', label: 'PS1 — Assessment & management' }, { value: 'ps2_labour', label: 'PS2 — Labour & working conditions' }, { value: 'ps3_resource_efficiency', label: 'PS3 — Resource efficiency' }, { value: 'ps4_community_health', label: 'PS4 — Community health & safety' }, { value: 'ps5_land_acquisition', label: 'PS5 — Land acquisition' }, { value: 'ps6_biodiversity', label: 'PS6 — Biodiversity' }, { value: 'ps7_indigenous_peoples', label: 'PS7 — Indigenous peoples' }, { value: 'ps8_cultural_heritage', label: 'PS8 — Cultural heritage' }] },
          { key: 'ep_category', label: 'EP category', type: 'select', required: true, options: [{ value: 'category_a', label: 'Category A' }, { value: 'category_b', label: 'Category B' }, { value: 'category_c', label: 'Category C' }] },
        ],
      },
      {
        title: 'Corrective action',
        fields: [
          { key: 'issue_description', label: 'Issue description', type: 'textarea', required: true, placeholder: 'Describe the environmental or social issue identified…' },
          { key: 'required_action', label: 'Required action', type: 'textarea', required: true, placeholder: 'Describe the corrective action required…' },
          { key: 'deadline', label: 'Action deadline', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'File ESAP item',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/lender/esap-monitoring', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'lender-cp-clearance',
    title: 'Record CP clearance (W223)',
    steps: [
      {
        title: 'Conditions precedent',
        description: 'Identify the borrower, facility, and CP register details.',
        aiHint: 'CP clearance (Wave W223) blocks drawdown until all conditions precedent are cleared. Tier determines the SLA window.',
        fields: [
          { key: 'borrower_name', label: 'Borrower name', type: 'text', required: true },
          { key: 'cp_tier', label: 'CP tier', type: 'select', required: true, options: [{ value: 'minor', label: 'Minor' }, { value: 'standard', label: 'Standard' }, { value: 'major', label: 'Major' }, { value: 'systemic', label: 'Systemic' }] },
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'closing_deadline', label: 'Closing deadline', type: 'date', required: true },
          { key: 'cp_count_total', label: 'Total CP count', type: 'number', required: true },
        ],
      },
      {
        title: 'Clearance',
        description: 'Record CP satisfaction, waivers, and drawdown authorisation.',
        aiHint: 'If any CPs are failed, provide a reason. Drawdown can only be authorised once all required CPs are satisfied or waived.',
        fields: [
          { key: 'cp_count_satisfied', label: 'CPs satisfied', type: 'number', required: true },
          { key: 'cp_count_waived', label: 'CPs waived', type: 'number' },
          { key: 'cp_count_failed', label: 'CPs failed', type: 'number' },
          { key: 'cp_failed_reason', label: 'CP failure reason', type: 'textarea' },
          { key: 'authorize_drawdown', label: 'Authorise drawdown?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'pending', label: 'Pending' }] },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/cp-clearances', values); },
  },
  {
    id: 'lender-covenant-cert',
    title: 'Submit covenant certificate (W38)',
    steps: [
      {
        title: 'Certificate details',
        description: 'Provide the facility reference, reporting period, and covenant test results.',
        aiHint: 'Covenant certificates must be filed per your facility agreement. A DSCR below the floor triggers the dunning cycle automatically.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'reporting_period', label: 'Reporting period', type: 'text', required: true, placeholder: 'Q1 2026' },
          { key: 'financial_covenants_met', label: 'Financial covenants met?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'waived', label: 'Waived' }] },
          { key: 'dscr_actual', label: 'DSCR (actual)', type: 'number', required: true, placeholder: 'e.g. 1.32' },
          { key: 'leverage_ratio', label: 'Leverage ratio', type: 'number' },
        ],
      },
      {
        title: 'Attestation',
        description: 'CFO attestation and auditor opinion.',
        aiHint: 'A qualified auditor opinion or covenant cure requirement will escalate to the dunning cycle.',
        fields: [
          { key: 'cfo_attestation', label: 'CFO attestation', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'auditor_name', label: 'Auditor name', type: 'text' },
          { key: 'auditor_opinion', label: 'Auditor opinion', type: 'select', options: [{ value: 'clean', label: 'Clean' }, { value: 'qualified', label: 'Qualified' }, { value: 'emphasis_of_matter', label: 'Emphasis of matter' }] },
          { key: 'covenant_cure_required', label: 'Covenant cure required?', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'cure_plan', label: 'Cure plan', type: 'textarea' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/covenant-certificate/chain', values); },
  },
  {
    id: 'lender-dscr-monitor',
    title: 'Log DSCR monitoring record (W212)',
    steps: [
      {
        title: 'Period financials',
        description: 'Enter the period revenue, costs, debt service, and computed DSCR.',
        aiHint: 'DSCR monitoring compares actual DSCR against the covenant floor. Values below the floor automatically trigger the dunning cycle.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'reporting_period', label: 'Reporting period', type: 'text', required: true },
          { key: 'dscr_tier', label: 'DSCR tier', type: 'select', required: true, options: [{ value: 'emerging', label: 'Emerging' }, { value: 'established', label: 'Established' }, { value: 'large', label: 'Large' }, { value: 'systemically_important', label: 'Systemically important' }] },
          { key: 'net_revenue_zar', label: 'Net revenue (ZAR)', type: 'number', required: true },
          { key: 'operating_costs_zar', label: 'Operating costs (ZAR)', type: 'number', required: true },
          { key: 'debt_service_zar', label: 'Debt service (ZAR)', type: 'number', required: true },
          { key: 'dscr_value', label: 'DSCR value', type: 'number', required: true },
        ],
      },
      {
        title: 'IE certification',
        description: 'Record the covenant floor, IE certification, and breach status.',
        aiHint: 'An IE certification provides independent verification of the DSCR calculation. Breach triggers automatically when the DSCR falls below the floor.',
        fields: [
          { key: 'dscr_covenant_floor', label: 'DSCR covenant floor', type: 'number', required: true, placeholder: 'e.g. 1.20' },
          { key: 'ie_name', label: 'IE name', type: 'text' },
          { key: 'ie_certification_ref', label: 'IE certification reference', type: 'text' },
          { key: 'breach_triggered', label: 'Breach triggered?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'cure_period_days', label: 'Cure period (days)', type: 'number' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/dscr-monitoring', values); },
  },
  {
    id: 'lender-slb-kpi',
    title: 'Record SLB KPI performance (W204)',
    steps: [
      {
        title: 'KPI details',
        description: 'Identify the KPI, target, and unit for the sustainability-linked loan.',
        aiHint: 'SLB KPI performance determines margin ratchet direction. Missing the target triggers a margin step-up; exceeding it can trigger a step-down.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'kpi_period', label: 'KPI period', type: 'text', required: true, placeholder: 'e.g. 2026-Q1' },
          { key: 'slb_tier', label: 'SLB tier', type: 'select', required: true, options: [{ value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }, { value: 'systemic', label: 'Systemic' }] },
          { key: 'kpi_name', label: 'KPI name', type: 'text', required: true, placeholder: 'e.g. Renewable capacity installed (MW)' },
          { key: 'kpi_target_value', label: 'KPI target value', type: 'number', required: true },
          { key: 'kpi_unit', label: 'KPI unit', type: 'text', required: true, placeholder: 'e.g. MW' },
        ],
      },
      {
        title: 'Outcome',
        description: 'Record the actual KPI value and margin ratchet outcome.',
        aiHint: 'Ratchet basis points are applied as a margin adjustment. A positive step-up means higher interest cost; a step-down rewards the borrower.',
        fields: [
          { key: 'kpi_actual_value', label: 'KPI actual value', type: 'number', required: true },
          { key: 'kpi_data_source', label: 'Data source', type: 'text' },
          { key: 'ratchet_direction', label: 'Ratchet direction', type: 'select', options: [{ value: 'margin_step_up', label: 'Margin step-up' }, { value: 'margin_step_down', label: 'Margin step-down' }, { value: 'no_ratchet', label: 'No ratchet' }] },
          { key: 'ratchet_basis_points', label: 'Ratchet (bps)', type: 'number', placeholder: '25 = 0.25% margin adjustment' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/slb-kpi', values); },
  },
  {
    id: 'lender-loan-transfer',
    title: 'Initiate loan transfer (W61)',
    steps: [
      {
        title: 'Transfer details',
        description: 'Specify the facility, transfer type, transferee, and notional amount.',
        aiHint: 'Loan transfer (Wave W61) is the secondary-market exit of the lender book. LMA standard form governs the documentation. Non-resident transferees require SARB ExCon approval.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'transfer_type', label: 'Transfer type', type: 'select', required: true, options: [{ value: 'par', label: 'Par' }, { value: 'sub_par', label: 'Sub-par' }, { value: 'distressed', label: 'Distressed' }] },
          { key: 'transferee_name', label: 'Transferee name', type: 'text', required: true },
          { key: 'notional_zar', label: 'Notional (ZAR)', type: 'number', required: true },
          { key: 'participation_pct', label: 'Participation %', type: 'number', required: true, placeholder: 'e.g. 50 for 50%' },
        ],
      },
      {
        title: 'Regulatory',
        description: 'Confirm SARB ExCon, LMA form, and FIC notification requirements.',
        aiHint: 'Non-resident transferees trigger SARB ExCon approval automatically. FIC notification is required when the transfer amount exceeds the reporting threshold.',
        fields: [
          { key: 'transferee_residency', label: 'Transferee residency', type: 'select', required: true, options: [{ value: 'sa_resident', label: 'SA resident' }, { value: 'non_resident', label: 'Non-resident' }] },
          { key: 'sarb_excont_required', label: 'SARB ExCon required?', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'lma_standard_form', label: 'LMA standard form?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'fic_notification_required', label: 'FIC notification required?', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'target_settlement_date', label: 'Target settlement date', type: 'date' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/loan-transfer/chain', values); },
  },
  {
    id: 'lender-security',
    title: 'Record security perfection (W69)',
    steps: [
      {
        title: 'Security details',
        description: 'Identify the security type, asset, and registration authority.',
        aiHint: 'Security perfection (Wave W69) ensures your bonds are registered before drawdown. An unregistered security may be unenforceable in default.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'security_type', label: 'Security type', type: 'select', required: true, options: [{ value: 'mortgage_bond', label: 'Mortgage bond' }, { value: 'notarial_bond', label: 'Notarial bond' }, { value: 'pledge', label: 'Pledge' }, { value: 'cession', label: 'Cession' }, { value: 'general_notarial_bond', label: 'General notarial bond' }] },
          { key: 'asset_description', label: 'Asset description', type: 'textarea', required: true },
          { key: 'estimated_value_zar', label: 'Estimated value (ZAR)', type: 'number', required: true },
          { key: 'registration_authority', label: 'Registration authority', type: 'select', required: true, options: [{ value: 'deeds_registry', label: 'Deeds registry' }, { value: 'fpb', label: 'FPB' }, { value: 'strate', label: 'STRATE' }, { value: 'movable_property_registry', label: 'Movable property registry' }] },
        ],
      },
      {
        title: 'Perfection status',
        description: 'Record registration details and step-in rights confirmation.',
        aiHint: 'A high lapse risk means the security may need re-registration. Step-in rights should be confirmed in the facility agreement.',
        fields: [
          { key: 'registration_number', label: 'Registration number', type: 'text' },
          { key: 'registration_date', label: 'Registration date', type: 'date' },
          { key: 'lapsed_risk', label: 'Lapse risk', type: 'select', required: true, options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] },
          { key: 'step_in_rights_confirmed', label: 'Step-in rights confirmed?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'security_agent', label: 'Security agent', type: 'text' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/security-perfection/chain', values); },
  },
  {
    id: 'lender-restructure',
    title: 'Initiate loan restructure (W45)',
    steps: [
      {
        title: 'Restructure basis',
        description: 'Identify the restructure type, trigger event, and current outstanding balance.',
        aiHint: 'Loan restructure (Wave W45) picks up where acceleration ends. Debt-for-equity and partial write-down require SARB impairment notification.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'restructure_type', label: 'Restructure type', type: 'select', required: true, options: [{ value: 'maturity_extension', label: 'Maturity extension' }, { value: 'rate_reset', label: 'Rate reset' }, { value: 'covenant_waiver', label: 'Covenant waiver' }, { value: 'debt_for_equity', label: 'Debt-for-equity' }, { value: 'partial_write_down', label: 'Partial write-down' }] },
          { key: 'trigger_event', label: 'Trigger event', type: 'select', options: [{ value: 'financial_distress', label: 'Financial distress' }, { value: 'market_disruption', label: 'Market disruption' }, { value: 'force_majeure', label: 'Force majeure' }, { value: 'regulatory_change', label: 'Regulatory change' }] },
          { key: 'current_outstanding_zar', label: 'Current outstanding (ZAR)', type: 'number', required: true },
        ],
      },
      {
        title: 'New terms',
        description: 'Specify the revised maturity, margin, DSCR floor, and equity requirements.',
        aiHint: 'Interest capitalisation and haircut must be approved by the credit committee. Consent solicitation is required when multiple lenders are involved.',
        fields: [
          { key: 'new_maturity_date', label: 'New maturity date', type: 'date' },
          { key: 'new_margin_bps', label: 'New margin (bps)', type: 'number' },
          { key: 'new_dscr_floor', label: 'New DSCR floor', type: 'number' },
          { key: 'interest_capitalised_zar', label: 'Interest capitalised (ZAR)', type: 'number' },
          { key: 'haircut_pct', label: 'Haircut %', type: 'number', placeholder: 'Debt reduction as % — 0 if none' },
          { key: 'consent_solicitation_required', label: 'Consent solicitation required?', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/lender/loan-restructure/chain', values); },
  },
  {
    id: 'lender-esap-monitor',
    title: 'Log EP IV ESAP finding (W214)',
    steps: [
      {
        title: 'ESAP details',
        description: 'Identify the ESAP tier, performance standard, site, and monitoring cycle.',
        aiHint: 'ESAP monitoring (Wave W214) is mandatory for Equator Principles Category A and B projects. Critical PS covers PS6 biodiversity and PS7 indigenous peoples.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'esap_tier', label: 'ESAP tier', type: 'select', required: true, options: [{ value: 'category_a', label: 'Category A' }, { value: 'category_b', label: 'Category B' }, { value: 'category_c', label: 'Category C' }, { value: 'critical_ps', label: 'Critical PS' }] },
          { key: 'ps_standard', label: 'PS standard', type: 'select', required: true, options: [{ value: 'ps1_assessment', label: 'PS1 — Assessment' }, { value: 'ps2_labour', label: 'PS2 — Labour' }, { value: 'ps3_community', label: 'PS3 — Community' }, { value: 'ps4_biodiversity', label: 'PS4 — Biodiversity' }, { value: 'ps5_land', label: 'PS5 — Land' }, { value: 'ps6_ecosystem', label: 'PS6 — Ecosystem' }, { value: 'ps7_indigenous', label: 'PS7 — Indigenous' }, { value: 'ps8_heritage', label: 'PS8 — Heritage' }] },
          { key: 'site_name', label: 'Site name', type: 'text', required: true },
          { key: 'monitoring_cycle', label: 'Monitoring cycle', type: 'text', required: true, placeholder: 'e.g. Semi-annual 2026' },
        ],
      },
      {
        title: 'Findings',
        description: 'Record auditor details, finding counts, and CAP information.',
        aiHint: 'Major findings must have a corrective action plan (CAP) with a due date. TPA verification is required for Category A closures.',
        fields: [
          { key: 'auditor_name', label: 'Auditor name', type: 'text', required: true },
          { key: 'visit_scheduled_date', label: 'Visit scheduled date', type: 'date' },
          { key: 'finding_count_major', label: 'Major findings', type: 'number', required: true },
          { key: 'finding_count_minor', label: 'Minor findings', type: 'number' },
          { key: 'cap_reference', label: 'CAP reference', type: 'text' },
          { key: 'cap_due_date', label: 'CAP due date', type: 'date' },
          { key: 'tpa_outcome', label: 'TPA outcome', type: 'select', options: [{ value: 'satisfactory', label: 'Satisfactory' }, { value: 'minor_gaps', label: 'Minor gaps' }, { value: 'major_gaps', label: 'Major gaps' }, { value: 'non_compliant', label: 'Non-compliant' }] },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/esap-monitoring', values); },
  },
  {
    id: 'lender-capital-adequacy',
    title: 'Submit capital adequacy report (W203)',
    steps: [
      {
        title: 'Report details',
        description: 'Enter the reporting period, bank tier, and capital ratios.',
        aiHint: 'Basel III capital adequacy reports are filed with SARB via BA 900. Domestic systemically important banks have the longest SLA window.',
        fields: [
          { key: 'report_period', label: 'Report period', type: 'text', required: true, placeholder: 'Q1 2026' },
          { key: 'bank_tier', label: 'Bank tier', type: 'select', required: true, options: [{ value: 'domestic_systemically_important', label: 'Domestic systemically important' }, { value: 'large', label: 'Large' }, { value: 'medium', label: 'Medium' }, { value: 'small', label: 'Small' }] },
          { key: 'cet1_ratio', label: 'CET1 ratio (%)', type: 'number', required: true, placeholder: 'e.g. 13.5' },
          { key: 'total_capital_ratio', label: 'Total capital ratio (%)', type: 'number', required: true },
          { key: 'rwa_total', label: 'RWA total (ZAR millions)', type: 'number', required: true, placeholder: 'ZAR millions' },
        ],
      },
      {
        title: 'SARB submission',
        description: 'Record SARB submission references and RWA breakdown.',
        aiHint: 'The BA 900 form reference is assigned by SARB on receipt. Credit, market, and operational RWA should sum to the total RWA above.',
        fields: [
          { key: 'sarb_submission_ref', label: 'SARB submission reference', type: 'text' },
          { key: 'ba900_form_ref', label: 'BA 900 form reference', type: 'text' },
          { key: 'credit_risk_rwa', label: 'Credit risk RWA', type: 'number' },
          { key: 'market_risk_rwa', label: 'Market risk RWA', type: 'number' },
          { key: 'operational_risk_rwa', label: 'Operational risk RWA', type: 'number' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/capital-adequacy', values); },
  },
  {
    id: 'lender-reserve-account',
    title: 'Record reserve account transaction',
    steps: [
      {
        title: 'Transaction',
        description: 'Record a deposit, withdrawal, or other movement in a project reserve account.',
        aiHint: 'DSRA (Debt Service Reserve Account) transactions are audited. Drawdown releases require lender approval before value date.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'account_type', label: 'Account type', type: 'select', required: true, options: [{ value: 'dsra', label: 'DSRA' }, { value: 'opex_reserve', label: 'Opex reserve' }, { value: 'major_maintenance_reserve', label: 'Major maintenance reserve' }, { value: 'distribution_lock_up', label: 'Distribution lock-up' }] },
          { key: 'transaction_type', label: 'Transaction type', type: 'select', options: [{ value: 'deposit', label: 'Deposit' }, { value: 'withdrawal', label: 'Withdrawal' }, { value: 'interest_earned', label: 'Interest earned' }, { value: 'drawdown_release', label: 'Drawdown release' }] },
          { key: 'amount_zar', label: 'Amount (ZAR)', type: 'number', required: true },
          { key: 'value_date', label: 'Value date', type: 'date', required: true },
          { key: 'balance_after_zar', label: 'Balance after (ZAR)', type: 'number' },
          { key: 'trigger_event', label: 'Trigger event', type: 'textarea', placeholder: 'What triggered this transaction?' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/reserve-accounts', values); },
  },
  {
    id: 'lender-facility-amendment',
    title: 'Record facility amendment',
    steps: [
      {
        title: 'Amendment details',
        description: 'Identify the facility and the type of amendment being made.',
        aiHint: 'Facility amendments require lender consent and a legal opinion. Limit increases may trigger SARB large-exposure re-assessment.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'amendment_type', label: 'Amendment type', type: 'select', required: true, options: [{ value: 'maturity_extension', label: 'Maturity extension' }, { value: 'limit_increase', label: 'Limit increase' }, { value: 'covenant_waiver', label: 'Covenant waiver' }, { value: 'fee_amendment', label: 'Fee amendment' }, { value: 'security_amendment', label: 'Security amendment' }] },
          { key: 'effective_date', label: 'Effective date', type: 'date', required: true },
          { key: 'borrower_request_ref', label: 'Borrower request reference', type: 'text' },
        ],
      },
      {
        title: 'New terms',
        description: 'Record the revised limit, maturity, and consent details.',
        aiHint: 'Legal opinion is required for security amendments. Lender consent must be obtained before the effective date.',
        fields: [
          { key: 'new_limit_zar', label: 'New limit (ZAR)', type: 'number', placeholder: 'Only if limit changes' },
          { key: 'new_maturity_date', label: 'New maturity date', type: 'date', placeholder: 'Only if maturity changes' },
          { key: 'lender_consent_obtained', label: 'Lender consent obtained?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'legal_opinion_ref', label: 'Legal opinion reference', type: 'text' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/facility-amendments', values); },
  },
  {
    id: 'lender-construction-cost',
    title: 'Submit construction cost report',
    steps: [
      {
        title: 'Period',
        description: 'Enter the project reference, report month, and budget figures.',
        aiHint: 'Construction cost reports are filed monthly during the build period. The IE must certify the physical completion percentage.',
        fields: [
          { key: 'project_ref', label: 'Project reference', type: 'text', required: true },
          { key: 'report_month', label: 'Report month', type: 'text', required: true, placeholder: 'e.g. 2026-05' },
          { key: 'total_project_budget_zar', label: 'Total project budget (ZAR)', type: 'number', required: true },
          { key: 'actual_spend_to_date_zar', label: 'Actual spend to date (ZAR)', type: 'number', required: true },
        ],
      },
      {
        title: 'Variance',
        description: 'Record cost-to-complete, completion percentage, and overrun details.',
        aiHint: 'A positive overrun triggers equity injection analysis. The IE certification reference validates the physical completion percentage.',
        fields: [
          { key: 'cost_to_complete_estimate_zar', label: 'Cost to complete (ZAR)', type: 'number', required: true },
          { key: 'physical_completion_percentage', label: 'Physical completion (%)', type: 'number', required: true, placeholder: '0-100' },
          { key: 'overrun_zar', label: 'Overrun (ZAR)', type: 'number', placeholder: 'Positive = overrun, negative = saving' },
          { key: 'equity_injection_required_zar', label: 'Equity injection required (ZAR)', type: 'number', placeholder: '0 if none' },
          { key: 'ie_name', label: 'IE name', type: 'text', required: true },
          { key: 'ie_certification_ref', label: 'IE certification reference', type: 'text' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/construction-cost-reports', values); },
  },
  {
    id: 'lender-esap-compliance',
    title: 'Submit ESAP compliance update',
    steps: [
      {
        title: 'Compliance status',
        description: 'Record the EP category, compliance period, and overall compliance level.',
        aiHint: 'Partial or non-compliant status triggers automatic escalation to the lenders committee. Full compliance closes the ESAP monitoring cycle.',
        fields: [
          { key: 'facility_ref', label: 'Facility reference', type: 'text', required: true },
          { key: 'ep_category', label: 'EP category', type: 'select', required: true, options: [{ value: 'category_a', label: 'Category A' }, { value: 'category_b', label: 'Category B' }, { value: 'category_c', label: 'Category C' }] },
          { key: 'compliance_period', label: 'Compliance period', type: 'text', required: true },
          { key: 'overall_compliance', label: 'Overall compliance', type: 'select', required: true, options: [{ value: 'full', label: 'Full' }, { value: 'substantial', label: 'Substantial' }, { value: 'partial', label: 'Partial' }, { value: 'non_compliant', label: 'Non-compliant' }] },
        ],
      },
      {
        title: 'Issues',
        description: 'Document outstanding actions, critical issues, and TPA verification requirements.',
        aiHint: 'TPA verification is required before a Category A compliance period can be closed as satisfactory.',
        fields: [
          { key: 'outstanding_actions_count', label: 'Outstanding actions', type: 'number', required: true },
          { key: 'critical_issues', label: 'Critical issues', type: 'textarea' },
          { key: 'remediation_timeline', label: 'Remediation timeline', type: 'text' },
          { key: 'tpa_verification_required', label: 'TPA verification required?', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'tpa_firm', label: 'TPA firm', type: 'text' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/esap-compliance', values); },
  },
  {
    id: 'lender-default',
    title: 'Enforce loan default',
    subtitle: 'Wave W45 — LMA event-of-default enforcement / step-in',
    steps: [
      {
        title: 'Event of default',
        fields: [
          { key: 'eod_type', label: 'Event of default type', type: 'select', required: true, options: [{ value: 'payment_default', label: 'Payment default' }, { value: 'covenant_default', label: 'Covenant default' }, { value: 'cross_default', label: 'Cross-default' }, { value: 'insolvency', label: 'Insolvency' }, { value: 'misrepresentation', label: 'Misrepresentation' }] },
          { key: 'eod_date', label: 'Event of default date', type: 'date', required: true },
          { key: 'acceleration_notice_sent', label: 'Acceleration notice sent?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No — pending' }] },
        ],
      },
      {
        title: 'Enforcement strategy',
        fields: [
          { key: 'enforcement_strategy', label: 'Enforcement strategy', type: 'select', required: true, options: [{ value: 'step_in_rights', label: 'Step-in rights' }, { value: 'receiver_appointment', label: 'Receiver appointment' }, { value: 'security_enforcement', label: 'Security enforcement' }, { value: 'restructure_negotiation', label: 'Restructure negotiation' }] },
          { key: 'enforcement_counsel', label: 'Enforcement counsel', type: 'text', required: true, placeholder: 'Law firm name and lead partner' },
        ],
      },
    ],
    submitLabel: 'Initiate enforcement',
    cta: 'danger',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/loan-default/chain', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
];

const LENDER_TOUR: TourDef = {
  id: 'lender-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Lender workstation', body: 'Manage your entire renewable energy loan book from here — facility origination, drawdowns, covenant monitoring, and ESAP compliance through to enforcement.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Portfolio KPIs', body: 'Facilities at risk, active covenant breaches, upcoming CP deadlines, and DSCR alerts. Red numbers require action today.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Loan lifecycle tabs', body: 'From credit origination through drawdown, covenant monitoring, and default management — each workflow is a live state machine with full audit trail.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Use wizards to originate a new credit facility, request a drawdown, or flag a covenant breach — all with AI hints at each step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'Browse all lender actions including ESAP monitoring, security perfection, loan transfer, and EP IV compliance.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'IPP drawdown requests, ESAP status updates, and SARB large-exposure notifications land here for action.', placement: 'left' },
  ],
};

export function LenderWorkstationPage() {
  const kpis = useWorkstationKpis('lender');
  const facilitiesPanel = useWorkstationPanel('Active facilities', '/funder/facilities', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">{r.facility_type || r.product_type || 'facility'}</span>,
    text: <span>{r.facility_name || r.borrower_name || r.project_name || r.id} · {r.facility_amount_zar != null ? Number(r.facility_amount_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{(r.lifecycle_stage || r.status || '').replace(/_/g, ' ')}</span>,
  }), 'No active facilities.');
  const panels = [facilitiesPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="lender"
      eyebrow="Lender · Workstation"
      title="Lender workstation"
      subtitle="Origination · Drawdown · Covenants · Cure · Default. The full project-finance lifecycle a lender runs every day."
      backHref="/lender-suite"
      backLabel="Lender suite"
      kpis={kpis}
      panels={panels}
      wizards={LENDER_WIZARDS}
      tour={LENDER_TOUR}
      tabs={[
        { key: 'facilities', label: 'Facilities', group: 'Origination', body: () => <FacilitiesTab /> },
        { key: 'credit_origination', label: 'Credit origination', group: 'Origination', chainKey: 'credit_facility_application', body: () => <CreditOriginationChainTab /> },
        { key: 'cp_clearances', label: 'CP clearance (W223)', group: 'Origination', chainKey: 'cp_clearance', body: ({ onRefresh }) => <CpClearanceTab onRefresh={onRefresh} /> },
        { key: 'drawdown', label: 'Drawdowns / UoP', group: 'Monitoring', chainKey: 'drawdown', body: () => <DrawdownChainTab /> },
        { key: 'covenant_cert', label: 'Covenant certificates', group: 'Monitoring', chainKey: 'covenant_certificate', body: () => <CovenantCertificateTab /> },
        { key: 'dscr_monitoring', label: 'DSCR monitoring', group: 'Monitoring', chainKey: 'dscr_monitoring', body: () => <DscrMonitoringChainTab /> },
        { key: 'sll_kpi', label: 'SLL KPI & margin ratchet', group: 'Monitoring', chainKey: 'slb_kpi_ratchet', body: () => <SllKpiChainTab /> },
        { key: 'construction_cost_report', label: 'IE cost-to-complete (W231)', group: 'Monitoring', chainKey: 'construction_cost_report', body: ({ onRefresh }) => <ConstructionCostReportTab onRefresh={onRefresh} /> },
        { key: 'loan_transfer', label: 'Loan transfer / secondary', group: 'Portfolio', chainKey: 'loan_transfer', body: () => <LoanTransferChainTab /> },
        { key: 'reserve_account', label: 'Reserve accounts (DSRA/MRA)', group: 'Portfolio', chainKey: 'reserve_account', body: () => <ReserveAccountChainTab /> },
        { key: 'security_perfection', label: 'Security perfection', group: 'Portfolio', chainKey: 'security_perfection', body: () => <SecurityPerfectionChainTab /> },
        { key: 'loan_restructure', label: 'Loan restructure & A&E', group: 'Portfolio', chainKey: 'loan_restructure', body: () => <LoanRestructureChainTab /> },
        { key: 'loan_default', label: 'Default & enforcement', group: 'Enforcement', chainKey: 'loan_default', body: () => <LoanDefaultChainTab /> },
        { key: 'dunning', label: 'Dunning queue', group: 'Enforcement', body: () => <DunningTab /> },
        { key: 'esap_compliance', label: 'ESAP Compliance (W195)', group: 'Risk', chainKey: 'esap_compliance', body: () => <LenderEsapTab /> },
        { key: 'facility_amendments', label: 'Facility Amendments', group: 'Risk', chainKey: 'facility_amendment', body: () => <LenderFacilityAmendmentTab /> },
        { key: 'capital_adequacy', label: 'Capital adequacy (W203)', group: 'Risk', chainKey: 'capital_adequacy_report', body: ({ onRefresh }) => <CapitalAdequacyTab onRefresh={onRefresh} /> },
        { key: 'esap_monitoring_chain', label: 'EP IV ESAP monitoring (W214)', group: 'Risk', chainKey: 'esap_monitoring', body: ({ onRefresh }) => <EsapMonitoringTab onRefresh={onRefresh} /> },
        { key: 'strate-swift-connectors', label: 'Settlement rails', group: 'Reporting', body: () => <StrateSwiftConnectorTab /> },
        { key: 'sap-oracle-erp-connectors', label: 'ERP connectors', group: 'Reporting', body: () => <SapOracleErpConnectorTab /> },
        { key: 'government-filing-connectors', label: 'Filing connectors', group: 'Reporting', body: () => <GovernmentFilingConnectorTab /> },
        { key: 'stage-gates', label: 'Stage gates', group: 'Reporting', body: () => <StageGateTab readOnly /> },
        { key: 'reports', label: 'Reports & Exports', group: 'Reporting',
          body: () => (
            <div className="space-y-8">
              {LENDER_REPORTS.map(cfg => (
                <div key={cfg.endpoint} className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cfg.title}</p>
                  <ReportPanel config={cfg} />
                </div>
              ))}
            </div>
          ),
        },
        { key: 'audit', label: 'Audit & compliance', group: 'Reporting',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/lender"
              reconHint="facility_id,covenant_test,measured_value,status"
              reconSourceOptions={['sarb', 'jse_srl', 'lender_ie']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function FacilitiesTab() {
  return (
    <ListingTable
      endpoint="/funder/facilities"
      rowKey={(r) => r.id}
      empty={{ title: 'No facilities', description: 'No active lender facilities yet. Originate one from the credit-origination tab.' }}
      columns={[
        { key: 'facility_name', label: 'Facility', render: (r) => r.facility_name || r.borrower_name || r.id },
        { key: 'facility_type', label: 'Type', render: (r) => <Pill tone="info">{(r.facility_type || r.product_type || 'unknown').replace(/_/g, ' ')}</Pill> },
        { key: 'facility_amount_zar', label: 'Amount', align: 'right', render: (r) => r.facility_amount_zar != null ? Number(r.facility_amount_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
        { key: 'tenor_months', label: 'Tenor', align: 'right', render: (r) => r.tenor_months != null ? `${r.tenor_months}m` : '—' },
        { key: 'lifecycle_stage', label: 'Stage', render: (r) => <Pill tone={r.lifecycle_stage === 'operational' ? 'good' : r.lifecycle_stage === 'in_default' ? 'bad' : 'neutral'}>{(r.lifecycle_stage || r.status || 'unknown').replace(/_/g, ' ')}</Pill> },
        { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—' },
      ]}
    />
  );
}

// ─── W203: Basel III Capital Adequacy ─────────────────────────────────────────
type CapModalMode = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function CapitalAdequacyTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<CapModalMode>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  const statusTone = (s: string) => {
    if (s === 'accepted') return 'good' as const;
    if (['capital_breach', 'withdrawn'].includes(s)) return 'bad' as const;
    if (['remediation_required', 'remediation', 'queries_raised'].includes(s)) return 'warn' as const;
    return 'neutral' as const;
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button"
          className="px-3 py-1.5 rounded bg-[oklch(0.46_0.16_55)] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New report
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/capital-adequacy-reports"
        rowKey={(r) => r.id}
        empty={{ title: 'No capital adequacy reports', description: 'Create a SARB BA 900 Basel III capital adequacy report.' }}
        columns={[
          { key: 'report_period', label: 'Period', render: (r) => r.report_period },
          { key: 'bank_tier', label: 'Tier', render: (r) => <Pill tone="info">{String(r.bank_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'cet1_ratio', label: 'CET1%', align: 'right', render: (r) => r.cet1_ratio != null ? `${Number(r.cet1_ratio).toFixed(2)}%` : '—' },
          { key: 'total_capital_ratio', label: 'Total Cap%', align: 'right', render: (r) => r.total_capital_ratio != null ? `${Number(r.total_capital_ratio).toFixed(2)}%` : '—' },
          { key: 'rwa_total', label: 'RWA (ZAR)', align: 'right', render: (r) => r.rwa_total != null ? Number(r.rwa_total).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">On track</Pill> },
          { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New capital adequacy report"
          submitLabel="Create"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/capital-adequacy-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                bank_tier: v.bank_tier,
                report_period: v.report_period,
                reporting_date: v.reporting_date,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'report_period', label: 'Report period (e.g. 2026-Q2)', required: true, placeholder: '2026-Q2' },
            { key: 'reporting_date', label: 'Quarter end date', type: 'date', required: true },
            {
              key: 'bank_tier', label: 'Bank tier', type: 'select', required: true, defaultValue: 'mid_tier',
              options: [
                { value: 'smaller', label: 'Smaller (≤30d SLA)' },
                { value: 'mid_tier', label: 'Mid-tier (45d SLA)' },
                { value: 'large', label: 'Large (60d SLA)' },
                { value: 'systemically_important', label: 'Systemically important (90d SLA)' },
              ],
            },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Advance report — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/capital-adequacy-reports/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                reason: v.reason || undefined,
                sarb_submission_ref: v.sarb_submission_ref || undefined,
                ba900_form_ref: v.ba900_form_ref || undefined,
                cet1_ratio: v.cet1_ratio ? parseFloat(v.cet1_ratio) : undefined,
                total_capital_ratio: v.total_capital_ratio ? parseFloat(v.total_capital_ratio) : undefined,
                rwa_total: v.rwa_total ? parseFloat(v.rwa_total) : undefined,
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
                { value: 'start_rwa_calc', label: 'Start RWA calculation' },
                { value: 'complete_rwa_calc', label: 'Complete RWA calculation' },
                { value: 'complete_icaap', label: 'Complete ICAAP review' },
                { value: 'board_approve', label: 'Board approve' },
                { value: 'submit_to_sarb', label: 'Submit to SARB' },
                { value: 'sarb_raises_queries', label: 'SARB raises queries' },
                { value: 'respond_to_queries', label: 'Respond to SARB queries' },
                { value: 'sarb_accept', label: 'SARB accept' },
                { value: 'flag_remediation', label: 'Flag remediation required' },
                { value: 'start_remediation', label: 'Start remediation' },
                { value: 'refile', label: 'Refile after remediation' },
                { value: 'declare_capital_breach', label: 'Declare capital breach' },
                { value: 'withdraw', label: 'Withdraw filing' },
              ],
            },
            { key: 'cet1_ratio', label: 'CET1 ratio (%)', type: 'number', required: false, placeholder: '12.5' },
            { key: 'total_capital_ratio', label: 'Total capital ratio (%)', type: 'number', required: false, placeholder: '15.0' },
            { key: 'rwa_total', label: 'Total RWA (ZAR)', type: 'number', required: false },
            { key: 'sarb_submission_ref', label: 'SARB submission ref', required: false },
            { key: 'ba900_form_ref', label: 'BA 900 form reference', required: false },
            { key: 'reason', label: 'Notes / reason', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ─── W214: Lender EP IV ESAP Monitoring ───────────────────────────────────────
const ESAP_TIER_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good' | 'neutral'> = {
  category_c: 'info',
  category_b: 'warn',
  category_a: 'bad',
  critical_ps: 'bad',
};

function esapStatusTone(s: string): 'info' | 'warn' | 'bad' | 'good' | 'neutral' {
  if (s === 'closed_satisfactory') return 'good';
  if (s === 'non_compliant' || s === 'closed_escalated') return 'bad';
  if (s === 'action_identified' || s === 'partial_close') return 'warn';
  return 'info';
}

type EsapModal = null | 'create' | { type: 'action'; id: string; currentStatus: string };

function EsapMonitoringTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<EsapModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => { setRefreshKey(k => k + 1); onRefresh(); };

  return (
    <div>
      <button type="button"
        onClick={() => setModal('create')}
        className="mb-4 px-4 py-2 bg-[oklch(0.46_0.16_55)] text-white text-sm rounded hover:bg-[oklch(0.40_0.15_55)]"
      >
        Issue ESAP record
      </button>
      <ListingTable
        endpoint="/esap-monitoring"
        key={refreshKey}
        rowKey={(r) => r.id}
        empty={{ title: 'No ESAP monitoring records', description: 'Equator Principles IV monitoring records will appear here.' }}
        columns={[
          { key: 'site_name', label: 'Site', render: (r) => r.site_name || r.project_ref || '—' },
          { key: 'esap_tier', label: 'Category', render: (r) => <Pill tone={ESAP_TIER_TONE[r.esap_tier] ?? 'neutral'}>{String(r.esap_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={esapStatusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'finding_count_major', label: 'Major findings', align: 'right', render: (r) => r.finding_count_major ?? 0 },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'monitoring_cycle', label: 'Cycle', render: (r) => r.monitoring_cycle || '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Issue ESAP monitoring record"
          submitLabel="Issue"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/esap-monitoring', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                project_ref: v.project_ref || undefined,
                facility_ref: v.facility_ref || undefined,
                loan_ref: v.loan_ref || undefined,
                esap_tier: v.esap_tier,
                ep_category: v.ep_category || undefined,
                ps_triggers: v.ps_triggers || undefined,
                monitoring_cycle: v.monitoring_cycle || undefined,
                site_name: v.site_name || undefined,
                site_location: v.site_location || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            { key: 'site_name', label: 'Site name', required: false },
            { key: 'site_location', label: 'Site location', required: false },
            { key: 'monitoring_cycle', label: 'Monitoring cycle', required: false, placeholder: 'Annual 2025' },
            {
              key: 'esap_tier', label: 'Equator category', type: 'select', required: true, defaultValue: 'category_b',
              options: [
                { value: 'category_c', label: 'Category C — minimal impact (21d SLA)' },
                { value: 'category_b', label: 'Category B — limited impact (45d SLA)' },
                { value: 'category_a', label: 'Category A — significant impact (90d SLA)' },
                { value: 'critical_ps', label: 'Critical PS — PS6/PS7 triggered (180d SLA)' },
              ],
            },
            { key: 'ep_category', label: 'EP category', type: 'select', required: false, options: [
              { value: 'category_a', label: 'Category A' },
              { value: 'category_b', label: 'Category B' },
              { value: 'category_c', label: 'Category C' },
              { value: 'critical_ps', label: 'Critical PS' },
            ]},
            { key: 'ps_triggers', label: 'PS triggered (JSON array)', required: false, placeholder: '["PS1","PS6"]' },
            { key: 'project_ref', label: 'Project reference', required: false },
            { key: 'facility_ref', label: 'Facility reference', required: false },
            { key: 'loan_ref', label: 'Loan reference', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`ESAP action — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/esap-monitoring/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                auditor_name: v.auditor_name || undefined,
                auditor_firm: v.auditor_firm || undefined,
                visit_scheduled_date: v.visit_scheduled_date || undefined,
                findings_summary: v.findings_summary || undefined,
                finding_count_major: v.finding_count_major ? parseInt(v.finding_count_major, 10) : undefined,
                finding_count_minor: v.finding_count_minor ? parseInt(v.finding_count_minor, 10) : undefined,
                cap_reference: v.cap_reference || undefined,
                cap_due_date: v.cap_due_date || undefined,
                tpa_firm: v.tpa_firm || undefined,
                tpa_outcome: v.tpa_outcome || undefined,
                escalation_reason: v.escalation_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'schedule_visit', label: 'Schedule monitoring visit' },
                { value: 'complete_visit', label: 'Complete visit — record findings' },
                { value: 'raise_action', label: 'Raise corrective action' },
                { value: 'submit_cap', label: 'Submit corrective action plan' },
                { value: 'start_remediation', label: 'Start remediation' },
                { value: 'request_tpa', label: 'Request third-party audit' },
                { value: 'record_partial_close', label: 'Record partial close' },
                { value: 'close_satisfactory', label: 'Close — satisfactory' },
                { value: 'escalate', label: 'Escalate to lenders committee' },
                { value: 'issue_non_compliance', label: 'Issue non-compliance notice' },
                { value: 'withdraw', label: 'Withdraw (project decommissioned)' },
              ],
            },
            { key: 'auditor_name', label: 'Auditor name', required: false },
            { key: 'auditor_firm', label: 'Auditor firm', required: false },
            { key: 'visit_scheduled_date', label: 'Visit scheduled date', required: false },
            { key: 'findings_summary', label: 'Findings summary', type: 'textarea', required: false },
            { key: 'finding_count_major', label: 'Major finding count', type: 'number', required: false },
            { key: 'finding_count_minor', label: 'Minor finding count', type: 'number', required: false },
            { key: 'cap_reference', label: 'CAP reference', required: false },
            { key: 'cap_due_date', label: 'CAP due date', required: false },
            { key: 'tpa_firm', label: 'TPA firm', required: false },
            { key: 'tpa_outcome', label: 'TPA outcome', type: 'select', required: false, options: [
              { value: 'satisfactory', label: 'Satisfactory' },
              { value: 'conditional', label: 'Conditional' },
              { value: 'unsatisfactory', label: 'Unsatisfactory' },
            ]},
            { key: 'escalation_reason', label: 'Escalation reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ─── W223: Lender CP Clearance ────────────────────────────────────────────────
const CP_TIER_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'bad'> = {
  minor: 'neutral', standard: 'info', major: 'warn', systemic: 'bad',
};

function cpStatusTone(s: string): 'good' | 'bad' | 'warn' | 'neutral' | 'info' {
  if (s === 'drawdown_authorized') return 'good';
  if (s === 'cp_defaulted' || s === 'expired') return 'bad';
  if (s === 'under_lender_review' || s === 'cps_submitted') return 'info';
  if (s === 'cps_satisfied' || s === 'cps_partially_waived') return 'warn';
  return 'neutral';
}

type CpModal = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function CpClearanceTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<CpModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button"
          className="px-3 py-1.5 rounded bg-[oklch(0.46_0.16_55)] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New CP register
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/cp-clearances"
        rowKey={(r) => r.id}
        empty={{ title: 'No CP registers', description: 'Open a conditions precedent register to begin tracking financial close.' }}
        columns={[
          { key: 'borrower_name', label: 'Borrower', render: (r) => String(r.borrower_name ?? r.id).slice(0, 24) },
          { key: 'cp_tier', label: 'Tier', render: (r) => <Pill tone={CP_TIER_TONE[String(r.cp_tier)] ?? 'neutral'}>{String(r.cp_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'cp_count_total', label: 'CPs', align: 'right', render: (r) => r.cp_count_total != null ? `${r.cp_count_satisfied ?? 0}/${r.cp_count_total}` : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={cpStatusTone(String(r.chain_status))}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">On track</Pill> },
          { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(String(r.updated_at)).toLocaleDateString() : '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New CP clearance register"
          submitLabel="Create"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/cp-clearances', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                cp_tier: v.cp_tier,
                borrower_name: v.borrower_name || undefined,
                facility_ref: v.facility_ref || undefined,
                project_ref: v.project_ref || undefined,
                cp_count_total: v.cp_count_total ? Number(v.cp_count_total) : undefined,
                closing_deadline: v.closing_deadline || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'borrower_name', label: 'Borrower name', required: true },
            { key: 'cp_tier', label: 'CP tier', type: 'select', required: true, defaultValue: 'standard', options: [
              { value: 'minor', label: 'Minor (<R50M, 7d SLA)' },
              { value: 'standard', label: 'Standard (R50M–R500M, 14d SLA)' },
              { value: 'major', label: 'Major (R500M–R5B, 21d SLA)' },
              { value: 'systemic', label: 'Systemic (>R5B, 30d SLA)' },
            ]},
            { key: 'facility_ref', label: 'Facility reference (W53)', required: false },
            { key: 'project_ref', label: 'Project reference', required: false },
            { key: 'cp_count_total', label: 'Total CP count', type: 'number', required: false },
            { key: 'closing_deadline', label: 'Long-stop date', type: 'date', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title="CP clearance action"
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/cp-clearances/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                cp_count_satisfied: v.cp_count_satisfied ? Number(v.cp_count_satisfied) : undefined,
                cp_count_waived: v.cp_count_waived ? Number(v.cp_count_waived) : undefined,
                cp_count_failed: v.cp_count_failed ? Number(v.cp_count_failed) : undefined,
                cp_failed_reason: v.cp_failed_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'submit_register', label: 'Submit register to borrower' },
              { value: 'agree_cp_list', label: 'Agree CP list' },
              { value: 'commence_satisfaction', label: 'Commence satisfaction period' },
              { value: 'submit_evidence', label: 'Submit evidence package' },
              { value: 'commence_review', label: 'Commence lender review' },
              { value: 'clear_cps', label: 'Clear CPs — all satisfied' },
              { value: 'waive_cps', label: 'Waive remaining CPs' },
              { value: 'authorize_drawdown', label: 'Authorize drawdown (financial close)' },
              { value: 'declare_cp_default', label: 'Declare CP default' },
              { value: 'withdraw', label: 'Withdraw deal' },
              { value: 'expire', label: 'Expire (long-stop missed)' },
            ]},
            { key: 'cp_count_satisfied', label: 'CPs satisfied count', type: 'number', required: false },
            { key: 'cp_count_waived', label: 'CPs waived count', type: 'number', required: false },
            { key: 'cp_count_failed', label: 'CPs failed count', type: 'number', required: false },
            { key: 'cp_failed_reason', label: 'CP failure reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ─── W231: Lender Construction-Period Monthly IE Cost-to-Complete ─────────────

type CcrRow = {
  id: string;
  project_id: string;
  lender_id: string;
  ipp_id: string;
  report_month: string;
  budget_tier: string;
  total_project_budget_zar: number | null;
  actual_spend_to_date_zar: number | null;
  cost_to_complete_estimate_zar: number | null;
  projected_final_cost_zar: number | null;
  physical_completion_percentage: number | null;
  ie_name: string | null;
  ie_certification_ref: string | null;
  overrun_zar: number | null;
  overrun_percentage: number | null;
  chain_status: string;
  sla_deadline: string | null;
  sla_breached: number;
  overdue?: boolean;
};

type CcrStats = {
  total: number;
  compliant: number;
  at_risk: number;
  defaulted: number;
  sla_breached_count: number;
};

const CCR_TRANSITIONS: Record<string, string[]> = {
  monitoring_period_open: ['request_report', 'cancel'],
  report_requested: ['submit_report', 'cancel'],
  report_submitted: ['commence_ie_review', 'cancel'],
  ie_review: ['certify_report'],
  ie_certified: ['confirm_budget_compliance', 'flag_cost_overrun_risk'],
  cost_overrun_risk: ['confirm_cost_overrun', 'cancel'],
  equity_injection_required: ['draw_standby_facility', 'confirm_cure', 'trigger_default'],
  standby_drawdown: ['confirm_cure', 'trigger_default'],
};

const CCR_ACTION_LABELS: Record<string, string> = {
  request_report: 'Request IE report',
  submit_report: 'Submit cost report',
  commence_ie_review: 'Commence IE review',
  certify_report: 'Certify report',
  confirm_budget_compliance: 'Confirm budget compliance',
  flag_cost_overrun_risk: 'Flag cost overrun risk',
  confirm_cost_overrun: 'Confirm overrun — equity injection required',
  draw_standby_facility: 'Draw standby facility',
  confirm_cure: 'Confirm cure / resolved',
  trigger_default: 'Trigger default event',
  cancel: 'Cancel period',
};

const CCR_DESTRUCTIVE = new Set(['trigger_default', 'cancel']);

function ccrStatusTone(s: string): 'good' | 'bad' | 'warn' | 'neutral' | 'info' {
  if (s === 'budget_compliant' || s === 'resolved') return 'good';
  if (s === 'default_triggered') return 'bad';
  if (['cost_overrun_risk', 'equity_injection_required', 'standby_drawdown'].includes(s)) return 'warn';
  if (['ie_review', 'ie_certified', 'report_submitted'].includes(s)) return 'info';
  return 'neutral';
}

const zarFmt = (v: number | null) =>
  v != null ? v.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—';

type CcrModal = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function ConstructionCostReportTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<CcrModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<{ reports: CcrRow[]; stats: CcrStats } | null>(null);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/lender/construction-cost-report?per_page=200', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then((res: { data?: { reports: CcrRow[]; stats: CcrStats } }) => {
        if (res.data) setData(res.data);
      })
      .catch(() => null);
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional refresh trigger
  }, [refreshKey]);

  const stats = data?.stats;
  const reports = data?.reports ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-4 text-sm">
          {stats && (
            <>
              <span className="text-[#6b7685]">Total <strong className="text-[oklch(0.46_0.16_55)]">{stats.total}</strong></span>
              <span className="text-[#6b7685]">Compliant <strong className="text-green-700">{stats.compliant}</strong></span>
              <span className="text-[#6b7685]">At risk <strong className="text-amber-700">{stats.at_risk}</strong></span>
              <span className="text-[#6b7685]">Defaulted <strong className="text-red-700">{stats.defaulted}</strong></span>
              <span className="text-[#6b7685]">SLA breached <strong className="text-red-700">{stats.sla_breached_count}</strong></span>
            </>
          )}
        </div>
        <button type="button"
          className="px-3 py-1.5 rounded bg-[oklch(0.46_0.16_55)] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New period
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#e2e8f0] text-[#6b7685] text-left text-xs uppercase tracking-wide">
              <th className="py-2 pr-3">Project / Month</th>
              <th className="py-2 pr-3">Tier</th>
              <th className="py-2 pr-3 text-right">Budget</th>
              <th className="py-2 pr-3 text-right">Proj. Final</th>
              <th className="py-2 pr-3 text-right">Overrun</th>
              <th className="py-2 pr-3 text-right">Complete %</th>
              <th className="py-2 pr-3">IE</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">SLA</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-[#6b7685] text-sm">No cost reports. Open a monthly monitoring period to begin.</td></tr>
            )}
            {reports.map((r) => {
              const avail = CCR_TRANSITIONS[r.chain_status] ?? [];
              return (
                <tr key={r.id} className="border-b border-[#f0f4f8] hover:bg-[#f8fafc]">
                  <td className="py-2 pr-3 font-mono text-xs">
                    <div className="font-medium text-[oklch(0.46_0.16_55)]">{r.project_id.slice(0, 16)}</div>
                    <div className="text-[#6b7685]">{r.report_month}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <Pill tone={r.budget_tier === 'mega' ? 'bad' : r.budget_tier === 'large' ? 'warn' : 'neutral'}>
                      {r.budget_tier}
                    </Pill>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">{zarFmt(r.total_project_budget_zar)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">{zarFmt(r.projected_final_cost_zar)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">
                    {r.overrun_percentage != null
                      ? <span className={r.overrun_percentage > 5 ? 'text-red-700 font-bold' : 'text-amber-700'}>{r.overrun_percentage.toFixed(1)}%</span>
                      : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs">
                    {r.physical_completion_percentage != null ? `${r.physical_completion_percentage.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 pr-3 text-xs text-[#6b7685]">{r.ie_name ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <Pill tone={ccrStatusTone(r.chain_status)}>{r.chain_status.replace(/_/g, ' ')}</Pill>
                  </td>
                  <td className="py-2 pr-3">
                    {r.sla_breached ? <Pill tone="bad">Breached</Pill> : r.overdue ? <Pill tone="warn">Overdue</Pill> : <Pill tone="good">On track</Pill>}
                  </td>
                  <td className="py-2">
                    {avail.length > 0 && (
                      <button type="button"
                        className="px-2 py-1 rounded bg-[#f0f4f8] text-[oklch(0.46_0.16_55)] text-xs font-medium hover:bg-[#e2e8f0]"
                        onClick={() => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
                      >
                        Action
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal === 'create' && (
        <ActionModal
          title="Open monthly monitoring period"
          submitLabel="Open"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/lender/construction-cost-report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                project_id: v.project_id,
                ipp_id: v.ipp_id,
                report_month: v.report_month,
                total_project_budget_zar: v.total_project_budget_zar ? Number(v.total_project_budget_zar) : undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'project_id', label: 'Project', type: 'lookup', lookupEndpoint: '/api/lookup/projects', required: true },
            { key: 'ipp_id', label: 'IPP participant', type: 'lookup', lookupEndpoint: '/api/lookup/participants', required: true },
            { key: 'report_month', label: 'Report month (YYYY-MM)', required: true, placeholder: '2026-06' },
            { key: 'total_project_budget_zar', label: 'Total project budget (ZAR)', type: 'number', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (() => {
        const avail = CCR_TRANSITIONS[modal.currentStatus] ?? [];
        return (
          <ActionModal
            title="IE cost report action"
            submitLabel="Submit"
            onClose={() => setModal(null)}
            onSubmit={async (v) => {
              const res = await fetch(`/api/lender/construction-cost-report/${modal.id}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({
                  action: v.action,
                  actual_spend_to_date_zar: v.actual_spend_to_date_zar ? Number(v.actual_spend_to_date_zar) : undefined,
                  cost_to_complete_estimate_zar: v.cost_to_complete_estimate_zar ? Number(v.cost_to_complete_estimate_zar) : undefined,
                  physical_completion_percentage: v.physical_completion_percentage ? Number(v.physical_completion_percentage) : undefined,
                  overrun_zar: v.overrun_zar ? Number(v.overrun_zar) : undefined,
                  overrun_percentage: v.overrun_percentage ? Number(v.overrun_percentage) : undefined,
                  equity_injection_required_zar: v.equity_injection_required_zar ? Number(v.equity_injection_required_zar) : undefined,
                  ie_name: v.ie_name || undefined,
                  ie_certification_ref: v.ie_certification_ref || undefined,
                  reason: v.reason || undefined,
                }),
              });
              if (!res.ok) throw new Error(await res.text());
              setModal(null);
              refresh();
            }}
            fields={[
              { key: 'action', label: 'Action', type: 'select', required: true, options: avail.map(a => ({ value: a, label: CCR_ACTION_LABELS[a] ?? a })) },
              { key: 'actual_spend_to_date_zar', label: 'Actual spend to date (ZAR)', type: 'number', required: false },
              { key: 'cost_to_complete_estimate_zar', label: 'IE cost-to-complete estimate (ZAR)', type: 'number', required: false },
              { key: 'physical_completion_percentage', label: 'Physical completion (%)', type: 'number', required: false },
              { key: 'overrun_zar', label: 'Overrun amount (ZAR)', type: 'number', required: false },
              { key: 'overrun_percentage', label: 'Overrun %', type: 'number', required: false },
              { key: 'equity_injection_required_zar', label: 'Equity injection required (ZAR)', type: 'number', required: false },
              { key: 'ie_name', label: 'IE firm name', required: false },
              { key: 'ie_certification_ref', label: 'IE report reference', required: false },
              { key: 'reason', label: 'Notes', type: 'textarea', required: false },
            ]}
          />
        );
      })()}
    </div>
  );
}
