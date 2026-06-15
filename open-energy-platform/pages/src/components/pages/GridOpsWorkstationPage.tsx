import React from 'react';
import { WorkstationShell } from '../launch/WorkstationShell';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import type { TourDef } from '../launch/ProductTour';

// E2.5 — all GridOpsWorkstationPage tabs migrated into the Meridian model:
//   Chain tabs (imbalance-settlement, transmission-outage, black_start, demand_response,
//   interconnector_schedules, smart-meter-assets, substation-assets, eop_activations) → /ledger/:chainKey.
//   Non-chain tabs (curtailment, ancillary, outage, wheeling_charges, reports, audit) and the
//   scada / mqtt-opcua connectors → /surface/:key via SURFACE_REGISTRY (grid_operator:*).
// The page is retained as an (empty-tab) husk; Atlas + the Meridian surface/ledger routes are the
// live entry points.

const GRID_TOUR: TourDef = {
  id: 'grid-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Grid operator workstation', body: 'Real-time grid operations hub — dispatch nominations, planned outages, wheeling charges, EOP activations, and connection agreements all in one place.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Grid KPIs', body: 'Live frequency, active nominations, open outage requests, and wheeling charge disputes. Critical operations are highlighted in red.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Operations tabs', body: 'Grouped by function — Operations, Connections, Commercial, Compliance. Each tab is a live state-machine workflow with SLA timers.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Wizards for submitting dispatch nominations, scheduling planned outages, and recording reserve activations with full NTCSA guidance at each step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'See all grid operator actions — dispatch, ancillary services, GCA processing, EOP activation, and capacity allocation queue management.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'IPP connection requests, GCA applications, and NTCSA directives appear here for you to act on.', placement: 'left' },
  ],
};

export function GridOpsWorkstationPage() {
  const kpis = useWorkstationKpis('grid_operator');
  const curtailPanel = useWorkstationPanel('Active curtailment', '/grid-operator/curtailment', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fff4d6] text-[#a06200]">{r.status || 'live'}</span>,
    text: <span>{r.instruction_number || r.id} · {r.target_mw ? `${r.target_mw} MW` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.effective_from ? new Date(r.effective_from).toLocaleTimeString('en-ZA') : ''}</span>,
  }), 'No active curtailment.');
  const outagePanel = useWorkstationPanel('Open outage responses', '/grid-operator/outages', (r) => ({
    id: r.id,
    lead: <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${r.severity === 'critical' ? 'bg-[#fbe9e6] text-[#c0392b]' : 'bg-[#fff4d6] text-[#a06200]'}`}>{r.severity || r.status || '—'}</span>,
    text: <span>{r.area || r.substation} · {r.affected_mw ? `${r.affected_mw} MW` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.detected_at ? new Date(r.detected_at).toLocaleTimeString('en-ZA') : ''}</span>,
  }), 'No outages.');
  const panels = [curtailPanel, outagePanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="grid_operator"
      eyebrow="Grid operator · Workstation"
      title="Grid operations workstation"
      subtitle="Curtailment events · Outage responses · Ancillary award events. Single screen, all in-platform."
      backHref="/grid-operator"
      backLabel="Operator suite"
      kpis={kpis}
      panels={panels}
      tour={GRID_TOUR}
      tabs={[]}
    />
  );
}
