import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { SupportTicketChainTab } from '../support/SupportTicketChainTab';
import { ProblemManagementChainTab } from '../problem-management/ProblemManagementChainTab';
import { ChangeEnablementChainTab } from '../change-enablement/ChangeEnablementChainTab';
import { SecurityRemediationChainTab } from '../security-remediation/SecurityRemediationChainTab';
import { WarrantyRecoveryChainTab } from '../warranty-recovery/WarrantyRecoveryChainTab';
import { SparePartsProvisioningChainTab } from '../spare-parts-provisioning/SparePartsProvisioningChainTab';
import { ServiceContractChainTab } from '../service-contract/ServiceContractChainTab';
import { ServiceRequestChainTab } from '../support/ServiceRequestChainTab';
import { OemFcoChainTab } from '../oem-fco/OemFcoChainTab';
import { MqttOpcuaConnectorTab } from '../mqttOpcuaConnector/MqttOpcuaConnectorTab';
import { AnomalyDetectionMlTab } from '../anomalyDetectionMl/AnomalyDetectionMlTab';
import RulPredictionMlTab from '../rulPredictionMl/RulPredictionMlTab';
import { FaultFingerprintMlTab } from '../faultFingerprintMl/FaultFingerprintMlTab';
import { api } from '../../lib/api';
import { X } from 'lucide-react';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { WizardSpec } from '../launch/WizardModal';
import type { TourDef } from '../launch/ProductTour';

