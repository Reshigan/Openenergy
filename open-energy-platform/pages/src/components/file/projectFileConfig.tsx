// ════════════════════════════════════════════════════════════════════════
// projectFileConfig — tab map + hero for the IPP project file.
//
// Consumed by ProjectDetail.tsx. Keep this file declarative: the shell
// fetches /projects/:id/file once, the hero callback picks header bits,
// and each tab pulls its rows from the appropriate response section.
//
// The shape mirrors the aggregator at src/routes/projects.ts → /:id/file:
//   { project, phase, summary, plan, origination, permits, land_community,
//     funding, contracts, carbon, operations, decommission, ai_suggestions }
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { OEIcon } from '../OEIcon';
import { ProjectScurve } from '../widgets/ProjectScurve';
import { ScheduleTab } from '../schedule/ScheduleTab';
import { FundingOptionsPanel } from '../funding/FundingOptionsPanel';
import {
  FileSection,
  FileTable,
  StatusCell,
  fmtDate,
  fmtZAR,
  fmtNum,
  fmtPct,
} from './FileTable';
import type { EntityFileHero, EntityFileTab, EntityFileSummary } from './EntityFileShell';

// ── Shape of /projects/:id/file response ──────────────────────────────────
export interface ProjectFileData {
  project: {
    id: string;
    project_name: string;
    technology?: string;
    capacity_mw?: number;
    status?: string;
    location?: string;
    grid_connection_point?: string;
    structure_type?: string;
    developer_name?: string;
    ppa_volume_mwh?: number;
    ppa_price_per_mwh?: number;
    ppa_duration_years?: number;
    construction_start_date?: string;
    commercial_operation_date?: string;
    created_at?: string;
  };
  phase: string;
  summary: EntityFileSummary;
  plan: { milestones: any[]; cp_readiness: any[] };
  origination: { site_assessments: any[]; resource_campaigns: any[]; yield_estimates: any[] };
  permits: { permits: any[]; env_authorisations: any[]; env_compliance: any[] };
  land_community: {
    land_parcels: any[]; servitudes: any[];
    stakeholders: any[]; engagements: any[]; ed_sed_spend: any[];
  };
  funding: {
    financial_models: any[]; info_memorandums: any[]; drawdowns: any[];
    insurance_policies: any[]; covenants: any[]; covenant_tests: any[];
    reserve_accounts: any[]; waterfall_runs: any[];
  };
  contracts: {
    epc: any[]; epc_variations: any[]; epc_liquidated_damages: any[];
    documents: any[]; lois: any[];
  };
  carbon: {
    vintages: any[]; mrv_submissions: any[];
    rec_certificates: any[]; esg_rec_certificates: any[];
  };
  operations: {
    nominations: any[]; ipp_work_orders: any[]; spares_inventory: any[];
    commissioning_tests: any[]; om_sites: any[];
    om_faults_open: any[]; om_work_orders_open: any[];
  };
  decommission: { plans: any[] };
  ai_suggestions: any[];
}

// ── Hero ──────────────────────────────────────────────────────────────────
export function projectHero(data: ProjectFileData): EntityFileHero {
  const p = data.project;
  const s = data.summary;
  const techKey = (p.technology || '').toLowerCase();
  const techIcon = ({ size }: { size?: number }) => (
    <OEIcon
      name={
        techKey.includes('solar') || techKey.includes('pv') ? 'sun'
          : techKey.includes('wind') ? 'wind'
          : techKey.includes('battery') || techKey.includes('storage') ? 'battery'
          : 'bolt'
      }
      size={size || 12}
    />
  );
  const phaseLabel: Record<string, string> = {
    development: 'In development',
    construction: 'Under construction',
    commissioning: 'Commissioning',
    commercial_operations: 'Operational',
    decommissioned: 'Decommissioned',
  };
  return {
    eyebrowIcon: techIcon,
    eyebrowLabel: `IPP Project · ${p.location || '—'}`,
    title: p.project_name,
    subtitle: `${fmtNum(p.capacity_mw, 1)} MW ${p.technology || 'renewable'} · ${phaseLabel[p.status || ''] || p.status || '—'} · ${p.developer_name || 'Developer'}`,
    kpis: [
      { key: 'capacity', label: 'Capacity', value: `${fmtNum(p.capacity_mw, 1)} MW` },
      { key: 'ppa_price', label: 'PPA price', value: p.ppa_price_per_mwh ? `R${fmtNum(p.ppa_price_per_mwh, 0)}/MWh` : '—' },
      { key: 'milestones', label: 'Milestones', value: `${Number(s.milestones_completed || 0)} / ${Number(s.milestones_total || 0)}` },
      { key: 'drawdowns', label: 'Drawdowns', value: `${Number(s.drawdowns_executed || 0)} / ${Number(s.drawdowns_total || 0)}` },
    ],
  };
}

