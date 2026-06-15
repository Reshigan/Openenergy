import React from 'react';
import { WorkstationShell, ListingTable, Pill } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { CyberIncidentChainTab } from '../cyber/CyberIncidentChainTab';
import { ServiceContractChainTab } from '../service-contract/ServiceContractChainTab';
import type { TourDef } from '../launch/ProductTour';


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
