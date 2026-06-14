import React from 'react';
import { WorkstationShell, ListingTable, Pill } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { CyberIncidentChainTab } from '../cyber/CyberIncidentChainTab';
import { ServiceContractChainTab } from '../service-contract/ServiceContractChainTab';
import type { WizardSpec } from '../launch/WizardModal';
import type { TourDef } from '../launch/ProductTour';

const ESCO_WIZARDS: WizardSpec[] = [
  {
    id: 'esco-complete-setup',
    title: 'Set up your ESCO workstation',
    subtitle: 'Configure O&M contracts, operations, asset health, supply chain, and safety for your service portfolio',
    steps: [
      {
        title: 'Service portfolio & contracts',
        description: 'Set up Service contracts, multi-client site portfolio, O&M billing targets, and contract SLA tiers.',
        aiHint: 'Each service contract defines the SLA tier that governs your work orders and availability guarantee obligations for that client. Align SLA tiers with the availability guarantees committed in each contract (Wave W51) — a breach of the availability guarantee triggers automatic liquidated damages claims against you. Set your standard O&M response times per tier now.',
        fields: [
          { key: 'client_count', label: 'Number of active clients', type: 'number', placeholder: 'e.g. 8 IPP clients' },
          { key: 'site_count', label: 'Total sites under management', type: 'number', placeholder: 'e.g. 24 sites' },
          { key: 'default_availability_target', label: 'Default availability guarantee target (%)', type: 'number', placeholder: 'e.g. 97.5' },
          { key: 'wo_response_hours_critical', label: 'Critical WO response time (hours)', type: 'number', placeholder: 'e.g. 4' },
        ],
      },
      {
        title: 'O&M operations',
        description: 'Configure Work orders (W16), PM compliance (W59), Permit-to-work/LOTO (W64), and performance ratio monitoring (W24).',
        aiHint: 'Work orders follow a 12-state lifecycle — emergency WOs must have a PTW issued within 1 hour of dispatch. PM compliance (Wave W59) uses RCM (reliability-centred maintenance) criticality tiers. Skip-PM approvals for critical assets require an engineering manager sign-off and trigger a regulatory notice. Permit-to-work (Wave W64) is mandatory for live electrical and confined-space work — every PTW must identify an authorised issuer.',
        fields: [
          { key: 'ptw_issuer_name', label: 'Authorised PTW issuer (name)', type: 'text', placeholder: 'Name and certification reference' },
          { key: 'pm_schedule_source', label: 'PM schedule source', type: 'select', options: [{ value: 'oem_manual', label: 'OEM maintenance manual' }, { value: 'rcm_analysis', label: 'RCM analysis (customised intervals)' }, { value: 'iso_55000', label: 'ISO 55000 asset management plan' }] },
          { key: 'pr_underperformance_threshold_pct', label: 'PR underperformance alert threshold (%)', type: 'number', placeholder: 'e.g. 5 — alert when PR drops >5% below target' },
        ],
      },
      {
        title: 'Predictive asset health',
        description: 'Configure Asset prognostics (W71), Availability guarantees (W51), and Spare parts provisioning (W72).',
        aiHint: 'The prognostics engine (Wave W71) runs a 6-method anomaly ensemble and 12-mode physics fault fingerprinting on site telemetry. It quantifies revenue-at-risk in ZAR for every prediction. Wire it to your availability guarantees — when RUL drops below your spare parts lead time, the system automatically raises a parts requisition. Set your preferred VED criticality stock levels: Vital parts = zero stockout tolerance.',
        fields: [
          { key: 'rul_warning_days', label: 'RUL advance warning (days)', type: 'number', placeholder: 'e.g. 60 — trigger parts order when < 60 days to predicted failure' },
          { key: 'anomaly_sensitivity', label: 'Anomaly detection sensitivity', type: 'select', options: [{ value: 'high', label: 'High (3σ)' }, { value: 'medium', label: 'Medium (2.5σ — recommended)' }, { value: 'low', label: 'Low (2σ)' }] },
          { key: 'vital_parts_min_stock', label: 'Vital parts minimum stock (units)', type: 'number', placeholder: 'e.g. 2 per site type' },
        ],
      },
      {
        title: 'Safety & vendor management',
        description: 'Configure HSE incidents (W25), Vendor escalations (W35), Warranty claims (W15), and Warranty recovery (W63).',
        aiHint: 'OHSA §24 requires that all serious injuries and fatalities be reported to the Department of Labour within 7 days. The HSE incident chain auto-flags OHSA reportable events and generates the required notification. Vendor escalation (Wave W35) gives you the CPA §56/§61 defect dispute chain against suppliers. Warranty recovery (Wave W63) is the commercial follow-through — open a recovery claim within 14 days of completing the warranty repair.',
        fields: [
          { key: 'hse_reporting_officer', label: 'OHSA reporting officer (name + title)', type: 'text', placeholder: 'e.g. John Smith — SHEQ Manager' },
          { key: 'primary_oem_vendor', label: 'Primary OEM vendor for escalations', type: 'text', placeholder: 'e.g. Huawei FusionSolar, SMA, Solax' },
          { key: 'warranty_claim_deadline_days', label: 'Warranty claim submission deadline (days)', type: 'number', placeholder: 'e.g. 30 days from fault detection' },
        ],
      },
      {
        title: 'Site commissioning',
        description: 'Set up Site commissioning workflow (W12), Smart meter registration, and data source integrations.',
        aiHint: 'Site commissioning (Wave W12) has 9 states from planned through to in_om. The commissioning chain enforces NERSA §C-5 hold-points — do not skip the protection relay test or the grid synchronisation test steps. Smart meter registration links the site to the settlement metering chain — meter serial numbers must match the NTCSA / Eskom metering database.',
        fields: [
          { key: 'inverter_brand', label: 'Primary inverter brand(s)', type: 'select', options: [{ value: 'huawei', label: 'Huawei FusionSolar' }, { value: 'solax', label: 'Solax' }, { value: 'sma', label: 'SMA' }, { value: 'fronius', label: 'Fronius' }, { value: 'mixed', label: 'Mixed fleet' }] },
          { key: 'commissioning_ie', label: 'Independent Engineer for commissioning', type: 'text', placeholder: 'Name and firm — required for plants >1MW' },
          { key: 'meter_serial_prefix', label: 'Meter serial number prefix', type: 'text', placeholder: 'e.g. OE-MTR-' },
        ],
      },
    ],
    submitLabel: 'Save ESCO configuration',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/esco/config', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }).catch(() => {});
    },
  },
  {
    id: 'esco-commission-site',
    title: 'Commission a new site',
    subtitle: 'NERSA §C-5 + IEC 62446 — 9-state commissioning chain',
    steps: [
      {
        title: 'Site details',
        description: 'Register the site in the commissioning chain.',
        aiHint: 'The commissioning chain creates a hold-point record for each mandatory test: protection relay, grid synchronisation, and NERSA commissioning inspection. Each hold-point must be witnessed and signed before the chain advances.',
        fields: [
          { key: 'site_name', label: 'Site name', type: 'text', required: true, placeholder: 'e.g. Saldanha Wind Farm — Unit 3' },
          { key: 'installed_capacity_kw', label: 'Installed capacity (kW)', type: 'number', required: true, placeholder: 'e.g. 2500' },
          { key: 'technology', label: 'Technology', type: 'select', required: true, options: [{ value: 'solar_pv', label: 'Solar PV' }, { value: 'wind', label: 'Wind' }, { value: 'bess', label: 'Battery storage (BESS)' }, { value: 'hybrid', label: 'Hybrid (PV + BESS)' }] },
        ],
      },
      {
        title: 'Contract & client',
        description: 'Link the site to a service contract and client.',
        aiHint: 'The service contract defines your availability SLA obligations for this site. If no contract is linked, availability guarantees cannot be automatically generated. Link the contract before energisation.',
        fields: [
          { key: 'client_name', label: 'IPP client name', type: 'text', required: true, placeholder: 'e.g. Saldanha Wind IPP (Pty) Ltd' },
          { key: 'contract_reference', label: 'O&M contract reference', type: 'text', placeholder: 'Contract number or reference' },
          { key: 'cod_target_date', label: 'Target COD date', type: 'date' },
        ],
      },
      {
        title: 'Commissioning team',
        description: 'Assign the commissioning team and witnesses.',
        aiHint: 'All commissioning hold-points require a qualified commissioning engineer signature. Plants >1MW require an independent engineer witness for the NERSA commissioning inspection. Confirm all team members are SAQCC/ECSA registered before starting.',
        fields: [
          { key: 'commissioning_engineer', label: 'Lead commissioning engineer', type: 'text', required: true, placeholder: 'Name and ECSA registration number' },
          { key: 'independent_engineer', label: 'Independent engineer witness', type: 'text', placeholder: 'Required for plants >1MW' },
          { key: 'planned_commissioning_date', label: 'Planned commissioning date', type: 'date' },
        ],
      },
    ],
    submitLabel: 'Create commissioning record',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/esums/commissioning', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Commissioning record creation failed'); }
    },
  },
  {
    id: 'esco-raise-wo',
    title: 'Raise a work order',
    subtitle: 'IEC 62446 — 12-state work order dispatch',
    steps: [
      {
        title: 'Fault description',
        description: 'Describe the fault and classify the work order.',
        aiHint: 'Emergency WOs (safety hazard or revenue loss >50%) trigger a 4-hour response SLA. Corrective WOs (equipment failure, no immediate safety risk) have a 24-hour response window. Preventive WOs follow your PM schedule intervals. Classify accurately — downgrading an emergency to corrective to avoid SLA is an audit risk.',
        fields: [
          { key: 'site_id', label: 'Site', type: 'text', required: true, placeholder: 'Site name or ID' },
          { key: 'fault_description', label: 'Fault description', type: 'textarea', required: true, placeholder: 'What has failed? What was observed? Include alarm codes if available.' },
          { key: 'wo_type', label: 'Work order type', type: 'select', required: true, options: [{ value: 'emergency', label: 'Emergency — safety hazard or >50% revenue impact' }, { value: 'corrective', label: 'Corrective — equipment failure' }, { value: 'preventive', label: 'Preventive — scheduled PM' }] },
        ],
      },
      {
        title: 'Assignment & permit',
        description: 'Assign the technician and determine PTW requirement.',
        aiHint: 'All electrical work >1kV requires a Permit-to-Work (PTW). Confined space entry also requires a separate Entry Permit. If in doubt, issue the PTW — working without one when required is a OHSA criminal offence for both the supervisor and the technician.',
        fields: [
          { key: 'assigned_technician', label: 'Assigned technician', type: 'text', required: true, placeholder: 'Technician name' },
          { key: 'ptw_required', label: 'PTW / LOTO required?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes — issue PTW before work commences' }, { value: 'no', label: 'No — low voltage ≤1kV, no isolation required' }] },
          { key: 'target_completion_date', label: 'Target completion date', type: 'date' },
        ],
      },
    ],
    submitLabel: 'Create work order',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/esums/work-orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Work order creation failed'); }
    },
  },
  {
    id: 'esco-pm-schedule',
    title: 'Set up a PM schedule',
    subtitle: 'IEC 62446 + RCM — preventive maintenance scheduling',
    steps: [
      {
        title: 'PM plan details',
        description: 'Define the preventive maintenance schedule for a site or asset group.',
        aiHint: 'PM intervals must follow OEM recommended service intervals as a minimum. RCM analysis may extend intervals for low-criticality assets but must be documented and approved by the engineering manager. Critical assets (uptime >99.5% required) should use condition-based maintenance — wire them to the prognostics engine so PM is triggered by degradation signals, not calendar.',
        fields: [
          { key: 'site_id', label: 'Site', type: 'text', required: true, placeholder: 'Site name or ID' },
          { key: 'pm_type', label: 'PM type', type: 'select', required: true, options: [{ value: 'quarterly', label: 'Quarterly inspection' }, { value: 'annual', label: 'Annual overhaul' }, { value: 'biannual', label: 'Bi-annual service' }, { value: 'condition_based', label: 'Condition-based (linked to prognostics)' }] },
          { key: 'criticality_tier', label: 'Asset criticality tier', type: 'select', required: true, options: [{ value: 'critical', label: 'Critical — zero downtime tolerance' }, { value: 'essential', label: 'Essential — <4h downtime acceptable' }, { value: 'standard', label: 'Standard — scheduled window acceptable' }] },
        ],
      },
      {
        title: 'Schedule & resources',
        description: 'Set the PM schedule dates and resource requirements.',
        aiHint: 'Schedule PM windows outside peak generation hours (typically 09:00–15:00 SAST for solar). Notify the grid operator (NTCSA/Eskom) 5 business days before any planned shutdown >1MW. The PM compliance chain auto-raises the notification and tracks its acknowledgement.',
        fields: [
          { key: 'next_pm_date', label: 'Next PM date', type: 'date', required: true },
          { key: 'estimated_duration_hours', label: 'Estimated duration (hours)', type: 'number', placeholder: 'e.g. 8' },
          { key: 'lead_technician', label: 'Lead technician', type: 'text', placeholder: 'Name — must be OEM-certified' },
        ],
      },
      {
        title: 'Compliance & spares',
        description: 'Confirm regulatory notifications and verify spare parts stock.',
        aiHint: 'For PM on plants >1MW, a 5-business-day advance notice to the grid operator is mandatory under NERSA Grid Code §CSC-3. The PM compliance chain generates this notice automatically — verify the operator contact is correct. Check spare parts inventory for consumables needed during this PM before confirming the schedule.',
        fields: [
          { key: 'grid_operator_notified', label: 'Grid operator notification', type: 'select', options: [{ value: 'system', label: 'Auto-notify via platform (recommended)' }, { value: 'manual', label: 'Manual notification (email)' }, { value: 'not_required', label: 'Not required (<1MW)' }] },
          { key: 'spares_pre_checked', label: 'Spare parts inventory checked?', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes — all consumables confirmed in stock' }, { value: 'no', label: 'No — raise parts requisition first' }] },
        ],
      },
    ],
    submitLabel: 'Create PM schedule',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/esums/pm-compliance', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'PM schedule creation failed'); }
    },
  },
];

