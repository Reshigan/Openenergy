import React, { useEffect, useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';
import { BondRegistryTab } from '../ipp/BondRegistryTab';
import { PlannedOutageChainTab } from '../grid/PlannedOutageChainTab';
import { ProcurementChainTab } from '../ipp/ProcurementChainTab';
import { CodChainTab } from '../ipp/CodChainTab';
import { DfrChainTab } from '../ipp/DfrChainTab';
import { PunchListChainTab } from '../ipp/PunchListChainTab';
import { ItpChainTab } from '../ipp/ItpChainTab';
import { HandoverDossierChainTab } from '../ipp/HandoverDossierChainTab';
import { ProjectRiskChainTab } from '../ipp/ProjectRiskChainTab';
import { InsuranceClaimChainTab } from '../ipp/InsuranceClaimChainTab';
import { HseIncidentChainTab } from '../hse/HseIncidentChainTab';
import { CyberIncidentChainTab } from '../cyber/CyberIncidentChainTab';
import { EdCommitmentChainTab } from '../ed/EdCommitmentChainTab';
import { GcaChainTab } from '../gca/GcaChainTab';
import { IppScheduleChainTab } from '../ipp/IppScheduleChainTab';
import { IppEvmChainTab } from '../ipp/IppEvmChainTab';
import { IppDocumentControlChainTab } from '../ipp/IppDocumentControlChainTab';
import { IppSubmittalChainTab } from '../ipp/IppSubmittalChainTab';
import { IppRfiChainTab } from '../ipp/IppRfiChainTab';
import { IppChangeOrderChainTab } from '../ipp/IppChangeOrderChainTab';
import { ScadaConnectorTab } from '../scadaConnector/ScadaConnectorTab';
import { MqttOpcuaConnectorTab } from '../mqttOpcuaConnector/MqttOpcuaConnectorTab';
import { AnomalyDetectionMlTab } from '../anomalyDetectionMl/AnomalyDetectionMlTab';
import RulPredictionMlTab from '../rulPredictionMl/RulPredictionMlTab';
import { FaultFingerprintMlTab } from '../faultFingerprintMl/FaultFingerprintMlTab';
import StageGateTab from '../stageGate/StageGateTab';
import IppIssuesTab from '../ippIssues/IppIssuesTab';
import IppRiskTab from '../ippRisk/IppRiskTab';
import IppStakeholderTab from '../ippStakeholder/IppStakeholderTab';
import IppLessonsLearnedTab from '../ippLessonsLearned/IppLessonsLearnedTab';
import IppNcrTab from '../ippNcr/IppNcrTab';
import IppMethodStatementTab from '../ippMethodStatement/IppMethodStatementTab';
import IppEnvMonitoringTab from '../ippEnvMonitoring/IppEnvMonitoringTab';
import IppMirTab from '../ippMir/IppMirTab';
import IppSubcontractorTab from '../ippSubcontractor/IppSubcontractorTab';
import IppProgressClaimTab from '../ippProgressClaim/IppProgressClaimTab';
import IppTqTab from '../ippTq/IppTqTab';
import { IppDiaryTab } from '../ipp/IppDiaryTab';
import { IppSiteInstructionTab } from '../ipp/IppSiteInstructionTab';
import { IppDlpDefectTab } from '../ipp/IppDlpDefectTab';
import { IppVariationOrderTab } from '../ipp/IppVariationOrderTab';
import { IppPaymentCertTab } from '../ipp/IppPaymentCertTab';
import { IppFinalCompletionTab } from '../ipp/IppFinalCompletionTab';
import { IppOmHandoverTab } from '../ipp/IppOmHandoverTab';
import { IppLandRegisterTab } from '../ipp/IppLandRegisterTab';
import { IppEnvClosureTab } from '../ipp/IppEnvClosureTab';
import { IppCommissioningTestTab } from '../ipp/IppCommissioningTestTab';
import { IppIeCertTab } from '../ipp/IppIeCertTab';
import { IppTpaTab } from '../ipp/IppTpaTab';
import { IppPpaVariationTab } from '../ipp/IppPpaVariationTab';
import { IppChangeOfControlTab } from '../ipp/IppChangeOfControlTab';
import { IppRefinancingTab } from '../ipp/IppRefinancingTab';
import { IppFmTab } from '../ipp/IppFmTab';
import { IppAnnualReportTab } from '../ipp/IppAnnualReportTab';
import { IppContractorDefaultTab } from '../ipp/IppContractorDefaultTab';
import { IppEcoReportTab } from '../ipp/IppEcoReportTab';
import { IppLtaCertificateTab } from '../ipp/IppLtaCertificateTab';
import { IppLandAmendmentTab } from '../ipp/IppLandAmendmentTab';
import { IppCommunityTrustTab } from '../ipp/IppCommunityTrustTab';
import { IppGridComplianceTab } from '../ipp/IppGridComplianceTab';
import { IppCccTab } from '../ipp/IppCccTab';
import { IppOmContractTab } from '../ipp/IppOmContractTab';
import { IppBfsTab } from '../ipp/IppBfsTab';
import { IppEaAmendmentTab } from '../ipp/IppEaAmendmentTab';
import { IppWulTab } from '../ipp/IppWulTab';
import { IppHraTab } from '../ipp/IppHraTab';
import { IppAelTab } from '../ipp/IppAelTab';
import { IppForceMajeureTab } from '../ipp/IppForceMajeureTab';
import { IppLcReportTab } from '../ipp/IppLcReportTab';
import { IppMilestoneCertTab } from '../ipp/IppMilestoneCertTab';
import { IppEsmrTab } from '../ipp/IppEsmrTab';
import { IppIearTab } from '../ipp/IppIearTab';
import { IppInsrTab } from '../ipp/IppInsrTab';
import { IppPerfSecurityTab } from '../ipp/IppPerfSecurityTab';
import { IppCepComplianceTab } from '../ipp/IppCepComplianceTab';
import { IppSedComplianceTab } from '../ipp/IppSedComplianceTab';
import { IppBbbeeVerificationTab } from '../ipp/IppBbbeeVerificationTab';
import { IppLenderReportingTab } from '../ipp/IppLenderReportingTab';
import { IppLicenceReturnsTab } from '../ipp/IppLicenceReturnsTab';
import { IppReippppReportsTab } from '../ipp/IppReippppReportsTab';
import { IppEquityTransferTab } from '../ipp/IppEquityTransferTab';
import { IppQuarterlyGenReportTab } from '../ipp/IppQuarterlyGenReportTab';
import { IppAnnualComplianceAssessmentTab } from '../ipp/IppAnnualComplianceAssessmentTab';
import { IppAnnualAuditTab } from '../ipp/IppAnnualAuditTab';
import { IppEmpComplianceReportTab } from '../ipp/IppEmpComplianceReportTab';
import { IppCpTrackerTab } from '../ipp/IppCpTrackerTab';
import { IppLicenceObligationTab } from '../ipp/IppLicenceObligationTab';

export function IppWorkstationPage() {
  const kpis = useWorkstationKpis('ipp_developer');
  const projectsPanel = useWorkstationPanel('Active projects', '/projects', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#dbecfb] text-[#1a3a5c]">{r.project_type || r.energy_type || '—'}</span>,
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
      tabs={[
        { key: 'projects', label: 'My projects', group: 'Project controls', body: () => <ProjectsTab /> },
        { key: 'milestones', label: 'Milestones', group: 'Project controls', body: ({ onRefresh }) => <MilestonesTab onRefresh={onRefresh} /> },
        { key: 'schedule', label: 'Schedule pulse', group: 'Project controls', body: () => <SchedulePulseTab /> },
        { key: 'wbs_schedule', label: 'WBS & Gantt', group: 'Project controls', body: () => <IppScheduleChainTab /> },
        { key: 'cost-evm', label: 'Cost & EVM', group: 'Project controls', body: () => <IppEvmChainTab /> },
        { key: 'document-control', label: 'Document control', group: 'Documents', body: () => <IppDocumentControlChainTab /> },
        { key: 'submittals', label: 'Submittals', group: 'Documents', body: () => <IppSubmittalChainTab /> },
        { key: 'rfis', label: 'RFIs', group: 'Documents', body: () => <IppRfiChainTab /> },
        { key: 'change-orders', label: 'Change orders', group: 'Documents', body: () => <IppChangeOrderChainTab /> },
        { key: 'technical-queries', label: 'Technical queries', group: 'Documents', body: () => <IppTqTab /> },
        { key: 'site-instructions', label: 'Site instructions (W144)', group: 'Documents', body: () => <IppSiteInstructionTab /> },
        { key: 'dlp-defects', label: 'DLP defects (W145)', group: 'Documents', body: () => <IppDlpDefectTab /> },
        { key: 'variation-orders', label: 'Variation orders (W146)', group: 'Documents', body: () => <IppVariationOrderTab /> },
        { key: 'payment-certs', label: 'Payment certs (W147)', group: 'Documents', body: () => <IppPaymentCertTab /> },
        { key: 'final-completion', label: 'Final completion (W148)', group: 'Documents', body: () => <IppFinalCompletionTab /> },
        { key: 'om-handover', label: 'O&M handover (W149)', group: 'Documents', body: () => <IppOmHandoverTab /> },
        { key: 'land-register', label: 'Land register (W150)', group: 'Documents', body: () => <IppLandRegisterTab /> },
        { key: 'env-closure', label: 'Env closure (W151)', group: 'Documents', body: () => <IppEnvClosureTab /> },
        { key: 'commissioning-test', label: 'Commissioning test (W152)', group: 'Documents', body: () => <IppCommissioningTestTab /> },
        { key: 'ie-cert', label: 'IE certifications (W153)', group: 'Documents', body: () => <IppIeCertTab /> },
        { key: 'tpa-wheeling', label: 'TPA wheeling (W154)', group: 'Documents', body: () => <IppTpaTab /> },
        { key: 'ppa-variation', label: 'PPA variations (W155)', group: 'Documents', body: () => <IppPpaVariationTab /> },
        { key: 'change-of-control', label: 'Change of control (W156)', group: 'Documents', body: () => <IppChangeOfControlTab /> },
        { key: 'refinancing', label: 'Refinancing (W157)', group: 'Documents', body: () => <IppRefinancingTab /> },
        { key: 'force-majeure', label: 'Force majeure (W158)', group: 'Documents', body: () => <IppFmTab /> },
        { key: 'annual-report', label: 'Annual compliance report (W159)', group: 'Documents', body: () => <IppAnnualReportTab /> },
        { key: 'contractor-default', label: 'Contractor default (W160)', group: 'Documents', body: () => <IppContractorDefaultTab /> },
        { key: 'eco-report', label: 'ECO audit report (W161)', group: 'Documents', body: () => <IppEcoReportTab /> },
        { key: 'lta-certificate', label: 'LTA drawdown cert (W162)', group: 'Documents', body: () => <IppLtaCertificateTab /> },
        { key: 'land-amendment', label: 'Land & servitude amendment (W163)', group: 'Documents', body: () => <IppLandAmendmentTab /> },
        { key: 'community-trust', label: 'Community trust disbursement (W164)', group: 'Documents', body: () => <IppCommunityTrustTab /> },
        { key: 'grid-compliance', label: 'Grid code compliance (W165)', group: 'Technical', body: () => <IppGridComplianceTab /> },
        { key: 'ccc', label: 'Connection cost contribution (W166)', group: 'Technical', body: () => <IppCccTab /> },
        { key: 'om-contract', label: 'O&M contract renewal (W167)', group: 'Technical', body: () => <IppOmContractTab /> },
        { key: 'bfs', label: 'BFS re-certification (W168)', group: 'Technical', body: () => <IppBfsTab /> },
        { key: 'ea-amendment', label: 'EA amendment & compliance (W169)', group: 'Environmental', body: () => <IppEaAmendmentTab /> },
        { key: 'wul', label: 'Water use licence (W170)', group: 'Environmental', body: () => <IppWulTab /> },
        { key: 'hra', label: 'Heritage resources assessment (W171)', group: 'Environmental', body: () => <IppHraTab /> },
        { key: 'ael', label: 'Atmospheric emission licence (W172)', group: 'Environmental', body: () => <IppAelTab /> },
        { key: 'force-majeure', label: 'Force majeure declaration (W173)', group: 'Risk', body: () => <IppForceMajeureTab /> },
        { key: 'lc-report', label: 'Local content & SED compliance (W174)', group: 'Risk', body: () => <IppLcReportTab /> },
        { key: 'milestone-cert', label: 'Milestone certification (W175)', group: 'Risk', body: () => <IppMilestoneCertTab /> },
        { key: 'esmr', label: 'DFI E&S monitoring report (W176)', group: 'Risk', body: () => <IppEsmrTab /> },
        { key: 'iear', label: 'IE annual performance review (W177)', group: 'Risk', body: () => <IppIearTab /> },
        { key: 'insr', label: 'Insurance renewal (W178)', group: 'Risk', body: () => <IppInsrTab /> },
        { key: 'perf-security', label: 'Performance security (W179)', group: 'Risk', body: () => <IppPerfSecurityTab /> },
        { key: 'cep-compliance', label: 'Community equity participation (W180)', group: 'Risk', body: () => <IppCepComplianceTab /> },
        { key: 'sed-compliance', label: 'SED annual spend compliance (W181)', group: 'Risk', body: () => <IppSedComplianceTab /> },
        { key: 'bbbee-verification', label: 'BBBEE annual verification (W182)', group: 'Risk', body: () => <IppBbbeeVerificationTab /> },
        { key: 'lender-reporting', label: 'Lender reporting covenant (W183)', group: 'Risk', body: () => <IppLenderReportingTab /> },
        { key: 'licence-returns', label: 'Annual NERSA licence return (W184)', group: 'Risk', body: () => <IppLicenceReturnsTab /> },
        { key: 'licence-obligations', label: 'Licence Obligations (W193)', group: 'Regulatory', body: () => <IppLicenceObligationTab /> },
        { key: 'force_majeure', label: 'Force Majeure (W194)', group: 'Operations', body: () => <IppForceMajeureTab /> },
        { key: 'reipppp-reports', label: 'REIPPPP annual progress report (W185)', group: 'Risk', body: () => <IppReippppReportsTab /> },
        { key: 'equity-transfer', label: 'SPV equity transfer & consent (W186)', group: 'Risk', body: () => <IppEquityTransferTab /> },
        { key: 'quarterly-gen-report', label: 'DMRE quarterly generation report (W187)', group: 'Risk', body: () => <IppQuarterlyGenReportTab /> },
        { key: 'annual-compliance-assessment', label: 'Annual grid code compliance self-assessment (W188)', group: 'Risk', body: () => <IppAnnualComplianceAssessmentTab /> },
        { key: 'annual-audit', label: 'Annual financial statements & audit (W189)', group: 'Risk', body: () => <IppAnnualAuditTab /> },
        { key: 'emp-compliance-report', label: 'EMP annual compliance report (W190)', group: 'Risk', body: () => <IppEmpComplianceReportTab /> },
        { key: 'stage-gates', label: 'Stage gates', group: 'Risk & quality', body: () => <StageGateTab /> },
        { key: 'issues-log', label: 'Issues log', group: 'Risk & quality', body: () => <IppIssuesTab /> },
        { key: 'risk-register', label: 'Risk register', group: 'Risk & quality', body: () => <IppRiskTab /> },
        { key: 'stakeholder-register', label: 'Stakeholder register', group: 'Risk & quality', body: () => <IppStakeholderTab /> },
        { key: 'lessons-learned', label: 'Lessons learned', group: 'Risk & quality', body: () => <IppLessonsLearnedTab /> },
        { key: 'ncr', label: 'Non-conformance (NCR)', group: 'Risk & quality', body: () => <IppNcrTab /> },
        { key: 'itp', label: 'ITP / Quality plan', group: 'Risk & quality', body: () => <ItpChainTab /> },
        { key: 'project_risk', label: 'Risk analysis (EMV/SRA)', group: 'Risk & quality', body: () => <ProjectRiskChainTab /> },
        { key: 'audit', label: 'Audit & compliance', group: 'Risk & quality',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/ipp"
              reconHint="project_id,milestone_name,satisfied_at,evidence_ref"
              reconSourceOptions={['lender_ie', 'nersa', 'dmre']}
              onChange={onRefresh}
            />
          ),
        },
        { key: 'insurance', label: 'Insurance', group: 'Finance', body: ({ onRefresh }) => <InsuranceTab onRefresh={onRefresh} /> },
        { key: 'insurance_claims', label: 'Insurance claims', group: 'Finance', body: () => <InsuranceClaimChainTab /> },
        { key: 'bonds', label: 'Bonds', group: 'Finance', body: () => <BondRegistryTab /> },
        { key: 'progress-claims', label: 'Progress claims', group: 'Finance', body: () => <IppProgressClaimTab /> },
        { key: 'cp-tracker', label: 'Conditions Precedent (W192)', group: 'Finance', body: () => <IppCpTrackerTab /> },
        { key: 'green-bond-reports', label: 'Green bond reports (W202)', group: 'Finance', body: ({ onRefresh }) => <GreenBondReportTab onRefresh={onRefresh} /> },
        { key: 'milestone-variance', label: 'Milestone variance reports (W207)', group: 'Project controls', body: ({ onRefresh }) => <MilestoneVarianceTab onRefresh={onRefresh} /> },
        { key: 'subcontractors', label: 'Subcontractors', group: 'Construction', body: () => <IppSubcontractorTab /> },
        { key: 'procurement', label: 'Procurement / RFPs', group: 'Construction', body: () => <ProcurementChainTab /> },
        { key: 'cod', label: 'Construction / COD', group: 'Construction', body: () => <CodChainTab /> },
        { key: 'dfr', label: 'Daily field report', group: 'Construction', body: () => <DfrChainTab /> },
        { key: 'site_diary', label: 'Site diary (W143)', group: 'Construction', body: () => <IppDiaryTab /> },
        { key: 'punch_list', label: 'Punch list', group: 'Construction', body: () => <PunchListChainTab /> },
        { key: 'mir', label: 'Material inspections', group: 'Construction', body: () => <IppMirTab /> },
        { key: 'handover_dossier', label: 'Handover dossier', group: 'Construction', body: () => <HandoverDossierChainTab /> },
        { key: 'method-statements', label: 'Method statements', group: 'Safety & grid', body: () => <IppMethodStatementTab /> },
        { key: 'env-monitoring', label: 'Environmental monitoring', group: 'Safety & grid', body: () => <IppEnvMonitoringTab /> },
        { key: 'planned_outages', label: 'Planned outages', group: 'Safety & grid', body: () => <PlannedOutageChainTab /> },
        { key: 'hse_chain', label: 'HSE incidents', group: 'Safety & grid', body: () => <HseIncidentChainTab /> },
        { key: 'cyber_chain', label: 'Cyber incidents', group: 'Safety & grid', body: () => <CyberIncidentChainTab /> },
        { key: 'ed_chain', label: 'ED commitments', group: 'Safety & grid', body: () => <EdCommitmentChainTab /> },
        { key: 'gca_chain', label: 'Grid connection', group: 'Safety & grid', body: () => <GcaChainTab /> },
        { key: 'community', label: 'Community', group: 'Safety & grid', body: ({ onRefresh }) => <CommunityTab onRefresh={onRefresh} /> },
        { key: 'scada-connectors', label: 'SCADA connectors', group: 'Predictive ML', body: () => <ScadaConnectorTab /> },
        { key: 'mqtt-opcua-connectors', label: 'MQTT / OPC-UA', group: 'Predictive ML', body: () => <MqttOpcuaConnectorTab /> },
        { key: 'anomaly-detection-ml', label: 'Anomaly detection', group: 'Predictive ML', body: () => <AnomalyDetectionMlTab /> },
        { key: 'rul-prediction-ml', label: 'RUL prediction', group: 'Predictive ML', body: () => <RulPredictionMlTab /> },
        { key: 'fault-fingerprint-ml', label: 'Fault fingerprint', group: 'Predictive ML', body: () => <FaultFingerprintMlTab /> },
        { key: 'invite-partners', label: 'Invite partners', group: 'Partnerships', body: () => <InvitePartnersTab /> },
      ]}
    />
  );
}