const SUPPORT_REPORTS: ReportConfig[] = [
  {
    title: 'SLA Performance Reports',
    endpoint: '/api/support/sla-reports',
    columns: [
      { key: 'report_ref', label: 'Reference' },
      { key: 'report_period', label: 'Period' },
      { key: 'p1_adherence_pct', label: 'P1 %', numeric: true },
      { key: 'p2_adherence_pct', label: 'P2 %', numeric: true },
      { key: 'chain_status', label: 'Status' },
    ],
    pivotGroupBy: 'chain_status',
    mailSubject: 'Open Energy — SLA Performance Report',
  },
  {
    title: 'CSAT Records',
    endpoint: '/api/support/csat',
    columns: [
      { key: 'ticket_ref', label: 'Ticket' },
      { key: 'csat_score', label: 'CSAT Score', numeric: true },
      { key: 'priority', label: 'Priority' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    filters: [{ key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'P1', label: 'P1 Critical' }, { value: 'P2', label: 'P2 High' }, { value: 'P3', label: 'P3 Medium' }, { value: 'P4', label: 'P4 Low' }] }],
    pivotGroupBy: 'priority',
    mailSubject: 'Open Energy — CSAT Records Report',
  },
  {
    title: 'Problem Records',
    endpoint: '/api/support/problem-records',
    columns: [
      { key: 'problem_ref', label: 'Reference' },
      { key: 'description', label: 'Description' },
      { key: 'impact_tier', label: 'Impact' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Opened' },
    ],
    pivotGroupBy: 'impact_tier',
    mailSubject: 'Open Energy — Problem Records Report',
  },
];

const SUPPORT_WIZARDS: WizardSpec[] = [
  {
    id: 'support-complete-setup',
    title: 'Set up your Support workstation',
    subtitle: 'Configure incident management, ITIL chains, OEM workflows, and platform operations',
    steps: [
      {
        title: 'Incident management',
        description: 'Set up Support tickets (P1–P4), SLA escalations, CSAT monitoring, and SLA performance reports.',
        aiHint: 'P1 (complete outage, no workaround) SLA is 1 hour first response and 4 hours resolution. CSAT surveys are triggered automatically on ticket close. Your SLA performance report (Wave W217) compares actual adherence against target and flags RCA requirements when P1/P2 SLAs are breached. Set your duty manager escalation contacts now — the system auto-pages them for P1 breaches.',
        fields: [
          { key: 'p1_escalation_contact', label: 'P1 duty manager escalation contact', type: 'text', placeholder: 'Name — mobile number' },
          { key: 'csat_auto_survey', label: 'CSAT survey trigger', type: 'select', options: [{ value: 'on_close', label: 'On ticket close (recommended)' }, { value: 'on_resolve', label: 'On resolution' }, { value: 'manual', label: 'Manual only' }] },
          { key: 'sla_report_frequency', label: 'SLA performance report frequency', type: 'select', options: [{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }] },
        ],
      },
      {
        title: 'ITIL problem & change chains',
        description: 'Configure Problem management (W41), Change enablement/RFC (W47), and Security/firmware remediations (W55).',
        aiHint: 'Problem records are opened when you have recurring incidents sharing a root cause. Change Management uses CAB approval for Normal changes and a fast-path ECAB window for Emergency changes — set your CAB chair and ECAB approver contacts now. Security remediations (Wave W55) use CVSS tiering: Critical CVEs must be patched within 72 hours. Set your OT security point-of-contact for vulnerability triage.',
        fields: [
          { key: 'cab_chair', label: 'Change Advisory Board (CAB) chair', type: 'text', placeholder: 'Name and email' },
          { key: 'ecab_approver', label: 'ECAB emergency approver', type: 'text', placeholder: 'Name and mobile — must be available 24/7' },
          { key: 'cvss_critical_sla_hours', label: 'CVSS critical patch SLA (hours)', type: 'number', placeholder: '72' },
        ],
      },
      {
        title: 'OEM & equipment lifecycle',
        description: 'Set up Warranty recovery claims (W63), Spare parts provisioning (W72), Service contracts, and OEM field change orders.',
        aiHint: 'Warranty recovery (Wave W63) chases the OEM for reimbursement of repair costs — open a recovery claim within 14 days of completing the warranty repair to preserve your rights. Spare parts use VED criticality tiers: Vital parts must have at least 1 unit in stock at all times. Set your minimum stock level alerts per VED tier. OEM FCOs (field change orders) are mandatory safety modifications — track them to avoid voiding warranties.',
        fields: [
          { key: 'vital_parts_buffer', label: 'Vital parts minimum stock buffer', type: 'number', placeholder: 'e.g. 2 — minimum units per vital SKU' },
          { key: 'service_contract_count', label: 'Active O&M service contracts', type: 'number', placeholder: 'e.g. 5' },
          { key: 'oem_primary_contact', label: 'Primary OEM account manager', type: 'text', placeholder: 'Name and email for warranty escalations' },
        ],
      },
      {
        title: 'Platform & cross-tenant',
        description: 'Configure Cross-tenant support access, MQTT/OPC-UA IoT connectors, and the tamper-evident audit trail.',
        aiHint: 'Cross-tenant access requires a time-limited access token issued by the tenant admin — every access is logged in the PII audit trail for POPIA compliance. MQTT/OPC-UA connectors feed real-time telemetry from site hardware into the asset prognostics engine. Each connector has a keep-alive heartbeat; dead connectors trigger automatic P2 tickets.',
        fields: [
          { key: 'cross_tenant_access_duration_hours', label: 'Default cross-tenant access duration (hours)', type: 'number', placeholder: '4' },
          { key: 'connector_heartbeat_minutes', label: 'Connector heartbeat interval (minutes)', type: 'number', placeholder: '5' },
          { key: 'audit_retention_years', label: 'Support audit retention (years)', type: 'select', options: [{ value: '5', label: '5 years (POPIA minimum)' }, { value: '7', label: '7 years (FSCA)' }] },
        ],
      },
    ],
    submitLabel: 'Save support configuration',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/support/config', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'support-raise-ticket',
    title: 'Raise a support ticket',
    subtitle: 'ITIL 4 — incident management P1–P4',
    steps: [
      {
        title: 'Ticket classification',
        description: 'Identify the issue and its severity.',
        aiHint: 'P1 is a complete service outage affecting multiple users — the SLA is 1 hour for first response. P4 is a minor inconvenience with a workaround available — 24 hours. Misclassifying P1 as P4 will breach your SLA.',
        fields: [
          { key: 'title', label: 'Issue title', type: 'text', required: true, placeholder: 'Brief one-line description of the problem' },
          { key: 'priority', label: 'Priority', type: 'select', required: true, options: [{ value: 'p1', label: 'P1 — Critical (complete outage, no workaround)' }, { value: 'p2', label: 'P2 — High (major degradation, workaround exists)' }, { value: 'p3', label: 'P3 — Medium (partial impact, workaround)' }, { value: 'p4', label: 'P4 — Low (minor issue, cosmetic)' }] },
          { key: 'category', label: 'Category', type: 'select', options: [{ value: 'api', label: 'API / integration' }, { value: 'ui', label: 'UI / frontend' }, { value: 'data', label: 'Data / reporting' }, { value: 'auth', label: 'Authentication / access' }, { value: 'performance', label: 'Performance' }, { value: 'security', label: 'Security incident' }] },
        ],
      },
      {
        title: 'Description',
        description: 'Describe the issue in enough detail to reproduce it.',
        aiHint: 'Good incident descriptions include: what the user was trying to do, what they expected to happen, what actually happened, and exact error messages. Screenshots can be attached after ticket creation.',
        fields: [
          { key: 'description', label: 'Detailed description', type: 'textarea', required: true, placeholder: 'Steps to reproduce, expected vs actual behaviour, error messages, affected users…' },
          { key: 'affected_tenants', label: 'Affected tenant(s)', type: 'text', placeholder: 'Tenant names or "all" if platform-wide' },
          { key: 'reported_by', label: 'Reported by (user/email)', type: 'text', placeholder: 'user@organisation.co.za' },
        ],
      },
    ],
    submitLabel: 'Raise ticket',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/support/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Ticket creation failed'); }
    },
  },
  {
    id: 'support-problem',
    title: 'Open a problem investigation',
    subtitle: 'ITIL 4 Problem Management — root cause analysis',
    steps: [
      {
        title: 'Problem identification',
        description: 'Identify the recurring or major problem to investigate.',
        aiHint: 'A Problem record is opened when you have multiple related incidents that share a common root cause, or after a major P1 incident. Fixing the root cause prevents recurrence.',
        fields: [
          { key: 'problem_title', label: 'Problem title', type: 'text', required: true, placeholder: 'Brief description of the underlying cause being investigated' },
          { key: 'problem_type', label: 'Problem type', type: 'select', required: true, options: [{ value: 'reactive', label: 'Reactive — raised after incident(s)' }, { value: 'proactive', label: 'Proactive — identified before impact' }] },
          { key: 'related_incidents', label: 'Related incident references', type: 'text', placeholder: 'Comma-separated ticket IDs, e.g. INC-1234, INC-1245' },
        ],
      },
      {
        title: 'Impact & urgency',
        description: 'Assess the business impact and urgency of resolution.',
        aiHint: 'Impact x Urgency = Priority. A high-impact but low-urgency problem (e.g. intermittent performance degradation during off-peak) is Medium priority. A high-impact high-urgency problem requires immediate root cause investigation.',
        fields: [
          { key: 'impact', label: 'Business impact', type: 'select', required: true, options: [{ value: 'critical', label: 'Critical — regulatory / financial exposure' }, { value: 'high', label: 'High — multiple tenants affected' }, { value: 'medium', label: 'Medium — limited tenants' }, { value: 'low', label: 'Low — minor inconvenience' }] },
          { key: 'urgency', label: 'Urgency', type: 'select', required: true, options: [{ value: 'immediate', label: 'Immediate — address today' }, { value: 'high', label: 'High — address this week' }, { value: 'normal', label: 'Normal — next sprint' }, { value: 'planning', label: 'Planning — next quarter' }] },
          { key: 'assigned_to', label: 'Assigned engineer', type: 'text', placeholder: 'Engineer name responsible for RCA' },
        ],
      },
      {
        title: 'Root cause hypothesis',
        description: 'Document the initial root cause hypothesis for investigation.',
        fields: [
          { key: 'hypothesis', label: 'Initial root cause hypothesis', type: 'textarea', required: true, placeholder: 'What do you think is causing this? List possible causes to investigate…' },
          { key: 'workaround', label: 'Known workaround (if any)', type: 'textarea', placeholder: 'Interim steps to reduce impact while the problem is being resolved…' },
        ],
      },
    ],
    submitLabel: 'Open problem record',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/problem-management', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Problem record creation failed'); }
    },
  },
  {
    id: 'support-rfc',
    title: 'Submit a Request for Change (RFC)',
    subtitle: 'ITIL 4 Change Enablement — CAB approval workflow',
    steps: [
      {
        title: 'Change description',
        description: 'Describe the change and its purpose.',
        aiHint: 'Standard changes (pre-approved, low risk) go straight to scheduling. Non-standard changes need CAB approval. Emergency changes use the ECAB fast-path (4-hour window).',
        fields: [
          { key: 'change_title', label: 'Change title', type: 'text', required: true, placeholder: 'Brief description of the change' },
          { key: 'change_type', label: 'Change type', type: 'select', required: true, options: [{ value: 'standard', label: 'Standard — pre-approved (low risk)' }, { value: 'normal', label: 'Normal — CAB approval required' }, { value: 'emergency', label: 'Emergency — ECAB fast-path (4h window)' }] },
          { key: 'change_category', label: 'Category', type: 'select', options: [{ value: 'software', label: 'Software deployment' }, { value: 'database', label: 'Database / migration' }, { value: 'infrastructure', label: 'Infrastructure / config' }, { value: 'integration', label: 'Integration / API' }, { value: 'security', label: 'Security patch' }] },
        ],
      },
      {
        title: 'Risk & impact',
        description: 'Assess the risk and plan the rollback.',
        aiHint: 'Every change must have a documented rollback plan before CAB will approve it. "Delete the new deployment" is not a rollback plan — describe the specific steps to restore the previous state.',
        fields: [
          { key: 'risk_level', label: 'Risk level', type: 'select', required: true, options: [{ value: 'low', label: 'Low — isolated, easy rollback' }, { value: 'medium', label: 'Medium — limited blast radius' }, { value: 'high', label: 'High — broad impact, complex rollback' }] },
          { key: 'rollback_plan', label: 'Rollback plan', type: 'textarea', required: true, placeholder: 'Step-by-step instructions to reverse this change if it fails…' },
        ],
      },
      {
        title: 'Scheduling',
        description: 'Request the implementation window.',
        aiHint: 'Platform changes during peak trading hours (07:00–21:00 SAST) require NTCSA and NERSA notification. Schedule changes outside this window where possible.',
        fields: [
          { key: 'requested_start', label: 'Requested implementation start', type: 'date', required: true },
          { key: 'estimated_duration_min', label: 'Estimated duration (minutes)', type: 'number', placeholder: 'e.g. 30' },
          { key: 'affected_services', label: 'Affected services', type: 'textarea', placeholder: 'List the API routes, UIs, or workflows that will be impacted during the change window…' },
        ],
      },
    ],
    submitLabel: 'Submit RFC',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/change-enablement', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'RFC submission failed'); }
    },
  },
  {
    id: 'support-incident',
    title: 'Open P1/P2 incident',
    subtitle: 'ITIL 4 — critical / high priority incident management',
    steps: [
      {
        title: 'Incident',
        fields: [
          { key: 'priority', label: 'Priority', type: 'select', required: true, options: [{ value: 'P1', label: 'P1 — Critical' }, { value: 'P2', label: 'P2 — High' }, { value: 'P3', label: 'P3 — Medium' }, { value: 'P4', label: 'P4 — Low' }] },
          { key: 'category', label: 'Category', type: 'select', required: true, options: [{ value: 'system_outage', label: 'System outage' }, { value: 'data_integrity', label: 'Data integrity' }, { value: 'security_breach', label: 'Security breach' }, { value: 'performance_degradation', label: 'Performance degradation' }, { value: 'user_access', label: 'User access' }] },
          { key: 'description', label: 'Description', type: 'textarea', required: true, placeholder: 'What is happening and what is the business impact?' },
        ],
      },
      {
        title: 'Escalation',
        fields: [
          { key: 'affected_roles', label: 'Affected roles / tenants', type: 'textarea', required: true, placeholder: 'e.g. all traders, lender@example.co.za' },
          { key: 'workaround_available', label: 'Workaround available?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'escalate_to_management', label: 'Escalate to management?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes — P1 requires management notification' }, { value: 'no', label: 'No' }] },
        ],
      },
    ],
    submitLabel: 'Open incident',
    cta: 'danger',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/support/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'support-problem-new',
    title: 'Raise problem record',
    subtitle: 'Wave W41 — ITIL 4 problem management / root cause analysis',
    steps: [
      {
        title: 'Problem details',
        fields: [
          { key: 'problem_summary', label: 'Problem summary', type: 'text', required: true, placeholder: 'One-line description of the underlying problem' },
          { key: 'trigger_incident_ref', label: 'Trigger incident reference', type: 'text', placeholder: 'e.g. INC-2026-0042' },
          { key: 'impact_tier', label: 'Impact tier', type: 'select', required: true, options: [{ value: 'critical', label: 'Critical' }, { value: 'major', label: 'Major' }, { value: 'moderate', label: 'Moderate' }, { value: 'minor', label: 'Minor' }] },
        ],
      },
      {
        title: 'Root cause',
        fields: [
          { key: 'root_cause_category', label: 'Root cause category', type: 'select', required: true, options: [{ value: 'software_defect', label: 'Software defect' }, { value: 'configuration_error', label: 'Configuration error' }, { value: 'infrastructure_failure', label: 'Infrastructure failure' }, { value: 'process_failure', label: 'Process failure' }, { value: 'human_error', label: 'Human error' }] },
          { key: 'rca_owner', label: 'RCA owner', type: 'text', required: true, placeholder: 'Engineer name and email' },
          { key: 'target_resolution_date', label: 'Target resolution date', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'Raise problem record',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/support/problem-records', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'support-rfc-new',
    title: 'Submit RFC (change request)',
    subtitle: 'Wave W47 — ITIL 4 change enablement / CAB approval',
    steps: [
      {
        title: 'Change details',
        fields: [
          { key: 'change_title', label: 'Change title', type: 'text', required: true },
          { key: 'change_type', label: 'Change type', type: 'select', required: true, options: [{ value: 'standard', label: 'Standard (pre-approved)' }, { value: 'normal', label: 'Normal (CAB required)' }, { value: 'emergency', label: 'Emergency (ECAB fast-path)' }] },
          { key: 'description', label: 'Description', type: 'textarea', required: true, placeholder: 'What is changing and why?' },
          { key: 'risk_level', label: 'Risk level', type: 'select', required: true, options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }] },
        ],
      },
      {
        title: 'Schedule',
        fields: [
          { key: 'planned_start', label: 'Planned start date', type: 'date', required: true },
          { key: 'planned_end', label: 'Planned end date', type: 'date', required: true },
          { key: 'cab_required', label: 'CAB approval required?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No — standard change' }] },
          { key: 'rollback_plan', label: 'Rollback plan', type: 'textarea', required: true, placeholder: 'Step-by-step rollback instructions…' },
        ],
      },
    ],
    submitLabel: 'Submit RFC',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/support/change-requests', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'support-security-remediation',
    title: 'Manage security remediation',
    subtitle: 'Wave W55 — OT vulnerability remediation (CVSS tiering)',
    steps: [
      {
        title: 'Vulnerability',
        fields: [
          { key: 'cve_id', label: 'CVE ID', type: 'text', required: true, placeholder: 'e.g. CVE-2026-12345' },
          { key: 'cvss_score', label: 'CVSS score', type: 'number', required: true, placeholder: 'e.g. 9.8' },
          { key: 'affected_component', label: 'Affected component', type: 'text', required: true, placeholder: 'e.g. SCADA gateway firmware v2.3.1' },
          { key: 'discovery_source', label: 'Discovery source', type: 'select', required: true, options: [{ value: 'automated_scan', label: 'Automated scan' }, { value: 'penetration_test', label: 'Penetration test' }, { value: 'threat_intel', label: 'Threat intelligence' }, { value: 'bug_bounty', label: 'Bug bounty' }, { value: 'vendor_advisory', label: 'Vendor advisory' }] },
        ],
      },
      {
        title: 'Remediation',
        fields: [
          { key: 'remediation_approach', label: 'Remediation approach', type: 'select', required: true, options: [{ value: 'patch_apply', label: 'Apply patch' }, { value: 'configuration_change', label: 'Configuration change' }, { value: 'compensating_control', label: 'Compensating control' }, { value: 'accept_risk', label: 'Accept risk (with justification)' }] },
          { key: 'owner', label: 'Remediation owner', type: 'text', required: true, placeholder: 'Name and email' },
          { key: 'target_date', label: 'Target remediation date', type: 'date', required: true },
        ],
      },
    ],
    submitLabel: 'Create remediation record',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/support/security-remediations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
];

const SUPPORT_TOUR: TourDef = {
  id: 'support-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Support workstation', body: 'ITIL 4 aligned support hub — incident management, problem investigation, change enablement, firmware patches, warranty recovery, and SLA reporting.', placement: 'bottom' },
    { target: 'kpi-row', title: 'SLA KPIs', body: 'Open P1/P2 incidents, SLA compliance rate, problems under investigation, and RFCs awaiting CAB. P1 SLA breaches are platform-level emergencies.', placement: 'bottom' },
    { target: 'tab-nav', title: 'ITIL workflow tabs', body: 'Incidents, problems, changes, security remediations, spare parts, and warranty recovery — each backed by a live ITIL-4 state machine.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Raise a P1–P4 ticket, open a problem investigation, or submit an RFC — all with ITIL guidance and SLA timer information at each step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'See all support actions: CSAT management, SLA performance reporting, vendor escalations, and spare parts provisioning.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'Tenant-reported incidents, security vulnerability alerts, and OEM warranty claims arrive here for triage.', placement: 'left' },
  ],
};