const ESCO_TOUR: TourDef = {
  id: 'esco-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'ESCO workstation', body: 'Your O&M service hub — manage work orders, PM compliance, permit-to-work, predictive asset health, spare parts, and availability guarantees across your entire client portfolio.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Portfolio KPIs', body: 'Active service contracts, open work orders, PM compliance rate, active PTWs, and fleet availability. Red indicators flag SLA breaches that trigger liquidated damages.', placement: 'bottom' },
    { target: 'tab-nav', title: 'O&M workflows', body: 'Every O&M chain is a live state machine: work orders, PM schedules, permit-to-work, prognostics, availability guarantees, spare parts, vendor escalations, HSE incidents, and warranty.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Commission a new site, raise an emergency work order, set up a PM schedule, or run a complete ESCO configuration — all guided with AI hints at each step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'Full capability index: every O&M workflow available to the ESCO role, grouped by area and deep-linked to the relevant workstation tab.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'Client-raised SLA exceptions, availability shortfall notifications, and warranty claims requiring ESCO response arrive here for triage.', placement: 'left' },
  ],
};

export function EscoWorkstationPage() {
  return (
    <WorkstationShell
      role="esco"
      eyebrow="ESCO · Workstation"
      title="O&M operations workstation"
      subtitle="Site portfolio → Work orders & PM → Asset health → Safety & permits → Supply chain → Compliance"
      wizards={ESCO_WIZARDS}
      tour={ESCO_TOUR}
      tabs={[
        { key: 'service-contracts', label: 'Service contracts', group: 'Site portfolio', chainKey: 'service_contract', body: () => <ServiceContractChainTab /> },
        {
          key: 'sites-portfolio',
          label: 'Sites under management',
          group: 'Site portfolio',
          body: () => (
            <ListingTable
              endpoint="/esums/commissioning"
              rowKey={(r) => r.id}
              empty={{ title: 'No sites', description: 'Commissioned sites under O&M management will appear here.' }}
              columns={[
                { key: 'site_name', label: 'Site', render: (r) => <span className="font-medium">{r.site_name}</span> },
                { key: 'installed_capacity_kw', label: 'Capacity', render: (r) => r.installed_capacity_kw != null ? `${(r.installed_capacity_kw / 1000).toFixed(1)} MW` : '—' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={r.chain_status === 'in_om' ? 'good' : r.chain_status === 'failed' ? 'bad' : 'warn'}>{r.chain_status?.replace(/_/g, ' ')}</Pill> },
                { key: 'client_name', label: 'Client' },
                { key: 'created_at', label: 'Commissioned', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        { key: 'cyber', label: 'Cyber incidents (W26)', group: 'Safety & permits', chainKey: 'cyber_incident', body: () => <CyberIncidentChainTab /> },
        {
          key: 'audit',
          label: 'Audit trail',
          group: 'Reporting & compliance',
          body: () => <AuditPanel prefix="/esums" reconHint="event_id, entity_type, actor_id, timestamp" />,
        },
      ]}
    />
  );
}
