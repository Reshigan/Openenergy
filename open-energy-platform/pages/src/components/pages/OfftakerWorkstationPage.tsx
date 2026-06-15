import React from 'react';
import { WorkstationShell } from '../launch/WorkstationShell';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import type { TourDef } from '../launch/ProductTour';

// Phase E (E2.6) retired this workstation husk: every tab moved out of the page.
// - Chain tabs (ppa_change_in_law, ppa_nomination, ppa_annual_recon, wheeling_access,
//   virtual_ppa_settlement, unserved_energy_claim, slb_kpi_ratchet, green_tariff_disclosure) are
//   reached via /ledger/:chainKey from Atlas (⌘K).
// - Non-chain tabs (sites, tariffs, budgets, bills, recs/rec_retirement, scope2, reports) and the
//   standalone widgets (wheeling charges, obligations register, audit) plus the shared connectors
//   (settlement rails / ERP / filing) are registered as Meridian /surface/:key surfaces in
//   ../../meridian/surfaces.tsx and reached from Atlas via their offtaker roleData feature keys.
// The shell is kept (still routed) but renders no tabs — the KPI row + portfolio panels remain so
// the workstation landing stays informative; all interaction now flows through Atlas surfaces.

const OFFTAKER_TOUR: TourDef = {
  id: 'offtaker-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Offtaker workstation', body: 'Manage your renewable energy procurement portfolio from PPA execution through to monthly billing, REC retirement, and regulatory disclosure.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Portfolio KPIs', body: 'Active PPAs, upcoming take-or-pay obligations, REC retirement status, and curtailment claims in flight.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'Generator invoices, tariff indexation notices, and payment security expiry alerts require action here.', placement: 'left' },
  ],
};

export function OfftakerWorkstationPage() {
  const kpis = useWorkstationKpis('offtaker');
  const sitesPanel = useWorkstationPanel('Delivery points', '/offtaker-suite/sites', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">{r.tariff_type || r.tariff || 'tariff'}</span>,
    text: <span>{r.name || r.site_name} · {r.suburb || r.city || ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.monthly_kwh ? `${Math.round(r.monthly_kwh).toLocaleString()} kWh/m` : ''}</span>,
  }), 'No delivery points yet.');
  const rfpPanel = useWorkstationPanel('Active RFPs', '/offtaker-suite/rfps', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fff4d6] text-[#a06200]">{r.status || 'open'}</span>,
    text: <span>{r.title || r.rfp_title} · {r.target_volume_gwh ? `${r.target_volume_gwh} GWh` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.closing_date ? new Date(r.closing_date).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No active RFPs.');
  const panels = [sitesPanel, rfpPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="offtaker"
      eyebrow="Offtaker · Workstation"
      title="Offtaker workstation"
      subtitle="Delivery points · Tariffs · Budgets · RECs · Scope 2. Day-to-day energy ops for a corporate consumer."
      backHref="/offtaker-suite"
      backLabel="Offtaker suite"
      kpis={kpis}
      panels={panels}
      tour={OFFTAKER_TOUR}
      tabs={[]}
    />
  );
}
