import React from 'react';
import { WorkstationShell } from '../launch/WorkstationShell';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import type { TourDef } from '../launch/ProductTour';

// E2.8c — CarbonWorkstationPage husk. All tabs migrated to the Meridian model:
//   • 14 chain tabs → /ledger/:chainKey (article6_adjustment, mrv_submissions,
//     carbon_retirement, carbon_issuance, ccp_assessment, carbon_credit_rating,
//     esg_disclosure, carbon_scope3_disclosure, carbon_tax_return, carbon_budget,
//     vcm_project_development, certificate_bundle, carbon_registry_transfer,
//     methodology_amendment) — all have MERIDIAN_CHAINS descriptors.
//   • 5 non-chain tabs → /surface/:key (carbon_fund:vintages, :mrv, :certificates,
//     :reports, :audit) registered in meridian/surfaces.tsx, reached via Atlas (⌘K).
// The page is retained as a husk (tabs=[]) for backwards-compatible routing.

const CARBON_TOUR: TourDef = {
  id: 'carbon-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Carbon fund workstation', body: 'Manage the full carbon credit lifecycle — from project registration and MRV through to trading, retirement, and Article 6 ITMO corresponding adjustments.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Carbon portfolio KPIs', body: 'Credits issued, retired, in MRV pipeline, and under verification. Track your Article 6 corresponding adjustment balance separately.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Carbon lifecycle tabs', body: 'Registration, MRV verification, retirement, Article 6 ITMO, crediting period renewal, and PoA/CPA programme management — all state-machine workflows.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Register a new carbon project, file an MRV monitoring report, or retire credits for compliance — step-by-step with AI hints at each stage.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'All carbon fund actions: ERPA forward delivery, carbon tax offset claims, reversal/buffer-pool management, methodology amendments.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'DNA authorisation requests, verifier queries, and buyer retirement instructions appear here for your action.', placement: 'left' },
  ],
};

export function CarbonWorkstationPage() {
  const kpis = useWorkstationKpis('carbon_fund');
  const vintagesPanel = useWorkstationPanel('Active vintages', '/carbon-registry/vintages', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">{r.stage || r.status || '—'}</span>,
    text: <span>{r.project_name || r.name || r.serial_number} · {r.tco2e ? `${Number(r.tco2e).toLocaleString()} tCO₂e` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.vintage_year || ''}</span>,
  }), 'No vintages yet.');
  const mrvPanel = useWorkstationPanel('Open MRV submissions', '/carbon-registry/mrv', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fff4d6] text-[#a06200]">{r.status || 'pending'}</span>,
    text: <span>{r.project_name || r.title} · {r.tco2e_claimed ? `${Math.round(r.tco2e_claimed).toLocaleString()} tCO₂e` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No MRV submissions.');
  const panels = [vintagesPanel, mrvPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="carbon_fund"
      eyebrow="Carbon fund · Workstation"
      tour={CARBON_TOUR}
      title="Carbon workstation"
      subtitle="Project registration → MRV & verification → Issuance → Trading → Retirement & Article 6 compliance"
      backHref="/carbon-registry"
      backLabel="Carbon registry"
      kpis={kpis}
      panels={panels}
      tabs={[]}
    />
  );
}
