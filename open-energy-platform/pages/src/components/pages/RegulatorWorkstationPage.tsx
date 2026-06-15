import { WorkstationShell } from '../launch/WorkstationShell';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import type { TourDef } from '../launch/ProductTour';

// E2.8d — all RegulatorWorkstationPage tabs migrated into the Meridian model.
// Chain tabs (enforcement_action, enforcement_action_s35, esg_disclosure, public_consultation,
// market_conduct_exam, regulator_export_pack/W119, control_environment_audit/W121) are reached
// via /ledger/:chainKey. The remaining non-chain tabs (inbox, notices, surveillance, licences,
// enforcement, icfr_attestations/W120, reports, audit, government_filing) are registered as
// Meridian surfaces in pages/src/meridian/surfaces.tsx and reached from Atlas (⌘K).
// This husk is retained (per Phase E) with an empty tab set; KPIs/panels/tour remain.

const REGULATOR_TOUR: TourDef = {
  id: 'regulator-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'NERSA regulator workstation', body: 'Manage the full regulatory lifecycle — licence applications, compliance notices, inspections, tariff determinations, levy assessments, and disposition of matters.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Regulatory KPIs', body: 'Open applications, SLA breaches, active enforcement actions, and outstanding levies. Regulatory SLAs are legally binding — red means overdue.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Regulatory workflow tabs', body: 'Licensing, enforcement, tariff determination, MYPD, public consultation, levy assessment — each is a live state-machine with statutory SLA tracking.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Process a new licence application, issue a compliance notice, or open a compliance inspection — all guided with legal reference at each step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'See all regulatory actions: STOR processing, market conduct examinations, disposition workflow, SSEG registration, and more.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'New licence applications, compliance incident escalations, and market surveillance alerts arrive here for adjudication.', placement: 'left' },
  ],
};

export function RegulatorWorkstationPage() {
  const kpis = useWorkstationKpis('regulator');
  const alertsPanel = useWorkstationPanel('Surveillance alerts', '/regulator/surveillance', (r) => ({
    id: r.id,
    lead: <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${r.severity === 'critical' ? 'bg-[#fbe9e6] text-[#c0392b]' : 'bg-[#fff4d6] text-[#a06200]'}`}>{r.severity || r.status || '—'}</span>,
    text: <span>{r.rule_label || r.title || r.rule_name} · {r.market || r.scope || ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.opened_at ? new Date(r.opened_at).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No active surveillance alerts.');
  const licencesPanel = useWorkstationPanel('Open licence actions', '/regulator/licences', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[oklch(0.94_0.02_250)] text-[oklch(0.46_0.16_55)]">{r.status || 'pending'}</span>,
    text: <span>{r.licence_type} · {r.licensee_name || r.applicant}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.due_date ? new Date(r.due_date).toLocaleDateString('en-ZA') : ''}</span>,
  }), 'No open licence actions.');
  const panels = [alertsPanel, licencesPanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="regulator"
      eyebrow="Regulator · Workstation"
      title="Regulator workstation"
      subtitle="Surveillance triage · Licence action workflow · Enforcement case events."
      backHref="/regulator-suite"
      backLabel="Regulator suite"
      kpis={kpis}
      panels={panels}
      tour={REGULATOR_TOUR}
      tabs={[]}
    />
  );
}
