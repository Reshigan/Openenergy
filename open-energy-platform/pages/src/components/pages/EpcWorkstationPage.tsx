import React from 'react';
import { WorkstationShell } from '../launch/WorkstationShell';
import type { TourDef } from '../launch/ProductTour';


const EPC_TOUR: TourDef = {
  id: 'epc-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'EPC contractor workstation', body: 'Your construction-phase project hub — submittals, RFIs, ITPs, NCRs, change orders, punch list, site diary, and HSE incident management. Everything in one place, all tracked against the programme.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Construction KPIs', body: 'Open submittals awaiting approval, RFIs pending client response, NCRs to close out, and ITPs completion rate. Red indicators flag hold points blocking construction progress.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Document control tabs', body: 'Every construction deliverable: submittals, RFIs, change orders, technical queries, ITPs, NCRs, punch list, method statements, and site diary — all with full approval lifecycle tracking.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Register a new submittal, raise an NCR, report an HSE incident, or run the complete project setup wizard — guided with compliance reminders at every step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'Full EPC capability index: every document control, quality, and safety workflow, grouped by area and deep-linked to the relevant workstation tab.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'Client submittal comments, RFI responses requiring your action, and NCR close-out verifications arrive here for processing.', placement: 'left' },
  ],
};

// E2.8b — all tabs migrated to the Meridian model:
//   • submittals, change-orders, ncrs, method-statements, site-diary → chain descriptors
//     reached via /ledger/:chainKey (submittal_rfi, project_change_order, ncr,
//     ipp_method_statement, ipp_construction_diary).
//   • rfis, technical-queries → standalone /surface/:key bodies (Bucket B, no chain descriptor).
//   • audit → /surface/audit (AuditPanel prefix /ipp).
// All registered in pages/src/meridian/surfaces.tsx under the `epc_contractor:` prefix.
// This page is now a husk with no tabs (husk deletion is a later task).
export function EpcWorkstationPage() {
  return (
    <WorkstationShell
      role="epc_contractor"
      eyebrow="EPC Contractor · Workstation"
      title="Construction workstation"
      subtitle="Site setup → Document control → Quality management → Safety & HSE → Handover"
      tour={EPC_TOUR}
      tabs={[]}
    />
  );
}
