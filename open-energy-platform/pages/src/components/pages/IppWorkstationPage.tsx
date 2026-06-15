import { WorkstationShell } from '../launch/WorkstationShell';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import type { TourDef } from '../launch/ProductTour';

// E2.7 — every IPP workstation tab has migrated to the Meridian surface model.
// Chain tabs (Bucket A) are reached via /ledger/<chainKey>; the non-chain inline tabs
// (projects, milestones, schedule, insurance, community, gtia, invite_partners, reports,
// issues/risk/stakeholder/lessons registers, annual report, audit) are now self-contained
// surfaces registered as `ipp_developer:*` in pages/src/meridian/surfaces.tsx and routed by
// AtlasPage. This page is retained as an empty husk (header + KPIs + active-projects panel +
// tour) so legacy /ipp/workstation links still resolve; it carries no tabs.

const IPP_TOUR: TourDef = {
  id: 'ipp-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'IPP project workstation', body: 'Your single source of truth for every stage of a renewable energy project — from REIPPPP bid through to commercial operation and O&M.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Project health KPIs', body: 'Active projects, upcoming stage gates, open HSE incidents, and covenant status. Red KPIs require action before your next NERSA reporting deadline.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start wizards', body: 'New project to register? Use Quick start to walk through the 4-step project registration wizard, a stage gate submission, or an HSE incident report.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'See all IPP actions in one place — stage gates, bond expiry renewals, DSCR reports, GCA submissions, and more.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'Lender drawdown requests, offtaker PPA amendments, and grid operator notifications arrive here and can be actioned without leaving your current tab.', placement: 'left' },
  ],
};

export function IppWorkstationPage() {
  const kpis = useWorkstationKpis('ipp_developer');
  const projectsPanel = useWorkstationPanel('Active projects', '/projects', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">{r.project_type || r.energy_type || '—'}</span>,
    text: <span>{r.project_name || r.name} · {r.capacity_mw != null ? `${Number(r.capacity_mw).toFixed(1)} MW` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{(r.lifecycle_stage || r.status || '').replace(/_/g, ' ')}</span>,
  }), 'No active projects.');
  const panels = [projectsPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="ipp_developer"
      eyebrow="IPP developer · Workstation"
      title="IPP workstation"
      subtitle="Projects · Milestones · Insurance · Community. The site-to-COD pipeline a developer runs every day."
      backHref="/ipp-lifecycle"
      backLabel="IPP lifecycle"
      kpis={kpis}
      panels={panels}
      tour={IPP_TOUR}
      tabs={[]}
    />
  );
}
