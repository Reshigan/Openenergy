import React from 'react';
import { WorkstationShell } from '../launch/WorkstationShell';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import type { TourDef } from '../launch/ProductTour';

// E2.8e — LenderWorkstationPage husk. All tabs have migrated to the Meridian model:
//   • Chain tabs (cp_clearance, dscr_monitoring, slb_kpi_ratchet, construction_cost_report,
//     reserve_account, loan_restructure, esap_compliance, facility_amendment,
//     capital_adequacy_report, esap_monitoring) → /ledger/:chainKey.
//   • Non-chain tabs (facilities, dunning, reports, audit) + shared connectors
//     (strate-swift, sap-oracle-erp, government-filing) → /surface/:key (SURFACE_REGISTRY).
// The shell is retained (KPIs, panels, tour) but renders no tabs.

const LENDER_TOUR: TourDef = {
  id: 'lender-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Lender workstation', body: 'Manage your entire renewable energy loan book from here — facility origination, drawdowns, covenant monitoring, and ESAP compliance through to enforcement.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Portfolio KPIs', body: 'Facilities at risk, active covenant breaches, upcoming CP deadlines, and DSCR alerts. Red numbers require action today.', placement: 'bottom' },
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
      tour={LENDER_TOUR}
      tabs={[]}
    />
  );
}
