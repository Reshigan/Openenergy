import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';
import { InboxTab } from '../regulator/InboxTab';
import { NoticesTab } from '../regulator/NoticesTab';
import { EnforcementActionChainTab } from '../regulator/EnforcementActionChainTab';
import { EnforcementActionS35ChainTab } from '../regulator/EnforcementActionS35ChainTab';
import { EsgDisclosureChainTab } from '../carbon/EsgDisclosureChainTab';
import { DispositionChainTab } from '../disposition/DispositionChainTab';
import { LicenceRenewalChainTab } from '../licence-renewal/LicenceRenewalChainTab';
import { ComplianceInspectionChainTab } from '../compliance-inspection/ComplianceInspectionChainTab';
import { TariffDeterminationChainTab } from '../tariff-determination/TariffDeterminationChainTab';
import { LicenceApplicationChainTab } from '../licence-application/LicenceApplicationChainTab';
import { SsegRegistrationChainTab } from '../sseg-registration/SsegRegistrationChainTab';
import { ComplaintResolutionChainTab } from '../complaint-resolution/ComplaintResolutionChainTab';
import { LevyAssessmentChainTab } from '../levy-assessment/LevyAssessmentChainTab';
import { RegulatorExportPackTab } from '../regulatorExport/RegulatorExportPackTab';
import { ReconciliationAttestationTab } from '../reconciliation/ReconciliationAttestationTab';
import { ControlEnvironmentAuditTab } from '../controlEnvironment/ControlEnvironmentAuditTab';
import { GovernmentFilingConnectorTab } from '../governmentFilingConnector/GovernmentFilingConnectorTab';
import StageGateTab from '../stageGate/StageGateTab';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { WizardSpec } from '../launch/WizardModal';
import type { TourDef } from '../launch/ProductTour';