// ── Tabs ──────────────────────────────────────────────────────────────────
export const projectFileTabs: EntityFileTab<ProjectFileData>[] = [
  // ── Overview ────────────────────────────────────────────────────────────
  {
    id: 'overview',
    label: 'Overview',
    icon: ({ size }) => <OEIcon name="dashboard" size={size} />,
    render: (data) => {
      const p = data.project;
      const s = data.summary;
      return (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <FileSection title="Project facts">
              <div className="p-5">
                <dl className="text-[13px] space-y-2">
                  <Row label="Technology" value={p.technology || '—'} />
                  <Row label="Structure" value={(p.structure_type || '').replace(/_/g, ' ') || '—'} />
                  <Row label="Location" value={p.location || '—'} />
                  <Row label="Grid connection" value={p.grid_connection_point || '—'} />
                  <Row label="PPA volume" value={p.ppa_volume_mwh ? `${fmtNum(p.ppa_volume_mwh)} MWh/yr` : '—'} />
                  <Row label="PPA tenor" value={p.ppa_duration_years ? `${p.ppa_duration_years} years` : '—'} />
                  <Row label="Construction start" value={fmtDate(p.construction_start_date)} />
                  <Row label="Commercial operation" value={fmtDate(p.commercial_operation_date)} />
                  <Row label="Developer" value={p.developer_name || '—'} />
                </dl>
              </div>
            </FileSection>

            <div className="lg:col-span-2 space-y-4">
              <FileSection title="Earned-value (S-curve)">
                <div className="p-2">
                  <ProjectScurve
                    milestones={(data.plan.milestones as any[]).map((m) => ({
                      id: m.id,
                      milestone_name: m.milestone_name,
                      milestone_type: m.milestone_type,
                      due_date: m.target_date || m.due_date,
                      achieved_date: m.satisfied_date || m.achieved_date,
                      status: m.status,
                      weight: m.weight,
                    }))}
                    capexZar={(p as any).total_capex_zar}
                    startDate={p.construction_start_date || p.created_at}
                    codDate={p.commercial_operation_date}
                  />
                </div>
              </FileSection>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MicroKpi label="Permits granted" value={`${Number(s.permits_granted || 0)} / ${Number(s.permits_total || 0)}`} tone={Number(s.permits_granted || 0) >= Number(s.permits_total || 0) ? 'good' : 'warn'} />
                <MicroKpi label="Covenants active" value={Number(s.covenants_active || 0)} tone="good" />
                <MicroKpi label="Covenants breached" value={Number(s.covenants_breached || 0)} tone={Number(s.covenants_breached || 0) > 0 ? 'bad' : 'good'} />
                <MicroKpi label="Open O&M faults" value={Number(s.om_faults_open || 0)} tone={Number(s.om_faults_open || 0) > 0 ? 'warn' : 'good'} />
                <MicroKpi label="EPC contracts" value={Number(s.epc_contracts || 0)} />
                <MicroKpi label="LOIs on file" value={Number(s.lois_total || 0)} />
                <MicroKpi label="Carbon credits issued" value={fmtNum(Number(s.carbon_credits_issued || 0))} />
                <MicroKpi label="REC certificates" value={Number(s.rec_certificates || 0)} />
              </div>
            </div>
          </div>
        </>
      );
    },
  },

  // ── Plan & milestones ────────────────────────────────────────────────────
  {
    id: 'plan',
    label: 'Plan',
    icon: ({ size }) => <OEIcon name="flow" size={size} />,
    badgeFromSummary: (s) => Number(s.milestones_total || 0),
    render: (data) => (
      <>
        <FileSection title="Milestones" subtitle="Construction & commercial milestones, with target / satisfied dates.">
          <FileTable
            rows={data.plan.milestones as any[]}
            emptyMessage="No milestones recorded yet."
            columns={[
              { key: 'milestone_name', label: 'Milestone' },
              { key: 'milestone_type', label: 'Type', render: (r: any) => (r.milestone_type || '').replace(/_/g, ' ') || '—' },
              { key: 'target_date', label: 'Target', mono: true, render: (r: any) => fmtDate(r.target_date) },
              { key: 'satisfied_date', label: 'Satisfied', mono: true, render: (r: any) => fmtDate(r.satisfied_date) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="CP readiness" subtitle="Conditions-precedent checklist for financial close / drawdown.">
          <FileTable
            rows={data.plan.cp_readiness as any[]}
            emptyMessage="No CP checklist on file."
            columns={[
              { key: 'cp_name', label: 'Checkpoint' },
              { key: 'target_date', label: 'Target', mono: true, render: (r: any) => fmtDate(r.target_date) },
              { key: 'days_until_date', label: 'Days', align: 'right', mono: true, render: (r: any) => r.days_until_date != null ? r.days_until_date : '—' },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
              { key: 'readiness_notes', label: 'Notes' },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Schedule (P6-grade WBS + CPM + leveling + baselines) ────────────────
  {
    id: 'schedule',
    label: 'Schedule',
    icon: ({ size }) => <OEIcon name="calendar" size={size} />,
    badgeFromSummary: () => 0,
    render: (data) => <ScheduleTab projectId={data.project.id} />,
  },

  // ── Permits & environmental ──────────────────────────────────────────────
  {
    id: 'permits',
    label: 'Permits',
    icon: ({ size }) => <OEIcon name="shield" size={size} />,
    badgeFromSummary: (s) => Number(s.permits_total || 0),
    render: (data) => (
      <>
        <FileSection title="Environmental authorisations" subtitle="NEMA s.24, water-use licence, heritage, waste — with decision dates and expiry.">
          <FileTable
            rows={data.permits.env_authorisations as any[]}
            emptyMessage="No environmental authorisations lodged yet."
            columns={[
              { key: 'authorisation_type', label: 'Type', render: (r: any) => (r.authorisation_type || '').replace(/_/g, ' ') },
              { key: 'reference_number', label: 'Reference', mono: true },
              { key: 'competent_authority', label: 'Authority' },
              { key: 'applied_date', label: 'Lodged', mono: true, render: (r: any) => fmtDate(r.applied_date) },
              { key: 'decision_date', label: 'Decided', mono: true, render: (r: any) => fmtDate(r.decision_date) },
              { key: 'decision', label: 'Decision', render: (r: any) => <StatusCell value={r.decision} /> },
              { key: 'expiry_date', label: 'Expires', mono: true, render: (r: any) => fmtDate(r.expiry_date) },
            ]}
          />
        </FileSection>
        <FileSection title="Compliance conditions" subtitle="Per-condition tracking against each authorisation.">
          <FileTable
            rows={data.permits.env_compliance as any[]}
            emptyMessage="No conditions tracked yet."
            columns={[
              { key: 'condition_reference', label: 'Condition', mono: true },
              { key: 'condition_text', label: 'Description' },
              { key: 'due_date', label: 'Due', mono: true, render: (r: any) => fmtDate(r.due_date) },
              { key: 'compliance_status', label: 'Status', render: (r: any) => <StatusCell value={r.compliance_status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Permits register" subtitle="NERSA, SPLUMA, water use, heritage, aviation — all statutory consents.">
          <FileTable
            rows={data.permits.permits as any[]}
            emptyMessage="No additional permits on file."
            columns={[
              { key: 'permit_type', label: 'Type', render: (r: any) => (r.permit_type || '').replace(/_/g, ' ') },
              { key: 'authority', label: 'Authority' },
              { key: 'application_no', label: 'Number', mono: true },
              { key: 'applied_at', label: 'Applied', mono: true, render: (r: any) => fmtDate(r.applied_at) },
              { key: 'decided_at', label: 'Decided', mono: true, render: (r: any) => fmtDate(r.decided_at) },
              { key: 'valid_to', label: 'Expires', mono: true, render: (r: any) => fmtDate(r.valid_to) },
              { key: 'outcome', label: 'Outcome', render: (r: any) => <StatusCell value={r.outcome} /> },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Land & community ─────────────────────────────────────────────────────
  {
    id: 'land',
    label: 'Land & community',
    icon: ({ size }) => <OEIcon name="globe" size={size} />,
    badgeFromSummary: (s) => Number(s.land_parcels || 0),
    render: (data) => (
      <>
        <FileSection title="Land parcels" subtitle="Option/lease/freehold status for every parcel that makes up the project site.">
          <FileTable
            rows={data.land_community.land_parcels as any[]}
            emptyMessage="No land parcels registered."
            columns={[
              { key: 'parcel_number', label: 'Parcel', mono: true },
              { key: 'registered_owner', label: 'Owner' },
              { key: 'area_hectares', label: 'Hectares', align: 'right', mono: true, render: (r: any) => fmtNum(r.area_hectares, 1) },
              { key: 'ownership_type', label: 'Ownership', render: (r: any) => (r.ownership_type || '').replace(/_/g, ' ') },
              { key: 'monthly_rent_zar', label: 'Monthly rent', align: 'right', mono: true, render: (r: any) => r.monthly_rent_zar ? fmtZAR(r.monthly_rent_zar) : '—' },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Servitudes & wayleaves" subtitle="Power-line, access, water, fibre — registered against the deeds.">
          <FileTable
            rows={data.land_community.servitudes as any[]}
            emptyMessage="No servitudes registered."
            columns={[
              { key: 'servitude_type', label: 'Type', render: (r: any) => (r.servitude_type || '').replace(/_/g, ' ') },
              { key: 'parcel_number', label: 'Parcel', mono: true },
              { key: 'grantor', label: 'Grantor' },
              { key: 'consideration_zar', label: 'Consideration', align: 'right', mono: true, render: (r: any) => fmtZAR(r.consideration_zar) },
              { key: 'registration_date', label: 'Registered', mono: true, render: (r: any) => fmtDate(r.registration_date) },
              { key: 'registered_at_deeds', label: 'In deeds?', render: (r: any) => r.registered_at_deeds ? 'Yes' : 'No' },
            ]}
          />
        </FileSection>
        <FileSection title="Community stakeholders" subtitle="Local government, chiefs, civil society, business — the people who must say yes.">
          <FileTable
            rows={data.land_community.stakeholders as any[]}
            emptyMessage="No stakeholders captured."
            columns={[
              { key: 'stakeholder_name', label: 'Name' },
              { key: 'stakeholder_type', label: 'Type', render: (r: any) => (r.stakeholder_type || '').replace(/_/g, ' ') },
              { key: 'contact_person', label: 'Contact' },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
            ]}
          />
        </FileSection>
        <FileSection title="Engagements log">
          <FileTable
            rows={data.land_community.engagements as any[]}
            emptyMessage="No engagements logged."
            columns={[
              { key: 'engagement_date', label: 'Date', mono: true, render: (r: any) => fmtDate(r.engagement_date) },
              { key: 'engagement_type', label: 'Type', render: (r: any) => (r.engagement_type || '').replace(/_/g, ' ') },
              { key: 'topic', label: 'Topic' },
              { key: 'attendees_count', label: 'Attendees', align: 'right', mono: true },
              { key: 'outcome', label: 'Outcome' },
              { key: 'follow_up_date', label: 'Follow-up', mono: true, render: (r: any) => fmtDate(r.follow_up_date) },
            ]}
          />
        </FileSection>
        <FileSection title="ED / SED spend" subtitle="REIPPPP enterprise / supplier / skills-development spend, period by period.">
          <FileTable
            rows={data.land_community.ed_sed_spend as any[]}
            emptyMessage="No ED/SED spend reported yet."
            columns={[
              { key: 'period', label: 'Period', mono: true },
              { key: 'category', label: 'Category', render: (r: any) => (r.category || '').replace(/_/g, ' ') },
              { key: 'amount_zar', label: 'Amount', align: 'right', mono: true, render: (r: any) => fmtZAR(r.amount_zar) },
              { key: 'beneficiary', label: 'Beneficiary' },
              { key: 'reipppp_bid_window', label: 'Bid window' },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Funding ──────────────────────────────────────────────────────────────
  {
    id: 'funding',
    label: 'Funding',
    icon: ({ size }) => <OEIcon name="piggy-bank" size={size} />,
    badgeFromSummary: (s) => Number(s.drawdowns_total || 0),
    render: (data) => (
      <>
        <FileSection title="Market offers" subtitle="Standing carbon-fund and lender offers aimed at this project, scored for fit. Multi-select to kick off engagement with the offerors.">
          <FundingOptionsPanel projectId={data.project.id} />
        </FileSection>
        <FileSection title="Financial models" subtitle="Base-case + sensitivity runs. DSCR ≥ 1.20 typically required for financial close.">
          <FileTable
            rows={data.funding.financial_models as any[]}
            emptyMessage="No financial model uploaded."
            columns={[
              { key: 'model_version', label: 'Version', mono: true },
              { key: 'capacity_mw', label: 'MW', align: 'right', mono: true, render: (r: any) => fmtNum(r.capacity_mw, 1) },
              { key: 'lcoe_zar_per_mwh', label: 'LCOE', align: 'right', mono: true, render: (r: any) => r.lcoe_zar_per_mwh ? `R${fmtNum(r.lcoe_zar_per_mwh, 0)}` : '—' },
              { key: 'equity_irr_pct', label: 'Equity IRR', align: 'right', mono: true, render: (r: any) => fmtPct(r.equity_irr_pct) },
              { key: 'min_dscr', label: 'Min DSCR', align: 'right', mono: true, render: (r: any) => fmtNum(r.min_dscr, 2) },
              { key: 'avg_dscr', label: 'Avg DSCR', align: 'right', mono: true, render: (r: any) => fmtNum(r.avg_dscr, 2) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Information memoranda">
          <FileTable
            rows={data.funding.info_memorandums as any[]}
            emptyMessage="No information memorandum issued."
            columns={[
              { key: 'im_version', label: 'Version', mono: true },
              { key: 'im_title', label: 'Title' },
              { key: 'prepared_by', label: 'Prepared by' },
              { key: 'funding_requested_zar', label: 'Funding requested', align: 'right', mono: true, render: (r: any) => fmtZAR(r.funding_requested_zar) },
              { key: 'created_at', label: 'Created', mono: true, render: (r: any) => fmtDate(r.created_at) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Drawdown requests" subtitle="Independent-engineer certified drawdowns under the senior facility.">
          <FileTable
            rows={data.funding.drawdowns as any[]}
            emptyMessage="No drawdowns requested yet."
            columns={[
              { key: 'drawdown_no', label: 'No.', mono: true },
              { key: 'purpose', label: 'Purpose' },
              { key: 'requested_amount_zar', label: 'Requested', align: 'right', mono: true, render: (r: any) => fmtZAR(r.requested_amount_zar) },
              { key: 'approved_amount_zar', label: 'Approved', align: 'right', mono: true, render: (r: any) => fmtZAR(r.approved_amount_zar) },
              { key: 'disbursed_amount_zar', label: 'Disbursed', align: 'right', mono: true, render: (r: any) => fmtZAR(r.disbursed_amount_zar) },
              { key: 'requested_at', label: 'Requested', mono: true, render: (r: any) => fmtDate(r.requested_at) },
              { key: 'disbursed_at', label: 'Disbursed', mono: true, render: (r: any) => fmtDate(r.disbursed_at) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Covenants" subtitle="Financial + operational covenants under the facility agreement.">
          <FileTable
            rows={data.funding.covenants as any[]}
            emptyMessage="No covenants on file."
            columns={[
              { key: 'covenant_code', label: 'Code', mono: true },
              { key: 'covenant_name', label: 'Name' },
              { key: 'covenant_type', label: 'Type' },
              { key: 'operator', label: 'Op', mono: true },
              { key: 'threshold', label: 'Threshold', align: 'right', mono: true, render: (r: any) => fmtNum(r.threshold, 2) },
              { key: 'measurement_frequency', label: 'Cadence' },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Covenant tests (last 50)">
          <FileTable
            rows={data.funding.covenant_tests as any[]}
            emptyMessage="No covenant tests reported."
            columns={[
              { key: 'test_period', label: 'Period', mono: true },
              { key: 'test_date', label: 'Tested', mono: true, render: (r: any) => fmtDate(r.test_date) },
              { key: 'measured_value', label: 'Measured', align: 'right', mono: true, render: (r: any) => fmtNum(r.measured_value, 3) },
              { key: 'result', label: 'Result', render: (r: any) => <StatusCell value={r.result} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Reserve accounts">
          <FileTable
            rows={data.funding.reserve_accounts as any[]}
            emptyMessage="No reserve accounts funded."
            columns={[
              { key: 'reserve_type', label: 'Reserve' },
              { key: 'target_amount_zar', label: 'Target', align: 'right', mono: true, render: (r: any) => fmtZAR(r.target_amount_zar) },
              { key: 'current_balance_zar', label: 'Balance', align: 'right', mono: true, render: (r: any) => fmtZAR(r.current_balance_zar) },
              { key: 'custodian', label: 'Custodian' },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Insurance policies">
          <FileTable
            rows={data.funding.insurance_policies as any[]}
            emptyMessage="No insurance policies on file."
            columns={[
              { key: 'policy_type', label: 'Type', render: (r: any) => (r.policy_type || '').replace(/_/g, ' ') },
              { key: 'insurer', label: 'Insurer' },
              { key: 'sum_insured_zar', label: 'Sum insured', align: 'right', mono: true, render: (r: any) => fmtZAR(r.sum_insured_zar) },
              { key: 'premium_zar', label: 'Premium', align: 'right', mono: true, render: (r: any) => fmtZAR(r.premium_zar) },
              { key: 'period_end', label: 'Expires', mono: true, render: (r: any) => fmtDate(r.period_end) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Contracts ────────────────────────────────────────────────────────────
  {
    id: 'contracts',
    label: 'Contracts',
    icon: ({ size }) => <OEIcon name="contract" size={size} />,
    badgeFromSummary: (s) => Number(s.contracts_total || 0) + Number(s.epc_contracts || 0),
    render: (data) => (
      <>
        <FileSection title="EPC contracts" subtitle="Turnkey contracts with the engineering, procurement and construction contractor.">
          <FileTable
            rows={data.contracts.epc as any[]}
            emptyMessage="No EPC contract registered."
            columns={[
              { key: 'contractor_name', label: 'Contractor' },
              { key: 'lump_sum_zar', label: 'Lump sum', align: 'right', mono: true, render: (r: any) => fmtZAR(r.lump_sum_zar) },
              { key: 'target_completion_date', label: 'Target COD', mono: true, render: (r: any) => fmtDate(r.target_completion_date) },
              { key: 'taking_over_certificate_date', label: 'TOC issued', mono: true, render: (r: any) => fmtDate(r.taking_over_certificate_date) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Variations" subtitle="Scope changes under each EPC contract.">
          <FileTable
            rows={data.contracts.epc_variations as any[]}
            emptyMessage="No variations issued."
            columns={[
              { key: 'variation_number', label: 'Reference', mono: true },
              { key: 'description', label: 'Description' },
              { key: 'value_zar', label: 'Value', align: 'right', mono: true, render: (r: any) => fmtZAR(r.value_zar) },
              { key: 'time_impact_days', label: 'Delay (days)', align: 'right', mono: true },
              { key: 'raised_at', label: 'Raised', mono: true, render: (r: any) => fmtDate(r.raised_at) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Liquidated damages" subtitle="Delay / performance / availability LDs accrued under the EPC.">
          <FileTable
            rows={data.contracts.epc_liquidated_damages as any[]}
            emptyMessage="No LDs accrued."
            columns={[
              { key: 'event_type', label: 'Event' },
              { key: 'event_date', label: 'Event date', mono: true, render: (r: any) => fmtDate(r.event_date) },
              { key: 'calculated_amount_zar', label: 'Calculated', align: 'right', mono: true, render: (r: any) => fmtZAR(r.calculated_amount_zar) },
              { key: 'capped_amount_zar', label: 'Capped', align: 'right', mono: true, render: (r: any) => fmtZAR(r.capped_amount_zar) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Contract documents" subtitle="Term sheets, PPAs, wheeling, offtake — every signed or in-flight document.">
          <FileTable
            rows={data.contracts.documents as any[]}
            emptyMessage="No contract documents on file."
            columns={[
              { key: 'title', label: 'Title' },
              { key: 'document_type', label: 'Type', render: (r: any) => (r.document_type || '').replace(/_/g, ' ') },
              { key: 'counterparty_name', label: 'Counterparty' },
              { key: 'phase', label: 'Phase', render: (r: any) => <StatusCell value={r.phase} /> },
              { key: 'version', label: 'Version', mono: true },
              { key: 'id', label: 'Open', render: (r: any) => <a href={`/contracts/${r.id}`} className="text-[#1a5d97] font-semibold hover:underline">Open</a> },
            ]}
          />
        </FileSection>
        <FileSection title="Letters of intent" subtitle="LOIs sent or received against this project — first step of the offtake / IPP funnel.">
          <FileTable
            rows={data.contracts.lois as any[]}
            emptyMessage="No LOIs raised."
            columns={[
              { key: 'id', label: 'LOI', mono: true, render: (r: any) => r.id?.slice(-8) || '—' },
              { key: 'horizon_years', label: 'Tenor (yrs)', align: 'right', mono: true },
              { key: 'annual_mwh', label: 'MWh/yr', align: 'right', mono: true, render: (r: any) => fmtNum(r.annual_mwh) },
              { key: 'blended_price', label: 'Blended R/MWh', align: 'right', mono: true, render: (r: any) => r.blended_price ? `R${fmtNum(r.blended_price)}` : '—' },
              { key: 'sent_at', label: 'Sent', mono: true, render: (r: any) => fmtDate(r.sent_at) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
              { key: 'resulting_contract_document_id', label: 'Contract', render: (r: any) => r.resulting_contract_document_id ? <a href={`/contracts/${r.resulting_contract_document_id}`} className="text-[#1a5d97] font-semibold hover:underline">Open</a> : '—' },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Carbon & RECs ────────────────────────────────────────────────────────
  {
    id: 'carbon',
    label: 'Carbon & RECs',
    icon: ({ size }) => <OEIcon name="leaf" size={size} />,
    badgeFromSummary: (s) => Number(s.rec_certificates || 0),
    render: (data) => (
      <>
        <FileSection title="Credit vintages" subtitle="Carbon credit issuances per vintage year. SA-eligible vintages count against carbon-tax liability.">
          <FileTable
            rows={data.carbon.vintages as any[]}
            emptyMessage="No carbon credits issued yet."
            columns={[
              { key: 'vintage_year', label: 'Year', mono: true },
              { key: 'serial_prefix', label: 'Serial prefix', mono: true },
              { key: 'credits_issued', label: 'Issued', align: 'right', mono: true, render: (r: any) => fmtNum(r.credits_issued) },
              { key: 'credits_retired', label: 'Retired', align: 'right', mono: true, render: (r: any) => fmtNum(r.credits_retired) },
              { key: 'issuance_date', label: 'Issued', mono: true, render: (r: any) => fmtDate(r.issuance_date) },
              { key: 'sa_carbon_tax_eligible', label: 'SA-eligible', render: (r: any) => r.sa_carbon_tax_eligible ? 'Yes' : 'No' },
            ]}
          />
        </FileSection>
        <FileSection title="MRV submissions" subtitle="Monitoring, reporting and verification per claim period.">
          <FileTable
            rows={data.carbon.mrv_submissions as any[]}
            emptyMessage="No MRV submissions on file."
            columns={[
              { key: 'reporting_period_start', label: 'Period from', mono: true, render: (r: any) => fmtDate(r.reporting_period_start) },
              { key: 'reporting_period_end', label: 'Period to', mono: true, render: (r: any) => fmtDate(r.reporting_period_end) },
              { key: 'claimed_reductions_tco2e', label: 'tCO₂e claimed', align: 'right', mono: true, render: (r: any) => fmtNum(r.claimed_reductions_tco2e) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="REC certificates" subtitle="Renewable Energy Certificates issued from this project's generation.">
          <FileTable
            rows={[...(data.carbon.rec_certificates as any[]), ...(data.carbon.esg_rec_certificates as any[])]}
            emptyMessage="No REC certificates issued."
            columns={[
              { key: 'registry', label: 'Registry' },
              { key: 'mwh_represented', label: 'MWh', align: 'right', mono: true, render: (r: any) => fmtNum(r.mwh_represented) },
              { key: 'generation_period_start', label: 'From', mono: true, render: (r: any) => fmtDate(r.generation_period_start) },
              { key: 'generation_period_end', label: 'To', mono: true, render: (r: any) => fmtDate(r.generation_period_end) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
      </>
    ),
  },

  // ── Operations ───────────────────────────────────────────────────────────
  {
    id: 'operations',
    label: 'Operations',
    icon: ({ size }) => <OEIcon name="wrench" size={size} />,
    badgeFromSummary: (s) => Number(s.om_work_orders_open || 0) + Number(s.om_faults_open || 0),
    render: (data) => (
      <>
        <FileSection
          title="Linked O&M sites"
          subtitle="The asset cockpit drives 24/7 telemetry, fault detection, work orders, spares and AI predictions."
          action={data.operations.om_sites.length > 0 ? (
            <a href={`/esums/sites/${(data.operations.om_sites[0] as any).id}`} className="text-[12px] font-semibold text-[#1a5d97] hover:underline">
              Open in O&M →
            </a>
          ) : null}
        >
          <FileTable
            rows={data.operations.om_sites as any[]}
            emptyMessage="No operating site linked yet — link once the project reaches commercial operations."
            columns={[
              { key: 'name', label: 'Site' },
              { key: 'capacity_mw', label: 'Capacity (MW)', align: 'right', mono: true, render: (r: any) => fmtNum(r.capacity_mw, 1) },
              { key: 'technology', label: 'Technology' },
              { key: 'commissioning_date', label: 'COD', mono: true, render: (r: any) => fmtDate(r.commissioning_date) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Open faults" subtitle="Live faults eat into availability covenant performance.">
          <FileTable
            rows={data.operations.om_faults_open as any[]}
            emptyMessage="No open faults — site is clean."
            columns={[
              { key: 'fault_code', label: 'Code', mono: true },
              { key: 'category', label: 'Category' },
              { key: 'description', label: 'Description' },
              { key: 'severity', label: 'Severity', render: (r: any) => <StatusCell value={r.severity} /> },
              { key: 'hourly_loss_zar', label: 'R/hr loss', align: 'right', mono: true, render: (r: any) => fmtZAR(r.hourly_loss_zar) },
              { key: 'detected_at', label: 'Detected', mono: true, render: (r: any) => fmtDate(r.detected_at) },
            ]}
          />
        </FileSection>
        <FileSection title="Open work orders">
          <FileTable
            rows={data.operations.om_work_orders_open as any[]}
            emptyMessage="No open work orders."
            columns={[
              { key: 'wo_number', label: 'No.', mono: true },
              { key: 'category', label: 'Category' },
              { key: 'title', label: 'Title' },
              { key: 'priority', label: 'Priority', render: (r: any) => <StatusCell value={r.priority} /> },
              { key: 'sla_deadline', label: 'SLA', mono: true, render: (r: any) => fmtDate(r.sla_deadline) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Generation nominations" subtitle="Day-ahead schedules submitted to the system operator.">
          <FileTable
            rows={data.operations.nominations as any[]}
            emptyMessage="No nominations scheduled."
            columns={[
              { key: 'delivery_date', label: 'Delivery', mono: true, render: (r: any) => fmtDate(r.delivery_date) },
              { key: 'nomination_type', label: 'Type', render: (r: any) => (r.nomination_type || '').replace(/_/g, ' ') },
              { key: 'total_mwh', label: 'MWh', align: 'right', mono: true, render: (r: any) => fmtNum(r.total_mwh, 1) },
              { key: 'curtailed_mwh', label: 'Curtailed', align: 'right', mono: true, render: (r: any) => fmtNum(r.curtailed_mwh, 1) },
              { key: 'status', label: 'Status', render: (r: any) => <StatusCell value={r.status} /> },
            ]}
          />
        </FileSection>
        <FileSection title="Commissioning tests">
          <FileTable
            rows={data.operations.commissioning_tests as any[]}
            emptyMessage="No commissioning tests recorded."
            columns={[
              { key: 'test_name', label: 'Test' },
              { key: 'test_phase', label: 'Phase' },
              { key: 'scheduled_at', label: 'Scheduled', mono: true, render: (r: any) => fmtDate(r.scheduled_at) },
              { key: 'executed_at', label: 'Executed', mono: true, render: (r: any) => fmtDate(r.executed_at) },
              { key: 'measured_value', label: 'Measured', align: 'right', mono: true },
              { key: 'target_value', label: 'Target', align: 'right', mono: true },
              { key: 'pass_fail', label: 'Result', render: (r: any) => <StatusCell value={r.pass_fail} /> },
            ]}
          />
        </FileSection>
      </>
    ),
  },
];

// ── Small utility cells used by Overview ──────────────────────────────────
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[#6b7685]">{label}</dt>
      <dd className="text-[#0f1c2e] font-medium text-right">{value}</dd>
    </div>
  );
}

function MicroKpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const toneColor =
    tone === 'good' ? '#1f8a4f'
      : tone === 'warn' ? '#b27a00'
      : tone === 'bad' ? '#b3261e'
      : '#0f1c2e';
  return (
    <div className="rounded-lg border border-[#dde4ec] bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="mt-1 font-mono text-[18px] font-bold leading-tight" style={{ fontVariantNumeric: 'tabular-nums', color: toneColor }}>
        {value}
      </div>
    </div>
  );
}