export function SupportWorkstationPage() {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  const [escalating, setEscalating] = useState<any | null>(null);
  const [loggingAccess, setLoggingAccess] = useState(false);
  return (
    <>
      <WorkstationShell
        role="support"
        eyebrow="Support · Workstation"
        title="Support workstation"
        subtitle="Tickets · Escalations · Cross-tenant access audit. All the support tooling — no external ticketing system needed."
        backHref="/support"
        backLabel="Support console"
        wizards={SUPPORT_WIZARDS}
        tour={SUPPORT_TOUR}
        tabs={[
          {
            key: 'tickets',
            label: 'Tickets',
            body: ({ onRefresh }) => (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
                    + File ticket
                  </button>
                </div>
                <ListingTable
                  endpoint="/support/tickets"
                  rowKey={(r) => r.id}
                  rowHref={(r) => `/support/tickets/${r.id}`}
                  empty={{ title: 'No tickets', description: 'Tickets reported by users (or filed on their behalf) will appear here.' }}
                  columns={[
                    { key: 'ticket_number', label: 'Ticket', render: (r) => <span className="font-mono text-[11px]">{r.ticket_number}</span> },
                    { key: 'subject', label: 'Subject', render: (r) => <span className="block truncate max-w-md" title={r.subject}>{r.subject}</span> },
                    { key: 'category', label: 'Category', render: (r) => <Pill tone="info">{r.category}</Pill> },
                    { key: 'priority', label: 'Priority', render: (r) => <Pill tone={r.priority === 'urgent' ? 'bad' : r.priority === 'high' ? 'warn' : 'neutral'}>{r.priority}</Pill> },
                    { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' || r.status === 'closed' ? 'good' : r.status === 'open' ? 'bad' : 'warn'}>{r.status.replace(/_/g, ' ')}</Pill> },
                    { key: 'created_at', label: 'Filed', render: (r) => new Date(r.created_at).toLocaleString() },
                    { key: '_actions', label: '', render: (r) => (
                      (r.status !== 'resolved' && r.status !== 'closed') ? (
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Transition</button>
                          <button type="button" onClick={() => setEscalating(r)} className="px-2 py-1 text-[11px] bg-amber-600 text-white rounded">Escalate</button>
                        </div>
                      ) : null
                    ) },
                  ]}
                />
                {filing && <FileTicketModal onClose={() => setFiling(false)} onDone={() => { setFiling(false); onRefresh(); }} />}
                {transitioning && (
                  <ActionModal
                    title={`Ticket ${transitioning.ticket_number} · current: ${transitioning.status}`}
                    submitLabel="Transition"
                    fields={[
                      { key: 'to', label: 'To', type: 'select', required: true, options: [
                        { value: 'in_progress', label: 'In progress' },
                        { value: 'waiting_on_customer', label: 'Waiting on customer' },
                        { value: 'resolved', label: 'Resolved' },
                        { value: 'closed', label: 'Closed' },
                      ] },
                      { key: 'resolution', label: 'Resolution (resolved/closed only)', type: 'textarea' },
                      { key: 'assignee_id', label: 'Assignee (optional)', type: 'lookup', lookupEndpoint: '/api/lookup/participants', lookupAutoFill: { assignee_name: 'name' } },
                    ] as FieldSpec[]}
                    onClose={() => setTransitioning(null)}
                    onSubmit={async (v) => {
                      await api.post(`/support/tickets/${transitioning.id}/transition`, v);
                      setTransitioning(null); onRefresh();
                    }}
                  />
                )}
                {escalating && (
                  <ActionModal
                    title={`Escalate ticket ${escalating.ticket_number}`}
                    submitLabel="Escalate"
                    fields={[
                      { key: 'escalated_to', label: 'Escalate to (participant)', type: 'lookup', lookupEndpoint: '/api/lookup/participants', required: true },
                      { key: 'reason', label: 'Reason', type: 'textarea', required: true },
                    ] as FieldSpec[]}
                    onClose={() => setEscalating(null)}
                    onSubmit={async (v) => {
                      await api.post(`/support/tickets/${escalating.id}/escalate`, v);
                      setEscalating(null); onRefresh();
                    }}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'ticket_chain',
            label: 'Ticket chain',
            chainKey: 'support_tickets',
            body: () => <SupportTicketChainTab />,
          },
          {
            key: 'problem_chain',
            label: 'Problems',
            chainKey: 'problem_record',
            body: () => <ProblemManagementChainTab />,
          },
          {
            key: 'change_chain',
            label: 'Changes',
            chainKey: 'change_request',
            body: () => <ChangeEnablementChainTab />,
          },
          {
            key: 'security_remediation',
            label: 'Vuln remediation',
            chainKey: 'security_remediation',
            body: () => <SecurityRemediationChainTab />,
          },
          {
            key: 'warranty_recovery',
            label: 'Warranty recovery',
            chainKey: 'warranty_recovery',
            body: () => <WarrantyRecoveryChainTab />,
          },
          {
            key: 'spare_parts',
            label: 'Spare parts',
            chainKey: 'spare_parts_provisioning',
            body: () => <SparePartsProvisioningChainTab />,
          },
          {
            key: 'service_contracts',
            label: 'Service contracts',
            chainKey: 'service_contract',
            body: () => <ServiceContractChainTab />,
          },
          {
            key: 'service-request',
            label: 'Service requests',
            chainKey: 'service_request',
            body: () => <ServiceRequestChainTab />,
          },
          {
            key: 'oem_fco',
            label: 'OEM FCO/ECN',
            chainKey: 'oem_fco',
            body: () => <OemFcoChainTab />,
          },
          {
            key: 'csat',
            label: 'CSAT lifecycle (W208)',
            chainKey: 'csat_record',
            body: ({ onRefresh }) => <CsatLifecycleTab onRefresh={onRefresh} />,
          },
          {
            key: 'sla_performance_reports',
            label: 'SLA performance reports (W217)',
            chainKey: 'sla_performance_report',
            body: ({ onRefresh }) => <SlaPerformanceReportTab onRefresh={onRefresh} />,
          },
          {
            key: 'mqtt-opcua-connectors',
            label: 'MQTT/OPC-UA connectors (W123)',
            body: () => <MqttOpcuaConnectorTab />,
          },
          {
            key: 'anomaly-detection-ml',
            label: 'Anomaly ML (W127)',
            body: () => <AnomalyDetectionMlTab />,
          },
          {
            key: 'rul-prediction-ml',
            label: 'RUL Prediction ML (W128)',
            body: () => <RulPredictionMlTab />,
          },
          {
            key: 'fault-fingerprint-ml',
            label: 'Fault Fingerprint ML (W129)',
            body: () => <FaultFingerprintMlTab />,
          },
          {
            key: 'escalations',
            label: 'Escalations',
            body: () => (
              <ListingTable
                endpoint="/support/escalations"
                rowKey={(r) => r.id}
                empty={{ title: 'No escalations', description: 'Tickets that bubble up to engineering / management will appear here.' }}
                columns={[
                  { key: 'ticket_id', label: 'Ticket', render: (r) => <span className="font-mono text-[11px]">{(r.ticket_id || '').slice(0, 12)}…</span> },
                  { key: 'escalated_to', label: 'To', render: (r) => <span className="font-mono text-[11px]">{(r.escalated_to || '').slice(0, 18)}…</span> },
                  { key: 'reason', label: 'Reason', render: (r) => <span className="block truncate max-w-md" title={r.reason}>{r.reason}</span> },
                  { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' || r.status === 'accepted' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Pill> },
                  { key: 'escalated_at', label: 'When', render: (r) => new Date(r.escalated_at).toLocaleString() },
                ]}
              />
            ),
          },
          {
            key: 'cross_tenant',
            label: 'Cross-tenant access',
            body: ({ onRefresh }) => (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setLoggingAccess(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
                    + Log access
                  </button>
                </div>
                <ListingTable
                  endpoint="/support/cross-tenant-access"
                  rowKey={(r) => r.id}
                  empty={{ title: 'No cross-tenant access logs', description: 'Every cross-tenant data access is POPIA-logged here.' }}
                  columns={[
                    { key: 'agent_id', label: 'Agent', render: (r) => <span className="font-mono text-[11px]">{(r.agent_id || '').slice(0, 12)}…</span> },
                    { key: 'tenant_accessed', label: 'Tenant', render: (r) => <span className="font-mono text-[11px]">{(r.tenant_accessed || '').slice(0, 12)}…</span> },
                    { key: 'resource_type', label: 'Resource' },
                    { key: 'justification', label: 'Justification', render: (r) => <span className="block truncate max-w-md" title={r.justification}>{r.justification}</span> },
                    { key: 'accessed_at', label: 'When', render: (r) => new Date(r.accessed_at).toLocaleString() },
                  ]}
                />
                {loggingAccess && (
                  <ActionModal
                    title="Log cross-tenant access (POPIA audit)"
                    submitLabel="Log"
                    fields={[
                      { key: 'tenant_accessed', label: 'Tenant ID accessed', required: true },
                      { key: 'resource_type', label: 'Resource type', required: true, placeholder: 'e.g. invoice, contract, project' },
                      { key: 'resource_id', label: 'Resource ID (optional)' },
                      { key: 'justification', label: 'Justification', type: 'textarea', required: true, helperText: 'POPIA requires a documented reason for cross-tenant access.' },
                      { key: 'ticket_id', label: 'Linked ticket (optional)', type: 'lookup', lookupEndpoint: '/api/lookup/tickets', lookupAutoFill: { ticket_ref: 'reference' } },
                    ] as FieldSpec[]}
                    onClose={() => setLoggingAccess(false)}
                    onSubmit={async (v) => {
                      await api.post('/support/cross-tenant-access', v);
                      setLoggingAccess(false); onRefresh();
                    }}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'reports',
            label: 'Reports & Exports',
            body: () => (
              <div className="space-y-8">
                {SUPPORT_REPORTS.map(cfg => (
                  <div key={cfg.endpoint} className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cfg.title}</p>
                    <ReportPanel config={cfg} />
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: 'audit',
            label: 'Audit & compliance',
            body: ({ onRefresh }) => (
              <AuditPanel
                prefix="/support"
                reconHint="external_ref,agent_email,tenant_accessed,accessed_at"
                reconSourceOptions={['zendesk', 'jira', 'freshdesk', 'manual']}
                onChange={onRefresh}
              />
            ),
          },
        ]}
      />
    </>
  );
}

// ─── W208: CSAT Lifecycle ─────────────────────────────────────────────────────
const CSAT_TIER_TONE: Record<string, 'bad' | 'warn' | 'neutral'> = {
  p1_critical: 'bad', p2_high: 'warn', p3_medium: 'neutral', p4_low: 'neutral',
};

function CsatLifecycleTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'action'; id: string; currentStatus: string; tier: string }>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setModal({ type: 'create' })} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + New CSAT record
        </button>
      </div>

      <ListingTable
        endpoint="/csat-records"
        rowKey={(r) => r.id}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status, tier: r.support_tier })}
        empty={{ title: 'No CSAT records', description: 'CSAT surveys created after ticket resolution will appear here.' }}
        columns={[
          { key: 'ticket_id', label: 'Ticket ref', render: (r) => <span className="font-mono text-[11px]">{r.ticket_id ? String(r.ticket_id).slice(0, 14) + '…' : '—'}</span> },
          { key: 'support_tier', label: 'Tier', render: (r) => <Pill tone={CSAT_TIER_TONE[r.support_tier as string] ?? 'neutral'}>{String(r.support_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['closed_satisfied'].includes(r.chain_status as string) ? 'good' : ['closed_escalated', 'no_response'].includes(r.chain_status as string) ? 'neutral' : ['escalated'].includes(r.chain_status as string) ? 'bad' : 'warn'}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'csat_score', label: 'Score', render: (r) => r.csat_score != null ? <span className={`font-semibold ${Number(r.csat_score) >= 4 ? 'text-green-700' : Number(r.csat_score) <= 2 ? 'text-red-600' : 'text-amber-600'}`}>{r.csat_score}/5</span> : <span className="text-[#8fa3bd]">—</span> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'created_at', label: 'Created', render: (r) => new Date(r.created_at as string).toLocaleDateString() },
        ]}
      />

      {modal?.type === 'create' && (
        <ActionModal
          title="New CSAT record"
          submitLabel="Create"
          fields={[
            { key: 'ticket_id', label: 'Ticket (reference)', type: 'lookup', lookupEndpoint: '/api/lookup/tickets', lookupAutoFill: { ticket_ref: 'reference' } },
            { key: 'support_tier', label: 'Support tier', type: 'select', required: true, options: [
              { value: 'p1_critical', label: 'P1 Critical (24h SLA)' },
              { value: 'p2_high', label: 'P2 High (48h SLA)' },
              { value: 'p3_medium', label: 'P3 Medium (72h SLA)' },
              { value: 'p4_low', label: 'P4 Low (120h SLA)' },
            ]} as FieldSpec,
            { key: 'sla_met', label: 'Was SLA met?', type: 'select', options: [
              { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' },
            ]} as FieldSpec,
            { key: 'resolution_time_minutes', label: 'Resolution time (minutes)', type: 'number' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => { setModal(null); }}
          onSubmit={async (v) => {
            await api.post('/csat-records', {
              ...v,
              sla_met: v.sla_met === 'true' ? true : v.sla_met === 'false' ? false : undefined,
              resolution_time_minutes: v.resolution_time_minutes ? Number(v.resolution_time_minutes) : undefined,
            });
            setModal(null); onRefresh();
          }}
        />
      )}

      {modal?.type === 'action' && (
        <ActionModal
          title={`CSAT — ${modal.tier} — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'send_survey', label: 'Send survey' },
              { value: 'record_response', label: 'Record response' },
              { value: 'analyse_score', label: 'Analyse score' },
              { value: 'send_follow_up', label: 'Send follow-up' },
              { value: 'record_follow_up_response', label: 'Record follow-up response' },
              { value: 'escalate_to_management', label: 'Escalate to management' },
              { value: 'close_satisfied', label: 'Close — satisfied' },
              { value: 'close_escalated', label: 'Close — escalated' },
              { value: 'expire_no_response', label: 'Expire (no response)' },
            ]} as FieldSpec,
            { key: 'csat_score', label: 'CSAT score (1–5)', type: 'number' },
            { key: 'csat_comment', label: 'Customer comment' },
            { key: 'escalation_reason', label: 'Escalation reason' },
            { key: 'reason', label: 'Internal notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            await api.post(`/csat-records/${modal.id}/action`, {
              ...v,
              csat_score: v.csat_score ? Number(v.csat_score) : undefined,
            });
            setModal(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function FileTicketModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('feature_question');
  const [priority, setPriority] = useState('normal');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!subject.trim()) { setErr('Subject required.'); return; }
    setSaving(true); setErr(null);
    try {
      await api.post('/support/tickets', { subject, description, category, priority });
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#0f1c2e]">File a ticket</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <div className="text-[12px] text-red-700">{err}</div>}
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg" />
          </label>
          <label className="block text-[13px]">
            <span className="text-[#6b7685]">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg resize-none" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px]">
              <span className="text-[#6b7685]">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
                <option value="access">Access</option>
                <option value="billing">Billing</option>
                <option value="feature_question">Feature question</option>
                <option value="bug">Bug</option>
                <option value="data_issue">Data issue</option>
                <option value="compliance">Compliance</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block text-[13px]">
              <span className="text-[#6b7685]">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[#dde4ec] rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 bg-[#1a3a5c] text-white rounded-lg disabled:opacity-50">
              {saving ? 'Filing…' : 'File ticket'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── W217: SLA Performance Report ─────────────────────────────────────────────
const SPR_TIER_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good' | 'neutral'> = {
  standard: 'info',
  enhanced: 'info',
  critical: 'warn',
  enterprise: 'bad',
};

function sprStatusTone(s: string): 'info' | 'warn' | 'bad' | 'good' | 'neutral' {
  if (s === 'approved') return 'good';
  if (s === 'disputed' || s === 'remediation_plan') return 'bad';
  if (s === 'management_review') return 'warn';
  return 'info';
}

type SprModal = null | 'create' | { type: 'action'; id: string; currentStatus: string };

function SlaPerformanceReportTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<SprModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => { setRefreshKey(k => k + 1); onRefresh(); };

  return (
    <div>
      <button type="button"
        onClick={() => setModal('create')}
        className="mb-4 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
      >
        Open reporting period
      </button>
      <ListingTable
        endpoint="/sla-performance-reports"
        key={refreshKey}
        rowKey={(r) => r.id}
        empty={{ title: 'No SLA performance reports', description: 'ITIL 4 SLA performance reports will appear here.' }}
        columns={[
          { key: 'reporting_period', label: 'Period', render: (r) => <span className="font-mono text-[11px]">{r.reporting_period}</span> },
          { key: 'report_tier', label: 'Tier', render: (r) => <Pill tone={SPR_TIER_TONE[r.report_tier] ?? 'neutral'}>{String(r.report_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'overall_sla_pct', label: 'SLA %', align: 'right', render: (r) => r.overall_sla_pct != null ? `${Number(r.overall_sla_pct).toFixed(1)}%` : '—' },
          { key: 'total_incidents', label: 'Incidents', align: 'right', render: (r) => r.total_incidents ?? 0 },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={sprStatusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Open SLA performance report period"
          submitLabel="Open"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/sla-performance-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                reporting_period: v.reporting_period,
                period_start: v.period_start,
                period_end: v.period_end,
                report_tier: v.report_tier,
                target_sla_pct: v.target_sla_pct ? parseFloat(v.target_sla_pct) : undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            { key: 'reporting_period', label: 'Reporting period', required: true, placeholder: 'Dec-2025' },
            { key: 'period_start', label: 'Period start (ISO)', required: true, placeholder: '2025-12-01T00:00:00Z' },
            { key: 'period_end', label: 'Period end (ISO)', required: true, placeholder: '2025-12-31T23:59:59Z' },
            {
              key: 'report_tier', label: 'Service tier', type: 'select', required: true, defaultValue: 'standard',
              options: [
                { value: 'standard', label: 'Standard — monthly (14d SLA)' },
                { value: 'enhanced', label: 'Enhanced — board visibility (21d SLA)' },
                { value: 'critical', label: 'Critical — mission-critical (30d SLA)' },
                { value: 'enterprise', label: 'Enterprise — weekly deep-dive (45d SLA)' },
              ],
            },
            { key: 'target_sla_pct', label: 'Target SLA %', type: 'number', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ] as FieldSpec[]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`SLA report action — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/sla-performance-reports/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                total_incidents: v.total_incidents ? parseInt(v.total_incidents, 10) : undefined,
                p1_count: v.p1_count ? parseInt(v.p1_count, 10) : undefined,
                p2_count: v.p2_count ? parseInt(v.p2_count, 10) : undefined,
                p1_sla_pct: v.p1_sla_pct ? parseFloat(v.p1_sla_pct) : undefined,
                p2_sla_pct: v.p2_sla_pct ? parseFloat(v.p2_sla_pct) : undefined,
                overall_sla_pct: v.overall_sla_pct ? parseFloat(v.overall_sla_pct) : undefined,
                rca_triggered: v.rca_triggered === 'true',
                rca_lead: v.rca_lead || undefined,
                rca_findings: v.rca_findings || undefined,
                root_causes: v.root_causes || undefined,
                reviewer_name: v.reviewer_name || undefined,
                remediation_plan_ref: v.remediation_plan_ref || undefined,
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
                { value: 'calculate_metrics', label: 'Calculate metrics' },
                { value: 'initiate_rca', label: 'Initiate RCA for misses' },
                { value: 'complete_rca', label: 'Complete RCA — findings ready' },
                { value: 'submit_for_review', label: 'Submit for management review' },
                { value: 'approve', label: 'Approve report' },
                { value: 'dispute', label: 'Dispute measurements' },
                { value: 'escalate_remediation', label: 'Escalate — remediation plan required' },
                { value: 'withdraw', label: 'Withdraw period' },
              ],
            },
            { key: 'total_incidents', label: 'Total incidents', type: 'number', required: false },
            { key: 'p1_count', label: 'P1 count', type: 'number', required: false },
            { key: 'p2_count', label: 'P2 count', type: 'number', required: false },
            { key: 'p1_sla_pct', label: 'P1 SLA %', type: 'number', required: false },
            { key: 'p2_sla_pct', label: 'P2 SLA %', type: 'number', required: false },
            { key: 'overall_sla_pct', label: 'Overall SLA %', type: 'number', required: false },
            { key: 'rca_triggered', label: 'RCA required?', type: 'select', required: false, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
            { key: 'rca_lead', label: 'RCA lead', required: false },
            { key: 'rca_findings', label: 'RCA findings', type: 'textarea', required: false },
            { key: 'root_causes', label: 'Root causes (JSON)', type: 'textarea', required: false },
            { key: 'reviewer_name', label: 'Reviewer name', required: false },
            { key: 'remediation_plan_ref', label: 'Remediation plan reference', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ] as FieldSpec[]}
        />
      )}
    </div>
  );
}
