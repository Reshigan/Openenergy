import React from 'react';
import { WorkstationShell } from '../launch/WorkstationShell';
import type { TourDef } from '../launch/ProductTour';

// E2.4 — Meridian migration. Every tab that lived on this workstation has moved into the
// Meridian model:
//   - Chain tabs (ticket_chain/support_tickets, service_contracts/service_contract,
//     service-request/service_request, oem_fco, csat/csat_record, sla_performance_reports/
//     sla_performance_report) → /ledger/:chainKey.
//   - Non-chain surfaces (tickets, escalations, cross_tenant, reports, audit) and the
//     connector/ML panels (mqtt_opcua, anomaly_ml, rul_ml, fault_ml) → /surface/:key, registered
//     in pages/src/meridian/surfaces.tsx and reached from Atlas (⌘K).
// This husk is intentionally left with no tabs; the route is retained for back-compat links.

const SUPPORT_TOUR: TourDef = {
  id: 'support-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Support workstation', body: 'ITIL 4 aligned support hub — incident management, problem investigation, change enablement, firmware patches, warranty recovery, and SLA reporting.', placement: 'bottom' },
  ],
};

export function SupportWorkstationPage() {
  return (
    <WorkstationShell
      role="support"
      eyebrow="Support · Workstation"
      title="Support workstation"
      subtitle="Tickets · Escalations · Cross-tenant access audit. All the support tooling — no external ticketing system needed."
      backHref="/support"
      backLabel="Support console"
      tour={SUPPORT_TOUR}
      tabs={[]}
    />
  );
}
