// ════════════════════════════════════════════════════════════════════════
// EsumsOmPage — /esums role workbench.
//
// Bundles the cockpit + CRUD list tabs for the Asset Intelligence module.
// Built on SuitePage so it inherits the platform's tab chrome + AI brief
// panel.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../SuitePage';
import { EsumsOmCockpit } from '../widgets/EsumsOmCockpit';
import { EsumsOmOpportunities } from '../widgets/EsumsOmOpportunities';
import { CommissioningTab } from '../esums/CommissioningTab';
import { WarrantyClaimChainTab } from '../esums/WarrantyClaimChainTab';
import { WoChainTab } from '../esums/WoChainTab';
import { PrChainTab } from '../esums/PrChainTab';
import { HseIncidentChainTab } from '../hse/HseIncidentChainTab';
import { CyberIncidentChainTab } from '../cyber/CyberIncidentChainTab';

export function EsumsOmPage() {
  const tabs: TabSpec[] = [
    {
      key: 'cockpit',
      label: 'Cockpit',
      endpoint: '',
      description: 'Live fleet revenue ticker, fault register with revenue impact, fleet health grid, AI briefing, work order kanban.',
      columns: [],
      customContent: <EsumsOmCockpit />,
    },
    {
      key: 'opportunities',
      label: 'Opportunities',
      endpoint: '',
      description: 'Deterministic rule-based scan of the fleet for monetisable performance improvements. Every card cites its evidence and quantifies annual R upside.',
      columns: [],
      customContent: <EsumsOmOpportunities />,
    },
    {
      key: 'commissioning',
      label: 'Commissioning chain',
      endpoint: '',
      description: 'Site onboarding workflow — planned → registered → devices → ingestion → first telemetry → energised → in O&M. P6-grade audit chain with SLA gates per stage.',
      columns: [],
      customContent: <CommissioningTab />,
    },
    {
      key: 'warranty_claims',
      label: 'Warranty claims',
      endpoint: '',
      description: 'OEM warranty / RMA claim chain — open → triage → submit → ack → review → approve|deny|dispute → fulfill → close. Severity-tiered SLAs (safety 4h / performance 24h / cosmetic 72h). Safety-tier denials and SLA breaches escalate into the regulator inbox.',
      columns: [],
      customContent: <WarrantyClaimChainTab />,
    },
    {
      key: 'wo_chain',
      label: 'WO dispatch chain',
      endpoint: '',
      description: '12-state P6 work order dispatch chain — created → assigned → acknowledged → en route → on site → diagnosing → repairing → testing → completed → verified → closed. Priority-tiered SLAs (critical 15m / 1h per stage). Critical-priority cancels and SLA breaches escalate into the regulator inbox.',
      columns: [],
      customContent: <WoChainTab />,
    },
    {
      key: 'pr_chain',
      label: 'PR chain',
      endpoint: '',
      description: '9-state P6 Performance-Ratio sustained-underperformance chain — monitoring → warning → investigating → RCA → intervention planned → executing → verified → closed (with escalation + false-alarm branches). Tier SLAs (utility 24h warning, 30d intervention). Utility-tier escalations and SLA breaches cross into the regulator inbox.',
      columns: [],
      customContent: <PrChainTab />,
    },
    {
      key: 'hse_chain',
      label: 'HSE incidents',
      endpoint: '',
      description: 'OHSA Section 24 + NEMA Section 30 workplace-safety + environmental incident lifecycle — reported → triaged → authority notified → investigating → CAPA planned/executing → verified → closed (with escalation + false-alarm branches). Tier SLAs (fatal 1h triage; major 4h; environmental 4h). Reportable-tier (fatal/major/environmental) authority notifications, escalations and SLA breaches cross into the regulator inbox.',
      columns: [],
      customContent: <HseIncidentChainTab />,
    },
    {
      key: 'cyber_chain',
      label: 'Cyber incidents',
      endpoint: '',
      description: 'POPIA Section 22 + Cybercrimes Act Section 54 digital-incident lifecycle — detected → triaged → contained → IR notified → subjects notified → investigating → remediation planned/executing → verified → closed (with escalation + false-alarm branches). Tier SLAs (catastrophic 30m triage; major/personal-data 72h IR notification). Reportable-tier (catastrophic/major/personal-data) regulator notifications, escalations and SLA breaches cross into the regulator inbox.',
      columns: [],
      customContent: <CyberIncidentChainTab />,
    },
    {
      key: 'sites',
      label: 'Sites',
      endpoint: '/esums/sites',
      description: 'Generation sites with live KPIs. Click into a site for the asset-level dashboard.',
      columns: [
        { key: 'name', label: 'Site' },
        { key: 'technology', label: 'Tech' },
        { key: 'capacity_mw', label: 'MW',  align: 'right', number: true },
        { key: 'province', label: 'Province' },
        { key: 'device_count', label: 'Devices', align: 'right', number: true },
        { key: 'open_faults', label: 'Open faults', align: 'right', number: true },
        { key: 'revenue_lost_mtd_zar', label: 'Lost MTD', align: 'right', currency: true },
        { key: 'open_wos', label: 'Open WOs', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
    {
      key: 'devices',
      label: 'Devices',
      endpoint: '/esums/devices',
      description: 'Inverters, meters, batteries and sensors across all sites. Filter by site_id.',
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'device_type', label: 'Type' },
        { key: 'manufacturer', label: 'OEM' },
        { key: 'model', label: 'Model' },
        { key: 'rated_kw', label: 'Rated kW', align: 'right', number: true },
        { key: 'firmware_version', label: 'FW' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'last_seen_at', label: 'Last seen', date: true },
      ],
    },
    {
      key: 'faults',
      label: 'Faults',
      endpoint: '/esums/faults',
      description: 'Live fault register with Revenue Impact Engine. Hourly bleed + total loss accumulate in real time.',
      columns: [
        { key: 'site_id',     label: 'Site' },
        { key: 'category',    label: 'Category' },
        { key: 'severity',    label: 'Severity', render: (r) => <StatusPill status={String(r.severity)} /> },
        { key: 'description', label: 'Description' },
        { key: 'detected_at', label: 'Detected', date: true },
        { key: 'hourly_loss_zar', label: 'R/h',  align: 'right', currency: true },
        { key: 'total_loss_zar',  label: 'Lost', align: 'right', currency: true },
        { key: 'status',      label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      rowActions: [
        { label: 'Acknowledge', tone: 'primary', endpoint: '/esums/faults/{id}/acknowledge', confirm: 'Acknowledge this fault?' },
        { label: 'Resolve',     tone: 'default', endpoint: '/esums/faults/{id}/resolve',
          form: { title: 'Resolve fault', endpoint: '', fields: [
            { name: 'root_cause', label: 'Root cause', type: 'textarea', required: true },
          ]}},
      ],
    },
    {
      key: 'workorders',
      label: 'Work orders',
      endpoint: '/esums/work-orders',
      description: '12-state WO lifecycle. Tap a row to drill into the timeline, parts, photos and SLA tracking.',
      columns: [
        { key: 'wo_number',     label: 'WO #' },
        { key: 'site_id',       label: 'Site' },
        { key: 'title',         label: 'Title' },
        { key: 'category',      label: 'Type' },
        { key: 'priority',      label: 'Priority', render: (r) => <StatusPill status={String(r.priority)} /> },
        { key: 'status',        label: 'Status',   render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'technician_name', label: 'Tech' },
        { key: 'sla_deadline',  label: 'SLA', date: true },
      ],
      rowActions: [
        { label: 'Acknowledge', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Acknowledge WO', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true,
              options: [{ value: 'acknowledged', label: 'Acknowledged' }, { value: 'cancelled', label: 'Cancelled' }]},
          ]}},
        { label: 'En route', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Mark en route', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true, options: [{ value: 'en_route', label: 'En route' }]},
          ]}},
        { label: 'On site', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Arrived on site', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true, options: [{ value: 'on_site', label: 'On site' }]},
          ]}},
        { label: 'Complete', tone: 'primary', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Complete WO', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true, options: [{ value: 'completed', label: 'Completed' }]},
            { name: 'resolution_notes', label: 'Resolution notes', type: 'textarea', required: true },
          ]}},
      ],
    },
    {
      key: 'technicians',
      label: 'Team',
      endpoint: '/esums/technicians',
      description: 'Field technicians: skills, certifications, current location, availability.',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'skills', label: 'Skills' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
    {
      key: 'parts',
      label: 'Parts',
      endpoint: '/esums/parts',
      description: 'Parts catalogue and stock. Low-stock items highlighted for reorder.',
      columns: [
        { key: 'part_number', label: 'Part #' },
        { key: 'name', label: 'Name' },
        { key: 'manufacturer', label: 'OEM' },
        { key: 'unit_cost_zar', label: 'Unit cost', align: 'right', currency: true },
        { key: 'current_stock', label: 'Stock', align: 'right', number: true },
        { key: 'min_stock_qty', label: 'Min', align: 'right', number: true },
        { key: 'lead_time_days', label: 'Lead (d)', align: 'right', number: true },
      ],
    },
    {
      key: 'maintenance',
      label: 'Maintenance',
      endpoint: '/esums/maintenance',
      description: 'Scheduled preventive maintenance. Auto-creates work orders 7 days before due date.',
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'task_type', label: 'Task' },
        { key: 'next_due_at', label: 'Next due', date: true },
        { key: 'frequency_days', label: 'Cycle (d)', align: 'right', number: true },
        { key: 'estimated_duration_minutes', label: 'Est. min', align: 'right', number: true },
        { key: 'required_skill', label: 'Skill' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
    {
      key: 'predictions',
      label: 'Predictive',
      endpoint: '/esums/predictions',
      description: 'AI-derived predictive maintenance signals — surfaces likely failures weeks before they happen.',
      params: { status: 'open' },
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'prediction_type', label: 'Prediction' },
        { key: 'confidence', label: 'Confidence', align: 'right', number: true },
        { key: 'estimated_failure_at', label: 'Likely by', date: true },
        { key: 'estimated_loss_zar', label: 'If ignored', align: 'right', currency: true },
        { key: 'recommended_action', label: 'Recommendation' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
    {
      key: 'ingestion',
      label: 'Ingestion',
      endpoint: '/esums/ingestion',
      description: 'OEM connections (Huawei FusionSolar, SolarEdge, SMA, Sungrow, Modbus TCP, Eskom AMR, ...) with last-poll status.',
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'adapter', label: 'Adapter' },
        { key: 'endpoint_url', label: 'Endpoint' },
        { key: 'polling_minutes', label: 'Poll (min)', align: 'right', number: true },
        { key: 'last_poll_at', label: 'Last poll', date: true },
        { key: 'last_status', label: 'Status', render: (r) => <StatusPill status={String(r.last_status)} /> },
      ],
    },
    {
      key: 'alerts',
      label: 'Alerts',
      endpoint: '/esums/alerts',
      description: 'All alerts fired across the fleet in the last 7 days.',
      columns: [
        { key: 'severity', label: 'Severity', render: (r) => <StatusPill status={String(r.severity)} /> },
        { key: 'category', label: 'Category' },
        { key: 'title', label: 'Title' },
        { key: 'site_id', label: 'Site' },
        { key: 'created_at', label: 'When', date: true },
        { key: 'acknowledged_at', label: 'Ack', date: true },
      ],
    },
  ];

  return (
    <SuitePage
      eyebrow="Esums · Operations"
      title="Esums"
      subtitle="Asset Intelligence & Operations — the operational brain that connects physical assets to commercial outcomes."
      tabs={tabs}
      initialTab="cockpit"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}

export default EsumsOmPage;