const REGULATOR_REPORTS: ReportConfig[] = [
  {
    title: 'Statutory Report Submissions',
    endpoint: '/api/reports?role=regulator',
    columns: [
      { key: 'report_type', label: 'Type' },
      { key: 'period', label: 'Period' },
      { key: 'status', label: 'Status' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    dateKey: 'submitted_at',
    pivotGroupBy: 'report_type',
    mailSubject: 'CEC — Regulator Statutory Reports',
  },
  {
    title: 'Levy Assessments',
    endpoint: '/api/regulator/levies',
    columns: [
      { key: 'levy_ref', label: 'Reference' },
      { key: 'licensee_id', label: 'Licensee' },
      { key: 'levy_amount_zar', label: 'ZAR', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Assessed' },
    ],
    filters: [{ key: 'chain_status', label: 'Status', type: 'select', options: [{ value: 'assessed', label: 'Assessed' }, { value: 'final_demand', label: 'Final Demand' }, { value: 'enforcement', label: 'Enforcement' }, { value: 'paid', label: 'Paid' }] }],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — NERSA Levy Assessments Report',
  },
  {
    title: 'Disposition Cases',
    endpoint: '/api/regulator/disposition-cases',
    columns: [
      { key: 'case_ref', label: 'Reference' },
      { key: 'subject_id', label: 'Subject' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    pivotGroupBy: 'chain_status',
    mailSubject: 'CEC — Disposition Cases Report',
  },
];

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

const LICENCE_TRANSITIONS = [
  { value: 'pending_hearing', label: 'Schedule hearing' },
  { value: 'decided', label: 'Decide' },
  { value: 'executed', label: 'Execute' },
  { value: 'appealed', label: 'Appeal' },
  { value: 'reversed', label: 'Reverse' },
];

const REGULATOR_WIZARDS: WizardSpec[] = [
  {
    id: 'regulator-complete-setup',
    title: 'Set up your NERSA regulatory workstation',
    subtitle: 'Configure inbox management, licensing, enforcement, economics, and all regulatory workflows',
    steps: [
      {
        title: 'Inbox & surveillance',
        description: 'Configure the Regulatory inbox, Notices, and Surveillance scan that receive cross-role escalations from all 9 market participants.',
        aiHint: 'The regulatory inbox is fed by escalation triggers across all workflow chains. Configure your SLA thresholds here to determine what counts as a "material" escalation. Surveillance scan runs every 15 minutes and uses ML-based anomaly detection — set your alert sensitivity to avoid alert fatigue.',
        fields: [
          { key: 'inbox_sla_hours', label: 'Inbox item response SLA (hours)', type: 'number', placeholder: 'e.g. 48 — NERSA internal target' },
          { key: 'surveillance_sensitivity', label: 'Surveillance alert sensitivity', type: 'select', options: [{ value: 'high', label: 'High — all anomalies flagged' }, { value: 'medium', label: 'Medium — significant anomalies' }, { value: 'low', label: 'Low — critical only' }] },
          { key: 'duty_officer_email', label: 'Duty officer email', type: 'text', placeholder: 'On-call regulatory officer' },
        ],
      },
      {
        title: 'Licensing',
        description: 'Set up Licence register, Licence applications (ERA ss.8-11), Licence renewals (NERSA §14-16), and SSEG registrations (ERA Sch 2).',
        aiHint: 'Licence application adjudication uses an INVERTED SLA — major projects get more time because the statutory process requires public participation (ERA §10). SSEG registrations (Wave W57) below the Schedule 2 threshold are exempt from public participation and should be fast-tracked. Set your team leads for each licence class now.',
        fields: [
          { key: 'licence_classes_handled', label: 'Licence classes your office handles', type: 'select', options: [{ value: 'all', label: 'All classes (generation, transmission, distribution, trading)' }, { value: 'generation_only', label: 'Generation only' }, { value: 'distribution_trading', label: 'Distribution and trading' }] },
          { key: 'adjudication_team_size', label: 'Adjudication team size', type: 'number', placeholder: 'e.g. 8' },
          { key: 'application_officer_email', label: 'Applications officer email', type: 'text', placeholder: 'licences@nersa.org.za' },
        ],
      },
      {
        title: 'Enforcement',
        description: 'Configure Enforcement actions (ERA §34/§35), Compliance inspections (NERSA §10), Complaint resolution (ERA §30), and Dispositions.',
        aiHint: 'Compliance notices under ERA §34 must include the specific provision, remediation required, and deadline. Vague notices are challenged and set aside — the platform uses structured templates per provision. Complaint resolution (Wave W66) has an URGENT SLA — external complainants expect resolution within 30 days.',
        fields: [
          { key: 'inspection_frequency', label: 'Planned inspection frequency', type: 'select', options: [{ value: 'annual', label: 'Annual per licensee' }, { value: 'biennial', label: 'Every 2 years' }, { value: 'risk_based', label: 'Risk-based (higher risk = more frequent)' }] },
          { key: 'penalty_schedule_version', label: 'Applicable penalty schedule', type: 'text', placeholder: 'e.g. ERA Amendment Act penalty schedule 2022' },
          { key: 'enforcement_officer', label: 'Chief enforcement officer', type: 'text', placeholder: 'Name and email' },
        ],
      },
      {
        title: 'Economics & determinations',
        description: 'Set up Tariff determinations (NERSA §15-16 + MYPD), Levy assessments (NERA §5B), Public consultations, and Market conduct examinations.',
        aiHint: 'MYPD tariff determinations run on a 3-5 year cycle — the platform tracks the current determination period and auto-schedules the next review. Levy assessments (Wave W74) are calculated on turnover for traders, volume for generators, and a fixed fee for distributors. Public consultation notice periods are 30–90 days depending on the matter.',
        fields: [
          { key: 'mypd_current_period', label: 'Current MYPD determination period end', type: 'date' },
          { key: 'levy_assessment_frequency', label: 'Levy assessment frequency', type: 'select', options: [{ value: 'annual', label: 'Annual' }, { value: 'semi_annual', label: 'Semi-annual' }, { value: 'quarterly', label: 'Quarterly' }] },
          { key: 'public_notice_channel', label: 'Public notice publication channel', type: 'text', placeholder: 'e.g. Government Gazette, NERSA website, news media' },
        ],
      },
    ],
    submitLabel: 'Save NERSA setup',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: 'regulator', ...values }) }).catch(() => {});
    },
  },
  {
    id: 'regulator-licence-application',
    title: 'Process a licence application',
    subtitle: 'ERA § 8–11 — adjudication and Council decision',
    steps: [
      {
        title: 'Application intake',
        description: 'Record the incoming licence application for NERSA adjudication.',
        aiHint: 'ERA Section 10 requires public participation for applications above the regulatory threshold. The workflow sets the public notice window automatically based on the licence class.',
        fields: [
          { key: 'applicant_name', label: 'Applicant entity', type: 'text', required: true, placeholder: 'e.g. Saldanha Wind Energy (Pty) Ltd' },
          { key: 'licence_class', label: 'Licence class', type: 'select', required: true, options: [{ value: 'generation_large', label: 'Generation — large (> 1MW)' }, { value: 'generation_small', label: 'Generation — small (1kW–1MW)' }, { value: 'transmission', label: 'Transmission' }, { value: 'distribution', label: 'Distribution' }, { value: 'trading', label: 'Trading licence' }, { value: 'import_export', label: 'Import / export' }] },
          { key: 'application_ref', label: 'Application reference', type: 'text', required: true, placeholder: 'NERSA application reference number' },
        ],
      },
      {
        title: 'Application details',
        description: 'Technical and financial review parameters.',
        aiHint: 'The technical evaluation covers compliance with Grid Code, environmental impact assessments, and financial capacity. NERSA must decide within the statutory timeframe set by the ERA — INVERTED SLA: major projects get more time for thorough review.',
        fields: [
          { key: 'capacity_mw', label: 'Applied capacity (MW)', type: 'number', placeholder: 'e.g. 140' },
          { key: 'province', label: 'Province', type: 'select', options: [{ value: 'western_cape', label: 'Western Cape' }, { value: 'northern_cape', label: 'Northern Cape' }, { value: 'eastern_cape', label: 'Eastern Cape' }, { value: 'gauteng', label: 'Gauteng' }, { value: 'kwazulu_natal', label: 'KwaZulu-Natal' }, { value: 'limpopo', label: 'Limpopo' }] },
          { key: 'received_date', label: 'Application received date', type: 'date', required: true },
        ],
      },
      {
        title: 'Completeness check',
        description: 'Confirm that the application is complete and the file is opened.',
        fields: [
          { key: 'documents_complete', label: 'All required documents received?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes — complete' }, { value: 'no', label: 'No — deficiency notice required' }] },
          { key: 'technical_officer', label: 'Assigned technical officer', type: 'text', placeholder: 'NERSA officer name' },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Missing documents, special considerations…' },
        ],
      },
    ],
    submitLabel: 'Open application file',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/licence-application/chain', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Application intake failed'); }
    },
  },
  {
    id: 'regulator-compliance-notice',
    title: 'Issue a compliance notice',
    subtitle: 'ERA § 34 — non-compliance enforcement',
    steps: [
      {
        title: 'Non-compliance',
        description: 'Identify the licensee and the compliance failure.',
        aiHint: 'Compliance notices under ERA §34 must state the specific provision breached, the remediation required, and the deadline. Vague notices are unenforceable and can be set aside on review.',
        fields: [
          { key: 'licensee_name', label: 'Licensee name', type: 'text', required: true, placeholder: 'Registered NERSA licensee' },
          { key: 'licence_number', label: 'NERSA licence number', type: 'text', required: true, placeholder: 'e.g. NERSA-GEN-2022-0042' },
          { key: 'provision_breached', label: 'Provision breached', type: 'text', required: true, placeholder: 'e.g. ERA Section 15(2)(b), Grid Code §G.4.3' },
        ],
      },
      {
        title: 'Non-compliance details',
        description: 'Describe the breach and the evidence.',
        fields: [
          { key: 'breach_description', label: 'Description of breach', type: 'textarea', required: true, placeholder: 'Factual description of the non-compliant conduct and how it was identified…' },
          { key: 'breach_date', label: 'Breach date (first identified)', type: 'date', required: true },
          { key: 'evidence_ref', label: 'Evidence reference', type: 'text', placeholder: 'Inspection report, monitoring data reference' },
        ],
      },
      {
        title: 'Remediation',
        description: 'Set the remediation required and the compliance deadline.',
        aiHint: 'The remediation deadline triggers the SLA timer. If the licensee does not comply by this date, the system escalates to enforcement action (ERA §35) automatically.',
        fields: [
          { key: 'remediation_required', label: 'Remediation required', type: 'textarea', required: true, placeholder: 'Describe specifically what the licensee must do to return to compliance…' },
          { key: 'compliance_deadline', label: 'Compliance deadline', type: 'date', required: true },
          { key: 'penalty_provision', label: 'Penalty provision (if applicable)', type: 'text', placeholder: 'e.g. ERA §34(4) — R5m per day' },
        ],
      },
    ],
    submitLabel: 'Issue notice',
    cta: 'danger',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/compliance-notices', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Compliance notice failed'); }
    },
  },
  {
    id: 'regulator-inspection',
    title: 'Open a compliance inspection',
    subtitle: 'ERA § 10 — proactive on-site or document review',
    steps: [
      {
        title: 'Inspection scope',
        description: 'Define the inspection subject and scope.',
        aiHint: 'The inspection type determines the required notice period: routine inspections require 14 days\' notice, targeted inspections require 5 days, and urgent safety inspections may be unannounced.',
        fields: [
          { key: 'licensee_name', label: 'Licensee / subject', type: 'text', required: true },
          { key: 'inspection_type', label: 'Inspection type', type: 'select', required: true, options: [{ value: 'routine', label: 'Routine (scheduled, 14d notice)' }, { value: 'targeted', label: 'Targeted (specific concern, 5d notice)' }, { value: 'follow_up', label: 'Follow-up (previous notice compliance)' }, { value: 'urgent', label: 'Urgent (safety, unannounced)' }] },
          { key: 'inspection_area', label: 'Inspection area', type: 'select', options: [{ value: 'financial', label: 'Financial compliance' }, { value: 'technical', label: 'Technical / grid compliance' }, { value: 'environmental', label: 'Environmental' }, { value: 'safety', label: 'Safety (OHSA)' }, { value: 'all', label: 'Comprehensive' }] },
        ],
      },
      {
        title: 'Planning',
        description: 'Schedule the inspection and assign the inspection team.',
        fields: [
          { key: 'planned_date', label: 'Planned inspection date', type: 'date', required: true },
          { key: 'lead_inspector', label: 'Lead inspector', type: 'text', required: true, placeholder: 'NERSA inspector name' },
          { key: 'scope_description', label: 'Inspection scope description', type: 'textarea', placeholder: 'Describe the specific areas, documents, and systems to be inspected…' },
        ],
      },
    ],
    submitLabel: 'Open inspection',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/compliance-inspection', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Inspection opening failed'); }
    },
  },
  {
    id: 'regulator-enforcement',
    title: 'Open enforcement action (ERA §34)',
    steps: [
      {
        title: 'Subject',
        description: 'Identify the licensee and the provision breached.',
        fields: [
          { key: 'licensee_name', label: 'Licensee name', type: 'text', required: true },
          { key: 'licence_number', label: 'Licence number', type: 'text', required: true },
          { key: 'provision_breached', label: 'Provision breached', type: 'text', required: true, placeholder: 'e.g. ERA §34(1)(a)' },
          { key: 'breach_description', label: 'Breach description', type: 'textarea', required: true },
          { key: 'breach_date', label: 'Breach date', type: 'date', required: true },
        ],
      },
      {
        title: 'Action',
        description: 'Set the enforcement type, deadline, and assigned officer.',
        fields: [
          { key: 'enforcement_type', label: 'Enforcement type', type: 'select', required: true, options: [{ value: 'compliance_notice', label: 'Compliance notice' }, { value: 'directive', label: 'Directive' }, { value: 'fine', label: 'Fine' }, { value: 'suspension', label: 'Suspension' }, { value: 'revocation', label: 'Revocation' }] },
          { key: 'remedy_deadline', label: 'Remedy deadline', type: 'date', required: true },
          { key: 'penalty_provision', label: 'Penalty provision', type: 'text' },
          { key: 'legal_officer', label: 'Legal officer', type: 'text', required: true },
          { key: 'evidence_ref', label: 'Evidence reference', type: 'text' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/enforcement-actions', values); },
  },
  {
    id: 'regulator-enforcement-s35',
    title: 'Open §35 penalty action',
    steps: [
      {
        title: 'Breach',
        description: 'Identify the §35 provision and penalty quantum.',
        fields: [
          { key: 'licensee_name', label: 'Licensee name', type: 'text', required: true },
          { key: 's35_provision', label: '§35 provision', type: 'select', required: true, options: [{ value: 's35_1_tariff', label: 'S35(1) — Tariff' }, { value: 's35_2_metering', label: 'S35(2) — Metering' }, { value: 's35_3_service', label: 'S35(3) — Service' }, { value: 's35_4_supply', label: 'S35(4) — Supply' }] },
          { key: 'breach_date', label: 'Breach date', type: 'date', required: true },
          { key: 'penalty_amount_zar', label: 'Penalty amount (ZAR)', type: 'number', required: true },
        ],
      },
      {
        title: 'Process',
        description: 'Set the show-cause deadline, hearing, and adjudicating officer.',
        fields: [
          { key: 'show_cause_deadline', label: 'Show-cause deadline', type: 'date', required: true },
          { key: 'legal_representation_allowed', label: 'Legal representation allowed', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'hearing_date', label: 'Hearing date', type: 'date' },
          { key: 'adjudication_officer', label: 'Adjudication officer', type: 'text', required: true },
          { key: 'appeal_period_days', label: 'Appeal period (days)', type: 'number', placeholder: '30 per ERA default' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/enforcement-s35', values); },
  },
  {
    id: 'regulator-esg',
    title: 'Record ESG disclosure review',
    steps: [
      {
        title: 'Disclosure',
        description: 'Record the licensee ESG disclosure filing details.',
        fields: [
          { key: 'licensee_name', label: 'Licensee name', type: 'text', required: true },
          { key: 'disclosure_year', label: 'Disclosure year', type: 'text', required: true, placeholder: 'e.g. 2026' },
          { key: 'reporting_standard', label: 'Reporting standard', type: 'select', required: true, options: [{ value: 'gri', label: 'GRI' }, { value: 'tcfd', label: 'TCFD' }, { value: 'cdp', label: 'CDP' }, { value: 'sarb_srr', label: 'SARB SRR' }, { value: 'ifrs_s1_s2', label: 'IFRS S1/S2' }] },
          { key: 'scope1_tco2e', label: 'Scope 1 (tCO₂e)', type: 'number' },
          { key: 'scope2_tco2e', label: 'Scope 2 (tCO₂e)', type: 'number' },
        ],
      },
      {
        title: 'Assessment',
        description: 'Assess disclosure quality and schedule the next review.',
        fields: [
          { key: 'disclosure_quality', label: 'Disclosure quality', type: 'select', required: true, options: [{ value: 'full', label: 'Full' }, { value: 'partial', label: 'Partial' }, { value: 'inadequate', label: 'Inadequate' }] },
          { key: 'material_omissions', label: 'Material omissions', type: 'textarea' },
          { key: 'improvement_required', label: 'Improvement required', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'next_review_date', label: 'Next review date', type: 'date' },
          { key: 'regulatory_guidance_issued', label: 'Regulatory guidance issued', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/esg-disclosures', values); },
  },
];

const REGULATOR_TOUR: TourDef = {
  id: 'regulator-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'NERSA regulator workstation', body: 'Manage the full regulatory lifecycle — licence applications, compliance notices, inspections, tariff determinations, levy assessments, and disposition of matters.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Regulatory KPIs', body: 'Open applications, SLA breaches, active enforcement actions, and outstanding levies. Regulatory SLAs are legally binding — red means overdue.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Regulatory workflow tabs', body: 'Licensing, enforcement, tariff determination, MYPD, public consultation, levy assessment — each is a live state-machine with statutory SLA tracking.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Process a new licence application, issue a compliance notice, or open a compliance inspection — all guided with legal reference at each step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'See all regulatory actions: STOR processing, market conduct examinations, disposition workflow, SSEG registration, and more.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'New licence applications, compliance incident escalations, and market surveillance alerts arrive here for adjudication.', placement: 'left' },
  ],
};

export function RegulatorWorkstationPage() {
  const kpis = useWorkstationKpis('regulator');
  const alertsPanel = useWorkstationPanel('Surveillance alerts', '/regulator/surveillance', (r) => ({
    id: r.id,
    lead: <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${r.severity === 'critical' ? 'bg-[#fbe9e6] text-[#c0392b]' : 'bg-[#fff4d6] text-[#a06200]'}`}>{r.severity || r.status || '—'}</span>,
    text: <span>{r.rule_label || r.title || r.rule_name} · {r.market || r.scope || ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.opened_at ? new Date(r.opened_at).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No active surveillance alerts.');
  const licencesPanel = useWorkstationPanel('Open licence actions', '/regulator/licences', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">{r.status || 'pending'}</span>,
    text: <span>{r.licence_type} · {r.licensee_name || r.applicant}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.due_date ? new Date(r.due_date).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No open licence actions.');
  const panels = [alertsPanel, licencesPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="regulator"
      eyebrow="Regulator · Workstation"
      title="Regulator workstation"
      subtitle="Surveillance triage · Licence action workflow · Enforcement case events."
      backHref="/regulator-suite"
      backLabel="Regulator suite"
      kpis={kpis}
      panels={panels}
      wizards={REGULATOR_WIZARDS}
      tour={REGULATOR_TOUR}
      tabs={[
        { key: 'inbox', label: 'Inbox', body: () => <InboxTab /> },
        { key: 'notices', label: 'Compliance notices', body: () => <NoticesTab /> },
        { key: 'surveillance', label: 'Surveillance triage', body: ({ onRefresh }) => <SurveillanceTab onRefresh={onRefresh} /> },
        { key: 'licences', label: 'Licence actions', body: ({ onRefresh }) => <LicencesTab onRefresh={onRefresh} /> },
        { key: 'enforcement', label: 'Enforcement events', body: ({ onRefresh }) => <EnforcementTab onRefresh={onRefresh} /> },
        { key: 'enforcement-action', label: 'Enforcement actions (ERA s35)', chainKey: 'enforcement_action', body: () => <EnforcementActionChainTab /> },
        { key: 'enforcement-action-s35', label: 'Enforcement actions (s35 lifecycle)', chainKey: 'enforcement_action_s35', body: () => <EnforcementActionS35ChainTab /> },
        { key: 'esg-disclosure', label: 'ESG disclosure (read-only)', chainKey: 'esg_disclosure', body: () => <EsgDisclosureChainTab /> },
        { key: 'regulator-exports', label: 'Incoming exports (W119)',
          body: () => <RegulatorExportPackTab regulatorView />,
        },
        { key: 'icfr-attestations', label: 'ICFR attestations (W120)',
          body: () => <ReconciliationAttestationTab regulatorView />,
        },
        { key: 'external-controls', label: 'External controls (W121)',
          body: () => <ControlEnvironmentAuditTab regulatorView />,
        },
        { key: 'government-filing-connectors', label: 'Filing connectors (W126)',
          body: () => <GovernmentFilingConnectorTab />,
        },
        { key: 'stage-gates', label: 'Stage gates (W131)',
          body: () => <StageGateTab readOnly />,
        },
        { key: 'public-consultations', label: 'Public consultations (W209)',
          chainKey: 'public_consultation',
          body: ({ onRefresh }) => <PublicConsultationTab onRefresh={onRefresh} />,
        },
        { key: 'market_conduct_exams', label: 'Market conduct exams (W220)',
          chainKey: 'market_conduct_exam',
          body: ({ onRefresh }) => <MarketConductExamTab onRefresh={onRefresh} />,
        },
        {
          key: 'licence_applications',
          label: 'Licence applications (W49)',
          chainKey: 'licence_application',
          body: () => <LicenceApplicationChainTab />,
        },
        {
          key: 'licence_renewals',
          label: 'Licence renewals (W33)',
          chainKey: 'licence_renewal',
          body: () => <LicenceRenewalChainTab />,
        },
        {
          key: 'complaint_resolution',
          label: 'Complaint resolution (W66)',
          chainKey: 'complaint_resolution',
          body: () => <ComplaintResolutionChainTab />,
        },
        {
          key: 'compliance_inspections',
          label: 'Compliance inspections (W40)',
          chainKey: 'compliance_inspection',
          body: () => <ComplianceInspectionChainTab />,
        },
        {
          key: 'dispositions',
          label: 'Dispositions (W31)',
          chainKey: 'disposition',
          body: () => <DispositionChainTab />,
        },
        {
          key: 'levy_assessments',
          label: 'Levy assessment (W74)',
          chainKey: 'levy_assessment',
          body: () => <LevyAssessmentChainTab />,
        },
        {
          key: 'sseg_registrations',
          label: 'SSEG registrations (W57)',
          chainKey: 'sseg_registration',
          body: () => <SsegRegistrationChainTab />,
        },
        {
          key: 'tariff_determinations',
          label: 'Tariff determination (W43)',
          chainKey: 'tariff_determination',
          body: () => <TariffDeterminationChainTab />,
        },
        { key: 'reports', label: 'Reports & Exports',
          body: () => (
            <div className="space-y-8">
              {REGULATOR_REPORTS.map(cfg => (
                <div key={cfg.endpoint} className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cfg.title}</p>
                  <ReportPanel config={cfg} />
                </div>
              ))}
            </div>
          ),
        },
        { key: 'audit', label: 'Audit & compliance',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/regulator"
              reconHint="licence_number,licensee_name,status,capacity_mw"
              reconSourceOptions={['dmre', 'nersa_internal', 'eskom']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function SurveillanceTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Triage alert" />
      <ListingTable
        endpoint="/regulator/surveillance/triage"
        rowKey={(r) => r.id}
        empty={{ title: 'No triage decisions yet', description: 'Surveillance alert triage decisions (false positive / monitor / escalate / contact party / close) will appear here.' }}
        columns={[
          { key: 'alert_id', label: 'Alert', render: (r) => <span className="font-mono text-[11px]">{(r.alert_id || '').slice(0, 12)}…</span> },
          { key: 'decision', label: 'Decision', render: (r) => <Pill tone={r.decision === 'false_positive' || r.decision === 'close_no_action' ? 'good' : r.decision === 'escalate_to_enforcement' ? 'bad' : 'warn'}>{r.decision.replace(/_/g, ' ')}</Pill> },
          { key: 'rationale', label: 'Rationale', render: (r) => <span className="block truncate max-w-md" title={r.rationale || ''}>{r.rationale || '—'}</span> },
          { key: 'triaged_at', label: 'Triaged', render: (r) => new Date(r.triaged_at).toLocaleString() },
          { key: 'next_review_at', label: 'Review by', render: (r) => r.next_review_at ? new Date(r.next_review_at).toLocaleDateString() : '—' },
        ]}
      />
      {filing && (
        <ActionModal
          title="Triage surveillance alert"
          submitLabel="Save triage"
          fields={[
            { key: 'alert_id', label: 'Alert ID', required: true },
            { key: 'decision', label: 'Decision', type: 'select', required: true, options: [
              { value: 'false_positive', label: 'False positive' },
              { value: 'monitor', label: 'Monitor' },
              { value: 'contact_party', label: 'Contact party' },
              { value: 'escalate_to_enforcement', label: 'Escalate to enforcement' },
              { value: 'close_no_action', label: 'Close — no action' },
            ] },
            { key: 'rationale', label: 'Rationale', type: 'textarea' },
            { key: 'enforcement_case_id', label: 'Enforcement case ID (if escalating)' },
            { key: 'next_review_at', label: 'Next review at', type: 'date' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/regulator/surveillance/triage', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function LicencesTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="File licence action" />
      <ListingTable
        endpoint="/regulator/licence-actions"
        rowKey={(r) => r.id}
        rowHref={(r) => `/regulator/licence-actions/${r.id}`}
        empty={{ title: 'No licence actions yet', description: 'Grant, vary, suspend, revoke, reinstate and renew workflows will appear here.' }}
        columns={[
          { key: 'action_type', label: 'Action', render: (r) => <Pill tone={r.action_type === 'grant' || r.action_type === 'renew' || r.action_type === 'reinstate' ? 'good' : r.action_type === 'revoke' || r.action_type === 'suspend' ? 'bad' : 'warn'}>{r.action_type}</Pill> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'executed' || r.status === 'decided' ? 'good' : r.status === 'reversed' ? 'bad' : 'info'}>{r.status.replace(/_/g, ' ')}</Pill> },
          { key: 'licence_id', label: 'Licence', render: (r) => r.licence_id ? <span className="font-mono text-[11px]">{r.licence_id.slice(0, 12)}…</span> : '—' },
          { key: 'application_id', label: 'Application', render: (r) => r.application_id ? <span className="font-mono text-[11px]">{r.application_id.slice(0, 12)}…</span> : '—' },
          { key: 'initiated_at', label: 'Initiated', render: (r) => new Date(r.initiated_at).toLocaleDateString() },
          { key: 'decided_at', label: 'Decided', render: (r) => r.decided_at ? new Date(r.decided_at).toLocaleDateString() : '—' },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'executed' && r.status !== 'reversed' && (
              <button type="button" onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[oklch(0.46_0.16_55)] text-white rounded">Transition</button>
            )
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="File licence action"
          submitLabel="File"
          fields={[
            { key: 'action_type', label: 'Action type', type: 'select', required: true, options: [
              { value: 'grant', label: 'Grant' },
              { value: 'vary', label: 'Vary' },
              { value: 'suspend', label: 'Suspend' },
              { value: 'revoke', label: 'Revoke' },
              { value: 'reinstate', label: 'Reinstate' },
              { value: 'renew', label: 'Renew' },
            ] },
            { key: 'licence_id', label: 'Licence', type: 'lookup', lookupEndpoint: '/api/lookup/licences' },
            { key: 'application_id', label: 'Application ID' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/regulator/licence-actions', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title={`Licence action transition · current: ${transitioning.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: LICENCE_TRANSITIONS },
            { key: 'rationale', label: 'Decision rationale', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(null)}
          onSubmit={async (v) => {
            await api.post(`/regulator/licence-actions/${transitioning.id}/transition`, v);
            setTransitioning(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function EnforcementTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log enforcement event" />
      <ListingTable
        endpoint="/regulator/enforcement-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No enforcement events', description: 'Case opened / evidence filed / hearings / findings / appeals events will appear here.' }}
        columns={[
          { key: 'case_id', label: 'Case', render: (r) => <span className="font-mono text-[11px]">{(r.case_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'closed' ? 'good' : r.event_type === 'finding_issued' || r.event_type === 'appeal_lodged' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log enforcement case event"
          submitLabel="Log"
          fields={[
            { key: 'case_id', label: 'Case ID', required: true },
            { key: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'opened', label: 'Opened' },
              { value: 'evidence_filed', label: 'Evidence filed' },
              { value: 'hearing_scheduled', label: 'Hearing scheduled' },
              { value: 'hearing_held', label: 'Hearing held' },
              { value: 'finding_issued', label: 'Finding issued' },
              { value: 'appeal_lodged', label: 'Appeal lodged' },
              { value: 'appeal_decided', label: 'Appeal decided' },
              { value: 'closed', label: 'Closed' },
            ] },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/regulator/enforcement-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ─── W209: Public Consultation Tab ────────────────────────────────────────────
const PC_TIER_TONE: Record<string, 'bad' | 'warn' | 'neutral' | 'info'> = {
  emergency: 'bad', national: 'bad', significant: 'warn', routine: 'info',
};

function PublicConsultationTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'action'; id: string; currentStatus: string; tier: string; title: string }>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setModal({ type: 'create' })} className="h-9 px-3 rounded-md bg-[oklch(0.46_0.16_55)] text-white text-[12px] font-semibold">
          + New consultation
        </button>
      </div>

      <ListingTable
        endpoint="/public-consultations"
        rowKey={(r) => r.id}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status, tier: r.consultation_tier, title: r.title })}
        empty={{ title: 'No public consultations', description: 'NERSA/DMRE public participation processes will appear here.' }}
        columns={[
          { key: 'title', label: 'Title', render: (r) => <span className="block truncate max-w-xs font-medium" title={r.title as string}>{r.title as string}</span> },
          { key: 'consultation_type', label: 'Type', render: (r) => <span className="text-[11px]">{String(r.consultation_type).replace(/_/g, ' ')}</span> },
          { key: 'consultation_tier', label: 'Tier', render: (r) => <Pill tone={PC_TIER_TONE[r.consultation_tier as string] ?? 'neutral'}>{String(r.consultation_tier)}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['closed'].includes(r.chain_status as string) ? 'good' : ['appealed', 'withdrawn'].includes(r.chain_status as string) ? 'bad' : 'warn'}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'created_at', label: 'Created', render: (r) => new Date(r.created_at as string).toLocaleDateString() },
        ]}
      />

      {modal?.type === 'create' && (
        <ActionModal
          title="New public consultation"
          submitLabel="Create"
          fields={[
            { key: 'title', label: 'Title', required: true },
            { key: 'consultation_type', label: 'Type', type: 'select', required: true, options: [
              { value: 'tariff_determination', label: 'Tariff determination' },
              { value: 'licence_application', label: 'Licence application' },
              { value: 'licence_amendment', label: 'Licence amendment' },
              { value: 'code_revision', label: 'Code revision' },
              { value: 'policy_review', label: 'Policy review' },
              { value: 'emergency_determination', label: 'Emergency determination' },
            ]} as FieldSpec,
            { key: 'consultation_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'emergency', label: 'Emergency (7d SLA)' },
              { value: 'routine', label: 'Routine (30d SLA)' },
              { value: 'significant', label: 'Significant (60d SLA)' },
              { value: 'national', label: 'National (90d SLA)' },
            ]} as FieldSpec,
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'reference_number', label: 'NERSA reference number' },
            { key: 'licence_ref', label: 'Licence reference (optional)' },
            { key: 'tariff_ref', label: 'Tariff determination reference (optional)' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            await api.post('/public-consultations', v);
            setModal(null); onRefresh();
          }}
        />
      )}

      {modal?.type === 'action' && (
        <ActionModal
          title={`Consultation — ${modal.tier} — ${String(modal.title).slice(0, 50)}${String(modal.title).length > 50 ? '…' : ''}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'publish_notice', label: 'Publish notice' },
              { value: 'open_objection_period', label: 'Open objection period' },
              { value: 'close_submissions', label: 'Close submissions' },
              { value: 'start_analysis', label: 'Start analysis' },
              { value: 'draft_determination', label: 'Draft determination' },
              { value: 'issue_determination', label: 'Issue determination' },
              { value: 'lodge_appeal', label: 'Lodge appeal (PAJA §6)' },
              { value: 'resolve_appeal', label: 'Resolve appeal' },
              { value: 'close_consultation', label: 'Close consultation' },
              { value: 'withdraw', label: 'Withdraw' },
            ]} as FieldSpec,
            { key: 'gazette_number', label: 'Gazette number' },
            { key: 'comment_deadline', label: 'Comment deadline', type: 'date' },
            { key: 'objection_deadline', label: 'Objection deadline', type: 'date' },
            { key: 'submissions_count', label: 'Submissions received', type: 'number' },
            { key: 'determination_summary', label: 'Determination summary', type: 'textarea' },
            { key: 'determination_ref', label: 'Determination reference' },
            { key: 'appeal_grounds', label: 'Appeal grounds' },
            { key: 'appeal_outcome', label: 'Appeal outcome', type: 'select', options: [
              { value: 'upheld', label: 'Upheld' },
              { value: 'dismissed', label: 'Dismissed' },
              { value: 'settled', label: 'Settled' },
            ]} as FieldSpec,
            { key: 'reason', label: 'Internal notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            await api.post(`/public-consultations/${modal.id}/action`, {
              ...v,
              submissions_count: v.submissions_count ? Number(v.submissions_count) : undefined,
            });
            setModal(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ── W220: Regulator Market Conduct Examination ────────────────────────────────
const MCE_TIER_TONE: Record<string, string> = {
  routine:        'bg-[oklch(0.97_0.003_250)] text-[oklch(0.46_0.16_55)]',
  thematic:       'bg-purple-50 text-purple-700',
  targeted:       'bg-amber-50 text-amber-700',
  major_systemic: 'bg-rose-50 text-rose-700',
};

function mceStatusTone(s: string): string {
  if (['closed_satisfactory'].includes(s)) return 'bg-green-100 text-green-800';
  if (['enforcement_action'].includes(s)) return 'bg-red-100 text-red-800';
  if (['withdrawn'].includes(s)) return 'bg-gray-100 text-gray-600';
  if (['remedial_action_required'].includes(s)) return 'bg-orange-100 text-orange-800';
  if (['report_issued'].includes(s)) return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-700';
}

type MceModal = { id: string; exam_tier: string; examination_ref?: string } | null;

function MarketConductExamTab({ onRefresh }: { onRefresh?: () => void }) {
  const [data, setData] = React.useState<any[]>([]);
  const [kpis, setKpis] = React.useState<any>({});
  const [modal, setModal] = React.useState<MceModal>(null);
  const [createModal, setCreateModal] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const bump = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/market-conduct-exams', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(j => { setData(j.data ?? []); setKpis(j.kpis ?? {}); });
  }, [refreshKey]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', val: kpis.total ?? 0 },
          { label: 'Active', val: kpis.active ?? 0 },
          { label: 'Enforcement', val: kpis.enforcement ?? 0 },
          { label: 'Closed satisfactory', val: kpis.closed_satisfactory ?? 0 },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-semibold text-gray-900">{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">{data.length} conduct examinations</span>
        <button type="button"
          onClick={() => setCreateModal(true)}
          className="text-sm bg-[oklch(0.46_0.16_55)] text-white px-3 py-1.5 rounded-md hover:bg-[oklch(0.40_0.15_55)]"
        >+ Schedule examination</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Ref', 'Tier', 'Type', 'Subject licence', 'Status', 'SLA deadline', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {data.map((row: any) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs text-gray-700">{row.examination_ref ?? row.id.slice(0, 8)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${MCE_TIER_TONE[row.exam_tier] ?? 'bg-gray-100 text-gray-700'}`}>
                    {row.exam_tier?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600">{row.exam_type?.replace(/_/g, ' ') ?? '—'}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{row.subject_licence_class ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${mceStatusTone(row.chain_status)}`}>
                    {row.chain_status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs">{row.sla_deadline ? new Date(row.sla_deadline).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => setModal({ id: row.id, exam_tier: row.exam_tier, examination_ref: row.examination_ref })}
                    className="text-xs text-[oklch(0.46_0.16_55)] hover:underline">Action</button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No conduct examinations found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createModal && (
        <ActionModal
          title="Schedule market conduct examination"
          submitLabel="Schedule"
          fields={[
            { key: 'exam_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'routine', label: 'Routine (30d)' },
              { value: 'thematic', label: 'Thematic (45d)' },
              { value: 'targeted', label: 'Targeted (60d)' },
              { value: 'major_systemic', label: 'Major / systemic (90d)' },
            ]} as FieldSpec,
            { key: 'exam_type', label: 'Examination type', type: 'select', options: [
              { value: 'pricing_conduct', label: 'Pricing conduct' },
              { value: 'transparency', label: 'Transparency obligations' },
              { value: 'consumer_protection', label: 'Consumer protection' },
              { value: 'market_integrity', label: 'Market integrity' },
              { value: 'cross_cutting', label: 'Cross-cutting' },
              { value: 'ad_hoc', label: 'Ad hoc' },
            ]} as FieldSpec,
            { key: 'examination_ref', label: 'NERSA/FSCA examination reference' },
            { key: 'subject_participant_id', label: 'Subject participant', type: 'lookup', lookupEndpoint: '/api/lookup/participants' },
            { key: 'subject_licence_class', label: 'Subject licence class', type: 'select', options: [
              { value: 'generation', label: 'Generation' },
              { value: 'transmission', label: 'Transmission' },
              { value: 'distribution', label: 'Distribution' },
              { value: 'trading', label: 'Trading' },
              { value: 'import_export', label: 'Import/Export' },
            ] },
            { key: 'reason', label: 'Basis for examination' },
          ] as FieldSpec[]}
          onClose={() => setCreateModal(false)}
          onSubmit={async (v) => {
            const res = await fetch('/api/market-conduct-exams', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify(v),
            });
            if (!res.ok) throw new Error(await res.text());
            setCreateModal(false); bump();
          }}
        />
      )}

      {modal && (
        <ActionModal
          title={`Conduct exam — ${modal.exam_tier?.replace(/_/g, ' ')} — ${modal.examination_ref ?? modal.id.slice(0, 8)}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'issue_notice', label: 'Issue examination notice' },
              { value: 'request_documents', label: 'Request documents' },
              { value: 'documents_received', label: 'Documents received' },
              { value: 'commence_on_site', label: 'Commence on-site review' },
              { value: 'issue_preliminary_findings', label: 'Issue preliminary findings' },
              { value: 'file_subject_response', label: 'File subject response' },
              { value: 'draft_final_report', label: 'Draft final report' },
              { value: 'issue_final_report', label: 'Issue final report' },
              { value: 'order_remedial_action', label: 'Order remedial action' },
              { value: 'commence_enforcement', label: 'Commence enforcement' },
              { value: 'close_satisfactory', label: 'Close — satisfactory' },
              { value: 'withdraw', label: 'Withdraw examination' },
            ]} as FieldSpec,
            { key: 'notice_ref', label: 'Notice reference' },
            { key: 'document_request_ref', label: 'Document request reference' },
            { key: 'document_deadline', label: 'Document submission deadline' },
            { key: 'on_site_start_date', label: 'On-site start date' },
            { key: 'on_site_end_date', label: 'On-site end date' },
            { key: 'on_site_lead_examiner', label: 'Lead examiner' },
            { key: 'preliminary_findings_ref', label: 'Preliminary findings reference' },
            { key: 'response_deadline', label: 'Response deadline' },
            { key: 'subject_response_ref', label: 'Subject response reference' },
            { key: 'final_report_ref', label: 'Final report reference' },
            { key: 'findings_summary', label: 'Findings summary', type: 'textarea' },
            { key: 'adverse_findings_count', label: 'Adverse findings count', type: 'number' },
            { key: 'remedial_action_ref', label: 'Remedial action reference' },
            { key: 'remedial_action_deadline', label: 'Remedial action deadline' },
            { key: 'enforcement_ref', label: 'Enforcement reference' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/market-conduct-exams/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                ...v,
                adverse_findings_count: v.adverse_findings_count ? Number(v.adverse_findings_count) : undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
        />
      )}
    </div>
  );
}