function ProjectsTab() {
  return (
    <ListingTable
      endpoint="/projects"
      rowKey={(r) => r.id}
      rowHref={(r) => `/projects/${r.id}`}
      empty={{ title: 'No projects', description: 'Register your first project from the IPP lifecycle page.' }}
      columns={[
        { key: 'project_name', label: 'Project', render: (r) => r.project_name || r.name },
        { key: 'project_type', label: 'Type', render: (r) => <Pill tone="info">{r.project_type || r.energy_type || '—'}</Pill> },
        { key: 'capacity_mw', label: 'Capacity', align: 'right', render: (r) => r.capacity_mw != null ? `${Number(r.capacity_mw).toFixed(1)} MW` : '—' },
        { key: 'lifecycle_stage', label: 'Stage', render: (r) => <Pill tone={r.lifecycle_stage === 'operational' ? 'good' : 'neutral'}>{(r.lifecycle_stage || r.status || 'unknown').replace(/_/g, ' ')}</Pill> },
        { key: 'cod_target', label: 'COD target', render: (r) => r.cod_target || r.target_cod_date || '—' },
        { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—' },
      ]}
    />
  );
}

type Project = { id: string; project_name?: string; name?: string };
type Milestone = { id: string; name: string; due_date: string | null; status: string };

function MilestonesTab({ onRefresh }: { onRefresh: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>('');
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [satisfying, setSatisfying] = useState<Milestone | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/projects');
        const rows = (r.data?.data || []) as Project[];
        setProjects(rows);
        if (rows.length > 0) setPid(rows[0].id);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'failed to load projects');
      }
    })();
  }, []);

  useEffect(() => {
    if (!pid) return;
    setLoading(true); setErr(null);
    api.get(`/projects/${pid}/milestones`)
      .then((r) => setItems((r.data?.data || []) as Milestone[]))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  }, [pid, onRefresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Project</span>
          <select value={pid} onChange={(e) => setPid(e.target.value)} className="mt-1 h-9 px-3 border border-[#dde4ec] rounded-md text-[13px]">
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name || p.id}</option>)}
          </select>
        </label>
      </div>
      {err && <div className="text-[12px] text-red-700">{err}</div>}
      {loading ? (
        <div className="text-[13px] text-[#6b7685]">Loading milestones…</div>
      ) : items.length === 0 ? (
        <div className="text-[13px] text-[#6b7685]">No milestones for this project.</div>
      ) : (
        <div className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[#f8fafc] text-left text-[10px] uppercase tracking-wide text-[#6b7685]">
              <tr><th className="px-4 py-2">Milestone</th><th className="px-4 py-2">Due</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody>
              {items.map(m => (
                <tr key={m.id} className="border-t border-[#e5ebf2]">
                  <td className="px-4 py-2">{m.name}</td>
                  <td className="px-4 py-2">{m.due_date || '—'}</td>
                  <td className="px-4 py-2"><Pill tone={m.status === 'satisfied' ? 'good' : m.status === 'overdue' ? 'bad' : 'warn'}>{m.status}</Pill></td>
                  <td className="px-4 py-2">
                    {m.status !== 'satisfied' && (
                      <button onClick={() => setSatisfying(m)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Satisfy</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {satisfying && (
        <ActionModal
          title={`Satisfy milestone · ${satisfying.name}`}
          submitLabel="Mark satisfied"
          fields={[
            { key: 'evidence_url', label: 'Evidence URL or R2 key' },
            { key: 'notes', label: 'Notes', type: 'textarea', required: true },
          ] as FieldSpec[]}
          onClose={() => setSatisfying(null)}
          onSubmit={async (v) => {
            await api.post(`/projects/${pid}/milestones/${satisfying.id}/satisfy`, v);
            setSatisfying(null);
            // refetch
            const r = await api.get(`/projects/${pid}/milestones`);
            setItems((r.data?.data || []) as Milestone[]);
          }}
        />
      )}
    </div>
  );
}

function InsuranceTab({ onRefresh }: { onRefresh: () => void }) {
  const [withinDays, setWithinDays] = useState('90');
  const [claiming, setClaiming] = useState<any | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Expiring within (days)</span>
          <select value={withinDays} onChange={(e) => setWithinDays(e.target.value)} className="mt-1 h-9 px-3 border border-[#dde4ec] rounded-md text-[13px]">
            <option value="30">30</option><option value="60">60</option>
            <option value="90">90</option><option value="180">180</option>
          </select>
        </label>
      </div>
      <ListingTable
        endpoint={`/ipp/insurance/expiring?within_days=${withinDays}`}
        rowKey={(r) => r.id}
        empty={{ title: 'No policies expiring', description: 'No active policies expire within the selected window.' }}
        columns={[
          { key: 'policy_number', label: 'Policy', render: (r) => <span className="font-mono text-[11px]">{r.policy_number}</span> },
          { key: 'policy_type', label: 'Type', render: (r) => <Pill tone="info">{(r.policy_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'insurer', label: 'Insurer' },
          { key: 'sum_insured_zar', label: 'Sum insured', align: 'right', render: (r) => r.sum_insured_zar != null ? Number(r.sum_insured_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
          { key: 'period_end', label: 'Expires', render: (r) => r.period_end },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'active' ? 'good' : 'bad'}>{r.status}</Pill> },
          { key: '_actions', label: '', render: (r) => (
            <button onClick={() => setClaiming(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">File claim</button>
          ) },
        ]}
      />
      {claiming && (
        <ActionModal
          title={`File claim against ${claiming.policy_number}`}
          submitLabel="File claim"
          fields={[
            { key: 'claim_number', label: 'Claim number', required: true },
            { key: 'loss_event_date', label: 'Loss event date', type: 'date' },
            { key: 'quantum_zar', label: 'Quantum (ZAR)', type: 'number' },
            { key: 'description', label: 'Description', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setClaiming(null)}
          onSubmit={async (v) => {
            const body: any = { claim_number: v.claim_number };
            if (v.loss_event_date) body.loss_event_date = v.loss_event_date;
            if (v.quantum_zar) body.quantum_zar = Number(v.quantum_zar);
            if (v.description) body.description = v.description;
            await api.post(`/ipp/insurance/policies/${claiming.id}/claim`, body);
            setClaiming(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function CommunityTab({ onRefresh }: { onRefresh: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>('');
  const [logging, setLogging] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/projects');
        const rows = (r.data?.data || []) as Project[];
        setProjects(rows);
        if (rows.length > 0) setPid(rows[0].id);
      } catch { /* ignore */ }
    })();
  }, []);
  useEffect(() => {
    if (!pid) return;
    api.get(`/ipp/community/ed-sed/${pid}/summary`)
      .then((r) => setSummary(r.data?.data || null))
      .catch(() => setSummary(null));
  }, [pid, onRefresh]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Project</span>
          <select value={pid} onChange={(e) => setPid(e.target.value)} className="mt-1 h-9 px-3 border border-[#dde4ec] rounded-md text-[13px]">
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name || p.id}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button onClick={() => setRegistering(true)} className="h-9 px-3 rounded-md bg-white border border-[#dde4ec] text-[12px] font-semibold">+ Register stakeholder</button>
          <button onClick={() => setLogging(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">+ Log engagement</button>
        </div>
      </div>
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card label="ED commitments (ZAR)" value={summary.ed_committed_zar} />
          <Card label="SED commitments (ZAR)" value={summary.sed_committed_zar} />
          <Card label="Cumulative paid (ZAR)" value={summary.paid_to_date_zar} />
        </div>
      )}
      {registering && (
        <ActionModal
          title="Register stakeholder"
          submitLabel="Register"
          fields={[
            { key: 'stakeholder_name', label: 'Stakeholder name', required: true },
            { key: 'stakeholder_type', label: 'Type', type: 'select', options: [
              { value: 'community_leader', label: 'Community leader' },
              { value: 'municipality', label: 'Municipality' },
              { value: 'ngo', label: 'NGO' },
              { value: 'traditional_authority', label: 'Traditional authority' },
              { value: 'other', label: 'Other' },
            ] },
            { key: 'contact_person', label: 'Contact person' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setRegistering(false)}
          onSubmit={async (v) => {
            await api.post('/ipp/community/stakeholders', { project_id: pid, ...v });
            setRegistering(false); onRefresh();
          }}
        />
      )}
      {logging && (
        <ActionModal
          title="Log community engagement"
          submitLabel="Log"
          fields={[
            { key: 'stakeholder_id', label: 'Stakeholder ID', required: true, placeholder: 'cs_…' },
            { key: 'engagement_date', label: 'Date', type: 'date', required: true },
            { key: 'engagement_type', label: 'Type', type: 'select', required: true, options: [
              { value: 'meeting', label: 'Meeting' },
              { value: 'consultation', label: 'Consultation' },
              { value: 'commitment', label: 'Commitment' },
              { value: 'complaint', label: 'Complaint' },
            ] },
            { key: 'notes', label: 'Notes / outcome', type: 'textarea', required: true },
          ] as FieldSpec[]}
          onClose={() => setLogging(false)}
          onSubmit={async (v) => {
            await api.post('/ipp/community/engagements', { project_id: pid, ...v });
            setLogging(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: number | null | undefined }) {
  const formatted = value != null ? Number(value).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—';
  return (
    <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-semibold text-[#0f1c2e] mt-1">{formatted}</div>
    </div>
  );
}

// ── Schedule pulse: per-project critical-path count + 21-day look-ahead ──
type ScheduleRow = {
  id: string; name: string; wbs_code: string;
  planned_start?: string; planned_finish?: string;
  early_start?: string; early_finish?: string;
  total_float?: number; is_critical?: number; type?: string;
};

function SchedulePulseTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string>('');
  const [lookAhead, setLookAhead] = useState<ScheduleRow[]>([]);
  const [critical, setCritical] = useState<number>(0);
  const [overAlloc, setOverAlloc] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/projects');
        const rows = (r.data?.data || []) as Project[];
        setProjects(rows);
        if (rows[0]) setPid(rows[0].id);
      } catch (e: any) { setErr(e?.message || 'Failed to load projects'); }
    })();
  }, []);

  useEffect(() => {
    if (!pid) return;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const [la, acts, over] = await Promise.all([
          api.get(`/projects/${pid}/schedule/look-ahead?days=21`).then(r => r.data?.data || []).catch(() => []),
          api.get(`/projects/${pid}/schedule/activities`).then(r => r.data?.data || []).catch(() => []),
          api.get(`/projects/${pid}/schedule/over-allocations`).then(r => r.data?.data || []).catch(() => []),
        ]);
        setLookAhead(la);
        setCritical(((acts as ScheduleRow[]).filter(a => a.is_critical && a.type !== 'summary')).length);
        setOverAlloc((over as any[]).length);
      } catch (e: any) {
        setErr(e?.response?.data?.error || e?.message || 'Failed to load schedule pulse');
      } finally { setLoading(false); }
    })();
  }, [pid]);

  return (
    <div className="space-y-3" data-testid="ipp-schedule-pulse">
      {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
      <div className="flex items-center gap-2 text-sm">
        <label className="text-[#6b7685] text-xs uppercase tracking-wide">Project</label>
        <select value={pid} onChange={(e) => setPid(e.target.value)} className="border border-[#dde4ec] rounded px-2 py-1 text-sm">
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name || p.id}</option>)}
        </select>
        {loading && <span className="text-xs text-[#6b7685]">loading…</span>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card label="Critical activities" value={critical} />
        <Card label="Over-allocations" value={overAlloc} />
        <Card label="Look-ahead (21d)" value={lookAhead.length} />
      </div>
      <div className="rounded border border-[#dde4ec] bg-white">
        <div className="px-3 py-2 text-xs uppercase tracking-wide text-[#6b7685]">Next 21 days</div>
        {lookAhead.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[#6b7685]">No activities scheduled in window.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[#f6f8fa] text-[#6b7685]">
              <tr><th className="text-left px-3 py-1.5">WBS</th><th className="text-left px-3 py-1.5">Activity</th><th className="text-left px-3 py-1.5">Start</th><th className="text-left px-3 py-1.5">Finish</th><th className="text-right px-3 py-1.5">TF</th></tr>
            </thead>
            <tbody>
              {lookAhead.slice(0, 20).map(r => (
                <tr key={r.id} className="border-t border-[#eef1f5]">
                  <td className="px-3 py-1 font-mono">{r.wbs_code}</td>
                  <td className="px-3 py-1">{r.name}{r.is_critical ? <span className="ml-1 text-red-600">●</span> : null}</td>
                  <td className="px-3 py-1 font-mono">{(r.planned_start || r.early_start || '').slice(0, 10)}</td>
                  <td className="px-3 py-1 font-mono">{(r.planned_finish || r.early_finish || '').slice(0, 10)}</td>
                  <td className="px-3 py-1 text-right">{r.total_float ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Invite Partners Tab ───────────────────────────────────────────────────────

const PARTNER_ROLES = [
  { role: 'lender',      label: 'Lender / Investor',        desc: 'Auto-creates 5 standard covenants (DSCR, LLCR, availability, insurance, debt ratio)' },
  { role: 'offtaker',    label: 'Offtaker / Corporate Buyer', desc: 'Auto-creates a PPA contract shell in Draft state' },
  { role: 'carbon_fund', label: 'Carbon Fund / Registry',   desc: 'Links the fund to your project for carbon credit flows' },
];

type Proj = { id: string; project_name?: string; name?: string; capacity_mw?: number };
type Invitation = { id: string; token: string; role: string; project_id?: string; expires_at: string; invite_url: string };

function InvitePartnersTab() {
  const [projects, setProjects] = useState<Proj[]>([]);
  const [selectedRole, setSelectedRole] = useState('lender');
  const [form, setForm] = useState({ project_id: '', email: '', organization: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<Invitation | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    api.get('/projects').then(r => {
      const rows: Proj[] = r.data?.data ?? r.data?.projects ?? r.data ?? [];
      setProjects(rows);
      if (rows.length) setForm(f => ({ ...f, project_id: rows[0].id }));
    }).catch(() => {});
    api.get('/rbac/me/invitations').then(r => {
      setHistory((r.data?.data ?? []).filter((i: any) => ['lender', 'offtaker', 'carbon_fund'].includes(i.role)));
    }).catch(() => {}).finally(() => setHistLoading(false));
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    setSent(null);
    try {
      const res = await api.post('/rbac/me/invitations', {
        role: selectedRole,
        project_id: form.project_id || undefined,
        email: form.email || undefined,
        organization: form.organization || undefined,
        note: form.note || undefined,
      });
      if (!res.data.success) throw new Error(res.data.error);
      setSent(res.data.data);
      setHistory(h => [{ ...res.data.data, status: 'pending', created_at: new Date().toISOString() }, ...h]);
      setForm(f => ({ ...f, email: '', organization: '', note: '' }));
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message || 'Failed to create invitation');
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = (url: string) => navigator.clipboard?.writeText(`${window.location.origin}${url}`).catch(() => {});

  const selectedPartner = PARTNER_ROLES.find(r => r.role === selectedRole)!;

  return (
    <div className="space-y-6">
      {/* Send invite form */}
      <div className="rounded-lg border border-[#dde4ec] bg-white p-5">
        <h3 className="text-sm font-semibold text-[#0f2540] mb-1">Invite a partner</h3>
        <p className="text-xs text-[#6b7685] mb-4">
          Send a direct invitation. The partner registers via a unique link and their account is immediately active — no admin approval required.
        </p>

        {err && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        {sent && (
          <div className="mb-4 rounded-lg border border-[#1a3a5c]/20 bg-[#dbecfb]/50 p-3">
            <p className="text-xs font-semibold text-[#0f2540] mb-1">Invitation created</p>
            <div className="flex items-center gap-2 font-mono text-xs text-[#1a3a5c] bg-white rounded border border-[#dde4ec] px-2 py-1.5 break-all">
              {window.location.origin}{sent.invite_url}
              <button
                onClick={() => copyUrl(sent.invite_url)}
                className="ml-auto shrink-0 text-[10px] uppercase tracking-wide font-bold text-[#1a3a5c] hover:underline"
              >
                Copy
              </button>
            </div>
            <p className="text-[10px] text-[#6b7685] mt-1">Expires: {new Date(sent.expires_at).toLocaleDateString()}</p>
          </div>
        )}

        <form onSubmit={handleSend} className="space-y-4">
          {/* Role selector */}
          <div>
            <label className="block text-xs font-medium text-[#3d4756] mb-2">Partner type</label>
            <div className="grid grid-cols-3 gap-2">
              {PARTNER_ROLES.map(r => (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => setSelectedRole(r.role)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selectedRole === r.role
                      ? 'border-[#1a3a5c] bg-[#dbecfb]/60 text-[#0f2540]'
                      : 'border-[#dde4ec] bg-white text-[#6b7685] hover:border-[#1a3a5c]/40'
                  }`}
                >
                  <div className="text-xs font-semibold">{r.label.split(' /')[0]}</div>
                  <div className="text-[10px] mt-0.5 opacity-70 truncate">{r.label.split(' /')[1] || ''}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#6b7685] mt-1.5">{selectedPartner.desc}</p>
          </div>

          {/* Project selector */}
          {projects.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[#3d4756] mb-1">Link to project</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full border border-[#dde4ec] rounded px-2.5 py-1.5 text-sm text-[#0f2540]"
              >
                <option value="">— no project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.project_name || p.name || p.id}{p.capacity_mw ? ` (${p.capacity_mw} MW)` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-[#3d4756] mb-1">
              Partner email <span className="font-normal text-[#6b7685]">(optional — locks invite to this address)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border border-[#dde4ec] rounded px-2.5 py-1.5 text-sm"
              placeholder="partner@bank.co.za"
            />
          </div>

          {/* Organisation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#3d4756] mb-1">Organisation</label>
              <input
                type="text"
                value={form.organization}
                onChange={(e) => setForm(f => ({ ...f, organization: e.target.value }))}
                className="w-full border border-[#dde4ec] rounded px-2.5 py-1.5 text-sm"
                placeholder="First National Bank"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3d4756] mb-1">Note to recipient</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-[#dde4ec] rounded px-2.5 py-1.5 text-sm"
                placeholder="Invitation to review term sheet"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[#1a3a5c] text-white text-sm font-semibold px-5 py-2 hover:bg-[#0f2540] transition-colors disabled:opacity-50"
          >
            {loading ? 'Generating link…' : 'Generate invite link'}
          </button>
        </form>
      </div>

      {/* Invitation history */}
      <div className="rounded-lg border border-[#dde4ec] bg-white">
        <div className="px-4 py-3 border-b border-[#eef1f5]">
          <h3 className="text-sm font-semibold text-[#0f2540]">Sent invitations</h3>
        </div>
        {histLoading ? (
          <div className="px-4 py-4 text-xs text-[#6b7685]">Loading…</div>
        ) : history.length === 0 ? (
          <div className="px-4 py-6 text-xs text-[#6b7685] text-center">No partner invitations sent yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[#f6f8fa] text-[#6b7685]">
              <tr>
                <th className="text-left px-4 py-2">Role</th>
                <th className="text-left px-4 py-2">Email / org</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Expires</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {history.map((inv: any) => (
                <tr key={inv.id} className="border-t border-[#eef1f5]">
                  <td className="px-4 py-2 font-medium capitalize">{(inv.role || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-[#6b7685]">{inv.email || inv.organization || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      inv.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                      inv.status === 'pending'  ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-2 text-[#6b7685]">{inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {inv.status === 'pending' && inv.token && (
                      <button
                        onClick={() => copyUrl(`/register?token=${inv.token}`)}
                        className="text-[10px] uppercase tracking-wide font-bold text-[#1a3a5c] hover:underline"
                      >
                        Copy link
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── W202: Green Bond Allocation & Climate Finance Report ──────────────────────
const GBR_STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
  period_open: 'neutral', data_gathering: 'neutral', impact_calculation: 'neutral',
  external_review: 'warn', board_approval: 'warn', submitted_jse: 'warn',
  under_review: 'warn', queries_raised: 'warn', queries_responded: 'warn',
  approved: 'good', published: 'good', deficiency_noted: 'bad',
  remediation: 'bad', rejected: 'bad',
};

const GBR_ACTIONS = [
  { value: 'open_period', label: 'Open period' },
  { value: 'start_data_gathering', label: 'Start data gathering' },
  { value: 'complete_impact_calc', label: 'Complete impact calculation' },
  { value: 'submit_for_external_review', label: 'Submit for external review' },
  { value: 'complete_external_review', label: 'Complete external review' },
  { value: 'board_approve', label: 'Board approve' },
  { value: 'submit_to_jse', label: 'Submit to JSE' },
  { value: 'jse_raises_queries', label: 'JSE raises queries' },
  { value: 'respond_to_queries', label: 'Respond to queries' },
  { value: 'jse_approve', label: 'JSE approve' },
  { value: 'publish', label: 'Publish' },
  { value: 'note_deficiency', label: 'Note deficiency' },
  { value: 'start_remediation', label: 'Start remediation' },
  { value: 'refile', label: 'Refile' },
  { value: 'reject', label: 'Reject' },
];

function GreenBondReportTab({ onRefresh }: { onRefresh: () => void }) {
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<{ id: string; status: string } | null>(null);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setCreating(true)}
          className="px-3 py-1.5 bg-[#1a3a5c] text-white text-xs rounded hover:bg-[#1e4a72]">
          + New green bond report
        </button>
      </div>

      <ListingTable
        endpoint="/green-bond-reports"
        rowKey={(r) => r.id}
        empty={{ title: 'No green bond reports', description: 'Create a report to track green bond allocation & impact.' }}
        columns={[
          { key: 'report_year',     label: 'Year' },
          { key: 'bond_isin',       label: 'ISIN' },
          { key: 'bond_class',      label: 'Class' },
          { key: 'issuance_size_zar', label: 'Issuance', align: 'right', render: (r) => r.issuance_size_zar ? `R${(Number(r.issuance_size_zar)/1_000_000).toFixed(0)}m` : '—' },
          { key: 'chain_status',    label: 'Status', render: (r) => <Pill tone={GBR_STATUS_TONE[r.chain_status] ?? 'neutral'}>{r.chain_status?.replace(/_/g,' ')}</Pill> },
          { key: 'kwh_generated',   label: 'kWh gen', align: 'right', render: (r) => r.kwh_generated ? Number(r.kwh_generated).toLocaleString() : '—' },
          { key: 'carbon_avoided_tco2e', label: 'CO₂ avoided', align: 'right', render: (r) => r.carbon_avoided_tco2e ? `${Number(r.carbon_avoided_tco2e).toFixed(1)} tCO₂e` : '—' },
          { key: 'sla_deadline',    label: 'SLA', render: (r) => r.sla_deadline ? new Date(r.sla_deadline).toLocaleDateString() : '—' },
          { key: 'sla_breached',    label: '', render: (r) => r.sla_breached ? <Pill tone="bad">SLA</Pill> : null },
          { key: 'actions',         label: '', render: (r) => (
            <button onClick={() => setActing({ id: r.id, status: r.chain_status })}
              className="text-[#1a3a5c] text-xs underline">Action</button>
          )},
        ]}
      />

      {creating && (
        <ActionModal
          title="New Green Bond Report"
          fields={[
            { key: 'report_year',   type: 'number', label: 'Report year', required: true },
            { key: 'bond_isin',     type: 'text',   label: 'Bond ISIN' },
            { key: 'bond_class',    type: 'select', label: 'Bond class', required: true,
              options: [
                { value: 'project',     label: 'Project bond' },
                { value: 'corporate',   label: 'Corporate green bond' },
                { value: 'sovereign',   label: 'Sovereign / municipal' },
                { value: 'securitised', label: 'Securitised' },
              ]},
            { key: 'issuance_size_zar', type: 'number', label: 'Issuance size (ZAR)', required: true },
            { key: 'reporting_period_start', type: 'date', label: 'Period start', required: true },
            { key: 'reporting_period_end',   type: 'date', label: 'Period end',   required: true },
            { key: 'reason', type: 'textarea', label: 'Notes' },
          ] as FieldSpec[]}
          onSubmit={async (v) => { await api.post('/green-bond-reports', v); setCreating(false); onRefresh(); }}
          onClose={() => setCreating(false)}
        />
      )}

      {acting && (
        <ActionModal
          title={`Action — ${acting.status?.replace(/_/g,' ')}`}
          fields={[
            { key: 'action', type: 'select', label: 'Action', required: true, options: GBR_ACTIONS },
            { key: 'external_reviewer',        type: 'text',     label: 'External reviewer name' },
            { key: 'review_type',              type: 'select',   label: 'Review type',
              options: [
                { value: 'second_party',  label: 'Second-party opinion' },
                { value: 'certification', label: 'Certification (CBI)' },
                { value: 'verification',  label: 'Third-party verification' },
                { value: 'rating',        label: 'Green bond rating' },
              ]},
            { key: 'review_ref',               type: 'text',     label: 'Review reference' },
            { key: 'board_resolution_ref',     type: 'text',     label: 'Board resolution ref' },
            { key: 'jse_submission_ref',       type: 'text',     label: 'JSE submission ref' },
            { key: 'kwh_generated',            type: 'number',   label: 'kWh generated' },
            { key: 'carbon_avoided_tco2e',     type: 'number',   label: 'CO₂ avoided (tCO₂e)' },
            { key: 'green_capex_deployed_zar', type: 'number',   label: 'Green capex deployed (R)' },
            { key: 'deficiency_description',   type: 'textarea', label: 'Deficiency description' },
            { key: 'rejection_reason',         type: 'textarea', label: 'Rejection reason' },
            { key: 'reason',                   type: 'textarea', label: 'Notes / reason', required: true },
          ] as FieldSpec[]}
          onSubmit={async (v) => { await api.post(`/green-bond-reports/${acting.id}/action`, v); setActing(null); onRefresh(); }}
          onClose={() => setActing(null)}
        />
      )}
    </div>
  );
}

// ── W207: Milestone & Schedule Variance Report ────────────────────────────────
type MvsModalMode = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function MilestoneVarianceTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<MvsModalMode>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  const statusTone = (s: string) => {
    if (['dfi_accepted', 'remediation_accepted'].includes(s)) return 'good' as const;
    if (['critical_delay', 'withdrawn'].includes(s)) return 'bad' as const;
    if (['remediation_plan', 'remediation_submitted', 'dfi_queries'].includes(s)) return 'warn' as const;
    return 'neutral' as const;
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          className="px-3 py-1.5 rounded bg-[#1a3a5c] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + New variance report
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/milestone-variance-reports"
        rowKey={(r) => r.id}
        empty={{ title: 'No variance reports', description: 'Create a quarterly milestone variance report for DFI submission.' }}
        columns={[
          { key: 'report_period', label: 'Period', render: (r) => r.report_period },
          { key: 'risk_tier', label: 'Risk', render: (r) => <Pill tone={r.risk_tier === 'critical' ? 'bad' : r.risk_tier === 'significant' ? 'warn' : 'neutral'}>{String(r.risk_tier)}</Pill> },
          { key: 'overall_schedule_variance_days', label: 'Schedule Δ (days)', align: 'right', render: (r) => r.overall_schedule_variance_days != null ? `${r.overall_schedule_variance_days > 0 ? '+' : ''}${r.overall_schedule_variance_days}d` : '—' },
          { key: 'cod_forecast_date', label: 'COD forecast', render: (r) => r.cod_forecast_date || '—' },
          { key: 'milestones_delayed', label: 'Delayed', align: 'right', render: (r) => r.milestones_delayed != null ? String(r.milestones_delayed) : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New milestone variance report"
          submitLabel="Create"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/milestone-variance-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                risk_tier: v.risk_tier,
                report_period: v.report_period,
                reporting_date: v.reporting_date,
                original_cod_date: v.original_cod_date || undefined,
                total_milestones: v.total_milestones ? parseInt(v.total_milestones, 10) : undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'report_period', label: 'Report period (e.g. 2026-Q2)', required: true, placeholder: '2026-Q2' },
            { key: 'reporting_date', label: 'Reporting date', type: 'date', required: true },
            {
              key: 'risk_tier', label: 'Risk tier', type: 'select', required: true, defaultValue: 'minor',
              options: [
                { value: 'minor', label: 'Minor variance (14d SLA)' },
                { value: 'moderate', label: 'Moderate variance (21d SLA)' },
                { value: 'significant', label: 'Significant variance (30d SLA)' },
                { value: 'critical', label: 'Critical variance (45d SLA)' },
              ],
            },
            { key: 'original_cod_date', label: 'Original COD date (from financial close)', type: 'date', required: false },
            { key: 'total_milestones', label: 'Total milestones in this period', type: 'number', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Advance variance report — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/milestone-variance-reports/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                reason: v.reason || undefined,
                milestones_on_track: v.milestones_on_track ? parseInt(v.milestones_on_track, 10) : undefined,
                milestones_delayed: v.milestones_delayed ? parseInt(v.milestones_delayed, 10) : undefined,
                overall_schedule_variance_days: v.overall_schedule_variance_days ? parseInt(v.overall_schedule_variance_days, 10) : undefined,
                cod_forecast_date: v.cod_forecast_date || undefined,
                ie_report_ref: v.ie_report_ref || undefined,
                critical_delay_description: v.critical_delay_description || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'submit_for_ie_review', label: 'Submit for IE review' },
                { value: 'certify_ie', label: 'IE certifies report' },
                { value: 'submit_to_dfi', label: 'Submit to DFI/lender panel' },
                { value: 'dfi_raises_queries', label: 'DFI raises queries' },
                { value: 'respond_to_dfi_queries', label: 'Respond to DFI queries' },
                { value: 'dfi_accept', label: 'DFI accepts report' },
                { value: 'flag_remediation_required', label: 'Flag remediation plan required' },
                { value: 'submit_remediation_plan', label: 'Submit remediation plan' },
                { value: 'dfi_accept_remediation', label: 'DFI accepts remediation plan' },
                { value: 'declare_critical_delay', label: 'Declare critical-path delay' },
                { value: 'withdraw', label: 'Withdraw report' },
              ],
            },
            { key: 'milestones_on_track', label: 'Milestones on track', type: 'number', required: false },
            { key: 'milestones_delayed', label: 'Milestones delayed', type: 'number', required: false },
            { key: 'overall_schedule_variance_days', label: 'Schedule variance (days, negative = behind)', type: 'number', required: false },
            { key: 'cod_forecast_date', label: 'Updated COD forecast', type: 'date', required: false },
            { key: 'ie_report_ref', label: 'IE report reference', required: false },
            { key: 'critical_delay_description', label: 'Critical delay description', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes / reason', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}
